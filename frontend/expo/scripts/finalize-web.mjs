import { readFileSync, writeFileSync } from 'node:fs';
import { safariDocument } from './safari-document.mjs';
const file = new URL('../dist/index.html', import.meta.url);
writeFileSync(file, safariDocument(readFileSync(file, 'utf8')));
