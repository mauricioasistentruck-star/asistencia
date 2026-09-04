import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { 
  Navigation, Calendar, RefreshCw, Users, Radio, Gauge, Clock, Layers, Crosshair, 
  MapPin, Route, Eye, Trash2, CheckCircle2, ArrowRight, ShieldCheck, Sparkles, Play, 
  Square, Save, UserCheck, Activity, ChevronRight, AlertCircle, Compass, Wifi, WifiOff
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
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <div style="position: absolute; width: 48px; height: 48px; background-color: rgba(59, 130, 246, 0.35); border-radius: 50%; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="width: 24px; height: 24px; background-color: #2563eb; border-radius: 50%; border: 3px solid #ffffff; box-shadow: 0 0 15px rgba(37,99,235,0.9); z-index: 10;"></div>
        <div style="background: #1e3a8a; color: #93c5fd; font-size: 9px; font-weight: 900; padding: 1px 6px; border-radius: 6px; margin-top: 24px; border: 1px solid #3b82f6; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.8); z-index: 11;">
          📍 Tú estás aquí
        </div>
      </div>
    `,
    iconSize: [48, 56],
    iconAnchor: [24, 24]
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

function calculateDistanceBetween(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio de la tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function MapController({ targetCenter, targetZoom, targetBounds, moveTrigger }) {
  const map = useMap();
  const lastTriggerRef = useRef(0);

  useEffect(() => {
    if (!moveTrigger || moveTrigger === lastTriggerRef.current) return;
    lastTriggerRef.current = moveTrigger;

    try {
      if (targetBounds && targetBounds.length > 1) {
        const b = L.latLngBounds(targetBounds);
        map.fitBounds(b, { padding: [60, 60], maxZoom: 16 });
      } else if (targetBounds && targetBounds.length === 1) {
        map.flyTo(targetBounds[0], 16, { animate: true, duration: 0.8 });
      } else if (targetCenter) {
        map.flyTo(targetCenter, targetZoom || 16, { animate: true, duration: 0.8 });
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
  const [targetZoom, setTargetZoom] = useState(14);
  const [targetBounds, setTargetBounds] = useState(null);
  const [moveTrigger, setMoveTrigger] = useState(0);

  const [liveGpsList, setLiveGpsList] = useState([]);
  const [mapLayer, setMapLayer] = useState('satellite');
  
  // Mi Ubicación en tiempo real
  const [myLocation, setMyLocation] = useState(null);
  const [myLocationAccuracy, setMyLocationAccuracy] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationTimestamp, setLocationTimestamp] = useState(null);
  const [geoError, setGeoError] = useState('');

  const [activeRouteInfo, setActiveRouteInfo] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [savedRoutes, setSavedRoutes] = useState([]);
  const [loadingSavedRoutes, setLoadingSavedRoutes] = useState(false);
  const [selectedSavedRoute, setSelectedSavedRoute] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const isDark = theme === 'dark';
  const workersList = allUsers.filter(u => u.role !== 'kiosk' && u.role !== 'kiosco');

  // Integración de puntos de ruta activa y ruta guardada
  const activeRoutePoints = useMemo(() => {
    let pts = [];
    if (activeRouteInfo && activeRouteInfo.points_json) {
      try {
        const parsed = JSON.parse(activeRouteInfo.points_json);
        if (Array.isArray(parsed) && parsed.length > 0) {
          pts = parsed;
        }
      } catch (e) {}
    }
    if (routePoints.length >= pts.length && routePoints.length > 0) {
      pts = routePoints;
    }
    return pts;
  }, [activeRouteInfo, routePoints]);

  useEffect(() => {
    const pts = selectedSavedRoute ? routePoints : activeRoutePoints;
    if ((selectedUser || selectedSavedRoute) && pts.length > 1) {
      setIsSnappingRoads(true);
      matchPointsToRealRoads(pts)
        .then((snapped) => {
          if (Array.isArray(snapped) && snapped.length > 0) {
            setSnappedCoordinates(snapped);
          } else {
            setSnappedCoordinates(cleanGpsPoints(pts).map(p => [p.latitude, p.longitude]));
          }
        })
        .catch(() => {
          setSnappedCoordinates(cleanGpsPoints(pts).map(p => [p.latitude, p.longitude]));
        })
        .finally(() => {
          setIsSnappingRoads(false);
        });
    } else if ((selectedUser || selectedSavedRoute) && pts.length === 1) {
      setSnappedCoordinates([[pts[0].latitude, pts[0].longitude]]);
      setIsSnappingRoads(false);
    } else {
      setSnappedCoordinates([]);
      setIsSnappingRoads(false);
    }
  }, [activeRoutePoints, routePoints, selectedUser?.id, selectedSavedRoute?.id]);

  // Geolocalización continua en tiempo real
  const locateMe = async (forceCenter = true) => {
    setIsLocating(true);
    setGeoError('');
    try {
      let lat, lng, acc;
      try {
        await Geolocation.requestPermissions().catch(() => {});
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
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
              { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
            );
          });
        }
      }

      if (lat !== undefined && lng !== undefined) {
        setMyLocation([lat, lng]);
        setMyLocationAccuracy(acc);
        setLocationTimestamp(new Date());
        if (forceCenter) {
          setTargetCenter([lat, lng]);
          setTargetZoom(17);
          setTargetBounds(null);
          setMoveTrigger(t => t + 1);
        }
        setGeoError('');
      } else {
        setGeoError('No se pudo obtener la posición GPS actual.');
      }
    } catch (err) {
      console.warn('Geolocalización error:', err.message);
      setGeoError('Active el GPS para ver su ubicación actual en vivo');
    } finally {
      setIsLocating(false);
    }
  };

  // Escuchar posición en tiempo real para mantener el punto azul siempre al día
  useEffect(() => {
    locateMe(false);

    let watchId = null;
    try {
      if ('geolocation' in navigator) {
        watchId = navigator.geolocation.watchPosition(
          (p) => {
            if (p && p.coords) {
              setMyLocation([p.coords.latitude, p.coords.longitude]);
              setMyLocationAccuracy(Math.round(p.coords.accuracy || 10));
              setLocationTimestamp(new Date());
            }
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
      }
    } catch (e) {}

    return () => {
      if (watchId !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
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

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchLiveGps(),
        fetchUsers(),
        fetchSavedRoutes(),
        locateMe(false),
        selectedUser ? fetchRoute(selectedUser.id) : Promise.resolve(),
        selectedUser ? checkActiveRoute(selectedUser.id) : Promise.resolve()
      ]);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
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
      } else if (myLocation) {
        setTargetCenter(myLocation);
        setTargetZoom(15);
        setTargetBounds(null);
        setMoveTrigger(t => t + 1);
      }
      return;
    }

    const isCurrentlyActive = isGpsActive(worker.gps_tracking_enabled);

    // Si se presiona de nuevo sobre el mismo trabajador activo: desactivar su GPS
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

    // Seleccionar y activar GPS si estaba inactivo
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
      const lat = live?.latitude || myLocation?.[0] || -33.4489;
      const lng = live?.longitude || myLocation?.[1] || -70.6693;

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

  // Socket y Polling periódico vivo (cada 10 seg) para mantener toda la información al día
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

      if (selectedUser?.id === data.userId) {
        setRoutePoints(prevPts => [
          ...prevPts,
          {
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: data.accuracy,
            speed: data.speed,
            timestamp: data.timestamp,
            date: data.date
          }
        ]);
      }
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

    // Actualización periódica viva continua
    const liveInterval = setInterval(() => {
      fetchLiveGps();
      if (selectedUser) {
        fetchRoute(selectedUser.id);
        checkActiveRoute(selectedUser.id);
      }
    }, 10000);

    return () => {
      clearInterval(liveInterval);
      socket.off('gps_position_updated', handleLiveGpsSocket);
      socket.off('user_gps_toggled', handleUserGpsToggled);
      socket.off('routes_updated', fetchSavedRoutes);
    };
  }, [selectedUser?.id]);

  useEffect(() => {
    if (selectedUser) fetchRoute(selectedUser.id);
    fetchSavedRoutes();
  }, [selectedDate]);

  const activeLiveMarkers = liveGpsList.filter(g => {
    if (!g.latitude || !g.longitude) return false;
    const found = allUsers.find(u => u.id === g.user_id);
    return !found || isGpsActive(found.gps_tracking_enabled);
  });

  const displayPoints = selectedSavedRoute ? routePoints : activeRoutePoints;
  const displayCoordinates = (selectedUser || selectedSavedRoute)
    ? ((snappedCoordinates && snappedCoordinates.length > 0)
        ? snappedCoordinates
        : cleanGpsPoints(displayPoints).map(p => [p.latitude, p.longitude]))
    : [];

  const currentLivePos = liveGpsList.find(g => g.user_id === selectedUser?.id);
  const currentSpeed = currentLivePos?.speed ? Math.round(currentLivePos.speed * 3.6) : 0;

  // Cálculo de distancia acumulada
  const calculatedDistanceKm = useMemo(() => {
    if (activeRouteInfo && activeRouteInfo.total_distance_km > 0) {
      return Number(activeRouteInfo.total_distance_km).toFixed(2);
    }
    if (displayPoints.length > 1) {
      let d = 0;
      for (let i = 1; i < displayPoints.length; i++) {
        d += calculateDistanceBetween(
          displayPoints[i-1].latitude, displayPoints[i-1].longitude,
          displayPoints[i].latitude, displayPoints[i].longitude
        );
      }
      return d.toFixed(2);
    }
    return '0.00';
  }, [activeRouteInfo, displayPoints]);

  // Indicador de frescura de señal GPS (para evitar sensación de información desfasada)
  const getSignalStatus = (pos) => {
    if (!pos || !pos.timestamp) {
      return { text: 'Sin señal hoy', color: 'bg-zinc-800 text-zinc-400 border-zinc-700', icon: WifiOff, isLive: false };
    }
    const diffSec = Math.round((Date.now() - new Date(pos.timestamp).getTime()) / 1000);
    if (diffSec < 45) {
      return { text: `En vivo (hace ${diffSec}s)`, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', icon: Wifi, isLive: true };
    } else if (diffSec < 300) {
      const mins = Math.round(diffSec / 60);
      return { text: `Señal hace ${mins} min`, color: 'bg-amber-500/20 text-amber-400 border-amber-500/40', icon: Wifi, isLive: false };
    } else {
      const timeStr = formatChileTime(pos.timestamp);
      return { text: `Última: ${timeStr}`, color: 'bg-zinc-800 text-zinc-400 border-zinc-700', icon: WifiOff, isLive: false };
    }
  };

  const signalInfo = getSignalStatus(currentLivePos);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 space-y-4">
      
      {/* ========================================================================= */}
      {/* 1. BARRA PRINCIPAL UNIFICADA Y ORDENADA (MEJORA DE BOTONES IMAGEN 1)     */}
      {/* ========================================================================= */}
      <div className="bg-zinc-950/90 border border-zinc-800/80 rounded-3xl p-4 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        
        {/* Título y Estado */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 flex-shrink-0">
            <Navigation className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
              <span>Supervisión GPS & Rutas en Terreno</span>
            </h2>
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 mt-0.5">
              <span className="flex items-center gap-1 text-emerald-400 font-black">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                {activeLiveMarkers.length} en línea
              </span>
              <span>•</span>
              <span>{workersList.length} trabajadores registrados</span>
            </div>
          </div>
        </div>

        {/* GRUPO UNIFICADO DE BOTONES (ORDENADOS, COHERENTES Y ALINEADOS) */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Botón 1: Ver Todos en Vivo */}
          <button
            type="button"
            onClick={() => handleSelectWorker(null)}
            className={'px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer border ' + (
              !selectedUser && !selectedSavedRoute
                ? 'bg-orange-500 text-black border-orange-400 shadow-lg shadow-orange-500/30'
                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800 hover:text-white'
            )}
            title="Ver todos los trabajadores activos en el mapa simultáneamente"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Ver Todos en Vivo ({activeLiveMarkers.length})</span>
          </button>

          {/* Botón 2: Mi Ubicación */}
          <button
            type="button"
            onClick={() => locateMe(true)}
            title="Localizar y centrar en mi posición actual exacta"
            className={'px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer border ' + (
              myLocation
                ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-400 shadow-lg shadow-blue-600/30'
                : 'bg-zinc-900 hover:bg-zinc-800 text-blue-400 border-zinc-800 hover:text-blue-300'
            )}
          >
            <Crosshair className={'w-3.5 h-3.5 ' + (isLocating ? 'animate-spin' : '')} />
            <span>{isLocating ? 'Localizando...' : myLocationAccuracy ? `Mi Ubicación (±${myLocationAccuracy}m)` : 'Mi Ubicación'}</span>
          </button>

          {/* Botón 3: Historial de Rutas */}
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="bg-zinc-900 hover:bg-zinc-800 text-orange-400 hover:text-orange-300 border border-orange-500/30 text-xs font-black px-3.5 py-2 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
            title="Ver rutas archivadas de días anteriores o completadas"
          >
            <Route className="w-3.5 h-3.5" />
            <span>Historial Rutas ({savedRoutes.length})</span>
          </button>

          {/* Botón 4: Satelital / Calles */}
          <button
            type="button"
            onClick={() => setMapLayer(mapLayer === 'street' ? 'satellite' : 'street')}
            className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-bold px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            title="Cambiar vista de mapa satelital o callejero"
          >
            <Layers className="w-3.5 h-3.5 text-zinc-400" />
            <span>{mapLayer === 'street' ? 'Satelital' : 'Calles'}</span>
          </button>

          {/* Botón 5: Actualizar */}
          <button
            type="button"
            onClick={handleManualRefresh}
            className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-black text-xs font-black px-3.5 py-2 rounded-xl shadow-lg shadow-orange-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
            title="Actualizar inmediatamente datos GPS y rutas"
          >
            <RefreshCw className={'w-3.5 h-3.5 ' + (isRefreshing ? 'animate-spin' : '')} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Banner de Aviso de Mi Ubicación o Error */}
      {geoError && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-amber-400 text-xs flex items-center justify-between">
          <span className="flex items-center gap-2 font-bold">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {geoError}
          </span>
          <button onClick={() => locateMe(true)} className="bg-amber-500 text-black font-black text-xs px-3 py-1 rounded-xl cursor-pointer">
            Activar GPS
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
      {/* 2. CARRUSEL DE PERSONAL EN TERRENO (LIMPIO, SIN BOTÓN HUÉRFANO)           */}
      {/* ========================================================================= */}
      <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-3xl p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-orange-500" />
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">
              Personal en Terreno ({workersList.length}) • Toque cualquier trabajador para seguir su recorrido
            </h3>
          </div>
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
                  className={'flex-shrink-0 p-3 rounded-2xl border transition-all cursor-pointer select-none min-w-[170px] max-w-[205px] flex items-center gap-3 ' + (
                    isSelected
                      ? 'bg-orange-500 text-black border-orange-400 shadow-lg shadow-orange-500/30 scale-[1.02]'
                      : isGpsOn
                        ? 'bg-zinc-900/90 border-emerald-500/50 hover:border-orange-500 text-white'
                        : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 text-zinc-400'
                  )}
                >
                  <div
                    style={{ backgroundColor: isSelected ? '#000' : uColor }}
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 text-white overflow-hidden"
                  >
                    {u.photo_url ? (
                      <img src={getFullPhotoUrl(u.photo_url)} alt="" className="w-full h-full object-fit" />
                    ) : (
                      <span>{u.name?.substring(0, 2).toUpperCase()}</span>
                    )}
                  </div>

                  <div className="overflow-hidden flex-1">
                    <div className={'font-black text-xs truncate ' + (isSelected ? 'text-black' : 'text-white')}>
                      {u.name}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[9px] font-bold">
                      {isGpsOn ? (
                        livePos?.latitude ? (
                          <span className={'font-extrabold flex items-center gap-1 ' + (isSelected ? 'text-black' : 'text-emerald-400')}>
                            <span className={'w-1.5 h-1.5 rounded-full animate-ping ' + (isSelected ? 'bg-black' : 'bg-emerald-400')}></span>
                            {speed > 0 ? `${speed} km/h` : 'En Vivo'}
                          </span>
                        ) : (
                          <span className={isSelected ? 'text-black font-extrabold' : 'text-emerald-400 font-extrabold'}>GPS Activo</span>
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
      {/* 3. MAPA Y CUADRO DE INFORMACIÓN MEJORADO (MEJORA DE IMAGEN 2)             */}
      {/* ========================================================================= */}
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-950 p-3 sm:p-4 shadow-2xl relative space-y-3">
        <div className="w-full h-[580px] rounded-2xl overflow-hidden relative shadow-inner bg-black">
          
          {/* CUADRO FLOTANTE DE INFORMACIÓN SUPERIOR (ACTUALIZADO EN TIEMPO REAL) */}
          <div className="absolute top-3 left-3 right-3 sm:right-auto z-[400] pointer-events-none max-w-2xl">
            {selectedUser ? (
              <div className="bg-black/95 backdrop-blur-md border-2 border-orange-500 text-white p-3.5 sm:p-4 rounded-2xl shadow-2xl flex flex-col sm:flex-row sm:items-center gap-3 pointer-events-auto">
                
                {/* Avatar y Datos del Trabajador */}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-orange-500 text-black flex items-center justify-center font-black text-2xl flex-shrink-0 shadow-md">
                    🚚
                  </div>
                  <div>
                    <div className="text-sm font-black text-white flex flex-wrap items-center gap-2">
                      <span>{selectedUser.name}</span>
                      {activeRouteInfo ? (
                        <span className="bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <Activity className="w-3 h-3 animate-pulse" />
                          <span>GRABANDO RUTA</span>
                        </span>
                      ) : (
                        <span className="bg-orange-500/20 border border-orange-500/40 text-orange-400 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                          EN SEGUIMIENTO
                        </span>
                      )}

                      {/* Indicador de señal en tiempo real */}
                      <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ' + signalInfo.color}>
                        {signalInfo.isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>}
                        <span>{signalInfo.text}</span>
                      </span>
                    </div>

                    {/* Fila de Métricas Reales: Velocidad, Recorrido y Puntos */}
                    <div className="text-xs text-zinc-300 flex flex-wrap items-center gap-2.5 mt-1 font-mono">
                      <span>Vel: <strong className="text-white font-bold">{currentSpeed} km/h</strong></span>
                      <span>•</span>
                      <span>Recorrido: <strong className="text-emerald-400 font-bold">{calculatedDistanceKm} km</strong></span>
                      <span>•</span>
                      <span><strong className="text-orange-400 font-bold">{displayPoints.length}</strong> Puntos</span>
                      {activeRouteInfo?.start_time && (
                        <>
                          <span>•</span>
                          <span>Inicio: <strong className="text-zinc-200">{formatChileTime(activeRouteInfo.start_time)}</strong></span>
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
              <div className="bg-black/90 backdrop-blur-md border border-zinc-800 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-3 pointer-events-auto">
                <Users className="w-4 h-4 text-orange-400" />
                <div className="text-xs">
                  <span className="font-bold text-orange-400">Flota en Terreno:</span>
                  <span className="text-zinc-300 ml-1.5">{activeLiveMarkers.length} transmitiendo en vivo</span>
                  {myLocation && (
                    <span className="text-blue-400 ml-2 font-bold">• Tu GPS Activo</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* MAPA LEAFLET */}
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

            {/* Marcador de Mi Ubicación en Tiempo Real */}
            {myLocation && (
              <Marker position={myLocation} icon={createMyLocationIcon()}>
                <Popup>
                  <div className="text-xs text-zinc-900 font-sans p-1">
                    <strong className="text-sm font-black text-blue-600 block">📍 Tu Ubicación Actual</strong>
                    <div className="text-[11px] text-zinc-700 mt-1">
                      Coordenadas: {myLocation[0].toFixed(5)}, {myLocation[1].toFixed(5)}
                    </div>
                    <div className="text-[10px] text-zinc-600 font-mono mt-0.5">
                      Precisión: ±{myLocationAccuracy || 10} metros
                    </div>
                    {locationTimestamp && (
                      <div className="text-[9px] text-zinc-500 mt-1">
                        Actualizado: {locationTimestamp.toLocaleTimeString('es-CL')}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Marcadores de Trabajadores en Vivo */}
            {!selectedSavedRoute && activeLiveMarkers.map((g, idx) => (
              g.latitude && g.longitude && (
                <Marker
                  key={g.user_id}
                  position={[g.latitude, g.longitude]}
                  icon={createTruckIcon(getWorkerColor(g.user_id, idx), g.user_name, g.photo_url)}
                >
                  <Popup>
                    <div className="text-xs text-zinc-900 font-sans p-1 min-w-[160px]">
                      <strong className="text-sm font-black text-zinc-900 block">{g.user_name}</strong>
                      <div className="text-[11px] text-zinc-700 flex items-center gap-1 mt-0.5">
                        <span>🚚 Personal en Terreno</span>
                      </div>
                      <div className="text-[10px] text-zinc-600 font-mono mt-0.5">
                        Velocidad: <strong>{g.speed ? Math.round(g.speed * 3.6) : 0} km/h</strong>
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                        Hora: {formatChileTime(g.timestamp || g.time)}
                      </div>
                      <button
                        onClick={() => {
                          const u = allUsers.find(x => x.id === g.user_id);
                          if (u) handleSelectWorker(u);
                        }}
                        className="mt-2 w-full bg-orange-500 hover:bg-orange-600 text-black font-black text-[10px] py-1.5 px-2 rounded-lg cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Navigation className="w-3 h-3" />
                        <span>Seguir Recorrido</span>
                      </button>
                    </div>
                  </Popup>
                </Marker>
              )
            ))}

            {/* Trazado de Ruta Recorrida en el Mapa */}
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

            {/* Puntos de Inicio (A) y Término/Actual (B) */}
            {(selectedUser || selectedSavedRoute) && displayPoints.length > 0 && (
              <>
                <Marker
                  position={[displayPoints[0].latitude, displayPoints[0].longitude]}
                  icon={createPointIcon('#22c55e', 'A')}
                >
                  <Popup>
                    <div className="text-xs font-bold text-zinc-900">
                      🏁 Punto de Partida
                      <div className="text-[10px] text-zinc-600 font-mono mt-0.5">
                        Hora: {formatChileTime(displayPoints[0].timestamp || displayPoints[0].time)}
                      </div>
                    </div>
                  </Popup>
                </Marker>

                {displayPoints.length > 1 && (
                  <Marker
                    position={[displayPoints[displayPoints.length - 1].latitude, displayPoints[displayPoints.length - 1].longitude]}
                    icon={createPointIcon('#ef4444', 'B')}
                  >
                    <Popup>
                      <div className="text-xs font-bold text-zinc-900">
                        📍 Posición Actual de la Ruta
                        <div className="text-[10px] text-zinc-600 font-mono mt-0.5">
                          Hora: {formatChileTime(displayPoints[displayPoints.length - 1].timestamp || displayPoints[displayPoints.length - 1].time)}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                )}
              </>
            )}
          </MapContainer>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MODAL DE HISTORIAL DE RUTAS GUARDADAS                                  */}
      {/* ========================================================================= */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-zinc-950 border border-zinc-800 text-white rounded-3xl p-6 max-w-2xl w-full max-h-[85vh] flex flex-col space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <Route className="w-5 h-5 text-orange-500" />
                <h3 className="text-base font-black">Historial de Rutas en Terreno</h3>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-3 bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800">
              <Calendar className="w-4 h-4 text-orange-400" />
              <span className="text-xs font-bold text-zinc-300">Filtrar por fecha:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-black border border-zinc-700 px-3 py-1.5 rounded-xl text-xs font-bold text-white cursor-pointer"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {loadingSavedRoutes ? (
                <div className="text-center py-8 text-xs text-zinc-500">Cargando rutas archivadas...</div>
              ) : savedRoutes.length === 0 ? (
                <div className="text-center py-8 text-xs text-zinc-500">
                  No hay rutas archivadas para el {selectedDate}.
                </div>
              ) : (
                savedRoutes.map((r) => (
                  <div
                    key={r.id}
                    className="p-3.5 rounded-2xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900 hover:border-orange-500/50 transition-all flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-black text-xs text-white flex items-center gap-2">
                        <span>{r.name || 'Ruta sin nombre'}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                          {r.total_distance_km} km
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-2 font-mono">
                        <span>{r.start_time} - {r.end_time || 'En curso'}</span>
                        <span>•</span>
                        <span>{r.total_points || 0} puntos</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectSavedRoute(r)}
                        className="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-black text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Ver Trazado</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteSavedRoute(r.id)}
                        className="p-1.5 rounded-xl bg-zinc-800 hover:bg-red-600 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                        title="Eliminar ruta"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
