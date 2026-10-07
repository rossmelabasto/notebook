// ask.js — preguntar a los apuntes: respuesta en vivo (streaming), fuentes con salto al mensaje, conversaciones
import {
  state, el, icon, btn, api, apiStream, toast, toastError, confirmModal, promptModal, popMenu, fmtRelative, copyText, scopeName,
} from './core.js';
import { t } from './i18n.js';
import { renderMarkdown } from './markdown.js';
import { jumpToSource } from './editor.js';
import { menuButton } from './shell.js';

let abortCtl = null;

async function loadConvos() {
  state.convos = (await api('/api/convos')).convos;
  state.convosLoaded = true;
}

export async function renderChat() {
  const view = state.els.chatView;
  if (!state.convosLoaded) {
    try { await loadConvos(); } catch (e) { toastError(e); }
  }
  view.replaceChildren();
  const main = el('div', 'chat-main');

  /* cabecera */
  const head = el('div', 'view-head chat-head');
  head.appendChild(menuButton());
  const titleBox = el('div', 'chat-title');
  const convo = state.activeConvo ? state.convos.find((c) => c.id === state.activeConvo) : null;
  titleBox.appendChild(icon(convo ? 'messageCircle' : 'zap'));
  const tt = el('div', 'chat-title-txt');
  tt.append(el('div', 'nm', convo ? convo.title : t('ask.quick')), el('div', 'sub', convo ? t('ask.convoSub') : t('ask.quickSub')));
  titleBox.appendChild(tt);
  head.appendChild(titleBox);
  const chatsBtn = btn('btn btn-sm chats-toggle', { icon: 'list', label: t('ask.chats') });
  chatsBtn.onclick = () => toggleConvoDrawer(true);
  head.appendChild(chatsBtn);
  main.appendChild(head);

  /* alcance */
  const chips = el('div', 'chips');
  chips.setAttribute('aria-label', t('ask.scope'));
  const chip = (label, value) => {
    const c = btn('chip' + (state.chatFilter === value ? ' active' : ''), { label });
    c.onclick = () => { state.chatFilter = value; renderChat(); };
    return c;
  };
  chips.append(chip(t('subj.all'), null), chip(t('subj.general'), 'general'));
  if (state.orphanedCount > 0) chips.append(chip(t('subj.unfiled'), 'orphaned'));
  for (const s of state.subjects) chips.append(chip(s.name, s.id));
  main.appendChild(chips);

  const thread = el('div', 'chat-thread');
  thread.setAttribute('role', 'log');
  main.appendChild(thread);
  const fab = btn('btn-icon fab', { icon: 'arrowDown', title: t('common.toBottom') });
  fab.hidden = true;
  thread.addEventListener('scroll', () => { fab.hidden = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 200; }, { passive: true });
  fab.onclick = () => thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
  main.appendChild(fab);

  /* entrada */
  const row = el('div', 'composer');
  const ta = el('textarea');
  ta.rows = 1;
  ta.placeholder = convo ? t('ask.placeholderConvo') : t('ask.placeholder', { scope: scopeName(state.chatFilter ?? 'all') });
  ta.setAttribute('aria-label', t('ask.placeholderConvo'));
  const key = 'nb_ask_draft';
  try { ta.value = sessionStorage.getItem(key) || ''; } catch { /* ok */ }
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; };
  ta.addEventListener('input', () => { grow(); try { sessionStorage.setItem(key, ta.value); } catch { /* ok */ } });
  const send = btn('btn btn-primary send-btn', { icon: 'send', title: t('compose.send') });
  const stop = btn('btn btn-sm stop-btn', { icon: 'square', label: t('ask.stop') });
  stop.hidden = true;
  stop.onclick = () => abortCtl?.abort();
  // tocar enviar no le quita el foco al campo (en el celular cerraría el teclado)
  for (const b of [send, stop]) b.addEventListener('pointerdown', (e) => e.preventDefault());
  const box = el('div', 'composer-box');
  box.appendChild(ta);
  row.classList.add('has-text');
  row.append(box, stop, send);
  main.appendChild(row);

  const doAsk = async () => {
    const q = ta.value.trim();
    if (!q || state.asking) return;
    ta.value = '';
    grow();
    try { sessionStorage.removeItem(key); } catch { /* ok */ }
    await ask(q, thread, { send, stop, ta });
  };
  send.onclick = doAsk;
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); doAsk(); }
  });

  const backdrop = el('div', 'convo-backdrop');
  backdrop.onclick = () => toggleConvoDrawer(false);
  view.append(main, backdrop, convoSide());
  renderThread(thread);
  requestAnimationFrame(() => { grow(); if (!('ontouchstart' in window)) ta.focus({ preventScroll: true }); });
}

