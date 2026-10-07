// search.js — búsqueda global (Ctrl+K): palabras exactas en todos los apuntes, con salto al mensaje
import { el, icon, api, fmtDate, debounce } from './core.js';
import { t } from './i18n.js';
import { openNote } from './editor.js';
import { switchView } from './shell.js';

let lastQuery = '';

export function openSearch() {
  if (document.querySelector('.palette')) return;
  const back = el('div', 'modal-back palette-back');
  const box = el('div', 'palette');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', t('search.open'));
  const bar = el('div', 'palette-bar');
  const inp = el('input');
  inp.type = 'search';
  inp.placeholder = t('search.placeholder');
  inp.value = lastQuery;
  inp.setAttribute('aria-controls', 'palette-results');
  bar.append(icon('search'), inp, el('kbd', null, 'Esc'));
  const results = el('div', 'palette-results');
  results.id = 'palette-results';
  results.setAttribute('role', 'listbox');
  const foot = el('div', 'palette-foot');
  const askBtn = el('button', 'palette-ask');
  askBtn.type = 'button';
  askBtn.append(icon('sparkle'), el('span', null, t('search.askInstead')));
  foot.appendChild(askBtn);
  box.append(bar, results, foot);
  back.appendChild(box);
  document.body.appendChild(back);

  let items = [];
  let sel = 0;
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const highlight = () => items.forEach((it, i) => it.classList.toggle('sel', i === sel));

  const run = debounce(async () => {
    const q = inp.value.trim();
    lastQuery = q;
    if (q.length < 2) {
      results.replaceChildren(el('div', 'palette-empty', t('search.hint')));
      items = [];
      return;
    }
    try {
      const r = await api('/api/search?q=' + encodeURIComponent(q));
      if (inp.value.trim() !== q) return;
      results.replaceChildren();
      items = [];
      if (!r.results.length) results.appendChild(el('div', 'palette-empty', t('search.none', { q })));
      for (const res of r.results) {
        const it = el('button', 'palette-item');
        it.type = 'button';
        it.setAttribute('role', 'option');
        const head = el('div', 'pi-head');
        head.append(el('span', 'pi-title', res.title));
        if (res.subjectName) head.appendChild(el('span', 'pi-subj', res.subjectName));
        head.appendChild(el('span', 'pi-date', fmtDate(res.createdAt)));
        const snip = el('div', 'pi-snip');
        if (res.sender) snip.appendChild(el('b', null, res.sender + ': '));
        if (res.kind === 'image') snip.appendChild(document.createTextNode('🖼 '));
        if (res.kind === 'audio') snip.appendChild(document.createTextNode('🎤 '));
        // \u0001...\u0002 marcan las coincidencias (el servidor no manda HTML)
        for (const [i, part] of res.snippet.split(/[\u0001\u0002]/).entries()) {
          snip.appendChild(i % 2 ? el('mark', null, part) : document.createTextNode(part));
        }
        it.append(head, snip);
        it.onclick = () => {
          close();
          openNote(res.noteId, { focusMessage: res.messageId, quote: q });
        };
        results.appendChild(it);
        items.push(it);
      }
      sel = 0;
      highlight();
    } catch (e) {
      results.replaceChildren(el('div', 'palette-empty', e.message));
    }
  }, 180);

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); sel = (sel + 1) % items.length; highlight(); items[sel].scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); sel = (sel - 1 + items.length) % items.length; highlight(); items[sel].scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' && document.activeElement === inp) {
      e.preventDefault();
      if (items[sel]) items[sel].click();
      else if (inp.value.trim()) askBtn.click();
    }
  };
  document.addEventListener('keydown', onKey, true);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  askBtn.onclick = () => {
    const q = inp.value.trim();
    close();
    switchView('chat');
    setTimeout(() => {
      const ta = document.querySelector('.chat-view .composer textarea');
      if (ta && q) { ta.value = q; ta.dispatchEvent(new Event('input')); }
      ta?.focus();
    }, 50);
  };
  inp.addEventListener('input', run);
  inp.focus();
  inp.select();
  run();
}
