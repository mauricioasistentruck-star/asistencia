import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar.jsx';
import LoginView from './components/LoginView.jsx';
import CredentialView from './components/CredentialView.jsx';
import AdminAttendanceView from './components/AdminAttendanceView.jsx';
import AdminUsersView from './components/AdminUsersView.jsx';
import AdminGpsView from './components/AdminGpsView.jsx';
import KioskView from './components/KioskView.jsx';
import { apiGetMe, apiSendGpsPoint, getSocket, getFullPhotoUrl } from './api';
import { Volume2, Radio } from 'lucide-react';

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

  // Socket.IO para Walkie-Talkie y Audio en Vivo
  useEffect(() => {
    if (!user) return;

    const socket = getSocket();
    socket.emit('join_user_room', user.id);

    const handleReceiveAudio = (data) => {
      // data: { fromUserId, fromUserName, fromUserPhoto, audioData, toUserId }
      if (data.fromUserId === user.id) return; // ignorar propio eco

      playIncomingBeep();

      try {
        const audio = new Audio(data.audioData);
        audio.volume = 1.0;
        audio.play().catch((err) => {
          console.warn('Auto-play audio bloqueado por navegador:', err);
        });
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
      socket.off('receive_voice_audio', handleReceiveAudio);
    };
  }, [user]);

  // Transmisión GPS continua
  useEffect(() => {
    if (!user || user.gps_tracking_enabled !== 1) {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    const sendCoords = (pos) => {
      if (pos && pos.coords) {
        apiSendGpsPoint({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 10,
          speed: pos.coords.speed || 0,
          heading: pos.coords.heading || null
        }).catch((err) => console.log('GPS sync:', err.message));
      }
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(sendCoords, () => {}, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });

      watchIdRef.current = navigator.geolocation.watchPosition(
        sendCoords,
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
      );
    }

    const backupInterval = setInterval(() => {
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(sendCoords, () => {}, {
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
  }, [user]);

  const handleLoginSuccess = (loggedUser) => {
    setUser(loggedUser);
    setActiveTab('credential');
  };

  const handleLogout = () => {
    localStorage.removeItem('asistencia_token');
    localStorage.removeItem('asistencia_user');
    setUser(null);
    setKioskMode(false);
  };

  if (kioskMode) {
    return <KioskView onExitKiosk={() => setKioskMode(false)} theme={theme} />;
  }

  if (loading) {
    return (
      <div className={'min-h-screen flex items-center justify-center ' + (theme === 'dark' ? 'bg-black' : 'bg-slate-50')}>
        <div className="w-12 h-12 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginView
        onLoginSuccess={handleLoginSuccess}
        onEnterKiosk={() => setKioskMode(true)}
        theme={theme}
        toggleTheme={toggleTheme}
      />
    );
  }

  const isAdmin = user.role === 'admin' || user.role === 'superadmin';

  return (
    <div className={'h-screen h-[100dvh] flex flex-col overflow-hidden transition-colors duration-300 ' + (theme === 'dark' ? 'bg-black text-white' : 'bg-zinc-50 text-zinc-900')}>
      
      {/* BANNER FLOTANTE DE AUDIO EN TIEMPO REAL ENTRANTE */}
      {incomingAudio && (
        <div className="fixed top-18 left-1/2 -translate-x-1/2 z-50 bg-black/95 border-2 border-orange-500 text-white px-5 py-3 rounded-3xl shadow-2xl flex items-center gap-3 animate-bounce">
          <div className="w-9 h-9 rounded-2xl bg-orange-500 text-black flex items-center justify-center font-black flex-shrink-0">
            <Volume2 className="w-5 h-5 animate-pulse" />
          </div>
          <div className="text-left">
            <div className="text-xs font-black text-orange-400 flex items-center gap-1.5">
              <span>🎙️ Mensaje de Audio de {incomingAudio.fromUserName}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            </div>
            <div className="text-[10px] text-zinc-400">
              Reproduciendo en vivo sobre la aplicación • {incomingAudio.timestamp}
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
    </div>
  );
}
