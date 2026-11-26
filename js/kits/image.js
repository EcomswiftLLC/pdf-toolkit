// Image tools kit (browser only, nothing is uploaded). Exports IMAGE_TOOLS; see KITS.md for the tool shape.
// File tools run through js/flow.js (drop zone, list, options, progress, result, ZIP).
import { AppError, Cancelled, fmtBytes, plural, registerIcons } from '../core.js';
import {
  FMT, TYPE_LABEL, keepFormat, loadImage, scaleCanvas, transformCanvas, release, fitCanvas, encodeCanvas, webpSupported, NO_WEBP,
  readMeta, stripJpeg, stripPng, stripWebp, outName, uniqueNamer, dims, yieldUI,
} from './image-lib.js';
import { cropPanel, ASPECTS } from './image-crop.js';
import { rotatePanel, base64Panel } from './image-views.js';
import { SEO } from './image-seo.js';

// ---------------------------------------------------------------------------------------------- icons
export const IMAGE_ICONS = {
  imgCompress: '<rect x="3" y="3" width="18" height="18" rx="3.5"/><path d="M9.5 9.5 12 12l2.5 2.5"/><path d="M9 11.5V9h2.5"/><path d="M15 12.5V15h-2.5"/>',
  imgResize: '<rect x="3" y="9" width="12" height="12" rx="2.5"/><path d="M12 12 21 3"/><path d="M15 3h6v6"/>',
  imgConvert: '<path d="M4 8h13"/><path d="m14 5 3 3-3 3"/><path d="M20 16H7"/><path d="m10 13-3 3 3 3"/>',
  imgCrop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M2 6h14a2 2 0 0 1 2 2v14"/>',
  imgFlip: '<path d="M12 3v18"/><path d="M9 7 3.5 17H9z"/><path d="m15 7 5.5 10H15z"/>',
  imgFlipH: '<path d="M12 3v18" stroke-dasharray="2 3"/><path d="M9 7 3.5 17H9z"/><path d="m15 7 5.5 10H15z"/>',
  imgFlipV: '<path d="M3 12h18" stroke-dasharray="2 3"/><path d="M7 9V3.5L17 9z"/><path d="m7 15 10 0-10 5.5z"/>',
  imgBase64: '<path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/><path d="m13.5 6-3 12"/>',
  imgMeta: '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.5"/><path d="m4 4 16 16"/>',
  imgMark: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m8 15 2-6 2 6"/><path d="M8.8 13h2.4"/><path d="M15 9v6"/>',
};
registerIcons(IMAGE_ICONS);

// ---------------------------------------------------------------------------------------------- shared helpers
const chk = s => { if (s && s.aborted) throw new Cancelled(); };
let WEBP_OK = null;
const WEBP_LISTS = [];
webpSupported().then(ok => { WEBP_OK = ok; if (!ok) for (const l of WEBP_LISTS) { const i = l.findIndex(c => c.v === 'webp'); if (i >= 0) l.splice(i, 1); } });
const fmtChoices = (vals, desc = {}) => {
  const all = { keep: { v: 'keep', t: 'Same as original' }, jpeg: { v: 'jpeg', t: 'JPG' }, png: { v: 'png', t: 'PNG' }, webp: { v: 'webp', t: 'WebP' } };
  const l = vals.map(v => ({ ...all[v], ...(desc[v] ? { d: desc[v] } : {}) })); WEBP_LISTS.push(l); return l;
};
const KEEP_HELP = 'JPG stays JPG, PNG stays PNG and WebP stays WebP. GIF becomes PNG (first frame) and BMP becomes JPG.';
const qualityOpt = (value, extra = {}) => ({ key: 'quality', type: 'range', label: 'Quality', min: 10, max: 100, step: 1, value, format: v => v + '%', ...extra });
const bgOpt = showIf => ({ key: 'bg', type: 'color', label: 'Background for transparent areas', value: '#ffffff', help: 'JPG cannot store transparency, so see-through areas are filled with this colour.', showIf });
const bgOf = o => (/^#[0-9a-f]{6}$/i.test(o.bg || '') ? o.bg : '#ffffff');

// Runs fn on every file; one damaged image does not stop the rest. Throws only when nothing worked.
async function eachFile(files, progress, signal, verb, fn) {
  const ok = [], notes = []; let first = null;
  for (let i = 0; i < files.length; i++) {
    chk(signal); progress(i / files.length, `${verb} ${files[i].name} (${i + 1} of ${files.length})`);
    try { ok.push(await fn(files[i], i)); }
    catch (e) {
      if (e instanceof Cancelled) throw e;
      if (!first) first = e;
      const msg = e instanceof AppError ? e.message : 'it could not be processed.';
      notes.push(msg.includes(files[i].name) ? `${msg} It was skipped.` : `"${files[i].name}" was skipped: ${msg}`);
    }
    await yieldUI();
  }
  if (!ok.length) throw first instanceof AppError ? first : new AppError('image', 'These images could not be processed. They may be damaged.');
  return { ok, notes };
}
// Which format does this file leave in? Handles GIF/BMP "keep" and browsers that cannot write WebP.
function pickFormat(choice, f) {
  let fmt = choice === 'keep' ? keepFormat(f.type) : choice, note = '';
  if (choice === 'keep' && f.type === 'gif') note = f.info && f.info.animated ? 'Animated GIF: only the first frame is kept, saved as PNG.' : 'GIF saved as PNG.';
  if (choice === 'keep' && f.type === 'bmp') note = 'BMP cannot be kept, so it was saved as JPG.';
  if (fmt === 'webp' && WEBP_OK === false) {
    if (choice === 'webp') throw new AppError('format', NO_WEBP);
    fmt = f.info && f.info.alpha === false ? 'jpeg' : 'png'; note = `This browser cannot save WebP, so the image was saved as ${FMT[fmt].label}.`;
  }
  return { fmt, note };
}
const render = (img, tw, th, fmt, bg) => scaleCanvas(img.src, 0, 0, img.w, img.h, tw, th, { bg: fmt === 'jpeg' ? bg : null, opaque: fmt !== 'jpeg' && !img.alpha });
const sizeStats = (before, after, labels = ['Original', 'Now']) => [
  { label: labels[0], value: fmtBytes(before) }, { label: labels[1], value: fmtBytes(after) },
  after <= before ? { label: 'Saved', value: before ? Math.round((1 - after / before) * 100) + '%' : '0%', hint: fmtBytes(before - after) + ' less' }
    : { label: 'Change', value: '+' + Math.round((after / before - 1) * 100) + '%', hint: fmtBytes(after - before) + ' more' },
];
const rowOut = (name, blob, f, extra = {}) => ({ name, blob, preview: true, meta: `${fmtBytes(f.size)} → ${fmtBytes(blob.size)}`, ...extra });
const smaller = (before, after) => { const p = Math.round((1 - after / before) * 100); return p >= 1 ? `${p}% smaller` : p <= -1 ? `${-p}% bigger` : 'same size'; };
const intIn = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const blank = v => v === '' || v == null;

// ---------------------------------------------------------------------------------------------- compress
async function searchQuality(canvas, fmt, target) {
  let lo = 0.05, hi = 0.95;
  let b = await encodeCanvas(canvas, fmt, hi); if (b.size <= target) return { blob: b, q: hi };
  b = await encodeCanvas(canvas, fmt, lo); if (b.size > target) return { blob: b, q: lo, over: true };
  let best = { blob: b, q: lo };
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2; b = await encodeCanvas(canvas, fmt, mid);
    if (b.size <= target) { best = { blob: b, q: mid }; lo = mid; } else hi = mid;
  }
  return best;
}

