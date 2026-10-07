// routes/notes.js — materias, apuntes, mensajes del hilo y exportación
import { Router } from 'express';
import AdmZip from 'adm-zip';
import { existsSync } from 'node:fs';
import { db, tx } from '../lib/db.js';
import { fail, intParam, limiter, requireAuth } from '../lib/http.js';
import { noteFiles, unlinkQuiet } from '../lib/media.js';
import { scheduleIndex } from '../lib/jobs.js';
import { noteToMarkdown, safeFileName } from '../lib/export.js';

export const router = Router();
router.use(requireAuth);

/* ---------- helpers ---------- */

export function ownNote(userId, id) {
  const note = db
    .prepare('SELECT id, title, subject_id, orphaned, embedded, created_at, updated_at FROM notes WHERE id = ? AND user_id = ?')
    .get(intParam(id), userId);
  if (!note) fail(404, 'note_not_found', 'Note not found');
  return note;
}

/** Valida subject_id del cliente: null/'' = General; si no es suyo → 400 */
function subjectFromBody(userId, raw) {
  if (raw === undefined || raw === null || raw === '' || raw === 'general') return null;
  const id = Number(raw);
  const row = Number.isSafeInteger(id) && db.prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) fail(400, 'bad_subject', 'Invalid subject');
  return id;
}

export const MESSAGE_SELECT = `
  SELECT m.id, m.kind, m.content, m.sender, m.starred, m.created_at,
         i.id AS image_id, i.filename, i.mime, i.status, i.ocr_text, i.description,
         a.id AS audio_id, a.status AS audio_status, a.transcript
    FROM messages m
    LEFT JOIN images i ON i.id = m.image_id
    LEFT JOIN audios a ON a.id = m.audio_id`;

// Para exportar hacen falta las rutas de los archivos (no se mandan al cliente)
const EXPORT_SELECT = MESSAGE_SELECT.replace('i.description,', 'i.description, i.stored_path AS image_path, a.stored_path AS audio_path,');

const touchNote = (noteId) => db.prepare("UPDATE notes SET updated_at = datetime('now') WHERE id = ?").run(noteId);

/* ---------- materias ---------- */

router.get('/subjects', (req, res) => {
  const subjects = db
    .prepare(
      `SELECT s.id, s.name, s.created_at, COUNT(n.id) AS note_count
         FROM subjects s LEFT JOIN notes n ON n.subject_id = s.id
        WHERE s.user_id = ? GROUP BY s.id ORDER BY s.name COLLATE NOCASE`
    )
    .all(req.user.id);
  const c = (sql) => db.prepare(sql).get(req.user.id).c;
  res.json({
    subjects,
    generalCount: c('SELECT COUNT(*) AS c FROM notes WHERE user_id = ? AND subject_id IS NULL AND orphaned = 0'),
    orphanedCount: c('SELECT COUNT(*) AS c FROM notes WHERE user_id = ? AND orphaned = 1'),
    totalCount: c('SELECT COUNT(*) AS c FROM notes WHERE user_id = ?'),
  });
});

const subjectName = (body) => {
  const name = String(body?.name || '').trim().slice(0, 60);
  if (!name) fail(400, 'bad_name', 'Invalid name');
  return name;
};
const uniqueGuard = (fn) => {
  try {
    return fn();
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) fail(409, 'subject_exists', 'You already have a subject with that name');
    throw err;
  }
};

