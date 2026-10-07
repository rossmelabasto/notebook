// lib/jobs.js — trabajos en segundo plano: indexado (agrupado por nota), OCR de imágenes y transcripción de audios
import { readFileSync } from 'node:fs';
import { db, getMeta, setMeta } from './db.js';
import { indexNote } from './rag/indexer.js';
import { analyzeImage, transcribe, embedSpace } from './llm.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- indexado: una nota a la vez, con debounce para ráfagas ---------- */

const pendingNotes = new Map(); // noteId -> timestamp desde el que se puede procesar
let indexing = false;
let idleWaiters = [];

/** Marca la nota como pendiente y la indexa en unos segundos (agrupa ráfagas de mensajes) */
export function scheduleIndex(noteId, delayMs = 1500) {
  db.prepare('UPDATE notes SET embedded = 0 WHERE id = ?').run(noteId);
  pendingNotes.set(noteId, Date.now() + delayMs);
  setTimeout(runIndexer, delayMs + 10);
}

async function runIndexer() {
  if (indexing) return;
  indexing = true;
  try {
    for (;;) {
      const now = Date.now();
      // si hay imágenes/audios de la nota todavía procesándose, esperar a que terminen
      const ready = [...pendingNotes].find(([id, at]) => at <= now && !hasPendingMedia(id));
      if (!ready) break;
      const [noteId] = ready;
      pendingNotes.delete(noteId);
      try {
        const r = await indexNote(noteId);
        if (r.embedded) console.log(`[index] nota ${noteId}: ${r.chunks} fragmentos, ${r.embedded} embebidos`);
      } catch (err) {
        console.error(`[index] nota ${noteId} falló:`, err.message);
        // reintento en 1 minuto (p. ej. la API de embeddings no responde)
        pendingNotes.set(noteId, Date.now() + 60_000);
        setTimeout(runIndexer, 60_100);
      }
    }
  } finally {
    indexing = false;
  }
  if (pendingNotes.size === 0) {
    idleWaiters.forEach((r) => r());
    idleWaiters = [];
  } else {
    // quedan notas esperando su debounce o sus imágenes
    const next = Math.min(...pendingNotes.values());
    setTimeout(runIndexer, Math.max(next - Date.now(), 2000) + 10);
  }
}

function hasPendingMedia(noteId) {
  return !!db
    .prepare(
      `SELECT 1 FROM images WHERE note_id = ? AND status = 'pending'
       UNION ALL SELECT 1 FROM audios WHERE note_id = ? AND status = 'pending' LIMIT 1`
    )
    .get(noteId, noteId);
}

/** Para tests/scripts: resuelve cuando no queda nada por indexar */
export function indexIdle() {
  if (pendingNotes.size === 0 && !indexing) return Promise.resolve();
  return new Promise((r) => idleWaiters.push(r));
}

/* ---------- cola genérica con concurrencia y reintentos ---------- */

function makeQueue(name, concurrency, worker) {
  const queue = [];
  const queued = new Set();
  let active = 0;
  const pump = () => {
    while (active < concurrency && queue.length) {
      const job = queue.shift();
      active += 1;
      worker(job)
        .catch(async (err) => {
          const attempt = (job.attempt || 0) + 1;
          const wait = err?.status === 429
            ? (parseFloat(err.headers?.get?.('retry-after')) || 20) * 1000
            : 5000 * attempt;
          if (attempt <= 4) {
            console.warn(`[${name}] ${job.id} falló (intento ${attempt}): ${err.message}; reintento en ${Math.round(wait / 1000)} s`);
            await sleep(wait);
            queue.push({ ...job, attempt });
            return;
          }
          console.error(`[${name}] ${job.id} falló definitivamente:`, err.message);
          job.onGiveUp?.();
        })
        .finally(() => {
          active -= 1;
          if (!queue.some((j) => j.id === job.id)) queued.delete(job.id);
          pump();
        });
    }
  };
  return {
    push(job) {
      if (queued.has(job.id)) return;
      queued.add(job.id);
      queue.push(job);
      pump();
    },
    get size() { return queue.length + active; },
  };
}

