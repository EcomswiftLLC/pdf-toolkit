// Image engine shared by the image tools and by js/flow.js: header parsing, EXIF/XMP reading, lossless metadata
// stripping, oriented decoding, high quality scaling and encoding. Browser only, nothing leaves the device.
import { AppError, LIMITS } from '../core.js';

// ---------------------------------------------------------------------------------------------- formats
export const FMT = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg', label: 'JPG' },
  png: { mime: 'image/png', ext: 'png', label: 'PNG' },
  webp: { mime: 'image/webp', ext: 'webp', label: 'WebP' },
};
export const TYPE_LABEL = { jpeg: 'JPG', png: 'PNG', webp: 'WebP', gif: 'GIF', bmp: 'BMP' };
// "Keep the format": GIF and BMP cannot be written by a browser, so they become PNG / JPG.
export const keepFormat = type => (type === 'jpeg' ? 'jpeg' : type === 'webp' ? 'webp' : type === 'bmp' ? 'jpeg' : 'png');

const u16 = (b, p, le) => (le ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1]);
const u32 = (b, p, le) => (le ? ((b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0) : (((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0));
const ascii = (b, s, e) => { let t = ''; for (let i = s; i < e && i < b.length; i++) t += String.fromCharCode(b[i]); return t; };
const startsWith = (b, p, str) => { for (let i = 0; i < str.length; i++) if (b[p + i] !== str.charCodeAt(i)) return false; return true; };

// ---------------------------------------------------------------------------------------------- JPEG segments
// Returns [{ m, s, e }] (marker, start index of the 0xFF byte, end index). The entropy data of a scan belongs to its SOS segment.
export function jpegSegments(u8) {
  if (u8[0] !== 0xFF || u8[1] !== 0xD8) return null;
  const segs = [{ m: 0xD8, s: 0, e: 2 }];
  let p = 2;
  while (p + 1 < u8.length) {
    if (u8[p] !== 0xFF) { p++; continue; }
    const m = u8[p + 1];
    if (m === 0xFF) { p++; continue; }
    if (m === 0xD9) { segs.push({ m, s: p, e: p + 2 }); break; }
    if (m === 0x00 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { p += 2; continue; }
    if (p + 3 >= u8.length) break;
    const len = (u8[p + 2] << 8) | u8[p + 3];
    const e = p + 2 + len;
    if (m === 0xDA) {
      let q = Math.min(e, u8.length);
      while (q + 1 < u8.length) {
        if (u8[q] === 0xFF) { const n = u8[q + 1]; if (n === 0x00 || (n >= 0xD0 && n <= 0xD7)) { q += 2; continue; } if (n === 0xFF) { q++; continue; } break; }
        q++;
      }
      segs.push({ m, s: p, e: Math.min(q, u8.length) });
      p = q; continue;
    }
    segs.push({ m, s: p, e: Math.min(e, u8.length) });
    p = e;
  }
  return segs;
}
const isSof = m => m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC;

// ---------------------------------------------------------------------------------------------- EXIF (TIFF) reader
function parseTiff(b, t) {
  if (t + 8 > b.length) return null;
  const le = b[t] === 0x49;
  if (!(b[t] === 0x49 || b[t] === 0x4D) || b[t + 1] !== b[t] || u16(b, t + 2, le) !== 42) return null;
  const out = { orientation: 1, make: '', model: '', software: '', date: '', gps: false, gpsIfd: false };
  const readIfd = (off, fn) => {
    const p = t + off; if (off < 8 || p + 2 > b.length) return;
    const n = Math.min(u16(b, p, le), 300);
    for (let i = 0; i < n; i++) { const e = p + 2 + i * 12; if (e + 12 > b.length) break; fn(u16(b, e, le), u16(b, e + 2, le), u32(b, e + 4, le), e + 8); }
  };
  const str = (type, count, vp) => {
    if (type !== 2 || !count) return '';
    const s = count <= 4 ? vp : t + u32(b, vp, le);
    return ascii(b, s, Math.min(s + count, b.length)).replace(/\0[\s\S]*$/, '').trim();
  };
  let exifPtr = 0, gpsPtr = 0;
  readIfd(u32(b, t + 4, le), (tag, type, count, vp) => {
    if (tag === 0x0112) { const o = u16(b, vp, le); out.orientation = o >= 1 && o <= 8 ? o : 1; }
    else if (tag === 0x010F) out.make = str(type, count, vp);
    else if (tag === 0x0110) out.model = str(type, count, vp);
    else if (tag === 0x0131) out.software = str(type, count, vp);
    else if (tag === 0x0132) out.date = out.date || str(type, count, vp);
    else if (tag === 0x8769) exifPtr = u32(b, vp, le);
    else if (tag === 0x8825) gpsPtr = u32(b, vp, le);
  });
  if (exifPtr) readIfd(exifPtr, (tag, type, count, vp) => { if (tag === 0x9003) out.date = str(type, count, vp) || out.date; });
  if (gpsPtr) { out.gpsIfd = true; readIfd(gpsPtr, tag => { if (tag === 0x0002 || tag === 0x0004) out.gps = true; }); }
  return out;
}

function jpegExif(u8, segs) {
  for (const g of segs) if (g.m === 0xE1 && startsWith(u8, g.s + 4, 'Exif\0\0')) return parseTiff(u8, g.s + 10);
  return null;
}

// ---------------------------------------------------------------------------------------------- PNG / WebP / GIF walkers
function pngChunks(u8) {
  if (!(u8[0] === 0x89 && startsWith(u8, 1, 'PNG'))) return null;
  const out = []; let p = 8;
  while (p + 8 <= u8.length) {
    const len = u32(u8, p, false), type = ascii(u8, p + 4, p + 8), end = p + 12 + len;
    out.push({ type, s: p, d: p + 8, len, e: Math.min(end, u8.length) });
    if (type === 'IEND') break;
    p = end;
  }
  return out;
}
function webpChunks(u8) {
  if (!(startsWith(u8, 0, 'RIFF') && startsWith(u8, 8, 'WEBP'))) return null;
  const out = []; let p = 12;
  while (p + 8 <= u8.length) {
    const type = ascii(u8, p, p + 4), len = u32(u8, p + 4, true), end = p + 8 + len + (len & 1);
    out.push({ type, s: p, d: p + 8, len, e: Math.min(end, u8.length) });
    p = end;
  }
  return out;
}
// Counts frames of a GIF (stops at 2). Returns the frame count seen.
function gifFrames(u8) {
  let p = 13, frames = 0;
  if (u8[10] & 0x80) p += 3 * (1 << ((u8[10] & 7) + 1));
  const skipSub = q => { while (q < u8.length && u8[q] !== 0) q += u8[q] + 1; return q + 1; };
  while (p < u8.length && frames < 2) {
    const b = u8[p];
    if (b === 0x21) p = skipSub(p + 2);
    else if (b === 0x2C) { frames++; const f = u8[p + 9]; p += 10; if (f & 0x80) p += 3 * (1 << ((f & 7) + 1)); p = skipSub(p + 1); }
    else break;
  }
  return frames;
}

// ---------------------------------------------------------------------------------------------- header info (no decoding)
// Returns { type, w, h, alpha, animated, orient } with w/h as stored in the file (orient 5-8 swap them on screen), or null.
export function readInfo(u8, type) {
  try {
    if (type === 'jpeg') {
      const segs = jpegSegments(u8); if (!segs) return null;
      const sof = segs.find(g => isSof(g.m)); if (!sof) return null;
      const ex = jpegExif(u8, segs);
      return { type, h: u16(u8, sof.s + 5), w: u16(u8, sof.s + 7), alpha: false, animated: false, orient: ex ? ex.orientation : 1 };
    }
    if (type === 'png') {
      if (!startsWith(u8, 12, 'IHDR')) return null;
      const ct = u8[25]; let alpha = ct === 4 || ct === 6; let animated = false;
      for (const c of pngChunks(u8) || []) { if (c.type === 'tRNS') alpha = true; if (c.type === 'acTL') animated = true; if (c.type === 'IDAT') break; }
      return { type, w: u32(u8, 16, false), h: u32(u8, 20, false), alpha, animated, orient: 1 };
    }
    if (type === 'webp') {
      const k = ascii(u8, 12, 16);
      if (k === 'VP8X') return { type, w: 1 + (u8[24] | (u8[25] << 8) | (u8[26] << 16)), h: 1 + (u8[27] | (u8[28] << 8) | (u8[29] << 16)), alpha: !!(u8[20] & 0x10), animated: !!(u8[20] & 0x02), orient: 1 };
      if (k === 'VP8 ') return { type, w: u16(u8, 26, true) & 0x3FFF, h: u16(u8, 28, true) & 0x3FFF, alpha: false, animated: false, orient: 1 };
      if (k === 'VP8L') { const b0 = u8[21], b1 = u8[22], b2 = u8[23], b3 = u8[24]; return { type, w: 1 + (b0 | ((b1 & 0x3F) << 8)), h: 1 + ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0F) << 10)), alpha: !!(b3 & 0x10), animated: false, orient: 1 }; }
      return null;
    }
    if (type === 'gif') return { type, w: u16(u8, 6, true), h: u16(u8, 8, true), alpha: true, animated: gifFrames(u8) > 1, orient: 1 };
    if (type === 'bmp') { const h = u32(u8, 22, true) | 0; return { type, w: u32(u8, 18, true), h: Math.abs(h), alpha: false, animated: false, orient: 1 }; }
  } catch (e) { /* fall through */ }
  return null;
}

// Reads just enough of a File to know its size on screen. Returns null when the header cannot be understood.
export async function imageInfo(file, type) {
  let u8 = new Uint8Array(await file.slice(0, type === 'gif' ? file.size : 262144).arrayBuffer());
  let info = readInfo(u8, type);
  if (!info && file.size > u8.length) { u8 = new Uint8Array(await file.arrayBuffer()); info = readInfo(u8, type); }
  if (!info || !(info.w > 0 && info.h > 0)) return null;
  const swap = info.orient >= 5;
  info.sw = swap ? info.h : info.w; info.sh = swap ? info.w : info.h; // size as shown (after EXIF rotation)
  return info;
}

// ---------------------------------------------------------------------------------------------- metadata report
const cleanDate = s => { const m = /^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2})/.exec(s || ''); return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : (s || ''); };
export function readMeta(u8, type) {
  const m = { exif: false, orientation: 1, camera: '', date: '', software: '', gps: false, xmp: false, iptc: false, icc: false, comment: false, extra: false, animated: false };
  const fromTiff = t => { if (!t) return; m.exif = true; m.orientation = t.orientation; m.camera = [t.make, t.model].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(); m.date = cleanDate(t.date); m.software = t.software; m.gps = t.gps; };
  if (type === 'jpeg') {
    const segs = jpegSegments(u8) || [];
    for (const g of segs) {
      if (g.m === 0xE1) {
        if (startsWith(u8, g.s + 4, 'Exif\0\0')) { m.exif = true; fromTiff(parseTiff(u8, g.s + 10)); }
        else if (startsWith(u8, g.s + 4, 'http://ns.adobe.com/xap/') || startsWith(u8, g.s + 4, 'http://ns.adobe.com/xmp/')) m.xmp = true;
        else m.extra = true;
      } else if (g.m === 0xED) m.iptc = true;
      else if (g.m === 0xFE) m.comment = true;
      else if (g.m === 0xE2 && startsWith(u8, g.s + 4, 'ICC_PROFILE')) m.icc = true;
      else if (g.m === 0xE2 && startsWith(u8, g.s + 4, 'MPF')) m.extra = true;
      else if (g.m === 0xE0 && startsWith(u8, g.s + 4, 'JFXX')) m.extra = true;
      else if (g.m >= 0xE3 && g.m <= 0xEC) m.extra = true;
    }
    const last = segs[segs.length - 1];
    if (last && last.m === 0xD9 && last.e < u8.length - 1) m.extra = true; // data after the end of the image (e.g. motion photo video)
  } else if (type === 'png') {
    for (const c of pngChunks(u8) || []) {
      if (c.type === 'eXIf') fromTiff(parseTiff(u8, c.d));
      else if (c.type === 'iTXt' && startsWith(u8, c.d, 'XML:com.adobe.xmp')) m.xmp = true;
      else if (c.type === 'tEXt' || c.type === 'zTXt' || c.type === 'iTXt') m.comment = true;
      else if (c.type === 'tIME') { m.extra = true; }
      else if (c.type === 'iCCP') m.icc = true;
      else if (c.type === 'acTL') m.animated = true;
    }
  } else if (type === 'webp') {
    for (const c of webpChunks(u8) || []) {
      if (c.type === 'EXIF') { m.exif = true; const o = startsWith(u8, c.d, 'Exif\0\0') ? 6 : 0; fromTiff(parseTiff(u8, c.d + o)); }
      else if (c.type === 'XMP ') m.xmp = true;
      else if (c.type === 'ICCP') m.icc = true;
      else if (c.type === 'ANIM') m.animated = true;
    }
  }
  m.found = [];
  if (m.camera) m.found.push('Camera: ' + m.camera);
  if (m.date) m.found.push('Date taken: ' + m.date);
  if (m.software) m.found.push('Software: ' + m.software);
  if (m.gps) m.found.push('GPS location');
  if (m.exif && !m.camera && !m.date && !m.gps && !m.software) m.found.push('EXIF details');
  if (m.xmp) m.found.push('XMP data');
  if (m.iptc) m.found.push('IPTC caption data');
  if (m.comment) m.found.push('Text comment');
  if (m.extra) m.found.push('Extra embedded data');
  m.personal = m.exif || m.xmp || m.iptc || m.comment || m.extra || m.gps;
  return m;
}

