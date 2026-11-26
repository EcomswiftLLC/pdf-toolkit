// Reads the text inside a QR code and works out what it is (link, Wi-Fi, contact, ...). Pure functions, no DOM.
// describe(text) -> { kind, label, fields: [{ k, v, secret? }], url?: string, unsafe?: string, note?: string }

// Split "KEY:value;KEY:value;;" (Wi-Fi / MeCard style) honouring backslash escapes.
function pairs(body) {
  const out = []; let key = '', val = '', raw = '', inVal = false, i = 0;
  const push = () => { if (key || val) out.push([key, val, raw]); key = val = raw = ''; inVal = false; };
  while (i < body.length) {
    const ch = body[i];
    if (ch === '\\' && i + 1 < body.length) { if (inVal) { val += body[i + 1]; raw += ch + body[i + 1]; } else key += body[i + 1]; i += 2; continue; }
    if (ch === ';') { push(); i++; continue; }
    if (ch === ':' && !inVal) { inVal = true; i++; continue; }
    if (inVal) { val += ch; raw += ch; } else key += ch;
    i++;
  }
  push();
  return out;
}
const unq = (v, raw) => (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"' && raw[0] !== '\\') ? v.slice(1, -1) : v;

function wifi(t) {
  const m = { T: '', S: '', P: '', H: '' };
  for (const [k, v, raw] of pairs(t.slice(5))) if (k.toUpperCase() in m) m[k.toUpperCase()] = unq(v, raw);
  const sec = /^nopass$/i.test(m.T) || !m.T && !m.P ? 'None (open network)' : m.T || 'Not stated';
  const fields = [{ k: 'Network name', v: m.S }, { k: 'Security', v: sec }];
  if (m.P) fields.push({ k: 'Password', v: m.P, secret: true });
  fields.push({ k: 'Hidden network', v: /^true$/i.test(m.H) ? 'Yes' : 'No' });
  return { kind: 'wifi', label: 'Wi-Fi network', fields, copy: m.P ? { label: 'Copy password', text: m.P } : null, note: 'Your phone usually asks before joining the network. Only join networks you trust.' };
}

const unfold = s => s.replace(/\r?\n[ \t]/g, '');
const splitUnescaped = (s, sep) => { const out = []; let cur = ''; for (let i = 0; i < s.length; i++) { if (s[i] === '\\' && i + 1 < s.length) { cur += s[i] + s[i + 1]; i++; } else if (s[i] === sep) { out.push(cur); cur = ''; } else cur += s[i]; } out.push(cur); return out; };
const unescV = s => s.replace(/\\([nN,;\\])/g, (_, c) => c === 'n' || c === 'N' ? '\n' : c);

function vcard(t) {
  const lines = unfold(t).split(/\r?\n/);
  const f = [], get = {};
  let name = '', org = '', title = '';
  for (const line of lines) {
    const i = line.indexOf(':'); if (i < 1) continue;
    const head = line.slice(0, i).split(';'), val = line.slice(i + 1);
    const prop = head[0].replace(/^.*\./, '').toUpperCase();
    const types = head.slice(1).join(' ').replace(/TYPE=/gi, '').replace(/[,;]/g, ' ').trim().toLowerCase();
    const parts = splitUnescaped(val, ';').map(unescV);
    if (prop === 'FN') name = parts.join(';');
    else if (prop === 'N' && !name) name = [parts[3], parts[1], parts[2], parts[0], parts[4]].filter(Boolean).join(' ');
    else if (prop === 'ORG') org = parts.filter(Boolean).join(', ');
    else if (prop === 'TITLE') title = parts.join(';');
    else if (prop === 'TEL') f.push({ k: 'Phone' + (types ? ` (${types})` : ''), v: parts.join(';') });
    else if (prop === 'EMAIL') f.push({ k: 'Email', v: parts.join(';') });
    else if (prop === 'URL') f.push({ k: 'Website', v: val });
    else if (prop === 'ADR') f.push({ k: 'Address', v: parts.filter(Boolean).join(', ') });
    else if (prop === 'NOTE') f.push({ k: 'Note', v: parts.join(';') });
    else if (prop === 'BDAY') f.push({ k: 'Birthday', v: val });
  }
  const fields = [];
  if (name) fields.push({ k: 'Name', v: name });
  if (org) fields.push({ k: 'Organization', v: org });
  if (title) fields.push({ k: 'Job title', v: title });
  fields.push(...f);
  return { kind: 'vcard', label: 'Contact card', fields, note: 'Your phone will show the details and ask before saving them to your contacts.' };
}

function mecard(t) {
  const fields = [];
  const map = { N: 'Name', TEL: 'Phone', EMAIL: 'Email', URL: 'Website', ADR: 'Address', ORG: 'Organization', NOTE: 'Note', BDAY: 'Birthday' };
  for (const [k, v] of pairs(t.slice(7))) {
    const K = k.toUpperCase(); if (!map[K] || !v) continue;
    fields.push({ k: map[K], v: K === 'N' ? v.split(',').reverse().join(' ').trim() : K === 'ADR' ? v.split(',').filter(Boolean).join(', ') : v });
  }
  return { kind: 'vcard', label: 'Contact card (MeCard)', fields, note: 'Your phone will show the details and ask before saving them to your contacts.' };
}

const dec = s => { try { return decodeURIComponent(s.replace(/\+/g, '%2B')); } catch (e) { return s; } };
function mailto(t) {
  const body = t.slice(7), q = body.indexOf('?');
  const to = dec(q < 0 ? body : body.slice(0, q));
  const fields = [{ k: 'To', v: to }];
  if (q >= 0) for (const part of body.slice(q + 1).split('&')) {
    const e = part.indexOf('='); if (e < 1) continue;
    const k = part.slice(0, e).toLowerCase(), v = dec(part.slice(e + 1));
    if (k === 'cc') fields.push({ k: 'Cc', v }); else if (k === 'bcc') fields.push({ k: 'Bcc', v }); else if (k === 'subject') fields.push({ k: 'Subject', v }); else if (k === 'body') fields.push({ k: 'Message', v });
  }
  return { kind: 'email', label: 'Email', fields, note: 'Scanning this opens a new email in your mail app. Nothing is sent until you press send.' };
}
function matmsg(t) {
  const m = {}; for (const [k, v] of pairs(t.slice(7))) m[k.toUpperCase()] = v;
  const fields = [{ k: 'To', v: m.TO || '' }]; if (m.SUB) fields.push({ k: 'Subject', v: m.SUB }); if (m.BODY) fields.push({ k: 'Message', v: m.BODY });
  return { kind: 'email', label: 'Email', fields, note: 'Scanning this opens a new email in your mail app. Nothing is sent until you press send.' };
}
function tel(t) { return { kind: 'phone', label: 'Phone number', fields: [{ k: 'Number', v: dec(t.slice(4)) }], note: 'Scanning this usually offers to call the number. Check it first.' }; }
function sms(t) {
  const scheme = t.slice(0, t.indexOf(':')).toLowerCase(); const rest = t.slice(scheme.length + 1);
  let num, msg = '';
  if (scheme === 'smsto' || scheme === 'mmsto') { const i = rest.indexOf(':'); num = i < 0 ? rest : rest.slice(0, i); msg = i < 0 ? '' : rest.slice(i + 1); }
  else { const q = rest.indexOf('?'); num = q < 0 ? rest : rest.slice(0, q); if (q >= 0) for (const p of rest.slice(q + 1).split('&')) if (/^body=/i.test(p)) msg = dec(p.slice(5)); }
  const fields = [{ k: 'To', v: dec(num) }]; if (msg) fields.push({ k: 'Message', v: msg });
  return { kind: 'sms', label: 'Text message', fields, note: 'Scanning this opens a new text message. Nothing is sent until you press send.' };
}

function link(t) {
  let u; try { u = new URL(t); } catch (e) { return null; }
  const host = u.hostname;
  const fields = [{ k: 'Website name', v: host.replace(/^www\./, '') }];
  const odd = /[^\x00-\x7f]/.test(t.split('/')[2] || '') || /(^|\.)xn--/i.test(host);
  return { kind: 'url', label: 'Web link', fields, url: u.href, idn: odd, host };
}

export function describe(text) {
  const t = String(text ?? '');
  const s = t.trim();
  if (/^WIFI:/i.test(s)) return wifi(s);
  if (/^BEGIN:VCARD/i.test(s)) return vcard(s);
  if (/^MECARD:/i.test(s)) return mecard(s);
  if (/^mailto:/i.test(s)) return mailto(s);
  if (/^MATMSG:/i.test(s)) return matmsg(s);
  if (/^tel:/i.test(s)) return tel(s);
  if (/^(smsto|sms|mmsto|mms):/i.test(s)) return sms(s);
  if (/^(javascript|data|vbscript):/i.test(s)) return { kind: 'unsafe', label: 'Script or data address', fields: [], unsafe: 'This code holds a script or data address, not a web page. Do not run it. Treat the code as untrusted.' };
  if (/^https?:\/\/\S+$/i.test(s)) { const l = link(s); if (l) return l; }
  if (/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(s)) return { kind: 'link-other', label: 'Link (not a web page)', fields: [{ k: 'Address', v: s }], note: 'This is not a normal web address, so no open button is shown. Copy it if you know what it is for.' };
  if (/^geo:/i.test(s)) { const [ll] = s.slice(4).split(/[?;]/); return { kind: 'geo', label: 'Location', fields: [{ k: 'Coordinates', v: ll.replace(',', ', ') }] }; }
  return { kind: 'text', label: 'Plain text', fields: [] };
}
