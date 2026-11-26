// Builds two single-file modules for the Wix custom element. Run: node build.js
//  js/element.bundle.js      PDF tools only (small; used by /pdf-tools pages)
//  js/element.all.bundle.js  PDF + image, QR, text and calculator kits (used by /online-tools pages)
const esbuild = require('esbuild'), path = require('path');
const common = { entryPoints: ['js/element.js'], bundle: true, minify: true, format: 'esm', target: 'es2020', loader: { '.css': 'text' }, legalComments: 'none', logLevel: 'info' };
// In the PDF-only build the kit registry and the kit stylesheets are replaced by empty stand-ins.
const noKits = { name: 'no-kits', setup(b) {
  b.onResolve({ filter: /\/registry\.js$/ }, () => ({ path: 'registry-stub', namespace: 'stub' }));
  b.onResolve({ filter: /kit-[a-z]+\.css$/ }, a => ({ path: a.path, namespace: 'stubcss' }));
  b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const KITS = [], KIT_TOOLS = [];', loader: 'js' }));
  b.onLoad({ filter: /.*/, namespace: 'stubcss' }, () => ({ contents: '', loader: 'text' }));
} };
Promise.all([
  esbuild.build({ ...common, outfile: 'js/element.bundle.js', plugins: [noKits] }),
  esbuild.build({ ...common, outfile: 'js/element.all.bundle.js' }),
]).catch(() => process.exit(1));
