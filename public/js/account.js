// account.js — menú de cuenta: idioma, sesiones abiertas, contraseña, exportar, usuarios (admin), instalar
import {
  state, el, icon, btn, api, toast, toastError, confirmModal, openModal, field, input, setBtnBusy, popMenu, fmtRelative, fmtDate,
} from './core.js';
import { t, getLang, setLang } from './i18n.js';
import { renderApp } from './shell.js';
import { renderAuth } from './auth.js';
import { canInstall, doInstall } from './main.js';
import { ACCENTS, getTheme, getAccent, setTheme, setAccent } from './theme.js';

export function openAccountMenu(anchor) {
  const menu = popMenu(anchor, [
    { icon: 'globe', label: getLang() === 'es' ? 'English' : 'Español', onClick: () => { setLang(getLang() === 'es' ? 'en' : 'es'); renderApp(); } },
    { icon: 'droplet', label: t('appearance.title'), onClick: openAppearance },
    { icon: 'monitor', label: t('account.sessions'), onClick: openSessions },
    { icon: 'key', label: t('account.password'), onClick: openPassword },
    { icon: 'download', label: t('account.export'), onClick: () => { location.href = '/api/export'; toast(t('account.exporting'), 'ok', 'download'); } },
    state.user.isAdmin ? { icon: 'users', label: t('account.users'), onClick: openUsers } : null,
    canInstall() ? { icon: 'download', label: t('account.install'), onClick: doInstall } : null,
    '-',
    { icon: 'logout', label: t('account.logout'), danger: true, onClick: logout },
  ]);
  const head = el('div', 'pop-head');
  head.append(el('span', 'avatar sm', (state.user.username[0] || '?').toUpperCase()), el('div', null, state.user.username));
  head.lastChild.appendChild(el('div', 'role', state.user.isAdmin ? 'admin' : t('account.user')));
  menu.prepend(head);
}

async function logout() {
  try { await api('/api/logout', { method: 'POST', noAuthRedirect: true }); } catch { /* ok */ }
  const { renderLanding } = await import('./landing.js');
  renderLanding();
}

/* ---------- apariencia ---------- */

export function openAppearance() {
  const { modal, close } = openModal({ title: t('appearance.title'), sub: t('appearance.sub') });
  modal.appendChild(el('div', 'mini-label', t('appearance.theme')));
  const seg = el('div', 'seg');
  const modes = [['system', 'monitor'], ['light', 'sun'], ['dark', 'moon']];
  const paint = () => [...seg.children].forEach((b, i) => b.classList.toggle('active', modes[i][0] === getTheme()));
  for (const [mode, ic] of modes) {
    seg.appendChild(btn('seg-btn', { icon: ic, label: t(`appearance.${mode}`), onClick: () => { setTheme(mode); paint(); } }));
  }
  modal.appendChild(seg);
  paint();
  modal.appendChild(el('div', 'mini-label', t('appearance.accent')));
  const sw = el('div', 'swatches');
  for (const a of ACCENTS) {
    const b = btn('swatch' + (getAccent() === a ? ' active' : ''), { title: t(`appearance.${a}`) });
    b.dataset.swatch = a;
    b.onclick = () => {
      setAccent(a);
      sw.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('active', x === b));
    };
    sw.appendChild(b);
  }
  modal.appendChild(sw);
  const actions = el('div', 'actions');
  actions.appendChild(btn('btn btn-primary', { label: t('common.close'), onClick: () => close() }));
  modal.appendChild(actions);
}

/* ---------- sesiones ---------- */

function deviceName(ua = '') {
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [br, os].filter(Boolean).join(' · ') || t('account.unknownDevice');
}

async function openSessions() {
  const { modal, close } = openModal({ title: t('account.sessions'), sub: t('account.sessionsSub'), wide: true });
  const list = el('div', 'session-list');
  modal.appendChild(list);
  const actions = el('div', 'actions');
  const others = btn('btn btn-danger', { icon: 'logout', label: t('account.closeOthers') });
  actions.append(btn('btn', { label: t('common.close'), onClick: () => close() }), others);
  modal.appendChild(actions);
  const load = async () => {
    const { sessions } = await api('/api/sessions');
    list.replaceChildren();
    for (const s of sessions) {
      const row = el('div', 'session-row' + (s.current ? ' current' : ''));
      const info = el('div', 'session-info');
      info.append(el('div', 'nm', deviceName(s.user_agent) + (s.current ? ` (${t('account.thisDevice')})` : '')));
      info.append(el('div', 'sub', `${t('account.lastSeen')} ${fmtRelative(s.last_seen)} · ${t('account.since')} ${fmtDate(s.created_at, false)}${s.ip ? ' · ' + s.ip : ''}`));
      row.append(icon('monitor'), info);
      if (!s.current) {
        row.appendChild(btn('btn btn-sm', {
          label: t('account.closeSession'),
          onClick: async () => {
            try { await api('/api/sessions/' + s.id, { method: 'DELETE' }); await load(); } catch (e) { toastError(e); }
          },
        }));
      }
      list.appendChild(row);
    }
    others.disabled = sessions.length < 2;
  };
  others.onclick = async () => {
    try {
      const r = await api('/api/sessions/others', { method: 'DELETE' });
      toast(t('account.closedN', { n: r.closed }), 'ok');
      await load();
    } catch (e) { toastError(e); }
  };
  load().catch(toastError);
}

/* ---------- contraseña ---------- */

