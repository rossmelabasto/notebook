// lib/export.js — convierte un apunte (hilo de mensajes) a Markdown legible
import path from 'node:path';

export function safeFileName(s) {
  return String(s || 'untitled')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'untitled';
}

const quote = (s) => String(s).split('\n').map((l) => `> ${l}`).join('\n');

/**
 * mediaPrefix: ruta relativa a la carpeta de medios dentro del zip (null = sin enlaces,
 * para exportar un solo .md: las imágenes quedan como su transcripción).
 */
export function noteToMarkdown(note, subjectName, messages, { mediaPrefix = null } = {}) {
  const out = [`# ${note.title}`, ''];
  const meta = [];
  if (subjectName) meta.push(`Materia: ${subjectName}`);
  meta.push(`Creado: ${note.created_at} UTC`, `Modificado: ${note.updated_at} UTC`);
  out.push(`_${meta.join(' · ')}_`, '');

  let lastDay = '';
  for (const m of messages) {
    const day = String(m.created_at).slice(0, 10);
    if (day !== lastDay) {
      out.push(`## ${day}`, '');
      lastDay = day;
    }
    const head = `**${m.sender || 'Yo'}** · ${String(m.created_at).slice(11, 16)}${m.starred ? ' ⭐' : ''}`;
    out.push(head);
    if (m.kind === 'image') {
      const file = m.image_path ? path.basename(m.image_path) : null;
      if (mediaPrefix && file) out.push(`![${m.filename || 'imagen'}](${mediaPrefix}${file})`);
      else out.push(`_[Imagen: ${m.filename || 'imagen'}]_`);
      if (m.content) out.push(m.content);
      if (m.ocr_text && m.ocr_text !== '(sin texto)') out.push(quote(m.ocr_text));
      if (m.description && m.description !== '(sin descripción)') out.push(`_${m.description.replace(/\n+/g, ' ')}_`);
    } else if (m.kind === 'audio') {
      const file = m.audio_path ? path.basename(m.audio_path) : null;
      if (mediaPrefix && file) out.push(`[🎤 Audio](${mediaPrefix}${file})`);
      else out.push('_[Audio]_');
      if (m.content) out.push(m.content);
      if (m.transcript) out.push(quote(m.transcript));
    } else {
      out.push(m.content);
    }
    out.push('');
  }
  return out.join('\n');
}
