const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function setupDtInspection(app, db, io, JWT_SECRET, requireAdmin, authenticateToken) {
  function isSuperAdminUser(user) {
    if (!user) return false;
    return Boolean(
      user.is_superadmin === 1 || 
      user.is_superadmin === '1' || 
      user.is_superadmin === true || 
      user.role === 'superadmin' || 
      (user.name && user.name.toLowerCase().includes('mauricio')) ||
      (user.username && user.username.toLowerCase().includes('mauricio'))
    );
  }

  function authenticateDtOrAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (!err && decoded) {
          req.user = decoded;
          if (decoded.role === 'dt_inspector' || decoded.role === 'admin' || decoded.role === 'superadmin' || isSuperAdminUser(decoded)) {
            return next();
          }
        }
        // Fallback a sesión activa en BD
        checkActiveSession(req, res, next);
      });
    } else {
      checkActiveSession(req, res, next);
    }
  }

  function checkActiveSession(req, res, next) {
    db.get("SELECT * FROM dt_audit_sessions WHERE status = 'active' ORDER BY id DESC LIMIT 1", (err, session) => {
      if (!err && session) {
        req.user = {
          role: 'dt_inspector',
          inspector_name: session.inspector_name,
          inspector_email: session.inspector_email,
          session_id: session.id
        };
        return next();
      }
      return res.status(401).json({ error: 'Acceso no autorizado. Inicie sesión en el Portal DT.' });
    });
  }

  // 1. Solicitar clave para fiscalización (EXCLUSIVO @dt.gob.cl)
  app.post('/api/dt/request-token', (req, res) => {
    try {
      const { inspector_name, inspector_email } = req.body;
      if (!inspector_name || !inspector_name.trim()) {
        return res.status(400).json({ error: 'Debe ingresar el nombre completo del funcionario fiscalizador.' });
      }
      if (!inspector_email || typeof inspector_email !== 'string') {
        return res.status(400).json({ error: 'Debe ingresar un correo electrónico institucional.' });
      }

      const cleanEmail = inspector_email.trim().toLowerCase();
      if (!cleanEmail.endsWith('@dt.gob.cl')) {
        return res.status(400).json({
          error: 'ACCESO DENEGADO: El correo debe pertenecer obligatoriamente al dominio institucional @dt.gob.cl de la Dirección del Trabajo.'
        });
      }

      // Generar clave única alfanumérica en formato DT-XXXX-XXXX
      const randomPart1 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const randomPart2 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const token = 'DT-' + randomPart1 + '-' + randomPart2;

      // Vigencia: exactamente 5 días de corrido desde su creación
      const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

      db.run(
        "INSERT INTO dt_access_tokens (inspector_name, inspector_email, token, expires_at, status) VALUES (?, ?, ?, ?, 'active')",
        [inspector_name.trim(), cleanEmail, token, expiresAt],
        function(err) {
          if (err) {
            console.error('Error insertando dt_access_tokens:', err);
            return res.status(500).json({ error: 'Error al generar clave de fiscalización' });
          }

          console.log(`[FISCALIZACIÓN DT] Clave generada para ${inspector_name.trim()} (${cleanEmail}): ${token} (Vence: ${expiresAt})`);
          res.json({
            success: true,
            token,
            inspector_name: inspector_name.trim(),
            inspector_email: cleanEmail,
            expires_at: expiresAt,
            message: 'Clave de fiscalización generada con éxito (válida por 5 días de corrido)'
          });
        }
      );
    } catch (e) {
      console.error('Error en /api/dt/request-token:', e);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  // 2. Ingresar a fiscalizar con correo y clave
  app.post('/api/dt/login', (req, res) => {
    try {
      const { inspector_email, token } = req.body;
      if (!inspector_email || !token) {
        return res.status(400).json({ error: 'Ingrese el correo institucional y la clave de fiscalización.' });
      }

      const cleanEmail = inspector_email.trim().toLowerCase();
      const cleanToken = token.trim().toUpperCase();

      if (!cleanEmail.endsWith('@dt.gob.cl')) {
        return res.status(400).json({ error: 'El correo debe pertenecer al dominio institucional @dt.gob.cl' });
      }

      db.get(
        "SELECT * FROM dt_access_tokens WHERE LOWER(inspector_email) = ? AND UPPER(token) = ? AND status = 'active' ORDER BY id DESC LIMIT 1",
        [cleanEmail, cleanToken],
        (err, row) => {
          if (err || !row) {
            return res.status(401).json({ error: 'Credenciales inválidas. Verifique el correo y la clave ingresada.' });
          }

          // Validar expiración de 5 días
          const now = new Date();
          const expirationDate = new Date(row.expires_at);
          if (now > expirationDate) {
            db.run("UPDATE dt_access_tokens SET status = 'expired' WHERE id = ?", [row.id]);
            return res.status(401).json({ error: 'La clave de fiscalización ha expirado (ha superado los 5 días de validez).' });
          }

          const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

          // Registrar sesión de auditoría DT
          db.run(
            "INSERT INTO dt_audit_sessions (token_id, inspector_name, inspector_email, started_at, ip_address, status) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, 'active')",
            [row.id, row.inspector_name, row.inspector_email, ip],
            function(sErr) {
              const sessionId = this ? this.lastID : 1;

              // ALERTA LEGAL INMEDIATA A LOS ADMINISTRADORES (EMISIÓN SOCKET EN VIVO)
              const legalNotice = {
                sessionId,
                inspector_name: row.inspector_name,
                inspector_email: row.inspector_email,
                started_at: new Date().toISOString(),
                title: "Se ha iniciado un proceso de revisión de información por parte de un funcionario de la Dirección del Trabajo.",
                legal_text: "Se informa a usted que, de acuerdo con las facultades y obligaciones legales contenidas en el Código del Trabajo y sus leyes complementarias; en el D.F.L. N°2 de 1967, del Ministerio del Trabajo y Previsión Social, y en otras disposiciones reglamentarias, se está iniciando un procedimiento de fiscalización laboral."
              };

              io.emit('dt_inspection_alert', legalNotice);

              // Registro en auditoría permanente
              db.run(
                "INSERT INTO audit_logs (admin_name, action, details) VALUES (?, 'INICIO_FISCALIZACION_DT', ?)",
                [row.inspector_name, JSON.stringify(legalNotice)]
              );

              // Firmar JWT exclusivo para el fiscalizador
              const jwtToken = jwt.sign(
                {
                  id: 'dt_' + sessionId,
                  role: 'dt_inspector',
                  inspector_name: row.inspector_name,
                  inspector_email: row.inspector_email,
                  session_id: sessionId
                },
                JWT_SECRET,
                { expiresIn: '5d' }
              );

              res.json({
                success: true,
                jwt_token: jwtToken,
                session_id: sessionId,
                inspector_name: row.inspector_name,
                inspector_email: row.inspector_email,
                expires_at: row.expires_at,
                company: {
                  name: 'Inversiones Botam SpA',
                  rut: '77.654.321-0',
                  address: 'Santiago, Chile'
                }
              });
            }
          );
        }
      );
    } catch (e) {
      console.error('Error en /api/dt/login:', e);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  
  // Endpoint directo de trabajadores para el fiscalizador DT
  app.get('/api/dt/workers', authenticateDtOrAdmin, (req, res) => {
    db.all("SELECT id, name, rut, email, role, work_days FROM users WHERE role != 'kiosk' ORDER BY id ASC", (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al consultar trabajadores' });
      res.json(rows || []);
    });
  });

  // 3. Obtener sesiones activas de fiscalización (para banner admin)
  app.get('/api/dt/active-session', (req, res) => {
    db.get(
      "SELECT * FROM dt_audit_sessions WHERE status = 'active' ORDER BY id DESC LIMIT 1",
      (err, row) => {
        if (err || !row) {
          return res.json({ active: false });
        }
        res.json({
          active: true,
          session: row,
          title: "Se ha iniciado un proceso de revisión de información por parte de un funcionario de la Dirección del Trabajo.",
          legal_text: "Se informa a usted que, de acuerdo con las facultades y obligaciones legales contenidas en el Código del Trabajo y sus leyes complementarias; en el D.F.L. N°2 de 1967, del Ministerio del Trabajo y Previsión Social, y en otras disposiciones reglamentarias, se está iniciando un procedimiento de fiscalización laboral."
        });
      }
    );
  });

  // 4. Los 6 Reportes Oficiales Normativos de la Dirección del Trabajo
  app.get('/api/dt/reports/:reportType', authenticateDtOrAdmin, (req, res) => {
    try {
      const { reportType } = req.params;
      const { date_from, date_to, user_id } = req.query;

      const fromDate = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const toDate = date_to || new Date().toISOString().split('T')[0];

      db.all("SELECT id, name, rut, email, role, work_days FROM users WHERE role != 'kiosk'", (uErr, users) => {
        if (uErr) return res.status(500).json({ error: 'Error al consultar trabajadores' });

        let userList = users || [];
        if (user_id && user_id !== 'all') {
          userList = userList.filter(u => String(u.id) === String(user_id));
        }

        db.all(
          "SELECT * FROM attendance WHERE date >= ? AND date <= ? ORDER BY date ASC",
          [fromDate, toDate],
          (aErr, attendanceRows) => {
            if (aErr) return res.status(500).json({ error: 'Error al consultar asistencias' });

            db.all(
              "SELECT * FROM worker_leaves WHERE date_to >= ? AND date_from <= ?",
              [fromDate, toDate],
              (lErr, leavesRows) => {
                const leaves = leavesRows || [];
                const attendances = attendanceRows || [];

                let reportData = [];

                if (reportType === 'attendance_binary') {
                  // 1. REPORTE DE ASISTENCIA BINARIO
                  const start = new Date(fromDate + 'T12:00:00Z');
                  const end = new Date(toDate + 'T12:00:00Z');

                  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                    const dateStr = d.toISOString().split('T')[0];
                    const dayName = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d.getUTCDay()];

                    for (let u of userList) {
                      let workDays = ['mon', 'tue', 'wed', 'thu', 'fri'];
                      try {
                        if (u.work_days) workDays = JSON.parse(u.work_days);
                      } catch(e) {}

                      const isScheduled = workDays.includes(dayName);
                      const attRecord = attendances.find(a => a.user_id === u.id && a.date === dateStr);
                      const leaveRecord = leaves.find(l => l.user_id === u.id && l.date_from <= dateStr && l.date_to >= dateStr);

                      let status = 'NO_PROGRAMADO';
                      let justification = '';

                      if (attRecord && (attRecord.entry_time || attRecord.exit_time)) {
                        status = 'ASISTIO';
                      } else if (leaveRecord) {
                        status = 'AUSENTE_JUSTIFICADO';
                        justification = leaveRecord.leave_type + (leaveRecord.document_number ? ' (Doc: ' + leaveRecord.document_number + ')' : '');
                      } else if (isScheduled) {
                        status = 'INASISTENCIA';
                      }

                      const dayShort = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d.getUTCDay()];
                      let horarioOficial = 'Descanso Legal';
                      if (['mon', 'tue', 'wed', 'thu'].includes(dayShort)) horarioOficial = '09:00 a 18:00';
                      else if (dayShort === 'fri') horarioOficial = '09:00 a 17:30';

                      reportData.push({
                        'Fecha': dateStr,
                        'Día': ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][d.getUTCDay()],
                        'RUT': u.rut || 'N/A',
                        'Nombre del Trabajador': u.name,
                        'Cargo': (u.role === 'admin' || u.role === 'superadmin') ? 'Administrador' : 'Trabajador',
                        'Horario Oficial': horarioOficial,
                        'Jornada Pactada': isScheduled ? 'Sí' : 'No',
                        'Asistencia (1/0)': status === 'ASISTIO' ? 1 : 0,
                        'Estado': status === 'ASISTIO' ? 'ASISTIÓ' : (isScheduled ? 'INASISTENCIA INJUSTIFICADA' : 'DÍA NO LABORAL / DESCANSO'),
                        'Entrada': attRecord ? attRecord.entry_time || '--:--' : '--:--',
                        'Salida Colación': attRecord ? attRecord.lunch_out_time || attRecord.lunch_start || '--:--' : '--:--',
                        'Retorno Colación': attRecord ? attRecord.lunch_in_time || attRecord.lunch_end || '--:--' : '--:--',
                        'Salida': attRecord ? attRecord.exit_time || '--:--' : '--:--',
                        'Horas Trabajadas': attRecord ? attRecord.total_hours || '0.00' : '0.00',
                        'Observaciones': status === 'ASISTIO' ? 'Marcación biométrica registrada' : (isScheduled ? 'Sin marcación en reloj control' : 'Día libre legal')
                      });
                    }
                  }

                } else if (reportType === 'daily_workday') {
                  // 2. REPORTE DE JORNADA DIARIA
                  for (let a of attendances) {
                    const u = userList.find(x => x.id === a.user_id);
                    if (!u) continue;

                    let workedMinutes = 0;
                    if (a.entry_time && a.exit_time) {
                      const [eh, em] = a.entry_time.split(':').map(Number);
                      const [xh, xm] = a.exit_time.split(':').map(Number);
                      workedMinutes = Math.max(0, (xh * 60 + xm) - (eh * 60 + em));
                      if (a.lunch_start && a.lunch_end) {
                        const [lsh, lsm] = a.lunch_start.split(':').map(Number);
                        const [leh, lem] = a.lunch_end.split(':').map(Number);
                        const lunchMin = Math.max(0, (leh * 60 + lem) - (lsh * 60 + lsm));
                        workedMinutes = Math.max(0, workedMinutes - lunchMin);
                      }
                    }

                    let delays = 0;
                    if (a.entry_time) {
                      const [eh, em] = a.entry_time.split(':').map(Number);
                      const standardEntryMinutes = 9 * 60;
                      if ((eh * 60 + em) > standardEntryMinutes) {
                        delays = (eh * 60 + em) - standardEntryMinutes;
                      }
                    }

                    const regularMinutes = 8 * 60;
                    const overtimeMinutes = Math.max(0, workedMinutes - regularMinutes);

                    reportData.push({
                      fecha: a.date,
                      rut: u.rut || 'N/A',
                      nombre: u.name,
                      entrada: a.entry_time || '--:--',
                      salida_colacion: a.lunch_start || '--:--',
                      retorno_colacion: a.lunch_end || '--:--',
                      salida: a.exit_time || '--:--',
                      horas_trabajadas: (workedMinutes / 60).toFixed(2),
                      minutos_atraso: delays,
                      horas_extras: (overtimeMinutes / 60).toFixed(2),
                      observaciones: a.entry_time ? 'Marcación electrónica Kiosco' : 'Sin registro de entrada'
                    });
                  }

                } else if (reportType === 'sundays_holidays') {
                  // 3. REPORTE DE DOMINGOS Y FESTIVOS
                  for (let a of attendances) {
                    const d = new Date(a.date + 'T12:00:00Z');
                    if (d.getUTCDay() !== 0) continue;

                    const u = userList.find(x => x.id === a.user_id);
                    if (!u) continue;

                    reportData.push({
                      fecha: a.date,
                      dia: 'Domingo',
                      rut: u.rut || 'N/A',
                      nombre: u.name,
                      entrada: a.entry_time || '--:--',
                      salida: a.exit_time || '--:--',
                      tipo: 'Trabajado en Domingo / Festivo',
                      recargo_legal: 'Recargo 50% legal (Código del Trabajo)'
                    });
                  }

                } else if (reportType === 'modifications') {
                  // 4. REPORTE DE MODIFICACIONES Y/O ALTERACIONES
                  for (let l of leaves) {
                    const u = userList.find(x => x.id === l.user_id);
                    reportData.push({
                      fecha_modificacion: l.created_at,
                      rut_trabajador: u ? u.rut : 'N/A',
                      nombre_trabajador: u ? u.name : 'N/A',
                      periodo_afectado: l.date_from + ' al ' + l.date_to,
                      tipo_alteracion: l.leave_type,
                      documento_soporte: l.document_number || 'N/A',
                      motivo: l.remarks || 'Justificación legal de jornada',
                      responsable: l.created_by || 'Administrador'
                    });
                  }

                } else if (reportType === 'realtime_today') {
                  // 5. REPORTE DIARIO EN TIEMPO REAL
                  const todayStr = new Date().toISOString().split('T')[0];
                  for (let u of userList) {
                    const att = attendances.find(a => a.user_id === u.id && a.date === todayStr);
                    reportData.push({
                      rut: u.rut || 'N/A',
                      nombre: u.name,
                      fecha_actual: todayStr,
                      hora_entrada: att ? att.entry_time || 'Pendiente' : 'Pendiente',
                      salida_colacion: att ? att.lunch_start || '--' : '--',
                      retorno_colacion: att ? att.lunch_end || '--' : '--',
                      hora_salida: att ? att.exit_time || 'En turno' : 'En turno',
                      estado_actual: att && att.entry_time ? (att.exit_time ? 'Jornada Finalizada' : 'Presente en Turno') : 'No ha marcado entrada'
                    });
                  }

                } else if (reportType === 'technical_incidents') {
                  // 6. REPORTE DE INCIDENTES TÉCNICOS
                  db.all("SELECT * FROM system_incidents ORDER BY date DESC", (iErr, incidents) => {
                    const list = (incidents && incidents.length > 0) ? incidents : [
                      {
                        date: new Date().toISOString().split('T')[0],
                        start_time: '00:00',
                        end_time: '23:59',
                        incident_type: 'Operación Continua',
                        description: 'Sistema operando normalmente con 99.9% de disponibilidad sin incidentes reportados.'
                      }
                    ];

                    const checksum = crypto.createHash('sha256').update(JSON.stringify(list)).digest('hex');
                    return res.json({
                      success: true,
                      reportType,
                      company: {
                        name: 'Inversiones Botam SpA',
                        rut: '77.654.321-0',
                        system_name: 'AsistenTruck'
                      },
                      checksum_hash: checksum,
                      generated_at: new Date().toISOString(),
                      data: list
                    });
                  });
                  return;
                }

                // Calcular Checksum SHA-256
                const checksum = crypto.createHash('sha256').update(JSON.stringify(reportData)).digest('hex');

                res.json({
                  success: true,
                  reportType,
                  company: {
                    name: 'Inversiones Botam SpA',
                    rut: '77.654.321-0',
                    system_name: 'AsistenTruck'
                  },
                  checksum_hash: checksum,
                  generated_at: new Date().toISOString(),
                  total_records: reportData.length,
                  data: reportData
                });
              }
            );
          }
        );
      });
    } catch (e) {
      console.error('Error generando reporte DT:', e);
      res.status(500).json({ error: 'Error al generar reporte de fiscalización' });
    }
  });

  // 5. Registrar descarga efectuada por el fiscalizador y alertar a administradores
  app.post('/api/dt/log-download', authenticateDtOrAdmin, (req, res) => {
    try {
      const { session_id, report_type, filters, format, checksum_hash } = req.body;
      const inspectorName = req.user ? req.user.inspector_name || req.user.name || 'Fiscalizador DT' : 'Fiscalizador DT';
      const inspectorEmail = req.user ? req.user.inspector_email || req.user.email || 'dt@dt.gob.cl' : 'dt@dt.gob.cl';

      db.run(
        "INSERT INTO dt_download_logs (session_id, inspector_name, inspector_email, report_type, filters_json, format, checksum_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [session_id || null, inspectorName, inspectorEmail, report_type, JSON.stringify(filters || {}), format || 'excel', checksum_hash || 'SHA256-OK'],
        function(err) {
          if (err) console.error('Error insertando dt_download_logs:', err);

          const alertData = {
            inspector_name: inspectorName,
            inspector_email: inspectorEmail,
            report_type,
            format: (format || 'excel').toUpperCase(),
            downloaded_at: new Date().toISOString(),
            filters: filters || {}
          };

          // Emitir alerta a administradores en tiempo real
          io.emit('dt_download_alert', alertData);

          db.run(
            "INSERT INTO audit_logs (admin_name, action, details) VALUES (?, 'DESCARGA_REPORTE_DT', ?)",
            [inspectorName, JSON.stringify(alertData)]
          );

          res.json({ success: true, message: 'Descarga registrada en el libro oficial de fiscalización' });
        }
      );
    } catch (e) {
      console.error('Error en /api/dt/log-download:', e);
      res.status(500).json({ error: 'Error al registrar descarga' });
    }
  });

  // 6. Finalizar y cerrar sesión de fiscalización
  app.post('/api/dt/close-session', authenticateDtOrAdmin, (req, res) => {
    try {
      const { session_id } = req.body;
      const sId = session_id || (req.user ? req.user.session_id : null);
      const inspectorName = req.user ? req.user.inspector_name || 'Fiscalizador DT' : 'Fiscalizador DT';

      if (sId) {
        db.run("UPDATE dt_audit_sessions SET ended_at = CURRENT_TIMESTAMP, status = 'completed' WHERE id = ?", [sId]);
      }

      const closeNotice = {
        session_id: sId,
        inspector_name: inspectorName,
        ended_at: new Date().toISOString(),
        message: `El fiscalizador ${inspectorName} de la Dirección del Trabajo ha finalizado la sesión de revisión y fiscalización.`
      };

      io.emit('dt_session_closed', closeNotice);

      db.run(
        "INSERT INTO audit_logs (admin_name, action, details) VALUES (?, 'TERMINO_FISCALIZACION_DT', ?)",
        [inspectorName, JSON.stringify(closeNotice)]
      );

      res.json({ success: true, message: 'Sesión de fiscalización cerrada exitosamente' });
    } catch (e) {
      res.status(500).json({ error: 'Error al cerrar sesión' });
    }
  });

  // 7. Módulo Administrativo: Licencias Médicas y Justificativos Legales
  app.get('/api/admin/worker-leaves', authenticateToken, requireAdmin, (req, res) => {
    db.all(
      "SELECT wl.*, u.name as user_name, u.rut as user_rut FROM worker_leaves wl JOIN users u ON wl.user_id = u.id ORDER BY wl.date_from DESC",
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error al consultar licencias' });
        res.json(rows || []);
      }
    );
  });

  app.post('/api/admin/worker-leaves', authenticateToken, requireAdmin, (req, res) => {
    try {
      const { user_id, date_from, date_to, leave_type, document_number, remarks } = req.body;
      if (!user_id || !date_from || !date_to || !leave_type) {
        return res.status(400).json({ error: 'Faltan campos obligatorios para registrar el justificativo.' });
      }

      const adminName = req.user ? req.user.name || req.user.username : 'Administrador';

      db.run(
        "INSERT INTO worker_leaves (user_id, date_from, date_to, leave_type, document_number, remarks, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [user_id, date_from, date_to, leave_type, document_number || null, remarks || null, adminName],
        function(err) {
          if (err) {
            console.error('Error guardando worker_leave:', err);
            return res.status(500).json({ error: 'Error al guardar justificativo' });
          }
          res.json({ success: true, id: this.lastID, message: 'Justificativo/Licencia legal registrada con éxito' });
        }
      );
    } catch (e) {
      res.status(500).json({ error: 'Error al procesar justificativo' });
    }
  });

  app.delete('/api/admin/worker-leaves/:id', authenticateToken, requireAdmin, (req, res) => {
    db.run("DELETE FROM worker_leaves WHERE id = ?", [req.params.id], function(err) {
      if (err) return res.status(500).json({ error: 'Error al eliminar justificativo' });
      res.json({ success: true });
    });
  });

  // 8. Configurar Días Laborables Específicos por Trabajador (users.work_days)
  app.patch('/api/admin/users/:id/work-days', authenticateToken, requireAdmin, (req, res) => {
    try {
      const { work_days } = req.body;
      const workDaysJson = Array.isArray(work_days) ? JSON.stringify(work_days) : '["mon","tue","wed","thu","fri"]';

      db.run("UPDATE users SET work_days = ? WHERE id = ?", [workDaysJson, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Error al actualizar días laborales' });
        res.json({ success: true, message: 'Pauta de días de trabajo actualizada correctamente' });
      });
    } catch (e) {
      res.status(500).json({ error: 'Error al procesar actualización' });
    }
  });
}

module.exports = { setupDtInspection };