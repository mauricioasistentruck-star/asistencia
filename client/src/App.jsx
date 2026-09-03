import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar.jsx';
import LoginView from './components/LoginView.jsx';
import CredentialView from './components/CredentialView.jsx';
import AdminAttendanceView from './components/AdminAttendanceView.jsx';
import AdminUsersView from './components/AdminUsersView.jsx';
import AdminGpsView from './components/AdminGpsView.jsx';
import KioskView from './components/KioskView.jsx';
import DtReportsView from './components/DtReportsView.jsx';
import IphonePermissionsModal from './components/IphonePermissionsModal.jsx';
import { unlockIOSAudio } from './api';
import { apiGetMe, apiSendGpsPoint, getSocket, getFullPhotoUrl, autoRestoreAndSyncWithServer, isGpsActive, apiDtGetActiveSession } from './api';
import { Geolocation } from '@capacitor/geolocation';
import { Volume2, Radio, LogOut, ShieldAlert, X, FileText } from 'lucide-react';

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

function isKioskUser(u) {
  if (!u) return false;
  return Boolean(
    u.role === 'kiosk' || 
    u.role === 'kiosco' || 
    (u.username && String(u.username).trim().toLowerCase() === 'kiosco')
  );
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

  const [globalDtAlert, setGlobalDtAlert] = useState(null);
  const [globalDtToast, setGlobalDtToast] = useState(null);

  // Listener Global de Alerta de Fiscalización DT y Notificaciones en Celular
  useEffect(() => {
    const socket = getSocket();

    if ('Notification' in window && Notification.permission === 'default') {
      try { Notification.requestPermission(); } catch (e) {}
    }

    const handleDtAlert = (data) => {
      setGlobalDtAlert(data);
      playIncomingBeep();
      if (navigator.vibrate) {
        try { navigator.vibrate([400, 150, 400, 150, 800]); } catch (e) {}
      }
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('⚠️ FISCALIZACIÓN LABORAL EN CURSO (DT)', {
            body: `El fiscalizador ${data.inspector_name || ''} (${data.inspector_email || ''}) ha iniciado revisión de asistencia conforme al D.F.L. N°2 de 1967.`,
            icon: '/logo.png',
            tag: 'dt_alert_inspection',
            requireInteraction: true
          });
        } catch (e) {}
      }
    };

    const handleDtDownload = (data) => {
      const msg = `📋 Fiscalización DT: El funcionario ${data.inspector_name || 'DT'} descargó: ${data.report_title || data.reportType || 'Reporte de Asistencia'}`;
      setGlobalDtToast(msg);
      if (navigator.vibrate) {
        try { navigator.vibrate([150, 100, 150]); } catch (e) {}
      }
      setTimeout(() => setGlobalDtToast(null), 8000);
    };

    const handleDtClosed = () => {
      setGlobalDtAlert(null);
      setGlobalDtToast("El funcionario de la Dirección del Trabajo ha finalizado la sesión de fiscalización.");
      setTimeout(() => setGlobalDtToast(null), 6000);
    };

    socket.on('dt_inspection_alert', handleDtAlert);
    socket.on('dt_download_alert', handleDtDownload);
    socket.on('dt_session_closed', handleDtClosed);

    const checkActiveSession = () => {
      apiDtGetActiveSession().then(res => {
        if (res && res.active && res.session) {
          setGlobalDtAlert({
            inspector_name: res.session.inspector_name,
            inspector_email: res.session.inspector_email,
            started_at: res.session.started_at,
            title: res.title,
            legal_text: res.legal_text
          });
        } else if (res && !res.active) {
          setGlobalDtAlert(null);
        }
      }).catch(() => {});
    };

    checkActiveSession();
    const interval = setInterval(checkActiveSession, 8000);

    return () => {
      socket.off('dt_inspection_alert', handleDtAlert);
      socket.off('dt_download_alert', handleDtDownload);
      socket.off('dt_session_closed', handleDtClosed);
      clearInterval(interval);
    };
  }, []);

  const [gpsTransmitting, setGpsTransmitting] = useState(false);
  const [dtSession, setDtSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('dt_session_data') || 'null');
    } catch(e) {
      return null;
    }
  });
  const watchIdRef = useRef(null);

    useEffect(() => {
    const handleGlobalTouch = () => {
      unlockIOSAudio();
    };
    window.addEventListener('touchstart', handleGlobalTouch, { passive: true });
    window.addEventListener('click', handleGlobalTouch, { passive: true });
    return () => {
      window.removeEventListener('touchstart', handleGlobalTouch);
      window.removeEventListener('click', handleGlobalTouch);
    };
  }, []);

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
    autoRestoreAndSyncWithServer().catch(() => {});

    const handleAuthExpired = () => {
      localStorage.removeItem('asistencia_token');
      setUser(null);
    };
    window.addEventListener('auth_expired', handleAuthExpired);

    // Sincronizacin en tiempo real para actualizar credencial y datos de usuario sin desloguearse
    const socket = getSocket();
    const handleLiveUserUpdate = (updatedUser) => {
      if (updatedUser) {
        setUser(prev => {
          if (!prev) return prev;
          if (prev.id === updatedUser.id || String(prev.id) === String(updatedUser.id)) {
            const merged = { ...prev, ...updatedUser };
            localStorage.setItem('asistencia_user', JSON.stringify(merged));
            return merged;
          }
          return prev;
        });
      }
    };
    socket.on('user_updated', handleLiveUserUpdate);

    const handleGpsToggled = (payload) => {
      if (payload && payload.userId) {
        setUser(prev => {
          if (!prev) return prev;
          if (prev.id === payload.userId || String(prev.id) === String(payload.userId)) {
            const merged = { ...prev, gps_tracking_enabled: payload.gps_tracking_enabled };
            localStorage.setItem('asistencia_user', JSON.stringify(merged));
            return merged;
          }
          return prev;
        });
      }
    };
    socket.on('user_gps_toggled', handleGpsToggled);

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

    return () => {
      window.removeEventListener('auth_expired', handleAuthExpired);
      socket.off('user_updated', handleLiveUserUpdate);
      socket.off('user_gps_toggled', handleGpsToggled);
    };
  }, []);

  const isMauricio = user && (
    user.is_superadmin === 1 || 
    (user.name && user.name.toLowerCase().includes('mauricio')) ||
    (user.username && user.username.toLowerCase().includes('mauricio'))
  );

  const hasCredential = user?.has_credential !== 0 && user?.has_credential !== false && user?.has_credential !== '0';
  const isAdminWithoutCredential = user?.role === 'admin' && !hasCredential && !isMauricio;
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin' || user?.is_superadmin === 1 || isMauricio;

  // Enforce default tab for admin without credential
  useEffect(() => {
    if (user && isAdminWithoutCredential && activeTab === 'credential') {
      setActiveTab('admin_attendance');
    }
  }, [user, isAdminWithoutCredential, activeTab]);

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

  // Deshabilitar rotación en toda la app salvo el menú de kiosco QR
  useEffect(() => {
    if (window.AndroidKiosk && window.AndroidKiosk.setOrientation) {
      if (kioskMode) {
        window.AndroidKiosk.setOrientation('sensor');
      } else {
        window.AndroidKiosk.setOrientation('portrait');
      }
    }
  }, [kioskMode]);

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
        if (window.AndroidKiosk && window.AndroidKiosk.startBackgroundService) {
          try { window.AndroidKiosk.startBackgroundService(); } catch (e) {}
        }
        if ('Notification' in window && Notification.permission === 'default') {
          try { Notification.requestPermission(); } catch (e) {}
        }
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

