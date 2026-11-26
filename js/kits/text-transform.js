// Case Converter, Remove Duplicate Lines, Text Cleaner, Sort Lines, Text to Slug, Reverse Text. Browser only.
import { h, icon, panel, textPanel, resultBox, announce, stats, setStats, num, plural, toggleGroup } from './text-ui.js';
import { check, select, seg, field } from '../ui.js';
import { CASES, dedupeLines, sortLines, cleanText, slugify, splitLines, normalizeNewlines } from './text-lib.js';

const SUFFIX = ' | Ecom Swift LLC';
const opts = (...kids) => h('div', { class: 'opts text-opts' }, ...kids.map(k => (k && k.el) || k));

// ------------------------------------------------------------------ Case Converter
const CASE_BUTTONS = [
  ['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['title', 'Title Case'], ['sentence', 'Sentence case'],
  ['camel', 'camelCase'], ['pascal', 'PascalCase'], ['snake', 'snake_case'], ['kebab', 'kebab-case'],
  ['constant', 'CONSTANT_CASE'], ['alternating', 'aLtErNaTiNg'], ['inverse', 'iNVERSE'],
];
function mountCase(root) {
  let mode = null;
  const input = textPanel({ id: 'cs-input', label: 'Text to convert', rows: 8, onChange: () => run() });
  const grp = toggleGroup('Choose a case', CASE_BUTTONS.map(([v, t]) => ({ v, t })), v => { mode = v; grp.set(v); run(); announce(`Converted to ${CASE_BUTTONS.find(c => c[0] === v)[1]}.`); });
  const out = resultBox({ id: 'cs-output', label: 'Converted text', rows: 8, filename: 'converted-text.txt', placeholder: 'Choose a case above and the result appears here.' });
  const info = h('p', { class: 'lt-note' }, 'Title Case keeps short words such as a, the and of in lower case. camelCase, snake_case and the other code styles work line by line and drop punctuation.');
  function run() { out.set(mode ? CASES[mode](input.get()) : ''); }
  root.append(input.el, panel('Choose a case', grp.el, info), panel('Result', out.el));
}

// ------------------------------------------------------------------ Remove Duplicate Lines
function mountDedupe(root) {
  const input = textPanel({ id: 'dl-input', label: 'List or text, one item per line', rows: 10, onChange: () => run() });
  const cs = check({ label: 'Case sensitive (Apple and apple are different)', value: true, onInput: () => run() });
  const trim = check({ label: 'Trim spaces around each line', onInput: () => run() });
  const empty = check({ label: 'Ignore empty lines (remove them from the result)', onInput: () => run() });
  const keep = seg({ id: 'dl-keep', label: 'Which copy to keep', choices: [{ v: 'first', t: 'First' }, { v: 'last', t: 'Last' }], value: 'first', onInput: () => run() });
  const sort = select({ id: 'dl-sort', label: 'Order of the result', choices: [{ v: 'none', t: 'Keep the original order' }, { v: 'asc', t: 'Sort A to Z' }, { v: 'desc', t: 'Sort Z to A' }], value: 'none', onInput: () => run() });
  const statsEl = stats([]);
  const out = resultBox({ id: 'dl-output', label: 'Unique lines', rows: 10, filename: 'unique-lines.txt', placeholder: 'The lines without repeats appear here.' });
  const det = h('details', { class: 'text-removed' });
  const sum = h('summary', {}, 'Removed lines');
  const list = h('ol', { class: 'text-removed-list' });
  det.append(sum, list);
  function run() {
    const r = dedupeLines(input.get(), { caseSensitive: cs.get(), trim: trim.get(), ignoreEmpty: empty.get(), keep: keep.get(), sort: sort.get() });
    out.set(r.lines.join('\n'));
    setStats(statsEl, [
      { label: 'Lines in', value: num(r.total) },
      { label: 'Lines out', value: num(r.lines.length) },
      { label: 'Duplicates removed', value: num(r.removed.length), big: false },
      ...(r.emptyRemoved ? [{ label: 'Empty lines removed', value: num(r.emptyRemoved) }] : []),
    ]);
    list.replaceChildren();
    const MAX = 500;
    for (const x of r.removed.slice(0, MAX)) list.append(h('li', { value: x.line }, h('span', { class: 'text-rm-t' }, x.text === '' ? '(empty line)' : x.text), h('span', { class: 'text-rm-m' }, ` repeats line ${x.of}`)));
    if (r.removed.length > MAX) list.append(h('li', { class: 'text-rm-more', value: 0 }, `${num(r.removed.length - MAX)} more not shown.`));
    sum.textContent = `Removed lines (${num(r.removed.length)})`;
    det.hidden = r.removed.length === 0;
    root._summary = `${plural(r.removed.length, 'duplicate line')} removed. ${plural(r.lines.length, 'line')} left.`;
  }
  input.input.addEventListener('change', () => announce(root._summary));
  const options = panel('Options', opts(cs, trim, empty, h('div', { class: 'row2' }, keep.el, sort.el)));
  root.append(h('div', { class: 'lt-cols text-even' }, input.el, options), panel('Result', statsEl, out.el, det));
  run();
}

// ------------------------------------------------------------------ Text Cleaner
const CLEAN_LABELS = [
  ['collapsed', 'extra spaces removed'], ['trimmed', 'lines trimmed'], ['blank', 'blank lines removed'], ['joined', 'line breaks joined into spaces'],
  ['dehyphen', 'split words rejoined'], ['breaks', 'line breaks removed'], ['html', 'HTML tags removed'], ['entities', 'HTML entities decoded'],
  ['invisible', 'invisible characters removed'], ['spaces', 'special spaces replaced'], ['quotes', 'quotes changed'], ['dashes', 'dashes changed'],
];
function mountCleaner(root) {
  const input = textPanel({ id: 'tc-input', label: 'Text to clean', rows: 10, onChange: () => run() });
  const C = (key, label, value, help) => check({ label, value, help, onInput: () => { sync(); run(); } });
  const collapse = C('collapse', 'Collapse multiple spaces into one', true);
  const trimLines = C('trim', 'Trim spaces at the start and end of each line', true);
  const removeBlank = C('blank', 'Remove blank lines', false);
  const limitBlank = C('limit', 'Allow at most one blank line in a row', false);
  const join = C('join', 'Join lines into paragraphs', false, 'Fixes text copied from a PDF, where every line is wrapped. Blank lines stay as paragraph breaks.');
  const dehyphen = C('dehyphen', 'Rejoin words split by a hyphen at a line end', false, 'Turns "inter-" at the end of one line and "national" at the start of the next into "international". Leave it off if your text has real hyphens at line ends.');
  const noBreaks = C('nobreaks', 'Remove all line breaks', false, 'Puts everything on one line. This replaces the line options above.');
  const html = C('html', 'Strip HTML tags and decode entities', false, 'Removes anything that looks like a tag. It is for tidying text, not for making unsafe HTML safe.');
  const invisible = C('invisible', 'Remove invisible characters', true, 'Zero-width spaces, soft hyphens, byte order marks and control characters. Joiners used in emoji and in scripts such as Persian are kept.');
  const specialSpaces = C('spaces', 'Replace non-breaking and other special spaces with normal spaces', false);
  const quotes = select({ id: 'tc-quotes', label: 'Quotes', choices: [{ v: 'keep', t: 'Leave as they are' }, { v: 'straight', t: 'Curly to straight' }, { v: 'smart', t: 'Straight to curly' }], value: 'keep', onInput: () => run() });
  const dashes = select({ id: 'tc-dashes', label: 'Dashes', choices: [{ v: 'keep', t: 'Leave as they are' }, { v: 'hyphen', t: 'Replace en and em dashes with hyphens' }], value: 'keep', onInput: () => run() });
  function sync() {
    const nb = noBreaks.get();
    for (const c of [join, removeBlank, limitBlank]) c.input.disabled = nb;
    if (!nb) limitBlank.input.disabled = removeBlank.get();
  }
  const statsEl = stats([]);
  const none = h('p', { class: 'lt-note', role: 'status' });
  const out = resultBox({ id: 'tc-output', label: 'Cleaned text', rows: 10, filename: 'cleaned-text.txt', placeholder: 'The cleaned text appears here.' });
  const group = (title, ...kids) => h('fieldset', { class: 'text-group' }, h('legend', {}, title), ...kids.map(k => k.el));
  const options = panel('What to clean', h('div', { class: 'text-groups' },
    group('Spaces and lines', collapse, trimLines, removeBlank, limitBlank, join, dehyphen, noBreaks),
    group('Characters', invisible, specialSpaces, quotes, dashes),
    group('Markup', html)));
  function run() {
    const o = { collapse: collapse.get(), trimLines: trimLines.get(), removeBlank: removeBlank.get(), limitBlank: limitBlank.get(), join: join.get(), dehyphen: dehyphen.get(), noBreaks: noBreaks.get(), html: html.get(), invisible: invisible.get(), specialSpaces: specialSpaces.get(), quotes: quotes.get(), dashes: dashes.get() };
    const r = cleanText(input.get(), o);
    out.set(r.text);
    const list = CLEAN_LABELS.filter(([k]) => r.counts[k] > 0).map(([k, t]) => ({ label: t.charAt(0).toUpperCase() + t.slice(1), value: num(r.counts[k]) }));
    setStats(statsEl, [{ label: 'Characters', value: `${num(r.before)} to ${num(r.after)}`, big: true }, ...list]);
    none.textContent = !input.get() ? 'Paste some text to see what changes.' : (r.changed ? '' : 'Nothing needed cleaning with these settings.');
    root._summary = r.changed ? `Cleaned. ${num(r.before)} characters became ${num(r.after)}.` : 'Nothing needed cleaning.';
  }
  input.input.addEventListener('change', () => announce(root._summary));
  sync();
  root.append(input.el, options, panel('Result', statsEl, none, out.el));
  run();
}

// ------------------------------------------------------------------ Sort Lines
function mountSort(root) {
  const input = textPanel({ id: 'sl-input', label: 'Lines to sort', rows: 10, onChange: () => run() });
  const mode = select({ id: 'sl-mode', label: 'Sort order', choices: [
    { v: 'asc', t: 'A to Z' }, { v: 'desc', t: 'Z to A' }, { v: 'numeric', t: 'Numbers and natural order (item2 before item10)' },
    { v: 'lenasc', t: 'Length, shortest first' }, { v: 'lendesc', t: 'Length, longest first' }, { v: 'reverse', t: 'Reverse the order' }, { v: 'shuffle', t: 'Shuffle randomly' }], value: 'asc', onInput: () => { sync(); run(); } });
  const ic = check({ label: 'Ignore upper and lower case', value: true, onInput: () => run() });
  const re = check({ label: 'Remove empty lines', onInput: () => run() });
  const again = h('button', { class: 'btn btn-quiet btn-sm', type: 'button', hidden: true }, icon('rotr', 'sm'), 'Shuffle again');
  again.addEventListener('click', () => run());
  const statsEl = stats([]);
  const out = resultBox({ id: 'sl-output', label: 'Sorted lines', rows: 10, filename: 'sorted-lines.txt', placeholder: 'The sorted lines appear here.', extra: [again] });
  function sync() { again.hidden = mode.get() !== 'shuffle'; ic.input.disabled = ['lenasc', 'lendesc', 'reverse', 'shuffle'].includes(mode.get()); }
  function run() {
    const t = input.get();
    const lines = sortLines(t, { mode: mode.get(), ignoreCase: ic.get(), removeEmpty: re.get() });
    out.set(lines.join('\n'));
    setStats(statsEl, [{ label: 'Lines', value: num(lines.length) }, { label: 'Empty lines removed', value: num(splitLines(t).length - lines.length) }]);
    root._summary = `${plural(lines.length, 'line')} sorted.`;
  }
  input.input.addEventListener('change', () => announce(root._summary));
  const options = panel('Options', opts(mode, ic, re));
  root.append(h('div', { class: 'lt-cols text-even' }, input.el, options), panel('Result', statsEl, out.el));
  sync(); run();
}

// ------------------------------------------------------------------ Text to Slug
function mountSlug(root) {
  const input = textPanel({ id: 'sg-input', label: 'Title or text, one per line', rows: 6, onChange: () => run() });
  const sep = seg({ id: 'sg-sep', label: 'Separator', choices: [{ v: '-', t: 'Hyphen -' }, { v: '_', t: 'Underscore _' }], value: '-', onInput: () => run() });
  const ascii = check({ label: 'Letters a to z and numbers only', onInput: () => run() });
  const out = resultBox({ id: 'sg-output', label: 'Slugs', rows: 6, filename: 'slugs.txt', placeholder: 'Your slugs appear here, one per line.' });
  function run() {
    const lines = normalizeNewlines(input.get()).split('\n');
    out.set(lines.map(l => slugify(l, { sep: sep.get(), asciiOnly: ascii.get() })).join('\n').replace(/\n+$/, ''));
  }
  root.append(input.el, panel('Options', opts(sep, ascii)), panel('Result', out.el));
}

// ------------------------------------------------------------------ Reverse Text
function mountReverse(root) {
  const input = textPanel({ id: 'rv-input', label: 'Text to reverse', rows: 8, onChange: () => run() });
  const mode = seg({ id: 'rv-mode', label: 'Reverse', choices: [{ v: 'chars', t: 'Every character' }, { v: 'words', t: 'Word order' }, { v: 'lines', t: 'Line order' }], value: 'chars', onInput: () => run() });
  const out = resultBox({ id: 'rv-output', label: 'Reversed text', rows: 8, filename: 'reversed-text.txt', placeholder: 'The reversed text appears here.' });
  function run() {
    const t = input.get(); let r = '';
    if (mode.get() === 'chars') {
      const g = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
      r = t.split('\n').map(l => (g ? [...g.segment(l)].map(x => x.segment) : Array.from(l)).reverse().join('')).join('\n');
    } else if (mode.get() === 'words') r = t.split('\n').map(l => l.split(/(\s+)/).reverse().join('')).join('\n');
    else r = t.split('\n').reverse().join('\n');
    out.set(r);
  }
  root.append(input.el, panel('Options', opts(mode)), panel('Result', out.el));
}

export const TRANSFORM_TOOLS = [
  {
    id: 'case-converter', slug: 'case-converter', name: 'Case Converter',
    blurb: 'Change text to upper, lower, title or sentence case, or to camelCase and snake_case.',
    keywords: 'uppercase lowercase title case sentence case camelcase pascalcase snake case kebab constant alternating inverse',
    icon: 'caseconv', kind: 'live',
    seo: {
      title: 'Free Case Converter: Change Text Case Online' + SUFFIX,
      description: 'Convert text to uppercase, lowercase, title case, sentence case, camelCase, snake_case and more in one click. Free, and it runs in your browser.',
      h1: 'Case Converter',
      intro: 'Paste your text, choose a case, then copy or download the result. Title case, sentence case and code styles such as camelCase and snake_case are all here, and nothing leaves your browser.',
      steps: ['Paste or type your text into the box.', 'Choose a case, such as Title Case or snake_case.', 'Copy the result or download it as a .txt file.'],
      faq: [
        ['Is my text uploaded anywhere?', 'No. The conversion runs in your browser, so your text stays on your device and the page makes no network requests.'],
        ['How does Title Case treat small words?', 'Short words such as a, an, the, and, but, or, for, of, in, on and to stay in lower case unless they start or end a sentence or line. Words that already have capitals inside, such as iPhone or NASA, are left as typed, and text typed in all capitals is lower-cased first. Style guides differ, so check the result against yours.'],
        ['What is the difference between camelCase and PascalCase?', 'camelCase starts with a lower-case letter and capitalises each later word, as in myVariableName. PascalCase capitalises every word, as in MyVariableName. Both remove spaces and punctuation and work one line at a time.'],
        ['What do aLtErNaTiNg and iNVERSE do?', 'Alternating switches between lower and upper case on every letter, starting with lower case, and skips spaces and punctuation when counting. Inverse swaps the case of every letter, so Hello becomes hELLO.'],
        ['Does Sentence case know proper nouns?', 'No. It lower-cases everything, then capitalises the first letter of each sentence and line, and the word I. Names such as London need their capital letter put back by hand.'],
        ['Does it work with accented and non-English letters?', 'Yes, using the browser\u2019s standard case rules, so \u00E9 becomes \u00C9 and the German \u00DF becomes SS in upper case. Scripts without letter case, such as Chinese or Arabic, are left unchanged.'],
      ],
      related: ['text-cleaner', 'sort-lines', 'find-and-replace', 'word-counter'],
    },
    mount(container) { mountCase(container); },
  },
  {
    id: 'remove-duplicate-lines', slug: 'remove-duplicate-lines', name: 'Remove Duplicate Lines',
    blurb: 'Delete repeated lines from a list and see which ones were removed.',
    keywords: 'remove duplicates duplicate lines unique lines dedupe list repeated lines',
    icon: 'dedupe', kind: 'live',
    seo: {
      title: 'Free Tool to Remove Duplicate Lines from Text' + SUFFIX,
      description: 'Remove repeated lines from a list or any text. Choose case, trimming and which copy to keep, and see exactly what was removed. Runs in your browser.',
      h1: 'Remove Duplicate Lines',
      intro: 'Paste a list and get back only the unique lines, with a count and a list of what was removed. You choose whether case matters and which copy to keep. It runs in your browser.',
      steps: ['Paste your list into the box, one item per line.', 'Choose the options, such as case sensitivity or keeping the last copy.', 'Copy the unique lines, or check the removed lines list.'],
      faq: [
        ['Is my list uploaded anywhere?', 'No. The lines are compared in your browser and nothing is sent to a server.'],
        ['What counts as a duplicate?', 'Two lines are duplicates when their text is identical. With Case sensitive off, Apple and apple match. With Trim spaces on, a line with extra spaces around it matches the same line without them, and the result is trimmed.'],
        ['Which copy is kept?', 'By default the first copy stays and later ones are removed. Choose Last to keep the final copy instead. Lines keep their original order unless you pick a sort.'],
        ['What does Ignore empty lines do?', 'Blank lines, including lines with only spaces, are dropped from the result and not counted as duplicates. Leave it off to keep blank lines, in which case repeated blank lines are removed like any other duplicate.'],
        ['How do I see what was removed?', 'Open the Removed lines list under the result. It shows each removed line with its line number in your original text and the line it repeats. Long lists show the first 500.'],
        ['How is the sort order decided?', 'Sorting uses English alphabetical order, where upper case and accents only break ties between otherwise equal lines. Numbers are sorted as text here, so 10 comes before 2. Use the Sort Lines tool for number-aware sorting.'],
      ],
      related: ['sort-lines', 'text-cleaner', 'text-compare', 'find-and-replace'],
    },
    mount(container) { mountDedupe(container); },
  },
  {
    id: 'text-cleaner', slug: 'text-cleaner', name: 'Text Cleaner',
    blurb: 'Remove extra spaces and line breaks, fix quotes and strip hidden characters.',
    keywords: 'remove extra spaces line breaks clean text strip html smart quotes zero width invisible characters join lines pdf',
    icon: 'cleaner', kind: 'live',
    seo: {
      title: 'Free Text Cleaner: Remove Spaces and Line Breaks' + SUFFIX,
      description: 'Remove extra spaces and line breaks, fix text copied from PDFs, change smart quotes and strip hidden characters. Free, and it runs in your browser.',
      h1: 'Text Cleaner',
      intro: 'Tidy pasted text in a few clicks: remove extra spaces and line breaks, rejoin wrapped lines, fix quotes and dashes, and strip hidden characters. You see what changed, and nothing leaves your browser.',
      steps: ['Paste your text into the box.', 'Switch on the clean-ups you need, such as joining lines or removing blank lines.', 'Check the change counts, then copy or download the cleaned text.'],
      faq: [
        ['Is my text uploaded anywhere?', 'No. The cleaning runs in your browser and your text never leaves your device.'],
        ['How do I fix text copied from a PDF?', 'Turn on Join lines into paragraphs. It joins the wrapped lines of each paragraph with a space and keeps blank lines as paragraph breaks. If words are split with a hyphen at the end of a line, also turn on Rejoin words split by a hyphen.'],
        ['Which invisible characters are removed?', 'Zero-width spaces, soft hyphens, byte order marks, word joiners and control characters. The joiners that hold emoji together and that some scripts such as Persian need are kept, so those texts are not broken.'],
        ['Is Strip HTML tags safe for untrusted code?', 'It removes anything that looks like a tag and decodes common entities, but it is meant for tidying text, not for making unsafe HTML safe. Your text is only treated as plain text here and is never run as HTML.'],
        ['How does Straight to curly work?', 'Quotes after a space, bracket or at the start of a line become opening quotes and the rest become closing quotes or apostrophes. Odd cases such as \u2019tis can come out the wrong way, so read the result.'],
        ['Can I undo a clean-up?', 'Your original stays in the first box, so change the switches and the result updates. Nothing is saved, so copy what you need before you close the page.'],
      ],
      related: ['sort-lines', 'remove-duplicate-lines', 'find-and-replace', 'case-converter'],
    },
    mount(container) { mountCleaner(container); },
  },
  {
    id: 'sort-lines', slug: 'sort-lines', name: 'Sort Lines',
    blurb: 'Sort lines A to Z, Z to A, by number or length, reverse them or shuffle them.',
    keywords: 'sort lines alphabetical order numeric natural sort reverse shuffle randomize list by length',
    icon: 'sortlines', kind: 'live',
    seo: {
      title: 'Free Sort Lines Tool: A to Z, Numeric, Random' + SUFFIX,
      description: 'Sort lines of text A to Z or Z to A, by number or length, reverse their order or shuffle them at random. Free, and it runs in your browser.',
      h1: 'Sort Lines',
      intro: 'Paste a list and sort it alphabetically, by number, by length, in reverse or in random order. The result updates as you change the options, and it all runs in your browser.',
      steps: ['Paste your list into the box, one item per line.', 'Pick a sort order and any options.', 'Copy the sorted list or download it as a .txt file.'],
      faq: [
        ['Is my list uploaded anywhere?', 'No. Sorting happens in your browser and the list is never sent to a server.'],
        ['How does numeric sorting work?', 'Lines that are plain numbers, such as 2, 10 or -3.5, are sorted by value and come first. Other lines are sorted naturally, so item2 comes before item10 instead of after it.'],
        ['Is the shuffle really random?', 'It uses your browser\u2019s secure random number generator with a Fisher-Yates shuffle, so every order is equally likely. Press Shuffle again for a new order.'],
        ['Does it ignore upper and lower case?', 'By default yes, so Banana and apple sort by their letters alone. Untick the option to treat the cases as different. Accents still count, so e and \u00E9 sort apart.'],
        ['What happens to lines that tie?', 'Lines that compare as equal keep the order they had in your text, so sorting by length leaves same-length lines in place.'],
        ['What about empty lines?', 'They are kept and sorted like any other line, which puts them first in A to Z order. Tick Remove empty lines to drop them.'],
      ],
      related: ['remove-duplicate-lines', 'text-cleaner', 'case-converter', 'text-compare'],
    },
    mount(container) { mountSort(container); },
  },
  {
    id: 'text-to-slug', slug: 'text-to-slug', name: 'Text to Slug',
    blurb: 'Turn titles into clean, URL-friendly slugs with hyphens or underscores.',
    keywords: 'slug slugify url friendly permalink seo hyphen text to slug',
    icon: 'slug', kind: 'live',
    seo: {
      title: 'Free Text to Slug Generator for URLs' + SUFFIX,
      description: 'Turn a title into a clean lower-case URL slug with accents removed and hyphens or underscores between words. Free, and it runs in your browser.',
      h1: 'Text to Slug',
      intro: 'Paste a title and get a tidy, lower-case slug for a web address. Accents are removed, symbols are dropped and you pick the separator. It runs in your browser.',
      steps: ['Paste one or more titles, one per line.', 'Choose a hyphen or an underscore.', 'Copy the slugs or download them as a .txt file.'],
      faq: [
        ['Is my text uploaded anywhere?', 'No. Slugs are made in your browser and your text never leaves your device.'],
        ['What does the slug generator change?', 'It makes letters lower case, removes accents, turns symbols and spaces into your separator, turns & into and, and trims separators from both ends.'],
        ['Does it keep non-English letters?', 'Yes, letters from other scripts are kept by default. Tick Letters a to z and numbers only if you need a plain ASCII slug. Letters from other scripts are then replaced by the separator.'],
        ['Hyphen or underscore?', 'Search engines treat hyphens as word separators, so hyphens are the usual choice for web addresses. Underscores suit file names and code.'],
        ['Can I make many slugs at once?', 'Yes. Put each title on its own line and you get one slug per line.'],
        ['Will the slug always be unique on my site?', 'No. The tool does not know your other pages, so two titles can give the same slug. Check for clashes before publishing.'],
      ],
      related: ['case-converter', 'text-cleaner', 'find-and-replace', 'word-counter'],
    },
    mount(container) { mountSlug(container); },
  },
  {
    id: 'reverse-text', slug: 'reverse-text', name: 'Reverse Text',
    blurb: 'Reverse the characters, the word order or the line order of any text.',
    keywords: 'reverse text backwards flip text reverse words reverse lines mirror',
    icon: 'reverse', kind: 'live',
    seo: {
      title: 'Free Reverse Text Tool: Flip Letters or Words' + SUFFIX,
      description: 'Reverse the characters, the order of the words or the order of the lines in any text. Emoji and accents stay intact. Free, and it runs in your browser.',
      h1: 'Reverse Text',
      intro: 'Paste text and flip it backwards by character, word order or line order. Emoji and letters with accents stay whole. It runs in your browser and nothing is uploaded.',
      steps: ['Paste or type your text into the box.', 'Choose whether to reverse characters, word order or line order.', 'Copy the result or download it as a .txt file.'],
      faq: [
        ['Is my text uploaded anywhere?', 'No. The text is reversed in your browser and never sent to a server.'],
        ['Does reversing break emoji or accents?', 'No. Characters are reversed as you see them, so an emoji with a skin tone or a letter with an accent stays in one piece.'],
        ['What is the difference between the three options?', 'Every character turns hello world into dlrow olleh. Word order gives world hello. Line order keeps each line as it is and flips the lines from bottom to top.'],
        ['Does it work with right-to-left languages?', 'It reverses the order of the stored characters. Your browser then draws Arabic or Hebrew right to left as usual, so the reversed text can look different from what you expect.'],
        ['Does word order keep my spacing?', 'Yes. Spaces and tabs between words are kept, in reversed order, and each line is reversed on its own.'],
        ['Is there a length limit?', 'No fixed limit. Very long text can take a moment because your own device does the work.'],
      ],
      related: ['case-converter', 'text-to-slug', 'sort-lines', 'text-cleaner'],
    },
    mount(container) { mountReverse(container); },
  },
];
