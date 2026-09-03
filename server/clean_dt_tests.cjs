const fs = require('fs');
const path = require('path');
const db = require('./server/database');

const dbPath = path.join(__dirname, 'asistencia.db');
const backupPath = path.join(__dirname, 'asistencia_backup_pre_pruebas.db');

// 1. Crear respaldo seguro del estado actual de la base de datos
try {
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, backupPath);
    console.log(`[GUARDADO EXITOSO] Copia de seguridad guardada en: ${backupPath}`);
  }
} catch (e) {
  console.error('Error al respaldar base de datos:', e);
}

// 2. Limpiar todas las solicitudes y sesiones de prueba de fiscalización DT
db.serialize(() => {
  db.run("DELETE FROM dt_access_tokens", function(err) {
    console.log(`dt_access_tokens purgado: ${this ? this.changes : 0} registros eliminados.`);
  });

  db.run("DELETE FROM dt_audit_sessions", function(err) {
    console.log(`dt_audit_sessions purgado: ${this ? this.changes : 0} registros eliminados.`);
  });

  db.run("DELETE FROM dt_download_logs", function(err) {
    console.log(`dt_download_logs purgado: ${this ? this.changes : 0} registros eliminados.`);
  });

  db.run("DELETE FROM audit_logs WHERE action LIKE '%DT%'", function(err) {
    console.log(`audit_logs (acciones DT) purgado: ${this ? this.changes : 0} registros eliminados.`);
    console.log('[SISTEMA LIMPIO] Todas las solicitudes y pruebas de fiscalización inventadas han sido eliminadas.');
    process.exit(0);
  });
});