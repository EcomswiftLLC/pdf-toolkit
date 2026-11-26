// Router + page shell. run(opts) renders into the current root (see core.setRoot). ?tool=<id|slug> shows a tool; no tool shows the hub.
// &embed=1 is for the Wix iframe; &base=<url> makes links point at Wix pages instead of this app.
import { h, icon, emit, $, setHost } from './core.js';
import { TOOLS, SOON, CATEGORIES } from './tools.js';
import { mountTool } from './flow.js';
import { KITS, KIT_TOOLS } from './registry.js';

export function run(opts) {
const { key, native } = opts;
const hubAll = opts.hub === 'all'; // combined hub for the non-PDF kits (/online-tools); any other hub value = the PDF hub
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
  if (soon) return h('li', {}, h('div', { class: 'tcard soon', 'data-cat': t.category, role: 'group', 'aria-label': `${t.name}, coming soon` }, ...kids, h('span', { class: 'badge' }, 'Coming soon')));
  return h('li', {}, h('a', { class: 'tcard', 'data-cat': t.category, href: href(t), ...linkAttrs }, ...kids, h('span', { class: 'go' }, 'Open tool', icon('right'))));
}

function trust(all) {
  return h('div', { class: 'trust' },
    h('span', {}, icon('shield'), all ? 'Runs in your browser, nothing is uploaded' : 'Processed in your browser, never uploaded'),
    h('span', {}, icon('check'), 'No sign-up needed'),
    h('span', {}, icon('check'), 'Free to use'));
}

function hubAllKits() {
  if (!native) document.title = 'Free online tools';
  $('#head').replaceChildren(h('h1', {}, 'Free online tools'), h('p', { class: 'lede' }, 'Compress images, make QR codes, clean up text and run quick calculations right in your browser. Nothing is uploaded and there is no sign-up.'));
  let cat = 'All', term = '';
  try { const k = new URLSearchParams(location.search).get('kit'); const f = KITS.find(x => x.id === k); if (f) cat = f.label; } catch (e) { /* optional */ }
  const sections = h('div', {});
  const input = h('input', { type: 'search', id: 'q', placeholder: 'Search tools', autocomplete: 'off', 'aria-label': 'Search tools' });
  const cats = h('div', { class: 'cats', role: 'group', 'aria-label': 'Filter by category' });
  const draw = () => {
    const match = t => (cat === 'All' || t.category === cat) && (!term || (t.name + ' ' + t.blurb + ' ' + (t.keywords || '')).toLowerCase().includes(term));
    sections.replaceChildren(); let total = 0;
    for (const k of KITS) {
      const list = k.tools.filter(match); if (!list.length) continue; total += list.length;
      sections.append(h('div', { class: 'kit-h' }, h('h2', {}, k.title), h('span', {}, `${list.length} ${list.length === 1 ? 'tool' : 'tools'}`)), h('ul', { class: 'tgrid' }, list.map(t => card(t))));
    }
    if (!total) { sections.append(h('p', { class: 'empty' }, `No tools match "${term}". Try a different word, such as compress, QR or percentage.`)); $('#live').textContent = 'No tools match your search.'; return; }
    $('#live').textContent = `${total} ${total === 1 ? 'tool' : 'tools'} shown`;
  };
  ['All', ...KITS.map(k => k.label)].forEach(c => {
    const b = h('button', { class: 'btn btn-quiet btn-sm', type: 'button', 'aria-pressed': String(c === cat), onclick: () => { cat = c; cats.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); } }, c);
    cats.append(b);
  });
  input.addEventListener('input', () => { term = input.value.trim().toLowerCase(); draw(); });
  $('#main').replaceChildren(h('div', { class: 'hub-top' }, h('div', { class: 'search' }, icon('search'), input), cats), sections);
  $('#trust').replaceChildren(trust(true));
  draw();
}

function hub() {
  if (hubAll) return hubAllKits();
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
  const live = t.kind === 'live', hubName = t.kit ? 'Online tools' : 'PDF Tools';
  if (!native) document.title = `${t.name} | ${hubName}`;
  $('#head').replaceChildren(
    h('p', { class: 'crumbs' }, h('a', { href: hubHref(), ...linkAttrs }, hubName), ' / ', t.name),
    h('h1', {}, t.name), h('p', { class: 'lede' }, t.blurb));
  if (live) mountLive($('#main'), t); else mountTool($('#main'), t, { embed });
  $('#trust').replaceChildren(trust(!!t.kit));
  if (!embed) {
    const rel = t.kit ? KIT_TOOLS.filter(x => x !== t && x.kit === t.kit).slice(0, 4) : TOOLS.filter(x => x !== t && (x.category === t.category || ['merge', 'compress', 'split'].includes(x.id))).slice(0, 4);
    $('#related').replaceChildren(h('section', { class: 'related' }, h('h2', {}, t.kit ? 'More free tools' : 'More PDF tools'), h('ul', { class: 'tgrid', style: 'margin-top:12px' }, rel.map(x => card(x)))));
  }
  emit('tool_loaded', { tool: t.id });
}

// A live tool builds its own workbench: t.mount(container, ctx). It may return a cleanup function.
let cleanup = null;
function mountLive(root, t) {
  if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; }
  const box = h('div', { class: 'live-tool', 'data-tool': t.id }); root.replaceChildren(box);
  try { cleanup = t.mount(box, { embed, native, tool: t }) || null; }
  catch (e) { console.error(e); box.replaceChildren(h('div', { class: 'alert err', role: 'alert' }, icon('alert'), 'This tool could not start. Refresh the page and try again.')); }
}

const t = key && (TOOLS.find(x => x.id === key || x.slug === key) || KIT_TOOLS.find(x => x.id === key || x.slug === key));
if (!key) hub();
else if (t) toolPage(t);
else {
  const soon = SOON.find(x => x.slug === key);
  $('#head').replaceChildren(h('h1', {}, soon ? soon.name : 'Tool not found'), h('p', { class: 'lede' }, soon ? 'This tool is coming soon.' : 'We could not find that tool.'));
  $('#main').replaceChildren(h('p', {}, h('a', { class: 'btn btn-primary', href: hubHref(), ...linkAttrs }, (hubAll ? 'See all tools' : 'See all PDF tools'))));
}
if (!native) { try { new ResizeObserver(() => emit('height', { height: Math.ceil(document.documentElement.scrollHeight) })).observe(document.body); } catch (e) { /* optional */ } }
}
