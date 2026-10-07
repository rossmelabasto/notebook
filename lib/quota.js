// lib/quota.js — cuánto queda de la cuota gratuita de IA del día
// Groq informa lo que queda en cada respuesta (cabeceras x-ratelimit-*): dato real.
// Gemini no lo informa: se cuenta cada pedido contra el límite gratuito conocido (estimado, configurable).
import { getMeta, setMeta } from './db.js';

const KEY = 'ai_usage';
const env = process.env;
const LIMITS = {
  geminiEmbed: parseInt(env.GEMINI_EMBED_RPD || '1000', 10),  // textos por día (plan gratis)
  geminiFlash: parseInt(env.GEMINI_FLASH_RPD || '1000', 10),  // pedidos por día (visión + chat)
};

let state;
try { state = JSON.parse(getMeta(KEY) || '{}'); } catch { state = {}; }
state.groq ||= {};
state.gemini ||= {};

let saveTimer = null;
const save = () => {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; setMeta(KEY, JSON.stringify(state)); }, 3000);
  saveTimer.unref?.();
};

/** "1m26.4s", "2.5s", "350ms", "1h2m" → milisegundos */
export function parseDuration(s) {
  if (!s) return null;
  let ms = 0;
  let ok = false;
  for (const [, n, u] of String(s).matchAll(/([\d.]+)(ms|h|m|s)/g)) {
    ok = true;
    ms += parseFloat(n) * { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[u];
  }
  return ok ? ms : null;
}

/** Guarda lo que Groq dice que queda (kind: 'chat' | 'audio') */
export function trackGroq(kind, headers) {
  const h = (k) => headers?.get?.(k);
  const limit = parseInt(h('x-ratelimit-limit-requests'), 10);
  const remaining = parseInt(h('x-ratelimit-remaining-requests'), 10);
  if (!Number.isFinite(limit) || !Number.isFinite(remaining)) return;
  state.groq[kind] = {
    limit,
    remaining,
    resetMs: parseDuration(h('x-ratelimit-reset-requests')),
    tokLimit: parseInt(h('x-ratelimit-limit-tokens'), 10) || null,
    tokRemaining: parseInt(h('x-ratelimit-remaining-tokens'), 10),
    at: Date.now(),
  };
  save();
}

// El día de cuota de Gemini se reinicia a la medianoche del Pacífico
const pacificDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());

/** Cuenta pedidos a Gemini (kind: 'embed' en textos, 'flash' en pedidos) */
export function trackGemini(kind, n = 1) {
  const day = pacificDay();
  if (state.gemini.day !== day) state.gemini = { day, embed: 0, flash: 0 };
  state.gemini[kind] = (state.gemini[kind] || 0) + n;
  save();
}

/** Medidores para el panel: [{ id, used, limit, real, resetAt }] */
export function aiQuota() {
  const out = [];
  for (const kind of ['chat', 'audio']) {
    const g = state.groq[kind];
    if (!g) {
      out.push({ id: `groq_${kind}`, used: 0, limit: null, real: true, resetAt: null });
      continue;
    }
    // si ya pasó el tiempo de reinicio desde la última lectura, la cuota se recuperó
    const recovered = g.resetMs != null && Date.now() - g.at > g.resetMs;
    out.push({
      id: `groq_${kind}`,
      used: recovered ? 0 : g.limit - g.remaining,
      limit: g.limit,
      real: true,
      resetAt: g.resetMs != null ? new Date(g.at + g.resetMs).toISOString() : null,
      seenAt: new Date(g.at).toISOString(),
    });
  }
  const day = pacificDay();
  const gem = state.gemini.day === day ? state.gemini : { embed: 0, flash: 0 };
  out.push({ id: 'gemini_embed', used: gem.embed || 0, limit: LIMITS.geminiEmbed, real: false });
  out.push({ id: 'gemini_flash', used: gem.flash || 0, limit: LIMITS.geminiFlash, real: false });
  return out;
}
