import React, { useState, useEffect } from 'react';
import { X, FileBadge, Calendar, Plus, Trash2, CheckCircle2, AlertCircle, User, ShieldCheck } from 'lucide-react';
import { apiGetWorkerLeaves, apiCreateWorkerLeave, apiDeleteWorkerLeave } from '../api';

const LEAVE_TYPES = [
  'Licencia Médica (FONASA / ISAPRE)',
  'Permiso con Goce de Sueldo',
  'Permiso sin Goce de Sueldo',
  'Feriado Legal (Vacaciones)',
  'Permiso por Duelo / Matrimonio / Nacimiento',
  'Capacitación / Comisión de Servicio',
  'Otro Justificativo Acreditado'
];

export default function WorkerLeavesModal({ isOpen, onClose, workers = [] }) {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Formulario
  const [userId, setUserId] = useState('');
  const [dateFrom, setDateFrom] = useState(() => new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [leaveType, setLeaveType] = useState(LEAVE_TYPES[0]);
  const [docNumber, setDocNumber] = useState('');
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadLeaves();
      if (workers.length > 0 && !userId) {
        setUserId(workers[0].id);
      }
    }
  }, [isOpen]);

  const loadLeaves = async () => {
    setLoading(true);
    try {
      const data = await apiGetWorkerLeaves();
      setLeaves(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLeave = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!userId || !dateFrom || !dateTo || !leaveType) {
      setErrorMsg('Complete los campos obligatorios.');
      return;
    }

    try {
      const res = await apiCreateWorkerLeave({
        user_id: userId,
        date_from: dateFrom,
        date_to: dateTo,
        leave_type: leaveType,
        document_number: docNumber,
        remarks
      });

      if (res && res.success) {
        setSuccessMsg('Justificativo / Licencia registrada con éxito.');
        setDocNumber('');
        setRemarks('');
        loadLeaves();
        setTimeout(() => setSuccessMsg(''), 4000);
      } else {
        setErrorMsg(res.error || 'No se pudo guardar la licencia.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error al conectar con el servidor.');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Seguro que desea eliminar este justificativo?')) {
      try {
        await apiDeleteWorkerLeave(id);
        loadLeaves();
      } catch (e) {}
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Cabecera */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-500">
              <FileBadge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800 dark:text-zinc-100">
                Licencias Médicas y Justificativos Legales
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
                Respaldo de inasistencias sin alterar las marcaciones biométricas sagradas (Exigencia DT)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mensajes de Alerta */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Formulario de Nuevo Registro */}
          <form onSubmit={handleCreateLeave} className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-800/40 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-zinc-400 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-orange-500" />
              <span>Registrar Nueva Licencia / Justificativo</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">
                  Trabajador:
                </label>
                <select
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-800 dark:text-zinc-200"
                >
                  {workers.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.rut || 'Sin RUT'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">
                  Tipo de Justificativo:
                </label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-800 dark:text-zinc-200"
                >
                  {LEAVE_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">
                  Desde Fecha:
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-800 dark:text-zinc-200"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">
                  Hasta Fecha:
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-800 dark:text-zinc-200"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">
                  N° de Folio / Documento de Respaldo:
                </label>
                <input
                  type="text"
                  placeholder="Ej: Licencia #8472910 o Certificado Médico"
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-800 dark:text-zinc-200"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">
                  Observaciones:
                </label>
                <input
                  type="text"
                  placeholder="Detalle o diagnóstico no confidencial..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-slate-800 dark:text-zinc-200"
                />
              </div>
            </div>

            <button
              type="submit"
              className="py-2.5 px-5 rounded-xl bg-orange-500 hover:bg-orange-600 text-black text-xs font-black transition-all shadow-md cursor-pointer"
            >
              Guardar Justificativo Legal
            </button>
          </form>

          {/* Historial de Justificativos Registrados */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-2">
              Historial de Justificativos y Licencias ({leaves.length})
            </h3>

            {loading ? (
              <p className="text-xs text-slate-500 py-4 text-center">Cargando...</p>
            ) : leaves.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-200 dark:border-zinc-800 rounded-2xl">
                No hay licencias ni permisos registrados en el sistema.
              </p>
            ) : (
              <div className="border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-zinc-800">
                {leaves.map((l) => (
                  <div key={l.id} className="p-3.5 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-zinc-800/40">
                    <div>
                      <div className="font-extrabold text-slate-800 dark:text-zinc-200">
                        {l.user_name} <span className="font-mono text-[11px] text-slate-400 font-normal">({l.user_rut || 'Sin RUT'})</span>
                      </div>
                      <div className="text-[11px] text-orange-600 dark:text-orange-400 font-bold mt-0.5">
                        {l.leave_type} {l.document_number ? `• Doc: ${l.document_number}` : ''}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                        Período: <strong>{l.date_from}</strong> al <strong>{l.date_to}</strong> • Registrado por: {l.created_by || 'Admin'}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDelete(l.id)}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      title="Eliminar justificativo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}