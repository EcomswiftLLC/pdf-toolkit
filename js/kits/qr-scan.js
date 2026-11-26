// QR code reader: decodes a picture (upload, drop, paste) or the camera, entirely on this device.
import { h, icon, panel, textarea, note, announce, copyButton } from '../ui.js';
import { tick } from '../core.js';
import jsQR from '../../vendor/qr/jsqr.js';
import { describe } from './qr-parse.js';

const MAX_BYTES = 40 * 1024 * 1024, MAX_PIXELS = 120e6;

function utf8OrFallback(code) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(code.binaryData)); } catch (e) { return code.data; }
}
function readPixels(src, w, h, side) {
  let s = side / Math.max(w, h);
  if (s > 3) s = 3;
  const cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, 0, 0, cw, ch);
  return ctx.getImageData(0, 0, cw, ch);
}
// Returns the decoded text or null. Works on a scaled copy; tries several sizes, and inverted codes too.
export async function decodeSource(src, w, h, onStep) {
  const sides = [1600, 900, 2400, 500, 1200];
  for (const side of sides) {
    if (onStep) await onStep();
    const img = readPixels(src, w, h, side);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
    if (code && code.data !== undefined && (code.binaryData || code.data)) return utf8OrFallback(code);
  }
  if ('BarcodeDetector' in window) {
    try {
      const det = new window.BarcodeDetector({ formats: ['qr_code'] });
      const r = await det.detect(src);
      if (r && r[0] && r[0].rawValue) return r[0].rawValue;
    } catch (e) { /* not supported for this source */ }
  }
  return null;
}

async function loadBitmap(file) {
  try { const b = await createImageBitmap(file); return { src: b, w: b.width, h: b.height, close: () => b.close && b.close() }; } catch (e) { /* fall back to <img> */ }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, close() {} };
  } finally { URL.revokeObjectURL(url); }
}

