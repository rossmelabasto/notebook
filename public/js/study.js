// study.js — estudiar: generar resumen, flashcards o quiz desde un apunte o materia, y repasarlos
import { state, el, icon, btn, api, toast, toastError, confirmModal, setBtnBusy, fmtRelative, popMenu } from './core.js';
import { t, getLang } from './i18n.js';
import { renderMarkdown } from './markdown.js';
import { menuButton } from './shell.js';

const ui = { scope: null, kind: 'flashcards', topic: '', sets: [], open: null, loading: false };

/** Abre la vista de estudio con un alcance ya elegido (desde un apunte o una materia) */
export function presetScope(scope) {
  ui.scope = scope;
  ui.open = null;
  ui.loaded = false;
  renderStudy();
}

const KINDS = [
  { id: 'summary', icon: 'fileText' },
  { id: 'flashcards', icon: 'layers' },
  { id: 'quiz', icon: 'helpCircle' },
];

function scopeLabel(scope) {
  if (!scope) return t('subj.all');
  if (scope.noteId) return '📄 ' + (state.notes.find((n) => n.id === scope.noteId)?.title || state.current?.title || t('study.thisNote'));
  if (scope.subject === 'general') return t('subj.general');
  if (scope.subject === 'orphaned') return t('subj.unfiled');
  return state.subjects.find((s) => s.id === scope.subject)?.name || '?';
}

export async function renderStudy() {
  const view = state.els.studyView;
  if (ui.scope === null) ui.scope = state.current ? { noteId: state.current.id } : state.subject !== null ? { subject: state.subject } : {};
  view.replaceChildren();
  const wrap = el('div', 'study-wrap');
  const head = el('div', 'view-head');
  head.append(menuButton(), el('h2', null, t('nav.study')));
  wrap.appendChild(head);

  if (ui.open) {
    wrap.appendChild(viewer(ui.open));
    view.appendChild(wrap);
    return;
  }

  /* generador */
  const gen = el('div', 'study-gen card');
  gen.appendChild(el('div', 'card-title', t('study.create')));

  const kinds = el('div', 'kind-grid');
  for (const k of KINDS) {
    const b = btn('kind' + (ui.kind === k.id ? ' active' : ''));
    b.append(icon(k.icon), el('span', 'kn', t(`study.${k.id}`)), el('span', 'kd', t(`study.${k.id}Desc`)));
    b.onclick = () => { ui.kind = k.id; renderStudy(); };
    kinds.appendChild(b);
  }
  gen.appendChild(kinds);

  const row = el('div', 'study-row');
  const sel = el('select');
  sel.setAttribute('aria-label', t('study.from'));
  const opts = [['all', t('subj.all')], ['general', t('subj.general')]];
  if (state.orphanedCount) opts.push(['orphaned', t('subj.unfiled')]);
  for (const s of state.subjects) opts.push([`s:${s.id}`, s.name]);
  if (state.current) opts.unshift([`n:${state.current.id}`, '📄 ' + state.current.title]);
  if (ui.scope?.noteId && !opts.some(([v]) => v === `n:${ui.scope.noteId}`)) opts.unshift([`n:${ui.scope.noteId}`, scopeLabel(ui.scope)]);
  for (const [v, label] of opts) {
    const o = el('option', null, label);
    o.value = v;
    sel.appendChild(o);
  }
  sel.value = ui.scope?.noteId ? `n:${ui.scope.noteId}` : typeof ui.scope?.subject === 'number' ? `s:${ui.scope.subject}` : ui.scope?.subject || 'all';
  sel.onchange = () => {
    const v = sel.value;
    ui.scope = v.startsWith('n:') ? { noteId: Number(v.slice(2)) } : v.startsWith('s:') ? { subject: Number(v.slice(2)) } : v === 'all' ? {} : { subject: v };
    loadSets();
  };
  const lab = el('label', 'mini-label', t('study.from'));
  const topic = el('input');
  topic.type = 'text';
  topic.placeholder = t('study.topicPh');
  topic.maxLength = 200;
  topic.value = ui.topic;
  topic.oninput = () => { ui.topic = topic.value; };
  const lab2 = el('label', 'mini-label', t('study.topic'));
  const c1 = el('div', 'col');
  c1.append(lab, sel);
  const c2 = el('div', 'col grow');
  c2.append(lab2, topic);
  row.append(c1, c2);
  gen.appendChild(row);

  const go = btn('btn btn-primary', { icon: 'sparkle', label: t('study.generate') });
  go.onclick = () => generate(go);
  topic.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); generate(go); } });
  const gRow = el('div', 'study-go');
  gRow.append(el('span', 'hint', t('study.hint')), go);
  gen.appendChild(gRow);
  wrap.appendChild(gen);

  /* guardados */
  const saved = el('div', 'study-saved card');
  saved.appendChild(el('div', 'card-title', t('study.saved')));
  const list = el('div', 'set-list');
  saved.appendChild(list);
  wrap.appendChild(saved);
  view.appendChild(wrap);
  renderSetList(list);
  if (!ui.loaded) loadSets();
}

