// editor.js — el apunte abierto: hilo de mensajes (texto, imágenes, audios), compositor y búsqueda interna
import {
  state, el, icon, btn, api, toast, toastError, confirmModal, popMenu, fmtDate, fmtTime, fmtDay, localDayKey,
  setBtnBusy, copyText, scopeName,
} from './core.js';
import { t } from './i18n.js';
import {
  refreshNotes, refreshSubjects, renderNotes, renderSubjects, switchView, isMobile, menuButton, noteListItems,
  patchNoteInList, toggleDrawer, selectSubject,
} from './shell.js';

let pendingTimer = null;

/* ---------- abrir / crear / borrar ---------- */

export async function openNote(id, { focusMessage = null, quote = null } = {}) {
  if (state.view !== 'notes') switchView('notes');
  try {
    const r = await api('/api/notes/' + id);
    state.current = r.note;
    state.noteSearch = { open: false, query: '', idx: 0, matches: 0 };
  } catch (e) {
    return toastError(e);
  }
  renderEditor({ bottom: !focusMessage });
  renderNotes();
  if (focusMessage) setTimeout(() => focusMessageBubble(focusMessage, quote), 60);
}

export async function newNote() {
  const subject_id = state.subject === 'orphaned' ? null : state.subject;
  try {
    const r = await api('/api/notes', { method: 'POST', body: { title: t('note.untitled'), subject_id } });
    await refreshNotes();
    await refreshSubjects();
    renderSubjects();
    toggleDrawer(false);
    await openNote(r.id);
    const ti = document.querySelector('.editor-head .title-input');
    ti?.focus();
    ti?.select();
  } catch (e) { toastError(e); }
}

async function deleteNote() {
  if (!state.current) return;
  if (!(await confirmModal({ title: t('note.deleteTitle'), message: t('note.deleteMsg', { title: state.current.title }) }))) return;
  try {
    await api('/api/notes/' + state.current.id, { method: 'DELETE' });
    state.current = null;
    await refreshNotes();
    await refreshSubjects();
    renderSubjects();
    renderNotes();
    renderEditor();
    toast(t('note.deleted'), 'ok');
  } catch (e) { toastError(e); }
}

async function saveNoteMeta(patch) {
  await api('/api/notes/' + state.current.id, { method: 'PUT', body: patch });
  Object.assign(state.current, patch);
  await refreshNotes();
  renderNotes();
}

/* ---------- vista ---------- */

