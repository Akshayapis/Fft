/**
 * Nexus Arena — Firebase Cloud Functions backend.
 * The exact same API contract as the self-hosted server, backed by Firestore
 * transactions through the Admin SDK. All financial writes are server-side.
 */
import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { createFirestoreStore } from './firestore-store.js';
import { createFirebaseAuth } from './firebase-auth.js';
import { createApp } from './shared/app.js';
import { C, getSettings } from './shared/domain.js';
import { now } from './shared/utils.js';
import { runMatchReminders } from './shared/reminders.js';

if (!admin.apps.length) admin.initializeApp();
setGlobalOptions({ region: 'asia-south1', maxInstances: 20 });
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
const store = createFirestoreStore(db);
const auth = createFirebaseAuth({ store });

const mailer = {
  async send({ to, subject, _text }) {
    // Verification/reset emails are sent by Firebase Auth itself. This is a
    // placeholder for an approved transactional-email extension/provider.
    console.log(`[mailer] ${subject} → ${to}`);
    return 'firebase-auth';
  },
};

const boot = (async () => {
  if (!(await store.get(C.settings, 'app'))) {
    await store.put(C.settings, 'app', { ...(await getSettings(store)), updatedAt: now() });
  }
  return createApp({ store, auth, mailer, storage: null, events: null, mode: 'firebase', config: { firebase: {} } });
})();

export const api = onRequest({ cors: true, invoker: 'public', timeoutSeconds: 60 }, async (req, res) => {
  const app = await boot;
  return app(req, res);
});


/** Idempotent match reminders: 30 minutes before kick-off, every 15 minutes. */
export const matchReminders = onSchedule({ schedule: 'every 15 minutes', region: 'asia-south1', timeoutSeconds: 120 }, async () => {
  const result = await runMatchReminders(store);
  console.log(`[matchReminders] ${result.sent} notifications for ${result.matches} upcoming matches`);
});
