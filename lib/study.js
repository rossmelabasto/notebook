// lib/study.js — material de estudio a partir de los apuntes: resumen, flashcards y quiz
import { db } from './db.js';
import { chat, parseJsonLoose } from './llm.js';
import { hybridSearch, scopeSql } from './rag/search.js';
import { fail } from './http.js';

const BUDGET = 11_000; // caracteres de apuntes por pedido (cabe en el plan gratis de Groq)

/**
 * Junta el material: si hay tema, lo más relevante para ese tema; si no, todo el alcance
 * o, si no entra, primero lo marcado con estrella y luego una muestra pareja del resto.
 */
export async function gatherMaterial(userId, scope, topic) {
  if (topic) {
    const { results } = await hybridSearch(userId, topic, { scope, k: 14 });
    const picked = [];
    let used = 0;
    for (const r of results) {
      if (picked.length && used + r.content.length > BUDGET) break;
      picked.push(r);
      used += r.content.length;
    }
    return { text: picked.map((r) => `### ${r.title}\n${r.content}`).join('\n\n'), chunks: picked.length, partial: true };
  }

  const sc = scopeSql(scope);
  const rows = db
    .prepare(
      `SELECT c.id, c.content, n.title, n.id AS note_id,
              EXISTS (SELECT 1 FROM messages m WHERE m.note_id = c.note_id AND m.starred = 1
                        AND m.id BETWEEN c.first_msg_id AND c.last_msg_id) AS starred
         FROM chunks c JOIN notes n ON n.id = c.note_id
        WHERE n.user_id = ?${sc.sql}
        ORDER BY n.id, c.seq`
    )
    .all(userId, ...sc.params);
  const total = rows.reduce((s, r) => s + r.content.length, 0);
  let picked = rows;
  if (total > BUDGET) {
    const keep = new Set();
    let used = 0;
    for (const r of rows.filter((x) => x.starred)) {
      if (used + r.content.length > BUDGET * 0.6) break;
      keep.add(r.id);
      used += r.content.length;
    }
    const rest = rows.filter((r) => !keep.has(r.id));
    const avg = rest.length ? rest.reduce((s, r) => s + r.content.length, 0) / rest.length : 1;
    const n = Math.max(1, Math.floor((BUDGET - used) / avg));
    const step = rest.length / n;
    for (let i = 0; i < n && i * step < rest.length; i++) keep.add(rest[Math.floor(i * step)].id);
    picked = rows.filter((r) => keep.has(r.id));
  }
  let text = '';
  let lastNote = null;
  for (const r of picked) {
    if (r.note_id !== lastNote) {
      text += `\n\n### ${r.title}\n`;
      lastNote = r.note_id;
    }
    text += r.content + '\n';
  }
  return { text: text.trim(), chunks: picked.length, partial: total > BUDGET };
}

const LANG_HINT = (lang) =>
  `Write in the same language as the notes${lang === 'en' ? ' (if mixed, use English)' : ' (if mixed, use Spanish)'}. ` +
  'Never use LaTeX: write formulas as plain text with Unicode symbols (V = I · R, x², √2).';

const PROMPTS = {
  summary: (lang) => ({
    json: false,
    maxTokens: 2200,
    system:
      'You turn a student\'s notes into a clear study summary in Markdown. Use only the notes, never outside knowledge. ' +
      'Structure: a one-line overview, then sections with ## headings for the main topics, bullet points, **bold** key terms, ' +
      'a table if something is compared, and end with "## Key points" (5-8 bullets to memorize). ' + LANG_HINT(lang),
  }),
  flashcards: (lang) => ({
    json: true,
    maxTokens: 2500,
    system:
      'You create flashcards from a student\'s notes, using only facts in the notes. Make 10-15 cards that test ' +
      'understanding, definitions, dates, formulas and relationships; one fact per card, short answers. ' +
      'Return JSON only: {"title": string, "cards": [{"q": string, "a": string}]}. ' + LANG_HINT(lang),
  }),
  quiz: (lang) => ({
    json: true,
    maxTokens: 2800,
    system:
      'You create a multiple-choice quiz from a student\'s notes, using only facts in the notes. Make 8 questions ' +
      'with 4 options each, exactly one correct, plausible distractors, and a one-sentence explanation citing the notes. ' +
      'Return JSON only: {"title": string, "questions": [{"q": string, "options": [string,string,string,string], "answer": 0-3, "explanation": string}]}. ' +
      LANG_HINT(lang),
  }),
};

function validate(kind, data) {
  if (kind === 'flashcards') {
    const cards = (data?.cards || [])
      .filter((c) => c && typeof c.q === 'string' && typeof c.a === 'string' && c.q.trim() && c.a.trim())
      .slice(0, 30)
      .map((c) => ({ q: c.q.trim().slice(0, 500), a: c.a.trim().slice(0, 1000) }));
    return cards.length ? { cards } : null;
  }
  if (kind === 'quiz') {
    const questions = (data?.questions || [])
      .filter((q) => q && typeof q.q === 'string' && Array.isArray(q.options) && q.options.length >= 2 &&
        Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length)
      .slice(0, 20)
      .map((q) => ({
        q: q.q.trim().slice(0, 500),
        options: q.options.slice(0, 6).map((o) => String(o).slice(0, 300)),
        answer: q.answer,
        explanation: String(q.explanation || '').slice(0, 800),
      }));
    return questions.length ? { questions } : null;
  }
  return null;
}

/** Genera y guarda un set de estudio. scope: { noteId } o { subject } */
export async function createStudySet({ userId, kind, scope, topic = '', lang = 'es', title }) {
  if (!PROMPTS[kind]) fail(400, 'bad_kind', 'Unknown study type');
  const material = await gatherMaterial(userId, scope, topic);
  if (!material.text) fail(400, 'nothing_to_study', 'There is nothing indexed to study yet');
  const p = PROMPTS[kind](lang);
  const user = `${topic ? `Focus on this topic: ${topic}\n\n` : ''}<notes>\n${material.text}\n</notes>`;

  let data = null;
  for (let attempt = 0; attempt < 2 && !data; attempt++) {
    const { text } = await chat({
      messages: [{ role: 'system', content: p.system }, { role: 'user', content: user }],
      temperature: kind === 'summary' ? 0.3 : 0.5,
      maxTokens: p.maxTokens,
      json: p.json,
    });
    if (kind === 'summary') {
      data = text.trim() ? { markdown: text.trim() } : null;
    } else {
      const parsed = parseJsonLoose(text);
      data = validate(kind, parsed);
      if (data && parsed?.title) data.title = String(parsed.title).slice(0, 120);
    }
  }
  if (!data) fail(502, 'study_failed', 'The AI returned something unusable, try again');
  data.partial = material.partial;

  const scopeTitle = scope.noteId
    ? db.prepare('SELECT title FROM notes WHERE id = ?').get(scope.noteId)?.title
    : typeof scope.subject === 'number' ? db.prepare('SELECT name FROM subjects WHERE id = ?').get(scope.subject)?.name : null;
  const setTitle = String(title || data.title || topic || scopeTitle || kind).slice(0, 160);
  const info = db
    .prepare(
      `INSERT INTO study_sets (user_id, note_id, subject_id, kind, title, topic, data_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      scope.noteId || null,
      typeof scope.subject === 'number' ? scope.subject : null,
      kind,
      setTitle,
      topic || null,
      JSON.stringify(data)
    );
  return { id: Number(info.lastInsertRowid), kind, title: setTitle, topic: topic || null, data };
}
