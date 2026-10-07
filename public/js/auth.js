// auth.js — pantalla de login y de configuración inicial
import { state, el, icon, api, btn, field, input, setBtnBusy, toastError } from './core.js';
import { t, langSwitcher } from './i18n.js';
import { loadApp } from './shell.js';

export async function renderAuth({ fromLanding = false } = {}) {
  Object.assign(state, { user: null, subjects: [], notes: [], current: null, chat: [], convos: [], convosLoaded: false, activeConvo: null, convoMsgs: [] });
  let needsSetup = false;
  try {
    needsSetup = (await api('/api/bootstrap', { noAuthRedirect: true })).needsSetup;
  } catch { /* servidor caído: igual mostramos el login */ }

  const wrap = el('div', 'auth-wrap');
  const card = el('form', 'auth-card');
  card.noValidate = true;
  const logo = el('div', 'auth-logo');
  logo.appendChild(icon('book'));
  card.append(
    logo,
    el('h1', null, needsSetup ? t('auth.setupTitle') : 'Notebook'),
    el('p', 'sub', needsSetup ? t('auth.setupSub') : t('auth.tagline'))
  );

  const inputs = {};
  const add = (key, label, type, auto) => {
    const i = input(type, '', { autocomplete: auto, required: true });
    inputs[key] = i;
    card.appendChild(field(label, i));
  };
  if (needsSetup) {
    add('token', t('auth.setupToken'), 'text', 'off');
    add('username', t('auth.username'), 'text', 'username');
    add('password', t('auth.passwordMin'), 'password', 'new-password');
    add('password2', t('auth.repeatPassword'), 'password', 'new-password');
  } else {
    add('username', t('auth.username'), 'text', 'username');
    add('password', t('auth.password'), 'password', 'current-password');
  }

  const submitBtn = btn('btn btn-primary', { label: needsSetup ? t('auth.createAccount') : t('auth.signIn') });
  submitBtn.type = 'submit';
  card.appendChild(submitBtn);
  const foot = el('div', 'auth-foot');
  if (!needsSetup) {
    const back = btn('l-link auth-back', { icon: 'chevronLeft', label: t('land.whatIs') });
    back.onclick = () => import('./landing.js').then((m) => m.renderLanding());
    foot.appendChild(back);
  }
  foot.appendChild(langSwitcher(() => renderAuth({ fromLanding })));
  card.appendChild(foot);

  card.onsubmit = async (e) => {
    e.preventDefault();
    if (needsSetup && inputs.password.value !== inputs.password2.value) {
      return toastError(new Error(t('auth.mismatch')));
    }
    setBtnBusy(submitBtn, true);
    try {
      const body = { username: inputs.username.value.trim(), password: inputs.password.value };
      const r = needsSetup
        ? await api('/api/setup', { method: 'POST', body: { ...body, token: inputs.token.value.trim() }, noAuthRedirect: true })
        : await api('/api/login', { method: 'POST', body, noAuthRedirect: true });
      state.user = r.user;
      await loadApp();
    } catch (err) {
      setBtnBusy(submitBtn, false);
      toastError(err);
      inputs.password.select();
    }
  };

  wrap.appendChild(card);
  document.getElementById('app').replaceChildren(wrap);
  (needsSetup ? inputs.token : inputs.username).focus();
}
