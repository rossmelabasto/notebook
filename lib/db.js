// lib/db.js — SQLite (node:sqlite) + sqlite-vec, con migraciones versionadas (PRAGMA user_version)
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { getLoadablePath } from 'sqlite-vec';
import { config } from './config.js';

mkdirSync(config.dataDir, { recursive: true });

export const IMG_DIR = path.join(config.dataDir, 'images');
export const AUDIO_DIR = path.join(config.dataDir, 'audio');
mkdirSync(IMG_DIR, { recursive: true });
mkdirSync(AUDIO_DIR, { recursive: true });

export const db = new DatabaseSync(process.env.DB_FILE || path.join(config.dataDir, 'notebook.db'), {
  allowExtension: true,
});

// sqlite-vec: el paquete trae el binario para Linux/macOS/Windows (x64 y arm64)
try {
  db.loadExtension(getLoadablePath(), 'sqlite3_vec_init');
} catch (err) {
  console.error('[db] No se pudo cargar sqlite-vec:', err.message);
  process.exit(1);
}

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

export const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');

/** Transacción síncrona: BEGIN/COMMIT/ROLLBACK alrededor de fn() */
export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

const cols = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

/* ---------- esquema base (compatible con la versión de agosto) ---------- */

db.exec(`
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  orphaned   INTEGER NOT NULL DEFAULT 0,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  embedded   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id     INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL,
  filename    TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  ocr_text    TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id    INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'text',
  content    TEXT NOT NULL DEFAULT '',
  image_id   INTEGER REFERENCES images(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS convos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT 'New chat',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS convo_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  convo_id     INTEGER NOT NULL REFERENCES convos(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,
  content      TEXT NOT NULL,
  sources_json TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
`);

// Columnas que se agregaron en caliente en agosto
if (!cols('notes').includes('subject_id')) {
  db.exec('ALTER TABLE notes ADD COLUMN subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL');
}
if (!cols('notes').includes('orphaned')) {
  db.exec('ALTER TABLE notes ADD COLUMN orphaned INTEGER NOT NULL DEFAULT 0');
}
if (!cols('messages').includes('sender')) db.exec('ALTER TABLE messages ADD COLUMN sender TEXT');
if (!cols('messages').includes('starred')) {
  db.exec('ALTER TABLE messages ADD COLUMN starred INTEGER NOT NULL DEFAULT 0');
}

/* ---------- migraciones versionadas ---------- */