// ---------------------------------------------------------------------------------------------- lossless stripping
// Each function keeps only what is needed to show the picture (and the colour profile) and drops everything else.
export function stripJpeg(u8) {
  const segs = jpegSegments(u8); if (!segs) throw new AppError('image', 'This file is not a readable JPG.');
  const parts = []; let size = 0;
  const keep = g => { const part = u8.subarray(g.s, g.e); parts.push(part); size += part.length; };
  let ended = false;
  for (const g of segs) {
    const m = g.m;
    if (m === 0xD8 || m === 0xDB || m === 0xC4 || m === 0xDD || m === 0xDC || m === 0xDA || (m >= 0xC0 && m <= 0xCF)) keep(g);
    else if (m === 0xE0 && startsWith(u8, g.s + 4, 'JFIF\0') && g.e - g.s >= 18) { // keep the JFIF header, drop any embedded thumbnail
      const part = u8.slice(g.s, g.s + 18); part[2] = 0; part[3] = 16; part[16] = 0; part[17] = 0; parts.push(part); size += 18;
    } else if (m === 0xE2 && startsWith(u8, g.s + 4, 'ICC_PROFILE\0')) keep(g);
    else if (m === 0xEE && startsWith(u8, g.s + 4, 'Adobe')) keep(g);
    else if (m === 0xD9) { keep(g); ended = true; break; }
  }
  if (!ended) { parts.push(Uint8Array.of(0xFF, 0xD9)); size += 2; }
  const out = new Uint8Array(size); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const PNG_KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT']);
export function stripPng(u8) {
  const chunks = pngChunks(u8); if (!chunks) throw new AppError('image', 'This file is not a readable PNG.');
  const keep = chunks.filter(c => PNG_KEEP.has(c.type));
  let size = 8; for (const c of keep) size += c.e - c.s;
  const out = new Uint8Array(size); out.set(u8.subarray(0, 8), 0); let o = 8;
  for (const c of keep) { out.set(u8.subarray(c.s, c.e), o); o += c.e - c.s; }
  return out;
}

const WEBP_KEEP = new Set(['VP8X', 'ICCP', 'ANIM', 'ANMF', 'ALPH', 'VP8 ', 'VP8L']);
export function stripWebp(u8) {
  const chunks = webpChunks(u8); if (!chunks) throw new AppError('image', 'This file is not a readable WebP.');
  const keep = chunks.filter(c => WEBP_KEEP.has(c.type));
  let size = 12; for (const c of keep) size += c.e - c.s;
  const out = new Uint8Array(size); out.set(u8.subarray(0, 12), 0); let o = 12;
  for (const c of keep) {
    out.set(u8.subarray(c.s, c.e), o);
    if (c.type === 'VP8X') out[o + 8] &= ~(0x08 | 0x04); // clear the "has EXIF" and "has XMP" flags
    o += c.e - c.s;
  }
  const total = size - 8; out[4] = total & 255; out[5] = (total >> 8) & 255; out[6] = (total >> 16) & 255; out[7] = (total >>> 24) & 255;
  return out;
}

// ---------------------------------------------------------------------------------------------- canvas helpers
export function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
export const release = c => { if (c && c.width !== undefined) { try { c.width = c.height = 0; } catch (e) { /* ignore */ } } };

let okArea = LIMITS.maxCanvasPixels, badArea = Infinity;
// Can this browser really create a canvas this big? Small canvases always can; bigger ones are probed once.
export function canvasFits(w, h) {
  const a = w * h;
  if (a <= okArea) return true;
  if (a >= badArea || a > LIMITS.maxImagePixels) return false;
  try {
    const c = makeCanvas(w, h); const ctx = c.getContext('2d'); if (!ctx) { badArea = Math.min(badArea, a); return false; }
    ctx.fillStyle = '#f00'; ctx.fillRect(c.width - 1, c.height - 1, 1, 1);
    const d = ctx.getImageData(c.width - 1, c.height - 1, 1, 1).data; release(c);
    if (d[0] === 255 && d[3] === 255) { okArea = a; return true; }
  } catch (e) { /* too big */ }
  badArea = Math.min(badArea, a); return false;
}
// Shrinks (w, h) only if the browser cannot make a canvas that big. Returns { w, h, shrunk }.
export function fitCanvas(w, h) {
  if (canvasFits(w, h)) return { w, h, shrunk: false };
  const k = Math.sqrt(LIMITS.maxCanvasPixels / (w * h));
  return { w: Math.max(1, Math.floor(w * k)), h: Math.max(1, Math.floor(h * k)), shrunk: true };
}

// Draws the region (sx, sy, sw, sh) of src into a new canvas of tw x th. Large reductions go in halving steps for a clean result.
// bg: CSS colour to fill first (needed for JPG output); opaque: make the canvas alpha-less (smaller PNG for photos).
export function scaleCanvas(src, sx, sy, sw, sh, tw, th, { bg = null, opaque = false } = {}) {
  tw = Math.max(1, Math.round(tw)); th = Math.max(1, Math.round(th));
  let cur = src, cx = sx, cy = sy, cw = sw, ch = sh, own = null;
  while (cw > tw * 2 || ch > th * 2) {
    const nw = cw > tw * 2 ? Math.ceil(cw / 2) : Math.max(tw, Math.round(cw)), nh = ch > th * 2 ? Math.ceil(ch / 2) : Math.max(th, Math.round(ch));
    const c = makeCanvas(nw, nh); const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(cur, cx, cy, cw, ch, 0, 0, nw, nh);
    if (own) release(own);
    cur = own = c; cx = cy = 0; cw = nw; ch = nh;
  }
  const out = makeCanvas(tw, th); const ctx = out.getContext('2d', opaque || bg ? { alpha: false } : undefined);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, tw, th); }
  ctx.drawImage(cur, cx, cy, cw, ch, 0, 0, tw, th);
  if (own) release(own);
  return out;
}

