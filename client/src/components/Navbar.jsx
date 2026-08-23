import React, { useState, useEffect, useRef } from 'react';
import { 
  UserCheck, QrCode, MapPin, Users, FileSpreadsheet, LogOut, Sun, Moon, 
  Smartphone, Monitor, Clock, ChevronDown, Sparkles, X, Menu, Compass, ShieldCheck, Radio, Mic, Play, Square, CheckCircle
} from 'lucide-react';
import { getFullPhotoUrl, apiStartGpsRoute, apiFinishGpsRoute, apiGetActiveGpsRoute, apiSendGpsPoint } from '../api';
import IphoneModal from './IphoneModal.jsx';
import WalkieTalkieModal from './WalkieTalkieModal.jsx';

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
  const isMauricio = user && (user.name?.toLowerCase().includes('mauricio') || user.is_superadmin === 1 || user.role === 'superadmin' || user.role === 'admin');

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

  const handleToggleRoute = async () => {
    if (routeLoading) return;

    if (!activeRoute) {
      if (!('geolocation' in navigator)) {
        alert('Geolocalización no soportada');
        return;
      }
      setRouteLoading(true);
      setRouteSuccessMsg('');

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const speed = pos.coords.speed || 0;
          const accuracy = pos.coords.accuracy || 10;

          try {
            const res = await apiStartGpsRoute({
              latitude: lat,
              longitude: lng,
              name: `Ruta Terreno Mauricio - ${new Date().toLocaleDateString('es-CL')} ${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`
            });

            const initialPoint = { latitude: lat, longitude: lng, timestamp: new Date().toISOString(), speed, accuracy };
            setActiveRoute({ id: res.routeId, start_lat: lat, start_lng: lng, name: res.routeName });
            setRoutePoints([initialPoint]);
            setRouteDistance(0);
            setRouteSuccessMsg('🟢 Ruta en curso. GPS activo.');
            setTimeout(() => setRouteSuccessMsg(''), 4000);

            routeWatchRef.current = navigator.geolocation.watchPosition(
              (newPos) => {
                const nLat = newPos.coords.latitude;
                const nLng = newPos.coords.longitude;
                const nSpeed = newPos.coords.speed || 0;
                const nAcc = newPos.coords.accuracy || 10;
                const pt = { latitude: nLat, longitude: nLng, timestamp: new Date().toISOString(), speed: nSpeed, accuracy: nAcc };

                setRoutePoints(prev => {
                  const lastPt = prev[prev.length - 1];
                  if (lastPt) {
                    const dist = calculateDistance(lastPt.latitude, lastPt.longitude, nLat, nLng);
                    if (dist > 0.005) {
                      setRouteDistance(d => Number((d + dist).toFixed(2)));
                      apiSendGpsPoint({ latitude: nLat, longitude: nLng, accuracy: nAcc, speed: nSpeed }).catch(() => {});
                      return [...prev, pt];
                    }
                  }
                  return prev;
                });
              },
              () => {},
              { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
            );

          } catch (err) {
            alert('Error al iniciar ruta: ' + err.message);
          } finally {
            setRouteLoading(false);
          }
        },
        (err) => {
          alert('Active el GPS y permita la ubicación.');
          setRouteLoading(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setRouteLoading(true);

      if (routeWatchRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(routeWatchRef.current);
        routeWatchRef.current = null;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const finalPts = [...routePoints, { latitude: lat, longitude: lng, timestamp: new Date().toISOString() }];

          try {
            await apiFinishGpsRoute({
              routeId: activeRoute?.id,
              latitude: lat,
              longitude: lng,
              totalDistanceKm: routeDistance,
              points: finalPts
            });

            setActiveRoute(null);
            setRoutePoints([]);
            setRouteDistance(0);
            setRouteSuccessMsg('✅ ¡Ruta guardada exitosamente!');
            setTimeout(() => setRouteSuccessMsg(''), 5000);
          } catch (err) {
            alert('Error al guardar ruta: ' + err.message);
          } finally {
            setRouteLoading(false);
          }
        },
        async () => {
          try {
            await apiFinishGpsRoute({
              routeId: activeRoute?.id,
              totalDistanceKm: routeDistance,
              points: routePoints
            });
            setActiveRoute(null);
            setRoutePoints([]);
            setRouteDistance(0);
            setRouteSuccessMsg('✅ ¡Ruta guardada exitosamente!');
            setTimeout(() => setRouteSuccessMsg(''), 5000);
          } catch (err) {
            alert('Error al guardar ruta: ' + err.message);
          } finally {
            setRouteLoading(false);
          }
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
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
                title="Audio en Tiempo Real"
                className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-black text-[11px] font-black px-2 py-1 rounded-lg shadow-sm flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
              >
                <Radio className="w-3 h-3 animate-pulse" />
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

              {/* Opción 3: Link para iPhone */}
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

              {/* Opción 4: Cerrar Sesión */}
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

      <WalkieTalkieModal
        isOpen={showWalkieTalkie}
        onClose={() => setShowWalkieTalkie(false)}
        currentUser={user}
        theme={theme}
      />

      <IphoneModal
        isOpen={showIphoneModal}
        onClose={() => setShowIphoneModal(false)}
        theme={theme}
      />
    </>
  );
}
