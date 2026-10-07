// core.js — estado global, helpers de DOM, iconos, API, toasts y modales
import { t, errorText, locale } from './i18n.js';

export const state = {
  user: null,
  subjects: [],
  generalCount: 0,
  orphanedCount: 0,
  totalCount: 0,
  subject: null,       // null = General | 'orphaned' | id
  notes: [],
  current: null,       // apunte abierto { id, title, subject_id, messages[] }
  view: 'notes',       // 'notes' | 'chat' | 'study'
  chat: [],            // pregunta rápida: [{ role, text, sources, insufficient, error }]
  chatFilter: null,    // null = todo | 'general' | 'orphaned' | id
  convos: [],
  convosLoaded: false,
  activeConvo: null,
  convoMsgs: [],
  asking: false,
  sending: false,
  noteSearch: { open: false, query: '', idx: 0, matches: 0 },
  drawer: false,       // móvil: lista de apuntes/chats como cajón
  els: {},
};

/* ---------- DOM ---------- */

export const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
};

export function btn(cls, { icon: ic, label, title, onClick } = {}) {
  const b = el('button', cls);
  b.type = 'button';
  if (ic) b.appendChild(icon(ic));
  if (label) b.appendChild(el('span', null, label));
  if (title) { b.title = title; b.setAttribute('aria-label', title); }
  if (onClick) b.onclick = onClick;
  return b;
}

/* ---------- iconos (Feather) ---------- */

const ICONS = {
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  messageCircle: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  edit: '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  zoom: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  chevronUp: '<polyline points="18 15 12 9 6 15"/>',
  chevronDown: '<polyline points="6 9 12 15 18 9"/>',
  chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
  chevronRight: '<polyline points="9 18 15 12 9 6"/>',
  arrowDown: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  square: '<rect x="5" y="5" width="14" height="14" rx="2" ry="2"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
  helpCircle: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  moreVertical: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  play: '<polygon points="5 3 19 12 5 21 5 3"/>',
  sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  github: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>',
  droplet: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
};

export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = 'ic ' + cls;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span;
}

/* ---------- API ---------- */

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** fetch a la API: JSON por defecto, cabecera anti-CSRF, errores traducidos */
export async function api(path, opts = {}) {
  const isForm = opts.body instanceof FormData;
  const headers = { 'X-NB': '1', ...(isForm || !opts.body ? {} : { 'Content-Type': 'application/json' }), ...opts.headers };
  const body = isForm || typeof opts.body === 'string' || opts.body === undefined ? opts.body : JSON.stringify(opts.body);
  let res;
  try {
    res = await fetch(path, { ...opts, headers, body, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'offline', t('err.offline'));
  }
  if (opts.raw) {
    if (!res.ok) throw new ApiError(res.status, 'http', `HTTP ${res.status}`);
    return res;
  }
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (res.status === 401 && !opts.noAuthRedirect) {
    onUnauthorized();
    throw new ApiError(401, 'not_authenticated', t('err.not_authenticated'));
  }
  if (!res.ok) throw new ApiError(res.status, data?.code || 'http', errorText(data?.code, data?.error || `HTTP ${res.status}`));
  return data;
}

/** POST que responde con Server-Sent Events: llama onEvent(event, data) por cada evento */
export async function apiStream(path, body, onEvent, signal) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'X-NB': '1', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    signal,
  });
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch { /* ok */ }
    if (res.status === 401) onUnauthorized();
    throw new ApiError(res.status, data?.code || 'http', errorText(data?.code, data?.error || `HTTP ${res.status}`));
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let ev = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) ev = line.slice(7);
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (data) onEvent(ev, JSON.parse(data));
    }
  }
}

/* ---------- utilidades ---------- */

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).catch(() => {});
  const ta = el('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch { /* ok */ }
  ta.remove();
}

export function setBtnBusy(b, busy) {
  if (!b) return;
  if (busy) {
    if (!b._orig) b._orig = [...b.childNodes];
    b.replaceChildren(el('span', 'spinner'));
    b.disabled = true;
  } else {
    b.disabled = false;
    if (b._orig) b.replaceChildren(...b._orig);
    b._orig = null;
  }
}

export const debounce = (fn, ms) => {
  let id;
  return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
};

const toDate = (iso) => new Date(String(iso).replace(' ', 'T') + (String(iso).includes('Z') || String(iso).includes('+') ? '' : 'Z'));

export function fmtDate(iso, withTime = true) {
  if (!iso) return '';
  const opts = { day: '2-digit', month: 'short' };
  const d = toDate(iso);
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
  return d.toLocaleString(locale(), opts);
}

