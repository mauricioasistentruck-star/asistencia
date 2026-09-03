import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Lock, ShieldAlert, CheckCircle2, QrCode, Moon, Eye, AlertCircle, Sparkles, Clock, X, KeyRound, Maximize, Shield, Camera, FlipHorizontal, RefreshCw } from 'lucide-react';
import { apiScanQr, apiVerifyAdminPassword, getFullPhotoUrl, mergeAttendanceToVault } from '../api';
import DtAuditPortalModal from './DtAuditPortalModal.jsx';
import DtLogo from './DtLogo.jsx';

export default function KioskView({ onExitKiosk, theme, onDtLoginSuccess }) {
  const [scanResult, setScanResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('es-CL'));
  const [currentDate, setCurrentDate] = useState(new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // POR DEFECTO PARA TABLET KIOSCO: CÁMARA DELANTERA ('user')
  const [cameraFacingMode, setCameraFacingMode] = useState(() => localStorage.getItem('kiosk_camera_facing') || 'user');
  
  // MODO DESCANSO / SUSPENSIÓN INTELIGENTE PARA AHORRO DE BATERÍA (5 MINUTOS)
  const [isSleeping, setIsSleeping] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const motionCanvasRef = useRef(null);
  const prevFrameDataRef = useRef(null);
  const prevAvgLumRef = useRef(null);
  const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos de inactividad
  const [availableCameras, setAvailableCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(() => localStorage.getItem('kiosk_camera_id') || '');
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [showDtModal, setShowDtModal] = useState(false);
  
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

  // DESPERTAR DEL MODO SUSPENSIÓN
  const wakeUpFromSleep = (reason = 'touch') => {
    lastActivityRef.current = Date.now();
    setIsSleeping((prev) => {
      if (prev) {
        try {
          if (typeof window !== 'undefined' && window.AndroidKiosk && window.AndroidKiosk.setSleepMode) {
            window.AndroidKiosk.setSleepMode(false);
          }
        } catch (e) {}

        // Beep sutil de activación al despertar
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(620, audioCtx.currentTime);
          osc.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.08);
        } catch (e) {}
      }
      return false;
    });
  };

  // ENTRAR EN MODO SUSPENSIÓN / DESCANSO
  const enterSleepMode = () => {
    setIsSleeping(true);
    try {
      if (typeof window !== 'undefined' && window.AndroidKiosk && window.AndroidKiosk.setSleepMode) {
        window.AndroidKiosk.setSleepMode(true);
      }
    } catch (e) {}
  };

    // Monitoreo de interacción del usuario para reiniciar el temporizador de 5 min
  useEffect(() => {
    const handleUserActivity = () => {
      if (isSleeping) {
        wakeUpFromSleep('touch');
      } else {
        lastActivityRef.current = Date.now();
      }
    };

    const events = ['touchstart', 'touchend', 'mousedown', 'mousemove', 'keydown', 'click'];
    events.forEach(evt => window.addEventListener(evt, handleUserActivity, { passive: true }));

    // Verificador periódico de inactividad de 5 minutos
    const inactivityInterval = setInterval(() => {
      if (!isSleeping && (Date.now() - lastActivityRef.current >= INACTIVITY_TIMEOUT_MS)) {
        enterSleepMode();
      }
    }, 4000);

    return () => {
      events.forEach(evt => window.removeEventListener(evt, handleUserActivity));
      clearInterval(inactivityInterval);
    };
  }, [isSleeping]);

  // Detector de Movimiento y Proximidad Óptica en la Cámara Frontal durante la Suspensión
  useEffect(() => {
    if (!motionCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = 32;
      c.height = 32;
      motionCanvasRef.current = c;
    }

    const motionInterval = setInterval(() => {
      if (!isSleeping) {
        prevFrameDataRef.current = null;
        prevAvgLumRef.current = null;
        return;
      }

      try {
        const videoEl = document.querySelector('#kiosk-reader-element video') || containerRef.current?.querySelector('video');
        if (!videoEl || videoEl.readyState < 2) return;

        const canvas = motionCanvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(videoEl, 0, 0, 32, 32);
        const imgData = ctx.getImageData(0, 0, 32, 32);
        const data = imgData.data;

        let totalLum = 0;
        for (let i = 0; i < data.length; i += 4) {
          totalLum += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        }
        const currentAvgLum = totalLum / (32 * 32);

        if (prevFrameDataRef.current && prevAvgLumRef.current !== null) {
          const prev = prevFrameDataRef.current;
          let diffCount = 0;
          for (let i = 0; i < data.length; i += 4) {
            const diff = Math.abs(data[i] - prev[i]) + Math.abs(data[i + 1] - prev[i + 1]) + Math.abs(data[i + 2] - prev[i + 2]);
            if (diff > 38) {
              diffCount++;
            }
          }
          const diffRatio = diffCount / (32 * 32);
          const lumDiff = Math.abs(currentAvgLum - prevAvgLumRef.current);

          // Disparador 1: Movimiento de persona o teléfono pasando frente al lente (>10% del campo)
          // Disparador 2: Destello o iluminación de pantalla de celular acercándose a la cámara
          if (diffRatio > 0.10 || lumDiff > 15 || (currentAvgLum > prevAvgLumRef.current * 1.35 && currentAvgLum > 20)) {
            wakeUpFromSleep('motion');
            return;
          }
        }

        prevFrameDataRef.current = new Uint8ClampedArray(data);
        prevAvgLumRef.current = currentAvgLum;
      } catch (e) {
        // Ignorar fallos transitorios de lectura de canvas
      }
    }, 280); // Muestreo ligero: ~3.5 fps (ultra-bajo consumo de batería)

    return () => clearInterval(motionInterval);
  }, [isSleeping]);

  // Reloj en tiempo real
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('es-CL'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 1. INMERSIVIDAD Y PANTALLA COMPLETA AUTOMÁTICA
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
    } catch (e) {}
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

  // 2. SCREEN WAKE LOCK (Evitar que la pantalla de la tablet se apague)
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
      }
    } catch (err) {}
  };

  useEffect(() => {
    enterImmersiveFullscreen();
    requestWakeLock();

    try {
      if (typeof window !== 'undefined' && window.AndroidKiosk && window.AndroidKiosk.startKiosk) {
        window.AndroidKiosk.startKiosk();
      }
    } catch (kioskErr) {}

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

    // 3. BLOQUEO DE GESTOS Y BOTÓN ATRÁS
    history.pushState(null, '', window.location.href);
    const handlePopState = (e) => {
      e.preventDefault();
      history.pushState(null, '', window.location.href);
      enterImmersiveFullscreen();
    };
    window.addEventListener('popstate', handlePopState);

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

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

  // Enumerar cámaras físicas disponibles en la tablet
  const refreshCameraList = async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        setAvailableCameras(devices);
        return devices;
      }
    } catch (e) {
      console.warn('[KIOSK] Error al enumerar cámaras:', e);
    }
    return [];
  };

  useEffect(() => {
    refreshCameraList();
  }, []);

  // Iniciar Cámara con Fallback Progresivo para Tablets
  const startCamera = async (targetFacing = cameraFacingMode, targetId = selectedCameraId) => {
    setSwitchingCamera(true);
    setCameraError('');

    try {
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            await scannerRef.current.stop();
          }
        } catch (e) {}
      }

      const scannerId = "kiosk-reader-element";
      const html5QrCode = new Html5Qrcode(scannerId);
      scannerRef.current = html5QrCode;

      const config = {
        fps: 20,
        qrbox: { width: 260, height: 260 },
        aspectRatio: 1.0
      };

      const onScanSuccess = (decodedText) => {
        if (!isProcessingRef.current) {
          handleQrDetected(decodedText);
        }
      };

      let started = false;

      // Nivel 1: Si hay ID de cámara específico seleccionado
      if (targetId) {
        try {
          await html5QrCode.start(targetId, config, onScanSuccess, () => {});
          started = true;
        } catch (e) {
          console.warn('[KIOSK] Falló inicio con targetId, probando alternativas:', e);
        }
      }

      // Nivel 2: Intentar con facingMode solicitado ('user' o 'environment')
      if (!started) {
        try {
          await html5QrCode.start({ facingMode: targetFacing }, config, onScanSuccess, () => {});
          started = true;
        } catch (e) {
          console.warn(`[KIOSK] Falló facingMode ${targetFacing}, buscando cámaras físicas:`, e);
        }
      }

      // Nivel 3: Enumerar cámaras físicas y elegir la que coincida con front/back
      if (!started) {
        const devices = await refreshCameraList();
        if (devices && devices.length > 0) {
          let chosen = null;
          if (targetFacing === 'user') {
            chosen = devices.find(d => /front|delantera|user|frontal|selfie/i.test(d.label)) || devices[0];
          } else {
            chosen = devices.find(d => /back|rear|trasera|environment/i.test(d.label)) || devices[devices.length - 1];
          }

          if (chosen) {
            try {
              await html5QrCode.start(chosen.id, config, onScanSuccess, () => {});
              started = true;
              setSelectedCameraId(chosen.id);
            } catch (e) {
              console.warn('[KIOSK] Falló cámara preferida, probando cualquiera:', e);
              for (let dev of devices) {
                if (dev.id !== chosen.id) {
                  try {
                    await html5QrCode.start(dev.id, config, onScanSuccess, () => {});
                    started = true;
                    setSelectedCameraId(dev.id);
                    break;
                  } catch (errDev) {}
                }
              }
            }
          }
        }
      }

      // Nivel 4: Intento genérico sin restricciones
      if (!started) {
        await html5QrCode.start({}, config, onScanSuccess, () => {});
        started = true;
      }

      setIsScanning(true);
      setCameraError('');
      // Actualizar nombres de cámaras ahora que se tienen permisos concedidos
      refreshCameraList();

    } catch (err) {
      console.error("[KIOSK] Error general al iniciar cámara:", err);
      setCameraError("No se pudo activar la cámara (" + (err.message || 'Sin permisos') + "). Verifique los permisos de cámara en la tablet.");
      setIsScanning(false);
    } finally {
      setSwitchingCamera(false);
    }
  };

  useEffect(() => {
    startCamera(cameraFacingMode, selectedCameraId);

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [cameraFacingMode]);

  const toggleCameraFacing = (mode) => {
    if (cameraFacingMode === mode && isScanning) return;
    setCameraFacingMode(mode);
    localStorage.setItem('kiosk_camera_facing', mode);
    setSelectedCameraId('');
    localStorage.removeItem('kiosk_camera_id');
  };

  const handleQrDetected = async (token) => {
    wakeUpFromSleep('qr');
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setErrorMsg('');
    setScanResult(null);

    try {
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
      className={'fixed inset-0 z-50 flex flex-col justify-between p-3 sm:p-5 overflow-y-auto select-none touch-none overscroll-none ' + (isDark ? 'bg-black text-white' : 'bg-zinc-950 text-white')}
      style={{
        WebkitUserSelect: 'none',
        userSelect: 'none',
        touchAction: 'none',
        overscrollBehavior: 'none'
      }}
    >
      
      
      {/* PANTALLA EN SUSPENSIÓN INTELIGENTE (Ahorro Máximo de Batería con Sensor Activo) */}
      {isSleeping && (
        <div 
          onClick={() => wakeUpFromSleep('touch')}
          className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-between p-6 sm:p-10 select-none cursor-pointer animate-in fade-in duration-300"
          style={{ backgroundColor: '#000000' }}
        >
          {/* Barra superior de estado tenue */}
          <div className="w-full flex items-center justify-between opacity-30 hover:opacity-90 transition-opacity">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>Sensor Frontal Activo</span>
            </div>
            <div className="text-zinc-500 text-xs font-mono">
              {currentTime}
            </div>
          </div>

          {/* Centro: Ícono suave indicando proximidad */}
          <div className="text-center space-y-3 opacity-25 hover:opacity-90 transition-opacity">
            <div className="w-16 h-16 rounded-full border border-orange-500/30 flex items-center justify-center mx-auto text-orange-400 animate-pulse">
              <QrCode className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-black text-zinc-300">Modo Descanso • Ahorro de Batería</p>
              <p className="text-xs text-orange-400 mt-1 font-bold">Pase su teléfono frente a la cámara para marcar</p>
            </div>
          </div>

          {/* Pie tenue */}
          <div className="text-center opacity-20 hover:opacity-75 transition-opacity text-[10px] text-zinc-500 font-mono">
            Toque cualquier parte de la pantalla o acerque su credencial para despertar
          </div>
        </div>
      )}


      {/* Botón protegido para salir del modo Kiosco */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-50 flex items-center gap-2">
        {/* Botón oficial de Fiscalización Dirección del Trabajo (DT) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowDtModal(true);
          }}
          title="Portal de Fiscalización Laboral - Dirección del Trabajo (DT)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-blue-900/90 hover:bg-blue-600 border border-blue-400/50 text-white text-[10px] font-black transition-all cursor-pointer shadow-lg active:scale-95"
        >
          <DtLogo className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Fiscalización DT</span>
        </button>
        {/* Indicador de ahorro de batería y prueba de descanso */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            enterSleepMode();
          }}
          title="Suspender pantalla ahora para ahorrar batería"
          className="hidden xs:flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-zinc-900/90 border border-zinc-700 text-zinc-400 hover:text-orange-400 hover:border-orange-500/50 text-[10px] font-bold transition-all cursor-pointer shadow-lg"
        >
          <Moon className="w-3.5 h-3.5 text-orange-400" />
          <span>Ahorro Batería (5m)</span>
        </button>
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/15 border border-orange-500/40 text-[10px] font-black text-orange-400">
          <Shield className="w-3.5 h-3.5 animate-pulse" />
          <span>MODO KIOSCO PROTEGIDO</span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowUnlockModal(true);
            setAdminPassword('');
            setUnlockError('');
          }}
          title="Desbloquear Modo Kiosco"
          className="bg-black/85 hover:bg-orange-500 hover:text-black text-zinc-300 p-2 sm:p-2.5 rounded-2xl border border-orange-500/40 backdrop-blur-md transition-all shadow-2xl flex items-center gap-1.5 text-xs font-black cursor-pointer active:scale-95"
        >
          <Lock className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <span className="hidden xs:inline">Desbloquear y Salir</span>
        </button>
      </div>

      {/* Encabezado Kiosco con Logo y Reloj */}
      <div className="text-center pt-1 flex-shrink-0">
        <div className="flex items-center justify-center space-x-2.5 mb-1">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full overflow-hidden border-2 border-orange-500 shadow-xl shadow-orange-500/30 p-0.5 bg-black flex-shrink-0">
            <img src="/logo.png" alt="AsistenTruck" className="w-full h-full object-contain pointer-events-none" />
          </div>
          <div className="text-left">
            <h1 className="text-lg sm:text-2xl font-black tracking-tight leading-none text-white">
              ASISTEN<span className="text-orange-500">TRUCK</span>
            </h1>
            <p className="text-[9px] sm:text-[10px] text-orange-500 font-extrabold uppercase tracking-wider">
              INVERSIONES BOTAM SpA • RELOJ CONTROL
            </p>
          </div>
        </div>

        {/* Reloj Digital en Tiempo Real */}
        <div className="inline-block bg-black/85 border border-orange-500/40 rounded-2xl sm:rounded-3xl px-5 sm:px-8 py-1.5 shadow-2xl">
          <div className="text-2xl sm:text-4xl font-black font-mono tracking-widest text-orange-400 drop-shadow-[0_0_15px_rgba(249,115,22,0.4)]">
            {currentTime}
          </div>
          <div className="text-[10px] sm:text-[11px] text-zinc-400 font-bold capitalize">
            {currentDate}
          </div>
        </div>
      </div>

      {/* Centro: Cámara de Escaneo QR y Controles */}
      <div className="flex-1 flex flex-col items-center justify-center my-2 max-w-md mx-auto w-full relative">
        
        {/* Notificación de Marcación Exitosa */}
        {scanResult && (
          <div className="absolute inset-0 z-40 bg-black/95 border-2 border-orange-500 rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center mb-2 shadow-xl">
              <CheckCircle2 className="w-10 h-10" />
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

            <span className="text-xs font-black text-emerald-400 uppercase tracking-wider mb-0.5">
              Marcación Registrada
            </span>
            <h3 className="text-lg sm:text-xl font-black text-white leading-tight">
              {scanResult.user?.name || 'Trabajador'}
            </h3>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">RUT: {scanResult.user?.rut || 'Sin RUT'}</p>

            <div className="mt-3 bg-orange-500/20 border border-orange-500/50 rounded-2xl px-5 py-2">
              <div className="text-xs font-black text-orange-400 uppercase">
                {scanResult.label || scanResult.type}
              </div>
              <div className="text-xl sm:text-2xl font-black font-mono text-white mt-0.5">
                {scanResult.time}
              </div>
            </div>
          </div>
        )}

        {/* Notificación de Error en Marcación */}
        {errorMsg && (
          <div className="absolute top-2 left-2 right-2 z-40 bg-red-600/95 border-2 border-red-400 rounded-2xl p-3 shadow-2xl text-center animate-in fade-in slide-in-from-top-4 duration-200">
            <h4 className="text-sm font-black text-white">Error en Lectura QR</h4>
            <p className="text-xs text-red-200 mt-0.5 font-bold">{errorMsg}</p>
          </div>
        )}

        {/* SELECTOR DE CÁMARA PRINCIPAL - SIEMPRE VISIBLE ARRIBA DEL VISOR */}
        <div className="flex items-center justify-center gap-2 mb-2 w-full max-w-[300px] z-30">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleCameraFacing('user');
            }}
            disabled={switchingCamera}
            className={'flex-1 py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer ' + (
              cameraFacingMode === 'user'
                ? 'bg-orange-500 text-black border-2 border-orange-300 shadow-orange-500/30'
                : 'bg-zinc-900/90 text-zinc-400 border border-zinc-700 hover:text-white'
            )}
          >
            <FlipHorizontal className="w-4 h-4 flex-shrink-0" />
            <span>Cámara Delantera</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleCameraFacing('environment');
            }}
            disabled={switchingCamera}
            className={'flex-1 py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer ' + (
              cameraFacingMode === 'environment'
                ? 'bg-orange-500 text-black border-2 border-orange-300 shadow-orange-500/30'
                : 'bg-zinc-900/90 text-zinc-400 border border-zinc-700 hover:text-white'
            )}
          >
            <Camera className="w-4 h-4 flex-shrink-0" />
            <span>Cámara Trasera</span>
          </button>
        </div>

        {/* Visor de Cámara con Marco y Láser Naranja */}
        <div className="w-full max-w-[280px] sm:max-w-[300px] aspect-square rounded-3xl overflow-hidden border-4 border-orange-500/60 shadow-2xl relative bg-black flex items-center justify-center">
          <div id="kiosk-reader-element" className="w-full h-full object-cover pointer-events-none"></div>
          
          {/* Badge Indicador de Cámara Activa */}
          <div className="absolute top-2 left-2 z-20 bg-black/85 border border-orange-500/40 px-2.5 py-1 rounded-xl text-[10px] font-black text-orange-400 pointer-events-none flex items-center gap-1.5 shadow-md">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></div>
            <span>{cameraFacingMode === 'user' ? 'DELANTERA' : 'TRASERA'}</span>
          </div>

          {/* Botón de alternancia rápida dentro del visor */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleCameraFacing(cameraFacingMode === 'user' ? 'environment' : 'user');
            }}
            title="Cambiar Cámara"
            className="absolute top-2 right-2 z-20 bg-black/85 hover:bg-orange-500 hover:text-black text-orange-400 p-1.5 rounded-xl border border-orange-500/40 shadow-lg active:scale-95 cursor-pointer transition-all"
          >
            <RefreshCw className={'w-3.5 h-3.5 ' + (switchingCamera ? 'animate-spin' : '')} />
          </button>

          {/* Mira de Escaneo Naranja */}
          <div className="absolute inset-6 border-2 border-orange-500/60 rounded-2xl pointer-events-none flex flex-col justify-between p-2">
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

        {/* Mensaje de Error y Botón de Reintento */}
        {cameraError && (
          <div className="mt-2 p-2.5 bg-red-500/20 border border-red-500/40 rounded-2xl text-center space-y-1.5 w-full max-w-[300px] z-30">
            <p className="text-[11px] text-red-300 font-bold leading-tight">{cameraError}</p>
            <div className="flex gap-1.5 justify-center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCameraFacing('user');
                  startCamera('user');
                }}
                className="px-3 py-1 bg-orange-500 text-black text-[10px] font-black rounded-lg cursor-pointer"
              >
                Reintentar Delantera
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCameraFacing('environment');
                  startCamera('environment');
                }}
                className="px-3 py-1 bg-zinc-800 text-white text-[10px] font-black rounded-lg cursor-pointer"
              >
                Reintentar Trasera
              </button>
            </div>
          </div>
        )}

        <p className="text-[11px] sm:text-xs text-orange-400 font-extrabold uppercase tracking-wider mt-2 flex items-center gap-1.5 flex-shrink-0">
          <QrCode className="w-3.5 h-3.5 animate-pulse flex-shrink-0" />
          Acerque su Credencial Virtual al Lector
        </p>

        {/* Selector de dispositivo específico si la tablet reporta más de 2 cámaras */}
        {availableCameras.length > 2 && (
          <div className="mt-1 w-full max-w-[300px] text-center z-20">
            <select
              value={selectedCameraId}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedCameraId(val);
                localStorage.setItem('kiosk_camera_id', val);
                startCamera(cameraFacingMode, val);
              }}
              className="w-full bg-zinc-900 border border-zinc-700 text-zinc-300 text-[10px] rounded-xl px-2 py-1 font-mono"
            >
              <option value="">Cambiar sensor específico...</option>
              {availableCameras.map((c, i) => (
                <option key={c.id} value={c.id}>
                  {c.label || `Cámara ${i + 1} (${c.id.substring(0, 8)}...)`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Pie de Página con Indicaciones de las 4 Marcaciones */}
      <div className="max-w-md mx-auto w-full bg-black/85 border border-zinc-800 rounded-2xl p-2 sm:p-2.5 text-center flex-shrink-0 mt-1">
        <div className="grid grid-cols-4 gap-1 sm:gap-1.5 text-[9px] sm:text-[10px] font-black">
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
                type="button"
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
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  Contraseña de Administrador:
                </label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Ingrese clave de administrador..."
                  autoFocus
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowUnlockModal(false)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs py-3 rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={unlockLoading}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-black text-xs py-3 rounded-xl shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {unlockLoading ? 'Verificando...' : 'Desbloquear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
