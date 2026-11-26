// Text Compare: a line diff using Myers' O(ND) algorithm with linear-space bisection (no dependencies).
import { h, icon, panel, textPanel, copyButton, announce, num, plural, stats, setStats } from './text-ui.js';
import { check } from '../ui.js';
import { splitLines } from './text-lib.js';

const SUFFIX = ' | Ecom Swift LLC';
export const MAX_LINES = 10000;

// Finds the point where the best path crosses the middle, as in diff-match-patch's bisect. Returns {x, y} or null.
function bisect(A, B, aLo, aHi, bLo, bHi) {
  const n = aHi - aLo, m = bHi - bLo;
  const maxD = Math.ceil((n + m) / 2), vOff = maxD, vLen = 2 * maxD + 2;
  const v1 = new Int32Array(vLen).fill(-1), v2 = new Int32Array(vLen).fill(-1);
  v1[vOff + 1] = 0; v2[vOff + 1] = 0;
  const delta = n - m, front = delta % 2 !== 0;
  let k1s = 0, k1e = 0, k2s = 0, k2e = 0;
  for (let d = 0; d < maxD; d++) {
    for (let k1 = -d + k1s; k1 <= d - k1e; k1 += 2) {
      const o1 = vOff + k1;
      let x1 = (k1 === -d || (k1 !== d && v1[o1 - 1] < v1[o1 + 1])) ? v1[o1 + 1] : v1[o1 - 1] + 1;
      let y1 = x1 - k1;
      while (x1 < n && y1 < m && A[aLo + x1] === B[bLo + y1]) { x1++; y1++; }
      v1[o1] = x1;
      if (x1 > n) k1e += 2;
      else if (y1 > m) k1s += 2;
      else if (front) {
        const o2 = vOff + delta - k1;
        if (o2 >= 0 && o2 < vLen && v2[o2] !== -1) { const x2 = n - v2[o2]; if (x1 >= x2) return { x: x1, y: y1 }; }
      }
    }
    for (let k2 = -d + k2s; k2 <= d - k2e; k2 += 2) {
      const o2 = vOff + k2;
      let x2 = (k2 === -d || (k2 !== d && v2[o2 - 1] < v2[o2 + 1])) ? v2[o2 + 1] : v2[o2 - 1] + 1;
      let y2 = x2 - k2;
      while (x2 < n && y2 < m && A[aHi - x2 - 1] === B[bHi - y2 - 1]) { x2++; y2++; }
      v2[o2] = x2;
      if (x2 > n) k2e += 2;
      else if (y2 > m) k2s += 2;
      else if (!front) {
        const o1 = vOff + delta - k2;
        if (o1 >= 0 && o1 < vLen && v1[o1] !== -1) {
          const x1 = v1[o1], y1 = vOff + x1 - o1;
          if (x1 >= n - x2) return { x: x1, y: y1 };
        }
      }
    }
  }
  return null;
}

// ops are pushed flat as (type, aIndex, bIndex): 0 equal, 1 removed (from A), 2 added (from B)
function rec(A, B, aLo, aHi, bLo, bHi, out) {
  let p = 0;
  while (aLo + p < aHi && bLo + p < bHi && A[aLo + p] === B[bLo + p]) p++;
  for (let k = 0; k < p; k++) out.push(0, aLo + k, bLo + k);
  aLo += p; bLo += p;
  let s = 0;
  while (aHi - s > aLo && bHi - s > bLo && A[aHi - 1 - s] === B[bHi - 1 - s]) s++;
  const aE = aHi - s, bE = bHi - s;
  if (aLo === aE) { for (let j = bLo; j < bE; j++) out.push(2, -1, j); }
  else if (bLo === bE) { for (let i = aLo; i < aE; i++) out.push(1, i, -1); }
  else {
    const sp = bisect(A, B, aLo, aE, bLo, bE);
    const stuck = !sp || (sp.x === 0 && sp.y === 0) || (sp.x === aE - aLo && sp.y === bE - bLo);
    if (stuck) { for (let i = aLo; i < aE; i++) out.push(1, i, -1); for (let j = bLo; j < bE; j++) out.push(2, -1, j); }
    else { rec(A, B, aLo, aLo + sp.x, bLo, bLo + sp.y, out); rec(A, B, aLo + sp.x, aE, bLo + sp.y, bE, out); }
  }
  for (let k = 0; k < s; k++) out.push(0, aE + k, bE + k);
}

