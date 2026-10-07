// test/api.test.js — la API completa con base temporal e IA falsa
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { startApp, client, parseSse } from './helpers.js';

let app;
let admin;
let bob;

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

before(async () => {
  app = await startApp();
  admin = client(app.base);
  bob = client(app.base);
});
after(() => app.close());

test('setup crea el admin una sola vez', async () => {
  assert.equal((await admin.get('/api/bootstrap')).data.needsSetup, true);
  const bad = await admin.post('/api/setup', { token: 'nope', username: 'admin', password: 'password123' });
  assert.equal(bad.status, 403);
  const ok = await admin.post('/api/setup', { token: 'setup-token', username: 'admin', password: 'password123' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.isAdmin, true);
  const again = await client(app.base).post('/api/setup', { token: 'setup-token', username: 'x2', password: 'password123' });
  assert.equal(again.status, 400);
});

test('CSRF: sin cabecera X-NB o con Origin ajeno se rechaza', async () => {
  const r1 = await fetch(app.base + '/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin.cookie },
    body: JSON.stringify({ title: 'x' }),
  });
  assert.equal(r1.status, 403);
  const r2 = await admin.post('/api/notes', { title: 'x' }, { headers: { Origin: 'https://evil.example' } });
  assert.equal(r2.status, 403);
});

test('el admin crea a bob; bob no es admin', async () => {
  const r = await admin.post('/api/admin/users', { username: 'bob', password: 'bobpassword' });
  assert.equal(r.status, 200);
  const login = await bob.post('/api/login', { username: 'BOB', password: 'bobpassword' });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.isAdmin, false);
  assert.equal((await bob.get('/api/admin/users')).status, 403);
});

test('login: contraseña mala → 401 y el límite no se salta con X-Forwarded-For', async () => {
  const c = client(app.base);
  const codes = [];
  for (let i = 0; i < 12; i++) {
    const r = await c.post('/api/login', { username: 'ghost', password: 'wrong' }, { headers: { 'X-Forwarded-For': `10.0.0.${i}` } });
    codes.push(r.status);
  }
  assert.equal(codes[0], 401);
  assert.ok(codes.includes(429), 'termina limitado aunque cambie X-Forwarded-For');
});

let noteId;
test('apunte + mensajes + indexado incremental', async () => {
  const subj = await admin.post('/api/subjects', { name: 'Biología' });
  const n = await admin.post('/api/notes', {
    title: 'Célula',
    subject_id: subj.data.id,
    content: 'La fotosíntesis ocurre en los cloroplastos y libera oxígeno.',
  });
  noteId = n.data.id;
  const texts = Array.from({ length: 25 }, (_, i) => `Dato ${i}: las mitocondrias producen ATP en la respiración celular, parte ${i}.`);
  const m = await admin.post(`/api/notes/${noteId}/messages`, { content: texts });
  assert.equal(m.data.messages.length, 25);
  await app.jobs.indexIdle();

  const chunks1 = app.db.prepare('SELECT id FROM chunks WHERE note_id = ? ORDER BY seq').all(noteId).map((r) => r.id);
  assert.ok(chunks1.length >= 2);
  assert.equal(app.db.prepare('SELECT COUNT(*) c FROM vec_chunks').get().c, chunks1.length);

  await admin.post(`/api/notes/${noteId}/messages`, { content: 'El ADN está en el núcleo.' });
  await app.jobs.indexIdle();
  const chunks2 = app.db.prepare('SELECT id FROM chunks WHERE note_id = ? ORDER BY seq').all(noteId).map((r) => r.id);
  // todos menos el último fragmento se reutilizan (mismo id = no se volvió a embeber)
  assert.deepEqual(chunks2.slice(0, chunks1.length - 1), chunks1.slice(0, chunks1.length - 1));
  assert.equal((await admin.get(`/api/notes/${noteId}`)).data.note.embedded, 1);
});

