// test/migration.test.js — una base con el esquema de agosto migra sin perder datos ni sesiones
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

test('migración v0 → v1', async () => {
  const file = path.join(process.env.DATA_DIR, 'notebook.db');
  const old = new DatabaseSync(file);
  old.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL);
    CREATE TABLE notes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '', embedded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'text', content TEXT NOT NULL DEFAULT '', image_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE chunks (id INTEGER PRIMARY KEY AUTOINCREMENT, note_id INTEGER NOT NULL, user_id INTEGER NOT NULL, seq INTEGER NOT NULL, content TEXT NOT NULL);
    INSERT INTO users (username, password_hash, is_admin) VALUES ('ana', 'x:y', 0);
    INSERT INTO sessions (token, user_id, expires_at) VALUES ('legacy-token', 1, datetime('now', '+10 days'));
    INSERT INTO notes (user_id, title) VALUES (1, 'Historia');
    INSERT INTO messages (note_id, user_id, content) VALUES (1, 1, 'La revolución francesa empezó en 1789');
    INSERT INTO chunks (note_id, user_id, seq, content) VALUES (1, 1, 0, 'viejo');
  `);
  old.close();

  const { db, getMeta } = await import('../lib/db.js');
  const { getUserBySession } = await import('../lib/auth.js');

  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
  assert.equal(getUserBySession('legacy-token').username, 'ana', 'la sesión vieja sigue valiendo');
  assert.equal(db.prepare("SELECT COUNT(*) c FROM sessions WHERE token = 'legacy-token'").get().c, 0, 'pero ya no está en claro');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM chunks').get().c, 0, 'chunks viejos descartados');
  assert.equal(getMeta('reindex_all'), '1');
  assert.equal(db.prepare('SELECT embedded FROM notes').get().embedded, 0);
  const fts = db.prepare("SELECT rowid FROM messages_fts WHERE messages_fts MATCH 'revolucion'").all();
  assert.equal(fts.length, 1, 'mensajes existentes ya son buscables');

  const { indexNote } = await import('../lib/rag/indexer.js');
  const r = await indexNote(1);
  assert.equal(r.chunks, 1);
  assert.match(db.prepare('SELECT content FROM chunks').get().content, /^\[\d{4}-\d{2}-\d{2}\] La revolución/);
});
