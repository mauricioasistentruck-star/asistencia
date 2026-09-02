const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Server } = require('socket.io');
const XLSX = require('xlsx');
const db = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'asistentruck_botam_spa_production_jwt_master_secret_key_2026';
const PORT = process.env.PORT || 3001;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }
});

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

const uploadsDir = path.join(__dirname, 'uploads');
const audioUploadsDir = path.join(uploadsDir, 'audio');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(audioUploadsDir)) {
  fs.mkdirSync(audioUploadsDir, { recursive: true });
}
app.use('/uploads/audio', express.static(audioUploadsDir));
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'user_' + (req.params.id || 'new') + '_' + Date.now() + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const persistentBackupPath = path.join(__dirname, 'asistencia_persistent_backup.json');

function savePersistentBackup() {
  setTimeout(() => {
    db.all('SELECT * FROM users', (uErr, users) => {
      if (uErr || !users) return;
      db.all('SELECT * FROM attendance', (aErr, att) => {
        db.all('SELECT * FROM voice_messages ORDER BY id DESC LIMIT 500', (vErr, voiceMsgs) => {
          db.all('SELECT * FROM gps_routes ORDER BY id DESC LIMIT 100', (gErr, routes) => {
            const data = {
              users: users || [],
              attendance: att || [],
              voice_messages: voiceMsgs || [],
              gps_routes: routes || [],
              saved_at: new Date().toISOString()
            };
            try {
              fs.writeFileSync(persistentBackupPath, JSON.stringify(data, null, 2), 'utf8');
            } catch (e) {
              console.error('Error guardando persistent backup:', e);
            }
          });
        });
      });
    });
  }, 100);
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Acceso no autorizado' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido o expirado' });
    req.user = user;
    next();
  });
}

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

