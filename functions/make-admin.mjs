/** Grant the admin custom claim. Requires GOOGLE_APPLICATION_CREDENTIALS or `gcloud auth application-default login`. */
import * as admin from 'firebase-admin';
const email = process.argv[2];
if (!email) { console.error('Usage: npm --prefix functions run make-admin -- admin@example.com'); process.exit(1); }
admin.initializeApp();
const user = await admin.auth().getUserByEmail(email);
await admin.auth().setCustomUserClaims(user.uid, { ...(user.customClaims || {}), admin: true });
console.log(`Admin claim set for ${email} (${user.uid}). Sign out and back in to refresh the ID token.`);