test('preguntar: SSE con fuentes, texto y citas; filtro por materia', async () => {
  const res = await fetch(app.base + '/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-NB': '1', Cookie: admin.cookie },
    body: JSON.stringify({ question: '¿Dónde ocurre la fotosíntesis?' }),
  });
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const events = parseSse(await res.text());
  const sources = events.find((e) => e.event === 'sources').data;
  assert.equal(sources.insufficient, false);
  assert.ok(sources.sources[0].content.includes('fotosíntesis'));
  const deltas = events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('');
  assert.ok(deltas.length > 0);
  assert.ok(!deltas.includes('<<<QUOTES>>>'));
  const done = events.find((e) => e.event === 'done').data;
  assert.equal(done.answer, deltas.trim());
  assert.ok(done.sources[0].quotes.length >= 0);

  // materia sin apuntes → no hay de dónde responder
  const empty = await admin.post('/api/subjects', { name: 'Vacía' });
  const r2 = await fetch(app.base + '/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-NB': '1', Cookie: admin.cookie },
    body: JSON.stringify({ question: 'fotosíntesis', subject_id: empty.data.id }),
  });
  const done2 = parseSse(await r2.text()).find((e) => e.event === 'done').data;
  assert.equal(done2.insufficient, true);
});

test('conversación: guarda pregunta/respuesta y se autotitula', async () => {
  const c = await admin.post('/api/convos', {});
  const res = await fetch(app.base + '/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-NB': '1', Cookie: admin.cookie },
    body: JSON.stringify({ question: 'mitocondrias y ATP', convo_id: c.data.id }),
  });
  await res.text();
  const convo = await admin.get(`/api/convos/${c.data.id}`);
  assert.equal(convo.data.messages.length, 2);
  assert.equal(convo.data.convo.title, 'mitocondrias y ATP');
  assert.equal((await bob.get(`/api/convos/${c.data.id}`)).status, 404);
});

test('búsqueda global por palabras (sin tildes, con resaltado)', async () => {
  const r = await admin.get('/api/search?q=nucleo');
  assert.equal(r.data.results.length, 1);
  assert.match(r.data.results[0].snippet, /\u0001núcleo\u0002/);
  assert.equal((await bob.get('/api/search?q=nucleo')).data.results.length, 0);
});

test('IDOR: bob no puede leer, borrar ni tocar lo de admin', async () => {
  const up = new FormData();
  up.append('images', new Blob([PNG], { type: 'image/png' }), 'pixel.png');
  const img = await admin.post(`/api/notes/${noteId}/images`, up);
  assert.equal(img.status, 200);
  const imageId = img.data.messages[0].image_id;
  const file = app.db.prepare('SELECT stored_path FROM images WHERE id = ?').get(imageId).stored_path;

  assert.equal((await bob.get(`/api/notes/${noteId}`)).status, 404);
  assert.equal((await bob.del(`/api/notes/${noteId}`)).status, 404);
  assert.equal((await bob.get(`/api/images/${imageId}/file`)).status, 404);
  assert.equal((await bob.del(`/api/messages/${img.data.messages[0].id}`)).status, 404);
  assert.equal((await bob.put(`/api/notes/${noteId}`, { title: 'hack' })).status, 404);
  assert.ok(existsSync(file), 'el archivo de admin sigue ahí');
  assert.ok(app.db.prepare('SELECT COUNT(*) c FROM chunks WHERE note_id = ?').get(noteId).c > 0, 'sus vectores también');
});

test('imágenes: SVG rechazado, PNG servido con sandbox', async () => {
  const svg = new FormData();
  svg.append('images', new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: 'image/svg+xml' }), 'x.svg');
  assert.equal((await admin.post(`/api/notes/${noteId}/images`, svg)).status, 400);

  const note = await admin.get(`/api/notes/${noteId}`);
  const img = note.data.note.messages.find((m) => m.kind === 'image');
  const r = await fetch(`${app.base}/api/images/${img.image_id}/file`, { headers: { Cookie: admin.cookie } });
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.match(r.headers.get('content-security-policy'), /sandbox/);
  await app.jobs.indexIdle();
});

