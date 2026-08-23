import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar.jsx';
import LoginView from './components/LoginView.jsx';
import CredentialView from './components/CredentialView.jsx';
import AdminAttendanceView from './components/AdminAttendanceView.jsx';
import AdminUsersView from './components/AdminUsersView.jsx';
import AdminGpsView from './components/AdminGpsView.jsx';
import KioskView from './components/KioskView.jsx';
import { apiGetMe, apiSendGpsPoint, getSocket, getFullPhotoUrl } from './api';
import { Volume2, Radio, LogOut } from 'lucide-react';

function playIncomingBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1050, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch (e) {}
}

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('credential');
  const [loading, setLoading] = useState(true);
  const [kioskMode, setKioskMode] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('asistencia_theme') || 'dark');
  const [incomingAudio, setIncomingAudio] = useState(null);
  const watchIdRef = useRef(null);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('asistencia_theme', nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('bg-black');
      document.body.classList.remove('bg-slate-50', 'bg-zinc-50');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('bg-black');
      document.body.classList.add('bg-slate-50');
    }
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('bg-black');
      document.body.classList.remove('bg-slate-50', 'bg-zinc-50');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('bg-black');
      document.body.classList.add('bg-slate-50');
    }
  }, [theme]);

  useEffect(() => {
    const token = localStorage.getItem('asistencia_token');
    if (token) {
      apiGetMe()
        .then((userData) => {
          setUser(userData);
        })
        .catch(() => {
          localStorage.removeItem('asistencia_token');
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const isMauricio = user && (
    user.is_superadmin === 1 || 
    (user.name && user.name.toLowerCase().includes('mauricio')) ||
    (user.username && user.username.toLowerCase().includes('mauricio'))
  );

  // =========================================================================
  // GESTIÓN DE BOTÓN ATRÁS Y GESTOS DE CELULAR (Navegación / Salir de la App)
  // =========================================================================
  useEffect(() => {
    window.history.pushState({ page: activeTab }, '', window.location.href);

    const handleBackNavigation = () => {
      if (showExitConfirmModal) {
        setShowExitConfirmModal(false);
        return;
      }
      if (showHistoryModal) {
        setShowHistoryModal(false);
        return;
      }
      if (kioskMode) {
        // Modo kiosco no se sale por atrás
        return;
      }
      if (activeTab !== 'credential') {
        // Si está en una subvista de Admin, volver a Mi Credencial / Menú principal
        setActiveTab('credential');
        return;
      }
      // Si estamos en la pantalla principal (Credencial) y presionamos Atrás -> Preguntar si desea salir
      setShowExitConfirmModal(true);
    };

    const handlePopState = (e) => {
      window.history.pushState({ page: activeTab }, '', window.location.href);
      handleBackNavigation();
    };

    window.addEventListener('popstate', handlePopState);

    // Integración nativa con Capacitor en Android APK
    let capListener = null;
    import('@capacitor/app').then(({ App: CapApp }) => {
      CapApp.addListener('backButton', () => {
        handleBackNavigation();
      }).then((l) => { capListener = l; }).catch(() => {});
    }).catch(() => {});

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (capListener && capListener.remove) {
        capListener.remove();
      }
    };
  }, [activeTab, showHistoryModal, showExitConfirmModal, kioskMode]);

  const handleConfirmExitApp = () => {
    setShowExitConfirmModal(false);
    import('@capacitor/app').then(({ App: CapApp }) => {
      CapApp.exitApp();
    }).catch(() => {
      try {
        window.close();
      } catch (e) {}
    });
  };

  // Socket.IO para Walkie-Talkie y Audio en Vivo Ultra Rápido
  useEffect(() => {
    if (!user) return;

    const socket = getSocket();

    const joinRooms = () => {
      if (user && user.id) {
        socket.emit('join_user_room', user.id);
      }
    };

    joinRooms();
    socket.on('connect', joinRooms);
    socket.on('reconnect', joinRooms);

    // Desbloquear audio en el primer toque del usuario en la pantalla
    const unlockAudio = () => {
      try {
        const dummyAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAP8A/wD/');
        dummyAudio.volume = 0.01;
        dummyAudio.play().then(() => {
          window.__audio_unlocked__ = true;
        }).catch(() => {});
      } catch (e) {}
    };
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true });

    const handleReceiveAudio = (data) => {
      const senderId = data.sender_id || data.fromUserId;
      if (senderId === user.id) return; // ignorar propio eco

      playIncomingBeep();

      try {
        const audioSrc = data.audio_url ? getFullPhotoUrl(data.audio_url) : data.audioData;
        if (audioSrc) {
          const audio = new Audio(audioSrc);
          audio.volume = 1.0;
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              console.warn('Auto-play audio intento 1:', err.message);
              // Si falla por interacción, intentar reproducir con AudioContext
              try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                if (ctx.state === 'suspended') ctx.resume();
              } catch (e) {}
            });
          }
        }
      } catch (err) {
        console.error('Error al reproducir audio entrante:', err);
      }

      setIncomingAudio(data);
      setTimeout(() => {
        setIncomingAudio(null);
      }, 7000);
    };

    socket.on('receive_voice_audio', handleReceiveAudio);

    return () => {
      socket.off('connect', joinRooms);
      socket.off('reconnect', joinRooms);
      socket.off('receive_voice_audio', handleReceiveAudio);
    };
  }, [user]);

  // Transmisión GPS continua y silenciosa en segundo plano
  useEffect(() => {
    if (!user || (user.gps_tracking_enabled !== 1 && !isMauricio)) {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    const sendCoordsSilently = (pos) => {
      if (pos && pos.coords) {
        apiSendGpsPoint({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 10,
          speed: pos.coords.speed || 0,
          heading: pos.coords.heading || null
        }).catch(() => {});
      }
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(sendCoordsSilently, () => {}, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });

      watchIdRef.current = navigator.geolocation.watchPosition(
        sendCoordsSilently,
        () => {},
        { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 }
      );
    }

    const backupInterval = setInterval(() => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(sendCoordsSilently, () => {}, {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 0
        });
      }
    }, 12000);

    return () => {
      clearInterval(backupInterval);
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [user, isMauricio]);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    setActiveTab('credential');
  };

  const handleLogout = () => {
    localStorage.removeItem('asistencia_token');
    setUser(null);
    setActiveTab('credential');
  };

  if (loading) {
    return (
      <div className={'min-h-screen flex items-center justify-center p-4 ' + (theme === 'dark' ? 'bg-black text-white' : 'bg-slate-50 text-zinc-900')}>
        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-orange-500 shadow-2xl p-1 bg-black flex-shrink-0 animate-spin">
            <img src="/logo.png" alt="Cargando..." className="w-full h-full object-contain" />
          </div>
          <div className="text-sm font-black tracking-wider uppercase text-orange-500">
            ASISTENTRUCK • INVERSIONES BOTAM
          </div>
          <p className="text-xs text-zinc-400 font-semibold">Conectando con el servidor central...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView onLoginSuccess={handleLoginSuccess} theme={theme} />;
  }

  if (kioskMode) {
    return <KioskView onExitKiosk={() => setKioskMode(false)} theme={theme} />;
  }

  const isAdmin = user.role === 'admin' || user.role === 'superadmin' || user.is_superadmin === 1 || isMauricio;

  return (
    <div className={'min-h-screen h-screen flex flex-col overflow-hidden ' + (theme === 'dark' ? 'bg-black text-white' : 'bg-slate-50 text-zinc-900')}>
      
      {/* Banner Flotante de Audio Walkie-Talkie Entrante */}
      {incomingAudio && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[999999] max-w-sm w-full px-4 animate-in slide-in-from-top-4 duration-300">
          <div className="bg-zinc-950/95 border-2 border-orange-500 rounded-3xl p-3 shadow-2xl backdrop-blur-md flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl overflow-hidden bg-orange-500 flex items-center justify-center text-black font-black flex-shrink-0 border border-orange-400">
              {(incomingAudio.sender_photo || incomingAudio.fromUserPhoto) ? (
                <img src={getFullPhotoUrl(incomingAudio.sender_photo || incomingAudio.fromUserPhoto)} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <Radio className="w-5 h-5 animate-pulse" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-black text-orange-400 flex items-center gap-1.5 truncate">
                <span>🎙️ {incomingAudio.sender_name || incomingAudio.fromUserName}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping flex-shrink-0"></span>
              </div>
              <div className="text-[10px] text-zinc-400 truncate">
                Audio Walkie-Talkie en vivo • {incomingAudio.timestamp}
              </div>
            </div>
          </div>
        </div>
      )}

      <Navbar
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
        onEnterKiosk={() => setKioskMode(true)}
        theme={theme}
        toggleTheme={toggleTheme}
        onOpenHistory={() => setShowHistoryModal(true)}
      />

      <main className="flex-1 w-full h-full overflow-hidden flex flex-col items-center justify-center p-1.5 sm:p-2.5">
        {/* TRABAJADORES (PANTALLA LIMPIA DE CREDENCIAL AJUSTADA) */}
        {!isAdmin ? (
          <CredentialView
            user={user}
            theme={theme}
            showHistoryModal={showHistoryModal}
            setShowHistoryModal={setShowHistoryModal}
          />
        ) : (
          /* ADMINISTRADORES */
          <div className="w-full h-full overflow-y-auto">
            {activeTab === 'credential' && (
              <CredentialView
                user={user}
                theme={theme}
                showHistoryModal={showHistoryModal}
                setShowHistoryModal={setShowHistoryModal}
              />
            )}
            {activeTab === 'admin_attendance' && <AdminAttendanceView user={user} theme={theme} />}
            {activeTab === 'admin_users' && <AdminUsersView currentUser={user} theme={theme} />}
            {activeTab === 'admin_gps' && <AdminGpsView theme={theme} />}
          </div>
        )}
      </main>

      {/* MODAL DE CONFIRMACIÓN DE SALIDA DE LA APLICACIÓN */}
      {showExitConfirmModal && (
        <div 
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999999] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setShowExitConfirmModal(false)}
        >
          <div 
            className={'border rounded-3xl max-w-sm w-full p-6 shadow-2xl text-center space-y-4 ' + (theme === 'dark' ? 'bg-zinc-950 border-orange-500/40 text-white' : 'bg-white border-orange-200 text-zinc-900')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-2xl bg-orange-500/20 border border-orange-500/40 text-orange-500 flex items-center justify-center mx-auto shadow-lg">
              <LogOut className="w-7 h-7 flex-shrink-0" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">¿Desea salir de la aplicación?</h3>
              <p className="text-xs text-zinc-400 mt-1">
                {user?.gps_tracking_enabled === 1 || isMauricio
                  ? 'El rastreo GPS continuará transmitiendo su ubicación en tiempo real.'
                  : 'Presione Salir para cerrar Asistentruck o Cancelar para continuar trabajando.'}
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowExitConfirmModal(false)}
                className={'flex-1 py-2.5 rounded-xl font-bold text-xs border transition-all cursor-pointer ' + (theme === 'dark' ? 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800' : 'bg-zinc-100 border-zinc-300 text-zinc-800 hover:bg-zinc-200')}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmExitApp}
                className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-black font-black text-xs rounded-xl shadow-lg shadow-orange-500/30 transition-all active:scale-95 cursor-pointer"
              >
                Salir de la App
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
