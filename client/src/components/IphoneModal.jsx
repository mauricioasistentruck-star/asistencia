import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Share2, PlusSquare, Copy, Check, X, Globe } from 'lucide-react';

export default function IphoneModal({ isOpen, onClose, theme }) {
  const [copied, setCopied] = useState(false);
  
  if (!isOpen) return null;

  const currentUrl = window.location.href;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const isDark = theme === 'dark';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[99999] flex items-center justify-center p-4">
      <div className={'max-w-lg w-full rounded-3xl p-6 shadow-2xl border transition-all ' + (isDark ? 'bg-zinc-950 border-orange-500/30 text-white' : 'bg-white border-orange-200 text-zinc-900')}>
        
        <div className="flex items-center justify-between pb-4 border-b border-orange-500/20">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-orange-500 bg-black flex items-center justify-center shadow-lg shadow-orange-500/30">
              <img src="/logo.png" alt="AsistenTruck" className="w-full h-full object-contain p-0.5" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">ASISTENTRUCK en iPhone</h3>
              <p className="text-xs text-orange-500 font-semibold">INVERSIONES BOTAM SpA</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-orange-500/10 text-zinc-400 hover:text-orange-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="my-5 text-center">
          <p className="text-xs text-zinc-400 mb-3">
            Escanea este código con la cámara de tu <strong>iPhone</strong> para abrir la app directamente:
          </p>

          <div className="p-3.5 bg-white rounded-2xl inline-block shadow-xl border-2 border-orange-500/40">
            <QRCodeSVG value={currentUrl} size={170} level="H" />
          </div>

          <div className="mt-4 flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-2xl p-2.5">
            <Globe className="w-4 h-4 text-orange-500 flex-shrink-0" />
            <input
              type="text"
              readOnly
              value={currentUrl}
              className="bg-transparent text-xs font-mono flex-1 text-orange-400 focus:outline-none truncate"
            />
            <button
              onClick={handleCopy}
              className="bg-orange-500 hover:bg-orange-600 text-black font-bold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-md shadow-orange-500/20 transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
          </div>
        </div>

        <div className={'rounded-2xl p-4 text-xs space-y-2.5 border ' + (isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-orange-50/70 border-orange-100 text-zinc-800')}>
          <div className="font-bold text-orange-500 uppercase tracking-wider text-[10px] mb-1">
            📱 Cómo instalar como App en iPhone (Paso a paso):
          </div>
          
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-orange-500 text-black font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">1</div>
            <div>Abre el enlace en el navegador <strong>Safari</strong> de tu iPhone.</div>
          </div>

          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-orange-500 text-black font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">2</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              Toca el botón <strong>Compartir</strong> <Share2 className="w-3.5 h-3.5 text-blue-400 inline" /> en la parte inferior.
            </div>
          </div>

          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-orange-500 text-black font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">3</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              Selecciona <strong>"Agregar a pantalla de inicio"</strong> <PlusSquare className="w-3.5 h-3.5 text-orange-500 inline" />.
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="w-full bg-orange-500 hover:bg-orange-600 text-black font-extrabold py-3 rounded-2xl text-xs shadow-lg shadow-orange-500/25 transition-all"
          >
            Entendido
          </button>
        </div>

      </div>
    </div>
  );
}