export function renderEditor(opts = {}) {
  const view = state.els.notesView;
  if (!view) return;
  clearTimeout(pendingTimer);
  view.replaceChildren();

  if (!state.current) {
    view.appendChild(isMobile() ? mobileList() : emptyState());
    return;
  }
  const note = state.current;
  const pane = el('div', 'editor-pane');

  /* cabecera */
  const head = el('div', 'editor-head');
  const back = btn('btn-icon mobile-only', { icon: 'chevronLeft', title: t('common.back') });
  back.onclick = () => { state.current = null; renderEditor(); renderNotes(); };
  const title = el('input', 'title-input');
  title.type = 'text';
  title.value = note.title;
  title.maxLength = 200;
  title.setAttribute('aria-label', t('note.title'));
  title.onblur = async () => {
    const v = title.value.trim() || t('note.untitled');
    if (v === note.title) return;
    try { await saveNoteMeta({ title: v }); } catch (e) { toastError(e); title.value = note.title; }
  };
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } });

  const searchBtn = btn('btn-icon' + (state.noteSearch.open ? ' on' : ''), { icon: 'search', title: t('note.searchIn') + ' (Ctrl+F)' });
  searchBtn.onclick = () => toggleNoteSearch();
  const starCount = note.messages.filter((m) => m.starred).length;
  const starBtn = btn('btn-icon star-toggle' + (note.showStarred ? ' on' : ''), { icon: 'star', title: t('note.showStarred') });
  starBtn.hidden = starCount === 0;
  starBtn.appendChild(el('span', 'star-count', String(starCount)));
  starBtn.onclick = () => { note.showStarred = !note.showStarred; renderEditor({ bottom: true }); };
  const more = btn('btn-icon', { icon: 'moreVertical', title: t('common.options') });
  more.onclick = () =>
    popMenu(more, [
      { icon: 'layers', label: t('study.fromNote'), onClick: () => { switchView('study'); import('./study.js').then((m) => m.presetScope({ noteId: note.id })); } },
      { icon: 'download', label: t('note.exportMd'), onClick: () => { location.href = `/api/notes/${note.id}/export`; } },
      '-',
      { icon: 'trash', label: t('note.delete'), danger: true, onClick: deleteNote },
    ]);
  head.append(back, title, searchBtn, starBtn, more);
  pane.appendChild(head);

  /* materia + fechas + estado del índice */
  const meta = el('div', 'editor-meta');
  const sel = el('select');
  sel.setAttribute('aria-label', t('subj.one'));
  const optG = el('option', null, t('subj.general'));
  optG.value = '';
  sel.appendChild(optG);
  for (const s of state.subjects) {
    const o = el('option', null, s.name);
    o.value = String(s.id);
    sel.appendChild(o);
  }
  sel.value = note.subject_id == null ? '' : String(note.subject_id);
  sel.onchange = async () => {
    try {
      await saveNoteMeta({ subject_id: sel.value === '' ? null : Number(sel.value) });
      await refreshSubjects();
      renderSubjects();
      toast(t('note.movedTo', { name: scopeName(note.subject_id) }), 'ok');
    } catch (e) { toastError(e); }
  };
  const idx = el('span', 'index-badge' + (note.embedded ? ' ok' : ''));
  idx.append(icon(note.embedded ? 'check' : 'clock'), el('span', null, note.embedded ? t('note.indexed') : t('note.indexing')));
  meta.append(icon('book', 'meta-ic'), sel, el('span', 'meta-date', `${t('note.created')} ${fmtDate(note.created_at)} · ${note.messages.length} ${t('note.msgs')}`), idx);
  pane.appendChild(meta);

  /* búsqueda interna */
  pane.appendChild(searchBar());

  /* hilo */
  const thread = el('div', 'thread');
  thread.setAttribute('role', 'log');
  thread.setAttribute('aria-live', 'polite');
  const msgs = note.showStarred ? note.messages.filter((m) => m.starred) : note.messages;
  if (!msgs.length) {
    const ph = el('div', 'thread-ph');
    const big = el('div', 'big-ic');
    big.appendChild(icon(note.showStarred ? 'star' : 'messageCircle'));
    ph.append(big, el('div', null, note.showStarred ? t('note.noStarred') : t('note.emptyThread')));
    if (!note.showStarred) ph.appendChild(el('div', 'hint', t('note.emptyHint')));
    thread.appendChild(ph);
  } else {
    appendBubbles(thread, msgs);
  }
  // mensajes que todavía se están enviando (si se redibujó el apunte en el medio)
  if (!note.showStarred) {
    const temps = pendingTemps(note.id);
    if (temps.length) {
      thread.querySelector('.thread-ph')?.remove();
      appendBubbles(thread, temps);
    }
  }
  pane.appendChild(thread);

  const fab = btn('btn-icon fab', { icon: 'arrowDown', title: t('common.toBottom') });
  fab.hidden = true;
  thread.addEventListener('scroll', () => {
    fab.hidden = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 200;
  }, { passive: true });
  fab.onclick = () => thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
  pane.appendChild(fab);

  if (note.showStarred) {
    const banner = el('div', 'star-banner');
    banner.append(icon('star'), el('span', null, t('note.starredOnly', { n: msgs.length })));
    banner.appendChild(btn('btn btn-sm', { label: t('note.showAll'), onClick: () => { note.showStarred = false; renderEditor({ bottom: true }); } }));
    pane.appendChild(banner);
  } else {
    pane.appendChild(composer(pane, thread));
  }

  view.appendChild(pane);
  if (state.noteSearch.open) setTimeout(runNoteSearch, 30);
  if (opts.keepScroll !== undefined) requestAnimationFrame(() => { thread.scrollTop = opts.keepScroll; });
  else if (opts.bottom !== false) {
    // el navegador termina de medir burbujas e imágenes en varios frames: se insiste un poco
    const toEnd = () => { thread.scrollTop = thread.scrollHeight; };
    requestAnimationFrame(() => { toEnd(); requestAnimationFrame(toEnd); });
    setTimeout(toEnd, 120);
    setTimeout(toEnd, 400);
    // las imágenes que cargan después empujan el contenido: si seguías abajo, quedarse abajo
    thread.addEventListener('load', (e) => {
      if (e.target.tagName === 'IMG' && thread.scrollHeight - thread.scrollTop - thread.clientHeight < 400) toEnd();
    }, true);
  }
  schedulePendingPoll();
}

function emptyState() {
  const empty = el('div', 'no-note');
  const big = el('div', 'big-ic');
  big.appendChild(icon('book'));
  empty.append(big, el('div', 'no-note-title', t('note.selectOrCreate')), el('div', 'hint', t('note.tipsDesktop')));
  empty.appendChild(btn('btn btn-primary', { icon: 'plus', label: t('note.new'), onClick: newNote }));
  return empty;
}

/** Móvil sin apunte abierto: chips de materias + lista de apuntes a pantalla completa */
function mobileList() {
  const wrap = el('div', 'mobile-list');
  const head = el('div', 'view-head');
  head.append(menuButton(), el('h2', null, t('nav.notes')), btn('btn btn-primary btn-sm', { icon: 'plus', label: t('note.newShort'), onClick: newNote }));
  wrap.appendChild(head);
  const chips = el('div', 'chips');
  const mk = (id, label, count) => {
    const c = btn('chip' + (state.subject === id ? ' active' : ''), { label: `${label} · ${count}` });
    c.onclick = () => selectSubject(id);
    return c;
  };
  chips.appendChild(mk(null, t('subj.general'), state.generalCount));
  if (state.orphanedCount) chips.appendChild(mk('orphaned', t('subj.unfiled'), state.orphanedCount));
  for (const s of state.subjects) chips.appendChild(mk(s.id, s.name, s.note_count));
  wrap.appendChild(chips);
  const list = el('div', 'note-list big');
  list.appendChild(noteListItems((id) => openNote(id)));
  wrap.appendChild(list);
  return wrap;
}

