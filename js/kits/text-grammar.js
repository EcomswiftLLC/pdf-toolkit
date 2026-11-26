// Basic Grammar and Style Checker: a fixed set of rules plus readability scores. Not a grammar engine and no AI.
import { h, icon, panel, textPanel, announce, num, plural, stats, setStats } from './text-ui.js';
import { check, note } from '../ui.js';
import { normalizeNewlines, sentenceRanges, paragraphRanges, wordTokens, normWord, countCodePoints } from './text-lib.js';

const SUFFIX = ' | Ecom Swift LLC';
const LETTER = /[\p{L}\p{N}'\u2019]/u;

export const RULES = {
  repeated: { label: 'Repeated word', kind: 'Mistake' },
  doublespace: { label: 'Two spaces in a row', kind: 'Mistake' },
  spacebefore: { label: 'Space before punctuation', kind: 'Mistake' },
  spaceafter: { label: 'Missing space after punctuation', kind: 'Mistake' },
  lowercase: { label: 'Sentence starts with a small letter', kind: 'Mistake' },
  endpunct: { label: 'No punctuation at the end', kind: 'Mistake' },
  mixup: { label: 'Common mix-up', kind: 'Mistake' },
  brackets: { label: 'Unmatched bracket or quote', kind: 'Mistake' },
  longsentence: { label: 'Very long sentence', kind: 'Style' },
  wordy: { label: 'Wordy phrase', kind: 'Style' },
  passive: { label: 'Possible passive voice', kind: 'Hint' },
  article: { label: 'A or an?', kind: 'Hint' },
};

// phrase -> [suggestion or null, why]
const WORDY = [
  ['in order to', 'to'], ['due to the fact that', 'because'], ['in spite of the fact that', 'although'], ['at this point in time', 'now'],
  ['at the present time', 'now'], ['in the event that', 'if'], ['for the purpose of', 'for'], ['with regard to', 'about'], ['with respect to', 'about'],
  ['a large number of', 'many'], ['a majority of', 'most'], ['has the ability to', 'can'], ['have the ability to', 'can'], ['is able to', 'can'], ['are able to', 'can'],
  ['in the near future', 'soon'], ['on a daily basis', 'daily'], ['on a regular basis', 'regularly'], ['each and every', 'each'], ['end result', 'result'],
  ['past history', 'history'], ['future plans', 'plans'], ['free gift', 'gift'], ['advance planning', 'planning'], ['close proximity', 'proximity'],
  ['completely finished', 'finished'], ['very unique', 'unique'], ['first and foremost', 'first'], ['for all intents and purposes', 'in effect'],
  ['the reason why is because', 'the reason is that'], ['in my personal opinion', 'in my opinion'], ['it is important to note that', null], ['needless to say', null],
];
const WORDY_MAP = new Map(WORDY.map(([p, r]) => [p, r]));
const WORDY_RE = new RegExp('(^|[^\\p{L}\\p{N}\'\u2019])(' + WORDY.map(([p]) => p).sort((a, b) => b.length - a.length).map(p => p.replace(/ /g, '\\s+')).join('|') + ')(?![\\p{L}\\p{N}\'\u2019])', 'giu');
const MIXUP_RE = /(^|[^\p{L}\p{N}'\u2019])(could|would|should|must|might)(\s+)of(?![\p{L}\p{N}'\u2019])|(^|[^\p{L}\p{N}'\u2019])(alot|irregardless)(?![\p{L}\p{N}'\u2019])|(^|[^\p{L}\p{N}'\u2019])(your)(\s+)(welcome|going|not|the)(?![\p{L}\p{N}'\u2019])|(^|[^\p{L}\p{N}'\u2019])(their)(\s+)(is|are)(?![\p{L}\p{N}'\u2019])/giu;
const ARTICLE_RE = /(^|[^\p{L}\p{N}'\u2019])(a)(\s+)([aeio][\p{L}]*)(?![\p{L}\p{N}'\u2019])/giu;
const NOT_VOWEL_SOUND = /^(one|once|eu|ewe|oh|ok|okay)/i;

const IRREG = new Set('known given taken made done seen written broken chosen driven eaten fallen forgotten gotten hidden shown spoken stolen thrown worn built bought brought caught found held kept left lost paid read sent sold taught told thought understood won begun sung born grown drawn flown torn sworn woken ridden risen beaten bitten dealt fed led met said shot slept spent stood struck swept swum hit put cut set shut'.split(' '));
const ADJ = new Set('excited interested tired bored surprised worried pleased concerned married scared confused hundred sacred naked wicked kindred crooked rugged ragged beloved advanced limited complicated detailed experienced talented skilled determined disappointed exhausted amazed annoyed embarrassed frightened satisfied thrilled shocked relaxed stressed supposed'.split(' '));
const PASSIVE_RE = /(^|[^\p{L}\p{N}'\u2019])(am|is|are|was|were|be|been|being)(\s+)(?:(\p{L}+ly)\s+)?(\p{L}+)(?![\p{L}\p{N}'\u2019])/giu;

const cap = w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w;
const isUpper = w => w.charAt(0) !== w.charAt(0).toLowerCase();
// the whitespace-delimited token around index i
// line start lookups for increasing positions, without rescanning long lines
function lineStarter(t) { let ls = 0, nl = t.indexOf('\n'); return i => { while (nl !== -1 && nl < i) { ls = nl + 1; nl = t.indexOf('\n', ls); } return ls; }; }
function tokenAround(t, i) {
  let a = i, b = i;
  while (a > 0 && !/\s/.test(t[a - 1])) a--;
  while (b < t.length && !/\s/.test(t[b])) b++;
  return t.slice(a, b);
}
const URLISH = /[/@\\_=#]|www\.|https?:/i;

export function checkText(text) {
  const t = normalizeNewlines(text || '');
  const F = [];
  const add = (rule, s, e, why, fix, replace) => F.push({ rule, kind: RULES[rule].kind, s, e, why, fix, replace, wide: rule === 'longsentence' });
  let m;

  // repeated words
  const rep = /([\p{L}\p{M}][\p{L}\p{M}'\u2019]*)([^\S\n]+|\n)\1(?![\p{L}\p{M}\p{N}'\u2019])/giu;
  while ((m = rep.exec(t))) {
    if (m.index > 0 && LETTER.test(t[m.index - 1])) continue;
    const w = m[1].toLowerCase();
    if (w === 'had' || w === 'that') continue; // "had had" and "that that" can be correct
    add('repeated', m.index, m.index + m[0].length, `The word \u201C${m[1]}\u201D appears twice in a row.`, `Delete one \u201C${m[1]}\u201D.`, m[1]);
  }
  // two spaces
  const lsDbl = lineStarter(t), dbl = /[ \u00A0]{2,}/g;
  while ((m = dbl.exec(t))) {
    const ls = lsDbl(m.index);
    if (t.slice(ls, m.index).trim() === '') continue; // indentation
    const next = t[m.index + m[0].length];
    if (next === undefined || next === '\n') continue; // trailing spaces
    add('doublespace', m.index, m.index + m[0].length, `There are ${m[0].length} spaces here. One is enough.`, 'Use a single space.', ' ');
  }
  // space before , ; : ! ? .
  const sb = /(\S)([^\S\n]+)([,;:!?]|\.(?!\.))(?=\s|$)/g;
  while ((m = sb.exec(t))) {
    if (/[\s([{]/.test(m[1])) continue;
    const s = m.index + 1;
    add('spacebefore', s, m.index + m[0].length, `Punctuation normally follows a word with no space before it.`, `Remove the space before \u201C${m[3]}\u201D.`, m[3]);
  }
  // missing space after punctuation
  const sa = /([\p{L})\]"\u201D\u2019])([,;!?:])(?=\p{L})|(\p{Ll}{2,})(\.)(?=\p{Lu}\p{Ll})/gu;
  while ((m = sa.exec(t))) {
    const p = m[2] ? m.index + m[1].length : m.index + m[3].length;
    if (URLISH.test(tokenAround(t, p))) continue;
    const ch = t[p];
    add('spaceafter', p, p + 1, `A space is expected after \u201C${ch}\u201D.`, `Add a space after \u201C${ch}\u201D.`, ch + ' ');
  }
  // sentences: lowercase starts and long sentences
  const sents = sentenceRanges(t);
  const lsSent = lineStarter(t);
  for (const sn of sents) {
    const seg = t.slice(sn.s, sn.e);
    const lead = (/^[^\p{L}\p{N}]*/u.exec(seg) || [''])[0];
    const c = seg.slice(lead.length, lead.length + 1);
    const ls = lsSent(sn.s);
    const lineLead = t.slice(ls, sn.s).trim();
    const listItem = /^([-*\u2022\u00B7\u2013]|\d+[.)]|[a-z][.)])$/i.test(lineLead) || /^[-*\u2022\u00B7\u2013]/.test(lead.trim());
    if (c && c !== c.toUpperCase() && c === c.toLowerCase() && !listItem) {
      const tok = (/^\S+/.exec(seg.slice(lead.length)) || [''])[0];
      const before = t.slice(Math.max(0, sn.s - 12), sn.s);
      const afterEllipsis = /(\.{3}|\u2026)["\u201D\u2019)\]]*\s*$/.test(before);
      if (!afterEllipsis && !/^[a-z][.)]/i.test(tok) && !/[.@/\\]/.test(tok.replace(/[.,;:!?]+$/, '')) && !/\p{Lu}/u.test(tok.slice(1)) && !/\d/.test(tok)) {
        const w = (/^[\p{L}\p{M}'\u2019]+/u.exec(seg.slice(lead.length)) || [''])[0];
        const s = sn.s + lead.length;
        add('lowercase', s, s + w.length, 'A sentence normally starts with a capital letter.', `Change \u201C${w}\u201D to \u201C${cap(w)}\u201D.`, cap(w));
      }
    }
    const wc = wordTokens(seg).length;
    if (wc > 35) add('longsentence', sn.s, sn.e, `This sentence has ${wc} words. Sentences over about 35 words are harder to follow.`, 'Try splitting it in two, for example at \u201Cand\u201D, \u201Cbut\u201D, \u201Cwhich\u201D or a semicolon.');
  }
  // missing end punctuation
  const paras = paragraphRanges(t);
  for (const p of paras) {
    const seg = t.slice(p.s, p.e);
    if (/(^|\n)\s*(?:[-*\u2022\u2013]|\d+[.)])\s/.test(seg)) continue;
    const wc = wordTokens(seg).length;
    if (wc < (paras.length === 1 ? 5 : 8)) continue;
    if (/[.!?\u2026:;)"\u201D\u2019\u00BB\]\u3002\uFF01\uFF1F]$/.test(seg)) continue;
    const last = (/[\p{L}\p{N}]+$/u.exec(seg) || [''])[0];
    if (!last || URLISH.test(last)) continue;
    const s = p.e - last.length;
    add('endpunct', s, p.e, 'This paragraph ends without a full stop, question mark or exclamation mark.', 'Add a full stop (or another end mark) after the last word.', last + '.');
  }
  // wordy phrases
  WORDY_RE.lastIndex = 0;
  while ((m = WORDY_RE.exec(t))) {
    const phrase = m[2].toLowerCase().replace(/\s+/g, ' ');
    const sug = WORDY_MAP.get(phrase);
    const s = m.index + m[1].length;
    const why = `\u201C${m[2].replace(/\s+/g, ' ')}\u201D is a wordy way to say this.`;
    if (sug == null) add('wordy', s, s + m[2].length, why, 'Consider deleting it. The sentence usually reads better without it.');
    else add('wordy', s, s + m[2].length, why, `Try \u201C${sug}\u201D.`, isUpper(m[2]) ? cap(sug) : sug);
  }
  // common mix-ups
  MIXUP_RE.lastIndex = 0;
  while ((m = MIXUP_RE.exec(t))) {
    let s, e, why, fix, rep2;
    if (m[2]) { s = m.index + m[1].length; e = m.index + m[0].length; why = `\u201C${m[2]} of\u201D is usually a slip for \u201C${m[2]} have\u201D.`; fix = `Use \u201C${m[2]} have\u201D.`; rep2 = m[2] + ' have'; }
    else if (m[5]) { s = m.index + m[4].length; e = m.index + m[0].length; const w = m[5].toLowerCase(); rep2 = w === 'alot' ? 'a lot' : 'regardless'; why = w === 'alot' ? '\u201CAlot\u201D is not a word.' : '\u201CIrregardless\u201D is widely considered non-standard.'; fix = `Use \u201C${rep2}\u201D.`; if (isUpper(m[5])) rep2 = cap(rep2); }
    else if (m[7]) { s = m.index + m[6].length; e = m.index + m[0].length; rep2 = 'you\u2019re ' + m[9]; why = '\u201CYour\u201D shows ownership. Here \u201Cyou are\u201D is meant.'; fix = `Use \u201C${rep2}\u201D.`; if (isUpper(m[7])) rep2 = cap(rep2); }
    else { s = m.index + m[10].length; e = m.index + m[0].length; rep2 = 'there ' + m[13]; why = '\u201CTheir\u201D shows ownership. Here \u201Cthere\u201D is meant.'; fix = `Use \u201C${rep2}\u201D.`; if (isUpper(m[11])) rep2 = cap(rep2); }
    // make the match end exactly at the end of the phrase (group ends include the lookahead only)
    e = Math.min(e, t.length);
    add('mixup', s, e, why, fix, rep2);
  }
  // a / an
  ARTICLE_RE.lastIndex = 0;
  while ((m = ARTICLE_RE.exec(t))) {
    const w = m[4];
    if (w.length < 3 || NOT_VOWEL_SOUND.test(w) || w === w.toUpperCase()) continue;
    const s = m.index + m[1].length;
    add('article', s, s + m[2].length, `\u201C${w}\u201D starts with a vowel sound, so \u201Can\u201D is usually used.`, `Try \u201C${isUpper(m[2]) ? 'An' : 'an'} ${w}\u201D.`, isUpper(m[2]) ? 'An' : 'an');
  }
  // passive voice hint
  PASSIVE_RE.lastIndex = 0;
  while ((m = PASSIVE_RE.exec(t))) {
    const part = m[5].toLowerCase();
    const ok = (part.length >= 4 && /ed$/.test(part) && !/eed$/.test(part)) || IRREG.has(part);
    if (!ok || ADJ.has(part)) continue;
    const s = m.index + m[1].length;
    add('passive', s, m.index + m[0].length, `\u201C${t.slice(s, m.index + m[0].length).replace(/\s+/g, ' ')}\u201D may be passive voice. This is only a hint: the check looks for a form of \u201Cbe\u201D followed by a past participle and can be wrong.`, 'If you want it active, say who does the action: \u201CShe wrote the report\u201D instead of \u201CThe report was written\u201D.');
  }
  // brackets and quotes
  const lsBr = lineStarter(t), pairs = { ')': '(', ']': '[', '}': '{' }, stack = [];
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '(' || ch === '[' || ch === '{') { if (ch === '(' && (t[i - 1] === ':' || t[i - 1] === ';')) continue; stack.push({ ch, i }); }
    else if (pairs[ch]) {
      if (ch === ')') {
        const ls = lsBr(i), before = t.slice(ls, i);
        if (/[:;]-?$/.test(before) || /^\s*(\d+|[A-Za-z])$/.test(before)) continue; // :) and "1)"
      }
      if (stack.length && stack[stack.length - 1].ch === pairs[ch]) stack.pop();
      else add('brackets', i, i + 1, `This \u201C${ch}\u201D has no matching \u201C${pairs[ch]}\u201D.`, `Add the missing \u201C${pairs[ch]}\u201D or remove this one.`);
    }
  }
  const close = { '(': ')', '[': ']', '{': '}' };
  for (const o of stack) add('brackets', o.i, o.i + 1, `This \u201C${o.ch}\u201D is never closed.`, `Add the missing \u201C${close[o.ch]}\u201D or remove this one.`);
  const dq = []; for (let i = 0; i < t.length; i++) if (t[i] === '"') dq.push(i);
  if (dq.length % 2 === 1) add('brackets', dq[dq.length - 1], dq[dq.length - 1] + 1, 'There is an odd number of straight double quotes, so one has no partner.', 'Add the missing quote or remove this one.');
  const cq = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\u201C') cq.push(i);
    else if (t[i] === '\u201D') { if (cq.length) cq.pop(); else add('brackets', i, i + 1, 'This closing curly quote has no opening quote.', 'Add the missing opening quote or remove this one.'); }
  }
  for (const i of cq) add('brackets', i, i + 1, 'This opening curly quote is never closed.', 'Add the missing closing quote or remove this one.');

  F.sort((a, b) => a.s - b.s || a.e - b.e);
  const uniq = F.filter((f, i) => i === 0 || !(f.s === F[i - 1].s && f.e === F[i - 1].e && f.rule === F[i - 1].rule));
  uniq.forEach((f, i) => { f.id = i; });
  return uniq;
}

// ---------- readability ----------
export function syllables(word) {
  let w = word.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  if (!w) return /\d/.test(word) ? 1 : 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = w.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}
export function readability(text) {
  const t = normalizeNewlines(text || '');
  const toks = wordTokens(t), words = toks.length, sentences = Math.max(sentenceRanges(t).length, words ? 1 : 0);
  if (!words) return null;
  let syl = 0; for (const w of toks) syl += syllables(normWord(w).replace(/[^\p{L}\p{N}]/gu, '')) || 1;
  const wps = words / sentences, spw = syl / words;
  const ease = 206.835 - 1.015 * wps - 84.6 * spw, grade = 0.39 * wps + 11.8 * spw - 15.59;
  const label = ease >= 90 ? 'Very easy to read' : ease >= 80 ? 'Easy to read' : ease >= 70 ? 'Fairly easy to read' : ease >= 60 ? 'Plain English' : ease >= 50 ? 'Fairly difficult' : ease >= 30 ? 'Difficult' : 'Very difficult';
  return { words, sentences, syllables: syl, wps, spw, ease, grade, label };
}

// ---------- UI ----------
const PREVIEW_CHARS = 100000, MAX_SHOWN = 200;

function snippetNode(t, f) {
  const a = Math.max(0, f.s - 14), b = Math.min(t.length, f.e + 14);
  const vis = s => s.replace(/\n/g, '\u21B5');
  let mid = t.slice(f.s, f.e);
  if (mid.length > 70) mid = mid.slice(0, 40) + '\u2026' + mid.slice(-20);
  mid = vis(/^\s+$/.test(mid) ? mid.replace(/ /g, '\u2423') : mid);
  return h('span', { class: 'text-snip' }, a > 0 ? '\u2026' : '', vis(t.slice(a, f.s).slice(-14)), h('strong', {}, mid), f.wide ? '' : vis(t.slice(f.e, b)), b < t.length && !f.wide ? '\u2026' : '');
}

function mountGrammar(root) {
  const input = textPanel({ id: 'gc-input', label: 'Text to check', rows: 10, spellcheck: true, onChange: () => run() });
  const filt = { Mistake: true, Style: true, Hint: true };
  const checks = Object.keys(filt).map(k => check({ label: k === 'Mistake' ? 'Mistakes' : k === 'Style' ? 'Style' : 'Hints', value: true, onInput: v => { filt[k] = v; draw(); } }));
  let all = [], text = '', active = -1;
  const statsEl = stats([]);
  const list = h('ol', { class: 'text-findings' });
  const empty = h('p', { class: 'lt-empty', role: 'status' });
  const more = h('p', { class: 'lt-note', hidden: true });
  const preview = h('div', { class: 'text-preview', id: 'gc-preview', tabindex: '0', role: 'region', 'aria-label': 'Marked-up copy of your text' });
  const pNote = h('p', { class: 'lt-note', hidden: true });
  const readEl = h('div', {});
  const caveat = note('This is a rule-based checker that runs in your browser. It checks a fixed list of common problems, does not understand meaning or tone, will miss errors and will sometimes flag writing that is fine. Treat the results as suggestions, not corrections.', 'info');
  caveat.id = 'gc-caveat';

  function shown() { return all.filter(f => filt[f.kind]); }
  function drawPreview() {
    const fs = shown().filter(f => f.s < PREVIEW_CHARS).slice(0, MAX_SHOWN);
    const lim = Math.min(text.length, PREVIEW_CHARS);
    const cuts = new Set([0, lim]);
    for (const f of fs) { cuts.add(f.s); cuts.add(Math.min(f.e, lim)); }
    const pts = [...cuts].sort((a, b) => a - b);
    const frag = document.createDocumentFragment();
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1]; if (a >= b) continue;
      const cov = fs.filter(f => f.s <= a && f.e >= b);
      const str = text.slice(a, b);
      if (!cov.length) { frag.append(str); continue; }
      const narrow = cov.some(f => !f.wide);
      const mk = h('mark', { class: 'text-mk ' + (narrow ? 'narrow' : 'wide') + (cov.some(f => f.id === active) ? ' on' : ''), 'data-id': String(cov.find(f => !f.wide) ? cov.find(f => !f.wide).id : cov[0].id) }, str);
      frag.append(mk);
    }
    preview.replaceChildren(frag);
    pNote.textContent = text.length > lim ? `The marked text shows the first ${num(lim)} characters.` : ''; pNote.hidden = text.length <= lim;
    const on = preview.querySelector('mark.on');
    if (on) preview.scrollTop = Math.max(0, on.offsetTop - preview.clientHeight / 3);
  }
  function activate(id) {
    active = id; drawPreview();
    list.querySelectorAll('.text-finding-main').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.id) === id)));
  }
  function draw() {
    const fs = shown();
    list.replaceChildren();
    const counts = { Mistake: 0, Style: 0, Hint: 0 };
    for (const f of all) counts[f.kind]++;
    setStats(statsEl, [
      { label: 'Findings', value: num(all.length), big: true },
      { label: 'Mistakes', value: num(counts.Mistake) }, { label: 'Style', value: num(counts.Style) }, { label: 'Hints', value: num(counts.Hint) },
    ]);
    for (const f of fs.slice(0, MAX_SHOWN)) {
      const main = h('button', { class: 'text-finding-main', type: 'button', 'aria-pressed': String(f.id === active), 'data-id': String(f.id) },
        h('span', { class: 'text-tag text-tag-' + f.kind.toLowerCase() }, f.kind === 'Mistake' ? icon('alert', 'sm') : f.kind === 'Style' ? icon('info', 'sm') : icon('info', 'sm'), RULES[f.rule].label), snippetNode(text, f));
      main.addEventListener('click', () => activate(f.id));
      const li = h('li', { class: 'text-finding' }, main, h('p', { class: 'text-why' }, f.why), h('p', { class: 'text-fix' }, h('strong', {}, 'Suggestion: '), f.fix));
      if (f.replace !== undefined) {
        const ap = h('button', { class: 'btn btn-quiet btn-sm', type: 'button' }, icon('check', 'sm'), 'Apply this fix');
        ap.addEventListener('click', () => {
          const cur = input.get();
          if (cur !== text) return;
          active = -1; input.set(cur.slice(0, f.s) + f.replace + cur.slice(f.e)); announce('Fix applied. The text was checked again.');
        });
        li.append(ap);
      }
      list.append(li);
    }
    const hid = fs.length - Math.min(fs.length, MAX_SHOWN);
    more.hidden = hid <= 0; more.textContent = `Showing the first ${MAX_SHOWN} findings. ${num(hid)} more are not listed.`;
    empty.hidden = fs.length > 0;
    empty.textContent = !text.trim() ? 'Paste some text to check it.' : all.length ? 'No findings in the groups you selected.' : 'No findings. The checker did not spot any of the problems it looks for. It cannot catch everything.';
    drawPreview();
  }
  preview.addEventListener('click', e => { const mk = e.target.closest && e.target.closest('mark'); if (mk) { const id = Number(mk.dataset.id); activate(id); const b = list.querySelector(`.text-finding-main[data-id="${id}"]`); if (b) b.scrollIntoView({ block: 'nearest' }); } });

  function drawReadability(r) {
    readEl.replaceChildren();
    if (!r) { readEl.append(h('p', { class: 'lt-empty' }, 'Paste some English text to see its reading ease and grade level.')); return; }
    const rnd = (x, d) => { const k = 10 ** d, y = Math.round(Math.abs(x) * k + 1e-9) / k; return (x < 0 && y !== 0 ? '-' : '') + y.toFixed(d); }, f1 = x => rnd(x, 1), f2 = x => rnd(x, 2);
    const st = stats([]);
    setStats(st, [
      { label: 'Reading ease', value: f1(r.ease), hint: r.label, big: true },
      { label: 'US grade level', value: f1(r.grade) },
      { label: 'Words per sentence', value: f1(r.wps) },
      { label: 'Syllables per word', value: f2(r.spw) },
    ]);
    readEl.append(st,
      h('p', { class: 'text-formula' }, h('strong', {}, 'Flesch reading ease'), ' = 206.835 \u2212 1.015 \u00D7 (words \u00F7 sentences) \u2212 84.6 \u00D7 (syllables \u00F7 words)'),
      h('p', { class: 'text-formula' }, `= 206.835 \u2212 1.015 \u00D7 ${f2(r.wps)} \u2212 84.6 \u00D7 ${f2(r.spw)} = ${f1(r.ease)}`),
      h('p', { class: 'text-formula' }, h('strong', {}, 'Flesch-Kincaid grade level'), ' = 0.39 \u00D7 (words \u00F7 sentences) + 11.8 \u00D7 (syllables \u00F7 words) \u2212 15.59'),
      h('p', { class: 'text-formula' }, `= 0.39 \u00D7 ${f2(r.wps)} + 11.8 \u00D7 ${f2(r.spw)} \u2212 15.59 = ${f1(r.grade)}`),
      h('p', { class: 'lt-note' }, `Counted: ${plural(r.words, 'word')}, ${plural(r.sentences, 'sentence')}, ${plural(r.syllables, 'syllable')}. The formulas are made for English and syllables are estimated by rule, so treat the scores as a rough guide. They are steadier on texts of 100 words or more.`));
  }
  function run() {
    text = input.get();
    all = text.trim() ? checkText(text) : [];
    if (active >= all.length) active = -1;
    draw(); drawReadability(text.trim() ? readability(text) : null);
    root._summary = text.trim() ? `${plural(all.length, 'finding')}.` : '';
  }
  input.input.addEventListener('change', () => announce(root._summary || ''));
  const findPanel = panel('Findings', h('div', { class: 'text-filters', role: 'group', 'aria-label': 'Show findings of type' }, ...checks.map(c => c.el)), statsEl, empty, list, more);
  root.append(caveat, input.el, findPanel, panel('Your text with findings marked', h('p', { class: 'text-hint' }, 'Select a finding above to highlight it here. Select a highlight here to jump to its finding.'), preview, pNote), panel('Readability', readEl));
  run();
}

