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
  const [localWorkDaysMap, setLocalWorkDaysMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Filtrar solo trabajadores contratados reales (excluir kiosco)
  const contractedWorkers = workers.filter(w => {
    const role = String(w.role || '').toLowerCase();
    const name = String(w.name || '').toLowerCase();
    return role !== 'kiosk' && !name.includes('kiosco') && !name.includes('puesto');
  });

  // Inicializar mapa de días cuando se abre el modal
  useEffect(() => {
    if (isOpen && contractedWorkers.length > 0) {
      const initialMap = {};
      contractedWorkers.forEach(w => {
        let days = ['mon', 'tue', 'wed', 'thu', 'fri'];
        if (w.work_days) {
          try {
            const parsed = typeof w.work_days === 'string' ? JSON.parse(w.work_days) : w.work_days;
            if (Array.isArray(parsed) && parsed.length > 0) {
              days = parsed;
            }
          } catch (e) {}
        }
        initialMap[String(w.id)] = days;
      });
      setLocalWorkDaysMap(prev => ({ ...initialMap, ...prev }));

      const currentId = selectedWorkerId && contractedWorkers.some(w => String(w.id) === String(selectedWorkerId))
        ? String(selectedWorkerId)
        : String(contractedWorkers[0].id);

      setSelectedWorkerId(currentId);
      setSelectedDays(initialMap[currentId] || ['mon', 'tue', 'wed', 'thu', 'fri']);
    }
  }, [isOpen]);

  const handleSelectWorker = (id) => {
    const targetId = String(id);
    setSelectedWorkerId(targetId);
    if (localWorkDaysMap[targetId]) {
      setSelectedDays(localWorkDaysMap[targetId]);
    } else {
      const w = contractedWorkers.find(item => String(item.id) === targetId);
      let days = ['mon', 'tue', 'wed', 'thu', 'fri'];
      if (w && w.work_days) {
        try {
          const parsed = typeof w.work_days === 'string' ? JSON.parse(w.work_days) : w.work_days;
          if (Array.isArray(parsed) && parsed.length > 0) days = parsed;
        } catch (e) {}
      }
      setSelectedDays(days);
    }
    setSuccessMsg('');
    setErrorMsg('');
  };

  const toggleDay = (key) => {
    setSelectedDays(prev => {
      if (prev.includes(key)) {
        if (prev.length === 1) {
          setErrorMsg('El trabajador debe tener al menos 1 día laboral a la semana.');
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
      
      // Actualizar mapa local inmediatamente para que persista en pantalla
      setLocalWorkDaysMap(prev => ({
        ...prev,
        [String(selectedWorkerId)]: selectedDays
      }));

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-zinc-950 border border-zinc-800 text-white rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Cabecera */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-black">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white">
                Pauta de Días Laborales por Trabajador
              </h2>
              <p className="text-xs text-zinc-400">
                Configure los días oficiales en que debe asistir a trabajar cada colaborador
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido Principal */}
        <div className="p-6 overflow-y-auto space-y-6">
          {errorMsg && (
            <div className="p-3 bg-red-950/50 border border-red-800 rounded-xl text-xs font-semibold text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-950/50 border border-emerald-800 rounded-xl text-xs font-semibold text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Selector de Trabajador */}
          <div>
            <label className="block text-xs font-black text-zinc-400 mb-2 uppercase tracking-wider">
              1. Seleccione el Trabajador:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {contractedWorkers.map(w => {
                const isSelected = String(w.id) === String(selectedWorkerId);
                const assignedDays = localWorkDaysMap[String(w.id)] || ['mon', 'tue', 'wed', 'thu', 'fri'];
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => handleSelectWorker(w.id)}
                    className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-950/40 text-white shadow-md shadow-blue-500/10'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs ${
                      isSelected ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-300'
                    }`}>
                      {w.name ? w.name.charAt(0).toUpperCase() : 'T'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-xs truncate text-white">{w.name}</div>
                      <div className="text-[10px] text-zinc-400 truncate">
                        {assignedDays.length} días laborales ({assignedDays.map(k => ALL_DAYS.find(d => d.key === k)?.short).filter(Boolean).join(', ')})
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-blue-400 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Configuración de Días para el trabajador seleccionado */}
          {currentWorker && (
            <div className="space-y-4 pt-4 border-t border-zinc-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-black text-zinc-300 uppercase tracking-wider">
                  2. Días Asignados para: <span className="text-blue-400">{currentWorker.name}</span>
                </label>
                <span className="text-[11px] font-bold text-zinc-400">
                  {selectedDays.length} {selectedDays.length === 1 ? 'día laboral' : 'días laborales'} a la semana
                </span>
              </div>

              {/* Botones de presets rápidos */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] font-bold text-zinc-400 self-center mr-1">
                  Pautas Frecuentes:
                </span>
                <button
                  type="button"
                  onClick={() => applyPreset(['mon', 'tue', 'wed', 'thu', 'fri'])}
                  className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[11px] font-semibold border border-zinc-800 transition-all cursor-pointer"
                >
                  Lun a Vie (5 días)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'])}
                  className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[11px] font-semibold border border-zinc-800 transition-all cursor-pointer"
                >
                  Lun a Sáb (6 días)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset(['mon', 'wed', 'fri'])}
                  className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[11px] font-semibold border border-zinc-800 transition-all cursor-pointer"
                >
                  Part-Time (Lun, Mié, Vie)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset(['sat', 'sun'])}
                  className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[11px] font-semibold border border-zinc-800 transition-all cursor-pointer"
                >
                  Fines de Semana (Sáb y Dom)
                </button>
              </div>

              {/* Botones de selección de día */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 pt-1">
                {ALL_DAYS.map(day => {
                  const isActive = selectedDays.includes(day.key);
                  return (
                    <button
                      key={day.key}
                      type="button"
                      onClick={() => toggleDay(day.key)}
                      className={`py-3 px-2 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                        isActive
                          ? 'border-blue-500 bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                          : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <span className="text-[10px] font-black uppercase tracking-wider opacity-80">{day.short}</span>
                      <span className="text-xs font-black">{day.label}</span>
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center mt-0.5 ${
                        isActive ? 'bg-white/20 text-white' : 'border border-zinc-700'
                      }`}>
                        {isActive && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Nota Legal informativa */}
              <div className="p-3 bg-blue-950/40 border border-blue-900/60 rounded-xl text-[11px] text-blue-300 font-medium leading-relaxed">
                <strong>Impacto Legal en Planilla y Excel:</strong> Los días no seleccionados se registrarán automáticamente como <em>"Descanso Pactado"</em> en lugar de falta injustificada, respetando la jornada real de los colaboradores a tiempo parcial o turnos específicos.
              </div>
            </div>
          )}
        </div>

        {/* Barra de Acciones */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-300 font-bold text-xs hover:bg-zinc-800 transition-all cursor-pointer"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black text-xs flex items-center gap-2 shadow-lg shadow-blue-600/30 transition-all cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{loading ? 'Guardando...' : 'Guardar Pauta Laboral'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
