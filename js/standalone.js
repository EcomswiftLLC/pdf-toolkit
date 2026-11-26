// Standalone / iframe entry: reads the URL and runs the app in the document.
import { run } from './app.js';
const q = new URLSearchParams(location.search);
run({ key: q.get('tool'), hub: q.get('hub') || '', embed: q.get('embed') === '1', base: q.get('base') || '', native: false });
