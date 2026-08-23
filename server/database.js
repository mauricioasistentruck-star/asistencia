const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const dbPath = path.join(__dirname, 'asistencia.db');
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
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
});

module.exports = db;