/* ---------- hilo ---------- */

function currentMessages() {
  return state.activeConvo ? state.convoMsgs : state.chat;
}

function renderThread(thread) {
  thread.replaceChildren();
  const msgs = currentMessages();
  if (!msgs.length) {
    const h = el('div', 'empty-hint ask-empty');
    const big = el('div', 'big-ic');
    big.appendChild(icon('sparkle'));
    h.append(big, el('div', 'no-note-title', t('ask.emptyTitle')), el('div', 'hint', t('ask.emptyHint')));
    const ex = el('div', 'examples');
    for (const k of ['ask.ex1', 'ask.ex2', 'ask.ex3']) {
      const b = btn('chip', { label: t(k) });
      b.onclick = () => {
        const ta = document.querySelector('.chat-view .composer textarea');
        if (ta) { ta.value = t(k); ta.focus(); ta.dispatchEvent(new Event('input')); }
      };
      ex.appendChild(b);
    }
    h.appendChild(ex);
    thread.appendChild(h);
    return;
  }
  for (const m of msgs) thread.appendChild(renderMsg(m));
  requestAnimationFrame(() => { thread.scrollTop = thread.scrollHeight; });
}

function renderMsg(m) {
  if (m.role === 'user') {
    const u = el('div', 'msg user');
    u.textContent = m.content;
    return u;
  }
  const wrap = el('div', 'msg-wrap');
  const msg = el('div', 'msg bot' + (m.insufficient ? ' insufficient' : '') + (m.error ? ' error' : ''));
  const body = el('div', 'md');
  if (m.insufficient) {
    body.append(icon('search', 'msg-ic'), el('span', null, t('ask.insufficient')));
  } else if (m.error) {
    body.append(icon('x', 'msg-ic'), el('span', null, m.content));
  } else {
    body.appendChild(renderMarkdown(m.content, { onCite: (n) => jumpToSource(m.sources?.[n - 1]), maxCite: m.sources?.length || 0 }));
  }
  msg.appendChild(body);
  if (m.streaming) msg.appendChild(el('span', 'caret'));
  wrap.appendChild(msg);

  if (!m.streaming && !m.insufficient && !m.error && m.content) {
    const tools = el('div', 'msg-tools');
    tools.appendChild(btn('btn-icon', { icon: 'copy', title: t('common.copy'), onClick: () => { copyText(m.content); toast(t('common.copied'), 'ok'); } }));
    if (m.query && m.query !== m.question) tools.appendChild(el('span', 'query-note', t('ask.searchedFor', { q: m.query })));
    wrap.appendChild(tools);
  }
  if (m.sources?.length) wrap.appendChild(renderSources(m.sources, m.insufficient));
  return wrap;
}

