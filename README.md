# Nexus Arena — Tournament Management Platform

A complete, production-shaped **esports tournament platform** built from the specification in the linked brief: premium gaming UI, player dashboard, separate admin console, atomic wallet ledger, tournaments with private room credentials, deposits/withdrawals with manual approval, verified results, real-time leaderboard, support tickets, notifications, legal-compliance controls, Firebase backend + security rules, and a working GitHub Actions workflow.

> **Original branding.** Nexus Arena is an independent community platform. It is **not** affiliated with, endorsed by, or connected to Garena, Free Fire, or any other game publisher. No official logos or assets are used. The background, logo and avatars are generated in code.

---

## What actually works

| Module | Implementation |
| --- | --- |
| Splash → auth → dashboard | Animated code-generated splash, JWT/Firebase session check, skeleton loaders, offline banner |
| Auth | Email + password (bcrypt), separate admin login, remember me, password show/hide, forgot/reset, email verification with real tokens, optional Google sign-in **only when configured**, device-safe logout |
| Dashboard | 4 live stat cards, featured tournament, upcoming/live/completed matches, popular modes, announcements, admin banners |
| Tournaments | Unlimited admin-created matches with all 20+ fields, status workflow, atomic joining, slot limits, duplicate prevention, countdown, rules, private room ID/password, cancellation + automatic refunds |
| Wallet | Append-only server-side ledger with unique transaction IDs, available/winning/pending/reserved buckets, lifetime totals, 7-day chart, entry/deposit/withdrawal histories |
| Deposits | Configurable amounts, custom amount, UPI instructions + QR, reference number, screenshot upload, Pending → Approved/Rejected with **manual admin approval only** |
| Withdrawals | Limits, fees, UPI/bank fields, atomic reservation, one-active-request rule, Processing/Paid/Rejected with reason and automatic reversal |
| Leaderboard | Daily/weekly/monthly/all-time standings computed **only from verified results** (points, wins, win%, earnings) |
| Profile & settings | Avatars (6 original picks + upload), editable identity, Player ID, stats, wallet summary, password change, self-exclusion, delete-account request, region/age/compliance info |
| Support | Ticket creation, categories, screenshot upload, threaded conversation, admin replies, status workflow, FAQ and admin-configured contact details |
| Notifications | Generated for registrations, room releases, results, deposits, withdrawals, announcements and admin events; unread count, mark-read, live SSE/Firestore listeners |
| Admin panel | Separate role-verified login, metrics + charts, user management/suspension, tournament CRUD, room release, result publishing with idempotent prize distribution, deposit/withdrawal reviews, manual balance adjustments, banners, announcements, FAQ/categories/payment/UPI/limit settings, full audit log |
| Legal controls | Practice mode by default; real-money mode requires legal verification, payment-provider verification and a terms URL; age gate, region blocklist, responsible-play deposit limits and self-exclusion |
| Backends | Self-hosted SQLite server **and** Firebase (Auth + Firestore + Storage + Cloud Functions + security rules), sharing the exact same API contract |
| CI | Real workflow: install → lint → typecheck → integration tests → production build → build verification → optional secure deploy |

**Nothing is a dummy button.** Every action calls a validated, authorized server endpoint. No fake users, balances, transactions or results are seeded into the app at boot.

---

## Quick start (works immediately, no credentials needed)

Requires **Node.js ≥ 22.5** (uses the built-in `node:sqlite`).

```bash
git clone https://github.com/Akshayapis/Fft.git
cd Fft
npm install
cp .env.example .env          # set JWT_SECRET (any long random string)
npm run admin:create -- --email admin@example.com --password "change-this-password"
npm run build                 # production web build
npm start                     # API + web on http://localhost:3001
```

Open `http://localhost:3001`, register a player, then sign in at `/admin/login` with the admin account.

Development mode (Vite + API with hot reload and proxy):

```bash
npm run dev                   # web on :5173, API on :3001
```

Optional sample **content** only (tournaments, FAQ, an announcement — never users or balances):

```bash
npm run seed:demo
```

Local email verification/reset tokens are written to `server/data/outbox/` and (in dev) available at `/api/auth/dev/outbox`; the login screen has a **Local mail outbox (dev)** link that lets you complete verification. Configure `SMTP_*` / a transactional email provider for production.

### Verify everything

```bash
npm run lint
npm run typecheck
npm test          # 14 end-to-end API scenarios
npm run build
npm run build:functions
```

---

## Firebase backend (optional production mode)

**No Firebase credentials are invented by this repository.** If none are supplied, the fully working self-hosted backend is used. To switch to Firebase, fill in your own project values in `.env` (see `.env.example`) and follow **[docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)**:

```bash
npm run build:functions       # copies shared business logic into functions/
npm run deploy:firebase       # deploys functions, Firestore rules, Storage rules
# or use Firebase Hosting + the provided firebase.json rewrites
```

Security highlights: wallets/transactions/ledgers are **never client-writable** (`allow write: if false`), room credentials live in a private `rooms` collection that no client can read directly, Cloud Functions perform all financial mutations inside Firestore transactions, and Storage uploads are owner-scoped and size/type limited.

---

## Architecture

```
shared/          Backend-agnostic business logic (one API contract)
  app.js         Express router: all user + admin routes, validation, audit
  domain.js      Ledger, wallet buckets, notifications, compliance, settings
  utils.js       IDs, money (integer paise), validation helpers, rate limiting
server/          Self-hosted adapter: SQLite document store, JWT auth, mailer, disk uploads
functions/       Firebase adapter: Firestore transactions, Admin SDK auth, Cloud Functions
src/             React + TypeScript web app (Vite): 20+ pages, admin console, design system
firestore.rules / storage.rules / firebase.json / firestore.indexes.json
.github/workflows/ci.yml
```

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** and **[docs/API.md](docs/API.md)** for the data model and endpoint reference, **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for deployment options.

---

## Legal & responsible play

Paid entry fees, deposits and cash prizes may be regulated where you operate. The platform therefore ships in **practice mode**: balances are platform credits with no cash value. An administrator can only enable real-money mode after explicitly attesting legal verification, payment-provider verification and publishing a terms URL, and after configuring age gates, blocked/allowed regions and responsible-play limits. Self-exclusion is available to every player. Verify legality and payment-provider requirements before enabling real-money contests.
