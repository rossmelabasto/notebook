// demo.js — demo pública: entrar, barra con tiempo y cuota restantes, aviso de bienvenida
import { state, el, icon, btn, api, toastError, openModal } from './core.js';
import { t, getLang } from './i18n.js';

export const REPO_SELF_HOST = 'https://github.com/rossmelabasto/notebook#self-hosting';

/** Crea una cuenta temporal con apuntes de ejemplo y entra */
export async function startDemo(button) {
  if (button) button.disabled = true;
  try {
    const r = await api('/api/demo', { method: 'POST', body: { lang: getLang() }, noAuthRedirect: true });
    try { sessionStorage.setItem('nb_demo_welcome', '1'); } catch { /* ok */ }
    const { loadApp, selectSubject } = await import('./shell.js');
    await loadApp();
    // abrir directo el apunte de ejemplo más completo (texto, foto de la pizarra, flashcards)
    if (r.openNote) {
      const note = (await api('/api/notes?subject_id=all')).notes.find((n) => n.id === r.openNote);
      if (note?.subject_id) await selectSubject(note.subject_id);
      const { openNote } = await import('./editor.js');
      await openNote(r.openNote);
    }
  } catch (e) {
    if (button) button.disabled = false;
    toastError(e);
  }
}

function hoursLeft() {
  const exp = state.user?.demo?.expiresAt;
  if (!exp) return 0;
  const ms = new Date(exp.replace(' ', 'T') + 'Z').getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 3600_000));
}

/** Barra fina arriba de la app: tiempo restante, cuota usada y enlace para instalarlo */
export function demoBar() {
  const bar = el('div', 'demo-bar');
  bar.setAttribute('role', 'status');
  paint(bar);
  return bar;
}

function paint(bar) {
  const d = state.user?.demo;
  if (!d) return;
  const pill = (label, used, max) => {
    const p = el('span', 'demo-pill' + (used >= max ? ' out' : ''));
    p.textContent = `${label} ${used}/${max}`;
    return p;
  };
  const info = el('button', 'demo-tag');
  info.type = 'button';
  info.append(icon('sparkle'), el('span', 'demo-tag-long', t('demo.tag', { h: hoursLeft() })), el('span', 'demo-tag-short', t('demo.tagShort', { h: hoursLeft() })));
  info.onclick = () => showWelcome(true);
  const pills = el('div', 'demo-pills');
  pills.append(
    pill(t('demo.qAsk'), d.used.ask, d.limits.ask),
    pill(t('demo.qStudy'), d.used.study, d.limits.study),
    pill(t('demo.qImages'), d.used.images, d.limits.images),
    pill(t('demo.qAudio'), d.used.audio, d.limits.audio)
  );
  const link = el('a', 'demo-link', t('demo.install'));
  link.href = REPO_SELF_HOST;
  link.target = '_blank';
  link.rel = 'noopener';
  bar.replaceChildren(info, pills, link);
}

/** Actualiza lo usado (después de preguntar, estudiar o subir algo) */
export async function refreshDemoBar() {
  if (!state.user?.isDemo) return;
  try {
    state.user = await api('/api/me');
    const bar = document.querySelector('.demo-bar');
    if (bar) paint(bar);
  } catch { /* la sesión de demo pudo vencer: el 401 lleva al login */ }
}

/** Aviso corto la primera vez (o al tocar la etiqueta de la barra) */
export function showWelcome(force = false) {
  if (!state.user?.isDemo) return;
  let first = false;
  try { first = sessionStorage.getItem('nb_demo_welcome') === '1'; sessionStorage.removeItem('nb_demo_welcome'); } catch { /* ok */ }
  if (!first && !force) return;
  const L = state.user.demo.limits;
  const { modal, close } = openModal({ title: t('demo.welcomeTitle'), sub: t('demo.welcomeSub', { h: hoursLeft() }) });
  const ul = el('ul', 'demo-list');
  for (const k of ['demo.w1', 'demo.w2', 'demo.w3']) ul.appendChild(el('li', null, t(k, L)));
  modal.appendChild(ul);
  modal.appendChild(el('p', 'hint', t('demo.why')));
  const actions = el('div', 'actions');
  const gh = el('a', 'btn', t('demo.install'));
  gh.href = REPO_SELF_HOST;
  gh.target = '_blank';
  gh.rel = 'noopener';
  actions.append(gh, btn('btn btn-primary', { label: t('demo.start'), onClick: () => close() }));
  modal.appendChild(actions);
}
