// test/demo.test.js — demo pública: cuentas temporales con apuntes de ejemplo y límites
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './helpers.js';

let app;
before(async () => { app = await startApp(); });
after(() => app.close());

const ask = (c, q) => c.post('/api/ask', { question: q });

test('crear una demo: apuntes, flashcards y quiz de ejemplo, sesión de demo', async () => {
  assert.equal((await client(app.base).get('/api/bootstrap')).data.demo, true);
  const d = client(app.base);
  const r = await d.post('/api/demo', { lang: 'es' });
  assert.equal(r.status, 200);
  const me = (await d.get('/api/me')).data;
  assert.equal(me.isDemo, true);
  assert.ok(me.demo.expiresAt);
  assert.equal(me.demo.limits.ask, 8);
  const notes = (await d.get('/api/notes?subject_id=all')).data.notes;
  assert.equal(notes.length, 3);
  const study = (await d.get('/api/study')).data.sets;
  assert.deepEqual(study.map((s) => s.kind).sort(), ['flashcards', 'quiz']);
  const bio = notes.find((n) => /Complejidad/.test(n.title));
  const full = (await d.get(`/api/notes/${bio.id}`)).data.note;
  assert.equal(full.messages.find((m) => m.kind === 'image').status, 'done', 'la imagen viene ya leída (no gasta IA)');
  await app.jobs.indexIdle();
});

test('límites: preguntas, importar, contraseña y tamaño de mensajes', async () => {
  const d = client(app.base);
  await d.post('/api/demo', { lang: 'en' });
  for (let i = 0; i < 8; i++) assert.equal((await ask(d, 'binary search ' + i)).status, 200);
  const r = await ask(d, 'one more');
  assert.equal(r.status, 429);
  assert.equal(r.data.code, 'demo_limit');
  assert.equal((await d.post('/api/import/whatsapp', { text: 'x', title: 'x' })).status, 403);
  assert.equal((await d.put('/api/me/password', { current: 'x', password: 'whatever123' })).status, 403);
  const n = (await d.post('/api/notes', { title: 'mine' })).data.id;
  assert.equal((await d.post(`/api/notes/${n}/messages`, { content: 'a'.repeat(1600) })).data.code, 'demo_limit');
  assert.equal((await d.post(`/api/notes/${n}/messages`, { content: 'short' })).status, 200);
  const me = (await d.get('/api/me')).data;
  assert.equal(me.demo.used.ask, 8);
});

test('los usuarios normales no tienen límites de demo', async () => {
  const a = client(app.base);
  await a.post('/api/setup', { token: 'setup-token', username: 'admin', password: 'password123' });
  for (let i = 0; i < 10; i++) assert.equal((await ask(a, 'pregunta ' + i)).status, 200);
  const users = (await a.get('/api/admin/users')).data.users;
  assert.deepEqual(users.map((u) => u.username), ['admin'], 'las demos no aparecen en el panel');
  const st = (await a.get('/api/admin/status')).data;
  assert.equal(st.counts.demoAccounts, 2);
});

test('salir de la demo borra la cuenta; las vencidas se limpian solas', async () => {
  const d = client(app.base);
  await d.post('/api/demo', {});
  const id = (await d.get('/api/me')).data.id;
  await d.post('/api/logout');
  assert.equal(app.db.prepare('SELECT COUNT(*) c FROM users WHERE id = ?').get(id).c, 0);

  app.db.exec("UPDATE users SET demo_expires_at = datetime('now', '-1 minute') WHERE demo_expires_at IS NOT NULL");
  const { cleanupDemos } = await import('../lib/demo.js');
  assert.equal(cleanupDemos(), 2);
  assert.equal(app.db.prepare('SELECT COUNT(*) c FROM users WHERE demo_expires_at IS NOT NULL').get().c, 0);
  assert.equal(app.db.prepare("SELECT COUNT(*) c FROM notes n JOIN users u ON u.id = n.user_id WHERE u.username LIKE 'demo-%'").get().c, 0);
});

test('máximo 3 demos por IP y hora', async () => {
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await client(app.base).post('/api/demo', {})).status);
  // ya se crearon 3 antes en este archivo desde la misma IP
  assert.ok(codes.includes(429));
});