export function mountScanner(container) {
  let thumbUrl = '', stream = null, timer = 0, busy = false, secretShown = false;

  // ---- input panel ----
  const fileInput = h('input', { type: 'file', accept: 'image/*', class: 'sr', id: 'qrs-file', 'aria-label': 'Choose a picture with a QR code' });
  const bChoose = h('button', { type: 'button', class: 'btn btn-primary' }, icon('upload'), 'Choose image');
  const hasCam = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const bCam = hasCam ? h('button', { type: 'button', class: 'btn btn-quiet' }, icon('qr-scan'), 'Scan with camera') : null;
  const canPaste = !!(navigator.clipboard && navigator.clipboard.read);
  const bPaste = canPaste ? h('button', { type: 'button', class: 'btn btn-quiet' }, icon('copy'), 'Paste image') : null;
  const drop = h('div', { class: 'qr-drop' },
    h('div', { class: 'ic' }, icon('qr-scan')),
    h('p', { class: 'qr-drop-t' }, 'Drop a picture of a QR code here'),
    h('p', { class: 'qr-drop-h' }, 'You can also choose a file, paste an image with Ctrl+V (Command+V on a Mac), or use your camera. Photos and screenshots work.'),
    h('div', { class: 'qr-drop-b' }, bChoose, bPaste, bCam), fileInput);
  const camNote = hasCam ? h('p', { class: 'lt-note' }, 'The camera option asks your browser for permission. The video stays on this device and is never recorded or sent anywhere. It stops as soon as a code is found.') : null;
  const video = h('video', { class: 'qr-video', playsinline: '', muted: '', 'aria-label': 'Live camera view' });
  video.muted = true;
  const bStop = h('button', { type: 'button', class: 'btn btn-quiet' }, icon('x'), 'Stop camera');
  const camBox = h('div', { class: 'qr-cam', hidden: true }, video, h('p', { class: 'lt-note' }, 'Hold the code steady inside the picture. It reads automatically.'), bStop);
  const inputPanel = panel('Read a QR code', drop, camNote, camBox);

  // ---- result ----
  const errBox = h('div', { class: 'qr-err', role: 'alert' });
  const resultBox = h('div', { class: 'qr-result', hidden: true, tabindex: '-1' });
  const out = h('div', {}, errBox, resultBox);

  function clearAll() { errBox.replaceChildren(); resultBox.replaceChildren(); resultBox.hidden = true; if (thumbUrl) { URL.revokeObjectURL(thumbUrl); thumbUrl = ''; } secretShown = false; }
  function showError(msg) {
    resultBox.hidden = true; resultBox.replaceChildren();
    errBox.replaceChildren(h('div', { class: 'alert err' }, icon('alert'), h('div', { style: 'min-width:0' }, msg)));
    announce(msg);
  }
  const NOT_FOUND = 'No QR code found in this picture. Crop the picture so the code fills most of it, use a brighter and sharper image, and make sure all four edges of the code are visible.';

  function showResult(text, thumb) {
    errBox.replaceChildren();
    const d = describe(text);
    const kids = [];
    kids.push(h('div', { class: 'qr-rhead' }, thumb ? h('img', { class: 'qr-thumb', src: thumb, alt: 'The picture you chose' }) : null,
      h('div', {}, h('p', { class: 'qr-kind' }, d.label), h('h2', { class: 'qr-rt', tabindex: '-1' }, 'QR code found'))));
    if (d.fields.length) {
      const dl = h('dl', { class: 'qr-dl' });
      for (const f of d.fields) {
        const v = f.secret ? '•'.repeat(Math.min(12, Math.max(6, f.v.length))) : f.v;
        const dd = h('dd', {}, h('span', { class: 'qr-v' }, v));
        if (f.secret) {
          const t = h('button', { type: 'button', class: 'btn btn-quiet btn-sm', 'aria-pressed': 'false', 'aria-label': `Show ${f.k.toLowerCase()}` }, 'Show');
          t.addEventListener('click', () => { const on = t.getAttribute('aria-pressed') !== 'true'; t.setAttribute('aria-pressed', String(on)); t.textContent = on ? 'Hide' : 'Show'; t.setAttribute('aria-label', `${on ? 'Hide' : 'Show'} ${f.k.toLowerCase()}`); dd.firstChild.textContent = on ? f.v : v; });
          dd.append(t);
        }
        dl.append(h('div', { class: 'qr-f' }, h('dt', {}, f.k), dd));
      }
      kids.push(dl);
    }
    if (d.kind === 'url') {
      kids.push(h('p', { class: 'qr-urllab' }, 'Full address (shown as text, not opened)'), h('p', { class: 'qr-url mono' }, d.url));
      const warn = ['Check the address before you open it. Anyone can put any link in a QR code, including links to fake or harmful sites.'];
      if (d.idn) warn.push('The website name contains characters that are not plain English letters. Some fake sites use look-alike letters, so read it carefully.');
      if (/^http:/i.test(d.url)) warn.push('This address starts with http, so the connection is not encrypted.');
      kids.push(note(h('div', {}, warn.map(w => h('p', {}, w))), 'warn'));
      kids.push(h('div', { class: 'lt-bar' }, h('a', { class: 'btn btn-primary', href: d.url, target: '_blank', rel: 'noopener noreferrer' }, icon('right', 'sm'), 'Open link'), copyButton(() => d.url, 'Copy link')));
    } else if (d.unsafe) kids.push(note(d.unsafe, 'err'));
    else if (d.note) kids.push(h('p', { class: 'lt-note' }, d.note));
    const ta = textarea({ label: 'Decoded text', rows: 4, readonly: true, mono: true, value: text });
    kids.push(ta.el);
    const bar = h('div', { class: 'lt-bar' }, copyButton(() => text, 'Copy text'));
    if (d.copy) bar.append(copyButton(() => d.copy.text, d.copy.label));
    const again = h('button', { type: 'button', class: 'btn btn-quiet btn-sm' }, icon('upload', 'sm'), 'Read another code');
    again.addEventListener('click', () => { clearAll(); bChoose.focus(); });
    bar.append(again);
    kids.push(bar);
    resultBox.replaceChildren(...kids); resultBox.hidden = false;
    announce(`QR code found. Type: ${d.label}.`);
    resultBox.querySelector('.qr-rt').focus({ preventScroll: false });
  }

  async function handleFile(file) {
    if (!file || busy) return;
    stopCamera(); clearAll();
    if (file.type && !file.type.startsWith('image/')) { showError('That file is not a picture. Choose a PNG, JPG, WebP, GIF or BMP image.'); return; }
    if (file.size > MAX_BYTES) { showError('That picture is larger than 40 MB. Crop or resize it first.'); return; }
    busy = true; drop.classList.add('busy');
    errBox.replaceChildren(h('div', { class: 'alert info', role: 'status' }, icon('info'), 'Reading the picture...'));
    let bmp;
    try {
      await tick();
      try { bmp = await loadBitmap(file); } catch (e) { showError('That file could not be read as a picture. Try a PNG or JPG. Photos in HEIC format may not open in every browser, so share or export them as JPG first.'); return; }
      if (!bmp.w || !bmp.h) { showError('That picture is empty. Choose another one.'); return; }
      if (bmp.w * bmp.h > MAX_PIXELS) { showError('That picture is very large. Crop or resize it first.'); return; }
      const text = await decodeSource(bmp.src, bmp.w, bmp.h, tick);
      if (text === null) { showError(NOT_FOUND); return; }
      thumbUrl = URL.createObjectURL(file);
      showResult(text, thumbUrl);
    } catch (e) { showError('Something went wrong while reading the picture. Try another one.'); }
    finally { busy = false; drop.classList.remove('busy'); if (bmp && bmp.close) bmp.close(); }
  }

  // ---- inputs ----
  fileInput.addEventListener('change', () => { const f = fileInput.files && fileInput.files[0]; fileInput.value = ''; handleFile(f); });
  bChoose.addEventListener('click', () => fileInput.click());
  const stop = e => { e.preventDefault(); };
  const onOver = e => { stop(e); drop.classList.add('over'); };
  const onLeave = e => { if (!e.relatedTarget || !drop.contains(e.relatedTarget)) drop.classList.remove('over'); };
  const onDrop = e => { stop(e); drop.classList.remove('over'); const f = e.dataTransfer && [...e.dataTransfer.files].find(x => x.type.startsWith('image/') || !x.type); if (f) handleFile(f); else if (e.dataTransfer && e.dataTransfer.files.length) showError('That file is not a picture. Choose a PNG, JPG, WebP, GIF or BMP image.'); };
  container.addEventListener('dragover', onOver); container.addEventListener('dragleave', onLeave); container.addEventListener('drop', onDrop);
  const onPaste = e => {
    const items = e.clipboardData && e.clipboardData.files; const f = items && [...items].find(x => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); handleFile(f); }
  };
  document.addEventListener('paste', onPaste);
  if (bPaste) bPaste.addEventListener('click', async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) { const t = it.types.find(x => x.startsWith('image/')); if (t) { handleFile(new File([await it.getType(t)], 'pasted-image', { type: t })); return; } }
      showError('The clipboard has no picture in it. Copy an image first, then choose Paste image.');
    } catch (e) { showError('Your browser did not allow reading the clipboard. Press Ctrl+V (Command+V on a Mac) on this page instead.'); }
  });

  // ---- camera ----
  function stopCamera() {
    clearInterval(timer); timer = 0;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    video.srcObject = null; camBox.hidden = true;
  }
  async function startCamera() {
    if (stream || busy) return;
    clearAll();
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); }
    catch (e) {
      stream = null;
      showError(e && e.name === 'NotFoundError' ? 'No camera was found on this device. Choose a picture instead.' : 'The camera could not be used. If you blocked it, allow camera access for this site in your browser settings, or choose a picture instead.');
      return;
    }
    video.srcObject = stream; camBox.hidden = false;
    try { await video.play(); } catch (e) { /* autoplay may need a tap */ }
    announce('Camera on. Point it at a QR code.');
    const cvs = document.createElement('canvas'); let working = false;
    let det = null; try { if ('BarcodeDetector' in window) det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { det = null; }
    timer = setInterval(async () => {
      if (working || !stream || !video.videoWidth) return;
      working = true;
      try {
        let text = null;
        if (det) { const r = await det.detect(video); if (r && r[0] && r[0].rawValue) text = r[0].rawValue; }
        if (text === null) {
          const w = video.videoWidth, hgt = video.videoHeight, s = Math.min(1, 800 / Math.max(w, hgt));
          cvs.width = Math.round(w * s); cvs.height = Math.round(hgt * s);
          const ctx = cvs.getContext('2d', { willReadFrequently: true }); ctx.drawImage(video, 0, 0, cvs.width, cvs.height);
          const img = ctx.getImageData(0, 0, cvs.width, cvs.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
          if (code) text = utf8OrFallback(code);
        }
        if (text !== null && stream) { stopCamera(); showResult(text, ''); }
      } catch (e) { /* try the next frame */ }
      working = false;
    }, 220);
  }
  if (bCam) bCam.addEventListener('click', startCamera);
  bStop.addEventListener('click', () => { stopCamera(); announce('Camera stopped.'); bCam && bCam.focus(); });
  const onHide = () => stopCamera();
  window.addEventListener('pagehide', onHide);
  const onVis = () => { if (document.hidden) stopCamera(); };
  document.addEventListener('visibilitychange', onVis);

  container.replaceChildren(h('div', { class: 'lt-stack' }, inputPanel, out));
  return () => {
    stopCamera(); clearAll();
    container.removeEventListener('dragover', onOver); container.removeEventListener('dragleave', onLeave); container.removeEventListener('drop', onDrop);
    document.removeEventListener('paste', onPaste); window.removeEventListener('pagehide', onHide); document.removeEventListener('visibilitychange', onVis);
  };
}
