// All non-PDF tool kits. The PDF toolkit keeps its own list in tools.js (and its own Wix pages).
import { IMAGE_TOOLS } from './kits/image.js';
import { TEXT_TOOLS } from './kits/text.js';
import { CALC_TOOLS } from './kits/calc.js';
import { QR_TOOLS } from './kits/qr.js';

// label = the category chip and the data-cat value on cards
export const KITS = [
  { id: 'image', label: 'Images', title: 'Image tools', tools: IMAGE_TOOLS },
  { id: 'qr', label: 'QR codes', title: 'QR code tools', tools: QR_TOOLS },
  { id: 'text', label: 'Text', title: 'Text tools', tools: TEXT_TOOLS },
  { id: 'calc', label: 'Calculators', title: 'Calculators', tools: CALC_TOOLS },
];
for (const k of KITS) for (const t of k.tools) { t.kit = k.id; t.category = k.label; }
export const KIT_TOOLS = KITS.flatMap(k => k.tools);
