// Crop panel for the Crop Image tool: preview, draggable crop box with handles, keyboard control, numeric X/Y/W/H and aspect presets.
// Coordinates are in pixels of the upright picture (EXIF rotation already applied), the same space the tool crops in.
import { h, icon } from '../core.js';
import { field, seg } from '../ui.js';
import { loadImage, scaleCanvas, dims } from './image-lib.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const ASPECTS = [
  { v: 'free', t: 'Free', r: 0 }, { v: '1:1', t: '1:1', r: 1 }, { v: '4:3', t: '4:3', r: 4 / 3 }, { v: '16:9', t: '16:9', r: 16 / 9 },
  { v: '3:2', t: '3:2', r: 3 / 2 }, { v: '9:16', t: '9:16', r: 9 / 16 }, { v: '4:5', t: '4:5', r: 4 / 5 },
];
const DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

// Pure geometry (exported for tests): new rect after dragging handle `dir` by (dx, dy) image pixels.
export function dragRect(r0, dir, dx, dy, ratio, W, H) {
  if (dir === 'move') return { x: Math.round(clamp(r0.x + dx, 0, W - r0.w)), y: Math.round(clamp(r0.y + dy, 0, H - r0.h)), w: r0.w, h: r0.h };
  const left = dir.includes('w'), right = dir.includes('e'), top = dir.includes('n'), bottom = dir.includes('s');
  let x1 = r0.x, y1 = r0.y, x2 = r0.x + r0.w, y2 = r0.y + r0.h;
  if (!ratio) {
    if (left) x1 = clamp(x1 + dx, 0, x2 - 1);
    if (right) x2 = clamp(x2 + dx, x1 + 1, W);
    if (top) y1 = clamp(y1 + dy, 0, y2 - 1);
    if (bottom) y2 = clamp(y2 + dy, y1 + 1, H);
    return { x: Math.round(x1), y: Math.round(y1), w: Math.max(1, Math.round(x2 - x1)), h: Math.max(1, Math.round(y2 - y1)) };
  }
  // fixed aspect ratio: the opposite edge/corner stays put
  const cx = r0.x + r0.w / 2, cy = r0.y + r0.h / 2;
  const sx = left ? -1 : right ? 1 : 0, sy = top ? -1 : bottom ? 1 : 0;
  const ax = sx > 0 ? r0.x : sx < 0 ? r0.x + r0.w : cx, ay = sy > 0 ? r0.y : sy < 0 ? r0.y + r0.h : cy;
  let nw = r0.w + sx * dx, nh = r0.h + sy * dy;
  if (sx && sy) { if (nw / ratio > nh) nh = nw / ratio; else nw = nh * ratio; }
  else if (sx) nh = nw / ratio; else nw = nh * ratio;
  let maxW = sx > 0 ? W - ax : sx < 0 ? ax : 2 * Math.min(ax, W - ax);
  let maxH = sy > 0 ? H - ay : sy < 0 ? ay : 2 * Math.min(ay, H - ay);
  nw = clamp(nw, 1, maxW); nh = nw / ratio;
  if (nh > maxH) { nh = maxH; nw = nh * ratio; }
  if (nh < 1) { nh = 1; nw = ratio; }
  const x = sx > 0 ? ax : sx < 0 ? ax - nw : ax - nw / 2, y = sy > 0 ? ay : sy < 0 ? ay - nh : ay - nh / 2;
  const w = Math.max(1, Math.round(nw)), hh = Math.max(1, Math.round(nh));
  return { x: Math.round(clamp(x, 0, W - w)), y: Math.round(clamp(y, 0, H - hh)), w, h: hh };
}
// Best rectangle with this ratio inside rect r, centred on it.
export function fitRatio(r, ratio, W, H) {
  if (!ratio) return r;
  let w = Math.min(r.w, r.h * ratio), hh = w / ratio;
  w = Math.max(1, Math.round(w)); hh = Math.max(1, Math.round(hh));
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  return { x: Math.round(clamp(cx - w / 2, 0, W - w)), y: Math.round(clamp(cy - hh / 2, 0, H - hh)), w, h: hh };
}