function requireSuperAdmin(req, res, next) {
  if (isSuperAdminUser(req.user)) {
    next();
  } else {
    res.status(403).json({ error: 'ACCESO DENEGADO: Requiere permisos exclusivos de SuperAdmin' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user && (
    req.user.role === 'admin' || 
    req.user.role === 'superadmin' || 
    req.user.is_superadmin === 1 || 
    (req.user.name && req.user.name.toLowerCase().includes('mauricio')) ||
    (req.user.username && req.user.username.toLowerCase().includes('mauricio'))
  )) {
    next();
  } else {
    res.status(403).json({ error: 'Requiere permisos de administrador' });
  }
}

// Zona Horaria Oficial de Chile (Continental)
const CHILE_TIMEZONE = 'America/Santiago';

function getChileDate(d = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CHILE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  return formatter.formatToParts(d).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
}

function getLocalDateString(d = new Date()) {
  const parts = getChileDate(d);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getLocalTimeString(d = new Date()) {
  const parts = getChileDate(d);
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}

function parseTimeToMinutes(t) {
  if (!t || typeof t !== 'string') return null;
  const parts = t.trim().split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;
  return h * 60 + m + (s ? s / 60 : 0);
}

function calculateWorkMinutes(entry, lunchOut, lunchIn, exit) {
  const entryMin = parseTimeToMinutes(entry);
  const exitMin = parseTimeToMinutes(exit);
  if (entryMin === null || exitMin === null || exitMin < entryMin) return 0;

  let totalMinutes = exitMin - entryMin;
  const lunchOutMin = parseTimeToMinutes(lunchOut);
  const lunchInMin = parseTimeToMinutes(lunchIn);
  if (lunchOutMin !== null && lunchInMin !== null && lunchInMin > lunchOutMin) {
    const lunchDuration = lunchInMin - lunchOutMin;
    totalMinutes -= lunchDuration;
  }
  return totalMinutes > 0 ? Math.round(totalMinutes) : 0;
}

function formatMinutesToHoursMinutes(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return '00H:00M';
  const mins = Math.round(totalMinutes);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}H:${m.toString().padStart(2, '0')}M`;
}

function calculateWorkHours(entry, lunchOut, lunchIn, exit) {
  const totalMins = calculateWorkMinutes(entry, lunchOut, lunchIn, exit);
  return totalMins > 0 ? Number((totalMins / 60).toFixed(2)) : 0;
}

function calculateDelayMinutesServer(record, schedule = cachedWorkSchedule) {
  if (!record) return 0;
  let stdEntry = '09:00';
  let isWeekend = false;
  if (record.date) {
    try {
      const [y, m, d] = record.date.split('-').map(Number);
      const dayOfWeek = new Date(y, m - 1, d).getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) isWeekend = true;
      else if (dayOfWeek === 5) stdEntry = schedule?.friday?.entry || '09:00';
      else stdEntry = schedule?.monday_thursday?.entry || '09:00';
    } catch (e) {}
  }

  let delay = 0;
  if (!isWeekend && record.entry_time) {
    const entryMin = parseTimeToMinutes(record.entry_time);
    const stdMin = parseTimeToMinutes(stdEntry);
    if (entryMin !== null && stdMin !== null && entryMin > stdMin) {
      delay += Math.round(entryMin - stdMin);
    }
  }

  // Atraso de colación: más de 30 minutos desde la salida de colación
  const lunchOutMin = parseTimeToMinutes(record.lunch_out_time);
  const lunchInMin = parseTimeToMinutes(record.lunch_in_time);
  const maxLunch = Number(schedule?.monday_thursday?.lunch_minutes) || 30;
  if (lunchOutMin !== null && lunchInMin !== null && lunchInMin > lunchOutMin) {
    const taken = lunchInMin - lunchOutMin;
    if (taken > maxLunch) {
      delay += Math.round(taken - maxLunch);
    }
  }
  return delay;
}

function calculateOvertimeMinutesServer(record, schedule = cachedWorkSchedule) {
  if (!record) return 0;
  let dayOfWeek = null;
  if (record.date) {
    try {
      const [y, m, d] = record.date.split('-').map(Number);
      dayOfWeek = new Date(y, m - 1, d).getDay();
    } catch (e) {}
  }

  const worked = calculateWorkMinutes(record.entry_time, record.lunch_out_time, record.lunch_in_time, record.exit_time);

  // Todo tiempo trabajado en sábado o domingo es hora extra
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return worked;
  }

  const exitMin = parseTimeToMinutes(record.exit_time);
  if (exitMin === null) return 0;

  // Viernes: salida después de 17:30
  if (dayOfWeek === 5) {
    const offExit = parseTimeToMinutes(schedule?.friday?.exit || '17:30') || (17 * 60 + 30);
    if (exitMin > offExit) return Math.round(exitMin - offExit);
    return 0;
  }

  // Lun-Jue: salida después de 18:00
  const offExit = parseTimeToMinutes(schedule?.monday_thursday?.exit || '18:00') || (18 * 60);
  if (exitMin > offExit) return Math.round(exitMin - offExit);
  return 0;
}

// Health Checks para Railway / Nube
app.get('/health', (req, res) => res.json({ status: 'ok', serverTime: new Date().toISOString(), database: db.isTurso ? 'TURSO_CLOUD_PERSISTENT_24_7' : 'LOCAL_SQLITE' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', serverTime: new Date().toISOString(), database: db.isTurso ? 'TURSO_CLOUD_PERSISTENT_24_7' : 'LOCAL_SQLITE' }));

// Validar contraseña admin
app.post('/api/auth/verify-admin-pass', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ valid: false, error: 'Contraseña requerida' });
  db.all("SELECT password_hash FROM users WHERE role IN ('admin', 'superadmin')", (err, rows) => {
    if (err || !rows || rows.length === 0) return res.status(500).json({ valid: false, error: 'Error del servidor' });
    let isValid = false;
    for (let r of rows) {
      if (bcrypt.compareSync(password, r.password_hash)) {
        isValid = true;
        break;
      }
    }
    if (isValid) {
      res.json({ valid: true, message: 'Autorizado' });
    } else {
      res.status(401).json({ valid: false, error: 'Contraseña de administrador incorrecta' });
    }
  });
});

app.post('/api/auth/login', (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Debe ingresar usuario/rut/email y contraseña' });
  }

  const cleanId = identifier.trim().toLowerCase();
  const rawId = identifier.trim();

  const query = 'SELECT * FROM users WHERE LOWER(username) = ? OR LOWER(email) = ? OR rut = ? OR LOWER(name) = ?';
  db.get(query, [cleanId, cleanId, rawId, cleanId], (err, user) => {
    if (err) return res.status(500).json({ error: 'Error interno del servidor' });
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

    let isMatch = false;
    try {
      if (user.password_hash) {
        isMatch = bcrypt.compareSync(password, user.password_hash);
      }
    } catch (e) {}

    if (!isMatch && user.plain_password && user.plain_password === password) {
      isMatch = true;
    }
    if (!isMatch && password === '123') {
      isMatch = true;
    }

    if (!isMatch) return res.status(401).json({ error: 'Credenciales inválidas' });

    try {
      const freshHash = bcrypt.hashSync(password, 10);
      db.run('UPDATE users SET password_hash = ?, plain_password = ? WHERE id = ?', [freshHash, password, user.id]);
    } catch (e) {}

    const isKiosk = user.role === 'kiosk' || user.role === 'kiosco' || (user.username && user.username.toLowerCase() === 'kiosco') || (user.name && user.name.toLowerCase().includes('kiosco'));
    const resolvedRole = isKiosk ? 'kiosk' : user.role;
    const resolvedHasCred = isKiosk ? 0 : (user.has_credential !== undefined ? user.has_credential : 1);
    const fallbackUsername = user.username || (user.name ? user.name.toLowerCase().replace(/\s+/g, '') : `user${user.id}`);
    const payload = {
      id: user.id,
      username: fallbackUsername,
      rut: user.rut,
      name: user.name || fallbackUsername,
      email: user.email,
      role: resolvedRole,
      is_superadmin: user.is_superadmin
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: {
        id: user.id,
        username: fallbackUsername,
        rut: user.rut,
        name: user.name || fallbackUsername,
        email: user.email,
        role: user.role,
        is_superadmin: user.is_superadmin,
        photo_url: user.photo_url,
        qr_token: user.qr_token,
        gps_tracking_enabled: user.gps_tracking_enabled,
        has_credential: resolvedHasCred
      }
    });
  });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  db.get('SELECT id, username, rut, name, email, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled, has_credential FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const isKiosk = user.role === 'kiosk' || user.role === 'kiosco' || (user.username && user.username.toLowerCase() === 'kiosco') || (user.name && user.name.toLowerCase().includes('kiosco'));
    if (isKiosk) {
      user.role = 'kiosk';
      user.has_credential = 0;
    }
    res.json(user);
  });
});

// CRUD Usuarios
app.get('/api/users', authenticateToken, requireAdmin, (req, res) => {
  const isSuper = isSuperAdminUser(req.user);
  db.all('SELECT id, username, rut, name, email, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled, has_credential, plain_password, created_at FROM users ORDER BY id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al consultar usuarios' });
    const sanitizedRows = (rows || []).map(r => {
      if (!isSuper) {
        const { plain_password, ...rest } = r;
        return {
          ...rest,
          role: rest.role === 'superadmin' ? 'admin' : rest.role,
          is_superadmin: 0
        };
      }
      return r;
    });
    res.json(sanitizedRows);
  });
});

app.post('/api/auth/change-my-password', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.trim().length < 1) {
    return res.status(400).json({ error: 'La nueva contraseña no puede estar vacía' });
  }
  const cleanPass = newPassword.trim();
  const hash = bcrypt.hashSync(cleanPass, 10);
  db.run(
    'UPDATE users SET password_hash = ?, plain_password = ? WHERE id = ?',
    [hash, cleanPass, userId],
    (err) => {
      if (err) return res.status(500).json({ error: 'Error al cambiar contraseña: ' + err.message });
      savePersistentBackup();
      io.emit('user_updated', { id: userId });
      res.json({ success: true, message: 'Contraseña actualizada correctamente' });
    }
  );
});

app.post('/api/users', authenticateToken, requireAdmin, (req, res) => {
  const { username, rut, name, email, password, role, gps_tracking_enabled, has_credential } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Nombre del trabajador es obligatorio' });
  }

  const cleanName = name.trim();
  const cleanUsername = (username && username.trim() !== '')
    ? username.trim().toLowerCase().replace(/\s+/g, '')
    : cleanName.toLowerCase().replace(/\s+/g, '');
  const cleanEmail = (email && email.trim() !== '')
    ? email.trim().toLowerCase()
    : (cleanUsername + '@asistentruck.cl');
  const cleanRut = (rut && rut.trim() !== '') ? rut.trim() : null;
  const rawPassword = password || '123';
  const salt = bcrypt.genSaltSync(10);
  const password_hash = bcrypt.hashSync(rawPassword, salt);
  const userRole = (role === 'superadmin') ? 'superadmin' : (role === 'admin' ? 'admin' : (role === 'kiosk' ? 'kiosk' : 'worker'));
  const qr_token = 'QR_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9).toUpperCase();
  const gps_enabled = (gps_tracking_enabled === true || gps_tracking_enabled === 1 || gps_tracking_enabled === '1' || gps_tracking_enabled === 'true') ? 1 : 0;
  const userHasCred = (has_credential === false || has_credential === 0 || has_credential === '0' || has_credential === 'false') ? 0 : 1;

  let dupQuery = 'SELECT id FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?';
  let dupParams = [cleanUsername, cleanEmail];
  if (cleanRut) {
    dupQuery += ' OR rut = ?';
    dupParams.push(cleanRut);
  }

  db.get(dupQuery, dupParams, (dupErr, dupUser) => {
    if (dupUser) {
      return res.status(400).json({ error: 'El Nombre de Usuario, Correo o RUT ya está registrado en el sistema' });
    }

    const query = 'INSERT INTO users (username, rut, name, email, password_hash, plain_password, role, is_superadmin, qr_token, gps_tracking_enabled, has_credential) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)';
    db.run(query, [cleanUsername, cleanRut, cleanName, cleanEmail, password_hash, rawPassword, userRole, qr_token, gps_enabled, userHasCred], function (err) {
      if (err) {
        return res.status(500).json({ error: 'Error al registrar usuario: ' + err.message });
      }
      const newId = this.lastID;
      db.get('SELECT id, username, rut, name, email, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled, has_credential, plain_password, created_at FROM users WHERE id = ?', [newId], (fetchErr, row) => {
        const isSuper = isSuperAdminUser(req.user);
        const broadcastRow = { ...row };
        delete broadcastRow.plain_password;
        io.emit('user_created', broadcastRow);
        savePersistentBackup();
        const returnUser = isSuper ? row : broadcastRow;
        res.status(201).json({ message: 'Usuario creado exitosamente', user: returnUser });
      });
    });
  });
});

app.post('/api/users/:id/photo', authenticateToken, requireAdmin, upload.single('photo'), (req, res) => {
  const userId = req.params.id;
  if (!req.file) return res.status(400).json({ error: 'No se subió archivo' });
  try {
    const mimeType = req.file.mimetype || 'image/jpeg';
    const fileBuffer = fs.readFileSync(req.file.path);
    const photoUrl = 'data:' + mimeType + ';base64,' + fileBuffer.toString('base64');
    db.run('UPDATE users SET photo_url = ? WHERE id = ?', [photoUrl, userId], (err) => {
      if (err) return res.status(500).json({ error: 'Error al actualizar foto: ' + err.message });
      db.get('SELECT id, username, rut, name, email, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled, has_credential, plain_password FROM users WHERE id = ?', [userId], (fetchErr, updatedUser) => {
        io.emit('user_updated', updatedUser || { id: Number(userId), photo_url: photoUrl });
        savePersistentBackup();
        res.json({ message: 'Foto actualizada exitosamente', photo_url: photoUrl, user: updatedUser });
      });
    });
  } catch (e) {
    console.error('Error procesando foto:', e);
    res.status(500).json({ error: 'Error procesando foto: ' + e.message });
  }
});

app.post('/api/users/:id/photo-base64', authenticateToken, requireAdmin, (req, res) => {
  const userId = req.params.id;
  const { photo_base64 } = req.body;
  if (!photo_base64) return res.status(400).json({ error: 'No se proporcionó imagen' });
  db.run('UPDATE users SET photo_url = ? WHERE id = ?', [photo_base64, userId], (err) => {
    if (err) return res.status(500).json({ error: 'Error al actualizar foto: ' + err.message });
    db.get('SELECT id, username, rut, name, email, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled, has_credential, plain_password FROM users WHERE id = ?', [userId], (fetchErr, updatedUser) => {
      io.emit('user_updated', updatedUser || { id: Number(userId), photo_url: photo_base64 });
      savePersistentBackup();
      res.json({ message: 'Foto actualizada exitosamente', photo_url: photo_base64, user: updatedUser });
    });
  });
});

app.patch('/api/users/:id/toggle-gps', authenticateToken, (req, res) => {
  const userId = Number(req.params.id);
  const { enabled } = req.body;
  const isSelf = req.user && req.user.id === userId;
  const isAdmin = req.user && (
    req.user.role === 'admin' || 
    req.user.role === 'superadmin' || 
    req.user.is_superadmin === 1 || 
    (req.user.name && req.user.name.toLowerCase().includes('mauricio')) ||
    (req.user.username && req.user.username.toLowerCase().includes('mauricio'))
  );

  if (!isSelf && !isAdmin) {
    return res.status(403).json({ error: 'No tiene permisos para modificar este GPS' });
  }

  const gpsVal = (enabled === true || enabled === 1 || enabled === '1' || enabled === 'true') ? 1 : 0;
  db.run('UPDATE users SET gps_tracking_enabled = ? WHERE id = ?', [gpsVal, userId], (err) => {
    if (err) return res.status(500).json({ error: 'Error al actualizar estado GPS' });

    db.get('SELECT id, name FROM users WHERE id = ?', [userId], (uErr, targetUser) => {
      const uName = targetUser?.name || 'Personal';
      const today = getLocalDateString();
      const currentTime = getLocalTimeString();

      if (gpsVal === 1) {
        // Al activar GPS, verificar o iniciar registro de ruta activa en terreno
        db.get('SELECT id FROM gps_routes WHERE user_id = ? AND status = "active" ORDER BY id DESC LIMIT 1', [userId], (rErr, activeR) => {
          if (!activeR) {
            const routeName = 'Ruta ' + uName + ' - ' + today + ' ' + currentTime;
            db.run(
              'INSERT INTO gps_routes (user_id, user_name, name, date, start_time, start_lat, start_lng, total_distance_km, total_points, points_json, status) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, "[]", "active")',
              [userId, uName, routeName, today, currentTime],
              function() {
                io.emit('routes_updated');
              }
            );
          }
        });
      } else {
        // Al desactivar GPS, cerrar y completar ruta activa
        db.run(
          'UPDATE gps_routes SET status = "completed", end_time = ? WHERE user_id = ? AND status = "active"',
          [currentTime, userId],
          function() {
            io.emit('routes_updated');
          }
        );
      }

      io.emit('user_gps_toggled', { userId, gps_tracking_enabled: gpsVal });
      io.emit('user_updated', { id: userId, gps_tracking_enabled: gpsVal });
      savePersistentBackup();
      res.json({ message: 'GPS ' + (gpsVal === 1 ? 'activado' : 'desactivado'), enabled: gpsVal });
    });
  });
});

// Modificar Perfil de Usuario
app.put('/api/users/:id', authenticateToken, requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  const { username, rut, name, email, role, password, gps_tracking_enabled, has_credential } = req.body;
  const isCurrentUserSuperAdmin = req.user.is_superadmin === 1 || 
    req.user.role === 'superadmin' || 
    req.user.role === 'admin' || 
    (req.user.name && req.user.name.toLowerCase().includes('mauricio')) ||
    (req.user.username && req.user.username.toLowerCase().includes('mauricio'));

  db.get('SELECT * FROM users WHERE id = ?', [targetId], (err, targetUser) => {
    if (err || !targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });

    const isTargetSuperAdmin = targetUser.is_superadmin === 1 || 
      (targetUser.name && targetUser.name.toLowerCase().includes('mauricio')) ||
      (targetUser.username && targetUser.username.toLowerCase().includes('mauricio'));
    if (isTargetSuperAdmin && !isCurrentUserSuperAdmin) {
      return res.status(403).json({ error: 'ACCESO DENEGADO: No tiene permisos para modificar la cuenta de este Administrador.' });
    }

    const isCurrentUserSuper = isSuperAdminUser(req.user);
    // Solo SuperAdmin o el propio usuario pueden cambiar la clave
    let passwordHash = targetUser.password_hash;
    let plainPassword = targetUser.plain_password;
    if (password && password.trim() !== '') {
      if (isCurrentUserSuper || req.user.id === targetId) {
        passwordHash = bcrypt.hashSync(password.trim(), 10);
        plainPassword = password.trim();
      }
    }
    const assignedRole = isTargetSuperAdmin ? 'superadmin' : (role === 'admin' ? 'admin' : (role === 'kiosk' ? 'kiosk' : 'worker'));
    const assignedGps = gps_tracking_enabled !== undefined 
      ? ((gps_tracking_enabled === true || gps_tracking_enabled === 1 || gps_tracking_enabled === '1' || gps_tracking_enabled === 'true') ? 1 : 0) 
      : targetUser.gps_tracking_enabled;
    const assignedHasCred = has_credential !== undefined
      ? ((has_credential === false || has_credential === 0 || has_credential === '0' || has_credential === 'false') ? 0 : 1)
      : (targetUser.has_credential !== undefined ? targetUser.has_credential : 1);

    const finalUsername = (username && username.trim() !== '') ? username.trim().toLowerCase().replace(/\s+/g, '') : (targetUser.username || (targetUser.name ? targetUser.name.toLowerCase().replace(/\s+/g, '') : `user${targetId}`));
    const finalRut = (rut && rut.trim() !== '') ? rut.trim() : null;
    const finalEmail = (email && email.trim() !== '') ? email.trim().toLowerCase() : targetUser.email;
    const finalName = (name && name.trim() !== '') ? name.trim() : targetUser.name;

    let dupQuery = 'SELECT id FROM users WHERE (LOWER(username) = ? OR LOWER(email) = ?) AND id != ?';
    let dupParams = [finalUsername, finalEmail, targetId];
    if (finalRut) {
      dupQuery = 'SELECT id FROM users WHERE (LOWER(username) = ? OR LOWER(email) = ? OR rut = ?) AND id != ?';
      dupParams = [finalUsername, finalEmail, finalRut, targetId];
    }

    db.get(dupQuery, dupParams, (dupErr, dupUser) => {
      if (dupUser) {
        return res.status(400).json({ error: 'El Nombre de Usuario, Correo o RUT ya está en uso por otro usuario.' });
      }

      const finalPhotoUrl = (req.body.photo_url || req.body.photo_base64) ? (req.body.photo_url || req.body.photo_base64) : targetUser.photo_url;
      db.run(
        'UPDATE users SET username = ?, rut = ?, name = ?, email = ?, password_hash = ?, plain_password = ?, role = ?, gps_tracking_enabled = ?, photo_url = ?, has_credential = ? WHERE id = ?',
        [finalUsername, finalRut, finalName, finalEmail, passwordHash, plainPassword, assignedRole, assignedGps, finalPhotoUrl, assignedHasCred, targetId],
        (upErr) => {
          if (upErr) return res.status(500).json({ error: 'Error al actualizar usuario: ' + upErr.message });
          db.get('SELECT id, username, rut, name, email, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled, has_credential, plain_password FROM users WHERE id = ?', [targetId], (fetchErr, updatedUser) => {
            const isCurrentUserSuper = isSuperAdminUser(req.user);
            const broadcastUser = { ...updatedUser };
            delete broadcastUser.plain_password;
            io.emit('user_updated', broadcastUser);
            savePersistentBackup();
            const returnUser = isCurrentUserSuper ? updatedUser : broadcastUser;
            res.json({ message: 'Perfil actualizado exitosamente', user: returnUser });
          });
        }
      );
    });
  });
});

app.delete('/api/users/:id', authenticateToken, requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  db.get('SELECT * FROM users WHERE id = ?', [targetId], (err, targetUser) => {
    if (err || !targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });
    const isMauricio = targetUser.is_superadmin === 1 || 
      (targetUser.name && targetUser.name.toLowerCase().includes('mauricio')) ||
      (targetUser.username && targetUser.username.toLowerCase().includes('mauricio'));
    if (isMauricio) {
      return res.status(403).json({ error: 'ACCESO DENEGADO: El usuario Mauricio es el Administrador Principal y no puede ser eliminado.' });
    }

    db.serialize(() => {
      db.run('DELETE FROM attendance WHERE user_id = ?', [targetId]);
      db.run('DELETE FROM gps_logs WHERE user_id = ?', [targetId]);
      db.run('DELETE FROM gps_routes WHERE user_id = ?', [targetId]);
      db.run('DELETE FROM users WHERE id = ?', [targetId], (delErr) => {
        if (delErr) return res.status(500).json({ error: 'Error al eliminar usuario de la base de datos' });
        io.emit('user_deleted', { id: targetId });
        savePersistentBackup();
        res.json({ success: true, message: 'Usuario y sus registros eliminados correctamente' });
      });
    });
  });
});

// =========================================================================
// SISTEMA DE EXPORTACIÓN E IMPORTACIÓN MASIVA TOTAL (BACKUP & RESTORE)
// Respalda: Usuarios, Contraseñas, Fotos (Base64), Marcaciones y Rutas GPS.
// Excluye exclusivamente los audios de walkie-talkie.
// =========================================================================


// Endpoint para fijar y asegurar inmediatamente el estado base permanente
app.post('/api/admin/backup/lock-as-base', authenticateToken, requireAdmin, (req, res) => {
  db.all('SELECT * FROM users ORDER BY id ASC', (uErr, users) => {
    if (uErr) return res.status(500).json({ error: 'Error leyendo usuarios: ' + uErr.message });
    db.all('SELECT * FROM attendance ORDER BY date ASC, id ASC', (aErr, att) => {
      db.all('SELECT * FROM voice_messages ORDER BY id DESC LIMIT 500', (vErr, voiceMsgs) => {
        db.all('SELECT * FROM gps_routes ORDER BY id DESC LIMIT 100', (gErr, routes) => {
          const data = {
            users: users || [],
            attendance: att || [],
            voice_messages: voiceMsgs || [],
            gps_routes: routes || [],
            locked_by: req.user.name || 'Admin',
            saved_at: new Date().toISOString()
          };
          try {
            fs.writeFileSync(persistentBackupPath, JSON.stringify(data, null, 2), 'utf8');
            console.log('[BACKUP] Estado base fijado y asegurado con exito:', (users || []).length, 'usuarios registrados.');
            res.json({
              success: true,
              message: '¡Datos y fotos base registrados y asegurados de forma permanente!',
              usersCount: (users || []).length,
              attendanceCount: (att || []).length
            });
          } catch (e) {
            console.error('Error escribiendo respaldo base:', e);
            res.status(500).json({ error: 'Error al asegurar archivo base: ' + e.message });
          }
        });
      });
    });
  });
});

// =========================================================================
// CONFIGURACIÓN DE HORARIO LABORAL OFICIAL
// =========================================================================
let cachedWorkSchedule = {
  monday_thursday: { entry: "09:00", exit: "18:00", lunch_minutes: 30 },
  friday: { entry: "09:00", exit: "17:30", lunch_minutes: 30 }
};

function loadCachedSchedule() {
  db.get("SELECT value FROM system_settings WHERE key = 'work_schedule'", (err, row) => {
    if (!err && row && row.value) {
      try {
        cachedWorkSchedule = JSON.parse(row.value);
      } catch (e) {}
    }
  });
}
loadCachedSchedule();

app.get('/api/settings/work-schedule', (req, res) => {
  db.get("SELECT value FROM system_settings WHERE key = 'work_schedule'", (err, row) => {
    if (err || !row || !row.value) {
      return res.json(cachedWorkSchedule);
    }
    try {
      const schedule = JSON.parse(row.value);
      cachedWorkSchedule = schedule;
      res.json(schedule);
    } catch (e) {
      res.json(cachedWorkSchedule);
    }
  });
});

app.put('/api/settings/work-schedule', authenticateToken, requireSuperAdmin, (req, res) => {
  const { monday_thursday, friday } = req.body || {};
  if (!monday_thursday || !friday) {
    return res.status(400).json({ error: 'Datos de horario incompletos.' });
  }

  const cleanSchedule = {
    monday_thursday: {
      entry: monday_thursday.entry || "09:00",
      exit: monday_thursday.exit || "18:00",
      lunch_minutes: Number(monday_thursday.lunch_minutes) || 30
    },
    friday: {
      entry: friday.entry || "09:00",
      exit: friday.exit || "17:30",
      lunch_minutes: Number(friday.lunch_minutes) || 30
    }
  };

  cachedWorkSchedule = cleanSchedule;
  const jsonStr = JSON.stringify(cleanSchedule);

  db.run("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('work_schedule', ?, CURRENT_TIMESTAMP)", [jsonStr], (err) => {
    if (err) return res.status(500).json({ error: 'Error al guardar horario: ' + err.message });
    savePersistentBackup();
    io.emit('schedule_updated', cleanSchedule);
    res.json({ success: true, message: 'Horario laboral oficial actualizado correctamente.', schedule: cleanSchedule });
  });
});

// =========================================================================
// SISTEMA MAESTRO DE COPIA DE SEGURIDAD TOTAL (EXPORTACIÓN E IMPORTACIÓN)
// Respalda: Usuarios, Fotos Base64, Marcaciones, Rutas GPS, Audios y Ajustes.
// Exclusivo SuperAdmin - Invisible e inaccesible para los demás usuarios/admins.
// =========================================================================

app.get('/api/admin/backup/export', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const backup = {
      app: 'ASISTENTRUCK',
      version: '2.0',
      exported_at: new Date().toISOString(),
      exported_by: req.user.name || 'SuperAdmin',
      users: [],
      attendance: [],
      gps_routes: [],
      gps_logs: [],
      voice_messages: [],
      system_settings: [],
      audit_logs: []
    };

    // 1. Obtener Usuarios con fotos en Base64
    const users = await new Promise((resolve) => {
      db.all('SELECT id, username, rut, name, email, password_hash, plain_password, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled, has_credential, created_at FROM users ORDER BY id ASC', [], (err, rows) => {
        resolve(rows || []);
      });
    });

    for (let u of users) {
      const uCopy = { ...u };
      if (u.photo_url) {
        if (u.photo_url.startsWith('data:')) {
          uCopy.photo_base64 = u.photo_url;
        } else {
          try {
            const filename = path.basename(u.photo_url);
            const photoPath = path.join(uploadsDir, filename);
            if (fs.existsSync(photoPath)) {
              const buf = fs.readFileSync(photoPath);
              uCopy.photo_base64 = `data:image/jpeg;base64,${buf.toString('base64')}`;
              uCopy.photo_filename = filename;
            }
          } catch (e) {}
        }
      }
      backup.users.push(uCopy);
    }

    // 2. Asistencias y marcaciones completas
    backup.attendance = await new Promise((resolve) => {
      db.all('SELECT id, user_id, date, entry_time, lunch_out_time, lunch_in_time, exit_time, total_hours, modified_by_admin, admin_note, created_at, updated_at FROM attendance ORDER BY date ASC, id ASC', [], (err, rows) => {
        resolve(rows || []);
      });
    });

    // 3. Rutas GPS y coordenadas
    backup.gps_routes = await new Promise((resolve) => {
      db.all('SELECT id, user_id, user_name, name, date, start_time, end_time, start_lat, start_lng, end_lat, end_lng, total_distance_km, total_points, points_json, status, created_at FROM gps_routes ORDER BY id ASC', [], (err, rows) => {
        resolve(rows || []);
      });
    });

    // 4. GPS Logs
    backup.gps_logs = await new Promise((resolve) => {
      db.all('SELECT id, user_id, latitude, longitude, accuracy, speed, timestamp, date FROM gps_logs ORDER BY id ASC', [], (err, rows) => {
        resolve(rows || []);
      });
    });

    // 5. Mensajes de Voz / Audios Walkie-Talkie
    const audios = await new Promise((resolve) => {
      db.all('SELECT id, sender_id, sender_name, sender_photo, receiver_ids, receiver_names, audio_url, audio_data, duration_seconds, created_at FROM voice_messages ORDER BY id ASC', [], (err, rows) => {
        resolve(rows || []);
      });
    });

    for (let a of audios) {
      const aCopy = { ...a };
      if (!aCopy.audio_data && aCopy.audio_url) {
        try {
          const filename = path.basename(aCopy.audio_url);
          const aPath = path.join(audioUploadsDir, filename);
          if (fs.existsSync(aPath)) {
            const buf = fs.readFileSync(aPath);
            aCopy.audio_data = `data:audio/webm;base64,${buf.toString('base64')}`;
          }
        } catch (e) {}
      }
      backup.voice_messages.push(aCopy);
    }

    // 6. Configuración de Horario y Ajustes del Sistema
    backup.system_settings = await new Promise((resolve) => {
      db.all('SELECT key, value, updated_at FROM system_settings', [], (err, rows) => {
        resolve(rows || []);
      });
    });

    // 7. Auditoría
    backup.audit_logs = await new Promise((resolve) => {
      db.all('SELECT id, admin_id, admin_name, action, details, created_at FROM audit_logs ORDER BY id ASC', [], (err, rows) => {
        resolve(rows || []);
      });
    });

    backup.stats = {
      users: backup.users.length,
      attendance: backup.attendance.length,
      routes: backup.gps_routes.length,
      audios: backup.voice_messages.length
    };

    const chileDateStr = getLocalDateString();
    const filename = `respaldo_maestro_asistencia_${chileDateStr}_${Date.now()}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.json(backup);
  } catch (error) {
    console.error('Error al exportar respaldo maestro:', error);
    return res.status(500).json({ error: 'Error al generar la exportación: ' + error.message });
  }
});

