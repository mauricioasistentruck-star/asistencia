const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const dbPath = path.join(__dirname, 'asistencia.db');
const uploadsDir = path.join(__dirname, 'uploads');
const audioUploadsDir = path.join(uploadsDir, 'audio');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(audioUploadsDir)) {
  fs.mkdirSync(audioUploadsDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al conectar con SQLite:', err.message);
  } else {
    console.log('Conectado a la base de datos SQLite: asistencia.db');
  }
});

db.serialize(() => {
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA synchronous = NORMAL;");

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      rut TEXT UNIQUE,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'worker',
      is_superadmin INTEGER NOT NULL DEFAULT 0,
      photo_url TEXT,
      qr_token TEXT UNIQUE NOT NULL,
      gps_tracking_enabled INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run("ALTER TABLE users ADD COLUMN username TEXT", () => {});
  db.run("ALTER TABLE users ADD COLUMN plain_password TEXT", () => {});
  db.run("UPDATE users SET plain_password = '123' WHERE plain_password IS NULL", () => {});
  db.run("UPDATE users SET username = LOWER(REPLACE(name, ' ', '')) WHERE username IS NULL OR username = ''", () => {});
  db.run("DELETE FROM users WHERE (name IS NULL OR TRIM(name) = '') AND (username IS NULL OR TRIM(username) = '' OR username = 'usuario')", () => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      entry_time TEXT,
      lunch_out_time TEXT,
      lunch_in_time TEXT,
      exit_time TEXT,
      total_hours REAL DEFAULT 0,
      modified_by_admin INTEGER DEFAULT 0,
      admin_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS gps_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      accuracy REAL,
      speed REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      date TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Tabla para el Registro y Guardado de Rutas en Terreno
  db.run(`
    CREATE TABLE IF NOT EXISTS gps_routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      name TEXT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      start_lat REAL NOT NULL,
      start_lng REAL NOT NULL,
      end_lat REAL,
      end_lng REAL,
      total_distance_km REAL DEFAULT 0,
      total_points INTEGER DEFAULT 0,
      points_json TEXT,
      status TEXT DEFAULT 'completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Tabla para el Historial de Mensajes de Voz / Walkie-Talkie
  db.run(`
    CREATE TABLE IF NOT EXISTS voice_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      sender_name TEXT NOT NULL,
      sender_photo TEXT,
      receiver_ids TEXT NOT NULL,
      receiver_names TEXT NOT NULL,
      audio_url TEXT,
      audio_data TEXT,
      duration_seconds INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER,
      admin_name TEXT,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Crear Super Admin Mauricio solo si no existe
  db.get("SELECT id FROM users WHERE name = 'Mauricio' OR is_superadmin = 1", (err, row) => {
    if (!row) {
      const defaultPassword = '123';
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(defaultPassword, salt);
      db.run(
        `INSERT INTO users (username, rut, name, email, password_hash, role, is_superadmin, qr_token, gps_tracking_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['mauricio', '12.345.678-9', 'Mauricio', 'mauricio@asistentruck.cl', hash, 'superadmin', 1, 'QR_MAURICIO_041118', 0],
        (insertErr) => {
          if (insertErr) console.error('Error creando Super Admin Mauricio:', insertErr.message);
          else console.log('Super Admin listo: Mauricio (Usuario: mauricio, Clave: 123)');
        }
      );
    } else {
      db.run("UPDATE users SET username = 'mauricio' WHERE id = ? AND (username IS NULL OR username = '')", [row.id]);
    }
  });

  // Restaurar respaldo persistente si existe al iniciar el servidor (Para evitar borrado en reinicios de Render)
  const persistentBackupPath = path.join(__dirname, 'asistencia_persistent_backup.json');
  if (fs.existsSync(persistentBackupPath)) {
    try {
      const content = fs.readFileSync(persistentBackupPath, 'utf8');
      const data = JSON.parse(content);
      if (data && Array.isArray(data.users)) {
        for (let u of data.users) {
          db.run(
            `INSERT OR IGNORE INTO users (id, username, rut, name, email, password_hash, plain_password, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [u.id, u.username, u.rut, u.name, u.email, u.password_hash, u.plain_password || '123', u.role, u.is_superadmin ? 1 : 0, u.photo_url, u.qr_token, u.gps_tracking_enabled ? 1 : 0, u.created_at || new Date().toISOString()]
          );
        }
      }
      if (data && Array.isArray(data.attendance)) {
        for (let a of data.attendance) {
          db.run(
            `INSERT OR IGNORE INTO attendance (id, user_id, date, entry_time, lunch_out_time, lunch_in_time, exit_time, total_hours, modified_by_admin, admin_note, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [a.id, a.user_id, a.date, a.entry_time, a.lunch_out_time, a.lunch_in_time, a.exit_time, a.total_hours || 0, a.modified_by_admin ? 1 : 0, a.admin_note, a.created_at, a.updated_at]
          );
        }
      }
      if (data && Array.isArray(data.voice_messages)) {
        for (let v of data.voice_messages) {
          db.run(
            `INSERT OR IGNORE INTO voice_messages (id, sender_id, sender_name, sender_photo, receiver_ids, receiver_names, audio_url, audio_data, duration_seconds, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [v.id, v.sender_id, v.sender_name, v.sender_photo, v.receiver_ids, v.receiver_names, v.audio_url, v.audio_data, v.duration_seconds || 0, v.created_at || new Date().toISOString()]
          );
        }
      }
      console.log('Respaldo persistente de datos y audios cargado correctamente.');
    } catch (e) {
      console.warn('Advertencia restaurando persistent backup:', e);
    }
  }
});

module.exports = db;
