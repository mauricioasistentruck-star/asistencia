import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Clock, ShieldAlert, Sparkles, RefreshCw, X } from 'lucide-react';
import { apiGetUserHistory, getFullPhotoUrl, getSocket, getChileTodayString } from '../api';

export default function CredentialView({ user, theme, showHistoryModal, setShowHistoryModal }) {
  const [historyRange, setHistoryRange] = useState('week');
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [screenshotAttempt, setScreenshotAttempt] = useState(false);
  const [localHistoryOpen, setLocalHistoryOpen] = useState(false);
  const [currentDateStr, setCurrentDateStr] = useState(getChileTodayString());

  const isDark = theme === 'dark';
  const isHistoryVisible = showHistoryModal !== undefined ? showHistoryModal : localHistoryOpen;
  const setIsHistoryVisible = (val) => {
    if (setShowHistoryModal) setShowHistoryModal(val);
    setLocalHistoryOpen(val);
  };

  // Timer para verificar cambio de día a las 00:00 hrs y limpiar la credencial automáticamente
  useEffect(() => {
    const timer = setInterval(() => {
      const newToday = getChileTodayString();
      if (newToday !== currentDateStr) {
        setCurrentDateStr(newToday);
        fetchHistory();
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [currentDateStr]);

  const parseTimeToMinutes = (t) => {
    if (!t) return null;
    const parts = t.trim().split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    return parts[0] * 60 + parts[1] + (parts[2] ? parts[2] / 60 : 0);
  };

  const formatExactWorkedHours = (r) => {
    if (!r) return '00H:00M';
    const entryMin = parseTimeToMinutes(r.entry_time);
    const exitMin = parseTimeToMinutes(r.exit_time);
    if (entryMin === null || exitMin === null || exitMin < entryMin) {
      if (r.total_hours) {
        const mins = Math.round(r.total_hours * 60);
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h}H:${m.toString().padStart(2, '0')}M`;
      }
      return '--:--';
    }

    let totalMins = exitMin - entryMin;
    const lunchOutMin = parseTimeToMinutes(r.lunch_out_time);
    const lunchInMin = parseTimeToMinutes(r.lunch_in_time);
    if (lunchOutMin !== null && lunchInMin !== null && lunchInMin > lunchOutMin) {
      totalMins -= (lunchInMin - lunchOutMin);
    }

    totalMins = Math.max(0, Math.round(totalMins));
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h}H:${m.toString().padStart(2, '0')}M`;
  };

  const calculateTotalMinutes = (recordsList) => {
    if (!recordsList || !recordsList.length) return 0;
    let total = 0;
    recordsList.forEach(r => {
      const entryMin = parseTimeToMinutes(r.entry_time);
      const exitMin = parseTimeToMinutes(r.exit_time);
      if (entryMin !== null && exitMin !== null && exitMin >= entryMin) {
        let dayMins = exitMin - entryMin;
        const lunchOutMin = parseTimeToMinutes(r.lunch_out_time);
        const lunchInMin = parseTimeToMinutes(r.lunch_in_time);
        if (lunchOutMin !== null && lunchInMin !== null && lunchInMin > lunchOutMin) {
          dayMins -= (lunchInMin - lunchOutMin);
        }
        total += Math.max(0, Math.round(dayMins));
      } else if (r.total_hours) {
        total += Math.round(r.total_hours * 60);
      }
    });
    return total;
  };

  // Agrupación mensual en 4 semanas
  const calculateMonthlyWeeksSummary = (recordsList) => {
    const weeks = [
      { name: 'Semana 1 (Días 1 al 7)', days: 0, totalMinutes: 0 },
      { name: 'Semana 2 (Días 8 al 14)', days: 0, totalMinutes: 0 },
      { name: 'Semana 3 (Días 15 al 21)', days: 0, totalMinutes: 0 },
      { name: 'Semana 4 (Días 22 al fin de mes)', days: 0, totalMinutes: 0 }
    ];

    recordsList.forEach(r => {
      if (!r.date) return;
      const dayNum = parseInt(r.date.split('-')[2] || '1', 10);
      let weekIdx = 0;
      if (dayNum <= 7) weekIdx = 0;
      else if (dayNum <= 14) weekIdx = 1;
      else if (dayNum <= 21) weekIdx = 2;
      else weekIdx = 3;

      let dayMins = 0;
      const entryMin = parseTimeToMinutes(r.entry_time);
      const exitMin = parseTimeToMinutes(r.exit_time);
      if (entryMin !== null && exitMin !== null && exitMin >= entryMin) {
        dayMins = exitMin - entryMin;
        const lunchOutMin = parseTimeToMinutes(r.lunch_out_time);
        const lunchInMin = parseTimeToMinutes(r.lunch_in_time);
        if (lunchOutMin !== null && lunchInMin !== null && lunchInMin > lunchOutMin) {
          dayMins -= (lunchInMin - lunchOutMin);
        }
        dayMins = Math.max(0, Math.round(dayMins));
      } else if (r.total_hours) {
        dayMins = Math.round(r.total_hours * 60);
      }

      if (r.entry_time || dayMins > 0) {
        weeks[weekIdx].days += 1;
        weeks[weekIdx].totalMinutes += dayMins;
      }
    });

    return weeks;
  };

  const fetchHistory = async () => {
    if (!user?.id) return;
    setLoadingHistory(true);
    try {
      const data = await apiGetUserHistory(user.id, historyRange);
      setHistoryData(data);
    } catch (err) {
      console.error('Error al cargar historial:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();

    const socket = getSocket();
    const handleAttendanceUpdate = (data) => {
      const targetId = data?.userId || data?.user_id || data?.user?.id;
      const targetRut = data?.rut || data?.user?.rut;
      if (!data || !user?.id || targetId === user.id || targetRut === user.rut || String(targetId) === String(user.id)) {
        fetchHistory();
      }
    };

    socket.on('attendance_updated', handleAttendanceUpdate);
    socket.on('scan_registered', handleAttendanceUpdate);
    socket.on('attendance_marked', handleAttendanceUpdate);

    return () => {
      socket.off('attendance_updated', handleAttendanceUpdate);
      socket.off('scan_registered', handleAttendanceUpdate);
      socket.off('attendance_marked', handleAttendanceUpdate);
    };
  }, [user, historyRange]);

  // Solo mostrar registro de HOY si la fecha coincide exactamente con la fecha actual de Chile.
  // A las 00:00 hrs la credencial se muestra 100% limpia sin marcaciones previas.
  const todayRecord = historyData.find(h => h.date === currentDateStr) || null;

  return (
    <div className="w-full h-full max-w-md mx-auto select-none flex flex-col justify-between overflow-hidden">
      
      {screenshotAttempt && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-orange-600 text-white px-5 py-2.5 rounded-2xl shadow-2xl flex items-center space-x-2.5 border border-orange-400 animate-bounce">
          <ShieldAlert className="w-5 h-5" />
          <span className="font-black text-xs">
            PROTECCIÓN DE SEGURIDAD: Captura de pantalla bloqueada.
          </span>
        </div>
      )}

      {/* TARJETA CREDENCIAL PRINCIPAL AUTO-AJUSTABLE */}
      <div className={'w-full h-full rounded-3xl p-3 sm:p-4.5 relative overflow-hidden text-center security-watermark flex flex-col justify-between shadow-2xl transition-all ' + (isDark ? 'credential-card-dark text-white' : 'credential-card-light text-zinc-900')}>
        
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-orange-500 via-amber-400 to-orange-600"></div>

        {/* Encabezado Credencial */}
        <div className="flex items-center justify-between mt-0.5 flex-shrink-0">
          <div className="flex items-center space-x-2 text-left">
            <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-orange-500 bg-black flex items-center justify-center flex-shrink-0 shadow-md shadow-orange-500/30">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain p-0.5" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-black tracking-wider uppercase leading-tight">REGISTRO ASISTENTRUCK</div>
              <div className="text-[9px] sm:text-[10px] text-orange-500 font-black uppercase tracking-wider">INVERSIONES BOTAM SpA</div>
            </div>
          </div>
          <div className="px-3 py-1 rounded-full bg-orange-500 text-black text-xs font-black shadow tracking-wider uppercase">
            {user?.role === 'superadmin' || user?.role === 'admin' ? 'ADMIN' : 'PERSONAL'}
          </div>
        </div>

        {/* FOTO DEL TRABAJADOR GRANDE (DEL MISMO PORTE DEL CÓDIGO QR) */}
        <div className="relative inline-block mx-auto my-auto flex-shrink-0">
          <div className={'w-[165px] h-[165px] xs:w-[180px] xs:h-[180px] sm:w-[195px] sm:h-[195px] rounded-3xl overflow-hidden border-4 border-orange-500 shadow-2xl mx-auto flex items-center justify-center ' + (isDark ? 'bg-zinc-900' : 'bg-orange-50')}>
            {user?.photo_url ? (
              <img
                src={getFullPhotoUrl(user.photo_url)}
                alt={user.name}
                className="w-full h-full object-cover pointer-events-none"
                onContextMenu={(e) => e.preventDefault()}
              />
            ) : (
              <div className="text-7xl font-black text-orange-500">
                {user?.name?.charAt(0) || 'U'}
              </div>
            )}
          </div>
          <div className="absolute -bottom-1 -right-1 bg-orange-500 text-black rounded-full p-1.5 shadow-lg" title="Credencial Activa">
            <Sparkles className="w-4 h-4" />
          </div>
        </div>

        {/* Datos del Trabajador con Letras Grandes y Claras */}
        <div className="my-auto flex-shrink-0">
          <h2 className={'text-xl xs:text-2xl sm:text-3xl font-black leading-tight tracking-tight ' + (isDark ? 'text-white' : 'text-black')}>
            {user?.name}
          </h2>
          <p className="text-sm xs:text-base sm:text-lg text-orange-500 font-mono font-black mt-0.5">
            RUT: {user?.rut || 'S/N'}
          </p>
          <p className={'text-xs sm:text-sm font-bold ' + (isDark ? 'text-zinc-300' : 'text-zinc-700')}>
            {user?.email}
          </p>
        </div>

        {/* CÓDIGO QR DESTACADO Y GRANDE */}
        <div className="my-auto p-3 bg-white rounded-3xl inline-block shadow-2xl relative group border-3 border-orange-500 mx-auto flex-shrink-0">
          <QRCodeSVG
            value={user?.qr_token || 'QR_TOKEN_FALLBACK'}
            size={165}
            level="H"
            includeMargin={false}
          />
          <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 rounded-3xl transition-opacity flex items-center justify-center pointer-events-none">
            <span className="text-xs font-black text-black bg-orange-400 px-2.5 py-1 rounded shadow">QR Oficial</span>
          </div>
        </div>

        <p className={'text-xs sm:text-sm font-black flex-shrink-0 ' + (isDark ? 'text-zinc-300' : 'text-zinc-900')}>
          Muestra este código frente a la cámara para marcar asistencia
        </p>

        {/* ========================================================================= */}
        {/* LAS 4 MARCACIONES DIARIAS EN FILA (SE LIMPIAN A LAS 00:00 HRS CADA NOCHE) */}
        {/* ========================================================================= */}
        <div className="w-full pt-1.5 border-t border-orange-500/30 flex-shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs sm:text-sm font-black uppercase text-orange-500 tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              Marcaciones de Hoy
            </span>
            {todayRecord && todayRecord.total_hours > 0 && (
              <span className={'text-xs sm:text-sm font-mono font-black px-3 py-0.5 rounded-full border ' + (
                isDark ? 'bg-orange-500/20 border-orange-500/40 text-orange-400' : 'bg-orange-100 border-orange-300 text-orange-950'
              )}>
                {todayRecord.total_hours} hrs
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {/* Entrada */}
            <div className={'border-2 rounded-2xl p-2 text-center transition-all ' + (
              todayRecord?.entry_time 
                ? 'bg-emerald-500/15 border-emerald-500/70 shadow-lg shadow-emerald-500/10' 
                : 'bg-orange-500/10 border-orange-500/40'
            )}>
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-tight block truncate text-orange-500">ENTRADA</span>
              <span className={'text-xs xs:text-sm sm:text-base font-black font-mono mt-0.5 block ' + (
                todayRecord?.entry_time 
                  ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' 
                  : 'text-orange-500/50'
              )}>
                {todayRecord?.entry_time ? todayRecord.entry_time.slice(0, 5) : '--:--'}
              </span>
            </div>

            {/* Salida Colación */}
            <div className={'border-2 rounded-2xl p-2 text-center transition-all ' + (
              todayRecord?.lunch_out_time 
                ? 'bg-emerald-500/15 border-emerald-500/70 shadow-lg shadow-emerald-500/10' 
                : 'bg-orange-500/10 border-orange-500/40'
            )}>
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-tight block truncate text-orange-500">SAL. COL.</span>
              <span className={'text-xs xs:text-sm sm:text-base font-black font-mono mt-0.5 block ' + (
                todayRecord?.lunch_out_time 
                  ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' 
                  : 'text-orange-500/50'
              )}>
                {todayRecord?.lunch_out_time ? todayRecord.lunch_out_time.slice(0, 5) : '--:--'}
              </span>
            </div>

            {/* Entrada Colación */}
            <div className={'border-2 rounded-2xl p-2 text-center transition-all ' + (
              todayRecord?.lunch_in_time 
                ? 'bg-emerald-500/15 border-emerald-500/70 shadow-lg shadow-emerald-500/10' 
                : 'bg-orange-500/10 border-orange-500/40'
            )}>
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-tight block truncate text-orange-500">ENT. COL.</span>
              <span className={'text-xs xs:text-sm sm:text-base font-black font-mono mt-0.5 block ' + (
                todayRecord?.lunch_in_time 
                  ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' 
                  : 'text-orange-500/50'
              )}>
                {todayRecord?.lunch_in_time ? todayRecord.lunch_in_time.slice(0, 5) : '--:--'}
              </span>
            </div>

            {/* Salida */}
            <div className={'border-2 rounded-2xl p-2 text-center transition-all ' + (
              todayRecord?.exit_time 
                ? 'bg-emerald-500/15 border-emerald-500/70 shadow-lg shadow-emerald-500/10' 
                : 'bg-orange-500/10 border-orange-500/40'
            )}>
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-tight block truncate text-orange-500">SALIDA</span>
              <span className={'text-xs xs:text-sm sm:text-base font-black font-mono mt-0.5 block ' + (
                todayRecord?.exit_time 
                  ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' 
                  : 'text-orange-500/50'
              )}>
                {todayRecord?.exit_time ? todayRecord.exit_time.slice(0, 5) : '--:--'}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* MODAL / PANEL DE REVISAR MARCACIONES */}
      {isHistoryVisible && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <div className={'border rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl max-h-[90vh] flex flex-col ' + (isDark ? 'bg-zinc-950 border-zinc-800 text-white' : 'bg-white border-orange-200 text-zinc-900')}>
            
            <div className="flex items-center justify-between pb-3 border-b border-orange-500/20 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-500">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black">Revisar Marcaciones</h3>
                  <p className="text-[11px] text-zinc-400">Historial de asistencia y jornadas</p>
                </div>
              </div>

              <button
                onClick={() => setIsHistoryVisible(false)}
                className="p-1.5 rounded-xl hover:bg-orange-500/10 text-zinc-400 hover:text-orange-500 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Selector de Filtros: Solo Semana y Mes */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-orange-500 uppercase tracking-wider">
                {historyRange === 'week' ? '📅 Desglose Día a Día' : '📊 Resumen por Semanas del Mes'}
              </span>

              <div className={'flex p-1 rounded-xl border ' + (isDark ? 'bg-black border-zinc-800' : 'bg-orange-50 border-orange-200')}>
                <button
                  onClick={() => setHistoryRange('week')}
                  className={'px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ' + (historyRange === 'week' ? 'bg-orange-500 text-black shadow-md shadow-orange-500/20' : 'text-zinc-400 hover:text-orange-500')}
                >
                  Semana
                </button>
                <button
                  onClick={() => setHistoryRange('month')}
                  className={'px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ' + (historyRange === 'month' ? 'bg-orange-500 text-black shadow-md shadow-orange-500/20' : 'text-zinc-400 hover:text-orange-500')}
                >
                  Mes
                </button>
              </div>
            </div>

            {/* Resumen de las 4 Marcaciones de Hoy (permanecen hasta medianoche) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
              <div className={'border rounded-2xl p-2.5 text-center ' + (isDark ? 'bg-black border-zinc-800' : 'bg-orange-50/50 border-orange-100')}>
                <span className="text-[9px] font-black text-orange-500 uppercase tracking-wider block mb-0.5">1. Entrada</span>
                <span className="text-sm font-black font-mono">
                  {todayRecord?.entry_time || '--:--:--'}
                </span>
              </div>

              <div className={'border rounded-2xl p-2.5 text-center ' + (isDark ? 'bg-black border-zinc-800' : 'bg-orange-50/50 border-orange-100')}>
                <span className="text-[9px] font-black text-amber-500 uppercase tracking-wider block mb-0.5">2. Sal. Col.</span>
                <span className="text-sm font-black font-mono">
                  {todayRecord?.lunch_out_time || '--:--:--'}
                </span>
              </div>

              <div className={'border rounded-2xl p-2.5 text-center ' + (isDark ? 'bg-black border-zinc-800' : 'bg-orange-50/50 border-orange-100')}>
                <span className="text-[9px] font-black text-orange-500 uppercase tracking-wider block mb-0.5">3. Ent. Col.</span>
                <span className="text-sm font-black font-mono">
                  {todayRecord?.lunch_in_time || '--:--:--'}
                </span>
              </div>

              <div className={'border rounded-2xl p-2.5 text-center ' + (isDark ? 'bg-black border-zinc-800' : 'bg-orange-50/50 border-orange-100')}>
                <span className="text-[9px] font-black text-emerald-500 uppercase tracking-wider block mb-0.5">4. Salida</span>
                <span className="text-sm font-black font-mono">
                  {todayRecord?.exit_time || '--:--:--'}
                </span>
              </div>
            </div>

            {/* TABLA PRINCIPAL: VISTA SEMANA (DÍA A DÍA) O VISTA MES (RESUMEN 4 SEMANAS) */}
            <div className={'flex-1 overflow-y-auto rounded-2xl border ' + (isDark ? 'border-zinc-800' : 'border-orange-200')}>
              {historyRange === 'week' ? (
                /* VISTA SEMANA: DÍA A DÍA */
                <table className="w-full text-left text-xs">
                  <thead className={'sticky top-0 uppercase font-bold text-[10px] tracking-wider border-b ' + (isDark ? 'bg-black text-zinc-400 border-zinc-800' : 'bg-orange-50 text-zinc-700 border-orange-200')}>
                    <tr>
                      <th className="py-2.5 px-3">Fecha</th>
                      <th className="py-2.5 px-2">Entrada</th>
                      <th className="py-2.5 px-2">Sal. Col.</th>
                      <th className="py-2.5 px-2">Ent. Col.</th>
                      <th className="py-2.5 px-2">Salida</th>
                      <th className="py-2.5 px-2 text-right">Horas</th>
                    </tr>
                  </thead>
                  <tbody className={'divide-y font-mono ' + (isDark ? 'divide-zinc-900 bg-zinc-950' : 'divide-orange-100 bg-white')}>
                    {loadingHistory ? (
                      <tr>
                        <td colSpan="6" className="py-8 text-center text-zinc-500 font-sans">
                          Cargando historial de la semana...
                        </td>
                      </tr>
                    ) : historyData.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="py-8 text-center text-zinc-500 font-sans">
                          No hay registros de marcación en esta semana.
                        </td>
                      </tr>
                    ) : (
                      historyData.map((item) => (
                        <tr key={item.id} className={isDark ? 'hover:bg-zinc-900/50' : 'hover:bg-orange-50/60'}>
                          <td className="py-2 px-3 font-bold font-sans">{item.date}</td>
                          <td className="py-2 px-2 text-orange-400 font-bold">{item.entry_time || '-'}</td>
                          <td className="py-2 px-2 text-amber-400 font-bold">{item.lunch_out_time || '-'}</td>
                          <td className="py-2 px-2 text-orange-400 font-bold">{item.lunch_in_time || '-'}</td>
                          <td className="py-2 px-2 text-emerald-500 font-bold">{item.exit_time || '-'}</td>
                          <td className="py-2 px-2 text-right font-black font-mono text-orange-400">{formatExactWorkedHours(item)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {historyData && historyData.length > 0 && (
                    <tfoot className={'font-black border-t-2 font-mono text-xs ' + (isDark ? 'bg-zinc-900 text-white border-orange-500/40' : 'bg-orange-100 text-zinc-900 border-orange-400')}>
                      <tr>
                        <td colSpan={5} className="py-2.5 px-3 text-left font-black uppercase text-[10px] font-sans">
                          <span className="text-orange-500 mr-1.5">TOTAL SEMANAL ACUMULADO:</span>
                          ({historyData.length} días)
                        </td>
                        <td className="py-2.5 px-2 text-right font-black text-xs text-orange-500 font-mono">
                          {(() => {
                            const totalM = calculateTotalMinutes(historyData);
                            const h = Math.floor(totalM / 60);
                            const m = totalM % 60;
                            return `${h}H:${m.toString().padStart(2, '0')}M`;
                          })()}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              ) : (
                /* VISTA MES: RESUMEN DE LAS 4 SEMANAS DEL MES */
                <table className="w-full text-left text-xs">
                  <thead className={'sticky top-0 uppercase font-bold text-[10px] tracking-wider border-b ' + (isDark ? 'bg-black text-zinc-400 border-zinc-800' : 'bg-orange-50 text-zinc-700 border-orange-200')}>
                    <tr>
                      <th className="py-3 px-4">Semana del Mes</th>
                      <th className="py-3 px-4 text-center">Días Asistidos</th>
                      <th className="py-3 px-4 text-right">Horas Trabajadas</th>
                    </tr>
                  </thead>
                  <tbody className={'divide-y font-mono ' + (isDark ? 'divide-zinc-900 bg-zinc-950' : 'divide-orange-100 bg-white')}>
                    {loadingHistory ? (
                      <tr>
                        <td colSpan="3" className="py-8 text-center text-zinc-500 font-sans">
                          Calculando resumen mensual de las 4 semanas...
                        </td>
                      </tr>
                    ) : (
                      (() => {
                        const monthlyWeeks = calculateMonthlyWeeksSummary(historyData);
                        return monthlyWeeks.map((wk, idx) => {
                          const h = Math.floor(wk.totalMinutes / 60);
                          const m = wk.totalMinutes % 60;
                          return (
                            <tr key={idx} className={isDark ? 'hover:bg-zinc-900/50' : 'hover:bg-orange-50/60'}>
                              <td className="py-3 px-4 font-bold font-sans">
                                <div className="text-orange-500 font-black">{wk.name}</div>
                              </td>
                              <td className="py-3 px-4 text-center font-bold font-sans">
                                <span className={'px-3 py-1 rounded-full text-xs font-black ' + (wk.days > 0 ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30' : 'text-zinc-500')}>
                                  {wk.days} {wk.days === 1 ? 'día' : 'días'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right font-black text-sm text-emerald-400 font-mono">
                                {h}H:{m.toString().padStart(2, '0')}M
                              </td>
                            </tr>
                          );
                        });
                      })()
                    )}
                  </tbody>
                  {historyData && historyData.length > 0 && (
                    <tfoot className={'font-black border-t-2 font-mono text-xs ' + (isDark ? 'bg-zinc-900 text-white border-orange-500/40' : 'bg-orange-100 text-zinc-900 border-orange-400')}>
                      <tr>
                        <td className="py-3 px-4 text-left font-black uppercase text-xs font-sans">
                          <span className="text-orange-500 mr-1.5">RESUMEN TOTAL MENSUAL:</span>
                        </td>
                        <td className="py-3 px-4 text-center font-black text-xs text-orange-500 font-sans">
                          {historyData.length} días totales
                        </td>
                        <td className="py-3 px-4 text-right font-black text-sm text-orange-500 font-mono">
                          {(() => {
                            const totalM = calculateTotalMinutes(historyData);
                            const h = Math.floor(totalM / 60);
                            const m = totalM % 60;
                            return `${h}H:${m.toString().padStart(2, '0')}M`;
                          })()}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>

            <div className="mt-4 flex items-center justify-end text-xs text-zinc-400 pt-2">
              <button
                onClick={() => setIsHistoryVisible(false)}
                className="px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-black font-extrabold text-xs shadow-md shadow-orange-500/20 cursor-pointer"
              >
                Cerrar
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
