// Shared UI pieces for the text kit. Built on js/ui.js. Never inserts user text as HTML (DOM text nodes and .value only).
import { countGraphemes } from './text-lib.js';
import { h, icon, panel, textarea, copyButton, downloadButton, announce, debounce, outputBox, stats, setStats as baseSetStats } from '../ui.js';

export { h, icon, panel, announce, debounce, outputBox, stats, copyButton, downloadButton };

// Same as ui.js setStats, but a hint goes inside the dd so the dl only holds dt and dd (valid list markup).
export function setStats(el, list) {
  baseSetStats(el, list);
  for (const p of el.querySelectorAll('p.sh')) { const dd = p.parentNode.querySelector('dd'); dd.append(h('span', { class: 'sh' }, p.textContent)); p.remove(); }
}

// "1,234" style numbers
export const num = n => Number(n).toLocaleString('en-US');
export const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : (many || one + 's')}`;
// longer input -> wait a little more before recomputing, so a 1 MB paste never makes typing stutter
export const waitFor = len => (len > 400000 ? 500 : len > 100000 ? 300 : 120);

// Text area panel with a Clear button and a small size line. onChange(text) runs debounced and once at start.
export function textPanel(o = {}) {
  const ta = textarea({ id: o.id, label: o.label || 'Text', placeholder: o.placeholder || 'Paste or type your text here', rows: o.rows || 10, spellcheck: o.spellcheck === true ? undefined : false });
  const meta = h('p', { class: 'text-meta' });
  const clear = h('button', { class: 'btn btn-quiet btn-sm', type: 'button' }, icon('x', 'sm'), o.clearLabel || 'Clear');
  const bar = h('div', { class: 'lt-bar' }, clear, ...(o.actions || []));
  let timer = null;
  // same count the Characters tile shows (what you see: an emoji is one), so the two never disagree
  const size = v => { meta.textContent = v ? `${num(countGraphemes(v))} characters in the box` : ''; };
  const fire = () => { clearTimeout(timer); const v = ta.get(); if (v.length > 50000) size(v); o.onChange && o.onChange(v); };
  const sync = () => {
    const v = ta.get();
    if (v.length <= 50000) size(v);
    clear.disabled = !v;
    clearTimeout(timer); timer = setTimeout(fire, waitFor(v.length));
  };
  ta.input.addEventListener('input', sync);
  clear.addEventListener('click', () => { ta.set(''); sync(); fire(); ta.input.focus(); announce('Text cleared.'); });
  const el = panel(o.title === undefined ? 'Your text' : o.title, ta.el, meta, bar);
  clear.disabled = true;
  return { el, ta, input: ta.input, get: () => ta.get(), set(v) { ta.set(v); sync(); fire(); }, bar, refresh: fire, sync };
}

// A labelled row of toggle buttons (aria-pressed), used by the case converter
export function toggleGroup(label, choices, onPick) {
  const btns = choices.map(c => {
    const b = h('button', { class: 'btn btn-quiet text-tgl', type: 'button', 'aria-pressed': 'false', 'data-v': c.v }, c.t);
    b.addEventListener('click', () => onPick(c.v));
    return b;
  });
  const el = h('div', { class: 'text-tgl-grid', role: 'group', 'aria-label': label }, btns);
  return { el, set(v) { btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v))); } };
}

// A short grey explanation under a panel
export const hint = (...kids) => h('p', { class: 'text-hint' }, ...kids);

// Result summary: "N changes" line that screen readers hear when text changes on blur
export function announceOnBlur(el, fn) { el.addEventListener('change', () => announce(fn())); }

// Read-only result area with Copy, Download .txt and any extra buttons
export function resultBox(o = {}) {
  const ta = textarea({ id: o.id, label: o.label || 'Result', rows: o.rows || 10, readonly: true, placeholder: o.placeholder, spellcheck: false, mono: o.mono });
  const bar = h('div', { class: 'lt-bar' }, copyButton(() => ta.get(), o.copyLabel || 'Copy result'), o.filename ? downloadButton(() => ta.get(), o.filename, 'Download .txt') : null, ...(o.extra || []));
  return { el: h('div', { class: 'lt-out' }, ta.el, bar), ta, bar, set: v => ta.set(v), get: () => ta.get() };
}
