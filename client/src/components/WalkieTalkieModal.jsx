import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, Radio, Volume2, Users, User, X, Clock, ShieldCheck, CheckCircle2, 
  AlertTriangle, Headphones, Bluetooth, Sparkles, Lock, Unlock, RefreshCw, 
  Play, Pause, RotateCcw, MessageSquare, Search, Trash2, Check, ArrowLeft, Send
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

const SILENT_WAV_BASE64 = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAP8A/wD/';

export default function WalkieTalkieModal({ isOpen, onClose, currentUser, theme, initialTab = 'walkie' }) {
  const [activeTab, setActiveTab] = useState(initialTab || 'walkie');

  // Destinatarios seleccionados en Modo Hablar en Vivo
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Estado del canal de audio (Ocupado o Libre)
  const [channelStatus, setChannelStatus] = useState({ isBusy: false, speakerId: null, speakerName: null });

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

  // Historial y Chats Separados por Usuario
  const [voiceMessages, setVoiceMessages] = useState([]);
  const [selectedChatUser, setSelectedChatUser] = useState(null); // null = lista de usuarios, 'all' = canal general, objeto = usuario
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [currentPlayingId, setCurrentPlayingId] = useState(null);
  const [audioProgress, setAudioProgress] = useState(0);

  // Referencias
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const isRecordingRef = useRef(false);
  const currentStreamIdRef = useRef(null);
  const chunkIndexRef = useRef(0);
  const startTalkingRef = useRef(null);
  const stopTalkingRef = useRef(null);
  const toggleTalkingRef = useRef(null);
  const silentAudioElementRef = useRef(null);
  const activeAudioPlayerRef = useRef(null);
  const progressIntervalRef = useRef(null);

  const isMauricio = currentUser && (currentUser.is_superadmin === 1 || (currentUser.name && currentUser.name.toLowerCase().includes('mauricio')));

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || 'walkie');
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
  }, [isOpen, initialTab, currentUser]);

  // Escuchar estado del canal y mensajes en tiempo real
  useEffect(() => {
    if (!isOpen) return;

    const socket = getSocket();

    const handleChannelStatus = (status) => {
      setChannelStatus(status || { isBusy: false });
    };

    const handleNewVoiceMessage = (msg) => {
      setVoiceMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [msg, ...prev];
      });
    };

    socket.on('audio_channel_status', handleChannelStatus);
    socket.on('receive_voice_audio', handleNewVoiceMessage);
    socket.on('voice_audio_saved', handleNewVoiceMessage);

    return () => {
      socket.off('audio_channel_status', handleChannelStatus);
      socket.off('receive_voice_audio', handleNewVoiceMessage);
      socket.off('voice_audio_saved', handleNewVoiceMessage);
    };
  }, [isOpen]);

  // Escanear dispositivos
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
            label: 'Micrófono por defecto'
          });
        }
      }
    } catch (e) {} finally {
      setScanningDevices(false);
    }
  };

  const loadVoiceHistory = async () => {
    setLoadingMessages(true);
    try {
      const messages = await apiGetVoiceMessages();
      setVoiceMessages(messages || []);
    } catch (e) {
    } finally {
      setLoadingMessages(false);
    }
  };

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
  // TRANSMISIÓN EN VIVO (STREAMING) Y PUSH-TO-TALK
  // =========================================================================
  const startTalking = async () => {
    if (isRecordingRef.current) return;
    if (!audioStatus.allowed && !isMauricio) {
      alert(audioStatus.reason || 'Canal de audio fuera de horario.');
      return;
    }
    if (selectedUserIds.length === 0) {
      setStatusMsg('⚠️ Seleccione al menos un colaborador antes de hablar.');
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
      const streamId = 'stream_' + Date.now() + '_' + currentUser.id;
      currentStreamIdRef.current = streamId;
      chunkIndexRef.current = 0;

      const isAllUsers = selectedUserIds.length === usersList.length;
      const targetUsers = usersList.filter(u => selectedUserIds.includes(u.id));
      const targetNames = isAllUsers ? ['Canal General (Todos)'] : targetUsers.map(u => u.name);
      const targetIds = isAllUsers ? ['all'] : selectedUserIds;

      const socket = getSocket();

      // 1. Notificar inicio de transmisión en vivo (Canal Ocupado)
      socket.emit('voice_stream_start', {
        streamId,
        fromUserId: currentUser.id,
        fromUserName: currentUser.name,
        fromUserPhoto: currentUser.photo_url,
        targetUserIds: targetIds,
        targetUserNames: targetNames
      });

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
        
        if (audioBlob.size === 0) return;

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result;

          const payload = {
            streamId: currentStreamIdRef.current,
            fromUserId: currentUser.id,
            fromUserName: currentUser.name,
            fromUserPhoto: currentUser.photo_url,
            toUserId: isAllUsers ? 'all' : undefined,
            targetUserIds: targetIds,
            targetUserNames: targetNames,
            audioData: base64Audio,
            durationSeconds: recordSeconds || 1,
            timestamp: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
          };

          // Guardar audio completo y liberar canal definitivamente
          socket.emit('send_voice_audio', payload);
          socket.emit('voice_stream_end', { streamId: currentStreamIdRef.current, targetUserIds: targetIds });
          playRadioBeep(620, 0.09);

          const destText = isAllUsers ? 'Canal General (Todos)' : (targetNames.length === 1 ? targetNames[0] : `${targetNames.length} colaboradores`);
          setStatusMsg(`✅ Audio enviado a ${destText}`);
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
      }, 50);

      isRecordingRef.current = false;
      setIsRecording(false);
    }
  };

  // Alternar hablar/enviar con 1 clic directo
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

  // Vinculación de Audífonos Bluetooth
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
      } catch (e) {}

      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: 'Walkie-Talkie Asistentruck [BOTÓN AUDÍFONO ACTIVO]',
            artist: '1 Clic: Hablar | 2 Clics: Enviar Audio',
            album: 'Canal de Voz en Terreno'
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
        } catch (e) {}
      }

      setIsHeadsetLocked(true);
      playRadioBeep(1150, 0.12);
      setStatusMsg('🎧 Audífonos vinculados: 1 clic para hablar, 2do clic para enviar.');
      setTimeout(() => setStatusMsg(''), 5000);
    } else {
      if (silentAudioElementRef.current) {
        try { silentAudioElementRef.current.pause(); } catch (e) {}
      }
      setIsHeadsetLocked(false);
      playRadioBeep(520, 0.12);
      setStatusMsg('🔓 Botón de audífonos liberado');
      setTimeout(() => setStatusMsg(''), 4000);
    }
  };

  // Escucha de hardware y eventos de audífonos
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
        e.key === 'HeadsetHook';

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
  // REPRODUCCIÓN DEL HISTORIAL
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

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      fetch(playUrl)
        .then(res => res.arrayBuffer())
        .then(buf => audioCtx.decodeAudioData(buf))
        .then(audioBuf => {
          const source = audioCtx.createBufferSource();
          source.buffer = audioBuf;

          const gainNode = audioCtx.createGain();
          gainNode.gain.setValueAtTime(3.0, audioCtx.currentTime); // 300% de volumen

          const compressor = audioCtx.createDynamicsCompressor();
          compressor.threshold.setValueAtTime(-20, audioCtx.currentTime);
          compressor.knee.setValueAtTime(25, audioCtx.currentTime);
          compressor.ratio.setValueAtTime(10, audioCtx.currentTime);

          source.connect(compressor);
          compressor.connect(gainNode);
          gainNode.connect(audioCtx.destination);

          activeAudioPlayerRef.current = {
            pause: () => {
              try { source.stop(); } catch(e) {}
              try { audioCtx.close(); } catch(e) {}
            },
            currentTime: 0
          };

          setCurrentPlayingId(msg.id);
          const startTime = audioCtx.currentTime;
          const duration = audioBuf.duration;

          progressIntervalRef.current = setInterval(() => {
            const elapsed = audioCtx.currentTime - startTime;
            if (duration > 0) {
              setAudioProgress(Math.min((elapsed / duration) * 100, 100));
            }
          }, 100);

          source.onended = () => {
            stopAudioPlayback();
          };

          source.start(0);
        })
        .catch(() => {
          const audio = new Audio(playUrl);
          audio.volume = 1.0;
          activeAudioPlayerRef.current = audio;
          setCurrentPlayingId(msg.id);
          audio.play().then(() => {
            progressIntervalRef.current = setInterval(() => {
              if (audio.duration) setAudioProgress((audio.currentTime / audio.duration) * 100);
            }, 100);
          }).catch(() => stopAudioPlayback());
          audio.onended = () => stopAudioPlayback();
          audio.onerror = () => stopAudioPlayback();
        });

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

  // Selección de personal
  const toggleUserSelection = (userId) => {
    setSelectedUserIds(prev => {
      if (prev.includes(userId)) return prev.filter(id => id !== userId);
      return [...prev, userId];
    });
  };

  const selectAllUsers = () => setSelectedUserIds(usersList.map(u => u.id));
  const deselectAllUsers = () => setSelectedUserIds([]);

  const filteredUsers = usersList.filter(u => 
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.rut?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.role?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // =========================================================================
  // AGRUPACIÓN DE CHAT DE AUDIOS POR USUARIO
  // =========================================================================
  // Filtrar audios según el chat seleccionado
  const getFilteredChatMessages = () => {
    if (!selectedChatUser) return [];

    if (selectedChatUser === 'all') {
      // Mensajes de canal general
      return voiceMessages.filter(m => {
        let rIds = [];
        try { rIds = JSON.parse(m.receiver_ids); } catch(e) { rIds = [m.receiver_ids]; }
        return m.receiver_ids === 'all' || rIds.includes('all');
      });
    }

    // Mensajes específicos entre el usuario actual y el colaborador seleccionado
    const otherId = selectedChatUser.id;
    return voiceMessages.filter(m => {
      const isFromOther = m.sender_id === otherId;
      let rIds = [];
      try { rIds = JSON.parse(m.receiver_ids); } catch(e) { rIds = [m.receiver_ids]; }
      const isToOther = rIds.includes(otherId) || rIds.includes(String(otherId));
      return isFromOther || isToOther;
    });
  };

  // Contador de audios por colaborador
  const getAudioCountForUser = (userId) => {
    return voiceMessages.filter(m => {
      const isFromOther = m.sender_id === userId;
      let rIds = [];
      try { rIds = JSON.parse(m.receiver_ids); } catch(e) { rIds = [m.receiver_ids]; }
      const isToOther = rIds.includes(userId) || rIds.includes(String(userId));
      return isFromOther || isToOther;
    }).length;
  };

  const generalAudiosCount = voiceMessages.filter(m => {
    let rIds = [];
    try { rIds = JSON.parse(m.receiver_ids); } catch(e) { rIds = [m.receiver_ids]; }
    return m.receiver_ids === 'all' || rIds.includes('all');
  }).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[99999] flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="bg-zinc-950 border border-orange-500/30 rounded-[32px] max-w-[440px] w-full max-h-[94vh] p-5 shadow-2xl flex flex-col justify-between space-y-4 text-white overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================================= */}
        {/* ENCABEZADO PRINCIPAL */}
        {/* ========================================================================= */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 text-black flex items-center justify-center font-black shadow-lg shadow-orange-500/30 flex-shrink-0">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-white leading-tight">
                Walkie-Talkie & Voz
              </h3>
              <p className="text-xs text-orange-500 font-bold leading-tight mt-0.5">
                Canal directo con personal en terreno
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5 flex-shrink-0" />
          </button>
        </div>

        {/* ========================================================================= */}
        {/* PESTAÑAS: [Hablar en Vivo] y [Chat de Audios (N)] */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-zinc-900 border border-zinc-800">
          <button
            type="button"
            onClick={() => {
              setActiveTab('walkie');
              setSelectedChatUser(null);
            }}
            className={'py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ' + (
              activeTab === 'walkie'
                ? 'bg-orange-500 text-black shadow-md shadow-orange-500/30'
                : 'text-zinc-400 hover:text-white'
            )}
          >
            <Radio className="w-4 h-4" />
            <span>Hablar en Vivo</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('chat');
              loadVoiceHistory();
            }}
            className={'py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ' + (
              activeTab === 'chat'
                ? 'bg-orange-500 text-black shadow-md shadow-orange-500/30'
                : 'text-zinc-400 hover:text-white'
            )}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Chat de Audios ({voiceMessages.length})</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* VISTA 1: HABLAR EN VIVO */}
        {/* ========================================================================= */}
        {activeTab === 'walkie' && (
          <div className="flex-1 flex flex-col space-y-3.5 overflow-y-auto pr-0.5">
            
            {/* ESTADO DEL CANAL EN VIVO */}
            <div className="flex items-center justify-between px-1 text-[11px]">
              {channelStatus.isBusy && channelStatus.speakerId !== currentUser?.id ? (
                <span className="flex items-center gap-1.5 text-red-400 font-bold animate-pulse">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                  <span>Canal Ocupado ({channelStatus.speakerName} transmitiendo...)</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Canal de Audio Libre</span>
                </span>
              )}

              <span className="text-zinc-400 font-mono text-[10px]">
                {headsetInfo.connected ? headsetInfo.label : 'Altavoz / Micrófono'}
              </span>
            </div>

            {/* TARJETA 1: VINCULAR BOTÓN DE AUDÍFONOS */}
            <div className="space-y-1.5">
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className={'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold ' + (
                    isHeadsetLocked ? 'bg-emerald-500 text-black animate-pulse' : 'bg-orange-500 text-black'
                  )}>
                    <Headphones className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-black text-white truncate">
                      Vincular Botón de Audífonos
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                      {isHeadsetLocked ? '🎧 1 Clic: Hablar • 2do Clic: Enviar' : 'Toque para activar control por botón de audífono'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={toggleLockHeadset}
                  className={'px-3.5 py-2 rounded-xl text-[11px] font-black uppercase flex items-center gap-1.5 flex-shrink-0 transition-all shadow-md active:scale-95 cursor-pointer ' + (
                    isHeadsetLocked
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-black'
                      : 'bg-orange-500 hover:bg-orange-600 text-black'
                  )}
                >
                  {isHeadsetLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  <span>{isHeadsetLocked ? 'LIBERAR' : 'VINCULAR'}</span>
                </button>
              </div>
            </div>

            {/* TARJETA 2: DESTINATARIOS */}
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase text-orange-500 tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 flex-shrink-0" />
                  <span>DESTINATARIOS ({selectedUserIds.length}):</span>
                </label>

                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={selectAllUsers}
                    className="px-2.5 py-0.5 rounded-lg bg-orange-500/20 text-orange-400 font-bold hover:bg-orange-500/30 cursor-pointer"
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={deselectAllUsers}
                    className="px-2.5 py-0.5 rounded-lg bg-zinc-800 text-zinc-400 font-bold hover:bg-zinc-700 cursor-pointer"
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              {/* Buscador */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Buscar colaborador..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 pl-8 pr-3 py-1.5 text-xs rounded-xl outline-none focus:border-orange-500/50"
                />
              </div>

              {/* Lista de Destinatarios */}
              <div className="grid grid-cols-2 gap-1.5 max-h-[120px] overflow-y-auto pr-1">
                {filteredUsers.map((u) => {
                  const isSelected = selectedUserIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleUserSelection(u.id)}
                      className={'py-2 px-2.5 rounded-xl border flex items-center justify-between text-xs transition-all cursor-pointer ' + (
                        isSelected
                          ? 'bg-orange-500 text-black border-orange-500 font-black shadow-sm'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-black flex items-center justify-center border border-black flex-shrink-0 font-bold text-[11px]">
                          {u.photo_url ? (
                            <img src={getFullPhotoUrl(u.photo_url)} alt={u.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className={isSelected ? 'text-orange-400' : 'text-orange-500'}>
                              {u.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span className="truncate text-left leading-tight">{u.name}</span>
                      </div>
                      <div className={'w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 ml-1 border ' + (
                        isSelected ? 'bg-black text-orange-400 border-black' : 'border-zinc-600'
                      )}>
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mensajes de Estado */}
            {statusMsg && (
              <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs p-2 rounded-2xl flex items-center justify-center gap-2 font-bold animate-pulse text-center">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{statusMsg}</span>
              </div>
            )}

            {micPermissionError && (
              <div className="bg-red-500/15 border border-red-500/30 text-red-400 text-xs p-2.5 rounded-2xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>Permita el acceso al micrófono para hablar.</span>
              </div>
            )}

            {/* ========================================================================= */}
            {/* BOTÓN CENTRAL HABLAR (1 CLIC = HABLAR / 2º CLIC = ENVIAR Y LIBERAR) */}
            {/* ========================================================================= */}
            <div className="flex flex-col items-center justify-center pt-2 space-y-2">
              <button
                type="button"
                onClick={toggleTalking}
                disabled={(!audioStatus.allowed && !isMauricio) || selectedUserIds.length === 0}
                className={'w-28 h-28 sm:w-32 sm:h-32 rounded-full border-4 flex flex-col items-center justify-center transition-all transform active:scale-95 shadow-2xl ' + (
                  isRecording
                    ? 'bg-red-600 border-white text-white shadow-[0_0_40px_rgba(239,68,68,0.8)] scale-105 animate-pulse'
                    : (selectedUserIds.length === 0
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-600 cursor-not-allowed'
                        : (audioStatus.allowed || isMauricio
                            ? 'bg-orange-500 border-black hover:bg-orange-600 text-black shadow-[0_0_40px_rgba(249,115,22,0.6)] hover:scale-105 cursor-pointer'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-600 cursor-not-allowed'))
                )}
              >
                {isRecording ? (
                  <>
                    <Volume2 className="w-8 h-8 sm:w-9 sm:h-9 animate-bounce flex-shrink-0" />
                    <span className="text-[10px] font-black uppercase mt-1">ENVIAR (2º CLIC)</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-8 h-8 sm:w-9 sm:h-9 flex-shrink-0" />
                    <span className="text-[10px] font-black uppercase mt-1">HABLAR (1 CLIC)</span>
                  </>
                )}
              </button>

              <div className="text-center">
                {isRecording ? (
                  <div className="flex items-center justify-center gap-1.5 text-red-400 font-black text-xs">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                    <span>TRANSMITIENDO EN VIVO... ({recordSeconds}s)</span>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400">
                    Presione 1 clic para hablar y otro para enviar (o mantenga presionado).
                  </p>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* VISTA 2: CHAT DE AUDIOS SEPARADO POR USUARIO */}
        {/* ========================================================================= */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col space-y-3 overflow-hidden">
            
            {/* Si no hay usuario seleccionado, mostrar LISTA DE CONTACTOS / CANALES */}
            {!selectedChatUser ? (
              <div className="flex-1 flex flex-col space-y-2.5 overflow-hidden">
                <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                  <span>Seleccione un colaborador para ver sus audios:</span>
                  <button
                    type="button"
                    onClick={loadVoiceHistory}
                    className="text-orange-500 hover:text-orange-400 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={'w-3 h-3 ' + (loadingMessages ? 'animate-spin' : '')} />
                    <span>Actualizar</span>
                  </button>
                </div>

                {/* Buscador de Chats */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Buscar chat por nombre..."
                    value={chatSearchQuery}
                    onChange={(e) => setChatSearchQuery(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 pl-8 pr-3 py-1.5 text-xs rounded-xl outline-none focus:border-orange-500/50"
                  />
                </div>

                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[320px]">
                  {/* Opción 1: Canal General (Todos) */}
                  <button
                    type="button"
                    onClick={() => setSelectedChatUser('all')}
                    className="w-full p-2.5 rounded-2xl bg-gradient-to-r from-orange-500/15 to-amber-500/10 border border-orange-500/30 hover:border-orange-500 text-left flex items-center justify-between transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-orange-500 text-black flex items-center justify-center font-black flex-shrink-0">
                        <Radio className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-black text-white truncate">Canal General (Todos)</div>
                        <div className="text-[10px] text-zinc-400 truncate">Mensajes de voz transmitidos al equipo</div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-lg bg-orange-500/20 text-orange-400 font-mono text-[11px] font-bold">
                      {generalAudiosCount}
                    </span>
                  </button>

                  {/* Lista de Colaboradores */}
                  {usersList
                    .filter(u => u.name?.toLowerCase().includes(chatSearchQuery.toLowerCase()))
                    .map((u) => {
                      const count = getAudioCountForUser(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setSelectedChatUser(u)}
                          className="w-full p-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850 text-left flex items-center justify-between transition-all cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl overflow-hidden bg-black flex items-center justify-center border border-zinc-700 flex-shrink-0 font-black text-xs">
                              {u.photo_url ? (
                                <img src={getFullPhotoUrl(u.photo_url)} alt={u.name} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-orange-500">{u.name ? u.name.charAt(0) : 'U'}</span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-black text-white truncate">{u.name}</div>
                              <div className="text-[10px] text-zinc-400 truncate">{u.role === 'admin' ? 'Administrador' : 'Trabajador'}</div>
                            </div>
                          </div>
                          <span className={'px-2 py-0.5 rounded-lg font-mono text-[11px] font-bold ' + (
                            count > 0 ? 'bg-orange-500/20 text-orange-400' : 'bg-zinc-800 text-zinc-500'
                          )}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            ) : (
              /* CONVERSACIÓN ESPECÍFICA CON UN USUARIO */
              <div className="flex-1 flex flex-col space-y-2 overflow-hidden">
                {/* Cabecera del Chat con botón volver */}
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setSelectedChatUser(null)}
                    className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 font-bold cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Volver a Contactos</span>
                  </button>

                  <div className="flex items-center gap-2 min-w-0">
                    <div className="text-xs font-black text-white truncate">
                      {selectedChatUser === 'all' ? 'Canal General' : selectedChatUser.name}
                    </div>
                  </div>
                </div>

                {/* Lista de Mensajes del Chat Seleccionado */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[300px]">
                  {getFilteredChatMessages().map((msg) => {
                    const isMe = msg.sender_id === currentUser?.id;
                    const isPlaying = currentPlayingId === msg.id;

                    return (
                      <div
                        key={msg.id}
                        className={'p-2.5 rounded-2xl border transition-all ' + (
                          isMe ? 'bg-orange-500/10 border-orange-500/30 ml-4' : 'bg-zinc-900 border-zinc-800 mr-4'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[11px] font-black truncate text-white">
                              {isMe ? 'Tú (Enviado)' : msg.sender_name}
                            </span>
                            <span className="text-[9px] font-mono text-zinc-400">{msg.timestamp || ''}</span>
                          </div>

                          {(isMauricio || isMe) && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteMessage(msg.id, e)}
                              className="p-1 text-zinc-500 hover:text-red-400 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {/* Reproductor de Audio */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => playVoiceMessage(msg)}
                            className={'p-1.5 rounded-xl flex items-center justify-center font-bold text-xs transition-all shadow-sm cursor-pointer ' + (
                              isPlaying ? 'bg-amber-500 text-black animate-pulse' : 'bg-orange-500 text-black hover:bg-orange-600'
                            )}
                          >
                            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => repeatVoiceMessage(msg)}
                            className="p-1.5 rounded-xl border bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Repetir</span>
                          </button>

                          <div className="flex-1 min-w-0 flex items-center gap-1.5">
                            <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden relative">
                              <div
                                className="h-full bg-orange-500 transition-all duration-100"
                                style={{ width: `${isPlaying ? audioProgress : 0}%` }}
                              ></div>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-400">
                              {msg.duration_seconds ? `${msg.duration_seconds}s` : 'Voz'}
                            </span>
                          </div>
                        </div>

                      </div>
                    );
                  })}

                  {getFilteredChatMessages().length === 0 && (
                    <div className="text-center py-8 text-zinc-500 space-y-1.5">
                      <MessageSquare className="w-7 h-7 mx-auto opacity-30 text-orange-500" />
                      <p className="text-xs">No hay audios registrados con este colaborador.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setActiveTab('walkie')}
                className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-black font-black text-xs rounded-xl shadow-md transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Mic className="w-4 h-4" />
                <span>Volver a Hablar en Vivo</span>
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