async function compressOne(f, o) {
  const img = await loadImage(f.file, f.type, f.info);
  const notes = [];
  try {
    const { fmt, note } = pickFormat(o.fmt, f); if (note) notes.push(note);
    let tw = img.w, th = img.h;
    const mw = blank(o.maxWidth) ? 0 : Number(o.maxWidth);
    if (mw && img.w > mw) { tw = mw; th = Math.max(1, Math.round(img.h * mw / img.w)); }
    const fit = fitCanvas(tw, th);
    if (fit.shrunk) { tw = fit.w; th = fit.h; notes.push(`It is larger than this browser can process in one piece, so it was scaled down to ${dims(tw, th)}.`); }
    const bg = bgOf(o); let canvas = render(img, tw, th, fmt, bg), blob, resized = tw !== img.w || th !== img.h;
    const target = blank(o.target) ? 0 : Number(o.target) * 1024;
    if (fmt === 'png') blob = await encodeCanvas(canvas, 'png');
    else if (target) {
      let r = await searchQuality(canvas, fmt, target), scale = 1;
      while (r.over && tw * scale * 0.8 >= 160) {
        scale *= 0.8; release(canvas);
        canvas = render(img, Math.max(1, Math.round(tw * scale)), Math.max(1, Math.round(th * scale)), fmt, bg);
        r = await searchQuality(canvas, fmt, target);
      }
      blob = r.blob;
      if (scale < 1) { resized = true; tw = canvas.width; th = canvas.height; notes.push(`To get close to ${fmtBytes(target)} it was also made smaller: ${dims(tw, th)}.`); }
      if (r.over) notes.push(`It could not get down to ${fmtBytes(target)}. This is the smallest result at this size.`);
    } else blob = await encodeCanvas(canvas, fmt, Number(o.quality) / 100);
    release(canvas);
    return { f, blob, fmt, notes, resized, tw, th };
  } finally { img.close(); }
}

