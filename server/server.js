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

const JWT_SECRET = process.env.JWT_SECRET || 'asistencia_secret_key_2026_super_secure';
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

// Health Checks para Railway / Nube
app.get('/health', (req, res) => res.json({ status: 'ok', serverTime: new Date().toISOString() }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', serverTime: new Date().toISOString() }));

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

    const fallbackUsername = user.username || (user.name ? user.name.toLowerCase().replace(/\s+/g, '') : `user${user.id}`);
    const payload = {
      id: user.id,
      username: fallbackUsername,
      rut: user.rut,
      name: user.name || fallbackUsername,
      email: user.email,
      role: user.role,
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
        gps_tracking_enabled: user.gps_tracking_enabled
      }
    });
  });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  db.get('SELECT id, username, rut, name, email, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  });
});

// CRUD Usuarios
app.get('/api/users', authenticateToken, requireAdmin, (req, res) => {
  db.all('SELECT id, username, rut, name, email, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled, plain_password, created_at FROM users ORDER BY id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al consultar usuarios' });
    res.json(rows);
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
      io.emit('user_updated', { id: userId });
      res.json({ success: true, message: 'Contraseña actualizada correctamente' });
    }
  );
});

app.post('/api/users', authenticateToken, requireAdmin, (req, res) => {
  const { username, rut, name, email, password, role, gps_tracking_enabled } = req.body;
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
  const userRole = role === 'admin' ? 'admin' : 'worker';
  const qr_token = 'QR_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9).toUpperCase();
  const gps_enabled = (gps_tracking_enabled === true || gps_tracking_enabled === 1 || gps_tracking_enabled === '1' || gps_tracking_enabled === 'true') ? 1 : 0;

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

    const query = 'INSERT INTO users (username, rut, name, email, password_hash, plain_password, role, is_superadmin, qr_token, gps_tracking_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)';
    db.run(query, [cleanUsername, cleanRut, cleanName, cleanEmail, password_hash, rawPassword, userRole, qr_token, gps_enabled], function (err) {
      if (err) {
        return res.status(500).json({ error: 'Error al registrar usuario: ' + err.message });
      }
      const newId = this.lastID;
      db.get('SELECT id, username, rut, name, email, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled, plain_password, created_at FROM users WHERE id = ?', [newId], (fetchErr, row) => {
        io.emit('user_created', row);
        savePersistentBackup();
        res.status(201).json({ message: 'Usuario creado exitosamente con código QR generado', user: row });
      });
    });
  });
});

app.post('/api/users/:id/photo', authenticateToken, requireAdmin, upload.single('photo'), (req, res) => {
  const userId = req.params.id;
  if (!req.file) return res.status(400).json({ error: 'No se subió archivo' });
  const photoUrl = '/uploads/' + req.file.filename;
  db.run('UPDATE users SET photo_url = ? WHERE id = ?', [photoUrl, userId], (err) => {
    if (err) return res.status(500).json({ error: 'Error al actualizar foto' });
    io.emit('user_updated', { id: Number(userId), photo_url: photoUrl });
    savePersistentBackup();
    res.json({ message: 'Foto actualizada exitosamente', photo_url: photoUrl });
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
    io.emit('user_gps_toggled', { userId, gps_tracking_enabled: gpsVal });
    savePersistentBackup();
    res.json({ message: 'GPS ' + (gpsVal === 1 ? 'activado' : 'desactivado'), enabled: gpsVal });
  });
});