function renderSources(sources, insufficient) {
  const det = el('details', 'sources');
  const best = sources.reduce((a, s) => Math.max(a, s.sim ?? 0), 0);
  const sum = el('summary');
  sum.append(icon('fileText', 'sum-ic'), el('span', null, insufficient ? t('ask.closest', { n: sources.length }) : t('ask.sources', { n: sources.length, pct: Math.round(best * 100) })));
  det.appendChild(sum);
  for (const s of sources) {
    const it = btn('src-item');
    it.title = t('ask.jump');
    const top = el('div', 't');
    top.append(el('span', 'src-n', String(s.n)), el('span', 'src-title', s.title));
    if (s.subjectName) top.appendChild(el('span', 'src-subj', s.subjectName));
    top.appendChild(el('span', 'pct', s.sim != null ? Math.round(s.sim * 100) + '%' : t('ask.keyword')));
    it.appendChild(top);
    const bar = el('div', 'match-bar');
    const fill = el('div', 'match-fill');
    fill.style.width = Math.max(4, Math.round((s.sim ?? 0.3) * 100)) + '%';
    bar.appendChild(fill);
    it.appendChild(bar);
    it.appendChild(snippet(s));
    it.onclick = () => jumpToSource(s);
    det.appendChild(it);
  }
  return det;
}

/** Fragmento de la fuente con las citas textuales resaltadas */
function snippet(s) {
  const box = el('div', 'snip');
  const content = s.content || '';
  const quotes = (s.quotes || []).filter((q) => q.length >= 8);
  const norm = (x) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nc = norm(content);
  const marks = [];
  for (const q of quotes) {
    const i = nc.indexOf(norm(q).slice(0, 120));
    if (i >= 0) marks.push([i, i + Math.min(q.length, 120)]);
  }
  marks.sort((a, b) => a[0] - b[0]);
  const start = marks.length ? Math.max(0, marks[0][0] - 100) : 0;
  const end = Math.min(content.length, start + 480);
  let pos = start;
  if (start > 0) box.appendChild(document.createTextNode('…'));
  for (const [a, b] of marks) {
    if (a < pos || a >= end) continue;
    box.appendChild(document.createTextNode(content.slice(pos, a)));
    box.appendChild(el('mark', null, content.slice(a, Math.min(b, end))));
    pos = Math.min(b, end);
  }
  box.appendChild(document.createTextNode(content.slice(pos, end) + (end < content.length ? '…' : '')));
  return box;
}

/* ---------- preguntar ---------- */

async function ask(question, thread, ui) {
  state.asking = true;
  ui.send.hidden = true;
  ui.stop.hidden = false;
  const msgs = currentMessages();
  msgs.push({ role: 'user', content: question });
  const bot = { role: 'assistant', content: '', sources: [], streaming: true, question };
  msgs.push(bot);
  renderThread(thread);
  let node = thread.lastElementChild;
  const typing = el('span', 'typing');
  typing.append(el('i'), el('i'), el('i'));
  node.querySelector('.md').appendChild(typing);
  thread.scrollTop = thread.scrollHeight;

  const rerender = () => {
    const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120;
    const fresh = renderMsg(bot);
    node.replaceWith(fresh);
    node = fresh;
    if (nearBottom) thread.scrollTop = thread.scrollHeight;
  };
  let raf = 0;
  const scheduleRender = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; rerender(); }); };

  abortCtl = new AbortController();
  const body = { question };
  if (state.chatFilter !== null) body.subject_id = state.chatFilter;
  if (state.activeConvo) body.convo_id = state.activeConvo;
  try {
    await apiStream('/api/ask', body, (ev, data) => {
      if (ev === 'query') bot.query = data.query;
      else if (ev === 'sources') { bot.sources = data.sources; if (data.insufficient) bot.insufficient = true; }
      else if (ev === 'delta') { bot.content += data.text; scheduleRender(); }
      else if (ev === 'done') {
        if (data.insufficient) bot.insufficient = true;
        else bot.content = data.answer;
        bot.sources = data.sources || bot.sources;
        bot.query = data.query;
      } else if (ev === 'error') {
        bot.error = true;
        bot.content = data.error;
      }
    }, abortCtl.signal);
  } catch (e) {
    if (e.name === 'AbortError') {
      if (!bot.content) { bot.error = true; bot.content = t('ask.stopped'); }
    } else {
      bot.error = true;
      bot.content = e.message;
    }
  }
  cancelAnimationFrame(raf);
  bot.streaming = false;
  rerender();
  state.asking = false;
  ui.send.hidden = false;
  ui.stop.hidden = true;
  ui.ta.focus({ preventScroll: true });
  if (state.activeConvo) {
    await loadConvos().catch(() => {});
    const nm = document.querySelector('.chat-head .chat-title-txt .nm');
    const c = state.convos.find((x) => x.id === state.activeConvo);
    if (nm && c) nm.textContent = c.title;
    document.querySelector('.convo-side')?.replaceWith(convoSide());
  }
}

