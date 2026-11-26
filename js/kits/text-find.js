// Find and Replace. Matching runs in a background worker that is stopped after a time limit, so a catastrophic
// regular expression cannot freeze the page. If workers are unavailable it falls back to the page thread.
import { h, icon, panel, textPanel, resultBox, announce, debounce, num, plural } from './text-ui.js';
import { field, check, seg } from '../ui.js';

const SUFFIX = ' | Ecom Swift LLC';
const TIME_LIMIT = 2000;
const MAX_COUNT = 1000000, MAX_MARKS = 3000, PREVIEW_CHARS = 100000;

// Runs inside the worker as well, so it must not touch anything outside itself (it is stringified).
export function findCompute(d) {
  var out = { count: 0, idx: [], truncated: false, replaced: '', replacedCount: 0 };
  var fl = d.flags, withG = fl.indexOf('g') < 0 ? fl + 'g' : fl;
  var g = new RegExp(d.source, withG), uni = fl.indexOf('u') >= 0, text = d.text, m;
  while ((m = g.exec(text)) !== null) {
    out.count++;
    if (out.idx.length < d.cap * 2) { out.idx.push(m.index, m[0].length); }
    if (m[0].length === 0) { var li = g.lastIndex, c = text.charCodeAt(li); g.lastIndex = (uni && c >= 0xD800 && c <= 0xDBFF) ? li + 2 : li + 1; }
    if (out.count >= d.max) { out.truncated = true; break; }
  }
  var r = new RegExp(d.source, d.all ? withG : fl.replace('g', ''));
  out.replaced = text.replace(r, d.repl);
  out.replacedCount = d.all ? out.count : Math.min(1, out.count);
  return out;
}

