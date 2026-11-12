# Firebase setup (optional production backend)

The repository ships **no Firebase credentials**. Supply your own project's values. If `VITE_BACKEND=firebase` is set but the config is incomplete, the app shows a clear setup screen instead of pretending to be connected.

## 1. Create a Firebase project

Enable **Authentication** (Email/Password; Google only if you want it), **Cloud Firestore**, **Cloud Storage**, and **Cloud Functions** (Blaze plan is required for outbound networking in Functions). Choose a region (the functions default to `asia-south1` — change it in `functions/index.js` and `firebase.json` if needed).

## 2. Environment

Copy `.env.example` to `.env` and fill in:

```
VITE_BACKEND=firebase
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_API_BASE_URL=            # empty when using Firebase Hosting rewrites
```

`VITE_API_BASE_URL` may also be the Cloud Functions **origin** (e.g. `https://asia-south1-your-project.cloudfunctions.net`); the shared Express app mounts routes both at `/api/*` and at the root, so either Hosting rewrites or direct function URLs work.

## 3. Deploy the trusted backend

```bash
npm install
npm --prefix functions install
npm run build:functions      # copies shared/ logic into functions/shared/ (gitignored)
firebase login
firebase use --add           # creates .firebaserc with YOUR project id (gitignored)
npm run deploy:firebase
firebase deploy --only hosting
```

`firestore.rules` denies all client writes to wallets, transactions, deposits, withdrawals, registrations, results, rooms, settings and logs. Cloud Functions use the Admin SDK, which bypasses rules but performs its own authorization and validation. `storage.rules` limits uploads to the signed-in user's own path, 3 MB, image types only.

## 4. Create the first admin

Firebase Auth handles registration, login, password reset, email verification and Google sign-in in the browser. Grant the admin custom claim **server-side**:

```bash
gcloud auth application-default login
npm --prefix functions run make-admin -- admin@example.com
```

The admin must sign out and back in to refresh the ID token. Use `/admin/login` — it verifies the `admin` claim before granting access.

## 5. First launch checklist

- `firebase emulators:start` works locally (optional)
- `/api/health` returns `{"backend":"firebase"}`
- Registration creates a user + profile + wallet at zero balance
- Admin can create a tournament; joining writes one ledger entry
- Room credentials are unreadable directly in Firestore console by clients
- Storage upload works for the signed-in user and is denied for others
- Real-money mode remains off until legal/payment verification in Admin → Settings

## 6. Emails

Firebase Auth sends verification and password-reset emails itself. For other transactional mail, connect an approved email extension/provider — `functions/index.js` contains a deliberately explicit mailer stub that logs instead of inventing SMTP credentials.
