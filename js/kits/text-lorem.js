// Lorem Ipsum Generator. Placeholder text only; random words come from the browser's secure random generator.
import { h, icon, panel, resultBox, announce, num, plural } from './text-ui.js';
import { field, check, seg } from '../ui.js';
import { secureRandomInt } from './text-lib.js';

const SUFFIX = ' | Ecom Swift LLC';
const WORDS = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum ' +
  'at vero eos accusamus iusto odio dignissimos ducimus blanditiis praesentium voluptatum deleniti atque corrupti quos dolores quas molestias excepturi occaecati cupiditate provident similique mollitia animi dolorum fuga harum quidem rerum facilis expedita distinctio nam libero tempore cum soluta nobis eligendi optio cumque nihil impedit quo minus quod maxime placeat facere possimus omnis voluptas assumenda repellendus temporibus autem quibusdam officiis debitis aut necessitatibus saepe eveniet voluptates repudiandae recusandae itaque earum hic tenetur sapiente delectus reiciendis voluptatibus maiores alias consequatur perferendis doloribus asperiores repellat').split(' ');
const OPENING = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua'.split(' ');
export const LIMITS = { paragraphs: 100, sentences: 500, words: 5000 };

const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
const pick = () => WORDS[secureRandomInt(WORDS.length)];
function sentence(first) {
  if (first) return 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
  const n = 8 + secureRandomInt(9), w = [];
  while (w.length < n) w.push(pick());
  if (n >= 10) { const at = 3 + secureRandomInt(n - 6); w[at] += ','; }
  return cap(w.join(' ')) + '.';
}
// o: { count, unit: 'paragraphs' | 'sentences' | 'words', start: bool, html: bool }
export function generateLorem(o) {
  const count = Math.max(1, Math.min(o.count | 0, LIMITS[o.unit] || 100));
  let out;
  if (o.unit === 'words') {
    const w = o.start ? OPENING.slice(0, count) : [];
    while (w.length < count) w.push(pick());
    out = [cap(w.join(' '))];
  } else if (o.unit === 'sentences') {
    const s = []; for (let i = 0; i < count; i++) s.push(sentence(o.start && i === 0));
    out = [s.join(' ')];
  } else {
    out = [];
    for (let p = 0; p < count; p++) {
      const n = 4 + secureRandomInt(4), s = [];
      for (let i = 0; i < n; i++) s.push(sentence(o.start && p === 0 && i === 0));
      out.push(s.join(' '));
    }
  }
  return o.html ? out.map(x => `<p>${x}</p>`).join('\n') : out.join('\n\n');
}

function mountLorem(root) {
  const unit = seg({ id: 'lo-unit', label: 'Generate', choices: [{ v: 'paragraphs', t: 'Paragraphs' }, { v: 'sentences', t: 'Sentences' }, { v: 'words', t: 'Words' }], value: 'paragraphs', onInput: () => run() });
  const cnt = field({ id: 'lo-count', label: 'How many', type: 'number', value: 3, min: 1, inputmode: 'numeric', onInput: () => run() });
  const start = check({ label: 'Start with \u201CLorem ipsum dolor sit amet\u201D', value: true, onInput: () => run() });
  const html = check({ label: 'Wrap in <p> tags', onInput: () => run() });
  const again = h('button', { class: 'btn btn-primary', type: 'button' }, icon('rotr', 'sm'), 'Generate again');
  again.addEventListener('click', () => { run(); announce('New text generated.'); });
  const out = resultBox({ id: 'lo-output', label: 'Placeholder text', rows: 12, filename: 'lorem-ipsum.txt', placeholder: 'Your text appears here.' });
  const info = h('p', { class: 'text-status', role: 'status' });
  function run() {
    const n = Math.floor(Number(cnt.get()));
    const lim = LIMITS[unit.get()];
    if (!cnt.get().trim() || !Number.isFinite(n) || n < 1) { cnt.error('Enter a whole number of 1 or more.'); out.set(''); info.textContent = ''; return; }
    if (n > lim) { cnt.error(`You can make up to ${num(lim)} ${unit.get()} at a time.`); out.set(''); info.textContent = ''; return; }
    cnt.error('');
    const t = generateLorem({ count: n, unit: unit.get(), start: start.get(), html: html.get() });
    out.set(t);
    info.textContent = `${plural(n, unit.get().slice(0, -1), unit.get())} made.`;
  }
  const opts = h('div', { class: 'opts text-opts' }, unit.el, cnt.el, start.el, html.el, h('div', { class: 'lt-bar' }, again));
  root.append(panel('Options', opts), panel('Result', info, out.el));
  run();
}

export const LOREM_TOOLS = [{
  id: 'lorem-ipsum-generator', slug: 'lorem-ipsum-generator', name: 'Lorem Ipsum Generator',
  blurb: 'Make placeholder text by the paragraph, sentence or word.',
  keywords: 'lorem ipsum generator placeholder dummy text filler paragraphs sentences words html',
  icon: 'lorem', kind: 'live',
  seo: {
    title: 'Free Lorem Ipsum Generator: Paragraphs, Words' + SUFFIX,
    description: 'Generate lorem ipsum placeholder text by the paragraph, sentence or word. Start with the classic opening line, wrap in p tags and copy. Free and private.',
    h1: 'Lorem Ipsum Generator',
    intro: 'Make filler text for layouts and mockups by the paragraph, sentence or word. You can start with the classic opening line and wrap each paragraph in HTML p tags. It runs in your browser.',
    steps: ['Choose paragraphs, sentences or words, and how many.', 'Tick Start with Lorem ipsum if you want the classic opening line.', 'Copy the text, or download it as a .txt file.'],
    faq: [
      ['What is lorem ipsum?', 'It is placeholder text used to show how a layout will look before the real words exist. It is based on a scrambled passage from a work by the Roman writer Cicero, so it looks like text but does not say anything.'],
      ['Is the text the same every time?', 'No. After the classic opening, the words are picked at random, so each press of Generate again gives a different text. The words come from a built-in list of 145 Latin-style words.'],
      ['Does it make exactly the number I ask for?', 'Yes. Ask for 5 words, 3 sentences or 2 paragraphs and you get exactly that many. The limits are 100 paragraphs, 500 sentences or 5,000 words at a time.'],
      ['What does Wrap in p tags do?', 'It puts each paragraph inside an HTML p element, one per line, ready to paste into a web page. For sentences and words, everything goes inside a single p element.'],
      ['Is anything sent to a server?', 'No. The text is made in your browser, nothing is uploaded and the page makes no network requests.'],
      ['Can I use the text in my projects?', 'Yes. It is generic filler with no author, so you can use it in designs, templates and tests. Replace it with real copy before you publish.'],
    ],
    related: ['word-counter', 'case-converter', 'text-cleaner', 'text-to-slug'],
  },
  mount(container) { mountLorem(container); },
}];
