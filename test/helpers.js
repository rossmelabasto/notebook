// test/helpers.js — levanta la app con una base temporal y proveedores de IA falsos (sin red)
// (las variables de entorno las pone test/setup.js, cargado con --import)
export async function startApp() {
  const { createApp } = await import('../app.js');
  const jobs = await import('../lib/jobs.js');
  const { db } = await import('../lib/db.js');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    db,
    jobs,
    async close() {
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
    },
  };
}

/** Cliente con cookie propia (simula un navegador) */
export function client(base) {
  let cookie = '';
  const call = async (method, url, body, extra = {}) => {
    const headers = { 'X-NB': '1', ...(extra.headers || {}) };
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + url, { method, headers, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  };
  return {
    get: (u, o) => call('GET', u, undefined, o),
    post: (u, b, o) => call('POST', u, b, o),
    put: (u, b, o) => call('PUT', u, b, o),
    del: (u, b, o) => call('DELETE', u, b, o),
    get cookie() { return cookie; },
  };
}

/** Parsea una respuesta SSE en [{event, data}] */
export function parseSse(text) {
  return text
    .split('\n\n')
    .map((block) => {
      const ev = block.match(/^event: (.+)$/m)?.[1];
      const data = block.match(/^data: (.+)$/m)?.[1];
      return ev ? { event: ev, data: data ? JSON.parse(data) : null } : null;
    })
    .filter(Boolean);
}