/* ---------- OCR de imágenes ---------- */

const visionQueue = makeQueue('vision', 2, async ({ id }) => {
  const img = db.prepare('SELECT * FROM images WHERE id = ?').get(id);
  if (!img) return;
  const { ocrText, description } = await analyzeImage(readFileSync(img.stored_path), img.mime);
  db.prepare("UPDATE images SET status = 'done', ocr_text = ?, description = ? WHERE id = ?").run(ocrText, description, id);
  scheduleIndex(img.note_id, 3000);
});

export function queueImage(id) {
  db.prepare("UPDATE images SET status = 'pending' WHERE id = ?").run(id);
  visionQueue.push({
    id,
    onGiveUp: () => {
      const img = db.prepare('SELECT note_id FROM images WHERE id = ?').get(id);
      db.prepare("UPDATE images SET status = 'error' WHERE id = ?").run(id);
      if (img) scheduleIndex(img.note_id, 1000);
    },
  });
}

/* ---------- transcripción de audios (Groq Whisper, de a uno por los límites gratis) ---------- */

const audioQueue = makeQueue('audio', 1, async ({ id }) => {
  const a = db.prepare('SELECT * FROM audios WHERE id = ?').get(id);
  if (!a) return;
  const text = await transcribe(readFileSync(a.stored_path), a.filename, a.mime);
  db.prepare("UPDATE audios SET status = 'done', transcript = ? WHERE id = ?").run(text || '(silencio)', id);
  scheduleIndex(a.note_id, 3000);
});

export function queueAudio(id) {
  db.prepare("UPDATE audios SET status = 'pending' WHERE id = ?").run(id);
  audioQueue.push({
    id,
    onGiveUp: () => {
      const a = db.prepare('SELECT note_id FROM audios WHERE id = ?').get(id);
      db.prepare("UPDATE audios SET status = 'error' WHERE id = ?").run(id);
      if (a) scheduleIndex(a.note_id, 1000);
    },
  });
}

export function queueStats() {
  return { indexPending: pendingNotes.size, vision: visionQueue.size, audio: audioQueue.size };
}

/* ---------- al arrancar: retomar lo que quedó a medias ---------- */

export function resumeJobs() {
  const imgs = db.prepare("SELECT id FROM images WHERE status IN ('pending', 'error')").all();
  imgs.forEach((r) => queueImage(r.id));
  const auds = db.prepare("SELECT id FROM audios WHERE status IN ('pending', 'error')").all();
  auds.forEach((r) => queueAudio(r.id));

  // Si cambió el modelo de embeddings, los vectores viejos no sirven: se borran y se re-indexa todo
  const space = embedSpace();
  const prevSpace = getMeta('embed_space');
  if (prevSpace !== space) {
    if (prevSpace || db.prepare('SELECT COUNT(*) AS c FROM chunks').get().c) {
      console.log(`[jobs] embeddings ${prevSpace || 'openai (sin registro)'} → ${space}: se re-indexa todo`);
      db.exec('DELETE FROM chunks');
      setMeta('reindex_all', '1');
    }
    setMeta('embed_space', space);
  }

  let notes;
  if (getMeta('reindex_all') === '1') {
    notes = db.prepare('SELECT id FROM notes ORDER BY updated_at DESC').all();
    setMeta('reindex_all', null);
    console.log(`[jobs] re-indexado completo: ${notes.length} notas`);
  } else {
    notes = db.prepare('SELECT id FROM notes WHERE embedded = 0').all();
  }
  notes.forEach((n, i) => scheduleIndex(n.id, 2000 + i * 200));
  if (imgs.length || auds.length) console.log(`[jobs] reprocesando ${imgs.length} imágenes y ${auds.length} audios`);
}
