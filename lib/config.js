// lib/config.js — configuración central (lee process.env una sola vez)
import './env.js';
import dns from 'node:dns';
import path from 'node:path';

// En servidores sin IPv6 funcional las APIs de IA a veces se cuelgan hasta el timeout: IPv4 primero
dns.setDefaultResultOrder('ipv4first');
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);
const num = (v, d) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);

export const ROOT = path.join(here, '..');

export const config = {
  port: int(env.PORT, 8094),
  // Solo localhost: se expone con un proxy/túnel (p. ej. Cloudflare Tunnel) que entra por 127.0.0.1
  host: env.HOST || '127.0.0.1',
  dataDir: env.DATA_DIR || path.join(ROOT, 'data'),
  setupToken: env.SETUP_TOKEN || '',

  // Sesiones: deslizantes (se renuevan al usarse)
  sessionDays: int(env.SESSION_DAYS, 180),

  // Claves (lo gratis primero: Groq y Gemini; OpenAI/DeepSeek solo como respaldo opcional)
  groqKey: env.GROQ_API_KEY || '',
  geminiKey: env.GEMINI_API_KEY || '',
  openaiKey: env.OPENAI_API_KEY || '',
  deepseekKey: env.DEEPSEEK_API_KEY || '',

  // Embeddings: Gemini gratis (≈100 textos/min) u OpenAI; 'fake' = sin red (tests)
  embedProvider: env.EMBED_PROVIDER || (env.GEMINI_API_KEY ? 'gemini' : 'openai'),
  embedModelGemini: env.EMBED_MODEL_GEMINI || 'gemini-embedding-001',
  embedModel: env.EMBED_MODEL || 'text-embedding-3-small',
  embedDim: 1536,
  embedPerMinute: int(env.EMBED_PER_MINUTE, 90),

  // Visión (OCR de imágenes): Gemini gratis, OpenAI de respaldo si hay clave
  visionModelGemini: env.VISION_MODEL_GEMINI || 'gemini-flash-lite-latest',
  visionModel: env.VISION_MODEL || 'gpt-4o-mini',

  // Chat: Groq gratis → Gemini gratis → (DeepSeek solo si CHAT_FALLBACK_DEEPSEEK=1)
  chatModel: env.CHAT_MODEL_GROQ || 'openai/gpt-oss-120b',
  chatModelGemini: env.CHAT_MODEL_GEMINI || 'gemini-flash-lite-latest',
  fallbackModel: env.CHAT_MODEL_DEEPSEEK || 'deepseek-v4-flash',
  useDeepseek: env.CHAT_FALLBACK_DEEPSEEK === '1',
  chatProvider: env.CHAT_PROVIDER || 'auto', // 'auto' | 'groq' | 'gemini' | 'deepseek' | 'fake'

  // Transcripción de audio (Groq Whisper, gratis)
  transcribeModel: env.TRANSCRIBE_MODEL || 'whisper-large-v3-turbo',

  // Demo pública: cuentas temporales con límites estrictos (apagada salvo DEMO_ENABLED=1)
  demoEnabled: env.DEMO_ENABLED === '1',
  demoHours: int(env.DEMO_HOURS, 24),

  // RAG
  topK: int(env.RAG_TOP_K, 6),
  // Similitud coseno mínima para considerar que hay algo relevante
  minSim: num(env.RAG_MIN_SIM, 0.3),
  contextChars: int(env.RAG_CONTEXT_CHARS, 9000),
};
