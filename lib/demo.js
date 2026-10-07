// lib/demo.js — demo pública: cuentas temporales con apuntes de ejemplo y límites estrictos
// para no gastar la cuota gratuita de las APIs de IA. Se activa con DEMO_ENABLED=1.
import { randomBytes } from 'node:crypto';
import { copyFileSync } from 'node:fs';
import path from 'node:path';
import { db, tx, getMeta, setMeta, IMG_DIR } from './db.js';
import { config, ROOT } from './config.js';
import { hashPassword } from './auth.js';
import { HttpError } from './http.js';
import { userFiles, unlinkQuiet } from './media.js';

/** Límites por cuenta de demo (toda su vida, que dura DEMO_HOURS) */
export const DEMO_LIMITS = {
  ask: 8,             // preguntas a la IA
  study: 2,           // resúmenes / flashcards / quizzes generados
  images: 2,          // imágenes subidas (se leen con IA)
  audio: 2,           // notas de voz (se transcriben con IA)
  messages: 80,       // mensajes escritos
  notes: 8,
  subjects: 5,
  imageBytes: 1.5 * 1024 * 1024,
  audioBytes: 700 * 1024, // ~1 minuto
  messageChars: 1500,
};

/** Topes diarios sumando TODAS las cuentas de demo (protegen la cuota de los usuarios reales) */
export const DEMO_DAILY = { accounts: 40, ask: 120, study: 20, images: 20, audio: 15 };
const MAX_ACTIVE = 25;

const today = () => new Date().toISOString().slice(0, 10);
const dailyKey = (kind) => `demo_day:${today()}:${kind}`;
const dailyUsed = (kind) => parseInt(getMeta(dailyKey(kind)) || '0', 10);

const limitErr = (code = 'demo_limit') =>
  new HttpError(429, code, 'Demo limit reached. Install your own Notebook to use it without limits.');

export function usageOf(userId) {
  const out = { ask: 0, study: 0, images: 0, audio: 0 };
  for (const r of db.prepare('SELECT kind, n FROM usage WHERE user_id = ?').all(userId)) out[r.kind] = r.n;
  return out;
}

/**
 * Para usuarios de demo: verifica el límite de su cuenta y el tope diario global y, si hay lugar,
 * descuenta `amount`. Para usuarios normales no hace nada.
 */
export function spendDemo(user, kind, amount = 1) {
  if (!user?.isDemo) return;
  const used = db.prepare('SELECT n FROM usage WHERE user_id = ? AND kind = ?').get(user.id, kind)?.n || 0;
  if (used + amount > DEMO_LIMITS[kind]) throw limitErr();
  if (dailyUsed(kind) + amount > DEMO_DAILY[kind]) throw limitErr('demo_daily_limit');
  tx(() => {
    db.prepare(
      `INSERT INTO usage (user_id, kind, n) VALUES (?, ?, ?)
       ON CONFLICT(user_id, kind) DO UPDATE SET n = n + excluded.n`
    ).run(user.id, kind, amount);
    setMeta(dailyKey(kind), dailyUsed(kind) + amount);
  });
}

/** Límites que no gastan IA (cantidad de apuntes, mensajes, tamaño de archivos) */
export function checkDemo(user, what, value = 0) {
  if (!user?.isDemo) return;
  const count = (sql) => db.prepare(sql).get(user.id).c;
  if (what === 'notes' && count('SELECT COUNT(*) AS c FROM notes WHERE user_id = ?') >= DEMO_LIMITS.notes) throw limitErr();
  if (what === 'subjects' && count('SELECT COUNT(*) AS c FROM subjects WHERE user_id = ?') >= DEMO_LIMITS.subjects) throw limitErr();
  if (what === 'messages' && count('SELECT COUNT(*) AS c FROM messages WHERE user_id = ?') + value > DEMO_LIMITS.messages + SEED_MESSAGES) throw limitErr();
  if (what === 'messageChars' && value > DEMO_LIMITS.messageChars) throw limitErr();
  if (what === 'imageBytes' && value > DEMO_LIMITS.imageBytes) throw new HttpError(413, 'demo_file_too_large', 'File too large for the demo');
  if (what === 'audioBytes' && value > DEMO_LIMITS.audioBytes) throw new HttpError(413, 'demo_file_too_large', 'File too large for the demo');
  if (what === 'blocked') throw new HttpError(403, 'demo_disabled', 'Not available in the demo');
}

