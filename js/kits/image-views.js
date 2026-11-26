// Custom views for the image tools: the rotate / flip preview panel and the Base64 result panel.
import { h, icon, fmtBytes } from '../core.js';
import { copyButton, downloadButton } from '../ui.js';
import { loadImage, scaleCanvas, transformCanvas, release, dims } from './image-lib.js';

// ---------------------------------------------------------------------------------------------- rotate + flip
export function rotatePanel(api) {
  const { S } = api;
  const st = S.ext; if (st.rot === undefined) { st.rot = 0; st.fh = false; st.fv = false; }
  let loadedId = null, small = null, token = 0;
  const holder = h('div', { class: 'image-rot-view' });
  const label = h('p', { class: 'image-rot-label', 'aria-live': 'polite' });
  const loading = h('p', { class: 'muted image-crop-loading', role: 'status' }, h('span', { class: 'spin' }), 'Preparing the preview…');
  const mk = (txt, ic, fn, extra = {}) => h('button', { class: 'btn btn-quiet btn-sm image-rot-btn', type: 'button', onclick: fn, ...extra }, icon(ic, 'sm'), txt);
  // Turning right after a single flip must turn the picture right on screen, so the stored turn goes the other way.
  const turn = d => { st.rot = ((st.rot + (st.fh !== st.fv ? -d : d)) % 360 + 360) % 360; draw(); };
  const bFlipH = mk('Flip horizontal', 'imgFlipH', () => { st.fh = !st.fh; draw(); }, { 'aria-pressed': 'false' });
  const bFlipV = mk('Flip vertical', 'imgFlipV', () => { st.fv = !st.fv; draw(); }, { 'aria-pressed': 'false' });
  const bar = h('div', { class: 'image-rot-bar', role: 'group', 'aria-label': 'Rotate and flip' },
    mk('Rotate left', 'rotl', () => turn(-90)), mk('Rotate right', 'rotr', () => turn(90)), mk('Rotate 180°', 'rotate', () => turn(180)), bFlipH, bFlipV,
    h('button', { class: 'btn btn-text btn-sm', type: 'button', onclick: () => { st.rot = 0; st.fh = st.fv = false; draw(); } }, 'Reset'));
  const note = S.files.length > 1 ? h('p', { class: 'help' }, 'The preview shows the first image. The same changes are applied to every image.') : null;
  const el = h('section', { class: 'card panel image-rot', 'aria-label': 'Preview' }, h('h2', {}, 'Rotate and flip'), bar, loading, holder, label, note);

  function describe() {
    const parts = [];
    if (st.rot) parts.push(`rotated ${st.rot === 90 ? '90° clockwise' : st.rot === 270 ? '90° counter-clockwise' : '180°'}`);
    if (st.fh) parts.push('flipped horizontally');
    if (st.fv) parts.push('flipped vertically');
    return parts.length ? 'Result: ' + parts.join(', ') + '.' : 'No changes yet. Pick a button above.';
  }
  function draw() {
    bFlipH.setAttribute('aria-pressed', String(st.fh)); bFlipV.setAttribute('aria-pressed', String(st.fv));
    label.textContent = describe();
    if (small) {
      const c = transformCanvas(small, small.width, small.height, st.rot, st.fh, st.fv);
      c.className = 'image-rot-canvas'; c.setAttribute('aria-hidden', 'true');
      holder.replaceChildren(c);
    }
    api.refresh();
  }
  async function load() {
    const f = S.files[0]; if (!f || f.id === loadedId) return;
    loadedId = f.id; const my = ++token; holder.replaceChildren(); loading.hidden = false; small = null;
    try {
      const img = await loadImage(f.file, f.type, f.info);
      if (my !== token) { img.close(); return; }
      const k = Math.min(1, 760 / Math.max(img.w, img.h));
      small = scaleCanvas(img.src, 0, 0, img.w, img.h, Math.max(1, Math.round(img.w * k)), Math.max(1, Math.round(img.h * k)));
      img.close(); loading.hidden = true; draw();
    } catch (e) { loading.hidden = false; loading.className = 'image-crop-loading err-t'; loading.replaceChildren(icon('alert'), (e && e.message) || 'This image could not be shown.'); }
  }
  load(); label.textContent = describe(); bFlipH.setAttribute('aria-pressed', String(st.fh)); bFlipV.setAttribute('aria-pressed', String(st.fv));
  return { el, update() { load(); } };
}

// ---------------------------------------------------------------------------------------------- base64 result
const SHOW_MAX = 120000; // characters shown in a box; copying always copies everything
export function base64Panel({ name, mime, b64, bytes }) {
  const uri = `data:${mime};base64,${b64}`;
  const items = [
    { key: 'uri', label: 'Data URI', text: uri, help: 'Paste into an img src, a CSS url(), or a browser address bar.' },
    { key: 'raw', label: 'Raw Base64', text: b64, help: 'Only the encoded characters, without the data: prefix. For APIs and JSON.' },
    { key: 'css', label: 'CSS', text: `background-image: url("${uri}");`, help: 'A ready-to-paste background-image rule.' },
    { key: 'html', label: 'HTML', text: `<img src="${uri}" alt="">`, help: 'An img tag. Add a description between the alt quotes.' },
  ];
  const big = b64.length > 1.4e6; // about 1 MB of image data once encoded
  const wrap = h('div', { class: 'image-b64' });
  const stat = h('p', { class: 'muted image-b64-sum' }, `${name} · ${fmtBytes(bytes)} as an image, ${fmtBytes(b64.length)} as Base64 text (about 33% more).`);
  wrap.append(stat);
  if (big) wrap.append(h('div', { class: 'alert warn', role: 'status' }, icon('alert'), h('div', { style: 'min-width:0' }, `This image is large for a data URI (${fmtBytes(b64.length)} of text). Pages that embed it load slower and cannot cache the picture. Compress or resize it first if you can, or link to a normal image file instead.`)));
  for (const it of items) {
    const tooLong = it.text.length > SHOW_MAX;
    const id = 'b64_' + it.key;
    const ta = h('textarea', { id, class: 'field area mono image-b64-ta', readonly: true, rows: it.key === 'raw' || it.key === 'uri' ? 4 : 3, spellcheck: 'false', 'aria-describedby': id + '_h' });
    ta.value = tooLong ? it.text.slice(0, 600) + '…' : it.text;
    const bar = h('div', { class: 'lt-bar' }, copyButton(() => it.text, `Copy ${it.label}`),
      it.key === 'uri' || it.key === 'raw' ? downloadButton(() => it.text, `${name.replace(/\.[^.]+$/, '')}-${it.key === 'uri' ? 'data-uri' : 'base64'}.txt`, 'Download .txt') : null);
    wrap.append(h('div', { class: 'image-b64-item' }, h('label', { class: 't', for: id }, it.label), ta,
      h('p', { class: 'help', id: id + '_h' }, it.help + (tooLong ? ` Only the start is shown here because it is very long. The Copy button copies all ${it.text.length.toLocaleString('en-US')} characters.` : '')), bar));
  }
  return wrap;
}
