import React, { useState, useEffect, useRef } from 'react';
import { Zap, CheckCircle2, RefreshCw, Server, AlertTriangle } from 'lucide-react';
import { getApiBaseUrl, getSocket } from '../api';

const NORMAL_HEARTBEAT_MS = 4 * 60 * 1000; // Cada 4 minutos para evitar los 15 min de suspensión de Render
const AGGRESSIVE_PING_MS = 2500;            // Cada 2.5 segundos cuando el servidor está despertando

export default function RenderKeepAliveWatchdog({ autoReload = true }) {
  const [serverState, setServerState] = useState('online'); // 'online' | 'waking' | 'offline'
  const [wakeSeconds, setWakeSeconds] = useState(0);
  const [showSuccessBadge, setShowSuccessBadge] = useState(false);
  const [lastPingTime, setLastPingTime] = useState(Date.now());

  const isWakingRef = useRef(false);
  const timerRef = useRef(null);
  const wakeCounterRef = useRef(null);
  const hasEverBeenAsleepRef = useRef(false);

  // Comprobar salud del servidor
  const checkHealth = async () => {
    const baseUrl = getApiBaseUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

    try {
      const res = await fetch(`${baseUrl}/api/health?_t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        setLastPingTime(Date.now());

        if (isWakingRef.current) {
          // ¡EL SERVIDOR ACABA DE DESPERTAR!
          isWakingRef.current = false;
          clearInterval(wakeCounterRef.current);
          setServerState('online');
          setShowSuccessBadge(true);

          try {
            const socket = getSocket();
            if (socket && !socket.connected) {
              socket.connect();
            }
          } catch (e) {}

          window.dispatchEvent(new CustomEvent('render_server_awakened'));

          // Si autoReload está activo y el servidor estuvo dormido, recargar la página para limpiar estado
          if (autoReload && hasEverBeenAsleepRef.current) {
            setTimeout(() => {
              window.location.reload();
            }, 1200);
            return;
          }

          setTimeout(() => {
            setShowSuccessBadge(false);
          }, 3500);
        } else {
          setServerState('online');
        }

        // Programar siguiente pulso normal
        scheduleNext(NORMAL_HEARTBEAT_MS);
      } else {
        throw new Error(`Status ${res.status}`);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      // El servidor está dormido o no responde (inicio en frío de Render)
      hasEverBeenAsleepRef.current = true;
      if (!isWakingRef.current) {
        isWakingRef.current = true;
        setServerState('waking');
        setWakeSeconds(0);

        // Contador de segundos
        if (wakeCounterRef.current) clearInterval(wakeCounterRef.current);
        wakeCounterRef.current = setInterval(() => {
          setWakeSeconds((prev) => prev + 1);
        }, 1000);

        window.dispatchEvent(new CustomEvent('render_server_sleeping'));
      }

      // Reintentar de forma agresiva para despertar a Render
      scheduleNext(AGGRESSIVE_PING_MS);
    }
  };

  const scheduleNext = (delay) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(checkHealth, delay);
  };

  useEffect(() => {
    // Primer pulso al montar
    checkHealth();

    // 1. Detectar cuando la tablet o navegador se desbloquea / vuelve a primer plano
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        const timeSinceLast = Date.now() - lastPingTime;
        // Si pasaron más de 3 minutos desde el último pulso, verificar inmediatamente
        if (timeSinceLast > 3 * 60 * 1000 || isWakingRef.current) {
          checkHealth();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('online', checkHealth);

    // Si Capacitor está disponible en la tablet Android
    let appStateListener = null;
    try {
      import('@capacitor/app').then(({ App }) => {
        appStateListener = App.addListener('appStateChange', (state) => {
          if (state.isActive) {
            checkHealth();
          }
        });
      }).catch(() => {});
    } catch (e) {}

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wakeCounterRef.current) clearInterval(wakeCounterRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('online', checkHealth);
      if (appStateListener && appStateListener.remove) appStateListener.remove();
    };
  }, []);

  if (serverState !== 'waking' && !showSuccessBadge) {
    return null;
  }

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[99999999] max-w-lg w-[94%] pointer-events-auto select-none transition-all duration-300">
      {serverState === 'waking' && (
        <div className="bg-zinc-950/95 text-white border-2 border-amber-500/80 rounded-3xl p-4 shadow-2xl shadow-amber-500/30 backdrop-blur-2xl animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500 flex items-center justify-center text-amber-400 flex-shrink-0 animate-pulse">
              <Zap className="w-5 h-5 fill-amber-400 text-amber-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 font-mono">
                  MODO SEGUNDO PLANO ACTIVO · REACTIVANDO RENDER
                </span>
              </div>
              <h4 className="text-xs sm:text-sm font-black text-white leading-tight mt-0.5">
                Servidor en la nube reactivándose...
              </h4>
              <p className="text-[11px] text-zinc-300 leading-snug mt-1">
                Render estaba en suspensión por inactividad. Estamos enviando pulsos continuos; la página se actualizará sola en cuanto esté listo para que las marcaciones sean inmediatas y sin atrasos.
              </p>
              <div className="flex items-center justify-between text-[10px] font-mono text-amber-300/90 mt-2.5 pt-2 border-t border-amber-500/30">
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                  Iniciando contenedor... ({wakeSeconds}s)
                </span>
                <button
                  onClick={() => checkHealth()}
                  className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/40 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-colors"
                >
                  Verificar ahora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSuccessBadge && serverState === 'online' && (
        <div className="bg-emerald-950/95 text-white border-2 border-emerald-500 rounded-3xl p-3.5 shadow-2xl shadow-emerald-500/30 backdrop-blur-2xl animate-in fade-in slide-in-from-top-4 duration-300 flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 border border-emerald-500 flex items-center justify-center text-emerald-400 flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-black text-white">
              ¡Servidor Render Despierto y Conectado!
            </div>
            <div className="text-[11px] text-emerald-200">
              Sistema listo para marcaciones de asistencia instantáneas.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
