import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Lock, ShieldAlert, CheckCircle2, QrCode, AlertCircle, Sparkles, Clock, X, KeyRound, Maximize, Shield, Camera, FlipHorizontal, RefreshCw } from 'lucide-react';
import { apiScanQr, apiVerifyAdminPassword, getFullPhotoUrl, mergeAttendanceToVault } from '../api';

export default function KioskView({ onExitKiosk, theme }) {
  const [scanResult, setScanResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('es-CL'));
  const [currentDate, setCurrentDate] = useState(new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Selector de Cámara Frontal / Trasera (Recordado en dispositivo)
  const [cameraFacingMode, setCameraFacingMode] = useState(() => localStorage.getItem('kiosk_camera_facing') || 'environment');
  const [switchingCamera, setSwitchingCamera] = useState(false);
  
  // Modal de desbloqueo admin
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);

  const scannerRef = useRef(null);
  const isProcessingRef = useRef(false);
  const wakeLockRef = useRef(null);
  const containerRef = useRef(null);

  const isDark = theme === 'dark';

  // Reloj en tiempo real
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('es-CL'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 1. INMERSIVIDAD Y PANTALLA COMPLETA AUTOMÁTICA (Ocultar Barra de Notificaciones y Gestos)
  const enterImmersiveFullscreen = async () => {
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen({ navigationUI: "hide" });
        setIsFullscreen(true);
      } else if (elem.webkitRequestFullscreen) {
        await elem.webkitRequestFullscreen();
        setIsFullscreen(true);
      } else if (elem.msRequestFullscreen) {
        await elem.msRequestFullscreen();
        setIsFullscreen(true);
      }
    } catch (e) {
      console.log('Fullscreen request handled:', e.message);
    }
  };

  const exitImmersiveFullscreen = async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      }
    } catch (e) {}
  };

  // 2. SCREEN WAKE LOCK (Evitar que la pantalla del celular se apague o bloquee)
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
      }
    } catch (err) {
      console.warn('Wake Lock warning:', err.message);
    }
  };

  useEffect(() => {
    enterImmersiveFullscreen();
    requestWakeLock();

    // Activar Modo Kiosco Nativo en Android (LockTask y ocultar barras de notificación)
    try {
      if (typeof window !== 'undefined' && window.AndroidKiosk && window.AndroidKiosk.startKiosk) {
        window.AndroidKiosk.startKiosk();
      }
    } catch (kioskErr) {
      console.log('Native kiosk init:', kioskErr);
    }

    // Re-adquirir WakeLock y Pantalla Completa si la app vuelve al frente
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
        enterImmersiveFullscreen();
        if (typeof window !== 'undefined' && window.AndroidKiosk && window.AndroidKiosk.startKiosk) {
          window.AndroidKiosk.startKiosk();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 3. BLOQUEO DE GESTOS Y BOTÓN ATRÁS (History Trapping)
    history.pushState(null, '', window.location.href);
    const handlePopState = (e) => {
      e.preventDefault();
      history.pushState(null, '', window.location.href);
      enterImmersiveFullscreen();
    };
    window.addEventListener('popstate', handlePopState);

    // 4. BLOQUEO DE CIERRE Y RECARGA
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // 5. BLOQUEO DE TECLAS DE SISTEMA / ESCAPE
    const handleKeyInterception = (e) => {
      if (e.key === 'Escape' || e.key === 'F11' || (e.altKey && e.key === 'ArrowLeft')) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyInterception, { capture: true });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('keydown', handleKeyInterception, { capture: true });
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      try {
        if (typeof window !== 'undefined' && window.AndroidKiosk && window.AndroidKiosk.stopKiosk) {
          window.AndroidKiosk.stopKiosk();
        }
      } catch (e) {}
      exitImmersiveFullscreen();
    };
  }, []);

  // Inicializar lector de cámara para Kiosco (Frontal o Trasera)
  useEffect(() => {
    let html5QrCode = null;
    const scannerId = "kiosk-reader-element";

    const startCamera = async () => {
      setSwitchingCamera(true);
      try {
        if (scannerRef.current) {
          try {
            if (scannerRef.current.isScanning) {
              await scannerRef.current.stop();
            }
          } catch(e) {}
        }

        html5QrCode = new Html5Qrcode(scannerId);
        scannerRef.current = html5QrCode;

        const config = {
          fps: 15,
          qrbox: { width: 280, height: 280 },
          aspectRatio: 1.0
        };

        await html5QrCode.start(
          { facingMode: cameraFacingMode },
          config,
          (decodedText) => {
            if (!isProcessingRef.current) {
              handleQrDetected(decodedText);
            }
          },
          (errorMessage) => {
            // escaneo continuo
          }
        );
        setIsScanning(true);
        setCameraError('');
      } catch (err) {
        console.error("Error al iniciar cámara:", err);
        setCameraError("No se pudo acceder a la cámara seleccionada. Verifique permisos.");
        setIsScanning(false);
      } finally {
        setSwitchingCamera(false);
      }
    };

    startCamera();

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [cameraFacingMode]);

  const toggleCameraFacing = (mode) => {
    if (cameraFacingMode === mode) return;
    setCameraFacingMode(mode);
    localStorage.setItem('kiosk_camera_facing', mode);
  };

  const handleQrDetected = async (token) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setErrorMsg('');
    setScanResult(null);

    try {
      // Reproducir sonido beep de confirmación
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      } catch (e) {}

      const data = await apiScanQr(token);
      if (data && data.success) {
        mergeAttendanceToVault([{
          user_id: data.userId || data.user_id,
          date: data.date,
          [data.type]: data.time
        }]);
      }
      setScanResult(data);
      setTimeout(() => {
        setScanResult(null);
        isProcessingRef.current = false;
      }, 4500);
    } catch (err) {
      setErrorMsg(err.message || 'Código QR no válido o error de registro');
      setTimeout(() => {
        setErrorMsg('');
        isProcessingRef.current = false;
      }, 4000);
    }
  };

  const handleUnlockKiosk = async (e) => {
    e.preventDefault();
    if (!adminPassword) {
      setUnlockError('Ingrese la contraseña de administrador');
      return;
    }
    setUnlockLoading(true);
    setUnlockError('');

    try {
      await apiVerifyAdminPassword(adminPassword);
      try {
        if (typeof window !== 'undefined' && window.AndroidKiosk && window.AndroidKiosk.stopKiosk) {
          window.AndroidKiosk.stopKiosk();
        }
      } catch (e) {}
      setShowUnlockModal(false);
      exitImmersiveFullscreen();
      onExitKiosk();
    } catch (err) {
      setUnlockError(err.message || 'Contraseña incorrecta');
    } finally {
      setUnlockLoading(false);
    }
  };

  return (
    <div 
      ref={containerRef}
      onClick={() => enterImmersiveFullscreen()}
      onContextMenu={(e) => e.preventDefault()}
      className={'fixed inset-0 z-50 flex flex-col justify-between p-4 sm:p-6 overflow-hidden select-none touch-none overscroll-none ' + (isDark ? 'bg-black text-white' : 'bg-zinc-950 text-white')}
      style={{
        WebkitUserSelect: 'none',
        userSelect: 'none',
        touchAction: 'none',
        overscrollBehavior: 'none'
      }}
    >
      
      {/* Botón protegido de candado para salir del modo Kiosco (Solo con clave Admin) */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/15 border border-orange-500/40 text-[10px] font-black text-orange-400">
          <Shield className="w-3.5 h-3.5 animate-pulse" />
          <span>MODO KIOSCO PROTEGIDO</span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowUnlockModal(true);
            setAdminPassword('');
            setUnlockError('');
          }}
          title="Desbloquear Modo Kiosco (Requiere Contraseña de Administrador)"
          className="bg-black/80 hover:bg-orange-500 hover:text-black text-zinc-300 p-2.5 rounded-2xl border border-orange-500/40 backdrop-blur-md transition-all shadow-2xl flex items-center gap-1.5 text-xs font-black cursor-pointer active:scale-95"
        >
          <Lock className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <span className="hidden sm:inline">Desbloquear y Salir</span>
        </button>
      </div>

      {/* Encabezado Kiosco con Logo y Reloj Gigante */}
      <div className="text-center pt-2">
        <div className="flex items-center justify-center space-x-3 mb-2">
          <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-orange-500 shadow-xl shadow-orange-500/30 p-0.5 bg-black flex-shrink-0">
            <img src="/logo.png" alt="AsistenTruck" className="w-full h-full object-contain pointer-events-none" />
          </div>
          <div className="text-left">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight leading-none text-white">
              ASISTEN<span className="text-orange-500">TRUCK</span>
            </h1>
            <p className="text-[10px] text-orange-500 font-extrabold uppercase tracking-wider">
              INVERSIONES BOTAM SpA • RELOJ CONTROL
            </p>
          </div>
        </div>

        {/* Reloj Digital en Tiempo Real */}
        <div className="inline-block bg-black/80 border border-orange-500/40 rounded-3xl px-8 py-2 shadow-2xl mt-1">
          <div className="text-3xl sm:text-5xl font-black font-mono tracking-widest text-orange-400 drop-shadow-[0_0_15px_rgba(249,115,22,0.4)]">
            {currentTime}
          </div>
          <div className="text-[11px] text-zinc-400 font-bold capitalize mt-0.5">
            {currentDate}
          </div>
        </div>
      </div>

      {/* Centro: Cámara de Escaneo QR y Notificación de Resultado */}
      <div className="flex-1 flex flex-col items-center justify-center my-2 max-w-lg mx-auto w-full relative">
        
        {/* Notificación de Marcación Exitosa */}
        {scanResult && (
          <div className="absolute inset-0 z-30 bg-black/95 border-2 border-orange-500 rounded-3xl p-6 shadow-2xl flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center mb-3 shadow-xl">
              <CheckCircle2 className="w-12 h-12" />
            </div>

            <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-orange-500 mb-2 shadow-md">
              {scanResult.user?.photo_url ? (
                <img src={getFullPhotoUrl(scanResult.user.photo_url)} alt="Foto" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-orange-500 text-black flex items-center justify-center text-xl font-black">
                  {scanResult.user?.name?.charAt(0)}
                </div>
              )}
            </div>

            <h3 className="text-xl font-black text-white">{scanResult.user?.name}</h3>
            <p className="text-xs text-orange-400 font-mono font-bold">RUT: {scanResult.user?.rut || 'S/N'}</p>

            <div className="mt-4 bg-orange-500 text-black font-black text-sm px-6 py-2 rounded-2xl shadow-xl flex items-center gap-2">
              <Clock className="w-5 h-5 flex-shrink-0" />
              <span>{scanResult.label} • {scanResult.time}</span>
            </div>

            <p className="text-[11px] text-zinc-400 mt-3 font-semibold">
              Marcación registrada y sincronizada en tiempo real.
            </p>
          </div>
        )}

        {/* Notificación de Error */}
        {errorMsg && (
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 z-30 bg-red-950/95 border-2 border-red-500 rounded-3xl p-6 shadow-2xl flex flex-col items-center justify-center text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mb-2 animate-bounce flex-shrink-0" />
            <h4 className="text-base font-black text-red-200">Error en Lectura QR</h4>
            <p className="text-xs text-red-300 mt-1">{errorMsg}</p>
          </div>
        )}

        {/* Visor de Cámara con Láser Naranja */}
        <div className="w-full max-w-sm aspect-square rounded-3xl overflow-hidden border-4 border-orange-500/50 shadow-2xl relative bg-black flex items-center justify-center">
          <div id="kiosk-reader-element" className="w-full h-full object-cover pointer-events-none"></div>
          
          {/* Mira de Escaneo Naranja */}
          <div className="absolute inset-8 border-2 border-orange-500/60 rounded-2xl pointer-events-none flex flex-col justify-between p-2">
            <div className="flex justify-between">
              <div className="w-4 h-4 border-t-2 border-l-2 border-orange-500"></div>
              <div className="w-4 h-4 border-t-2 border-r-2 border-orange-500"></div>
            </div>
            {/* Láser de Escaneo Animado */}
            <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-orange-500 to-transparent shadow-[0_0_12px_#f97316] animate-bounce"></div>
            <div className="flex justify-between">
              <div className="w-4 h-4 border-b-2 border-l-2 border-orange-500"></div>
              <div className="w-4 h-4 border-b-2 border-r-2 border-orange-500"></div>
            </div>
          </div>
        </div>

        <p className="text-xs text-orange-400 font-extrabold uppercase tracking-wider mt-3 flex items-center gap-1.5">
          <QrCode className="w-4 h-4 animate-pulse flex-shrink-0" />
          Acerque su Credencial Virtual al Lector
        </p>

        {/* Selector de Cámara: Frontal vs Trasera */}
        <div className="flex items-center gap-2 mt-2.5 z-20">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleCameraFacing('environment');
            }}
            disabled={switchingCamera}
            className={'px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer ' + (
              cameraFacingMode === 'environment'
                ? 'bg-orange-500 text-black border border-orange-400 shadow-orange-500/30'
                : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-400 border border-zinc-800'
            )}
          >
            <Camera className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Cámara Trasera</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleCameraFacing('user');
            }}
            disabled={switchingCamera}
            className={'px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer ' + (
              cameraFacingMode === 'user'
                ? 'bg-orange-500 text-black border border-orange-400 shadow-orange-500/30'
                : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-400 border border-zinc-800'
            )}
          >
            <FlipHorizontal className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Cámara Frontal</span>
          </button>
        </div>
      </div>

      {/* Pie de Página con Indicaciones de las 4 Marcaciones */}
      <div className="max-w-xl mx-auto w-full bg-black/80 border border-zinc-800 rounded-2xl p-3 text-center">
        <div className="grid grid-cols-4 gap-1.5 text-[10px] font-black">
          <div className="bg-orange-500/15 border border-orange-500/30 text-orange-400 py-1 rounded-xl">Entrada</div>
          <div className="bg-amber-500/15 border border-amber-500/30 text-amber-400 py-1 rounded-xl">Sal. Col.</div>
          <div className="bg-orange-500/15 border border-orange-500/30 text-orange-400 py-1 rounded-xl">Ent. Col.</div>
          <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 py-1 rounded-xl">Salida</div>
        </div>
      </div>

      {/* MODAL DE SEGURIDAD PARA SALIR DE MODO KIOSCO */}
      {showUnlockModal && (
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-zinc-950 border-2 border-orange-500/40 rounded-3xl max-w-sm w-full p-6 shadow-2xl text-white">
            
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-orange-500 text-black flex items-center justify-center font-bold">
                  <KeyRound className="w-5 h-5 flex-shrink-0" />
                </div>
                <div>
                  <h3 className="text-base font-black">Desbloquear Kiosco</h3>
                  <p className="text-[10px] text-orange-500 font-bold uppercase">Acceso Administrador</p>
                </div>
              </div>
              <button
                onClick={() => setShowUnlockModal(false)}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5 flex-shrink-0" />
              </button>
            </div>

            {unlockError && (
              <div className="mb-3 bg-red-500/10 border border-red-500/30 rounded-xl p-2.5 text-xs text-red-400 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>{unlockError}</span>
              </div>
            )}

            <form onSubmit={handleUnlockKiosk} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1.5">
                  Contraseña de Administrador:
                </label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Ingrese contraseña de admin"
                  className="w-full bg-black border border-zinc-700 focus:border-orange-500 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none"
                  autoFocus
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowUnlockModal(false)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:bg-zinc-900 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={unlockLoading}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-black font-black text-xs rounded-xl shadow-lg shadow-orange-500/20 cursor-pointer"
                >
                  {unlockLoading ? 'Validando...' : 'Desbloquear y Salir'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
