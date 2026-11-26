// Native Wix custom element <pdf-toolkit-app>: renders the tools directly in the page (Shadow DOM, no iframe).
// Attributes: tool="<slug>" shows one tool; hub="1" shows the tool hub; base="https://www.ecomswiftllc.com/pdf-tools" sets link targets.
// The element sizes itself to its content (see fit): the Wix page grid follows, so there are no gaps and no inner scrollbar.
import { setRoot } from './core.js';
import { run } from './app.js';
import { setLibLoader } from './pdfx.js';
import RAW_CSS from '../css/toolkit.css';

const BASE = new URL('../', import.meta.url).href;
let cssPromise, libsPromise;

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => res(); s.onerror = () => rej(new Error('load ' + src));
    document.head.append(s);
  });
}
// Some sites ship an AMD loader (define.amd); the UMD libraries would register there instead of on window.
function loadLibs() {
  libsPromise ||= (async () => {
    const d = window.define; try { window.define = undefined; } catch (e) { /* ignore */ }
    try {
      await Promise.all([
        window.PDFLib ? 0 : loadScript(BASE + 'vendor/pdf-lib.min.js'),
        window.fflate ? 0 : loadScript(BASE + 'vendor/fflate.js')
      ]);
    } finally { try { window.define = d; } catch (e) { /* ignore */ } }
  })().catch(e => { libsPromise = null; throw e; });
  return libsPromise;
}
function loadCss() {
  cssPromise ||= Promise.resolve().then(() => {
    // the site font is loaded once for the whole page (the header and FAQ use the same link); falls back to the system font
    if (!document.getElementById('es-font')) {
      const f = document.createElement('link'); f.id = 'es-font'; f.rel = 'stylesheet';
      f.href = 'https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&display=swap'; document.head.append(f);
    }
    return RAW_CSS.replace(/:root\s*\{/, ':host{').replace(/^html\s*\{[^}]*\}/m, '').replace(/body\.embed\b/g, '.root.embed').replace(/^body\s*\{/m, '.root{');
  });
  return cssPromise;
}

// Make the Wix box that holds this element exactly as tall as the content, and let the page sections follow it.
function fit(el, root) {
  if (el._fit) el._fit.disconnect();
  const box = el.closest('[id^="comp-"]');
  if (!box || !('ResizeObserver' in window)) return;
  const apply = () => {
    if (!el.isConnected) return;
    const h = Math.ceil(root.getBoundingClientRect().height);
    if (h < 40) return;
    if (box.getBoundingClientRect().height !== h) box.style.setProperty('height', h + 'px', 'important');
    if (!el._free) {
      el._free = 1;
      for (let n = box.parentElement; n && n.tagName !== 'MAIN' && n.id !== 'masterPage'; n = n.parentElement) n.style.setProperty('min-height', '0', 'important');
      const sec = box.closest('section'); if (sec) sec.style.setProperty('height', 'auto', 'important');
    }
  };
  el._fit = new ResizeObserver(apply); el._fit.observe(root); apply();
}

let seq = 0;
export async function mount(el) {
  const mine = ++seq;
  setLibLoader(loadLibs);
  const css = await loadCss(); // the PDF libraries are NOT awaited: the hub never needs them, tool pages load them while the page draws
  if (mine !== seq || !el.isConnected) return;
  const root = el.shadowRoot || el.attachShadow({ mode: 'open' });
  const mode = el.getAttribute('tool') ? 'is-tool' : 'is-hub';
  root.innerHTML = '<style>:host{all:initial;display:block;width:100%}' + css + '</style>' +
    '<div class="root embed ' + mode + '"><main class="wrap"><header id="head" class="head"></header><div id="main"></div><div id="related"></div><div id="trust"></div></main>' +
    '<div id="live" class="sr" role="status" aria-live="polite"></div></div>';
  setRoot(root, el);
  run({ key: el.getAttribute('tool') || '', base: el.getAttribute('base') || '', embed: true, native: true });
  fit(el, root.querySelector('.root'));
  if (el.getAttribute('tool')) loadLibs().catch(() => { /* retried when a file is added */ });
}
