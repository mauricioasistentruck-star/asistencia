import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, Download, Filter, Edit3, Lock, ShieldAlert, CheckCircle2, Clock, 
  Radio, Calendar, Trash2, Printer, AlertTriangle, User, ChevronRight, TrendingUp, 
  AlertCircle, CheckCircle, Search, RefreshCw, BarChart3, Layers
} from 'lucide-react';
import { 
  apiGetAttendanceRecords, 
  apiGetUsers, 
  apiAdminEditAttendance, 
  apiDeleteAttendanceRecord, 
  getExportExcelUrl, 
  getSocket, 
  getChileTodayString,
  mergeAttendanceToVault 
} from '../api';

export default function AdminAttendanceView({ user, theme }) {
  const [records, setRecords] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(getChileTodayString());
  const [dateTo, setDateTo] = useState(getChileTodayString());
  const [selectedUserId, setSelectedUserId] = useState('');
  const [activeSubTab, setActiveSubTab] = useState('summary'); // 'summary' | 'details'
  
  // Edición Administrativa
  const [editingRecord, setEditingRecord] = useState(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [editForm, setEditForm] = useState({
    entry_time: '',
    lunch_out_time: '',
    lunch_in_time: '',
    exit_time: '',
    admin_note: ''
  });
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [lastLiveAlert, setLastLiveAlert] = useState(null);

  const isDark = theme === 'dark';
  const isSuperAdmin = user && (
    user.is_superadmin === 1 || 
    user.role === 'superadmin' ||
    (user.name || '').toLowerCase().includes('mauricio') ||
    (user.username || '').toLowerCase().includes('mauricio')
  );

  const parseTimeToMinutes = (t) => {
    if (!t) return null;
    const parts = t.trim().split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    return parts[0] * 60 + parts[1] + (parts[2] ? parts[2] / 60 : 0);
  };

  const formatMinutesToHHMM = (totalMins) => {
    if (!totalMins || totalMins <= 0) return '0h 00m';
    const h = Math.floor(totalMins / 60);
    const m = Math.round(totalMins % 60);
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  };

  const calculateRecordMinutes = (r) => {
    if (!r) return 0;
    const entryMin = parseTimeToMinutes(r.entry_time);
    const exitMin = parseTimeToMinutes(r.exit_time);
    if (entryMin !== null && exitMin !== null && exitMin >= entryMin) {
      let mins = exitMin - entryMin;
      const lunchOutMin = parseTimeToMinutes(r.lunch_out_time);
      const lunchInMin = parseTimeToMinutes(r.lunch_in_time);
      if (lunchOutMin !== null && lunchInMin !== null && lunchInMin > lunchOutMin) {
        mins -= (lunchInMin - lunchOutMin);
      }
      return Math.max(0, Math.round(mins));
    }
    if (r.total_hours) {
      return Math.round(r.total_hours * 60);
    }
    return 0;
  };

  const calculateDelayMinutes = (entryTime, standardEntry = '08:30') => {
    const entryMin = parseTimeToMinutes(entryTime);
    const stdMin = parseTimeToMinutes(standardEntry);
    if (entryMin === null || stdMin === null) return 0;
    if (entryMin > stdMin) {
      return Math.round(entryMin - stdMin);
    }
    return 0;
  };

  const calculateOvertimeMinutes = (workedMinutes, standardDailyMinutes = 480) => {
    if (!workedMinutes || workedMinutes <= standardDailyMinutes) return 0;
    return Math.round(workedMinutes - standardDailyMinutes);
  };

  const getWorkingDaysInRange = (fromStr, toStr) => {
    if (!fromStr || !toStr) return [];
    try {
      const dates = [];
      const [y1, m1, d1] = fromStr.split('-').map(Number);
      const [y2, m2, d2] = toStr.split('-').map(Number);
      const start = new Date(y1, m1 - 1, d1);
      const end = new Date(y2, m2 - 1, d2);

      const curr = new Date(start);
      while (curr <= end) {
        const dayOfWeek = curr.getDay(); // 0 = Domingo, 6 = Sábado
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Lunes a Viernes
          const yyyy = curr.getFullYear();
          const mm = String(curr.getMonth() + 1).padStart(2, '0');
          const dd = String(curr.getDate()).padStart(2, '0');
          dates.push(`${yyyy}-${mm}-${dd}`);
        }
        curr.setDate(curr.getDate() + 1);
      }
      return dates;
    } catch (e) {
      return [];
    }
  };

  const setDatePreset = (preset) => {
    const today = new Date();
    const todayStr = getChileTodayString(today);

    if (preset === 'today') {
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (preset === 'yesterday') {
      const yest = new Date(today);
      yest.setDate(yest.getDate() - 1);
      const yestStr = getChileTodayString(yest);
      setDateFrom(yestStr);
      setDateTo(yestStr);
    } else if (preset === 'week') {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      setDateFrom(getChileTodayString(d));
      setDateTo(todayStr);
    } else if (preset === 'month') {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      setDateFrom(getChileTodayString(d));
      setDateTo(todayStr);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await apiGetUsers();
      if (Array.isArray(data) && data.length > 0) {
        setUsersList(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRecords = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (selectedUserId) params.user_id = selectedUserId;
      const data = await apiGetAttendanceRecords(params);
      if (Array.isArray(data)) {
        setRecords(data);
        if (data.length > 0) {
          mergeAttendanceToVault(data);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchRecords();

    const socket = getSocket();
    const handleAttendanceLive = (data) => {
      if (!data?.silent) setLastLiveAlert(data);
      fetchRecords(true);
      setTimeout(() => setLastLiveAlert(null), 5000);
    };

    const handleUsersChange = () => {
      fetchUsers();
      fetchRecords(true);
    };

    socket.on('connect', handleUsersChange);
    socket.on('attendance_marked', handleAttendanceLive);
    socket.on('attendance_updated', handleAttendanceLive);
    socket.on('scan_registered', handleAttendanceLive);

    return () => {
      socket.off('connect', handleUsersChange);
      socket.off('attendance_marked', handleAttendanceLive);
      socket.off('attendance_updated', handleAttendanceLive);
      socket.off('scan_registered', handleAttendanceLive);
    };
  }, [dateFrom, dateTo, selectedUserId]);

  // Cálculos Consolidados por Trabajador
  const workingDaysInRange = getWorkingDaysInRange(dateFrom, dateTo);

  const workersSummary = (selectedUserId 
    ? usersList.filter(u => String(u.id) === String(selectedUserId))
    : usersList
  ).map(worker => {
    const userRecords = records.filter(r => String(r.user_id) === String(worker.id));
    const attendedDates = new Set(userRecords.map(r => r.date));
    
    let totalMins = 0;
    let delayMins = 0;
    let delayCount = 0;
    let overtimeMins = 0;

    userRecords.forEach(r => {
      const recordMins = calculateRecordMinutes(r);
      totalMins += recordMins;
      const delay = calculateDelayMinutes(r.entry_time);
      if (delay > 0) {
        delayMins += delay;
        delayCount++;
      }
      overtimeMins += calculateOvertimeMinutes(recordMins);
    });

    const daysWorked = attendedDates.size;
    const missingDays = workingDaysInRange.filter(d => !attendedDates.has(d)).length;

    return {
      worker,
      userRecords,
      daysWorked,
      missingDays: Math.max(0, missingDays),
      totalMinutesWorked: totalMins,
      totalDelayMinutes: delayMins,
      delayCount,
      totalOvertimeMinutes: overtimeMins
    };
  });

  // Totales Globales
  const globalTotalWorkedMins = workersSummary.reduce((acc, curr) => acc + curr.totalMinutesWorked, 0);
  const globalTotalDelaysMins = workersSummary.reduce((acc, curr) => acc + curr.totalDelayMinutes, 0);
  const globalTotalOvertimeMins = workersSummary.reduce((acc, curr) => acc + curr.totalOvertimeMinutes, 0);
  const globalTotalRecords = records.length;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadExcel = () => {
    const url = getExportExcelUrl({
      date_from: dateFrom,
      date_to: dateTo,
      user_id: selectedUserId || ''
    });
    window.open(url, '_blank');
  };

  // Guardar Edición
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingRecord) return;
    setEditLoading(true);
    setEditError('');
    setEditSuccess('');

    try {
      const payload = {
        ...editForm,
        admin_password: adminPassword
      };
      await apiAdminEditAttendance(editingRecord.id, payload);
      setEditSuccess('Registro actualizado correctamente.');
      fetchRecords(true);
      setTimeout(() => {
        setEditingRecord(null);
        setAdminPassword('');
        setEditSuccess('');
      }, 1500);
    } catch (err) {
      setEditError(err.message || 'Error al actualizar marcación');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteRecord = async (recordId) => {
    const pass = window.prompt('Ingrese su contraseña de SuperAdmin para confirmar la eliminación de esta marcación:');
    if (!pass) return;

    try {
      await apiDeleteAttendanceRecord(recordId, pass);
      fetchRecords(true);
    } catch (err) {
      alert('Error al eliminar marcación: ' + err.message);
    }
  };

  const openEditModal = (rec) => {
    setEditingRecord(rec);
    setEditForm({
      entry_time: rec.entry_time || '',
      lunch_out_time: rec.lunch_out_time || '',
      lunch_in_time: rec.lunch_in_time || '',
      exit_time: rec.exit_time || '',
      admin_note: rec.admin_note || ''
    });
    setAdminPassword('');
    setEditError('');
    setEditSuccess('');
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12 w-full animate-in fade-in duration-300 print:p-0 print:m-0">
      
      {/* Alerta de Escaneo en Vivo */}
      {lastLiveAlert && (
        <div className="bg-orange-500 text-black px-4 py-2.5 rounded-2xl flex items-center justify-between font-bold text-xs shadow-xl animate-bounce print:hidden">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 animate-pulse" />
            <span>
              ¡Nueva Marcación en Vivo! <strong>{lastLiveAlert.user?.name || 'Personal'}</strong> ({lastLiveAlert.label}) a las {lastLiveAlert.time}
            </span>
          </div>
          <button onClick={() => setLastLiveAlert(null)}><CheckCircle2 className="w-4 h-4" /></button>
        </div>
      )}

      {/* Header y Acciones de Descarga / Impresión */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-orange-500" />
            <span>Panel de Asistencia y Reportes</span>
          </h2>
          <p className="text-xs text-zinc-400">
            Control de jornadas, cálculo de horas, atrasos, horas extras y descarga de planillas
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de Sub-pestaña */}
          <div className="flex rounded-xl p-1 bg-zinc-900 border border-zinc-800">
            <button
              type="button"
              onClick={() => setActiveSubTab('summary')}
              className={'px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ' + (
                activeSubTab === 'summary' ? 'bg-orange-500 text-black shadow-md' : 'text-zinc-400 hover:text-white'
              )}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Resumen por Trabajador</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('details')}
              className={'px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ' + (
                activeSubTab === 'details' ? 'bg-orange-500 text-black shadow-md' : 'text-zinc-400 hover:text-white'
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Historial Detallado</span>
            </button>
          </div>

          {/* Botón Imprimir Reporte */}
          <button
            type="button"
            onClick={handlePrint}
            className="bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-white text-xs font-bold px-3.5 py-2 rounded-xl border border-zinc-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Printer className="w-4 h-4 text-orange-400" />
            <span>Imprimir Reporte</span>
          </button>

          {/* Botón Descargar Excel */}
          <button
            type="button"
            onClick={handleDownloadExcel}
            className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-black px-3.5 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Descargar Excel</span>
          </button>
        </div>
      </div>

      {/* ENCABEZADO DE IMPRESIÓN (Visible únicamente al imprimir) */}
      <div className="hidden print:block mb-6 text-black border-b pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight">INVERSIONES BOTAM SpA</h1>
            <h2 className="text-sm font-bold text-gray-700">INFORME OFICIAL DE ASISTENCIA Y JORNADAS LABORALES</h2>
            <p className="text-xs text-gray-500">Período: {dateFrom} al {dateTo} | Generado el {new Date().toLocaleDateString('es-CL')}</p>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold">REGISTRO ASISTENTRUCK</div>
            <div className="text-[10px] text-gray-500">Sistema Certificado de Control de Asistencia</div>
          </div>
        </div>
      </div>

      {/* Tarjetas de Estadísticas Globales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4">
        <div className={'p-3.5 rounded-2xl border shadow-sm ' + (isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-orange-100')}>
          <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Horas Trabajadas</div>
          <div className="text-lg sm:text-xl font-black text-orange-500 mt-0.5">
            {formatMinutesToHHMM(globalTotalWorkedMins)}
          </div>
          <div className="text-[10px] text-zinc-500">{globalTotalRecords} marcaciones totales</div>
        </div>

        <div className={'p-3.5 rounded-2xl border shadow-sm ' + (isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-orange-100')}>
          <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Total Atrasos</div>
          <div className="text-lg sm:text-xl font-black text-amber-400 mt-0.5">
            {formatMinutesToHHMM(globalTotalDelaysMins)}
          </div>
          <div className="text-[10px] text-zinc-500">Minutos acumulados</div>
        </div>

        <div className={'p-3.5 rounded-2xl border shadow-sm ' + (isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-orange-100')}>
          <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Horas Extras</div>
          <div className="text-lg sm:text-xl font-black text-emerald-400 mt-0.5">
            {formatMinutesToHHMM(globalTotalOvertimeMins)}
          </div>
          <div className="text-[10px] text-zinc-500">Sobre jornada ordinaria</div>
        </div>

        <div className={'p-3.5 rounded-2xl border shadow-sm ' + (isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-orange-100')}>
          <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Días Laborales</div>
          <div className="text-lg sm:text-xl font-black text-blue-400 mt-0.5">
            {workingDaysInRange.length} Días
          </div>
          <div className="text-[10px] text-zinc-500">En período seleccionado</div>
        </div>
      </div>

      {/* Barra de Filtros y Fechas Rápidas */}
      <div className={'p-4 rounded-3xl border shadow-md space-y-3 print:hidden ' + (isDark ? 'bg-zinc-950/80 border-zinc-800' : 'bg-white border-orange-200')}>
        <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-zinc-800/60">
          <span className="text-xs font-bold text-zinc-400 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-orange-500" />
            <span>Accesos rápidos:</span>
          </span>
          <button
            type="button"
            onClick={() => setDatePreset('today')}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-zinc-900 hover:bg-orange-500 hover:text-black border border-zinc-800 transition-colors cursor-pointer"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setDatePreset('yesterday')}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-zinc-900 hover:bg-orange-500 hover:text-black border border-zinc-800 transition-colors cursor-pointer"
          >
            Ayer
          </button>
          <button
            type="button"
            onClick={() => setDatePreset('week')}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-zinc-900 hover:bg-orange-500 hover:text-black border border-zinc-800 transition-colors cursor-pointer"
          >
            Últimos 7 Días
          </button>
          <button
            type="button"
            onClick={() => setDatePreset('month')}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-zinc-900 hover:bg-orange-500 hover:text-black border border-zinc-800 transition-colors cursor-pointer"
          >
            Este Mes
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Desde Fecha:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Hasta Fecha:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Filtrar por Trabajador:</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
            >
              <option value="">Todos los Trabajadores</option>
              {usersList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role === 'admin' ? 'Admin' : 'Trabajador'})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* VISTA 1: RESUMEN CONSOLIDADO POR TRABAJADOR */}
      {activeSubTab === 'summary' && (
        <div className={'border rounded-3xl overflow-hidden shadow-xl ' + (isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-orange-200')}>
          <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
            <h3 className="text-sm font-black flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-orange-500" />
              <span>Resumen Consolidado por Trabajador</span>
            </h3>
            <span className="text-xs text-zinc-400 font-bold">{workersSummary.length} Trabajadores evaluados</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className={'border-b ' + (isDark ? 'bg-zinc-900/90 border-zinc-800 text-zinc-400 font-black' : 'bg-orange-50/80 border-orange-200 text-zinc-800 font-black')}>
                  <th className="py-3 px-4">Trabajador</th>
                  <th className="py-3 px-3">RUT</th>
                  <th className="py-3 px-3 text-center">Días Asistidos</th>
                  <th className="py-3 px-3 text-center">Días No Marcados</th>
                  <th className="py-3 px-3 text-center">Atrasos</th>
                  <th className="py-3 px-3 text-center">Horas Extras</th>
                  <th className="py-3 px-4 text-right">Total Horas Trabajadas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50 font-medium">
                {workersSummary.map(({ worker, daysWorked, missingDays, totalMinutesWorked, totalDelayMinutes, delayCount, totalOvertimeMinutes }) => (
                  <tr key={worker.id || worker.username} className={isDark ? 'hover:bg-zinc-900/50' : 'hover:bg-orange-50/50'}>
                    <td className="py-3 px-4">
                      <div className="font-black text-sm">{worker.name}</div>
                      <div className="text-[10px] text-zinc-500">{worker.email || worker.username}</div>
                    </td>
                    <td className="py-3 px-3 text-zinc-400 font-mono text-[11px]">
                      {worker.rut || 'Sin RUT'}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="bg-emerald-500/20 text-emerald-400 font-black px-2.5 py-1 rounded-full text-xs border border-emerald-500/30">
                        {daysWorked} días
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {missingDays > 0 ? (
                        <span className="bg-red-500/20 text-red-400 font-black px-2.5 py-1 rounded-full text-xs border border-red-500/30">
                          {missingDays} días faltantes
                        </span>
                      ) : (
                        <span className="text-zinc-500 text-xs font-bold">0 faltas</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {totalDelayMinutes > 0 ? (
                        <span className="text-amber-400 font-bold text-xs">
                          {delayCount} ({formatMinutesToHHMM(totalDelayMinutes)})
                        </span>
                      ) : (
                        <span className="text-zinc-500 text-xs">0 min</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {totalOvertimeMinutes > 0 ? (
                        <span className="text-emerald-400 font-bold text-xs">
                          +{formatMinutesToHHMM(totalOvertimeMinutes)}
                        </span>
                      ) : (
                        <span className="text-zinc-500 text-xs">0 min</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-sm text-orange-400 font-mono">
                      {formatMinutesToHHMM(totalMinutesWorked)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VISTA 2: HISTORIAL DETALLADO DÍA POR DÍA */}
      {activeSubTab === 'details' && (
        <div className={'border rounded-3xl overflow-hidden shadow-xl ' + (isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-orange-200')}>
          <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
            <h3 className="text-sm font-black flex items-center gap-2">
              <Layers className="w-4 h-4 text-orange-500" />
              <span>Registros Individuales de Asistencia ({records.length})</span>
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className={'border-b ' + (isDark ? 'bg-zinc-900/90 border-zinc-800 text-zinc-400 font-black' : 'bg-orange-50/80 border-orange-200 text-zinc-800 font-black')}>
                  <th className="py-3 px-3">Fecha</th>
                  <th className="py-3 px-4">Trabajador</th>
                  <th className="py-3 px-2 text-center">1. Entrada</th>
                  <th className="py-3 px-2 text-center">2. Sal. Colación</th>
                  <th className="py-3 px-2 text-center">3. Ent. Colación</th>
                  <th className="py-3 px-2 text-center">4. Salida</th>
                  <th className="py-3 px-3 text-center">Total Horas</th>
                  <th className="py-3 px-3 text-center">Atraso</th>
                  <th className="py-3 px-3 text-right print:hidden">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50 font-medium">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-zinc-500 font-bold">
                      No se encontraron registros de marcaciones para el período seleccionado.
                    </td>
                  </tr>
                ) : (
                  records.map((r) => {
                    const delay = calculateDelayMinutes(r.entry_time);
                    const recordMins = calculateRecordMinutes(r);

                    return (
                      <tr key={r.id} className={isDark ? 'hover:bg-zinc-900/50' : 'hover:bg-orange-50/50'}>
                        <td className="py-3 px-3 font-mono text-[11px] font-bold text-orange-400 whitespace-nowrap">
                          {r.date}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-black text-sm">{r.user_name || r.name || 'Personal'}</div>
                          <div className="text-[10px] text-zinc-500 font-mono">{r.user_rut || r.rut || ''}</div>
                        </td>
                        <td className="py-3 px-2 text-center font-mono font-bold">
                          {r.entry_time ? <span className="text-emerald-400">{r.entry_time}</span> : <span className="text-zinc-600">--:--</span>}
                        </td>
                        <td className="py-3 px-2 text-center font-mono font-bold">
                          {r.lunch_out_time ? <span className="text-amber-400">{r.lunch_out_time}</span> : <span className="text-zinc-600">--:--</span>}
                        </td>
                        <td className="py-3 px-2 text-center font-mono font-bold">
                          {r.lunch_in_time ? <span className="text-amber-400">{r.lunch_in_time}</span> : <span className="text-zinc-600">--:--</span>}
                        </td>
                        <td className="py-3 px-2 text-center font-mono font-bold">
                          {r.exit_time ? <span className="text-blue-400">{r.exit_time}</span> : <span className="text-zinc-600">--:--</span>}
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-black text-orange-400">
                          {formatMinutesToHHMM(recordMins)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {delay > 0 ? (
                            <span className="text-amber-400 font-bold text-[11px]">+{delay}m</span>
                          ) : (
                            <span className="text-emerald-500 text-[11px]">Puntual</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right print:hidden">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(r)}
                              title="Modificar Horarios (Admin)"
                              className="p-1 rounded-lg text-zinc-400 hover:text-orange-500 hover:bg-orange-500/10 cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={() => handleDeleteRecord(r.id)}
                                title="Eliminar Marcación (SuperAdmin)"
                                className="p-1 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECCIÓN DE FIRMAS PARA REPORTE IMPRESO (Visible solo en Print) */}
      <div className="hidden print:grid grid-cols-2 gap-12 mt-16 pt-8 border-t text-black">
        <div className="text-center">
          <div className="border-t border-black w-48 mx-auto mb-1"></div>
          <div className="font-bold text-xs">Firma del Trabajador</div>
          <div className="text-[10px] text-gray-500">Conformidad de Horas y Marcaciones</div>
        </div>
        <div className="text-center">
          <div className="border-t border-black w-48 mx-auto mb-1"></div>
          <div className="font-bold text-xs">Firma Supervisor / Empleador</div>
          <div className="text-[10px] text-gray-500">Inversiones BOTAM SpA</div>
        </div>
      </div>

      {/* MODAL MODIFICAR HORARIOS (ADMIN) */}
      {editingRecord && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[999999] flex items-center justify-center p-4">
          <div className={'border rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 ' + (isDark ? 'bg-zinc-950 border-orange-500/40 text-white' : 'bg-white border-orange-200 text-zinc-900')}>
            <div className="flex items-center justify-between pb-3 border-b border-orange-500/20">
              <div>
                <h3 className="text-base font-black">Modificar Horarios</h3>
                <p className="text-xs text-orange-400">{editingRecord.user_name || 'Trabajador'} - {editingRecord.date}</p>
              </div>
              <button onClick={() => setEditingRecord(null)} className="text-zinc-400 hover:text-white cursor-pointer"><AlertCircle className="w-5 h-5" /></button>
            </div>

            {editError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-2.5 rounded-xl text-xs">
                {editError}
              </div>
            )}

            {editSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-2.5 rounded-xl text-xs">
                {editSuccess}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">1. Entrada:</label>
                  <input
                    type="time"
                    step="1"
                    value={editForm.entry_time}
                    onChange={(e) => setEditForm({ ...editForm, entry_time: e.target.value })}
                    className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">2. Salida Colación:</label>
                  <input
                    type="time"
                    step="1"
                    value={editForm.lunch_out_time}
                    onChange={(e) => setEditForm({ ...editForm, lunch_out_time: e.target.value })}
                    className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">3. Entrada Colación:</label>
                  <input
                    type="time"
                    step="1"
                    value={editForm.lunch_in_time}
                    onChange={(e) => setEditForm({ ...editForm, lunch_in_time: e.target.value })}
                    className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">4. Salida Jornada:</label>
                  <input
                    type="time"
                    step="1"
                    value={editForm.exit_time}
                    onChange={(e) => setEditForm({ ...editForm, exit_time: e.target.value })}
                    className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Motivo / Nota de Auditoría:</label>
                <input
                  type="text"
                  value={editForm.admin_note}
                  onChange={(e) => setEditForm({ ...editForm, admin_note: e.target.value })}
                  placeholder="Ej: Corrección autorizada por jefatura"
                  className={'w-full rounded-xl px-3.5 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Contraseña de Administrador:</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Ingrese su clave de acceso para autorizar"
                  className={'w-full rounded-xl px-3.5 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-2.5 rounded-xl text-xs font-black bg-orange-500 hover:bg-orange-600 text-black shadow-lg shadow-orange-500/20 cursor-pointer"
                >
                  {editLoading ? 'Guardando...' : 'Autorizar y Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
