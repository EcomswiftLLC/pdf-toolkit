// Native Wix custom element <pdf-toolkit-app>: renders the tools directly in the page (Shadow DOM, no iframe).
// Attributes: tool="<slug>" shows one tool; hub="1" shows the tool hub; base="https://www.ecomswiftllc.com/pdf-tools" sets link targets.
import { setRoot } from './core.js';
import { run } from './app.js';

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
      if (!window.PDFLib) await loadScript(BASE + 'vendor/pdf-lib.min.js');
      if (!window.fflate) await loadScript(BASE + 'vendor/fflate.js');
    } finally { try { window.define = d; } catch (e) { /* ignore */ } }
  })();
  return libsPromise;
}
function loadCss() {
  cssPromise ||= fetch(BASE + 'css/toolkit.css').then(r => { if (!r.ok) throw new Error('css'); return r.text(); }).then(css => {
    const faces = [];
    css = css.replace(/@font-face\s*\{[^}]*\}/g, m => { faces.push(m.replace(/url\("\.\.\//g, 'url("' + BASE)); return ''; });
    if (faces.length && !document.getElementById('pdf-toolkit-fonts')) { // @font-face does not work inside a shadow root
      const st = document.createElement('style'); st.id = 'pdf-toolkit-fonts'; st.textContent = faces.join('\n'); document.head.append(st);
    }
    return css.replace(/:root\s*\{/, ':host{').replace(/^html\s*\{[^}]*\}/m, '').replace(/body\.embed\b/g, '.root.embed').replace(/^body\s*\{/m, '.root{');
  });
  return cssPromise;
}

let seq = 0;
export async function mount(el) {
  const mine = ++seq;
  const [css] = await Promise.all([loadCss(), loadLibs()]);
  if (mine !== seq || !el.isConnected) return;
  const root = el.shadowRoot || el.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>:host{all:initial;display:block;width:100%}' + css + '</style>' +
    '<div class="root embed"><main class="wrap"><header id="head" class="head"></header><div id="main"></div><div id="related"></div><div id="trust"></div></main>' +
    '<div id="live" class="sr" role="status" aria-live="polite"></div></div>';
  setRoot(root, el);
  run({ key: el.getAttribute('tool') || '', base: el.getAttribute('base') || '', embed: true, native: true });
}
