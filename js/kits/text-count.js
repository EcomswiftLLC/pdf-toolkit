// Word Counter and Character Counter. Everything runs in the browser.
import { h, icon, panel, textPanel, announce, stats, setStats, num, plural, hint } from './text-ui.js';
import { field, check } from '../ui.js';
import { analyzeText, countGraphemes, utf8Bytes, wordTokens, smsInfo, fmtDuration } from './text-lib.js';

const SUFFIX = ' | Ecom Swift LLC';

// ------------------------------------------------------------------ Word Counter
function mountWordCounter(root) {
  let stopWords = true, keyword = '';
  const input = textPanel({
    id: 'wc-input', label: 'Text to count', rows: 12, onChange: () => update(),
  });
  const statsEl = stats([]);
  const how = h('p', { class: 'lt-note' }, 'How we count: a word is a group of letters or digits between spaces, so well-known is one word and a lone symbol is none. Characters are what you see, so an emoji or an accented letter counts once. Chinese, Japanese and Thai words are found with your browser\u2019s built-in word dictionary, so those counts can differ a little between browsers.');
  const countsPanel = panel('Counts', statsEl, how);

  const stop = check({ label: 'Hide common words (the, and, of)', value: true, onInput: v => { stopWords = v; update(); } });
  const topList = h('ol', { class: 'text-top', 'aria-label': 'Most used words' });
  const topEmpty = h('p', { class: 'lt-empty' }, 'Type some text to see the words you use most.');
  const topPanel = panel('Most used words', stop.el, topList, topEmpty);

  const kw = field({ id: 'wc-keyword', label: 'Keyword or phrase', placeholder: 'For example: free tools', help: 'Shows how often it appears and its density: appearances \u00F7 total words \u00D7 100.', onInput: v => { keyword = v; update(); } });
  const kwOut = h('div', { class: 'text-kw', role: 'status' });
  const kwPanel = panel('Keyword density', kw.el, kwOut);

  function update() {
    const r = analyzeText(input.get(), { stop: stopWords, keyword });
    setStats(statsEl, [
      { label: 'Words', value: num(r.words), big: true },
      { label: 'Characters', value: num(r.chars) },
      { label: 'Characters without spaces', value: num(r.charsNoSpaces) },
      { label: 'Sentences', value: num(r.sentences) },
      { label: 'Paragraphs', value: num(r.paragraphs) },
      { label: 'Lines', value: num(r.lines) },
      { label: 'Average word length', value: r.words ? r.avgWordLength.toFixed(1) : '0', hint: 'letters per word' },
      { label: 'Reading time', value: fmtDuration(r.readSec), hint: '200 words a minute' },
      { label: 'Speaking time', value: fmtDuration(r.speakSec), hint: '130 words a minute' },
    ]);
    topList.replaceChildren();
    const max = r.top.length ? r.top[0].count : 1;
    for (const t of r.top) {
      const bar = h('span', { class: 'text-bar-s', 'aria-hidden': 'true' }, h('i', {}));
      bar.firstChild.style.width = Math.max(4, t.count / max * 100) + '%';
      topList.append(h('li', {}, h('span', { class: 'w' }, t.word), bar, h('span', { class: 'c' }, `${num(t.count)} ${t.count === 1 ? 'time' : 'times'}, ${t.pct.toFixed(1)}%`)));
    }
    topEmpty.hidden = r.top.length > 0;
    topEmpty.textContent = r.words ? 'Every word in your text is a common word. Turn off the filter above to see them.' : 'Type some text to see the words you use most.';
    if (!keyword.trim()) kwOut.textContent = 'Type a keyword or phrase to see how often it appears.';
    else if (!r.words) kwOut.textContent = 'Add some text first.';
    else if (r.keyword) kwOut.textContent = `\u201C${r.keyword.phrase}\u201D appears ${plural(r.keyword.count, 'time')} in ${plural(r.words, 'word')}: a density of ${r.keyword.density.toFixed(2)}%.`;
    else kwOut.textContent = 'That keyword has no letters or digits to look for.';
    root._summary = `${plural(r.words, 'word')}, ${plural(r.chars, 'character')}.`;
  }
  const cols = h('div', { class: 'lt-cols' }, input.el, countsPanel);
  const cols2 = h('div', { class: 'lt-cols text-even' }, topPanel, kwPanel);
  root.append(cols, cols2);
  input.input.addEventListener('change', () => announce(root._summary || ''));
  update();
}

