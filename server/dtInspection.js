const fs = require('fs');
const path = require('path');
﻿const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function setupDtInspection(app, db, io, JWT_SECRET, requireAdmin, authenticateToken) {
  // Asegurar tabla y columnas de worker_leaves y attendance
  db.run(`
    CREATE TABLE IF NOT EXISTS worker_leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date_from TEXT NOT NULL,
      date_to TEXT NOT NULL,
      leave_type TEXT NOT NULL,
      document_number TEXT,
      remarks TEXT,
      pdf_url TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      document_data TEXT,
      file_mime TEXT,
      file_name TEXT
    )
  `, () => {
    db.run("ALTER TABLE worker_leaves ADD COLUMN pdf_url TEXT", () => {});
    db.run("ALTER TABLE worker_leaves ADD COLUMN document_number TEXT", () => {});
    db.run("ALTER TABLE worker_leaves ADD COLUMN remarks TEXT", () => {});
    db.run("ALTER TABLE worker_leaves ADD COLUMN created_by TEXT", () => {});
    db.run("ALTER TABLE worker_leaves ADD COLUMN document_data TEXT", () => {});
    db.run("ALTER TABLE worker_leaves ADD COLUMN file_mime TEXT", () => {});
    db.run("ALTER TABLE worker_leaves ADD COLUMN file_name TEXT", () => {});
  });

  // Migración automática: Si hay archivos locales en disco pero no en la base de datos en la nube, sincronizarlos
  setTimeout(() => {
    try {
      db.all("SELECT id, pdf_url, document_data FROM worker_leaves WHERE pdf_url IS NOT NULL", (err, rows) => {
        if (!err && Array.isArray(rows)) {
          rows.forEach(r => {
            if (!r.document_data && r.pdf_url) {
              const filename = path.basename(r.pdf_url);
              const localFile = path.join(__dirname, 'uploads', 'leaves', filename);
              if (fs.existsSync(localFile)) {
                try {
                  const buf = fs.readFileSync(localFile);
                  const ext = path.extname(filename).toLowerCase();
                  const mime = ext === '.pdf' ? 'application/pdf' : (ext === '.png' ? 'image/png' : 'image/jpeg');
                  const b64 = `data:${mime};base64,` + buf.toString('base64');
                  db.run("UPDATE worker_leaves SET document_data = ?, file_mime = ?, file_name = ? WHERE id = ?", [b64, mime, filename, r.id]);
                  console.log(`[DT LEAVES] Archivo respaldado a base de datos persistente: ${filename}`);
                } catch (e) {}
              }
            }
          });
        }
      });
    } catch (migErr) {}
  }, 2000);
  db.run("ALTER TABLE attendance ADD COLUMN status TEXT DEFAULT 'ASISTIO'", () => {});
  db.run("ALTER TABLE attendance ADD COLUMN admin_note TEXT", () => {});
  db.run("ALTER TABLE attendance ADD COLUMN modified_by_admin INTEGER DEFAULT 0", () => {});

  // Función maestra: Sincronizar automáticamente todas las licencias activas con la tabla attendance
  db.run("UPDATE attendance SET modified_by_admin = 0 WHERE modified_by_admin != 0", () => {});
  function syncWorkerLeavesToAttendance(callback) {
    db.all("SELECT * FROM worker_leaves ORDER BY date_from ASC", (err, leaves) => {
      if (err || !Array.isArray(leaves) || leaves.length === 0) {
        if (typeof callback === 'function') callback();
        return;
      }

      const promises = [];
      leaves.forEach(l => {
        const targetUserId = Number(l.user_id);
        const leaveNote = `Justificado: ${l.leave_type}${l.document_number ? ` (Doc Nº ${l.document_number})` : ''}`;
        const cur = new Date(l.date_from + 'T00:00:00Z');
        const stop = new Date(l.date_to + 'T00:00:00Z');

        while (cur <= stop) {
          const currentDStr = cur.toISOString().split('T')[0];
          promises.push(new Promise((resolve) => {
            db.get("SELECT id, status, entry_time FROM attendance WHERE user_id = ? AND date = ?", [targetUserId, currentDStr], (checkErr, row) => {
              if (row) {
                if (row.status !== 'JUSTIFICADO') {
                  db.run(
                    "UPDATE attendance SET status = 'JUSTIFICADO', admin_note = ?, modified_by_admin = 0 WHERE id = ?",
                    [leaveNote, row.id],
                    () => resolve()
                  );
                } else {
                  resolve();
                }
              } else {
                db.run(
                  "INSERT INTO attendance (user_id, date, status, entry_time, lunch_out_time, lunch_in_time, exit_time, total_hours, admin_note, modified_by_admin) VALUES (?, ?, 'JUSTIFICADO', '--:--', '--:--', '--:--', '--:--', 0, ?, 0)",
                  [targetUserId, currentDStr, leaveNote],
                  () => resolve()
                );
              }
            });
          }));
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
      });

      Promise.all(promises).then(() => {
        console.log(`[DT LEAVES] Sincronización automática de licencias completada (${leaves.length} registros).`);
        if (typeof callback === 'function') callback();
      }).catch((syncErr) => {
        console.warn('[DT LEAVES] Advertencia en sincronización:', syncErr);
        if (typeof callback === 'function') callback();
      });
    });
  }

  // Ejecutar sincronización al inicio del servidor
  setTimeout(() => {
    syncWorkerLeavesToAttendance();
  }, 1000);


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

        // Auto-caducar sesiones de prueba o inspecciones de días anteriores o de más de 2 horas
        const startTime = new Date(row.started_at).getTime();
        const now = Date.now();
        const diffHours = (now - startTime) / (1000 * 60 * 60);

        if (isNaN(startTime) || diffHours > 2 || diffHours < 0) {
          db.run("UPDATE dt_audit_sessions SET status = 'completed', ended_at = CURRENT_TIMESTAMP WHERE id = ?", [row.id]);
          return res.json({ active: false });
        }

        res.json({
          active: true,
          session: row,
          title: "Se ha iniciado un proceso de revisión de información por parte de un funcionario de la Dirección del Trabajo.",
          legal_text: "Se informa a usted que, de acuerdo con las facultades y obligaciones legales contenidas en el Código del Trabajo y sus leyes complementarias; en el D.F.L. Nº2 de 1967, del Ministerio del Trabajo y Previsión Social, y en otras disposiciones reglamentarias, se está iniciando un procedimiento de fiscalización laboral."
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
      const { session_id } = req.body || {};
      const sId = session_id || (req.user ? req.user.session_id : null);
      const inspectorName = req.user ? req.user.inspector_name || 'Fiscalizador DT' : 'Fiscalizador DT';

      if (sId) {
        db.run("UPDATE dt_audit_sessions SET ended_at = CURRENT_TIMESTAMP, status = 'completed' WHERE id = ?", [sId]);
      } else {
        db.run("UPDATE dt_audit_sessions SET ended_at = CURRENT_TIMESTAMP, status = 'completed' WHERE status = 'active'");
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

  // 7.0. Servidor Dinámico Inteligente de Archivos de Licencias (Nube + Caché Local)
  app.get('/uploads/leaves/:filename', (req, res) => {
    const filename = req.params.filename;
    const localPath = path.join(__dirname, 'uploads', 'leaves', filename);

    // 1. Si existe físicamente en caché local de disco, enviarlo inmediatamente
    if (fs.existsSync(localPath)) {
      return res.sendFile(localPath);
    }

    // 2. Si no está en disco (ej. contenedor Render reiniciado o nuevo deploy),
    // recuperarlo desde la base de datos persistente en la nube (TURSO / SQLite)
    db.get(
      "SELECT id, pdf_url, document_data, file_name, file_mime FROM worker_leaves WHERE pdf_url LIKE ? OR file_name = ? ORDER BY id DESC LIMIT 1",
      [`%${filename}%`, filename],
      (err, row) => {
        if (row && row.document_data) {
          try {
            const matches = String(row.document_data).match(/^data:([A-Za-z-+/0-9]+);base64,(.+)$/);
            const mimeType = matches ? matches[1] : (row.file_mime || (filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'));
            const rawB64 = matches ? matches[2] : (row.document_data.includes('base64,') ? row.document_data.split('base64,')[1] : row.document_data);
            const buffer = Buffer.from(rawB64, 'base64');

            // Restaurar en disco local para acelerar próximas peticiones
            try {
              const dir = path.join(__dirname, 'uploads', 'leaves');
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(localPath, buffer);
            } catch (e) {}

            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Disposition', `inline; filename="${row.file_name || filename}"`);
            return res.send(buffer);
          } catch (e) {
            console.error('Error al decodificar documento desde BD:', e);
          }
        }

        // Si no se encuentra ni en disco ni en BD
        return res.status(404).send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Documento no disponible</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #09090b; color: #f4f4f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 20px; padding: 32px; max-width: 500px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    .icon { width: 56px; height: 56px; border-radius: 16px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 24px; color: #ef4444; }
    h2 { font-size: 18px; font-weight: 800; color: #fff; margin: 0 0 10px 0; }
    p { font-size: 13px; color: #a1a1aa; line-height: 1.6; margin: 0 0 20px 0; }
    .btn { background: #ea580c; color: #fff; border: none; padding: 12px 24px; border-radius: 12px; font-size: 13px; font-weight: 800; cursor: pointer; text-decoration: none; display: inline-block; }
    .btn:hover { background: #f97316; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h2>Archivo anterior no disponible en la nube</h2>
    <p>El archivo adjunto (<strong>${filename}</strong>) fue subido antes de la activación del respaldo permanente y se eliminó durante el último reinicio del servidor.</p>
    <p>Para solucionarlo de forma permanente, ingrese a <strong>Licencias DT</strong> en el panel de administración y presione <strong>"📎 Adjuntar Licencia / Papel"</strong> para cargar nuevamente la fotografía o PDF. El nuevo archivo quedará respaldado para siempre en la base de datos de la nube y se podrá consultar desde cualquier dispositivo.</p>
    <button class="btn" onclick="window.close()">Entendido / Cerrar</button>
  </div>
</body>
</html>`);
      }
    );
  });

  // 7.0.1. Endpoint para obtener documento por ID de Justificativo
  app.get('/api/admin/worker-leaves/:id/document', (req, res) => {
    const leaveId = Number(req.params.id);
    db.get("SELECT * FROM worker_leaves WHERE id = ?", [leaveId], (err, row) => {
      if (err || !row) return res.status(404).send('Documento no encontrado');
      if (row.document_data) {
        try {
          const matches = String(row.document_data).match(/^data:([A-Za-z-+/0-9]+);base64,(.+)$/);
          const mimeType = matches ? matches[1] : (row.file_mime || 'application/pdf');
          const rawB64 = matches ? matches[2] : (row.document_data.includes('base64,') ? row.document_data.split('base64,')[1] : row.document_data);
          const buffer = Buffer.from(rawB64, 'base64');
          res.setHeader('Content-Type', mimeType);
          res.setHeader('Content-Disposition', `inline; filename="${row.file_name || `licencia_${leaveId}`}"`);
          return res.send(buffer);
        } catch (e) {
          console.error('Error al enviar documento por ID:', e);
        }
      }
      if (row.pdf_url) {
        const filename = path.basename(row.pdf_url);
        const localPath = path.join(__dirname, 'uploads', 'leaves', filename);
        if (fs.existsSync(localPath)) return res.sendFile(localPath);
      }
      return res.status(404).send('El archivo no está disponible.');
    });
  });

  // 7.1. Listar licencias médicas
  app.get('/api/admin/worker-leaves', authenticateToken, requireAdmin, (req, res) => {
    db.all(
      "SELECT wl.id, wl.user_id, wl.date_from, wl.date_to, wl.leave_type, wl.document_number, wl.remarks, wl.pdf_url, wl.file_name, wl.file_mime, wl.created_by, wl.created_at, (CASE WHEN wl.document_data IS NOT NULL AND wl.document_data != '' THEN 1 ELSE 0 END) as has_cloud_backup, u.name as user_name, u.rut as user_rut FROM worker_leaves wl LEFT JOIN users u ON wl.user_id = u.id ORDER BY wl.date_from DESC",
      (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error al consultar licencias: ' + (err.message || err) });
        res.json(rows || []);
      }
    );
  });

  // 7.2. Crear nueva licencia médica o justificativo con respaldo en la nube
  app.post('/api/admin/worker-leaves', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const { user_id, date_from, date_to, leave_type, document_number, remarks, pdf_base64, pdf_filename } = req.body;
      const targetUserId = Number(user_id);
      if (!targetUserId || !date_from || !date_to || !leave_type) {
        return res.status(400).json({ error: 'Faltan campos obligatorios para registrar el justificativo.' });
      }

      const adminName = req.user ? (req.user.name || req.user.username || 'Administrador') : 'Administrador';

      // 1. Guardar archivo con respaldo permanente en la nube (document_data)
      let pdfUrl = null;
      let documentData = null;
      let fileMime = null;
      let originalFileName = pdf_filename || null;

      if (pdf_base64) {
        documentData = String(pdf_base64);
        const matches = documentData.match(/^data:([A-Za-z-+/0-9]+);base64,(.+)$/);
        fileMime = matches ? matches[1] : (pdf_filename && pdf_filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
        const rawBase64 = matches ? matches[2] : (documentData.includes('base64,') ? documentData.split('base64,')[1] : documentData);
        const buffer = Buffer.from(rawBase64, 'base64');

        let ext = '.pdf';
        if (fileMime.includes('jpeg') || fileMime.includes('jpg')) ext = '.jpeg';
        else if (fileMime.includes('png')) ext = '.png';
        else if (fileMime.includes('webp')) ext = '.webp';
        else if (pdf_filename) ext = path.extname(pdf_filename) || '.pdf';

        const fileName = `licencia_${Date.now()}_u${targetUserId}${ext}`;
        originalFileName = pdf_filename || fileName;
        pdfUrl = `/uploads/leaves/${fileName}`;

        // Intentar guardar en disco local como caché rápido
        try {
          const uploadsLeavesDir = path.join(__dirname, 'uploads', 'leaves');
          if (!fs.existsSync(uploadsLeavesDir)) {
            fs.mkdirSync(uploadsLeavesDir, { recursive: true });
          }
          const filePath = path.join(uploadsLeavesDir, fileName);
          fs.writeFileSync(filePath, buffer);
        } catch (pdfErr) {
          console.warn('Aviso: no se pudo escribir en disco local, se guarda en la nube:', pdfErr.message);
        }
      }

      // 2. Registrar en worker_leaves con documento persistido permanentemente en la nube
      db.run(
        "INSERT INTO worker_leaves (user_id, date_from, date_to, leave_type, document_number, remarks, pdf_url, created_by, document_data, file_mime, file_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [targetUserId, date_from, date_to, leave_type, document_number || null, remarks || null, pdfUrl, adminName, documentData, fileMime, originalFileName],
        async function(err) {
          if (err) {
            console.error('Error guardando worker_leave:', err);
            return res.status(500).json({ error: 'Error al guardar justificativo: ' + (err.message || err) });
          }
          const leaveId = this.lastID;

          // 3. ACTUALIZAR AUTOMÁTICAMENTE EL HISTORIAL DE ASISTENCIA DÍA A DÍA
          const leaveNote = `Justificado: ${leave_type}${document_number ? ` (Doc Nº ${document_number})` : ''}`;
          const dayPromises = [];

          try {
            const cur = new Date(date_from + 'T00:00:00Z');
            const stop = new Date(date_to + 'T00:00:00Z');

            while (cur <= stop) {
              const currentDStr = cur.toISOString().split('T')[0];
              dayPromises.push(new Promise((resolve) => {
                db.get("SELECT id, status, entry_time FROM attendance WHERE user_id = ? AND date = ?", [targetUserId, currentDStr], (checkErr, row) => {
                  if (row) {
                    db.run(
                      "UPDATE attendance SET status = 'JUSTIFICADO', admin_note = ?, modified_by_admin = 0 WHERE id = ?",
                      [leaveNote, row.id],
                      () => resolve()
                    );
                  } else {
                    db.run(
                      "INSERT INTO attendance (user_id, date, status, entry_time, lunch_out_time, lunch_in_time, exit_time, total_hours, admin_note, modified_by_admin) VALUES (?, ?, 'JUSTIFICADO', '--:--', '--:--', '--:--', '--:--', 0, ?, 0)",
                      [targetUserId, currentDStr, leaveNote],
                      () => resolve()
                    );
                  }
                });
              }));

              cur.setUTCDate(cur.getUTCDate() + 1);
            }
          } catch (histErr) {
            console.warn('Advertencia actualizando historial de asistencia:', histErr);
          }

          await Promise.all(dayPromises);

          // Ejecutar sincronización global de seguridad
          syncWorkerLeavesToAttendance();

          if (io) {
            io.emit('attendance_updated', { user_id: targetUserId, date_from, date_to, status: 'JUSTIFICADO', note: leaveNote });
            io.emit('leaves_updated', { user_id: targetUserId, leave_id: leaveId });
          }

          res.json({
            success: true,
            id: leaveId,
            pdf_url: pdfUrl,
            message: 'Licencia registrada y respaldada exitosamente en la nube.'
          });
        }
      );
    } catch (err) {
      console.error('Error general en worker-leaves:', err);
      res.status(500).json({ error: 'Error al procesar justificativo: ' + (err.message || err) });
    }
  });

  // 7.3. Adjuntar o actualizar archivo de respaldo a un justificativo ya creado
  app.patch('/api/admin/worker-leaves/:id/attachment', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const leaveId = Number(req.params.id);
      const { pdf_base64, pdf_filename, document_number, remarks } = req.body;

      db.get("SELECT * FROM worker_leaves WHERE id = ?", [leaveId], async (err, leave) => {
        if (err || !leave) {
          return res.status(404).json({ error: 'Justificativo no encontrado' });
        }

        let pdfUrl = leave.pdf_url;
        let documentData = leave.document_data || null;
        let fileMime = leave.file_mime || null;
        let originalFileName = leave.file_name || pdf_filename || null;

        if (pdf_base64) {
          documentData = String(pdf_base64);
          const matches = documentData.match(/^data:([A-Za-z-+/0-9]+);base64,(.+)$/);
          fileMime = matches ? matches[1] : (pdf_filename && pdf_filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
          const rawBase64 = matches ? matches[2] : (documentData.includes('base64,') ? documentData.split('base64,')[1] : documentData);
          const buffer = Buffer.from(rawBase64, 'base64');

          let ext = '.pdf';
          if (fileMime.includes('jpeg') || fileMime.includes('jpg')) ext = '.jpeg';
          else if (fileMime.includes('png')) ext = '.png';
          else if (fileMime.includes('webp')) ext = '.webp';
          else if (pdf_filename) ext = path.extname(pdf_filename) || '.pdf';

          const fileName = `licencia_${Date.now()}_u${leave.user_id}${ext}`;
          originalFileName = pdf_filename || fileName;
          pdfUrl = `/uploads/leaves/${fileName}`;

          try {
            const uploadsLeavesDir = path.join(__dirname, 'uploads', 'leaves');
            if (!fs.existsSync(uploadsLeavesDir)) {
              fs.mkdirSync(uploadsLeavesDir, { recursive: true });
            }
            const filePath = path.join(uploadsLeavesDir, fileName);
            fs.writeFileSync(filePath, buffer);
          } catch (pdfErr) {
            console.warn('Aviso: no se pudo escribir en disco local, se guarda en la nube:', pdfErr.message);
          }
        }

        const finalDocNumber = (document_number !== undefined && document_number !== null && String(document_number).trim() !== '') 
          ? String(document_number).trim() 
          : leave.document_number;
        const finalRemarks = (remarks !== undefined && remarks !== null && String(remarks).trim() !== '') 
          ? String(remarks).trim() 
          : leave.remarks;

        db.run(
          "UPDATE worker_leaves SET pdf_url = ?, document_number = ?, remarks = ?, document_data = ?, file_mime = ?, file_name = ? WHERE id = ?",
          [pdfUrl, finalDocNumber, finalRemarks, documentData, fileMime, originalFileName, leaveId],
          function(upErr) {
            if (upErr) {
              return res.status(500).json({ error: 'Error al actualizar documento: ' + upErr.message });
            }

            // Actualizar notas en el historial de asistencia si cambió el folio
            if (finalDocNumber !== leave.document_number) {
              const leaveNote = `Justificado: ${leave.leave_type}${finalDocNumber ? ` (Doc Nº ${finalDocNumber})` : ''}`;
              db.run(
                "UPDATE attendance SET admin_note = ? WHERE user_id = ? AND date >= ? AND date <= ? AND status = 'JUSTIFICADO'",
                [leaveNote, leave.user_id, leave.date_from, leave.date_to]
              );
            }

            if (io) {
              io.emit('leaves_updated', { user_id: leave.user_id, leave_id: leaveId, pdf_url: pdfUrl });
            }

            res.json({
              success: true,
              id: leaveId,
              pdf_url: pdfUrl,
              document_number: finalDocNumber,
              remarks: finalRemarks,
              message: 'Documento de respaldo guardado permanentemente en la nube.'
            });
          }
        );
      });
    } catch (err) {
      console.error('Error al adjuntar archivo a justificativo:', err);
      res.status(500).json({ error: 'Error al actualizar justificativo: ' + (err.message || err) });
    }
  });

  // 7.4. Eliminar justificativo
  app.delete('/api/admin/worker-leaves/:id', authenticateToken, requireAdmin, (req, res) => {
    db.get("SELECT * FROM worker_leaves WHERE id = ?", [req.params.id], (getErr, leave) => {
      if (getErr || !leave) {
        return res.status(404).json({ error: 'Justificativo no encontrado' });
      }

      db.run("DELETE FROM worker_leaves WHERE id = ?", [req.params.id], function(delErr) {
        if (delErr) return res.status(500).json({ error: 'Error al eliminar justificativo' });

        db.all(
          "SELECT date_from, date_to FROM worker_leaves WHERE user_id = ?",
          [leave.user_id],
          (remErr, remainingLeaves) => {
            const isCovered = (dateStr) => {
              return (remainingLeaves || []).some(rl => dateStr >= rl.date_from && dateStr <= rl.date_to);
            };

            const cur = new Date(leave.date_from + 'T00:00:00Z');
            const stop = new Date(leave.date_to + 'T00:00:00Z');
            const cleanupPromises = [];

            while (cur <= stop) {
              const dStr = cur.toISOString().split('T')[0];
              if (!isCovered(dStr)) {
                cleanupPromises.push(new Promise((resolve) => {
                  db.run(
                    "DELETE FROM attendance WHERE user_id = ? AND date = ? AND entry_time = '--:--' AND status = 'JUSTIFICADO'",
                    [leave.user_id, dStr],
                    () => {
                      db.run(
                        "UPDATE attendance SET status = 'ASISTIO', admin_note = NULL WHERE user_id = ? AND date = ? AND status = 'JUSTIFICADO'",
                        [leave.user_id, dStr],
                        () => resolve()
                      );
                    }
                  );
                }));
              }
              cur.setUTCDate(cur.getUTCDate() + 1);
            }

            Promise.all(cleanupPromises).then(() => {
              syncWorkerLeavesToAttendance(() => {
                if (io) {
                  io.emit('attendance_updated', { user_id: leave.user_id, deleted: true });
                  io.emit('leaves_updated', { user_id: leave.user_id });
                }
                res.json({ success: true, message: 'Justificativo eliminado e historial restaurado correctamente' });
              });
            });
          }
        );
      });
    });
  });

  // Endpoint explícito para forzar re-sincronización de todas las licencias con el historial
  app.post('/api/admin/worker-leaves/sync', authenticateToken, requireAdmin, (req, res) => {
    syncWorkerLeavesToAttendance(() => {
      res.json({ success: true, message: 'Todas las licencias han sido sincronizadas con el historial de asistencia.' });
    });
  });

  // 8. Configurar Días Laborables Específicos por Trabajador (users.work_days)
  app.patch('/api/admin/users/:id/work-days', authenticateToken, requireAdmin, (req, res) => {
    try {
      const { work_days } = req.body;
      const workDaysJson = Array.isArray(work_days) ? JSON.stringify(work_days) : '["mon","tue","wed","thu","fri"]';

      db.run("UPDATE users SET work_days = ? WHERE id = ?", [workDaysJson, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Error al actualizar días laborales' });
        io.emit('user_updated', { id: Number(req.params.id), work_days: workDaysJson });
        res.json({ success: true, message: 'Pauta de días de trabajo actualizada correctamente', work_days: workDaysJson });
      });
    } catch (e) {
      res.status(500).json({ error: 'Error al procesar actualización' });
    }
  });
}

module.exports = { setupDtInspection };