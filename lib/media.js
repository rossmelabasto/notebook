// lib/media.js — guardar/borrar archivos de imágenes y audios, con validación por "magic bytes"
import { randomBytes } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { db, IMG_DIR, AUDIO_DIR } from './db.js';

/** Detecta el tipo REAL de imagen por su cabecera (no confiar en el mimetype del cliente). SVG no se acepta. */
export function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.subarray(0, 6).toString('ascii') === 'GIF87a' || buf.subarray(0, 6).toString('ascii') === 'GIF89a') return { mime: 'image/gif', ext: 'gif' };
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/** Audio: webm/ogg/opus (Chrome, WhatsApp), mp4/m4a (Safari), mp3, wav */
export function sniffAudio(buf) {
  if (!buf || buf.length < 12) return null;
  const a4 = buf.subarray(0, 4).toString('latin1');
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { mime: 'audio/webm', ext: 'webm' };
  if (a4 === 'OggS') return { mime: 'audio/ogg', ext: 'ogg' };
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') return { mime: 'audio/mp4', ext: 'm4a' };
  if (a4.startsWith('ID3') || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { mime: 'audio/mpeg', ext: 'mp3' };
  if (a4 === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WAVE') return { mime: 'audio/wav', ext: 'wav' };
  return null;
}

const fname = (ext) => `${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;

export function storeImage(buf) {
  const t = sniffImage(buf);
  if (!t) return null;
  const stored = path.join(IMG_DIR, fname(t.ext));
  writeFileSync(stored, buf);
  return { stored, mime: t.mime };
}

export function storeAudio(buf) {
  const t = sniffAudio(buf);
  if (!t) return null;
  const stored = path.join(AUDIO_DIR, fname(t.ext));
  writeFileSync(stored, buf);
  return { stored, mime: t.mime, ext: t.ext };
}

export function unlinkQuiet(p) {
  if (!p) return;
  try { unlinkSync(p); } catch { /* ya no existe */ }
}

/** Rutas de archivos de una nota (para borrarlos DESPUÉS de borrar las filas) */
export function noteFiles(noteId) {
  return [
    ...db.prepare('SELECT stored_path FROM images WHERE note_id = ?').all(noteId),
    ...db.prepare('SELECT stored_path FROM audios WHERE note_id = ?').all(noteId),
  ].map((r) => r.stored_path);
}

export function userFiles(userId) {
  return [
    ...db.prepare('SELECT stored_path FROM images WHERE user_id = ?').all(userId),
    ...db.prepare('SELECT stored_path FROM audios WHERE user_id = ?').all(userId),
  ].map((r) => r.stored_path);
}

/** Cabeceras para servir archivos subidos sin que el navegador los interprete como página */
export function sendStoredFile(res, filePath, mime) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; sandbox");
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.type(mime);
  res.sendFile(filePath, { dotfiles: 'deny' });
}
