// Generic tool workflow: add files -> options -> run -> result. Three views: list, single, pages.
import { h, icon, fmtBytes, plural, sniff, sniffPdfLoose, LIMITS, AppError, Cancelled, saveBlob, emit, announce, uiHost, tick, toRanges, parseIndexes } from './core.js';
import { loadDoc, openRender, renderPage, ensureLibs } from './pdfx.js';
import { imageInfo, TYPE_LABEL, dims } from './kits/image-lib.js';

const MAX_TOTAL = 200 * 1024 * 1024;
const IMG_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.bmp';
let uid = 0;

// Optional tool hooks (all optional; PDF tools use none of them):
//   maxFiles, reorder:false, listNote, noun, hint, pickAccept  - wording and limits of the drop zone and list
//   inspect(file)    - async, returns a short string shown in the file row (e.g. what metadata was found)
//   panel(api)       - returns { el, update(S) }: a custom card (preview, crop...) between the file card and the options
//   autoRun          - run as soon as a file is added
//   onOpt(S, key)    - called when an option changes
//   option types     - seg, check, select, text, number (+suffix), range (+format), color
//   result           - { stats:[{label,value}], panel: Node, noDownload, again } and per output { preview, chip, note }
export function mountTool(root, tool, ctx = {}) {
  const isPdf = tool.accept === 'pdf';
  const S = { files: [], opts: {}, pages: [], phase: 'empty', ac: null, doc: null, baseName: 'document', ext: {} };
  for (const o of tool.options || []) S.opts[o.key] = o.value;

  const alerts = h('div', { class: 'alerts' });
  const stage = h('div', { class: 'stage' });
  root.replaceChildren(alerts, stage);
  const input = h('input', { type: 'file', style: 'display:none', accept: isPdf ? '.pdf,application/pdf' : (tool.pickAccept || IMG_ACCEPT), multiple: !!tool.multi, 'aria-label': isPdf ? 'Choose PDF' : 'Choose images' });
  root.append(input);
  input.addEventListener('change', () => { const f = [...input.files]; input.value = ''; addFiles(f); });
  const pick = () => input.click();
  const stop = e => e.preventDefault();
  uiHost().addEventListener('dragover', stop); uiHost().addEventListener('drop', stop);

  // ---------- alerts ----------
  function clearAlerts() { alerts.replaceChildren(); }
  function showAlert(kind, content, focus) {
    const body = h('div', { style: 'min-width:0' });
    if (Array.isArray(content)) { body.append(h('strong', {}, content[0]), h('ul', {}, content.slice(1).map(t => h('li', {}, t)))); }
    else body.append(content);
    const el = h('div', { class: 'alert ' + kind, role: kind === 'err' ? 'alert' : 'status', tabindex: '-1' },
      icon(kind === 'err' || kind === 'warn' ? 'alert' : 'info'), body,
      h('button', { class: 'x', type: 'button', 'aria-label': 'Dismiss message', onclick: () => el.remove() }, icon('x')));
    alerts.append(el);
    if (focus) el.focus({ preventScroll: false });
    return el;
  }

  // ---------- adding files ----------
  async function addFiles(list) {
    if (S.phase === 'busy') return;
    clearAlerts();
    let incoming = [...list];
    if (!incoming.length) return;
    const problems = []; const good = [];
    if (!tool.multi && incoming.length > 1) { problems.push(`This tool works on one ${isPdf ? 'PDF' : 'image'} at a time, so only "${incoming[0].name}" was used.`); incoming = [incoming[0]]; }
    const cap = tool.multi ? (tool.maxFiles || (isPdf ? LIMITS.maxFiles : LIMITS.maxImages)) : 1;
    let total = S.files.reduce((n, f) => n + f.size, 0);
    const wasEmpty = !S.files.length;
    setBusyNote('Reading files…');
    for (const f of incoming) {
      if (tool.multi && S.files.length + good.length >= cap) { problems.push(`The limit is ${cap} ${isPdf ? 'PDFs' : 'images'} at once. "${f.name}" and any files after it were skipped.`); break; }
      if (!f.size) { problems.push(`"${f.name}" is empty.`); continue; }
      if (total + f.size > MAX_TOTAL) { problems.push(`"${f.name}" was skipped: the combined size is limited to ${fmtBytes(MAX_TOTAL)}.`); continue; }
      try {
        if (isPdf) {
          if (f.size > LIMITS.maxBytes) throw new AppError('size', `is ${fmtBytes(f.size)}. The limit is ${fmtBytes(LIMITS.maxBytes)} per PDF.`);
          if (!(await sniffPdfLoose(f))) throw new AppError('type', 'is not a PDF file.');
          const bytes = new Uint8Array(await f.arrayBuffer());
          const doc = await loadDoc(bytes);
          const n = doc.getPageCount();
          if (!n) throw new AppError('empty', 'has no pages.');
          if (n > LIMITS.maxPages) throw new AppError('pages', `has ${n} pages. The limit is ${LIMITS.maxPages} pages per PDF.`);
          good.push({ id: ++uid, name: f.name, size: f.size, bytes, pageCount: n });
        } else {
          const t = await sniff(f);
          if (t === 'heic') throw new AppError('type', 'is a HEIC photo, which browsers cannot read yet. Export it as JPG or PNG, then try again.');
          if (!['jpeg', 'png', 'webp', 'gif', 'bmp'].includes(t)) throw new AppError('type', 'is not a supported image. Use JPG, PNG, WebP, GIF or BMP.');
          if (f.size > LIMITS.maxImageBytes) throw new AppError('size', `is ${fmtBytes(f.size)}. The limit is ${fmtBytes(LIMITS.maxImageBytes)} per image.`);
          const info = await imageInfo(f, t);
          if (info && info.sw * info.sh > LIMITS.maxImagePixels) throw new AppError('size', `is ${dims(info.sw, info.sh)} pixels (${(info.sw * info.sh / 1e6).toFixed(0)} megapixels). The limit is ${LIMITS.maxImagePixels / 1e6} megapixels. Resize it first, then try again.`);
          const rec = { id: ++uid, name: f.name, size: f.size, file: f, type: t, url: URL.createObjectURL(f), info, w: info ? info.sw : 0, h: info ? info.sh : 0 };
          if (tool.inspect) { try { rec.extra = await tool.inspect(rec); } catch (e) { rec.extra = ''; } }
          good.push(rec);
        }
        total += f.size;
      } catch (e) {
        if (e instanceof AppError) problems.push(e.code === 'encrypted' || e.code === 'corrupt' ? `"${f.name}": ${e.message}` : e.message.startsWith('is ') || e.message.startsWith('has ') ? `"${f.name}" ${e.message}` : e.message);
        else problems.push(`"${f.name}" could not be read.`);
      }
    }
    clearBusyNote();
    if (good.length) {
      if (!tool.multi) { revoke(S.files); S.files = good.slice(0, 1); } else S.files.push(...good);
      emit('files_added', { tool: tool.id, count: good.length });
    }
    if (problems.length) showAlert('err', problems.length === 1 ? problems[0] : ['Some files could not be added:', ...problems]);
    if (!S.files.length) return drawEmpty();
    if (tool.view === 'pages' && (good.length || wasEmpty)) await setupPages();
    drawReady();
    if (good.length) announce(`${plural(good.length, 'file')} added.`);
    if (tool.autoRun && good.length && !isPdf) run();
  }
  function revoke(files) { files.forEach(f => f.url && URL.revokeObjectURL(f.url)); }
  let busyNote;
  function setBusyNote(t) { clearBusyNote(); busyNote = h('div', { class: 'alert info', role: 'status' }, h('span', { class: 'spin' }), t); alerts.append(busyNote); }
  function clearBusyNote() { if (busyNote) { busyNote.remove(); busyNote = null; } }

  // ---------- empty state ----------
  function drawEmpty() {
    S.phase = 'empty';
    const noun = isPdf ? (tool.multi ? 'PDFs' : 'PDF') : (tool.noun || (tool.multi ? 'images' : 'image'));
    const sheet = h('div', { class: 'sheet' },
      h('div', { class: 'ic' }, icon('upload')),
      h('h2', {}, `Drop your ${noun} here`),
      h('p', { class: 'hint' }, isPdf ? `or choose ${tool.multi ? 'files' : 'a file'} from your device. Up to ${fmtBytes(LIMITS.maxBytes)} and ${LIMITS.maxPages} pages per PDF.`
        : `or choose ${tool.multi ? 'files' : 'a file'} from your device. ${tool.hint || 'JPG, PNG, WebP, GIF or BMP'}, up to ${fmtBytes(LIMITS.maxImageBytes)} each${tool.multi && tool.maxFiles ? `, ${tool.maxFiles} at a time` : ''}.`),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: pick }, icon('upload'), `Choose ${noun}`),
      h('p', { class: 'privacy' }, icon('shield'), 'Processed in your browser. Your files are never uploaded.'));
    for (const ev of ['dragenter', 'dragover']) sheet.addEventListener(ev, e => { e.preventDefault(); sheet.classList.add('over'); });
    for (const ev of ['dragleave', 'drop']) sheet.addEventListener(ev, e => { e.preventDefault(); sheet.classList.remove('over'); });
    sheet.addEventListener('drop', e => addFiles(e.dataTransfer.files));
    stage.replaceChildren(sheet);
  }

  // ---------- ready state ----------
  let optsEl, statusEl, ctaBtn, listEl, countEl, panelApi;
  function drawReady() {
    S.phase = 'ready';
    const parts = [];
    panelApi = null;
    if (tool.view === 'list') parts.push(listPanel());
    else if (tool.view === 'single') parts.push(singlePanel());
    else parts.push(pagesPanel());
    if (tool.panel && !isPdf) { panelApi = tool.panel({ S, root, stage, refresh: () => refresh(), announce, alert: showAlert }); if (panelApi && panelApi.el) parts.push(panelApi.el); }
    const op = optionsPanel(); if (op) parts.push(op);
    statusEl = h('span', { class: 'status', 'aria-live': 'polite' });
    ctaBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: run }, icon(tool.ctaIcon || 'check'), '');
    ctaBtn.lastChild.textContent = '';
    const actions = h('div', { class: 'actions' }, statusEl, h('button', { class: 'btn btn-text', type: 'button', onclick: reset }, 'Start over'), ctaBtn);
    stage.replaceChildren(...parts, actions);
    refresh();
  }
  function refresh() {
    if (S.phase !== 'ready') return;
    const label = typeof tool.cta === 'function' ? tool.cta(S) : tool.cta;
    ctaBtn.replaceChildren(icon(tool.ctaIcon || 'check'), label);
    statusEl.textContent = tool.status ? tool.status(S) : '';
    if (optsEl) updateOptionVisibility();
    if (panelApi && panelApi.update) panelApi.update(S);
    if (countEl && tool.view === 'list') countEl.textContent = `Your ${isPdf ? 'PDFs' : 'images'} (${S.files.length})`;
  }
  function reset() {
    revoke(S.files); S.files = []; S.pages = []; S.doc = null; S.ext = {}; panelApi = null; clearAlerts();
    for (const o of tool.options || []) S.opts[o.key] = o.value;
    drawEmpty();
  }

  // ----- list view -----
  function listPanel() {
    countEl = h('h2', {}, '');
    listEl = h('ul', { class: 'files' });
    const addBtn = h('button', { class: 'btn btn-quiet btn-sm', type: 'button', onclick: pick }, icon('upload'), `Add more`);
    const noteText = tool.listNote !== undefined ? tool.listNote : 'Drag to reorder, or use the arrow buttons. Files are combined from top to bottom.';
    const note = tool.multi && noteText ? h('p', { class: 'muted', style: 'font-size:14px;margin:0 0 12px' }, noteText) : null;
    const el = h('section', { class: 'card panel', 'aria-label': 'Files' }, h('div', { class: 'tools-bar' }, countEl, h('span', { class: 'sp' }), addBtn), note, listEl);
    el.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    el.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
    renderList();
    return el;
  }
  let dragFrom = -1;
  function renderList(focusId, focusDir) {
    listEl.replaceChildren(...S.files.map((f, i) => {
      const last = i === S.files.length - 1;
      const lead = f.url ? h('img', { class: 'thumb', src: f.url, alt: '' }) : h('div', { class: 'fi' }, 'PDF');
      const meta = isPdf ? `${plural(f.pageCount, 'page')} · ${fmtBytes(f.size)}` : imgMeta(f);
      const canMove = tool.reorder !== false;
      const li = h('li', { class: 'file', draggable: canMove && S.files.length > 1 ? 'true' : false },
        lead,
        h('div', { style: 'min-width:0' }, h('div', { class: 'fn' }, canMove ? h('span', { class: 'order' }, i + 1) : null, f.name), h('div', { class: 'fm' }, meta)),
        h('div', { class: 'fa' },
          canMove ? h('button', { class: 'iconbtn', type: 'button', 'data-id': f.id, 'data-dir': 'up', disabled: i === 0, 'aria-label': `Move ${f.name} up`, onclick: () => move(i, i - 1, f.id, 'up') }, icon('up')) : null,
          canMove ? h('button', { class: 'iconbtn', type: 'button', 'data-id': f.id, 'data-dir': 'down', disabled: last, 'aria-label': `Move ${f.name} down`, onclick: () => move(i, i + 1, f.id, 'down') }, icon('down')) : null,
          h('button', { class: 'iconbtn', type: 'button', 'aria-label': `Remove ${f.name}`, onclick: () => remove(i) }, icon('x'))));
      if (canMove) li.addEventListener('dragstart', e => { dragFrom = i; li.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); });
      li.addEventListener('dragend', () => { li.classList.remove('drag'); dragFrom = -1; });
      li.addEventListener('dragover', e => { if (dragFrom >= 0) e.preventDefault(); });
      li.addEventListener('drop', e => { if (dragFrom >= 0) { e.preventDefault(); e.stopPropagation(); move(dragFrom, i, f.id); } });
      return li;
    }));
    if (focusId) { const b = listEl.querySelector(`[data-id="${focusId}"][data-dir="${focusDir}"]:not([disabled])`) || listEl.querySelector(`[data-id="${focusId}"]:not([disabled])`); if (b) b.focus(); }
  }
  // "1600 × 1200 · JPG · 245 KB" (+ what the tool found out about the file)
  function imgMeta(f) {
    const parts = [];
    if (f.w && f.h) parts.push(dims(f.w, f.h));
    parts.push(TYPE_LABEL[f.type] || '', fmtBytes(f.size));
    if (f.info && f.info.animated) parts.push(f.type === 'gif' ? 'animated, first frame only' : 'animated');
    if (f.extra) parts.push(f.extra);
    return parts.filter(Boolean).join(' · ');
  }
  function move(from, to, id, dir) {
    if (to < 0 || to >= S.files.length || from === to) return;
    const [f] = S.files.splice(from, 1); S.files.splice(to, 0, f);
    renderList(id, dir); refresh(); announce(`${f.name} moved to position ${to + 1} of ${S.files.length}.`);
  }
  function remove(i) {
    const [f] = S.files.splice(i, 1); revoke([f]);
    announce(`${f.name} removed.`);
    if (!S.files.length) return drawEmpty();
    renderList(); refresh();
  }

  // ----- single view -----
  function singlePanel() {
    const f = S.files[0];
    return h('section', { class: 'card panel', 'aria-label': 'Selected file' },
      h('div', { class: 'file' },
        isPdf ? h('div', { class: 'fi' }, 'PDF') : h('img', { class: 'thumb', src: f.url, alt: '' }),
        h('div', { style: 'min-width:0' }, h('div', { class: 'fn' }, f.name), h('div', { class: 'fm' }, isPdf ? `${plural(f.pageCount, 'page')} · ${fmtBytes(f.size)}` : imgMeta(f))),
        h('div', { class: 'fa' }, h('button', { class: 'btn btn-quiet btn-sm', type: 'button', onclick: pick }, 'Change file'))));
  }

  // ----- pages view -----
  async function setupPages() {
    const f = S.files[0];
    setBusyNote('Preparing page previews…');
    try { S.doc = await openRender(f.bytes); }
    catch (e) { clearBusyNote(); S.files = []; showAlert('err', e.message || 'This PDF could not be previewed.'); return; }
    clearBusyNote();
    S.pages = Array.from({ length: f.pageCount }, (_, i) => ({ i, rot: 0, sel: false, el: null, canvas: null, done: false }));
  }
  let io, thumbQueue = [], thumbBusy = false;
  function pagesPanel() {
    const f = S.files[0]; const mode = tool.pagesMode;
    const bar = h('div', { class: 'tools-bar' });
    const info = h('div', { style: 'min-width:0;margin-right:auto' }, h('div', { class: 'fn', style: 'font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, f.name), h('div', { class: 'muted', style: 'font-size:13.5px' }, `${plural(f.pageCount, 'page')} · ${fmtBytes(f.size)}`));
    bar.append(info);
    const qb = (label, ic, fn, cls = 'btn btn-quiet btn-sm') => h('button', { class: cls, type: 'button', onclick: fn }, ic ? icon(ic) : null, label);
    let rangeIn;
    if (mode === 'select' || mode === 'delete') {
      const verb = mode === 'select' ? 'keep' : 'delete';
      rangeIn = h('input', { class: 'field', type: 'text', id: 'rangeIn', inputmode: 'text', autocomplete: 'off', placeholder: 'e.g. 1-3, 5, 8-', 'aria-label': `Pages to ${verb}`, style: 'max-width:220px;min-height:38px' });
      rangeIn.addEventListener('input', () => {
        const v = rangeIn.value.trim();
        try { const set = new Set(v ? parseIndexes(v, S.pages.length) : []); S.pages.forEach(p => { p.sel = set.has(p.i); paintPage(p); }); rangeIn.classList.remove('invalid'); rangeErr.textContent = ''; }
        catch (e) { rangeIn.classList.add('invalid'); rangeErr.textContent = e.message; }
        refresh();
      });
      bar.append(h('label', { for: 'rangeIn', class: 'muted', style: 'font-size:14px;font-weight:600' }, `Pages to ${verb}:`), rangeIn,
        mode === 'select' ? qb('Select all', null, () => { S.pages.forEach(p => { p.sel = true; paintPage(p); }); syncRange(); }) : null,
        qb('Clear', null, () => { S.pages.forEach(p => { p.sel = false; paintPage(p); }); syncRange(); }));
    } else if (mode === 'rotate') {
      bar.append(qb('Rotate all left', 'rotl', () => rotAll(-90)), qb('Rotate all right', 'rotr', () => rotAll(90)), qb('Reset', null, () => { S.pages.forEach(p => { p.rot = 0; paintPage(p); }); refresh(); }));
    } else if (mode === 'reorder') {
      bar.append(qb('Reverse order', 'reorder', () => { S.pages.reverse(); layoutPages(); refresh(); announce('Page order reversed.'); }), qb('Reset order', null, () => { S.pages.sort((a, b) => a.i - b.i); layoutPages(); refresh(); announce('Original order restored.'); }));
    }
    const rangeErr = h('p', { class: 'err-t', role: 'alert', style: 'margin:-4px 0 10px' });
    function syncRange() { if (rangeIn) { rangeIn.value = toRanges(S.pages.filter(p => p.sel).map(p => p.i)); rangeIn.classList.remove('invalid'); rangeErr.textContent = ''; } refresh(); }
    S._syncRange = syncRange;
    const grid = h('ul', { class: 'pgrid', 'aria-label': 'Pages' });
    S._grid = grid;
    const hint = { select: 'Click pages to select them, or type a range.', delete: 'Click pages to mark them for removal, or type a range.', rotate: 'Rotate single pages with the buttons under each one.', reorder: 'Drag pages, or use the arrow buttons under each page.' }[mode];
    const panel = h('section', { class: 'card panel', 'aria-label': 'Pages' }, bar, rangeErr, h('p', { class: 'muted', style: 'font-size:14px;margin:0 0 12px' }, hint), grid);
    buildPages(mode);
    return panel;
  }
  function rotAll(d) { S.pages.forEach(p => { p.rot = ((p.rot + d) % 360 + 360) % 360; paintPage(p); }); refresh(); }
  function buildPages(mode) {
    if (io) io.disconnect(); thumbQueue = [];
    io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); thumbQueue.push(e.target._p); } pumpThumbs(); }, { rootMargin: '300px' });
    for (const p of S.pages) {
      const canvas = h('canvas', { 'aria-hidden': 'true', width: 1, height: 1 });
      p.canvas = canvas;
      const pv = h('div', { class: 'pv' }, canvas);
      const li = h('li', { class: 'pg' }); p.el = li; li._p = p;
      const label = h('div', { class: 'num' }, `Page ${p.i + 1}`);
      li.append(pv);
      if (mode === 'select' || mode === 'delete') {
        li.append(h('span', { class: 'tick' }, icon('check')));
        const hit = h('button', { class: 'hit', type: 'button', 'aria-pressed': 'false', 'aria-label': `Page ${p.i + 1}, ${mode === 'select' ? 'select' : 'mark for deletion'}`, onclick: () => { p.sel = !p.sel; paintPage(p); S._syncRange(); } });
        li.append(hit);
      }
      li.append(label);
      if (mode === 'rotate') li.append(h('div', { class: 'ctl' },
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': `Rotate page ${p.i + 1} left`, onclick: () => { p.rot = (p.rot + 270) % 360; paintPage(p); refresh(); } }, icon('rotl')),
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': `Rotate page ${p.i + 1} right`, onclick: () => { p.rot = (p.rot + 90) % 360; paintPage(p); refresh(); } }, icon('rotr'))));
      if (mode === 'reorder') {
        li.draggable = true;
        li.append(h('div', { class: 'ctl' },
          h('button', { class: 'iconbtn', type: 'button', 'data-k': 'l', 'aria-label': `Move page ${p.i + 1} earlier`, onclick: () => movePage(p, -1) }, icon('left')),
          h('button', { class: 'iconbtn', type: 'button', 'data-k': 'r', 'aria-label': `Move page ${p.i + 1} later`, onclick: () => movePage(p, 1) }, icon('right'))));
        li.addEventListener('dragstart', e => { pdrag = p; li.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(p.i)); });
        li.addEventListener('dragend', () => { li.classList.remove('drag'); pdrag = null; S.pages.forEach(q => q.el.classList.remove('over')); });
        li.addEventListener('dragover', e => { if (pdrag && pdrag !== p) { e.preventDefault(); li.classList.add('over'); } });
        li.addEventListener('dragleave', () => li.classList.remove('over'));
        li.addEventListener('drop', e => { e.preventDefault(); li.classList.remove('over'); if (pdrag && pdrag !== p) { const from = S.pages.indexOf(pdrag), to = S.pages.indexOf(p); S.pages.splice(to, 0, S.pages.splice(from, 1)[0]); layoutPages(); refresh(); announce(`Page ${pdrag.i + 1} moved to position ${to + 1}.`); } });
      }
      S._grid.append(li); io.observe(li);
    }
    layoutPages();
  }
  let pdrag = null;
  function layoutPages(focusP, k) {
    S.pages.forEach((p, idx) => {
      S._grid.append(p.el);
      const l = p.el.querySelector('[data-k="l"]'), r = p.el.querySelector('[data-k="r"]');
      if (l) l.disabled = idx === 0; if (r) r.disabled = idx === S.pages.length - 1;
      const num = p.el.querySelector('.num'); if (num) num.textContent = tool.pagesMode === 'reorder' && p.i !== idx ? `Page ${p.i + 1} → ${idx + 1}` : `Page ${p.i + 1}`;
    });
    if (focusP) { const b = focusP.el.querySelector(`[data-k="${k}"]:not([disabled])`) || focusP.el.querySelector('button:not([disabled])'); if (b) b.focus(); }
  }
  function movePage(p, d) {
    const from = S.pages.indexOf(p), to = from + d; if (to < 0 || to >= S.pages.length) return;
    S.pages.splice(to, 0, S.pages.splice(from, 1)[0]); layoutPages(p, d < 0 ? 'l' : 'r'); refresh(); announce(`Page ${p.i + 1} is now in position ${to + 1}.`);
  }
  function paintPage(p) {
    const mode = tool.pagesMode;
    p.el.classList.toggle('sel', p.sel && mode === 'select');
    p.el.classList.toggle('del', p.sel && mode === 'delete');
    const hit = p.el.querySelector('.hit'); if (hit) hit.setAttribute('aria-pressed', String(!!p.sel));
    fitThumb(p);
  }
  function fitThumb(p) {
    const c = p.canvas, pv = c.parentElement; if (!p.done) return;
    c.style.transform = '';
    if (p.rot) {
      const cw = c.clientWidth, ch = c.clientHeight, W = pv.clientWidth, H = pv.clientHeight;
      const rotated = p.rot % 180 !== 0;
      const k = rotated ? Math.min(1, W / ch, H / cw) : 1;
      c.style.transform = `rotate(${p.rot}deg) scale(${k})`;
    }
  }
  window.addEventListener('resize', () => S.pages.forEach(p => p.rot && fitThumb(p)));
  async function pumpThumbs() {
    if (thumbBusy) return; thumbBusy = true;
    try {
      while (thumbQueue.length) {
        const p = thumbQueue.shift(); if (p.done || !S.doc) continue;
        try {
          const page = await S.doc.getPage(p.i + 1); const w = page.getViewport({ scale: 1 }).width; page.cleanup();
          await renderPage(S.doc, p.i + 1, Math.min(2, 240 / w), p.canvas); p.done = true; fitThumb(p);
        } catch (e) { p.done = true; p.canvas.parentElement.append(h('span', { class: 'muted', style: 'font-size:12px;padding:6px' }, 'Preview unavailable')); }
        await tick();
      }
    } finally { thumbBusy = false; }
  }

  // ----- options -----
  function optionsPanel() {
    if (!tool.options || !tool.options.length) return null;
    optsEl = h('section', { class: 'card panel', 'aria-label': 'Options' }, h('h2', {}, 'Options'), h('div', { class: 'opts' }, tool.options.map(optionField)));
    return optsEl;
  }
  function optionField(o) {
    const id = 'o_' + o.key; let ctl;
    const set = v => { S.opts[o.key] = v; clearFieldErr(o.key); if (tool.onOpt) tool.onOpt(S, o.key, root); refresh(); };
    if (o.type === 'seg') {
      const help = h('p', { class: 'help', id: id + '_h' });
      const upd = () => { const c = o.choices.find(c => c.v === S.opts[o.key]); help.textContent = (c && c.d) || o.help || ''; };
      ctl = h('fieldset', { style: 'border:0;padding:0;margin:0;min-width:0' }, h('legend', { class: 't', style: 'padding:0' }, o.label),
        h('div', { class: 'seg' }, o.choices.map(c => h('label', {}, h('input', { type: 'radio', name: id, value: c.v, checked: S.opts[o.key] === c.v, onchange: () => { set(c.v); upd(); } }), h('span', {}, c.t)))), help);
      upd();
    } else if (o.type === 'range') {
      const fmt = o.format || (v => String(v));
      const out = h('output', { class: 'rg-v', for: id });
      const inp = h('input', { id, class: 'rg', type: 'range', min: o.min, max: o.max, step: o.step || 1, value: S.opts[o.key], 'aria-describedby': o.help ? id + '_h' : false });
      const sync = () => { const v = Number(inp.value); out.textContent = fmt(v); inp.setAttribute('aria-valuetext', fmt(v)); };
      inp.addEventListener('input', () => { sync(); set(Number(inp.value)); });
      sync();
      ctl = h('div', {}, h('label', { class: 't', for: id }, o.label), h('div', { class: 'rgrow flow-rg' }, inp, out), o.help ? h('p', { class: 'help', id: id + '_h' }, o.help) : null);
    } else if (o.type === 'color') {
      const inp = h('input', { id, class: 'colorin', type: 'color', value: S.opts[o.key] || '#ffffff', 'aria-describedby': o.help ? id + '_h' : false });
      const hex = h('code', { class: 'hexv' }, String(S.opts[o.key] || '#ffffff').toUpperCase());
      inp.addEventListener('input', () => { hex.textContent = inp.value.toUpperCase(); set(inp.value); });
      ctl = h('div', {}, h('label', { class: 't', for: id }, o.label), h('div', { class: 'colorrow' }, inp, hex), o.help ? h('p', { class: 'help', id: id + '_h' }, o.help) : null);
    } else if (o.type === 'check') {
      ctl = h('div', {}, h('label', { style: 'display:flex;gap:10px;align-items:center;font-weight:600;cursor:pointer;min-height:44px' }, h('input', { type: 'checkbox', id, style: 'width:20px;height:20px;accent-color:var(--blue)', checked: !!S.opts[o.key], 'aria-describedby': o.help ? id + '_h' : false, onchange: e => set(e.target.checked) }), o.label), o.help ? h('p', { class: 'help', id: id + '_h' }, o.help) : null);
    } else if (o.type === 'select') {
      ctl = h('div', {}, h('label', { class: 't', for: id }, o.label), h('select', { id, class: 'field', onchange: e => set(e.target.value) }, o.choices.map(c => h('option', { value: c.v, selected: S.opts[o.key] === c.v }, c.t))));
    } else {
      const inp = h('input', { id, class: 'field', type: o.type === 'number' ? 'number' : 'text', value: S.opts[o.key] ?? '', placeholder: o.placeholder, min: o.min, max: o.max, step: o.step, inputmode: o.type === 'number' ? 'numeric' : false, maxlength: o.maxlength, autocomplete: 'off', 'aria-describedby': id + '_e' });
      inp.addEventListener('input', () => set(o.type === 'number' ? (inp.value === '' ? '' : Number(inp.value)) : inp.value));
      ctl = h('div', {}, h('label', { class: 't', for: id }, o.label), o.suffix ? h('div', { class: 'affix' }, inp, h('span', { class: 'suf', 'aria-hidden': 'true' }, o.suffix)) : inp, o.help ? h('p', { class: 'help' }, o.help) : null);
    }
    const wrap = h('div', { class: 'opt', 'data-key': o.key }, ctl, h('p', { class: 'err-t', id: id + '_e', role: 'alert' }));
    wrap._o = o; return wrap;
  }
  function updateOptionVisibility() { optsEl.querySelectorAll('.opt').forEach(w => { const o = w._o; w.hidden = !!(o.showIf && !o.showIf(S.opts)); }); }
  function clearFieldErr(key) { const e = root.querySelector(`#o_${key}_e`); if (e) e.textContent = ''; const f = root.querySelector(`#o_${key}`); if (f) f.classList && f.classList.remove('invalid'); }
  function fieldErr(key, msg) {
    const e = root.querySelector(`#o_${key}_e`); const f = root.querySelector(`#o_${key}`) || root.querySelector(`[name="o_${key}"]`);
    if (e) e.textContent = msg; if (f) { f.classList && f.classList.add('invalid'); f.focus(); }
  }

  // ---------- run ----------
  async function run() {
    if (S.phase !== 'ready') return;
    clearAlerts();
    const v = tool.validate ? tool.validate(S) : null;
    if (v) { if (typeof v === 'string') showAlert('err', v, true); else { showAlert('err', v.msg); fieldErr(v.key, v.msg); } return; }
    S.phase = 'busy'; S.ac = new AbortController();
    const bar = h('div', { class: 'bar ind' }, h('i', {})); const lab = h('span', {}, 'Starting…'); const pct = h('span', {}, '');
    const cancel = h('button', { class: 'btn btn-quiet btn-sm', type: 'button', onclick: () => { S.ac.abort(); lab.textContent = 'Cancelling…'; } }, 'Cancel');
    const prog = h('section', { class: 'card panel progress', role: 'status', 'aria-label': 'Progress' }, h('div', { style: 'display:flex;align-items:center;gap:12px' }, h('strong', { style: 'flex:1' }, tool.working || 'Working on your file…'), cancel), h('div', { style: 'margin-top:14px' }, bar), h('div', { class: 'lab' }, lab, pct));
    stage.replaceChildren(prog); cancel.focus();
    emit('run_started', { tool: tool.id, files: S.files.length });
    const t0 = performance.now();
    const progress = (f, msg) => {
      if (msg) lab.textContent = msg;
      if (typeof f === 'number') { bar.classList.remove('ind'); bar.firstChild.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%'; pct.textContent = Math.round(f * 100) + '%'; }
    };
    try {
      await tick();
      try { await ensureLibs(); } catch (e) { /* reported by L() */ }
      const res = await tool.run({ files: S.files, opts: { ...S.opts }, pages: S.pages, ext: S.ext, progress, signal: S.ac.signal, baseName: S.files[0] ? S.files[0].name : 'document' });
      if (S.ac.signal.aborted) throw new Cancelled();
      emit('run_done', { tool: tool.id, outputs: (res.outputs || []).length, ms: Math.round(performance.now() - t0) });
      drawDone(res);
    } catch (e) {
      S.phase = 'ready';
      if (e instanceof Cancelled || (e && e.code === 'cancelled')) { drawReady(); showAlert('info', 'Cancelled. Your files are still here, so you can adjust the options and try again.'); return; }
      drawReady();
      let msg;
      if (e instanceof AppError) msg = e.message;
      else if (e instanceof RangeError || /memory|allocation/i.test(String(e && e.message))) msg = isPdf ? 'The browser ran out of memory. Try a smaller file, fewer pages, or a lower quality setting.' : 'The browser ran out of memory. Try a smaller image, fewer images at once, or a lower quality setting.';
      else msg = isPdf ? 'Something went wrong while processing this file. Try again, or try a different file. If it keeps happening, the PDF may be damaged.' : 'Something went wrong while processing this image. Try again, or try a different image. If it keeps happening, the file may be damaged.';
      emit('run_error', { tool: tool.id, code: (e && e.code) || 'unknown' });
      showAlert('err', msg, true);
      if (!(e instanceof AppError)) console.error(e);
    } finally { S.ac = null; }
  }

  // ---------- result ----------
  function drawDone(res) {
    S.phase = 'done';
    const outs = res.outputs || [];
    const urls = [];
    const mkUrl = o => { if (!o._url) { o._url = URL.createObjectURL(o.blob); urls.push(o._url); } return o._url; };
    const multi = outs.length > 1;
    const dl = (o, btnCls = 'btn btn-primary btn-sm') => h('button', { class: btnCls, type: 'button', 'aria-label': multi ? `Download ${o.name}` : false, onclick: () => { saveBlob(o.blob, o.name); emit('download', { tool: tool.id, count: 1 }); } }, icon('download'), 'Download');
    const rich = outs.some(o => o.preview || o.chip || o.note);
    const rowFor = o => {
      if (!rich) return h('li', { class: 'out' }, h('div', { class: 'fi', style: 'width:36px;height:36px;border-radius:9px;background:var(--blue-t);color:var(--blue);display:grid;place-items:center;font-weight:800;font-size:10px' }, (o.name.split('.').pop() || '').toUpperCase().slice(0, 4)),
        h('span', { class: 'fn' }, o.name), h('span', { class: 'fm' }, o.meta || fmtBytes(o.blob.size)), multi ? dl(o, 'btn btn-quiet btn-sm') : null);
      const lead = o.preview ? h('img', { class: 'thumb', src: mkUrl(o), alt: '' }) : h('div', { class: 'fi' }, (o.name.split('.').pop() || '').toUpperCase().slice(0, 4));
      return h('li', { class: 'out rich' }, lead,
        h('div', { class: 'ob' }, h('div', { class: 'fn' }, o.name), h('div', { class: 'fm' }, o.meta || fmtBytes(o.blob.size), o.chip ? h('span', { class: 'chip' + (o.chipKind ? ' ' + o.chipKind : '') }, o.chip) : null), o.note ? h('p', { class: 'onote' }, o.note) : null),
        multi ? dl(o, 'btn btn-quiet btn-sm') : null);
    };
    const list = outs.length ? h('ul', { class: 'outs' }, outs.slice(0, 60).map(rowFor)) : null;
    const cta = h('div', { class: 'cta' });
    if (res.noDownload || !outs.length) { /* result is a custom panel */ }
    else if (multi) {
      const zbtn = h('button', { class: 'btn btn-primary', type: 'button' }, icon('zip'), `Download all (${outs.length} files, ZIP)`);
      zbtn.addEventListener('click', async () => {
        zbtn.disabled = true; zbtn.replaceChildren(h('span', { class: 'spin' }), 'Creating ZIP…');
        try { const z = await zipOutputs(outs); saveBlob(z, (res.zipName || 'pdf-files') + '.zip'); emit('download', { tool: tool.id, count: outs.length }); }
        catch (e) { showAlert('err', 'The ZIP file could not be created. Try downloading the files one by one.'); }
        zbtn.disabled = false; zbtn.replaceChildren(icon('zip'), `Download all (${outs.length} files, ZIP)`);
      });
      cta.append(zbtn);
    } else {
      cta.append(h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { saveBlob(outs[0].blob, outs[0].name); emit('download', { tool: tool.id, count: 1 }); } }, icon('download'), tool.downloadLabel || 'Download'));
    }
    cta.append(h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => { urls.forEach(u => URL.revokeObjectURL(u)); if (res.cleanup) res.cleanup(); reset(); } }, res.again || 'Start over'));
    const fallback = !multi && outs.length && !res.noDownload && outs[0].blob.type ? h('p', { class: 'muted', style: 'font-size:13.5px;margin-top:14px' }, 'Download did not start? ', h('a', { href: mkUrl(outs[0]), target: '_blank', rel: 'noopener' }, 'Open the file in a new tab')) : null;
    const statsEl = res.stats && res.stats.length ? h('dl', { class: 'stats res-stats' }, res.stats.map(x => h('div', { class: 'stat' }, h('dt', {}, x.label), h('dd', {}, String(x.value), x.hint ? h('span', { class: 'sh' }, x.hint) : null)))) : null;
    const done = h('section', { class: 'card done', 'aria-labelledby': 'doneH', tabindex: '-1' },
      h('div', { class: 'ok' }, icon('check')),
      h('h2', { id: 'doneH' }, res.title || 'Your file is ready'),
      res.summary ? h('p', { class: 'muted', style: 'margin-top:6px' }, res.summary) : null,
      res.badge ? h('span', { class: 'saved' }, res.badge) : null,
      statsEl, res.panel || null,
      list, cta, fallback,
      h('p', { class: 'privacy', style: 'margin-top:18px' }, icon('shield'), 'Processed on your device. Nothing was uploaded.'));
    stage.replaceChildren(done);
    if (res.notes && res.notes.length) showAlert('info', res.notes.length === 1 ? res.notes[0] : ['Good to know:', ...res.notes]);
    done.focus(); announce(res.title || 'Your file is ready.');
    done.scrollIntoView({ block: 'nearest' });
  }
  async function zipOutputs(outs) {
    if (!window.fflate) throw new Error('zip');
    const files = {}; const seen = new Set();
    for (const o of outs) {
      let n = o.name, k = 1; while (seen.has(n)) { n = o.name.replace(/(\.[^.]*)?$/, `-${++k}$1`); } seen.add(n);
      files[n] = new Uint8Array(await o.blob.arrayBuffer());
    }
    const z = window.fflate.zipSync(files, { level: 0 });
    return new Blob([z], { type: 'application/zip' });
  }

  drawEmpty();
  return { addFiles, S };
}
