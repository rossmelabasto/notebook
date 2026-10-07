// shell.js — estructura de la app: barra lateral (materias + apuntes), pestañas y navegación móvil
import {
  state, el, icon, btn, api, toast, toastError, confirmModal, openModal, popMenu, field, input, setBtnBusy, fmtRelative, scopeName,
} from './core.js';
import { t } from './i18n.js';
import { renderEditor, openNote, newNote } from './editor.js';
import { renderChat } from './ask.js';
import { renderStudy } from './study.js';
import { openSearch } from './search.js';
import { openAccountMenu } from './account.js';
import { openImportModal } from './importer.js';
import { isDark, toggleTheme } from './theme.js';
import { demoBar, showWelcome } from './demo.js';

export const isMobile = () => window.matchMedia('(max-width: 900px)').matches;

export async function loadApp() {
  state.user = await api('/api/me');
  Object.assign(state, { subject: null, chatFilter: null, current: null, chat: [], view: 'notes', activeConvo: null, convoMsgs: [] });
  try {
    const saved = JSON.parse(localStorage.getItem('nb_ui_' + state.user.username) || '{}');
    if (saved.subject !== undefined) state.subject = saved.subject;
  } catch { /* sin storage */ }
  await refreshSubjects();
  if (state.subject !== null && state.subject !== 'orphaned' && !state.subjects.some((s) => s.id === state.subject)) state.subject = null;
  await refreshNotes();
  renderApp();
}

export function rememberUi() {
  try {
    localStorage.setItem('nb_ui_' + state.user.username, JSON.stringify({ subject: state.subject }));
  } catch { /* ok */ }
}

export async function refreshSubjects() {
  const r = await api('/api/subjects');
  Object.assign(state, { subjects: r.subjects, generalCount: r.generalCount, orphanedCount: r.orphanedCount, totalCount: r.totalCount });
}

export async function refreshNotes() {
  const q = state.subject === null ? 'general' : state.subject;
  state.notes = (await api('/api/notes?subject_id=' + encodeURIComponent(q))).notes;
}

/* ---------- estructura ---------- */

export function renderApp() {
  document.title = 'Notebook';
  const root = el('div', 'app');

  /* barra lateral */
  const side = el('aside', 'sidebar');
  side.setAttribute('aria-label', t('nav.sidebar'));
  const brand = el('div', 'brand');
  const logo = el('span', 'brand-logo');
  logo.appendChild(icon('book'));
  brand.append(logo, el('span', 'brand-name', 'Notebook'));
  const themeBtn = btn('btn-icon theme-btn', { icon: isDark() ? 'sun' : 'moon', title: t('appearance.toggle') });
  themeBtn.onclick = () => {
    toggleTheme();
    themeBtn.replaceChildren(icon(isDark() ? 'sun' : 'moon'));
  };
  brand.append(themeBtn, btn('btn-icon', { icon: 'search', title: t('search.open') + ' (Ctrl+K)', onClick: openSearch }));
  const acct = btn('btn-icon avatar-btn', { title: t('account.title') });
  acct.appendChild(el('span', 'avatar sm', (state.user.username[0] || '?').toUpperCase()));
  acct.onclick = (e) => { e.stopPropagation(); openAccountMenu(acct); };
  brand.appendChild(acct);
  side.appendChild(brand);

  const tabs = el('nav', 'tabs');
  tabs.setAttribute('role', 'tablist');
  const mkTab = (view, ic, label) => {
    const b = btn('tab', { icon: ic, label });
    b.setAttribute('role', 'tab');
    b.dataset.view = view;
    b.onclick = () => switchView(view);
    return b;
  };
  tabs.append(mkTab('notes', 'fileText', t('nav.notes')), mkTab('chat', 'messageCircle', t('nav.ask')), mkTab('study', 'layers', t('nav.study')));
  side.appendChild(tabs);

  const subjHead = el('div', 'side-head');
  subjHead.append(el('span', 'side-label', t('subj.title')));
  subjHead.append(
    btn('btn-icon', { icon: 'upload', title: t('import.title'), onClick: openImportModal }),
    btn('btn-icon', { icon: 'plus', title: t('subj.new'), onClick: () => openSubjectModal() })
  );
  const subjList = el('div', 'subj-list');
  side.append(subjHead, subjList);

  const notesHead = el('div', 'side-head');
  const notesLabel = el('span', 'side-label');
  notesHead.append(notesLabel, btn('btn-icon', { icon: 'plus', title: t('note.new'), onClick: newNote }));
  const list = el('div', 'note-list');
  side.append(notesHead, list);

  /* vistas */
  const main = el('main', 'main');
  const notesView = el('section', 'view notes-view');
  const chatView = el('section', 'view chat-view');
  const studyView = el('section', 'view study-view');
  if (state.user.isDemo) main.appendChild(demoBar());
  main.append(notesView, chatView, studyView);

  /* navegación inferior (móvil) */
  const bottom = el('nav', 'bottom-nav');
  const mkBottom = (view, ic, label, onClick) => {
    const b = btn('bn-item', { icon: ic, label, onClick: onClick || (() => switchView(view)) });
    if (view) b.dataset.view = view;
    return b;
  };
  bottom.append(
    mkBottom('notes', 'fileText', t('nav.notes')),
    mkBottom('chat', 'messageCircle', t('nav.ask')),
    mkBottom('study', 'layers', t('nav.study')),
    mkBottom(null, 'search', t('nav.search'), openSearch)
  );

  const backdrop = el('div', 'drawer-backdrop');
  backdrop.onclick = () => toggleDrawer(false);

  root.append(side, main, bottom, backdrop);
  document.getElementById('app').replaceChildren(root);
  state.els = { root, side, subjList, list, notesLabel, notesView, chatView, studyView, tabs, bottom };
  renderSubjects();
  renderNotes();
  switchView(state.view, true);
  showWelcome();
}

