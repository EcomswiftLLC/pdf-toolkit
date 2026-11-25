// Tool definitions. Every tool here is real and runs locally; unfinished ones are listed in SOON only.
import { AppError, Cancelled, LIMITS, baseName, fmtBytes, plural, parseGroups, parseIndexes } from './core.js';
import { L, loadDoc, openRender, renderPage, canvasBlob, prepareImage, normRot } from './pdfx.js';

const chk = s => { if (s && s.aborted) throw new Cancelled(); };
const pdfOut = (bytes, name) => ({ name, blob: new Blob([bytes], { type: 'application/pdf' }) });
const save = doc => doc.save({ useObjectStreams: true, addDefaultPage: false });
const yieldUI = () => new Promise(r => setTimeout(r, 0));

async function copyInto(dst, srcBytes, indexes) {
  const src = await loadDoc(srcBytes);
  const pages = await dst.copyPages(src, indexes);
  pages.forEach(p => dst.addPage(p));
}

export const TOOLS = [
  // ---------------------------------------------------------------- merge
  {
    id: 'merge', name: 'Merge PDF', blurb: 'Combine several PDFs into one file, in the order you choose.', icon: 'merge', category: 'Organize',
    accept: 'pdf', multi: true, view: 'list', cta: s => `Merge ${s.files.length} PDF${s.files.length === 1 ? '' : 's'}`, ctaIcon: 'merge', working: 'Merging your PDFs…', downloadLabel: 'Download merged PDF',
    status: s => s.files.length ? `${plural(s.files.reduce((n, f) => n + f.pageCount, 0), 'page')} in total` : '',
    validate: s => s.files.length < 2 ? 'Add at least two PDFs to merge. Use "Add more" to include another file.' : (s.files.reduce((n, f) => n + f.pageCount, 0) > 2000 ? 'The merged file would have more than 2,000 pages. Remove a file or two and try again.' : null),
    async run({ files, progress, signal }) {
      const { PDFDocument } = L(); const out = await PDFDocument.create();
      for (let i = 0; i < files.length; i++) {
        chk(signal); progress(i / files.length, `Adding ${files[i].name}`);
        const n = files[i].pageCount; await copyInto(out, files[i].bytes, Array.from({ length: n }, (_, k) => k)); await yieldUI();
      }
      progress(0.95, 'Saving…'); const bytes = await save(out); chk(signal);
      return { title: 'Your PDFs are merged', summary: `${plural(out.getPageCount(), 'page')} · ${fmtBytes(bytes.length)}`, outputs: [pdfOut(bytes, 'merged.pdf')] };
    },
  },
  // ---------------------------------------------------------------- split
  {
    id: 'split', name: 'Split PDF', blurb: 'Cut a PDF into several files by page range, every N pages, or one file per page.', icon: 'split', category: 'Organize',
    accept: 'pdf', multi: false, view: 'single', cta: 'Split PDF', ctaIcon: 'split', working: 'Splitting your PDF…',
    options: [
      { key: 'mode', type: 'seg', label: 'How do you want to split it?', value: 'ranges', choices: [
        { v: 'ranges', t: 'Custom ranges', d: 'Each range becomes its own PDF. For example, "1-3, 5, 8-10" creates three files.' },
        { v: 'every', t: 'Every N pages', d: 'Creates a new PDF each time N pages have been collected.' },
        { v: 'each', t: 'One page per file', d: 'Creates one PDF for every page in the document.' }] },
      { key: 'ranges', type: 'text', label: 'Page ranges', value: '', placeholder: 'e.g. 1-3, 5, 8-10', help: 'Separate ranges with commas. Leave the end open (like 8-) to go to the last page.', showIf: o => o.mode === 'ranges' },
      { key: 'n', type: 'number', label: 'Pages per file', value: 2, min: 1, step: 1, showIf: o => o.mode === 'every' },
    ],
    validate: s => {
      const o = s.opts, n = s.files[0].pageCount;
      if (o.mode === 'ranges') { try { parseGroups(o.ranges, n); } catch (e) { return { key: 'ranges', msg: e.message }; } }
      if (o.mode === 'every' && !(Number.isInteger(o.n) && o.n >= 1)) return { key: 'n', msg: 'Enter a whole number of 1 or more.' };
      if (o.mode === 'each' && n > 200) return 'This would create more than 200 files.';
      return null;
    },
    async run({ files, opts, progress, signal }) {
      const f = files[0], n = f.pageCount, base = baseName(f.name); const { PDFDocument } = L(); const src = await loadDoc(f.bytes);
      let groups;
      if (opts.mode === 'ranges') groups = parseGroups(opts.ranges, n);
      else if (opts.mode === 'every') { groups = []; for (let i = 0; i < n; i += opts.n) groups.push(Array.from({ length: Math.min(opts.n, n - i) }, (_, k) => i + k)); }
      else groups = Array.from({ length: n }, (_, i) => [i]);
      if (groups.length > 200) throw new AppError('range', 'That would create more than 200 files. Use fewer or wider ranges.');
      const outputs = [];
      for (let g = 0; g < groups.length; g++) {
        chk(signal); progress(g / groups.length, `Creating file ${g + 1} of ${groups.length}`);
        const d = await PDFDocument.create(); (await d.copyPages(src, groups[g])).forEach(p => d.addPage(p));
        const first = groups[g][0] + 1, last = groups[g][groups[g].length - 1] + 1;
        const label = groups[g].length === 1 ? `page-${first}` : `pages-${first}-${last}`;
        outputs.push(pdfOut(await save(d), `${base}-${label}.pdf`)); await yieldUI();
      }
      outputs.forEach(o => { o.meta = fmtBytes(o.blob.size); });
      return { title: outputs.length === 1 ? 'Your PDF is ready' : `Your PDF was split into ${outputs.length} files`, outputs, zipName: `${base}-split` };
    },
  },
  // ---------------------------------------------------------------- extract
  {
    id: 'extract-pages', name: 'Extract Pages', blurb: 'Pull selected pages out of a PDF into a new, smaller file.', icon: 'extract', category: 'Organize',
    accept: 'pdf', multi: false, view: 'pages', pagesMode: 'select', cta: s => { const n = s.pages.filter(p => p.sel).length; return n ? `Extract ${plural(n, 'page')}` : 'Extract pages'; }, ctaIcon: 'extract', working: 'Extracting pages…', downloadLabel: 'Download extracted PDF',
    status: s => { const n = s.pages.filter(p => p.sel).length; return n ? `${n} of ${s.pages.length} selected` : 'No pages selected yet'; },
    validate: s => s.pages.some(p => p.sel) ? null : 'Select at least one page to extract. Click a page, or type a range such as 1-3, 5.',
    async run({ files, pages, progress, signal }) {
      const { PDFDocument } = L(); const src = await loadDoc(files[0].bytes); const d = await PDFDocument.create();
      const idx = pages.filter(p => p.sel).map(p => p.i).sort((a, b) => a - b);
      progress(0.3, 'Copying pages…'); (await d.copyPages(src, idx)).forEach(p => d.addPage(p)); chk(signal);
      const bytes = await save(d);
      return { title: `${plural(idx.length, 'page')} extracted`, summary: fmtBytes(bytes.length), outputs: [pdfOut(bytes, `${baseName(files[0].name)}-extracted.pdf`)] };
    },
  },
  // ---------------------------------------------------------------- delete
  {
    id: 'delete-pages', name: 'Delete Pages', blurb: 'Remove unwanted pages from a PDF and keep the rest.', icon: 'trash', category: 'Organize',
    accept: 'pdf', multi: false, view: 'pages', pagesMode: 'delete', cta: s => { const n = s.pages.filter(p => p.sel).length; return n ? `Delete ${plural(n, 'page')}` : 'Delete pages'; }, ctaIcon: 'trash', working: 'Removing pages…', downloadLabel: 'Download PDF',
    status: s => { const n = s.pages.filter(p => p.sel).length; return n ? `${n} of ${s.pages.length} marked for deletion` : 'No pages marked yet'; },
    validate: s => { const n = s.pages.filter(p => p.sel).length; if (!n) return 'Mark at least one page to delete. Click a page, or type a range such as 2-4.'; if (n === s.pages.length) return 'You marked every page. A PDF needs at least one page, so leave one unmarked.'; return null; },
    async run({ files, pages, progress, signal }) {
      const { PDFDocument } = L(); const src = await loadDoc(files[0].bytes); const d = await PDFDocument.create();
      const keep = pages.filter(p => !p.sel).map(p => p.i).sort((a, b) => a - b);
      progress(0.3, 'Copying remaining pages…'); (await d.copyPages(src, keep)).forEach(p => d.addPage(p)); chk(signal);
      const bytes = await save(d);
      return { title: `${plural(pages.length - keep.length, 'page')} deleted`, summary: `${plural(keep.length, 'page')} remain · ${fmtBytes(bytes.length)}`, outputs: [pdfOut(bytes, `${baseName(files[0].name)}-edited.pdf`)] };
    },
  },
  // ---------------------------------------------------------------- reorder
  {
    id: 'reorder-pages', name: 'Reorder Pages', blurb: 'Rearrange the pages of a PDF by dragging them or moving them with buttons.', icon: 'reorder', category: 'Organize',
    accept: 'pdf', multi: false, view: 'pages', pagesMode: 'reorder', cta: 'Save new order', ctaIcon: 'check', working: 'Reordering pages…', downloadLabel: 'Download PDF',
    status: s => s.pages.some((p, i) => p.i !== i) ? 'Order changed' : 'Original order',
    validate: s => s.pages.some((p, i) => p.i !== i) ? null : 'The pages are still in their original order. Drag a page, or use the arrow buttons, to change it.',
    async run({ files, pages, progress, signal }) {
      const { PDFDocument } = L(); const src = await loadDoc(files[0].bytes); const d = await PDFDocument.create();
      progress(0.3, 'Arranging pages…'); (await d.copyPages(src, pages.map(p => p.i))).forEach(p => d.addPage(p)); chk(signal);
      const bytes = await save(d);
      return { title: 'Pages reordered', summary: `${plural(pages.length, 'page')} · ${fmtBytes(bytes.length)}`, outputs: [pdfOut(bytes, `${baseName(files[0].name)}-reordered.pdf`)] };
    },
  },
  // ---------------------------------------------------------------- rotate
  {
    id: 'rotate', name: 'Rotate PDF', blurb: 'Turn individual pages, or the whole document, left or right.', icon: 'rotate', category: 'Organize',
    accept: 'pdf', multi: false, view: 'pages', pagesMode: 'rotate', cta: 'Save rotated PDF', ctaIcon: 'rotate', working: 'Rotating pages…', downloadLabel: 'Download PDF',
    status: s => { const n = s.pages.filter(p => p.rot).length; return n ? `${plural(n, 'page')} rotated` : 'No pages rotated yet'; },
    validate: s => s.pages.some(p => p.rot) ? null : 'Rotate at least one page first. Use the arrows under a page, or "Rotate all".',
    async run({ files, pages, progress, signal }) {
      const { degrees } = L(); const doc = await loadDoc(files[0].bytes); const list = doc.getPages();
      pages.forEach(p => { if (p.rot) list[p.i].setRotation(degrees(normRot(list[p.i].getRotation().angle + p.rot))); });
      progress(0.6, 'Saving…'); const bytes = await save(doc); chk(signal);
      return { title: 'Pages rotated', summary: fmtBytes(bytes.length), outputs: [pdfOut(bytes, `${baseName(files[0].name)}-rotated.pdf`)] };
    },
  },
  // ---------------------------------------------------------------- images -> pdf
  {
    id: 'images-to-pdf', name: 'Images to PDF', blurb: 'Turn JPG, PNG and other images into a single PDF, one image per page.', icon: 'img2pdf', category: 'Convert',
    accept: 'image', multi: true, view: 'list', cta: s => `Create PDF from ${plural(s.files.length, 'image')}`, ctaIcon: 'img2pdf', working: 'Creating your PDF…', downloadLabel: 'Download PDF',
    options: [
      { key: 'size', type: 'seg', label: 'Page size', value: 'a4', choices: [{ v: 'a4', t: 'A4' }, { v: 'letter', t: 'US Letter' }, { v: 'fit', t: 'Match each image', d: 'Each page takes the shape of its image, with no margins.' }] },
      { key: 'orient', type: 'seg', label: 'Orientation', value: 'auto', choices: [{ v: 'auto', t: 'Automatic', d: 'Landscape images get landscape pages.' }, { v: 'portrait', t: 'Portrait' }, { v: 'landscape', t: 'Landscape' }], showIf: o => o.size !== 'fit' },
      { key: 'margin', type: 'seg', label: 'Margin', value: 'small', choices: [{ v: 'none', t: 'None' }, { v: 'small', t: 'Small' }, { v: 'big', t: 'Large' }], showIf: o => o.size !== 'fit' },
    ],
    validate: s => s.files.length ? null : 'Add at least one image.',
    async run({ files, opts, progress, signal }) {
      const { PDFDocument } = L(); const d = await PDFDocument.create();
      const SZ = { a4: [595.28, 841.89], letter: [612, 792] }; const M = { none: 0, small: 28, big: 56 };
      for (let i = 0; i < files.length; i++) {
        chk(signal); progress(i / files.length, `Adding image ${i + 1} of ${files.length}`);
        const im = await prepareImage(files[i].file, files[i].type);
        const img = im.kind === 'jpg' ? await d.embedJpg(im.bytes) : await d.embedPng(im.bytes);
        let pw, ph, x, y, w, hh;
        if (opts.size === 'fit') {
          const k = 842 / Math.max(im.w, im.h); pw = w = im.w * k; ph = hh = im.h * k; x = y = 0;
        } else {
          let [a, b] = SZ[opts.size]; const landscape = opts.orient === 'landscape' || (opts.orient === 'auto' && im.w > im.h);
          [pw, ph] = landscape ? [b, a] : [a, b]; const m = M[opts.margin];
          const k = Math.min((pw - 2 * m) / im.w, (ph - 2 * m) / im.h); w = im.w * k; hh = im.h * k; x = (pw - w) / 2; y = (ph - hh) / 2;
        }
        const page = d.addPage([pw, ph]); page.drawImage(img, { x, y, width: w, height: hh }); await yieldUI();
      }
      progress(0.97, 'Saving…'); const bytes = await save(d);
      return { title: 'Your PDF is ready', summary: `${plural(files.length, 'page')} · ${fmtBytes(bytes.length)}`, outputs: [pdfOut(bytes, files.length === 1 ? `${baseName(files[0].name)}.pdf` : 'images.pdf')] };
    },
  },
  // ---------------------------------------------------------------- pdf -> images
  {
    id: 'pdf-to-images', name: 'PDF to JPG / PNG', blurb: 'Save every page of a PDF as a sharp JPG or PNG image.', icon: 'pdf2img', category: 'Convert',
    accept: 'pdf', multi: false, view: 'single', cta: 'Convert to images', ctaIcon: 'pdf2img', working: 'Rendering pages…',
    options: [
      { key: 'fmt', type: 'seg', label: 'Image format', value: 'jpg', choices: [{ v: 'jpg', t: 'JPG', d: 'Smaller files. Best for pages with photos.' }, { v: 'png', t: 'PNG', d: 'Sharper text and lines, larger files.' }] },
      { key: 'dpi', type: 'seg', label: 'Quality', value: '150', choices: [{ v: '96', t: 'Screen (96 DPI)' }, { v: '150', t: 'Standard (150 DPI)' }, { v: '220', t: 'High (220 DPI)' }] },
      { key: 'pages', type: 'text', label: 'Pages (optional)', value: '', placeholder: 'All pages', help: 'Leave empty for every page, or enter something like 1-3, 7.' },
    ],
    validate: s => { const n = s.files[0].pageCount; try { const c = s.opts.pages.trim() ? parseIndexes(s.opts.pages, n).length : n; if (c > 100) return 'Converting more than 100 pages at once can run out of memory. Enter a page range such as 1-100.'; } catch (e) { return { key: 'pages', msg: e.message }; } return null; },
    async run({ files, opts, progress, signal }) {
      const f = files[0], base = baseName(f.name); const n = f.pageCount;
      const idx = opts.pages.trim() ? parseIndexes(opts.pages, n) : Array.from({ length: n }, (_, i) => i);
      const doc = await openRender(f.bytes); const scale = Number(opts.dpi) / 72; const png = opts.fmt === 'png'; const outputs = []; let capped = 0;
      const c = document.createElement('canvas'); const pad = String(n).length;
      try {
        for (let k = 0; k < idx.length; k++) {
          chk(signal); progress(k / idx.length, `Page ${idx[k] + 1} (${k + 1} of ${idx.length})`);
          const { ptW } = await renderPage(doc, idx[k] + 1, scale, c); if (c.width < Math.floor(ptW * scale) - 1) capped++;
          const blob = await canvasBlob(c, png ? 'image/png' : 'image/jpeg', 0.92);
          outputs.push({ name: `${base}-page-${String(idx[k] + 1).padStart(pad, '0')}.${png ? 'png' : 'jpg'}`, blob, meta: `${c.width} × ${c.height} · ${fmtBytes(blob.size)}` });
          await yieldUI();
        }
      } finally { c.width = c.height = 0; doc.destroy && doc.destroy(); }
      const notes = capped ? [`${plural(capped, 'page')} ${capped === 1 ? 'is' : 'are'} very large, so ${capped === 1 ? 'it was' : 'they were'} saved at a slightly lower resolution to stay within your browser's limits.`] : [];
      return { title: outputs.length === 1 ? 'Your image is ready' : `${outputs.length} images are ready`, outputs, notes, zipName: `${base}-images` };
    },
  },
  // ---------------------------------------------------------------- compress
  {
    id: 'compress', name: 'Compress PDF', blurb: 'Make a PDF smaller. Choose a gentle clean-up that keeps text, or a stronger option for scans and photos.', icon: 'compress', category: 'Optimize',
    accept: 'pdf', multi: false, view: 'single', cta: 'Compress PDF', ctaIcon: 'compress', working: 'Compressing your PDF…', downloadLabel: 'Download compressed PDF',
    options: [
      { key: 'mode', type: 'seg', label: 'Compression type', value: 'light', choices: [
        { v: 'light', t: 'Gentle clean-up', d: 'Keeps text selectable and everything sharp. Savings are usually small, and some files will not shrink.' },
        { v: 'strong', t: 'Reduce image quality', d: 'Redraws each page as an image. Often much smaller, but text will no longer be selectable or searchable.' }] },
      { key: 'level', type: 'seg', label: 'Image quality', value: 'balanced', showIf: o => o.mode === 'strong', choices: [
        { v: 'balanced', t: 'Balanced', d: 'Good for reading on screen and printing.' }, { v: 'small', t: 'Smallest file', d: 'Lower quality. Best for sharing by email.' }] },
    ],
    async run({ files, opts, progress, signal }) {
      const f = files[0], base = baseName(f.name); const { PDFDocument } = L(); let bytes;
      if (opts.mode === 'light') {
        const doc = await loadDoc(f.bytes); progress(0.5, 'Rebuilding file structure…');
        bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false }); chk(signal);
      } else {
        const lv = opts.level === 'small' ? { dpi: 96, q: 0.5 } : { dpi: 130, q: 0.7 };
        const rd = await openRender(f.bytes); const out = await PDFDocument.create(); const c = document.createElement('canvas');
        try {
          for (let i = 1; i <= f.pageCount; i++) {
            chk(signal); progress((i - 1) / f.pageCount, `Compressing page ${i} of ${f.pageCount}`);
            const { ptW, ptH } = await renderPage(rd, i, lv.dpi / 72, c);
            const jpg = new Uint8Array(await (await canvasBlob(c, 'image/jpeg', lv.q)).arrayBuffer());
            const img = await out.embedJpg(jpg); const pg = out.addPage([ptW, ptH]); pg.drawImage(img, { x: 0, y: 0, width: ptW, height: ptH }); await yieldUI();
          }
        } finally { c.width = c.height = 0; rd.destroy && rd.destroy(); }
        progress(0.97, 'Saving…'); bytes = await save(out);
      }
      const before = f.size, after = bytes.length;
      if (after >= before) {
        const kept = new Blob([f.bytes], { type: 'application/pdf' });
        return { title: 'This PDF is already well compressed', summary: `We could not make it smaller, so we kept your original (${fmtBytes(before)}). ${opts.mode === 'light' ? 'Try "Reduce image quality" for a smaller file.' : 'Try the "Smallest file" setting, or keep the original.'}`, outputs: [{ name: `${base}.pdf`, blob: kept, meta: `Original · ${fmtBytes(before)}` }] };
      }
      const pct = Math.round((1 - after / before) * 100);
      return { title: 'Your PDF is smaller', summary: `${fmtBytes(before)} → ${fmtBytes(after)}`, badge: `${pct}% smaller`, outputs: [{ name: `${base}-compressed.pdf`, blob: new Blob([bytes], { type: 'application/pdf' }), meta: `${fmtBytes(after)} (was ${fmtBytes(before)})` }],
        notes: opts.mode === 'strong' ? ['Pages were saved as images, so text in this file can no longer be selected or searched.'] : [] };
    },
  },
  // ---------------------------------------------------------------- page numbers
  {
    id: 'page-numbers', name: 'Add Page Numbers', blurb: 'Stamp page numbers onto every page, with your choice of position and style.', icon: 'numbers', category: 'Edit',
    accept: 'pdf', multi: false, view: 'single', cta: 'Add page numbers', ctaIcon: 'numbers', working: 'Adding page numbers…', downloadLabel: 'Download numbered PDF',
    options: [
      { key: 'pos', type: 'select', label: 'Position', value: 'bc', choices: [{ v: 'bc', t: 'Bottom center' }, { v: 'br', t: 'Bottom right' }, { v: 'bl', t: 'Bottom left' }, { v: 'tc', t: 'Top center' }, { v: 'tr', t: 'Top right' }, { v: 'tl', t: 'Top left' }] },
      { key: 'fmt', type: 'seg', label: 'Style', value: 'n', choices: [{ v: 'n', t: '1' }, { v: 'pn', t: 'Page 1' }, { v: 'nof', t: '1 of 10' }, { v: 'pnof', t: 'Page 1 of 10' }] },
      { key: 'start', type: 'number', label: 'Start numbering at', value: 1, min: 0, step: 1 },
      { key: 'size', type: 'number', label: 'Font size', value: 11, min: 6, max: 36, step: 1 },
      { key: 'skip', type: 'check', label: 'Do not number the first page', value: false },
    ],
    validate: s => { const o = s.opts; if (!Number.isInteger(o.start) || o.start < 0 || o.start > 100000) return { key: 'start', msg: 'Enter a whole number from 0 to 100000.' }; if (!(o.size >= 6 && o.size <= 36)) return { key: 'size', msg: 'Choose a font size between 6 and 36.' }; return null; },
    async run({ files, opts, progress, signal }) {
      const { StandardFonts, rgb } = L(); const doc = await loadDoc(files[0].bytes); const font = await doc.embedFont(StandardFonts.Helvetica);
      const pages = doc.getPages(); const total = pages.length + opts.start - 1 - (opts.skip ? 1 : 0); const fs = opts.size, M = 28;
      pages.forEach((pg, i) => {
        if (opts.skip && i === 0) return; chk(signal);
        const num = opts.start + i - (opts.skip ? 1 : 0);
        const text = { n: `${num}`, pn: `Page ${num}`, nof: `${num} of ${total}`, pnof: `Page ${num} of ${total}` }[opts.fmt];
        const tw = font.widthOfTextAtSize(text, fs);
        const g = geom(pg); const v = opts.pos;
        const sx = v[1] === 'c' ? (g.vw - tw) / 2 : v[1] === 'l' ? M : g.vw - M - tw;
        const sy = v[0] === 'b' ? M : g.vh - M - fs * 0.72;
        const [x, y] = g.toUser(sx, sy);
        pg.drawText(text, { x, y, size: fs, font, color: rgb(0.1, 0.12, 0.16), rotate: g.angle });
        if (i % 20 === 0) progress(i / pages.length, `Numbering page ${i + 1} of ${pages.length}`);
      });
      progress(0.95, 'Saving…'); const bytes = await save(doc);
      return { title: 'Page numbers added', summary: fmtBytes(bytes.length), outputs: [pdfOut(bytes, `${baseName(files[0].name)}-numbered.pdf`)] };
    },
  },
  // ---------------------------------------------------------------- watermark
  {
    id: 'watermark', name: 'Add Watermark', blurb: 'Place a text watermark such as CONFIDENTIAL or DRAFT across your pages.', icon: 'watermark', category: 'Edit',
    accept: 'pdf', multi: false, view: 'single', cta: 'Add watermark', ctaIcon: 'watermark', working: 'Adding watermark…', downloadLabel: 'Download watermarked PDF',
    options: [
      { key: 'text', type: 'text', label: 'Watermark text', value: 'CONFIDENTIAL', placeholder: 'e.g. DRAFT', maxlength: 60, help: 'Letters, numbers and common punctuation (Latin characters).' },
      { key: 'angle', type: 'seg', label: 'Direction', value: 'diag', choices: [{ v: 'diag', t: 'Diagonal' }, { v: 'flat', t: 'Horizontal' }] },
      { key: 'size', type: 'seg', label: 'Size', value: 'm', choices: [{ v: 's', t: 'Small' }, { v: 'm', t: 'Medium' }, { v: 'l', t: 'Large' }] },
      { key: 'opacity', type: 'seg', label: 'Strength', value: '0.25', choices: [{ v: '0.12', t: 'Light' }, { v: '0.25', t: 'Medium' }, { v: '0.45', t: 'Strong' }] },
      { key: 'color', type: 'seg', label: 'Color', value: 'gray', choices: [{ v: 'gray', t: 'Gray' }, { v: 'red', t: 'Red' }, { v: 'blue', t: 'Blue' }, { v: 'black', t: 'Black' }] },
      { key: 'pages', type: 'text', label: 'Pages (optional)', value: '', placeholder: 'All pages', help: 'Leave empty to mark every page, or enter something like 1-3, 7.' },
    ],
    validate: s => {
      const o = s.opts; if (!o.text.trim()) return { key: 'text', msg: 'Enter the text for the watermark.' };
      if (/[^ -~ -ÿ]/.test(o.text)) return { key: 'text', msg: 'Only Latin letters, numbers and common punctuation are supported for now.' };
      if (o.pages.trim()) { try { parseIndexes(o.pages, s.files[0].pageCount); } catch (e) { return { key: 'pages', msg: e.message }; } }
      return null;
    },
    async run({ files, opts, progress, signal }) {
      const { StandardFonts, rgb } = L(); const doc = await loadDoc(files[0].bytes); const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const text = opts.text.trim(); let w1; try { w1 = font.widthOfTextAtSize(text, 1); } catch (e) { throw new AppError('text', 'That text contains characters the watermark font cannot draw. Use Latin letters and numbers.'); }
      const col = { gray: rgb(0.45, 0.48, 0.54), red: rgb(0.75, 0.12, 0.1), blue: rgb(0.14, 0.28, 0.85), black: rgb(0, 0, 0) }[opts.color];
      const ratio = { s: 0.45, m: 0.65, l: 0.88 }[opts.size]; const diag = opts.angle === 'diag'; const th = diag ? Math.PI / 4 : 0;
      const pages = doc.getPages(); const only = opts.pages.trim() ? new Set(parseIndexes(opts.pages, pages.length)) : null;
      pages.forEach((pg, i) => {
        if (only && !only.has(i)) return; chk(signal);
        const g = geom(pg); const avail = diag ? Math.hypot(g.vw, g.vh) * 0.62 : g.vw * 0.86;
        const fs = Math.max(10, Math.min(220, (avail * ratio) / w1)); const tw = w1 * fs;
        // start point so the text is centered on the visual center, in visual space
        const cx = g.vw / 2, cy = g.vh / 2, cos = Math.cos(th), sin = Math.sin(th);
        const sx = cx - (tw / 2) * cos + (fs * 0.35) * sin, sy = cy - (tw / 2) * sin - (fs * 0.35) * cos;
        const [x, y] = g.toUser(sx, sy);
        pg.drawText(text, { x, y, size: fs, font, color: col, opacity: Number(opts.opacity), rotate: { type: 'degrees', angle: (th * 180 / Math.PI) + g.rot } });
        if (i % 20 === 0) progress(i / pages.length, `Marking page ${i + 1} of ${pages.length}`);
      });
      progress(0.95, 'Saving…'); const bytes = await save(doc);
      return { title: 'Watermark added', summary: fmtBytes(bytes.length), outputs: [pdfOut(bytes, `${baseName(files[0].name)}-watermarked.pdf`)] };
    },
  },
];

