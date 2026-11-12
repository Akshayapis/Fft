/** Nexus Arena — self-hosted entry point (API + production web build on one origin). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { EventEmitter } from 'node:events';
import { createSqliteStore } from './sqlite-store.js';
import { createMailer } from './mailer.js';
import { createLocalStorage } from './local-storage.js';
import { createLocalAuth } from './local-auth.js';
import { createApp } from '../shared/app.js';
import { C, getSettings } from '../shared/domain.js';
import { now } from '../shared/utils.js';
import { runMatchReminders } from '../shared/reminders.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile?.(path.join(root, '.env')); } catch { /* .env is optional */ }

const DATA_DIR = path.resolve(root, process.env.DATA_DIR || './server/data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const PORT = Number(process.env.PORT || 3001);
const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production'
  ? (() => { throw new Error('JWT_SECRET must be set in production'); })()
  : 'dev-only-insecure-secret-change-me-please-32-chars');
const config = {
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  appUrl: process.env.APP_URL || '',
  smtpHost: process.env.SMTP_HOST || '',
  devTokens: process.env.DEV_SHOW_TOKENS === 'true' && process.env.NODE_ENV !== 'production',
  devOutbox: process.env.DEV_SHOW_TOKENS === 'true' && process.env.NODE_ENV !== 'production',
  firebase: null,
};

const store = createSqliteStore({ file: path.join(DATA_DIR, 'nexus.sqlite'), dataDir: DATA_DIR });
const mailer = createMailer({ store, dataDir: DATA_DIR, config });
const storage = createLocalStorage({ dataDir: DATA_DIR });
const auth = createLocalAuth({ store, jwtSecret, config });
const events = new EventEmitter();
events.setMaxListeners(0);

// Seed the single settings document (never invent Firebase credentials or secrets).
if (!(await store.get(C.settings, 'app'))) {
  await store.put(C.settings, 'app', { ...(await getSettings(store)), updatedAt: now() });
}

if (process.env.BOOTSTRAP_ADMIN_EMAIL && process.env.BOOTSTRAP_ADMIN_PASSWORD) {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
  const admins = (await store.list(C.users, { where: [{ field: 'role', op: '==', value: 'admin' }] }));
  if (!admins.length) {
    await auth.createAdmin({ email, password: process.env.BOOTSTRAP_ADMIN_PASSWORD });
    console.log(`[bootstrap] Admin created for ${email}. Remove BOOTSTRAP_ADMIN_* from the environment now.`);
  }
}

const app = createApp({ store, auth, mailer, storage, events, mode: 'local', config });

// Unguessable private upload URLs (no directory index). Cloud Storage rules applied in Firebase mode.
app.use('/uploads', (req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  next();
}, express.static(storage.root, { index: false, dotfiles: 'deny', fallthrough: false }));

const dist = path.join(root, 'dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist, { index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.type('html').send(`<!doctype html><html><body style="background:#05060f;color:#e6ebff;font:16px system-ui;padding:3rem"><h1>Nexus Arena API is running</h1><p>The web UI is not built yet. Run <code>npm run build</code> (or <code>npm run dev</code> for the Vite dev server).</p><p>Health: <a style="color:#8b5cf6" href="/api/health">/api/health</a></p></body></html>`));
}

// Match reminders: idempotent, 30 minutes before kick-off, checked every minute.
const reminderTimer = setInterval(() => {
  runMatchReminders(store, (userId) => events.emit('change', userId)).catch((e) => console.error('[reminders]', e));
}, 60_000);
reminderTimer.unref?.();

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[nexus] API listening on http://0.0.0.0:${PORT} (data: ${DATA_DIR})`);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { clearInterval(reminderTimer); server.close(() => { store.close(); process.exit(0); }); });
