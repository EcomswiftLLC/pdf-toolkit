// Pure text helpers shared by the text kit (no DOM). Everything here runs locally; nothing is sent anywhere.
// Unicode handling: Intl.Segmenter is used where it matters (clusters, scripts written without spaces); fast regex paths are used otherwise.

export const normalizeNewlines = t => String(t).replace(/\r\n?|\u2028|\u2029/g, '\n');

// "a\nb\n" -> ['a','b'] (a final newline does not make an extra empty line); '' -> []
export function splitLines(t) {
  if (!t) return [];
  const a = normalizeNewlines(t).split('\n');
  if (a[a.length - 1] === '') a.pop();
  return a;
}

// ---------- characters ----------
const HAS_SEG = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';
let graphSeg = null, wordSeg = null;
// Text that contains none of these has exactly one grapheme per code point, so we can skip the (slow) segmenter.
const CLUSTER = /[\p{M}\u200C\u200D\uFE0F\u1100-\u11FF\u{1F1E6}-\u{1F1FF}\p{Emoji_Modifier}\u{E0020}-\u{E007F}]/u;
// Scripts written without spaces between words: words need a dictionary, so we ask Intl.Segmenter.
const NOSPACE = /[\u0E00-\u0EFF\u1000-\u109F\u1780-\u17FF\u2E80-\u2FDF\u3040-\u30FF\u3100-\u312F\u3190-\u9FFF\uA000-\uA4CF\uF900-\uFAFF\uFF66-\uFF9F\u{20000}-\u{3FFFF}]/u;

export function countCodePoints(t) {
  let n = t.length;
  for (let i = 0; i < t.length - 1; i++) {
    const c = t.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF) { const d = t.charCodeAt(i + 1); if (d >= 0xDC00 && d <= 0xDFFF) { n--; i++; } }
  }
  return n;
}
export function countGraphemes(t) {
  if (!t) return 0;
  if (HAS_SEG && CLUSTER.test(t)) {
    graphSeg ||= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    let n = 0; for (const _ of graphSeg.segment(t)) n++; // eslint-disable-line no-unused-vars
    return n;
  }
  return countCodePoints(t);
}
export const utf8Bytes = t => new TextEncoder().encode(t).length;

// ---------- words ----------
const HAS_ALNUM = /[\p{L}\p{N}]/u;
const FALLBACK_WORD = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]|[^\s\u2013\u2014\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]+/gu;
// A word is a group of letters or digits between spaces (or a long dash). Stand-alone symbols do not count.
export function wordTokens(t) {
  if (!t) return [];
  if (NOSPACE.test(t)) {
    if (HAS_SEG) {
      wordSeg ||= new Intl.Segmenter(undefined, { granularity: 'word' });
      const out = [];
      for (const s of wordSeg.segment(t)) if (s.isWordLike) out.push(s.segment);
      return out;
    }
    return (t.match(FALLBACK_WORD) || []).filter(x => HAS_ALNUM.test(x));
  }
  const parts = t.split(/[\s\u2013\u2014]+/u), out = [];
  for (let i = 0; i < parts.length; i++) if (HAS_ALNUM.test(parts[i])) out.push(parts[i]);
  return out;
}
// lower-case, straight apostrophes, no punctuation at the edges: used for frequency and keyword counts
export function normWord(w) {
  return w.replace(/[\u2019\u2018\u02BC]/g, "'").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase();
}

export const STOP_WORDS = new Set(('a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves ' +
  "i'm i've i'll i'd you're you've you'll you'd he's she's it's we're we've we'll they're they've they'll that's there's isn't aren't wasn't weren't don't doesn't didn't won't can't couldn't shouldn't wouldn't hasn't haven't hadn't let's").split(' '));

