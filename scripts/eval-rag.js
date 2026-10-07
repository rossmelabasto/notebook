#!/usr/bin/env node
// scripts/eval-rag.js — mide la recuperación del RAG con los datos reales SIN mostrar su contenido.
// Toma fragmentos al azar, le pide a la IA una pregunta que ese fragmento responde y mira en qué
// puesto lo devuelve la búsqueda híbrida. También mide la similitud con preguntas sin relación,
// para calibrar RAG_MIN_SIM. Solo imprime números.
//
// Uso (en el servidor, con el servicio corriendo o no):  node scripts/eval-rag.js [n=30]
import { db } from '../lib/db.js';
import { chat } from '../lib/llm.js';
import { hybridSearch } from '../lib/rag/search.js';
import { config } from '../lib/config.js';

const N = parseInt(process.argv[2] || '30', 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sample = db
  .prepare('SELECT id, user_id, content FROM chunks WHERE length(content) > 200 ORDER BY random() LIMIT ?')
  .all(N);
if (!sample.length) {
  console.log('No hay fragmentos indexados todavía.');
  process.exit(0);
}

const UNRELATED = [
  '¿Cuál es la capital de Mongolia?',
  'Receta de pan de banana sin horno',
  'Who won the 1998 football world cup?',
  '¿Cómo cambio el aceite de una moto?',
  'Letra de una canción de cumpleaños en japonés',
];

const ranks = [];
const sims = [];
for (const [i, c] of sample.entries()) {
  let q;
  try {
    const r = await chat({
      messages: [
        { role: 'system', content: 'Write ONE short question (max 20 words) that a student would ask and that is answered by the text. Same language as the text. Output only the question.' },
        { role: 'user', content: c.content.slice(0, 1500) },
      ],
      temperature: 0.3,
      maxTokens: 300,
    });
    q = r.text.trim();
  } catch (err) {
    console.log(`#${i + 1}: no se pudo generar la pregunta (${err.status || err.message})`);
    await sleep(8000);
    continue;
  }
  const { results } = await hybridSearch(c.user_id, q, { k: 10 });
  const pos = results.findIndex((r) => r.chunkId === c.id);
  ranks.push(pos);
  const self = results.find((r) => r.chunkId === c.id);
  if (self?.sim != null) sims.push(self.sim);
  process.stdout.write(`#${i + 1} puesto=${pos >= 0 ? pos + 1 : '>10'} sim=${self?.sim?.toFixed(3) ?? '-'}\n`);
  await sleep(2500); // el plan gratis de Groq: ~30 pedidos/min
}

const at = (k) => ranks.filter((p) => p >= 0 && p < k).length / ranks.length;
console.log(`\nRecall@1 ${(at(1) * 100).toFixed(0)}% · @3 ${(at(3) * 100).toFixed(0)}% · @${config.topK} ${(at(config.topK) * 100).toFixed(0)}% · @10 ${(at(10) * 100).toFixed(0)}%  (n=${ranks.length})`);
const mrr = ranks.reduce((s, p) => s + (p >= 0 ? 1 / (p + 1) : 0), 0) / ranks.length;
console.log(`MRR ${mrr.toFixed(3)}`);
sims.sort((a, b) => a - b);
if (sims.length) console.log(`Similitud del fragmento correcto: mín ${sims[0].toFixed(3)} · mediana ${sims[Math.floor(sims.length / 2)].toFixed(3)}`);

const users = db.prepare('SELECT DISTINCT user_id FROM chunks').all().map((r) => r.user_id);
const unrel = [];
for (const u of users) {
  for (const q of UNRELATED) {
    const { bestSim, ftsHits } = await hybridSearch(u, q, { k: 3 });
    unrel.push({ bestSim, ftsHits });
  }
}
const best = unrel.map((x) => x.bestSim ?? 0).sort((a, b) => a - b);
console.log(`Preguntas sin relación: mejor similitud máx ${best.at(-1).toFixed(3)} · mediana ${best[Math.floor(best.length / 2)].toFixed(3)} (RAG_MIN_SIM actual ${config.minSim})`);