export function demoInfo(user) {
  if (!user?.isDemo) return null;
  return { expiresAt: user.demoExpiresAt, limits: DEMO_LIMITS, used: usageOf(user.id) };
}

/* ---------- crear / borrar ---------- */

export function canCreateDemo() {
  if (!config.demoEnabled) throw new HttpError(404, 'demo_disabled', 'The demo is not enabled');
  const active = db.prepare("SELECT COUNT(*) AS c FROM users WHERE demo_expires_at > datetime('now')").get().c;
  if (active >= MAX_ACTIVE || dailyUsed('accounts') >= DEMO_DAILY.accounts) throw limitErr('demo_full');
}

export function createDemoUser(lang = 'es') {
  canCreateDemo();
  return tx(() => {
    const username = `demo-${randomBytes(3).toString('hex')}`;
    const id = Number(
      db.prepare(
        `INSERT INTO users (username, password_hash, is_admin, demo_expires_at)
         VALUES (?, ?, 0, datetime('now', ?))`
      ).run(username, hashPassword(randomBytes(24).toString('hex')), `+${config.demoHours} hours`).lastInsertRowid
    );
    setMeta(dailyKey('accounts'), dailyUsed('accounts') + 1);
    const noteIds = seed(id, lang === 'en' ? SEED.en : SEED.es);
    return { id, username, noteIds };
  });
}