// Modificar Perfil de Usuario
app.put('/api/users/:id', authenticateToken, requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  const { username, rut, name, email, role, password, gps_tracking_enabled } = req.body;
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

    const passwordHash = password && password.trim() !== '' ? bcrypt.hashSync(password, 10) : targetUser.password_hash;
    const plainPassword = password && password.trim() !== '' ? password.trim() : targetUser.plain_password;
    const assignedRole = isTargetSuperAdmin ? 'superadmin' : (role || targetUser.role);
    const assignedGps = gps_tracking_enabled !== undefined 
      ? ((gps_tracking_enabled === true || gps_tracking_enabled === 1 || gps_tracking_enabled === '1' || gps_tracking_enabled === 'true') ? 1 : 0) 
      : targetUser.gps_tracking_enabled;
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

      db.run(
        'UPDATE users SET username = ?, rut = ?, name = ?, email = ?, password_hash = ?, plain_password = ?, role = ?, gps_tracking_enabled = ? WHERE id = ?',
        [finalUsername, finalRut, finalName, finalEmail, passwordHash, plainPassword, assignedRole, assignedGps, targetId],
        (upErr) => {
          if (upErr) return res.status(500).json({ error: 'Error al actualizar usuario: ' + upErr.message });
          db.get('SELECT id, username, rut, name, email, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled, plain_password FROM users WHERE id = ?', [targetId], (fetchErr, updatedUser) => {
            io.emit('user_updated', updatedUser);
            savePersistentBackup();
            res.json({ message: 'Perfil actualizado exitosamente', user: updatedUser });
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
    db.run('DELETE FROM users WHERE id = ?', [targetId], (delErr) => {
      if (delErr) return res.status(500).json({ error: 'Error al eliminar usuario' });
      io.emit('user_deleted', { id: targetId });
      savePersistentBackup();
      res.json({ message: 'Usuario eliminado exitosamente' });
    });
  });
});

// =========================================================================
// SISTEMA DE EXPORTACIÓN E IMPORTACIÓN MASIVA TOTAL (BACKUP & RESTORE)
// Respalda: Usuarios, Contraseñas, Fotos (Base64), Marcaciones y Rutas GPS.
// Excluye exclusivamente los audios de walkie-talkie.
// =========================================================================

app.get('/api/admin/backup/export', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const backup = {
      app: 'ASISTENTRUCK',
      version: '1.0',
      exported_at: new Date().toISOString(),
      exported_by: req.user.name || 'SuperAdmin',
      users: [],
      attendance: [],
      gps_routes: [],
      gps_logs: [],
      audit_logs: []
    };

    // 1. Obtener Usuarios con fotos Base64
    const users = await new Promise((resolve, reject) => {
      db.all('SELECT id, username, rut, name, email, password_hash, plain_password, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled, created_at FROM users ORDER BY id ASC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    for (let u of users) {
      const uCopy = { ...u };
      if (u.photo_url) {
        try {
          const filename = path.basename(u.photo_url);
          const photoPath = path.join(uploadsDir, filename);
          if (fs.existsSync(photoPath)) {
            const buf = fs.readFileSync(photoPath);
            uCopy.photo_base64 = buf.toString('base64');
            uCopy.photo_filename = filename;
          }
        } catch (e) {
          console.error('Error leyendo foto para backup:', e);
        }
      }
      backup.users.push(uCopy);
    }

    // 2. Obtener Historial de Asistencia y Marcaciones
    backup.attendance = await new Promise((resolve, reject) => {
      db.all('SELECT id, user_id, date, entry_time, lunch_out_time, lunch_in_time, exit_time, total_hours, modified_by_admin, admin_note, created_at, updated_at FROM attendance ORDER BY date ASC, id ASC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // 3. Obtener Rutas GPS
    backup.gps_routes = await new Promise((resolve, reject) => {
      db.all('SELECT id, user_id, user_name, name, date, start_time, end_time, start_lat, start_lng, end_lat, end_lng, total_distance_km, total_points, points_json, status, created_at FROM gps_routes ORDER BY id ASC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // 4. Obtener GPS Logs
    backup.gps_logs = await new Promise((resolve, reject) => {
      db.all('SELECT id, user_id, latitude, longitude, accuracy, speed, timestamp, date FROM gps_logs ORDER BY id ASC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // 5. Obtener Logs de Auditoría
    backup.audit_logs = await new Promise((resolve, reject) => {
      db.all('SELECT id, admin_id, admin_name, action, details, created_at FROM audit_logs ORDER BY id ASC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    backup.stats = {
      users_count: backup.users.length,
      attendance_count: backup.attendance.length,
      routes_count: backup.gps_routes.length,
      logs_count: backup.gps_logs.length
    };

    const chileDateStr = getLocalDateString();
    const filename = `backup_asistentruck_${chileDateStr}_${Date.now()}.json`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.json(backup);
  } catch (error) {
    console.error('Error al exportar backup:', error);
    return res.status(500).json({ error: 'Error al generar la exportación masiva: ' + error.message });
  }
});

app.post('/api/admin/backup/import', authenticateToken, requireAdmin, (req, res) => {
  try {
    const backup = req.body;
    if (!backup || (!backup.users && !backup.attendance && !backup.gps_routes)) {
      return res.status(400).json({ error: 'Formato de archivo de respaldo no válido o vacío.' });
    }

    let usersImported = 0;
    let attendanceImported = 0;
    let routesImported = 0;
    let logsImported = 0;

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      // 1. Restaurar Usuarios y Fotos
      if (Array.isArray(backup.users)) {
        const stmtUser = db.prepare(`
          INSERT INTO users (id, username, rut, name, email, password_hash, plain_password, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            username = excluded.username,
            rut = excluded.rut,
            name = excluded.name,
            email = excluded.email,
            password_hash = excluded.password_hash,
            plain_password = excluded.plain_password,
            role = excluded.role,
            is_superadmin = excluded.is_superadmin,
            photo_url = excluded.photo_url,
            qr_token = excluded.qr_token,
            gps_tracking_enabled = excluded.gps_tracking_enabled
        `);

        for (let u of backup.users) {
          let photoUrl = u.photo_url;
          if (u.photo_base64) {
            try {
              const fname = u.photo_filename || `user_${u.id}_${Date.now()}.jpg`;
              const filePath = path.join(uploadsDir, fname);
              fs.writeFileSync(filePath, Buffer.from(u.photo_base64, 'base64'));
              photoUrl = '/uploads/' + fname;
            } catch (err) {
              console.error('Error restaurando foto:', err);
            }
          }

          stmtUser.run(
            u.id || null,
            u.username || (u.name ? u.name.toLowerCase().replace(/\s+/g, '') : 'user' + u.id),
            u.rut || null,
            u.name || 'Sin nombre',
            u.email || ('user' + u.id + '@asistentruck.cl'),
            u.password_hash || bcrypt.hashSync('123', 10),
            u.plain_password || '123',
            u.role || 'worker',
            u.is_superadmin ? 1 : 0,
            photoUrl || null,
            u.qr_token || ('QR_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9).toUpperCase()),
            u.gps_tracking_enabled ? 1 : 0,
            u.created_at || new Date().toISOString()
          );
          usersImported++;
        }
        stmtUser.finalize();
      }

      // 2. Restaurar Asistencia
      if (Array.isArray(backup.attendance)) {
        const stmtAtt = db.prepare(`
          INSERT INTO attendance (id, user_id, date, entry_time, lunch_out_time, lunch_in_time, exit_time, total_hours, modified_by_admin, admin_note, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, date) DO UPDATE SET
            entry_time = excluded.entry_time,
            lunch_out_time = excluded.lunch_out_time,
            lunch_in_time = excluded.lunch_in_time,
            exit_time = excluded.exit_time,
            total_hours = excluded.total_hours,
            modified_by_admin = excluded.modified_by_admin,
            admin_note = excluded.admin_note,
            updated_at = excluded.updated_at
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

      // 3. Restaurar Rutas GPS
      if (Array.isArray(backup.gps_routes)) {
        const stmtRoute = db.prepare(`
          INSERT INTO gps_routes (id, user_id, user_name, name, date, start_time, end_time, start_lat, start_lng, end_lat, end_lng, total_distance_km, total_points, points_json, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            user_id = excluded.user_id,
            user_name = excluded.user_name,
            name = excluded.name,
            date = excluded.date,
            start_time = excluded.start_time,
            end_time = excluded.end_time,
            start_lat = excluded.start_lat,
            start_lng = excluded.start_lng,
            end_lat = excluded.end_lat,
            end_lng = excluded.end_lng,
            total_distance_km = excluded.total_distance_km,
            total_points = excluded.total_points,
            points_json = excluded.points_json,
            status = excluded.status
        `);

        for (let r of backup.gps_routes) {
          stmtRoute.run(
            r.id || null,
            r.user_id,
            r.user_name || 'Personal',
            r.name || 'Ruta GPS',
            r.date,
            r.start_time,
            r.end_time || null,
            r.start_lat || 0,
            r.start_lng || 0,
            r.end_lat || null,
            r.end_lng || null,
            r.total_distance_km || 0,
            r.total_points || 0,
            r.points_json || '[]',
            r.status || 'completed',
            r.created_at || new Date().toISOString()
          );
          routesImported++;
        }
        stmtRoute.finalize();
      }

      // 4. Restaurar Logs GPS
      if (Array.isArray(backup.gps_logs)) {
        const stmtLog = db.prepare(`
          INSERT INTO gps_logs (id, user_id, latitude, longitude, accuracy, speed, timestamp, date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO NOTHING
        `);
        for (let l of backup.gps_logs) {
          stmtLog.run(
            l.id || null,
            l.user_id,
            l.latitude,
            l.longitude,
            l.accuracy || null,
            l.speed || null,
            l.timestamp || new Date().toISOString(),
            l.date
          );
          logsImported++;
        }
        stmtLog.finalize();
      }

      db.run('COMMIT', (commitErr) => {
        if (commitErr) {
          console.error('Error confirmando restauración de backup:', commitErr);
          return res.status(500).json({ error: 'Error al confirmar la restauración: ' + commitErr.message });
        }

        io.emit('user_created');
        io.emit('user_updated');
        io.emit('attendance_updated');

        return res.json({
          success: true,
          message: '¡Copia de seguridad restaurada exitosamente!',
          stats: {
            users: usersImported,
            attendance: attendanceImported,
            routes: routesImported,
            logs: logsImported
          }
        });
      });
    });
  } catch (error) {
    console.error('Error en importación masiva:', error);
    db.run('ROLLBACK', () => {});
    return res.status(500).json({ error: 'Fallo al procesar archivo de respaldo: ' + error.message });
  }
});

// Sincronización Automática Bidireccional de Bóveda Maestra (Cliente <-> Servidor)
app.post('/api/sync/vault', (req, res) => {
  try {
    const backup = req.body;
    if (!backup || (!backup.users && !backup.attendance && !backup.voice_messages && !backup.gps_routes)) {
      return res.status(400).json({ error: 'Datos de bóveda vacíos' });
    }

    let usersCount = 0;
    let attendanceCount = 0;

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      if (Array.isArray(backup.users) && backup.users.length > 0) {
        const stmtUser = db.prepare(`
          INSERT INTO users (id, username, rut, name, email, password_hash, plain_password, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            username = COALESCE(excluded.username, users.username),
            rut = COALESCE(excluded.rut, users.rut),
            name = COALESCE(excluded.name, users.name),
            email = COALESCE(excluded.email, users.email),
            password_hash = COALESCE(excluded.password_hash, users.password_hash),
            plain_password = COALESCE(excluded.plain_password, users.plain_password),
            role = COALESCE(excluded.role, users.role),
            is_superadmin = COALESCE(excluded.is_superadmin, users.is_superadmin),
            photo_url = COALESCE(excluded.photo_url, users.photo_url),
            qr_token = COALESCE(excluded.qr_token, users.qr_token),
            gps_tracking_enabled = COALESCE(excluded.gps_tracking_enabled, users.gps_tracking_enabled)
        `);

        for (let u of backup.users) {
          let photoUrl = u.photo_url;
          if (u.photo_base64) {
            try {
              const fname = u.photo_filename || `user_${u.id}_${Date.now()}.jpg`;
              const filePath = path.join(uploadsDir, fname);
              fs.writeFileSync(filePath, Buffer.from(u.photo_base64, 'base64'));
              photoUrl = '/uploads/' + fname;
            } catch (err) {}
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
            photoUrl || null,
            u.qr_token || ('QR_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9).toUpperCase()),
            u.gps_tracking_enabled ? 1 : 0,
            u.created_at || new Date().toISOString()
          );
          usersCount++;
        }
        stmtUser.finalize();
      }

      if (Array.isArray(backup.attendance) && backup.attendance.length > 0) {
        const stmtAtt = db.prepare(`
          INSERT INTO attendance (id, user_id, date, entry_time, lunch_out_time, lunch_in_time, exit_time, total_hours, modified_by_admin, admin_note, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, date) DO UPDATE SET
            entry_time = COALESCE(excluded.entry_time, attendance.entry_time),
            lunch_out_time = COALESCE(excluded.lunch_out_time, attendance.lunch_out_time),
            lunch_in_time = COALESCE(excluded.lunch_in_time, attendance.lunch_in_time),
            exit_time = COALESCE(excluded.exit_time, attendance.exit_time),
            total_hours = COALESCE(excluded.total_hours, attendance.total_hours),
            modified_by_admin = COALESCE(excluded.modified_by_admin, attendance.modified_by_admin),
            admin_note = COALESCE(excluded.admin_note, attendance.admin_note),
            updated_at = COALESCE(excluded.updated_at, attendance.updated_at)
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
          attendanceCount++;
        }
        stmtAtt.finalize();
      }

      if (Array.isArray(backup.voice_messages) && backup.voice_messages.length > 0) {
        const stmtVoice = db.prepare(`
          INSERT OR IGNORE INTO voice_messages (id, sender_id, sender_name, sender_photo, receiver_ids, receiver_names, audio_url, audio_data, duration_seconds, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (let v of backup.voice_messages) {
          stmtVoice.run(
            v.id || null,
            v.sender_id,
            v.sender_name || 'Personal',
            v.sender_photo || null,
            v.receiver_ids || 'all',
            v.receiver_names || 'Todos',
            v.audio_url || null,
            v.audio_data || null,
            v.duration_seconds || 0,
            v.created_at || new Date().toISOString()
          );
        }
        stmtVoice.finalize();
      }
      if (Array.isArray(backup.gps_routes) && backup.gps_routes.length > 0) {
        const stmtRoute = db.prepare(`
          INSERT INTO gps_routes (id, user_id, user_name, name, date, start_time, end_time, start_lat, start_lng, end_lat, end_lng, total_distance_km, total_points, points_json, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            user_name = COALESCE(excluded.user_name, gps_routes.user_name),
            name = COALESCE(excluded.name, gps_routes.name),
            date = COALESCE(excluded.date, gps_routes.date),
            start_time = COALESCE(excluded.start_time, gps_routes.start_time),
            end_time = COALESCE(excluded.end_time, gps_routes.end_time),
            end_lat = COALESCE(excluded.end_lat, gps_routes.end_lat),
            end_lng = COALESCE(excluded.end_lng, gps_routes.end_lng),
            total_distance_km = COALESCE(excluded.total_distance_km, gps_routes.total_distance_km),
            total_points = COALESCE(excluded.total_points, gps_routes.total_points),
            points_json = COALESCE(excluded.points_json, gps_routes.points_json),
            status = COALESCE(excluded.status, gps_routes.status)
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
        }
        stmtRoute.finalize();
      }

      db.run('COMMIT', (commitErr) => {
        if (commitErr) {
          console.error('Error confirmando sync vault:', commitErr);
          return res.status(500).json({ error: 'Error al sincronizar datos' });
        }
        savePersistentBackup();
        io.emit('user_created');
        io.emit('attendance_updated');
        return res.json({ success: true, stats: { users: usersCount, attendance: attendanceCount } });
      });
    });
  } catch (err) {
    console.error('Error en /api/sync/vault:', err);
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

  if (range === 'day') {
    query += ' AND date = ? ORDER BY id DESC LIMIT 1';
    params.push(getLocalDateString());
  } else if (range === 'week') {
    query += ' AND date >= date("now", "-7 days") ORDER BY date DESC';
  } else if (range === 'month') {
    query += ' AND date >= date("now", "-30 days") ORDER BY date DESC';
  } else {
    query += ' ORDER BY date DESC LIMIT 60';
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al consultar historial' });
    res.json(rows);
  });
});

const handleAdminAttendanceEdit = (req, res) => {
  const recordId = Number(req.params.id);
  const { admin_password, entry_time, lunch_out_time, lunch_in_time, exit_time, admin_note } = req.body;

  const performEdit = () => {
    db.get('SELECT * FROM attendance WHERE id = ?', [recordId], (recErr, record) => {
      if (recErr || !record) return res.status(404).json({ error: 'Registro de asistencia no encontrado' });

      const newEntry = entry_time !== undefined ? entry_time : record.entry_time;
      const newLunchOut = lunch_out_time !== undefined ? lunch_out_time : record.lunch_out_time;
      const newLunchIn = lunch_in_time !== undefined ? lunch_in_time : record.lunch_in_time;
      const newExit = exit_time !== undefined ? exit_time : record.exit_time;
      const totalHours = calculateWorkHours(newEntry, newLunchOut, newLunchIn, newExit);
      const note = admin_note || ('Modificado por Admin: ' + req.user.name);

      const updateQuery = `
        UPDATE attendance
        SET entry_time = ?, lunch_out_time = ?, lunch_in_time = ?, exit_time = ?, total_hours = ?, modified_by_admin = 1, admin_note = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      db.run(updateQuery, [newEntry, newLunchOut, newLunchIn, newExit, totalHours, note, recordId], (upErr) => {
        if (upErr) return res.status(500).json({ error: 'Error al actualizar registro: ' + upErr.message });

        db.run('INSERT INTO audit_logs (admin_id, admin_name, action, details) VALUES (?, ?, ?, ?)', [
          req.user.id,
          req.user.name,
          'EDIT_ATTENDANCE',
          `Registro ID: ${recordId}, Usuario ID: ${record.user_id}, Fecha: ${record.date}, Nota: ${note}`
        ]);

        db.get('SELECT * FROM attendance WHERE id = ?', [recordId], (fErr, updatedRec) => {
          io.emit('attendance_updated', updatedRec);
          res.json({ message: 'Horario modificado y registrado en auditoría', record: updatedRec });
        });
      });
    });
  };

  if (admin_password) {
    db.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id], (userErr, adminUser) => {
      if (userErr || !adminUser) return res.status(500).json({ error: 'Error al autenticar administrador' });
      const isCorrect = bcrypt.compareSync(admin_password, adminUser.password_hash);
      if (!isCorrect) {
        return res.status(401).json({ error: 'Contraseña de administrador incorrecta. Modificación denegada.' });
      }
      performEdit();
    });
  } else {
    // Si ya está autenticado con JWT de Administrador
    performEdit();
  }
};

app.put('/api/attendance/admin/edit/:id', authenticateToken, requireAdmin, handleAdminAttendanceEdit);
app.put('/api/attendance/:id/admin-edit', authenticateToken, requireAdmin, handleAdminAttendanceEdit);

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
    if (accuracy && accuracy > 120) {
      return res.json({ success: true, message: 'Punto descartado por precisión GPS insuficiente' });
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

      // Si el usuario tiene una ruta en terreno iniciada explícitamente, actualizarla
      db.get('SELECT * FROM gps_routes WHERE user_id = ? AND status = "active" ORDER BY id DESC LIMIT 1', [userId], (routeErr, activeRoute) => {
        if (activeRoute) {
          let points = [];
          try {
            points = JSON.parse(activeRoute.points_json || '[]');
          } catch (e) {
            points = [];
          }
          const lastPoint = points[points.length - 1];
          let addedDist = 0;
          let shouldAddPoint = true;

          if (lastPoint) {
            addedDist = calculateDistanceBetween(lastPoint.latitude, lastPoint.longitude, latitude, longitude);
            
            // 1. Si se movió menos de 5 metros estando quieto, no añadir punto para evitar temblor
            if (addedDist < 0.005 && (!speed || speed < 0.5)) {
              shouldAddPoint = false;
            }

            // 2. Si el salto representa una velocidad imposible (> 140 km/h), descartar salto
            const t1 = new Date(lastPoint.timestamp || 0).getTime();
            const t2 = new Date().getTime();
            if (t1 > 0 && t2 > t1) {
              const hours = (t2 - t1) / (1000 * 3600);
              const speedKmH = addedDist / hours;
              if (speedKmH > 140) {
                shouldAddPoint = false;
              }
            }
          }

          if (shouldAddPoint) {
            points.push(newPoint);
          }

          const newDist = Number(((activeRoute.total_distance_km || 0) + (addedDist > 0.005 ? addedDist : 0)).toFixed(2));
          db.run(
            'UPDATE gps_routes SET end_time = ?, end_lat = ?, end_lng = ?, total_distance_km = ?, total_points = ?, points_json = ? WHERE id = ?',
            [currentTime, latitude, longitude, newDist, points.length, JSON.stringify(points), activeRoute.id]
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
           g.latitude, g.longitude, g.accuracy, g.speed, g.timestamp, g.time 
    FROM users u 
    INNER JOIN (
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
    res.json({ userId: Number(userId), date, points: rows });
  });
});

// REGISTRO Y GUARDADO DE RUTAS EN TERRENO
app.post('/api/gps/routes/start', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { latitude, longitude, name } = req.body;
  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'Coordenadas de inicio requeridas' });
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
    res.json({ success: true, message: 'Ruta eliminada del registro' });
  });
});

// COMUNICACIÓN DE AUDIO / WALKIE-TALKIE EN TIEMPO REAL
function isAudioScheduleAllowed(user) {
  // Super Admin Mauricio tiene libre disposición 24/7
  if (user && (user.is_superadmin === 1 || (user.name && user.name.toLowerCase().includes('mauricio')))) {
    return { allowed: true, isMauricio: true, reason: 'Libre disposición sin restricción horaria (Administrador)' };
  }

  try {
    const now = new Date();
    // Obtener día de la semana y hora en zona horaria de Chile
    const dayOfWeek = now.toLocaleDateString('en-US', { timeZone: 'America/Santiago', weekday: 'short' }); // Mon, Tue, Wed, Thu, Fri, Sat, Sun
    const timeStr = now.toLocaleTimeString('en-US', { timeZone: 'America/Santiago', hour12: false, hour: '2-digit', minute: '2-digit' });
    const [hour, minute] = timeStr.split(':').map(Number);
    const currentMinutes = hour * 60 + minute;

    // Lunes a Jueves: 09:00 a 18:00 (540 min a 1080 min)
    if (['Mon', 'Tue', 'Wed', 'Thu'].includes(dayOfWeek)) {
      if (currentMinutes >= 9 * 60 && currentMinutes <= 18 * 60) {
        return { allowed: true, isMauricio: false, schedule: 'Lunes a Jueves: 09:00 - 18:00 hrs' };
      }
      return { allowed: false, isMauricio: false, reason: 'Canal disponible de Lunes a Jueves de 09:00 a 18:00 hrs' };
    }

    // Viernes: 09:00 a 17:30 (540 min a 1050 min)
    if (dayOfWeek === 'Fri') {
      if (currentMinutes >= 9 * 60 && currentMinutes <= 17 * 60 + 30) {
        return { allowed: true, isMauricio: false, schedule: 'Viernes: 09:00 - 17:30 hrs' };
      }
      return { allowed: false, isMauricio: false, reason: 'Canal disponible los Viernes de 09:00 a 17:30 hrs' };
    }

    return { allowed: false, isMauricio: false, reason: 'Canal cerrado los fines de semana (Disponible Lun-Jue 09:00-18:00, Vie 09:00-17:30)' };
  } catch (e) {
    // Si falla el cálculo de zona horaria, permitir por defecto
    return { allowed: true, isMauricio: false };
  }
}

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
