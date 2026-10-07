// lib/http.js — utilidades HTTP compartidas: errores, cookies, IP real, rate limit, auth, cabeceras
import { randomBytes } from 'node:crypto';
import { getUserBySession } from './auth.js';

export const COOKIE = 'nb_session';

/** Error con status HTTP y código estable (el cliente lo traduce) */
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}
export const fail = (status, code, message) => {
  throw new HttpError(status, code, message);
};

export function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie;
  if (!h) return out;
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try {
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
      } catch { /* cookie inválida */ }
    }
  }
  return out;
}

/**
 * IP real del cliente. Solo se confía en las cabeceras si la conexión viene de
 * localhost (cloudflared); si no, cualquiera podría falsear X-Forwarded-For.
 */
export function clientIp(req) {
  const peer = req.socket?.remoteAddress || '';
  const fromProxy = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  if (fromProxy) {
    const cf = req.headers['cf-connecting-ip'];
    if (cf) return String(cf).trim();
  }
  return peer;
}

/** ¿La petición llegó por HTTPS? (Cloudflare termina TLS y avisa con X-Forwarded-Proto) */
export function isHttps(req) {
  const peer = req.socket?.remoteAddress || '';
  const fromProxy = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  return fromProxy && String(req.headers['x-forwarded-proto'] || '').includes('https');
}

export function setSessionCookie(req, res, token, days) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps(req),
    maxAge: days * 24 * 3600 * 1000,
    path: '/',
  });
}

/* ---------- rate limit en memoria (ventana fija) ---------- */

const buckets = new Map();
export function hit(key, limit, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
}, 60_000).unref();

export function limiter(name, limit, windowMs, keyFn = (req) => req.user?.id ?? clientIp(req)) {
  return (req, res, next) => {
    if (!hit(`${name}:${keyFn(req)}`, limit, windowMs)) {
      return next(new HttpError(429, 'rate_limited', 'Too many requests, please slow down.'));
    }
    next();
  };
}

/* ---------- auth ---------- */

export function requireAuth(req, res, next) {
  const user = getUserBySession(parseCookies(req)[COOKIE], clientIp(req));
  if (!user) return next(new HttpError(401, 'not_authenticated', 'Not authenticated'));
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return next(new HttpError(403, 'admins_only', 'Admins only'));
  next();
}

/** Envuelve handlers async para que los errores lleguen al manejador central */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- seguridad ---------- */

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  // DEV_FRAME=1 solo para probar la vista móvil en un iframe local
  process.env.DEV_FRAME === '1' ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', process.env.DEV_FRAME === '1' ? 'SAMEORIGIN' : 'DENY');
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
}

/**
 * Anti-CSRF: los cambios de estado exigen la cabecera X-NB (un formulario de otro
 * sitio no puede ponerla) y, si el navegador manda Origin, que sea este mismo host.
 */
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers['x-nb'] !== '1') return next(new HttpError(403, 'csrf', 'Missing client header'));
  const origin = req.headers.origin;
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch { host = ''; }
    if (host !== req.headers.host) return next(new HttpError(403, 'csrf', 'Cross-origin request'));
  }
  next();
}

/** Manejador central de errores: nunca filtra detalles internos al cliente */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  // multer y body-parser
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large', code: 'file_too_large' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request too large', code: 'too_large' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON', code: 'bad_json' });
  }
  const id = randomBytes(4).toString('hex');
  console.error(`[api] ${id} ${req.method} ${req.path} ->`, err?.stack || err);
  res.status(500).json({ error: `Internal error (${id})`, code: 'internal' });
}

/** Parsea un id entero positivo o falla con 400 */
export function intParam(v, code = 'bad_id') {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) fail(400, code, 'Invalid id');
  return n;
}
