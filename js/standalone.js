// Standalone / iframe entry: reads the URL and runs the app in the document.
import { run } from './app.js';
const q = new URLSearchParams(location.search);
run({ key: q.get('tool'), embed: q.get('embed') === '1', base: q.get('base') || '', native: false });
