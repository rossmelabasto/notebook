// test/unit.test.js — funciones puras: chunking, parser de WhatsApp, FTS, citas, sniffing
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChunks, splitLong, messageUnit } from '../lib/rag/chunker.js';
import { parseWhatsApp } from '../lib/whatsapp.js';
import { splitQuotes, makeVisibleFilter, QUOTES_DELIM } from '../lib/rag/answer.js';
import { ftsQuery } from '../lib/rag/search.js';
import { sniffImage, sniffAudio } from '../lib/media.js';
import { noteToMarkdown, safeFileName } from '../lib/export.js';

test('buildChunks agrupa mensajes completos y no los corta', () => {
  const units = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, text: `mensaje ${i + 1} `.repeat(10).trim() }));
  const chunks = buildChunks(units, { target: 500, max: 800 });
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    assert.ok(c.text.length <= 800, 'ningún fragmento pasa el máximo');
    // cada línea es un mensaje entero
    for (const line of c.text.split('\n')) assert.match(line, /^(mensaje \d+ ?)+$/);
  }
  assert.equal(chunks[0].firstId, 1);
  assert.equal(chunks.at(-1).lastId, 30);
});

test('buildChunks: agregar un mensaje al final solo cambia el último fragmento', () => {
  const units = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, text: 'x'.repeat(120) + i }));
  const a = buildChunks(units);
  const b = buildChunks([...units, { id: 41, text: 'nuevo' }]);
  assert.deepEqual(b.slice(0, a.length - 1), a.slice(0, a.length - 1));
});

test('splitLong corta en límites naturales con solapamiento', () => {
  const text = Array.from({ length: 60 }, (_, i) => `Oración número ${i} con algo de contenido.`).join(' ');
  const parts = splitLong(text, 400, 80);
  assert.ok(parts.length > 3);
  for (const p of parts) assert.ok(p.length <= 400);
  assert.match(parts[0], /\.$/, 'el primer pedazo termina en fin de oración');
});

test('messageUnit incluye fecha, remitente, OCR y transcripción', () => {
  assert.equal(messageUnit({ kind: 'text', content: 'hola', created_at: '2026-08-12 10:00:00', sender: 'Ana' }), '[2026-08-12] Ana: hola');
  assert.equal(messageUnit({ kind: 'text', content: '  ', created_at: '2026-08-12' }), null);
  const img = messageUnit({ kind: 'image', filename: 'a.jpg', ocr_text: 'F = m·a', description: 'pizarra', created_at: '2026-08-12' });
  assert.match(img, /\[Imagen: a\.jpg\]\nF = m·a\n\(pizarra\)/);
  assert.equal(messageUnit({ kind: 'image', ocr_text: '(sin texto)', description: '(sin descripción)', created_at: 'x' }), null);
  assert.match(messageUnit({ kind: 'audio', transcript: 'repasar el capítulo 3', created_at: '2026-08-12' }), /\[Audio\] repasar/);
});

test('parseWhatsApp: formato nuevo (M/D/YY, AM/PM) con adjuntos y continuación', () => {
  const txt = [
    '8/12/26, 9:05 PM - Messages and calls are end-to-end encrypted.',
    '8/12/26, 9:06 PM - Ana: Hola',
    'segunda línea',
    '8/12/26, 9:07 PM - Rossmel: IMG-20260812-WA0001.jpg (file attached)',
    '8/12/26, 9:08 PM - Ana: PTT-20260812-WA0002.opus (file attached)',
  ].join('\n');
  const msgs = parseWhatsApp(txt, 'Rossmel');
  assert.equal(msgs.length, 3);
  assert.equal(msgs[0].text, 'Hola\nsegunda línea');
  assert.equal(msgs[1].sender, null, 'mis mensajes no llevan remitente');
  assert.equal(msgs[1].attach, 'IMG-20260812-WA0001.jpg');
  assert.equal(msgs[2].attach, 'PTT-20260812-WA0002.opus');
});

test('parseWhatsApp: formato viejo [dd/mm/yyyy, HH:MM:SS]', () => {
  const msgs = parseWhatsApp('[12/08/2026, 21:06:10] Ana: Hola\n[12/08/2026, 21:07:00] Ana: <attached: 00000012-PHOTO.jpg>');
  assert.equal(msgs.length, 2);
  assert.equal(msgs[1].attach, '00000012-PHOTO.jpg');
});