/* ---------- burbujas ---------- */

function appendBubbles(thread, msgs, animateLast = false) {
  const frag = document.createDocumentFragment();
  let lastDay = thread.dataset.lastDay || '';
  for (const m of msgs) {
    const day = localDayKey(m.created_at);
    if (day !== lastDay) {
      const sep = el('div', 'day-sep');
      sep.appendChild(el('span', null, fmtDay(m.created_at)));
      frag.appendChild(sep);
      lastDay = day;
    }
    frag.appendChild(renderBubble(m));
  }
  thread.dataset.lastDay = lastDay;
  if (animateLast && frag.lastChild?.classList) frag.lastChild.classList.add('pop');
  thread.appendChild(frag);
}

function renderBubble(m) {
  if (m.kind === 'image') return imageBubble(m);
  if (m.kind === 'audio') return audioBubble(m);
  return textBubble(m);
}

function isOther(m) {
  return m.sender && m.sender.toLowerCase() !== (state.user?.username || '').toLowerCase();
}

function bubbleShell(m, kind) {
  const b = el('div', `bubble ${kind}` + (isOther(m) ? ' other' : '') + (m.starred ? ' starred' : '') + (m.temp ? ' sending' : ''));
  b.dataset.id = m.id;
  b.dataset.kind = kind;
  b.tabIndex = -1;
  if (isOther(m)) {
    const s = el('div', 'sender');
    s.append(el('span', 'avatar xs', (m.sender[0] || '?').toUpperCase()), el('span', null, m.sender));
    b.appendChild(s);
  }
  return b;
}

function bubbleFooter(b, m, extraMenu = []) {
  const foot = el('div', 'bubble-foot');
  if (m.starred) foot.appendChild(icon('star', 'star-mark'));
  foot.appendChild(el('span', 'time', m.temp ? '' : fmtTime(m.created_at)));
  if (m.temp) foot.appendChild(icon('clock', 'sending-ic'));
  b.appendChild(foot);
  if (m.temp) return;
  const more = btn('btn-icon bubble-more', { icon: 'chevronDown', title: t('common.options') });
  more.onclick = (e) => {
    e.stopPropagation();
    popMenu(more, [
      { icon: 'star', label: m.starred ? t('msg.unstar') : t('msg.star'), onClick: () => toggleStar(m) },
      ...extraMenu,
      { icon: 'copy', label: t('common.copy'), onClick: () => { copyText(bubbleText(m)); toast(t('common.copied'), 'ok'); } },
      '-',
      { icon: 'trash', label: t('common.delete'), danger: true, onClick: () => deleteMessage(m) },
    ]);
  };
  b.appendChild(more);
  // mantener presionado (celular) o clic derecho = menú del mensaje
  b.addEventListener('contextmenu', (e) => {
    if (e.target.closest('a, textarea, input, audio')) return;
    e.preventDefault();
    more.click();
  });
  let pressTimer;
  b.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || e.target.closest('button, a, textarea, audio, summary')) return;
    pressTimer = setTimeout(() => { navigator.vibrate?.(10); more.click(); }, 480);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointermove']) {
    b.addEventListener(ev, (e) => { if (ev !== 'pointermove' || Math.abs(e.movementY) > 2) clearTimeout(pressTimer); });
  }
  // doble clic/tap = estrella rápida
  b.addEventListener('dblclick', (e) => {
    if (e.target.closest('button, textarea, input, audio, img, details')) return;
    toggleStar(m);
  });
}

const bubbleText = (m) =>
  m.kind === 'image' ? [m.content, m.ocr_text, m.description].filter(Boolean).join('\n')
  : m.kind === 'audio' ? [m.content, m.transcript].filter(Boolean).join('\n')
  : m.content || '';

function textBubble(m) {
  const b = bubbleShell(m, 'text');
  b.dataset.text = (m.content || '').toLowerCase();
  b.appendChild(linkify(m.content || ''));
  bubbleFooter(b, m, [{ icon: 'edit', label: t('common.edit'), onClick: () => editText(b, m) }]);
  return b;
}

/** Texto con enlaces clicables (sin innerHTML) */
function linkify(text) {
  const div = el('div', 'txt');
  const re = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) div.appendChild(document.createTextNode(text.slice(last, m.index)));
    const a = el('a', null, m[0]);
    a.href = m[0];
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    div.appendChild(a);
    last = m.index + m[0].length;
  }
  if (last < text.length) div.appendChild(document.createTextNode(text.slice(last)));
  return div;
}

