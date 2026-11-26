// Calculators kit: shared UI pieces built on ../ui.js. Classes are prefixed calc- (see css/kit-calc.css).
import { h, icon, field, select, panel, bind, debounce, announce } from '../ui.js';
import { parseNumInput, CURRENCIES, symOf } from './calc-lib.js';

export { h, icon, panel, bind, debounce, announce };

// ---- number field: accepts commas and decimals, shows the error at the field ----
// o: normal field options (label, prefix, suffix, help, value, placeholder) + parse options (name, min, max, minExcl, dp, int, neg)
export function nf(o) {
  const { name, neg, min, max, minExcl, dp, int, ...fo } = o;
  const f = field({ ...fo, type: 'text', inputmode: int ? 'numeric' : 'decimal', spellcheck: false });
  // read(): { kind: 'empty' | 'bad' | 'ok', d? }. Updates the inline error.
  f.read = (over = {}) => {
    const r = parseNumInput(f.get(), { ...o, ...over });
    f.error(r.kind === 'bad' ? r.msg : '');
    return r;
  };
  f.setPrefix = t => { const p = f.el.querySelector('.pre'); if (p) p.textContent = t; };
  return f;
}
// currency picker (display only). onChange(symbol, code)
export function currencyPicker(onChange, value = 'USD') {
  const f = select({ label: 'Currency symbol', choices: CURRENCIES.map(c => ({ v: c.v, t: c.t })), value, help: 'Changes the symbol only. Amounts are not converted.', onInput: v => onChange(symOf(v), v) });
  f.sym = () => symOf(f.get());
  return f;
}

// ---- result tiles with stable hooks for tests (data-k) ----
export function results(list = []) { const el = h('dl', { class: 'stats calc-stats' }); setResults(el, list); return el; }
export function setResults(el, list) {
  el.replaceChildren(...list.filter(Boolean).map(s => h('div', { class: 'stat' + (s.big ? ' big' : ''), 'data-k': s.k || false },
    h('dt', {}, s.label), h('dd', {}, String(s.value)), s.hint ? h('dd', { class: 'sh' }, s.hint) : null)));
}
// A big answer that is announced politely when it changes (role=status lives on the element)
export function bigAnswer() {
  const l = h('div', { class: 'ans-l' }), v = h('div', { class: 'ans-v', 'data-k': 'answer' }), s = h('div', { class: 'ans-s' });
  const el = h('div', { class: 'answer calc-answer empty', role: 'status' }, l, v, s);
  return { el, set(label, value, sub) { l.textContent = label; v.textContent = value ?? ''; s.textContent = sub || ''; el.classList.toggle('empty', value == null || value === ''); } };
}
export const hint = text => h('p', { class: 'lt-note calc-hint' }, text);
export const calcNote = (text, kind = 'info') => h('div', { class: 'alert ' + kind, role: kind === 'err' ? 'alert' : 'status' }, icon(kind === 'info' ? 'info' : 'alert'), h('div', { style: 'min-width:0' }, text));
// A box whose content the tool replaces. Polite live region.
export const liveBox = (cls = '') => h('div', { class: 'calc-live ' + cls, 'aria-live': 'polite' });

export function workbench(inputs, outputs) {
  return h('div', { class: 'lt-cols calc-cols' }, inputs, outputs);
}

// ---- data table with capped height + sticky header (keyboard scrollable) ----
export function dataTable({ label, columns, rows, left = [0] }) {
  const cls = i => (left.includes(i) ? 'l' : false);
  const head = h('tr', {}, columns.map((c, i) => h('th', { scope: 'col', class: cls(i) }, c)));
  const body = rows.map(r => h('tr', {}, r.map((c, i) => h('td', { class: cls(i) }, String(c)))));
  return h('div', { class: 'tbl-wrap calc-tbl', tabindex: '0', role: 'region', 'aria-label': label + '. Scroll to see more rows.' },
    h('table', { class: 'dt' }, h('caption', { class: 'sr' }, label), h('thead', {}, head), h('tbody', {}, body)));
}

