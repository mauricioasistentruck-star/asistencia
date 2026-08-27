import React, { useState, useEffect, useRef } from 'react';
import { 
  UserCheck, QrCode, MapPin, Users, FileSpreadsheet, LogOut, Sun, Moon, 
  Smartphone, Monitor, Clock, ChevronDown, Sparkles, X, Menu, Compass, ShieldCheck, Radio, Mic, Play, Square, CheckCircle, Key
} from 'lucide-react';
import { getFullPhotoUrl, apiStartGpsRoute, apiFinishGpsRoute, apiGetActiveGpsRoute, apiSendGpsPoint, apiChangeMyPassword, mergeRoutesToVault, getChileTodayString, formatChileTime, unlockIOSAudio, isGpsScheduleAllowed } from '../api';
import { Geolocation } from '@capacitor/geolocation';
import IphoneModal from './IphoneModal.jsx';
import WalkieTalkieModal from './WalkieTalkieModal.jsx';
import BackupModal from './BackupModal.jsx';

function calculateDistance(lat1, lon1, lat2, lon2) {
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

export default function Navbar({ user, activeTab, setActiveTab, onLogout, onEnterKiosk, theme, toggleTheme, onOpenHistory }) {
  const [showIphoneModal, setShowIphoneModal] = useState(false);
  const [showWorkerMenu, setShowWorkerMenu] = useState(false);
  const [showNavDrawer, setShowNavDrawer] = useState(false);
  const [showWalkieTalkie, setShowWalkieTalkie] = useState(false);
  const [walkieTab, setWalkieTab] = useState('walkie');
  const [showBackupModal, setShowBackupModal] = useState(false);

  // Estados Cambio de Contraseña
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changePassError, setChangePassError] = useState('');
  const [changePassSuccess, setChangePassSuccess] = useState('');
  const [changePassLoading, setChangePassLoading] = useState(false);

  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    setChangePassError('');
    setChangePassSuccess('');

    if (!newPassword || newPassword.trim() === '') {
      setChangePassError('Ingrese una contraseña válida');
      return;
    }
    if (newPassword !== confirmPassword) {
      setChangePassError('Las contraseñas no coinciden');
      return;
    }

    setChangePassLoading(true);
    try {
      await apiChangeMyPassword(newPassword);
      setChangePassSuccess('¡Contraseña actualizada con éxito!');
      setTimeout(() => {
        setShowChangePasswordModal(false);
        setNewPassword('');
        setConfirmPassword('');
        setChangePassSuccess('');
      }, 1500);
    } catch (err) {
      setChangePassError(err.message || 'Error al cambiar contraseña');
    } finally {
      setChangePassLoading(false);
    }
  };

  // Estados de Ruta GPS (Mauricio / Admin)
  const [activeRoute, setActiveRoute] = useState(null);
  const [routeTimer, setRouteTimer] = useState(0);
  const [routePoints, setRoutePoints] = useState([]);
  const [routeDistance, setRouteDistance] = useState(0);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeSuccessMsg, setRouteSuccessMsg] = useState('');

  const routeWatchRef = useRef(null);
  const routeTimerRef = useRef(null);

  const isAdmin = user && (user.role === 'admin' || user.role === 'superadmin');
  const isDark = theme === 'dark';
  const isMauricio = user && (
    (user.name && user.name.toLowerCase().includes('mauricio')) || 
    (user.username && user.username.toLowerCase().includes('mauricio')) || 
    user.is_superadmin === 1 || 
    user.role === 'superadmin' || 
    user.role === 'admin'
  );

  // Escucha global de botón de audífonos para abrir Walkie-Talkie automáticamente
  useEffect(() => {
    const handleGlobalHeadset = () => {
      setShowWalkieTalkie(true);
    };
    window.addEventListener('headset_button_event', handleGlobalHeadset);
    return () => {
      window.removeEventListener('headset_button_event', handleGlobalHeadset);
    };
  }, []);

  // Comprobar ruta activa en segundo plano
  useEffect(() => {
    if (isMauricio) {
      apiGetActiveGpsRoute().then((active) => {
        if (active) {
          setActiveRoute(active);
          try {
            const pts = JSON.parse(active.points_json || '[]');
            setRoutePoints(pts);
          } catch (e) {
            setRoutePoints([]);
          }
        }
      }).catch(() => {});
    }
  }, [isMauricio]);

  // Temporizador de ruta
  useEffect(() => {
    if (activeRoute) {
      routeTimerRef.current = setInterval(() => {
        setRouteTimer(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(routeTimerRef.current);
      setRouteTimer(0);
    }
    return () => clearInterval(routeTimerRef.current);
  }, [activeRoute]);

  const formatSeconds = (sec) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

    // Restaurar ruta activa desde localStorage o Servidor al iniciar
  useEffect(() => {
    try {
      const savedActive = localStorage.getItem('asistencia_active_route');
      if (savedActive) {
        const parsed = JSON.parse(savedActive);
        if (parsed && parsed.id) {
          setActiveRoute({ id: parsed.id, start_lat: parsed.start_lat, start_lng: parsed.start_lng, name: parsed.name });
          setRoutePoints(Array.isArray(parsed.points) ? parsed.points : []);
          setRouteDistance(parsed.distance || 0);
        }
      }
    } catch(e) {}

    apiGetActiveGpsRoute().then(serverRoute => {
      if (serverRoute && serverRoute.id) {
        let pts = [];
        try { pts = JSON.parse(serverRoute.points_json || '[]'); } catch(e) { pts = []; }
        setActiveRoute({ id: serverRoute.id, start_lat: serverRoute.start_lat, start_lng: serverRoute.start_lng, name: serverRoute.name });
        setRoutePoints(pts);
        setRouteDistance(serverRoute.total_distance_km || 0);
        localStorage.setItem('asistencia_active_route', JSON.stringify({
          id: serverRoute.id,
          name: serverRoute.name,
          start_lat: serverRoute.start_lat,
          start_lng: serverRoute.start_lng,
          distance: serverRoute.total_distance_km || 0,
          points: pts
        }));
      }
    }).catch(() => {});
  }, [user]);

  const getCurrentCoords = async () => {
    try {
      await Geolocation.requestPermissions().catch(() => {});
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
      if (pos && pos.coords) {
        return {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 10),
          speed: pos.coords.speed || 0
        };
      }
    } catch (e) {}

    if ('geolocation' in navigator) {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            accuracy: Math.round(p.coords.accuracy || 10),
            speed: p.coords.speed || 0
          }),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
        );
      });
    }
    throw new Error('Geolocalizacin no disponible en este dispositivo');
  };

  const handleToggleRoute = async () => {
    if (routeLoading) return;
    unlockIOSAudio();

    if (!activeRoute) {
      const gpsCheck = isGpsScheduleAllowed(user);
      if (!gpsCheck.allowed) {
        alert(gpsCheck.reason);
        return;
      }
      setRouteLoading(true);
      setRouteSuccessMsg('');

      try {
        const coords = await getCurrentCoords();
        const lat = coords.latitude;
        const lng = coords.longitude;
        const routeName = `Ruta ${user?.name || 'Personal'} - ${getChileTodayString()} ${formatChileTime()}`;

        const res = await apiStartGpsRoute({
          latitude: lat,
          longitude: lng,
          name: routeName
        });

        const initialPoint = { latitude: lat, longitude: lng, timestamp: new Date().toISOString(), time: formatChileTime(), speed: coords.speed, accuracy: coords.accuracy };
        const newActive = { id: res.routeId, start_lat: lat, start_lng: lng, name: res.routeName || routeName };
        setActiveRoute(newActive);
        setRoutePoints([initialPoint]);
        setRouteDistance(0);
        setRouteSuccessMsg('Ruta en curso. GPS activo grabando recorrido.');
        setTimeout(() => setRouteSuccessMsg(''), 4500);

        localStorage.setItem('asistencia_active_route', JSON.stringify({
          ...newActive,
          distance: 0,
          points: [initialPoint]
        }));

        // Iniciar rastreo continuo nativo y web
        try {
          routeWatchRef.current = await Geolocation.watchPosition(
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 },
            (newPos, err) => {
              if (newPos && newPos.coords) {
                const nLat = newPos.coords.latitude;
                const nLng = newPos.coords.longitude;
                const nSpeed = newPos.coords.speed || 0;
                const nAcc = Math.round(newPos.coords.accuracy || 10);
                if (nAcc > 45) return; // Filtrar ruido

                const pt = { latitude: nLat, longitude: nLng, timestamp: new Date().toISOString(), time: formatChileTime(), speed: nSpeed, accuracy: nAcc };

                setRoutePoints(prev => {
                  const lastPt = prev[prev.length - 1];
                  if (lastPt) {
                    const dist = calculateDistance(lastPt.latitude, lastPt.longitude, nLat, nLng);
                    if (dist >= 0.006) {
                      const updatedDist = Number((routeDistance + dist).toFixed(2));
                      setRouteDistance(updatedDist);
                      const updatedPts = [...prev, pt];
                      localStorage.setItem('asistencia_active_route', JSON.stringify({
                        id: res.routeId,
                        name: res.routeName || routeName,
                        start_lat: lat,
                        start_lng: lng,
                        distance: updatedDist,
                        points: updatedPts
                      }));
                      apiSendGpsPoint({ latitude: nLat, longitude: nLng, accuracy: nAcc, speed: nSpeed }).catch(() => {});
                      return updatedPts;
                    }
                  }
                  return prev;
                });
              }
            }
          );
        } catch(wErr) {
          if ('geolocation' in navigator) {
            routeWatchRef.current = navigator.geolocation.watchPosition(
              (newPos) => {
                const nLat = newPos.coords.latitude;
                const nLng = newPos.coords.longitude;
                const nSpeed = newPos.coords.speed || 0;
                const nAcc = Math.round(newPos.coords.accuracy || 10);
                if (nAcc > 45) return;
                const pt = { latitude: nLat, longitude: nLng, timestamp: new Date().toISOString(), time: formatChileTime(), speed: nSpeed, accuracy: nAcc };

                setRoutePoints(prev => {
                  const lastPt = prev[prev.length - 1];
                  if (lastPt) {
                    const dist = calculateDistance(lastPt.latitude, lastPt.longitude, nLat, nLng);
                    if (dist >= 0.006) {
                      const updatedDist = Number((routeDistance + dist).toFixed(2));
                      setRouteDistance(updatedDist);
                      const updatedPts = [...prev, pt];
                      localStorage.setItem('asistencia_active_route', JSON.stringify({
                        id: res.routeId,
                        name: res.routeName || routeName,
                        start_lat: lat,
                        start_lng: lng,
                        distance: updatedDist,
                        points: updatedPts
                      }));
                      apiSendGpsPoint({ latitude: nLat, longitude: nLng, accuracy: nAcc, speed: nSpeed }).catch(() => {});
                      return updatedPts;
                    }
                  }
                  return prev;
                });
              },
              () => {},
              { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
            );
          }
        }
      } catch (err) {
        alert('Active el GPS y conceda permisos de ubicacin para iniciar ruta: ' + err.message);
      } finally {
        setRouteLoading(false);
      }
    } else {
      setRouteLoading(true);

      if (routeWatchRef.current !== null) {
        try {
          if (typeof routeWatchRef.current === 'string') {
            Geolocation.clearWatch({ id: routeWatchRef.current }).catch(() => {});
          } else if ('geolocation' in navigator) {
            navigator.geolocation.clearWatch(routeWatchRef.current);
          }
        } catch(e) {}
        routeWatchRef.current = null;
      }

      let endCoords = null;
      try {
        endCoords = await getCurrentCoords();
      } catch(e) {}

      const lat = endCoords?.latitude || null;
      const lng = endCoords?.longitude || null;
      const finalPts = lat && lng 
        ? [...routePoints, { latitude: lat, longitude: lng, timestamp: new Date().toISOString(), time: formatChileTime(), speed: endCoords?.speed || 0, accuracy: endCoords?.accuracy || 10 }]
        : routePoints;

      try {
        const finishRes = await apiFinishGpsRoute({
          routeId: activeRoute?.id,
          latitude: lat,
          longitude: lng,
          totalDistanceKm: routeDistance,
          points: finalPts
        });

        mergeRoutesToVault([{
          id: activeRoute?.id,
          user_id: user?.id,
          user_name: user?.name,
          name: activeRoute?.name,
          date: getChileTodayString(),
          start_lat: activeRoute?.start_lat,
          start_lng: activeRoute?.start_lng,
          end_lat: lat,
          end_lng: lng,
          total_distance_km: finishRes?.totalDistanceKm || routeDistance,
          total_points: finalPts.length,
          points_json: JSON.stringify(finalPts),
          status: 'completed'
        }]);

        localStorage.removeItem('asistencia_active_route');
        setActiveRoute(null);
        setRoutePoints([]);
        setRouteDistance(0);
        setRouteSuccessMsg('Ruta guardada exitosamente en el registro central!');
        setTimeout(() => setRouteSuccessMsg(''), 5000);
      } catch (err) {
        alert('Error al guardar ruta: ' + err.message);
      } finally {
        setRouteLoading(false);
      }
    }
  };

  const navItems = [
    { id: 'credential', label: 'Mi Credencial', desc: 'Código QR personal para marcar asistencia', icon: QrCode, color: 'text-orange-500', bg: 'bg-orange-500/15' },
    { id: 'admin_attendance', label: 'Registros & Excel', desc: 'Historial de entradas, salidas y descarga Excel', icon: FileSpreadsheet, color: 'text-blue-400', bg: 'bg-blue-500/15' },
    { id: 'admin_users', label: 'Gestión de Personal', desc: 'Crear trabajadores, usuarios de login y fotos', icon: Users, color: 'text-amber-400', bg: 'bg-amber-500/15' },
    { id: 'admin_gps', label: 'Rastreo GPS & Rutas', desc: 'Monitoreo en vivo y registro de rutas en terreno', icon: MapPin, color: 'text-orange-400', bg: 'bg-orange-500/15' },
  ];

  const currentNav = navItems.find(n => n.id === activeTab) || navItems[0];

  const handleSelectNav = (tabId) => {
    setActiveTab(tabId);
    setShowNavDrawer(false);
  };

  return (
    <>
      <header className={'sticky top-0 z-40 border-b backdrop-blur-md safe-notch-header transition-colors duration-300 ' + (isDark ? 'bg-black/95 border-zinc-800 text-white' : 'bg-white/95 border-orange-200 text-zinc-900 shadow-sm')}>
        <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-10 sm:h-11">
            
            {/* LOGO DE LA APLICACIÓN ULTRA-MINIMALISTA */}
            <button
              onClick={() => {
                if (isAdmin) {
                  setShowNavDrawer(true);
                } else {
                  setActiveTab('credential');
                }
              }}
              title={isAdmin ? "Abrir Menú de Navegación" : "Mi Credencial"}
              className={'flex items-center space-x-1.5 p-0.5 rounded-lg transition-all active:scale-95 group border ' + (isDark ? 'hover:bg-zinc-900 border-transparent hover:border-orange-500/30' : 'hover:bg-orange-50/70 border-transparent hover:border-orange-200')}
            >
              <div className="w-7 h-7 rounded-full overflow-hidden border border-orange-500 shadow-sm flex items-center justify-center bg-black flex-shrink-0 group-hover:scale-105 transition-transform">
                <img src="/logo.png" alt="AsistenTruck" className="w-full h-full object-contain p-0.5" />
              </div>
              <div className="text-left flex items-center gap-1">
                <span className={'font-black text-xs tracking-tight ' + (isDark ? 'text-white' : 'text-zinc-900')}>
                  REGISTRO <span className="text-orange-500">ASISTENTRUCK</span>
                </span>
                {isAdmin && (
                  <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded p-0.5 text-[8px] group-hover:bg-orange-500 group-hover:text-black transition-colors">
                    <Menu className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>
            </button>

            {/* SECCIÓN ACTIVA VISIBLE (COMPACTA) */}
            {isAdmin && (
              <div className="hidden sm:flex items-center gap-2">
                <div className={'px-2 py-0.5 rounded-lg border text-[11px] font-bold flex items-center gap-1 shadow-sm ' + (isDark ? 'bg-zinc-900/90 border-zinc-800 text-orange-400' : 'bg-orange-50/80 border-orange-200 text-orange-600')}>
                  <currentNav.icon className="w-3 h-3 text-orange-500" />
                  <span>{currentNav.label}</span>
                </div>
              </div>
            )}

            {/* ACCIONES SUPERIORES MINIMALISTAS */}
            <div className="flex items-center space-x-1 sm:space-x-1.5">
              
              {/* BOTÓN RÁPIDO WALKIE-TALKIE */}
              <button
                onClick={() => setShowWalkieTalkie(true)}
                title="Walkie-Talkie & Voz"
                className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-black text-[11px] font-black px-2.5 py-1 rounded-lg shadow-sm flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
              >
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>Audio</span>
              </button>

              {/* BOTÓN TRABAJADOR / PERFIL */}
              <button
                onClick={() => setShowWorkerMenu(!showWorkerMenu)}
                className={'flex items-center space-x-1 px-1.5 py-0.5 rounded-lg border transition-all active:scale-95 shadow-sm cursor-pointer ' + (isDark ? 'bg-zinc-900 border-zinc-800 hover:border-orange-500/50' : 'bg-orange-50 border-orange-200 hover:border-orange-400')}
              >
                <div className="w-5 h-5 rounded-full overflow-hidden bg-orange-500 flex items-center justify-center text-[9px] font-black text-black flex-shrink-0">
                  {user?.photo_url ? (
                    <img src={getFullPhotoUrl(user.photo_url)} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <span>{user?.name?.charAt(0) || 'U'}</span>
                  )}
                </div>
                <div className="text-left hidden xs:block">
                  <div className={'text-[10px] font-black leading-tight truncate max-w-[70px] sm:max-w-[100px] ' + (isDark ? 'text-white' : 'text-zinc-900')}>
                    {user?.name?.split(' ')[0]}
                  </div>
                </div>
                <ChevronDown className="w-2.5 h-2.5 text-orange-500 flex-shrink-0" />
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* MODAL / DRAWER LATERAL DE NAVEGACIÓN (ABIERTO AL TOCAR EL LOGO) */}
      {showNavDrawer && isAdmin && (
        <div 
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-[99999] flex items-start justify-start overflow-hidden"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px) + 8px, 14px)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 8px, 14px)',
            paddingLeft: 'max(env(safe-area-inset-left, 0px) + 8px, 14px)',
            paddingRight: 'max(env(safe-area-inset-right, 0px) + 8px, 14px)'
          }}
          onClick={() => setShowNavDrawer(false)}
        >
          <div
            className={'w-full max-w-sm rounded-3xl p-4 sm:p-5 shadow-2xl border transition-all flex flex-col max-h-[92vh] overflow-hidden ' + (isDark ? 'bg-zinc-950 border-orange-500/30 text-white' : 'bg-white border-orange-200 text-zinc-900')}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Menú de Navegación */}
            <div className="flex items-center justify-between pb-3 border-b border-orange-500/20 mb-3 flex-shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-orange-500 bg-black flex items-center justify-center shadow-md shadow-orange-500/30">
                  <img src="/logo.png" alt="AsistenTruck" className="w-full h-full object-contain p-0.5" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black tracking-tight">Menú Principal</h3>
                  <p className="text-[9px] text-orange-500 font-bold uppercase tracking-wider">Panel de Control</p>
                </div>
              </div>
              <button
                onClick={() => setShowNavDrawer(false)}
                className="p-1.5 rounded-xl hover:bg-orange-500/10 text-zinc-400 hover:text-orange-500 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Lista de Secciones con Scroll Interno Seguro */}
            <div className="space-y-1.5 overflow-y-auto flex-1 pr-1 custom-scrollbar mb-2">
              {navItems.map((item) => {
                const isSelected = activeTab === item.id;
                const IconComponent = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelectNav(item.id)}
                    className={'w-full p-2.5 rounded-2xl flex items-center space-x-2.5 text-left transition-all border cursor-pointer ' + (
                      isSelected 
                        ? 'bg-orange-500 text-black border-orange-500 font-black shadow-md shadow-orange-500/30' 
                        : (isDark ? 'bg-zinc-900/80 hover:bg-zinc-800 border-zinc-800 text-zinc-300' : 'bg-orange-50/80 hover:bg-orange-100 border-orange-200 text-zinc-900')
                    )}
                  >
                    <div className={'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ' + (isSelected ? 'bg-black text-orange-400' : item.bg + ' ' + item.color)}>
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={'text-xs truncate ' + (isSelected ? 'font-black text-black' : (isDark ? 'font-bold text-white' : 'font-black text-black'))}>
                        {item.label}
                      </div>
                      <div className={'text-[9px] leading-tight truncate ' + (isSelected ? 'text-black/80 font-bold' : (isDark ? 'text-zinc-400' : 'text-zinc-800 font-bold'))}>
                        {item.desc}
                      </div>
                    </div>
                  </button>
                );
              })}

              {/* Modo Kiosco dentro del menú */}
              <button
                onClick={() => {
                  setShowNavDrawer(false);
                  onEnterKiosk();
                }}
                className={'w-full p-2.5 rounded-2xl flex items-center space-x-2.5 text-left transition-all border cursor-pointer ' + (isDark ? 'bg-zinc-900/50 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-orange-400' : 'bg-zinc-100 hover:bg-orange-50 border-zinc-300 text-zinc-800 hover:text-orange-600')}
              >
                <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center flex-shrink-0">
                  <Monitor className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={'text-xs truncate ' + (isDark ? 'font-bold text-zinc-300' : 'font-black text-black')}>Modo Kiosco QR</div>
                  <div className={'text-[9px] leading-tight truncate ' + (isDark ? 'text-zinc-500' : 'text-zinc-700 font-bold')}>Pantalla fija para escaneo</div>
                </div>
              </button>
            </div>

            <div className="pt-2 border-t border-zinc-800/80 text-center flex-shrink-0">
              <span className={'text-[9px] font-mono ' + (isDark ? 'text-zinc-500' : 'text-zinc-800 font-bold')}>REGISTRO ASISTENTRUCK</span>
            </div>

          </div>
        </div>
      )}

      {/* MENÚ FLOTANTE DEL TRABAJADOR / OPCIONES */}
      {showWorkerMenu && (
        <div 
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[99999] flex items-start justify-end overflow-hidden"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px) + 8px, 14px)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 8px, 14px)',
            paddingLeft: 'max(env(safe-area-inset-left, 0px) + 8px, 14px)',
            paddingRight: 'max(env(safe-area-inset-right, 0px) + 8px, 14px)'
          }}
          onClick={() => setShowWorkerMenu(false)}
        >
          <div
            className={'w-full max-w-xs rounded-3xl p-4 shadow-2xl border transition-all flex flex-col max-h-[92vh] overflow-hidden ' + (isDark ? 'bg-zinc-950 border-orange-500/30 text-white' : 'bg-white border-orange-300 text-zinc-900')}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Menú */}
            <div className="flex items-center justify-between pb-3 border-b border-orange-500/20 mb-3 flex-shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-orange-500 flex items-center justify-center text-xs font-black text-black">
                  {user?.photo_url ? (
                    <img src={getFullPhotoUrl(user.photo_url)} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <span>{user?.name?.charAt(0) || 'U'}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className={'text-xs font-black leading-tight truncate ' + (isDark ? 'text-white' : 'text-black')}>{user?.name}</h4>
                  <span className="text-[9px] text-orange-500 font-extrabold uppercase">
                    {user?.username || user?.rut || 'Personal'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowWorkerMenu(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-orange-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Opciones de Acción */}
            <div className="space-y-1.5 overflow-y-auto flex-1 pr-1 custom-scrollbar">

              {/* Opción Especial Mauricio/Admin: Ruta GPS en Terreno */}
              {isMauricio && (
                <div className="p-2.5 rounded-2xl border border-orange-500/40 bg-orange-500/10 space-y-2 mb-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-orange-500 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      Ruta GPS Terreno
                    </span>
                    {activeRoute && (
                      <span className="text-[9px] font-mono font-black text-red-400 bg-red-500/20 px-2 py-0.5 rounded-full border border-red-500/30 animate-pulse">
                        {formatSeconds(routeTimer)} | {routeDistance} km
                      </span>
                    )}
                  </div>

                  {routeSuccessMsg && (
                    <div className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/15 p-1.5 rounded-xl border border-emerald-500/30">
                      <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{routeSuccessMsg}</span>
                    </div>
                  )}

                  <button
                    onClick={handleToggleRoute}
                    disabled={routeLoading}
                    className={'w-full py-2.5 px-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 cursor-pointer ' + (
                      activeRoute 
                        ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse shadow-red-600/30 border border-red-400' 
                        : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 text-black shadow-orange-500/20'
                    )}
                  >
                    {activeRoute ? (
                      <>
                        <Square className="w-3.5 h-3.5 fill-white" />
                        <span>{routeLoading ? 'Guardando...' : `Terminar Ruta (${formatSeconds(routeTimer)})`}</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-black" />
                        <span>{routeLoading ? 'Iniciando GPS...' : 'Iniciar Ruta en Terreno'}</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Opción 1: Revisar Marcaciones */}
              <button
                onClick={() => {
                  setShowWorkerMenu(false);
                  if (onOpenHistory) onOpenHistory();
                }}
                className={'w-full p-2.5 rounded-2xl flex items-center space-x-2.5 text-left transition-all border cursor-pointer ' + (isDark ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 hover:border-orange-500/30' : 'bg-orange-50/80 hover:bg-orange-100 border-orange-200 text-zinc-900')}
              >
                <div className="w-7 h-7 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-500 flex-shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className={'text-xs ' + (isDark ? 'font-bold text-white' : 'font-black text-black')}>Revisar Marcaciones</div>
                  <div className={'text-[9px] ' + (isDark ? 'text-zinc-400' : 'text-zinc-800 font-bold')}>Historial de asistencia</div>
                </div>
              </button>

              {/* Opción 2: Cambio de Tema */}
              <button
                onClick={() => {
                  toggleTheme();
                }}
                className={'w-full p-2.5 rounded-2xl flex items-center justify-between text-left transition-all border cursor-pointer ' + (isDark ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 hover:border-orange-500/30' : 'bg-orange-50/80 hover:bg-orange-100 border-orange-200 text-zinc-900')}
              >
                <div className="flex items-center space-x-2.5">
                  <div className="w-7 h-7 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-500 flex-shrink-0">
                    {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                  </div>
                  <div>
                    <div className={'text-xs ' + (isDark ? 'font-bold text-white' : 'font-black text-black')}>Tema Visual</div>
                    <div className={'text-[9px] ' + (isDark ? 'text-zinc-400' : 'text-zinc-800 font-bold')}>
                      {isDark ? 'Negro' : 'Blanco'}
                    </div>
                  </div>
                </div>
                <span className="text-[9px] font-black text-orange-500 bg-orange-500/15 px-2 py-0.5 rounded-full border border-orange-500/30">
                  {isDark ? 'Oscuro' : 'Claro'}
                </span>
              </button>

              {/* Opción 3: Cambiar Mi Contraseña */}
              <button
                onClick={() => {
                  setShowWorkerMenu(false);
                  setShowChangePasswordModal(true);
                }}
                className={'w-full p-2.5 rounded-2xl flex items-center space-x-2.5 text-left transition-all border cursor-pointer ' + (isDark ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 hover:border-orange-500/30' : 'bg-orange-50/80 hover:bg-orange-100 border-orange-200 text-zinc-900')}
              >
                <div className="w-7 h-7 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-500 flex-shrink-0">
                  <Key className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className={'text-xs ' + (isDark ? 'font-bold text-white' : 'font-black text-black')}>Cambiar Contraseña</div>
                  <div className={'text-[9px] ' + (isDark ? 'text-zinc-400' : 'text-zinc-800 font-bold')}>Actualizar clave personal</div>
                </div>
              </button>

              {/* Opción 4: Link para iPhone */}
              <button
                onClick={() => {
                  setShowWorkerMenu(false);
                  setShowIphoneModal(true);
                }}
                className={'w-full p-2.5 rounded-2xl flex items-center space-x-2.5 text-left transition-all border cursor-pointer ' + (isDark ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 hover:border-orange-500/30' : 'bg-orange-50/80 hover:bg-orange-100 border-orange-200 text-zinc-900')}
              >
                <div className="w-7 h-7 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-500 flex-shrink-0">
                  <Smartphone className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className={'text-xs ' + (isDark ? 'font-bold text-white' : 'font-black text-black')}>Link para iPhone</div>
                  <div className={'text-[9px] ' + (isDark ? 'text-zinc-400' : 'text-zinc-800 font-bold')}>iOS WebApp</div>
                </div>
              </button>

              {/* Opción 5: Cerrar Sesión */}
              <button
                onClick={() => {
                  setShowWorkerMenu(false);
                  onLogout();
                }}
                className="w-full p-2.5 rounded-2xl flex items-center space-x-2.5 text-left transition-all border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer"
              >
                <div className="w-7 h-7 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400 flex-shrink-0">
                  <LogOut className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-red-400">Cerrar Sesión</div>
                  <div className="text-[9px] text-zinc-500">Salir de la cuenta</div>
                </div>
              </button>

            </div>
          </div>
        </div>
      )}

      {/* MODAL CAMBIAR CONTRASEÑA */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999999] flex items-center justify-center p-4">
          <div className={'border rounded-3xl max-w-sm w-full p-6 shadow-2xl transition-all ' + (isDark ? 'bg-zinc-950 border-orange-500/30 text-white' : 'bg-white border-orange-200 text-zinc-900')}>
            <div className="flex items-center justify-between pb-3 border-b border-orange-500/20 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-500">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Cambiar Mi Contraseña</h3>
                  <p className="text-[10px] text-zinc-400">{user?.name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowChangePasswordModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-orange-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {changePassError && (
              <div className="mb-3 bg-red-500/10 border border-red-500/30 rounded-xl p-2.5 text-red-400 text-xs font-bold">
                {changePassError}
              </div>
            )}
            {changePassSuccess && (
              <div className="mb-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-2.5 text-emerald-400 text-xs font-bold">
                {changePassSuccess}
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">
                  Nueva Contraseña:
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Escribe tu nueva clave"
                  className={'w-full rounded-xl px-3 py-2 text-xs font-mono border focus:outline-none focus:border-orange-500 ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">
                  Confirmar Contraseña:
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite tu nueva clave"
                  className={'w-full rounded-xl px-3 py-2 text-xs font-mono border focus:outline-none focus:border-orange-500 ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChangePasswordModal(false)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={changePassLoading}
                  className="flex-1 py-2 rounded-xl text-xs font-black bg-orange-500 hover:bg-orange-600 text-black shadow-lg shadow-orange-500/20 cursor-pointer"
                >
                  {changePassLoading ? 'Guardando...' : 'Guardar Clave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <WalkieTalkieModal
        isOpen={showWalkieTalkie}
        onClose={() => setShowWalkieTalkie(false)}
        currentUser={user}
        theme={theme}
        initialTab={walkieTab}
      />

      <BackupModal isOpen={showBackupModal} onClose={() => setShowBackupModal(false)} theme={theme} />

      <IphoneModal
        isOpen={showIphoneModal}
        onClose={() => setShowIphoneModal(false)}
        theme={theme}
      />
    </>
  );
}