function imageBubble(m) {
  const b = bubbleShell(m, 'image');
  b.dataset.text = [m.content, m.ocr_text, m.description].join(' ').toLowerCase();
  if (m.status === 'error') b.classList.add('err');
  const wrap = el('button', 'img-thumb-wrap');
  wrap.type = 'button';
  wrap.title = t('msg.openImage');
  const img = el('img', 'thumb');
  img.src = `/api/images/${m.image_id}/file`;
  img.alt = m.filename || t('msg.image');
  img.loading = 'lazy';
  img.decoding = 'async';
  wrap.appendChild(img);
  wrap.onclick = () => openLightbox(img.src, m.filename);
  b.appendChild(wrap);
  if (m.content) b.appendChild(linkify(m.content));
  b.appendChild(mediaStatus(m.status, () => api(`/api/images/${m.image_id}/process`, { method: 'POST' }).then(() => refreshMessage(m.id))));
  if (m.status === 'done') {
    b.appendChild(editableDetails(m, t('msg.transcription'), m.ocr_text, (v) => api(`/api/images/${m.image_id}`, { method: 'PUT', body: { ocr_text: v } })));
    b.appendChild(editableDetails(m, t('msg.description'), m.description, (v) => api(`/api/images/${m.image_id}`, { method: 'PUT', body: { description: v } })));
  }
  bubbleFooter(b, m);
  return b;
}

function audioBubble(m) {
  const b = bubbleShell(m, 'audio');
  b.dataset.text = [m.content, m.transcript].join(' ').toLowerCase();
  const st = m.audio_status;
  if (st === 'error') b.classList.add('err');
  const player = el('audio');
  player.controls = true;
  player.preload = 'none';
  player.src = `/api/audios/${m.audio_id}/file`;
  b.appendChild(player);
  if (m.content) b.appendChild(linkify(m.content));
  b.appendChild(mediaStatus(st, () => api(`/api/audios/${m.audio_id}/process`, { method: 'POST' }).then(() => refreshMessage(m.id)), true));
  if (st === 'done') {
    const det = editableDetails(m, t('msg.transcript'), m.transcript, (v) => api(`/api/audios/${m.audio_id}`, { method: 'PUT', body: { transcript: v } }));
    det.open = true;
    b.appendChild(det);
  }
  bubbleFooter(b, m);
  return b;
}

function mediaStatus(status, retry, isAudio = false) {
  const row = el('div', 'media-status ' + (status || 'pending'));
  if (status === 'pending') {
    row.append(el('span', 'spinner sm'), el('span', null, isAudio ? t('msg.transcribing') : t('msg.reading')));
  } else if (status === 'error') {
    row.append(icon('x'), el('span', null, t('msg.processError')));
    row.appendChild(btn('btn btn-sm', { icon: 'refresh', label: t('common.retry'), onClick: () => retry().catch(toastError) }));
  }
  return row;
}

function editableDetails(m, label, value, save) {
  const det = el('details', 'img-text');
  const sum = el('summary');
  sum.appendChild(el('span', null, label));
  const edit = btn('btn-icon img-edit', { icon: 'edit', title: t('common.edit') });
  sum.appendChild(edit);
  det.appendChild(sum);
  const body = el('div', 'img-text-body', value || t('msg.empty'));
  det.appendChild(body);
  edit.onclick = (e) => {
    e.preventDefault();
    det.open = true;
    const ta = el('textarea', 'img-edit-ta');
    ta.value = value || '';
    const actions = el('div', 'img-edit-actions');
    const ok = btn('btn btn-sm btn-primary', { icon: 'check', label: t('common.save') });
    const cancel = btn('btn btn-sm', { label: t('common.cancel'), onClick: () => body.replaceChildren(document.createTextNode(value || t('msg.empty'))) });
    actions.append(cancel, ok);
    body.replaceChildren(ta, actions);
    ta.focus();
    ok.onclick = async () => {
      setBtnBusy(ok, true);
      try {
        await save(ta.value);
        await refreshMessage(m.id);
        toast(t('msg.savedReindex'), 'ok');
      } catch (err) { setBtnBusy(ok, false); toastError(err); }
    };
  };
  return det;
}

function openLightbox(src, name) {
  const back = el('div', 'lightbox');
  const img = el('img');
  img.src = src;
  img.alt = name || '';
  const close = btn('btn-icon lb-close', { icon: 'x', title: t('common.close') });
  const open = el('a', 'btn btn-sm lb-open', t('msg.openOriginal'));
  open.href = src;
  open.target = '_blank';
  back.append(img, close, open);
  const done = () => { back.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } };
  back.onclick = (e) => { if (e.target === back || e.target === img) done(); };
  close.onclick = done;
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(back);
}

/* ---------- acciones sobre mensajes ---------- */

function replaceBubble(m) {
  const old = document.querySelector(`.thread .bubble[data-id="${m.id}"]`);
  if (old) keepBottom(() => old.replaceWith(renderBubble(m)));
}

async function refreshMessage(id) {
  const r = await api(`/api/notes/${state.current.id}/pending?ids=${id}`);
  for (const m of r.messages) {
    const i = state.current.messages.findIndex((x) => x.id === m.id);
    if (i >= 0) state.current.messages[i] = m;
    replaceBubble(m);
  }
  schedulePendingPoll();
}

async function toggleStar(m) {
  try {
    const r = await api('/api/messages/' + m.id, { method: 'PUT', body: { starred: !m.starred } });
    Object.assign(m, r.message);
    if (state.current.showStarred && !m.starred) {
      document.querySelector(`.thread .bubble[data-id="${m.id}"]`)?.remove();
    } else replaceBubble(m);
    const n = state.current.messages.filter((x) => x.starred).length;
    const sb = document.querySelector('.star-toggle');
    if (sb) { sb.hidden = n === 0; sb.querySelector('.star-count').textContent = String(n); }
  } catch (e) { toastError(e); }
}