export const GRAMMAR_TOOLS = [{
  id: 'grammar-style-checker', slug: 'grammar-style-checker', name: 'Basic Grammar and Style Checker',
  blurb: 'Spot repeated words, spacing slips, long sentences and wordy phrases, plus a readability score.',
  keywords: 'grammar checker style checker proofreading repeated words passive voice readability flesch reading ease grade level wordy',
  icon: 'grammar', kind: 'live',
  seo: {
    title: 'Free Basic Grammar and Style Checker Online' + SUFFIX,
    description: 'Check text for repeated words, spacing slips, long sentences and wordy phrases, plus a Flesch score. A basic rule-based checker in your browser.',
    h1: 'Basic Grammar and Style Checker',
    intro: 'Paste your writing to find repeated words, spacing and capital letter slips, very long sentences and wordy phrases, and to see how readable it is. It is a basic rule-based checker that runs in your browser.',
    steps: ['Paste or type your text into the box.', 'Read the findings. Each one shows the snippet, why it was flagged and a suggested fix.', 'Select a finding to see it highlighted in your text, then fix it or apply the suggestion.'],
    faq: [
      ['Is this a full grammar checker?', 'No. It is a rule-based checker that looks for a fixed list of common problems. It does not understand meaning, tone or context, so it will miss many errors and sometimes flag writing that is correct. Use it as a quick first pass, then read your text yourself.'],
      ['Does it use AI?', 'No. It uses plain pattern rules and word lists that run in your browser. There is no AI and no online service behind it.'],
      ['Is my text uploaded anywhere?', 'No. Checking happens in your browser. Your text is not sent to a server and the page makes no network requests while you type.'],
      ['What does it check?', 'Repeated words, double spaces, spaces before or missing after punctuation, sentences that start with a small letter, paragraphs with no end punctuation, sentences over 35 words, a short list of wordy phrases and common mix-ups such as could of, a possible passive voice, a or an, and unmatched brackets and quotes.'],
      ['How reliable is the passive voice hint?', 'It is only a hint. The check looks for a form of the verb be followed by a word that looks like a past participle, so it can flag phrases like is tired and miss some real passives. Passive voice is not always wrong.'],
      ['How are the readability scores worked out?', 'Flesch reading ease is 206.835 minus 1.015 times words per sentence minus 84.6 times syllables per word. The grade level is 0.39 times words per sentence plus 11.8 times syllables per word minus 15.59. The formulas are made for English and syllables are estimated by rule, so the scores are approximate.'],
    ],
    related: ['word-counter', 'text-cleaner', 'text-compare', 'character-counter'],
  },
  mount(container) { mountGrammar(container); },
}];
