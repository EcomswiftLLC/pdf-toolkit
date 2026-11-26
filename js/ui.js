// Shared building blocks for "live" tools (text, calculators, QR). Everything returns plain DOM nodes styled by css/live.css.
// Rules: every control gets a real <label>, errors go in role="alert" lines, results are announced politely, nothing is sent anywhere.
import { h, icon, saveBlob, announce, emit } from './core.js';

let n = 0;
export const uid = p => `${p || 'f'}${++n}`;
export const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export { h, icon, announce, saveBlob, emit };

// ---- a panel (white card) with an optional heading ----
export function panel(title, ...kids) {
  return h('section', { class: 'card panel lt-panel', 'aria-label': title || false }, title ? h('h2', {}, title) : null, ...kids);
}

// ---- inputs. Each returns { el, input, get(), set(v), error(msg), clear() } ----
function wrap(label, id, ctl, o, input, get, set) {
  const err = h('p', { class: 'err-t', id: id + '_e', role: 'alert' });
  const el = h('div', { class: 'opt lt-field' + (o.class ? ' ' + o.class : ''), 'data-key': o.key || false },
    label ? h('label', { class: 't', for: id }, label) : null, ctl,
    o.help ? h('p', { class: 'help', id: id + '_h' }, o.help) : null, err);
  return {
    el, input, get, set,
    error(msg) { err.textContent = msg || ''; input.classList.toggle('invalid', !!msg); if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); },
    clear() { this.error(''); },
  };
}
// type: text | number | date | email | url | tel | password | search ; prefix/suffix are small text/currency affixes
export function field(o = {}) {
  const id = o.id || uid('in');
  const input = h('input', {
    id, class: 'field', type: o.type || 'text', value: o.value ?? '', placeholder: o.placeholder, min: o.min, max: o.max, step: o.step,
    inputmode: o.inputmode || (o.type === 'number' ? 'decimal' : false), maxlength: o.maxlength, autocomplete: o.autocomplete || 'off',
    'aria-describedby': (o.help ? id + '_h ' : '') + id + '_e', spellcheck: o.spellcheck === false ? 'false' : false, required: !!o.required,
  });
  let ctl = input;
  if (o.prefix || o.suffix) ctl = h('div', { class: 'affix' }, o.prefix ? h('span', { class: 'pre', 'aria-hidden': 'true' }, o.prefix) : null, input, o.suffix ? h('span', { class: 'suf', 'aria-hidden': 'true' }, o.suffix) : null);
  const f = wrap(o.label, id, ctl, o, input, () => input.value, v => { input.value = v ?? ''; });
  if (o.onInput) input.addEventListener('input', () => o.onInput(input.value, f));
  f.num = () => { const v = input.value.trim().replace(/,/g, ''); return v === '' ? NaN : Number(v); };
  return f;
}
export function textarea(o = {}) {
  const id = o.id || uid('ta');
  const input = h('textarea', {
    id, class: 'field area' + (o.mono ? ' mono' : ''), rows: o.rows || 8, placeholder: o.placeholder, spellcheck: o.spellcheck === false ? 'false' : false,
    readonly: !!o.readonly, 'aria-describedby': (o.help ? id + '_h ' : '') + id + '_e', maxlength: o.maxlength, wrap: o.nowrap ? 'off' : false,
  });
  input.value = o.value ?? '';
  const f = wrap(o.label, id, input, o, input, () => input.value, v => { input.value = v ?? ''; });
  if (o.onInput) input.addEventListener('input', () => o.onInput(input.value, f));
  return f;
}
export function select(o = {}) {
  const id = o.id || uid('sel');
  const input = h('select', { id, class: 'field', 'aria-describedby': (o.help ? id + '_h ' : '') + id + '_e' }, o.choices.map(c => h('option', { value: c.v, selected: c.v === o.value }, c.t)));
  const f = wrap(o.label, id, input, o, input, () => input.value, v => { input.value = v; });
  if (o.onInput) input.addEventListener('change', () => o.onInput(input.value, f));
  return f;
}
// segmented radio buttons, same look as the PDF tools' options
export function seg(o = {}) {
  const id = o.id || uid('seg'); let cur = o.value ?? o.choices[0].v;
  const help = h('p', { class: 'help', id: id + '_h' });
  const upd = () => { const c = o.choices.find(c => c.v === cur); help.textContent = (c && c.d) || o.help || ''; };
  const radios = [];
  const box = h('div', { class: 'seg' }, o.choices.map(c => {
    const r = h('input', { type: 'radio', name: id, value: c.v, checked: c.v === cur });
    r.addEventListener('change', () => { cur = c.v; upd(); if (o.onInput) o.onInput(cur, api); });
    radios.push(r);
    return h('label', {}, r, h('span', {}, c.t));
  }));
  const el = h('fieldset', { class: 'opt lt-field lt-seg' + (o.class ? ' ' + o.class : '') }, h('legend', { class: 't' }, o.label || ''), box, help);
  upd();
  const api = { el, get: () => cur, set(v) { cur = v; radios.forEach(r => { r.checked = r.value === v; }); upd(); }, error() {}, clear() {} };
  return api;
}
export function check(o = {}) {
  const id = o.id || uid('ck');
  const input = h('input', { type: 'checkbox', id, checked: !!o.value });
  const el = h('div', { class: 'opt lt-field lt-check' }, h('label', {}, input, h('span', {}, o.label)), o.help ? h('p', { class: 'help' }, o.help) : null);
  if (o.onInput) input.addEventListener('change', () => o.onInput(input.checked));
  return { el, input, get: () => input.checked, set(v) { input.checked = !!v; }, error() {}, clear() {} };
}
export function range(o = {}) {
  const id = o.id || uid('rg');
  const out = h('output', { class: 'rg-v', for: id }, String(o.value));
  const input = h('input', { id, type: 'range', class: 'rg', min: o.min, max: o.max, step: o.step || 1, value: o.value });
  const fmt = o.format || (v => v);
  const sync = () => { out.textContent = fmt(Number(input.value)); };
  input.addEventListener('input', () => { sync(); if (o.onInput) o.onInput(Number(input.value)); });
  sync();
  const f = wrap(null, id, h('div', { class: 'rgrow' }, input, out), o, input, () => Number(input.value), v => { input.value = v; sync(); });
  if (o.label) f.el.prepend(h('label', { class: 't', for: id }, o.label));
  return f;
}
export const row = (...kids) => h('div', { class: 'row2' }, ...kids.map(k => (k && k.el) || k));
export const stack = (...kids) => h('div', { class: 'lt-stack' }, ...kids.map(k => (k && k.el) || k));

