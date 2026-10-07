// lib/rag/search.js — búsqueda híbrida: vectores (significado) + FTS5/BM25 (palabras exactas), fusión RRF
import { db } from '../db.js';
import { embed } from '../llm.js';
import { config } from '../config.js';

const STOP = new Set(`
a al algo algun alguna algunas alguno algunos ante antes aqui asi aun cada como con contra cual cuales cuando de del desde donde dos el ella ellas ello ellos en entre era eran es esa esas ese eso esos esta estaba estado estan estar este esto estos fue fueron ha habia han hasta hay la las le les lo los mas me mi mis mucho muy nada ni no nos nosotros o otra otras otro otros para pero poco por porque que quien quienes se ser si sin sobre son su sus tambien tan te tiene tienen todo todos tu tus un una unas uno unos y ya yo
explica explicame dime dame cual cuales sabes puedes hacer hace hacen tengo tenia apuntes apunte nota notas
the of and or to in on at for with from by is are was were be been it this that these those what which who how why when where do does did can could would should my your our their about into than then there here
`.split(/\s+/).filter(Boolean));

/** Normaliza (minúsculas, sin tildes) */
export const normalize = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Convierte texto libre en una consulta FTS5 segura: "tok"* OR "tok"* ... ('' si no hay términos) */
export function ftsQuery(q, mode = 'or') {
  const toks = normalize(q).match(/[\p{L}\p{N}]{2,}/gu) || [];
  const uniq = [...new Set(toks.filter((t) => !STOP.has(t) && !(t.length < 3 && !/\d/.test(t))))].slice(0, 12);
  return uniq.map((t) => `"${t}"*`).join(mode === 'and' ? ' ' : ' OR ');
}

/** Condición SQL para el alcance: materia ('general' | 'orphaned' | id) y/o una nota */
export function scopeSql(scope = {}, alias = 'n') {
  const where = [];
  const params = [];
  const s = scope.subject;
  if (s === 'general') where.push(`${alias}.subject_id IS NULL AND ${alias}.orphaned = 0`);
  else if (s === 'orphaned') where.push(`${alias}.orphaned = 1`);
  else if (s !== null && s !== undefined && s !== '') {
    where.push(`${alias}.subject_id = ?`);
    params.push(Number(s));
  }
  if (scope.noteId) {
    where.push(`${alias}.id = ?`);
    params.push(Number(scope.noteId));
  }
  return { sql: where.length ? ' AND ' + where.join(' AND ') : '', params };
}

const RRF_K = 60;

/**
 * Devuelve { results: [...], bestSim, ftsHits }.
 * Cada resultado: chunkId, noteId, title, subjectId, content, sim (coseno, puede ser null), firstMsgId, lastMsgId, fechas.
 */
