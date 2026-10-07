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
        const imageId = Number(insImg.run(noteId, userId, m.image.file, stored, m.image.ocr, m.image.description).lastInsertRowid);
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
    subjects: ['Biología', 'Física', 'Historia'],
    notes: [
      {
        subject: 'Historia', title: 'Revolución francesa', ago: '-3 days',
        messages: [
          { text: 'Causas: crisis económica, deuda del Estado y desigualdad entre los tres estamentos.' },
          { text: '14 de julio de 1789: toma de la Bastilla.', star: true },
          { text: 'Declaración de los Derechos del Hombre y del Ciudadano: agosto de 1789.' },
          { text: 'Fases: monarquía constitucional → república (1792) → el Terror (1793-94) → Directorio → Napoleón (1799).' },
        ],
      },
      {
        subject: 'Física', title: 'Grupo Física 2B', ago: '-2 days',
        messages: [
          { sender: 'Lucía', text: '¿Alguien anotó la segunda ley de Newton?' },
          { text: 'Sí: F = m · a. La fuerza neta es masa por aceleración.' },
          { sender: 'Marco', text: 'Y la tercera: a toda acción le corresponde una reacción igual y opuesta.' },
          { sender: 'Lucía', text: 'El profe dijo que el parcial entra hasta trabajo y energía.' },
          { text: 'Trabajo: W = F · d · cos θ' },
          { sender: 'Marco', text: 'Energía cinética: Ec = ½ · m · v²' },
        ],
      },
      {
        subject: 'Biología', title: 'Célula y división celular', ago: '-1 days',
        messages: [
          { text: 'La célula es la unidad básica de la vida: todo ser vivo está formado por una o más células.' },
          { text: 'Mitocondrias → producen ATP con la respiración celular. Son la "central de energía".', star: true },
          { text: 'Ribosomas: sintetizan proteínas. El ADN está en el núcleo.' },
          {
            image: {
              file: 'mitosis-es.jpg',
              ocr: 'MITOSIS\n1. Profase: se condensan los cromosomas\n2. Metafase: se alinean en el ecuador\n3. Anafase: las cromátidas se separan\n4. Telofase: se forman 2 núcleos\nResultado: 2 células hijas idénticas (2n)',
              description: 'Foto de la pizarra con las 4 fases de la mitosis.',
            },
          },
          { text: 'Meiosis ≠ mitosis: la meiosis da 4 células con la mitad de cromosomas (n). Sirve para formar gametos.' },
          { text: '📌 Parcial: jueves — entra todo el capítulo 3.' },
        ],
        study: [
          {
            kind: 'flashcards', title: 'Célula y división celular',
            data: { cards: [
              { q: '¿Qué producen las mitocondrias?', a: 'ATP, mediante la respiración celular.' },
              { q: '¿Qué hacen los ribosomas?', a: 'Sintetizan proteínas.' },
              { q: '¿Cuáles son las fases de la mitosis?', a: 'Profase, metafase, anafase y telofase.' },
              { q: '¿Cuántas células da la meiosis?', a: '4 células con la mitad de cromosomas (n).' },
              { q: '¿Dónde está el ADN?', a: 'En el núcleo.' },
            ] },
          },
          {
            kind: 'quiz', title: 'Quiz: división celular',
            data: { questions: [
              { q: '¿En qué fase de la mitosis se alinean los cromosomas en el ecuador?', options: ['Profase', 'Metafase', 'Anafase', 'Telofase'], answer: 1, explanation: 'Según la foto de la pizarra, en la metafase se alinean en el ecuador.' },
              { q: '¿Qué resultado da la mitosis?', options: ['4 células n', '2 células hijas idénticas (2n)', '1 célula con el doble de ADN', '2 gametos'], answer: 1, explanation: 'La pizarra dice: 2 células hijas idénticas (2n).' },
              { q: '¿Para qué sirve la meiosis?', options: ['Producir ATP', 'Sintetizar proteínas', 'Formar gametos', 'Reparar tejidos'], answer: 2, explanation: 'Los apuntes dicen que la meiosis sirve para formar gametos.' },
            ] },
          },
        ],
      },
    ],
  },
  en: {
    subjects: ['Biology', 'Physics', 'History'],
    notes: [
      {
        subject: 'History', title: 'French Revolution', ago: '-3 days',
        messages: [
          { text: 'Causes: economic crisis, state debt and inequality between the three estates.' },
          { text: 'July 14, 1789: storming of the Bastille.', star: true },
          { text: 'Declaration of the Rights of Man and of the Citizen: August 1789.' },
          { text: 'Phases: constitutional monarchy → republic (1792) → the Terror (1793-94) → Directory → Napoleon (1799).' },
        ],
      },
      {
        subject: 'Physics', title: 'Physics group 2B', ago: '-2 days',
        messages: [
          { sender: 'Lucy', text: 'Did anyone write down Newton\'s second law?' },
          { text: 'Yes: F = m · a. Net force equals mass times acceleration.' },
          { sender: 'Mark', text: 'And the third: every action has an equal and opposite reaction.' },
          { sender: 'Lucy', text: 'The teacher said the midterm goes up to work and energy.' },
          { text: 'Work: W = F · d · cos θ' },
          { sender: 'Mark', text: 'Kinetic energy: KE = ½ · m · v²' },
        ],
      },
      {
        subject: 'Biology', title: 'Cells and cell division', ago: '-1 days',
        messages: [
          { text: 'The cell is the basic unit of life: every living thing is made of one or more cells.' },
          { text: 'Mitochondria → produce ATP through cellular respiration. The cell\'s "power plant".', star: true },
          { text: 'Ribosomes synthesize proteins. DNA is in the nucleus.' },
          {
            image: {
              file: 'mitosis-en.jpg',
              ocr: 'MITOSIS\n1. Prophase: chromosomes condense\n2. Metaphase: they line up at the equator\n3. Anaphase: chromatids separate\n4. Telophase: 2 nuclei form\nResult: 2 identical daughter cells (2n)',
              description: 'Photo of the whiteboard with the 4 phases of mitosis.',
            },
          },
          { text: 'Meiosis ≠ mitosis: meiosis gives 4 cells with half the chromosomes (n). It makes gametes.' },
          { text: '📌 Midterm: Thursday — all of chapter 3.' },
        ],
        study: [
          {
            kind: 'flashcards', title: 'Cells and cell division',
            data: { cards: [
              { q: 'What do mitochondria produce?', a: 'ATP, through cellular respiration.' },
              { q: 'What do ribosomes do?', a: 'They synthesize proteins.' },
              { q: 'What are the phases of mitosis?', a: 'Prophase, metaphase, anaphase and telophase.' },
              { q: 'How many cells does meiosis produce?', a: '4 cells with half the chromosomes (n).' },
              { q: 'Where is DNA found?', a: 'In the nucleus.' },
            ] },
          },
          {
            kind: 'quiz', title: 'Quiz: cell division',
            data: { questions: [
              { q: 'In which phase of mitosis do chromosomes line up at the equator?', options: ['Prophase', 'Metaphase', 'Anaphase', 'Telophase'], answer: 1, explanation: 'The whiteboard photo says they line up at the equator in metaphase.' },
              { q: 'What is the result of mitosis?', options: ['4 cells (n)', '2 identical daughter cells (2n)', '1 cell with double DNA', '2 gametes'], answer: 1, explanation: 'The whiteboard says: 2 identical daughter cells (2n).' },
              { q: 'What is meiosis for?', options: ['Producing ATP', 'Synthesizing proteins', 'Making gametes', 'Repairing tissue'], answer: 2, explanation: 'The notes say meiosis makes gametes.' },
            ] },
          },
        ],
      },
    ],
  },
};

export const SEED_MESSAGES = Math.max(...Object.values(SEED).map((d) => d.notes.reduce((s, n) => s + n.messages.length, 0)));