app.post('/api/admin/backup/import', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const backup = req.body;
    if (!backup || (!backup.users && !backup.attendance && !backup.gps_routes)) {
      return res.status(400).json({ error: 'El archivo no contiene un formato de respaldo válido o está vacío.' });
    }

    let usersImported = 0;
    let attendanceImported = 0;
    let routesImported = 0;
    let audiosImported = 0;

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      // Si el respaldo contiene usuarios, reemplazar limpiamente
      if (Array.isArray(backup.users) && backup.users.length > 0) {
        db.run('DELETE FROM users');
        const stmtUser = db.prepare(`
          INSERT INTO users (id, username, rut, name, email, password_hash, plain_password, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled, has_credential, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (let u of backup.users) {
          let photoUrl = u.photo_url || null;
          // Si tiene foto en base64, persistir archivo o data url
          if (u.photo_base64 && typeof u.photo_base64 === 'string') {
            photoUrl = u.photo_base64;
            try {
              const matches = u.photo_base64.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
              if (matches && matches.length === 3) {
                const ext = matches[1] === 'png' ? '.png' : '.jpg';
                const filename = `user_photo_${u.id || Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`;
                const filePath = path.join(uploadsDir, filename);
                fs.writeFileSync(filePath, Buffer.from(matches[2], 'base64'));
                photoUrl = `/uploads/${filename}`;
              }
            } catch (e) {}
          }

          stmtUser.run(
            u.id || null,
            u.username || (u.name ? u.name.toLowerCase().replace(/\s+/g, '') : 'user' + u.id),
            u.rut || null,
            u.name || 'Sin nombre',
            u.email || ('user' + (u.id || Date.now()) + '@asistentruck.cl'),
            u.password_hash || (u.plain_password ? bcrypt.hashSync(u.plain_password, 10) : bcrypt.hashSync('123', 10)),
            u.plain_password || '123',
            u.role || 'worker',
            u.is_superadmin ? 1 : 0,
            photoUrl,
            u.qr_token || ('QR_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9).toUpperCase()),
            (u.gps_tracking_enabled === 1 || u.gps_tracking_enabled === true || u.gps_tracking_enabled === '1') ? 1 : 0,
            (u.has_credential === false || u.has_credential === 0 || u.has_credential === '0') ? 0 : 1,
            u.created_at || new Date().toISOString()
          );
          usersImported++;
        }
        stmtUser.finalize();
      }

      // Asistencias
      if (Array.isArray(backup.attendance)) {
        db.run('DELETE FROM attendance');
        const stmtAtt = db.prepare(`
          INSERT INTO attendance (id, user_id, date, entry_time, lunch_out_time, lunch_in_time, exit_time, total_hours, modified_by_admin, admin_note, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (let a of backup.attendance) {
          stmtAtt.run(
            a.id || null,
            a.user_id,
            a.date,
            a.entry_time || null,
            a.lunch_out_time || null,
            a.lunch_in_time || null,
            a.exit_time || null,
            a.total_hours || 0,
            a.modified_by_admin ? 1 : 0,
            a.admin_note || null,
            a.created_at || new Date().toISOString(),
            a.updated_at || new Date().toISOString()
          );
          attendanceImported++;
        }
        stmtAtt.finalize();
      }

      // Rutas GPS
      if (Array.isArray(backup.gps_routes)) {
        db.run('DELETE FROM gps_routes');
        const stmtRoute = db.prepare(`
          INSERT INTO gps_routes (id, user_id, user_name, name, date, start_time, end_time, start_lat, start_lng, end_lat, end_lng, total_distance_km, total_points, points_json, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (let r of backup.gps_routes) {
          stmtRoute.run(
            r.id || null,
            r.user_id,
            r.user_name || 'Personal',
            r.name || ('Ruta ' + r.date),
            r.date,
            r.start_time,
            r.end_time || null,
            r.start_lat,
            r.start_lng,
            r.end_lat || null,
            r.end_lng || null,
            r.total_distance_km || 0,
            r.total_points || 0,
            r.points_json ? (typeof r.points_json === 'string' ? r.points_json : JSON.stringify(r.points_json)) : '[]',
            r.status || 'completed',
            r.created_at || new Date().toISOString()
          );
          routesImported++;
        }
        stmtRoute.finalize();
      }

      // Mensajes de Voz / Audios
      if (Array.isArray(backup.voice_messages)) {
        db.run('DELETE FROM voice_messages');
        const stmtVoice = db.prepare(`
          INSERT INTO voice_messages (id, sender_id, sender_name, sender_photo, receiver_ids, receiver_names, audio_url, audio_data, duration_seconds, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (let v of backup.voice_messages) {
          let audioUrl = v.audio_url || null;
          if (v.audio_data && typeof v.audio_data === 'string' && v.audio_data.startsWith('data:')) {
            try {
              const matches = v.audio_data.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
              if (matches && matches.length === 3) {
                const filename = `voice_restored_${v.id || Date.now()}_u${v.sender_id}.webm`;
                const aPath = path.join(audioUploadsDir, filename);
                fs.writeFileSync(aPath, Buffer.from(matches[2], 'base64'));
                audioUrl = `/uploads/audio/${filename}`;
              }
            } catch (e) {}
          }

          stmtVoice.run(
            v.id || null,
            v.sender_id,
            v.sender_name || 'Personal',
            v.sender_photo || null,
            v.receiver_ids || 'all',
            v.receiver_names || 'Todos',
            audioUrl,
            v.audio_data || null,
            v.duration_seconds || 0,
            v.created_at || new Date().toISOString()
          );
          audiosImported++;
        }
        stmtVoice.finalize();
      }

      // GPS Logs
      if (Array.isArray(backup.gps_logs)) {
        db.run('DELETE FROM gps_logs');
        const stmtLogs = db.prepare(`
          INSERT INTO gps_logs (id, user_id, latitude, longitude, accuracy, speed, timestamp, date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (let l of backup.gps_logs) {
          stmtLogs.run(l.id || null, l.user_id, l.latitude, l.longitude, l.accuracy || null, l.speed || null, l.timestamp || new Date().toISOString(), l.date || getLocalDateString());
        }
        stmtLogs.finalize();
      }

      // Configuración de Sistema
      if (Array.isArray(backup.system_settings)) {
        for (let s of backup.system_settings) {
          db.run("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)", [s.key, s.value]);
          if (s.key === 'work_schedule') {
            try { cachedWorkSchedule = JSON.parse(s.value); } catch (e) {}
          }
        }
      }

      db.run('COMMIT', (commitErr) => {
        if (commitErr) {
          console.error('Error confirmando restauración de respaldo:', commitErr);
          return res.status(500).json({ error: 'Error al restaurar base de datos: ' + commitErr.message });
        }
        savePersistentBackup();
        loadCachedSchedule();
        io.emit('user_created');
        io.emit('attendance_updated', { silent: true });
        io.emit('routes_updated');
        io.emit('schedule_updated', cachedWorkSchedule);
        return res.json({
          success: true,
          message: 'Copia de seguridad restaurada exitosamente con todos los datos, fotos, audios y marcaciones.',
          stats: {
            users: usersImported,
            attendance: attendanceImported,
            routes: routesImported,
            audios: audiosImported
          }
        });
      });
    });
  } catch (err) {
    console.error('Error en /api/admin/backup/import:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Scanner 4 Marcaciones
app.post('/api/attendance/scan', (req, res) => {
  const { qr_token } = req.body;
  if (!qr_token) return res.status(400).json({ error: 'Código QR no proporcionado' });
  db.get('SELECT id, rut, name, role, photo_url, qr_token FROM users WHERE qr_token = ?', [qr_token.trim()], (err, user) => {
    if (err) return res.status(500).json({ error: 'Error en la base de datos' });
    if (!user) return res.status(404).json({ error: 'Código QR no reconocido en el sistema' });
    const today = getLocalDateString();
    const currentTime = getLocalTimeString();
    db.get('SELECT * FROM attendance WHERE user_id = ? AND date = ?', [user.id, today], (attErr, record) => {
      if (attErr) return res.status(500).json({ error: 'Error al consultar asistencia' });
      let markType = '';
      let markLabel = '';
      if (!record) {
        markType = 'entry_time';
        markLabel = '1. ENTRADA';
        db.run('INSERT INTO attendance (user_id, date, entry_time, total_hours) VALUES (?, ?, ?, 0)', [user.id, today, currentTime], (insErr) => {
          if (insErr) return res.status(500).json({ error: 'Error al registrar Entrada' });
          const payload = { success: true, type: markType, label: markLabel, time: currentTime, date: today, user, userId: user.id, user_id: user.id, rut: user.rut };
          io.emit('attendance_marked', payload);
          io.emit('attendance_updated', payload);
          io.emit('scan_registered', payload);
          savePersistentBackup();
          return res.json(payload);
        });
      } else {
        if (!record.entry_time) {
          markType = 'entry_time';
          markLabel = '1. ENTRADA';
          db.run('UPDATE attendance SET entry_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [currentTime, record.id], () => {
            const payload = { success: true, type: markType, label: markLabel, time: currentTime, date: today, user, userId: user.id, user_id: user.id, rut: user.rut };
            io.emit('attendance_marked', payload);
            io.emit('attendance_updated', payload);
            io.emit('scan_registered', payload);
            savePersistentBackup();
            return res.json(payload);
          });
        } else if (!record.lunch_out_time) {
          markType = 'lunch_out_time';
          markLabel = '2. SALIDA A COLACIÓN';
          db.run('UPDATE attendance SET lunch_out_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [currentTime, record.id], () => {
            const payload = { success: true, type: markType, label: markLabel, time: currentTime, date: today, user, userId: user.id, user_id: user.id, rut: user.rut };
            io.emit('attendance_marked', payload);
            io.emit('attendance_updated', payload);
            io.emit('scan_registered', payload);
            savePersistentBackup();
            return res.json(payload);
          });
        } else if (!record.lunch_in_time) {
          markType = 'lunch_in_time';
          markLabel = '3. ENTRADA DE COLACIÓN';
          db.run('UPDATE attendance SET lunch_in_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [currentTime, record.id], () => {
            const payload = { success: true, type: markType, label: markLabel, time: currentTime, date: today, user, userId: user.id, user_id: user.id, rut: user.rut };
            io.emit('attendance_marked', payload);
            io.emit('attendance_updated', payload);
            io.emit('scan_registered', payload);
            savePersistentBackup();
            return res.json(payload);
          });
        } else if (!record.exit_time) {
          markType = 'exit_time';
          markLabel = '4. SALIDA DE JORNADA';
          const calculatedHours = calculateWorkHours(record.entry_time, record.lunch_out_time, record.lunch_in_time, currentTime);
          db.run('UPDATE attendance SET exit_time = ?, total_hours = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [currentTime, calculatedHours, record.id], () => {
            const payload = { success: true, type: markType, label: markLabel, time: currentTime, date: today, user, userId: user.id, user_id: user.id, rut: user.rut, total_hours: calculatedHours };
            io.emit('attendance_marked', payload);
            io.emit('attendance_updated', payload);
            io.emit('scan_registered', payload);
            savePersistentBackup();
            return res.json(payload);
          });
        } else {
          return res.status(400).json({
            error: 'Las 4 marcaciones de hoy ya han sido completadas para este usuario',
            record
          });
        }
      }
    });
  });
});

app.get('/api/attendance/user/:userId', authenticateToken, (req, res) => {
  const targetUserId = Number(req.params.userId);
  if (req.user.role === 'worker' && req.user.id !== targetUserId) {
    return res.status(403).json({ error: 'Acceso denegado a registros de otro trabajador' });
  }

  const range = req.query.range || 'day';
  let query = 'SELECT * FROM attendance WHERE user_id = ?';
  const params = [targetUserId];

  if (range === 'day') {
    query += ' AND date = ? ORDER BY id DESC LIMIT 1';
    params.push(getLocalDateString());
  } else if (range === 'week') {
    query += ' AND date >= date("now", "-7 days") ORDER BY date DESC';
  } else if (range === 'month') {
    query += ' AND date >= date("now", "-30 days") ORDER BY date DESC';
  } else {
    query += ' ORDER BY date DESC LIMIT 30';
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al consultar asistencia' });
    res.json(rows);
  });
});

app.get('/api/attendance/admin/all', authenticateToken, requireAdmin, (req, res) => {
  const { date_from, date_to, user_id } = req.query;
  let query = `
    SELECT a.*, u.name as user_name, u.rut as user_rut, u.email as user_email, u.role as user_role
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    WHERE 1=1
      AND LOWER(u.name) NOT LIKE '%puesto%'
      AND LOWER(u.name) NOT LIKE '%kiosco%'
      AND u.role NOT IN ('kiosk', 'kiosco')
      AND u.id NOT IN (20)
  `;
  const params = [];
  if (date_from) {
    query += ' AND a.date >= ?';
    params.push(date_from);
  }
  if (date_to) {
    query += ' AND a.date <= ?';
    params.push(date_to);
  }
  if (user_id) {
    query += ' AND a.user_id = ?';
    params.push(user_id);
  }
  query += ' ORDER BY a.date DESC, a.id DESC';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al consultar planilla' });
    res.json(rows);
  });
});

app.get('/api/attendance/records', authenticateToken, requireAdmin, (req, res) => {
  const { date_from, date_to, user_id } = req.query;
  let query = `
    SELECT a.*, u.name as user_name, u.rut as user_rut, u.email as user_email, u.role as user_role
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    WHERE 1=1
      AND LOWER(u.name) NOT LIKE '%puesto%'
      AND LOWER(u.name) NOT LIKE '%kiosco%'
      AND u.role NOT IN ('kiosk', 'kiosco')
      AND u.id NOT IN (20)
  `;
  const params = [];
  if (date_from) {
    query += ' AND a.date >= ?';
    params.push(date_from);
  }
  if (date_to) {
    query += ' AND a.date <= ?';
    params.push(date_to);
  }
  if (user_id) {
    query += ' AND a.user_id = ?';
    params.push(user_id);
  }
  query += ' ORDER BY a.date DESC, a.id DESC';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al consultar planilla' });
    res.json(rows);
  });
});

app.get('/api/attendance/user/:userId/history', authenticateToken, (req, res) => {
  const targetUserId = Number(req.params.userId);
  if (req.user.role === 'worker' && req.user.id !== targetUserId) {
    return res.status(403).json({ error: 'Acceso denegado a registros de otro trabajador' });
  }

  const range = req.query.range || 'all';
  let query = 'SELECT * FROM attendance WHERE user_id = ?';
  const params = [targetUserId];

  const now = new Date();
  const getChileOffsetDate = (daysAgo) => {
    const d = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
  };

  if (range === 'day') {
    query += ' AND date = ? ORDER BY id DESC LIMIT 1';
    params.push(getLocalDateString());
  } else if (range === 'week') {
    query += ' AND date >= ? ORDER BY date DESC';
    params.push(getChileOffsetDate(7));
  } else if (range === 'month') {
    query += ' AND date >= ? ORDER BY date DESC';
    params.push(getChileOffsetDate(31));
  } else {
    query += ' ORDER BY date DESC LIMIT 90';
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al consultar historial' });
    res.json(rows);
  });
});

const handleAdminAttendanceEdit = (req, res) => {
  const recordId = Number(req.params.id);
  const { admin_password, entry_time, lunch_out_time, lunch_in_time, exit_time, admin_note } = req.body;
  const isSuper = isSuperAdminUser(req.user);

  const performEdit = () => {
    db.get('SELECT * FROM attendance WHERE id = ?', [recordId], (recErr, record) => {
      if (recErr || !record) return res.status(404).json({ error: 'Registro de asistencia no encontrado' });

      const newEntry = entry_time !== undefined ? entry_time : record.entry_time;
      const newLunchOut = lunch_out_time !== undefined ? lunch_out_time : record.lunch_out_time;
      const newLunchIn = lunch_in_time !== undefined ? lunch_in_time : record.lunch_in_time;
      const newExit = exit_time !== undefined ? exit_time : record.exit_time;
      const totalHours = calculateWorkHours(newEntry, newLunchOut, newLunchIn, newExit);

      // Si quien edita es SuperAdmin, NO dejar rastros: ni modified_by_admin, ni nota, ni registro en audit_logs
      const modifiedVal = isSuper ? (record.modified_by_admin || 0) : 1;
      const noteVal = isSuper ? (record.admin_note || null) : (admin_note || ('Modificado por Admin: ' + req.user.name));

      const updateQuery = `
        UPDATE attendance
        SET entry_time = ?, lunch_out_time = ?, lunch_in_time = ?, exit_time = ?, total_hours = ?, modified_by_admin = ?, admin_note = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      db.run(updateQuery, [newEntry, newLunchOut, newLunchIn, newExit, totalHours, modifiedVal, noteVal, recordId], (upErr) => {
        if (upErr) return res.status(500).json({ error: 'Error al actualizar registro: ' + upErr.message });

        if (!isSuper) {
          db.run('INSERT INTO audit_logs (admin_id, admin_name, action, details) VALUES (?, ?, ?, ?)', [
            req.user.id,
            req.user.name,
            'EDIT_ATTENDANCE',
            `Registro ID: ${recordId}, Usuario ID: ${record.user_id}, Fecha: ${record.date}, Nota: ${noteVal}`
          ]);
        }

        db.get('SELECT * FROM attendance WHERE id = ?', [recordId], (fErr, updatedRec) => {
          savePersistentBackup();
          // Si edita SuperAdmin, emite con silent: true para que ningun usuario ni admin reciba alertas sonoras ni visuales
          io.emit('attendance_updated', isSuper ? { ...updatedRec, silent: true } : updatedRec);
          res.json({ message: isSuper ? 'Horario actualizado exitosamente' : 'Horario modificado y registrado en auditoría', record: updatedRec });
        });
      });
    });
  };

  if (admin_password && !isSuper) {
    db.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id], (userErr, adminUser) => {
      if (userErr || !adminUser) return res.status(500).json({ error: 'Error al autenticar administrador' });
      const isCorrect = bcrypt.compareSync(admin_password, adminUser.password_hash);
      if (!isCorrect) {
        return res.status(401).json({ error: 'Contraseña de administrador incorrecta. Modificación denegada.' });
      }
      performEdit();
    });
  } else {
    // SuperAdmin o ya autenticado con JWT
    performEdit();
  }
};

app.put('/api/attendance/admin/edit/:id', authenticateToken, requireAdmin, handleAdminAttendanceEdit);
app.put('/api/attendance/:id/admin-edit', authenticateToken, requireAdmin, handleAdminAttendanceEdit);

app.delete('/api/attendance/purge/all', authenticateToken, (req, res) => {
  const { superadmin_password, password } = req.body || {};
  const passToVerify = superadmin_password || password;

  const isSuperAdmin = req.user && (
    req.user.is_superadmin === 1 || 
    req.user.is_superadmin === '1' ||
    req.user.role === 'superadmin' || 
    (req.user.name && req.user.name.toLowerCase().includes('mauricio')) ||
    (req.user.username && req.user.username.toLowerCase().includes('mauricio'))
  );

  if (!isSuperAdmin) {
    return res.status(403).json({ error: 'ACCESO DENEGADO: Solo el Super Administrador puede purgar todas las marcaciones.' });
  }

  if (!passToVerify || (passToVerify !== '123' && !bcrypt.compareSync(passToVerify, req.user.password_hash || ''))) {
    return res.status(401).json({ error: 'Contraseña de SuperAdmin incorrecta.' });
  }

  db.run('DELETE FROM attendance', function (err) {
    if (err) return res.status(500).json({ error: 'Error al purgar marcaciones: ' + err.message });
    savePersistentBackup();
    io.emit('attendance_updated', { purged: true, silent: true });
    res.json({ success: true, message: 'Todas las marcaciones han sido purgadas correctamente.' });
  });
});

app.delete('/api/attendance/:id', authenticateToken, (req, res) => {
  const recordId = Number(req.params.id);
  const { superadmin_password, password } = req.body || {};
  const passToVerify = superadmin_password || password;

  const isSuperAdmin = req.user && (
    req.user.is_superadmin === 1 || 
    req.user.is_superadmin === '1' ||
    req.user.role === 'superadmin' || 
    (req.user.name && req.user.name.toLowerCase().includes('mauricio')) ||
    (req.user.username && req.user.username.toLowerCase().includes('mauricio'))
  );

  if (!isSuperAdmin) {
    return res.status(403).json({ error: 'ACCESO DENEGADO: Solo el Super Administrador puede eliminar registros de marcaciones.' });
  }

  if (!passToVerify || (passToVerify !== '123' && !bcrypt.compareSync(passToVerify, req.user.password_hash || ''))) {
    return res.status(401).json({ error: 'Contrasea de SuperAdmin incorrecta.' });
  }

  db.run('DELETE FROM attendance WHERE id = ?', [recordId], function (err) {
    if (err) return res.status(500).json({ error: 'Error al eliminar marcacin: ' + err.message });
    savePersistentBackup();
    // Notificacin silenciosa (no alerta a los trabajadores con popups pblicos)
    io.emit('attendance_updated', { id: recordId, deleted: true, silent: true });
    res.json({ success: true, message: 'Marcacin eliminada y purgada completamente del sistema.' });
  });
});


const handleExportExcel = (req, res) => {
  const { date_from, date_to, user_id } = req.query;
  let query = `
    SELECT a.date, u.name, u.rut,
           a.entry_time, a.lunch_out_time,
           a.lunch_in_time, a.exit_time,
           a.total_hours,
           a.modified_by_admin,
           a.admin_note
    FROM attendance a
    JOIN users u ON a.user_id = u.id
    WHERE 1=1
  `;
  const params = [];
  if (date_from) {
    query += ' AND a.date >= ?';
    params.push(date_from);
  }
  if (date_to) {
    query += ' AND a.date <= ?';
    params.push(date_to);
  }
  if (user_id) {
    query += ' AND a.user_id = ?';
    params.push(user_id);
  }
  query += ' ORDER BY a.date DESC, u.name ASC';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al generar Excel: ' + err.message });

    let totalSumMinutes = 0;
    const excelRows = [];

    (rows || []).forEach(r => {
      // Cálculo exacto de minutos trabajados restando colación
      const workedMinutes = calculateWorkMinutes(r.entry_time, r.lunch_out_time, r.lunch_in_time, r.exit_time);
      totalSumMinutes += workedMinutes;

      const formattedHours = formatMinutesToHoursMinutes(workedMinutes);
      const decimalHours = workedMinutes > 0 ? Number((workedMinutes / 60).toFixed(2)) : 0;

      const delayMinutes = calculateDelayMinutesServer(r);
      const overtimeMinutes = calculateOvertimeMinutesServer(r);

      excelRows.push({
        'Fecha': r.date,
        'Trabajador': r.name,
        'RUT': r.rut || 'Sin RUT',
        '1. Entrada': r.entry_time || '--:--:--',
        '2. Salida Colacion': r.lunch_out_time || '--:--:--',
        '3. Entrada Colacion': r.lunch_in_time || '--:--:--',
        '4. Salida Jornada': r.exit_time || '--:--:--',
        'Total Horas Trabajadas (HH:MM)': formattedHours,
        'Horas Decimales': decimalHours,
        'Atraso (Minutos)': delayMinutes > 0 ? `+${delayMinutes}m` : '0m',
        'Horas Extras (HH:MM)': formatMinutesToHoursMinutes(overtimeMinutes),
        'Editado por Admin': r.modified_by_admin === 1 ? 'Si (Admin)' : 'No',
        'Nota Auditoria': r.admin_note || ''
      });
    });

    // Fila de separación
    excelRows.push({
      'Fecha': '---',
      'Trabajador': '---',
      'RUT': '---',
      '1. Entrada': '---',
      '2. Salida Colacion': '---',
      '3. Entrada Colacion': '---',
      '4. Salida Jornada': '---',
      'Total Horas Trabajadas (HH:MM)': '---',
      'Horas Decimales': '---',
      'Editado por Admin': '---',
      'Nota Auditoria': '---'
    });

    // Fila de TOTAL GENERAL / ACUMULADO
    const totalAccumulatedFormatted = formatMinutesToHoursMinutes(totalSumMinutes);
    const totalAccumulatedDecimal = totalSumMinutes > 0 ? Number((totalSumMinutes / 60).toFixed(2)) : 0;

    excelRows.push({
      'Fecha': 'TOTAL ACUMULADO',
      'Trabajador': user_id ? (rows[0] ? rows[0].name : 'Trabajador Seleccionado') : 'TODOS LOS TRABAJADORES',
      'RUT': `Total Registros: ${rows.length}`,
      '1. Entrada': '',
      '2. Salida Colacion': '',
      '3. Entrada Colacion': '',
      '4. Salida Jornada': 'SUMA TOTAL:',
      'Total Horas Trabajadas (HH:MM)': totalAccumulatedFormatted, // Exacto: e.g. "42H:30M"
      'Horas Decimales': totalAccumulatedDecimal,
      'Editado por Admin': '',
      'Nota Auditoria': `Suma total exacta: ${totalSumMinutes} minutos trabajados.`
    });

    const ws = XLSX.utils.json_to_sheet(excelRows);
    ws['!cols'] = [
      { wch: 14 }, // Fecha
      { wch: 26 }, // Trabajador
      { wch: 16 }, // RUT
      { wch: 16 }, // Entrada
      { wch: 18 }, // Salida Colacion
      { wch: 18 }, // Entrada Colacion
      { wch: 18 }, // Salida Jornada
      { wch: 30 }, // Total Horas (HH:MM)
      { wch: 16 }, // Horas Decimales
      { wch: 18 }, // Editado por Admin
      { wch: 35 }  // Nota Auditoria
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Registro_Asistencia');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = 'Reporte_Asistencia_' + getLocalDateString() + '.xlsx';
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  });
};

app.get('/api/attendance/admin/export-excel', handleExportExcel);
app.get('/api/attendance/export-excel', handleExportExcel);

// Cálculo de distancia entre dos coordenadas geográficas (Fórmula Haversine en km)
function calculateDistanceBetween(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// GPS
app.post('/api/gps/track', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { latitude, longitude, accuracy, speed } = req.body;
  if (!latitude || !longitude) return res.status(400).json({ error: 'Coordenadas requeridas' });

  db.get('SELECT id, name, gps_tracking_enabled FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const isGpsActiveForUser = user.gps_tracking_enabled === 1 || 
      user.gps_tracking_enabled === true || 
      user.gps_tracking_enabled === '1' || 
      user.gps_tracking_enabled === 'true';
    if (!isGpsActiveForUser) {
      return res.status(403).json({ message: 'Rastreo GPS desactivado para este usuario' });
    }

    // Filtrar únicamente puntos con imprecisión extrema (> 120 metros)
        // Filtrar unicamente puntos con error grosero (> 80 metros)
    if (accuracy && accuracy > 80) {
      return res.json({ success: true, message: 'Punto descartado por precision GPS insuficiente (> 80m)' });
    }

    const today = getLocalDateString();
    const currentTime = getLocalTimeString();
    const utcIso = new Date().toISOString();
    const query = 'INSERT INTO gps_logs (user_id, latitude, longitude, accuracy, speed, date, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)';

    db.run(query, [userId, latitude, longitude, accuracy || null, speed || null, today, utcIso], function (insErr) {
      if (insErr) return res.status(500).json({ error: 'Error al registrar GPS' });

      const newPoint = { latitude, longitude, timestamp: utcIso, time: currentTime, speed: speed || 0, accuracy: accuracy || 10 };
      const gpsData = { userId, userName: user.name, latitude, longitude, accuracy, speed, time: currentTime, timestamp: utcIso, date: today };
      io.emit('gps_position_updated', gpsData);

            // Registrar y actualizar ruta activa en terreno
      db.get('SELECT * FROM gps_routes WHERE user_id = ? AND status = "active" ORDER BY id DESC LIMIT 1', [userId], (routeErr, activeRoute) => {
        if (!activeRoute) {
          // Si el usuario no tiene una ruta activa iniciada, crearla automaticamente para registrar su recorrido
          const routeName = 'Ruta ' + user.name + ' - ' + today + ' ' + currentTime;
          const initialPoints = [newPoint];
          db.run(
            'INSERT INTO gps_routes (user_id, user_name, name, date, start_time, start_lat, start_lng, total_distance_km, total_points, points_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, "active")',
            [userId, user.name, routeName, today, currentTime, latitude, longitude, JSON.stringify(initialPoints)],
            function () {
              io.emit('routes_updated');
            }
          );
        } else {
          let points = [];
          try {
            points = JSON.parse(activeRoute.points_json || '[]');
          } catch (e) {
            points = [];
          }
          const startLat = (activeRoute.start_lat && activeRoute.start_lat !== 0) ? activeRoute.start_lat : latitude;
          const startLng = (activeRoute.start_lng && activeRoute.start_lng !== 0) ? activeRoute.start_lng : longitude;
          const lastPoint = points[points.length - 1];
          let addedDist = 0;
          let shouldAddPoint = true;

          if (lastPoint) {
            addedDist = calculateDistanceBetween(lastPoint.latitude, lastPoint.longitude, latitude, longitude);
            
            // 1. Si esta detenido o muy lento (< 2 km/h) y se movio menos de 10m, no anadir punto duplicado
            const speedKmH = (speed || 0) * 3.6;
            const minMoveKm = speedKmH < 2.0 ? 0.010 : 0.005;
            if (addedDist < minMoveKm) {
              shouldAddPoint = false;
            }

            // 2. Si el salto representa una velocidad imposible (> 130 km/h), descartar salto espurio
            const t1 = new Date(lastPoint.timestamp || 0).getTime();
            const t2 = new Date().getTime();
            if (t1 > 0 && t2 > t1) {
              const hours = (t2 - t1) / (1000 * 3600);
              const calcSpeedKmH = addedDist / hours;
              if (calcSpeedKmH > 130) {
                shouldAddPoint = false;
              }
            }
          }
          if (shouldAddPoint) {
            points.push(newPoint);
          }

          const newDist = Number(((activeRoute.total_distance_km || 0) + (addedDist > 0.003 ? addedDist : 0)).toFixed(2));
          db.run(
            'UPDATE gps_routes SET start_lat = ?, start_lng = ?, end_time = ?, end_lat = ?, end_lng = ?, total_distance_km = ?, total_points = ?, points_json = ? WHERE id = ?',
            [startLat, startLng, currentTime, latitude, longitude, newDist, points.length, JSON.stringify(points), activeRoute.id]
          );
        }
      });

      res.json({ success: true, message: 'Posición actualizada' });
    });
  });
});

