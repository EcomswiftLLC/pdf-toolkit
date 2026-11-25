// Shared helpers: limits, DOM, file sniffing, ranges, downloads, events.
export const LIMITS = {
  maxBytes: 50 * 1024 * 1024,        // per PDF
  maxPages: 200,                     // per PDF
  maxFiles: 20,                      // PDFs per merge
  maxImages: 50,                     // images per PDF
  maxImageBytes: 25 * 1024 * 1024,   // per image
  maxImagePixels: 60e6,              // decoded size guard (memory)
  maxCanvasPixels: 16.7e6,           // rendering guard (4096 x 4096)
};

export class AppError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export class Cancelled extends Error { constructor() { super('Cancelled'); this.code = 'cancelled'; } }

// Where the UI lives: the document (standalone page) or a shadow root (native Wix custom element).
let ROOT = document, HOST = window;
export function setRoot(root, host) { ROOT = root; HOST = host || window; }
export const uiHost = () => HOST;
export const $ = (s, r = ROOT) => r.querySelector(s);
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// ---- icons (one family: 24px, 1.75 stroke line icons) ----
const P = {
  merge: '<path d="M7 4v5a4 4 0 0 0 4 4h6"/><path d="M17 4v5a4 4 0 0 1-4 4"/><path d="M12 13v7"/><path d="m9 17 3 3 3-3"/>',
  split: '<path d="M12 3v7"/><path d="m9 6 3-3 3 3"/><path d="M12 10c0 4-6 4-6 10"/><path d="M12 10c0 4 6 4 6 10"/>',
  compress: '<path d="M4 9h5V4"/><path d="m4 4 5 5"/><path d="M20 15h-5v5"/><path d="m20 20-5-5"/><path d="M15 9h5"/><path d="M4 15h5"/>',
  img2pdf: '<rect x="3" y="4" width="12" height="12" rx="2"/><circle cx="7.5" cy="8.5" r="1.2"/><path d="m3 14 4-4 5 5"/><path d="M17 9h2a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1"/>',
  pdf2img: '<path d="M6 3h7l5 5v4"/><path d="M6 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"/><path d="M13 3v5h5"/><rect x="12" y="14" width="9" height="7" rx="1.5"/><path d="m12 20 3-3 2 2 2-2 2 2"/>',
  rotate: '<path d="M20 11a8 8 0 1 0-2.6 5.9"/><path d="M20 4v7h-7"/>',
  reorder: '<path d="M8 4v16"/><path d="m4 8 4-4 4 4"/><path d="M16 20V4"/><path d="m12 16 4 4 4-4"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>',
  extract: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m9 15 3-3 3 3"/><path d="M12 12v6"/>',
  numbers: '<path d="M5 9h14M5 15h14"/><path d="m10 4-2 16M16 4l-2 16"/>',
  watermark: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9 14a3 3 0 0 0 3 3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  sign: '<path d="M3 20h18"/><path d="m4 16 3-1 10-10a2 2 0 0 0-3-3L4 12z"/>',
  annotate: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  ocr: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8 9h8M8 12h8M8 15h5"/>',
  word: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m8.5 12 1.2 5 1.8-4 1.8 4 1.2-5"/>',
  office: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
  repair: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/>',
  download: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  left: '<path d="m14 6-6 6 6 6"/>',
  right: '<path d="m10 6 6 6-6 6"/>',
  rotl: '<path d="M4 11a8 8 0 1 1 2.6 5.9"/><path d="M4 4v7h7"/>',
  rotr: '<path d="M20 11a8 8 0 1 0-2.6 5.9"/><path d="M20 4v7h-7"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.5h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  zip: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M10 10h2M10 13h2M10 16h2"/>',
  grip: '<circle cx="9" cy="7" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="17" r="1"/><circle cx="15" cy="17" r="1"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
};
export function icon(name, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i ' + cls); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
  s.innerHTML = P[name] || P.file;
  return s;
}