function editText(bubble, m) {
  const ta = el('textarea', 'img-edit-ta');
  ta.value = m.content || '';
  const actions = el('div', 'img-edit-actions');
  const ok = btn('btn btn-sm btn-primary', { icon: 'check', label: t('common.save') });
  const cancel = btn('btn btn-sm', { label: t('common.cancel'), onClick: () => replaceBubble(m) });
  actions.append(cancel, ok);
  bubble.querySelector('.txt').replaceWith(ta);
  bubble.querySelector('.bubble-foot')?.before(actions);
  bubble.classList.add('editing');
  ta.style.height = Math.min(ta.scrollHeight + 4, 360) + 'px';
  ta.focus();
  const save = async () => {
    const v = ta.value.trim();
    if (!v) return;
    setBtnBusy(ok, true);
    try {
      const r = await api('/api/messages/' + m.id, { method: 'PUT', body: { content: v } });
      Object.assign(m, r.message);
      replaceBubble(m);
      setIndexBadge(false);
    } catch (e) { setBtnBusy(ok, false); toastError(e); }
  };
  ok.onclick = save;
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.stopPropagation(); replaceBubble(m); }
  });
}

async function deleteMessage(m) {
  const kindMsg = m.kind === 'image' ? t('msg.deleteImageMsg') : m.kind === 'audio' ? t('msg.deleteAudioMsg') : t('msg.deleteMsg');
  if (!(await confirmModal({ title: t('msg.deleteTitle'), message: kindMsg }))) return;
  try {
    await api('/api/messages/' + m.id, { method: 'DELETE' });
    state.current.messages = state.current.messages.filter((x) => x.id !== m.id);
    const node = document.querySelector(`.thread .bubble[data-id="${m.id}"]`);
    const prev = node?.previousElementSibling;
    const next = node?.nextElementSibling;
    node?.remove();
    // separador de día que quedó vacío
    if (prev?.classList.contains('day-sep') && (!next || next.classList.contains('day-sep'))) prev.remove();
    setIndexBadge(false);
    toast(t('msg.deleted'), 'ok');
  } catch (e) { toastError(e); }
}

function setIndexBadge(ok) {
  state.current.embedded = ok ? 1 : 0;
  const b = document.querySelector('.index-badge');
  if (!b) return;
  b.className = 'index-badge' + (ok ? ' ok' : '');
  b.replaceChildren(icon(ok ? 'check' : 'clock'), el('span', null, ok ? t('note.indexed') : t('note.indexing')));
  schedulePendingPoll();
}

/** Registra mensajes ya guardados: lista de apuntes, contador e índice */
function noteTouched(noteId, msgs) {
  const last = msgs.at(-1);
  patchNoteInList(noteId, {
    updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    last_kind: last.kind,
    snippet: (last.content || '').slice(0, 120),
    embedded: 0,
  });
  if (state.current?.id === noteId) setIndexBadge(false);
}

/** Agrega mensajes nuevos al hilo sin reconstruirlo (clave para apuntes de miles de mensajes) */
function pushMessages(msgs) {
  const thread = document.querySelector('.notes-view .thread');
  if (!thread) return;
  thread.querySelector('.thread-ph')?.remove();
  state.current.messages.push(...msgs);
  appendBubbles(thread, msgs, true);
  scrollToEnd(thread);
  noteTouched(state.current.id, msgs);
}

