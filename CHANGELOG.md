# Changelog

## 2026-10-07 — Open source

- Public release under the MIT license, with a clean history.
- Public landing page when signed out (features, screenshots, links to the repository and the author's portfolio). The installed PWA still opens straight to sign-in; `/#login` opens it too.
- Brand accent by default (lime in dark mode, violet in light mode); portable `sqlite-vec` loading (Linux/macOS, x64/arm64).
- README (EN/ES), architecture notes, contributing guide, security policy, GitHub Actions CI, configurable SSH deploy (`.deploy.env`).

## 2026-10-07 — v3: free tiers, fluid writing, themes

- All AI on free tiers: chat on Groq (`gpt-oss-120b`) with Gemini as fallback; embeddings (`gemini-embedding-001`) and image reading on Gemini; speech-to-text on Groq Whisper. Embeddings are paced to the free-tier limit; changing the embedding model triggers a full re-index; keyword search keeps working if embeddings fail.
- Outbox for writing: messages appear instantly and are sent in order in the background; the input never blocks or loses focus; failed sends can be retried and are retried automatically when the connection returns; per-note drafts survive reloads.
- Enter sends with a physical keyboard and inserts a newline on touch screens; pasting several lines offers "send as N messages"; long-press opens a message's menu on phones.
- Light / dark / system theme with accent colors and a full visual redesign.

## 2026-10-07 — v2: rebuilt from the ground up

- Hybrid retrieval: chunks of whole messages (with date and sender), sqlite-vec cosine search + FTS5/BM25, Reciprocal Rank Fusion; incremental indexing; follow-up questions rewritten as standalone queries; calibrated relevance threshold (Recall@6 93 % on real data).
- Streaming answers (SSE) with Markdown and clickable citations that jump to the exact message.
- Voice notes and WhatsApp audio transcribed; study mode (summaries, flashcards, quizzes); global `Ctrl+K` search; Markdown/zip export; message editing.
- Security: IDOR fix, localhost-only binding, trusted client IP only from the local proxy, CSRF protection, CSP, upload validation by file signature, sandboxed file serving, hashed session tokens with sliding expiry and session management, admin user management.
- Spanish/English UI, mobile layout with bottom navigation, modular code, versioned migrations, 30 tests, deploy with database snapshot and automatic rollback, backups including images and audio.

## 2026-08 — v1

- Notes as chat threads, images with OCR, WhatsApp import, a first RAG over sqlite-vec, accounts and a PWA.
