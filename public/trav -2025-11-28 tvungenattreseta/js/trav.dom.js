// Tiny DOM helpers
export const $  = (sel, ctx=document) => ctx.querySelector(sel);
export const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
export const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') n.className = v;
    else if (k === 'innerHTML') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) n.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    if (Array.isArray(c)) c.forEach(x => n.append(x));
    else if (c instanceof Node) n.append(c);
    else n.append(document.createTextNode(String(c)));
  }
  return n;
};
