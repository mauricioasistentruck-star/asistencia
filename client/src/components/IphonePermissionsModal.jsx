import React, { useState, useEffect } from 'react';
import { Mic, MapPin, Volume2, ShieldCheck, CheckCircle2, X } from 'lucide-react';
import { isSafariOrIOS, unlockIOSAudio } from '../api';

export default function IphonePermissionsModal({ theme }) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [status, setStatus] = useState({ mic: false, gps: false, audio: false });
  const [requesting, setRequesting] = useState(false);
  const [success, setSuccess] = useState(false);

  const isDark = theme === 'dark';

  useEffect(() => {
    const alreadyGranted = localStorage.getItem('asistencia_ios_permissions_granted');
    if (isSafariOrIOS() && !alreadyGranted) {
      setShowPrompt(true);
    }
  }, []);

  const handleGrantPermissions = async () => {
    setRequesting(true);
    unlockIOSAudio();
    const newStatus = { ...status, audio: true };

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        newStatus.mic = true;
      }
    } catch (micErr) {
      console.warn('Permiso microfono denegado o no disponible:', micErr);
    }

    try {
      if ('geolocation' in navigator) {
        await new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => {
              newStatus.gps = true;
              resolve();
            },
            () => resolve(),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
          );
        });
      }
    } catch (gpsErr) {
      console.warn('Permiso GPS error:', gpsErr);
    }

    setStatus(newStatus);
    setRequesting(false);

    if (newStatus.mic || newStatus.gps || newStatus.audio) {
      setSuccess(true);
      localStorage.setItem('asistencia_ios_permissions_granted', 'true');
      setTimeout(() => {
        setShowPrompt(false);
      }, 2500);
    }
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-x-0 bottom-3 z-50 px-3 sm:px-6 max-w-md mx-auto animate-bounce-in">
      <div className={`p-4 rounded-2xl border shadow-2xl backdrop-blur-xl transition-all ${
        isDark ? 'bg-zinc-950/95 border-orange-500/50 text-white' : 'bg-white/95 border-orange-400 text-zinc-900'
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-500 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-black tracking-tight">Activar Funciones en Safari (iPhone)</h4>
              <p className="text-[11px] text-zinc-400">Permita GPS, Walkie-Talkie y Altavoz para operar en terreno.</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={() => setShowPrompt(false)} 
            className="text-zinc-500 hover:text-zinc-300 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="mt-3 py-2 px-3 rounded-xl bg-green-500/20 text-green-400 text-xs font-bold flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>Permisos activados correctamente</span>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] text-zinc-400">
              <div className="p-1.5 rounded-lg bg-zinc-900/50 border border-zinc-800 flex flex-col items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-orange-400" />
                <span>Rastreo GPS</span>
              </div>
              <div className="p-1.5 rounded-lg bg-zinc-900/50 border border-zinc-800 flex flex-col items-center gap-1">
                <Mic className="w-3.5 h-3.5 text-orange-400" />
                <span>Microfono</span>
              </div>
              <div className="p-1.5 rounded-lg bg-zinc-900/50 border border-zinc-800 flex flex-col items-center gap-1">
                <Volume2 className="w-3.5 h-3.5 text-orange-400" />
                <span>Altavoz</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGrantPermissions}
              disabled={requesting}
              className="w-full py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-98 text-black font-black text-xs uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              {requesting ? 'Activando...' : 'Permitir GPS y Microfono'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}