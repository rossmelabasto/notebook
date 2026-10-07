// main.js — arranque: service worker, sesión, atajos de teclado, instalación PWA y errores globales
import { state, el, icon, api, toast, setUnauthorizedHandler } from './core.js';
import { t } from './i18n.js';
import { renderAuth } from './auth.js';
import { renderLanding } from './landing.js';
import { loadApp, isMobile, renderApp, switchView } from './shell.js';
import { toggleNoteSearch, newNote } from './editor.js';
import { openSearch } from './search.js';

/* ---------- PWA ---------- */

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
window.addEventListener('appinstalled', () => { installPrompt = null; });
export const canInstall = () => !!installPrompt;
export async function doInstall() {
  if (!installPrompt) return;
  installPrompt.prompt();
  try { await installPrompt.userChoice; } catch { /* cancelado */ }
  installPrompt = null;
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    // versión nueva lista → avisar con un botón para recargar
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdateToast();
      });
    });
  }).catch(() => {});
}

function showUpdateToast() {
  const box = document.getElementById('toasts');
  const tEl = el('div', 'toast update');
  tEl.append(icon('refresh', 'toast-ic'), el('span', 'toast-msg', t('app.updated')));
  const b = el('button', 'btn btn-sm btn-primary', t('app.reload'));
  b.onclick = () => location.reload();
  tEl.appendChild(b);
  box.appendChild(tEl);
}

/* ---------- atajos ---------- */

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!state.user || document.querySelector('.modal-back:not(.palette-back)')) return;
  if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openSearch(); }
  else if (mod && (e.key === 'f' || e.key === 'F') && state.view === 'notes' && state.current) { e.preventDefault(); toggleNoteSearch(true); }
  else if (e.altKey && e.key === '1') { e.preventDefault(); switchView('notes'); }
  else if (e.altKey && e.key === '2') { e.preventDefault(); switchView('chat'); }
  else if (e.altKey && e.key === '3') { e.preventDefault(); switchView('study'); }
  else if (e.altKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); newNote(); }
});

// al cruzar el ancho móvil/escritorio se rehace la estructura
let wasMobile = isMobile();
window.addEventListener('resize', () => {
  const m = isMobile();
  if (m !== wasMobile && state.user) { wasMobile = m; renderApp(); }
});

/* ---------- errores no atrapados ---------- */

window.addEventListener('error', (e) => {
  if (!e.message || /ResizeObserver/.test(e.message)) return;
  toast(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno || ''})`, 'error');
});
window.addEventListener('unhandledrejection', (e) => {
  const err = e.reason;
  if (err?.name === 'AbortError' || err?.status === 401) return;
  toast(err?.message || String(err), 'error');
});

/* ---------- boot ---------- */

async function boot() {
  const splash = el('div', 'splash');
  const logo = el('div', 'splash-logo');
  logo.appendChild(icon('book'));
  splash.append(logo, el('span', 'spinner'));
  document.getElementById('app').replaceChildren(splash);
  setUnauthorizedHandler(() => { if (state.user) renderAuth(); });
  registerSW();
  try {
    await api('/api/me', { noAuthRedirect: true });
    await loadApp();
  } catch {
    // sin sesión: la app instalada (PWA) va directo al login; en el navegador, la landing
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    let needsSetup = false;
    try { needsSetup = (await api('/api/bootstrap', { noAuthRedirect: true })).needsSetup; } catch { /* ok */ }
    if (standalone || needsSetup || location.hash === '#login') await renderAuth();
    else renderLanding();
  }
}

// enlace directo al login (notebook…/#login) también con la página ya abierta
window.addEventListener('hashchange', () => {
  if (location.hash === '#login' && !state.user) renderAuth();
});

boot();