const MIGRATIONS = [
  // v1 (2026-10): sesiones con hash, RAG nuevo (chunks por mensaje + híbrido), audio, FTS, estudio
  () => {
    // Sesiones: guardar solo el hash del token (si se filtra la base, no sirven las cookies)
    const sc = cols('sessions');
    if (!sc.includes('user_agent')) db.exec('ALTER TABLE sessions ADD COLUMN user_agent TEXT');
    if (!sc.includes('ip')) db.exec('ALTER TABLE sessions ADD COLUMN ip TEXT');
    if (!sc.includes('last_seen')) db.exec('ALTER TABLE sessions ADD COLUMN last_seen TEXT');
    const upd = db.prepare('UPDATE sessions SET token = ?, last_seen = created_at WHERE token = ?');
    for (const s of db.prepare('SELECT token FROM sessions').all()) upd.run(sha256(s.token), s.token);
    db.exec(`UPDATE sessions SET expires_at = datetime('now', '+${config.sessionDays} days')`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)');

    // Audio (notas de voz y audios de WhatsApp)
    db.exec(`
      CREATE TABLE IF NOT EXISTS audios (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id     INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        user_id     INTEGER NOT NULL,
        filename    TEXT NOT NULL,
        stored_path TEXT NOT NULL,
        mime        TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending',
        transcript  TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
    if (!cols('messages').includes('audio_id')) {
      db.exec('ALTER TABLE messages ADD COLUMN audio_id INTEGER REFERENCES audios(id) ON DELETE SET NULL');
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_note ON messages(note_id);
      CREATE INDEX IF NOT EXISTS idx_images_note  ON images(note_id);
      CREATE INDEX IF NOT EXISTS idx_audios_note  ON audios(note_id);
      CREATE INDEX IF NOT EXISTS idx_notes_subject ON notes(subject_id);
    `);

    // RAG: chunks nuevos (agrupan mensajes completos) + vectores coseno + FTS5
    db.exec('DROP TABLE IF EXISTS vec_chunks');
    db.exec('DROP TABLE IF EXISTS chunks');
    db.exec(`
      CREATE TABLE chunks (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id      INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        user_id      INTEGER NOT NULL,
        seq          INTEGER NOT NULL,
        first_msg_id INTEGER,
        last_msg_id  INTEGER,
        hash         TEXT NOT NULL,
        content      TEXT NOT NULL
      );
      CREATE INDEX idx_chunks_note ON chunks(note_id);
      CREATE INDEX idx_chunks_user ON chunks(user_id);

      CREATE VIRTUAL TABLE vec_chunks USING vec0(
        chunk_id  integer primary key,
        user_id   integer partition key,
        embedding float[${config.embedDim}] distance_metric=cosine
      );
      CREATE VIRTUAL TABLE chunks_fts USING fts5(content, tokenize='unicode61 remove_diacritics 2');

      -- Al borrar un chunk (también por cascada al borrar la nota) se limpian vector y FTS
      CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
        DELETE FROM vec_chunks WHERE chunk_id = old.id;
        DELETE FROM chunks_fts WHERE rowid = old.id;
      END;
    `);

    // Búsqueda global por palabra en los mensajes (texto + OCR + transcripciones)
    db.exec(`
      CREATE VIEW IF NOT EXISTS message_body AS
        SELECT m.id AS id,
               COALESCE(m.content, '')
               || COALESCE((SELECT ' ' || i.ocr_text || ' ' || i.description FROM images i WHERE i.id = m.image_id), '')
               || COALESCE((SELECT ' ' || a.transcript FROM audios a WHERE a.id = m.audio_id), '') AS body
          FROM messages m;

      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(body, tokenize='unicode61 remove_diacritics 2');

      CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
        INSERT INTO messages_fts(rowid, body) SELECT id, body FROM message_body WHERE id = new.id;
      END;
      CREATE TRIGGER messages_au AFTER UPDATE OF content, image_id, audio_id ON messages BEGIN
        DELETE FROM messages_fts WHERE rowid = old.id;
        INSERT INTO messages_fts(rowid, body) SELECT id, body FROM message_body WHERE id = new.id;
      END;
      CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
        DELETE FROM messages_fts WHERE rowid = old.id;
      END;
      CREATE TRIGGER images_au AFTER UPDATE OF ocr_text, description ON images BEGIN
        DELETE FROM messages_fts WHERE rowid IN (SELECT id FROM messages WHERE image_id = new.id);
        INSERT INTO messages_fts(rowid, body)
          SELECT b.id, b.body FROM message_body b JOIN messages m ON m.id = b.id WHERE m.image_id = new.id;
      END;
      CREATE TRIGGER audios_au AFTER UPDATE OF transcript ON audios BEGIN
        DELETE FROM messages_fts WHERE rowid IN (SELECT id FROM messages WHERE audio_id = new.id);
        INSERT INTO messages_fts(rowid, body)
          SELECT b.id, b.body FROM message_body b JOIN messages m ON m.id = b.id WHERE m.audio_id = new.id;
      END;
    `);
    db.exec('DELETE FROM messages_fts');
    db.exec('INSERT INTO messages_fts(rowid, body) SELECT id, body FROM message_body');

    // Material de estudio generado (resúmenes, flashcards, quizzes)
    db.exec(`
      CREATE TABLE IF NOT EXISTS study_sets (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        note_id    INTEGER REFERENCES notes(id) ON DELETE CASCADE,
        subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
        kind       TEXT NOT NULL,
        title      TEXT NOT NULL,
        topic      TEXT,
        data_json  TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_study_user ON study_sets(user_id);
    `);

    // Todo se re-indexa con el chunking nuevo al arrancar el servidor
    db.exec('UPDATE notes SET embedded = 0');
    db.prepare("INSERT INTO meta (key, value) VALUES ('reindex_all', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run();
    db.prepare("DELETE FROM meta WHERE key = 'vec_reindex_pending'").run();
  },
];

export function migrate() {
  let version = db.prepare('PRAGMA user_version').get().user_version;
  while (version < MIGRATIONS.length) {
    const fn = MIGRATIONS[version];
    tx(fn);
    version += 1;
    db.exec(`PRAGMA user_version = ${version}`);
    console.log(`[db] migración v${version} aplicada`);
  }
}

migrate();

export function getMeta(key) {
  return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
}
export function setMeta(key, value) {
  if (value === null) db.prepare('DELETE FROM meta WHERE key = ?').run(key);
  else {
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, String(value));
  }
}
