// landing.js — página pública (sin sesión): qué es, capturas, funciones, open source y enlaces
import { el, icon, btn } from './core.js';
import { t, getLang, setLang } from './i18n.js';
import { isDark, toggleTheme } from './theme.js';
import { renderAuth } from './auth.js';
import { api } from './core.js';
import { startDemo } from './demo.js';

export const REPO_URL = 'https://github.com/rossmelabasto/notebook';
export const PORTFOLIO_URL = 'https://portfolio.rossmel.top';

const link = (cls, href, children, external = true) => {
  const a = el('a', cls);
  a.href = href;
  if (external) { a.target = '_blank'; a.rel = 'noopener'; }
  a.append(...children);
  return a;
};

const shot = (name) => `/landing/${name}-${isDark() ? 'dark' : 'light'}.webp`;

export async function renderLanding() {
  let demo = false;
  try { demo = (await api('/api/bootstrap', { noAuthRedirect: true })).demo; } catch { /* sin demo */ }
  const page = el('div', 'landing');
  document.title = 'Notebook — ' + t('land.titleTag');

  /* barra */
  const nav = el('header', 'l-nav');
  const brand = el('a', 'l-brand');
  brand.href = '/';
  const logo = el('span', 'brand-logo');
  logo.appendChild(icon('book'));
  brand.append(logo, el('span', null, 'Notebook'));
  const right = el('div', 'l-nav-right');
  const gh = link('l-icon-link', REPO_URL, [icon('github')]);
  gh.title = 'GitHub';
  gh.setAttribute('aria-label', 'GitHub');
  const lang = btn('l-chip-btn', { label: getLang() === 'es' ? 'EN' : 'ES', title: getLang() === 'es' ? 'English' : 'Español' });
  lang.onclick = () => { setLang(getLang() === 'es' ? 'en' : 'es'); renderLanding(); };
  const theme = btn('btn-icon', { icon: isDark() ? 'sun' : 'moon', title: t('appearance.toggle') });
  theme.onclick = () => { toggleTheme(); renderLanding(); };
  const enter = btn('btn btn-primary btn-sm', { label: t('auth.signIn'), onClick: () => renderAuth({ fromLanding: true }) });
  right.append(gh, lang, theme, enter);
  nav.append(brand, right);

  /* hero */
  const hero = el('section', 'l-hero');
  const badge = el('div', 'l-badge');
  badge.append(el('span', 'l-dot'), el('span', null, t('land.badge')));
  const h1 = el('h1');
  h1.append(document.createTextNode(t('land.h1a') + ' '), el('span', 'l-grad', t('land.h1b')));
  const ctas = el('div', 'l-ctas');
  if (demo) {
    const tryBtn = btn('btn btn-primary l-cta', { icon: 'sparkle', label: t('demo.try') });
    tryBtn.onclick = () => startDemo(tryBtn);
    ctas.append(tryBtn);
  } else {
    ctas.append(btn('btn btn-primary l-cta', { label: t('land.ctaEnter'), onClick: () => renderAuth({ fromLanding: true }) }));
  }
  ctas.append(link('btn l-cta', REPO_URL, [icon('github'), el('span', null, t('land.ctaRepo'))]));
  hero.append(badge, h1, el('p', 'l-lead', t('land.lead')), ctas);
  if (demo) hero.appendChild(el('p', 'l-demo-note', t('demo.note')));

  /* capturas */
  const showcase = el('div', 'l-showcase reveal');
  const win = el('div', 'l-window');
  const bar = el('div', 'l-window-bar');
  bar.append(el('i'), el('i'), el('i'), el('span', null, 'notebook.rossmel.top'));
  const desk = el('img', 'l-shot');
  desk.src = shot('desktop');
  desk.alt = t('land.altDesktop');
  desk.width = 1440;
  desk.height = 900;
  desk.loading = 'eager';
  win.append(bar, desk);
  const phone = el('div', 'l-phone');
  const mob = el('img', 'l-shot');
  mob.src = shot('mobile');
  mob.alt = t('land.altMobile');
  mob.width = 390;
  mob.height = 844;
  mob.loading = 'lazy';
  phone.appendChild(mob);
  showcase.append(win, phone);
  hero.appendChild(showcase);

  /* funciones */
  const feats = el('section', 'l-section');
  feats.append(el('h2', 'reveal', t('land.featTitle')), el('p', 'l-sub reveal', t('land.featSub')));
  const grid = el('div', 'l-grid');
  const FEATS = [
    ['messageCircle', 'f1'], ['sparkle', 'f2'], ['image', 'f3'],
    ['layers', 'f4'], ['search', 'f5'], ['key', 'f6'],
  ];
  for (const [ic, k] of FEATS) {
    const c = el('div', 'l-card reveal');
    const i = el('div', 'l-card-ic');
    i.appendChild(icon(ic));
    c.append(i, el('h3', null, t(`land.${k}t`)), el('p', null, t(`land.${k}d`)));
    grid.appendChild(c);
  }
  feats.appendChild(grid);

  /* cómo funciona */
  const how = el('section', 'l-section');
  how.append(el('h2', 'reveal', t('land.howTitle')));
  const steps = el('div', 'l-steps');
  ['s1', 's2', 's3'].forEach((k, i) => {
    const s = el('div', 'l-step reveal');
    s.append(el('span', 'l-step-n', String(i + 1)), el('h3', null, t(`land.${k}t`)), el('p', null, t(`land.${k}d`)));
    steps.appendChild(s);
  });
  how.appendChild(steps);

  /* open source */
  const os = el('section', 'l-os reveal');
  const osText = el('div');
  osText.append(el('h2', null, t('land.osTitle')), el('p', null, t('land.osText')));
  const stack = el('div', 'l-stack');
  for (const s of ['Node.js', 'SQLite + sqlite-vec', 'FTS5', 'Groq', 'Gemini', 'Vanilla JS · PWA', 'MIT']) stack.appendChild(el('span', 'chip', s));
  osText.appendChild(stack);
  const osCta = el('div', 'l-os-cta');
  osCta.append(
    link('btn btn-primary', REPO_URL, [icon('github'), el('span', null, t('land.osRepo'))]),
    link('btn', `${REPO_URL}#self-hosting`, [icon('download'), el('span', null, t('land.osHost'))])
  );
  os.append(osText, osCta);

  /* pie */
  const foot = el('footer', 'l-foot');
  const by = el('div', 'l-by');
  by.append(document.createTextNode(t('land.madeBy') + ' '), link('l-link', PORTFOLIO_URL, [document.createTextNode('Rossmel Abasto')]));
  const links = el('div', 'l-foot-links');
  links.append(
    link('l-link', PORTFOLIO_URL, [document.createTextNode(t('land.portfolio'))]),
    link('l-link', REPO_URL, [document.createTextNode('GitHub')]),
    link('l-link', `${REPO_URL}/blob/main/LICENSE`, [document.createTextNode(t('land.license'))])
  );
  foot.append(by, links);

  page.append(nav, hero, feats, how, os, foot);
  document.getElementById('app').replaceChildren(page);

  // aparecer al hacer scroll (respeta "reducir movimiento")
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { root: page, rootMargin: '0px 0px -8% 0px' });
    page.querySelectorAll('.reveal').forEach((n) => io.observe(n));
  } else {
    page.querySelectorAll('.reveal').forEach((n) => n.classList.add('in'));
  }
}