// ---- SVG line chart with a visible text alternative ----
const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  for (const k of kids) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
};
export function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count, mag = 10 ** Math.floor(Math.log10(raw)), r = raw / mag;
  const step = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
  const out = []; for (let v = 0; v <= max + step * 0.999; v += step) { out.push(+v.toPrecision(12)); if (v >= max) break; }
  return out;
}
export const compact = (v, sym = '') => {
  const a = Math.abs(v);
  const f = (x, s) => sym + (+(x.toFixed(x >= 100 ? 0 : x >= 10 ? 1 : 2))).toString() + s;
  if (a >= 1e12) return f(v / 1e12, 'T'); if (a >= 1e9) return f(v / 1e9, 'B'); if (a >= 1e6) return f(v / 1e6, 'M'); if (a >= 1e3) return f(v / 1e3, 'K');
  return sym + (+v.toFixed(0)).toString();
};
// chart.set({ series: [{ name, pts: [[x,y],...], dash }], xLabel, xTickLabel(x), yLabel(v), caption })
export function lineChart(title) {
  const H = 290, L = 62, R = 16, T = 14, B = 44;
  let W = 600, last = null;
  const svg = sv('svg', { class: 'calc-chart-svg', role: 'img', focusable: 'false' });
  const cap = h('figcaption', { class: 'calc-chart-cap' });
  const legend = h('ul', { class: 'calc-legend' });
  const el = h('figure', { class: 'calc-chart' }, h('p', { class: 'sr calc-chart-title' }, title), svg, legend, cap);
  function draw() {
    const o = last; if (!o) return;
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('height', H);
    const all = o.series.flatMap(s => s.pts);
    const xMax = Math.max(...all.map(p => p[0]), 1), yMax = Math.max(...all.map(p => p[1]), 1);
    const yt = niceTicks(yMax, 4), yTop = yt[yt.length - 1];
    const X = x => L + (x / xMax) * (W - L - R), Y = y => T + (1 - y / yTop) * (H - T - B);
    for (const t of yt) {
      svg.append(sv('line', { x1: L, x2: W - R, y1: Y(t), y2: Y(t), class: t === 0 ? 'ax' : 'gr' }));
      svg.append(sv('text', { x: L - 8, y: Y(t) + 4, class: 'tk', 'text-anchor': 'end' }, o.yLabel(t)));
    }
    for (const x of o.xTicks || []) svg.append(sv('text', { x: X(x), y: H - B + 18, class: 'tk', 'text-anchor': x === 0 ? 'start' : 'middle' }, o.xTickLabel(x)));
    svg.append(sv('text', { x: (L + W - R) / 2, y: H - 8, class: 'tk ttl', 'text-anchor': 'middle' }, o.xLabel));
    o.series.forEach((s, i) => {
      const d = s.pts.map((p, j) => (j ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');
      svg.append(sv('path', { d, class: 'ln ln' + i, fill: 'none' }));
    });
  }
  function set(o) {
    last = o;
    W = Math.max(260, Math.round(el.clientWidth || 600));
    draw();
    legend.replaceChildren(...o.series.map((s, i) => h('li', {}, sv('svg', { viewBox: '0 0 28 8', width: 28, height: 8, 'aria-hidden': 'true', focusable: 'false' }, sv('path', { d: 'M0 4H28', class: 'ln ln' + i, fill: 'none' })), s.name)));
    cap.textContent = o.caption;
    svg.setAttribute('aria-label', title + '. ' + o.caption);
  }
  try { new ResizeObserver(() => requestAnimationFrame(() => { const w = Math.max(260, Math.round(el.clientWidth || 600)); if (last && Math.abs(w - W) > 2) { W = w; draw(); } })).observe(el); } catch (e) { /* optional */ }
  return { el, set };
}

// ---- date field (native date picker; falls back to typing YYYY-MM-DD where the browser has no picker) ----
import { parseISODate } from './calc-lib.js';
const hasDateInput = (() => { try { const t = document.createElement('input'); t.type = 'date'; return t.type === 'date'; } catch (e) { return false; } })();
export function dateField(o) {
  const f = field({ ...o, type: hasDateInput ? 'date' : 'text', min: hasDateInput ? '0001-01-01' : false, max: hasDateInput ? '9999-12-31' : false, placeholder: hasDateInput ? false : 'YYYY-MM-DD', inputmode: hasDateInput ? false : 'numeric' });
  // readDate(): { kind: 'empty' | 'bad' | 'ok', v?: {y,m,d} }
  f.readDate = () => {
    const raw = f.get().trim();
    if (raw === '') {
      if (f.input.validity && f.input.validity.badInput) { f.error('That date is not complete or does not exist. Check the day, month and year.'); return { kind: 'bad' }; }
      f.error(''); return { kind: 'empty' };
    }
    const v = parseISODate(raw);
    if (!v) { f.error(hasDateInput ? 'That date does not exist. Check the day, month and year.' : 'Enter a real date as YYYY-MM-DD, for example 1990-04-27.'); return { kind: 'bad' }; }
    f.error(''); return { kind: 'ok', v };
  };
  return f;
}
