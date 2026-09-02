import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { 
  Navigation, Calendar, RefreshCw, Users, Radio, Gauge, Clock, Layers, Crosshair, 
  MapPin, Route, Eye, Trash2, CheckCircle2, ArrowRight, ShieldCheck, Sparkles, Play, 
  Square, Save, UserCheck, Activity, ChevronRight, AlertCircle
} from 'lucide-react';
import { 
  apiGetLiveGps, apiGetGpsRoute, apiGetUsers, apiGetGpsRoutes, apiGetGpsRouteById, 
  apiDeleteGpsRoute, apiToggleGps, apiAdminStartRoute, apiAdminFinishRoute, apiAdminGetActiveRoute,
  getFullPhotoUrl, getSocket, getChileTodayString, isGpsActive, formatChileTime, formatChileDateTime 
} from '../api';
import { Geolocation } from '@capacitor/geolocation';
import { matchPointsToRealRoads, cleanGpsPoints } from '../utils/roadMatcher';

const WORKER_COLORS = [
  '#f97316', '#3b82f6', '#10b981', '#a855f7', '#ec4899', '#eab308', '#06b6d4', '#f43f5e', '#8b5cf6'
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

function MapController({ targetCenter, targetZoom, targetBounds, moveTrigger }) {
  const map = useMap();
  const lastTriggerRef = useRef(0);

  useEffect(() => {
    if (!moveTrigger || moveTrigger === lastTriggerRef.current) return;
    lastTriggerRef.current = moveTrigger;

    try {
      if (targetBounds && targetBounds.length > 1) {
        const b = L.latLngBounds(targetBounds);
        map.fitBounds(b, { padding: [50, 50], maxZoom: 16 });
      } else if (targetBounds && targetBounds.length === 1) {
        map.flyTo(targetBounds[0], 16, { animate: true, duration: 0.8 });
      } else if (targetCenter) {
        map.flyTo(targetCenter, targetZoom || 15, { animate: true, duration: 0.8 });
      }
    } catch (e) {
      console.warn('MapController error:', e);
    }
  }, [moveTrigger]);

  return null;
}
export default function AdminGpsView({ theme }) {
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedDate, setSelectedDate] = useState(getChileTodayString());
  
  const [routePoints, setRoutePoints] = useState([]);
  const [snappedCoordinates, setSnappedCoordinates] = useState([]);
  const [isSnappingRoads, setIsSnappingRoads] = useState(false);

  const [targetCenter, setTargetCenter] = useState([-33.4489, -70.6693]);
  const [targetZoom, setTargetZoom] = useState(13);
  const [targetBounds, setTargetBounds] = useState(null);
  const [moveTrigger, setMoveTrigger] = useState(0);

  const [liveGpsList, setLiveGpsList] = useState([]);
  const [mapLayer, setMapLayer] = useState('satellite');
  const [myLocation, setMyLocation] = useState(null);
  const [myLocationAccuracy, setMyLocationAccuracy] = useState(null);
  const [geoError, setGeoError] = useState('');

  const [activeRouteInfo, setActiveRouteInfo] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [savedRoutes, setSavedRoutes] = useState([]);
  const [loadingSavedRoutes, setLoadingSavedRoutes] = useState(false);
  const [selectedSavedRoute, setSelectedSavedRoute] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const isDark = theme === 'dark';
  const workersList = allUsers.filter(u => u.role !== 'kiosk' && u.role !== 'kiosco');

  useEffect(() => {
    if ((selectedUser || selectedSavedRoute) && routePoints.length > 1) {
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
    } else if ((selectedUser || selectedSavedRoute) && routePoints.length === 1) {
      setSnappedCoordinates([[routePoints[0].latitude, routePoints[0].longitude]]);
      setIsSnappingRoads(false);
    } else {
      setSnappedCoordinates([]);
      setIsSnappingRoads(false);
    }
  }, [routePoints, selectedUser?.id, selectedSavedRoute?.id]);

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
        setTargetCenter([lat, lng]);
        setTargetZoom(16);
        setTargetBounds(null);
        setMoveTrigger(t => t + 1);
        setGeoError('');
      }
    } catch (err) {
      console.warn('Geolocalización error:', err.message);
      setGeoError('Active el GPS para auto-centrar');
    }
  };

  useEffect(() => {
    locateMe();
  }, []);

  const fetchLiveGps = async () => {
    try {
      const data = await apiGetLiveGps();
      if (Array.isArray(data)) setLiveGpsList(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    try {
      const usersData = await apiGetUsers();
      if (Array.isArray(usersData)) setAllUsers(usersData);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRoute = async (targetUserId) => {
    if (!targetUserId) {
      setRoutePoints([]);
      setSnappedCoordinates([]);
      return;
    }
    try {
      const res = await apiGetGpsRoute(targetUserId, selectedDate);
      setRoutePoints(res.points || []);
    } catch (err) {
      console.error('Error al obtener ruta:', err);
    }
  };

  const checkActiveRoute = async (userId) => {
    try {
      const active = await apiAdminGetActiveRoute(userId);
      setActiveRouteInfo(active && active.status === 'active' ? active : null);
    } catch (e) {
      setActiveRouteInfo(null);
    }
  };

  const fetchSavedRoutes = async () => {
    setLoadingSavedRoutes(true);
    try {
      const data = await apiGetGpsRoutes({ date: selectedDate });
      setSavedRoutes(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSavedRoutes(false);
    }
  };

  const handleSelectWorker = async (worker) => {
    if (!worker) {
      setSelectedUser(null);
      setSelectedSavedRoute(null);
      setActiveRouteInfo(null);
      setRoutePoints([]);
      setSnappedCoordinates([]);

      const activeCoords = liveGpsList.filter(g => g.latitude && g.longitude).map(g => [g.latitude, g.longitude]);
      if (activeCoords.length > 0) {
        setTargetBounds(activeCoords);
        setMoveTrigger(t => t + 1);
      }
      return;
    }

    const isCurrentlyActive = isGpsActive(worker.gps_tracking_enabled);

    // SI SE PRESIONA DE NUEVO SOBRE EL MISMO TRABAJADOR: DESACTIVAR SU GPS
    if (selectedUser?.id === worker.id && isCurrentlyActive) {
      try {
        await apiToggleGps(worker.id, false);
        setAllUsers(prev => prev.map(u => u.id === worker.id ? { ...u, gps_tracking_enabled: 0 } : u));
        setSelectedUser(null);
        setActiveRouteInfo(null);
        setRoutePoints([]);
        setSnappedCoordinates([]);
        setLiveGpsList(prev => prev.filter(g => g.user_id !== worker.id));
        fetchSavedRoutes();
        return;
      } catch (err) {
        console.warn('Error al desactivar GPS:', err);
      }
    }

    // SI ESTABA INACTIVO O SE SELECCIONA POR PRIMERA VEZ: ACTIVAR GPS Y LOCALIZAR
    setSelectedUser(worker);
    setSelectedSavedRoute(null);

    if (!isCurrentlyActive) {
      try {
        await apiToggleGps(worker.id, true);
        setAllUsers(prev => prev.map(u => u.id === worker.id ? { ...u, gps_tracking_enabled: 1 } : u));
        setSelectedUser(prev => prev && prev.id === worker.id ? { ...prev, gps_tracking_enabled: 1 } : prev);
      } catch (err) {
        console.warn('Error al activar GPS:', err);
      }
    }

    checkActiveRoute(worker.id);
    fetchRoute(worker.id);

    const live = liveGpsList.find(g => g.user_id === worker.id);
    if (live && live.latitude && live.longitude) {
      setTargetCenter([live.latitude, live.longitude]);
      setTargetZoom(16);
      setTargetBounds([[live.latitude, live.longitude]]);
      setMoveTrigger(t => t + 1);
    }
  };

  const handleStartRoute = async () => {
    if (!selectedUser || actionLoading) return;
    setActionLoading(true);
    try {
      const live = liveGpsList.find(g => g.user_id === selectedUser.id);
      const lat = live?.latitude || -33.4489;
      const lng = live?.longitude || -70.6693;

      const res = await apiAdminStartRoute(selectedUser.id, lat, lng);
      setActiveRouteInfo(res);
      fetchSavedRoutes();
      fetchRoute(selectedUser.id);
    } catch (err) {
      alert('Error al comenzar ruta: ' + (err.message || err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinishRoute = async () => {
    if (!selectedUser || actionLoading) return;
    if (!window.confirm(`¿Desea guardar y finalizar la ruta de ${selectedUser.name}? Esto archivará el recorrido y apagará el GPS.`)) return;

    setActionLoading(true);
    try {
      await apiAdminFinishRoute(selectedUser.id);
      setActiveRouteInfo(null);

      setAllUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, gps_tracking_enabled: 0 } : u));
      setSelectedUser(prev => prev ? { ...prev, gps_tracking_enabled: 0 } : null);
      setLiveGpsList(prev => prev.filter(g => g.user_id !== selectedUser.id));

      fetchSavedRoutes();
      alert('¡Ruta guardada y archivada con éxito en el historial!');
    } catch (err) {
      alert('Error al guardar ruta: ' + (err.message || err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectSavedRoute = async (r) => {
    try {
      const fullRoute = await apiGetGpsRouteById(r.id);
      setSelectedSavedRoute(fullRoute);
      setSelectedUser(null);
      setActiveRouteInfo(null);
      setShowHistoryModal(false);

      const pts = fullRoute.points || [];
      setRoutePoints(pts);

      if (pts.length > 0) {
        setTargetCenter([pts[0].latitude, pts[0].longitude]);
        setTargetBounds(pts.map(p => [p.latitude, p.longitude]));
        setMoveTrigger(t => t + 1);
      }
    } catch (err) {
      alert('Error al cargar la ruta: ' + err.message);
    }
  };

  const handleDeleteSavedRoute = async (routeId) => {
    if (!window.confirm('¿Desea eliminar esta ruta guardada?')) return;
    try {
      await apiDeleteGpsRoute(routeId);
      if (selectedSavedRoute?.id === routeId) {
        setSelectedSavedRoute(null);
        setRoutePoints([]);
        setSnappedCoordinates([]);
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
      if (!data || !data.userId) return;
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
          date: data.date
        };
        if (index >= 0) {
          const newList = [...prev];
          newList[index] = { ...newList[index], ...updatedEntry };
          return newList;
        } else {
          return [...prev, updatedEntry];
        }
      });

      setRoutePoints(prevPts => {
        return [...prevPts, {
          latitude: data.latitude,
          longitude: data.longitude,
          accuracy: data.accuracy,
          speed: data.speed,
          timestamp: data.timestamp,
          date: data.date
        }];
      });
    };

    const handleUserGpsToggled = (payload) => {
      if (!payload || !payload.userId) return;
      const { userId, gps_tracking_enabled } = payload;
      setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, gps_tracking_enabled } : u));
      if (gps_tracking_enabled === 0) {
        setLiveGpsList(prev => prev.filter(g => g.user_id !== userId));
      }
    };

    socket.on('gps_position_updated', handleLiveGpsSocket);
    socket.on('user_gps_toggled', handleUserGpsToggled);
    socket.on('routes_updated', fetchSavedRoutes);

    const liveInterval = setInterval(fetchLiveGps, 12000);

    return () => {
      clearInterval(liveInterval);
      socket.off('gps_position_updated', handleLiveGpsSocket);
      socket.off('user_gps_toggled', handleUserGpsToggled);
      socket.off('routes_updated', fetchSavedRoutes);
    };
  }, []);

  useEffect(() => {
    if (selectedUser) fetchRoute(selectedUser.id);
    fetchSavedRoutes();
  }, [selectedDate]);

  const activeLiveMarkers = liveGpsList.filter(g => {
    if (!g.latitude || !g.longitude) return false;
    const found = allUsers.find(u => u.id === g.user_id);
    return !found || isGpsActive(found.gps_tracking_enabled);
  });

  const displayCoordinates = (selectedUser || selectedSavedRoute)
    ? ((snappedCoordinates && snappedCoordinates.length > 0)
        ? snappedCoordinates
        : cleanGpsPoints(routePoints).map(p => [p.latitude, p.longitude]))
    : [];

  const currentLivePos = liveGpsList.find(g => g.user_id === selectedUser?.id);
  const currentSpeed = currentLivePos?.speed ? Math.round(currentLivePos.speed * 3.6) : 0;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 space-y-4">
      
      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
            <Navigation className="w-6 h-6 text-orange-500" />
            Supervisión GPS & Rutas en Terreno
          </h2>
          <p className="text-xs text-orange-500 font-semibold flex items-center gap-1.5 mt-0.5">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            Seleccione un trabajador para ubicarlo y controlar su ruta en terreno
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="bg-zinc-900 hover:bg-orange-500 hover:text-black text-orange-400 border border-orange-500/30 text-xs font-black px-3.5 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
          >
            <Route className="w-3.5 h-3.5" />
            <span>Historial de Rutas ({savedRoutes.length})</span>
          </button>

          <button
            type="button"
            onClick={locateMe}
            title="Mi Ubicación"
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black px-3 py-2 rounded-xl shadow-lg shadow-blue-500/25 flex items-center gap-1.5 cursor-pointer"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mi Ubicación</span>
          </button>

          <button
            type="button"
            onClick={() => setMapLayer(mapLayer === 'street' ? 'satellite' : 'street')}
            className={'text-xs font-bold px-3 py-2 rounded-xl border flex items-center gap-1.5 cursor-pointer ' + (isDark ? 'bg-zinc-900 border-zinc-700 text-orange-400' : 'bg-white border-orange-200 text-orange-600')}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{mapLayer === 'street' ? 'Satelital' : 'Calles'}</span>
          </button>

          <button
            type="button"
            onClick={() => { fetchLiveGps(); fetchUsers(); if (selectedUser) fetchRoute(selectedUser.id); }}
            className="bg-orange-500 hover:bg-orange-600 text-black text-xs font-black px-3.5 py-2 rounded-xl shadow-lg shadow-orange-500/25 flex items-center gap-1.5 cursor-pointer"
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

      {/* BANNER RUTA ARCHIVADA */}
      {selectedSavedRoute && (
        <div className="bg-orange-500 text-black p-3.5 rounded-2xl shadow-xl flex items-center justify-between font-bold text-xs">
          <div className="flex items-center gap-2">
            <Route className="w-5 h-5" />
            <span>
              Visualizando Ruta Archivada: <strong>{selectedSavedRoute.name}</strong> ({selectedSavedRoute.total_distance_km} km • {selectedSavedRoute.start_time} a {selectedSavedRoute.end_time})
            </span>
          </div>
          <button
            onClick={() => { setSelectedSavedRoute(null); setRoutePoints([]); setSnappedCoordinates([]); }}
            className="bg-black text-white text-xs px-3 py-1.5 rounded-xl hover:bg-zinc-800 transition-colors cursor-pointer font-black"
          >
            Volver a Modo En Vivo
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. LISTA DE TRABAJADORES (SIN BOTONES, AL PRESIONAR ACTIVA GPS Y LOCALIZA) */}
      {/* ========================================================================= */}
      <div className={'rounded-3xl border p-4 shadow-xl space-y-2 ' + (isDark ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-orange-200 text-zinc-900')}>
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-orange-500" />
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">
              Personal en Terreno ({workersList.length}) • Toque para localizar
            </h3>
          </div>

          <button
            type="button"
            onClick={() => handleSelectWorker(null)}
            className={'text-xs font-black px-3 py-1 rounded-xl border transition-all cursor-pointer ' + (!selectedUser && !selectedSavedRoute ? 'bg-orange-500 text-black border-orange-500 shadow-md' : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-white')}
          >
            Ver Todos en Vivo ({activeLiveMarkers.length})
          </button>
        </div>

        {/* Carrusel de Tarjetas Limpias */}
        <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
          {workersList.length === 0 ? (
            <span className="text-xs text-zinc-500 py-3">No hay trabajadores registrados.</span>
          ) : (
            workersList.map((u, idx) => {
              const isSelected = selectedUser?.id === u.id;
              const livePos = liveGpsList.find(g => g.user_id === u.id);
              const isGpsOn = isGpsActive(u.gps_tracking_enabled);
              const uColor = getWorkerColor(u.id, idx);
              const speed = livePos?.speed ? Math.round(livePos.speed * 3.6) : 0;

              return (
                <div
                  key={u.id}
                  onClick={() => handleSelectWorker(u)}
                  className={'flex-shrink-0 p-3 rounded-2xl border transition-all cursor-pointer select-none min-w-[170px] max-w-[200px] flex items-center gap-3 ' + (
                    isSelected
                      ? 'bg-orange-500 text-black border-black shadow-lg shadow-orange-500/30 scale-[1.02]'
                      : isGpsOn
                        ? (isDark ? 'bg-zinc-900/90 border-emerald-500/50 hover:border-orange-500 text-white' : 'bg-emerald-50 border-emerald-400 text-zinc-900')
                        : (isDark ? 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 text-zinc-300' : 'bg-zinc-50 border-zinc-200 text-zinc-800')
                  )}
                >
                  <div 
                    className="w-10 h-10 rounded-full overflow-hidden bg-black flex items-center justify-center border-2 flex-shrink-0"
                    style={{ borderColor: isGpsOn ? '#22c55e' : '#71717a' }}
                  >
                    {u.photo_url ? (
                      <img src={getFullPhotoUrl(u.photo_url)} alt={u.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-black" style={{ color: uColor }}>{u.name.charAt(0)}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-black truncate leading-tight">{u.name}</h4>
                    <span className={'text-[10px] block truncate ' + (isSelected ? 'text-black/80 font-bold' : 'text-zinc-400')}>
                      {u.role || 'Operador'}
                    </span>
                    
                    <div className="mt-1 flex items-center gap-1 text-[9px] font-bold">
                      {isGpsOn ? (
                        livePos?.latitude ? (
                          <span className="text-emerald-400 font-extrabold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                            {speed > 0 ? `${speed} km/h` : 'En Vivo'}
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-extrabold">GPS Activo</span>
                        )
                      ) : (
                        <span className="text-zinc-500">GPS Inactivo</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. EL MAPA DE ABAJO: CON OPCIÓN DE COMENZAR Y GUARDAR RUTA */}
      {/* ========================================================================= */}
      <div className={'rounded-3xl border p-3.5 sm:p-4 shadow-2xl relative space-y-3 ' + (isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-orange-200')}>
        <div className="w-full h-[580px] rounded-2xl overflow-hidden relative shadow-inner bg-black">
          
          {/* PANEL DE CONTROL DE RUTA EN EL MAPA (COMENZAR Y GUARDAR) */}
          <div className="absolute top-3 left-3 right-3 sm:right-auto z-[400] pointer-events-none">
            {selectedUser ? (
              <div className="bg-black/95 backdrop-blur-md border-2 border-orange-500 text-white p-3 sm:p-4 rounded-2xl shadow-2xl flex flex-col sm:flex-row sm:items-center gap-3 pointer-events-auto max-w-xl">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-orange-500 text-black flex items-center justify-center font-black text-xl flex-shrink-0">
                    🚚
                  </div>
                  <div>
                    <div className="text-sm font-black text-white flex items-center gap-2">
                      <span>{selectedUser.name}</span>
                      {activeRouteInfo ? (
                        <span className="bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Activity className="w-3 h-3 animate-pulse" />
                          <span>GRABANDO RUTA</span>
                        </span>
                      ) : (
                        <span className="bg-orange-500/20 border border-orange-500/40 text-orange-400 text-[10px] font-black px-2 py-0.5 rounded-full">
                          EN SEGUIMIENTO
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-400 flex items-center gap-2 mt-0.5 font-mono">
                      <span>Vel: <strong className="text-white">{currentSpeed} km/h</strong></span>
                      <span>•</span>
                      <span>{routePoints.length} Puntos</span>
                      {activeRouteInfo?.start_time && (
                        <>
                          <span>•</span>
                          <span>Inicio: {formatChileTime(activeRouteInfo.start_time)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* BOTONES DIRECTOS: COMENZAR Y GUARDAR RUTA */}
                <div className="flex items-center gap-2 pt-2 sm:pt-0 sm:ml-auto border-t sm:border-t-0 border-zinc-800">
                  {!activeRouteInfo ? (
                    <button
                      type="button"
                      onClick={handleStartRoute}
                      disabled={actionLoading}
                      className="flex-1 sm:flex-none py-2 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 transition-all active:scale-95 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-black" />
                      <span>{actionLoading ? 'Iniciando...' : 'Comenzar Ruta'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleFinishRoute}
                      disabled={actionLoading}
                      className="flex-1 sm:flex-none py-2 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-red-600/30 transition-all active:scale-95 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{actionLoading ? 'Guardando...' : 'Guardar Ruta'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleSelectWorker(null)}
                    className="py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition-all cursor-pointer"
                  >
                    Ver Todos
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-black/85 backdrop-blur-md border border-zinc-800 text-white px-3.5 py-2.5 rounded-2xl shadow-xl flex items-center gap-3 pointer-events-auto">
                <Users className="w-4 h-4 text-orange-400" />
                <div className="text-xs">
                  <span className="font-bold text-orange-400">Flota en Terreno:</span>
                  <span className="text-zinc-300 ml-1.5">{activeLiveMarkers.length} transmitiendo en vivo</span>
                </div>
              </div>
            )}
          </div>

          <MapContainer
            center={targetCenter}
            zoom={targetZoom}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%' }}
          >
            <MapController
              targetCenter={targetCenter}
              targetZoom={targetZoom}
              targetBounds={targetBounds}
              moveTrigger={moveTrigger}
            />

            {mapLayer === 'satellite' ? (
              <TileLayer
                attribution='Tiles &copy; Esri World Imagery'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
              />
            ) : (
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
              />
            )}

            {myLocation && (
              <Marker position={myLocation} icon={createMyLocationIcon()}>
                <Popup>
                  <div className="text-xs text-zinc-900 font-sans p-1">
                    <strong className="text-sm font-black text-blue-600 block">📍 Mi Ubicación Satelital</strong>
                    <div className="text-[10px] text-zinc-600 font-mono mt-0.5">Precisión: ±{myLocationAccuracy} metros</div>
                  </div>
                </Popup>
              </Marker>
            )}

            {!selectedSavedRoute && activeLiveMarkers.map((g, idx) => (
              g.latitude && g.longitude && (
                <Marker
                  key={g.user_id}
                  position={[g.latitude, g.longitude]}
                  icon={createTruckIcon(getWorkerColor(g.user_id, idx), g.user_name, g.photo_url)}
                >
                  <Popup>
                    <div className="text-xs text-zinc-900 font-sans p-1 min-w-[150px]">
                      <strong className="text-sm font-black text-zinc-900 block">{g.user_name}</strong>
                      <div className="text-[11px] text-zinc-700">🚚 En Terreno</div>
                      <div className="text-[10px] text-zinc-600 font-mono mt-0.5">
                        Velocidad: <strong>{g.speed ? Math.round(g.speed * 3.6) : 0} km/h</strong>
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono mt-0.5">Hora: {formatChileTime(g.timestamp || g.time)}</div>
                      <button
                        onClick={() => {
                          const u = allUsers.find(x => x.id === g.user_id);
                          if (u) handleSelectWorker(u);
                        }}
                        className="mt-2 w-full bg-orange-500 hover:bg-orange-600 text-black font-black text-[10px] py-1 px-2 rounded-lg cursor-pointer"
                      >
                        📍 Localizar Trabajador
                      </button>
                    </div>
                  </Popup>
                </Marker>
              )
            ))}

            {(selectedUser || selectedSavedRoute) && displayCoordinates.length > 1 && (
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

            {(selectedUser || selectedSavedRoute) && routePoints.length > 0 && (
              <>
                <Marker
                  position={[routePoints[0].latitude, routePoints[0].longitude]}
                  icon={createPointIcon('#22c55e', 'A')}
                >
                  <Popup>
                    <div className="text-xs font-bold text-zinc-900">
                      🟢 Punto de Partida
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
                      🔴 Punto Actual
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
      </div>

      {/* ========================================================================= */}
      {/* 3. MODAL DE HISTORIAL DE RUTAS GUARDADAS */}
      {/* ========================================================================= */}
      {showHistoryModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowHistoryModal(false)}
        >
          <div 
            className={'max-w-3xl w-full max-h-[85vh] overflow-y-auto rounded-3xl border p-6 shadow-2xl space-y-4 ' + (isDark ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-orange-200 text-zinc-900')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-orange-500 text-black flex items-center justify-center font-black">
                  <Route className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight">Historial de Rutas Guardadas</h3>
                  <p className="text-xs text-orange-500 font-semibold">Recorridos archivados en terreno</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className={'rounded-xl px-3 py-1.5 text-xs font-bold border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                />
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(false)}
                  className="p-1.5 text-zinc-400 hover:text-white rounded-xl bg-zinc-900 border border-zinc-800 cursor-pointer font-bold text-xs px-2.5"
                >
                  Cerrar
                </button>
              </div>
            </div>

            {loadingSavedRoutes ? (
              <div className="py-12 text-center text-zinc-500 font-bold text-xs">
                Cargando historial de rutas...
              </div>
            ) : savedRoutes.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Route className="w-10 h-10 text-zinc-600 mx-auto" />
                <p className="text-sm font-bold text-zinc-400">No hay rutas archivadas en esta fecha ({selectedDate}).</p>
                <p className="text-xs text-zinc-500">
                  Al presionar "Guardar Ruta" en el mapa para un trabajador activo, su recorrido quedará guardado automáticamente aquí.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {savedRoutes.map((r) => (
                  <div
                    key={r.id}
                    className={'border rounded-2xl p-4 shadow-lg flex flex-col justify-between space-y-3 ' + (isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-orange-50/50 border-orange-200')}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider bg-orange-500 text-black px-2 py-0.5 rounded-full">
                          {r.user_name}
                        </span>
                        <span className="text-[11px] font-mono text-zinc-400">{r.date}</span>
                      </div>
                      <h4 className="text-xs font-black tracking-tight">{r.name || 'Ruta en Terreno'}</h4>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs my-2.5 bg-black/40 p-2 rounded-xl border border-zinc-800">
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

                    <div className="flex gap-2 pt-1 border-t border-zinc-800">
                      <button
                        type="button"
                        onClick={() => handleSelectSavedRoute(r)}
                        className="flex-1 py-2 px-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-black font-black text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Ver en Mapa</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSavedRoute(r.id)}
                        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
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
        </div>
      )}
    </div>
  );
}
