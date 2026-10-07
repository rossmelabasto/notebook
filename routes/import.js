// routes/import.js — importar chats de WhatsApp (texto pegado o .zip con imágenes y audios)
import { Router } from 'express';
import multer from 'multer';
import { mkdirSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { db, tx } from '../lib/db.js';
import { fail, limiter, requireAuth } from '../lib/http.js';
import { parseWhatsApp } from '../lib/whatsapp.js';
import { importWhatsAppZip } from '../lib/importer.js';
import { scheduleIndex } from '../lib/jobs.js';

export const router = Router();
router.use(requireAuth);

const IMPORT_DIR = path.join(os.tmpdir(), 'notebook-imports');
mkdirSync(IMPORT_DIR, { recursive: true });

const zipUpload = multer({
  storage: multer.diskStorage({
    destination: IMPORT_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${randomBytes(4).toString('hex')}.zip`),
  }),
  limits: { fileSize: 300 * 1024 * 1024, files: 1 },
});

function subjectFor(userId, raw) {
  if (raw === undefined || raw === null || raw === '' || raw === 'null') return null;
  const id = Number(raw);
  const ok = Number.isSafeInteger(id) && db.prepare('SELECT 1 FROM subjects WHERE id = ? AND user_id = ?').get(id, userId);
  return ok ? id : null;
}

router.post('/import/whatsapp', limiter('imp', 5, 60_000), (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 200) || 'WhatsApp';
  const raw = String(req.body?.text || '');
  if (!raw.trim()) fail(400, 'empty_import', 'Paste the WhatsApp exported text');
  if (raw.length > 5_000_000) fail(400, 'import_too_big', 'Export too large (max 5 MB)');
  const parsed = parseWhatsApp(raw, req.body?.me_name).filter((m) => !m.attach || m.text);
  if (!parsed.length) fail(400, 'no_messages', 'No WhatsApp messages found in that format');
  if (parsed.length > 20_000) fail(400, 'too_many_messages', 'Too many messages (max 20000)');
  const subjectId = subjectFor(req.user.id, req.body?.subject_id);
  const noteId = tx(() => {
    const id = Number(
      db.prepare("INSERT INTO notes (user_id, subject_id, title, content) VALUES (?, ?, ?, '')").run(req.user.id, subjectId, title).lastInsertRowid
    );
    const ins = db.prepare("INSERT INTO messages (note_id, user_id, kind, content, sender, created_at) VALUES (?, ?, 'text', ?, ?, ?)");
    for (const m of parsed) ins.run(id, req.user.id, (m.text || `[adjunto: ${m.attach}]`).slice(0, 100_000), m.sender, m.created_at);
    return id;
  });
  scheduleIndex(noteId);
  res.json({ ok: true, id: noteId, count: parsed.length });
});

router.post('/import/whatsapp-zip', limiter('impz', 3, 60_000), zipUpload.single('zip'), async (req, res) => {
  if (!req.file) fail(400, 'no_files', 'Upload the WhatsApp export (.zip)');
  try {
    const r = await importWhatsAppZip({
      zipPath: req.file.path,
      userId: req.user.id,
      title: String(req.body?.title || '').trim().slice(0, 200) || 'WhatsApp',
      meName: String(req.body?.me_name || '').trim(),
      subjectId: subjectFor(req.user.id, req.body?.subject_id),
    });
    res.json({ ok: true, id: r.noteId, count: r.textCount, images: r.imgCount, audios: r.audioCount, skipped: r.skipped });
  } finally {
    try { unlinkSync(req.file.path); } catch { /* ya no existe */ }
  }
});