test('ftsQuery ignora palabras vacías y escapa', () => {
  assert.equal(ftsQuery('¿Qué es la fotosíntesis?'), '"fotosintesis"*');
  assert.equal(ftsQuery('de la y el'), '');
  assert.equal(ftsQuery('ADN "núcleo" OR x', 'and'), '"adn"* "nucleo"*');
});

test('splitQuotes separa citas sin truncar respuestas que dicen "cita"', () => {
  const text = `Según la cita de Darwin [1], las especies evolucionan.\nQuotes: no es el delimitador.\n${QUOTES_DELIM}\n[1] las especies evolucionan por selección natural\n[2] «otra cita»`;
  const { answer, quotes } = splitQuotes(text);
  assert.match(answer, /^Según la cita de Darwin \[1\], las especies evolucionan\.\nQuotes: no es el delimitador\.$/);
  assert.deepEqual(quotes.get(0), ['las especies evolucionan por selección natural']);
  assert.deepEqual(quotes.get(1), ['otra cita']);
});

test('splitQuotes entiende el formato viejo QUOTE[n]: <<...>>', () => {
  const { answer, quotes } = splitQuotes('Respuesta [1].\nQUOTE[1]: <<texto literal>>');
  assert.equal(answer, 'Respuesta [1].');
  assert.deepEqual(quotes.get(0), ['texto literal']);
});

test('el filtro de streaming nunca muestra el delimitador, aunque llegue partido', () => {
  const f = makeVisibleFilter();
  const full = `Hola mundo [1].\n${QUOTES_DELIM}\n[1] cita`;
  let shown = '';
  for (const piece of full.match(/[\s\S]{1,3}/g)) shown += f.push(piece);
  shown += f.flush();
  assert.equal(shown, 'Hola mundo [1].\n');
});

test('sniffImage rechaza SVG/HTML aunque digan ser imagen', () => {
  assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null);
  assert.deepEqual(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), { mime: 'image/jpeg', ext: 'jpg' });
  assert.equal(sniffAudio(Buffer.from('OggS\0\0\0\0\0\0\0\0')).mime, 'audio/ogg');
});

test('noteToMarkdown y safeFileName', () => {
  const md = noteToMarkdown(
    { title: 'Física', created_at: '2026-08-01 10:00:00', updated_at: '2026-08-02 10:00:00' },
    'Ciencias',
    [{ kind: 'text', content: 'F = m·a', created_at: '2026-08-01 10:05:00', starred: 1 }]
  );
  assert.match(md, /^# Física/);
  assert.match(md, /\*\*Yo\*\* · 10:05 ⭐\nF = m·a/);
  assert.equal(safeFileName('a/b:c?'), 'a_b_c_');
});

test('las citas 【n】 de gpt-oss se normalizan a [n]', () => {
  const { answer } = splitQuotes(`Es el jueves【1】 y repasa Ohm【2†L4-L6】.\n${QUOTES_DELIM}\n【1】 jueves`);
  assert.equal(answer, 'Es el jueves[1] y repasa Ohm[2].');
});

test('cuota: duraciones de Groq y medidores', async () => {
  const { parseDuration, trackGroq, trackGemini, aiQuota } = await import('../lib/quota.js');
  assert.equal(parseDuration('1m26.4s'), 86_400);
  assert.equal(parseDuration('350ms'), 350);
  assert.equal(parseDuration('2h3m'), 7_380_000);
  const headers = new Headers({ 'x-ratelimit-limit-requests': '1000', 'x-ratelimit-remaining-requests': '900', 'x-ratelimit-reset-requests': '2h' });
  trackGroq('chat', headers);
  trackGemini('embed', 40);
  const q = Object.fromEntries(aiQuota().map((m) => [m.id, m]));
  assert.equal(q.groq_chat.used, 100);
  assert.equal(q.groq_chat.limit, 1000);
  assert.equal(q.groq_chat.real, true);
  assert.equal(q.gemini_embed.used, 40);
  assert.equal(q.gemini_embed.real, false);
});