// Diff two arrays of lines. Returns ops [{t:'=' | '-' | '+', a, b}] where a/b are 0-based line indexes (or -1).
export function diffLines(aLines, bLines, o = {}) {
  const norm = l => { if (o.ignoreWhitespace) l = l.replace(/\s+/g, ' ').trim(); if (o.ignoreCase) l = l.toLowerCase(); return l; };
  const ids = new Map(); let next = 0;
  const toIds = arr => { const r = new Int32Array(arr.length); for (let i = 0; i < arr.length; i++) { const k = norm(arr[i]); let id = ids.get(k); if (id === undefined) { id = next++; ids.set(k, id); } r[i] = id; } return r; };
  const A = toIds(aLines), B = toIds(bLines);
  const flat = []; rec(A, B, 0, A.length, 0, B.length, flat);
  const ops = [];
  for (let i = 0; i < flat.length; i += 3) ops.push({ t: flat[i] === 0 ? '=' : flat[i] === 1 ? '-' : '+', a: flat[i + 1], b: flat[i + 2] });
  // inside every changed block, list removals first and then additions
  const res = []; let i = 0;
  while (i < ops.length) {
    if (ops[i].t === '=') { res.push(ops[i++]); continue; }
    const del = [], add = [];
    while (i < ops.length && ops[i].t !== '=') { (ops[i].t === '-' ? del : add).push(ops[i]); i++; }
    res.push(...del, ...add);
  }
  return res;
}

const CONTEXT = 3, MIN_GAP = 8, ROW_CAP = 3000;

