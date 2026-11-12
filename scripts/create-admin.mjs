#!/usr/bin/env node
/** Create or reset the administrator account. Usage: npm run admin:create -- --email you@example.com --password '...' */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSqliteStore } from '../server/sqlite-store.js';
import { createLocalAuth } from '../server/local-auth.js';
import { C, getSettings } from '../shared/domain.js';
import { now } from '../shared/utils.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile?.(path.join(root, '.env')); } catch { /* optional */ }
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, arr) => {
  if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
  return acc;
}, []));
const email = args.email || process.env.ADMIN_EMAIL;
const password = args.password || process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 8) {
  console.error('Usage: npm run admin:create -- --email admin@example.com --password "at-least-8-chars"');
  process.exit(1);
}
const dataDir = path.resolve(root, process.env.DATA_DIR || './server/data');
const store = createSqliteStore({ file: path.join(dataDir, 'nexus.sqlite'), dataDir });
if (!(await store.get(C.settings, 'app'))) await store.put(C.settings, 'app', { ...(await getSettings(store)), updatedAt: now() });
const auth = createLocalAuth({ store, jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me-please-32-chars' });
const id = await auth.createAdmin({ email, password, displayName: args.name || 'Administrator' });
console.log(`Admin ready: ${email} (${id}). Keep the password out of the repository.`);
store.close();
