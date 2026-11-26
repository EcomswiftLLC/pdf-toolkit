// QR kit core: payload builders, encoder wrapper, color checks, vector geometry, PNG/SVG output.
// Pure functions where possible so they can be tested without the UI. No network, nothing stored.
import qrcode from '../../vendor/qr/qrcode.js';

const enc = new TextEncoder();
// The vendored encoder defaults to Latin-1; QR readers expect UTF-8 for anything outside ASCII.
qrcode.stringToBytes = s => Array.from(enc.encode(s));
export const utf8Length = s => enc.encode(s).length;

// ---------------------------------------------------------------- payloads
const WS = /\s/;
const KNOWN_SCHEMES = /^(mailto|tel|sms|smsto|mms|geo|wifi|bitcoin|facetime|market|skype|tg|whatsapp|urn|ftp|sftp|ssh|webcal|maps|intent|spotify|zoommtg|javascript|data|vbscript|file):/i;
const BLOCKED_SCHEMES = new Set(['javascript', 'data', 'vbscript', 'file']);

export function normaliseUrl(raw) {
  let s = (raw || '').trim();
  const out = { text: s, added: false, scheme: '', error: '', warnings: [] };
  if (!s) return out;
  if (WS.test(s)) { out.error = 'A web address cannot contain spaces. Remove them or write them as %20.'; return out; }
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || KNOWN_SCHEMES.test(s);
  if (!hasScheme) { s = 'https://' + s.replace(/^\/\//, ''); out.added = true; }
  const scheme = s.slice(0, s.indexOf(':')).toLowerCase();
  out.scheme = scheme; out.text = s;
  if (BLOCKED_SCHEMES.has(scheme)) { out.error = `Links that start with ${scheme}: are not supported. Use a normal web address that starts with https://.`; return out; }
  if (scheme === 'http' || scheme === 'https') {
    let u;
    try { u = new URL(s); } catch (e) { out.error = 'That does not look like a web address. Try something like https://example.com.'; return out; }
    if (!u.hostname) { out.error = 'That address has no website name. Try something like https://example.com.'; return out; }
    const host = u.hostname;
    if (!host.includes('.') && host !== 'localhost' && !host.startsWith('[')) out.warnings.push(`"${host}" has no dot, so it may not be a full web address. Check the spelling.`);
    if (host === 'localhost' || /^(127\.|10\.|192\.168\.)/.test(host)) out.warnings.push('This address only works on your own computer or network. Other people who scan it will not be able to open it.');
    if (scheme === 'http') out.warnings.push('This address starts with http, not https. Some browsers warn people before opening it.');
  } else {
    out.warnings.push(`This code opens a ${scheme}: link, not a web page. Check that your readers\u2019 phones can open it.`);
  }
  return out;
}

export const escWifi = s => String(s).replace(/([\\;,:"])/g, '\\$1');
const escVcard = s => String(s).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const oneLine = s => String(s).replace(/[\r\n]+/g, ' ').trim();

// RFC 6350 / RFC 2425 folding: no line longer than 75 octets, continuation lines start with one space, never split a character.
export function foldLine(line) {
  const out = []; let cur = '', bytes = 0;
  for (const ch of line) {
    const b = utf8Length(ch);
    if (bytes + b > 75) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

const EMAIL_RE = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/;
export const isEmail = s => EMAIL_RE.test(s);
export function cleanPhone(raw) {
  const s = String(raw || '').trim();
  const p = s.replace(/[\s().\-]/g, '');
  if (!/^\+?[0-9*#]+$/.test(p)) return { ok: false, value: '' };
  if (p.replace(/\D/g, '').length < 3) return { ok: false, value: '' };
  return { ok: true, value: p };
}
const encMailAddr = a => encodeURIComponent(a).replace(/%40/g, '@').replace(/%2B/g, '+');

// Every builder returns { status: 'empty' | 'invalid' | 'ok', payload, errors: {fieldKey: msg}, notes: [msg], hint }.
export const TYPES = {
  url: { label: 'Link', empty: 'Type a web address to create your code.' },
  text: { label: 'Text', empty: 'Type or paste some text to create your code.' },
  wifi: { label: 'Wi-Fi', empty: 'Enter your network name to create your code.' },
  vcard: { label: 'Contact', empty: 'Enter a name or organization to create your code.' },
  email: { label: 'Email', empty: 'Enter an email address to create your code.' },
  phone: { label: 'Phone', empty: 'Enter a phone number to create your code.' },
  sms: { label: 'SMS', empty: 'Enter a phone number to create your code.' },
};

const res = (status, payload = '', errors = {}, notes = []) => ({ status, payload, errors, notes });

export function buildPayload(type, v = {}) {
  switch (type) {
    case 'url': {
      if (!(v.url || '').trim()) return res('empty');
      const u = normaliseUrl(v.url);
      if (u.error) return res('invalid', '', { url: u.error });
      const notes = [...u.warnings];
      if (u.added) notes.unshift('We added https:// at the start for you.');
      return res('ok', u.text, {}, notes);
    }
    case 'text': {
      const t = v.text || '';
      if (!t.trim()) return res('empty');
      return res('ok', t);
    }
    case 'wifi': {
      const ssid = v.ssid || '', pass = v.password || '', sec = v.security || 'WPA';
      if (!ssid && !pass) return res('empty');
      const errors = {}, notes = [];
      if (!ssid) errors.ssid = 'Enter the network name exactly as it appears on your devices.';
      else if (utf8Length(ssid) > 32) errors.ssid = 'A Wi-Fi network name can be at most 32 bytes. Shorten it.';
      if (sec === 'WPA') {
        if (!pass) errors.password = 'Enter the Wi-Fi password.';
        else if ((pass.length < 8 || pass.length > 63) && !/^[0-9a-f]{64}$/i.test(pass)) errors.password = 'WPA passwords have 8 to 63 characters. Check the password.';
      } else if (sec === 'WEP') {
        if (!pass) errors.password = 'Enter the Wi-Fi password.';
        notes.push('WEP is an outdated security type. Use WPA if your router allows it.');
      } else notes.push('An open network has no password, so anyone who scans this code can join it.');
      if (Object.keys(errors).length) return res('invalid', '', errors);
      let p = 'WIFI:T:' + (sec === 'nopass' ? 'nopass' : sec) + ';S:' + escWifi(ssid) + ';';
      if (sec !== 'nopass') p += 'P:' + escWifi(pass) + ';';
      if (v.hidden) p += 'H:true;';
      return res('ok', p + ';', {}, notes);
    }
    case 'vcard': {
      const g = k => (v[k] || '').trim();
      const first = g('first'), last = g('last'), org = g('org'), title = g('title'), mobile = g('mobile'), work = g('work'), email = g('email'), site = g('site');
      const street = g('street'), city = g('city'), region = g('region'), zip = g('zip'), country = g('country');
      const any = [first, last, org, title, mobile, work, email, site, street, city, region, zip, country].some(Boolean);
      if (!any) return res('empty');
      const errors = {}, notes = [];
      if (!first && !last && !org) errors.first = 'Enter a first name, last name or organization.';
      let mob = '', wk = '', web = '';
      if (mobile) { const c = cleanPhone(mobile); if (!c.ok) errors.mobile = 'Use digits, and a + at the start for international numbers.'; else mob = mobile.replace(/[\r\n]+/g, ' '); }
      if (work) { const c = cleanPhone(work); if (!c.ok) errors.work = 'Use digits, and a + at the start for international numbers.'; else wk = work.replace(/[\r\n]+/g, ' '); }
      if (email && !isEmail(email)) errors.email = 'Enter a full email address, such as name@example.com.';
      if (site) { const u = normaliseUrl(site); if (u.error) errors.site = u.error; else web = u.text; }
      if (Object.keys(errors).length) return res('invalid', '', errors);
      const fn = [first, last].filter(Boolean).join(' ') || org;
      const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${escVcard(last)};${escVcard(first)};;;`, `FN:${escVcard(fn)}`];
      if (org) lines.push(`ORG:${escVcard(org)}`);
      if (title) lines.push(`TITLE:${escVcard(title)}`);
      if (mob) lines.push(`TEL;TYPE=CELL:${escVcard(mob)}`);
      if (wk) lines.push(`TEL;TYPE=WORK,VOICE:${escVcard(wk)}`);
      if (email) lines.push(`EMAIL;TYPE=INTERNET:${escVcard(email)}`);
      if (web) lines.push(`URL:${oneLine(web)}`);
      if (street || city || region || zip || country) lines.push(`ADR;TYPE=WORK:;;${[street, city, region, zip, country].map(escVcard).join(';')}`);
      lines.push('END:VCARD');
      return res('ok', lines.map(foldLine).join('\r\n'), {}, notes);
    }
    case 'email': {
      const to = (v.to || '').trim(), subject = v.subject || '', body = v.body || '';
      if (!to && !subject.trim() && !body.trim()) return res('empty');
      if (!to) return res('invalid', '', { to: 'Enter the email address the message should go to.' });
      const addrs = to.split(/\s*,\s*/).filter(Boolean);
      if (!addrs.length || !addrs.every(isEmail)) return res('invalid', '', { to: 'Enter a full email address, such as name@example.com. Separate several with commas.' });
      let p = 'mailto:' + addrs.map(encMailAddr).join(',');
      const q = [];
      if (subject) q.push('subject=' + encodeURIComponent(subject.replace(/\r\n|\r|\n/g, ' ')));
      if (body) q.push('body=' + encodeURIComponent(body.replace(/\r\n|\r|\n/g, '\r\n')));
      if (q.length) p += '?' + q.join('&');
      return res('ok', p);
    }
    case 'phone': {
      if (!(v.number || '').trim()) return res('empty');
      const c = cleanPhone(v.number);
      if (!c.ok) return res('invalid', '', { number: 'Use digits only, with a + at the start for international numbers, such as +14155550123.' });
      return res('ok', 'tel:' + c.value, {}, c.value.startsWith('+') ? [] : ['This number has no country code (+). It will only dial correctly from the same country.']);
    }
    case 'sms': {
      const num = (v.number || '').trim(), msg = v.message || '';
      if (!num && !msg.trim()) return res('empty');
      const c = cleanPhone(num);
      if (!c.ok) return res('invalid', '', { number: 'Use digits only, with a + at the start for international numbers, such as +14155550123.' });
      const notes = [];
      let p;
      if ((v.format || 'smsto') === 'sms') p = 'sms:' + c.value + (msg ? '?body=' + encodeURIComponent(msg) : '');
      else p = 'SMSTO:' + c.value + ':' + msg;
      if (!c.value.startsWith('+')) notes.push('This number has no country code (+). It will only work from the same country.');
      return res('ok', p, {}, notes);
    }
    default: return res('empty');
  }
}

// ---------------------------------------------------------------- color + contrast
export function normHex(s) {
  let t = String(s || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(t)) t = t.split('').map(c => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(t) ? '#' + t.toLowerCase() : null;
}
const chan = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * chan((n >> 16) & 255) + 0.7152 * chan((n >> 8) & 255) + 0.0722 * chan(n & 255);
}
export function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
// Scan-risk checks. Each returned item blocks the download until the user ticks the acknowledgement.
export function scanRisks({ fg, bg, margin }) {
  const risks = [];
  const ratio = contrastRatio(fg, bg);
  const inverted = luminance(fg) > luminance(bg);
  if (inverted) risks.push({ id: 'inverted', text: 'The code is lighter than its background. Many scanners only read dark codes on a light background, so this one may not scan.' });
  if (ratio < 3) risks.push({ id: 'contrast', text: `The contrast between the code and its background is ${ratio.toFixed(1)}:1. Below 3:1 many cameras struggle to read it. Pick a darker code color or a lighter background.` });
  if (margin < 4) risks.push({ id: 'margin', text: `The empty border is ${margin} ${margin === 1 ? 'square' : 'squares'} wide. The standard asks for at least 4, and codes with less often fail to scan.` });
  return { risks, ratio, inverted };
}

// ---------------------------------------------------------------- encoder
const CAP_BYTES = { L: 2953, M: 2331, Q: 1663, H: 1273 }; // version 40, byte mode
export const LEVELS = ['L', 'M', 'Q', 'H'];
const modeOf = s => /^[0-9]+$/.test(s) ? 'Numeric' : /^[0-9A-Z $%*+\-./:]+$/.test(s) ? 'Alphanumeric' : 'Byte';

function make(text, level, version) {
  const q = qrcode(version, level);
  q.addData(text, modeOf(text));
  q.make();
  return q;
}
// -> { ok: true, n, version, level, mat } or { ok: false, bytes, fits: [levels], max }
export function encode(text, level = 'M', minVersion = 1) {
  let q = null;
  try { q = make(text, level, 0); } catch (e) { q = null; }
  if (!q) {
    const fits = LEVELS.filter(l => { try { make(text, l, 0); return true; } catch (e) { return false; } });
    return { ok: false, bytes: utf8Length(text), fits, max: CAP_BYTES[level], level };
  }
  let n = q.getModuleCount();
  if (minVersion > 1 && (n - 17) / 4 < minVersion) { try { q = make(text, level, minVersion); n = q.getModuleCount(); } catch (e) { /* keep the smaller one */ } }
  const mat = [];
  for (let r = 0; r < n; r++) { const row = new Uint8Array(n); for (let c = 0; c < n; c++) row[c] = q.isDark(r, c) ? 1 : 0; mat.push(row); }
  return { ok: true, n, version: (n - 17) / 4, level, mat };
}

// ---------------------------------------------------------------- geometry
const f = x => String(Math.round(x * 1000) / 1000);
function rrect(x, y, w, h, [tl, tr, br, bl]) {
  let d = `M${f(x + tl)} ${f(y)}H${f(x + w - tr)}`;
  if (tr) d += `A${f(tr)} ${f(tr)} 0 0 1 ${f(x + w)} ${f(y + tr)}`;
  d += `V${f(y + h - br)}`;
  if (br) d += `A${f(br)} ${f(br)} 0 0 1 ${f(x + w - br)} ${f(y + h)}`;
  d += `H${f(x + bl)}`;
  if (bl) d += `A${f(bl)} ${f(bl)} 0 0 1 ${f(x)} ${f(y + h - bl)}`;
  d += `V${f(y + tl)}`;
  if (tl) d += `A${f(tl)} ${f(tl)} 0 0 1 ${f(x + tl)} ${f(y)}`;
  return d + 'Z';
}
const circle = (cx, cy, r) => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;

export const STYLES = ['square', 'rounded', 'dots'];
// Logo clear box in modules: odd size about 20% of the width (about 4% of the area), centerd. Needs level H.
export function logoBox(n) {
  const k = 2 * Math.floor((0.2 * n) / 2) + 1;
  const s = Math.floor((n - k) / 2);
  return { x: s, y: s, k };
}

// Centres of the alignment patterns (ISO/IEC 18004 Annex E), computed from the version.
export function alignmentCentres(n) {
  const ver = (n - 17) / 4; if (ver < 2) return [];
  const num = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.floor((ver * 4 + num * 2 + 1) / (num * 2 - 2)) * 2;
  const pos = [6]; for (let i = num - 2; i >= 0; i--) pos.push(n - 7 - i * step);
  const out = [], last = pos.length - 1;
  pos.forEach((r, i) => pos.forEach((c, j) => { if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return; out.push([r, c]); }));
  return out;
}

// Path of every dark module (the three finder squares are drawn separately and stay square). Coordinates are in modules, no margin. Fill with evenodd.
export function buildPath({ n, mat, style = 'square', box = null }) {
  const isFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const inBox = (r, c) => box && r >= box.y && r < box.y + box.k && c >= box.x && c < box.x + box.k;
  const aligns = style === 'square' ? [] : alignmentCentres(n);
  const isAlign = (r, c) => aligns.some(([ar, ac]) => Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2);
  const dark = (r, c) => r >= 0 && c >= 0 && r < n && c < n && mat[r][c] === 1 && !isFinder(r, c) && !isAlign(r, c) && !inBox(r, c);
  let d = '';
  // The three large corner squares stay exact squares in every style: scanners look for them first.
  for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) d += `M${fx} ${fy}h7v7h-7zM${fx + 1} ${fy + 1}h5v5h-5zM${fx + 2} ${fy + 2}h3v3h-3z`;
  for (const [ar, ac] of aligns) if (!inBox(ar, ac)) d += `M${ac - 2} ${ar - 2}h5v5h-5zM${ac - 1} ${ar - 1}h3v3h-3zM${ac} ${ar}h1v1h-1z`;
  if (style === 'square') {
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!dark(r, c)) { c++; continue; }
        let e = c; while (e < n && dark(r, e)) e++;
        d += `M${c} ${r}h${e - c}v1h${c - e}z`; c = e;
      }
    }
  } else if (style === 'dots') {
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (dark(r, c)) d += circle(c + 0.5, r + 0.5, 0.44);
  } else {
    const R = 0.38;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (!dark(r, c)) continue;
      const up = dark(r - 1, c), dn = dark(r + 1, c), lf = dark(r, c - 1), rt = dark(r, c + 1);
      d += rrect(c, r, 1, 1, [!up && !lf ? R : 0, !up && !rt ? R : 0, !dn && !rt ? R : 0, !dn && !lf ? R : 0]);
    }
  }
  return d;
}

// A render model: { n, mat, style, fg, bg, margin, logo: { canvas, dataUrl } | null }
const geom = (m, px) => {
  const M = m.n + 2 * m.margin;
  const cell = Math.max(1, Math.floor(px / M));
  const side = cell * M;
  return { M, cell, off: Math.floor((px - side) / 2) };
};
export const cellSizeFor = (m, px) => geom(m, px).cell;

function logoRect(m) {
  const b = logoBox(m.n);
  const inset = 0.06 * b.k;
  return { x: b.x + inset, y: b.y + inset, w: b.k - 2 * inset, h: b.k - 2 * inset };
}
function fitInto(srcW, srcH, r) {
  const s = Math.min(r.w / srcW, r.h / srcH);
  const w = srcW * s, h = srcH * s;
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

// Draw onto a canvas of exactly px x px. Each module is a whole number of pixels, so edges stay sharp.
export function drawCanvas(canvas, m, px) {
  const g = geom(m, px);
  canvas.width = px; canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = m.bg; ctx.fillRect(0, 0, px, px);
  ctx.setTransform(g.cell, 0, 0, g.cell, g.off + m.margin * g.cell, g.off + m.margin * g.cell);
  ctx.fillStyle = m.fg;
  ctx.fill(new Path2D(buildPath({ n: m.n, mat: m.mat, style: m.style, box: m.logo ? logoBox(m.n) : null })), 'evenodd');
  if (m.logo) {
    const l = fitInto(m.logo.canvas.width, m.logo.canvas.height, logoRect(m));
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(m.logo.canvas, l.x, l.y, l.w, l.h);
  }
  return canvas;
}

export function toSvg(m, px) {
  const M = m.n + 2 * m.margin;
  const d = buildPath({ n: m.n, mat: m.mat, style: m.style, box: m.logo ? logoBox(m.n) : null });
  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="${px}" height="${px}" viewBox="0 0 ${M} ${M}" role="img" aria-label="QR code"${m.style === 'square' ? ' shape-rendering="crispEdges"' : ''}>\n`;
  svg += `<rect width="${M}" height="${M}" fill="${m.bg}"/>\n<path transform="translate(${m.margin} ${m.margin})" fill="${m.fg}" fill-rule="evenodd" d="${d}"/>\n`;
  if (m.logo) {
    const l = fitInto(m.logo.canvas.width, m.logo.canvas.height, logoRect(m));
    svg += `<image x="${f(l.x + m.margin)}" y="${f(l.y + m.margin)}" width="${f(l.w)}" height="${f(l.h)}" preserveAspectRatio="xMidYMid meet" xlink:href="${m.logo.dataUrl}"/>\n`;
  }
  return svg + '</svg>\n';
}

export const toPngBlob = (m, px) => new Promise((resolve, reject) => {
  const c = document.createElement('canvas');
  drawCanvas(c, m, px);
  c.toBlob(b => b ? resolve(b) : reject(new Error('png')), 'image/png');
});

// ---------------------------------------------------------------- logo
// Reads a picture the user chose, shrinks a copy to at most 256 px and returns { canvas, dataUrl }. Nothing leaves the device.
export async function prepareLogo(file) {
  if (!file) throw new Error('No file.');
  if (file.size > 5 * 1024 * 1024) throw new Error('That picture is larger than 5 MB. Choose a smaller one.');
  if (file.type && !/^image\//.test(file.type)) throw new Error('Choose a picture file, such as PNG, JPG, WebP or SVG.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('That file could not be read as a picture. Try a PNG or JPG.')); i.src = url; });
    const w = img.naturalWidth || 256, h = img.naturalHeight || 256;
    const s = Math.min(1, 256 / Math.max(w, h)) || 1;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return { canvas: c, dataUrl: c.toDataURL('image/png') };
  } finally { URL.revokeObjectURL(url); }
}
