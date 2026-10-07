// lib/auth.js — contraseñas (scrypt) y sesiones (cookie con token; en la base solo su hash)
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db, sha256 } from './db.js';
import { config } from './config.js';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return test.length === expected.length && timingSafeEqual(test, expected);
}

// Para que "usuario inexistente" tarde lo mismo que "contraseña incorrecta"
const DUMMY_HASH = hashPassword(randomBytes(12).toString('hex'));
export function verifyDummy(password) {
  verifyPassword(password, DUMMY_HASH);
  return false;
}

export function createSession(userId, { userAgent = '', ip = '' } = {}) {
  const token = randomBytes(32).toString('hex');
  db.prepare(
    `INSERT INTO sessions (token, user_id, expires_at, user_agent, ip, last_seen)
     VALUES (?, ?, datetime('now', ?), ?, ?, datetime('now'))`
  ).run(sha256(token), userId, `+${config.sessionDays} days`, String(userAgent).slice(0, 300), String(ip).slice(0, 64));
  return token;
}

const touchStmt = () =>
  db.prepare(
    `UPDATE sessions SET last_seen = datetime('now'), expires_at = datetime('now', ?), ip = COALESCE(?, ip)
      WHERE token = ?`
  );

/** Devuelve el usuario de la sesión y la renueva (como mucho una vez por hora) */
export function getUserBySession(token, ip = null) {
  if (!token) return null;
  const hashed = sha256(token);
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.is_admin, s.last_seen,
              (s.last_seen < datetime('now', '-1 hour')) AS stale
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > datetime('now')`
    )
    .get(hashed);
  if (!row) return null;
  if (row.stale || !row.last_seen) touchStmt().run(`+${config.sessionDays} days`, ip, hashed);
  return { id: row.id, username: row.username, is_admin: row.is_admin, sessionId: hashed.slice(0, 16) };
}

export function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(sha256(token));
}

export function listSessions(userId) {
  return db
    .prepare(
      `SELECT substr(token, 1, 16) AS id, user_agent, ip, created_at, last_seen
         FROM sessions WHERE user_id = ? AND expires_at > datetime('now')
        ORDER BY last_seen DESC`
    )
    .all(userId);
}

export function revokeSession(userId, sessionId) {
  return db
    .prepare('DELETE FROM sessions WHERE user_id = ? AND substr(token, 1, 16) = ?')
    .run(userId, String(sessionId)).changes;
}

export function revokeOtherSessions(userId, keepSessionId) {
  return db
    .prepare('DELETE FROM sessions WHERE user_id = ? AND substr(token, 1, 16) <> ?')
    .run(userId, String(keepSessionId)).changes;
}

export function revokeAllSessions(userId) {
  return db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId).changes;
}

export function cleanupExpiredSessions() {
  return db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run().changes;
}

export function userCount() {
  return db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
}

export const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

export function isValidPassword(pw) {
  return typeof pw === 'string' && pw.length >= 8 && pw.length <= 128;
}
