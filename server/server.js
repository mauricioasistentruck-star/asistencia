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
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'user_' + (req.params.id || 'new') + '_' + Date.now() + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

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

function calculateWorkHours(entry, lunchOut, lunchIn, exit) {
  if (!entry || !exit) return 0;
  const parseTime = (t) => {
    const [h, m, s] = t.split(':').map(Number);
    return h * 60 + m + (s ? s / 60 : 0);
  };
  let totalMinutes = parseTime(exit) - parseTime(entry);
  if (lunchOut && lunchIn) {
    const lunchMinutes = parseTime(lunchIn) - parseTime(lunchOut);
    if (lunchMinutes > 0) totalMinutes -= lunchMinutes;
  }
  return totalMinutes > 0 ? Number((totalMinutes / 60).toFixed(2)) : 0;
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

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'Credenciales inválidas' });

    const payload = {
      id: user.id,
      username: user.username || user.name.toLowerCase().replace(/\s+/g, ''),
      rut: user.rut,
      name: user.name,
      email: user.email,
      role: user.role,
      is_superadmin: user.is_superadmin
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username || user.name.toLowerCase().replace(/\s+/g, ''),
        rut: user.rut,
        name: user.name,
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
  db.all('SELECT id, username, rut, name, email, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled, created_at FROM users ORDER BY id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al consultar usuarios' });
    res.json(rows);
  });
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
  const gps_enabled = gps_tracking_enabled ? 1 : 0;

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

    const query = 'INSERT INTO users (username, rut, name, email, password_hash, role, is_superadmin, qr_token, gps_tracking_enabled) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)';
    db.run(query, [cleanUsername, cleanRut, cleanName, cleanEmail, password_hash, userRole, qr_token, gps_enabled], function (err) {
      if (err) {
        return res.status(500).json({ error: 'Error al registrar usuario: ' + err.message });
      }
      const newId = this.lastID;
      db.get('SELECT id, username, rut, name, email, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled, created_at FROM users WHERE id = ?', [newId], (fetchErr, row) => {
        io.emit('user_created', row);
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
    res.json({ message: 'Foto actualizada exitosamente', photo_url: photoUrl });
  });
});