function makeRunner() {
  let worker = null, timer = null, pending = null;
  const spawn = () => {
    try {
      const src = `var f=${findCompute.toString().replace(/^function\s*findCompute/, 'function')};self.onmessage=function(e){try{postMessage(f(e.data))}catch(x){postMessage({error:String(x&&x.message||x)})}}`;
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      worker = new Worker(url); URL.revokeObjectURL(url);
      return true;
    } catch (e) { worker = null; return false; }
  };
  const cancel = () => { clearTimeout(timer); if (worker) { worker.terminate(); worker = null; } if (pending) { pending(null); pending = null; } };
  return {
    run(d) {
      cancel();
      return new Promise(res => {
        if (!worker && !spawn()) { // no worker support: run here (still bounded by the match cap)
          try { res(findCompute(d)); } catch (e) { res({ error: String(e && e.message || e) }); }
          return;
        }
        const w = worker; pending = res;
        timer = setTimeout(() => { w.terminate(); if (worker === w) worker = null; pending = null; res({ timeout: true }); }, TIME_LIMIT);
        w.onmessage = e => { clearTimeout(timer); pending = null; res(e.data); };
        w.onerror = e => { clearTimeout(timer); pending = null; res({ error: String(e && e.message || 'error') }); };
        w.postMessage(d);
      });
    },
    stop: cancel,
  };
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Returns { source, flags } for the first variant the browser accepts (Unicode-aware first), or throws.
export function buildPattern(find, o) {
  const base = o.regex ? find : escapeRe(find);
  const fl = (o.matchCase ? '' : 'i') + (o.regex && o.multiline ? 'm' : '');
  const tries = [
    { source: o.whole ? `(?<![\\p{L}\\p{N}_])(?:${base})(?![\\p{L}\\p{N}_])` : base, flags: fl + 'u' },
    { source: o.whole ? `\\b(?:${base})\\b` : base, flags: fl },
  ];
  let err;
  for (const t of tries) { try { new RegExp(t.source, t.flags); return t; } catch (e) { err = e; } }
  throw err;
}
export const prepareReplacement = (repl, regex) => regex
  ? repl.replace(/\\([ntr\\])/g, (m, c) => ({ n: '\n', t: '\t', r: '\r', '\\': '\\' }[c]))
  : repl.replace(/\$/g, '$$$$');

function mountFind(root) {
  const runner = makeRunner();
  let seq = 0;
  const goD = debounce(() => go(), 120);
  const input = textPanel({ id: 'ff-input', label: 'Text to search', rows: 10, onChange: () => go() });
  const find = field({ id: 'ff-find', label: 'Find', placeholder: 'Word or pattern', spellcheck: false, onInput: () => goD() });
  const repl = field({ id: 'ff-replace', label: 'Replace with', placeholder: 'Leave empty to delete the matches', spellcheck: false, onInput: () => goD() });
  const mode = seg({ id: 'ff-mode', label: 'Search type', choices: [{ v: 'plain', t: 'Plain text' }, { v: 'regex', t: 'Regular expression' }], value: 'plain', onInput: () => { sync(); goD(); } });
  const mc = check({ label: 'Match case', onInput: () => goD() });
  const ww = check({ label: 'Whole word only', onInput: () => goD() });
  const all = check({ label: 'Replace all matches (untick to replace only the first)', value: true, onInput: () => goD() });
  const ml = check({ label: 'Multiline: ^ and $ match at every line', onInput: () => goD() });
  const flagsLine = h('p', { class: 'text-hint', id: 'ff-flags' });
  const regexHelp = h('p', { class: 'text-hint', hidden: true }, 'JavaScript regular expressions. In the replacement, use $1 for a group, $& for the whole match, \\n for a new line and \\t for a tab.');
  const status = h('p', { class: 'text-status', id: 'ff-status', role: 'status' });
  const preview = h('div', { class: 'text-preview', id: 'ff-preview', tabindex: '0', role: 'region', 'aria-label': 'Text with matches highlighted' });
  const previewNote = h('p', { class: 'lt-note', hidden: true });
  const useBtn = h('button', { class: 'btn btn-quiet btn-sm', type: 'button' }, icon('up', 'sm'), 'Use result as text');
  const out = resultBox({ id: 'ff-output', label: 'Result', rows: 8, filename: 'replaced-text.txt', placeholder: 'The text with your replacements appears here.', extra: [useBtn] });
  useBtn.addEventListener('click', () => { if (!out.get()) return; input.set(out.get()); announce('The result is now in the text box.'); });
  const options = panel('Find and replace', h('div', { class: 'row2' }, find.el, repl.el), h('div', { class: 'opts text-opts', style: 'margin-top:14px' }, mode.el, h('div', { class: 'text-checks' }, mc.el, ww.el, all.el, ml.el), regexHelp, flagsLine));

  function sync() {
    const rx = mode.get() === 'regex';
    ml.input.disabled = !rx; regexHelp.hidden = !rx;
    flagsLine.textContent = `Flags in use: ${(all.get() ? 'g' : '') + (mc.get() ? '' : 'i') + (rx && ml.get() ? 'm' : '') || 'none'}`;
  }
  function showPreview(text, idx, truncated) {
    const lim = Math.min(text.length, PREVIEW_CHARS);
    const frag = document.createDocumentFragment(); let pos = 0, marks = 0;
    for (let i = 0; i < idx.length; i += 2) {
      const s = idx[i], l = idx[i + 1];
      if (s >= lim) break; if (!l || s < pos) continue;
      const e = Math.min(s + l, lim);
      frag.append(text.slice(pos, s), h('mark', {}, text.slice(s, e))); pos = e; marks++;
    }
    frag.append(text.slice(pos, lim));
    preview.replaceChildren(frag);
    const bits = [];
    if (text.length > lim) bits.push(`The preview shows the first ${num(lim)} characters.`);
    if (truncated || idx.length / 2 >= MAX_MARKS) bits.push(`At most ${num(MAX_MARKS)} matches are highlighted.`);
    previewNote.textContent = bits.join(' '); previewNote.hidden = !bits.length;
  }
  async function go() {
    sync();
    const my = ++seq, text = input.get(), f = find.get();
    find.error('');
    if (!f) {
      runner.stop(); status.textContent = 'Type what you want to find.'; out.set(text); showPreview(text, [], false); return;
    }
    const rx = mode.get() === 'regex';
    let pat;
    try { pat = buildPattern(f, { regex: rx, matchCase: mc.get(), whole: ww.get(), multiline: ml.get() }); }
    catch (e) {
      runner.stop();
      find.error('This pattern is not valid. Check that each ( and [ has its closing partner and that special characters have a backslash before them.');
      status.textContent = ''; out.set(''); showPreview(text, [], false); return;
    }
    status.textContent = 'Searching\u2026';
    const r = await runner.run({ source: pat.source, flags: pat.flags, text, repl: prepareReplacement(repl.get(), rx), all: all.get(), cap: MAX_MARKS, max: MAX_COUNT });
    if (my !== seq || !r) return;
    if (r.timeout) { find.error('This pattern took too long on this text, so it was stopped. Try a simpler pattern or less text.'); status.textContent = ''; out.set(''); showPreview(text, [], false); return; }
    if (r.error) { find.error('This pattern could not be used on your text. Try a simpler pattern.'); status.textContent = ''; out.set(''); return; }
    out.set(r.replaced);
    const c = r.truncated ? `${num(r.count)}+` : num(r.count);
    status.textContent = r.count === 0 ? 'No matches.' : `${c} ${r.count === 1 && !r.truncated ? 'match' : 'matches'} found, ${num(r.replacedCount)} replaced.`;
    root._summary = status.textContent;
    showPreview(text, r.idx, r.truncated);
    root.dataset.matches = String(r.count);
  }
  root.append(input.el, options, panel('Matches', status, preview, previewNote), panel('Result', out.el));
  sync(); go();
  return () => runner.stop();
}

export const FIND_TOOLS = [{
  id: 'find-and-replace', slug: 'find-and-replace', name: 'Find and Replace',
  blurb: 'Find text or patterns, see every match highlighted and replace them all.',
  keywords: 'find replace regex regular expression search match highlight whole word text replace',
  icon: 'findreplace', kind: 'live',
  seo: {
    title: 'Free Find and Replace Tool for Text with Regex' + SUFFIX,
    description: 'Find and replace text online with plain words or regular expressions. See every match highlighted and counted, then copy the result. Runs in your browser.',
    h1: 'Find and Replace',
    intro: 'Search your text for a word or a pattern, see every match highlighted, and replace all of them or just the first. Plain text and regular expressions both work, and nothing leaves your browser.',
    steps: ['Paste your text into the box.', 'Type what to find and what to replace it with, or switch to Regular expression for patterns.', 'Check the highlighted matches, then copy or download the result.'],
    faq: [
      ['Is my text uploaded anywhere?', 'No. Searching and replacing happen in your browser. Your text is not sent to a server and the page makes no network requests while you work.'],
      ['How do I use regular expressions?', 'Choose Regular expression and type a JavaScript pattern. For example, \\d+ matches any number. In the replacement you can use $1 and $2 for groups, $& for the whole match, \\n for a new line and \\t for a tab.'],
      ['What does Whole word only do?', 'A match counts only when it is not part of a longer word, meaning no letter, digit or underscore sits right before or after it. Searching for cat then skips category.'],
      ['Why was my pattern stopped?', 'Some patterns, such as (a+)+$ on a long run of the letter a, can take a very long time because the engine tries too many paths. The search runs in the background and is stopped after two seconds so the page stays usable. A simpler pattern usually fixes it.'],
      ['Which regular expression syntax is used?', 'Your browser\u2019s own JavaScript syntax, which differs a little from PCRE, Python and other tools. Unicode mode is used when the pattern allows it, so \\p{L} for letters works. Lookbehind depends on your browser version.'],
      ['What is the difference between Replace all and the first match?', 'With Replace all ticked every match is replaced. Untick it to replace only the first match. The highlighted preview always shows every match.'],
    ],
    related: ['text-compare', 'text-cleaner', 'remove-duplicate-lines', 'case-converter'],
  },
  mount(container) { return mountFind(container); },
}];
