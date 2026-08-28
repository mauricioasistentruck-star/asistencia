import React, { useState, useRef } from 'react';
import { Database, Download, UploadCloud, ShieldCheck, X, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { apiExportBackup, apiImportBackup, autoRestoreAndSyncWithServer, apiLockAsBase } from '../api';

export default function BackupModal({ isOpen, onClose, theme }) {
  const [backupLoading, setBackupLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const isDark = theme === 'dark';

  
  const handleLockCurrentAsBase = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setBackupLoading(true);
    try {
      const res = await apiLockAsBase();
      setSuccessMsg('¡ESTADO BASE REGISTRADO CON ÉXITO! Todos los perfiles, fotos y marcaciones actuales han quedado fijados como la base indestructible del sistema.');
    } catch (err) {
      setErrorMsg(err.message || 'Error al fijar el estado base');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleExportBackup = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setBackupLoading(true);
    try {
      await apiExportBackup();
      setSuccessMsg('¡Exportación masiva descargada con éxito! Archivo JSON generado con usuarios, contraseñas, fotos, marcaciones y rutas GPS.');
    } catch (err) {
      setErrorMsg(err.message || 'Error al generar la copia de seguridad');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!window.confirm('¿Desea restaurar esta copia de seguridad? Se importarán y sincronizarán todos los trabajadores, contraseñas, fotos, marcaciones y rutas registradas.')) {
      e.target.value = '';
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setBackupLoading(true);

    try {
      const text = await file.text();
      const backupJson = JSON.parse(text);
      const res = await apiImportBackup(backupJson);
      const stats = res.stats || {};
      setSuccessMsg(`¡Restauración exitosa! (${stats.users || 0} trabajadores, ${stats.attendance || 0} marcaciones, ${stats.routes || 0} rutas GPS sincronizadas).`);
      setTimeout(() => {
        autoRestoreAndSyncWithServer();
      }, 500);
    } catch (err) {
      setErrorMsg(err.message || 'Error al procesar archivo de copia de seguridad');
    } finally {
      setBackupLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999999] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className={'border rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 transition-all ' + (isDark ? 'bg-zinc-950 border-orange-500/40 text-white' : 'bg-white border-orange-200 text-zinc-900')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-orange-500/20">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/20 border border-orange-500/40 text-orange-500 flex items-center justify-center shadow-md">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black tracking-tight">Copia de Seguridad</h3>
                <span className="text-[9px] bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full font-bold uppercase">
                  SuperAdmin
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">Exportar o restaurar toda la base de datos y bóveda maestra</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-2xl text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3 rounded-2xl text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className={'p-4 rounded-2xl border text-xs space-y-2 ' + (isDark ? 'bg-zinc-900/60 border-zinc-800 text-zinc-300' : 'bg-orange-50/60 border-orange-100 text-zinc-800')}>
          <div className="font-bold text-orange-500 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            <span>Protección de Datos Totales</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            La exportación genera un archivo <strong>.json</strong> completo e independiente que incluye: <strong>todos los trabajadores, contraseñas, fotografías en alta fidelidad, historial histórico de entradas/salidas y rutas satelitales GPS</strong>.
          </p>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={handleLockCurrentAsBase}
            disabled={backupLoading}
            className="w-full mb-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-black text-xs font-black p-3.5 rounded-2xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{backupLoading ? 'Guardando Base...' : 'Fijar Datos y Fotos Actuales como Estado Base Permanente'}</span>
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Botón Exportar */}
          <button
            type="button"
            onClick={handleExportBackup}
            disabled={backupLoading}
            className="w-full bg-orange-500 hover:bg-orange-600 active:scale-95 text-black text-xs font-black p-3.5 rounded-2xl shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{backupLoading ? 'Generando...' : 'Exportar Masivo (.json)'}</span>
          </button>

          {/* Botón Importar */}
          <button
            type="button"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            disabled={backupLoading}
            className={'w-full active:scale-95 text-xs font-black p-3.5 rounded-2xl border transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ' + (
              isDark ? 'bg-zinc-900 hover:bg-zinc-800 text-white border-zinc-700 hover:border-orange-500/40' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border-zinc-300'
            )}
          >
            <UploadCloud className="w-4 h-4 text-orange-500" />
            <span>{backupLoading ? 'Procesando...' : 'Importar Masivo (.json)'}</span>
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json,application/json"
            className="hidden"
          />
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white rounded-xl bg-zinc-900 border border-zinc-800 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
