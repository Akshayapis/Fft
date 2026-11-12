# Architecture

## One contract, two trusted backends

```
Browser (React SPA)
   │  REST /api/*  (Bearer JWT or Firebase ID token)
   ▼
shared/app.js  ── uses ──► shared/domain.js (business logic)
   ▲                              ▲
   │                              │
server/ (SQLite + JWT)     functions/ (Firestore + Admin SDK)
```

`createApp({ store, auth, mailer, storage, events, mode, config })` builds the exact same Express router for both deployments. The `store` abstraction provides `get/put/patch/del/list/tx`; `tx()` is an **atomic, buffered transaction** (SQLite `BEGIN IMMEDIATE` + serialized queue; Firestore `runTransaction` with coalesced writes). All financial operations run inside one transaction with idempotency keys, so duplicate payments, double withdrawals and repeated prize distribution are impossible even under concurrent requests.

## Money

All amounts are **integer paise**. `ledger()` is the only function allowed to change a balance. It:
1. checks an idempotency `key` on the append-only `transactions` collection,
2. loads the wallet, validates the resulting bucket is non-negative,
3. writes an immutable transaction with a unique `NX…` ID,
4. writes the new wallet,
5. updates lifetime counters.

Buckets: `available` (deposits + adjustments), `winning` (verified prizes), `pending` (unsettled deposits), `reserved` (withdrawal holds). Clients have no route that writes a wallet document — Firestore rules enforce `allow write: if false` on `wallets` and `transactions`.

## Idempotency keys

| Operation | Keys |
| --- | --- |
| Join | `entry:<regId>:available`, `entry:<regId>:winning` |
| Cancel / tournament cancelled | `refund:<regId>:*`, `refund:cancel:<regId>:*` |
| Deposit approval | `deposit:<depId>:credit` |
| Withdrawal | `wd:<id>:reserve:*`, `wd:<id>:reverse:*`, `wd:<id>:paid` |
| Result prizes | `result:<tournamentId>:<userId>` |

## Private room credentials

Credentials are stored in a separate `rooms` collection (Firestore rules: no direct client read). The API returns them only when `roomReleased === true` **and** the requester is a registered player of that match (or an admin). List endpoints never include them.

## Collections

`users`, `profiles`, `wallets`, `transactions`, `tournaments`, `rooms`, `registrations`, `results`, `deposits`, `withdrawals`, `notifications`, `tickets`, `ticketMessages`, `banners`, `announcements`, `settings`, `adminLogs`, `tokens`, `outbox`, `deletionRequests`.

## Security layers

- bcrypt password hashes, signed JWTs with `tokenVersion` revocation, separate admin login, rate limiting on auth/money endpoints
- Zod validation on every mutation, whitelist-based settings updates
- Server-side role checks on every admin route; audit log with admin identity + timestamp
- `complianceCheck()` for age, region, self-exclusion and legal attestation before any paid action
- Uploads: validated base64/type/size, unguessable paths locally; owner-scoped Storage rules in Firebase mode
- Helmet, CORS, no secrets in frontend code, `.env.example` contains placeholders only
