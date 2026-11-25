// Router + page shell. run(opts) renders into the current root (see core.setRoot). ?tool=<id|slug> shows a tool; no tool shows the hub.
// &embed=1 is for the Wix iframe; &base=<url> makes links point at Wix pages instead of this app.
import { h, icon, emit, $, setHost } from './core.js';
import { TOOLS, SOON, CATEGORIES } from './tools.js';
import { mountTool } from './flow.js';

export function run(opts) {
const { key, native } = opts;
const embed = !!opts.embed;
let base = opts.base || '';
if (base && !/^https:\/\/(www\.)?ecomswiftllc\.com\//.test(base)) base = ''; // never link to arbitrary hosts
if (!native && embed && base) setHost(new URL(base).origin); // iframe mode only: the Wix page saves downloads the sandboxed iframe cannot
if (!native) document.body.classList.toggle('embed', embed);

const baseSlash = () => base.replace(/\/?$/, '/');
const href = t => base ? baseSlash() + t.slug : `app.html?tool=${t.slug}${embed ? '&embed=1' : ''}`;
const hubHref = () => base ? baseSlash().replace(/\/$/, '') : 'hub.html';
const linkAttrs = { target: base && !native ? '_top' : false };

function card(t, soon) {
  const kids = [h('div', { class: 'ti' }, icon(t.icon)), h('h3', {}, t.name), h('p', {}, t.blurb)];
  if (soon) return h('li', {}, h('div', { class: 'tcard soon', role: 'group', 'aria-label': `${t.name}, coming soon` }, ...kids, h('span', { class: 'badge' }, 'Coming soon')));
  return h('li', {}, h('a', { class: 'tcard', href: href(t), ...linkAttrs }, ...kids, h('span', { class: 'go' }, 'Open tool')));
}

function trust() {
  return h('div', { class: 'trust' },
    h('span', {}, icon('shield'), 'Processed in your browser, never uploaded'),
    h('span', {}, icon('check'), 'No sign-up needed'),
    h('span', {}, icon('check'), 'Free to use'));
}

function hub() {
  if (!native) document.title = 'PDF Tools';
  $('#head').replaceChildren(h('h1', {}, 'Free PDF tools'), h('p', { class: 'lede' }, 'Merge, split, compress, convert and edit PDFs right in your browser. Your files stay on your device.'));
  let cat = 'All', term = '';
  const sections = h('div', {});
  const input = h('input', { type: 'search', id: 'q', placeholder: 'Search tools', autocomplete: 'off', 'aria-label': 'Search tools' });
  const cats = h('div', { class: 'cats', role: 'group', 'aria-label': 'Filter by category' });
  const draw = () => {
    const match = t => (cat === 'All' || t.category === cat) && (!term || (t.name + ' ' + t.blurb).toLowerCase().includes(term));
    const live = TOOLS.filter(match), soon = SOON.filter(match);
    sections.replaceChildren();
    if (!live.length && !soon.length) { sections.append(h('p', { class: 'empty' }, `No tools match "${term}". Try a different word, such as merge or compress.`)); $('#live').textContent = 'No tools match your search.'; return; }
    if (live.length) sections.append(h('h2', { class: 'sr' }, 'Available tools'), h('ul', { class: 'tgrid' }, live.map(t => card(t))));
    if (soon.length) sections.append(h('h2', { class: 'cat-h' }, 'Coming soon'), h('ul', { class: 'tgrid' }, soon.map(t => card(t, true))));
    $('#live').textContent = `${live.length} ${live.length === 1 ? 'tool' : 'tools'} shown`;
  };
  ['All', ...CATEGORIES].forEach(c => {
    const b = h('button', { class: 'btn btn-quiet btn-sm', type: 'button', 'aria-pressed': String(c === cat), onclick: () => { cat = c; cats.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); } }, c);
    cats.append(b);
  });
  input.addEventListener('input', () => { term = input.value.trim().toLowerCase(); draw(); });
  $('#main').replaceChildren(h('div', { class: 'hub-top' }, h('div', { class: 'search' }, icon('search'), input), cats), sections);
  $('#trust').replaceChildren(trust());
  draw();
}

function toolPage(t) {
  if (!native) document.title = `${t.name} | PDF Tools`;
  $('#head').replaceChildren(
    h('p', { class: 'crumbs' }, h('a', { href: hubHref(), ...linkAttrs }, 'PDF Tools'), ' / ', t.name),
    h('h1', {}, t.name), h('p', { class: 'lede' }, t.blurb));
  mountTool($('#main'), t, { embed });
  $('#trust').replaceChildren(trust());
  if (!embed) {
    const rel = TOOLS.filter(x => x !== t && (x.category === t.category || ['merge', 'compress', 'split'].includes(x.id))).slice(0, 4);
    $('#related').replaceChildren(h('section', { class: 'related' }, h('h2', {}, 'More PDF tools'), h('ul', { class: 'tgrid', style: 'margin-top:12px' }, rel.map(x => card(x)))));
  }
  emit('tool_loaded', { tool: t.id });
}

const t = key && TOOLS.find(x => x.id === key || x.slug === key);
if (!key) hub();
else if (t) toolPage(t);
else {
  const soon = SOON.find(x => x.slug === key);
  $('#head').replaceChildren(h('h1', {}, soon ? soon.name : 'Tool not found'), h('p', { class: 'lede' }, soon ? 'This tool is coming soon.' : 'We could not find that tool.'));
  $('#main').replaceChildren(h('p', {}, h('a', { class: 'btn btn-primary', href: hubHref(), ...linkAttrs }, 'See all PDF tools')));
}
if (!native) { try { new ResizeObserver(() => emit('height', { height: Math.ceil(document.documentElement.scrollHeight) })).observe(document.body); } catch (e) { /* optional */ } }
}