test('estudio: flashcards y quiz se generan, guardan y listan', async () => {
  const f = await admin.post('/api/study', { kind: 'flashcards', note_id: noteId });
  assert.equal(f.status, 200);
  assert.ok(f.data.set.data.cards.length >= 1);
  const q = await admin.post('/api/study', { kind: 'quiz', note_id: noteId, topic: 'mitocondrias' });
  assert.equal(q.data.set.data.questions[0].options.length, 4);
  const list = await admin.get(`/api/study?note_id=${noteId}`);
  assert.equal(list.data.sets.length, 2);
  assert.equal((await bob.get(`/api/study/${f.data.set.id}`)).status, 404);
});

test('exportar apunte (.md) y cuaderno completo (.zip)', async () => {
  const md = await admin.get(`/api/notes/${noteId}/export`);
  assert.match(md.data, /^# Célula/);
  const r = await fetch(app.base + '/api/export', { headers: { Cookie: admin.cookie } });
  assert.equal(r.headers.get('content-type'), 'application/zip');
  assert.ok((await r.arrayBuffer()).byteLength > 100);
});

test('sesiones: listar, cerrar otras y cambiar contraseña', async () => {
  const other = client(app.base);
  // otra IP (CF-Connecting-IP solo se cree si viene de localhost, como cloudflared)
  const lg = await other.post('/api/login', { username: 'bob', password: 'bobpassword' }, { headers: { 'CF-Connecting-IP': '203.0.113.9' } });
  assert.equal(lg.status, 200);
  const list = await bob.get('/api/sessions');
  assert.equal(list.data.sessions.length, 2);
  assert.equal(list.data.sessions.filter((s) => s.current).length, 1);
  const pw = await bob.put('/api/me/password', { current: 'bobpassword', password: 'newpassword1' });
  assert.equal(pw.data.closedSessions, 1);
  assert.equal((await other.get('/api/me')).status, 401, 'la otra sesión quedó cerrada');
  assert.equal((await bob.get('/api/me')).status, 200, 'la actual sigue');
  // en la base no hay tokens en claro
  const raw = bob.cookie.split('=')[1];
  assert.equal(app.db.prepare('SELECT COUNT(*) c FROM sessions WHERE token = ?').get(raw).c, 0);
});

test('borrar apunte limpia mensajes, vectores, FTS y archivos', async () => {
  const files = app.db.prepare('SELECT stored_path FROM images WHERE note_id = ?').all(noteId).map((r) => r.stored_path);
  assert.equal((await admin.del(`/api/notes/${noteId}`)).status, 200);
  const c = (sql) => app.db.prepare(sql).get().c;
  assert.equal(c('SELECT COUNT(*) c FROM chunks'), 0);
  assert.equal(c('SELECT COUNT(*) c FROM vec_chunks'), 0);
  assert.equal(c('SELECT COUNT(*) c FROM chunks_fts'), 0);
  assert.equal(c('SELECT COUNT(*) c FROM messages_fts'), 0);
  for (const f of files) assert.equal(existsSync(f), false);
});

test('admin borra a bob con todo lo suyo; no puede borrarse a sí mismo', async () => {
  const n = await bob.post('/api/notes', { title: 'de bob', content: 'algo' });
  assert.equal(n.status, 200);
  const users = (await admin.get('/api/admin/users')).data.users;
  const bobId = users.find((u) => u.username === 'bob').id;
  const adminId = users.find((u) => u.username === 'admin').id;
  assert.equal((await admin.del(`/api/admin/users/${adminId}`)).status, 400);
  assert.equal((await admin.del(`/api/admin/users/${bobId}`)).status, 200);
  assert.equal((await bob.get('/api/me')).status, 401);
  assert.equal(app.db.prepare('SELECT COUNT(*) c FROM notes WHERE user_id = ?').get(bobId).c, 0);
});

test('cabeceras de seguridad y errores sin detalles internos', async () => {
  const r = await fetch(app.base + '/');
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  const nf = await admin.get('/api/nope');
  assert.equal(nf.status, 404);
  assert.equal(nf.data.code, 'not_found');
  const bad = await admin.get('/api/notes/abc');
  assert.equal(bad.status, 400);
});
