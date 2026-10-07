# Contributing

Thanks for wanting to improve Notebook! Issues and pull requests are welcome, in English or Spanish.

## Getting started

```bash
npm ci
npm test
DATA_DIR=/tmp/nb EMBED_PROVIDER=fake CHAT_PROVIDER=fake SETUP_TOKEN=dev PORT=8394 node server.js
```

With `EMBED_PROVIDER=fake` and `CHAT_PROVIDER=fake` everything runs offline with deterministic fake AI providers, which is also what the tests use.

## Guidelines

- **Keep it light:** no build step and no frontend framework. The frontend is plain ES modules in `public/js/`; new dependencies need a good reason.
- **Tests:** add or update tests in `test/` (`node:test`). API behavior goes in `test/api.test.js`, pure functions in `test/unit.test.js`.
- **Database changes:** add a new function to `MIGRATIONS` in `lib/db.js`; never edit an existing migration.
- **Every query is per user:** scope SQL to `req.user.id` and return 404 (not 403) for other users' resources.
- **UI text:** add every string to both languages in `public/js/i18n.js`; never build HTML from user data (use `el()`/`textContent`).
- **Free tiers first:** AI calls go through `lib/llm.js` and should keep working on the free plans of Groq and Gemini.
- Code comments are in Spanish; English is fine in new code.

## Pull requests

1. Fork and create a branch from `main`.
2. Make sure `npm test` passes.
3. Describe what changes and why; screenshots help for UI changes (light and dark).
