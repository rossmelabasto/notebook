// routes/ask.js — preguntar a los apuntes (respuesta en streaming por SSE) y conversaciones guardadas
import { Router } from 'express';
import { db } from '../lib/db.js';
import { fail, intParam, limiter, requireAuth, HttpError } from '../lib/http.js';
import { answerQuestion } from '../lib/rag/answer.js';
import { searchMessages } from '../lib/rag/search.js';
import { spendDemo } from '../lib/demo.js';

export const router = Router();
router.use(requireAuth);

function parseScope(userId, raw) {
  if (raw === undefined || raw === null || raw === '' || raw === 'all') return {};
  if (raw === 'general' || raw === 'orphaned') return { subject: raw };
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || !db.prepare('SELECT 1 FROM subjects WHERE id = ? AND user_id = ?').get(id, userId)) {
    fail(400, 'bad_subject', 'Invalid subject');
  }
  return { subject: id };
}

function ownConvo(userId, id) {
  const c = db.prepare('SELECT id, title, created_at, updated_at FROM convos WHERE id = ? AND user_id = ?').get(intParam(id), userId);
  if (!c) fail(404, 'convo_not_found', 'Conversation not found');
  return c;
}

/* ---------- conversaciones ---------- */

router.get('/convos', (req, res) => {
  const convos = db
    .prepare(
      `SELECT c.id, c.title, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM convo_messages m WHERE m.convo_id = c.id) AS msg_count
         FROM convos c WHERE c.user_id = ? ORDER BY c.updated_at DESC`
    )
    .all(req.user.id);
  res.json({ convos });
});

router.post('/convos', (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 200) || 'New chat';
  const info = db.prepare('INSERT INTO convos (user_id, title) VALUES (?, ?)').run(req.user.id, title);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

router.put('/convos/:id', (req, res) => {
  const c = ownConvo(req.user.id, req.params.id);
  const title = String(req.body?.title || '').trim().slice(0, 200);
  if (!title) fail(400, 'empty_title', 'Title cannot be empty');
  db.prepare("UPDATE convos SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title, c.id);
  res.json({ ok: true });
});

router.delete('/convos/:id', (req, res) => {
  const c = ownConvo(req.user.id, req.params.id);
  db.prepare('DELETE FROM convos WHERE id = ?').run(c.id);
  res.json({ ok: true });
});

router.get('/convos/:id', (req, res) => {
  const convo = ownConvo(req.user.id, req.params.id);
  const messages = db
    .prepare('SELECT id, role, content, sources_json, created_at FROM convo_messages WHERE convo_id = ? ORDER BY id')
    .all(convo.id)
    .map(({ sources_json, ...m }) => ({ ...m, sources: sources_json ? JSON.parse(sources_json) : [] }));
  res.json({ convo, messages });
});

/* ---------- preguntar (SSE) ---------- */

// POST /api/ask { question, subject_id?, convo_id? } → text/event-stream
// eventos: query, sources, delta, done, error
router.post('/ask', limiter('ask', 15, 60_000), async (req, res) => {
  const question = String(req.body?.question || '').trim();
  if (!question || question.length > 2000) fail(400, 'bad_question', 'Invalid question');
  const scope = parseScope(req.user.id, req.body?.subject_id);
  const convo = req.body?.convo_id ? ownConvo(req.user.id, req.body.convo_id) : null;
  spendDemo(req.user, 'ask');
  const history = convo
    ? db.prepare('SELECT role, content FROM convo_messages WHERE convo_id = ? ORDER BY id DESC LIMIT 6').all(convo.id).reverse()
    : [];

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  // comentario periódico para que ningún proxy corte la conexión mientras el modelo piensa
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);

  const ac = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ac.abort(); });

  try {
    const result = await answerQuestion({
      userId: req.user.id,
      question,
      scope,
      history,
      signal: ac.signal,
      onEvent: (type, data) => send(type, data),
    });
    const answer = result.insufficient ? null : result.answer;
    let answerMessageId = null;
    if (convo && !ac.signal.aborted) {
      const stored = answer ?? 'I do not have enough information in your notes to answer that.';
      db.prepare("INSERT INTO convo_messages (convo_id, role, content) VALUES (?, 'user', ?)").run(convo.id, question);
      answerMessageId = Number(
        db.prepare("INSERT INTO convo_messages (convo_id, role, content, sources_json) VALUES (?, 'assistant', ?, ?)")
          .run(convo.id, stored, JSON.stringify(result.sources || [])).lastInsertRowid
      );
      // primer mensaje → el chat toma el nombre de la pregunta
      const title = convo.title === 'New chat' ? question.replace(/\s+/g, ' ').slice(0, 60) : convo.title;
      db.prepare("UPDATE convos SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title, convo.id);
    }
    send('done', {
      insufficient: !!result.insufficient,
      answer,
      sources: result.sources,
      provider: result.provider || null,
      query: result.query,
      answerMessageId,
    });
  } catch (err) {
    if (!ac.signal.aborted) {
      console.error('[ask]', err.status || '', err.message);
      const busy = err.status === 429;
      send('error', {
        code: err instanceof HttpError ? err.code : busy ? 'ai_busy' : 'ai_error',
        error: busy ? 'The AI is busy right now, try again in a minute.' : 'The AI could not answer. Try again.',
      });
    }
  } finally {
    clearInterval(ping);
    res.end();
  }
});

/* ---------- búsqueda global por palabras ---------- */

router.get('/search', limiter('search', 120, 60_000), (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 200);
  if (!q) return res.json({ results: [] });
  const scope = parseScope(req.user.id, req.query.subject_id);
  res.json({ results: searchMessages(req.user.id, q, { scope, limit: 50 }) });
});
