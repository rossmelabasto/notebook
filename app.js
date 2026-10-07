// app.js — arma la aplicación Express (sin escuchar: así los tests la usan directo)
import express from 'express';
import path from 'node:path';
import { ROOT } from './lib/config.js';
import { csrfGuard, errorHandler, securityHeaders, HttpError } from './lib/http.js';
import { router as authRoutes } from './routes/auth.js';
import { router as adminRoutes } from './routes/admin.js';
import { router as noteRoutes } from './routes/notes.js';
import { router as mediaRoutes } from './routes/media.js';
import { router as importRoutes } from './routes/import.js';
import { router as askRoutes } from './routes/ask.js';
import { router as studyRoutes } from './routes/study.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false); // la IP real se toma de CF-Connecting-IP solo si viene de localhost

  app.use(securityHeaders);

  const api = express.Router();
  api.use(express.json({ limit: '6mb' }));
  api.use(csrfGuard);
  api.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(authRoutes);
  api.use('/admin', adminRoutes);
  api.use(noteRoutes);
  api.use(mediaRoutes);
  api.use(importRoutes);
  api.use(askRoutes);
  api.use(studyRoutes);
  api.use((req, res, next) => next(new HttpError(404, 'not_found', 'Not found')));
  app.use('/api', api);

  // Librerías del navegador servidas desde node_modules (sin CDN: funciona offline y con CSP 'self')
  const vendor = {
    'marked.esm.js': 'node_modules/marked/lib/marked.esm.js',
    'purify.es.mjs': 'node_modules/dompurify/dist/purify.es.mjs',
  };
  app.get('/vendor/:file', (req, res, next) => {
    const rel = vendor[req.params.file];
    if (!rel) return next();
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type('application/javascript').sendFile(path.join(ROOT, rel));
  });

  app.use(
    express.static(path.join(ROOT, 'public'), {
      setHeaders(res, file) {
        // el service worker y el HTML siempre frescos; el resto se revalida
        if (/sw\.js$|index\.html$|\.webmanifest$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
        else res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      },
    })
  );

  app.use(errorHandler);
  return app;
}