// ---- formatting ----
export function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
  return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
}
export function baseName(name) {
  const b = String(name || 'document').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  return b.replace(/[^\p{L}\p{N} ._-]+/gu, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'document';
}
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---- file type by content, never by extension alone ----
export async function sniff(file) {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const s = (i, str) => [...str].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (s(0, '%PDF-')) return 'pdf';
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg';
  if (b[0] === 0x89 && s(1, 'PNG')) return 'png';
  if (s(0, 'RIFF') && s(8, 'WEBP')) return 'webp';
  if (s(0, 'GIF8')) return 'gif';
  if (s(0, 'BM')) return 'bmp';
  if (s(4, 'ftyp') && (s(8, 'heic') || s(8, 'heix') || s(8, 'mif1') || s(8, 'heif'))) return 'heic';
  return 'unknown';
}
// PDFs may have a few junk bytes before the header; accept "%PDF-" within the first 1 KB.
export async function sniffPdfLoose(file) {
  const t = await sniff(file);
  if (t === 'pdf') return true;
  const b = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const text = new TextDecoder('latin1').decode(b);
  return text.includes('%PDF-');
}

// ---- ranges: "1-3, 5, 8-" (1-based) -> 0-based indexes ----
export function parseGroups(str, max) {
  const out = [];
  const parts = String(str || '').split(/[,;\s]+/).filter(Boolean);
  if (!parts.length) throw new AppError('range', 'Enter at least one page or range, for example 1-3, 5.');
  for (const p of parts) {
    const m = /^(\d*)(?:-(\d*))?$/.exec(p);
    if (!m || (m[1] === '' && (m[2] === undefined || m[2] === ''))) throw new AppError('range', `"${p}" is not a valid page or range. Use numbers like 3 or 2-6.`);
    let a, b;
    if (m[2] === undefined) { a = b = parseInt(m[1], 10); }
    else { a = m[1] === '' ? 1 : parseInt(m[1], 10); b = m[2] === '' ? max : parseInt(m[2], 10); }
    if (a < 1 || b < 1 || a > max || b > max) throw new AppError('range', `Page ${a > max || a < 1 ? a : b} is outside this document, which has ${plural(max, 'page')}.`);
    if (a > b) throw new AppError('range', `The range ${p} runs backwards. Write it as ${b}-${a}.`);
    const g = []; for (let i = a; i <= b; i++) g.push(i - 1);
    out.push(g);
  }
  return out;
}
export function parseIndexes(str, max) {
  const seen = new Set(); const res = [];
  for (const g of parseGroups(str, max)) for (const i of g) if (!seen.has(i)) { seen.add(i); res.push(i); }
  return res.sort((a, b) => a - b);
}
export function toRanges(indexes) {
  const s = [...indexes].sort((a, b) => a - b); const out = []; let i = 0;
  while (i < s.length) { let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++; out.push(i === j ? `${s[i] + 1}` : `${s[i] + 1}-${s[j] + 1}`); i = j + 1; }
  return out.join(', ');
}

// ---- output + download ----
export const pdfBlob = bytes => new Blob([bytes], { type: 'application/pdf' });
// Inside the Wix HTML embed the iframe sandbox has no "allow-downloads", so the browser blocks a normal
// save. When embedded on ecomswiftllc.com the file bytes are handed to the host page (same device, never a
// server), whose site script saves them. If the host does not answer within 2.5 s we fall back to a normal save.
let hostOrigin = '';
export function setHost(origin) { hostOrigin = origin || ''; }
function nativeSave(url, filename) {
  const a = h('a', { href: url, download: filename, rel: 'noopener', style: 'display:none' });
  document.body.append(a); a.click();
  setTimeout(() => { a.remove(); }, 0);
}
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  if (hostOrigin && window.parent && window.parent !== window) {
    const id = Math.random().toString(36).slice(2);
    let acked = false;
    const onMsg = e => {
      const d = e.data;
      if (e.source === window.parent && d && d.source === 'pdf-toolkit-host' && d.type === 'saved' && d.id === id) { acked = true; removeEventListener('message', onMsg); }
    };
    addEventListener('message', onMsg);
    blob.arrayBuffer().then(buf => {
      try { window.parent.postMessage({ source: 'pdf-toolkit', type: 'save', id, name: filename, mime: blob.type, buffer: buf }, hostOrigin, [buf]); } catch (e) { /* fall back below */ }
    });
    setTimeout(() => { removeEventListener('message', onMsg); if (!acked) nativeSave(url, filename); }, 2500);
    return url;
  }
  nativeSave(url, filename);
  return url; // caller may keep it for the "open in new tab" fallback, then revoke
}

// ---- events to the host page (no file names or contents, ever) ----
export function emit(type, data) {
  try { if (window.parent && window.parent !== window) window.parent.postMessage({ source: 'pdf-toolkit', type, ...data }, '*'); } catch (e) { /* ignore */ }
}
export function announce(msg) { const l = ROOT.querySelector('#live'); if (l) { l.textContent = ''; setTimeout(() => { l.textContent = msg; }, 30); } }
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const tick = () => new Promise(r => setTimeout(r, 0)); // let the UI paint between heavy steps
