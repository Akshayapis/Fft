/** Copy the shared business logic into the deployable functions directory. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(dir, '..', 'shared');
const dst = path.join(dir, 'shared');
fs.mkdirSync(dst, { recursive: true });
for (const f of fs.readdirSync(src).filter((f) => f.endsWith('.js'))) {
  fs.copyFileSync(path.join(src, f), path.join(dst, f));
}
console.log(`[functions] shared logic copied: ${fs.readdirSync(dst).join(', ')}`);
