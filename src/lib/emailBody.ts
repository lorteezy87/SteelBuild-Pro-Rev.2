const ALLOWED_TAGS = new Set(['a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup', 'dd', 'del', 'div', 'dl', 'dt', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul']);
const DROP_CONTENT = new Set(['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'option', 'video', 'audio', 'source', 'svg', 'math', 'template', 'noscript']);

function httpsUrl(raw: string | null): string | null {
  if (!raw || /[\u0000-\u0020\u007f]/.test(raw)) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

/** Strict inert-tree reconstruction, not regex HTML filtering. No sender CSS,
 * forms, namespaces, events, navigation metadata or executable elements survive.
 * Remote images require an explicit decision for this exact message body. */
export function buildSafeEmailDocument(rawHtml: string, allowRemoteImages = false): { html: string; blockedImages: number } {
  const input = document.createElement('template');
  input.innerHTML = rawHtml;
  const output = document.createElement('template');
  const inert = output.content.ownerDocument;
  let blockedImages = 0;
  const append = (node: Node, parent: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { parent.appendChild(inert.createTextNode(node.textContent || '')); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    const tag = element.localName.toLowerCase();
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || DROP_CONTENT.has(tag)) return;
    if (!ALLOWED_TAGS.has(tag)) { Array.from(node.childNodes).forEach(child => append(child, parent)); return; }
    const clean = inert.createElement(tag);
    for (const name of ['title', 'alt', 'dir', 'lang']) {
      const value = element.getAttribute(name);
      if (value !== null) clean.setAttribute(name, value);
    }
    for (const name of ['width', 'height', 'colspan', 'rowspan']) {
      const value = element.getAttribute(name);
      if (value && /^\d{1,4}$/.test(value) && Number(value) > 0) clean.setAttribute(name, value);
    }
    if (tag === 'a') {
      const href = httpsUrl(element.getAttribute('href'));
      if (href) { clean.setAttribute('href', href); clean.setAttribute('rel', 'noreferrer noopener'); }
    }
    if (tag === 'img') {
      const src = httpsUrl(element.getAttribute('src'));
      if (src && allowRemoteImages) { clean.setAttribute('src', src); clean.setAttribute('referrerpolicy', 'no-referrer'); }
      else { blockedImages++; clean.setAttribute('alt', element.getAttribute('alt') || 'Image blocked'); }
    }
    Array.from(node.childNodes).forEach(child => append(child, clean));
    parent.appendChild(clean);
  };
  Array.from(input.content.childNodes).forEach(node => append(node, output.content));
  const csp = `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src ${allowRemoteImages ? 'https:' : "'none'"}; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  return {
    blockedImages,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><style>body{margin:0;padding:12px;font:13px/1.5 system-ui,sans-serif;color:CanvasText;background:Canvas;color-scheme:light dark;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{padding:4px 8px}pre{white-space:pre-wrap}a{color:LinkText}</style></head><body>${output.innerHTML}</body></html>`,
  };
}