app.patch('/api/users/:id/toggle-gps', authenticateToken, (req, res) => {
  const userId = Number(req.params.id);
  const { enabled } = req.body;
  const isSelf = req.user.id === userId;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

  if (!isSelf && !isAdmin) {
    return res.status(403).json({ error: 'No tiene permisos para modificar este GPS' });
  }

  db.run('UPDATE users SET gps_tracking_enabled = ? WHERE id = ?', [enabled ? 1 : 0, userId], (err) => {
    if (err) return res.status(500).json({ error: 'Error al actualizar estado GPS' });
    io.emit('user_gps_toggled', { userId, gps_tracking_enabled: enabled ? 1 : 0 });
    res.json({ message: 'GPS ' + (enabled ? 'activado' : 'desactivado'), enabled: enabled ? 1 : 0 });
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

    const isTargetSuperAdmin = targetUser.is_superadmin === 1 || (targetUser.name && targetUser.name.toLowerCase().includes('mauricio'));
    if (isTargetSuperAdmin && !isCurrentUserSuperAdmin) {
      return res.status(403).json({ error: 'ACCESO DENEGADO: No tiene permisos para modificar la cuenta de este Administrador.' });
    }

    const passwordHash = password && password.trim() !== '' ? bcrypt.hashSync(password, 10) : targetUser.password_hash;
    const assignedRole = isTargetSuperAdmin ? 'superadmin' : (role || targetUser.role);
    const assignedGps = gps_tracking_enabled !== undefined ? (gps_tracking_enabled ? 1 : 0) : targetUser.gps_tracking_enabled;
    const finalUsername = (username && username.trim() !== '') ? username.trim().toLowerCase().replace(/\s+/g, '') : (targetUser.username || targetUser.name.toLowerCase().replace(/\s+/g, ''));
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
        'UPDATE users SET username = ?, rut = ?, name = ?, email = ?, password_hash = ?, role = ?, gps_tracking_enabled = ? WHERE id = ?',
        [finalUsername, finalRut, finalName, finalEmail, passwordHash, assignedRole, assignedGps, targetId],
        (upErr) => {
          if (upErr) return res.status(500).json({ error: 'Error al actualizar usuario: ' + upErr.message });
          db.get('SELECT id, username, rut, name, email, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled FROM users WHERE id = ?', [targetId], (fetchErr, updatedUser) => {
            io.emit('user_updated', updatedUser);
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
    if (targetUser.is_superadmin === 1 || targetUser.name.toLowerCase() === 'mauricio' || targetUser.name.toLowerCase().includes('mauricio')) {
      return res.status(403).json({ error: 'ACCESO DENEGADO: El usuario Mauricio es el Administrador Principal y no puede ser eliminado.' });
    }
    db.run('DELETE FROM users WHERE id = ?', [targetId], (delErr) => {
      if (delErr) return res.status(500).json({ error: 'Error al eliminar usuario' });
      io.emit('user_deleted', { id: targetId });
      res.json({ message: 'Usuario eliminado exitosamente' });
    });
  });
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

app.get('/api/attendance/admin/export-excel', (req, res) => {
  const { date_from, date_to, user_id } = req.query;
  let query = `
    SELECT a.date as Fecha, u.name as Trabajador, u.rut as RUT,
           a.entry_time as "1. Entrada", a.lunch_out_time as "2. Salida Colacion",
           a.lunch_in_time as "3. Entrada Colacion", a.exit_time as "4. Salida Jornada",
           a.total_hours as "Total Horas",
           CASE WHEN a.modified_by_admin = 1 THEN 'Si (Admin)' ELSE 'No' END as "Editado por Admin",
           a.admin_note as "Nota Auditoria"
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
    if (err) return res.status(500).json({ error: 'Error al generar Excel' });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 18 },
      { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 30 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Registro_Asistencia');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = 'Reporte_Asistencia_' + getLocalDateString() + '.xlsx';
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  });
});

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
    if (!user.gps_tracking_enabled) return res.status(403).json({ message: 'Rastreo GPS desactivado para este usuario' });

    const today = getLocalDateString();
    const currentTime = getLocalTimeString();
    const query = 'INSERT INTO gps_logs (user_id, latitude, longitude, accuracy, speed, date) VALUES (?, ?, ?, ?, ?, ?)';

    db.run(query, [userId, latitude, longitude, accuracy || null, speed || null, today], function (insErr) {
      if (insErr) return res.status(500).json({ error: 'Error al registrar GPS' });

      const newPoint = { latitude, longitude, timestamp: new Date().toISOString(), time: currentTime, speed: speed || 0, accuracy: accuracy || 10 };
      const gpsData = { userId, userName: user.name, latitude, longitude, accuracy, speed, timestamp: new Date().toISOString(), date: today };
      io.emit('gps_position_updated', gpsData);

      // Guardar o actualizar la ruta activa del día en segundo plano sin molestar al trabajador
      db.get('SELECT * FROM gps_routes WHERE user_id = ? AND date = ? AND status = "active" ORDER BY id DESC LIMIT 1', [userId, today], (routeErr, activeRoute) => {
        if (!activeRoute) {
          const routeName = 'Ruta ' + user.name + ' - ' + today;
          const initialPoints = JSON.stringify([newPoint]);
          db.run(
            'INSERT INTO gps_routes (user_id, user_name, name, date, start_time, start_lat, start_lng, total_distance_km, total_points, points_json, status) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, "active")',
            [userId, user.name, routeName, today, currentTime, latitude, longitude, initialPoints]
          );
        } else {
          let points = [];
          try {
            points = JSON.parse(activeRoute.points_json || '[]');
          } catch (e) {
            points = [];
          }
          const lastPoint = points[points.length - 1];
          let addedDist = 0;
          if (lastPoint) {
            addedDist = calculateDistanceBetween(lastPoint.latitude, lastPoint.longitude, latitude, longitude);
          }
          points.push(newPoint);
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
  const query = 'SELECT u.id as user_id, u.name as user_name, u.photo_url, u.gps_tracking_enabled, g.latitude, g.longitude, g.accuracy, g.speed, g.timestamp FROM users u LEFT JOIN (SELECT g1.* FROM gps_logs g1 INNER JOIN (SELECT user_id, MAX(id) as max_id FROM gps_logs GROUP BY user_id) g2 ON g1.id = g2.max_id) g ON u.id = g.user_id WHERE u.gps_tracking_enabled = 1';
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al consultar GPS' });
    res.json(rows);
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
  const pointsJson = points ? (typeof points === 'string' ? points : JSON.stringify(points)) : '[]';
  const totalPts = Array.isArray(points) ? points.length : 0;
  const distanceKm = Number(totalDistanceKm) || 0;

  // Desactivar GPS del usuario
  db.run('UPDATE users SET gps_tracking_enabled = 0 WHERE id = ?', [userId]);

  const query = `
    UPDATE gps_routes 
    SET end_time = ?, end_lat = ?, end_lng = ?, total_distance_km = ?, total_points = ?, points_json = ?, status = 'completed'
    WHERE (id = ? OR (user_id = ? AND status = 'active'))
  `;

  db.run(query, [endTime, latitude || null, longitude || null, distanceKm, totalPts, pointsJson, routeId || 0, userId], function (upErr) {
    if (upErr) return res.status(500).json({ error: 'Error al finalizar ruta: ' + upErr.message });
    io.emit('gps_route_finished', { routeId, userId, endTime, distanceKm });
    res.json({ success: true, message: 'Ruta finalizada y guardada exitosamente en el registro' });
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

  // Transmisión de Audio / Voz en Tiempo Real
  socket.on('send_voice_audio', (data) => {
    if (!data || !data.audioData) return;

    if (data.toUserId && data.toUserId !== 'all') {
      // Enviar a un usuario específico
      io.to('user_' + data.toUserId).emit('receive_voice_audio', data);
      socket.emit('voice_audio_delivered', { success: true, toUserId: data.toUserId, toUserName: data.toUserName });
    } else {
      // Canal general (transmitir a todos los demás dispositivos conectados)
      socket.broadcast.emit('receive_voice_audio', data);
      socket.emit('voice_audio_delivered', { success: true, toUserId: 'all', toUserName: 'Canal General' });
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