function openPassword() {
  const { modal, close } = openModal({ title: t('account.password'), sub: t('account.passwordSub') });
  const cur = input('password', '', { autocomplete: 'current-password' });
  const p1 = input('password', '', { autocomplete: 'new-password', minLength: 8 });
  const p2 = input('password', '', { autocomplete: 'new-password' });
  modal.append(field(t('account.currentPassword'), cur), field(t('auth.passwordMin'), p1), field(t('auth.repeatPassword'), p2));
  const ok = btn('btn btn-primary', { label: t('common.save') });
  const actions = el('div', 'actions');
  actions.append(btn('btn', { label: t('common.cancel'), onClick: () => close() }), ok);
  modal.appendChild(actions);
  ok.onclick = async () => {
    if (p1.value !== p2.value) return toast(t('auth.mismatch'), 'error');
    setBtnBusy(ok, true);
    try {
      const r = await api('/api/me/password', { method: 'PUT', body: { current: cur.value, password: p1.value } });
      close();
      toast(t('account.passwordChanged', { n: r.closedSessions }), 'ok');
    } catch (e) { setBtnBusy(ok, false); toastError(e); }
  };
  cur.focus();
}

/* ---------- usuarios (admin) ---------- */

async function openUsers() {
  const { modal, close } = openModal({ title: t('account.users'), sub: t('account.usersSub'), wide: true });
  const status = el('div', 'admin-status');
  const list = el('div', 'session-list');
  modal.append(status, list);
  const actions = el('div', 'actions');
  actions.append(
    btn('btn', { label: t('common.close'), onClick: () => close() }),
    btn('btn btn-primary', { icon: 'userPlus', label: t('account.newUser'), onClick: () => newUser(load) })
  );
  modal.appendChild(actions);

  async function load() {
    const [{ users }, st] = await Promise.all([api('/api/admin/users'), api('/api/admin/status')]);
    status.replaceChildren();
    const pill = (label, v) => { const p = el('span', 'pill'); p.append(el('b', null, String(v)), document.createTextNode(' ' + label)); return p; };
    status.append(
      pill(t('account.stNotes'), st.counts.notes),
      pill(t('account.stMessages'), st.counts.messages),
      pill(t('account.stChunks'), st.counts.chunks),
      pill(t('account.stPending'), st.counts.notIndexed + st.counts.imagesPending + st.counts.audiosPending)
    );
    status.appendChild(el('div', 'models', `${t('account.models')}: ${[st.models.chat, st.models.fallback].filter(Boolean).join(' → ')} · ${st.models.embeddings} · ${st.models.transcription}`));
    list.replaceChildren();
    for (const u of users) {
      const row = el('div', 'session-row');
      const info = el('div', 'session-info');
      info.append(
        el('div', 'nm', u.username + (u.isAdmin ? ' · admin' : '')),
        el('div', 'sub', `${u.notes} ${t('account.stNotes')} · ${u.messages} ${t('account.stMessages')} · ${u.last_seen ? t('account.lastSeen') + ' ' + fmtRelative(u.last_seen) : t('account.never')}`)
      );
      row.append(el('span', 'avatar sm', u.username[0].toUpperCase()), info);
      row.appendChild(btn('btn btn-sm', { icon: 'key', label: t('account.reset'), onClick: () => resetPassword(u) }));
      if (u.id !== state.user.id) {
        row.appendChild(btn('btn btn-sm btn-danger', {
          icon: 'trash',
          title: t('common.delete'),
          onClick: async () => {
            if (!(await confirmModal({ title: t('account.deleteUser', { name: u.username }), message: t('account.deleteUserMsg', { n: u.notes }) }))) return;
            try { await api('/api/admin/users/' + u.id, { method: 'DELETE' }); toast(t('account.userDeleted'), 'ok'); await load(); } catch (e) { toastError(e); }
          },
        }));
      }
      list.appendChild(row);
    }
  }
  load().catch(toastError);
}

function newUser(reload) {
  const { modal, close } = openModal({ title: t('account.newUser'), sub: t('account.newUserSub') });
  const u = input('text', '', { autocomplete: 'off', maxLength: 32 });
  const p = input('password', '', { autocomplete: 'new-password' });
  modal.append(field(t('auth.username'), u), field(t('auth.passwordMin'), p));
  const ok = btn('btn btn-primary', { label: t('common.create') });
  const actions = el('div', 'actions');
  actions.append(btn('btn', { label: t('common.cancel'), onClick: () => close() }), ok);
  modal.appendChild(actions);
  ok.onclick = async () => {
    setBtnBusy(ok, true);
    try {
      await api('/api/admin/users', { method: 'POST', body: { username: u.value.trim(), password: p.value } });
      close();
      toast(t('account.userCreated'), 'ok');
      reload();
    } catch (e) { setBtnBusy(ok, false); toastError(e); }
  };
  u.focus();
}

function resetPassword(user) {
  const { modal, close } = openModal({ title: t('account.resetTitle', { name: user.username }), sub: t('account.resetSub') });
  const p = input('password', '', { autocomplete: 'new-password' });
  modal.appendChild(field(t('auth.passwordMin'), p));
  const ok = btn('btn btn-primary', { label: t('common.save') });
  const actions = el('div', 'actions');
  actions.append(btn('btn', { label: t('common.cancel'), onClick: () => close() }), ok);
  modal.appendChild(actions);
  ok.onclick = async () => {
    setBtnBusy(ok, true);
    try {
      await api(`/api/admin/users/${user.id}/password`, { method: 'PUT', body: { password: p.value } });
      close();
      toast(t('account.resetDone'), 'ok');
    } catch (e) { setBtnBusy(ok, false); toastError(e); }
  };
  p.focus();
}