const COMPRESS = {
  id: 'compress-image', slug: 'compress-image', name: 'Compress Image',
  blurb: 'Make JPG, PNG and WebP images smaller. Pick a quality or a target size.', keywords: 'compress image reduce size shrink jpg png webp optimize kb', icon: 'imgCompress',
  accept: 'image', multi: true, maxFiles: 20, view: 'list', reorder: false, listNote: 'Each image is compressed separately. Your original files are never changed.',
  cta: s => `Compress ${plural(s.files.length, 'image')}`, ctaIcon: 'imgCompress', working: 'Compressing your images…', downloadLabel: 'Download image',
  status: s => (s.files.length ? `${plural(s.files.length, 'image')} · ${fmtBytes(s.files.reduce((n, f) => n + f.size, 0))}` : ''),
  options: [
    { key: 'fmt', type: 'seg', label: 'Output format', value: 'keep', choices: fmtChoices(['keep', 'jpeg', 'webp'], { keep: KEEP_HELP + ' PNG is lossless, so the quality setting does not change a PNG. Choose JPG or WebP for much smaller files.' }) },
    qualityOpt(75, { help: 'Lower quality gives a smaller file. Around 70 to 80 usually looks the same on screen. Applies to JPG and WebP output.' }),
    { key: 'maxWidth', type: 'number', label: 'Maximum width (optional)', value: '', min: 16, max: 20000, step: 1, suffix: 'px', placeholder: 'No limit', help: 'Wider images are scaled down to this width. Narrower images are left as they are.' },
    { key: 'target', type: 'number', label: 'Target size per image (optional)', value: '', min: 5, max: 50000, step: 1, suffix: 'KB', placeholder: 'No target', help: 'We find the highest quality that fits, and shrink the picture a little if quality alone is not enough. Works for JPG and WebP.' },
    bgOpt(o => o.fmt === 'jpeg'),
  ],
  validate: s => {
    const o = s.opts;
    if (!blank(o.maxWidth) && !intIn(o.maxWidth, 16, 20000)) return { key: 'maxWidth', msg: 'Enter a whole number from 16 to 20,000, or leave it empty.' };
    if (!blank(o.target) && !intIn(o.target, 5, 50000)) return { key: 'target', msg: 'Enter a whole number of KB from 5 to 50,000, or leave it empty.' };
    if (o.fmt === 'webp' && WEBP_OK === false) return NO_WEBP;
    return null;
  },
  async run({ files, opts, progress, signal }) {
    await webpSupported();
    const { ok, notes } = await eachFile(files, progress, signal, 'Compressing', f => compressOne(f, opts));
    const name = uniqueNamer(); const outputs = []; let before = 0, after = 0, kept = 0, shrunk = 0, pngLossless = false;
    for (const r of ok) {
      const f = r.f; before += f.size;
      if (r.fmt === 'png' && f.type === 'png' && !r.resized) pngLossless = true;
      if (r.blob.size >= f.size) {
        kept++; after += f.size;
        outputs.push({ name: name(outName(f.name, '', f.type === 'jpeg' ? 'jpg' : f.type)), blob: f.file, preview: true, meta: fmtBytes(f.size), chip: 'Unchanged', chipKind: 'muted',
          note: f.type === 'png' && r.fmt === 'png' ? 'This PNG could not get smaller. PNG is lossless, so quality does not apply. Your original is included unchanged. Choose WebP or JPG, or set a maximum width, to shrink it.' : 'Compressing would not make this file smaller, so your original is included unchanged. Try a lower quality, a maximum width or WebP.' });
        continue;
      }
      shrunk++; after += r.blob.size;
      outputs.push(rowOut(name(outName(f.name, 'compressed', FMT[r.fmt].ext)), r.blob, f, { meta: `${fmtBytes(f.size)} → ${fmtBytes(r.blob.size)}${r.resized ? ' · ' + dims(r.tw, r.th) : ''}`, chip: smaller(f.size, r.blob.size), chipKind: 'good', note: r.notes.join(' ') || false }));
    }
    const allKept = kept === ok.length;
    const out = [...notes];
    if (pngLossless && !allKept) out.push('PNG is lossless, so the quality setting does not change PNG files. To shrink a PNG, choose JPG or WebP as the output format, or set a maximum width.');
    out.push('Compressed copies are saved again from the pixels, so camera details such as location and the colour profile are not carried over.');
    return {
      title: allKept ? (ok.length === 1 ? 'This image is already as small as it gets' : 'These images are already well compressed') : ok.length === 1 ? 'Your image is smaller' : `${plural(shrunk, 'image')} compressed`,
      summary: allKept ? 'We kept your originals because the compressed versions would not be smaller.' : kept ? `${plural(kept, 'image')} could not get smaller, so your original ${kept === 1 ? 'is' : 'files are'} included unchanged.` : null,
      badge: after < before ? `${smaller(before, after)} overall` : null, stats: sizeStats(before, after), outputs, notes: out, zipName: 'compressed-images',
    };
  },
  seo: SEO['compress-image'],
};

// ---------------------------------------------------------------------------------------------- resize
const PRESETS = {
  'ig-square': { t: 'Instagram square, 1080 × 1080', size: [1080, 1080] },
  'ig-portrait': { t: 'Instagram portrait, 1080 × 1350', size: [1080, 1350] },
  story: { t: 'Story or Reel, 1080 × 1920', size: [1080, 1920] },
  fullhd: { t: 'Full HD, 1920 × 1080', size: [1920, 1080] },
  hd: { t: 'HD, 1280 × 720', size: [1280, 720] },
  og: { t: 'Link preview card, 1200 × 630', size: [1200, 630] },
  xpost: { t: 'Wide post image, 1600 × 900', size: [1600, 900] },
  profile: { t: 'Profile picture, 400 × 400', size: [400, 400] },
};
// Pure sizing logic. Returns where to read from the source, how big the result is, and what to tell the user.
export function planResize(w, h, o) {
  const enlargeOK = o.larger === 'enlarge';
  const p = { region: [0, 0, w, h], tw: w, th: h, pad: null, notEnlarged: false, enlarged: false };
  if (o.mode === 'preset') {
    const [bw, bh] = (PRESETS[o.preset] || PRESETS['ig-square']).size;
    if (o.fit === 'cover') {
      const ar = bw / bh; let sw = w, sh = h;
      if (w / h > ar) sw = Math.max(1, Math.round(h * ar)); else sh = Math.max(1, Math.round(w / ar));
      p.region = [Math.round((w - sw) / 2), Math.round((h - sh) / 2), sw, sh];
      if ((sw < bw || sh < bh) && !enlargeOK) { p.tw = sw; p.th = sh; p.notEnlarged = true; } else { p.tw = bw; p.th = bh; p.enlarged = sw < bw || sh < bh; }
    } else if (o.fit === 'pad') {
      let k = Math.min(bw / w, bh / h);
      if (k > 1 && !enlargeOK) { k = 1; p.notEnlarged = true; } else if (k > 1) p.enlarged = true;
      p.tw = bw; p.th = bh; p.pad = { dw: Math.max(1, Math.round(w * k)), dh: Math.max(1, Math.round(h * k)) };
    } else {
      const k = Math.min(bw / w, bh / h);
      p.tw = Math.max(1, Math.round(w * k)); p.th = Math.max(1, Math.round(h * k));
      if (k > 1) { if (enlargeOK) p.enlarged = true; else { p.tw = w; p.th = h; p.notEnlarged = true; } }
    }
    return p;
  }
  let tw, th, keepsAspect = true;
  if (o.mode === 'percent') { const k = Number(o.percent) / 100; tw = Math.max(1, Math.round(w * k)); th = Math.max(1, Math.round(h * k)); }
  else {
    const W = Number(o.width) || 0, H = Number(o.height) || 0;
    if (o.lock) {
      if (W && H) { const k = Math.min(W / w, H / h); tw = Math.max(1, Math.round(w * k)); th = Math.max(1, Math.round(h * k)); }
      else if (W) { tw = W; th = Math.max(1, Math.round(h * W / w)); } else { th = H; tw = Math.max(1, Math.round(w * H / h)); }
    } else { tw = W; th = H; keepsAspect = false; }
  }
  if (tw > w || th > h) {
    if (enlargeOK) p.enlarged = true;
    else { p.notEnlarged = true; if (keepsAspect) { tw = w; th = h; } else { tw = Math.min(tw, w); th = Math.min(th, h); } }
  }
  p.tw = tw; p.th = th; return p;
}

