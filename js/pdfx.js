// Thin layer over pdf-lib (global PDFLib) and PDF.js (ES module), with friendly errors.
import { AppError, LIMITS } from './core.js';

const PDFJS_BASE = new URL('../vendor/pdfjs/', import.meta.url).href;
let _pdfjs;
export async function getPdfjs() {
  if (!_pdfjs) {
    _pdfjs = await import(PDFJS_BASE + 'pdf.min.mjs');
    _pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.mjs';
  }
  return _pdfjs;
}

// Libraries are loaded on demand by the host page (element.js); the standalone page loads them with script tags.
let _libLoader = null;
export const setLibLoader = f => { _libLoader = f; };
export const ensureLibs = () => (_libLoader ? _libLoader() : Promise.resolve());

export const L = () => {
  if (!window.PDFLib) throw new AppError('engine', 'The PDF engine did not load. Refresh the page and try again.');
  return window.PDFLib;
};

const ENC = 'This PDF is password-protected, so it cannot be processed. Remove the password in the program that created it, then try again. We do not remove passwords.';
const BAD = 'This file could not be read as a PDF. It may be damaged or not a real PDF. Try opening it in another viewer first.';

// Load with pdf-lib. Encrypted files are rejected (never bypassed).
export async function loadDoc(bytes) {
  try { await ensureLibs(); } catch (e) { /* reported by L() below */ }
  const { PDFDocument, EncryptedPDFError } = L();
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
  } catch (e) {
    if ((EncryptedPDFError && e instanceof EncryptedPDFError) || /encrypt/i.test(String(e && e.message))) throw new AppError('encrypted', ENC);
    throw new AppError('corrupt', BAD);
  }
}

// Open with PDF.js for rendering. Fresh copy because PDF.js transfers the buffer to its worker.
export async function openRender(bytes) {
  const lib = await getPdfjs();
  const task = lib.getDocument({
    data: bytes.slice(),
    cMapUrl: PDFJS_BASE + 'cmaps/', cMapPacked: true,
    standardFontDataUrl: PDFJS_BASE + 'standard_fonts/',
    wasmUrl: PDFJS_BASE + 'wasm/', iccUrl: PDFJS_BASE + 'iccs/',
    isEvalSupported: false,
  });
  try { return await task.promise; }
  catch (e) {
    if (e && e.name === 'PasswordException') throw new AppError('encrypted', ENC);
    throw new AppError('corrupt', BAD);
  }
}

// Render one page (1-based) into a canvas. Scale is reduced if the bitmap would be too large for the browser.
export async function renderPage(doc, pageNo, scale, canvas) {
  const page = await doc.getPage(pageNo);
  let vp = page.getViewport({ scale });
  const px = vp.width * vp.height;
  if (px > LIMITS.maxCanvasPixels) vp = page.getViewport({ scale: scale * Math.sqrt(LIMITS.maxCanvasPixels / px) });
  canvas.width = Math.max(1, Math.floor(vp.width));
  canvas.height = Math.max(1, Math.floor(vp.height));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
  const base = page.getViewport({ scale: 1 });
  page.cleanup();
  return { ptW: base.width, ptH: base.height };
}

export function canvasBlob(canvas, type, quality) {
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new AppError('memory', 'The browser ran out of memory while creating an image. Try a smaller file or lower quality.')), type, quality));
}

// ---- images ----
function exifOrientation(u8) {
  if (u8[0] !== 0xFF || u8[1] !== 0xD8) return 1;
  let o = 2;
  while (o + 4 < u8.length) {
    if (u8[o] !== 0xFF) break;
    const m = u8[o + 1], len = (u8[o + 2] << 8) | u8[o + 3];
    if (m === 0xE1 && u8[o + 4] === 0x45 && u8[o + 5] === 0x78 && u8[o + 6] === 0x69 && u8[o + 7] === 0x66) {
      const t = o + 10, le = u8[t] === 0x49;
      const rd16 = p => le ? u8[p] | (u8[p + 1] << 8) : (u8[p] << 8) | u8[p + 1];
      const rd32 = p => le ? (u8[p] | (u8[p + 1] << 8) | (u8[p + 2] << 16) | (u8[p + 3] << 24)) >>> 0 : ((u8[p] << 24) | (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3]) >>> 0;
      const ifd = t + rd32(t + 4), n = rd16(ifd);
      for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (rd16(e) === 0x0112) return rd16(e + 8) || 1; }
      return 1;
    }
    if (m === 0xDA) break;
    o += 2 + len;
  }
  return 1;
}

// Returns { bytes, kind:'jpg'|'png', w, h } ready for pdf-lib. Honors EXIF rotation. Re-encodes only when needed.
export async function prepareImage(file, type) {
  const raw = new Uint8Array(await file.arrayBuffer());
  let bmp;
  const blob = new Blob([raw]);
  try {
    try { bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
    catch (e0) { bmp = await createImageBitmap(blob); } // older browsers: no options support
  } catch (e) { throw new AppError('image', type === 'heic' ? 'HEIC photos are not supported in the browser yet. Convert it to JPG or PNG first.' : `"${file.name}" could not be decoded as an image.`); }
  try {
    if (bmp.width * bmp.height > LIMITS.maxImagePixels) throw new AppError('image', `"${file.name}" is too large to process safely (over 60 megapixels). Resize it and try again.`);
    if (type === 'jpeg' && exifOrientation(raw) === 1) return { bytes: raw, kind: 'jpg', w: bmp.width, h: bmp.height };
    if (type === 'png') return { bytes: raw, kind: 'png', w: bmp.width, h: bmp.height };
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d', { alpha: false }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0);
    const blob = await canvasBlob(c, 'image/jpeg', 0.92);
    c.width = c.height = 0;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), kind: 'jpg', w: bmp.width, h: bmp.height };
  } finally { bmp.close && bmp.close(); }
}

export const normRot = a => ((Math.round(a / 90) * 90) % 360 + 360) % 360;