export function switchView(view, initial = false) {
  state.view = view;
  toggleDrawer(false);
  for (const b of document.querySelectorAll('[data-view]')) {
    const on = b.dataset.view === view;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  }
  const { notesView, chatView, studyView } = state.els;
  notesView.classList.toggle('active', view === 'notes');
  chatView.classList.toggle('active', view === 'chat');
  studyView.classList.toggle('active', view === 'study');
  if (view === 'notes' && (initial || !notesView.childElementCount)) renderEditor({ bottom: true });
  if (view === 'chat') renderChat();
  if (view === 'study') renderStudy();
}

/** Móvil: la barra lateral es un cajón que se abre con el botón de menú */
export function toggleDrawer(force) {
  state.drawer = force !== undefined ? force : !state.drawer;
  state.els.root?.classList.toggle('drawer-open', state.drawer);
}

export function menuButton() {
  return btn('btn-icon mobile-only', { icon: 'menu', title: t('nav.menu'), onClick: () => toggleDrawer(true) });
}

/* ---------- materias ---------- */

export function renderSubjects(container = state.els.subjList) {
  if (!container) return;
  container.replaceChildren();
  const mk = (id, name, count) => {
    const row = el('div', 'subj-item' + (state.subject === id ? ' active' : ''));
    const b = btn('subj-btn');
    b.append(el('span', 'nm', name), el('span', 'ct', String(count)));
    b.onclick = () => selectSubject(id);
    row.appendChild(b);
    if (state.subject === id && id !== null && id !== 'orphaned') {
      row.appendChild(btn('btn-icon subj-more', {
        icon: 'moreVertical',
        title: t('common.options'),
        onClick: (e) => { e.stopPropagation(); subjectMenu(e.currentTarget, id, name); },
      }));
    }
    return row;
  };
  container.appendChild(mk(null, t('subj.general'), state.generalCount));
  if (state.orphanedCount > 0) container.appendChild(mk('orphaned', t('subj.unfiled'), state.orphanedCount));
  for (const s of state.subjects) container.appendChild(mk(s.id, s.name, s.note_count));
}

function subjectMenu(anchor, id, name) {
  popMenu(anchor, [
    { icon: 'edit', label: t('common.rename'), onClick: () => openSubjectModal(name, id) },
    { icon: 'layers', label: t('study.fromSubject'), onClick: () => { switchView('study'); import('./study.js').then((m) => m.presetScope({ subject: id })); } },
    { icon: 'messageCircle', label: t('ask.inSubject'), onClick: () => { state.chatFilter = id; switchView('chat'); } },
    '-',
    { icon: 'trash', label: t('common.delete'), danger: true, onClick: () => openDeleteSubject(id, name) },
  ]);
}

export async function selectSubject(id) {
  state.subject = id;
  rememberUi();
  await refreshNotes();
  renderSubjects();
  renderNotes();
  if (state.view === 'notes' && isMobile() && !state.current) renderEditor();
}