function scrollToEnd(thread, smooth = true) {
  const go = () => thread.scrollTo({ top: thread.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  requestAnimationFrame(() => { go(); requestAnimationFrame(() => { thread.scrollTop = thread.scrollHeight; }); });
}

const nearBottom = (thread) => thread.scrollHeight - thread.scrollTop - thread.clientHeight < 160;

/** Ejecuta un cambio en el hilo y, si estabas al final, te mantiene al final */
function keepBottom(fn) {
  const thread = document.querySelector('.notes-view .thread');
  const stick = thread && nearBottom(thread);
  fn();
  if (stick) scrollToEnd(thread, false);
}

/* ---------- bandeja de salida: escribir y enviar sin esperar ---------- */
// Cada mensaje aparece al instante (burbuja provisoria) y se manda en orden en segundo plano.
// El campo de texto nunca se bloquea, nunca pierde el foco y nunca se pisa con texto viejo.

const outbox = [];
let outboxBusy = false;
let inflight = null;

/** Burbujas provisorias de una nota (para no perderlas si se redibuja el apunte) */
function pendingTemps(noteId) {
  return [inflight, ...outbox].filter((j) => j && j.noteId === noteId).flatMap((j) => j.temps);
}
let tempSeq = 0;

function enqueue(noteId, content) {
  const lines = Array.isArray(content) ? content : [content];
  const temps = lines.map((c) => ({
    id: `temp-${++tempSeq}`, kind: 'text', content: c, temp: true, created_at: new Date().toISOString(),
  }));
  if (state.current?.id === noteId) {
    const thread = document.querySelector('.notes-view .thread');
    if (thread) {
      thread.querySelector('.thread-ph')?.remove();
      appendBubbles(thread, temps, true);
      scrollToEnd(thread, false);
    }
  }
  outbox.push({ noteId, content, temps });
  pumpOutbox();
}

async function pumpOutbox() {
  if (outboxBusy) return;
  outboxBusy = true;
  while (outbox.length) {
    const job = outbox.shift();
    inflight = job;
    try {
      const r = await api(`/api/notes/${job.noteId}/messages`, { method: 'POST', body: { content: job.content } });
      settle(job, r.messages);
    } catch (e) {
      markFailed(job, e);
    }
    inflight = null;
  }
  outboxBusy = false;
}

function settle(job, msgs) {
  const thread = document.querySelector('.notes-view .thread');
  if (state.current?.id === job.noteId && thread) keepBottom(() => {
    const nodes = job.temps.map((tm) => thread.querySelector(`.bubble[data-id="${tm.id}"]`));
    const have = new Set(state.current.messages.map((m) => m.id));
    msgs.forEach((m, i) => {
      if (have.has(m.id)) return nodes[i]?.remove(); // ya vino al recargar el apunte
      if (nodes[i]) nodes[i].replaceWith(renderBubble(m));
      else appendBubbles(thread, [m]);
      state.current.messages.push(m);
    });
    nodes.slice(msgs.length).forEach((n) => n?.remove());
  });
  noteTouched(job.noteId, msgs);
}

function markFailed(job, err) {
  for (const tm of job.temps) {
    const node = document.querySelector(`.thread .bubble[data-id="${tm.id}"]`);
    if (!node) continue;
    node.classList.remove('sending');
    node.classList.add('failed');
    node.querySelector('.bubble-foot')?.remove();
    const foot = el('div', 'bubble-foot failed-foot');
    foot.append(icon('x'), el('span', null, err?.code === 'offline' ? t('compose.offline') : t('compose.failed')));
    const retry = btn('btn btn-sm', { icon: 'refresh', label: t('common.retry') });
    retry.onclick = () => {
      job.temps.forEach((x) => document.querySelector(`.thread .bubble[data-id="${x.id}"]`)?.remove());
      enqueue(job.noteId, job.content);
    };
    const drop = btn('btn btn-sm', { label: t('compose.discard'), onClick: () => node.remove() });
    foot.append(retry, drop);
    node.appendChild(foot);
    failedJobs.add(job);
  }
}

// al volver la conexión se reintenta solo lo que falló por estar sin red
const failedJobs = new Set();
window.addEventListener('online', () => {
  for (const job of failedJobs) {
    failedJobs.delete(job);
    job.temps.forEach((x) => document.querySelector(`.thread .bubble.failed[data-id="${x.id}"]`)?.remove());
    enqueue(job.noteId, job.content);
  }
});

/* ---------- compositor ---------- */

// pantalla táctil (teclado virtual): Enter hace salto de línea; con teclado físico, Enter envía
const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

const draftKey = (id) => `nb_draft_${state.user?.username}_${id}`;
const loadDraft = (id) => { try { return localStorage.getItem(draftKey(id)) || ''; } catch { return ''; } };
const saveDraft = (id, v) => {
  try { v ? localStorage.setItem(draftKey(id), v) : localStorage.removeItem(draftKey(id)); } catch { /* ok */ }
};

function composer(pane, thread) {
  const noteId = state.current.id;
  const row = el('div', 'composer');
  const box = el('div', 'composer-box');
  const ta = el('textarea');
  ta.rows = 1;
  ta.placeholder = isTouch() || isMobile() ? t('compose.placeholderShort') : t('compose.placeholder');
  ta.setAttribute('aria-label', t('compose.label'));
  ta.enterKeyHint = isTouch() ? 'enter' : 'send';
  ta.value = loadDraft(noteId);

  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
  fileInput.multiple = true;
  fileInput.hidden = true;
  const attach = btn('btn-icon', { icon: 'image', title: t('compose.attach') });
  attach.onclick = () => fileInput.click();
  fileInput.onchange = () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    if (files.length) uploadImages(files, attach);
  };
  const micBtn = btn('btn-icon mic-btn', { icon: 'mic', title: t('compose.record') });
  micBtn.onclick = () => startRecording(row);
  const sendBtn = btn('btn btn-primary send-btn', { icon: 'send', title: t('compose.send') });

  // Que tocar los botones NO le quite el foco al campo (en el celular cerraría el teclado
  // y lo que escribas en ese instante se perdería)
  for (const b of [sendBtn, micBtn, attach]) b.addEventListener('pointerdown', (e) => e.preventDefault());

  let hasText = null;
  const grow = () => {
    // altura según el contenido; sin reflow si el navegador soporta field-sizing
    if (!CSS.supports?.('field-sizing', 'content')) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
    const now = !!ta.value.trim();
    if (now !== hasText) {
      hasText = now;
      row.classList.toggle('has-text', now);
    }
  };
  let draftTimer;
  ta.addEventListener('input', () => {
    grow();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => saveDraft(noteId, ta.value), 250);
    splitChip.hidden = true;
  });

  const send = () => {
    const text = ta.value.trim();
    if (!text) return;
    ta.value = '';
    clearTimeout(draftTimer);
    saveDraft(noteId, '');
    splitChip.hidden = true;
    grow();
    enqueue(noteId, text);
    ta.focus({ preventScroll: true });
  };
  sendBtn.onclick = send;
  ta.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    // escritorio: Enter envía, Shift+Enter salto de línea · celular: Enter salta, Ctrl/⌘+Enter envía
    if ((!isTouch() && !e.shiftKey) || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      send();
    }
  });

  // pegar varias líneas: se pega normal y aparece la opción de mandarlas como mensajes separados
  const splitChip = el('div', 'split-chip');
  splitChip.hidden = true;
  const splitBtn = btn('chip', { icon: 'list' });
  splitChip.appendChild(splitBtn);
  ta.addEventListener('paste', (e) => {
    const items = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith('image/'));
    if (items.length) {
      e.preventDefault();
      uploadImages(items.map((i) => i.getAsFile()).filter(Boolean), attach);
      return;
    }
    setTimeout(() => {
      const lines = ta.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      if (lines.length < 2 || lines.length > 500) return;
      splitBtn.lastChild.textContent = t('compose.pasteSplitAction', { n: lines.length });
      splitChip.hidden = false;
      splitBtn.onclick = () => {
        ta.value = '';
        saveDraft(noteId, '');
        splitChip.hidden = true;
        grow();
        enqueue(noteId, lines);
        ta.focus({ preventScroll: true });
      };
    }, 0);
  });
  splitBtn.appendChild(el('span'));
  splitBtn.addEventListener('pointerdown', (e) => e.preventDefault());

  // celular: al abrirse el teclado, mantener a la vista el último mensaje
  ta.addEventListener('focus', () => {
    const atEnd = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120;
    if (atEnd) setTimeout(() => scrollToEnd(thread, false), 320);
  });

  // arrastrar imágenes al hilo
  pane.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); pane.classList.add('drop'); } });
  pane.addEventListener('dragleave', (e) => { if (!pane.contains(e.relatedTarget)) pane.classList.remove('drop'); });
  pane.addEventListener('drop', (e) => {
    pane.classList.remove('drop');
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    uploadImages(files, attach);
  });

  box.append(ta);
  row.append(splitChip, attach, fileInput, box, micBtn, sendBtn);
  requestAnimationFrame(() => {
    grow();
    if (!isTouch()) {
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  });
  return row;
}

