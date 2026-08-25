import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Navigation, Calendar, RefreshCw, Users, Radio, Gauge, Clock, Layers, Crosshair, MapPin, Route, Eye, Trash2, CheckCircle2, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { apiGetLiveGps, apiGetGpsRoute, apiGetUsers, apiGetGpsRoutes, apiGetGpsRouteById, apiDeleteGpsRoute, getFullPhotoUrl, getSocket, getChileTodayString, isGpsActive, formatChileTime, formatChileDateTime } from '../api';
import { Geolocation } from '@capacitor/geolocation';
import { matchPointsToRealRoads, cleanGpsPoints } from '../utils/roadMatcher';

const WORKER_COLORS = [
  '#f97316', // Naranja
  '#3b82f6', // Azul
  '#10b981', // Verde Esmeralda
  '#a855f7', // Púrpura
  '#ec4899', // Rosa
  '#eab308', // Amarillo
  '#06b6d4', // Cian
  '#f43f5e', // Carmesí
  '#8b5cf6', // Violeta
];

const getWorkerColor = (userId, index = 0) => {
  if (typeof userId === 'number') return WORKER_COLORS[userId % WORKER_COLORS.length];
  return WORKER_COLORS[index % WORKER_COLORS.length];
};

const createTruckIcon = (color = '#f97316', label = '', photoUrl = null) => {
  return L.divIcon({
    className: 'custom-truck-marker',
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
        <div style="background-color: ${color}; width: 38px; height: 38px; border-radius: 50%; border: 3px solid #000; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; font-size: 17px; overflow: hidden;">
          ${photoUrl ? `<img src="${photoUrl}" style="width:100%; height:100%; object-fit:cover;" />` : '🚚'}
        </div>
        ${label ? `<div style="background: rgba(0,0,0,0.9); color: ${color}; font-size: 10px; font-weight: 900; padding: 2px 6px; border-radius: 6px; margin-top: 2px; border: 1.5px solid ${color}; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.8);">${label}</div>` : ''}
      </div>
    `,
    iconSize: [40, 56],
    iconAnchor: [20, 28]
  });
};

const createMyLocationIcon = () => {
  return L.divIcon({
    className: 'custom-my-location-marker',
    html: `
      <div style="position: relative; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; width: 44px; height: 44px; background-color: rgba(59, 130, 246, 0.35); border-radius: 50%; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="width: 22px; height: 22px; background-color: #3b82f6; border-radius: 50%; border: 3px solid #ffffff; box-shadow: 0 0 12px rgba(0,0,0,0.7); z-index: 10;"></div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });
};

const createPointIcon = (color = '#22c55e', text = 'P') => {
  return L.divIcon({
    className: 'custom-point-marker',
    html: `
      <div style="background-color: ${color}; color: #fff; width: 30px; height: 30px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 2px 10px rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900;">
        ${text}
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
};

function MapController({ center, zoom, bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 1) {
      const b = L.latLngBounds(bounds);
      map.fitBounds(b, { padding: [60, 60], maxZoom: 16 });
    } else if (bounds && bounds.length === 1) {
      map.flyTo(bounds[0], 15, { animate: true, duration: 1.2 });
    } else if (center) {
      map.flyTo(center, zoom || 14, { animate: true, duration: 1.2 });
    }
  }, [center, zoom, bounds, map]);
  return null;
}

export default function AdminGpsView({ theme }) {
  const [viewMode, setViewMode] = useState('live'); // 'live' | 'saved_routes'
  const [trackedUsers, setTrackedUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null); // null = Todos los trabajadores
  const [selectedDate, setSelectedDate] = useState(getChileTodayString());
  const [routePoints, setRoutePoints] = useState([]);
  const [snappedCoordinates, setSnappedCoordinates] = useState([]);
  const [isSnappingRoads, setIsSnappingRoads] = useState(false);
  const [mapCenter, setMapCenter] = useState([-33.4489, -70.6693]);
  const [mapZoom, setMapZoom] = useState(13);
  const [liveGpsList, setLiveGpsList] = useState([]);
  const [mapLayer, setMapLayer] = useState('satellite');
  const [myLocation, setMyLocation] = useState(null);
  const [myLocationAccuracy, setMyLocationAccuracy] = useState(null);
  const [geoError, setGeoError] = useState('');

  // Estados del Registro de Rutas Guardadas
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [loadingSavedRoutes, setLoadingSavedRoutes] = useState(false);
  const [selectedSavedRoute, setSelectedSavedRoute] = useState(null);
  const dateInputRef = useRef(null);

  const isDark = theme === 'dark';

  // Efecto para ajustar la ruta automáticamente a las calles y carreteras reales (OSRM Map Matching)
  useEffect(() => {
    if (routePoints.length > 1) {
      setIsSnappingRoads(true);
      matchPointsToRealRoads(routePoints)
        .then((snapped) => {
          if (Array.isArray(snapped) && snapped.length > 0) {
            setSnappedCoordinates(snapped);
          } else {
            setSnappedCoordinates(cleanGpsPoints(routePoints).map(p => [p.latitude, p.longitude]));
          }
        })
        .catch(() => {
          setSnappedCoordinates(cleanGpsPoints(routePoints).map(p => [p.latitude, p.longitude]));
        })
        .finally(() => {
          setIsSnappingRoads(false);
        });
    } else if (routePoints.length === 1) {
      setSnappedCoordinates([[routePoints[0].latitude, routePoints[0].longitude]]);
      setIsSnappingRoads(false);
    } else {
      setSnappedCoordinates([]);
      setIsSnappingRoads(false);
    }
  }, [routePoints]);

  const locateMe = async () => {
    try {
      let lat, lng, acc;
      try {
        await Geolocation.requestPermissions().catch(() => {});
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
        if (pos && pos.coords) {
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          acc = Math.round(pos.coords.accuracy || 10);
        }
      } catch (capErr) {
        if ('geolocation' in navigator) {
          await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (p) => {
                lat = p.coords.latitude;
                lng = p.coords.longitude;
                acc = Math.round(p.coords.accuracy || 10);
                resolve();
              },
              (err) => reject(err),
              { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
          });
        }
      }

      if (lat !== undefined && lng !== undefined) {
        setMyLocation([lat, lng]);
        setMyLocationAccuracy(acc);
        if (!selectedUser && liveGpsList.length === 0) {
          setMapCenter([lat, lng]);
          setMapZoom(16);
        }
        setGeoError('');
      }
    } catch (err) {
      console.warn('Geolocalización error:', err.message);
      setGeoError('Active el GPS o permisos de ubicación para auto-centrar');
    }
  };

  useEffect(() => {
    locateMe();
  }, []);

  const fetchLiveGps = async () => {
    try {
      const data = await apiGetLiveGps();
      setLiveGpsList(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    try {
      const allUsers = await apiGetUsers();
      const gpsUsers = (allUsers || []).filter(u => isGpsActive(u.gps_tracking_enabled));
      setTrackedUsers(gpsUsers);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRoute = async () => {
    if (!selectedUser || selectedSavedRoute) {
      setRoutePoints([]);
      return;
    }
    try {
      const res = await apiGetGpsRoute(selectedUser.id, selectedDate);
      setRoutePoints(res.points || []);
      if (res.points && res.points.length > 0) {
        setMapCenter([res.points[res.points.length - 1].latitude, res.points[res.points.length - 1].longitude]);
        setMapZoom(15);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSavedRoutes = async () => {
    setLoadingSavedRoutes(true);
    try {
      const data = await apiGetGpsRoutes({ date: selectedDate });
      setSavedRoutes(data);
    } catch (err) {
      console.error('Error al cargar rutas guardadas:', err);
    } finally {
      setLoadingSavedRoutes(false);
    }
  };

  const handleSelectSavedRoute = async (r) => {
    try {
      const fullRoute = await apiGetGpsRouteById(r.id);
      setSelectedSavedRoute(fullRoute);
      setRoutePoints(fullRoute.points || []);
      setViewMode('live'); // Cambiar a visualización de mapa
      if (fullRoute.points && fullRoute.points.length > 0) {
        setMapCenter([fullRoute.points[0].latitude, fullRoute.points[0].longitude]);
        setMapZoom(15);
      }
    } catch (err) {
      alert('Error al cargar los puntos de la ruta: ' + err.message);
    }
  };

  const handleDeleteSavedRoute = async (routeId) => {
    if (!window.confirm('¿Desea eliminar esta ruta guardada del registro?')) return;
    try {
      await apiDeleteGpsRoute(routeId);
      if (selectedSavedRoute?.id === routeId) {
        setSelectedSavedRoute(null);
        setRoutePoints([]);
      }
      fetchSavedRoutes();
    } catch (err) {
      alert('Error al eliminar ruta: ' + err.message);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchLiveGps();
    fetchSavedRoutes();

    const socket = getSocket();
    const handleLiveGpsSocket = (data) => {
      setLiveGpsList(prev => {
        const index = prev.findIndex(item => item.user_id === data.userId);
        const updatedEntry = {
          user_id: data.userId,
          user_name: data.userName,
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: data.accuracy,
          speed: data.speed,
          timestamp: data.timestamp,
          time: data.time
        };
        if (index >= 0) {
          const newList = [...prev];
          newList[index] = { ...newList[index], ...updatedEntry };
          return newList;
        } else {
          return [...prev, updatedEntry];
        }
      });

      if (!selectedSavedRoute && selectedUser && selectedUser.id === data.userId) {
        setRoutePoints(pts => [...pts, {
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: data.accuracy,
          speed: data.speed,
          timestamp: data.timestamp,
          time: data.time
        }]);
        setMapCenter([data.latitude, data.longitude]);
      }
    };

    const handleUserSync = () => {
      fetchUsers();
      fetchLiveGps();
    };

    socket.on('gps_position_updated', handleLiveGpsSocket);
    socket.on('user_gps_toggled', handleUserSync);
    socket.on('user_updated', handleUserSync);
    socket.on('user_created', handleUserSync);
    socket.on('user_deleted', handleUserSync);
    socket.on('gps_route_started', () => { fetchSavedRoutes(); fetchLiveGps(); });
    socket.on('gps_route_finished', () => { fetchSavedRoutes(); fetchLiveGps(); });

    return () => {
      socket.off('gps_position_updated', handleLiveGpsSocket);
      socket.off('user_gps_toggled', handleUserSync);
      socket.off('user_updated', handleUserSync);
      socket.off('user_created', handleUserSync);
      socket.off('user_deleted', handleUserSync);
      socket.off('gps_route_started');
      socket.off('gps_route_finished');
    };
  }, [selectedUser, selectedSavedRoute]);

  useEffect(() => {
    if (selectedUser && !selectedSavedRoute) {
      fetchRoute();
    }
    fetchSavedRoutes();
  }, [selectedUser, selectedDate, selectedSavedRoute]);

  const displayCoordinates = (snappedCoordinates && snappedCoordinates.length > 0)
    ? snappedCoordinates
    : cleanGpsPoints(routePoints).map(p => [p.latitude, p.longitude]);
  const polylineCoordinates = displayCoordinates;
  
  const activeTrackedUsers = trackedUsers.filter(u => isGpsActive(u.gps_tracking_enabled));
  const activeLiveMarkers = liveGpsList.filter(g => {
    if (!g.latitude || !g.longitude) return false;
    return activeTrackedUsers.some(u => u.id === g.user_id);
  });

  const currentLivePos = activeLiveMarkers.find(g => g.user_id === selectedUser?.id);
  const totalPoints = routePoints.length;
  const currentSpeed = currentLivePos?.speed ? Math.round(currentLivePos.speed * 3.6) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      
      {/* Encabezado Principal con Selector de Modos */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Navigation className="w-7 h-7 text-orange-500" />
            Supervisión GPS & Rutas en Terreno
          </h2>
          <p className="text-xs text-orange-500 font-semibold flex items-center gap-1.5 mt-0.5">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            Monitoreo en tiempo real y registro histórico de rutas guardadas
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          
          {/* Selector de Modo: En Vivo vs Registro de Rutas */}
          <div className={'flex p-1 rounded-2xl border ' + (isDark ? 'bg-black border-zinc-800' : 'bg-orange-50 border-orange-200')}>
            <button
              onClick={() => { setViewMode('live'); setSelectedSavedRoute(null); }}
              className={'px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ' + (viewMode === 'live' && !selectedSavedRoute ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/25' : 'text-zinc-400 hover:text-orange-500')}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Mapa En Vivo</span>
            </button>

            <button
              onClick={() => { setViewMode('saved_routes'); fetchSavedRoutes(); }}
              className={'px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ' + (viewMode === 'saved_routes' ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/25' : 'text-zinc-400 hover:text-orange-500')}
            >
              <Route className="w-3.5 h-3.5" />
              <span>Registro de Rutas ({savedRoutes.length})</span>
            </button>
          </div>

          <button
            onClick={locateMe}
            title="Mi Ubicación Satelital"
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black px-3 py-2 rounded-xl shadow-lg shadow-blue-500/25 flex items-center gap-1.5"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mi Ubicación</span>
          </button>

          <button
            onClick={() => setMapLayer(mapLayer === 'street' ? 'satellite' : 'street')}
            className={'text-xs font-bold px-3 py-2 rounded-xl border flex items-center gap-1.5 ' + (isDark ? 'bg-zinc-900 border-zinc-700 text-orange-400' : 'bg-white border-orange-200 text-orange-600')}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{mapLayer === 'street' ? 'Satelital' : 'Calles'}</span>
          </button>

          <button
            onClick={() => { fetchLiveGps(); fetchRoute(); fetchSavedRoutes(); locateMe(); }}
            className="bg-orange-500 hover:bg-orange-600 text-black text-xs font-black px-3.5 py-2 rounded-xl shadow-lg shadow-orange-500/25 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {geoError && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-amber-400 text-xs flex items-center justify-between">
          <span className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            {geoError}
          </span>
          <button onClick={locateMe} className="bg-amber-500 text-black font-black text-[10px] px-2.5 py-1 rounded-lg">
            Reintentar GPS
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 1: REGISTRO DE RUTAS GUARDADAS EN TERRENO */}
      {/* ========================================================================= */}
      {viewMode === 'saved_routes' && (
        <div className={'border rounded-3xl p-6 shadow-2xl space-y-4 ' + (isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-orange-200')}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-orange-500/20">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-orange-500 text-black flex items-center justify-center font-black">
                <Route className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black tracking-tight">Registro de Rutas Guardadas</h3>
                <p className="text-xs text-orange-500 font-semibold">Historial de recorridos completados en terreno</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-400">Filtrar por Fecha:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className={'rounded-xl px-3 py-1.5 text-xs font-bold border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
              />
            </div>
          </div>

          {loadingSavedRoutes ? (
            <div className="py-12 text-center text-zinc-500 font-bold text-xs">
              Cargando historial de rutas guardadas...
            </div>
          ) : savedRoutes.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Route className="w-10 h-10 text-zinc-600 mx-auto" />
              <p className="text-sm font-bold text-zinc-400">No hay rutas registradas en esta fecha ({selectedDate}).</p>
              <p className="text-xs text-zinc-500">
                Cuando el usuario Mauricio (u otro personal) active "Iniciar Ruta en Terreno" y luego la finalice, quedará guardada automáticamente aquí.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedRoutes.map((r) => (
                <div
                  key={r.id}
                  className={'border rounded-3xl p-5 shadow-xl flex flex-col justify-between space-y-3 transition-all hover:border-orange-500/50 ' + (isDark ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-orange-50/50 border-orange-200 text-zinc-900')}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-orange-500 text-black px-2.5 py-0.5 rounded-full">
                        {r.user_name}
                      </span>
                      <span className="text-[11px] font-mono text-zinc-400">{r.date}</span>
                    </div>

                    <h4 className="text-sm font-black tracking-tight leading-snug">{r.name || 'Ruta en Terreno'}</h4>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs my-3 bg-black/40 p-2.5 rounded-2xl border border-zinc-800">
                      <div>
                        <span className="text-[9px] text-zinc-400 block uppercase">Inicio</span>
                        <strong className="font-mono text-white text-[11px]">{formatChileTime(r.start_time)}</strong>
                      </div>
                      <div>
                        <span className="text-[9px] text-zinc-400 block uppercase">Fin</span>
                        <strong className="font-mono text-white text-[11px]">{formatChileTime(r.end_time)}</strong>
                      </div>
                      <div>
                        <span className="text-[9px] text-orange-400 block uppercase font-bold">Distancia</span>
                        <strong className="font-mono text-orange-400 text-[11px]">{r.total_distance_km || 0} km</strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-zinc-800">
                    <button
                      onClick={() => handleSelectSavedRoute(r)}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-black font-black text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/20 active:scale-95"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ver Ruta en Mapa</span>
                    </button>
                    <button
                      onClick={() => handleDeleteSavedRoute(r.id)}
                      className="p-2.5 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
                      title="Eliminar Ruta"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 2: MAPA EN VIVO / TRAZADO DE RUTA */}
      {/* ========================================================================= */}
      {viewMode === 'live' && (
        <div className="space-y-4">
          {/* Banner de Ruta Guardada Visualizada */}
          {selectedSavedRoute && (
            <div className="bg-orange-500 text-black p-3.5 rounded-2xl shadow-xl flex items-center justify-between font-bold text-xs">
              <div className="flex items-center gap-2">
                <Route className="w-5 h-5" />
                <span>
                  Visualizando Registro Guardado: <strong>{selectedSavedRoute.name}</strong> ({selectedSavedRoute.total_distance_km} km • {selectedSavedRoute.start_time} a {selectedSavedRoute.end_time})
                </span>
              </div>
              <button
                onClick={() => { setSelectedSavedRoute(null); fetchRoute(); }}
                className="bg-black text-white text-xs px-3 py-1.5 rounded-xl hover:bg-zinc-800 transition-colors"
              >
                Volver a Modo En Vivo
              </button>
            </div>
          )}
        <div className={'rounded-3xl border p-4 space-y-4 shadow-xl ' + (isDark ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-orange-200 text-zinc-900')}>
          
          {/* Barra de Filtro de Personal y Fecha */}
          <div className="flex flex-col gap-3 pb-2 border-b border-zinc-800">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              
              {/* Carrusel Horizontal de Trabajadores */}
              <div className="md:col-span-8 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                <button
                  onClick={() => { setSelectedUser(null); setSelectedSavedRoute(null); }}
                  className={'flex-shrink-0 px-3.5 py-2 rounded-2xl border transition-all flex items-center gap-2 cursor-pointer ' + (!selectedUser && !selectedSavedRoute ? 'bg-orange-500 text-black border-black font-black shadow-lg shadow-orange-500/30' : (isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800' : 'bg-orange-50/70 border-orange-200 text-zinc-800 hover:bg-orange-100'))}
                >
                  <Users className="w-4 h-4" />
                  <div className="text-left">
                    <div className="text-xs font-bold">Todos en Vivo</div>
                    <div className={'text-[9px] ' + (!selectedUser ? 'text-black/80' : 'text-zinc-400')}>
                      {liveGpsList.filter(g => g.latitude).length} Conectados
                    </div>
                  </div>
                </button>

                <div className="h-7 w-[1px] bg-zinc-700/50 flex-shrink-0 mx-1"></div>

                {trackedUsers.length === 0 ? (
                  <span className="text-xs text-zinc-500">No hay trabajadores con GPS activo configurado.</span>
                ) : (
                  trackedUsers.map((u, idx) => {
                    const isSelected = selectedUser?.id === u.id;
                    const livePos = liveGpsList.find(g => g.user_id === u.id);
                    const uColor = getWorkerColor(u.id, idx);
                    return (
                      <button
                        key={u.id}
                        onClick={() => { setSelectedUser(u); setSelectedSavedRoute(null); }}
                        className={'flex-shrink-0 px-3.5 py-2 rounded-2xl border transition-all flex items-center gap-2.5 cursor-pointer ' + (isSelected ? 'bg-orange-500 text-black border-black font-black shadow-lg shadow-orange-500/30' : (isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800' : 'bg-orange-50/70 border-orange-200 text-zinc-800 hover:bg-orange-100'))}
                      >
                        <div className="w-7 h-7 rounded-full overflow-hidden bg-black flex items-center justify-center border-2 flex-shrink-0" style={{ borderColor: uColor }}>
                          {u.photo_url ? (
                            <img src={getFullPhotoUrl(u.photo_url)} alt={u.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs font-bold" style={{ color: uColor }}>{u.name.charAt(0)}</span>
                          )}
                        </div>
                        <div className="text-left">
                          <div className="text-xs font-bold truncate max-w-[120px]">{u.name}</div>
                          <div className={'text-[9px] flex items-center gap-1 ' + (isSelected ? 'text-black/80' : 'text-zinc-400')}>
                            {livePos?.latitude ? (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full animate-ping" style={{ backgroundColor: uColor }}></span>
                                <span className="text-emerald-400 font-bold">En Vivo</span>
                              </>
                            ) : (
                              <span>En Terreno</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="md:col-span-4 flex flex-wrap items-center gap-2 justify-end">
                {(() => {
                  const todayDateStr = new Date().toISOString().split('T')[0];
                  const yesterdayObj = new Date();
                  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
                  const yesterdayDateStr = yesterdayObj.toISOString().split('T')[0];

                  return (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedDate(todayDateStr)}
                        className={'px-2.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ' + (selectedDate === todayDateStr ? 'bg-orange-500 text-black shadow-md shadow-orange-500/20' : (isDark ? 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white' : 'bg-orange-50 text-zinc-700 border border-orange-200 hover:text-black'))}
                      >
                        Hoy
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedDate(yesterdayDateStr)}
                        className={'px-2.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ' + (selectedDate === yesterdayDateStr ? 'bg-orange-500 text-black shadow-md shadow-orange-500/20' : (isDark ? 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white' : 'bg-orange-50 text-zinc-700 border border-orange-200 hover:text-black'))}
                      >
                        Ayer
                      </button>
                    </div>
                  );
                })()}

                <div 
                  onClick={() => {
                    try {
                      dateInputRef.current?.showPicker?.();
                    } catch (e) {
                      dateInputRef.current?.focus?.();
                    }
                  }}
                  className={'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border cursor-pointer transition-all active:scale-98 ' + (isDark ? 'bg-black border-orange-500/50 hover:border-orange-500 text-white' : 'bg-white border-orange-300 hover:border-orange-500 text-zinc-900 shadow-sm')}
                  title="Haga clic para abrir el calendario"
                >
                  <Calendar className="w-4 h-4 text-orange-500 flex-shrink-0 animate-pulse" />
                  <span className="text-[10px] font-black text-orange-500 uppercase flex-shrink-0">
                    Día de Ruta:
                  </span>
                  <input
                    ref={dateInputRef}
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    onClick={(e) => {
                      e.stopPropagation();
                      try { e.currentTarget.showPicker?.(); } catch (err) {}
                    }}
                    className="bg-transparent border-none text-xs font-bold font-mono focus:outline-none cursor-pointer p-0 m-0"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Panel Informativo Superior del Mapa */}
          <div className="relative">
            <div className="absolute top-4 left-4 z-[400] flex flex-wrap gap-2 pointer-events-none">
              {!selectedUser && !selectedSavedRoute ? (
                <div className="bg-black/85 backdrop-blur-md border border-zinc-800 text-white px-3.5 py-2 rounded-2xl shadow-2xl flex items-center gap-3 pointer-events-auto">
                  <div className="flex -space-x-2 overflow-hidden">
                    {trackedUsers.slice(0, 4).map((u, i) => (
                      <div key={u.id} className="w-6 h-6 rounded-full border-2 border-black overflow-hidden bg-zinc-800">
                        {u.photo_url ? (
                          <img src={getFullPhotoUrl(u.photo_url)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-bold text-orange-400 flex items-center justify-center h-full">{u.name.charAt(0)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="text-xs font-black text-orange-400">Flota en Terreno</div>
                    <div className="text-[10px] text-zinc-400">
                      {liveGpsList.filter(g => g.latitude).length} de {trackedUsers.length} transmitiendo en vivo
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-black/90 backdrop-blur-md border border-orange-500 text-white px-4 py-2 rounded-2xl shadow-2xl flex items-center gap-3 pointer-events-auto">
                  <div className="w-8 h-8 rounded-xl bg-orange-500 text-black flex items-center justify-center font-black">
                    🚚
                  </div>
                  <div>
                    <div className="text-xs font-black text-orange-400 flex items-center gap-1.5">
                      <span>{selectedSavedRoute ? selectedSavedRoute.user_name : selectedUser?.name}</span>
                      {snappedCoordinates.length > 1 && (
                        <span className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>Trazado Vial Real</span>
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-400 flex items-center gap-2">
                      {!selectedSavedRoute && (
                        <span className="flex items-center gap-1 font-mono text-white">
                          <Gauge className="w-3 h-3 text-orange-400" />
                          {currentSpeed} km/h
                        </span>
                      )}
                      <span>•</span>
                      <span className="font-mono text-orange-300">{totalPoints} Puntos GPS</span>
                    </div>
                  </div>
                  <button
                    onClick={() => { setSelectedUser(null); setSelectedSavedRoute(null); setRoutePoints([]); setSnappedCoordinates([]); }}
                    className="ml-2 bg-orange-500/20 hover:bg-orange-500 hover:text-black text-orange-400 text-[10px] font-bold px-2 py-1 rounded-lg border border-orange-500/30 transition-all cursor-pointer"
                  >
                    ← Ver Todos
                  </button>
                </div>
              )}
            </div>

            {/* MAPA LEAFLET */}
            <div className="w-full h-[620px] rounded-2xl overflow-hidden relative shadow-inner">
              <MapContainer
                center={mapCenter}
                zoom={mapZoom}
                scrollWheelZoom={true}
                style={{ height: '100%', width: '100%' }}
              >
                <MapController
                  center={mapCenter}
                  zoom={mapZoom}
                  bounds={
                    displayCoordinates.length > 1 
                      ? displayCoordinates 
                      : (liveGpsList.filter(g => g.latitude && g.longitude).length > 1 
                          ? liveGpsList.filter(g => g.latitude && g.longitude).map(g => [g.latitude, g.longitude]) 
                          : null)
                  }
                />

                {mapLayer === 'satellite' ? (
                  <TileLayer
                    attribution='Tiles &copy; Esri World Imagery'
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    maxZoom={19}
                  />
                ) : (
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maxZoom={19}
                  />
                )}

                {myLocation && (
                  <Marker position={myLocation} icon={createMyLocationIcon()}>
                    <Popup>
                      <div className="text-xs text-zinc-900 font-sans p-1">
                        <strong className="text-sm font-black text-blue-600 block">📍 Mi Ubicación Satelital Exacta</strong>
                        <div className="text-[11px] text-zinc-700 mt-1">Dispositivo conectado</div>
                        <div className="text-[10px] text-zinc-500 font-mono mt-0.5">Precisión: ±{myLocationAccuracy} metros</div>
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* Marcadores de Trabajadores con GPS Activo en Vivo */}
                {!selectedSavedRoute && activeLiveMarkers.map((g, idx) => (
                  g.latitude && g.longitude && (
                    <Marker
                      key={g.user_id}
                      position={[g.latitude, g.longitude]}
                      icon={createTruckIcon(getWorkerColor(g.user_id, idx), g.user_name)}
                    >
                      <Popup>
                        <div className="text-xs text-zinc-900 font-sans p-1 min-w-[150px]">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getWorkerColor(g.user_id, idx) }}></span>
                            <strong className="text-sm font-black text-zinc-900">{g.user_name}</strong>
                          </div>
                          <div className="text-[11px] text-zinc-700">🚚 Posición Satelital en Vivo</div>
                          <div className="text-[10px] text-zinc-600 font-mono mt-0.5">
                            Velocidad: <strong>{g.speed ? Math.round(g.speed * 3.6) : 0} km/h</strong>
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">Hora: {formatChileTime(g.timestamp || g.time)}</div>
                          <button
                            onClick={() => {
                              const u = trackedUsers.find(x => x.id === g.user_id);
                              if (u) setSelectedUser(u);
                            }}
                            className="mt-2 w-full bg-orange-500 hover:bg-orange-600 text-black font-black text-[10px] py-1 px-2 rounded-lg cursor-pointer transition-all"
                          >
                            📍 Ver Ruta Detallada
                          </button>
                        </div>
                      </Popup>
                    </Marker>
                  )
                ))}

                {/* Trazado Real de la Línea de Ruta Recorrida por Calles y Carreteras */}
                {displayCoordinates.length > 1 && (
                  <>
                    <Polyline
                      positions={displayCoordinates}
                      color="#000000"
                      weight={8}
                      opacity={0.7}
                    />
                    <Polyline
                      positions={displayCoordinates}
                      color="#f97316"
                      weight={5}
                      opacity={1.0}
                    />
                  </>
                )}

                {/* Marcador de Punto Inicial (Verde A) y Final (Rojo B) */}
                {routePoints.length > 0 && (
                  <>
                    <Marker
                      position={[routePoints[0].latitude, routePoints[0].longitude]}
                      icon={createPointIcon('#22c55e', 'A')}
                    >
                      <Popup>
                        <div className="text-xs font-bold text-zinc-900">
                          🟢 Punto de Inicio / Partida
                          <div className="text-[10px] text-zinc-600 font-mono mt-0.5">
                            Hora: {formatChileTime(routePoints[0].timestamp || routePoints[0].time)}
                          </div>
                        </div>
                      </Popup>
                    </Marker>

                    <Marker
                      position={[routePoints[routePoints.length - 1].latitude, routePoints[routePoints.length - 1].longitude]}
                      icon={createPointIcon('#ef4444', 'B')}
                    >
                      <Popup>
                        <div className="text-xs font-bold text-zinc-900">
                          🔴 Punto Final / Destino
                          <div className="text-[10px] text-zinc-600 font-mono mt-0.5">
                            Hora: {formatChileTime(routePoints[routePoints.length - 1].timestamp || routePoints[routePoints.length - 1].time)}
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  </>
                )}

              </MapContainer>
            </div>

            {/* Barra inferior informativa */}
            <div className="mt-3 px-2 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-400 gap-2">
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1 text-emerald-400 font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  Punto A: Inicio de Ruta
                </span>
                <span className="flex items-center gap-1 text-red-400 font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                  Punto B: Fin de Ruta
                </span>
                <span className="flex items-center gap-1 text-orange-400 font-bold">
                  <span className="w-4 h-1 bg-orange-500 rounded"></span>
                  Trayectoria Recorrida
                </span>
              </div>

              <span className="text-[10px] text-orange-500 font-extrabold uppercase">
                Auto-centrado Satelital Activo
              </span>
            </div>

          </div>
        </div>
      </div>
      )}

    </div>
  );
}
