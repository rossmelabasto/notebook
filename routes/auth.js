// routes/auth.js — setup inicial, login/logout, perfil, contraseña y sesiones abiertas
import { Router } from 'express';
import { db } from '../lib/db.js';
import { config } from '../lib/config.js';
import {
  hashPassword, verifyPassword, verifyDummy, createSession, destroySession, userCount,
  USERNAME_RE, isValidPassword, listSessions, revokeSession, revokeOtherSessions,
} from '../lib/auth.js';
import {
  COOKIE, fail, limiter, parseCookies, requireAuth, setSessionCookie, clientIp, wrap,
} from '../lib/http.js';
import { createDemoUser, deleteUserWithFiles, demoInfo, checkDemo } from '../lib/demo.js';
import { getUserBySession } from '../lib/auth.js';
import { scheduleIndex } from '../lib/jobs.js';

export const router = Router();

const newSession = (req, res, userId) => {
  const token = createSession(userId, { userAgent: req.headers['user-agent'], ip: clientIp(req) });
  setSessionCookie(req, res, token, config.sessionDays);
};
const publicUser = (u) => ({ id: u.id, username: u.username, isAdmin: !!u.is_admin, isDemo: !!u.isDemo, demo: demoInfo(u) });

router.get('/bootstrap', (req, res) => {
  res.json({ needsSetup: userCount() === 0, demo: config.demoEnabled });
});

router.post('/setup', limiter('setup', 5, 60_000, clientIp), (req, res) => {
  if (userCount() !== 0) fail(400, 'already_setup', 'A user is already registered');
  const { token, username, password } = req.body || {};
  if (!config.setupToken || token !== config.setupToken) fail(403, 'bad_setup_token', 'Setup token is incorrect');
  if (!USERNAME_RE.test(String(username || ''))) fail(400, 'bad_username', 'Invalid username');
  if (!isValidPassword(password)) fail(400, 'bad_password', 'Invalid password (min 8 characters)');
  const info = db
    .prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)')
    .run(String(username).trim(), hashPassword(password));
  const id = Number(info.lastInsertRowid);
  newSession(req, res, id);
  res.json({ ok: true, user: { id, username: String(username).trim(), isAdmin: true } });
});

// Límite por IP y por nombre de usuario (frena fuerza bruta distribuida contra una cuenta)
router.post(
  '/login',
  limiter('login-ip', 10, 5 * 60_000, clientIp),
  limiter('login-user', 10, 15 * 60_000, (req) => String(req.body?.username || '').toLowerCase().trim()),
  (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
    const ok = user ? verifyPassword(password, user.password_hash) : verifyDummy(password);
    if (!ok) fail(401, 'bad_credentials', 'Wrong username or password');
    newSession(req, res, user.id);
    res.json({ ok: true, user: publicUser(user) });
  }
);

// Demo pública: cuenta temporal con apuntes de ejemplo (máx. 3 por IP y hora)
router.post('/demo', limiter('demo', 3, 60 * 60_000, clientIp), (req, res) => {
  const { id, username, noteIds } = createDemoUser(req.body?.lang === 'en' ? 'en' : 'es');
  const token = createSession(id, { userAgent: req.headers['user-agent'], ip: clientIp(req), hours: config.demoHours });
  setSessionCookie(req, res, token, config.demoHours / 24);
  noteIds.forEach((n, i) => scheduleIndex(n, 500 + i * 300));
  res.json({ ok: true, user: { id, username, isAdmin: false, isDemo: true }, openNote: noteIds.at(-1) });
});

router.post('/logout', (req, res) => {
  // salir de la demo = borrar la cuenta temporal con todo lo suyo
  const u = getUserBySession(parseCookies(req)[COOKIE]);
  if (u?.isDemo) deleteUserWithFiles(u.id);
  destroySession(parseCookies(req)[COOKIE]);
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json(publicUser(req.user));
});

router.put(
  '/me/password',
  requireAuth,
  limiter('pw', 5, 15 * 60_000),
  (req, res) => {
    checkDemo(req.user, 'blocked');
    const { current, password } = req.body || {};
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!verifyPassword(String(current || ''), row.password_hash)) fail(403, 'bad_current_password', 'Current password is wrong');
    if (!isValidPassword(password)) fail(400, 'bad_password', 'Invalid password (min 8 characters)');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), req.user.id);
    const closed = revokeOtherSessions(req.user.id, req.user.sessionId);
    res.json({ ok: true, closedSessions: closed });
  }
);

router.get('/sessions', requireAuth, (req, res) => {
  const sessions = listSessions(req.user.id).map((s) => ({ ...s, current: s.id === req.user.sessionId }));
  res.json({ sessions });
});

router.delete('/sessions/:id', requireAuth, wrap(async (req, res) => {
  if (req.params.id === 'others') {
    return res.json({ ok: true, closed: revokeOtherSessions(req.user.id, req.user.sessionId) });
  }
  if (!revokeSession(req.user.id, req.params.id)) fail(404, 'session_not_found', 'Session not found');
  res.json({ ok: true });
}));