export function cropPanel(api) {
  const { S } = api; const f = S.files[0];
  const st = S.ext;
  if (st.fileId !== f.id) { for (const k of Object.keys(st)) delete st[k]; st.fileId = f.id; st.aspect = 'free'; }
  let W = f.w || 0, H = f.h || 0, ready = false;
  const el = h('section', { class: 'card panel image-crop', 'aria-label': 'Crop area' });
  const stage = h('div', { class: 'image-crop-stage', hidden: true });
  const canvasBox = h('div', { class: 'image-crop-frame' });
  const shades = ['t', 'b', 'l', 'r'].map(k => h('div', { class: 'image-crop-shade', 'aria-hidden': 'true', 'data-s': k }));
  const box = h('div', { class: 'image-crop-box', tabindex: '0', role: 'group', 'aria-describedby': 'imgCropHelp' });
  box.append(h('span', { class: 'image-crop-grid', 'aria-hidden': 'true' }));
  const handles = DIRS.map(d => { const e = h('span', { class: 'image-crop-h h-' + d, 'data-dir': d, 'aria-hidden': 'true' }); box.append(e); return e; });
  const loading = h('p', { class: 'muted image-crop-loading', role: 'status' }, h('span', { class: 'spin' }), 'Preparing the preview…');

  // ----- controls
  const aspectSeg = seg({ label: 'Shape', choices: ASPECTS.map(a => ({ v: a.v, t: a.t })), value: st.aspect, onInput: v => { st.aspect = v; const r = fitRatio(st.crop, ratio(), W, H); setRect(r); } });
  const ratio = () => (ASPECTS.find(a => a.v === st.aspect) || {}).r || 0;
  const fx = field({ label: 'X (left)', type: 'number', min: 0, step: 1, inputmode: 'numeric', suffix: 'px', onInput: () => numeric('x') });
  const fy = field({ label: 'Y (top)', type: 'number', min: 0, step: 1, inputmode: 'numeric', suffix: 'px', onInput: () => numeric('y') });
  const fw = field({ label: 'Width', type: 'number', min: 1, step: 1, inputmode: 'numeric', suffix: 'px', onInput: () => numeric('w') });
  const fh = field({ label: 'Height', type: 'number', min: 1, step: 1, inputmode: 'numeric', suffix: 'px', onInput: () => numeric('h') });
  const resetBtn = h('button', { class: 'btn btn-quiet btn-sm', type: 'button', onclick: () => { st.aspect = 'free'; aspectSeg.set('free'); setRect(startRect()); box.focus({ preventScroll: true }); } }, 'Reset crop');
  const help = h('p', { class: 'help', id: 'imgCropHelp' }, 'Drag the box or its handles. With the box focused, arrow keys move it, Ctrl plus arrow keys resize it, and Shift makes the steps one pixel.');
  const info = h('p', { class: 'image-crop-info', 'aria-live': 'polite' });
  const ctl = h('div', { class: 'image-crop-ctl' }, aspectSeg.el, h('div', { class: 'row2 image-crop-nums' }, fx.el, fy.el, fw.el, fh.el), h('div', { class: 'image-crop-bar' }, resetBtn, info), help);

  el.append(h('h2', {}, 'Choose the area to keep'), loading, stage, ctl);
  stage.append(canvasBox); canvasBox.append(...shades, box);

  const startRect = () => { const w = Math.round(W * 0.8), hh = Math.round(H * 0.8); return { x: Math.round((W - w) / 2), y: Math.round((H - hh) / 2), w: Math.max(1, w), h: Math.max(1, hh) }; };

  function setRect(r, skipInputs) {
    r = { x: Math.round(clamp(r.x, 0, W - 1)), y: Math.round(clamp(r.y, 0, H - 1)), w: Math.round(clamp(r.w, 1, W)), h: Math.round(clamp(r.h, 1, H)) };
    r.x = Math.min(r.x, W - r.w); r.y = Math.min(r.y, H - r.h);
    st.crop = r;
    box.style.left = (r.x / W * 100) + '%'; box.style.top = (r.y / H * 100) + '%'; box.style.width = (r.w / W * 100) + '%'; box.style.height = (r.h / H * 100) + '%';
    const pc = v => v + '%', [sT, sB, sL, sR] = shades, x0 = r.x / W * 100, y0 = r.y / H * 100, x1 = (r.x + r.w) / W * 100, y1 = (r.y + r.h) / H * 100;
    Object.assign(sT.style, { left: 0, top: 0, width: '100%', height: pc(y0) }); Object.assign(sB.style, { left: 0, top: pc(y1), width: '100%', height: pc(100 - y1) });
    Object.assign(sL.style, { left: 0, top: pc(y0), width: pc(x0), height: pc(y1 - y0) }); Object.assign(sR.style, { left: pc(x1), top: pc(y0), width: pc(100 - x1), height: pc(y1 - y0) });
    box.setAttribute('aria-label', `Crop area, ${r.w} by ${r.h} pixels, ${r.x} from the left and ${r.y} from the top`);
    if (!skipInputs) { fx.set(r.x); fy.set(r.y); fw.set(r.w); fh.set(r.h); [fx, fy, fw, fh].forEach(x => x.clear()); }
    info.textContent = `Output: ${dims(r.w, r.h)} px` + (r.w === W && r.h === H ? ' (the whole image)' : '');
    api.refresh();
  }
  function numeric(k) {
    const f2 = { x: fx, y: fy, w: fw, h: fh }[k]; const v = f2.num();
    const r = { ...st.crop };
    if (!Number.isInteger(v)) { f2.error('Enter a whole number.'); return; }
    if (k === 'x' || k === 'y') {
      if (v < 0) return f2.error('Use 0 or more.');
      const lim = k === 'x' ? W - r.w : H - r.h;
      if (v > lim) return f2.error(`With this size, ${k.toUpperCase()} can be at most ${lim}. Make the crop smaller first.`);
      r[k] = v; f2.clear(); setRect(r, true); return;
    }
    if (v < 1) return f2.error('Use 1 or more.');
    const max = k === 'w' ? W - r.x : H - r.y;
    if (v > max) return f2.error(`With this position, ${k === 'w' ? 'width' : 'height'} can be at most ${max}. Move the box or lower X/Y first.`);
    const rt = ratio(); r[k] = v;
    if (rt) {
      if (k === 'w') { r.h = Math.max(1, Math.round(v / rt)); if (r.y + r.h > H) { return f2.error(`At ${st.aspect} the height would pass the bottom edge. Use a smaller width.`); } }
      else { r.w = Math.max(1, Math.round(v * rt)); if (r.x + r.w > W) { return f2.error(`At ${st.aspect} the width would pass the right edge. Use a smaller height.`); } }
    }
    f2.clear(); setRect(r, false);
  }

  // ----- pointer
  let drag = null;
  const toImg = e => { const b = canvasBox.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width * W, y: (e.clientY - b.top) / b.height * H }; };
  box.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    const dir = e.target.dataset && e.target.dataset.dir ? e.target.dataset.dir : 'move';
    drag = { dir, p0: toImg(e), r0: { ...st.crop }, id: e.pointerId };
    try { box.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    box.focus({ preventScroll: true }); e.preventDefault();
  });
  box.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = toImg(e); setRect(dragRect(drag.r0, drag.dir, p.x - drag.p0.x, p.y - drag.p0.y, ratio(), W, H));
  });
  const endDrag = e => { if (drag && e.pointerId === drag.id) { drag = null; } };
  box.addEventListener('pointerup', endDrag); box.addEventListener('pointercancel', endDrag);
  // ----- keyboard
  box.addEventListener('keydown', e => {
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!k) return;
    e.preventDefault();
    const step = e.shiftKey ? 1 : Math.max(1, Math.round(Math.max(W, H) / 100));
    const r0 = st.crop;
    if (e.ctrlKey || e.metaKey) setRect(dragRect(r0, 'se', k[0] * step, k[1] * step, ratio(), W, H));
    else setRect(dragRect(r0, 'move', k[0] * step, k[1] * step, 0, W, H));
  });

  // ----- load preview (the picture is decoded upright, so what you see is what is cropped)
  (async () => {
    try {
      const img = await loadImage(f.file, f.type, f.info);
      W = img.w; H = img.h;
      const k = Math.min(1, 1100 / Math.max(W, H));
      const prev = scaleCanvas(img.src, 0, 0, W, H, Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k)), { opaque: false });
      img.close();
      prev.className = 'image-crop-canvas'; prev.setAttribute('aria-hidden', 'true');
      canvasBox.prepend(prev); canvasBox.style.aspectRatio = `${W} / ${H}`; canvasBox.style.maxWidth = prev.width + 'px';
      f.w = W; f.h = H;
      loading.remove(); stage.hidden = false; ready = true;
      const same = st.crop && st.crop.x + st.crop.w <= W && st.crop.y + st.crop.h <= H;
      setRect(same ? st.crop : startRect());
    } catch (e) {
      loading.replaceChildren(icon('alert'), (e && e.message) || 'This image could not be shown.');
      loading.className = 'image-crop-loading err-t';
    }
  })();

  return { el, update() { /* geometry is kept in S.ext.crop */ } };
}
