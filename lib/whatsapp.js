// lib/whatsapp.js — parser de exportaciones de chat de WhatsApp (.txt)
// Soporta ambos formatos:
//   viejo: [dd/mm/yyyy, HH:MM:SS] Sender: mensaje
//   nuevo: M/D/YY, HH:MM[:SS] [AM/PM] - Sender: mensaje
// Adjuntos: <attached: archivo> (viejo) | "archivo (file attached)" (nuevo)
// Líneas de continuación sin timestamp se anexan al mensaje anterior.

const LINE_RE =
  /^\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?\]?\s*-?\s+(.+?):\s*([\s\S]*)$/i;
const DATE_ONLY_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const SKIP_RE = /^(Hoy|Ayer|Today|Yesterday)$/i;
const ENCRYPT_RE = /end-to-end encrypted|cifrados de extremo a extremo/i;
const ATTACH_OLD_RE = /<attached:\s*([^>]+)>/i;
const ATTACH_NEW_RE = /\s*\(file attached\)\s*$/i;
const FILENAME_RE = /^[A-Za-z0-9_.\- ]+\.(jpe?g|png|webp|gif|heic|pdf|docx?|xlsx?|pptx?|txt|csv|mp4|opus|m4a|aac|mp3|zip|rar|7z)$/i;

function toUtc(d, mo, y, h, mi, s) {
  let year = y;
  if (year < 100) year += year < 70 ? 2000 : 1900;
  // Hora local del servidor -> UTC (lo que guarda SQLite)
  const dt = new Date(year, mo - 1, d, h, mi, s || 0);
  return dt.toISOString().replace('T', ' ').slice(0, 19);
}

export function parseWhatsApp(text, meName = '') {
  const out = [];
  let prev = null;
  const me = String(meName || '').trim().toLowerCase();

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    if (DATE_ONLY_RE.test(line.trim())) continue; // separadores de fecha
    if (SKIP_RE.test(line.trim())) continue; // "Hoy" / "Ayer"
    if (ENCRYPT_RE.test(line)) continue; // aviso de cifrado

    const m = LINE_RE.exec(line);
    if (m) {
      // Formato viejo [dd/mm/yyyy...] = día primero; formato nuevo M/D/YY = mes primero
      const isOld = line.startsWith('[');
      const d = parseInt(isOld ? m[1] : m[2], 10);
      const mo = parseInt(isOld ? m[2] : m[1], 10);
      const y = parseInt(m[3], 10);
      let hh = parseInt(m[4], 10);
      const mi = parseInt(m[5], 10);
      const s = m[6] ? parseInt(m[6], 10) : 0;
      const ampm = m[7];
      if (ampm) {
        const pm = /p/i.test(ampm);
        if (pm && hh < 12) hh += 12;
        if (!pm && hh === 12) hh = 0;
      }
      const sender = m[8].trim();
      let body = m[9].trim();
      let attach = null;

      // adjunto estilo viejo: <attached: archivo>
      const oldM = ATTACH_OLD_RE.exec(body);
      if (oldM) {
        attach = oldM[1].trim();
        body = body.replace(oldM[0], '').trim();
      }
      // adjunto estilo nuevo: "archivo (file attached)"
      if (!attach) {
        const newM = ATTACH_NEW_RE.exec(body);
        if (newM) {
          const before = body.slice(0, newM.index).trim();
          // también captura archivos de WhatsApp sin extensión (ej: DOC-20260712-WA0003.)
          if (FILENAME_RE.test(before) || /^[A-Za-z0-9_.\- ]+\.$/.test(before)) {
            attach = before;
            body = body.slice(0, newM.index).trim();
          }
        }
      }

      const msg = {
        sender: me && sender.toLowerCase() === me ? null : sender,
        text: body,
        attach,
        created_at: toUtc(d, mo, y, hh, mi, s),
      };
      out.push(msg);
      prev = msg;
    } else if (prev) {
      // línea de continuación del mensaje anterior
      prev.text += '\n' + line;
    }
    // líneas sueltas (avisos del sistema) se ignoran
  }

  return out.filter((m) => m.text.trim() || m.attach);
}