// Reproductor de Audio Potenciado con Amplificador de Ganancia y Compresor para Celulares
function playLoudAudio(audioUrlOrBase64, onEndedCallback) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    let fetchUrl = audioUrlOrBase64;
    if (audioUrlOrBase64.startsWith('data:audio')) {
      try {
        const parts = audioUrlOrBase64.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'audio/webm';
        const byteCharacters = atob(parts[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mime });
        fetchUrl = URL.createObjectURL(blob);
      } catch (blobErr) {
        fetchUrl = audioUrlOrBase64;
      }
    }

    fetch(fetchUrl)
      .then((res) => res.arrayBuffer())
      .then((buf) => audioCtx.decodeAudioData(buf))
      .then((audioBuf) => {
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuf;

        // Amplificador y limitador de audio
        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(3.5, audioCtx.currentTime);

        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-24, audioCtx.currentTime);
        compressor.knee.setValueAtTime(30, audioCtx.currentTime);
        compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
        compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
        compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

        source.connect(gainNode);
        gainNode.connect(compressor);
        compressor.connect(audioCtx.destination);

        source.onended = () => {
          try { audioCtx.close(); } catch(e) {}
          if (onEndedCallback) onEndedCallback();
        };

        source.start(0);
      })
      .catch((decodeErr) => {
        console.warn('Fallback HTML5 Audio:', decodeErr);
        const fallbackAudio = new Audio(fetchUrl);
        fallbackAudio.volume = 1.0;
        fallbackAudio.onended = () => {
          if (onEndedCallback) onEndedCallback();
        };
        fallbackAudio.play().catch(() => {});
      });
  } catch (e) {
    const fallbackAudio = new Audio(audioUrlOrBase64);
    fallbackAudio.volume = 1.0;
    fallbackAudio.onended = () => {
      if (onEndedCallback) onEndedCallback();
    };
    fallbackAudio.play().catch(() => {});
  }
}

    // 1. Notificación de inicio de transmisión en vivo (Canal Ocupado)
    const handleStreamStart = (data) => {
      if (!data) return;
      const senderId = data.fromUserId;
      if (senderId && String(senderId) === String(user.id)) return;

      let targetIds = Array.isArray(data.targetUserIds) ? data.targetUserIds : [];
      const isForMe = targetIds.length === 0 || targetIds.includes('all') || targetIds.includes(user.id) || targetIds.includes(String(user.id));
      if (!isForMe) return;

      playIncomingBeep();
      setIncomingAudio({
        sender_name: data.fromUserName,
        sender_photo: data.fromUserPhoto,
        isLiveStream: true
      });
    };

    // 2. Notificación de fin de transmisión
    const handleStreamEnd = () => {
      setTimeout(() => {
        setIncomingAudio(prev => prev?.isLiveStream ? null : prev);
      }, 500);
    };

    // 3. Recepción y Reproducción de Audio de Emergencia (En vivo y en segundo plano)
    const handleReceiveAudio = (data) => {
      if (!data) return;
      const senderId = data.sender_id || data.fromUserId;
      if (senderId && String(senderId) === String(user.id)) return; // ignorar propio eco

      // Verificar si el audio es para mí o para todos
      let targetIds = [];
      if (Array.isArray(data.targetUserIds)) targetIds = data.targetUserIds;
      else if (data.receiver_ids) {
        try { targetIds = JSON.parse(data.receiver_ids); } catch(e) { targetIds = [data.receiver_ids]; }
      }

      const isForMe = targetIds.length === 0 || 
                      targetIds.includes('all') || 
                      targetIds.includes(user.id) || 
                      targetIds.includes(String(user.id)) ||
                      data.receiver_ids === 'all';

      if (!isForMe) return;

      playIncomingBeep();

      try {
        const cached = localStorage.getItem('asistencia_voice_messages_cache');
        const list = cached ? JSON.parse(cached) : [];
        if (!list.some(m => m.id === data.id)) {
          const updatedList = [data, ...list].slice(0, 300);
          localStorage.setItem('asistencia_voice_messages_cache', JSON.stringify(updatedList));
        }
      } catch (e) {}

      const audioSrc = data.audio_url ? getFullPhotoUrl(data.audio_url) : data.audioData;

      // Reproducir mediante servicio nativo de Android en segundo plano / pantalla apagada
      if (window.AndroidKiosk && window.AndroidKiosk.playEmergencyAudioNative && audioSrc) {
        try {
          window.AndroidKiosk.playEmergencyAudioNative(audioSrc, data.sender_name);
        } catch (e) {
          console.warn('Fallo playEmergencyAudioNative:', e);
        }
      }

      // Reproducción Web / WebView
      if (audioSrc) {
        playLoudAudio(audioSrc, () => {
          setTimeout(() => setIncomingAudio(null), 1000);
        });
      }

      setIncomingAudio({
        sender_name: data.sender_name,
        sender_photo: data.sender_photo,
        timestamp: data.timestamp,
        isLiveStream: false
      });
    };

    socket.on('voice_stream_start', handleStreamStart);
    socket.on('voice_stream_end', handleStreamEnd);
    socket.on('receive_voice_audio', handleReceiveAudio);

    return () => {
      socket.off('connect', joinRooms);
      socket.off('reconnect', joinRooms);
      socket.off('voice_stream_start', handleStreamStart);
      socket.off('voice_stream_end', handleStreamEnd);
      socket.off('receive_voice_audio', handleReceiveAudio);
    };
  }, [user]);

  // Transmisión GPS continua, precisa y silenciosa en segundo plano
  useEffect(() => {
    if (!user || !isGpsActive(user.gps_tracking_enabled)) {
      if (watchIdRef.current !== null) {
        try {
          if (typeof watchIdRef.current === 'string') {
            Geolocation.clearWatch({ id: watchIdRef.current }).catch(() => {});
          } else if ('geolocation' in navigator) {
            navigator.geolocation.clearWatch(watchIdRef.current);
          }
        } catch (e) {}
        watchIdRef.current = null;
      }
      return;
    }

    let lastSentCoords = null;
    let lastSentTimestamp = 0;
    const sendCoordsSilently = (pos) => {
      if (pos && pos.coords) {
        const accuracy = pos.coords.accuracy || 10;
        // Filtrar unicamente lecturas con error grosero (> 80m)
        if (accuracy > 300) return;

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

        const now = Date.now();
        const timeSinceLastSent = now - lastSentTimestamp;

        if (lastSentCoords) {
          const latDiff = Math.abs(lat - lastSentCoords.lat);
          const lngDiff = Math.abs(lng - lastSentCoords.lng);
          const speed = pos.coords.speed || 0;
          // Si esta detenido o sin movimiento, enviar heartbeat cada 20 segundos
          if (latDiff < 0.00003 && lngDiff < 0.00003 && speed < 0.3) {
            if (timeSinceLastSent < 20000) {
              return;
            }
          }
        }

        lastSentCoords = { lat, lng };
        lastSentTimestamp = now;
        apiSendGpsPoint({
          latitude: lat,
          longitude: lng,
          accuracy: Math.round(accuracy),
          speed: pos.coords.speed || 0,
          heading: pos.coords.heading || null
        }).then(() => {
          setGpsTransmitting(true);
        }).catch(() => {});
      }
    };

    let wakeLockSentinel = null;
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(wl => {
        wakeLockSentinel = wl;
      }).catch(() => {});
    }

    // 1. Solicitar permisos de GPS explícitos en Android nativo y Web
    const initGps = async () => {
      try {
        await Geolocation.requestPermissions();
      } catch (e) {}

      // 2. Obtener primera posición inmediata
      try {
        const initialPos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });
        if (initialPos && initialPos.coords) sendCoordsSilently(initialPos);
      } catch (e) {
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(sendCoordsSilently, () => {}, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          });
        }
      }

      // 3. Activar escucha continua por hardware GPS nativo
      try {
        const watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 },
          (pos, err) => {
            if (pos && pos.coords) sendCoordsSilently(pos);
          }
        );
        watchIdRef.current = watchId;
      } catch (capWatchErr) {
        if ('geolocation' in navigator) {
          watchIdRef.current = navigator.geolocation.watchPosition(
            sendCoordsSilently,
            () => {},
            { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
          );
        }
      }
    };

    initGps();

    // 4. Intervalo de respaldo periódico cada 8 segundos para evitar desconexiones
    const backupInterval = setInterval(async () => {
      try {
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 2000
        });
        if (pos && pos.coords) sendCoordsSilently(pos);
      } catch (e) {
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(sendCoordsSilently, () => {}, {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 0
          });
        }
      }
    }, 8000);

    return () => {
      if (wakeLockSentinel) {
        try { wakeLockSentinel.release().catch(() => {}); } catch(e) {}
      }
      clearInterval(backupInterval);
      if (watchIdRef.current !== null) {
        try {
          if (typeof watchIdRef.current === 'string') {
            Geolocation.clearWatch({ id: watchIdRef.current }).catch(() => {});
          } else if ('geolocation' in navigator) {
            navigator.geolocation.clearWatch(watchIdRef.current);
          }
        } catch (e) {}
        watchIdRef.current = null;
      }
    };
  }, [user?.id, user?.gps_tracking_enabled]);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    if (isKioskUser(userData)) {
      setKioskMode(false);
      return;
    }
    setKioskMode(false);
    const userHasCred = userData?.has_credential !== 0 && userData?.has_credential !== false && userData?.has_credential !== '0';
    if (userData?.role === 'admin' && !userHasCred) {
      setActiveTab('admin_attendance');
    } else {
      setActiveTab('credential');
    }
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

  if (dtSession) {
    return (
      <DtReportsView
        dtSession={dtSession}
        onExit={() => {
          setDtSession(null);
          localStorage.removeItem('dt_session_data');
          localStorage.removeItem('dt_auth_token');
        }}
      />
    );
  }

  if (!user) {
    return (
      <>
        
      {/* BANNER GLOBAL OFICIAL DE FISCALIZACIÓN DT (VISIBLE EN TODA LA APP) */}
      {globalDtAlert && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999999] max-w-xl w-[94%] bg-red-950/95 text-white border-2 border-red-500 rounded-3xl p-4 shadow-2xl shadow-red-500/30 backdrop-blur-xl animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto">
          <div className="flex items-start justify-between gap-2.5 mb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-red-500/30 border border-red-500 flex items-center justify-center text-red-300 flex-shrink-0 animate-pulse">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-red-400 font-mono">
                    PROCEDIMIENTO DE FISCALIZACIÓN LABORAL EN CURSO (DT)
                  </span>
                </div>
                <h4 className="text-xs sm:text-sm font-black text-white leading-tight">
                  Se ha iniciado un proceso de revisión de información por parte de un funcionario de la Dirección del Trabajo.
                </h4>
              </div>
            </div>
            <button
              onClick={() => setGlobalDtAlert(null)}
              className="text-zinc-400 hover:text-white p-1 cursor-pointer"
              title="Cerrar aviso visual"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[11px] text-zinc-200 leading-relaxed bg-black/60 p-3 rounded-2xl border border-red-500/40">
            Se informa a usted que, de acuerdo con las facultades y obligaciones legales contenidas en el Código del Trabajo y sus leyes complementarias; en el D.F.L. N°2 de 1967, del Ministerio del Trabajo y Previsión Social, y en otras disposiciones reglamentarias, se está iniciando un procedimiento de fiscalización laboral.
          </p>

          <div className="flex flex-wrap items-center justify-between text-[10px] font-mono text-zinc-300 gap-2 mt-2 pt-1 border-t border-red-500/30">
            <div>
              Fiscalizador: <strong className="text-red-300">{globalDtAlert.inspector_name || 'Funcionario DT'}</strong> ({globalDtAlert.inspector_email || 'dt@dt.gob.cl'})
            </div>
            <div>
              Inicio: <strong>{new Date(globalDtAlert.started_at || Date.now()).toLocaleTimeString('es-CL')} hrs</strong>
            </div>
          </div>
        </div>
      )}

      {/* TOAST FLOTANTE DE ACCIONES Y DESCARGAS DEL FISCALIZADOR */}
      {globalDtToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999999] max-w-md w-[90%] bg-black/95 text-white border-2 border-orange-500 rounded-2xl p-3 shadow-2xl shadow-orange-500/20 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-300 flex items-center gap-3 pointer-events-auto">
          <div className="w-8 h-8 rounded-xl bg-orange-500 text-black flex items-center justify-center flex-shrink-0 font-black animate-pulse">
            <FileText className="w-4 h-4" />
          </div>
          <div className="flex-1 text-xs font-bold text-zinc-200">
            {globalDtToast}
          </div>
        </div>
      )}

        <LoginView onLoginSuccess={handleLoginSuccess} theme={theme} onDtLoginSuccess={(session) => setDtSession(session)} />
      </>
    );
  }

  // Modo Kiosco activado EXCLUSIVAMENTE si el usuario que inicio sesion es el usuario de Kiosco
  if (isKioskUser(user)) {
    return <KioskView onExitKiosk={handleLogout} theme={theme} isKioskUser={true} onDtLoginSuccess={(session) => setDtSession(session)} />;
  }

  // Si un administrador activo manualmente el modo kiosco temporal
  if (kioskMode) {
    return <KioskView onExitKiosk={() => setKioskMode(false)} theme={theme} onDtLoginSuccess={(session) => setDtSession(session)} />;
  }



  return (
    <div className={'min-h-screen h-screen flex flex-col overflow-hidden ' + (theme === 'dark' ? 'bg-black text-white' : 'bg-slate-50 text-zinc-900')}>

      {/* BANNER GLOBAL OFICIAL DE FISCALIZACIÓN DT (VISIBLE EN TODA LA APP) */}
      {globalDtAlert && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999999] max-w-xl w-[94%] bg-red-950/95 text-white border-2 border-red-500 rounded-3xl p-4 shadow-2xl shadow-red-500/30 backdrop-blur-xl animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto">
          <div className="flex items-start justify-between gap-2.5 mb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-red-500/30 border border-red-500 flex items-center justify-center text-red-300 flex-shrink-0 animate-pulse">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-red-400 font-mono">
                    PROCEDIMIENTO DE FISCALIZACIÓN LABORAL EN CURSO (DT)
                  </span>
                </div>
                <h4 className="text-xs sm:text-sm font-black text-white leading-tight">
                  Se ha iniciado un proceso de revisión de información por parte de un funcionario de la Dirección del Trabajo.
                </h4>
              </div>
            </div>
            <button
              onClick={() => setGlobalDtAlert(null)}
              className="text-zinc-400 hover:text-white p-1 cursor-pointer"
              title="Cerrar aviso visual"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[11px] text-zinc-200 leading-relaxed bg-black/60 p-3 rounded-2xl border border-red-500/40">
            Se informa a usted que, de acuerdo con las facultades y obligaciones legales contenidas en el Código del Trabajo y sus leyes complementarias; en el D.F.L. N°2 de 1967, del Ministerio del Trabajo y Previsión Social, y en otras disposiciones reglamentarias, se está iniciando un procedimiento de fiscalización laboral.
          </p>

          <div className="flex flex-wrap items-center justify-between text-[10px] font-mono text-zinc-300 gap-2 mt-2 pt-1 border-t border-red-500/30">
            <div>
              Fiscalizador: <strong className="text-red-300">{globalDtAlert.inspector_name || 'Funcionario DT'}</strong> ({globalDtAlert.inspector_email || 'dt@dt.gob.cl'})
            </div>
            <div>
              Inicio: <strong>{new Date(globalDtAlert.started_at || Date.now()).toLocaleTimeString('es-CL')} hrs</strong>
            </div>
          </div>
        </div>
      )}

      {/* TOAST FLOTANTE DE ACCIONES Y DESCARGAS DEL FISCALIZADOR */}
      {globalDtToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999999] max-w-md w-[90%] bg-black/95 text-white border-2 border-orange-500 rounded-2xl p-3 shadow-2xl shadow-orange-500/20 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-300 flex items-center gap-3 pointer-events-auto">
          <div className="w-8 h-8 rounded-xl bg-orange-500 text-black flex items-center justify-center flex-shrink-0 font-black animate-pulse">
            <FileText className="w-4 h-4" />
          </div>
          <div className="flex-1 text-xs font-bold text-zinc-200">
            {globalDtToast}
          </div>
        </div>
      )}

      
      {/* Banner Flotante de Audio Walkie-Talkie Entrante */}
      {incomingAudio && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[999999] max-w-sm w-[92%] bg-black/95 border border-orange-500/80 rounded-2xl p-3 shadow-2xl shadow-orange-500/20 backdrop-blur-xl animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500 text-black flex items-center justify-center flex-shrink-0 animate-pulse font-black shadow-md shadow-orange-500/30">
              <Radio className="w-5 h-5 animate-bounce" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-black text-white flex items-center justify-between">
                <span>🎙️ {incomingAudio.sender_name || incomingAudio.fromUserName}</span>
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping flex-shrink-0"></span>
              </div>
              <div className="text-[10px] text-orange-400 font-bold truncate">
                {incomingAudio.isLiveStream ? '🔴 Transmitiendo audio en vivo...' : `Audio Walkie-Talkie • ${incomingAudio.timestamp || 'Ahora'}`}
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
        onEnterKiosk={() => {
          if (isAdminWithoutCredential) return;
          setKioskMode(true);
        }}
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
            {activeTab === 'credential' && hasCredential && (
              <CredentialView
                user={user}
                theme={theme}
                showHistoryModal={showHistoryModal}
                setShowHistoryModal={setShowHistoryModal}
              />
            )}
            {(activeTab === 'admin_attendance' || (isAdminWithoutCredential && activeTab === 'credential')) && (
              <AdminAttendanceView user={user} theme={theme} />
            )}
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
                'Presione Salir para cerrar Asistentruck o Cancelar para continuar trabajando.'
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

      <IphonePermissionsModal theme={theme} />
    </div>
  );
}