const RESIZE = {
  id: 'resize-image', slug: 'resize-image', name: 'Resize Image',
  blurb: 'Change the size of JPG, PNG and WebP images by pixels, percent or a preset like 1080 × 1080.', keywords: 'resize image scale pixels width height percent social media instagram', icon: 'imgResize',
  accept: 'image', multi: true, maxFiles: 20, view: 'list', reorder: false, listNote: 'Each image is resized separately. Your original files are never changed.',
  cta: s => `Resize ${plural(s.files.length, 'image')}`, ctaIcon: 'imgResize', working: 'Resizing your images…', downloadLabel: 'Download image',
  status: s => {
    const f = s.files[0]; if (!f || !f.w) return '';
    const o = s.opts; if (o.mode === 'pixels' && blank(o.width) && blank(o.height)) return '';
    if (o.mode === 'percent' && !(Number(o.percent) > 0)) return '';
    const p = planResize(f.w, f.h, o); if (!(p.tw > 0 && p.th > 0)) return '';
    const more = s.files.length > 1 ? ` for ${f.name}, the first image` : '';
    return `Result${more}: ${dims(p.tw, p.th)} px` + (p.notEnlarged ? '. Not enlarged: it is smaller than the target.' : p.enlarged ? '. Enlarged, so it may look soft.' : '');
  },
  options: [
    { key: 'mode', type: 'seg', label: 'Resize by', value: 'pixels', choices: [{ v: 'pixels', t: 'Pixels' }, { v: 'percent', t: 'Percent' }, { v: 'preset', t: 'Preset size' }] },
    { key: 'width', type: 'number', label: 'Width', value: '', min: 1, max: 20000, step: 1, suffix: 'px', placeholder: 'Auto', showIf: o => o.mode === 'pixels' },
    { key: 'height', type: 'number', label: 'Height', value: '', min: 1, max: 20000, step: 1, suffix: 'px', placeholder: 'Auto', showIf: o => o.mode === 'pixels', help: 'With the aspect ratio kept, fill in one box or both. The picture fits inside and never gets distorted.' },
    { key: 'lock', type: 'check', label: 'Keep the aspect ratio', value: true, showIf: o => o.mode === 'pixels', help: 'Turn off to stretch the picture to exactly the width and height above.' },
    { key: 'percent', type: 'number', label: 'Scale', value: 50, min: 1, max: 500, step: 1, suffix: '%', showIf: o => o.mode === 'percent', help: '50% halves the width and height. Values above 100 enlarge the picture.' },
    { key: 'preset', type: 'select', label: 'Preset', value: 'ig-square', choices: Object.entries(PRESETS).map(([v, p]) => ({ v, t: p.t })), showIf: o => o.mode === 'preset' },
    { key: 'fit', type: 'seg', label: 'When the shape differs', value: 'inside', choices: [
      { v: 'inside', t: 'Fit inside', d: 'The whole picture is kept. One side may come out shorter than the preset.' },
      { v: 'cover', t: 'Fill and crop', d: 'The result is exactly the preset size. The edges that do not fit are cut off, from the centre.' },
      { v: 'pad', t: 'Add padding', d: 'The result is exactly the preset size. The whole picture is kept and the empty space is filled with the colour below.' }], showIf: o => o.mode === 'preset' },
    { key: 'padColor', type: 'color', label: 'Padding colour', value: '#ffffff', showIf: o => o.mode === 'preset' && o.fit === 'pad' },
    { key: 'larger', type: 'seg', label: 'Images smaller than the new size', value: 'keep', choices: [
      { v: 'keep', t: 'Leave them as they are', d: 'Enlarging adds no detail and makes pictures soft, so smaller images are not scaled up.' },
      { v: 'enlarge', t: 'Enlarge them', d: 'The picture is scaled up to the new size. It can look soft or blocky.' }] },
    { key: 'fmt', type: 'seg', label: 'Output format', value: 'keep', choices: fmtChoices(['keep', 'jpeg', 'png', 'webp'], { keep: KEEP_HELP }) },
    qualityOpt(90, { showIf: o => o.fmt !== 'png', help: 'Applies to JPG and WebP output.' }),
    bgOpt(o => o.fmt === 'jpeg'),
  ],
  validate: s => {
    const o = s.opts;
    if (o.mode === 'pixels') {
      const W = o.width, H = o.height;
      if (!blank(W) && !intIn(W, 1, 20000)) return { key: 'width', msg: 'Enter a whole number from 1 to 20,000.' };
      if (!blank(H) && !intIn(H, 1, 20000)) return { key: 'height', msg: 'Enter a whole number from 1 to 20,000.' };
      if (o.lock && blank(W) && blank(H)) return { key: 'width', msg: 'Enter a width or a height.' };
      if (!o.lock && (blank(W) || blank(H))) return { key: blank(W) ? 'width' : 'height', msg: 'Enter both a width and a height, or turn on "Keep the aspect ratio".' };
    } else if (o.mode === 'percent' && !intIn(o.percent, 1, 500)) return { key: 'percent', msg: 'Enter a whole number from 1 to 500.' };
    if (o.fmt === 'webp' && WEBP_OK === false) return NO_WEBP;
    return null;
  },
  async run({ files, opts, progress, signal }) {
    await webpSupported();
    const { ok, notes } = await eachFile(files, progress, signal, 'Resizing', async f => {
      const img = await loadImage(f.file, f.type, f.info);
      try {
        const { fmt, note } = pickFormat(opts.fmt, f); const p = planResize(img.w, img.h, opts); const bg = fmt === 'jpeg' ? bgOf(opts) : null;
        let { tw, th } = p; const rowNotes = note ? [note] : [];
        const fit = fitCanvas(tw, th);
        if (fit.shrunk) { const k = fit.w / tw; tw = fit.w; th = fit.h; if (p.pad) { p.pad.dw = Math.max(1, Math.round(p.pad.dw * k)); p.pad.dh = Math.max(1, Math.round(p.pad.dh * k)); } rowNotes.push(`The size is larger than this browser can create, so it was reduced to ${dims(tw, th)}.`); }
        let canvas;
        if (p.pad) {
          const inner = scaleCanvas(img.src, 0, 0, img.w, img.h, p.pad.dw, p.pad.dh, { opaque: !img.alpha });
          canvas = document.createElement('canvas'); canvas.width = tw; canvas.height = th;
          const ctx = canvas.getContext('2d'); ctx.fillStyle = fmt === 'jpeg' ? bgOf(opts) : (opts.padColor || '#ffffff'); ctx.fillRect(0, 0, tw, th);
          ctx.drawImage(inner, Math.round((tw - p.pad.dw) / 2), Math.round((th - p.pad.dh) / 2)); release(inner);
        } else canvas = scaleCanvas(img.src, p.region[0], p.region[1], p.region[2], p.region[3], tw, th, { bg, opaque: fmt !== 'jpeg' && !img.alpha });
        if (p.notEnlarged) rowNotes.push(`Kept at ${dims(tw, th)}: the original is smaller than the size you asked for, and enlarging would only make it soft.`);
        if (p.enlarged) rowNotes.push('Enlarged: scaling up cannot add detail, so it may look soft.');
        const blob = await encodeCanvas(canvas, fmt, Number(opts.quality) / 100); release(canvas);
        return { f, blob, fmt, tw, th, rowNotes, enlarged: p.enlarged, notEnlarged: p.notEnlarged, ow: img.w, oh: img.h };
      } finally { img.close(); }
    });
    const name = uniqueNamer(); let before = 0, after = 0;
    const outputs = ok.map(r => {
      before += r.f.size; after += r.blob.size;
      return rowOut(name(outName(r.f.name, 'resized', FMT[r.fmt].ext)), r.blob, r.f, { meta: `${dims(r.ow, r.oh)} → ${dims(r.tw, r.th)} · ${fmtBytes(r.blob.size)}`, chip: r.notEnlarged ? 'Not enlarged' : r.enlarged ? 'Enlarged' : null, chipKind: r.notEnlarged ? 'muted' : 'warn', note: r.rowNotes.join(' ') || false });
    });
    const out = [...notes];
    const ne = ok.filter(r => r.notEnlarged).length;
    if (ne && ok.length > 1) out.push(`${plural(ne, 'image')} ${ne === 1 ? 'was' : 'were'} already smaller than the new size, so ${ne === 1 ? 'it was' : 'they were'} not enlarged. Choose "Enlarge them" to scale ${ne === 1 ? 'it' : 'them'} up.`);
    return {
      title: ok.length === 1 ? 'Your image is resized' : `${plural(ok.length, 'image')} resized`, outputs, notes: out, zipName: 'resized-images',
      stats: ok.length === 1 ? [{ label: 'Before', value: dims(ok[0].ow, ok[0].oh), hint: fmtBytes(ok[0].f.size) }, { label: 'After', value: dims(ok[0].tw, ok[0].th), hint: fmtBytes(ok[0].blob.size) }] : sizeStats(before, after, ['Before', 'After']),
    };
  },
  seo: SEO['resize-image'],
};

