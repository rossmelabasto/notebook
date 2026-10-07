// routes/admin.js — gestión de usuarios y estado del sistema (solo admin)
import { Router } from 'express';
import { db } from '../lib/db.js';
import { config } from '../lib/config.js';
import { hashPassword, USERNAME_RE, isValidPassword, revokeAllSessions } from '../lib/auth.js';
import { fail, intParam, limiter, requireAdmin, requireAuth } from '../lib/http.js';
import { userFiles, unlinkQuiet } from '../lib/media.js';
import { queueStats } from '../lib/jobs.js';
import { embedSpace } from '../lib/llm.js';

export const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/users', (req, res) => {
  const users = db
    .prepare(
      `SELECT u.id, u.username, u.is_admin, u.created_at,
              (SELECT COUNT(*) FROM notes n WHERE n.user_id = u.id) AS notes,
              (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id) AS messages,
              (SELECT MAX(last_seen) FROM sessions s WHERE s.user_id = u.id) AS last_seen
         FROM users u ORDER BY u.id`
    )
    .all()
    .map((u) => ({ ...u, isAdmin: !!u.is_admin }));
  res.json({ users });
});

router.post('/users', limiter('users', 10, 60_000), (req, res) => {
  const { username, password } = req.body || {};
  if (!USERNAME_RE.test(String(username || ''))) fail(400, 'bad_username', 'Invalid username');
  if (!isValidPassword(password)) fail(400, 'bad_password', 'Invalid password (min 8 characters)');
  try {
    const info = db
      .prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 0)')
      .run(String(username).trim(), hashPassword(password));
    res.json({ ok: true, id: Number(info.lastInsertRowid) });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) fail(409, 'user_exists', 'That user already exists');
    throw err;
  }
});

// Resetear la contraseña de otro usuario (cierra todas sus sesiones)
router.put('/users/:id/password', (req, res) => {
  const id = intParam(req.params.id);
  if (!isValidPassword(req.body?.password)) fail(400, 'bad_password', 'Invalid password (min 8 characters)');
  const info = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(req.body.password), id);
  if (!info.changes) fail(404, 'user_not_found', 'User not found');
  revokeAllSessions(id);
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  const id = intParam(req.params.id);
  if (id === req.user.id) fail(400, 'cannot_delete_self', 'You cannot delete your own account');
  const files = userFiles(id);
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(id); // cascada: notas, mensajes, sesiones...
  if (!info.changes) fail(404, 'user_not_found', 'User not found');
  files.forEach(unlinkQuiet);
  res.json({ ok: true, deletedFiles: files.length });
});

router.get('/status', (req, res) => {
  const count = (sql) => db.prepare(sql).get().c;
  res.json({
    queues: queueStats(),
    counts: {
      users: count('SELECT COUNT(*) AS c FROM users'),
      notes: count('SELECT COUNT(*) AS c FROM notes'),
      messages: count('SELECT COUNT(*) AS c FROM messages'),
      chunks: count('SELECT COUNT(*) AS c FROM chunks'),
      notIndexed: count('SELECT COUNT(*) AS c FROM notes WHERE embedded = 0'),
      imagesPending: count("SELECT COUNT(*) AS c FROM images WHERE status = 'pending'"),
      audiosPending: count("SELECT COUNT(*) AS c FROM audios WHERE status = 'pending'"),
    },
    models: {
      chat: config.groqKey ? `groq:${config.chatModel}` : null,
      fallback: config.geminiKey ? `gemini:${config.chatModelGemini}` : null,
      embeddings: embedSpace(),
      vision: config.geminiKey ? `gemini:${config.visionModelGemini}` : `openai:${config.visionModel}`,
      transcription: config.transcribeModel,
    },
    uptimeSec: Math.round(process.uptime()),
  });
});
