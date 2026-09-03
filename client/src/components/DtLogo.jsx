import React from 'react';

export default function DtLogo({ className = "w-16 h-16", showText = false }) {
  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
        {/* Arco Azul Izquierdo/Superior */}
        <path
          d="M 50,5 A 45,45 0 0,0 50,95"
          fill="none"
          stroke="#005696"
          strokeWidth="7.5"
          strokeLinecap="round"
        />
        {/* Arco Rojo Derecho/Inferior */}
        <path
          d="M 50,95 A 45,45 0 0,0 50,5"
          fill="none"
          stroke="#e11d48"
          strokeWidth="7.5"
          strokeLinecap="round"
        />
        {/* Círculo central blanco */}
        <circle cx="50" cy="50" r="39" fill="#ffffff" />
        {/* Texto DT */}
        <text
          x="50"
          y="48"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontSize="24"
          fontWeight="900"
          fill="#475569"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          DT
        </text>
        {/* Subtítulo Dirección del Trabajo */}
        <text
          x="50"
          y="64"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontSize="6"
          fontWeight="700"
          fill="#64748b"
          textAnchor="middle"
          dominantBaseline="middle"
          letterSpacing="0.2"
        >
          Dirección del
        </text>
        <text
          x="50"
          y="71"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontSize="6"
          fontWeight="700"
          fill="#64748b"
          textAnchor="middle"
          dominantBaseline="middle"
          letterSpacing="0.2"
        >
          Trabajo
        </text>
      </svg>
      {showText && (
        <span className="text-[10px] font-black tracking-wider text-slate-600 mt-1 uppercase">
          Dirección del Trabajo
        </span>
      )}
    </div>
  );
}