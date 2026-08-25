// Filtro y Trazado de Rutas Reales en Carreteras y Calles (OSRM Match / Routing)

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
 * Limpia puntos con baja precisión GPS (saltos por triangulación celular o reflejos de edificios/montañas)
 */
export function cleanGpsPoints(rawPoints, maxAccuracy = 45, maxSpeedKmH = 140) {
  if (!Array.isArray(rawPoints) || rawPoints.length === 0) return [];
  const valid = [];

  for (let i = 0; i < rawPoints.length; i++) {
    const p = rawPoints[i];
    if (!p || typeof p.latitude !== 'number' || typeof p.longitude !== 'number') continue;
    if (isNaN(p.latitude) || isNaN(p.longitude)) continue;
    if (p.latitude === 0 && p.longitude === 0) continue;

    // Descartar saltos con precisión deficiente
    if (p.accuracy && p.accuracy > maxAccuracy) continue;

    if (valid.length > 0) {
      const prev = valid[valid.length - 1];
      const distKm = getDistanceKm(prev.latitude, prev.longitude, p.latitude, p.longitude);

      // Descartar temblores si el vehículo o persona está quieto (< 5 metros)
      if (distKm < 0.005 && (!p.speed || p.speed < 0.5)) continue;

      // Descartar saltos imposibles por encima de 140 km/h (teletransportación a través de casas/cerros)
      const t1 = new Date(prev.timestamp || prev.time || 0).getTime();
      const t2 = new Date(p.timestamp || p.time || 0).getTime();
      if (t1 > 0 && t2 > t1) {
        const hours = (t2 - t1) / (1000 * 3600);
        const speedKmH = distKm / hours;
        if (speedKmH > maxSpeedKmH) {
          continue; // Salto descartado
        }
      }
    }
    valid.push(p);
  }
  return valid;
}

/**
 * Ajusta los puntos GPS a las calles y carreteras reales usando OpenStreetMap OSRM Match API.
 * Sigue las curvas reales del asfalto y evita líneas rectas que cruzan edificios o cerros.
 */
export async function matchPointsToRealRoads(points) {
  const cleaned = cleanGpsPoints(points);
  if (cleaned.length < 2) return cleaned.map(p => [p.latitude, p.longitude]);

  // Si son menos de 100 puntos, hacer Map Matching directo con OSRM
  try {
    const CHUNK_SIZE = 75;
    const allSnappedCoords = [];

    for (let i = 0; i < cleaned.length; i += CHUNK_SIZE - 1) {
      const chunk = cleaned.slice(i, i + CHUNK_SIZE);
      if (chunk.length < 2) break;

      const coordsStr = chunk.map(p => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`).join(';');
      const url = `https://router.project-osrm.org/match/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=false&tidy=true`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data && data.matchings && data.matchings.length > 0) {
            data.matchings.forEach(m => {
              if (m.geometry && Array.isArray(m.geometry.coordinates)) {
                // GeoJSON devuelve [lng, lat] -> Convertir a Leaflet [lat, lng]
                m.geometry.coordinates.forEach(c => {
                  allSnappedCoords.push([c[1], c[0]]);
                });
              }
            });
            continue;
          }
        }
      } catch (err) {
        console.warn('Fallo OSRM Match chunk:', err.message);
      }

      // Si falló el servicio web para este tramo, agregar puntos limpios
      chunk.forEach(p => allSnappedCoords.push([p.latitude, p.longitude]));
    }

    if (allSnappedCoords.length > 0) {
      // Eliminar duplicados continuos
      const deduped = [];
      for (let pt of allSnappedCoords) {
        if (deduped.length === 0) {
          deduped.push(pt);
        } else {
          const prev = deduped[deduped.length - 1];
          if (Math.abs(prev[0] - pt[0]) > 0.00001 || Math.abs(prev[1] - pt[1]) > 0.00001) {
            deduped.push(pt);
          }
        }
      }
      return deduped;
    }
  } catch (e) {
    console.warn('Error en matchPointsToRealRoads:', e);
  }

  return cleaned.map(p => [p.latitude, p.longitude]);
}