// rot: 0/90/180/270 clockwise, then flipH/flipV on the result. Returns a new canvas.
export function transformCanvas(src, w, h, rot, flipH, flipV, { bg = null, opaque = false } = {}) {
  const swap = rot === 90 || rot === 270;
  const out = makeCanvas(swap ? h : w, swap ? w : h); const ctx = out.getContext('2d', opaque || bg ? { alpha: false } : undefined);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, out.width, out.height); }
  ctx.translate(out.width / 2, out.height / 2);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.rotate(rot * Math.PI / 180);
  ctx.drawImage(src, -w / 2, -h / 2, w, h);
  return out;
}

// ---------------------------------------------------------------------------------------------- decoding with EXIF orientation
const PROBE = '/9j/4AAQSkZJRgABAQAAAQABAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAABAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDmaKKK8g/RD//Z';
let orientMode = null;
// How does this browser treat EXIF rotation when decoding? 'option' = createImageBitmap(…, from-image), 'default' = it already
// rotates, 'manual' = it does not and we rotate ourselves.
export const _setOrientMode = m => { orientMode = m; }; // tests only
export async function detectOrientMode() {
  if (orientMode) return orientMode;
  try {
    const bin = atob(PROBE); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const blob = new Blob([u], { type: 'image/jpeg' });
    try { const b = await createImageBitmap(blob, { imageOrientation: 'from-image' }); const ok = b.width === 1 && b.height === 2; b.close && b.close(); if (ok) return (orientMode = 'option'); } catch (e) { /* option not supported */ }
    const b2 = await createImageBitmap(blob); const ok2 = b2.width === 1 && b2.height === 2; b2.close && b2.close();
    orientMode = ok2 ? 'default' : 'manual';
  } catch (e) { orientMode = 'manual'; }
  return orientMode;
}
const ORIENT_T = { 2: (w, h) => [-1, 0, 0, 1, w, 0], 3: (w, h) => [-1, 0, 0, -1, w, h], 4: (w, h) => [1, 0, 0, -1, 0, h], 5: () => [0, 1, 1, 0, 0, 0], 6: (w, h) => [0, 1, -1, 0, h, 0], 7: (w, h) => [0, -1, -1, 0, h, w], 8: (w, h) => [0, -1, 1, 0, 0, w] };
// Draws a raw (unrotated) bitmap into a canvas rotated by EXIF orientation o (1-8).
function bakeOrientation(bmp, o) {
  const w = bmp.width, h = bmp.height, swap = o >= 5;
  const c = makeCanvas(swap ? h : w, swap ? w : h); const ctx = c.getContext('2d');
  const m = ORIENT_T[o](w, h); ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  ctx.drawImage(bmp, 0, 0);
  return c;
}

