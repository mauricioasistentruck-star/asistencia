import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, Radio, Volume2, Users, User, X, Clock, ShieldCheck, CheckCircle2, 
  AlertTriangle, Headphones, Bluetooth, Sparkles, Lock, Unlock, RefreshCw, 
  Play, Pause, RotateCcw, MessageSquare, Search, Trash2, Check, Globe
} from 'lucide-react';
import { apiGetUsers, apiGetAudioStatus, apiGetVoiceMessages, apiDeleteVoiceMessage, getFullPhotoUrl, getSocket } from '../api';

// Generador de Beep tipo Radio Motorola / Walkie-Talkie
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

// Audio silencioso base64 de 1 segundo en loop para mantener el foco MediaSession activo en el sistema operativo
const SILENT_WAV_BASE64 = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAP8A/wD/';

export default function WalkieTalkieModal({ isOpen, onClose, currentUser, theme }) {
  // Modal view: 'all_in_one'
  const [targetMode, setTargetMode] = useState('all'); // 'all' (Canal General) o 'manual' (Personal específico)
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Estado de horario y permisos
  const [audioStatus, setAudioStatus] = useState({ allowed: true });
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [micPermissionError, setMicPermissionError] = useState(false);

  // Estados de Audífonos Bluetooth / Cable
  const [headsetInfo, setHeadsetInfo] = useState({ connected: false, type: 'none', label: '' });
  const [isHeadsetLocked, setIsHeadsetLocked] = useState(false);
  const [scanningDevices, setScanningDevices] = useState(false);

  // Historial / Chat de Audios
  const [voiceMessages, setVoiceMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [currentPlayingId, setCurrentPlayingId] = useState(null);
  const [audioProgress, setAudioProgress] = useState(0);

  // Referencias
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const isRecordingRef = useRef(false);
  const startTalkingRef = useRef(null);
  const stopTalkingRef = useRef(null);
  const toggleTalkingRef = useRef(null);
  const silentAudioElementRef = useRef(null);
  const activeAudioPlayerRef = useRef(null);
  const progressIntervalRef = useRef(null);

  const isDark = theme === 'dark';
  const isMauricio = currentUser && (currentUser.is_superadmin === 1 || (currentUser.name && currentUser.name.toLowerCase().includes('mauricio')));

  // Detección de dispositivos de audio
  const scanAudioDevices = async () => {
    setScanningDevices(true);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        let devices = await navigator.mediaDevices.enumerateDevices();
        const hasLabels = devices.some(d => d.label && d.label.trim() !== '');

        if (!hasLabels) {
          try {
            const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            tempStream.getTracks().forEach(t => t.stop());
            devices = await navigator.mediaDevices.enumerateDevices();
          } catch (permErr) {}
        }

        const audioDevices = devices.filter(d => {
          if (d.kind !== 'audioinput' && d.kind !== 'audiooutput') return false;
          const lbl = (d.label || '').toLowerCase();
          if (/v[ií]deo|webcam|c[aá]mara|\bcam\b|storage|pendrive|flash|disk|drive|virtual|stereo mix|mezcla est[eé]reo|hdmi|displayport|realtek digital|nvidia/i.test(lbl)) {
            return false;
          }
          return true;
        });

        const bluetoothDevice = audioDevices.find(d => 
          /bluetooth|airpods|galaxy buds|freebuds|earbuds|buds|wh-|wf-|tune|live|jbl|sony|bose|sennheiser|jabber|plantronics|hyperx|wireless headset|wireless audio|tws/i.test(d.label || '')
        );

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

  // Cargar lista de usuarios, historial de audios y estado
  const loadVoiceHistory = async () => {
    setLoadingMessages(true);
    try {
      const messages = await apiGetVoiceMessages();
      setVoiceMessages(messages || []);
    } catch (e) {
      console.warn('Error cargando historial de audios:', e.message);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      scanAudioDevices();
      loadVoiceHistory();

      apiGetUsers().then((users) => {
        const otherUsers = users.filter(u => u.id !== currentUser?.id);
        setUsersList(otherUsers);
        if (selectedUserIds.length === 0 && otherUsers.length > 0) {
          setSelectedUserIds(otherUsers.map(u => u.id));
        }
      }).catch(() => {});

      apiGetAudioStatus().then((status) => {
        setAudioStatus(status);
      }).catch(() => {
        setAudioStatus({ allowed: true });
      });

      if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
        navigator.mediaDevices.addEventListener('devicechange', scanAudioDevices);
      }
    }

    return () => {
      if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', scanAudioDevices);
      }
      stopAudioPlayback();
    };
  }, [isOpen, currentUser]);

  // Escucha en tiempo real de nuevos mensajes de audio vía Socket
  useEffect(() => {
    if (!isOpen) return;

    const socket = getSocket();

    const handleNewVoiceMessage = (msg) => {
      setVoiceMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [msg, ...prev];
      });
    };

    socket.on('receive_voice_audio', handleNewVoiceMessage);
    socket.on('voice_audio_saved', handleNewVoiceMessage);

    return () => {
      socket.off('receive_voice_audio', handleNewVoiceMessage);
      socket.off('voice_audio_saved', handleNewVoiceMessage);
    };
  }, [isOpen]);

  // Temporizador de grabación
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

  // =========================================================================
  // FUNCIONES DE GRABACIÓN Y TRANSMISIÓN PTT
  // =========================================================================
  const startTalking = async () => {
    if (isRecordingRef.current) return;
    if (!audioStatus.allowed && !isMauricio) {
      alert(audioStatus.reason || 'Canal de audio fuera de horario.');
      return;
    }
    if (targetMode === 'manual' && selectedUserIds.length === 0) {
      setStatusMsg('⚠️ Seleccione al menos un colaborador o active Canal General.');
      setTimeout(() => setStatusMsg(''), 4000);
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

      playRadioBeep(940, 0.1);
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/webm') 
            ? 'audio/webm' 
            : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/ogg'));

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const blobType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
        
        if (audioBlob.size === 0) {
          console.warn('Audio grabado sin contenido');
          return;
        }

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result;
          const isGeneral = targetMode === 'all';
          const targetUsers = usersList.filter(u => selectedUserIds.includes(u.id));
          const targetNames = isGeneral ? ['Canal General (Todos)'] : targetUsers.map(u => u.name);
          const targetIds = isGeneral ? ['all'] : selectedUserIds;

          const payload = {
            fromUserId: currentUser.id,
            fromUserName: currentUser.name,
            fromUserPhoto: currentUser.photo_url,
            toUserId: isGeneral ? 'all' : undefined,
            targetUserIds: targetIds,
            targetUserNames: targetNames,
            audioData: base64Audio,
            durationSeconds: recordSeconds || 1,
            timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
          };

          const socket = getSocket();
          socket.emit('send_voice_audio', payload);
          playRadioBeep(620, 0.09);

          const destText = isGeneral ? 'Canal General (Todos los usuarios)' : (targetNames.length === 1 ? targetNames[0] : `${targetNames.length} colaboradores`);
          setStatusMsg(`✅ Audio transmitido en vivo a ${destText}`);
          setTimeout(() => setStatusMsg(''), 4000);
        };
      };

      recorder.start(100);
      isRecordingRef.current = true;
      setIsRecording(true);

    } catch (err) {
      console.error('Error al acceder al micrófono:', err);
      setMicPermissionError(true);
    }
  };

  const stopTalking = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.requestData();
        }
      } catch (e) {}

      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      }, 60);

      isRecordingRef.current = false;
      setIsRecording(false);
    }
  };

  // Alternar hablar/enviar con 1 clic (Toggle central button)
  const toggleTalking = () => {
    if (isRecordingRef.current) {
      stopTalking();
    } else {
      startTalking();
    }
  };

  startTalkingRef.current = startTalking;
  stopTalkingRef.current = stopTalking;
  toggleTalkingRef.current = toggleTalking;

  // =========================================================================
  // VINCULACIÓN Y BLOQUEO DEL BOTÓN DE AUDÍFONO BLUETOOTH (1 Clic = Hablar / 2do Clic = Enviar)
  // =========================================================================
  const toggleLockHeadset = async () => {
    if (!isHeadsetLocked) {
      try {
        if (!silentAudioElementRef.current) {
          const audioEl = new Audio(SILENT_WAV_BASE64);
          audioEl.loop = true;
          audioEl.volume = 0.01;
          silentAudioElementRef.current = audioEl;
        }
        await silentAudioElementRef.current.play();
      } catch (e) {
        console.warn('Silent audio play:', e.message);
      }

      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: 'Walkie-Talkie Asistentruck [BOTÓN AUDÍFONO ACTIVO]',
            artist: '1 Clic: Hablar | 2 Clics: Enviar Audio',
            album: 'Inversiones BOTAM SpA - Canal de Voz en Terreno'
          });
          navigator.mediaSession.playbackState = 'playing';

          const handleHeadsetCentralButton = () => {
            if (toggleTalkingRef.current) {
              toggleTalkingRef.current();
            }
          };

          navigator.mediaSession.setActionHandler('play', handleHeadsetCentralButton);
          navigator.mediaSession.setActionHandler('pause', handleHeadsetCentralButton);
          navigator.mediaSession.setActionHandler('stop', handleHeadsetCentralButton);
          navigator.mediaSession.setActionHandler('previoustrack', handleHeadsetCentralButton);
          navigator.mediaSession.setActionHandler('nexttrack', handleHeadsetCentralButton);
          navigator.mediaSession.setActionHandler('seekbackward', handleHeadsetCentralButton);
          navigator.mediaSession.setActionHandler('seekforward', handleHeadsetCentralButton);
          try { navigator.mediaSession.setActionHandler('togglemic', handleHeadsetCentralButton); } catch (e) {}
        } catch (e) {}
      }

      setIsHeadsetLocked(true);
      playRadioBeep(1150, 0.12);
      setStatusMsg('🎧 Audífonos vinculados: 1 clic en botón central para hablar, 2do clic para enviar.');
      setTimeout(() => setStatusMsg(''), 5000);
    } else {
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

      if (silentAudioElementRef.current) {
        try {
          silentAudioElementRef.current.pause();
        } catch (e) {}
      }

      setIsHeadsetLocked(false);
      playRadioBeep(520, 0.12);
      setStatusMsg('🔓 Botón de audífonos liberado');
      setTimeout(() => setStatusMsg(''), 4000);
    }
  };

  // Escucha de eventos de hardware / teclas de audífonos
  useEffect(() => {
    if (!isOpen) return;

    const handleHardwareHeadsetKeys = (e) => {
      const isHeadsetBtn = 
        e.keyCode === 179 || 
        e.keyCode === 79 || 
        e.keyCode === 85 || 
        e.keyCode === 176 || 
        e.keyCode === 177 ||
        e.keyCode === 226 ||
        e.key === 'MediaPlayPause' || 
        e.key === 'HeadsetHook' || 
        e.key === 'AudioVolumeMute' ||
        e.key === 'F8';

      if (isHeadsetBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (toggleTalkingRef.current) {
          toggleTalkingRef.current();
        }
      }
    };

    const handleCustomHeadsetEvent = () => {
      if (toggleTalkingRef.current) {
        toggleTalkingRef.current();
      }
    };

    window.addEventListener('keydown', handleHardwareHeadsetKeys, { capture: true });
    window.addEventListener('headset_button_event', handleCustomHeadsetEvent);

    return () => {
      window.removeEventListener('keydown', handleHardwareHeadsetKeys, { capture: true });
      window.removeEventListener('headset_button_event', handleCustomHeadsetEvent);
    };
  }, [isOpen]);

  // =========================================================================
  // REPRODUCCIÓN DEL HISTORIAL DE AUDIOS (REPETIR Y ESCUCHAR MENSAJES)
  // =========================================================================
  const stopAudioPlayback = () => {
    if (activeAudioPlayerRef.current) {
      try {
        activeAudioPlayerRef.current.pause();
        activeAudioPlayerRef.current.currentTime = 0;
      } catch (e) {}
      activeAudioPlayerRef.current = null;
    }
    clearInterval(progressIntervalRef.current);
    setCurrentPlayingId(null);
    setAudioProgress(0);
  };

  const playVoiceMessage = (msg) => {
    if (currentPlayingId === msg.id) {
      stopAudioPlayback();
      return;
    }

    stopAudioPlayback();

    const audioSource = msg.audio_url ? getFullPhotoUrl(msg.audio_url) : (msg.audioData || msg.audio_data);
    if (!audioSource) return;

    try {
      let playUrl = audioSource;
      if (audioSource.startsWith('data:audio')) {
        const parts = audioSource.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'audio/webm';
        const byteCharacters = atob(parts[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mime });
        playUrl = URL.createObjectURL(blob);
      }

      const audio = new Audio(playUrl);
      audio.volume = 1.0;
      activeAudioPlayerRef.current = audio;
      setCurrentPlayingId(msg.id);

      audio.play().then(() => {
        progressIntervalRef.current = setInterval(() => {
          if (audio.duration && !isNaN(audio.duration)) {
            setAudioProgress((audio.currentTime / audio.duration) * 100);
          }
        }, 100);
      }).catch((err) => {
        console.warn('Error al reproducir audio:', err.message);
        stopAudioPlayback();
      });

      audio.onended = () => {
        stopAudioPlayback();
      };

      audio.onerror = () => {
        stopAudioPlayback();
      };
    } catch (e) {
      stopAudioPlayback();
    }
  };

  const repeatVoiceMessage = (msg) => {
    stopAudioPlayback();
    playVoiceMessage(msg);
  };

  const handleDeleteMessage = async (msgId, e) => {
    e.stopPropagation();
    try {
      await apiDeleteVoiceMessage(msgId);
      setVoiceMessages(prev => prev.filter(m => m.id !== msgId));
    } catch (err) {
      alert('Error eliminando audio: ' + err.message);
    }
  };

  // Gestión de selección manual de colaboradores
  const toggleUserSelection = (userId) => {
    setSelectedUserIds(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  const selectAllUsers = () => {
    setSelectedUserIds(usersList.map(u => u.id));
  };

  const deselectAllUsers = () => {
    setSelectedUserIds([]);
  };

  const filteredUsers = usersList.filter(u => 
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.rut?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.role?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[99999] flex items-center justify-center p-2.5 sm:p-4" onClick={onClose}>
      <div
        className={'border rounded-3xl max-w-lg w-full max-h-[95vh] p-3.5 sm:p-5 shadow-2xl flex flex-col justify-between space-y-2.5 overflow-hidden ' + (isDark ? 'bg-zinc-950 border-orange-500/30 text-white' : 'bg-white border-orange-200 text-zinc-900')}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between pb-2 border-b border-orange-500/20">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-orange-500 text-black flex items-center justify-center font-black shadow-lg shadow-orange-500/30 flex-shrink-0">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight flex items-center gap-1.5 leading-tight">
                Walkie-Talkie & Chat de Voz
              </h3>
              <p className="text-[11px] text-orange-500 font-bold leading-tight">Transmisión en directo y repetición de audios</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-orange-500/10 text-zinc-400 hover:text-orange-500 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5 flex-shrink-0" />
          </button>
        </div>

        {/* Contenido desplazable */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[75vh]">
          
          {/* ========================================================================= */}
          {/* BOTÓN VINCULACIÓN AUDÍFONO BLUETOOTH */}
          {/* ========================================================================= */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={toggleLockHeadset}
              className={'w-full p-2.5 rounded-2xl border text-xs flex items-center justify-between gap-2.5 transition-all shadow-md active:scale-98 cursor-pointer ' + (
                isHeadsetLocked
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 border-emerald-400 text-white shadow-emerald-500/25'
                  : (headsetInfo.connected
                      ? (isDark ? 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-500 text-blue-300' : 'bg-blue-50 hover:bg-blue-100 border-blue-400 text-blue-950')
                      : (isDark ? 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-orange-50 hover:bg-orange-100 border-orange-300 text-zinc-900'))
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                <div className={'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 font-bold ' + (
                  isHeadsetLocked
                    ? 'bg-black text-emerald-400 animate-pulse'
                    : (headsetInfo.connected ? 'bg-blue-500 text-white' : 'bg-orange-500 text-black')
                )}>
                  {headsetInfo.type === 'bluetooth' ? <Bluetooth className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
                </div>

                <div className="text-left min-w-0 flex-1 overflow-hidden pr-1">
                  <div className="text-xs font-black truncate flex items-center gap-1.5 leading-tight">
                    <span className="truncate">{headsetInfo.connected ? (headsetInfo.label || 'Audífonos Detectados') : 'Vincular Botón Central de Audífonos'}</span>
                    {isHeadsetLocked && <span className="w-2 h-2 rounded-full bg-white animate-ping flex-shrink-0"></span>}
                  </div>
                  <div className={'text-[10px] leading-tight truncate mt-0.5 ' + (isHeadsetLocked ? 'text-emerald-100 font-bold' : (isDark ? 'text-zinc-400' : 'text-zinc-600'))}>
                    {isHeadsetLocked
                      ? '🎧 1 Clic en audífono: Hablar • 2do Clic: Enviar'
                      : 'Presione para hablar directamente con el botón de su audífono'}
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

            <div className="flex items-center justify-between px-1 text-[10px] text-zinc-400">
              <span className="truncate flex items-center gap-1">
                <span className={'w-1.5 h-1.5 rounded-full ' + (headsetInfo.connected ? 'bg-emerald-500' : 'bg-amber-500')}></span>
                {headsetInfo.connected ? headsetInfo.label : 'Micrófono del teléfono/PC'}
              </span>
              <button
                type="button"
                onClick={scanAudioDevices}
                className="text-orange-500 hover:text-orange-400 font-bold flex items-center gap-1 cursor-pointer flex-shrink-0"
              >
                <RefreshCw className={'w-3 h-3 ' + (scanningDevices ? 'animate-spin' : '')} />
                <span>Detectar</span>
              </button>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SELECCIÓN DE CANAL: CANAL GENERAL (TODOS) O PERSONAL ESPECÍFICO */}
          {/* ========================================================================= */}
          <div className="space-y-1.5 p-2.5 rounded-2xl border border-orange-500/20 bg-orange-500/5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black uppercase text-orange-500 tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Transmitir a:</span>
              </label>

              <div className="flex items-center gap-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => setTargetMode('all')}
                  className={'px-2.5 py-1 rounded-lg font-black transition-all cursor-pointer flex items-center gap-1 ' + (
                    targetMode === 'all'
                      ? 'bg-orange-500 text-black shadow-sm'
                      : (isDark ? 'bg-zinc-800 text-zinc-400 hover:text-white' : 'bg-zinc-200 text-zinc-700 hover:text-black')
                  )}
                >
                  <Globe className="w-3 h-3" />
                  <span>Canal General (Todos)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetMode('manual')}
                  className={'px-2.5 py-1 rounded-lg font-black transition-all cursor-pointer flex items-center gap-1 ' + (
                    targetMode === 'manual'
                      ? 'bg-orange-500 text-black shadow-sm'
                      : (isDark ? 'bg-zinc-800 text-zinc-400 hover:text-white' : 'bg-zinc-200 text-zinc-700 hover:text-black')
                  )}
                >
                  <Users className="w-3 h-3" />
                  <span>Personal Específico ({selectedUserIds.length})</span>
                </button>
              </div>
            </div>

            {/* Si está en modo Manual, mostrar selector con buscador */}
            {targetMode === 'manual' && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between gap-1 text-[10px]">
                  <div className="relative flex-1">
                    <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Filtrar colaborador por nombre..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={'w-full pl-7 pr-2 py-1 text-xs rounded-xl border outline-none ' + (
                        isDark ? 'bg-zinc-900 border-zinc-800 text-white placeholder-zinc-500' : 'bg-white border-zinc-200 text-zinc-900 placeholder-zinc-400'
                      )}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={selectAllUsers}
                    className="px-2 py-1 rounded-lg bg-orange-500/20 text-orange-400 font-bold hover:bg-orange-500/30 cursor-pointer"
                  >
                    Marcar Todos
                  </button>
                  <button
                    type="button"
                    onClick={deselectAllUsers}
                    className="px-2 py-1 rounded-lg bg-zinc-700/50 text-zinc-300 font-bold hover:bg-zinc-700 cursor-pointer"
                  >
                    Limpiar
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-[110px] overflow-y-auto pr-1">
                  {filteredUsers.map((u) => {
                    const isSelected = selectedUserIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleUserSelection(u.id)}
                        className={'py-1.5 px-2 rounded-xl border flex items-center justify-between text-xs transition-all cursor-pointer ' + (
                          isSelected
                            ? 'bg-orange-500 text-black border-orange-500 font-black shadow-sm'
                            : (isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800' : 'bg-white border-zinc-200 text-zinc-800 hover:bg-orange-50')
                        )}
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                          <div className="w-5 h-5 rounded-full overflow-hidden bg-black flex items-center justify-center border border-orange-500/50 flex-shrink-0">
                            {u.photo_url ? (
                              <img src={getFullPhotoUrl(u.photo_url)} alt={u.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[9px] text-orange-400 font-bold">{u.name.charAt(0)}</span>
                            )}
                          </div>
                          <span className="truncate text-left text-[11px] leading-tight">{u.name}</span>
                        </div>
                        <div className={'w-3.5 h-3.5 rounded-md flex items-center justify-center flex-shrink-0 ml-1 border ' + (
                          isSelected ? 'bg-black text-orange-400 border-black' : 'border-zinc-500'
                        )}>
                          {isSelected && <Check className="w-2.5 h-2.5" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Mensajes de Estado */}
          {statusMsg && (
            <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs p-2 rounded-2xl flex items-center justify-center gap-2 font-bold animate-pulse text-center">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          {micPermissionError && (
            <div className="bg-red-500/15 border border-red-500/30 text-red-400 text-xs p-2 rounded-2xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Permita el acceso al micrófono para hablar.</span>
            </div>
          )}

          {/* ========================================================================= */}
          {/* BOTÓN PUSH-TO-TALK / 1 CLIC PARA HABLAR EN VIVO */}
          {/* ========================================================================= */}
          <div className="flex flex-col items-center justify-center py-1 space-y-1.5">
            <button
              type="button"
              onClick={toggleTalking}
              onMouseDown={startTalking}
              onMouseUp={stopTalking}
              onTouchStart={startTalking}
              onTouchEnd={stopTalking}
              disabled={(!audioStatus.allowed && !isMauricio) || (targetMode === 'manual' && selectedUserIds.length === 0)}
              className={'w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-2xl ' + (
                isRecording
                  ? 'bg-red-600 border-red-300 text-white shadow-red-600/50 scale-105 animate-pulse'
                  : ((targetMode === 'manual' && selectedUserIds.length === 0)
                      ? 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed'
                      : (audioStatus.allowed || isMauricio
                          ? 'bg-orange-500 border-black hover:bg-orange-600 text-black shadow-orange-500/40 hover:scale-105 cursor-pointer'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-600 cursor-not-allowed'))
              )}
            >
              {isRecording ? (
                <>
                  <Volume2 className="w-8 h-8 sm:w-9 sm:h-9 animate-bounce flex-shrink-0" />
                  <span className="text-[9px] font-black uppercase mt-0.5">Enviar (2º Clic)</span>
                </>
              ) : (
                <>
                  <Mic className="w-8 h-8 sm:w-9 sm:h-9 flex-shrink-0" />
                  <span className="text-[9px] font-black uppercase mt-0.5">Hablar (1 Clic)</span>
                </>
              )}
            </button>

            <div className="text-center space-y-0.5">
              {isRecording ? (
                <div className="flex items-center justify-center gap-1.5 text-red-400 font-black text-xs">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                  <span>TRANSMITIENDO EN VIVO... ({recordSeconds}s)</span>
                </div>
              ) : (
                <p className="text-[11px] text-zinc-400">
                  {isHeadsetLocked ? (
                    <span className="text-emerald-400 font-bold">🎧 Audífono: 1 clic para hablar • 2do clic para enviar.</span>
                  ) : (
                    <span>Toca 1 vez para hablar y otra para enviar (o mantén presionado).</span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECCIÓN DIRECTA: CHAT DE AUDIOS / HISTORIAL DE MENSAJES DE VOZ */}
          {/* ========================================================================= */}
          <div className="space-y-2 pt-2 border-t border-orange-500/20">
            <div className="flex items-center justify-between text-xs font-black text-orange-500 px-1">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat de Audios Recientes ({voiceMessages.length})</span>
              </span>
              <button
                type="button"
                onClick={loadVoiceHistory}
                className="text-orange-500 hover:text-orange-400 font-bold flex items-center gap-1 cursor-pointer text-[10px]"
              >
                <RefreshCw className={'w-3 h-3 ' + (loadingMessages ? 'animate-spin' : '')} />
                <span>Actualizar</span>
              </button>
            </div>

            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
              {voiceMessages.map((msg) => {
                const isMe = msg.sender_id === currentUser?.id;
                const isPlaying = currentPlayingId === msg.id;

                return (
                  <div
                    key={msg.id}
                    className={'p-2.5 rounded-2xl border transition-all ' + (
                      isMe 
                        ? (isDark ? 'bg-orange-500/10 border-orange-500/30' : 'bg-orange-50 border-orange-200')
                        : (isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200')
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-black flex items-center justify-center border border-orange-500/50 flex-shrink-0">
                          {msg.sender_photo ? (
                            <img src={getFullPhotoUrl(msg.sender_photo)} alt={msg.sender_name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[9px] text-orange-400 font-bold">{msg.sender_name ? msg.sender_name.charAt(0) : 'U'}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-black truncate flex items-center gap-1.5 leading-tight">
                            <span>{isMe ? 'Tú (Enviado)' : msg.sender_name}</span>
                            <span className="text-[10px] font-mono font-normal text-zinc-400">{msg.timestamp || ''}</span>
                          </div>
                          <div className="text-[10px] text-zinc-400 truncate leading-tight">
                            {msg.receiver_names || 'Canal General'}
                          </div>
                        </div>
                      </div>

                      {(isMauricio || isMe) && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteMessage(msg.id, e)}
                          title="Eliminar audio"
                          className="p-1 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Controles de Reproducción y Repetición */}
                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => playVoiceMessage(msg)}
                        className={'p-1.5 rounded-xl flex items-center justify-center font-bold text-xs transition-all shadow-sm cursor-pointer ' + (
                          isPlaying
                            ? 'bg-amber-500 text-black animate-pulse'
                            : 'bg-orange-500 text-black hover:bg-orange-600'
                        )}
                      >
                        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => repeatVoiceMessage(msg)}
                        title="Volver a escuchar desde el inicio"
                        className={'p-1.5 px-2 rounded-xl border flex items-center gap-1 text-[10px] font-bold transition-all cursor-pointer ' + (
                          isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700' : 'bg-zinc-100 border-zinc-300 text-zinc-800 hover:bg-zinc-200'
                        )}
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Repetir</span>
                      </button>

                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-zinc-700/40 overflow-hidden relative">
                          <div
                            className="h-full bg-orange-500 transition-all duration-100"
                            style={{ width: `${isPlaying ? audioProgress : 0}%` }}
                          ></div>
                        </div>
                        <span className="text-[9px] font-mono text-zinc-400 flex-shrink-0">
                          {msg.duration_seconds ? `${msg.duration_seconds}s` : 'Voz'}
                        </span>
                      </div>
                    </div>

                  </div>
                );
              })}

              {voiceMessages.length === 0 && !loadingMessages && (
                <div className="text-center py-4 text-zinc-500 space-y-1">
                  <MessageSquare className="w-6 h-6 mx-auto opacity-40 text-orange-500" />
                  <p className="text-xs">No hay mensajes de voz recientes en el chat.</p>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
