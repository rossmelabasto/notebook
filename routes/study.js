// routes/study.js — resúmenes, flashcards y quizzes generados desde un apunte o una materia
import { Router } from 'express';
import { db } from '../lib/db.js';
import { fail, intParam, limiter, requireAuth } from '../lib/http.js';
import { createStudySet } from '../lib/study.js';

export const router = Router();
router.use(requireAuth);

function scopeFromBody(userId, body) {
  if (body?.note_id) {
    const id = intParam(body.note_id);
    if (!db.prepare('SELECT 1 FROM notes WHERE id = ? AND user_id = ?').get(id, userId)) fail(404, 'note_not_found', 'Note not found');
    return { noteId: id };
  }
  const s = body?.subject_id;
  if (s === 'general' || s === 'orphaned') return { subject: s };
  if (s !== undefined && s !== null && s !== '' && s !== 'all') {
    const id = intParam(s);
    if (!db.prepare('SELECT 1 FROM subjects WHERE id = ? AND user_id = ?').get(id, userId)) fail(400, 'bad_subject', 'Invalid subject');
    return { subject: id };
  }
  return {};
}

router.get('/study', (req, res) => {
  const where = ['user_id = ?'];
  const params = [req.user.id];
  if (req.query.note_id) { where.push('note_id = ?'); params.push(intParam(req.query.note_id)); }
  if (req.query.subject_id && /^\d+$/.test(req.query.subject_id)) { where.push('subject_id = ?'); params.push(Number(req.query.subject_id)); }
  const sets = db
    .prepare(`SELECT id, note_id, subject_id, kind, title, topic, created_at FROM study_sets WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 100`)
    .all(...params);
  res.json({ sets });
});

router.get('/study/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM study_sets WHERE id = ? AND user_id = ?').get(intParam(req.params.id), req.user.id);
  if (!s) fail(404, 'study_not_found', 'Not found');
  const { data_json, ...rest } = s;
  res.json({ set: { ...rest, data: JSON.parse(data_json) } });
});

router.post('/study', limiter('study', 6, 60_000), async (req, res) => {
  const kind = String(req.body?.kind || '');
  const topic = String(req.body?.topic || '').trim().slice(0, 200);
  const lang = req.body?.lang === 'en' ? 'en' : 'es';
  const scope = scopeFromBody(req.user.id, req.body);
  const set = await createStudySet({ userId: req.user.id, kind, scope, topic, lang, title: req.body?.title });
  res.json({ set });
});

router.delete('/study/:id', (req, res) => {
  const info = db.prepare('DELETE FROM study_sets WHERE id = ? AND user_id = ?').run(intParam(req.params.id), req.user.id);
  if (!info.changes) fail(404, 'study_not_found', 'Not found');
  res.json({ ok: true });
});