async function isCutOff(file, type) {
  try {
    const u8 = new Uint8Array(await file.arrayBuffer());
    if (type === 'jpeg') { const segs = jpegSegments(u8); return !!segs && !segs.some(g => g.m === 0xD9); }
    const ch = pngChunks(u8); return !!ch && !ch.some(c => c.type === 'IEND');
  } catch (e) { return false; }
}

// Decodes a File (info from imageInfo). Returns { src, w, h, alpha, info, close() } with the picture upright.
export async function loadImage(file, type, info) {
  const sw = info ? info.sw : 0, sh = info ? info.sh : 0;
  if (sw && sh && sw * sh > LIMITS.maxImagePixels) throw new AppError('image', `"${file.name}" is ${(sw * sh / 1e6).toFixed(0)} megapixels. The limit is 60 megapixels. Resize it first, then try again.`);
  // Some browsers (Safari) decode a cut-off JPEG or PNG and fill the missing part with grey. Refuse those instead of saving a broken picture.
  if ((type === 'jpeg' || type === 'png') && await isCutOff(file, type)) throw new AppError('image', `"${file.name}" could not be decoded. The file may be damaged or incomplete.`);
  const mode = await detectOrientMode();
  const needManual = mode === 'manual' && type === 'jpeg' && info && info.orient > 1;
  let bmp;
  try {
    if (mode === 'option') bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    else if (mode === 'default') bmp = await createImageBitmap(file);
    else { try { bmp = await createImageBitmap(file, { imageOrientation: 'none' }); } catch (e0) { bmp = await createImageBitmap(file); } }
  } catch (e) {
    throw new AppError('image', type === 'heic' ? 'HEIC photos are not supported in the browser yet. Convert it to JPG or PNG first.' : `"${file.name}" could not be decoded. The file may be damaged.`);
  }
  if (bmp.width * bmp.height > LIMITS.maxImagePixels) { bmp.close && bmp.close(); throw new AppError('image', `"${file.name}" is over 60 megapixels, which is too large to process safely. Resize it first, then try again.`); }
  let src = bmp, w = bmp.width, h = bmp.height, baked = null;
  if (needManual) { baked = bakeOrientation(bmp, info.orient); bmp.close && bmp.close(); src = baked; w = baked.width; h = baked.height; }
  return { src, w, h, alpha: info ? info.alpha : true, info, close() { if (baked) release(baked); else if (bmp.close) bmp.close(); } };
}

