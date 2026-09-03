import React, { useState, useEffect } from 'react';
import { X, Calendar, Check, Save, User, Clock, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { apiUpdateUserWorkDays } from '../api';

const ALL_DAYS = [
  { key: 'mon', label: 'Lunes', short: 'Lun' },
  { key: 'tue', label: 'Martes', short: 'Mar' },
  { key: 'wed', label: 'Miércoles', short: 'Mié' },
  { key: 'thu', label: 'Jueves', short: 'Jue' },
  { key: 'fri', label: 'Viernes', short: 'Vie' },
  { key: 'sat', label: 'Sábado', short: 'Sáb' },
  { key: 'sun', label: 'Domingo', short: 'Dom' }
];

export default function WorkerScheduleModal({ isOpen, onClose, workers = [], onWorkerUpdated }) {
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [selectedDays, setSelectedDays] = useState(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Filtrar solo trabajadores contratados reales (excluir kiosco)
  const contractedWorkers = workers.filter(w => {
    const role = String(w.role || '').toLowerCase();
    const name = String(w.name || '').toLowerCase();
    return role !== 'kiosk' && !name.includes('kiosco') && !name.includes('puesto');
  });

  useEffect(() => {
    if (isOpen && contractedWorkers.length > 0) {
      const initialId = selectedWorkerId || contractedWorkers[0].id;
      setSelectedWorkerId(initialId);
      loadWorkerDays(initialId);
    }
  }, [isOpen, workers]);

  const loadWorkerDays = (workerId) => {
    const worker = contractedWorkers.find(w => String(w.id) === String(workerId));
    if (worker) {
      let days = ['mon', 'tue', 'wed', 'thu', 'fri'];
      if (worker.work_days) {
        try {
          const parsed = typeof worker.work_days === 'string' ? JSON.parse(worker.work_days) : worker.work_days;
          if (Array.isArray(parsed) && parsed.length > 0) {
            days = parsed;
          }
        } catch (e) {}
      }
      setSelectedDays(days);
    }
    setSuccessMsg('');
    setErrorMsg('');
  };

  const handleSelectWorker = (id) => {
    setSelectedWorkerId(id);
    loadWorkerDays(id);
  };

  const toggleDay = (key) => {
    setSelectedDays(prev => {
      if (prev.includes(key)) {
        if (prev.length === 1) {
          setErrorMsg('El trabajador debe tener asignado al menos 1 día laboral a la semana.');
          return prev;
        }
        setErrorMsg('');
        return prev.filter(d => d !== key);
      } else {
        setErrorMsg('');
        return [...prev, key];
      }
    });
  };

  const applyPreset = (presetDays) => {
    setSelectedDays(presetDays);
    setErrorMsg('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!selectedWorkerId) return;
    if (selectedDays.length === 0) {
      setErrorMsg('Debe seleccionar al menos un día laboral.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await apiUpdateUserWorkDays(selectedWorkerId, selectedDays);
      setSuccessMsg('¡Pauta de días laborales guardada con éxito!');
      if (onWorkerUpdated) {
        onWorkerUpdated(selectedWorkerId, selectedDays);
      }
      setTimeout(() => {
        setSuccessMsg('');
      }, 3000);
    } catch (err) {
      setErrorMsg(err.message || 'Error al guardar la pauta laboral.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const currentWorker = contractedWorkers.find(w => String(w.id) === String(selectedWorkerId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800 dark:text-zinc-100">
                Pauta de Días Laborales por Trabajador
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Configure turnos específicos, días de medio tiempo o semanas completas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido Principal */}
        <div className="p-6 overflow-y-auto space-y-6">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Selector de Trabajador */}
          <div>
            <label className="block text-xs font-black text-slate-700 dark:text-zinc-300 mb-2 uppercase tracking-wider">
              1. Seleccione el Trabajador:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {contractedWorkers.map(w => {
                const isSelected = String(w.id) === String(selectedWorkerId);
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => handleSelectWorker(w.id)}
                    className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-100 shadow-sm'
                        : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/60 text-slate-700 dark:text-zinc-300 hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${
                      isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300'
                    }`}>
                      {w.name ? w.name.charAt(0).toUpperCase() : 'T'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-xs truncate">{w.name}</div>
                      <div className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">
                        RUT: {w.rut || 'Sin RUT'} • {w.role === 'admin' || w.role === 'superadmin' ? 'Administrador' : 'Trabajador'}
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Configuración de Días para el trabajador seleccionado */}
          {currentWorker && (
            <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-zinc-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-black text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                  2. Días Laborales para: <span className="text-blue-600 dark:text-blue-400">{currentWorker.name}</span>
                </label>
                <span className="text-[11px] font-bold text-slate-400 dark:text-zinc-500">
                  {selectedDays.length} {selectedDays.length === 1 ? 'día laboral' : 'días laborales'} a la semana
                </span>
              </div>

              {/* Botones de presets rápidos */}
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 self-center mr-1">
                  Pautas Rápidas:
                </span>
                <button
                  type="button"
                  onClick={() => applyPreset(['mon', 'tue', 'wed', 'thu', 'fri'])}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 text-[11px] font-semibold transition-all cursor-pointer"
                >
                  Lun a Vie (Estándar)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'])}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 text-[11px] font-semibold transition-all cursor-pointer"
                >
                  Lun a Sáb (6 días)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset(['mon', 'wed', 'fri'])}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 text-[11px] font-semibold transition-all cursor-pointer"
                >
                  Part-Time (Lun, Mié, Vie)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset(['sat', 'sun'])}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 text-[11px] font-semibold transition-all cursor-pointer"
                >
                  Solo Fines de Semana
                </button>
              </div>

              {/* Botones de selección de día */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                {ALL_DAYS.map(day => {
                  const isActive = selectedDays.includes(day.key);
                  return (
                    <button
                      key={day.key}
                      type="button"
                      onClick={() => toggleDay(day.key)}
                      className={`py-3 px-2 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                        isActive
                          ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/20'
                          : 'border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/40 text-slate-600 dark:text-zinc-400 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-[10px] font-black uppercase tracking-wider opacity-80">{day.short}</span>
                      <span className="text-xs font-black">{day.label}</span>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center mt-0.5 ${
                        isActive ? 'bg-white/20 text-white' : 'border border-slate-300 dark:border-zinc-600'
                      }`}>
                        {isActive && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Nota Legal informativa */}
              <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/60 rounded-xl text-[11px] text-blue-800 dark:text-blue-300 font-medium">
                <strong>Impacto en Reportes y Descargas Excel:</strong> Los días no laborables del trabajador se computarán automáticamente como <em>"Descanso Pactado"</em> en lugar de inasistencia, garantizando el cálculo exacto de horas y asistencia para trabajadores con turnos rotativos o jornadas parciales.
              </div>
            </div>
          )}
        </div>

        {/* Barra de Acciones */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all cursor-pointer"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black text-xs flex items-center gap-2 shadow-lg shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{loading ? 'Guardando...' : 'Guardar Pauta Laboral'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