async function loadSets() {
  const q = ui.scope?.noteId ? `?note_id=${ui.scope.noteId}` : typeof ui.scope?.subject === 'number' ? `?subject_id=${ui.scope.subject}` : '';
  try {
    ui.sets = (await api('/api/study' + q)).sets;
    ui.loaded = true;
  } catch (e) { toastError(e); }
  renderStudy();
}

function renderSetList(list) {
  list.replaceChildren();
  if (!ui.sets.length) {
    list.appendChild(el('div', 'empty-hint small', t('study.noneYet')));
    return;
  }
  for (const s of ui.sets) {
    const row = el('div', 'set-item');
    const b = btn('set-btn');
    const k = KINDS.find((x) => x.id === s.kind);
    b.append(icon(k?.icon || 'layers'), el('span', 'nm', s.title), el('span', 'sub', `${t(`study.${s.kind}`)} · ${fmtRelative(s.created_at)}`));
    b.onclick = () => openSet(s.id);
    const more = btn('btn-icon', { icon: 'moreVertical', title: t('common.options') });
    more.onclick = () =>
      popMenu(more, [
        {
          icon: 'trash', label: t('common.delete'), danger: true,
          onClick: async () => {
            if (!(await confirmModal({ title: t('study.deleteTitle'), message: s.title }))) return;
            try {
              await api('/api/study/' + s.id, { method: 'DELETE' });
              ui.sets = ui.sets.filter((x) => x.id !== s.id);
              renderStudy();
            } catch (e) { toastError(e); }
          },
        },
      ]);
    row.append(b, more);
    list.appendChild(row);
  }
}

async function generate(go) {
  if (ui.loading) return;
  ui.loading = true;
  setBtnBusy(go, true);
  const status = el('div', 'gen-status');
  status.append(el('span', 'spinner sm'), el('span', null, t('study.generating')));
  go.parentElement.prepend(status);
  const body = { kind: ui.kind, topic: ui.topic.trim(), lang: getLang() };
  if (ui.scope?.noteId) body.note_id = ui.scope.noteId;
  else if (ui.scope?.subject !== undefined) body.subject_id = ui.scope.subject;
  try {
    const r = await api('/api/study', { method: 'POST', body });
    ui.sets.unshift({ ...r.set, created_at: new Date().toISOString() });
    ui.open = r.set;
    toast(t('study.ready'), 'ok', 'sparkle');
  } catch (e) {
    toastError(e);
  }
  ui.loading = false;
  renderStudy();
}

async function openSet(id) {
  try {
    ui.open = (await api('/api/study/' + id)).set;
    renderStudy();
  } catch (e) { toastError(e); }
}

/* ---------- visores ---------- */

function viewer(set) {
  const box = el('div', 'study-viewer card');
  const top = el('div', 'viewer-top');
  top.append(
    btn('btn btn-sm', { icon: 'chevronLeft', label: t('common.back'), onClick: () => { ui.open = null; renderStudy(); } }),
    el('div', 'viewer-title', set.title)
  );
  box.appendChild(top);
  if (set.data.partial) box.appendChild(el('div', 'partial-note', t('study.partial')));
  if (set.kind === 'summary') {
    const md = el('div', 'md summary-md');
    md.appendChild(renderMarkdown(set.data.markdown));
    box.appendChild(md);
  } else if (set.kind === 'flashcards') box.appendChild(flashcards(set.data.cards));
  else if (set.kind === 'quiz') box.appendChild(quiz(set.data.questions));
  return box;
}

