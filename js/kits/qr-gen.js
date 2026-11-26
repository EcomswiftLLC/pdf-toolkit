// QR code generator workbench (all types). mountGenerator(container, { start }) returns a cleanup function.
import { h, icon, panel, field, textarea, seg, check, range, row, note, announce, saveBlob, emit, uid, debounce } from '../ui.js';
import { TYPES, buildPayload, encode, scanRisks, normHex, contrastRatio, drawCanvas, toSvg, toPngBlob, cellSizeFor, prepareLogo, LEVELS } from './qr-core.js';

const ORDER = ['url', 'text', 'wifi', 'vcard', 'email', 'phone', 'sms'];
const FILE_NAMES = { url: 'link', text: 'text', wifi: 'wifi', vcard: 'contact', email: 'email', phone: 'phone', sms: 'sms' };
const PH = '+1 415 555 0123';

// One form per type. Each returns { el, controls: {key: fieldApi}, values() }.
function buildForms() {
  const mk = (o, kind = 'field') => (kind === 'area' ? textarea(o) : field(o));
  const forms = {};
  const form = (controls, extra = []) => {
    const el = h('div', { class: 'opts qr-form' }, ...extra.map(x => x.el || x));
    return { el, controls, values: () => Object.fromEntries(Object.entries(controls).map(([k, c]) => [k, c.get()])) };
  };

  { const c = { url: mk({ label: 'Web address', key: 'url', type: 'text', inputmode: 'url', placeholder: 'https://www.example.com', spellcheck: false, help: 'Paste the full address. If you leave out https://, we add it.' }) };
    forms.url = form(c, [c.url]); }
  { const c = { text: mk({ label: 'Text', key: 'text', rows: 5, placeholder: 'Type or paste any text', help: 'Anything you type is stored in the code as it is, including line breaks.' }, 'area') };
    forms.text = form(c, [c.text]); }
  { const sec = seg({ label: 'Security', value: 'WPA', choices: [{ v: 'WPA', t: 'WPA / WPA2 / WPA3', d: 'The right choice for almost every network.' }, { v: 'WEP', t: 'WEP', d: 'Old and weak. Only choose it if your router uses it.' }, { v: 'nopass', t: 'None', d: 'Open network with no password.' }] });
    const c = { ssid: field({ label: 'Network name (SSID)', key: 'ssid', placeholder: 'My home Wi-Fi', spellcheck: false, autocomplete: 'off' }),
      security: sec,
      password: field({ label: 'Password', key: 'password', type: 'password', autocomplete: 'new-password', spellcheck: false, help: 'The password is stored in the code as plain text. Anyone who scans it can read it.' }),
      hidden: check({ label: 'Hidden network (the name is not broadcast)' }) };
    const show = check({ label: 'Show password', onInput: v => { c.password.input.type = v ? 'text' : 'password'; } });
    const f = form(c, [c.ssid, sec, c.password, show, c.hidden]);
    const sync = () => { const none = sec.get() === 'nopass'; c.password.el.hidden = none; show.el.hidden = none; };
    sec.el.addEventListener('change', sync); sync();
    f.afterShow = sync;
    forms.wifi = f; }
  { const c = {
      first: mk({ label: 'First name', key: 'first', autocomplete: 'off' }), last: mk({ label: 'Last name', key: 'last', autocomplete: 'off' }),
      org: mk({ label: 'Organization', key: 'org' }), title: mk({ label: 'Job title', key: 'title' }),
      mobile: mk({ label: 'Mobile phone', key: 'mobile', type: 'tel', placeholder: PH }), work: mk({ label: 'Work phone', key: 'work', type: 'tel' }),
      email: mk({ label: 'Email', key: 'email', type: 'email', spellcheck: false }), site: mk({ label: 'Website', key: 'site', inputmode: 'url', spellcheck: false, placeholder: 'https://www.example.com' }),
      street: mk({ label: 'Street address', key: 'street' }), city: mk({ label: 'City', key: 'city' }), region: mk({ label: 'State or region', key: 'region' }),
      zip: mk({ label: 'Postal code', key: 'zip' }), country: mk({ label: 'Country', key: 'country' }) };
    forms.vcard = form(c, [row(c.first, c.last), row(c.org, c.title), row(c.mobile, c.work), row(c.email, c.site), c.street, row(c.city, c.region), row(c.zip, c.country)]); }
  { const c = { to: mk({ label: 'Send to', key: 'to', type: 'text', inputmode: 'email', placeholder: 'name@example.com', spellcheck: false, help: 'Add several addresses by separating them with commas.' }),
      subject: mk({ label: 'Subject (optional)', key: 'subject' }), body: mk({ label: 'Message (optional)', key: 'body', rows: 4 }, 'area') };
    forms.email = form(c, [c.to, c.subject, c.body]); }
  { const c = { number: mk({ label: 'Phone number', key: 'number', type: 'tel', placeholder: PH, help: 'Start with + and the country code so it dials from anywhere.' }) };
    forms.phone = form(c, [c.number]); }
  { const fmt = seg({ label: 'Code format', value: 'smsto', choices: [{ v: 'smsto', t: 'SMSTO', d: 'Read by most Android scanners and many other apps. Some iPhone cameras may not open it.' }, { v: 'sms', t: 'sms:', d: 'The standard sms: link. Try this if SMSTO does not open on a phone.' }] });
    const c = { number: mk({ label: 'Send to (phone number)', key: 'number', type: 'tel', placeholder: PH, help: 'Start with + and the country code.' }), message: mk({ label: 'Message (optional)', key: 'message', rows: 4 }, 'area'), format: fmt };
    forms.sms = form(c, [c.number, c.message, fmt]); }
  return forms;
}