/* ---------- conversaciones ---------- */

function toggleConvoDrawer(force) {
  const open = force !== undefined ? force : !document.querySelector('.convo-side')?.classList.contains('open');
  document.querySelector('.convo-side')?.classList.toggle('open', open);
  document.querySelector('.convo-backdrop')?.classList.toggle('show', open);
}

function convoSide() {
  const side = el('aside', 'convo-side');
  const head = el('div', 'convo-head');
  head.append(
    el('span', 'side-label', t('ask.chats')),
    btn('btn btn-sm', { icon: 'plus', label: t('ask.newChat'), onClick: newConvo }),
    btn('btn-icon convo-close', { icon: 'x', title: t('common.close'), onClick: () => toggleConvoDrawer(false) })
  );
  side.appendChild(head);
  const list = el('div', 'convo-list');
  const item = (id, title, sub, active, onClick) => {
    const row = el('div', 'convo-item' + (active ? ' active' : ''));
    const b = btn('convo-btn');
    b.append(el('span', 'nm', title), el('span', 'sub', sub));
    b.onclick = onClick;
    row.appendChild(b);
    if (id !== null) {
      const more = btn('btn-icon', { icon: 'moreVertical', title: t('common.options') });
      more.onclick = (e) => {
        e.stopPropagation();
        popMenu(more, [
          { icon: 'edit', label: t('common.rename'), onClick: () => renameConvo(id) },
          { icon: 'trash', label: t('common.delete'), danger: true, onClick: () => deleteConvo(id, title) },
        ]);
      };
      row.appendChild(more);
    }
    list.appendChild(row);
  };
  item(null, t('ask.quick'), t('ask.quickSub'), state.activeConvo === null, () => {
    state.activeConvo = null;
    state.convoMsgs = [];
    renderChat();
  });
  if (!state.convos.length) list.appendChild(el('div', 'empty-hint small', t('ask.noChats')));
  for (const c of state.convos) {
    item(c.id, c.title === 'New chat' ? t('ask.newChat') : c.title, `${t('ask.nMsgs', { n: c.msg_count })} · ${fmtRelative(c.updated_at)}`, state.activeConvo === c.id, () => openConvo(c.id));
  }
  side.appendChild(list);
  return side;
}

async function newConvo() {
  try {
    const r = await api('/api/convos', { method: 'POST', body: {} });
    state.activeConvo = r.id;
    state.convoMsgs = [];
    await loadConvos();
    renderChat();
  } catch (e) { toastError(e); }
}

async function openConvo(id) {
  try {
    const r = await api('/api/convos/' + id);
    state.activeConvo = id;
    state.convoMsgs = r.messages.map((m) => ({
      ...m,
      insufficient: m.role === 'assistant' && /^I do not have enough information/.test(m.content),
    }));
    renderChat();
  } catch (e) { toastError(e); }
}

async function renameConvo(id) {
  const c = state.convos.find((x) => x.id === id);
  const name = await promptModal({ title: t('ask.renameChat'), label: t('common.name'), value: c?.title || '' });
  if (!name) return;
  try {
    await api('/api/convos/' + id, { method: 'PUT', body: { title: name } });
    await loadConvos();
    renderChat();
  } catch (e) { toastError(e); }
}

async function deleteConvo(id, title) {
  if (!(await confirmModal({ title: t('ask.deleteChat'), message: t('ask.deleteChatMsg', { title }) }))) return;
  try {
    await api('/api/convos/' + id, { method: 'DELETE' });
    if (state.activeConvo === id) { state.activeConvo = null; state.convoMsgs = []; }
    await loadConvos();
    renderChat();
    toast(t('ask.chatDeleted'), 'ok');
  } catch (e) { toastError(e); }
}
