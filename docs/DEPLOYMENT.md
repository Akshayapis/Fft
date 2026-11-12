# Deployment

## Self-hosted (recommended for a first launch)

```bash
npm ci
cp .env.example .env
# set NODE_ENV=production, JWT_SECRET=<long random string>, DATA_DIR=/var/lib/nexus
npm run admin:create -- --email you@example.com --password "<strong password>"
npm run build
NODE_ENV=production npm start      # serves dist/ + /api on 0.0.0.0:$PORT
```

Put it behind HTTPS (nginx/Caddy/reverse proxy) and back up `DATA_DIR/nexus.sqlite`. SQLite WAL + serialized transactions are sufficient for a small/medium deployment; for horizontal scaling, point `VITE_API_BASE_URL` at the Firebase backend instead. Do not deploy the SQLite writer to multiple serverless instances — use one long-running process or Firebase.

Never commit `.env` or `server/data/`. `JWT_SECRET` is mandatory in production (the server refuses to boot without it).

## Firebase

See [FIREBASE_SETUP.md](FIREBASE_SETUP.md). Deploys Cloud Functions, Firestore/Storage rules and Hosting.

## GitHub Actions

`.github/workflows/ci.yml` runs on every push and pull request: `npm ci` → lint → typecheck → 14 integration tests → production build → build-output verification → Firebase functions bundle validation → artifact upload. The deploy job runs only on `main` **and only when** `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` secrets exist; otherwise it prints a skip notice. No secrets are baked into the repo.

## Vercel

The static `dist/` build can be deployed to Vercel, but the browser must be able to reach a long-running API. Set `VITE_API_BASE_URL` to your self-hosted API origin or your Cloud Functions origin, and add CORS/HTTPS there. CI deploys the prebuilt static output when the three Vercel secrets are configured.

## Post-deploy checklist

1. `GET /api/health` returns OK.
2. Create the admin with `npm run admin:create`, then remove any `BOOTSTRAP_ADMIN_*` env vars.
3. Configure payment methods, UPI ID/QR, limits, FAQ and contact details in Admin → Settings.
4. Create a tournament, register a second account, join, release room credentials, publish results.
5. Confirm wallet ledger entries each have unique IDs and refunds/prizes appear once.
6. Keep **practice mode** on until legality, payment providers, age gates and region availability are verified.
