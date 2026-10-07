# Architecture

Notebook is a single Node.js process with one SQLite database and a static, build-free frontend.

```
browser (PWA, ES modules) ──HTTPS──► reverse proxy / tunnel ──► Node.js (127.0.0.1)
                                                                   ├─ routes/   HTTP API (+ SSE for answers)
                                                                   ├─ lib/jobs  background queues (index, OCR, transcription)
                                                                   └─ SQLite    data/notebook.db (+ images/, audio/)
                                                                        ├─ sqlite-vec  vectors (cosine)
                                                                        └─ FTS5        keyword search
```

## Data model

- `users`, `sessions` (only the SHA-256 of the token), `subjects`, `notes`.
- `messages` — the thread of a note. A message is `text`, `image` (→ `images`, with OCR text and description) or `audio` (→ `audios`, with transcript).
- `chunks` + `vec_chunks` (sqlite-vec, partitioned by user) + `chunks_fts` — what the RAG searches.
- `messages_fts` — kept in sync by triggers, powers the `Ctrl+K` search.
- `convos` / `convo_messages` — saved conversations; `study_sets` — generated summaries, flashcards and quizzes.

Schema changes are versioned migrations in `lib/db.js` (`PRAGMA user_version`).

## Indexing

1. Each message becomes a line like `[2026-08-12] Ana: text…` (images contribute their OCR and description, audio its transcript).
2. Lines are grouped greedily into chunks of ~1,000 characters **without splitting messages**; only a message longer than the limit is cut, at natural boundaries with overlap (`lib/rag/chunker.js`).
3. Each chunk is hashed. On re-index only new hashes are embedded and stale chunks are deleted (triggers clean vectors and FTS rows), so appending a message re-embeds a single chunk (`lib/rag/indexer.js`).
4. Indexing runs in a debounced queue per note and waits for pending OCR/transcriptions of that note (`lib/jobs.js`). Embeddings are paced to the provider's free-tier rate limit.

## Answering a question

1. In a conversation, follow-ups ("and when was that?") are rewritten as a standalone query.
2. **Hybrid search** (`lib/rag/search.js`): k-NN over the user's vectors + BM25 over FTS5, fused with Reciprocal Rank Fusion, optionally scoped to a subject. If the embedding call fails, keyword search still works.
3. If nothing is similar enough (`RAG_MIN_SIM`) and no keyword matches, the app says it is not in the notes without calling the LLM.
4. The context (~9,000 characters) goes to the LLM with instructions to answer only from it and cite `[n]`; after a `<<<QUOTES>>>` delimiter it lists verbatim quotes, which the UI highlights in the sources. The answer is streamed over SSE, and the delimiter is never shown even if it arrives split across chunks.

## AI providers

`lib/llm.js` wraps every provider through OpenAI-compatible APIs:

| Task | Provider (free tier) | Fallback |
|---|---|---|
| Chat / study | Groq `openai/gpt-oss-120b` | Gemini `gemini-flash-lite-latest` |
| Embeddings | Gemini `gemini-embedding-001` (1536 dims) | OpenAI (if configured) |
| Image reading | Gemini `gemini-flash-lite-latest` | OpenAI `gpt-4o-mini` (if configured) |
| Speech-to-text | Groq `whisper-large-v3-turbo` | — |

Short `429` rate limits are retried after the delay the API asks for. `EMBED_PROVIDER=fake` / `CHAT_PROVIDER=fake` give deterministic offline providers for tests and development.

## Frontend

Plain ES modules served as-is: `core` (DOM helpers, API, modals), `i18n`, `theme`, `shell` (layout, subjects, note list), `editor` (thread, composer with an outbox queue, voice recording), `ask`, `study`, `search`, `account`, `importer`, `landing`. Markdown answers are rendered with marked and sanitized with DOMPurify; everything else is built with `textContent`. A network-first service worker makes it installable and usable offline for the shell.