// ------------------------------------------------------------------ Character Counter
const PRESETS = [
  { id: 'x', name: 'X (Twitter) post', limit: 280, note: 'Counts plain characters. X counts every link as 23 characters and some scripts as 2, so the real limit can differ.' },
  { id: 'sms', name: 'SMS text message', limit: 160, note: '' },
  { id: 'title', name: 'Meta title', limit: 60, note: 'Search engines cut titles by pixel width, so 60 is a guide.' },
  { id: 'desc', name: 'Meta description', limit: 160, note: 'Search engines cut descriptions by pixel width, so 160 is a guide.' },
  { id: 'ig', name: 'Instagram caption', limit: 2200, note: '' },
  { id: 'custom', name: 'Your own limit', limit: 100, note: '' },
];

function meter(p) {
  const name = h('span', { class: 'text-meter-name' }, p.name);
  const count = h('span', { class: 'text-meter-n' });
  const fill = h('i', {});
  const bar = h('div', { class: 'text-meter-bar', role: 'meter', 'aria-label': p.name, 'aria-valuemin': '0' }, fill);
  const status = h('p', { class: 'text-meter-s' });
  const extra = h('p', { class: 'text-meter-x' });
  const el = h('li', { class: 'text-meter', 'data-id': p.id }, h('div', { class: 'text-meter-h' }, name, count), bar, status, extra);
  return {
    el,
    set(used, limit, o = {}) {
      const over = used > limit, left = limit - used;
      el.dataset.state = over ? 'over' : (limit && used / limit >= 0.9 ? 'near' : 'ok');
      count.textContent = `${num(used)} / ${num(limit)}`;
      fill.style.width = Math.min(100, limit ? used / limit * 100 : 0) + '%';
      bar.setAttribute('aria-valuemax', String(limit)); bar.setAttribute('aria-valuenow', String(Math.min(used, limit)));
      bar.setAttribute('aria-valuetext', over ? `${used} of ${limit}, ${used - limit} over the limit` : `${used} of ${limit}`);
      status.replaceChildren(over ? icon('alert', 'sm') : icon('check', 'sm'), over ? `Over the limit by ${num(used - limit)}` : `${num(left)} left`);
      extra.textContent = o.extra || '';
    },
  };
}

