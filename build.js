// Builds js/element.bundle.js (single minified module for the Wix custom element). Run: node build.js
require('esbuild').build({entryPoints:['js/element.js'],bundle:true,minify:true,format:'esm',target:'es2020',loader:{'.css':'text'},outfile:'js/element.bundle.js',legalComments:'none',logLevel:'info'}).catch(()=>process.exit(1));
