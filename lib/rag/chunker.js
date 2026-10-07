// lib/rag/chunker.js — convierte el hilo de mensajes de un apunte en fragmentos para el RAG
// Regla: un fragmento agrupa mensajes COMPLETOS (con fecha y remitente); solo un mensaje
// más largo que `max` se corta, y por límites naturales (párrafo, oración, espacio).

/** Texto de un mensaje tal como lo ve el buscador (null si no aporta nada) */
export function messageUnit(m) {
  let body = '';
  const caption = String(m.content || '').trim();
  if (m.kind === 'image') {
    const ocr = m.ocr_text && m.ocr_text !== '(sin texto)' ? m.ocr_text.trim() : '';
    const desc = m.description && m.description !== '(sin descripción)' ? m.description.trim() : '';
    if (!ocr && !desc && !caption) return null;
    body = `[Imagen${m.filename ? ': ' + m.filename : ''}]` + (caption ? ` ${caption}` : '') +
      (ocr ? `\n${ocr}` : '') + (desc ? `\n(${desc})` : '');
  } else if (m.kind === 'audio') {
    const tr = m.transcript && m.transcript !== '(silencio)' ? m.transcript.trim() : '';
    if (!tr && !caption) return null;
    body = `[Audio]` + (caption ? ` ${caption}` : '') + (tr ? ` ${tr}` : '');
  } else {
    body = String(m.content || '').trim();
    if (!body) return null;
  }
  const date = String(m.created_at || '').slice(0, 10);
  const who = m.sender ? ` ${m.sender}:` : '';
  return `[${date}]${who} ${body}`;
}

/** Corta un texto largo en pedazos <= max con solapamiento, en límites naturales */
export function splitLong(text, max = 1600, overlap = 150) {
  const out = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + max, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const minCut = Math.floor(max * 0.5);
      let cut = -1;
      for (const sep of ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' ']) {
        const i = window.lastIndexOf(sep);
        if (i >= minCut) { cut = i + sep.length; break; }
      }
      if (cut > 0) end = start + cut;
    }
    out.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    // retroceder `overlap` caracteres, alineado a un espacio para no partir palabras
    let next = Math.max(end - overlap, start + 1);
    const sp = text.indexOf(' ', next);
    if (sp > 0 && sp < end) next = sp + 1;
    start = next;
  }
  return out.filter(Boolean);
}

/**
 * Agrupa unidades [{id, text}] en fragmentos [{firstId, lastId, text}].
 * Codicioso desde el principio: agregar mensajes al final solo cambia el último fragmento,
 * así el re-indexado incremental re-embebe casi nada.
 */
export function buildChunks(units, { target = 1000, max = 1600, overlap = 150 } = {}) {
  const chunks = [];
  let cur = [];
  let len = 0;
  const flush = () => {
    if (cur.length) {
      chunks.push({ firstId: cur[0].id, lastId: cur[cur.length - 1].id, text: cur.map((u) => u.text).join('\n') });
    }
    cur = [];
    len = 0;
  };
  for (const u of units) {
    if (u.text.length > max) {
      flush();
      for (const piece of splitLong(u.text, max, overlap)) {
        chunks.push({ firstId: u.id, lastId: u.id, text: piece });
      }
      continue;
    }
    if (cur.length && len + 1 + u.text.length > target) flush();
    cur.push(u);
    len += (cur.length > 1 ? 1 : 0) + u.text.length;
  }
  flush();
  return chunks;
}
