import React, { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw,
  X, FileBadge, Calendar, Plus, Trash2, CheckCircle2, AlertCircle, User, ShieldCheck, 
  Upload, FileText, Download, ExternalLink, Search, Filter, Clock, Eye, ListFilter, Users
} from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'create'
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtros del Listado
  const [searchQuery, setSearchQuery] = useState('');
  const [filterWorkerId, setFilterWorkerId] = useState('');
  const [filterType, setFilterType] = useState('');

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
    }
  }, [isOpen]);

  useEffect(() => {
    if (contractedWorkers.length > 0 && !userId) {
      setUserId(contractedWorkers[0].id);
    }
  }, [contractedWorkers, userId]);

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

    const targetUserId = Number(userId || contractedWorkers[0]?.id);
    if (!targetUserId || !dateFrom || !dateTo || !leaveType) {
      setErrorMsg('Complete los campos obligatorios (trabajador, fechas y tipo) para registrar el justificativo.');
      return;
    }

    if (dateTo < dateFrom) {
      setErrorMsg('La fecha de término (hasta) no puede ser anterior a la fecha de inicio (desde).');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiCreateWorkerLeave({
        user_id: targetUserId,
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
        await loadLeaves();
        if (onLeaveUpdated) onLeaveUpdated();
        setActiveTab('list');
        setTimeout(() => setSuccessMsg(''), 5000);
      } else {
        setErrorMsg(res.error || 'No se pudo guardar la licencia.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error al conectar con el servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Desea eliminar este justificativo? Esto restaurará las inasistencias en el historial de asistencia correspondiente.')) {
      try {
        await apiDeleteWorkerLeave(id);
        loadLeaves();
        if (onLeaveUpdated) onLeaveUpdated();
      } catch (e) {
        alert('Error al eliminar justificativo: ' + e.message);
      }
    }
  };

  // Cálculo de días cubiertos por una licencia
  const calculateDaysCount = (from, to) => {
    if (!from || !to) return 1;
    try {
      const d1 = new Date(from + 'T00:00:00Z');
      const d2 = new Date(to + 'T00:00:00Z');
      const diffTime = Math.abs(d2 - d1);
      return Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
    } catch (e) {
      return 1;
    }
  };

  // Determinar estado de vigencia hoy
  const getStatusBadge = (from, to) => {
    const today = new Date().toISOString().split('T')[0];
    if (today >= from && today <= to) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          Vigente Hoy
        </span>
      );
    } else if (today > to) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
          Concluida
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
          Programada
        </span>
      );
    }
  };

  // Filtrar justificativos
  const filteredLeaves = useMemo(() => {
    return leaves.filter(l => {
      if (filterWorkerId && String(l.user_id) !== String(filterWorkerId)) return false;
      if (filterType && l.leave_type !== filterType) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const workerName = (l.user_name || '').toLowerCase();
        const workerRut = (l.user_rut || '').toLowerCase();
        const docNum = (l.document_number || '').toLowerCase();
        const remarks = (l.remarks || '').toLowerCase();
        if (!workerName.includes(q) && !workerRut.includes(q) && !docNum.includes(q) && !remarks.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [leaves, filterWorkerId, filterType, searchQuery]);

  // Métricas
  const totalDaysJustified = useMemo(() => {
    return leaves.reduce((acc, l) => acc + calculateDaysCount(l.date_from, l.date_to), 0);
  }, [leaves]);

  const uniqueWorkersCount = useMemo(() => {
    return new Set(leaves.map(l => l.user_id)).size;
  }, [leaves]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-4xl bg-zinc-950 border border-zinc-800 text-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Cabecera Principal */}
        <div className="px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <FileBadge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <span>Licencias Médicas & Justificativos Laborales (DT)</span>
              </h2>
              <p className="text-[11px] text-zinc-400 font-medium">
                Registro y listado oficial de trabajadores que han justificado inasistencias con fechas y comprobantes
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

        {/* Pestañas de Navegación */}
        <div className="px-6 pt-3 border-b border-zinc-800 bg-zinc-900/30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className={'pb-3 px-3 text-xs font-black border-b-2 transition-all flex items-center gap-2 cursor-pointer ' + (
                activeTab === 'list'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              )}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>Listado de Justificativos ({leaves.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className={'pb-3 px-3 text-xs font-black border-b-2 transition-all flex items-center gap-2 cursor-pointer ' + (
                activeTab === 'create'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              )}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ingresar Nueva Licencia</span>
            </button>
          </div>

          {activeTab === 'list' && (
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => loadLeaves()}
                disabled={loading}
                title="Actualizar listado de justificativos"
                className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-300 font-bold text-xs px-3 py-1.5 rounded-xl border border-zinc-700 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
                <span>Actualizar</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('create')}
                className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-xs px-3.5 py-1.5 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nuevo Justificativo</span>
              </button>
            </div>
          )}
        </div>

        {/* Mensajes de Alerta */}
        {errorMsg && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-red-950/50 border border-red-800 text-red-400 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-emerald-950/50 border border-emerald-800 text-emerald-400 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Contenedor con Scroll */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* ========================================================================= */}
          {/* PESTAÑA 1: LISTADO DE JUSTIFICATIVOS */}
          {/* ========================================================================= */}
          {activeTab === 'list' && (
            <div className="space-y-4">
              
              {/* Resumen Métricas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0">
                    <FileBadge className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider">Total Justificativos</div>
                    <div className="text-lg font-black text-white">{leaves.length} registros</div>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider">Trabajadores Justificados</div>
                    <div className="text-lg font-black text-white">{uniqueWorkersCount} personas</div>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider">Días Cubiertos en Historial</div>
                    <div className="text-lg font-black text-emerald-400">{totalDaysJustified} días totales</div>
                  </div>
                </div>
              </div>

              {/* Barra de Filtros */}
              <div className="p-3 rounded-2xl bg-zinc-900/40 border border-zinc-800 flex flex-wrap items-center gap-3 justify-between">
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Buscar trabajador, RUT, folio o motivo..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-black/60 border border-zinc-700/80 pl-8 pr-3 py-1.5 rounded-xl text-xs text-white placeholder:text-zinc-500 font-medium focus:border-indigo-500"
                    />
                  </div>

                  <select
                    value={filterWorkerId}
                    onChange={(e) => setFilterWorkerId(e.target.value)}
                    className="bg-black/60 border border-zinc-700/80 px-3 py-1.5 rounded-xl text-xs text-white font-bold cursor-pointer"
                  >
                    <option value="">Todos los trabajadores ({contractedWorkers.length})</option>
                    {contractedWorkers.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>

                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="bg-black/60 border border-zinc-700/80 px-3 py-1.5 rounded-xl text-xs text-white font-bold cursor-pointer"
                  >
                    <option value="">Todos los tipos</option>
                    {LEAVE_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {(searchQuery || filterWorkerId || filterType) && (
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(''); setFilterWorkerId(''); setFilterType(''); }}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>

              {/* Listado de Tarjetas / Tabla Detallada */}
              {filteredLeaves.length === 0 ? (
                <div className="p-8 text-center border border-zinc-800 rounded-2xl bg-zinc-900/20 space-y-2">
                  <FileText className="w-8 h-8 text-zinc-600 mx-auto" />
                  <p className="text-xs text-zinc-400 font-bold">
                    {leaves.length === 0 
                      ? 'No hay licencias ni justificativos registrados todavía.' 
                      : 'No se encontraron resultados con los filtros aplicados.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('create')}
                    className="inline-flex items-center gap-1.5 text-xs font-black text-indigo-400 hover:underline mt-2 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Haga clic aquí para ingresar la primera licencia</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredLeaves.map((l) => {
                    const daysCount = calculateDaysCount(l.date_from, l.date_to);
                    const pdfFullUrl = l.pdf_url ? (l.pdf_url.startsWith('http') ? l.pdf_url : getApiBaseUrl() + l.pdf_url) : null;
                    
                    return (
                      <div
                        key={l.id}
                        className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 hover:border-zinc-700/80 transition-all shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        {/* Información del Trabajador y Justificativo */}
                        <div className="space-y-2 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-black text-sm text-white">{l.user_name || workers.find(w => String(w.id) === String(l.user_id))?.name || `Trabajador ID #${l.user_id}`}</span>
                            {(l.user_rut || workers.find(w => String(w.id) === String(l.user_id))?.rut) && (
                              <span className="font-mono text-[11px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-lg">
                                RUT: {l.user_rut || workers.find(w => String(w.id) === String(l.user_id))?.rut}
                              </span>
                            )}
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              {l.leave_type}
                            </span>
                            {getStatusBadge(l.date_from, l.date_to)}
                          </div>

                          {/* Rango de Fechas Claramente Visible */}
                          <div className="flex flex-wrap items-center gap-3 text-xs">
                            <div className="flex items-center gap-1.5 font-mono text-orange-400 font-bold bg-orange-500/10 border border-orange-500/30 px-2.5 py-1 rounded-xl">
                              <Calendar className="w-3.5 h-3.5 text-orange-400" />
                              <span>Desde: <strong>{l.date_from}</strong></span>
                              <span>→</span>
                              <span>Hasta: <strong>{l.date_to}</strong></span>
                            </div>

                            <span className="font-black text-xs text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-lg">
                              {daysCount} {daysCount === 1 ? 'día justificado' : 'días justificados'}
                            </span>

                            {l.document_number && (
                              <span className="text-[11px] text-zinc-300 font-mono font-bold bg-zinc-800/80 px-2 py-0.5 rounded-lg">
                                N° Folio: {l.document_number}
                              </span>
                            )}
                          </div>

                          {l.remarks && (
                            <p className="text-xs text-zinc-300 italic bg-black/40 p-2 rounded-xl border border-zinc-800/80">
                              «{l.remarks}»
                            </p>
                          )}

                          <div className="text-[10px] text-zinc-500 font-medium flex items-center gap-2">
                            <span>Registrado el {l.created_at ? l.created_at.substring(0, 16) : 'Recientemente'}</span>
                            {l.created_by && <span>• Por: {l.created_by}</span>}
                          </div>
                        </div>

                        {/* Botones de Acción */}
                        <div className="flex items-center gap-2 self-end md:self-center flex-shrink-0">
                          {pdfFullUrl ? (
                            <a
                              href={pdfFullUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 hover:text-white border border-indigo-500/40 text-xs font-black px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                              title="Ver documento PDF o imagen de respaldo"
                            >
                              <FileText className="w-4 h-4 text-indigo-400" />
                              <span>Ver Respaldo PDF</span>
                            </a>
                          ) : (
                            <span className="text-[11px] text-zinc-500 bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 rounded-xl flex items-center gap-1">
                              <FileText className="w-3.5 h-3.5 text-zinc-600" />
                              <span>Sin archivo</span>
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDelete(l.id)}
                            className="p-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-800 text-red-400 hover:text-red-200 transition-all cursor-pointer"
                            title="Eliminar justificativo y restaurar inasistencias"
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
          )}

          {/* ========================================================================= */}
          {/* PESTAÑA 2: FORMULARIO DE INGRESO */}
          {/* ========================================================================= */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateLeave} className="p-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <span className="text-xs font-black uppercase text-indigo-400 flex items-center gap-1.5">
                  <Plus className="w-4 h-4" />
                  <span>Ingresar Nueva Licencia / Justificativo</span>
                </span>
                <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Justifica los días automáticamente en el historial
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Trabajador */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-zinc-300 mb-1">Trabajador que presenta justificativo:</label>
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
                  <label className="block text-xs font-bold text-zinc-300 mb-1">Fecha Inicio (Desde qué día faltó):</label>
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
                  <label className="block text-xs font-bold text-zinc-300 mb-1">Fecha Término (Hasta qué día):</label>
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
                  <label className="block text-xs font-bold text-zinc-300 mb-1">Tipo de Justificativo / Licencia:</label>
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
                  <label className="block text-xs font-bold text-zinc-300 mb-1">N° Folio / Licencia / Comprobante:</label>
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
                  <label className="block text-xs font-bold text-zinc-300 mb-1">
                    Adjuntar Respaldo en PDF o Foto de la Licencia:
                  </label>
                  <div className="border-2 border-dashed border-zinc-700 hover:border-indigo-500 rounded-2xl p-4 text-center transition-all bg-black/50">
                    <input
                      type="file"
                      id="leave-pdf-input"
                      accept=".pdf,image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <label htmlFor="leave-pdf-input" className="cursor-pointer flex flex-col items-center justify-center gap-1.5 py-1">
                      <Upload className="w-7 h-7 text-indigo-400" />
                      {pdfFileName ? (
                        <div className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="truncate max-w-[280px]">{pdfFileName}</span>
                          <span className="text-[10px] text-zinc-400 font-normal">({(pdfFileSize / 1024).toFixed(0)} KB)</span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-xs font-bold text-indigo-400 hover:underline">
                            Haga clic aquí para seleccionar el archivo PDF o fotografía
                          </span>
                          <p className="text-[10px] text-zinc-500 mt-0.5">
                            Formatos aceptados: PDF, JPG, PNG (máx. 10 MB)
                          </p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                {/* Observaciones */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-zinc-300 mb-1">Observaciones / Diagnóstico / Motivo:</label>
                  <input
                    type="text"
                    placeholder="Detalle médico, médico tratante o motivo del permiso..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full rounded-xl bg-black border border-zinc-700 px-3 py-2 text-xs font-bold text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="text-xs font-bold text-zinc-400 hover:text-white px-3 py-2 rounded-xl transition-all cursor-pointer"
                >
                  Volver al Listado
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isSubmitting ? 'Guardando y justificando días...' : 'Registrar y Justificar Inasistencias'}</span>
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
