// routes/media.js — imágenes (OCR) y audios (notas de voz → transcripción)
import { Router } from 'express';
import multer from 'multer';
import { db, tx } from '../lib/db.js';
import { fail, intParam, limiter, requireAuth } from '../lib/http.js';
import { storeImage, storeAudio, unlinkQuiet, sendStoredFile } from '../lib/media.js';
import { queueImage, queueAudio, scheduleIndex } from '../lib/jobs.js';
import { ownNote, MESSAGE_SELECT } from './notes.js';
import { checkDemo, spendDemo } from '../lib/demo.js';

export const router = Router();
router.use(requireAuth);

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
});
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 24 * 1024 * 1024, files: 1 },
});

const messagesByIds = (ids) =>
  ids.length ? db.prepare(`${MESSAGE_SELECT} WHERE m.id IN (${ids.map(() => '?').join(',')}) ORDER BY m.id`).all(...ids) : [];

/* ---------- imágenes ---------- */

function ownImage(userId, id) {
  const img = db.prepare('SELECT * FROM images WHERE id = ? AND user_id = ?').get(intParam(id), userId);
  if (!img) fail(404, 'image_not_found', 'Image not found');
  return img;
}

router.get('/images/:id/file', (req, res) => {
  const img = ownImage(req.user.id, req.params.id);
  sendStoredFile(res, img.stored_path, img.mime);
});

router.post('/notes/:id/images', limiter('imgs', 40, 60_000), imageUpload.array('images', 10), (req, res) => {
  const note = ownNote(req.user.id, req.params.id);
  if (!req.files?.length) fail(400, 'no_files', 'No images received');
  for (const f of req.files) checkDemo(req.user, 'imageBytes', f.size);
  spendDemo(req.user, 'images', req.files.length);
  const stored = [];
  let rejected = 0;
  for (const f of req.files) {
    const r = storeImage(f.buffer);
    if (r) stored.push({ ...r, filename: f.originalname.slice(0, 120) || 'image' });
    else rejected++;
  }
  if (!stored.length) fail(400, 'bad_image', 'Unsupported image format (use JPG, PNG, WebP or GIF)');
  const created = [];
  try {
    tx(() => {
      for (const s of stored) {
        const imageId = Number(
          db.prepare("INSERT INTO images (note_id, user_id, filename, stored_path, mime, status) VALUES (?, ?, ?, ?, ?, 'pending')")
            .run(note.id, req.user.id, s.filename, s.stored, s.mime).lastInsertRowid
        );
        const msgId = Number(
          db.prepare("INSERT INTO messages (note_id, user_id, kind, image_id) VALUES (?, ?, 'image', ?)")
            .run(note.id, req.user.id, imageId).lastInsertRowid
        );
        created.push({ imageId, msgId });
      }
      db.prepare("UPDATE notes SET updated_at = datetime('now') WHERE id = ?").run(note.id);
    });
  } catch (err) {
    stored.forEach((s) => unlinkQuiet(s.stored));
    throw err;
  }
  created.forEach((c) => queueImage(c.imageId));
  res.json({ ok: true, rejected, messages: messagesByIds(created.map((c) => c.msgId)) });
});

// Editar transcripción/descripción de una imagen
router.put('/images/:id', (req, res) => {
  const img = ownImage(req.user.id, req.params.id);
  const { description, ocr_text } = req.body || {};
  if (typeof description !== 'string' && typeof ocr_text !== 'string') fail(400, 'nothing_to_update', 'Nothing to update');
  if (typeof description === 'string') db.prepare('UPDATE images SET description = ? WHERE id = ?').run(description.slice(0, 4000), img.id);
  if (typeof ocr_text === 'string') db.prepare('UPDATE images SET ocr_text = ? WHERE id = ?').run(ocr_text.slice(0, 20_000), img.id);
  scheduleIndex(img.note_id);
  res.json({ ok: true });
});

router.post('/images/:id/process', limiter('reprocess', 30, 60_000), (req, res) => {
  const img = ownImage(req.user.id, req.params.id);
  spendDemo(req.user, 'images');
  queueImage(img.id);
  res.json({ ok: true });
});

/* ---------- audios ---------- */

function ownAudio(userId, id) {
  const a = db.prepare('SELECT * FROM audios WHERE id = ? AND user_id = ?').get(intParam(id), userId);
  if (!a) fail(404, 'audio_not_found', 'Audio not found');
  return a;
}

router.get('/audios/:id/file', (req, res) => {
  const a = ownAudio(req.user.id, req.params.id);
  sendStoredFile(res, a.stored_path, a.mime);
});

router.post('/notes/:id/audio', limiter('audio', 20, 60_000), audioUpload.single('audio'), (req, res) => {
  const note = ownNote(req.user.id, req.params.id);
  if (!req.file) fail(400, 'no_files', 'No audio received');
  checkDemo(req.user, 'audioBytes', req.file.size);
  spendDemo(req.user, 'audio');
  const s = storeAudio(req.file.buffer);
  if (!s) fail(400, 'bad_audio', 'Unsupported audio format');
  let msgId;
  try {
    msgId = tx(() => {
      const audioId = Number(
        db.prepare("INSERT INTO audios (note_id, user_id, filename, stored_path, mime, status) VALUES (?, ?, ?, ?, ?, 'pending')")
          .run(note.id, req.user.id, `voice.${s.ext}`, s.stored, s.mime).lastInsertRowid
      );
      db.prepare("UPDATE notes SET updated_at = datetime('now') WHERE id = ?").run(note.id);
      const id = Number(
        db.prepare("INSERT INTO messages (note_id, user_id, kind, audio_id) VALUES (?, ?, 'audio', ?)")
          .run(note.id, req.user.id, audioId).lastInsertRowid
      );
      queueAudio(audioId);
      return id;
    });
  } catch (err) {
    unlinkQuiet(s.stored);
    throw err;
  }
  res.json({ ok: true, messages: messagesByIds([msgId]) });
});

router.put('/audios/:id', (req, res) => {
  const a = ownAudio(req.user.id, req.params.id);
  if (typeof req.body?.transcript !== 'string') fail(400, 'nothing_to_update', 'Nothing to update');
  db.prepare("UPDATE audios SET transcript = ?, status = 'done' WHERE id = ?").run(req.body.transcript.slice(0, 50_000), a.id);
  scheduleIndex(a.note_id);
  res.json({ ok: true });
});

router.post('/audios/:id/process', limiter('reprocess', 30, 60_000), (req, res) => {
  const a = ownAudio(req.user.id, req.params.id);
  spendDemo(req.user, 'audio');
  queueAudio(a.id);
  res.json({ ok: true });
});

// Estado de imágenes/audios pendientes de una nota (para refrescar sin recargar todo)
router.get('/notes/:id/pending', (req, res) => {
  const note = ownNote(req.user.id, req.params.id);
  const ids = db
    .prepare(
      `SELECT m.id FROM messages m
         LEFT JOIN images i ON i.id = m.image_id LEFT JOIN audios a ON a.id = m.audio_id
        WHERE m.note_id = ? AND (m.kind = 'image' OR m.kind = 'audio')
          AND (m.id IN (SELECT value FROM json_each(?)) OR i.status = 'pending' OR a.status = 'pending')`
    )
    .all(note.id, JSON.stringify((String(req.query.ids || '').match(/\d+/g) || []).map(Number).slice(0, 500)))
    .map((r) => r.id);
  const embedded = db.prepare('SELECT embedded FROM notes WHERE id = ?').get(note.id).embedded;
  res.json({ messages: messagesByIds(ids), embedded });
});
