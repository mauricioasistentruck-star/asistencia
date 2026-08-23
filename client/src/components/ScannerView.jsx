import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { apiScanQr, getFullPhotoUrl } from '../api';

export default function ScannerView({ user, theme }) {
  const [scannerActive, setScannerActive] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const scannerRef = useRef(null);

  const isDark = theme === 'dark';

  useEffect(() => {
    Html5Qrcode.getCameras().then((devices) => {
      if (devices && devices.length > 0) {
        setCameras(devices);
        const backCam = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('trasera'));
        setSelectedCamera(backCam ? backCam.id : devices[0].id);
      }
    }).catch(err => console.warn('Error listando camaras:', err));

    return () => {
      stopScanner();
    };
  }, []);

  const playBeep = (success = true) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = success ? 'sine' : 'sawtooth';
      osc.frequency.setValueAtTime(success ? 800 : 300, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + (success ? 0.2 : 0.4));
    } catch (e) {
      console.log('Audio no disponible');
    }
  };

  const startScanner = async () => {
    if (!selectedCamera) return;
    setErrorMsg('');
    try {
      const html5QrCode = new Html5Qrcode('qr-reader');
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        selectedCamera,
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (isProcessing) return;
          setIsProcessing(true);
          handleQrScanned(decodedText);
        },
        () => {}
      );
      setScannerActive(true);
    } catch (err) {
      setErrorMsg('No se pudo acceder a la cámara. Verifique los permisos del navegador o dispositivo.');
      setScannerActive(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.error('Error deteniendo cámara:', err);
      }
    }
    setScannerActive(false);
  };

  const handleQrScanned = async (qrToken) => {
    try {
      const res = await apiScanQr(qrToken);
      playBeep(true);
      setScanResult({
        success: true,
        type: res.label || res.type,
        time: res.time,
        date: res.date,
        totalHours: res.totalHours,
        user: res.user
      });
      setErrorMsg('');
    } catch (err) {
      playBeep(false);
      setErrorMsg(err.message || 'Código QR no reconocido o jornada ya completada.');
      setScanResult(null);
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
      }, 2500);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-black tracking-tight flex items-center justify-center gap-2">
          <Camera className="w-7 h-7 text-orange-500" />
          Kiosco de Registro de Asistencia
        </h2>
        <p className="text-xs text-orange-500 font-semibold mt-1">
          Escanea el código QR de la credencial virtual para registrar las 4 marcaciones del día
        </p>
      </div>

      <div className={'border rounded-3xl p-6 shadow-2xl transition-colors ' + (isDark ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-orange-200 text-zinc-900')}>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <div className="w-full sm:w-auto flex-1 max-w-sm">
            <select
              value={selectedCamera}
              onChange={(e) => {
                setSelectedCamera(e.target.value);
                if (scannerActive) {
                  stopScanner().then(() => startScanner());
                }
              }}
              className={'w-full rounded-xl px-3 py-2 text-xs border focus:outline-none focus:border-orange-500 ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
            >
              {cameras.map(c => (
                <option key={c.id} value={c.id}>
                  {c.label || ('Cámara ' + c.id)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 w-full sm:w-auto justify-end">
            {!scannerActive ? (
              <button
                onClick={startScanner}
                className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 text-black text-xs font-black px-5 py-2.5 rounded-xl shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                Iniciar Cámara
              </button>
            ) : (
              <button
                onClick={stopScanner}
                className="w-full sm:w-auto bg-zinc-800 hover:bg-zinc-700 text-orange-400 text-xs font-bold px-5 py-2.5 rounded-xl border border-orange-500/30 transition-all flex items-center justify-center gap-2"
              >
                Detener Cámara
              </button>
            )}
          </div>
        </div>

        <div className={'relative border-2 rounded-2xl overflow-hidden min-h-[300px] flex items-center justify-center ' + (isDark ? 'bg-black border-zinc-800' : 'bg-orange-50/30 border-orange-200')}>
          <div id="qr-reader" className="w-full max-w-md"></div>

          {!scannerActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 p-6 text-center">
              <Camera className="w-12 h-12 mb-3 text-orange-500/60" />
              <p className="text-sm font-bold">La cámara está en espera</p>
              <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                Presione "Iniciar Cámara" y acerque el código QR de su credencial al visor.
              </p>
            </div>
          )}

          {scannerActive && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-64 h-64 border-2 border-orange-500 rounded-2xl relative shadow-[0_0_50px_rgba(249,115,22,0.4)]">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-orange-500 to-transparent animate-scan-line"></div>
              </div>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="mt-6 bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start space-x-3 text-red-400 text-xs">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">No se pudo registrar la marcación:</p>
              <p className="mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        {scanResult && (
          <div className={'mt-6 border-2 border-orange-500/50 rounded-2xl p-5 shadow-xl ' + (isDark ? 'bg-orange-950/30' : 'bg-orange-50')}>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-orange-500 border-2 border-black overflow-hidden flex items-center justify-center shadow-lg flex-shrink-0">
                {scanResult.user?.photo_url ? (
                  <img
                    src={getFullPhotoUrl(scanResult.user.photo_url)}
                    alt={scanResult.user.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-xl font-black text-black">
                    {scanResult.user?.name?.charAt(0)}
                  </div>
                )}
              </div>

              <div className="flex-1 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-1.5 text-orange-500 font-black text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>MARCACIÓN EXITOSA REGISTRADA</span>
                </div>
                <h3 className="text-lg font-black mt-0.5">
                  {scanResult.user?.name}
                </h3>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                  <span className="bg-orange-500 text-black text-xs font-black px-3 py-1 rounded-lg">
                    {scanResult.type}
                  </span>
                  <span className={'text-xs font-mono font-bold px-3 py-1 rounded-lg border flex items-center gap-1 ' + (isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-200' : 'bg-white border-orange-200 text-zinc-800')}>
                    <Clock className="w-3.5 h-3.5 text-orange-500" />
                    {scanResult.time}
                  </span>
                  {scanResult.totalHours > 0 && (
                    <span className="bg-orange-500/20 text-orange-400 text-xs font-bold px-3 py-1 rounded-lg border border-orange-500/30">
                      Total Jornada: {scanResult.totalHours} hrs
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