export function fmtTime(iso) {
  if (!iso) return '';
  return toDate(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
}

export function fmtDay(iso) {
  if (!iso) return '';
  const d = toDate(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t('date.today');
  if (d.toDateString() === y.toDateString()) return t('date.yesterday');
  return d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

export const localDayKey = (iso) => (iso ? toDate(iso).toDateString() : '');

export function fmtRelative(iso) {
  if (!iso) return '';
  const diff = (Date.now() - toDate(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  if (diff < 60) return rtf.format(0, 'second');
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  if (diff < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day');
  return fmtDate(iso, false);
}

/* ---------- toasts ---------- */

export function toast(msg, kind = '', ic = '') {
  const box = document.getElementById('toasts');
  const tEl = el('div', 'toast ' + kind);
  tEl.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  if (ic || kind === 'ok') tEl.appendChild(icon(ic || 'check', 'toast-ic'));
  tEl.appendChild(el('span', 'toast-msg', msg));
  if (kind === 'error') {
    const cp = btn('btn-icon toast-copy', { icon: 'copy', title: t('common.copyError') });
    cp.onclick = () => { copyText(msg); toast(t('common.copied'), 'ok'); };
    tEl.appendChild(cp);
  }
  box.appendChild(tEl);
  setTimeout(() => tEl.classList.add('out'), kind === 'error' ? 7000 : 3500);
  setTimeout(() => tEl.remove(), kind === 'error' ? 7400 : 3900);
}

export const toastError = (e) => toast(e?.message || String(e), 'error');

/* ---------- modales ---------- */

/**
 * Modal genérico. Devuelve { back, modal, close }. Esc y clic afuera cierran.
 * Mantiene el foco dentro del modal (accesibilidad).
 */
export function openModal({ title, sub, wide = false, cls = '', onClose } = {}) {
  const back = el('div', 'modal-back');
  const modal = el('div', 'modal' + (wide ? ' wide' : '') + (cls ? ' ' + cls : ''));
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  if (title) {
    const h = el('h3', null, title);
    h.id = 'm' + Math.random().toString(36).slice(2);
    modal.setAttribute('aria-labelledby', h.id);
    modal.appendChild(h);
  }
  if (sub) modal.appendChild(el('p', 'sub', sub));
  const prevFocus = document.activeElement;
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key === 'Tab') {
      const f = [...modal.querySelectorAll('button, input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  };
  let closed = false;
  const close = (val) => {
    if (closed) return;
    closed = true;
    back.remove();
    document.removeEventListener('keydown', onKey, true);
    prevFocus?.focus?.({ preventScroll: true });
    onClose?.(val);
  };
  document.addEventListener('keydown', onKey, true);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.appendChild(modal);
  document.body.appendChild(back);
  return { back, modal, close };
}

export function field(label, input) {
  const f = el('div', 'field');
  const l = el('label', null, label);
  const id = 'f' + Math.random().toString(36).slice(2);
  input.id = id;
  l.htmlFor = id;
  f.append(l, input);
  return f;
}

export function input(type = 'text', value = '', attrs = {}) {
  const i = el('input');
  i.type = type;
  i.value = value;
  Object.assign(i, attrs);
  return i;
}

export function confirmModal({ title, message, confirmLabel, danger = true, iconName = 'trash' }) {
  return new Promise((resolve) => {
    let result = false;
    const { modal, close } = openModal({ cls: 'modal-confirm', onClose: () => resolve(result) });
    const ic = el('div', 'confirm-ic' + (danger ? ' danger' : ''));
    ic.appendChild(icon(iconName));
    modal.append(ic, el('h3', null, title), el('p', 'sub', message));
    const actions = el('div', 'actions');
    const cancel = btn('btn', { label: t('common.cancel'), onClick: () => close() });
    const ok = btn('btn ' + (danger ? 'btn-danger' : 'btn-primary'), {
      label: confirmLabel || t('common.delete'),
      onClick: () => { result = true; close(); },
    });
    actions.append(cancel, ok);
    modal.appendChild(actions);
    ok.focus();
  });
}

export function promptModal({ title, label, value = '', confirmLabel, type = 'text', maxLength = 200 }) {
  return new Promise((resolve) => {
    let result = null;
    const { modal, close } = openModal({ title, onClose: () => resolve(result) });
    const inp = input(type, value, { maxLength });
    modal.appendChild(field(label, inp));
    const actions = el('div', 'actions');
    const submit = () => { result = inp.value.trim() || null; close(); };
    actions.append(
      btn('btn', { label: t('common.cancel'), onClick: () => close() }),
      btn('btn btn-primary', { label: confirmLabel || t('common.save'), onClick: submit })
    );
    modal.appendChild(actions);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    inp.focus();
    inp.select();
  });
}

/** Menú contextual flotante anclado a un botón */
export function popMenu(anchor, items) {
  document.querySelector('.pop-menu')?.remove();
  const menu = el('div', 'pop-menu');
  menu.setAttribute('role', 'menu');
  for (const it of items) {
    if (!it) continue;
    if (it === '-') { menu.appendChild(el('div', 'pop-sep')); continue; }
    const b = btn('pop-item' + (it.danger ? ' danger' : ''), { icon: it.icon, label: it.label });
    b.setAttribute('role', 'menuitem');
    b.onclick = (e) => { e.stopPropagation(); menu.remove(); it.onClick(); };
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  menu.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';
  menu.style.top = (r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
  setTimeout(() => {
    const off = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', off, true); } };
    document.addEventListener('mousedown', off, true);
    menu.querySelector('button')?.focus();
  }, 0);
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { menu.remove(); anchor.focus(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const f = [...menu.querySelectorAll('button')];
      const i = f.indexOf(document.activeElement);
      f[(i + (e.key === 'ArrowDown' ? 1 : -1) + f.length) % f.length].focus();
    }
  });
  return menu;
}

/** Nombre de la materia/alcance para mostrar */
export function scopeName(id) {
  if (id === null || id === undefined) return t('subj.general');
  if (id === 'orphaned') return t('subj.unfiled');
  if (id === 'all') return t('subj.all');
  return state.subjects.find((s) => s.id === id)?.name || '?';
}
