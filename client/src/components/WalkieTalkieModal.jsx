import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Radio, Volume2, Users, User, X, Clock, ShieldCheck, CheckCircle2, AlertTriangle, Headphones, Bluetooth, Sparkles, Lock, Unlock, RefreshCw } from 'lucide-react';
import { apiGetUsers, apiGetAudioStatus, getFullPhotoUrl, getSocket } from '../api';

function playRadioBeep(frequency = 880, duration = 0.08) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

export default function WalkieTalkieModal({ isOpen, onClose, currentUser, theme }) {
  const [targetUserId, setTargetUserId] = useState('all');
  const [usersList, setUsersList] = useState([]);
  const [audioStatus, setAudioStatus] = useState({ allowed: true });
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [micPermissionError, setMicPermissionError] = useState(false);

  // Estados de Detección y Bloqueo Exclusivo de Audífonos
  const [headsetInfo, setHeadsetInfo] = useState({ connected: false, type: 'none', label: '' });
  const [isHeadsetLocked, setIsHeadsetLocked] = useState(false);
  const [scanningDevices, setScanningDevices] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const isRecordingRef = useRef(false);
  const startTalkingRef = useRef(null);
  const stopTalkingRef = useRef(null);
  const silentAudioRef = useRef(null);
  const silentIntervalRef = useRef(null);

  const isDark = theme === 'dark';
  const isMauricio = currentUser && (currentUser.is_superadmin === 1 || (currentUser.name && currentUser.name.toLowerCase().includes('mauricio')));

  // Detección automática y exhaustiva de audífonos (Bluetooth y con cable)
  const scanAudioDevices = async () => {
    setScanningDevices(true);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        // Solicitar permisos temporales si no tenemos etiquetas para poder leer el nombre del dispositivo
        let devices = await navigator.mediaDevices.enumerateDevices();
        const hasLabels = devices.some(d => d.label && d.label.trim() !== '');

        if (!hasLabels) {
          try {
            const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            tempStream.getTracks().forEach(t => t.stop());
            devices = await navigator.mediaDevices.enumerateDevices();
          } catch (permErr) {
            console.warn('Permiso audio preliminar:', permErr.message);
          }
        }

        // Filtrar estrictamente dispositivos de audio (descartar video, cámaras, pendrives y almacenamiento)
        const audioDevices = devices.filter(d => {
          if (d.kind !== 'audioinput' && d.kind !== 'audiooutput') return false;
          const lbl = (d.label || '').toLowerCase();
          if (/v[ií]deo|webcam|c[aá]mara|\bcam\b|storage|pendrive|flash|disk|drive|virtual|stereo mix|mezcla est[eé]reo|hdmi|displayport|realtek digital|nvidia/i.test(lbl)) {
            return false;
          }
          return true;
        });

        // Buscar audífonos bluetooth explícitos
        const bluetoothDevice = audioDevices.find(d => 
          /bluetooth|airpods|galaxy buds|freebuds|earbuds|buds|wh-|wf-|tune|live|jbl|sony|bose|sennheiser|jabber|plantronics|hyperx|wireless headset|wireless audio/i.test(d.label || '')
        );

        // Buscar audífonos alámbricos explícitos (headset, headphones, auriculares, cable, jack)
        const wiredDevice = audioDevices.find(d => 
          /headphone|headset|auriculares|aud[ií]fonos|auricular|earphones|manos libres|handsfree|jack|cable|wired/i.test(d.label || '')
        );

        if (bluetoothDevice) {
          setHeadsetInfo({
            connected: true,
            type: 'bluetooth',
            label: bluetoothDevice.label || 'Audífonos Bluetooth'
          });
        } else if (wiredDevice) {
          setHeadsetInfo({
            connected: true,
            type: 'wired',
            label: wiredDevice.label || 'Audífonos Alámbricos'
          });
        } else {
          setHeadsetInfo({
            connected: false,
            type: 'none',
            label: 'Micrófono del Dispositivo'
          });
        }
      }
    } catch (e) {
      console.log('Error escaneando dispositivos:', e.message);
    } finally {
      setScanningDevices(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      scanAudioDevices();
      if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
        navigator.mediaDevices.addEventListener('devicechange', scanAudioDevices);
      }
    }
    return () => {
      if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', scanAudioDevices);
      }
    };
  }, [isOpen]);

  // Cargar usuarios y estado de horario
  useEffect(() => {
    if (isOpen) {
      apiGetUsers().then((users) => {
        setUsersList(users.filter(u => u.id !== currentUser?.id));
      }).catch(() => {});

      apiGetAudioStatus().then((status) => {
        setAudioStatus(status);
      }).catch(() => {
        setAudioStatus({ allowed: true });
      });
    }
  }, [isOpen, currentUser]);

  // Cronómetro mientras habla
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordSeconds(s => s + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      setRecordSeconds(0);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  const startTalking = async () => {
    if (isRecordingRef.current) return;
    if (!audioStatus.allowed && !isMauricio) {
      alert(audioStatus.reason || 'Canal de audio fuera de horario.');
      return;
    }

    try {
      setMicPermissionError(false);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      playRadioBeep(920, 0.09);
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : 'audio/mp4');

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result;
          const targetUserObj = usersList.find(u => u.id === Number(targetUserId));
          const targetName = targetUserId === 'all' ? 'Canal General' : (targetUserObj?.name || 'Usuario');

          const payload = {
            fromUserId: currentUser.id,
            fromUserName: currentUser.name,
            fromUserPhoto: currentUser.photo_url,
            toUserId: targetUserId,
            toUserName: targetName,
            audioData: base64Audio,
            timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
          };

          const socket = getSocket();
          socket.emit('send_voice_audio', payload);
          playRadioBeep(650, 0.08);

          setStatusMsg(`✅ Mensaje enviado a ${targetName}`);
          setTimeout(() => setStatusMsg(''), 4000);
        };
      };

      recorder.start(250);
      isRecordingRef.current = true;
      setIsRecording(true);

    } catch (err) {
      console.error('Error al acceder al micrófono:', err);
      setMicPermissionError(true);
    }
  };

  const stopTalking = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      isRecordingRef.current = false;
      setIsRecording(false);
    }
  };

  startTalkingRef.current = startTalking;
  stopTalkingRef.current = stopTalking;

  // TOGGLE: BLOQUEAR / LIBERAR AUDÍFONOS EXCLUSIVOS PARA LA APLICACIÓN
  const toggleLockHeadset = () => {
    if (!isHeadsetLocked) {
      // 1. Activar sesión de audio silenciosa para capturar foco del sistema operativo
      try {
        if (!silentAudioRef.current) {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
          silentAudioRef.current = audioCtx;
        }
        if (silentAudioRef.current && silentAudioRef.current.state === 'suspended') {
          silentAudioRef.current.resume();
        }
      } catch (e) {}

      // 2. Establecer MediaSession con foco exclusivo para capturar eventos de botones de audífonos
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: 'Walkie-Talkie Asistentruck [BLOQUEADO]',
            artist: 'Inversiones BOTAM SpA',
            album: 'Canal de Voz en Terreno - Botón PTT Exclusivo'
          });
          navigator.mediaSession.playbackState = 'playing';

          const handleHeadsetAction = () => {
            if (isRecordingRef.current) {
              if (stopTalkingRef.current) stopTalkingRef.current();
            } else {
              if (startTalkingRef.current) startTalkingRef.current();
            }
          };

          navigator.mediaSession.setActionHandler('play', handleHeadsetAction);
          navigator.mediaSession.setActionHandler('pause', handleHeadsetAction);
          navigator.mediaSession.setActionHandler('stop', handleHeadsetAction);
          navigator.mediaSession.setActionHandler('previoustrack', handleHeadsetAction);
          navigator.mediaSession.setActionHandler('nexttrack', handleHeadsetAction);
          try { navigator.mediaSession.setActionHandler('togglemic', handleHeadsetAction); } catch (e) {}
        } catch (e) {}
      }

      setIsHeadsetLocked(true);
      playRadioBeep(1100, 0.12);
      setStatusMsg('🔒 Audífonos vinculados y bloqueados exclusivamente para la aplicación');
      setTimeout(() => setStatusMsg(''), 4500);
    } else {
      // Liberar audífonos para otros programas del celular / PC
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.playbackState = 'none';
          navigator.mediaSession.setActionHandler('play', null);
          navigator.mediaSession.setActionHandler('pause', null);
          navigator.mediaSession.setActionHandler('stop', null);
          navigator.mediaSession.setActionHandler('previoustrack', null);
          navigator.mediaSession.setActionHandler('nexttrack', null);
        } catch (e) {}
      }

      if (silentAudioRef.current && silentAudioRef.current.state === 'running') {
        silentAudioRef.current.suspend().catch(() => {});
      }

      setIsHeadsetLocked(false);
      playRadioBeep(550, 0.12);
      setStatusMsg('🔓 Audífonos liberados para otros programas');
      setTimeout(() => setStatusMsg(''), 4000);
    }
  };

  // Escucha de teclas de hardware de audífonos y eventos nativos
  useEffect(() => {
    if (!isOpen) return;

    const handleHardwareKeys = (e) => {
      const isHeadsetBtn = 
        e.keyCode === 179 || 
        e.keyCode === 79 || 
        e.keyCode === 85 || 
        e.keyCode === 176 || 
        e.keyCode === 177 ||
        e.key === 'MediaPlayPause' || 
        e.key === 'HeadsetHook' || 
        e.key === 'AudioVolumeMute';

      if (isHeadsetBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (isRecordingRef.current) {
          if (stopTalkingRef.current) stopTalkingRef.current();
        } else {
          if (startTalkingRef.current) startTalkingRef.current();
        }
      }
    };

    const handleNativeHeadset = () => {
      if (isRecordingRef.current) {
        if (stopTalkingRef.current) stopTalkingRef.current();
      } else {
        if (startTalkingRef.current) startTalkingRef.current();
      }
    };

    window.addEventListener('keydown', handleHardwareKeys, { capture: true });
    window.addEventListener('headset_button_event', handleNativeHeadset);

    return () => {
      window.removeEventListener('keydown', handleHardwareKeys, { capture: true });
      window.removeEventListener('headset_button_event', handleNativeHeadset);
    };
  }, [isOpen, isHeadsetLocked]);

  // Al desmontar, liberar sesión de audio
  useEffect(() => {
    return () => {
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.playbackState = 'none';
          navigator.mediaSession.setActionHandler('play', null);
          navigator.mediaSession.setActionHandler('pause', null);
          navigator.mediaSession.setActionHandler('stop', null);
          navigator.mediaSession.setActionHandler('previoustrack', null);
          navigator.mediaSession.setActionHandler('nexttrack', null);
        } catch (e) {}
      }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[99999] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={'border rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl flex flex-col justify-between space-y-3.5 ' + (isDark ? 'bg-zinc-950 border-orange-500/30 text-white' : 'bg-white border-orange-200 text-zinc-900')}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between pb-3 border-b border-orange-500/20">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-orange-500 text-black flex items-center justify-center font-black shadow-lg shadow-orange-500/30">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-1.5">
                Walkie-Talkie en Vivo
              </h3>
              <p className="text-[11px] text-orange-500 font-bold">Audio bidireccional en tiempo real</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-orange-500/10 text-zinc-400 hover:text-orange-500 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5 flex-shrink-0" />
          </button>
        </div>

        {/* ========================================================================= */}
        {/* BOTÓN INTERACTIVO: RECONOCIMIENTO Y BLOQUEO EXCLUSIVO DE AUDÍFONOS */}
        {/* ========================================================================= */}
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={toggleLockHeadset}
            className={'w-full p-3 rounded-2xl border text-xs flex items-center justify-between gap-2.5 transition-all shadow-md active:scale-98 cursor-pointer ' + (
              isHeadsetLocked
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 border-emerald-400 text-white shadow-emerald-500/25'
                : (headsetInfo.connected
                    ? (isDark ? 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-500 text-blue-300' : 'bg-blue-50 hover:bg-blue-100 border-blue-400 text-blue-950')
                    : (isDark ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-orange-50 hover:bg-orange-100 border-orange-300 text-zinc-900'))
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
              <div className={'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-bold ' + (
                isHeadsetLocked
                  ? 'bg-black text-emerald-400 animate-pulse'
                  : (headsetInfo.connected ? 'bg-blue-500 text-white' : 'bg-orange-500 text-black')
              )}>
                {headsetInfo.type === 'bluetooth' ? (
                  <Bluetooth className="w-4 h-4" />
                ) : (
                  <Headphones className="w-4 h-4" />
                )}
              </div>

              <div className="text-left min-w-0 flex-1 overflow-hidden pr-1">
                <div className="text-xs font-black truncate flex items-center gap-1.5 leading-tight">
                  <span className="truncate">{headsetInfo.connected ? (headsetInfo.label || 'Audífonos Detectados') : 'Reconocer Audífonos (Cable / Bluetooth)'}</span>
                  {isHeadsetLocked && <span className="w-2 h-2 rounded-full bg-white animate-ping flex-shrink-0"></span>}
                </div>
                <div className={'text-[10px] leading-tight truncate mt-0.5 ' + (isHeadsetLocked ? 'text-emerald-100 font-bold' : (isDark ? 'text-zinc-400' : 'text-zinc-600'))}>
                  {isHeadsetLocked
                    ? '🔒 Bloqueados para app • Botón exclusivo'
                    : (headsetInfo.connected
                        ? 'Toca para vincular y bloquear botones'
                        : 'Conecta tus audífonos y presiona para activar')}
                </div>
              </div>
            </div>

            <div className={'flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-1.5 rounded-xl flex-shrink-0 shadow-sm ml-auto ' + (
              isHeadsetLocked
                ? 'bg-black text-emerald-400 border border-emerald-400/50'
                : 'bg-orange-500 text-black'
            )}>
              {isHeadsetLocked ? (
                <>
                  <Unlock className="w-3 h-3 flex-shrink-0" />
                  <span>Liberar</span>
                </>
              ) : (
                <>
                  <Lock className="w-3 h-3 flex-shrink-0" />
                  <span>Vincular</span>
                </>
              )}
            </div>
          </button>

          {/* Botón secundario para refrescar / reescanear dispositivos */}
          <div className="flex items-center justify-between px-1 text-[10px] text-zinc-400">
            <span className="flex items-center gap-1">
              <span className={'w-1.5 h-1.5 rounded-full ' + (headsetInfo.connected ? 'bg-emerald-500' : 'bg-amber-500')}></span>
              {headsetInfo.connected ? `Dispositivo activo: ${headsetInfo.label}` : 'Usando micrófono del dispositivo'}
            </span>
            <button
              type="button"
              onClick={scanAudioDevices}
              className="text-orange-500 hover:text-orange-400 font-bold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={'w-3 h-3 ' + (scanningDevices ? 'animate-spin' : '')} />
              <span>Detectar Nuevamente</span>
            </button>
          </div>
        </div>

        {/* Indicador de Horario y Disponibilidad */}
        <div className={'p-2.5 rounded-2xl border text-xs flex items-center justify-between ' + (
          isMauricio 
            ? (isDark ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'bg-orange-100 border-orange-300 text-orange-950 font-bold') 
            : (audioStatus.allowed 
                ? (isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-100 border-emerald-300 text-emerald-950 font-bold') 
                : (isDark ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-red-100 border-red-300 text-red-950 font-bold'))
        )}>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 flex-shrink-0" />
            <div className="text-[11px]">
              {isMauricio ? (
                <span><strong>Admin Mauricio:</strong> Libre disposición 24/7 sin restricción</span>
              ) : audioStatus.allowed ? (
                <span><strong>Canal Activo:</strong> Lun-Jue 09:00-18:00 • Vie 09:00-17:30</span>
              ) : (
                <span><strong>Canal Cerrado:</strong> {audioStatus.reason || 'Fuera de horario'}</span>
              )}
            </div>
          </div>
          {audioStatus.allowed || isMauricio ? (
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping flex-shrink-0"></span>
          ) : (
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0"></span>
          )}
        </div>

        {micPermissionError && (
          <div className="bg-red-500/15 border border-red-500/30 text-red-400 text-xs p-3 rounded-2xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Permita el acceso al micrófono en su navegador para hablar por audio.</span>
          </div>
        )}

        {statusMsg && (
          <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs p-2.5 rounded-2xl flex items-center justify-center gap-2 font-bold animate-pulse text-center">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Selector de Destinatario */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-black uppercase text-orange-500 tracking-wider flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 flex-shrink-0" />
            Hablar con:
          </label>
          <div className="grid grid-cols-1 gap-1.5 max-h-[220px] overflow-y-auto pr-1">
            <button
              onClick={() => setTargetUserId('all')}
              className={'py-2 px-3 rounded-2xl border flex items-center justify-between text-xs font-bold transition-all cursor-pointer ' + (
                targetUserId === 'all'
                  ? 'bg-orange-500 text-black border-orange-500 shadow-md shadow-orange-500/30 font-black'
                  : (isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800' : 'bg-orange-50/80 border-orange-200 text-zinc-900 hover:bg-orange-100')
              )}
            >
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 flex-shrink-0" />
                <span>📢 Canal General (Todos los trabajadores)</span>
              </div>
              {targetUserId === 'all' && <CheckCircle2 className="w-4 h-4 text-black flex-shrink-0" />}
            </button>

            {usersList.map((u) => {
              const isSelected = targetUserId === String(u.id);
              return (
                <button
                  key={u.id}
                  onClick={() => setTargetUserId(String(u.id))}
                  className={'py-2 px-3 rounded-2xl border flex items-center justify-between text-xs font-bold transition-all cursor-pointer ' + (
                    isSelected
                      ? 'bg-orange-500 text-black border-orange-500 shadow-md shadow-orange-500/30 font-black'
                      : (isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800' : 'bg-orange-50/80 border-orange-200 text-zinc-900 hover:bg-orange-100')
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-black flex items-center justify-center border border-orange-500/50 flex-shrink-0">
                      {u.photo_url ? (
                        <img src={getFullPhotoUrl(u.photo_url)} alt={u.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-orange-400 font-bold">{u.name.charAt(0)}</span>
                      )}
                    </div>
                    <span className="truncate">{u.name}</span>
                    <span className="text-[9px] text-orange-500 font-bold uppercase font-mono">({u.role === 'admin' || u.role === 'superadmin' ? 'Admin' : 'Trabajador'})</span>
                  </div>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-black flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* BOTÓN PUSH-TO-TALK Y SOPORTE DE AUDÍFONOS */}
        <div className="pt-2 flex flex-col items-center justify-center space-y-2.5">
          
          <button
            onMouseDown={startTalking}
            onMouseUp={stopTalking}
            onTouchStart={startTalking}
            onTouchEnd={stopTalking}
            disabled={!audioStatus.allowed && !isMauricio}
            className={'w-28 h-28 rounded-full border-4 flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-2xl ' + (
              isRecording
                ? 'bg-red-600 border-red-300 text-white shadow-red-600/50 scale-105 animate-pulse'
                : (audioStatus.allowed || isMauricio
                  ? 'bg-orange-500 border-black hover:bg-orange-600 text-black shadow-orange-500/40 hover:scale-105 cursor-pointer'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-600 cursor-not-allowed')
            )}
          >
            {isRecording ? (
              <>
                <Volume2 className="w-9 h-9 animate-bounce flex-shrink-0" />
                <span className="text-[10px] font-black uppercase mt-1">Soltar</span>
              </>
            ) : (
              <>
                <Mic className="w-9 h-9 flex-shrink-0" />
                <span className="text-[10px] font-black uppercase mt-1">Hablar</span>
              </>
            )}
          </button>

          <div className="text-center space-y-1">
            {isRecording ? (
              <div className="flex items-center justify-center gap-1.5 text-red-400 font-black text-xs">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                <span>TRANSMITIENDO EN VIVO... ({recordSeconds}s)</span>
              </div>
            ) : (
              <p className="text-[11px] text-zinc-400">
                {isHeadsetLocked ? (
                  <span className="text-emerald-400 font-bold">🟢 Botón de audífonos vinculado: Presione el botón de sus audífonos para hablar.</span>
                ) : (
                  <span>Mantenga presionado para hablar o vincule sus audífonos arriba.</span>
                )}
              </p>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
