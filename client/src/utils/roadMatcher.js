// Filtro de Alta Precisión y Suavizado Fiel de Rutas GPS (Anti-Spikes, Anti-Jitter, Anti-Vueltas Falsas)

export function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Limpia y filtra exhaustivamente puntos GPS reales:
 * 1. Descarta lecturas con precisión degradada (> 25m) causadas por antenas celulares o wifi.
 * 2. Descarta coordenadas inválidas o nulas (0,0).
 * 3. Descarta temblor estacionario (cuando el vehículo o persona está detenido, no acumula puntos en círculo).
 * 4. Descarta saltos imposibles por velocidad (> 120 km/h) producto de rebotes de señal.
 * 5. Descarta picos anómalos (Spikes en zigzag donde el GPS salta a una manzana lateral y vuelve de inmediato).
 */
export function cleanGpsPoints(rawPoints, maxAccuracy = 25, maxSpeedKmH = 120) {
  if (!Array.isArray(rawPoints) || rawPoints.length === 0) return [];

  // Paso 1: Filtrado de coordenadas válidas y precisión mínima aceptable
  const validPoints = [];
  for (let i = 0; i < rawPoints.length; i++) {
    const p = rawPoints[i];
    if (!p) continue;
    const lat = Number(p.latitude ?? p.lat);
    const lng = Number(p.longitude ?? p.lng);
    const acc = Number(p.accuracy ?? 10);
    const speed = Number(p.speed ?? 0);

    if (isNaN(lat) || isNaN(lng)) continue;
    if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) continue;

    // Descartar lecturas con error mayor a 25 metros (evita saltos a calles paralelas o interiores de manzana)
    if (acc > maxAccuracy && rawPoints.length > 2) continue;

    validPoints.push({
      ...p,
      latitude: lat,
      longitude: lng,
      accuracy: acc,
      speed: speed
    });
  }

  if (validPoints.length <= 2) return validPoints;

  // Paso 2: Filtrado de inmovilidad (evitar acumulación de puntos cuando está detenido en un semáforo o esquina)
  const stationaryFiltered = [validPoints[0]];

  for (let i = 1; i < validPoints.length; i++) {
    const curr = validPoints[i];
    const prev = stationaryFiltered[stationaryFiltered.length - 1];
    const distKm = getDistanceKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    const speedKmH = curr.speed * 3.6;

    // Si está prácticamente detenido (< 2.0 km/h) y se movió menos de 15 metros, es temblor GPS: ignorar
    if (speedKmH < 2.0 && distKm < 0.015 && i < validPoints.length - 1) {
      continue;
    }

    // Si está en movimiento pero la distancia es imperceptible (< 8 metros), ignorar ruido
    if (distKm < 0.008 && i < validPoints.length - 1) {
      continue;
    }

    stationaryFiltered.push(curr);
  }

  if (stationaryFiltered.length <= 2) return stationaryFiltered;

  // Paso 3: Filtro Anti-Spike (rebotes donde el GPS salta a una manzana lateral y vuelve de inmediato)
  const spikeFiltered = [stationaryFiltered[0]];

  for (let i = 1; i < stationaryFiltered.length; i++) {
    const curr = stationaryFiltered[i];
    const prev = spikeFiltered[spikeFiltered.length - 1];
    const distPrevCurr = getDistanceKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude);

    // Calcular velocidad aparente
    const t1 = new Date(prev.timestamp || prev.time || 0).getTime();
    const t2 = new Date(curr.timestamp || curr.time || 0).getTime();
    let apparentSpeed = 0;
    if (t1 > 0 && t2 > t1) {
      const hours = (t2 - t1) / (1000 * 3600);
      apparentSpeed = distPrevCurr / hours;
    }

    // Si el punto i+1 existe, comprobar si curr es un desvío que regresa a la trayectoria
    if (i + 1 < stationaryFiltered.length) {
      const next = stationaryFiltered[i + 1];
      const distPrevNext = getDistanceKm(prev.latitude, prev.longitude, next.latitude, next.longitude);
      const distCurrNext = getDistanceKm(curr.latitude, curr.longitude, next.latitude, next.longitude);

      // Si curr salta lejos pero el siguiente punto vuelve cerca de prev (rebote triangular en V cerrada)
      if (distPrevCurr > 0.035 && distCurrNext > 0.035 && distPrevNext < distPrevCurr * 0.7) {
        continue; // Descartar punto espurio que salta a la manzana contigua
      }

      // Si la velocidad calculada supera 120 km/h y el siguiente punto está más cerca del anterior
      if (apparentSpeed > maxSpeedKmH && distPrevNext < distPrevCurr) {
        continue; // Descartar salto falso
      }
    } else if (apparentSpeed > maxSpeedKmH) {
      continue;
    }

    spikeFiltered.push(curr);
  }

  return spikeFiltered;
}

/**
 * Suavizado de trayectoria fiel usando el algoritmo de Chaikin.
 * Genera una línea continua y suave a lo largo de las calles sin inventar desvíos ni vueltas a la manzana.
 */
export function smoothTrajectory(points, iterations = 1) {
  if (!Array.isArray(points) || points.length < 3) return points;

  let current = points.map(p => [Number(p.latitude ?? p[0]), Number(p.longitude ?? p[1])]);

  for (let it = 0; it < iterations; it++) {
    if (current.length < 3) break;
    const smoothed = [current[0]]; // Mantener punto inicial exacto

    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i];
      const p1 = current[i + 1];

      // Q = 0.75 * P0 + 0.25 * P1
      const q = [
        0.75 * p0[0] + 0.25 * p1[0],
        0.75 * p0[1] + 0.25 * p1[1]
      ];

      // R = 0.25 * P0 + 0.75 * P1
      const r = [
        0.25 * p0[0] + 0.75 * p1[0],
        0.25 * p0[1] + 0.75 * p1[1]
      ];

      smoothed.push(q);
      smoothed.push(r);
    }

    smoothed.push(current[current.length - 1]); // Mantener punto final exacto
    current = smoothed;
  }

  return current;
}

/**
 * Procesa la ruta GPS real eliminando ruido, saltos a manzanas laterales y desvíos inexistentes.
 * Devuelve coordenadas [lat, lng] limpias y precisas siguiendo el recorrido verídico.
 */
export async function matchPointsToRealRoads(rawPoints) {
  const cleaned = cleanGpsPoints(rawPoints);
  if (!cleaned || cleaned.length === 0) return [];
  if (cleaned.length === 1) return [[cleaned[0].latitude, cleaned[0].longitude]];
  if (cleaned.length === 2) return cleaned.map(p => [p.latitude, p.longitude]);

  // Suavizar ligeramente la trayectoria para eliminar micro-temblores en curvas
  const smoothed = smoothTrajectory(cleaned, 1);
  return smoothed;
}