router.post('/subjects', (req, res) => {
  const name = subjectName(req.body);
  const info = uniqueGuard(() => db.prepare('INSERT INTO subjects (user_id, name) VALUES (?, ?)').run(req.user.id, name));
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

router.put('/subjects/:id', (req, res) => {
  const name = subjectName(req.body);
  const info = uniqueGuard(() =>
    db.prepare('UPDATE subjects SET name = ? WHERE id = ? AND user_id = ?').run(name, intParam(req.params.id), req.user.id)
  );
  if (!info.changes) fail(404, 'subject_not_found', 'Subject not found');
  res.json({ ok: true });
});

router.delete('/subjects/:id', (req, res) => {
  const id = intParam(req.params.id);
  const deleteNotes = req.body?.deleteNotes === true;
  if (!db.prepare('SELECT 1 FROM subjects WHERE id = ? AND user_id = ?').get(id, req.user.id)) {
    fail(404, 'subject_not_found', 'Subject not found');
  }
  let files = [];
  tx(() => {
    if (deleteNotes) {
      const ids = db.prepare('SELECT id FROM notes WHERE subject_id = ? AND user_id = ?').all(id, req.user.id);
      for (const n of ids) files.push(...noteFiles(n.id));
      db.prepare('DELETE FROM notes WHERE subject_id = ? AND user_id = ?').run(id, req.user.id);
    } else {
      db.prepare('UPDATE notes SET subject_id = NULL, orphaned = 1 WHERE subject_id = ? AND user_id = ?').run(id, req.user.id);
    }
    db.prepare('DELETE FROM subjects WHERE id = ? AND user_id = ?').run(id, req.user.id);
  });
  files.forEach(unlinkQuiet);
  res.json({ ok: true, movedToUnfiled: !deleteNotes, deletedNotes: deleteNotes });
});

/* ---------- apuntes ---------- */

router.get('/notes', (req, res) => {
  const { subject_id } = req.query;
  let sql = `
    SELECT n.id, n.title, n.embedded, n.subject_id, n.orphaned, n.created_at, n.updated_at,
           (SELECT COUNT(*) FROM messages WHERE note_id = n.id) AS message_count,
           (SELECT COUNT(*) FROM messages WHERE note_id = n.id AND starred = 1) AS starred_count,
           lm.kind AS last_kind, substr(lm.content, 1, 120) AS snippet
      FROM notes n
      LEFT JOIN messages lm ON lm.id = (SELECT MAX(id) FROM messages WHERE note_id = n.id)
     WHERE n.user_id = ?`;
  const params = [req.user.id];
  if (subject_id === 'general') sql += ' AND n.subject_id IS NULL AND n.orphaned = 0';
  else if (subject_id === 'orphaned') sql += ' AND n.orphaned = 1';
  else if (subject_id !== undefined && subject_id !== '' && subject_id !== 'all') {
    sql += ' AND n.subject_id = ?';
    params.push(intParam(subject_id, 'bad_subject'));
  }
  sql += ' ORDER BY n.updated_at DESC';
  res.json({ notes: db.prepare(sql).all(...params) });
});

router.get('/notes/:id', (req, res) => {
  const note = ownNote(req.user.id, req.params.id);
  const messages = db.prepare(`${MESSAGE_SELECT} WHERE m.note_id = ? ORDER BY m.id`).all(note.id);
  res.json({ note: { ...note, messages } });
});

router.post('/notes', limiter('notes', 30, 60_000), (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 200);
  if (!title) fail(400, 'empty_title', 'Title cannot be empty');
  const subjectId = subjectFromBody(req.user.id, req.body?.subject_id);
  const content = String(req.body?.content || '').slice(0, 200_000);
  const noteId = tx(() => {
    const id = Number(
      db.prepare('INSERT INTO notes (user_id, subject_id, title) VALUES (?, ?, ?)').run(req.user.id, subjectId, title).lastInsertRowid
    );
    if (content.trim()) {
      db.prepare("INSERT INTO messages (note_id, user_id, kind, content) VALUES (?, ?, 'text', ?)").run(id, req.user.id, content);
    }
    return id;
  });
  if (content.trim()) scheduleIndex(noteId);
  res.json({ id: noteId });
});

router.put('/notes/:id', limiter('notes', 60, 60_000), (req, res) => {
  const old = ownNote(req.user.id, req.params.id);
  const title = req.body?.title !== undefined ? String(req.body.title).trim().slice(0, 200) : old.title;
  if (!title) fail(400, 'empty_title', 'Title cannot be empty');
  const subjectId = req.body && 'subject_id' in req.body ? subjectFromBody(req.user.id, req.body.subject_id) : old.subject_id;
  // si sale de "Sin carpeta" deja de estar huérfana
  const orphaned = old.subject_id === subjectId ? old.orphaned : 0;
  db.prepare("UPDATE notes SET title = ?, subject_id = ?, orphaned = ?, updated_at = datetime('now') WHERE id = ?")
    .run(title, subjectId, orphaned, old.id);
  // el título forma parte del texto embebido: solo re-indexar si cambió
  if (title !== old.title) scheduleIndex(old.id);
  res.json({ ok: true });
});

router.delete('/notes/:id', (req, res) => {
  const note = ownNote(req.user.id, req.params.id); // primero verificar que es suya
  const files = noteFiles(note.id);
  db.prepare('DELETE FROM notes WHERE id = ?').run(note.id); // cascada + triggers limpian vectores y FTS
  files.forEach(unlinkQuiet);
  res.json({ ok: true });
});

/* ---------- mensajes ---------- */

router.post('/notes/:id/messages', limiter('msg', 90, 60_000), (req, res) => {
  const note = ownNote(req.user.id, req.params.id);
  const raw = Array.isArray(req.body?.content) ? req.body.content : [req.body?.content];
  const texts = raw.map((x) => String(x ?? '').trim()).filter((x) => x.length > 0 && x.length <= 100_000).slice(0, 500);
  if (!texts.length) fail(400, 'empty_message', 'Empty or too long message');
  const ids = tx(() => {
    const ins = db.prepare("INSERT INTO messages (note_id, user_id, kind, content) VALUES (?, ?, 'text', ?)");
    const out = texts.map((t) => Number(ins.run(note.id, req.user.id, t).lastInsertRowid));
    touchNote(note.id);
    return out;
  });
  scheduleIndex(note.id);
  const messages = db.prepare(`${MESSAGE_SELECT} WHERE m.id IN (${ids.map(() => '?').join(',')}) ORDER BY m.id`).all(...ids);
  res.json({ ok: true, messages });
});

function ownMessage(userId, id) {
  const msg = db
    .prepare('SELECT m.* FROM messages m JOIN notes n ON n.id = m.note_id WHERE m.id = ? AND n.user_id = ?')
    .get(intParam(id), userId);
  if (!msg) fail(404, 'message_not_found', 'Message not found');
  return msg;
}

// Estrella y/o editar el texto de un mensaje
router.put('/messages/:id', (req, res) => {
  const msg = ownMessage(req.user.id, req.params.id);
  if (typeof req.body?.starred === 'boolean') {
    db.prepare('UPDATE messages SET starred = ? WHERE id = ?').run(req.body.starred ? 1 : 0, msg.id);
  }
  if (typeof req.body?.content === 'string') {
    const content = req.body.content.trim().slice(0, 100_000);
    if (msg.kind === 'text' && !content) fail(400, 'empty_message', 'Empty message');
    db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, msg.id);
    scheduleIndex(msg.note_id);
  }
  res.json({ ok: true, message: db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(msg.id) });
});

