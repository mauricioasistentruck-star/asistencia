import React, { useState, useEffect } from 'react';
import { X, FileBadge, Calendar, Plus, Trash2, CheckCircle2, AlertCircle, User, ShieldCheck, Upload, FileText, Download, ExternalLink } from 'lucide-react';
import { apiGetWorkerLeaves, apiCreateWorkerLeave, apiDeleteWorkerLeave, getApiBaseUrl } from '../api';

const LEAVE_TYPES = [
  'Licencia Médica (FONASA / ISAPRE)',
  'Permiso con Goce de Sueldo',
  'Permiso sin Goce de Sueldo',
  'Feriado Legal (Vacaciones)',
  'Permiso por Duelo / Matrimonio / Nacimiento',
  'Capacitación / Comisión de Servicio',
  'Otro Justificativo Acreditado'
];

export default function WorkerLeavesModal({ isOpen, onClose, workers = [], onLeaveUpdated }) {
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
  const [pdfBase64, setPdfBase64] = useState('');
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfFileSize, setPdfFileSize] = useState(0);

  // Filtrar solo trabajadores contratados reales
  const contractedWorkers = workers.filter(w => {
    const role = String(w.role || '').toLowerCase();
    const name = String(w.name || '').toLowerCase();
    return role !== 'kiosk' && !name.includes('kiosco') && !name.includes('puesto');
  });

  useEffect(() => {
    if (isOpen) {
      loadLeaves();
      if (contractedWorkers.length > 0 && !userId) {
        setUserId(contractedWorkers[0].id);
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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('El archivo excede el tamaño máximo permitido de 10 MB.');
      return;
    }

    setPdfFileName(file.name);
    setPdfFileSize(file.size);
    setErrorMsg('');

    const reader = new FileReader();
    reader.onload = () => {
      setPdfBase64(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateLeave = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!userId || !dateFrom || !dateTo || !leaveType) {
      setErrorMsg('Complete los campos obligatorios para registrar el justificativo.');
      return;
    }

    try {
      const res = await apiCreateWorkerLeave({
        user_id: userId,
        date_from: dateFrom,
        date_to: dateTo,
        leave_type: leaveType,
        document_number: docNumber,
        remarks,
        pdf_base64: pdfBase64,
        pdf_filename: pdfFileName
      });

      if (res && res.success) {
        setSuccessMsg('Licencia registrada con éxito. Se justificaron todos los días en el historial de asistencia.');
        setDocNumber('');
        setRemarks('');
        setPdfBase64('');
        setPdfFileName('');
        setPdfFileSize(0);
        loadLeaves();
        if (onLeaveUpdated) onLeaveUpdated();
        setTimeout(() => setSuccessMsg(''), 5000);
      } else {
        setErrorMsg(res.error || 'No se pudo guardar la licencia.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error al conectar con el servidor.');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Desea eliminar esta licencia? Esto restaurará el historial de asistencia correspondiente.')) {
      try {
        await apiDeleteWorkerLeave(id);
        loadLeaves();
        if (onLeaveUpdated) onLeaveUpdated();
      } catch (e) {}
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 text-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Cabecera */}
        <div className="px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <FileBadge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white">
                Licencias Médicas y Justificativos Legales
              </h2>
              <p className="text-[11px] text-zinc-400 font-medium">
                Justifica y salda inasistencias automáticamente en el historial oficial con respaldo en PDF
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mensajes de Alerta */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-950/50 border border-red-800 text-red-400 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-950/50 border border-emerald-800 text-emerald-400 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Formulario de Nuevo Registro */}
          <form onSubmit={handleCreateLeave} className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-xs font-black uppercase text-indigo-400 flex items-center gap-1.5">
                <Plus className="w-4 h-4" />
                <span>Ingresar Nueva Licencia / Justificativo</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-medium">Actualiza historial al instante</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Trabajador */}
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-zinc-300 mb-1">Trabajador:</label>
                <select
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="w-full rounded-xl bg-black border border-zinc-700 px-3 py-2 text-xs font-bold text-white cursor-pointer"
                  required
                >
                  {contractedWorkers.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} • RUT: {w.rut || 'Sin RUT'} ({w.role === 'admin' || w.role === 'superadmin' ? 'Administrador' : 'Trabajador'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Fecha Desde */}
              <div>
                <label className="block text-[11px] font-bold text-zinc-300 mb-1">Fecha Inicio (Desde):</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full rounded-xl bg-black border border-zinc-700 px-3 py-2 text-xs font-bold text-white"
                  required
                />
              </div>

              {/* Fecha Hasta */}
              <div>
                <label className="block text-[11px] font-bold text-zinc-300 mb-1">Fecha Término (Hasta):</label>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full rounded-xl bg-black border border-zinc-700 px-3 py-2 text-xs font-bold text-white"
                  required
                />
              </div>

              {/* Tipo de Justificativo */}
              <div>
                <label className="block text-[11px] font-bold text-zinc-300 mb-1">Tipo de Justificativo:</label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  className="w-full rounded-xl bg-black border border-zinc-700 px-3 py-2 text-xs font-bold text-white cursor-pointer"
                  required
                >
                  {LEAVE_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Número de Folio / Licencia */}
              <div>
                <label className="block text-[11px] font-bold text-zinc-300 mb-1">N° Folio / Licencia / Comprobante:</label>
                <input
                  type="text"
                  placeholder="Ej: LIC-8472910 o COMP-2026"
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                  className="w-full rounded-xl bg-black border border-zinc-700 px-3 py-2 text-xs font-bold text-white"
                />
              </div>

              {/* Cargar Archivo PDF o Imagen de la Licencia */}
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-zinc-300 mb-1">
                  Adjuntar Licencia Médica (PDF o Imagen):
                </label>
                <div className="border-2 border-dashed border-zinc-700 hover:border-indigo-500 rounded-2xl p-3 text-center transition-all bg-black/50">
                  <input
                    type="file"
                    id="leave-pdf-input"
                    accept=".pdf,image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <label htmlFor="leave-pdf-input" className="cursor-pointer flex flex-col items-center justify-center gap-1.5 py-1">
                    <Upload className="w-6 h-6 text-indigo-400" />
                    {pdfFileName ? (
                      <div className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="truncate max-w-[280px]">{pdfFileName}</span>
                        <span className="text-[10px] text-zinc-400 font-normal">({(pdfFileSize / 1024).toFixed(0)} KB)</span>
                      </div>
                    ) : (
                      <div>
                        <span className="text-xs font-bold text-indigo-400 hover:underline">
                          Haga clic aquí para adjuntar el PDF o foto de la licencia
                        </span>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          Formatos: PDF, JPG, PNG (hasta 10 MB)
                        </p>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              {/* Observaciones */}
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-zinc-300 mb-1">Observaciones / Diagnóstico (Opcional):</label>
                <input
                  type="text"
                  placeholder="Detalle médico, médico tratante o motivo del permiso..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full rounded-xl bg-black border border-zinc-700 px-3 py-2 text-xs font-bold text-white"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Registrar y Justificar Inasistencias</span>
              </button>
            </div>
          </form>

          {/* Historial de Justificativos Registrados */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">
                Licencias y Justificativos Vigentes ({leaves.length})
              </h3>
            </div>

            {leaves.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-500 border border-zinc-800 rounded-2xl bg-zinc-900/30">
                No hay licencias médicas ni justificativos registrados en el sistema.
              </div>
            ) : (
              <div className="space-y-2">
                {leaves.map((l) => {
                  const pdfFullUrl = l.pdf_url ? (l.pdf_url.startsWith('http') ? l.pdf_url : getApiBaseUrl() + l.pdf_url) : null;
                  return (
                    <div
                      key={l.id}
                      className="p-3.5 rounded-2xl border border-zinc-800 bg-zinc-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-zinc-700 transition-all"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-xs text-white">{l.user_name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            {l.leave_type}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-1 font-mono">
                            <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                            {l.date_from} al {l.date_to}
                          </span>
                          {l.document_number && (
                            <span className="font-mono text-zinc-300 font-bold">
                              • Folio: {l.document_number}
                            </span>
                          )}
                          {l.created_by && (
                            <span className="text-zinc-500">
                              • Reg. por: {l.created_by}
                            </span>
                          )}
                        </div>
                        {l.remarks && (
                          <div className="text-[11px] text-zinc-400 italic">
                            "{l.remarks}"
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        {/* Botón Ver PDF Adjunto */}
                        {pdfFullUrl && (
                          <a
                            href={pdfFullUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-xs font-black border border-blue-500/40 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                            title="Ver o descargar comprobante legal adjunto"
                          >
                            <FileText className="w-3.5 h-3.5 text-blue-400" />
                            <span>Ver PDF</span>
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDelete(l.id)}
                          className="p-2 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-950/40 transition-all cursor-pointer"
                          title="Eliminar justificativo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Pie de modal */}
        <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-900/50 flex justify-between items-center text-[11px] text-zinc-400">
          <span>Art. 514 Código del Trabajo • Respaldo Digital Legal</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs cursor-pointer"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