function flashcards(cards) {
  let order = cards.map((_, i) => i);
  let i = 0;
  const known = new Set();
  const wrap = el('div', 'fc-wrap');
  const card = btn('fc-card');
  card.setAttribute('aria-live', 'polite');
  const inner = el('div', 'fc-inner');
  const front = el('div', 'fc-face fc-front');
  const back = el('div', 'fc-face fc-back');
  inner.append(front, back);
  card.appendChild(inner);
  const counter = el('div', 'fc-count');
  const nav = el('div', 'fc-nav');
  const prev = btn('btn', { icon: 'chevronLeft', title: t('study.prev') });
  const next = btn('btn', { icon: 'chevronRight', title: t('study.next') });
  const know = btn('btn btn-sm', { icon: 'check', label: t('study.gotIt') });
  const shuffle = btn('btn btn-sm', { icon: 'shuffle', label: t('study.shuffle') });
  nav.append(prev, shuffle, know, next);

  const show = () => {
    const c = cards[order[i]];
    card.classList.remove('flipped');
    front.replaceChildren(el('span', 'fc-label', t('study.question')), el('div', 'fc-text', c.q));
    back.replaceChildren(el('span', 'fc-label', t('study.answer')), el('div', 'fc-text', c.a));
    counter.textContent = `${i + 1} / ${order.length} · ${t('study.known', { n: known.size })}`;
    know.classList.toggle('on', known.has(order[i]));
  };
  card.onclick = () => card.classList.toggle('flipped');
  prev.onclick = () => { i = (i - 1 + order.length) % order.length; show(); };
  next.onclick = () => { i = (i + 1) % order.length; show(); };
  know.onclick = () => { known.has(order[i]) ? known.delete(order[i]) : known.add(order[i]); next.onclick(); };
  shuffle.onclick = () => { order = order.sort(() => Math.random() - 0.5); i = 0; show(); };
  wrap.tabIndex = 0;
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') next.onclick();
    if (e.key === 'ArrowLeft') prev.onclick();
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); card.onclick(); }
  });
  wrap.append(counter, card, nav, el('div', 'hint center', t('study.fcHint')));
  show();
  setTimeout(() => wrap.focus({ preventScroll: true }), 0);
  return wrap;
}

function quiz(questions) {
  const wrap = el('div', 'quiz');
  const answers = new Map();
  const score = el('div', 'quiz-score');
  const update = () => {
    const right = [...answers].filter(([qi, a]) => questions[qi].answer === a).length;
    score.textContent = t('study.score', { right, done: answers.size, total: questions.length });
  };
  questions.forEach((q, qi) => {
    const box = el('div', 'quiz-q');
    box.appendChild(el('div', 'qq', `${qi + 1}. ${q.q}`));
    const opts = el('div', 'q-opts');
    const expl = el('div', 'q-expl');
    expl.hidden = true;
    q.options.forEach((o, oi) => {
      const b = btn('q-opt', { label: `${String.fromCharCode(65 + oi)}. ${o}` });
      b.onclick = () => {
        if (answers.has(qi)) return;
        answers.set(qi, oi);
        [...opts.children].forEach((c, ci) => {
          c.disabled = true;
          if (ci === q.answer) c.classList.add('right');
          else if (ci === oi) c.classList.add('wrong');
        });
        expl.hidden = false;
        expl.replaceChildren(icon(oi === q.answer ? 'check' : 'x'), el('span', null, q.explanation || ''));
        expl.classList.toggle('ok', oi === q.answer);
        update();
      };
      opts.appendChild(b);
    });
    box.append(opts, expl);
    wrap.appendChild(box);
  });
  const again = btn('btn btn-sm', { icon: 'refresh', label: t('study.retry'), onClick: () => wrap.replaceWith(quiz(questions)) });
  const foot = el('div', 'quiz-foot');
  foot.append(score, again);
  wrap.appendChild(foot);
  update();
  return wrap;
}
