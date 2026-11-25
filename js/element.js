// Native Wix custom element <pdf-toolkit-app>: renders the tools directly in the page (Shadow DOM, no iframe).
// Attributes: tool="<slug>" shows one tool; hub="1" shows the tool hub; base="https://www.ecomswiftllc.com/pdf-tools" sets link targets.
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
    const faces = [];
    const css = RAW_CSS.replace(/@font-face\s*\{[^}]*\}/g, m => { faces.push(m.replace(/url\("\.\.\//g, 'url("' + BASE)); return ''; });
    if (faces.length && !document.getElementById('pdf-toolkit-fonts')) { // @font-face does not work inside a shadow root
      const st = document.createElement('style'); st.id = 'pdf-toolkit-fonts'; st.textContent = faces.join(' '); document.head.append(st);
    }
    return css.replace(/:root\s*\{/, ':host{').replace(/^html\s*\{[^}]*\}/m, '').replace(/body\.embed\b/g, '.root.embed').replace(/^body\s*\{/m, '.root{');
  });
  return cssPromise;
}

let seq = 0;
export async function mount(el) {
  const mine = ++seq;
  setLibLoader(loadLibs);
  const css = await loadCss(); // the PDF libraries are NOT awaited: the hub never needs them, tool pages load them while the page draws
  if (mine !== seq || !el.isConnected) return;
  const root = el.shadowRoot || el.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>:host{all:initial;display:block;width:100%;height:100%;overflow:auto}' + css + '</style>' +
    '<div class="root embed"><main class="wrap"><header id="head" class="head"></header><div id="main"></div><div id="related"></div><div id="trust"></div></main>' +
    '<div id="live" class="sr" role="status" aria-live="polite"></div></div>';
  setRoot(root, el);
  run({ key: el.getAttribute('tool') || '', base: el.getAttribute('base') || '', embed: true, native: true });
  if (el.getAttribute('tool')) loadLibs().catch(() => { /* retried when a file is added */ });
}