async function uploadImages(files, attachBtn) {
  const list = files.filter((f) => /^image\/(jpeg|png|webp|gif)$/.test(f.type));
  if (!list.length) return toast(t('compose.imagesOnly'), 'error');
  const fd = new FormData();
  for (const f of list.slice(0, 10)) fd.append('images', f, f.name || 'image.png');
  attachBtn?.classList.add('busy');
  try {
    const r = await api(`/api/notes/${state.current.id}/images`, { method: 'POST', body: fd });
    pushMessages(r.messages);
    toast(t('compose.imagesUploaded', { n: r.messages.length }), 'ok', 'image');
    import('./demo.js').then((m) => m.refreshDemoBar());
  } catch (e) { toastError(e); }
  attachBtn?.classList.remove('busy');
}

/* ---------- notas de voz ---------- */

async function startRecording(row) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast(t('voice.unsupported'), 'error');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    return toast(t('voice.denied'), 'error');
  }
  const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  const bar = el('div', 'rec-bar');
  const dot = el('span', 'rec-dot');
  const time = el('span', 'rec-time', '0:00');
  const cancel = btn('btn-icon', { icon: 'trash', title: t('common.cancel') });
  const stop = btn('btn btn-primary send-btn', { icon: 'send', title: t('voice.send') });
  bar.append(cancel, dot, time, el('span', 'rec-hint', t('voice.recording')), stop);
  row.hidden = true;
  row.after(bar);

  const started = Date.now();
  const MAX = 10 * 60 * 1000;
  const tick = setInterval(() => {
    const s = Math.floor((Date.now() - started) / 1000);
    time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (Date.now() - started > MAX) finish(true);
  }, 250);

  let done = false;
  const finish = (sendIt) => {
    if (done) return;
    done = true;
    clearInterval(tick);
    rec.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop());
      bar.remove();
      row.hidden = false;
      if (!sendIt || !chunks.length) return;
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
      const fd = new FormData();
      fd.append('audio', blob, `voice.${ext}`);
      try {
        const r = await api(`/api/notes/${state.current.id}/audio`, { method: 'POST', body: fd });
        pushMessages(r.messages);
        import('./demo.js').then((m) => m.refreshDemoBar());
      } catch (e) { toastError(e); }
    };
    rec.stop();
  };
  cancel.onclick = () => finish(false);
  stop.onclick = () => finish(true);
  rec.start(1000);
}

/* ---------- sondeo de imágenes/audios en proceso e indexado ---------- */