export function mountGenerator(container, { start = 'url' } = {}) {
  const forms = buildForms();
  const gid = uid('qrg');
  let type = ORDER.includes(start) ? start : 'url';
  let model = null, ready = false, risks = [], riskKey = '', ack = false, logo = null, userLevel = 'M';

  // ---- type tabs (ARIA tab pattern, automatic activation) ----
  const tabEls = {}, panelEls = {};
  const tablist = h('div', { class: 'qr-tabs', role: 'tablist', 'aria-label': 'What the code holds' });
  const panels = h('div', { class: 'qr-panels' });
  for (const t of ORDER) {
    const b = h('button', { type: 'button', role: 'tab', class: 'qr-tab', id: `${gid}-tab-${t}`, 'aria-controls': `${gid}-pn-${t}`, 'aria-selected': 'false', tabindex: '-1' }, TYPES[t].label);
    b.addEventListener('click', () => select(t, false));
    tabEls[t] = b; tablist.append(b);
    const p = h('div', { role: 'tabpanel', id: `${gid}-pn-${t}`, 'aria-labelledby': `${gid}-tab-${t}`, hidden: true }, forms[t].el);
    panelEls[t] = p; panels.append(p);
  }
  tablist.addEventListener('keydown', e => {
    const i = ORDER.indexOf(type); let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % ORDER.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i + ORDER.length - 1) % ORDER.length;
    else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = ORDER.length - 1;
    if (j < 0) return;
    e.preventDefault(); select(ORDER[j], true);
  });
  function select(t, focus) {
    type = t;
    for (const k of ORDER) {
      const on = k === t;
      tabEls[k].setAttribute('aria-selected', String(on)); tabEls[k].tabIndex = on ? 0 : -1; panelEls[k].hidden = !on;
    }
    if (focus) tabEls[t].focus();
    if (forms[t].afterShow) forms[t].afterShow();
    update();
  }

  const content = panel('Content', tablist, panels);
  content.classList.add('qr-p-content');

  // ---- design controls ----
  const colorField = (label, id, value) => {
    const picker = h('input', { type: 'color', id, class: 'qr-swatch', value });
    const hex = h('input', { type: 'text', class: 'field qr-hex', value, maxlength: '7', spellcheck: 'false', autocomplete: 'off', 'aria-label': `${label} as a hex value`, inputmode: 'text' });
    const err = h('p', { class: 'err-t', role: 'alert' });
    const el = h('div', { class: 'opt lt-field' }, h('label', { class: 't', for: id }, label), h('div', { class: 'qr-color' }, picker, hex), err);
    let cur = value;
    picker.addEventListener('input', () => { cur = picker.value; hex.value = cur; hex.classList.remove('invalid'); err.textContent = ''; });
    hex.addEventListener('input', () => { const n = normHex(hex.value); if (n) { cur = n; picker.value = n; hex.classList.remove('invalid'); hex.removeAttribute('aria-invalid'); err.textContent = ''; } else { hex.classList.add('invalid'); hex.setAttribute('aria-invalid', 'true'); err.textContent = 'Enter a color like #1B2342.'; } });
    hex.addEventListener('blur', () => { hex.value = cur; hex.classList.remove('invalid'); hex.removeAttribute('aria-invalid'); err.textContent = ''; });
    return { el, get: () => cur };
  };
  const fgC = colorField('Code color', `${gid}-fg`, '#000000');
  const bgC = colorField('Background color', `${gid}-bg`, '#ffffff');
  const contrastLine = h('p', { class: 'help qr-contrast' });
  const styleSeg = seg({ label: 'Style', value: 'square', choices: [
    { v: 'square', t: 'Square', d: 'Classic squares. The most reliable choice.' },
    { v: 'rounded', t: 'Rounded', d: 'Softer corners. The three large corner squares stay recognizable.' },
    { v: 'dots', t: 'Dots', d: 'Round dots. Test the scan, and use correction level Q or H.' }] });
  const ecSeg = seg({ label: 'Error correction', value: 'M', choices: [
    { v: 'L', t: 'L · 7%', d: 'Level L: smallest, simplest code. Best for clean screens and short links.' },
    { v: 'M', t: 'M · 15%', d: 'Level M: a good balance for most uses.' },
    { v: 'Q', t: 'Q · 25%', d: 'Level Q: copes with more wear, folds and smudges. Makes the code denser.' },
    { v: 'H', t: 'H · 30%', d: 'Level H: the most forgiving and the densest. Needed for a logo.' }] });
  ecSeg.el.querySelectorAll('input').forEach(i => i.addEventListener('change', () => { if (!logo) userLevel = ecSeg.get(); }));
  const ecNote = h('p', { class: 'help qr-ecnote', hidden: true }, 'Set to level H because a logo covers part of the code. Remove the logo to choose another level.');
  const marginR = range({ label: 'Empty border (quiet zone)', min: 0, max: 10, value: 4, format: v => `${v} ${v === 1 ? 'square' : 'squares'}`, help: 'A clear border around the code. The standard asks for at least 4 squares.' });
  const sizeR = range({ label: 'Image size', min: 256, max: 2048, step: 64, value: 1024, format: v => `${v} px`, help: 'Size of the PNG. The SVG file scales to any size.' });
  const logoInput = h('input', { type: 'file', id: `${gid}-logo`, class: 'qr-file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml' });
  const logoErr = h('p', { class: 'err-t', role: 'alert' });
  const logoClear = h('button', { type: 'button', class: 'btn btn-quiet btn-sm', hidden: true }, icon('x', 'sm'), 'Remove logo');
  const logoEl = h('div', { class: 'opt lt-field' }, h('label', { class: 't', for: `${gid}-logo` }, 'Center logo (optional)'), h('div', { class: 'qr-logo-row' }, logoInput, logoClear),
    h('p', { class: 'help' }, 'The picture stays on your device. It is shrunk to about a fifth of the code width, and the correction level is set to H so the code still scans.'), logoErr);
  logoInput.addEventListener('change', async () => {
    logoErr.textContent = '';
    const f = logoInput.files && logoInput.files[0]; if (!f) return;
    try { logo = await prepareLogo(f); } catch (e) { logo = null; logoInput.value = ''; logoErr.textContent = e.message; }
    applyLogoState(); update();
  });
  logoClear.addEventListener('click', () => { logo = null; logoInput.value = ''; logoErr.textContent = ''; applyLogoState(); update(); logoInput.focus(); });
  function applyLogoState() {
    const on = !!logo;
    ecSeg.el.querySelectorAll('input').forEach(i => { i.disabled = on; });
    if (on) ecSeg.set('H'); else ecSeg.set(userLevel);
    ecNote.hidden = !on; logoClear.hidden = !on;
  }
  const design = panel('Design', h('div', { class: 'opts' }, row(fgC, bgC), contrastLine, styleSeg.el, ecSeg.el, ecNote, marginR.el, sizeR.el, logoEl));
  design.classList.add('qr-p-design');

  // ---- preview ----
  const canvas = h('canvas', { class: 'qr-canvas', role: 'img', 'aria-label': 'Preview of your QR code. Scan it with your phone to test it.', hidden: true });
  const holder = h('div', { class: 'qr-holder' }, icon('qr'), h('p', { class: 'qr-holder-t' }));
  const stage = h('div', { class: 'qr-stage' }, canvas, holder);
  const state = h('p', { class: 'qr-state', 'aria-live': 'polite' });
  const issue = h('div', { class: 'qr-issue', role: 'alert' });
  const warns = h('div', { class: 'qr-warns' });
  const mkBtn = (cls, ic, label) => h('button', { type: 'button', class: cls, 'aria-disabled': 'true' }, icon(ic, cls.includes('sm') ? 'sm' : ''), label);
  const bPng = mkBtn('btn btn-primary', 'download', 'Download PNG');
  const bSvg = mkBtn('btn btn-quiet', 'download', 'Download SVG');
  const canCopy = !!(navigator.clipboard && window.ClipboardItem && navigator.clipboard.write);
  const bCopy = canCopy ? mkBtn('btn btn-quiet', 'copy', 'Copy image') : null;
  const actions = h('div', { class: 'qr-actions' }, bPng, bSvg, bCopy);
  const fine = h('p', { class: 'lt-note qr-fine' }, 'This is a static code. The content is stored in the code itself, so it never expires, is never tracked and does not pass through our servers.');
  const preview = panel('Your QR code', stage, state, issue, warns, actions, fine);
  preview.classList.add('qr-p-preview');

  const grid = h('div', { class: 'qr-grid' }, content, design, preview);
  container.replaceChildren(grid);

  // ---- state -> UI ----
  function setActions(on) { for (const b of [bPng, bSvg, bCopy]) if (b) b.setAttribute('aria-disabled', on ? 'false' : 'true'); }
  function gateOpen() { return risks.length === 0 || ack; }

  function showEmpty(msg) {
    model = null; ready = false; risks = []; riskKey = '';
    canvas.hidden = true; holder.hidden = false; holder.querySelector('.qr-holder-t').textContent = msg;
    state.textContent = ''; issue.replaceChildren(); warns.replaceChildren(); setActions(false);
  }

  function renderRisks(list, notes) {
    const key = list.map(r => r.id).join('|');
    if (key !== riskKey) { riskKey = key; ack = false; }
    warns.replaceChildren();
    for (const t of notes) warns.append(note(t, 'info'));
    if (list.length) {
      const box = h('div', { class: 'alert warn qr-risk', role: 'group', 'aria-label': 'Scan warnings' }, icon('alert'), h('div', { style: 'min-width:0' },
        h('p', { class: 'qr-risk-t' }, 'This code may be hard to scan'),
        h('ul', {}, list.map(r => h('li', {}, r.text)))));
      const ak = check({ label: 'I understand it may not scan. Let me download it anyway.', value: ack, onInput: v => { ack = v; setActions(ready && gateOpen()); announce(v ? 'Downloads are available.' : 'Downloads are blocked until you confirm.'); } });
      ak.el.classList.add('qr-ack');
      box.lastChild.append(ak.el);
      warns.append(box);
    }
  }

  function update() {
    const form = forms[type];
    const b = buildPayload(type, form.values());
    for (const [k, c] of Object.entries(form.controls)) if (typeof c.error === 'function') c.error(b.errors[k] || '');
    issue.replaceChildren();
    if (b.status === 'empty') { showEmpty(TYPES[type].empty); updateContrastLine(); return; }
    if (b.status === 'invalid') { showEmpty('Fix the highlighted field and your code will appear here.'); updateContrastLine(); return; }
    const level = logo ? 'H' : ecSeg.get();
    const e = encode(b.payload, level, logo ? 3 : 1);
    if (!e.ok) {
      showEmpty('This content does not fit in a QR code at these settings.');
      const n = e.fits.length;
      let msg;
      if (logo && n === 0 || logo && !e.fits.includes('H')) msg = `This is too long for a code with a logo, which needs level H (at most about ${e.max.toLocaleString('en-US')} bytes). Remove the logo or shorten the content.`;
      else if (n) msg = `This is too long for correction level ${level}. It fits at level ${e.fits[n - 1]} or lower. Choose a lower level or shorten the content.`;
      else msg = `This is ${e.bytes.toLocaleString('en-US')} bytes, which is more than a QR code can hold (about 2,953 bytes at the lowest level). Shorten the content.`;
      issue.append(h('div', { class: 'alert err' }, icon('alert'), h('div', { style: 'min-width:0' }, msg)));
      updateContrastLine(); return;
    }
    const fg = fgC.get(), bg = bgC.get(), margin = marginR.get(), size = sizeR.get();
    model = { n: e.n, mat: e.mat, style: styleSeg.get(), fg, bg, margin, logo };
    const M = e.n + 2 * margin;
    const cell = Math.max(2, Math.ceil(380 / M));
    drawCanvas(canvas, model, cell * M);
    canvas.hidden = false; holder.hidden = true;
    const sr = scanRisks({ fg, bg, margin });
    risks = sr.risks; ready = true;
    const notes = [...b.notes];
    const px = cellSizeFor(model, size);
    if (e.n > 57) notes.push(`This is a dense code (${e.n} × ${e.n} squares). Print it larger and test the scan. Shorter content makes a simpler code that is easier to read.`);
    if (px < 4) notes.push(`At ${size} px each square is only ${px} px wide. Raise the image size so phones can read it on a screen.`);
    renderRisks(risks, notes);
    state.textContent = `Ready. Version ${e.version}, ${e.n} × ${e.n} squares, level ${e.level}.`;
    setActions(gateOpen());
    updateContrastLine(sr);
  }
  function updateContrastLine(sr) {
    const r = sr ? sr.ratio : contrastRatio(fgC.get(), bgC.get());
    contrastLine.textContent = `Contrast ${r.toFixed(1)}:1. ${r >= 7 ? 'Very good for scanning.' : r >= 3 ? 'Good enough for scanning.' : 'Too low to scan reliably.'}`;
  }

  // ---- downloads ----
  const name = ext => `qr-code-${FILE_NAMES[type]}.${ext}`;
  function guard(kind) {
    update();
    if (!ready || !model) { announce('Enter your content first, then download.'); return false; }
    if (!gateOpen()) { announce('This code may not scan. Tick the box under the warning to download anyway.'); const cb = warns.querySelector('input[type=checkbox]'); if (cb) cb.focus(); return false; }
    return true;
  }
  bPng.addEventListener('click', async () => {
    if (!guard()) return;
    try { saveBlob(await toPngBlob(model, sizeR.get()), name('png')); emit('download', { count: 1 }); announce('PNG downloaded.'); } catch (e) { announce('Could not create the PNG. Try a smaller size.'); }
  });
  bSvg.addEventListener('click', () => {
    if (!guard()) return;
    saveBlob(new Blob([toSvg(model, sizeR.get())], { type: 'image/svg+xml;charset=utf-8' }), name('svg')); emit('download', { count: 1 }); announce('SVG downloaded.');
  });
  if (bCopy) bCopy.addEventListener('click', async () => {
    if (!guard()) return;
    const label = bCopy.lastChild;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': toPngBlob(model, sizeR.get()) })]);
      label.textContent = 'Copied'; announce('Image copied to the clipboard.');
    } catch (e) { label.textContent = 'Copy failed'; announce('Could not copy the image. Download the PNG instead.'); }
    setTimeout(() => { label.textContent = 'Copy image'; }, 1800);
  });

  const schedule = debounce(update, 90);
  const onAny = () => schedule();
  grid.addEventListener('input', onAny); grid.addEventListener('change', onAny);
  select(type, false);
  return () => { grid.removeEventListener('input', onAny); grid.removeEventListener('change', onAny); };
}