// ---------------------------------------------------------------------------------------------- convert (+ four preset variants)
function convertTool(spec) {
  return {
    id: spec.id, slug: spec.id, name: spec.name, blurb: spec.blurb, keywords: spec.keywords, icon: 'imgConvert',
    accept: 'image', multi: true, maxFiles: 20, view: 'list', reorder: false, listNote: 'Each image is converted separately. Your original files are never changed.',
    noun: spec.noun, hint: spec.hint, pickAccept: spec.pickAccept,
    cta: s => `Convert ${plural(s.files.length, 'image')}`, ctaIcon: 'imgConvert', working: 'Converting your images…', downloadLabel: 'Download image',
    status: s => (s.files.length ? `${plural(s.files.length, 'image')} · ${fmtBytes(s.files.reduce((n, f) => n + f.size, 0))}` : ''),
    options: [
      { key: 'fmt', type: 'seg', label: 'Convert to', value: spec.fmt, choices: fmtChoices(['jpeg', 'png', 'webp'], { jpeg: 'Small files, no transparency. Best for photos.', png: 'Keeps every pixel and transparency. Files are often larger than JPG or WebP.', webp: 'Small files and keeps transparency. Some older programs cannot open WebP.' }) },
      qualityOpt(90, { showIf: o => o.fmt !== 'png', help: 'Applies to JPG and WebP. Around 90 keeps the picture looking the same in most cases.' }),
      bgOpt(o => o.fmt === 'jpeg'),
    ],
    validate: s => (s.opts.fmt === 'webp' && WEBP_OK === false ? NO_WEBP : null),
    async run({ files, opts, progress, signal }) {
      await webpSupported();
      const fmt = opts.fmt; const bg = bgOf(opts);
      const { ok, notes } = await eachFile(files, progress, signal, 'Converting', async f => {
        if (fmt === 'webp' && WEBP_OK === false) throw new AppError('format', NO_WEBP);
        const img = await loadImage(f.file, f.type, f.info);
        try {
          let tw = img.w, th = img.h; const rowNotes = [];
          const fit = fitCanvas(tw, th); if (fit.shrunk) { tw = fit.w; th = fit.h; rowNotes.push(`It is larger than this browser can process in one piece, so it was scaled down to ${dims(tw, th)}.`); }
          const canvas = render(img, tw, th, fmt, bg);
          const blob = await encodeCanvas(canvas, fmt, Number(opts.quality) / 100); release(canvas);
          if (f.type === 'gif' && f.info && f.info.animated) rowNotes.push('Animated GIF: only the first frame was converted.');
          if (fmt === 'jpeg' && img.alpha && f.type !== 'jpeg') rowNotes.push(`Transparent areas were filled with ${bg.toUpperCase()}.`);
          if (fmt === 'png' && (f.type === 'jpeg' || f.type === 'webp')) rowNotes.push('PNG keeps every pixel as it is but cannot bring back detail that JPG or WebP already removed, so the file is usually bigger.');
          return { f, blob, tw, th, rowNotes };
        } finally { img.close(); }
      });
      const name = uniqueNamer(); let before = 0, after = 0;
      const outputs = ok.map(r => {
        before += r.f.size; after += r.blob.size;
        return rowOut(name(outName(r.f.name, '', FMT[fmt].ext)), r.blob, r.f, { meta: `${TYPE_LABEL[r.f.type]} → ${FMT[fmt].label} · ${fmtBytes(r.f.size)} → ${fmtBytes(r.blob.size)}`, chip: smaller(r.f.size, r.blob.size), chipKind: r.blob.size < r.f.size ? 'good' : 'muted', note: r.rowNotes.join(' ') || false });
      });
      const same = ok.filter(r => r.f.type === (fmt === 'jpeg' ? 'jpeg' : fmt)).length;
      const out = [...notes];
      if (same) out.push(`${plural(same, 'image')} ${same === 1 ? 'was' : 'were'} already ${FMT[fmt].label}, so ${same === 1 ? 'it was' : 'they were'} saved again in the same format.`);
      return { title: ok.length === 1 ? `Your ${FMT[fmt].label} is ready` : `${plural(ok.length, 'image')} converted to ${FMT[fmt].label}`, outputs, notes: out, zipName: `converted-${FMT[fmt].ext}`, stats: sizeStats(before, after, ['Before', 'After']) };
    },
    seo: SEO[spec.id],
  };
}
const CONVERT = convertTool({
  id: 'convert-image', name: 'Convert Image', fmt: 'jpeg', noun: 'images', hint: 'JPG, PNG, WebP, GIF or BMP', pickAccept: false,
  blurb: 'Convert images between JPG, PNG and WebP. Batch conversion with one ZIP download.', keywords: 'convert image jpg png webp gif bmp format change',
});
const PNG_TO_JPG = convertTool({ id: 'png-to-jpg', name: 'PNG to JPG', fmt: 'jpeg', noun: 'PNG images', hint: 'PNG images', pickAccept: 'image/png,.png', blurb: 'Turn PNG images into smaller JPG files. Transparent areas get a background colour you choose.', keywords: 'png to jpg convert png jpeg transparent background' });
const JPG_TO_PNG = convertTool({ id: 'jpg-to-png', name: 'JPG to PNG', fmt: 'png', noun: 'JPG images', hint: 'JPG images', pickAccept: 'image/jpeg,.jpg,.jpeg', blurb: 'Turn JPG photos into lossless PNG files. Batch conversion with one ZIP download.', keywords: 'jpg to png convert jpeg lossless' });
const WEBP_TO_JPG = convertTool({ id: 'webp-to-jpg', name: 'WebP to JPG', fmt: 'jpeg', noun: 'WebP images', hint: 'WebP images', pickAccept: 'image/webp,.webp', blurb: 'Turn WebP images into JPG files that open almost anywhere.', keywords: 'webp to jpg convert jpeg download webp' });
const JPG_TO_WEBP = convertTool({ id: 'jpg-to-webp', name: 'JPG to WebP', fmt: 'webp', noun: 'JPG images', hint: 'JPG images', pickAccept: 'image/jpeg,.jpg,.jpeg', blurb: 'Turn JPG photos into smaller WebP files for faster web pages.', keywords: 'jpg to webp convert jpeg smaller website' });