function schedulePendingPoll() {
  clearTimeout(pendingTimer);
  const note = state.current;
  if (!note) return;
  const pending = note.messages.filter((m) => (m.kind === 'image' && m.status === 'pending') || (m.kind === 'audio' && m.audio_status === 'pending'));
  if (!pending.length && note.embedded) return;
  pendingTimer = setTimeout(async () => {
    if (state.current !== note) return;
    try {
      const r = await api(`/api/notes/${note.id}/pending?ids=${pending.map((m) => m.id).join(',')}`);
      for (const m of r.messages) {
        const i = note.messages.findIndex((x) => x.id === m.id);
        if (i >= 0 && JSON.stringify(note.messages[i]) !== JSON.stringify(m)) {
          note.messages[i] = m;
          replaceBubble(m);
        }
      }
      if (r.embedded && !note.embedded) {
        setIndexBadge(true);
        patchNoteInList(note.id, { embedded: 1 });
      }
      note.embedded = r.embedded;
    } catch { /* reintenta en el próximo ciclo */ }
    schedulePendingPoll();
  }, 3000);
}

/* ---------- búsqueda dentro del apunte ---------- */

function searchBar() {
  const bar = el('div', 'search-bar');
  bar.hidden = !state.noteSearch.open;
  const inp = el('input');
  inp.type = 'search';
  inp.placeholder = t('note.searchPlaceholder');
  inp.value = state.noteSearch.query;
  inp.addEventListener('input', () => { state.noteSearch.query = inp.value; runNoteSearch(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); stepSearch(e.shiftKey ? 1 : -1); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); toggleNoteSearch(false); }
  });
  bar.append(
    icon('search', 'sb-ic'),
    inp,
    el('span', 'search-count', '0/0'),
    btn('btn btn-sm', { icon: 'chevronUp', title: t('note.older'), onClick: () => stepSearch(-1) }),
    btn('btn btn-sm', { icon: 'chevronDown', title: t('note.newer'), onClick: () => stepSearch(1) }),
    btn('btn btn-sm', { icon: 'x', title: t('common.close'), onClick: () => toggleNoteSearch(false) })
  );
  return bar;
}

export function toggleNoteSearch(force) {
  if (!state.current) return;
  state.noteSearch.open = force !== undefined ? force : !state.noteSearch.open;
  const bar = document.querySelector('.search-bar');
  if (bar) bar.hidden = !state.noteSearch.open;
  if (state.noteSearch.open) {
    const inp = bar?.querySelector('input');
    inp?.focus();
    inp?.select();
    runNoteSearch();
  } else {
    state.noteSearch.query = '';
    document.querySelectorAll('.bubble.search-hit, .bubble.search-cur').forEach((b) => b.classList.remove('search-hit', 'search-cur'));
  }
}

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function runNoteSearch() {
  const q = norm(state.noteSearch.query.trim());
  const bubbles = [...document.querySelectorAll('.thread .bubble')];
  bubbles.forEach((b) => b.classList.remove('search-hit', 'search-cur'));
  const matches = q ? bubbles.filter((b) => norm(b.dataset.text || '').includes(q)) : [];
  matches.forEach((b) => b.classList.add('search-hit'));
  state.noteSearch.matches = matches.length;
  state.noteSearch.idx = matches.length - 1; // como WhatsApp: desde el más reciente hacia arriba
  focusHit(matches);
}

function stepSearch(dir) {
  const matches = [...document.querySelectorAll('.bubble.search-hit')];
  if (!matches.length) return;
  state.noteSearch.idx = (state.noteSearch.idx + dir + matches.length) % matches.length;
  focusHit(matches);
}

function focusHit(matches) {
  document.querySelectorAll('.bubble.search-cur').forEach((b) => b.classList.remove('search-cur'));
  const cur = matches[state.noteSearch.idx];
  if (cur) {
    cur.classList.add('search-cur');
    cur.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const c = document.querySelector('.search-count');
  if (c) c.textContent = matches.length ? `${state.noteSearch.idx + 1}/${matches.length}` : '0/0';
}

/** Lleva al mensaje (desde la búsqueda global o una fuente del chat) y lo resalta */
export function focusMessageBubble(ids, quote) {
  const list = Array.isArray(ids) ? ids : [ids];
  const bubbles = list.map((id) => document.querySelector(`.thread .bubble[data-id="${id}"]`)).filter(Boolean);
  if (!bubbles.length) return;
  let target = bubbles[0];
  if (quote) {
    const q = norm(quote).slice(0, 60);
    target = bubbles.find((b) => norm(b.dataset.text || '').includes(q)) || target;
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.remove('flash');
  void target.offsetWidth;
  target.classList.add('flash');
  target.focus({ preventScroll: true });
}

/** Rango de mensajes de una fuente del RAG: abre el apunte y resalta */
export async function jumpToSource(s) {
  if (!s?.noteId) return;
  const ids = [];
  if (state.current?.id !== s.noteId) await openNote(s.noteId, {});
  for (const m of state.current?.messages || []) if (m.id >= s.firstMsgId && m.id <= s.lastMsgId) ids.push(m.id);
  setTimeout(() => focusMessageBubble(ids, s.quotes?.[0]), 120);
}
