// markdown.js — Markdown seguro (marked + DOMPurify) con insignias de citas [n] clicables
import { marked } from '/vendor/marked.esm.js';
import DOMPurify from '/vendor/purify.es.mjs';

marked.setOptions({ gfm: true, breaks: true });

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Convierte Markdown en un fragmento DOM seguro. Las citas [1], [2][3] se vuelven
 * botones (onCite(n)). No toca el texto dentro de <code>/<pre>.
 */
export function renderMarkdown(text, { onCite, maxCite = 99 } = {}) {
  // gpt-oss cita con 【1】: se normaliza a [1] (también mientras llega el streaming)
  const src = String(text || '').replace(/【(\d+)[^】]*】/g, '[$1]');
  const html = DOMPurify.sanitize(marked.parse(src), {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'hr', 'del', 'sup', 'sub'],
    ALLOWED_ATTR: ['href', 'title', 'align'],
  });
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const frag = tpl.content;

  if (onCite) {
    const walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest('code, pre, a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) if (/\[\d+\]/.test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const parts = node.nodeValue.split(/(\[\d+\])/);
      const out = document.createDocumentFragment();
      for (const p of parts) {
        const m = p.match(/^\[(\d+)\]$/);
        const n = m ? parseInt(m[1], 10) : 0;
        if (m && n >= 1 && n <= maxCite) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'cite';
          b.textContent = n;
          b.onclick = () => onCite(n);
          out.appendChild(b);
        } else if (p) out.appendChild(document.createTextNode(p));
      }
      node.replaceWith(out);
    }
  }
  return frag;
}