export async function hybridSearch(userId, query, { scope = {}, k = config.topK, vector = null } = {}) {
  const sc = scopeSql(scope);
  // si la API de embeddings falla o está limitada, se sigue solo con la búsqueda por palabras
  let qvec = vector;
  if (!qvec) {
    try {
      [qvec] = await embed([query]);
    } catch (err) {
      console.warn('[search] sin vector para la pregunta:', err.status || '', err.message);
    }
  }

  // 1) vecinos por significado (fuerza bruta dentro de la partición del usuario)
  const total = db.prepare('SELECT COUNT(*) AS c FROM chunks WHERE user_id = ?').get(userId).c;
  let vecRanked = [];
  if (total > 0 && qvec) {
    const knn = db
      .prepare('SELECT chunk_id, distance FROM vec_chunks WHERE embedding MATCH ? AND k = ? AND user_id = ?')
      .all(qvec, Math.min(total, 1000), BigInt(userId));
    if (knn.length) {
      const dist = new Map(knn.map((r) => [r.chunk_id, r.distance]));
      const ids = knn.map((r) => r.chunk_id);
      const allowed = db
        .prepare(
          `SELECT c.id FROM chunks c JOIN notes n ON n.id = c.note_id
            WHERE c.id IN (${ids.map(() => '?').join(',')}) AND n.user_id = ?${sc.sql}`
        )
        .all(...ids, userId, ...sc.params)
        .map((r) => r.id);
      vecRanked = allowed
        .map((id) => ({ id, sim: 1 - dist.get(id) }))
        .sort((a, b) => b.sim - a.sim)
        .slice(0, 40);
    }
  }

  // 2) coincidencias por palabra (BM25)
  let ftsRanked = [];
  const fq = ftsQuery(query);
  if (fq) {
    try {
      ftsRanked = db
        .prepare(
          `SELECT c.id, bm25(chunks_fts) AS score
             FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid JOIN notes n ON n.id = c.note_id
            WHERE chunks_fts MATCH ? AND n.user_id = ?${sc.sql}
            ORDER BY score LIMIT 40`
        )
        .all(fq, userId, ...sc.params);
    } catch (err) {
      console.warn('[search] fts:', err.message);
    }
  }

  // 3) fusión por ranking recíproco
  const fused = new Map();
  vecRanked.forEach((r, i) => fused.set(r.id, { id: r.id, score: 1 / (RRF_K + i + 1), sim: r.sim, fts: false }));
  ftsRanked.forEach((r, i) => {
    const cur = fused.get(r.id) || { id: r.id, score: 0, sim: null, fts: false };
    cur.score += 1 / (RRF_K + i + 1);
    cur.fts = true;
    fused.set(r.id, cur);
  });
  const top = [...fused.values()].sort((a, b) => b.score - a.score).slice(0, k);

  let results = [];
  if (top.length) {
    const rows = db
      .prepare(
        `SELECT c.id, c.note_id, c.content, c.first_msg_id, c.last_msg_id,
                n.title, n.subject_id, n.created_at, n.updated_at, s.name AS subject_name
           FROM chunks c JOIN notes n ON n.id = c.note_id LEFT JOIN subjects s ON s.id = n.subject_id
          WHERE c.id IN (${top.map(() => '?').join(',')})`
      )
      .all(...top.map((t) => t.id));
    const byId = new Map(rows.map((r) => [r.id, r]));
    // similitud de los que solo vinieron por FTS (para mostrar el % de coincidencia)
    const sims = new Map(vecRanked.map((r) => [r.id, r.sim]));
    results = top
      .map((t) => {
        const r = byId.get(t.id);
        if (!r) return null;
        return {
          chunkId: r.id,
          noteId: r.note_id,
          title: r.title,
          subjectId: r.subject_id,
          subjectName: r.subject_name,
          content: r.content,
          firstMsgId: r.first_msg_id,
          lastMsgId: r.last_msg_id,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          sim: t.sim ?? sims.get(t.id) ?? null,
          keyword: t.fts,
        };
      })
      .filter(Boolean);
  }
  return {
    results,
    bestSim: vecRanked[0]?.sim ?? null,
    ftsHits: ftsRanked.length,
  };
}

/** Búsqueda global por palabras en los mensajes (para la barra de búsqueda) */
export function searchMessages(userId, q, { limit = 40, scope = {} } = {}) {
  const fq = ftsQuery(q, 'and');
  if (!fq) return [];
  const sc = scopeSql(scope);
  try {
    return db
      .prepare(
        `SELECT m.id AS messageId, m.note_id AS noteId, m.kind, m.created_at AS createdAt, m.sender,
                n.title, s.name AS subjectName,
                snippet(messages_fts, 0, char(1), char(2), '…', 14) AS snippet
           FROM messages_fts
           JOIN messages m ON m.id = messages_fts.rowid
           JOIN notes n ON n.id = m.note_id
           LEFT JOIN subjects s ON s.id = n.subject_id
          WHERE messages_fts MATCH ? AND n.user_id = ?${sc.sql}
          ORDER BY bm25(messages_fts)
          LIMIT ?`
      )
      .all(fq, userId, ...sc.params, limit);
  } catch (err) {
    console.warn('[search] messages:', err.message);
    return [];
  }
}
