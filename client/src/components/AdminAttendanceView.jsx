import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Download, Filter, Edit3, Lock, ShieldAlert, CheckCircle2, Clock, Radio, Calendar } from 'lucide-react';
import { apiGetAttendanceRecords, apiGetUsers, apiAdminEditAttendance, getExportExcelUrl, getSocket, getChileTodayString } from '../api';

export default function AdminAttendanceView({ user, theme }) {
  const [records, setRecords] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(getChileTodayString());
  const [dateTo, setDateTo] = useState(getChileTodayString());
  const [selectedUserId, setSelectedUserId] = useState('');
  
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
      setUsersList(data);
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
      setRecords(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchRecords();

    // Sincronización en tiempo real vía WebSockets
    const socket = getSocket();
    const handleAttendanceLive = (data) => {
      setLastLiveAlert(data);
      fetchRecords(true);
      setTimeout(() => setLastLiveAlert(null), 5000);
    };

    socket.on('attendance_marked', handleAttendanceLive);
    socket.on('attendance_updated', handleAttendanceLive);
    socket.on('scan_registered', handleAttendanceLive);
    socket.on('user_created', () => fetchUsers());
    socket.on('user_updated', () => { fetchUsers(); fetchRecords(true); });

    return () => {
      socket.off('attendance_marked', handleAttendanceLive);
      socket.off('attendance_updated', handleAttendanceLive);
      socket.off('scan_registered', handleAttendanceLive);
      socket.off('user_created');
      socket.off('user_updated');
    };
  }, [dateFrom, dateTo, selectedUserId]);

  const openEditModal = (rec) => {
    setEditingRecord(rec);
    setAdminPassword('');
    setEditError('');
    setEditSuccess('');
    setEditForm({
      entry_time: rec.entry_time || '',
      lunch_out_time: rec.lunch_out_time || '',
      lunch_in_time: rec.lunch_in_time || '',
      exit_time: rec.exit_time || '',
      admin_note: rec.admin_note || ''
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!adminPassword) {
      setEditError('Debe ingresar su contraseña de administrador para autorizar el cambio');
      return;
    }
    setEditLoading(true);
    setEditError('');
    setEditSuccess('');

    try {
      await apiAdminEditAttendance(editingRecord.id, {
        admin_password: adminPassword,
        ...editForm
      });
      setEditSuccess('Horario modificado y registrado en auditoría correctamente.');
      setTimeout(() => {
        setEditingRecord(null);
        fetchRecords(true);
      }, 1500);
    } catch (err) {
      setEditError(err.message || 'Contraseña incorrecta o error al modificar horario');
    } finally {
      setEditLoading(false);
    }
  };

  const downloadExcel = () => {
    const params = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (selectedUserId) params.user_id = selectedUserId;
    const url = getExportExcelUrl(params);
    window.open(url, '_blank');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {lastLiveAlert && (
        <div className="bg-orange-500 text-black px-4 py-3 rounded-2xl shadow-xl flex items-center justify-between border-2 border-black animate-pulse">
          <div className="flex items-center gap-2 text-xs font-black">
            <Radio className="w-4 h-4" />
            <span>NUEVA MARCACIÓN EN VIVO: {lastLiveAlert.user?.name} marcó {lastLiveAlert.label} a las {lastLiveAlert.time}</span>
          </div>
          <span className="text-[10px] font-extrabold bg-black text-orange-400 px-2 py-0.5 rounded">TIEMPO REAL</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-7 h-7 text-orange-500" />
            Control de Asistencia & Reportes Excel
          </h2>
          <p className="text-xs text-orange-500 font-semibold flex items-center gap-1.5 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            Sincronización en Vivo activa (Todos los dispositivos conectados)
          </p>
        </div>

        <button
          onClick={downloadExcel}
          className="bg-orange-500 hover:bg-orange-600 text-black text-xs font-black px-5 py-3 rounded-2xl shadow-xl shadow-orange-500/25 transition-all flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" />
          Descargar Planilla Excel (.xlsx)
        </button>
      </div>

      <div className={'border rounded-3xl p-5 shadow-xl transition-colors space-y-3 ' + (isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-orange-200')}>
        {/* Atajos Rápidos de Calendario */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-orange-500/20">
          <span className="text-[11px] font-black text-orange-500 uppercase flex items-center gap-1.5">
            <Calendar className="w-4 h-4 flex-shrink-0" />
            Filtro por Calendario:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {(() => {
              const today = new Date();
              const todayStr = getChileTodayString(today);
              
              const yest = new Date(today);
              yest.setDate(yest.getDate() - 1);
              const yestStr = getChileTodayString(yest);

              const dWeek = new Date(today);
              dWeek.setDate(dWeek.getDate() - 6);
              const weekFromStr = getChileTodayString(dWeek);

              const monthFromStr = getChileTodayString(new Date(today.getFullYear(), today.getMonth(), 1));

              const isToday = dateFrom === todayStr && dateTo === todayStr;
              const isYesterday = dateFrom === yestStr && dateTo === yestStr;
              const isWeek = dateFrom === weekFromStr && dateTo === todayStr;
              const isMonth = dateFrom === monthFromStr && dateTo === todayStr;

              const btnClass = (active) =>
                'px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ' +
                (active
                  ? 'bg-orange-500 text-black shadow-md shadow-orange-500/25 scale-[1.02]'
                  : (isDark
                      ? 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800 hover:border-orange-500/30'
                      : 'bg-orange-50 text-zinc-700 hover:text-black border border-orange-200 hover:border-orange-500/40'));

              return (
                <>
                  <button
                    type="button"
                    onClick={() => setDatePreset('today')}
                    className={btnClass(isToday)}
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    onClick={() => setDatePreset('yesterday')}
                    className={btnClass(isYesterday)}
                  >
                    Ayer
                  </button>
                  <button
                    type="button"
                    onClick={() => setDatePreset('week')}
                    className={btnClass(isWeek)}
                  >
                    Últimos 7 días
                  </button>
                  <button
                    type="button"
                    onClick={() => setDatePreset('month')}
                    className={btnClass(isMonth)}
                  >
                    Este Mes
                  </button>
                </>
              );
            })()}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-orange-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
              Desde Fecha:
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={'w-full rounded-xl px-3 py-2 text-xs font-bold border focus:outline-none focus:border-orange-500 ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-orange-500 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
              Hasta Fecha:
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={'w-full rounded-xl px-3 py-2 text-xs font-bold border focus:outline-none focus:border-orange-500 ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-orange-500">
              Trabajador:
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className={'w-full rounded-xl px-3 py-2 text-xs border font-bold focus:outline-none focus:border-orange-500 ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
            >
              <option value="">Todos los trabajadores</option>
              {usersList.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => fetchRecords(false)}
              className="w-full bg-orange-500 hover:bg-orange-600 text-black font-black text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 cursor-pointer active:scale-98"
            >
              <Filter className="w-4 h-4 flex-shrink-0" />
              Filtrar Registros
            </button>
          </div>
        </div>
      </div>

      <div className={'border rounded-3xl shadow-xl overflow-hidden ' + (isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-orange-200')}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={'uppercase font-bold text-[10px] tracking-wider border-b ' + (isDark ? 'bg-black text-zinc-400 border-zinc-800' : 'bg-orange-50 text-zinc-700 border-orange-200')}>
              <tr>
                <th className="py-4 px-4">Fecha</th>
                <th className="py-4 px-4">Trabajador</th>
                <th className="py-4 px-3">1. Entrada</th>
                <th className="py-4 px-3">2. Sal. Colación</th>
                <th className="py-4 px-3">3. Ent. Colación</th>
                <th className="py-4 px-3">4. Salida</th>
                <th className="py-4 px-3">Total Horas</th>
                <th className="py-4 px-3">Estado</th>
                <th className="py-4 px-4 text-right">Acción Admin</th>
              </tr>
            </thead>
            <tbody className={'divide-y font-mono ' + (isDark ? 'divide-zinc-900 bg-zinc-950' : 'divide-orange-100 bg-white')}>
              {loading ? (
                <tr>
                  <td colSpan="9" className="py-12 text-center text-zinc-500 font-sans">
                    Cargando registros del servidor...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-12 text-center text-zinc-500 font-sans">
                    No se encontraron registros para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className={isDark ? 'hover:bg-zinc-900/50' : 'hover:bg-orange-50/60'}>
                    <td className="py-3 px-4 font-bold font-sans">
                      {r.date}
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <div className="font-bold">{r.user_name}</div>
                      <div className="text-[10px] text-orange-500 font-mono font-bold">{r.user_rut || 'S/N'}</div>
                    </td>
                    <td className="py-3 px-3 text-orange-400 font-bold">{r.entry_time || '--:--:--'}</td>
                    <td className="py-3 px-3 text-amber-400 font-bold">{r.lunch_out_time || '--:--:--'}</td>
                    <td className="py-3 px-3 text-orange-400 font-bold">{r.lunch_in_time || '--:--:--'}</td>
                    <td className="py-3 px-3 text-emerald-500 font-bold">{r.exit_time || '--:--:--'}</td>
                    <td className="py-3 px-3 font-black">{r.total_hours || 0} hrs</td>
                    <td className="py-3 px-3 font-sans">
                      {r.modified_by_admin === 1 ? (
                        <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-bold border border-amber-500/30">
                          Editado Admin
                        </span>
                      ) : (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded font-medium border border-emerald-500/20">
                          Original
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-sans">
                      <button
                        onClick={() => openEditModal(r)}
                        className={'p-1.5 rounded-lg transition-colors inline-flex items-center gap-1 text-[11px] font-bold ' + (isDark ? 'bg-zinc-900 text-orange-400 hover:bg-zinc-800' : 'bg-orange-50 text-orange-600 hover:bg-orange-100')}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingRecord && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={'border rounded-3xl max-w-lg w-full p-6 shadow-2xl ' + (isDark ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-orange-200 text-zinc-900')}>
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-orange-500 flex items-center justify-center text-black font-bold">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Edición Protegida de Horario</h3>
                <p className="text-xs text-orange-500 font-semibold">Trabajador: <strong>{editingRecord.user_name}</strong> ({editingRecord.date})</p>
              </div>
            </div>

            {editError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-xs flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            {editSuccess && (
              <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{editSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3 font-mono">
                <div>
                  <label className="block text-[10px] font-sans font-bold uppercase mb-1 text-orange-500">Entrada (HH:mm:ss):</label>
                  <input
                    type="text"
                    value={editForm.entry_time}
                    onChange={(e) => setEditForm({ ...editForm, entry_time: e.target.value })}
                    placeholder="08:30:00"
                    className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-sans font-bold uppercase mb-1 text-orange-500">Sal. Colación:</label>
                  <input
                    type="text"
                    value={editForm.lunch_out_time}
                    onChange={(e) => setEditForm({ ...editForm, lunch_out_time: e.target.value })}
                    placeholder="13:00:00"
                    className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-sans font-bold uppercase mb-1 text-orange-500">Ent. Colación:</label>
                  <input
                    type="text"
                    value={editForm.lunch_in_time}
                    onChange={(e) => setEditForm({ ...editForm, lunch_in_time: e.target.value })}
                    placeholder="14:00:00"
                    className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-sans font-bold uppercase mb-1 text-orange-500">Salida Jornada:</label>
                  <input
                    type="text"
                    value={editForm.exit_time}
                    onChange={(e) => setEditForm({ ...editForm, exit_time: e.target.value })}
                    placeholder="18:30:00"
                    className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase mb-1 text-orange-500">Motivo / Nota de Auditoría:</label>
                <input
                  type="text"
                  value={editForm.admin_note}
                  onChange={(e) => setEditForm({ ...editForm, admin_note: e.target.value })}
                  placeholder="Ej: Olvido de marcación en terreno autorizado por jefatura"
                  className={'w-full rounded-xl px-3 py-2 text-xs border ' + (isDark ? 'bg-black border-zinc-700 text-white' : 'bg-zinc-50 border-orange-200 text-zinc-900')}
                />
              </div>

              <div className="pt-2 border-t border-orange-500/20">
                <label className="block text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">
                  Ingrese su Contraseña de Administrador (Para Autorizar):
                </label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Contraseña del admin"
                  className={'w-full rounded-xl px-3 py-2.5 text-xs border focus:border-orange-500 ' + (isDark ? 'bg-black border-orange-500/50 text-white' : 'bg-zinc-50 border-orange-300 text-zinc-900')}
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-2 rounded-xl text-xs font-black bg-orange-500 hover:bg-orange-600 text-black shadow-lg shadow-orange-500/20"
                >
                  {editLoading ? 'Validando...' : 'Autorizar y Guardar'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