// ---------------------------------------------------------------------------------------------- encoding
let webpP = null;
export function webpSupported() {
  webpP ||= new Promise(res => {
    try { const c = makeCanvas(2, 2); c.getContext('2d').fillRect(0, 0, 1, 1); c.toBlob(b => res(!!b && b.type === 'image/webp'), 'image/webp', 0.5); } catch (e) { res(false); }
  });
  return webpP;
}
export const NO_WEBP = 'This browser cannot save WebP images. Choose JPG or PNG instead, or try Chrome, Edge or Firefox.';
export async function encodeCanvas(canvas, fmt, quality) {
  const mime = FMT[fmt].mime;
  const blob = await new Promise(r => { try { canvas.toBlob(r, mime, fmt === 'png' ? undefined : quality); } catch (e) { r(null); } });
  if (!blob) throw new AppError('memory', 'The browser ran out of memory while saving this image. Try a smaller image or a lower quality.');
  if (blob.type !== mime) throw new AppError('format', fmt === 'webp' ? NO_WEBP : `This browser could not save a ${FMT[fmt].label} file.`);
  return blob;
}

// ---------------------------------------------------------------------------------------------- naming + text
export const outName = (name, suffix, ext) => {
  const base = String(name || 'image').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N} ._-]+/gu, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'image';
  return `${base}${suffix ? '-' + suffix : ''}.${ext}`;
};
export function uniqueNamer() {
  const seen = new Set();
  return name => { let n = name, k = 1; while (seen.has(n.toLowerCase())) { n = name.replace(/(\.[^.]*)?$/, `-${++k}$1`); } seen.add(n.toLowerCase()); return n; };
}
export const pctChange = (before, after) => { const p = Math.round((1 - after / before) * 100); return p > 0 ? `${p}% smaller` : p < 0 ? `${-p}% bigger` : 'same size'; };
export const dims = (w, h) => `${w.toLocaleString('en-US')} × ${h.toLocaleString('en-US')}`;
export const yieldUI = () => new Promise(r => setTimeout(r, 0));