function mountCompare(root) {
  const a = textPanel({ id: 'tx-a', title: 'Original text', label: 'Original', rows: 12, placeholder: 'Paste the original text here', onChange: () => run() });
  const b = textPanel({ id: 'tx-b', title: 'Changed text', label: 'Changed', rows: 12, placeholder: 'Paste the changed text here', onChange: () => run() });
  const iw = check({ label: 'Ignore spaces and tabs', onInput: () => run() });
  const ic = check({ label: 'Ignore upper and lower case', onInput: () => run() });
  const co = check({ label: 'Show only changes, with 3 lines of context around them', value: true, onInput: () => run() });
  const swap = h('button', { class: 'btn btn-quiet btn-sm', type: 'button' }, icon('reorder', 'sm'), 'Swap the two texts');
  swap.addEventListener('click', () => { const x = a.get(); a.set(b.get()); b.set(x); announce('The two texts were swapped.'); });
  const statsEl = stats([]);
  const msg = h('p', { class: 'text-status', role: 'status' });
  const wrap = h('div', { class: 'text-diff-wrap', tabindex: '0', role: 'region', 'aria-label': 'Differences between the two texts' });
  const copy = copyButton(() => lastText, 'Copy the diff');
  let lastText = '';
  const options = panel('Options', h('div', { class: 'opts text-opts' }, iw.el, ic.el, co.el), h('div', { class: 'lt-bar' }, swap));
  const result = panel('Differences', msg, statsEl, wrap, h('div', { class: 'lt-bar' }, copy));
  result.hidden = true;

  function renderRow(op, A, B) {
    const kind = op.t === '=' ? 'same' : op.t === '-' ? 'del' : 'add';
    const txt = op.t === '+' ? B[op.b] : A[op.a];
    const mark = op.t === '=' ? '\u00A0' : op.t === '-' ? '\u2212' : '+';
    const word = op.t === '=' ? 'Unchanged' : op.t === '-' ? 'Removed' : 'Added';
    return h('tr', { class: 'text-diff-' + kind },
      h('td', { class: 'ln' }, op.a >= 0 ? String(op.a + 1) : ''),
      h('td', { class: 'ln' }, op.b >= 0 ? String(op.b + 1) : ''),
      h('td', { class: 'mk' }, h('span', { 'aria-hidden': 'true' }, mark), h('span', { class: 'sr' }, word + ': ')),
      h('td', { class: 'tx' }, txt === '' ? h('span', { class: 'text-diff-blank' }, '(empty line)') : txt));
  }
  function render(ops, A, B) {
    // choose which rows to show: changes plus context when collapsing
    const show = new Uint8Array(ops.length);
    if (co.get()) {
      for (let i = 0; i < ops.length; i++) if (ops[i].t !== '=') for (let j = Math.max(0, i - CONTEXT); j <= Math.min(ops.length - 1, i + CONTEXT); j++) show[j] = 1;
    } else show.fill(1);
    const tbody = h('tbody', {}); let rows = 0, hidden = 0, capped = false;
    for (let i = 0; i < ops.length;) {
      if (show[i]) {
        if (rows >= ROW_CAP) { capped = true; hidden += ops.length - i; break; }
        tbody.append(renderRow(ops[i], A, B)); rows++; i++; continue;
      }
      let j = i; while (j < ops.length && !show[j]) j++;
      const run = ops.slice(i, j);
      const btn = h('button', { class: 'btn btn-quiet btn-sm', type: 'button' }, icon('down', 'sm'), `Show ${plural(run.length, 'unchanged line')}`);
      const tr = h('tr', { class: 'text-diff-gap' }, h('td', { colspan: '4' }, btn));
      btn.addEventListener('click', () => { const frag = document.createDocumentFragment(); run.forEach(op => frag.append(renderRow(op, A, B))); tr.replaceWith(frag); });
      tbody.append(tr); i = j;
    }
    const table = h('table', { class: 'text-diff' },
      h('caption', { class: 'sr' }, 'Line by line differences. Each row shows the line number in the original text, the line number in the changed text, a marker and the text.'),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Old'), h('th', { scope: 'col' }, 'New'), h('th', { scope: 'col' }, 'Change'), h('th', { scope: 'col' }, 'Line'))), tbody);
    wrap.replaceChildren(table);
    if (capped) {
      const more = h('button', { class: 'btn btn-quiet btn-sm', type: 'button', style: 'margin:10px' }, `Show the other ${num(hidden)} rows`);
      more.addEventListener('click', () => { for (let i = ROW_CAP; i < ops.length; i++) if (show[i]) tbody.append(renderRow(ops[i], A, B)); more.remove(); });
      wrap.append(more);
    }
  }
  function run() {
    const ta = a.get(), tb = b.get();
    if (!ta && !tb) { result.hidden = true; lastText = ''; return; }
    const A = splitLines(ta), B = splitLines(tb);
    result.hidden = false;
    if (A.length > MAX_LINES || B.length > MAX_LINES) {
      wrap.replaceChildren(); setStats(statsEl, []); msg.textContent = `Each text can have up to ${num(MAX_LINES)} lines. Compare a smaller part of the text.`; msg.classList.add('is-err'); return;
    }
    msg.classList.remove('is-err');
    const ops = diffLines(A, B, { ignoreWhitespace: iw.get(), ignoreCase: ic.get() });
    let add = 0, del = 0, same = 0;
    for (const o of ops) { if (o.t === '+') add++; else if (o.t === '-') del++; else same++; }
    setStats(statsEl, [{ label: 'Lines added (+)', value: num(add) }, { label: 'Lines removed (\u2212)', value: num(del) }, { label: 'Lines unchanged', value: num(same) }]);
    msg.textContent = add + del === 0 ? 'The two texts are the same' + (iw.get() || ic.get() ? ' with these options.' : '.') : `${plural(add + del, 'line')} differ.`;
    root._summary = msg.textContent;
    lastText = ops.map(o => (o.t === '=' ? '  ' : o.t === '-' ? '- ' : '+ ') + (o.t === '+' ? B[o.b] : A[o.a])).join('\n');
    render(ops, A, B);
  }
  a.input.addEventListener('change', () => announce(root._summary || ''));
  b.input.addEventListener('change', () => announce(root._summary || ''));
  root.append(h('div', { class: 'lt-cols text-even' }, a.el, b.el), options, result);
}

export const DIFF_TOOLS = [{
  id: 'text-compare', slug: 'text-compare', name: 'Text Compare',
  blurb: 'Compare two texts line by line and see what was added or removed.',
  keywords: 'text compare diff difference compare two texts changes added removed line by line',
  icon: 'compare', kind: 'live',
  seo: {
    title: 'Free Text Compare: Find Differences Online' + SUFFIX,
    description: 'Compare two texts line by line and see what was added or removed, marked with + and \u2212 signs. Ignore spaces or case if you like. Runs in your browser.',
    h1: 'Text Compare',
    intro: 'Paste two versions of a text and see which lines were added, removed or left alone. Changes are marked with signs as well as colour, and it all runs in your browser.',
    steps: ['Paste the original text on the left and the changed text on the right.', 'Choose whether to ignore spaces or upper and lower case.', 'Read the marked lines, or copy the diff.'],
    faq: [
      ['Are my texts uploaded anywhere?', 'No. The comparison runs in your browser and neither text is sent to a server.'],
      ['How does the comparison work?', 'It finds the longest run of lines the two texts share, using the Myers diff algorithm, then marks everything else as removed from the original or added in the changed text. The same method is used by many version control tools.'],
      ['Does it compare words or only whole lines?', 'Whole lines. If one word changes, the old line shows as removed and the new line as added. It does not mark the changed word inside the line.'],
      ['What do the ignore options do?', 'Ignore spaces and tabs treats runs of whitespace as one space and trims line ends before comparing, so re-indented lines match. Ignore upper and lower case treats Apple and apple as the same line.'],
      ['How large can the texts be?', 'Up to 10,000 lines each. Texts of a few thousand lines compare in a moment on a typical computer. A very different pair of long texts takes longer.'],
      ['Why are some unchanged lines hidden?', 'To keep the page short, long runs of unchanged lines are folded away and three lines of context stay around each change. Press Show unchanged lines to open a fold, or untick the option to see everything.'],
    ],
    related: ['find-and-replace', 'remove-duplicate-lines', 'text-cleaner', 'sort-lines'],
  },
  mount(container) { mountCompare(container); },
}];