// ---------------------------------------------------------------------------------------------- crop
const CROP = {
  id: 'crop-image', slug: 'crop-image', name: 'Crop Image',
  blurb: 'Cut an image down to the part you want. Drag the box, type exact numbers, or pick a shape like 1:1.', keywords: 'crop image cut trim square aspect ratio photo', icon: 'imgCrop',
  accept: 'image', multi: false, view: 'single', panel: cropPanel,
  cta: 'Crop image', ctaIcon: 'imgCrop', working: 'Cropping your image…', downloadLabel: 'Download cropped image',
  status: s => (s.ext.crop ? `Crop: ${dims(s.ext.crop.w, s.ext.crop.h)} px` : ''),
  options: [
    { key: 'fmt', type: 'seg', label: 'Output format', value: 'keep', choices: fmtChoices(['keep', 'jpeg', 'png', 'webp'], { keep: KEEP_HELP }) },
    qualityOpt(92, { showIf: o => o.fmt !== 'png', help: 'Applies to JPG and WebP output.' }),
    bgOpt(o => o.fmt === 'jpeg'),
  ],
  validate: s => {
    const c = s.ext.crop;
    if (!c) return 'The preview is still loading. Wait a moment, then choose the area to keep.';
    if (!(c.w >= 1 && c.h >= 1)) return 'The crop area is empty. Drag the box or enter a width and height.';
    if (s.opts.fmt === 'webp' && WEBP_OK === false) return NO_WEBP;
    return null;
  },
  async run({ files, opts, ext, progress }) {
    await webpSupported(); const f = files[0];
    progress(0.1, 'Cropping…');
    const img = await loadImage(f.file, f.type, f.info);
    try {
      const { fmt, note } = pickFormat(opts.fmt, f);
      const x = Math.max(0, Math.min(img.w - 1, Math.round(ext.crop.x))), y = Math.max(0, Math.min(img.h - 1, Math.round(ext.crop.y)));
      const w = Math.max(1, Math.min(img.w - x, Math.round(ext.crop.w))), hh = Math.max(1, Math.min(img.h - y, Math.round(ext.crop.h)));
      let tw = w, th = hh; const notes = note ? [note] : [];
      const fit = fitCanvas(tw, th); if (fit.shrunk) { tw = fit.w; th = fit.h; notes.push(`The cropped area is larger than this browser can create, so it was scaled down to ${dims(tw, th)}.`); }
      const canvas = scaleCanvas(img.src, x, y, w, hh, tw, th, { bg: fmt === 'jpeg' ? bgOf(opts) : null, opaque: fmt !== 'jpeg' && !img.alpha });
      progress(0.7, 'Saving…');
      const blob = await encodeCanvas(canvas, fmt, Number(opts.quality) / 100); release(canvas);
      if (w === img.w && hh === img.h) notes.push('The crop area covers the whole image, so the picture itself is unchanged.');
      return { title: 'Your image is cropped', outputs: [{ name: outName(f.name, 'cropped', FMT[fmt].ext), blob, preview: true, meta: `${dims(tw, th)} px · ${fmtBytes(blob.size)}` }], notes, stats: [{ label: 'Original', value: dims(img.w, img.h), hint: fmtBytes(f.size) }, { label: 'Cropped', value: dims(tw, th), hint: fmtBytes(blob.size) }] };
    } finally { img.close(); }
  },
  seo: SEO['crop-image'],
};

