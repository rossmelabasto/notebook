// theme.js — tema (sistema / claro / oscuro) y color de acento, guardados en este dispositivo
const root = document.documentElement;
const media = window.matchMedia('(prefers-color-scheme: dark)');

export const ACCENTS = ['brand', 'violet', 'lime', 'blue', 'amber', 'pink'];

export const getTheme = () => {
  try { return localStorage.getItem('nb_theme') || 'system'; } catch { return 'system'; }
};
export const getAccent = () => {
  try { return localStorage.getItem('nb_accent') || 'brand'; } catch { return 'brand'; }
};
export const isDark = () => (getTheme() === 'system' ? media.matches : getTheme() === 'dark');

function syncMeta() {
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim() || (isDark() ? '#0c0e13' : '#f5f6fa');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}

export function setTheme(t) {
  try { t === 'system' ? localStorage.removeItem('nb_theme') : localStorage.setItem('nb_theme', t); } catch { /* ok */ }
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
  syncMeta();
}

export function setAccent(a) {
  try { a === 'brand' ? localStorage.removeItem('nb_accent') : localStorage.setItem('nb_accent', a); } catch { /* ok */ }
  if (a === 'brand') delete root.dataset.accent;
  else root.dataset.accent = a;
  syncMeta();
}

/** Alterna claro/oscuro desde el botón rápido (si estaba en "sistema", fija el contrario) */
export function toggleTheme() {
  setTheme(isDark() ? 'light' : 'dark');
}

media.addEventListener('change', syncMeta);
syncMeta();
