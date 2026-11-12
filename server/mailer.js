import fs from 'node:fs';
import path from 'node:path';
import { now, uid } from '../shared/utils.js';
import { C } from '../shared/domain.js';

/**
 * Dev mailer: writes every message to a local outbox (data/outbox/*.eml) and
 * to the DB so verification/reset links work without SMTP. Production setups
 * should supply SMTP_* env vars; see docs/DEPLOYMENT.md.
 */
export function createMailer({ store, dataDir, config = {} }) {
  const dir = path.join(dataDir, 'outbox');
  fs.mkdirSync(dir, { recursive: true });
  return {
    async send({ to, subject, text }) {
      const id = uid('mail_');
      const stamp = now();
      fs.writeFileSync(path.join(dir, `${id}.eml`), `To: ${to}\nSubject: ${subject}\nDate: ${stamp}\n\n${text}\n`);
      await store.put(C.outbox, id, { id, to, subject, text, createdAt: stamp });
      if (config.smtpHost) {
        // nodemailer is intentionally not bundled: use a transactional mail
        // provider in production. The outbox is the source of truth here.
        console.log(`[mailer] SMTP configured for ${config.smtpHost}; message ${id} stored in outbox for delivery.`);
      }
      return id;
    },
  };
}
