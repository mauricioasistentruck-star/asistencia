const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const uploadsDir = path.join(__dirname, 'uploads');
const audioUploadsDir = path.join(uploadsDir, 'audio');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(audioUploadsDir)) {
  fs.mkdirSync(audioUploadsDir, { recursive: true });
}

const tursoUrl = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL;
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN;

let db;

if (tursoUrl) {
  console.log('================================================================');
  console.log('[DATABASE] Modo TURSO CLOUD DATABASE 24/7 ACTIVO');
  console.log('[DATABASE] URL:', tursoUrl);
  console.log('================================================================');

  const { createClient } = require('@libsql/client');
  const client = createClient({
    url: tursoUrl,
    authToken: tursoAuthToken
  });

  const sanitizeArgs = (args) => {
    if (!args) return [];
    if (!Array.isArray(args)) {
      if (typeof args === 'object') return args;
      return [args];
    }
    return args.map((v) => (v === undefined ? null : v));
  };

  db = {
    isTurso: true,
    client: client,
    serialize: (cb) => {
      if (typeof cb === 'function') cb();
    },
    run: function (sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      const args = sanitizeArgs(params);
      client
        .execute({ sql, args })
        .then((result) => {
          if (typeof callback === 'function') {
            const ctx = {
              lastID: result.lastInsertRowid !== undefined && result.lastInsertRowid !== null ? Number(result.lastInsertRowid) : 0,
              changes: result.rowsAffected !== undefined && result.rowsAffected !== null ? Number(result.rowsAffected) : 0
            };
            callback.call(ctx, null);
          }
        })
        .catch((err) => {
          if (typeof callback === 'function') {
            const ctx = { lastID: 0, changes: 0 };
            callback.call(ctx, err);
          } else {
            console.error('[TURSO ERROR]', err.message, 'SQL:', sql);
          }
        });
      return this;
    },
    get: function (sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      const args = sanitizeArgs(params);
      client
        .execute({ sql, args })
        .then((result) => {
          const row = result.rows && result.rows.length > 0 ? result.rows[0] : undefined;
          if (typeof callback === 'function') {
            callback(null, row);
          }
        })
        .catch((err) => {
          if (typeof callback === 'function') {
            callback(err, null);
          } else {
            console.error('[TURSO ERROR]', err.message, 'SQL:', sql);
          }
        });
      return this;
    },
    all: function (sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      const args = sanitizeArgs(params);
      client
        .execute({ sql, args })
        .then((result) => {
          const rows = result.rows || [];
          if (typeof callback === 'function') {
            callback(null, rows);
          }
        })
        .catch((err) => {
          if (typeof callback === 'function') {
            callback(err, null);
          } else {
            console.error('[TURSO ERROR]', err.message, 'SQL:', sql);
          }
        });
      return this;
    },
    each: function (sql, params, rowCallback, completeCallback) {
      if (typeof params === 'function') {
        completeCallback = rowCallback;
        rowCallback = params;
        params = [];
      }
      this.all(sql, params, (err, rows) => {
        if (err) {
          if (typeof completeCallback === 'function') completeCallback(err);
          return;
        }
        if (Array.isArray(rows) && typeof rowCallback === 'function') {
          rows.forEach((r) => rowCallback(null, r));
        }
        if (typeof completeCallback === 'function') {
          completeCallback(null, rows ? rows.length : 0);
        }
      });
      return this;
    },
    close: function (callback) {
      if (typeof callback === 'function') callback(null);
    }
  };
} else {
  console.log('================================================================');
  console.log('[DATABASE] Modo LOCAL SQLITE (asistencia.db)');
  console.log('[DATABASE] Para persistencia permanente 24/7 en Render, configure');
  console.log('[DATABASE] TURSO_DATABASE_URL y TURSO_AUTH_TOKEN');
  console.log('================================================================');

  const sqlite3 = require('sqlite3').verbose();
  const dbFilePath = path.join(__dirname, 'asistencia.db');
  db = new sqlite3.Database(dbFilePath, (err) => {
    if (err) {
      console.error('Error al conectar con SQLite local:', err.message);
    } else {
      console.log('Conectado exitosamente a SQLite local: asistencia.db');
    }
  });
}

// Inicialización de esquemas y tablas
function initDatabase() {
  db.serialize(() => {
    if (!db.isTurso) {
      db.run("PRAGMA journal_mode = WAL;", () => {});
      db.run("PRAGMA synchronous = NORMAL;", () => {});
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        rut TEXT UNIQUE,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        plain_password TEXT DEFAULT '123',
        role TEXT NOT NULL DEFAULT 'worker',
        is_superadmin INTEGER NOT NULL DEFAULT 0,
        photo_url TEXT,
        qr_token TEXT UNIQUE NOT NULL,
        gps_tracking_enabled INTEGER NOT NULL DEFAULT 0,
        has_credential INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, () => {
      db.run("ALTER TABLE users ADD COLUMN username TEXT", () => {});
      db.run("ALTER TABLE users ADD COLUMN plain_password TEXT", () => {});
      db.run("ALTER TABLE users ADD COLUMN has_credential INTEGER DEFAULT 1", () => {});
    });

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

    db.run(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, () => {
      const defaultSchedule = JSON.stringify({
        monday_thursday: { entry: "09:00", exit: "18:00", lunch_minutes: 30 },
        friday: { entry: "09:00", exit: "17:30", lunch_minutes: 30 }
      });
      db.run("INSERT OR IGNORE INTO system_settings (key, value) VALUES ('work_schedule', ?)", [defaultSchedule]);
    });

    // SÓLO sembrar datos iniciales si la tabla de usuarios está completamente vacía
    db.get("SELECT COUNT(*) as count FROM users", (cntErr, row) => {
      const userCount = row ? (row.count !== undefined ? row.count : row['COUNT(*)']) : 0;
      if (userCount === 0) {
        console.log('[DATABASE] Base de datos nueva detectada. Sembrando usuarios iniciales...');
        const persistentBackupPath = path.join(__dirname, 'asistencia_persistent_backup.json');
        if (fs.existsSync(persistentBackupPath)) {
          try {
            const content = fs.readFileSync(persistentBackupPath, 'utf8');
            const data = JSON.parse(content);
            if (data && Array.isArray(data.users)) {
              for (let u of data.users) {
                const hasCred = (u.has_credential !== undefined && u.has_credential !== null) ? (u.has_credential ? 1 : 0) : 1;
                const gpsVal = (u.gps_tracking_enabled === 1 || u.gps_tracking_enabled === true || u.gps_tracking_enabled === '1') ? 1 : 0;
                const cleanName = (u.name || '').trim();
                const cleanUser = (u.username || cleanName.toLowerCase().replace(/\s+/g, '')).trim();
                const qrToken = u.qr_token || ('QR_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9).toUpperCase());
                
                db.run(
                  `INSERT OR IGNORE INTO users (id, username, rut, name, email, password_hash, plain_password, role, is_superadmin, photo_url, qr_token, gps_tracking_enabled, has_credential, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [u.id || null, cleanUser, u.rut || null, cleanName, u.email, u.password_hash || defaultHash, u.plain_password || '123', u.role || 'worker', u.is_superadmin ? 1 : 0, u.photo_url || null, qrToken, gpsVal, hasCred, u.created_at || new Date().toISOString()]
                );
              }
            }
          } catch (e) {
            console.warn('Advertencia sembrando usuarios iniciales:', e);
          }
        }
      } else {
        console.log(`[DATABASE] Base de datos lista con ${userCount} usuarios existentes. (No se sobreescriben datos)`);
      }
    });
  });
}

initDatabase();

module.exports = db;