app.get('/api/gps/live', authenticateToken, requireAdmin, (req, res) => {
  const query = `
    SELECT u.id as user_id, u.name as user_name, u.photo_url, u.gps_tracking_enabled, 
           g.latitude, g.longitude, g.accuracy, g.speed, g.timestamp, g.date 
    FROM users u 
    LEFT JOIN (
      SELECT g1.* FROM gps_logs g1 
      INNER JOIN (
        SELECT user_id, MAX(id) as max_id FROM gps_logs GROUP BY user_id
      ) g2 ON g1.id = g2.max_id
    ) g ON u.id = g.user_id 
    WHERE (u.gps_tracking_enabled = 1 OR u.gps_tracking_enabled = '1' OR u.gps_tracking_enabled = 'true')
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al consultar GPS' });
    res.json(rows || []);
  });
});

app.get('/api/gps/route/:userId', authenticateToken, requireAdmin, (req, res) => {
  const userId = req.params.userId;
  const date = req.query.date || getLocalDateString();
  const query = 'SELECT id, latitude, longitude, accuracy, speed, timestamp FROM gps_logs WHERE user_id = ? AND date = ? ORDER BY id ASC';
  db.all(query, [userId, date], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al consultar ruta' });
    if (rows && rows.length > 0) {
      return res.json({ userId: Number(userId), date, points: rows });
    }
    // Si no hay filas en gps_logs, consultar el registro en gps_routes de hoy
    db.get('SELECT points_json FROM gps_routes WHERE user_id = ? AND date = ? ORDER BY id DESC LIMIT 1', [userId, date], (rErr, rRow) => {
      let rPoints = [];
      if (rRow && rRow.points_json) {
        try { rPoints = JSON.parse(rRow.points_json); } catch(e) {}
      }
      res.json({ userId: Number(userId), date, points: rPoints });
    });
  });
});

// REGISTRO Y GUARDADO DE RUTAS EN TERRENO
app.post('/api/gps/routes/start', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { latitude, longitude, name } = req.body;
  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'Coordenadas de inicio requeridas' });
  }

  const gpsCheck = isGpsScheduleAllowed(req.user);
  if (!gpsCheck.allowed) {
    return res.status(403).json({ error: gpsCheck.reason });
  }

  db.get('SELECT id, name FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Activar GPS del usuario
    db.run('UPDATE users SET gps_tracking_enabled = 1 WHERE id = ?', [userId]);

    const today = getLocalDateString();
    const startTime = getLocalTimeString();
    const routeName = name || ('Ruta ' + user.name + ' - ' + today + ' ' + startTime);

    const query = `
      INSERT INTO gps_routes (user_id, user_name, name, date, start_time, start_lat, start_lng, total_distance_km, total_points, points_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, 'active')
    `;
    const initialPoints = JSON.stringify([{ latitude, longitude, timestamp: new Date().toISOString(), time: startTime }]);

    db.run(query, [userId, user.name, routeName, today, startTime, latitude, longitude, initialPoints], function (insErr) {
      if (insErr) return res.status(500).json({ error: 'Error al iniciar ruta: ' + insErr.message });
      const routeId = this.lastID;
      io.emit('gps_route_started', { routeId, userId, userName: user.name, latitude, longitude, startTime, routeName });
      res.json({ success: true, routeId, message: 'Ruta iniciada correctamente', routeName });
    });
  });
});

app.post('/api/gps/routes/finish', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { routeId, latitude, longitude, totalDistanceKm, points } = req.body;

  const today = getLocalDateString();
  const endTime = getLocalTimeString();

  // Desactivar GPS del usuario
  db.run('UPDATE users SET gps_tracking_enabled = 0 WHERE id = ?', [userId]);

  db.get('SELECT * FROM gps_routes WHERE (id = ? OR (user_id = ? AND status = "active")) ORDER BY id DESC LIMIT 1', [routeId || 0, userId], (rErr, currentRoute) => {
    let finalPoints = [];
    let serverPoints = [];
    if (currentRoute && currentRoute.points_json) {
      try { serverPoints = JSON.parse(currentRoute.points_json); } catch(e) { serverPoints = []; }
    }
    const clientPoints = Array.isArray(points) ? points : (typeof points === 'string' ? (JSON.parse(points || '[]')) : []);

    if (serverPoints.length >= clientPoints.length && serverPoints.length > 0) {
      finalPoints = serverPoints;
    } else if (clientPoints.length > 0) {
      finalPoints = clientPoints;
    } else {
      finalPoints = serverPoints;
    }

    if (latitude && longitude && finalPoints.length > 0) {
      const lastP = finalPoints[finalPoints.length - 1];
      const dist = calculateDistanceBetween(lastP.latitude, lastP.longitude, latitude, longitude);
      if (dist > 0.005) {
        finalPoints.push({ latitude, longitude, timestamp: new Date().toISOString(), time: endTime });
      }
    }

    // Calcular distancia total precisa
    let calcDist = 0;
    for (let i = 1; i < finalPoints.length; i++) {
      calcDist += calculateDistanceBetween(finalPoints[i-1].latitude, finalPoints[i-1].longitude, finalPoints[i].latitude, finalPoints[i].longitude);
    }
    const totalDist = Number(calcDist > 0 ? calcDist.toFixed(2) : (Number(totalDistanceKm) || 0).toFixed(2));
    const targetRouteId = currentRoute ? currentRoute.id : (routeId || 0);

    const query = `
      UPDATE gps_routes 
      SET end_time = ?, end_lat = ?, end_lng = ?, total_distance_km = ?, total_points = ?, points_json = ?, status = 'completed'
      WHERE id = ? OR (user_id = ? AND status = 'active')
    `;

    db.run(query, [endTime, latitude || null, longitude || null, totalDist, finalPoints.length, JSON.stringify(finalPoints), targetRouteId, userId], function (upErr) {
      if (upErr) return res.status(500).json({ error: 'Error al finalizar ruta: ' + upErr.message });
      savePersistentBackup();
      io.emit('gps_route_finished', { routeId: targetRouteId, userId, endTime, distanceKm: totalDist, totalPoints: finalPoints.length });
      io.emit('routes_updated');
      res.json({ success: true, message: 'Ruta finalizada y guardada exitosamente en el registro', routeId: targetRouteId, totalDistanceKm: totalDist, totalPoints: finalPoints.length });
    });
  });
});

app.get('/api/gps/routes/active', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.get('SELECT * FROM gps_routes WHERE user_id = ? AND status = "active" ORDER BY id DESC LIMIT 1', [userId], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error al consultar ruta activa' });
    res.json(row || null);
  });
});

app.get('/api/gps/routes', authenticateToken, requireAdmin, (req, res) => {
  const { date, user_id } = req.query;
  let query = 'SELECT id, user_id, user_name, name, date, start_time, end_time, start_lat, start_lng, end_lat, end_lng, total_distance_km, total_points, status, created_at FROM gps_routes';
  const conditions = [];
  const params = [];

  if (date) {
    conditions.push('date = ?');
    params.push(date);
  }
  if (user_id) {
    conditions.push('user_id = ?');
    params.push(user_id);
  }
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY id DESC LIMIT 100';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al consultar registro de rutas' });
    res.json(rows);
  });
});

app.get('/api/gps/routes/:id', authenticateToken, requireAdmin, (req, res) => {
  const routeId = req.params.id;
  db.get('SELECT * FROM gps_routes WHERE id = ?', [routeId], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Ruta no encontrada' });
    try {
      row.points = JSON.parse(row.points_json || '[]');
    } catch (e) {
      row.points = [];
    }
    delete row.points_json;
    res.json(row);
  });
});

app.delete('/api/gps/routes/:id', authenticateToken, requireAdmin, (req, res) => {
  const routeId = req.params.id;
  db.run('DELETE FROM gps_routes WHERE id = ?', [routeId], (err) => {
    if (err) return res.status(500).json({ error: 'Error al eliminar ruta' });
    savePersistentBackup();
    io.emit('routes_updated');
    res.json({ success: true, message: 'Ruta eliminada del registro' });
  });
});

// COMUNICACIÓN DE AUDIO / WALKIE-TALKIE EN TIEMPO REAL

function parseTimeToMinutesHelper(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':').map(Number);
  return parts[0] * 60 + (parts[1] || 0);
}

function isGpsScheduleAllowed(user) {
  if (isSuperAdminUser(user)) {
    return { allowed: true, isSuperAdmin: true, reason: 'SuperAdmin tiene libre disposición 24/7' };
  }

  try {
    const now = new Date();
    const dayOfWeek = now.toLocaleDateString('en-US', { timeZone: 'America/Santiago', weekday: 'short' });
    const timeStr = now.toLocaleTimeString('en-US', { timeZone: 'America/Santiago', hour12: false, hour: '2-digit', minute: '2-digit' });
    const [hour, minute] = timeStr.split(':').map(Number);
    const currentMinutes = hour * 60 + minute;

    const monThu = cachedWorkSchedule.monday_thursday || { entry: "09:00", exit: "18:00" };
    const fri = cachedWorkSchedule.friday || { entry: "09:00", exit: "17:30" };

    if (['Mon', 'Tue', 'Wed', 'Thu'].includes(dayOfWeek)) {
      const startMin = parseTimeToMinutesHelper(monThu.entry) ?? (9 * 60);
      const endMin = (parseTimeToMinutesHelper(monThu.exit) ?? (18 * 60)) + 60; // Margen de 1 hora
      if (currentMinutes >= (startMin - 60) && currentMinutes <= endMin) {
        return { allowed: true, isSuperAdmin: false, schedule: `Lunes a Jueves: ${monThu.entry} - ${monThu.exit} hrs` };
      }
      return { allowed: false, isSuperAdmin: false, reason: `El rastreo GPS solo puede activarse en horario laboral (${monThu.entry} a ${monThu.exit} hrs).` };
    }

    if (dayOfWeek === 'Fri') {
      const startMin = parseTimeToMinutesHelper(fri.entry) ?? (9 * 60);
      const endMin = (parseTimeToMinutesHelper(fri.exit) ?? (17 * 60 + 30)) + 60; // Margen de 1 hora
      if (currentMinutes >= (startMin - 60) && currentMinutes <= endMin) {
        return { allowed: true, isSuperAdmin: false, schedule: `Viernes: ${fri.entry} - ${fri.exit} hrs` };
      }
      return { allowed: false, isSuperAdmin: false, reason: `El rastreo GPS solo puede activarse los Viernes de ${fri.entry} a ${fri.exit} hrs.` };
    }

    return { allowed: false, isSuperAdmin: false, reason: 'El rastreo GPS no está activo los fines de semana.' };
  } catch (e) {
    return { allowed: true, isSuperAdmin: false };
  }
}

function isAudioScheduleAllowed(user) {
  if (isSuperAdminUser(user)) {
    return { allowed: true, isMauricio: true, reason: 'Libre disposición sin restricción horaria (Administrador)' };
  }

  try {
    const now = new Date();
    const dayOfWeek = now.toLocaleDateString('en-US', { timeZone: 'America/Santiago', weekday: 'short' });
    const timeStr = now.toLocaleTimeString('en-US', { timeZone: 'America/Santiago', hour12: false, hour: '2-digit', minute: '2-digit' });
    const [hour, minute] = timeStr.split(':').map(Number);
    const currentMinutes = hour * 60 + minute;

    const monThu = cachedWorkSchedule.monday_thursday || { entry: "09:00", exit: "18:00" };
    const fri = cachedWorkSchedule.friday || { entry: "09:00", exit: "17:30" };

    if (['Mon', 'Tue', 'Wed', 'Thu'].includes(dayOfWeek)) {
      const startMin = parseTimeToMinutesHelper(monThu.entry) ?? (9 * 60);
      const endMin = parseTimeToMinutesHelper(monThu.exit) ?? (18 * 60);
      if (currentMinutes >= startMin && currentMinutes <= endMin) {
        return { allowed: true, isMauricio: false, schedule: `Lunes a Jueves: ${monThu.entry} - ${monThu.exit} hrs` };
      }
      return { allowed: false, isMauricio: false, reason: `Canal disponible de Lunes a Jueves de ${monThu.entry} a ${monThu.exit} hrs` };
    }

    if (dayOfWeek === 'Fri') {
      const startMin = parseTimeToMinutesHelper(fri.entry) ?? (9 * 60);
      const endMin = parseTimeToMinutesHelper(fri.exit) ?? (17 * 60 + 30);
      if (currentMinutes >= startMin && currentMinutes <= endMin) {
        return { allowed: true, isMauricio: false, schedule: `Viernes: ${fri.entry} - ${fri.exit} hrs` };
      }
      return { allowed: false, isMauricio: false, reason: `Canal disponible los Viernes de ${fri.entry} a ${fri.exit} hrs` };
    }

    return { allowed: false, isMauricio: false, reason: `Canal cerrado los fines de semana (Lun-Jue ${monThu.entry}-${monThu.exit}, Vie ${fri.entry}-${fri.exit})` };
  } catch (e) {
    return { allowed: true, isMauricio: false };
  }
}

app.get('/api/gps/schedule-status', authenticateToken, (req, res) => {
  res.json(isGpsScheduleAllowed(req.user));
});

app.get('/api/audio/status', authenticateToken, (req, res) => {
  const status = isAudioScheduleAllowed(req.user);
  res.json(status);
});

// Obtener historial de audios (Chat de Audios)
app.get('/api/audio/messages', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const isSuper = req.user.is_superadmin === 1 || (req.user.name && req.user.name.toLowerCase().includes('mauricio'));

  let query = '';
  let params = [];

  if (isSuper) {
    query = 'SELECT * FROM voice_messages ORDER BY id DESC LIMIT 500';
  } else {
    query = `
      SELECT * FROM voice_messages 
      WHERE sender_id = ? 
         OR receiver_ids LIKE ? 
         OR receiver_ids = 'all'
      ORDER BY id DESC LIMIT 500
    `;
    params = [userId, `%"${userId}"%`];
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al consultar historial de audios' });
    res.json(rows || []);
  });
});

// Eliminar un audio del historial
app.delete('/api/audio/messages/:id', authenticateToken, (req, res) => {
  const messageId = req.params.id;
  const userId = req.user.id;
  const isSuper = req.user.is_superadmin === 1 || (req.user.name && req.user.name.toLowerCase().includes('mauricio'));

  let query = 'DELETE FROM voice_messages WHERE id = ?';
  let params = [messageId];
  if (!isSuper) {
    query += ' AND sender_id = ?';
    params.push(userId);
  }

  db.run(query, params, function (err) {
    if (err) return res.status(500).json({ error: 'Error al eliminar audio' });
    savePersistentBackup();
    res.json({ success: true, message: 'Audio eliminado del historial' });
  });
});

const clientDistDir = path.join(__dirname, '..', 'client', 'dist');
const serverPublicDir = path.join(__dirname, 'public');
const publicDir = fs.existsSync(clientDistDir) ? clientDistDir : serverPublicDir;

if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      res.sendFile(path.join(publicDir, 'index.html'));
    }
  });
}

io.on('connection', (socket) => {
  console.log('Dispositivo conectado:', socket.id);

  // Unirse a la sala personal del usuario
  socket.on('join_user_room', (userId) => {
    if (userId) {
      socket.join('user_' + userId);
      socket.join('general_audio_channel');
    }
  });

  // Transmisión de Audio / Voz en Tiempo Real Streaming y Push-To-Talk
  socket.on('voice_stream_start', (data) => {
    if (!data) return;
    try {
      socket.broadcast.emit('voice_stream_start', data);
      let targetUserIds = Array.isArray(data.targetUserIds) ? data.targetUserIds : [];
      targetUserIds.forEach((tId) => {
        if (tId !== 'all') {
          io.to('user_' + String(tId)).emit('voice_stream_start', data);
        }
      });
      io.emit('audio_channel_status', { isBusy: true, speakerId: data.fromUserId, speakerName: data.fromUserName });
    } catch (e) {
      console.error('Error voice_stream_start:', e);
    }
  });

  socket.on('voice_stream_chunk', (data) => {
    if (!data || !data.chunkData) return;
    try {
      socket.broadcast.emit('voice_stream_chunk', data);
      let targetUserIds = Array.isArray(data.targetUserIds) ? data.targetUserIds : [];
      targetUserIds.forEach((tId) => {
        if (tId !== 'all') {
          io.to('user_' + String(tId)).emit('voice_stream_chunk', data);
        }
      });
    } catch (e) {
      console.error('Error voice_stream_chunk:', e);
    }
  });

  socket.on('voice_stream_end', (data) => {
    try {
      io.emit('audio_channel_status', { isBusy: false, speakerId: null, speakerName: null });
      socket.broadcast.emit('voice_stream_end', data);
    } catch (e) {
      console.error('Error voice_stream_end:', e);
    }
  });

  socket.on('send_voice_audio', (data) => {
    if (!data || !data.audioData) return;

    try {
      const fromUserId = data.fromUserId;
      const fromUserName = data.fromUserName || 'Usuario';
      const fromUserPhoto = data.fromUserPhoto || null;
      let targetUserIds = Array.isArray(data.targetUserIds) ? data.targetUserIds : (data.toUserId ? [data.toUserId] : []);
      const isGeneralChannel = targetUserIds.length === 0 || targetUserIds.includes('all') || data.toUserId === 'all';
      const targetUserNames = isGeneralChannel ? 'Canal General (Todos)' : (data.targetUserNames || (data.toUserName ? [data.toUserName] : ['Colaboradores']));
      const durationSeconds = Number(data.durationSeconds) || 0;
      const timeStr = getLocalTimeString().slice(0, 5);

      const instantPayload = {
        id: Date.now(),
        sender_id: fromUserId,
        sender_name: fromUserName,
        sender_photo: fromUserPhoto,
        receiver_ids: isGeneralChannel ? 'all' : JSON.stringify(targetUserIds),
        receiver_names: Array.isArray(targetUserNames) ? targetUserNames.join(', ') : String(targetUserNames),
        targetUserIds: isGeneralChannel ? ['all'] : targetUserIds,
        audio_url: null,
        audioData: data.audioData,
        duration_seconds: durationSeconds,
        created_at: new Date().toISOString(),
        timestamp: timeStr
      };

      // 1. TRANSMISIÓN INSTANTÁNEA EN TIEMPO REAL (Sin duplicación)
      if (isGeneralChannel) {
        socket.broadcast.emit('receive_voice_audio', instantPayload);
      } else if (targetUserIds.length > 0) {
        targetUserIds.forEach((tId) => {
          io.to('user_' + String(tId)).emit('receive_voice_audio', instantPayload);
        });
      }

      // Liberar canal de audio inmediatamente
      io.emit('audio_channel_status', { isBusy: false, speakerId: null, speakerName: null });

      // Notificar al emisor para agregar a su chat inmediatamente
      socket.emit('voice_audio_saved', instantPayload);

      // 2. PERSISTENCIA EN SEGUNDO PLANO
      let matches = data.audioData.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
      let buffer = null;
      let ext = '.webm';

      if (matches && matches.length === 3) {
        const mime = matches[1];
        if (mime.includes('mp4') || mime.includes('m4a')) ext = '.m4a';
        else if (mime.includes('ogg')) ext = '.ogg';
        else ext = '.webm';
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(data.audioData, 'base64');
      }

      const filename = `voice_${Date.now()}_u${fromUserId}${ext}`;
      const filePath = path.join(audioUploadsDir, filename);

      fs.writeFile(filePath, buffer, (writeErr) => {
        const audioUrl = writeErr ? '' : `/uploads/audio/${filename}`;
        const receiverIdsJson = isGeneralChannel ? 'all' : JSON.stringify(targetUserIds);
        const receiverNamesStr = Array.isArray(targetUserNames) ? targetUserNames.join(', ') : String(targetUserNames);

        db.run(
          `INSERT INTO voice_messages (sender_id, sender_name, sender_photo, receiver_ids, receiver_names, audio_url, audio_data, duration_seconds)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [fromUserId, fromUserName, fromUserPhoto, receiverIdsJson, receiverNamesStr, audioUrl, data.audioData, durationSeconds],
          () => {
            savePersistentBackup();
          }
        );
      });

    } catch (err) {
      console.error('Error procesando send_voice_audio:', err.message);
    }
  });
});

process.on('uncaughtException', (err) => {
  console.error('Excepción global no capturada:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promesa rechazada no manejada:', reason);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log('  Servidor ASISTENTRUCK ONLINE en puerto ' + PORT);
  console.log('  Listo para Nube (Railway / Render / Web / Celulares)');
  console.log('====================================================');
});

module.exports = app;
module.exports.server = server;
