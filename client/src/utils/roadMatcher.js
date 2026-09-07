// Motor de Enrutamiento Fiel por Calles y Carreteras Reales (OSRM Engine)
import { apiSnapRoads } from '../api';

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

export function cleanGpsPoints(rawPoints, maxAccuracy = 250) {
  if (!Array.isArray(rawPoints) || rawPoints.length === 0) return [];

  const validPoints = [];
  for (let i = 0; i < rawPoints.length; i++) {
    const p = rawPoints[i];
    if (!p) continue;
    const lat = Number(p.latitude ?? p.lat ?? (Array.isArray(p) ? p[0] : null));
    const lng = Number(p.longitude ?? p.lng ?? (Array.isArray(p) ? p[1] : null));
    const acc = Number(p.accuracy ?? 10);
    const speed = Number(p.speed ?? 0);

    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) continue;
    if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) continue;

    if (acc > maxAccuracy && rawPoints.length > 3) continue;

    validPoints.push({
      ...p,
      latitude: lat,
      longitude: lng,
      accuracy: acc,
      speed: speed
    });
  }

  if (validPoints.length <= 1) return validPoints;

  // Filtrar micro-temblores estacionarios (< 4m)
  const filtered = [validPoints[0]];
  for (let i = 1; i < validPoints.length; i++) {
    const curr = validPoints[i];
    const prev = filtered[filtered.length - 1];
    const distKm = getDistanceKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    if (distKm < 0.004 && i < validPoints.length - 1) {
      continue;
    }
    filtered.push(curr);
  }

  return filtered;
}

/**
 * Consulta directa a OSRM desde el navegador o app móvil como respaldo infalible
 */
export async function fetchOsrmDirectly(coords) {
  if (!Array.isArray(coords) || coords.length < 2) return coords;
  try {
    let waypoints = coords;
    if (coords.length > 30) {
      const step = (coords.length - 1) / 29;
      waypoints = [coords[0]];
      for (let i = 1; i < 29; i++) {
        waypoints.push(coords[Math.round(i * step)]);
      }
      waypoints.push(coords[coords.length - 1]);
    }
    const coordString = waypoints.map(c => Number(c[1]).toFixed(6) + ',' + Number(c[0]).toFixed(6)).join(';');
    const url = 'https://router.project-osrm.org/route/v1/driving/' + coordString + '?overview=full&geometries=geojson';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok) {
      const json = await response.json();
      if (json.code === 'Ok' && json.routes && json.routes[0]) {
        const roadPoints = json.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        if (roadPoints.length > 1) return roadPoints;
      }
    }
  } catch (e) {
    console.warn('Direct OSRM fetch failed:', e);
  }
  return coords;
}

/**
 * Trazado Fiel por Carreteras Reales:
 * Conecta los puntos GPS a traves de las calles, avenidas y curvas reales usando OSRM.
 * Elimina de raiz cualquier linea recta que atraviese cerros, campos o casas.
 */
export async function matchPointsToRealRoads(rawPoints) {
  const cleaned = cleanGpsPoints(rawPoints);
  if (!cleaned || cleaned.length === 0) return [];
  if (cleaned.length === 1) return [[cleaned[0].latitude, cleaned[0].longitude]];

  const coords = cleaned.map(p => [p.latitude, p.longitude]);

  // 1. Intentar snap en el servidor
  try {
    const res = await apiSnapRoads(coords);
    if (res && Array.isArray(res.route) && res.route.length > coords.length) {
      return res.route;
    }
  } catch (err) {
    console.warn('Fallo OSRM road snapping en servidor, intentando directo...', err);
  }

  // 2. Respaldo directo en cliente si el servidor retorno coordenadas crudas o fallo
  const directRoute = await fetchOsrmDirectly(coords);
  if (Array.isArray(directRoute) && directRoute.length > 1) {
    return directRoute;
  }

  return coords;
}
