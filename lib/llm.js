// lib/llm.js — proveedores de IA, lo gratis primero: chat Groq → Gemini, embeddings y visión Gemini, voz Groq Whisper
import OpenAI, { toFile } from 'openai';
import { createHash } from 'node:crypto';
import { config } from './config.js';
import { trackGroq, trackGemini } from './quota.js';

let clients = {};
function client(name) {
  if (clients[name]) return clients[name];
  const opts = { maxRetries: 1, timeout: 120_000 };
  if (name === 'openai') {
    if (!config.openaiKey) throw new Error('OPENAI_API_KEY no está configurada');
    clients[name] = new OpenAI({ ...opts, apiKey: config.openaiKey });
  } else if (name === 'groq') {
    if (!config.groqKey) throw new Error('GROQ_API_KEY no está configurada');
    clients[name] = new OpenAI({ ...opts, apiKey: config.groqKey, baseURL: 'https://api.groq.com/openai/v1' });
  } else if (name === 'gemini') {
    if (!config.geminiKey) throw new Error('GEMINI_API_KEY no está configurada');
    clients[name] = new OpenAI({ ...opts, apiKey: config.geminiKey, baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' });
  } else if (name === 'deepseek') {
    if (!config.deepseekKey) throw new Error('DEEPSEEK_API_KEY no está configurada');
    clients[name] = new OpenAI({ ...opts, apiKey: config.deepseekKey, baseURL: 'https://api.deepseek.com' });
  }
  return clients[name];
}

/* ---------- embeddings ---------- */

// Vector determinista sin red para tests: bolsa de palabras con hashing
function fakeEmbed(text) {
  const v = new Float32Array(config.embedDim);
  const words = String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]{3,}/g) || [];
  for (const w of words) {
    const h = createHash('md5').update(w).digest();
    v[h.readUInt32LE(0) % config.embedDim] += 1;
  }
  const n = Math.hypot(...v) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

/** Identificador del espacio de vectores: si cambia, hay que re-indexar todo */
export function embedSpace() {
  if (config.embedProvider === 'fake') return `fake:${config.embedDim}`;
  if (config.embedProvider === 'gemini') return `gemini:${config.embedModelGemini}:${config.embedDim}`;
  return `openai:${config.embedModel}:${config.embedDim}`;
}

// El plan gratis de Gemini cuenta cada texto como un pedido (~100/min): ventana deslizante
const sent = [];
async function throttle(n) {
  for (;;) {
    const now = Date.now();
    while (sent.length && sent[0] <= now - 60_000) sent.shift();
    if (sent.length + n <= config.embedPerMinute) {
      for (let i = 0; i < n; i++) sent.push(now);
      return;
    }
    await sleep(Math.max(500, sent[0] + 60_000 - now + 50));
  }
}

/** Espera sugerida por la API ("retry in 23s", Retry-After) o null */
function retryAfterMs(err) {
  const header = parseFloat(err?.headers?.get?.('retry-after'));
  if (Number.isFinite(header)) return header * 1000;
  const m = String(err?.message || '').match(/retry(?:Delay"?:?\s*"?| in )([\d.]+)\s*(ms|s)/i);
  return m ? parseFloat(m[1]) * (m[2] === 'ms' ? 1 : 1000) : null;
}

export async function embed(texts) {
  if (texts.length === 0) return [];
  if (config.embedProvider === 'fake') return texts.map(fakeEmbed);
  const gemini = config.embedProvider === 'gemini';
  const size = gemini ? Math.min(50, config.embedPerMinute) : 96;
  const out = [];
  for (let i = 0; i < texts.length; i += size) {
    const batch = texts.slice(i, i + size).map((t) => t.slice(0, gemini ? 8000 : 24_000));
    for (let attempt = 0; ; attempt++) {
      if (gemini) await throttle(batch.length);
      try {
        const res = gemini
          ? await client('gemini').embeddings.create({ model: config.embedModelGemini, input: batch, dimensions: config.embedDim })
          : await client('openai').embeddings.create({ model: config.embedModel, input: batch });
        if (gemini) trackGemini('embed', batch.length);
        for (const item of res.data) out.push(Float32Array.from(item.embedding));
        break;
      } catch (err) {
        if (err?.status !== 429 || attempt >= 4) throw err;
        const wait = Math.min(retryAfterMs(err) ?? 30_000, 90_000);
        console.warn(`[llm] embeddings limitados, espero ${Math.round(wait / 1000)} s`);
        sent.length = 0;
        await sleep(wait + 500);
      }
    }
  }
  return out;
}

/* ---------- chat ---------- */

function providers() {
  if (config.chatProvider === 'fake') return ['fake'];
  if (config.chatProvider === 'groq') return ['groq'];
  if (config.chatProvider === 'deepseek') return ['deepseek'];
  if (config.chatProvider === 'gemini') return ['gemini'];
  const list = [];
  if (config.groqKey) list.push('groq');
  if (config.geminiKey) list.push('gemini');
  if (config.deepseekKey && config.useDeepseek) list.push('deepseek');
  if (list.length === 0) throw new Error('No hay proveedor de chat configurado (GROQ_API_KEY o GEMINI_API_KEY)');
  return list;
}

function params(provider, { messages, temperature = 0.2, maxTokens = 1800, json = false }) {
  const p = {
    model: provider === 'groq' ? config.chatModel : provider === 'gemini' ? config.chatModelGemini : config.fallbackModel,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (provider === 'groq' && /gpt-oss/.test(config.chatModel)) p.reasoning_effort = 'low';
  if (json) p.response_format = { type: 'json_object' };
  return p;
}

// Errores que justifican probar el siguiente proveedor (saturación, caída, red)
const retriable = (err) => {
  const s = err?.status;
  return !s || s === 429 || s === 408 || s === 413 || s >= 500 ||
    (s === 400 && /context|too large|tokens/i.test(err.message));
};

function fakeAnswer(messages) {
  const last = messages[messages.length - 1]?.content || '';
  if (/"cards"|flashcards/i.test(messages[0]?.content || '')) {
    return JSON.stringify({ cards: [{ q: 'Pregunta de prueba', a: 'Respuesta de prueba' }] });
  }
  if (/"questions"|quiz/i.test(messages[0]?.content || '')) {
    return JSON.stringify({ questions: [{ q: '¿2+2?', options: ['3', '4', '5', '6'], answer: 1, explanation: 'Suma.' }] });
  }
  const m = last.match(/\[Source 1\][^\n]*\n([^\n]{0,80})/);
  return `Respuesta de prueba [1].\n<<<QUOTES>>>\n[1] ${m ? m[1] : ''}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Hace la llamada guardando la cuota que informa el proveedor (Groq: cabeceras; Gemini: conteo) */
async function tracked(prov, kind, makeCall) {
  try {
    const { data, response } = await makeCall().withResponse();
    if (prov === 'groq') trackGroq(kind, response.headers);
    else if (prov === 'gemini') trackGemini('flash');
    return data;
  } catch (err) {
    if (prov === 'groq' && err?.headers) trackGroq(kind, err.headers);
    throw err;
  }
}

/** Si es un 429 con espera corta (el límite por minuto de Groq), cuántos ms esperar; si no, null */
function shortRetryWait(err) {
  if (err?.status !== 429) return null;
  const header = parseFloat(err.headers?.get?.('retry-after'));
  const m = String(err.message).match(/try again in ([\d.]+)(ms|s)/i);
  const ms = Number.isFinite(header) ? header * 1000 : m ? parseFloat(m[1]) * (m[2] === 'ms' ? 1 : 1000) : null;
  return ms !== null && ms <= 12_000 ? ms + 300 : null;
}

/** Respuesta completa (sin streaming). Devuelve { text, provider } */
export async function chat(opts) {
  let lastErr;
  for (const prov of providers()) {
    if (prov === 'fake') return { text: fakeAnswer(opts.messages), provider: 'fake' };
    try {
      let res;
      try {
        res = await tracked(prov, 'chat', () => client(prov).chat.completions.create(params(prov, opts)));
      } catch (err) {
        const wait = shortRetryWait(err);
        if (wait === null) throw err;
        await sleep(wait);
        res = await tracked(prov, 'chat', () => client(prov).chat.completions.create(params(prov, opts)));
      }
      return { text: res.choices[0]?.message?.content ?? '', provider: prov };
    } catch (err) {
      lastErr = err;
      console.warn(`[llm] ${prov} falló (${err.status || 'red'}): ${err.message}`);
      if (!retriable(err)) break;
    }
  }
  throw lastErr;
}

/**
 * Streaming: llama onDelta(texto) por cada pedazo. Si un proveedor falla ANTES de
 * mandar algo, se prueba el siguiente; si ya mandó texto, el error se propaga.
 */
export async function chatStream(opts, onDelta, signal) {
  let lastErr;
  for (const prov of providers()) {
    if (prov === 'fake') {
      const text = fakeAnswer(opts.messages);
      for (const piece of text.match(/[\s\S]{1,7}/g) || []) onDelta(piece);
      return { text, provider: 'fake' };
    }
    let sent = false;
    let text = '';
    try {
      const open = () => tracked(prov, 'chat', () => client(prov).chat.completions.create({ ...params(prov, opts), stream: true }, { signal }));
      let stream;
      try {
        stream = await open();
      } catch (err) {
        const wait = shortRetryWait(err);
        if (wait === null) throw err;
        await sleep(wait);
        stream = await open();
      }
      for await (const part of stream) {
        const d = part.choices?.[0]?.delta?.content;
        if (d) {
          sent = true;
          text += d;
          onDelta(d);
        }
      }
      return { text, provider: prov };
    } catch (err) {
      lastErr = err;
      console.warn(`[llm] stream ${prov} falló (${err.status || 'red'}): ${err.message}`);
      if (sent || signal?.aborted || !retriable(err)) break;
    }
  }
  throw lastErr;
}

/** Extrae el primer objeto JSON de una respuesta (por si el modelo agrega texto) */
export function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch { /* sigue */ }
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(text.slice(a, b + 1)); } catch { /* sigue */ }
  }
  return null;
}

/* ---------- visión (OCR + descripción) ---------- */

const VISION_PROMPT =
  'Analizá esta imagen de apuntes de estudio.\n' +
  '1) TEXTO: transcribí TODO el texto visible en la imagen, exacto, en su idioma original ' +
  '(incluí fórmulas y títulos, sin LaTeX). Si no hay texto, escribí "(sin texto)".\n' +
  '2) DESCRIPCIÓN: describí la imagen en 2-4 líneas: qué muestra, contexto, elementos clave.\n\n' +
  'Formato exacto de respuesta:\nTEXTO:\n<transcripción>\nDESCRIPCIÓN:\n<descripción>';

export async function analyzeImage(buffer, mime) {
  if (config.embedProvider === 'fake') return { ocrText: '(sin texto)', description: 'imagen de prueba' };
  const content = [
    { type: 'text', text: VISION_PROMPT },
    { type: 'image_url', image_url: { url: `data:${mime};base64,${buffer.toString('base64')}` } },
  ];
  // Gemini gratis primero; OpenAI solo si Gemini falla y hay clave
  const order = [config.geminiKey && 'gemini', config.openaiKey && 'openai'].filter(Boolean);
  if (!order.length) throw new Error('No hay proveedor de visión (GEMINI_API_KEY u OPENAI_API_KEY)');
  let res;
  let lastErr;
  for (const prov of order) {
    try {
      res = await tracked(prov, 'vision', () => client(prov).chat.completions.create({
        model: prov === 'gemini' ? config.visionModelGemini : config.visionModel,
        temperature: 0.1,
        messages: [{ role: 'user', content }],
      }));
      break;
    } catch (err) {
      lastErr = err;
      console.warn(`[llm] visión ${prov} falló (${err.status || 'red'}): ${err.message}`);
    }
  }
  if (!res) throw lastErr;
  const raw = res.choices[0]?.message?.content ?? '';
  const i = raw.indexOf('DESCRIPCIÓN:');
  let ocrText = raw.trim();
  let description = '';
  if (i >= 0) {
    ocrText = raw.slice(0, i).replace(/^TEXTO:\s*/i, '').trim();
    description = raw.slice(i + 'DESCRIPCIÓN:'.length).trim();
  }
  return { ocrText: ocrText || '(sin texto)', description: description || '(sin descripción)' };
}

/* ---------- transcripción (Groq Whisper) ---------- */

export async function transcribe(buffer, filename, mime) {
  if (config.embedProvider === 'fake') return 'transcripción de prueba';
  const file = await toFile(buffer, filename, { type: mime });
  const res = await tracked('groq', 'audio', () => client('groq').audio.transcriptions.create({
    model: config.transcribeModel,
    file,
    response_format: 'json',
    temperature: 0,
  }));
  return String(res.text || '').trim();
}