// ---------------------------------------------------------------------------------------------- rotate + flip
const ROTATE = {
  id: 'rotate-flip-image', slug: 'rotate-flip-image', name: 'Rotate and Flip Image',
  blurb: 'Turn images left or right, rotate 180 degrees, or mirror them. See the result before you save.', keywords: 'rotate image flip mirror turn sideways photo orientation', icon: 'imgFlip',
  accept: 'image', multi: true, maxFiles: 20, view: 'list', reorder: false, panel: rotatePanel, listNote: 'The same rotation and flips are applied to every image. Your original files are never changed.',
  cta: s => `Save ${plural(s.files.length, 'image')}`, ctaIcon: 'download', working: 'Rotating your images…', downloadLabel: 'Download image',
  status: s => (s.files.length ? `${plural(s.files.length, 'image')}` : ''),
  options: [
    { key: 'fmt', type: 'seg', label: 'Output format', value: 'keep', choices: fmtChoices(['keep', 'jpeg', 'png', 'webp'], { keep: KEEP_HELP }) },
    qualityOpt(92, { showIf: o => o.fmt !== 'png', help: 'JPG and WebP files are saved again, which costs a tiny amount of quality. 92 or more is a safe choice.' }),
    bgOpt(o => o.fmt === 'jpeg'),
  ],
  validate: s => {
    const e = s.ext;
    if (!e.rot && !e.fh && !e.fv) return 'Choose a rotation or flip first, using the buttons above the preview.';
    if (s.opts.fmt === 'webp' && WEBP_OK === false) return NO_WEBP;
    return null;
  },
  async run({ files, opts, ext, progress, signal }) {
    await webpSupported();
    const { ok, notes } = await eachFile(files, progress, signal, 'Rotating', async f => {
      const img = await loadImage(f.file, f.type, f.info);
      try {
        const { fmt, note } = pickFormat(opts.fmt, f); const rowNotes = note ? [note] : [];
        const swap = ext.rot === 90 || ext.rot === 270; const fit = fitCanvas(swap ? img.h : img.w, swap ? img.w : img.h);
        let src = img.src, sw = img.w, sh = img.h, tmp = null;
        if (fit.shrunk) { const k = fit.w / (swap ? img.h : img.w); sw = Math.max(1, Math.round(img.w * k)); sh = Math.max(1, Math.round(img.h * k)); src = tmp = scaleCanvas(img.src, 0, 0, img.w, img.h, sw, sh); rowNotes.push('It is larger than this browser can process in one piece, so it was scaled down a little.'); }
        const canvas = transformCanvas(src, sw, sh, ext.rot, ext.fh, ext.fv, { bg: fmt === 'jpeg' ? bgOf(opts) : null, opaque: fmt !== 'jpeg' && !img.alpha });
        if (tmp) release(tmp);
        const blob = await encodeCanvas(canvas, fmt, Number(opts.quality) / 100); const d = [canvas.width, canvas.height]; release(canvas);
        return { f, blob, fmt, d, rowNotes };
      } finally { img.close(); }
    });
    const name = uniqueNamer();
    const outputs = ok.map(r => rowOut(name(outName(r.f.name, 'rotated', FMT[r.fmt].ext)), r.blob, r.f, { meta: `${dims(r.d[0], r.d[1])} px · ${fmtBytes(r.blob.size)}`, note: r.rowNotes.join(' ') || false }));
    return { title: ok.length === 1 ? 'Your image is ready' : `${plural(ok.length, 'image')} ready`, outputs, notes, zipName: 'rotated-images' };
  },
  seo: SEO['rotate-flip-image'],
};

