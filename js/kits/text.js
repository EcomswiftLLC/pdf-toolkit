// Text tools kit. Owner: text builder. Export TEXT_TOOLS.
// Every tool runs in the browser; nothing is uploaded. Logic lives in text-lib.js, UI in the text-*.js files.
import { registerIcons } from '../core.js';
import { COUNT_TOOLS } from './text-count.js';
import { TRANSFORM_TOOLS } from './text-transform.js';
import { FIND_TOOLS } from './text-find.js';
import { DIFF_TOOLS } from './text-diff.js';
import { GRAMMAR_TOOLS } from './text-grammar.js';
import { LOREM_TOOLS } from './text-lorem.js';

// 24px grid, 1.75 stroke, no fill (same family as the PDF toolkit icons)
registerIcons({
  wordcount: '<path d="M3 6h18"/><path d="M3 12h11"/><path d="M3 18h7"/><path d="m15 15 1.6 4 1.9-3.4 1.9 3.4 1.6-4"/>',
  charcount: '<path d="m4 19 5-14 5 14"/><path d="M5.8 14.5h6.4"/><path d="M19 6v13"/><path d="M17 6h4"/>',
  caseconv: '<path d="m3 18 4-11 4 11"/><path d="M4.6 14h6.8"/><circle cx="17" cy="15" r="3"/><path d="M20 12v6"/>',
  dedupe: '<path d="M4 6h10"/><path d="M4 12h8"/><path d="M4 18h5"/><path d="m15 11 5 5"/><path d="m20 11-5 5"/>',
  cleaner: '<path d="m5 15 8-8a2.1 2.1 0 0 1 3 0l2 2a2.1 2.1 0 0 1 0 3l-7 7H7z"/><path d="m10 10 5 5"/><path d="M11 20h9"/>',
  sortlines: '<path d="M4 6h7"/><path d="M4 12h5"/><path d="M4 18h3"/><path d="M17 5v14"/><path d="m13.5 15.5 3.5 3.5 3.5-3.5"/>',
  findreplace: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.9-4.9"/><path d="M8 9.2h5l-1.6-1.6"/><path d="M13 12H8l1.6 1.6"/>',
  compare: '<rect x="3" y="4" width="8" height="16" rx="2"/><rect x="13" y="4" width="8" height="16" rx="2"/><path d="M6 9h2"/><path d="M6 13h2"/><path d="M16 9h2"/><path d="M16 12v4"/><path d="M14.5 14h3"/>',
  lorem: '<path d="M17 4v16"/><path d="M13 4v16"/><path d="M17 4h-4.5a4 4 0 0 0 0 8H13"/>',
  grammar: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m9 15 2 2 4-4"/>',
  slug: '<path d="M9.5 14.5 14.5 9.5"/><path d="M11 6.5 12.4 5.1a4 4 0 0 1 5.7 5.7L16.7 12.2"/><path d="M13 17.5l-1.4 1.4a4 4 0 0 1-5.7-5.7L7.3 11.8"/>',
  reverse: '<path d="M4 8h13"/><path d="m13.5 4.5 3.5 3.5-3.5 3.5"/><path d="M20 16H7"/><path d="m10.5 12.5-3.5 3.5 3.5 3.5"/>',
});

export const TEXT_TOOLS = [
  ...COUNT_TOOLS,       // word-counter, character-counter
  ...TRANSFORM_TOOLS.slice(0, 1),   // case-converter
  ...TRANSFORM_TOOLS.slice(1, 2),   // remove-duplicate-lines
  ...TRANSFORM_TOOLS.slice(2, 3),   // text-cleaner
  ...TRANSFORM_TOOLS.slice(3, 4),   // sort-lines
  ...FIND_TOOLS,        // find-and-replace
  ...DIFF_TOOLS,        // text-compare
  ...LOREM_TOOLS,       // lorem-ipsum-generator
  ...GRAMMAR_TOOLS,     // grammar-style-checker
  ...TRANSFORM_TOOLS.slice(4),      // text-to-slug, reverse-text
];

// scope the kit's layout rules to its own tools
for (const t of TEXT_TOOLS) { const m = t.mount; t.mount = (c, ctx) => { c.classList.add('text-tool'); return m(c, ctx); }; }