function openSubjectModal(nameToEdit = null, idToEdit = null) {
  const { modal, close } = openModal({
    title: nameToEdit ? t('subj.rename') : t('subj.new'),
    sub: nameToEdit ? t('subj.renameSub') : t('subj.newSub'),
  });
  const inp = input('text', nameToEdit || '', { maxLength: 60 });
  modal.appendChild(field(t('common.name'), inp));
  const actions = el('div', 'actions');
  const ok = btn('btn btn-primary', { label: nameToEdit ? t('common.save') : t('common.create') });
  actions.append(btn('btn', { label: t('common.cancel'), onClick: () => close() }), ok);
  modal.appendChild(actions);
  const submit = async () => {
    const nm = inp.value.trim();
    if (!nm) return inp.focus();
    setBtnBusy(ok, true);
    try {
      if (nameToEdit !== null) await api('/api/subjects/' + idToEdit, { method: 'PUT', body: { name: nm } });
      else {
        const r = await api('/api/subjects', { method: 'POST', body: { name: nm } });
        state.subject = r.id;
        rememberUi();
      }
      close();
      await refreshSubjects();
      await refreshNotes();
      renderSubjects();
      renderNotes();
      toast(nameToEdit ? t('subj.renamed') : t('subj.created'), 'ok');
    } catch (e) {
      setBtnBusy(ok, false);
      toastError(e);
    }
  };
  ok.onclick = submit;
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  inp.focus();
}

function openDeleteSubject(id, name) {
  const { modal, close } = openModal({ title: t('subj.deleteTitle', { name }), sub: t('subj.deleteSub') });
  const col = el('div', 'actions-col');
  const after = async (msg) => {
    close();
    state.subject = null;
    state.current = null;
    rememberUi();
    await refreshSubjects();
    await refreshNotes();
    renderSubjects();
    renderNotes();
    renderEditor();
    toast(msg, 'ok');
  };
  col.append(
    btn('btn', {
      icon: 'download',
      label: t('subj.moveToUnfiled'),
      onClick: async () => {
        try {
          await api('/api/subjects/' + id, { method: 'DELETE', body: { deleteNotes: false } });
          await after(t('subj.movedToUnfiled'));
        } catch (e) { toastError(e); }
      },
    }),
    btn('btn btn-danger', {
      icon: 'trash',
      label: t('subj.deleteWithNotes'),
      onClick: async () => {
        const n = state.subjects.find((s) => s.id === id)?.note_count ?? 0;
        if (!(await confirmModal({ title: t('subj.deleteNotesTitle'), message: t('subj.deleteNotesMsg', { n }), confirmLabel: t('common.deleteAll') }))) return;
        try {
          await api('/api/subjects/' + id, { method: 'DELETE', body: { deleteNotes: true } });
          await after(t('subj.deleted'));
        } catch (e) { toastError(e); }
      },
    }),
    btn('btn', { label: t('common.cancel'), onClick: () => close() })
  );
  modal.appendChild(col);
}

/* ---------- lista de apuntes ---------- */

export function noteListItems(onOpen = openNote) {
  const frag = document.createDocumentFragment();
  if (!state.notes.length) {
    const h = el('div', 'empty-hint');
    const big = el('div', 'big-ic');
    big.appendChild(icon('fileText'));
    h.append(big, el('div', null, t('note.emptyIn', { name: scopeName(state.subject) })));
    h.appendChild(btn('btn btn-primary btn-sm', { icon: 'plus', label: t('note.new'), onClick: newNote }));
    frag.appendChild(h);
    return frag;
  }
  for (const n of state.notes) {
    const item = btn('note-item' + (state.current?.id === n.id ? ' active' : ''));
    item.dataset.id = n.id;
    const top = el('div', 'note-top');
    top.append(el('span', 't', n.title));
    if (n.starred_count) {
      const s = el('span', 'note-stars');
      s.append(icon('star'), document.createTextNode(String(n.starred_count)));
      top.appendChild(s);
    }
    const snippet = n.last_kind === 'image' ? '🖼 ' + t('msg.image') + (n.snippet ? ' · ' + n.snippet : '')
      : n.last_kind === 'audio' ? '🎤 ' + t('msg.audio')
      : n.snippet || t('note.noMessages');
    const bottom = el('div', 'note-bottom');
    bottom.append(el('span', 's', snippet), el('span', 'when', fmtRelative(n.updated_at)));
    const st = el('span', 'st' + (n.embedded ? ' emb' : ''));
    st.title = n.embedded ? t('note.indexed') : t('note.indexing');
    st.appendChild(icon(n.embedded ? 'check' : 'clock'));
    item.append(top, bottom, st);
    item.onclick = () => onOpen(n.id);
    frag.appendChild(item);
  }
  return frag;
}

export function renderNotes() {
  const { list, notesLabel } = state.els;
  if (!list) return;
  notesLabel.textContent = `${t('nav.notes')} · ${scopeName(state.subject)}`;
  list.replaceChildren(noteListItems((id) => { toggleDrawer(false); openNote(id); }));
}

/** Actualiza un apunte en la lista sin recargar todo (después de mandar un mensaje, etc.) */
export function patchNoteInList(id, patch) {
  const n = state.notes.find((x) => x.id === id);
  if (!n) return;
  Object.assign(n, patch);
  state.notes.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  renderNotes();
  if (isMobile() && !state.current && state.view === 'notes') renderEditor();
}