// ---- results ----
// stats: [{ label, value, hint?, big? }] -> responsive grid of tiles. Update with setStats(el, list).
export function stats(list = []) { const el = h('dl', { class: 'stats' }); setStats(el, list); return el; }
export function setStats(el, list) {
  el.replaceChildren(...list.map(s => h('div', { class: 'stat' + (s.big ? ' big' : '') }, h('dt', {}, s.label), h('dd', {}, String(s.value), s.hint ? h('span', { class: 'sh' }, s.hint) : null))));
}
// A highlighted single answer ("Your BMI is 22.4")
export function answer(label, value, sub) {
  const v = h('div', { class: 'ans-v' }, value), l = h('div', { class: 'ans-l' }, label), s = h('div', { class: 'ans-s' }, sub || '');
  const el = h('div', { class: 'answer', role: 'status' }, l, v, s);
  return { el, set(label2, value2, sub2) { l.textContent = label2; v.textContent = value2; s.textContent = sub2 || ''; el.classList.toggle('empty', value2 == null || value2 === ''); } };
}
export const note = (text, kind = 'info') => h('div', { class: 'alert ' + kind, role: kind === 'err' ? 'alert' : 'status' }, icon(kind === 'info' ? 'info' : 'alert'), h('div', { style: 'min-width:0' }, text));
export const empty = text => h('p', { class: 'lt-empty' }, text);

// ---- copy + download ----
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
  try {
    const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok;
  } catch (e) { return false; }
}
export function copyButton(getText, label = 'Copy', cls = 'btn btn-quiet btn-sm') {
  const b = h('button', { class: cls, type: 'button' }, icon('copy', 'sm'), label);
  b.addEventListener('click', async () => {
    const txt = typeof getText === 'function' ? getText() : getText;
    if (!txt) { announce('Nothing to copy yet.'); return; }
    const ok = await copyText(txt);
    b.replaceChildren(icon(ok ? 'check' : 'alert', 'sm'), ok ? 'Copied' : 'Copy failed');
    announce(ok ? 'Copied to clipboard.' : 'Could not copy. Select the text and copy it yourself.');
    setTimeout(() => b.replaceChildren(icon('copy', 'sm'), label), 1800);
  });
  return b;
}
export function downloadButton(getBlobOrText, filename, label = 'Download', mime = 'text/plain;charset=utf-8', cls = 'btn btn-quiet btn-sm') {
  const b = h('button', { class: cls, type: 'button' }, icon('download', 'sm'), label);
  b.addEventListener('click', () => {
    const v = typeof getBlobOrText === 'function' ? getBlobOrText() : getBlobOrText;
    if (!v) { announce('Nothing to download yet.'); return; }
    const blob = v instanceof Blob ? v : new Blob([v], { type: mime });
    saveBlob(blob, typeof filename === 'function' ? filename() : filename);
    emit('download', { count: 1 });
  });
  return b;
}
// A read-only result box with Copy (and optional Download) buttons.
export function outputBox(o = {}) {
  const ta = textarea({ label: o.label, rows: o.rows || 8, readonly: true, mono: o.mono, placeholder: o.placeholder, help: o.help });
  const bar = h('div', { class: 'lt-bar' }, copyButton(() => ta.get(), o.copyLabel || 'Copy result'), o.filename ? downloadButton(() => ta.get(), o.filename, 'Download .txt') : null);
  return { el: h('div', { class: 'lt-out' }, ta.el, bar), set: v => ta.set(v), get: () => ta.get(), ta };
}
// Debounced "live" wiring: call update() on any of the controls changing.
export function bind(controls, update, ms = 80) {
  const run = debounce(update, ms);
  for (const c of controls) { const i = c.input || (c.el && c.el.querySelector('input,textarea,select')); if (!i) continue; i.addEventListener('input', run); i.addEventListener('change', run); }
  return run;
}
export const fmtNum = (v, d = 2) => Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '';
export const fmtMoney = (v, cur = 'USD') => Number.isFinite(v) ? v.toLocaleString('en-US', { style: 'currency', currency: cur }) : '';
export const download = saveBlob;