// Visual-page geometry for a pdf-lib page: handles /Rotate and CropBox so stamped text always reads upright.
function geom(pg) {
  const { degrees } = L(); const box = pg.getCropBox ? pg.getCropBox() : { x: 0, y: 0, ...pg.getSize() };
  const W = box.width, H = box.height, x0 = box.x, y0 = box.y; const r = normRot(pg.getRotation().angle);
  const vw = r % 180 ? H : W, vh = r % 180 ? W : H;
  const toUser = (vx, vy) => r === 0 ? [x0 + vx, y0 + vy] : r === 90 ? [x0 + W - vy, y0 + vx] : r === 180 ? [x0 + W - vx, y0 + H - vy] : [x0 + vy, y0 + H - vx];
  return { vw, vh, rot: r, toUser, angle: degrees(r) };
}

export const SOON = [
  { id: 'protect', name: 'Protect PDF', blurb: 'Lock a PDF with a password before you share it.', icon: 'lock', category: 'Security' },
  { id: 'sign', name: 'Sign PDF', blurb: 'Add your signature to a document.', icon: 'sign', category: 'Edit' },
  { id: 'annotate', name: 'Annotate PDF', blurb: 'Highlight, draw and add notes.', icon: 'annotate', category: 'Edit' },
  { id: 'ocr', name: 'OCR PDF', blurb: 'Make scanned pages searchable.', icon: 'ocr', category: 'Convert' },
  { id: 'pdf-to-word', name: 'PDF to Word', blurb: 'Turn a PDF into an editable document.', icon: 'word', category: 'Convert' },
  { id: 'office-to-pdf', name: 'Word, Excel and PowerPoint to PDF', blurb: 'Convert Office files to PDF.', icon: 'office', category: 'Convert' },
  { id: 'repair', name: 'Repair PDF', blurb: 'Try to recover a damaged PDF.', icon: 'repair', category: 'Optimize' },
];
const SLUGS = { merge: 'merge-pdf', split: 'split-pdf', 'extract-pages': 'extract-pdf-pages', 'delete-pages': 'delete-pdf-pages', 'reorder-pages': 'reorder-pdf-pages', rotate: 'rotate-pdf', 'images-to-pdf': 'jpg-to-pdf', 'pdf-to-images': 'pdf-to-jpg', compress: 'compress-pdf', 'page-numbers': 'add-page-numbers-to-pdf', watermark: 'watermark-pdf' };
TOOLS.forEach(t => { t.slug = SLUGS[t.id]; });
SOON.forEach(t => { t.slug = t.id; });
export const CATEGORIES = ['Organize', 'Convert', 'Optimize', 'Edit', 'Security'];
export const byId = id => TOOLS.find(t => t.id === id);
