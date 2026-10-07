// lib/rag/indexer.js — indexado incremental de un apunte (solo se embeben los fragmentos nuevos)
import { createHash } from 'node:crypto';
import { db, tx } from '../db.js';
import { embed } from '../llm.js';
import { messageUnit, buildChunks } from './chunker.js';

const sha1 = (s) => createHash('sha1').update(s).digest('hex');

export function noteUnits(noteId) {
  return db
    .prepare(
      `SELECT m.id, m.kind, m.content, m.sender, m.created_at,
              i.filename, i.ocr_text, i.description, a.transcript
         FROM messages m
         LEFT JOIN images i ON i.id = m.image_id
         LEFT JOIN audios a ON a.id = m.audio_id
        WHERE m.note_id = ?
        ORDER BY m.id`
    )
    .all(noteId)
    .map((m) => ({ id: m.id, text: messageUnit(m) }))
    .filter((u) => u.text);
}

/** Re-indexa la nota. Devuelve { chunks, embedded } (embedded = cuántos se pidieron a la API) */
export async function indexNote(noteId) {
  const note = db.prepare('SELECT id, user_id, title FROM notes WHERE id = ?').get(noteId);
  if (!note) return { chunks: 0, embedded: 0 };

  const chunks = buildChunks(noteUnits(noteId));
  const inputs = chunks.map((c) => `${note.title}\n${c.text}`);
  const hashes = inputs.map(sha1);

  // Fragmentos ya indexados que se pueden reutilizar tal cual (mismo hash = mismo texto)
  const existing = db.prepare('SELECT id, hash FROM chunks WHERE note_id = ?').all(noteId);
  const pool = new Map();
  for (const e of existing) {
    if (!pool.has(e.hash)) pool.set(e.hash, []);
    pool.get(e.hash).push(e.id);
  }
  const plan = chunks.map((c, i) => {
    const reuse = pool.get(hashes[i])?.shift();
    return { ...c, seq: i, hash: hashes[i], input: inputs[i], reuseId: reuse ?? null };
  });
  const stale = [...pool.values()].flat();
  const toEmbed = plan.filter((p) => p.reuseId === null);

  // Caché: si el mismo texto ya está embebido en otro fragmento (p. ej. los apuntes de ejemplo de
  // cada cuenta de demo), se reutiliza su vector en vez de pedírselo otra vez a la API
  const findSame = db.prepare('SELECT id FROM chunks WHERE hash = ? AND note_id <> ? LIMIT 1');
  const getVec = db.prepare('SELECT embedding FROM vec_chunks WHERE chunk_id = ?');
  const cached = new Map();
  for (const p of toEmbed) {
    const same = findSame.get(p.hash, noteId);
    const v = same && getVec.get(BigInt(same.id))?.embedding;
    if (v) cached.set(p, new Float32Array(new Uint8Array(v).buffer));
  }
  const missing = toEmbed.filter((p) => !cached.has(p));

  // La llamada a la API va FUERA de la transacción (puede tardar)
  const fresh = await embed(missing.map((p) => p.input));
  const vectors = toEmbed.map((p) => cached.get(p) || fresh[missing.indexOf(p)]);

  tx(() => {
    // Si la nota se borró mientras se embebía, no hay nada que guardar
    if (!db.prepare('SELECT 1 FROM notes WHERE id = ?').get(noteId)) return;
    const del = db.prepare('DELETE FROM chunks WHERE id = ?');
    for (const id of stale) del.run(id);
    const upd = db.prepare('UPDATE chunks SET seq = ?, first_msg_id = ?, last_msg_id = ? WHERE id = ?');
    const ins = db.prepare(
      `INSERT INTO chunks (note_id, user_id, seq, first_msg_id, last_msg_id, hash, content)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const insVec = db.prepare('INSERT INTO vec_chunks (chunk_id, user_id, embedding) VALUES (?, ?, ?)');
    const insFts = db.prepare('INSERT INTO chunks_fts (rowid, content) VALUES (?, ?)');
    let v = 0;
    for (const p of plan) {
      if (p.reuseId !== null) {
        upd.run(p.seq, p.firstId, p.lastId, p.reuseId);
        continue;
      }
      const { lastInsertRowid } = ins.run(noteId, note.user_id, p.seq, p.firstId, p.lastId, p.hash, p.text);
      const id = BigInt(lastInsertRowid);
      // BigInt: node:sqlite bindea numbers como REAL y sqlite-vec exige INTEGER
      insVec.run(id, BigInt(note.user_id), vectors[v++]);
      insFts.run(id, p.input);
    }
    db.prepare('UPDATE notes SET embedded = 1 WHERE id = ?').run(noteId);
  });

  return { chunks: plan.length, embedded: missing.length, reused: cached.size };
}