// ---------------------------------------------------------------------------------------------- Base64
const MIME_OF = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' };
function toBase64(u8) { let s = ''; const CH = 0x8000; for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
const BASE64 = {
  id: 'image-to-base64', slug: 'image-to-base64', name: 'Image to Base64',
  blurb: 'Turn an image into a Base64 data URI, with ready-to-copy CSS and HTML snippets.', keywords: 'image to base64 data uri encode inline css html', icon: 'imgBase64',
  accept: 'image', multi: false, view: 'single', autoRun: true, cta: 'Encode image', ctaIcon: 'imgBase64', working: 'Encoding your image…',
  async run({ files, progress }) {
    const f = files[0]; progress(0.3, 'Reading…');
    const u8 = new Uint8Array(await f.file.arrayBuffer()); progress(0.7, 'Encoding…');
    const b64 = toBase64(u8);
    return { title: 'Your Base64 code is ready', outputs: [], noDownload: true, again: 'Choose another image', panel: base64Panel({ name: f.name, mime: MIME_OF[f.type] || 'application/octet-stream', b64, bytes: f.size }) };
  },
  seo: SEO['image-to-base64'],
};

// ---------------------------------------------------------------------------------------------- remove metadata
function metaSummary(m) {
  const bits = [];
  if (m.camera) bits.push(m.camera);
  if (m.date) bits.push('taken ' + m.date);
  bits.push(m.gps ? 'GPS location: yes' : 'GPS location: no');
  const more = [m.xmp && 'XMP', m.iptc && 'IPTC', m.comment && 'comment', m.extra && 'extra data'].filter(Boolean);
  if (more.length) bits.push(more.join(', '));
  if (!m.personal) return 'No metadata found · GPS location: no';
  return bits.join(' · ');
}
const REMOVE_META = {
  id: 'remove-image-metadata', slug: 'remove-image-metadata', name: 'Remove Image Metadata',
  blurb: 'Strip EXIF, GPS location and camera details from photos before you share them.', keywords: 'remove exif metadata gps location photo privacy strip camera data', icon: 'imgMeta',
  accept: 'image', multi: true, maxFiles: 20, view: 'list', reorder: false, listNote: 'Each row shows what is hidden inside the file. Your original files are never changed.',
  cta: s => `Remove metadata from ${plural(s.files.length, 'image')}`, ctaIcon: 'imgMeta', working: 'Cleaning your images…', downloadLabel: 'Download clean image',
  async inspect(rec) { const m = readMeta(new Uint8Array(await rec.file.arrayBuffer()), rec.type); rec.found = m; return metaSummary(m); },
  status: s => { const n = s.files.filter(f => f.found && f.found.personal).length; return s.files.length ? `${n} of ${plural(s.files.length, 'image')} ${n === 1 ? 'has' : 'have'} metadata` : ''; },
  async run({ files, progress, signal }) {
    const { ok, notes } = await eachFile(files, progress, signal, 'Cleaning', async f => {
      const u8 = new Uint8Array(await f.file.arrayBuffer());
      const before = f.found || readMeta(u8, f.type);
      const canStrip = (f.type === 'jpeg' && before.orientation === 1) || f.type === 'png' || f.type === 'webp';
      let bytes, fmt, how;
      if (canStrip) {
        bytes = f.type === 'jpeg' ? stripJpeg(u8) : f.type === 'png' ? stripPng(u8) : stripWebp(u8); fmt = f.type;
        how = 'The picture data was not touched, so quality is unchanged.';
      } else {
        const img = await loadImage(f.file, f.type, f.info);
        try {
          const pick = pickFormat('keep', f); fmt = pick.fmt;
          const canvas = render(img, img.w, img.h, fmt, '#ffffff');
          const blob = await encodeCanvas(canvas, fmt, 0.92); release(canvas); bytes = new Uint8Array(await blob.arrayBuffer());
          how = f.type === 'jpeg' ? 'Its rotation setting was applied to the pixels first, so the picture was saved again once at high quality (92%).' : pick.note;
        } finally { img.close(); }
      }
      const check = readMeta(bytes, fmt);
      if (check.exif || check.gps || check.xmp || check.iptc || check.comment || check.extra) throw new AppError('meta', `Metadata could not be fully removed from "${f.name}".`);
      return { f, bytes, fmt, before, how };
    });
    const name = uniqueNamer(); let gps = 0, found = 0;
    const outputs = ok.map(r => {
      const blob = new Blob([r.bytes], { type: FMT[r.fmt].mime });
      if (r.before.gps) gps++; if (r.before.personal) found++;
      const removed = r.before.found.length ? 'Removed: ' + r.before.found.join(', ') + '. ' : 'No metadata was found, so this is a clean copy. ';
      return { name: name(outName(r.f.name, 'clean', FMT[r.fmt].ext)), blob, preview: true, meta: `${fmtBytes(r.f.size)} → ${fmtBytes(blob.size)}`, chip: 'Checked clean', chipKind: 'good', note: removed + r.how };
    });
    return {
      title: ok.length === 1 ? 'Metadata removed' : `Metadata removed from ${plural(ok.length, 'image')}`,
      summary: 'Each new file was checked again after cleaning: no EXIF, GPS, XMP or IPTC data was found in it.',
      stats: [{ label: 'Had metadata', value: `${found} of ${ok.length}` }, { label: 'Had GPS location', value: `${gps} of ${ok.length}` }, { label: 'Now', value: 'Clean' }],
      outputs, zipName: 'clean-images',
      notes: [...notes, 'The picture itself is unchanged: anything visible in it, such as faces, signs or text, is still there. Files cleaned in place also keep their colour profile, so colours look the same.'],
    };
  },
  seo: SEO['remove-image-metadata'],
};

// ---------------------------------------------------------------------------------------------- export
export const IMAGE_TOOLS = [COMPRESS, RESIZE, CONVERT, PNG_TO_JPG, JPG_TO_PNG, WEBP_TO_JPG, JPG_TO_WEBP, CROP, ROTATE, BASE64, REMOVE_META];
export { ASPECTS };
