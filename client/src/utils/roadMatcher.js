// Filtro y Trazado de Rutas Reales en Carreteras y Calles (OSRM Match & Route Engine)

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
 * Limpia y filtra puntos GPS:
 * - Descarta lecturas con precisin degradada (> 35m)
 * - Descarta lecturas nulas o (0,0)
 * - Descarta temblores estacionarios (< 6m)
 * - Descarta saltos imposibles por velocidad (> 130 km/h)
 * - Descarta picos anmalos (Spike Rejection)
 */
export function cleanGpsPoints(rawPoints, maxAccuracy = 35, maxSpeedKmH = 130) {
  if (!Array.isArray(rawPoints) || rawPoints.length === 0) return [];
  
  // 1. Filtrado bǭsico de coordenadas vǭlidas y precisin
  const initial = [];
  for (let i = 0; i < rawPoints.length; i++) {
    const p = rawPoints[i];
    if (!p || typeof p.latitude !== 'number' || typeof p.longitude !== 'number') continue;
    if (isNaN(p.latitude) || isNaN(p.longitude)) continue;
    if (Math.abs(p.latitude) < 0.0001 && Math.abs(p.longitude) < 0.0001) continue;

    // Si tiene accuracy muy mala, descartar a menos que sea el ǧnico punto
    if (p.accuracy && p.accuracy > maxAccuracy && rawPoints.length > 3) continue;

    initial.push(p);
  }

  if (initial.length <= 2) return initial;

  // 2. Filtrado de saltos de velocidad y picos de teletransportacin
  const filtered = [initial[0]];

  for (let i = 1; i < initial.length; i++) {
    const curr = initial[i];
    const prev = filtered[filtered.length - 1];
    const distKm = getDistanceKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude);

    // Si el vehculo o persona estǭ detenido (< 6 metros) y no hay velocidad, omitir duplicado
    if (distKm < 0.006 && (!curr.speed || curr.speed < 0.4) && i < initial.length - 1) {
      continue;
    }

    // Comprobacin de velocidad entre puntos
    const t1 = new Date(prev.timestamp || prev.time || 0).getTime();
    const t2 = new Date(curr.timestamp || curr.time || 0).getTime();
    if (t1 > 0 && t2 > t1) {
      const hours = (t2 - t1) / (1000 * 3600);
      const speedKmH = distKm / hours;
      // Si la velocidad supera el mǭximo (salto falso por antena celular), verificar si el siguiente punto vuelve
      if (speedKmH > maxSpeedKmH) {
        if (i + 1 < initial.length) {
          const next = initial[i + 1];
          const distPrevNext = getDistanceKm(prev.latitude, prev.longitude, next.latitude, next.longitude);
          // Si el siguiente punto estǭ mǭs cerca del anterior que del actual, curr es un pico aberrante
          if (distPrevNext < distKm * 0.6) {
            continue; // Descartar pico
          }
        } else {
          continue;
        }
      }
    }

    filtered.push(curr);
  }

  return filtered;
}

// CachǸ en memoria de tramos de ruta ajustados
const roadCache = new Map();

/**
 * Ajusta los puntos GPS a calles y carreteras reales usando OpenStreetMap OSRM Routing Engine.
 * Sigue fielmente el trazado de autopistas, calles y caminos sin cruzar casas ni montaas.
 */
export async function matchPointsToRealRoads(points) {
  const cleaned = cleanGpsPoints(points);
  if (cleaned.length < 2) return cleaned.map(p => [p.latitude, p.longitude]);

  // Generar clave de cachǸ basada en puntos
  const cacheKey = cleaned.length + '_' + cleaned[0].latitude.toFixed(4) + '_' + cleaned[cleaned.length - 1].latitude.toFixed(4);
  if (roadCache.has(cacheKey)) {
    return roadCache.get(cacheKey);
  }

  const CHUNK_SIZE = 25;
  const allRoadCoords = [];

  for (let i = 0; i < cleaned.length; i += CHUNK_SIZE - 1) {
    const chunk = cleaned.slice(i, i + CHUNK_SIZE);
    if (chunk.length < 2) break;

    const coordsStr = chunk.map(p => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`).join(';');
    
    // Primero intentar con OSRM Route (garantiza conexin por carreteras reales entre puntos distantes)
    let snappedChunk = null;
    // Probar servidores de OSRM en cascada para garantizar trazado exacto sobre calles reales
    const osrmServers = [
      `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=false&continue_straight=true`,
      `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=false&continue_straight=true`
    ];

    for (let sUrl of osrmServers) {
      if (snappedChunk) break;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(sUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data && data.code === 'Ok' && data.routes && data.routes[0] && data.routes[0].geometry) {
            const geom = data.routes[0].geometry;
            if (Array.isArray(geom.coordinates)) {
              snappedChunk = geom.coordinates.map(c => [c[1], c[0]]);
            }
          }
        }
      } catch (err) {}
    }

    if (!snappedChunk) {
      const matchUrl = `https://router.project-osrm.org/match/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=false&tidy=true`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(matchUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data && data.matchings && data.matchings.length > 0) {
            snappedChunk = [];
            data.matchings.forEach(m => {
              if (m.geometry && Array.isArray(m.geometry.coordinates)) {
                m.geometry.coordinates.forEach(c => snappedChunk.push([c[1], c[0]]));
              }
            });
          }
        }
      } catch (e) {}
    }

    if (snappedChunk && snappedChunk.length > 0) {
      snappedChunk.forEach(pt => allRoadCoords.push(pt));
    } else {
      chunk.forEach(p => allRoadCoords.push([p.latitude, p.longitude]));
    }
  }

  // Desduplicar puntos consecutivos idǸnticos
  const result = [];
  for (let pt of allRoadCoords) {
    if (result.length === 0) {
      result.push(pt);
    } else {
      const prev = result[result.length - 1];
      if (Math.abs(prev[0] - pt[0]) > 0.00002 || Math.abs(prev[1] - pt[1]) > 0.00002) {
        result.push(pt);
      }
    }
  }

  if (result.length > 0) {
    roadCache.set(cacheKey, result);
    return result;
  }

  return cleaned.map(p => [p.latitude, p.longitude]);
}