function mountCharacterCounter(root) {
  let customLimit = 100;
  const input = textPanel({ id: 'cc-input', label: 'Text to count', rows: 10, onChange: () => update() });
  const statsEl = stats([]);
  const countsPanel = panel('Counts', statsEl, h('p', { class: 'lt-note' }, 'Characters are what you see: an emoji or an accented letter counts once, and a line break counts as one. Bytes are the size of the text saved as UTF-8.'));
  const meters = PRESETS.map(p => ({ p, m: meter(p) }));
  const lim = field({ id: 'cc-limit', label: 'Your own limit', type: 'number', min: 1, max: 1000000, value: 100, inputmode: 'numeric', help: 'Characters allowed. The last bar below follows this number.', onInput: (v, f) => {
    const n = Math.floor(Number(v));
    if (!v.trim() || !Number.isFinite(n) || n < 1) { f.error('Enter a whole number of 1 or more.'); return; }
    f.error(''); customLimit = n; update();
  } });
  const list = h('ul', { class: 'text-meters' }, meters.map(x => x.m.el));
  const smsNote = h('p', { class: 'lt-note', id: 'cc-sms-note' });
  const notes = h('ul', { class: 'text-notes' }, PRESETS.filter(p => p.note).map(p => h('li', {}, h('strong', {}, p.name + ': '), p.note)));
  const limitsPanel = panel('Limits', lim.el, list, smsNote, notes);

  function update() {
    const t = input.get();
    const chars = countGraphemes(t);
    const bytes = utf8Bytes(t);
    const noSp = countGraphemes(t.replace(/\s+/gu, ''));
    const words = wordTokens(t).length;
    setStats(statsEl, [
      { label: 'Characters', value: num(chars), big: true },
      { label: 'Characters without spaces', value: num(noSp) },
      { label: 'Bytes (UTF-8)', value: num(bytes) },
      { label: 'Words', value: num(words) },
      { label: 'Lines', value: num(t ? t.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').length : 0) },
    ]);
    const sms = smsInfo(t);
    for (const { p, m } of meters) {
      if (p.id === 'sms') m.set(sms.units, sms.single, { extra: sms.segments > 1 ? `Sent as ${sms.segments} messages (${sms.multi} characters each).` : '' });
      else if (p.id === 'custom') m.set(chars, customLimit);
      else m.set(chars, p.limit);
    }
    smsNote.textContent = t
      ? (sms.encoding === 'GSM-7' ? `SMS: this text uses standard GSM-7 characters, so one message holds ${sms.single}.` : 'SMS: this text has characters outside the standard GSM-7 set (an emoji or a special letter), so it is sent as Unicode and one message holds only 70.')
      : 'SMS: a message holds 160 standard characters. Add an emoji or a special letter and it switches to Unicode, which holds 70.';
    root._summary = `${plural(chars, 'character')}, ${plural(bytes, 'byte')}.`;
  }
  root.append(h('div', { class: 'lt-cols' }, input.el, countsPanel), limitsPanel);
  input.input.addEventListener('change', () => announce(root._summary || ''));
  update();
}

export const COUNT_TOOLS = [
  {
    id: 'word-counter', slug: 'word-counter', name: 'Word Counter',
    blurb: 'Count words, characters, sentences and reading time as you type.',
    keywords: 'word count character count reading time speaking time keyword density sentences paragraphs',
    icon: 'wordcount', kind: 'live',
    seo: {
      title: 'Free Word Counter: Count Words and Characters' + SUFFIX,
      description: 'Count words, characters, sentences, paragraphs and reading time as you type. A free word counter that runs in your browser, so your text stays private.',
      h1: 'Word Counter',
      intro: 'Paste or type your text to see the word, character, sentence and paragraph counts, plus reading and speaking time. It all runs in your browser, so your text is never uploaded.',
      steps: ['Paste or type your text into the box.', 'Read the counts, reading time and most used words as they update.', 'Type a keyword if you want to see how often it appears.'],
      faq: [
        ['Is my text uploaded anywhere?', 'No. The counting happens in your browser and your text never leaves your device. The page makes no requests while you type, and closing the tab clears everything.'],
        ['How does it count words?', 'A word is a group of letters or digits separated by spaces or a long dash. A hyphenated word such as well-known counts as one, and a lone symbol counts as none. This is close to how word processors count, but totals can differ by a few words.'],
        ['How are emoji, Chinese, Japanese and Thai handled?', 'Characters are counted as you see them, so an emoji or a letter with an accent counts once. Scripts written without spaces are split into words with the browser\u2019s built-in word dictionary, so those counts can differ a little from one browser to another.'],
        ['How is reading time worked out?', 'Reading time assumes 200 words a minute and speaking time assumes 130 words a minute. These are common averages. Real speed depends on the reader, the speaker and how hard the text is.'],
        ['What does the common words filter do?', 'It hides short everyday English words such as the, and and of from the most used list, so the words that matter show up. Turn it off to see every word. Keyword density is how many times your keyword or phrase appears divided by the total words, times 100.'],
        ['Is there a limit on how much text I can paste?', 'There is no fixed limit. A very long text, many megabytes, can feel slower because your own device does the work.'],
      ],
      related: ['character-counter', 'text-cleaner', 'grammar-style-checker', 'case-converter'],
    },
    mount(container) { mountWordCounter(container); },
  },
  {
    id: 'character-counter', slug: 'character-counter', name: 'Character Counter',
    blurb: 'Count characters and bytes, and check limits for X, SMS, meta tags and Instagram.',
    keywords: 'character count characters with spaces bytes twitter sms meta title meta description instagram limit',
    icon: 'charcount', kind: 'live',
    seo: {
      title: 'Free Character Counter and Limit Checker' + SUFFIX,
      description: 'Count characters with and without spaces, check UTF-8 bytes, and see meters for X, SMS, meta titles, meta descriptions and Instagram. Runs in your browser.',
      h1: 'Character Counter',
      intro: 'Type or paste text to count its characters and bytes and see how close you are to common limits such as X, SMS, meta titles and Instagram captions. Nothing leaves your browser.',
      steps: ['Paste or type your text into the box.', 'Check the counts, then look at the meters under Limits.', 'Edit the text until the limit you care about shows how many characters are left.'],
      faq: [
        ['Is my text uploaded anywhere?', 'No. Counting happens in your browser. Your text is not sent to a server and the page makes no network requests while you type.'],
        ['What counts as one character?', 'Each character you see counts once, so an emoji or a letter with an accent is one. A line break counts as one character. The bytes figure is separate: it is the size of the text when saved as UTF-8.'],
        ['Why does an emoji change the SMS limit?', 'A text message that uses only standard GSM-7 characters holds 160 characters. One emoji or special letter switches the whole message to Unicode, which holds 70. Longer messages are split into parts of 153 or 67 characters.'],
        ['Is the X (Twitter) meter exact?', 'It counts plain characters against 280. X counts every link as 23 characters and gives some scripts a weight of 2, so a post with links or Chinese, Japanese or Korean text can differ from this count.'],
        ['Are the meta title and description limits exact?', 'No. Search engines cut titles and descriptions by pixel width, not by character count. Sixty and 160 characters are common guides that usually fit.'],
        ['Can I set my own limit?', 'Yes. Enter any whole number in Your own limit and the last meter follows it.'],
      ],
      related: ['word-counter', 'text-cleaner', 'case-converter', 'grammar-style-checker'],
    },
    mount(container) { mountCharacterCounter(container); },
  },
];