// Borrar un mensaje (si es imagen o audio, también su archivo)
router.delete('/messages/:id', (req, res) => {
  const msg = ownMessage(req.user.id, req.params.id);
  let file = null;
  tx(() => {
    if (msg.image_id) {
      file = db.prepare('SELECT stored_path FROM images WHERE id = ?').get(msg.image_id)?.stored_path;
      db.prepare('DELETE FROM images WHERE id = ?').run(msg.image_id);
    }
    if (msg.audio_id) {
      file = db.prepare('SELECT stored_path FROM audios WHERE id = ?').get(msg.audio_id)?.stored_path;
      db.prepare('DELETE FROM audios WHERE id = ?').run(msg.audio_id);
    }
    db.prepare('DELETE FROM messages WHERE id = ?').run(msg.id);
  });
  unlinkQuiet(file);
  scheduleIndex(msg.note_id);
  res.json({ ok: true });
});

/* ---------- exportar ---------- */

router.get('/notes/:id/export', (req, res) => {
  const note = ownNote(req.user.id, req.params.id);
  const subject = note.subject_id ? db.prepare('SELECT name FROM subjects WHERE id = ?').get(note.subject_id)?.name : null;
  const messages = db.prepare(`${EXPORT_SELECT} WHERE m.note_id = ? ORDER BY m.id`).all(note.id);
  const md = noteToMarkdown(note, subject, messages, { mediaPrefix: null });
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeFileName(note.title))}.md`);
  res.type('text/markdown; charset=utf-8').send(md);
});

// Todo el cuaderno en un .zip: un .md por apunte (carpetas por materia) + imágenes y audios
router.get('/export', limiter('export', 3, 10 * 60_000), (req, res) => {
  const zip = new AdmZip();
  const notes = db
    .prepare(
      `SELECT n.*, s.name AS subject_name FROM notes n LEFT JOIN subjects s ON s.id = n.subject_id
        WHERE n.user_id = ? ORDER BY n.id`
    )
    .all(req.user.id);
  const used = new Set();
  for (const n of notes) {
    const messages = db.prepare(`${EXPORT_SELECT} WHERE m.note_id = ? ORDER BY m.id`).all(n.id);
    const folder = safeFileName(n.subject_name || (n.orphaned ? 'Sin carpeta' : 'General'));
    let base = `${folder}/${safeFileName(n.title)}`;
    for (let i = 2; used.has(base); i++) base = `${folder}/${safeFileName(n.title)} (${i})`;
    used.add(base);
    zip.addFile(`${base}.md`, Buffer.from(noteToMarkdown(n, n.subject_name, messages, { mediaPrefix: '../media/' }), 'utf8'));
  }
  const media = [
    ...db.prepare('SELECT stored_path FROM images WHERE user_id = ?').all(req.user.id),
    ...db.prepare('SELECT stored_path FROM audios WHERE user_id = ?').all(req.user.id),
  ];
  for (const m of media) if (existsSync(m.stored_path)) zip.addLocalFile(m.stored_path, 'media');
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="notebook-${req.user.username}-${date}.zip"`);
  res.type('application/zip').send(zip.toBuffer());
});
