/**
 * ASISTENTRUCK - GUARDIÁN ANTI-SUSPENSIÓN DE RENDER (KEEP-ALIVE EN SEGUNDO PLANO)
 * 
 * Mantiene activo el servidor de Render las 24 horas del día.
 * Evita que Render entre en hibernación (sleep de 15 minutos), eliminando
 * los retrasos de inicio y garantizando marcaciones de asistencia instantáneas.
 */

const https = require('https');

const TARGET_URL = 'https://asistenciasistentruck.onrender.com/api/health';
const NORMAL_INTERVAL_MS = 8 * 60 * 1000; // Cada 8 minutos en operación normal
const AGGRESSIVE_INTERVAL_MS = 5 * 1000;  // Cada 5 segundos cuando el servidor está despertando

let isAwake = true;
let consecutiveFails = 0;

function pingServer() {
  const startTime = Date.now();
  const dateStr = new Date().toLocaleTimeString('es-CL', { timeZone: 'America/Santiago' });

  const req = https.get(TARGET_URL, { timeout: 15000 }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const elapsed = Date.now() - startTime;
      if (res.statusCode === 200) {
        if (!isAwake || consecutiveFails > 0) {
          console.log(`[${dateStr}] ✅ ¡SERVIDOR RENDER DESPIERTO Y 100% OPERATIVO! (Respuesta en ${elapsed}ms)`);
        } else {
          console.log(`[${dateStr}] ⚡ Pulso Keep-Alive exitoso: Servidor activo (${elapsed}ms)`);
        }
        isAwake = true;
        consecutiveFails = 0;
        scheduleNext(NORMAL_INTERVAL_MS);
      } else {
        console.warn(`[${dateStr}] ⚠️ Código de respuesta ${res.statusCode}. Reactivando servidor...`);
        isAwake = false;
        consecutiveFails++;
        scheduleNext(AGGRESSIVE_INTERVAL_MS);
      }
    });
  });

  req.on('timeout', () => {
    req.destroy();
    const dateStr = new Date().toLocaleTimeString('es-CL', { timeZone: 'America/Santiago' });
    console.warn(`[${dateStr}] ⏳ Servidor Render en suspensión o iniciando... Enviando pulsos para reactivarlo...`);
    isAwake = false;
    consecutiveFails++;
    scheduleNext(AGGRESSIVE_INTERVAL_MS);
  });

  req.on('error', (err) => {
    const dateStr = new Date().toLocaleTimeString('es-CL', { timeZone: 'America/Santiago' });
    console.warn(`[${dateStr}] ⏳ Conectando con Render (${err.message}). Reintentando despertar...`);
    isAwake = false;
    consecutiveFails++;
    scheduleNext(AGGRESSIVE_INTERVAL_MS);
  });
}

function scheduleNext(delayMs) {
  setTimeout(pingServer, delayMs);
}

console.log('=================================================================');
console.log('  ASISTENTRUCK - GUARDIÁN ANTI-SUSPENSIÓN DE RENDER (ACTIVO)');
console.log('  Monitoreando: ' + TARGET_URL);
console.log('  Intervalo de pulso: Cada 8 minutos (Evita la suspensión de Render)');
console.log('=================================================================');

// Iniciar primer ping inmediatamente
pingServer();
