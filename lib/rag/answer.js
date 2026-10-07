// lib/rag/answer.js — arma el contexto, llama al modelo (streaming) y separa las citas textuales
import { chat, chatStream } from '../llm.js';
import { config } from '../config.js';
import { hybridSearch } from './search.js';

export const QUOTES_DELIM = '<<<QUOTES>>>';

const SYSTEM_PROMPT = `You are a personal study assistant. Answer ONLY with information from the user's notes inside <context>.
Rules:
- Do not invent facts or use outside knowledge. If the notes do not contain the answer, say so plainly and, if useful, mention what related things the notes DO cover.
- EVERY sentence or bullet that uses information from a source MUST end with its number in brackets, e.g. "La mitocondria produce ATP [2]." or "[1][3]". Answers without bracket citations are invalid.
- Reply in the same language as the question. Use Markdown when it helps (short paragraphs, bullet lists, **bold** for key terms, tables for comparisons).
- Each source line starts with a date and sometimes a sender, like "[2026-08-12] Ana: ...". Use that when the question is about when something was said or who said it.
- Never use LaTeX. Write formulas as plain text with Unicode symbols, e.g. V = I · R, x², √2, ≤, π.
- Keep it focused: answer the question directly first, then add only the useful details.
- After the answer, write a line with exactly ${QUOTES_DELIM} and, below it, the verbatim fragments you relied on, one per line, as: [n] exact text copied from source n (max 200 characters each, copied literally).`;

const CONDENSE_PROMPT = `Rewrite the user's LAST message as a standalone search query for their notes, resolving pronouns and references with the conversation. Keep the same language. Output only the query, nothing else.`;

