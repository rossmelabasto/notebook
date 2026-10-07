// server.js — arranque del Notebook: escucha en localhost y retoma los trabajos pendientes
import { config } from './lib/config.js';
import { createApp } from './app.js';
import { resumeJobs } from './lib/jobs.js';
import { cleanupExpiredSessions } from './lib/auth.js';
import { db } from './lib/db.js';

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  console.log(`[notebook] escuchando en http://${config.host}:${config.port}`);
  resumeJobs();
  cleanupExpiredSessions();
  setInterval(cleanupExpiredSessions, 24 * 3600 * 1000).unref();
});

// Apagado limpio (systemd manda SIGTERM): cerrar conexiones y la base
function shutdown(sig) {
  console.log(`[notebook] ${sig}, cerrando…`);
  server.close(() => {
    try { db.close(); } catch { /* ya cerrada */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