export function deleteUserWithFiles(userId) {
  const files = userFiles(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  files.forEach(unlinkQuiet);
}

/** Borra las cuentas de demo vencidas (al arrancar y cada media hora) */
export function cleanupDemos() {
  const old = db.prepare("SELECT id FROM users WHERE demo_expires_at IS NOT NULL AND demo_expires_at <= datetime('now')").all();
  for (const u of old) deleteUserWithFiles(u.id);
  if (old.length) console.log(`[demo] ${old.length} cuentas de demo vencidas borradas`);
  return old.length;
}

/* ---------- apuntes de ejemplo ---------- */

function seed(userId, data) {
  const insSubj = db.prepare('INSERT INTO subjects (user_id, name) VALUES (?, ?)');
  const insNote = db.prepare(
    "INSERT INTO notes (user_id, subject_id, title, created_at, updated_at) VALUES (?, ?, ?, datetime('now', ?), datetime('now', ?))"
  );
  const insMsg = db.prepare(
    "INSERT INTO messages (note_id, user_id, kind, content, sender, starred, created_at, image_id) VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?, ?), ?)"
  );
  const insImg = db.prepare(
    "INSERT INTO images (note_id, user_id, filename, stored_path, mime, status, ocr_text, description) VALUES (?, ?, ?, ?, 'image/jpeg', 'done', ?, ?)"
  );
  const subjects = {};
  for (const name of data.subjects) subjects[name] = Number(insSubj.run(userId, name).lastInsertRowid);
  const noteIds = [];
  for (const n of data.notes) {
    const noteId = Number(insNote.run(userId, subjects[n.subject] ?? null, n.title, n.ago, n.ago).lastInsertRowid);
    noteIds.push(noteId);
    n.messages.forEach((m, i) => {
      const mins = `+${i * 2} minutes`;
      if (m.image) {
        const stored = path.join(IMG_DIR, `${Date.now()}-${randomBytes(6).toString('hex')}.jpg`);
        copyFileSync(path.join(ROOT, 'lib', 'demo', m.image.file), stored);
        const imageId = Number(insImg.run(noteId, userId, m.image.name || m.image.file, stored, m.image.ocr, m.image.description).lastInsertRowid);
        insMsg.run(noteId, userId, 'image', '', m.sender || null, 0, n.ago, mins, imageId);
      } else {
        insMsg.run(noteId, userId, 'text', m.text, m.sender || null, m.star ? 1 : 0, n.ago, mins, null);
      }
    });
    for (const st of n.study || []) {
      db.prepare('INSERT INTO study_sets (user_id, note_id, kind, title, data_json) VALUES (?, ?, ?, ?, ?)')
        .run(userId, noteId, st.kind, st.title, JSON.stringify(st.data));
    }
  }
  return noteIds;
}

const SEED = {
  es: {
    subjects: ['Algoritmos', 'Bases de datos', 'Desarrollo web'],
    notes: [
      {
        subject: 'Bases de datos', title: 'SQL y bases de datos', ago: '-3 days',
        messages: [
          { text: 'SELECT columnas FROM tabla WHERE condición ORDER BY columna;' },
          { text: 'INNER JOIN: solo las filas que coinciden en ambas tablas. LEFT JOIN: todas las de la izquierda, aunque no tengan pareja.', star: true },
          { text: 'Índice = como el índice de un libro: acelera las búsquedas, pero hace más lentas las escrituras.' },
          { text: 'Normalización: 1FN valores atómicos · 2FN sin dependencias parciales · 3FN sin dependencias transitivas.' },
        ],
      },
      {
        subject: 'Desarrollo web', title: 'Grupo Desarrollo Web', ago: '-2 days',
        messages: [
          { sender: 'Lucía', text: '¿Qué diferencia había entre PUT y PATCH?' },
          { text: 'PUT reemplaza el recurso completo; PATCH solo cambia algunos campos.' },
          { sender: 'Marco', text: 'Y los códigos: 200 OK, 201 creado, 404 no encontrado, 500 error del servidor.' },
          { sender: 'Lucía', text: 'El profe dijo que en el parcial entra fetch con async/await.' },
          { text: 'const res = await fetch(url);\nconst data = await res.json();' },
          { sender: 'Marco', text: 'Ojo: fetch no lanza error con un 404, hay que revisar res.ok.' },
        ],
      },
      {
        subject: 'Algoritmos', title: 'Complejidad y estructuras de datos', ago: '-1 days',
        messages: [
          { text: 'Big O mide cómo crece el tiempo (o la memoria) de un algoritmo cuando crece la entrada n.' },
          { text: 'Hash map → buscar e insertar en O(1) en promedio. Es la estructura que más sale en entrevistas.', star: true },
          { text: 'BFS recorre por niveles con una cola (FIFO); DFS va en profundidad con una pila o con recursión.' },
          {
            image: {
              file: 'bigo-es.jpg', name: 'pizarra-big-o.jpg',
              ocr: 'BIG O\nO(1) — array[i], hash map\nO(log n) — búsqueda binaria\nO(n) — búsqueda lineal\nO(n log n) — merge sort\nO(n²) — bubble sort, 2 bucles anidados\nRegla: quitar constantes, quedarse con el mayor',
              description: 'Foto de la pizarra con una tabla de complejidades Big O y ejemplos de cada una.',
            },
          },
          { text: 'Recursión: siempre un caso base; si no, stack overflow.' },
          { text: '📌 Examen: jueves — complejidad, árboles y grafos.' },
        ],
        study: [
          {
            kind: 'flashcards', title: 'Complejidad y estructuras de datos',
            data: { cards: [
              { q: '¿Complejidad de buscar en un hash map?', a: 'O(1) en promedio.' },
              { q: '¿Qué necesita la búsqueda binaria para funcionar?', a: 'Una lista ordenada. Es O(log n).' },
              { q: '¿Qué complejidad tiene merge sort?', a: 'O(n log n).' },
              { q: '¿Qué estructura usa BFS?', a: 'Una cola (FIFO). DFS usa una pila o recursión.' },
              { q: '¿Qué le falta a una recursión que termina en stack overflow?', a: 'Un caso base.' },
            ] },
          },
          {
            kind: 'quiz', title: 'Quiz: complejidad',
            data: { questions: [
              { q: '¿Qué complejidad tiene la búsqueda binaria?', options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'], answer: 1, explanation: 'La foto de la pizarra la pone en O(log n).' },
              { q: '¿Qué estructura usa BFS para recorrer un grafo?', options: ['Pila', 'Cola', 'Árbol binario', 'Hash map'], answer: 1, explanation: 'Los apuntes dicen que BFS recorre por niveles con una cola (FIFO).' },
              { q: '¿Cuál conviene para ordenar un millón de datos?', options: ['Bubble sort', 'Merge sort', 'Búsqueda lineal', 'Dos bucles anidados'], answer: 1, explanation: 'Merge sort es O(n log n); bubble sort es O(n²).' },
            ] },
          },
        ],
      },
    ],
  },
  en: {
    subjects: ['Algorithms', 'Databases', 'Web development'],
    notes: [
      {
        subject: 'Databases', title: 'SQL and databases', ago: '-3 days',
        messages: [
          { text: 'SELECT columns FROM table WHERE condition ORDER BY column;' },
          { text: 'INNER JOIN: only rows that match in both tables. LEFT JOIN: every row on the left, even without a match.', star: true },
          { text: 'An index is like a book index: faster reads, slower writes.' },
          { text: 'Normalization: 1NF atomic values · 2NF no partial dependencies · 3NF no transitive dependencies.' },
        ],
      },
      {
        subject: 'Web development', title: 'Web dev group', ago: '-2 days',
        messages: [
          { sender: 'Lucy', text: 'What was the difference between PUT and PATCH?' },
          { text: 'PUT replaces the whole resource; PATCH only changes some fields.' },
          { sender: 'Mark', text: 'And the codes: 200 OK, 201 created, 404 not found, 500 server error.' },
          { sender: 'Lucy', text: 'The teacher said fetch with async/await is on the midterm.' },
          { text: 'const res = await fetch(url);\nconst data = await res.json();' },
          { sender: 'Mark', text: 'Careful: fetch does not throw on a 404, you have to check res.ok.' },
        ],
      },
      {
        subject: 'Algorithms', title: 'Complexity and data structures', ago: '-1 days',
        messages: [
          { text: 'Big O describes how an algorithm\'s time (or memory) grows as the input n grows.' },
          { text: 'Hash map → lookup and insert in O(1) on average. The most common structure in interviews.', star: true },
          { text: 'BFS goes level by level with a queue (FIFO); DFS goes deep with a stack or recursion.' },
          {
            image: {
              file: 'bigo-en.jpg', name: 'whiteboard-big-o.jpg',
              ocr: 'BIG O\nO(1) — array[i], hash map\nO(log n) — binary search\nO(n) — linear search\nO(n log n) — merge sort\nO(n²) — bubble sort, 2 nested loops\nRule: drop constants, keep the biggest term',
              description: 'Photo of the whiteboard with a Big O complexity table and an example for each.',
            },
          },
          { text: 'Recursion: always a base case, otherwise stack overflow.' },
          { text: '📌 Exam: Thursday — complexity, trees and graphs.' },
        ],
        study: [
          {
            kind: 'flashcards', title: 'Complexity and data structures',
            data: { cards: [
              { q: 'Time complexity of a hash map lookup?', a: 'O(1) on average.' },
              { q: 'What does binary search need to work?', a: 'A sorted list. It is O(log n).' },
              { q: 'What is the complexity of merge sort?', a: 'O(n log n).' },
              { q: 'Which structure does BFS use?', a: 'A queue (FIFO). DFS uses a stack or recursion.' },
              { q: 'What is missing in a recursion that ends in a stack overflow?', a: 'A base case.' },
            ] },
          },
          {
            kind: 'quiz', title: 'Quiz: complexity',
            data: { questions: [
              { q: 'What is the complexity of binary search?', options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'], answer: 1, explanation: 'The whiteboard photo lists it as O(log n).' },
              { q: 'Which structure does BFS use to traverse a graph?', options: ['Stack', 'Queue', 'Binary tree', 'Hash map'], answer: 1, explanation: 'The notes say BFS goes level by level with a queue (FIFO).' },
              { q: 'Which is better for sorting a million items?', options: ['Bubble sort', 'Merge sort', 'Linear search', 'Two nested loops'], answer: 1, explanation: 'Merge sort is O(n log n); bubble sort is O(n²).' },
            ] },
          },
        ],
      },
    ],
  },
};

export const SEED_MESSAGES = Math.max(...Object.values(SEED).map((d) => d.notes.reduce((s, n) => s + n.messages.length, 0)));
