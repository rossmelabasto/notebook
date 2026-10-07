// lib/importer.js — importa un .zip exportado de WhatsApp (chat + imágenes + audios)
import AdmZip from 'adm-zip';
import { db, tx } from './db.js';
import { parseWhatsApp } from './whatsapp.js';
import { storeImage, storeAudio, unlinkQuiet } from './media.js';
import { queueImage, queueAudio, scheduleIndex } from './jobs.js';
import { fail } from './http.js';

const IMG_EXT = /\.(jpe?g|png|webp|gif)$/i;
const AUDIO_EXT = /\.(opus|ogg|m4a|mp3|aac|wav|webm)$/i;
const MAX_ENTRIES = 20_000;
const MAX_TOTAL = 800 * 1024 * 1024; // descomprimido
const MAX_IMAGE = 15 * 1024 * 1024;
const MAX_AUDIO = 24 * 1024 * 1024; // límite de Whisper en Groq

export async function importWhatsAppZip({ zipPath, userId, title, meName, subjectId }) {
  let zip;
  try {
    zip = new AdmZip(zipPath);
  } catch {
    fail(400, 'bad_zip', 'That file is not a valid .zip');
  }
  const entries = zip.getEntries();
  if (entries.length > MAX_ENTRIES) fail(400, 'zip_too_big', 'The .zip has too many files');
  const total = entries.reduce((s, e) => s + (e.header?.size || 0), 0);
  if (total > MAX_TOTAL) fail(400, 'zip_too_big', 'The .zip is too large once uncompressed');

  const txtEntry =
    entries.find((e) => e.entryName.endsWith('.txt') && /chat/i.test(e.entryName)) ||
    entries.find((e) => e.entryName.endsWith('.txt'));
  if (!txtEntry) fail(400, 'no_chat_txt', 'The chat .txt was not found inside the .zip');

  const parsed = parseWhatsApp(txtEntry.getData().toString('utf8'), meName);
  if (parsed.length === 0) fail(400, 'no_messages', 'No WhatsApp messages found');
  if (parsed.length > 20_000) fail(400, 'too_many_messages', 'Too many messages (max 20000)');

  const filesByName = new Map();
  for (const e of entries) {
    if (e.isDirectory) continue;
    const name = e.entryName.split('/').pop();
    if (name && !filesByName.has(name)) filesByName.set(name, e);
  }

  // 1) escribir archivos primero (fuera de la transacción); si algo falla se borran
  const written = [];
  const media = new Map(); // nombre adjunto -> { kind, stored, mime }
  try {
    for (const m of parsed) {
      if (!m.attach || media.has(m.attach)) continue;
      const entry = filesByName.get(m.attach);
      if (!entry) continue;
      const size = entry.header?.size || 0;
      if (IMG_EXT.test(m.attach) && size <= MAX_IMAGE) {
        const r = storeImage(entry.getData());
        if (r) { written.push(r.stored); media.set(m.attach, { kind: 'image', ...r }); }
      } else if (AUDIO_EXT.test(m.attach) && size <= MAX_AUDIO) {
        const r = storeAudio(entry.getData());
        if (r) { written.push(r.stored); media.set(m.attach, { kind: 'audio', ...r }); }
      }
    }
  } catch (err) {
    written.forEach(unlinkQuiet);
    throw err;
  }

  // 2) crear la nota y el hilo en orden
  let noteId;
  let textCount = 0;
  let imgCount = 0;
  let audioCount = 0;
  let skipped = 0;
  const newImages = [];
  const newAudios = [];
  try {
    tx(() => {
      noteId = Number(
        db.prepare("INSERT INTO notes (user_id, subject_id, title, content) VALUES (?, ?, ?, '')")
          .run(userId, subjectId, title).lastInsertRowid
      );
      const insMsg = db.prepare(
        `INSERT INTO messages (note_id, user_id, kind, content, sender, created_at, image_id, audio_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const insImg = db.prepare(
        "INSERT INTO images (note_id, user_id, filename, stored_path, mime, status) VALUES (?, ?, ?, ?, ?, 'pending')"
      );
      const insAud = db.prepare(
        "INSERT INTO audios (note_id, user_id, filename, stored_path, mime, status) VALUES (?, ?, ?, ?, ?, 'pending')"
      );
      for (const m of parsed) {
        const md = m.attach ? media.get(m.attach) : null;
        if (md?.kind === 'image') {
          const imageId = Number(insImg.run(noteId, userId, m.attach.slice(0, 120), md.stored, md.mime).lastInsertRowid);
          insMsg.run(noteId, userId, 'image', m.text || '', m.sender, m.created_at, imageId, null);
          newImages.push(imageId);
          imgCount++;
        } else if (md?.kind === 'audio') {
          const audioId = Number(insAud.run(noteId, userId, m.attach.slice(0, 120), md.stored, md.mime).lastInsertRowid);
          insMsg.run(noteId, userId, 'audio', m.text || '', m.sender, m.created_at, null, audioId);
          newAudios.push(audioId);
          audioCount++;
        } else if (m.attach) {
          insMsg.run(noteId, userId, 'text', `[adjunto: ${m.attach}]${m.text ? '\n' + m.text : ''}`, m.sender, m.created_at, null, null);
          textCount++;
          skipped++;
        } else {
          insMsg.run(noteId, userId, 'text', m.text, m.sender, m.created_at, null, null);
          textCount++;
        }
      }
    });
  } catch (err) {
    written.forEach(unlinkQuiet);
    throw err;
  }

  // 3) OCR y transcripción en segundo plano; el indexado espera a que terminen
  newImages.forEach(queueImage);
  newAudios.forEach(queueAudio);
  scheduleIndex(noteId, 2000);

  return { noteId, textCount, imgCount, audioCount, skipped };
}