/** Pregunta autónoma a partir del historial ("¿y eso cuándo fue?" → "¿cuándo fue la revolución francesa?") */
export async function condenseQuestion(question, history) {
  if (!history.length) return question;
  const convo = history
    .slice(-6)
    .map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${String(h.content).slice(0, 600)}`)
    .join('\n');
  try {
    const { text } = await chat({
      messages: [
        { role: 'system', content: CONDENSE_PROMPT },
        { role: 'user', content: `${convo}\nUser: ${question}` },
      ],
      temperature: 0,
      maxTokens: 400,
    });
    const q = text.trim().replace(/^["'«]|["'»]$/g, '');
    if (q && q.length < 500) return q;
  } catch (err) {
    console.warn('[rag] condense falló:', err.message);
  }
  const prevUser = [...history].reverse().find((h) => h.role === 'user');
  return prevUser ? `${prevUser.content}\n${question}` : question;
}

/** Separa la respuesta visible de las citas. Devuelve { answer, quotes: Map<idx, string[]> } */
/** gpt-oss cita con corchetes de ancho completo (【1】 o 【1†L3】): se pasan a [1] */
export const normalizeCites = (t) => String(t).replace(/【(\d+)[^】]*】/g, '[$1]');

export function splitQuotes(text) {
  text = normalizeCites(text);
  const quotes = new Map();
  const add = (n, q) => {
    const idx = n - 1;
    const clean = q.replace(/^\s*(?:<<|«|"|“)\s*|\s*(?:>>|»|"|”)\s*$/g, '').replace(/\s+/g, ' ').trim();
    if (idx >= 0 && clean.length >= 4) {
      if (!quotes.has(idx)) quotes.set(idx, []);
      quotes.get(idx).push(clean);
    }
  };
  let answer = text;
  const d = text.indexOf(QUOTES_DELIM);
  if (d >= 0) {
    answer = text.slice(0, d);
    for (const line of text.slice(d + QUOTES_DELIM.length).split('\n')) {
      const m = line.match(/^\s*[-*]?\s*\[(\d+)\]\s*:?\s*(.+)$/);
      if (m) add(parseInt(m[1], 10), m[2]);
    }
  }
  // Formato antiguo: líneas "QUOTE[1]: <<texto>>" (solo se quitan esas líneas)
  answer = answer.replace(/^\s*(?:QUOTE|CITA)\[(\d+)\]:\s*<<([\s\S]*?)>>\s*$/gim, (_, n, q) => {
    add(parseInt(n, 10), q);
    return '';
  });
  return { answer: answer.trim(), quotes };
}

/**
 * Filtro de streaming: deja pasar el texto hasta el delimitador de citas sin mostrar
 * nunca un pedazo del delimitador. push(d) devuelve el texto a emitir.
 */
export function makeVisibleFilter() {
  let full = '';
  let emitted = 0;
  let done = false;
  return {
    push(d) {
      if (done) return '';
      full += d;
      const idx = full.indexOf(QUOTES_DELIM);
      const end = idx >= 0 ? idx : Math.max(emitted, full.length - (QUOTES_DELIM.length - 1));
      if (idx >= 0) done = true;
      const out = full.slice(emitted, end);
      emitted = Math.max(emitted, end);
      return out;
    },
    flush() {
      if (done) return '';
      const out = full.slice(emitted);
      emitted = full.length;
      return out;
    },
  };
}

function publicSource(s, n) {
  return {
    n,
    chunkId: s.chunkId,
    noteId: s.noteId,
    title: s.title,
    subjectName: s.subjectName,
    content: s.content.slice(0, 1600),
    firstMsgId: s.firstMsgId,
    lastMsgId: s.lastMsgId,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    sim: s.sim,
    keyword: s.keyword,
    quotes: [],
  };
}

/**
 * Responde una pregunta sobre los apuntes. onEvent(type, data) recibe:
 *  'query' (consulta usada), 'sources', 'delta' (texto), y al final se devuelve el resultado.
 */
export async function answerQuestion({ userId, question, scope = {}, history = [], onEvent = () => {}, signal }) {
  const query = await condenseQuestion(question, history);
  if (query !== question) onEvent('query', { query });

  const { results, bestSim, ftsHits } = await hybridSearch(userId, query, { scope });
  const relevant = results.length > 0 && ((bestSim ?? 0) >= config.minSim || ftsHits > 0);
  if (!relevant) {
    const sources = results.slice(0, 3).map((s, i) => publicSource(s, i + 1));
    onEvent('sources', { sources, insufficient: true });
    return { insufficient: true, answer: null, sources, query };
  }

  // Contexto dentro del presupuesto (el plan gratis de Groq admite ~8k tokens/minuto)
  const picked = [];
  let used = 0;
  for (const r of results) {
    // fuera lo que no se parece ni comparte palabras (la fusión siempre completa el top-K)
    if (picked.length && !r.keyword && (r.sim ?? 0) < config.minSim) continue;
    if (picked.length && used + r.content.length > config.contextChars) break;
    picked.push(r);
    used += r.content.length;
  }
  const sources = picked.map((s, i) => publicSource(s, i + 1));
  onEvent('sources', { sources, insufficient: false });

  const context = sources
    .map((s) => `[Source ${s.n}] (${s.title}${s.subjectName ? ' · ' + s.subjectName : ''}):\n${s.content}`)
    .join('\n\n---\n\n');
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-6).map((h) => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: String(h.content || '').slice(0, 1200),
    })),
    { role: 'user', content: `<context>\n${context}\n</context>\n\nQuestion: ${question}` },
  ];

  const filter = makeVisibleFilter();
  const { text, provider } = await chatStream(
    { messages, temperature: 0.2, maxTokens: 1800 },
    (d) => {
      const out = filter.push(d);
      if (out) onEvent('delta', { text: out });
    },
    signal
  );
  const tail = filter.flush();
  if (tail) onEvent('delta', { text: tail });

  let { answer, quotes } = splitQuotes(text);
  for (const [idx, qs] of quotes) if (sources[idx]) sources[idx].quotes = qs.slice(0, 4);
  // si el modelo no puso [n] en el texto, se agregan al final las fuentes que citó textualmente
  if (!/\[\d+\]/.test(answer) && quotes.size) {
    const refs = [...quotes.keys()].filter((i) => sources[i]).sort((a, b) => a - b).map((i) => `[${i + 1}]`).join('');
    if (refs) answer = `${answer} ${refs}`;
  }
  return { insufficient: false, answer, sources, provider, query };
}