// ---------- paragraphs and sentences (ranges into the original string) ----------
export function paragraphRanges(t) {
  const out = [], sep = /\n[^\S\n]*(?:\n[^\S\n]*)+/g;
  let last = 0, m;
  const push = (s, e) => { const seg = t.slice(s, e); const a = seg.search(/\S/); if (a < 0) return; const b = seg.length - (seg.length - seg.trimEnd().length); out.push({ s: s + a, e: s + b }); };
  while ((m = sep.exec(t))) { push(last, m.index); last = m.index + m[0].length; }
  push(last, t.length);
  return out;
}
const ABBR = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'inc', 'ltd', 'co', 'corp', 'e.g', 'i.e', 'fig', 'approx', 'dept', 'est', 'vol', 'a.m', 'p.m', 'cf', 'ca', 'mt', 'gen', 'col', 'lt', 'sgt', 'capt', 'rev', 'hon']);
const TERM = /[.!?\u2026]+["'\u201D\u2019)\]\u00BB]*(?=\s|$)|[\u3002\uFF01\uFF1F]+[\u300D\u300F\u201D\u2019)\]]*/gu;
export function sentenceRanges(t) {
  const out = [];
  for (const p of paragraphRanges(t)) {
    const par = t.slice(p.s, p.e);
    let start = 0, m; TERM.lastIndex = 0;
    const add = (a, b) => { const seg = par.slice(a, b); if (!HAS_ALNUM.test(seg)) return false; const lead = seg.search(/\S/); out.push({ s: p.s + a + lead, e: p.s + b - (seg.length - seg.trimEnd().length) }); return true; };
    while ((m = TERM.exec(par))) {
      const end = m.index + m[0].length, piece = par.slice(start, end);
      if (m[0][0] === '.' && /^\.["'\u201D\u2019)\]]*$/.test(m[0])) {
        const tok = (/([\p{L}.]+)\.["'\u201D\u2019)\]]*$/u.exec(piece) || [])[1];
        if (tok && ABBR.has(tok.toLowerCase())) continue;
        if (/^\s*\d+\.$/.test(piece)) continue; // "1." list numbers
      }
      add(start, end); start = end;
    }
    add(start, par.length);
  }
  return out;
}

// ---------- formatting ----------
export function fmtDuration(sec) {
  sec = Math.round(sec);
  if (sec <= 0) return '0 sec';
  if (sec < 60) return sec + ' sec';
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m} min ${s} sec` : `${m} min`;
}
export const nf = n => Number(n).toLocaleString('en-US');

// ---------- the word counter ----------
export function analyzeText(text, o = {}) {
  const t = normalizeNewlines(text || '');
  const toks = wordTokens(t);
  const words = toks.length;
  const norms = []; let letters = 0;
  for (const w of toks) { const n = normWord(w); norms.push(n); letters += countCodePoints(n); }
  const sentences = sentenceRanges(t).length;
  const paragraphs = paragraphRanges(t).length;
  const lines = splitLines(t).length;
  const chars = countGraphemes(t);
  const charsNoSpaces = countGraphemes(t.replace(/\s+/gu, ''));
  const freq = new Map();
  for (const n of norms) { if (!n) continue; if (o.stop && STOP_WORDS.has(n)) continue; freq.set(n, (freq.get(n) || 0) + 1); }
  const top = [...freq].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([word, count]) => ({ word, count, pct: words ? count / words * 100 : 0 }));
  let keyword = null;
  if (o.keyword && o.keyword.trim()) {
    const k = wordTokens(o.keyword).map(normWord).filter(Boolean);
    if (k.length) {
      let count = 0;
      for (let i = 0; i + k.length <= norms.length; i++) { let ok = true; for (let j = 0; j < k.length; j++) if (norms[i + j] !== k[j]) { ok = false; break; } if (ok) count++; }
      keyword = { phrase: k.join(' '), count, density: words ? count / words * 100 : 0 };
    }
  }
  return {
    words, chars, charsNoSpaces, sentences, paragraphs, lines,
    avgWordLength: words ? letters / words : 0,
    readSec: words / 200 * 60, speakSec: words / 130 * 60,
    top, keyword,
  };
}

// ---------- character counter: SMS ----------
const GSM = new Set(Array.from('@\u00A3$\u00A5\u00E8\u00E9\u00F9\u00EC\u00F2\u00C7\n\u00D8\u00F8\r\u00C5\u00E5\u0394_\u03A6\u0393\u039B\u03A9\u03A0\u03A8\u03A3\u0398\u039E\u00C6\u00E6\u00DF\u00C9 !"#\u00A4%&\'()*+,-./0123456789:;<=>?\u00A1ABCDEFGHIJKLMNOPQRSTUVWXYZ\u00C4\u00D6\u00D1\u00DC\u00A7\u00BFabcdefghijklmnopqrstuvwxyz\u00E4\u00F6\u00F1\u00FC\u00E0'));
const GSM_EXT = new Set(Array.from('^{}\\[~]|\u20AC\f'));
export function smsInfo(text) {
  let gsm = true, units = 0;
  for (const ch of text) { if (GSM.has(ch)) units += 1; else if (GSM_EXT.has(ch)) units += 2; else { gsm = false; break; } }
  if (gsm) return { encoding: 'GSM-7', units, single: 160, multi: 153, segments: units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153) };
  units = text.length; // UTF-16 code units: an emoji is 2
  return { encoding: 'Unicode', units, single: 70, multi: 67, segments: units <= 70 ? 1 : Math.ceil(units / 67) };
}

// ---------- case conversion ----------
export const SMALL_WORDS = new Set('a an the and but or nor for so yet as at by in of off on per to up via vs if'.split(' '));
const firstCp = s => String.fromCodePoint(s.codePointAt(0));
const capWord = w => w ? firstCp(w).toUpperCase() + w.slice(firstCp(w).length).toLowerCase() : w;

export function titleCase(text) {
  const letters = text.replace(/[^\p{L}]/gu, '');
  const allCaps = letters !== '' && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  const src = allCaps ? text.toLowerCase() : text;
  const toks = [...src.matchAll(/[\p{L}\p{N}]+(?:['\u2019][\p{L}\p{N}]+)*/gu)];
  const BREAK = /[!?:\n]|\.(?=\s|$)|\u2026/;
  let out = '', pos = 0;
  toks.forEach((m, i) => {
    const prevSep = src.slice(i ? toks[i - 1].index + toks[i - 1][0].length : 0, m.index);
    const end = m.index + m[0].length, nextSep = src.slice(end, i + 1 < toks.length ? toks[i + 1].index : src.length);
    const first = i === 0 || BREAK.test(prevSep), last = i === toks.length - 1 || BREAK.test(nextSep);
    const compoundStart = nextSep === '-' && prevSep !== '-'; // up-to-date: the first part is capitalised
    const w = m[0];
    let r;
    if (!allCaps && /\p{Lu}/u.test(w.slice(firstCp(w).length))) r = w; // iPhone, NASA, McDonald: keep
    else if (!first && !last && !compoundStart && SMALL_WORDS.has(w.toLowerCase())) r = w.toLowerCase();
    else r = capWord(w);
    out += src.slice(pos, m.index) + r; pos = end;
  });
  return out + src.slice(pos);
}
export function sentenceCase(text) {
  let s = text.toLowerCase();
  s = s.replace(/(^\s*|[.!?\u2026]["'\u201D\u2019)\]]*\s+|\n\s*)(["'\u201C\u2018(\[\u00BF\u00A1]*)(\p{L})/gu, (m, a, b, c) => a + b + c.toUpperCase());
  s = s.replace(/(^|[^\p{L}\p{N}'\u2019-])i(?=(?:['\u2019](?:m|ll|ve|d)(?![\p{L}\p{N}]))|[^\p{L}\p{N}'\u2019]|$)/gu, (m, a) => a + 'I');
  return s;
}
export function splitWords(s) {
  s = s.replace(/['\u2019\u2018\u02BC]/g, '');
  const out = [];
  for (const chunk of s.split(/[^\p{L}\p{M}\p{N}]+/u)) {
    if (!chunk) continue;
    const m = chunk.replace(/(\p{Ll})(\p{Lu})/gu, '$1\u0001$2').replace(/(\p{N})(\p{Lu}\p{Ll})/gu, '$1\u0001$2').replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1\u0001$2');
    for (const w of m.split('\u0001')) if (w) out.push(w);
  }
  return out;
}
const perLine = (text, fn) => text.split('\n').map(l => fn(splitWords(l))).join('\n');
export const CASES = {
  upper: t => t.toUpperCase(),
  lower: t => t.toLowerCase(),
  title: titleCase,
  sentence: sentenceCase,
  camel: t => perLine(t, w => w.map((x, i) => i ? capWord(x) : x.toLowerCase()).join('')),
  pascal: t => perLine(t, w => w.map(capWord).join('')),
  snake: t => perLine(t, w => w.map(x => x.toLowerCase()).join('_')),
  kebab: t => perLine(t, w => w.map(x => x.toLowerCase()).join('-')),
  constant: t => perLine(t, w => w.map(x => x.toUpperCase()).join('_')),
  alternating: t => { let n = 0; return Array.from(t, ch => { if (ch.toUpperCase() === ch.toLowerCase()) return ch; return (n++ % 2) ? ch.toUpperCase() : ch.toLowerCase(); }).join(''); },
  inverse: t => Array.from(t, ch => { const u = ch.toUpperCase(), l = ch.toLowerCase(); if (u === l) return ch; return ch === u ? l : u; }).join(''),
};

// ---------- duplicate lines ----------
export function dedupeLines(text, o = {}) {
  const lines = splitLines(text);
  const items = lines.map((l, i) => { const v = o.trim ? l.trim() : l; return { n: i + 1, v, k: o.caseSensitive === false ? v.toLowerCase() : v }; });
  let emptyRemoved = 0;
  const pool = o.ignoreEmpty ? items.filter(x => { if (x.v.trim() === '') { emptyRemoved++; return false; } return true; }) : items;
  const keepIdx = new Map(); // key -> index in pool of the line we keep
  pool.forEach((x, i) => { if (o.keep === 'last' || !keepIdx.has(x.k)) keepIdx.set(x.k, i); });
  const kept = [], removed = [];
  pool.forEach((x, i) => { if (keepIdx.get(x.k) === i) kept.push(x); else removed.push({ line: x.n, text: x.v, of: pool[keepIdx.get(x.k)].n }); });
  if (o.sort === 'asc' || o.sort === 'desc') {
    const col = new Intl.Collator('en');
    kept.sort((a, b) => col.compare(a.v, b.v) || a.n - b.n);
    if (o.sort === 'desc') kept.reverse();
  }
  return { lines: kept.map(x => x.v), removed, emptyRemoved, total: lines.length };
}

// ---------- sorting ----------
export function secureRandomInt(n) { // 0 <= r < n, no modulo bias
  const c = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : null;
  if (!c) return Math.floor(Math.random() * n);
  const buf = new Uint32Array(1), lim = Math.floor(0x100000000 / n) * n;
  do { c.getRandomValues(buf); } while (buf[0] >= lim);
  return buf[0] % n;
}
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = secureRandomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const NUM = /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?\s*$/i;
export function sortLines(text, o = {}) {
  let lines = splitLines(text);
  if (o.removeEmpty) lines = lines.filter(l => l.trim() !== '');
  const sens = o.ignoreCase === false ? 'variant' : 'accent';
  const alpha = new Intl.Collator('en', { sensitivity: sens });
  const natural = new Intl.Collator('en', { sensitivity: sens, numeric: true });
  const idx = lines.map((l, i) => i);
  const cmp = {
    asc: (a, b) => alpha.compare(lines[a], lines[b]),
    desc: (a, b) => alpha.compare(lines[b], lines[a]),
    numeric: (a, b) => {
      const x = lines[a], y = lines[b], nx = NUM.test(x), ny = NUM.test(y);
      if (nx && ny) return Number(x) - Number(y);
      if (nx !== ny) return nx ? -1 : 1;
      return natural.compare(x, y);
    },
    lenasc: (a, b) => countCodePoints(lines[a]) - countCodePoints(lines[b]),
    lendesc: (a, b) => countCodePoints(lines[b]) - countCodePoints(lines[a]),
  }[o.mode];
  if (o.mode === 'reverse') return lines.slice().reverse();
  if (o.mode === 'shuffle') return shuffle(lines);
  if (!cmp) return lines;
  idx.sort((a, b) => cmp(a, b) || a - b); // stable: ties keep the original order
  return idx.map(i => lines[i]);
}

// ---------- text cleaner ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0', copy: '\u00A9', reg: '\u00AE', trade: '\u2122', hellip: '\u2026', mdash: '\u2014', ndash: '\u2013', lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D', euro: '\u20AC', pound: '\u00A3', yen: '\u00A5', cent: '\u00A2', laquo: '\u00AB', raquo: '\u00BB', bull: '\u2022', middot: '\u00B7', times: '\u00D7', deg: '\u00B0' };
// Removes tags and decodes common entities. Works on strings only: the result is never parsed or inserted as HTML.
export function stripHtml(s) {
  let tags = 0, ents = 0;
  s = s.replace(/<!--[\s\S]*?-->/g, () => { tags++; return ''; });
  s = s.replace(/<(script|style)\b[^<>]*>[\s\S]*?<\/\1\s*>/gi, () => { tags++; return ''; });
  s = s.replace(/<\/(?:p|div|li|tr|h[1-6]|ul|ol|table|section|article|header|footer|blockquote|pre)\s*>|<(?:br|hr)\b(?:"[^"]*"|'[^']*'|[^'"<>])*>/gi, () => { tags++; return '\n'; });
  s = s.replace(/<[/!?]?[A-Za-z][^\s<>/]*(?:"[^"]*"|'[^']*'|[^'"<>])*>/g, () => { tags++; return ''; });
  s = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    let r;
    if (e[0] === '#') { const c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); r = (c > 0 && c <= 0x10FFFF && !(c >= 0xD800 && c <= 0xDFFF)) ? String.fromCodePoint(c) : null; }
    else r = ENT[e.toLowerCase()] ?? null;
    if (r == null) return m; ents++; return r;
  });
  return { text: s, tags, ents };
}
export function smartQuotes(t) {
  let n = 0;
  t = t.replace(/(^|[\s(\[{\u2014\u2013-])"/gm, (m, p) => { n++; return p + '\u201C'; });
  t = t.replace(/"/g, () => { n++; return '\u201D'; });
  t = t.replace(/(^|[\s(\[{\u2014\u2013"\u201C-])'(?=[\p{L}\p{N}])/gmu, (m, p) => { n++; return p + '\u2018'; });
  t = t.replace(/'/g, () => { n++; return '\u2019'; });
  return { text: t, n };
}
export function straightQuotes(t) {
  let n = 0;
  t = t.replace(/[\u2018\u2019\u201A\u201B\u2032]/g, () => { n++; return "'"; }).replace(/[\u201C\u201D\u201E\u201F\u2033]/g, () => { n++; return '"'; });
  return { text: t, n };
}
const BLANK = l => l.trim() === '';
export function cleanText(text, o = {}) {
  let t = normalizeNewlines(text || '');
  const c = { html: 0, entities: 0, invisible: 0, spaces: 0, collapsed: 0, trimmed: 0, quotes: 0, dashes: 0, dehyphen: 0, joined: 0, blank: 0, breaks: 0 };
  const before = t;
  if (o.html) { const r = stripHtml(t); t = r.text; c.html = r.tags; c.entities = r.ents; }
  if (o.invisible) t = t.replace(/[\u200B\u2060\uFEFF\u00AD\u180E\u2061-\u2064\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, () => { c.invisible++; return ''; });
  if (o.specialSpaces) t = t.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, () => { c.spaces++; return ' '; });
  if (o.quotes === 'straight') { const r = straightQuotes(t); t = r.text; c.quotes = r.n; }
  else if (o.quotes === 'smart') { const r = smartQuotes(t); t = r.text; c.quotes = r.n; }
  if (o.dashes === 'hyphen') t = t.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, () => { c.dashes++; return '-'; });
  let lines = t.split('\n');
  if (o.collapse) lines = lines.map(l => { const r = l.replace(/([^\S\n])[^\S\n]+/g, '$1'); c.collapsed += l.length - r.length; return r; });
  if (o.trimLines) lines = lines.map(l => { const r = l.trim(); if (r !== l) c.trimmed++; return r; });
  t = lines.join('\n');
  if (o.dehyphen) t = t.replace(/(\p{L})-[^\S\n]*\n[^\S\n]*(\p{Ll})/gu, (m, a, b) => { c.dehyphen++; return a + b; });
  lines = t.split('\n');
  if (o.noBreaks) {
    const nonBlank = lines.filter(l => !BLANK(l));
    c.breaks = Math.max(0, lines.length - 1);
    t = nonBlank.map(l => l.trim()).join(' ');
    lines = [t];
  } else {
    if (o.join) {
      const out = []; let cur = [], paras = 0, nb = 0;
      const flush = () => { if (cur.length) { out.push(cur.join(' ')); paras++; cur = []; } };
      for (const l of lines) { if (BLANK(l)) { flush(); out.push(l); } else { cur.push(l.trim()); nb++; } }
      flush(); c.joined = nb - paras; lines = out;
    }
    if (o.removeBlank) { const n = lines.length - (lines.length > 1 && lines[lines.length - 1] === '' ? 1 : 0); lines = lines.filter(l => !BLANK(l)); c.blank = n - lines.length; }
    else if (o.limitBlank) { const out = []; for (const l of lines) { if (BLANK(l) && out.length && BLANK(out[out.length - 1])) { c.blank++; continue; } out.push(l); } lines = out; }
    t = lines.join('\n');
  }
  if (o.trimLines || o.removeBlank || o.noBreaks) t = t.replace(/^\n+|\n+$/g, '');
  return { text: t, counts: c, before: before.length, after: t.length, changed: t !== before };
}

// ---------- slug ----------
export function slugify(text, o = {}) {
  const sep = o.sep || '-';
  let s = String(text).normalize('NFKD').replace(/\p{M}+/gu, '');
  s = s.replace(/\u00DF/g, 'ss').replace(/[\u00E6\u00C6]/g, 'ae').replace(/[\u00F8\u00D8]/g, 'o').replace(/[\u0111\u0110]/g, 'd').replace(/[\u0142\u0141]/g, 'l').replace(/[\u0153\u0152]/g, 'oe');
  s = s.replace(/&/g, ' and ').toLowerCase();
  s = s.replace(/[^\p{L}\p{N}]+/gu, sep);
  if (o.asciiOnly) s = s.replace(/[^a-z0-9-_]+/g, sep);
  const esc = sep.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  return s.replace(new RegExp(`${esc}{2,}`, 'g'), sep).replace(new RegExp(`^${esc}|${esc}$`, 'g'), '');
}
