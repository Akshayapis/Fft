/** End-to-end API integration tests against a real in-memory SQLite backend. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createSqliteStore } from '../sqlite-store.js';
import { createMailer } from '../mailer.js';
import { createLocalStorage } from '../local-storage.js';
import { createLocalAuth } from '../local-auth.js';
import { createApp } from '../../shared/app.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-'));
const store = createSqliteStore({ file: ':memory:' });
const config = { devTokens: true, devOutbox: true, googleClientId: '', appUrl: '' };
const mailer = createMailer({ store, dataDir: tmp, config });
const storage = createLocalStorage({ dataDir: tmp });
const auth = createLocalAuth({ store, jwtSecret: 'test-secret-please-change-1234567890' });
const app = createApp({ store, auth, mailer, storage, events: new EventEmitter(), mode: 'local', config });
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const call = async (method, url, body, token) => {
  const res = await fetch(`${base}/api${url}`, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
};
const ok = (r, label) => { assert.ok(r.status >= 200 && r.status < 300, `${label}: ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
const fail = (r, status, label) => assert.equal(r.status, status, `${label}: ${r.status} ${JSON.stringify(r.data)}`);

test('Nexus Arena API — complete flow', async (t) => {
  let player, player2, admin, tournament, registration, deposit, withdrawal;

  await t.test('health & public config expose no invented credentials', async () => {
    const h = ok(await call('GET', '/health'), 'health');
    assert.equal(h.backend, 'local');
    const c = ok(await call('GET', '/config'), 'config');
    assert.equal(c.realMoneyEnabled, false);
    assert.equal(c.firebase, null);
    const p = ok(await call('GET', '/public'), 'public');
    assert.equal(p.settings.mode, 'practice');
    assert.ok(p.settings.faq.length > 0);
  });

  await t.test('registration, age gate, email verification and session', async () => {
    fail(await call('POST', '/auth/register', { email: 'young@example.com', password: 'password123', displayName: 'Too Young', birthDate: '2015-01-01', region: 'Uttar Pradesh', acceptTerms: true }), 403, 'age gate');
    const r = ok(await call('POST', '/auth/register', {
      email: 'player1@example.com', password: 'password123', displayName: 'Shadow Strike', username: 'shadow1',
      birthDate: '1998-04-12', region: 'Uttar Pradesh', acceptTerms: true,
    }), 'register');
    player = r.token;
    assert.ok(player && r.user.id);
    fail(await call('POST', '/auth/register', { email: 'player1@example.com', password: 'password123', displayName: 'Dup', birthDate: '1990-01-01', acceptTerms: true }), 409, 'duplicate email');
    const me = ok(await call('GET', '/me', undefined, player), 'me');
    assert.equal(me.user.wallet.available, 0);
    assert.equal(me.user.emailVerified, false);
    const outbox = ok(await call('GET', '/auth/dev/outbox'), 'outbox');
    const token = outbox.messages.find((m) => m.subject.includes('Verify'))?.token;
    assert.ok(token, 'verification token in dev outbox');
    ok(await call('POST', '/auth/verify-email', { token }), 'verify');
    assert.equal(ok(await call('GET', '/me', undefined, player), 'me after verify').user.emailVerified, true);
  });

  await t.test('login, logout and password reset', async () => {
    fail(await call('POST', '/auth/login', { email: 'player1@example.com', password: 'wrong' }), 401, 'wrong password');
    const l = ok(await call('POST', '/auth/login', { email: 'player1@example.com', password: 'password123' }), 'login');
    assert.ok(l.token);
    ok(await call('POST', '/auth/forgot-password', { email: 'player1@example.com' }), 'forgot');
    const reset = ok(await call('GET', '/auth/dev/outbox'), 'outbox').messages.find((m) => m.subject.includes('Reset'))?.token;
    assert.ok(reset);
    ok(await call('POST', '/auth/reset-password', { token: reset, password: 'newpassword123' }), 'reset');
    fail(await call('GET', '/me', undefined, player), 401, 'old token revoked after reset');
    player = ok(await call('POST', '/auth/login', { email: 'player1@example.com', password: 'newpassword123' }), 'login new password').token;
    ok(await call('POST', '/auth/logout', {}, player), 'logout');
    fail(await call('GET', '/me', undefined, player), 401, 'token revoked after logout');
    player = ok(await call('POST', '/auth/login', { email: 'player1@example.com', password: 'newpassword123' }), 'login again').token;
  });

  await t.test('separate admin login and permission checks', async () => {
    await auth.createAdmin({ email: 'admin@example.com', password: 'adminpass123' });
    fail(await call('POST', '/auth/admin/login', { email: 'player1@example.com', password: 'newpassword123' }), 401, 'player cannot admin-login');
    admin = ok(await call('POST', '/auth/admin/login', { email: 'admin@example.com', password: 'adminpass123' }), 'admin login').token;
    ok(await call('GET', '/admin/overview', undefined, admin), 'admin overview');
    fail(await call('GET', '/admin/overview', undefined, player), 403, 'player blocked from admin');
    fail(await call('GET', '/admin/overview'), 401, 'anonymous blocked from admin');
  });

  await t.test('tournament creation, private room credentials and slot limits', async () => {
    const body = {
      title: 'Integration Cup', gameMode: 'Battle Royale', teamType: 'Solo', entryFee: 10000, slots: 1,
      prizePool: 30000, prize1: 15000, prize2: 10000, prize3: 5000,
      matchDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), matchTime: '20:00',
      mapName: 'Bermuda', matchType: 'Ranked', status: 'registration_open', roomId: 'ROOM777', roomPassword: 'secret99',
      rules: 'Fair play only', description: 'Test event',
    };
    tournament = ok(await call('POST', '/admin/tournaments', body, admin), 'create tournament').tournament;
    assert.equal(tournament.joinedCount, 0);
    const pub = ok(await call('GET', `/tournaments/${tournament.id}`, undefined, player), 'tournament detail');
    assert.equal(pub.tournament.roomId, undefined, 'room ID hidden before release');
    assert.equal(pub.tournament.roomVisible, false);
    const all = ok(await call('GET', '/tournaments', undefined, player), 'tournament list');
    assert.equal(all.tournaments.length, 1);
  });

  await t.test('wallet adjustment, atomic entry fee, duplicate & oversell prevention', async () => {
    const r2 = ok(await call('POST', '/auth/register', { email: 'player2@example.com', password: 'password123', displayName: 'Nova', username: 'nova2', birthDate: '1995-01-01', region: 'Delhi', acceptTerms: true }), 'register player2');
    player2 = r2.token;
    fail(await call('POST', `/tournaments/${tournament.id}/join`, { teamName: '' }, player), 409, 'insufficient balance');
    ok(await call('POST', '/admin/adjustments', { userId: r2.user.id, amount: 50000, reason: 'Test credit', bucket: 'available' }, admin), 'admin adjustment');
    fail(await call('POST', '/admin/adjustments', { userId: r2.user.id, amount: 50000, reason: 'Test credit' }, player), 403, 'player cannot adjust');
    ok(await call('POST', '/admin/adjustments', { userId: (await call('GET', '/me', undefined, player)).data.user.id, amount: 50000, reason: 'Test credit', bucket: 'available' }, admin), 'admin adjustment 2');
    registration = ok(await call('POST', `/tournaments/${tournament.id}/join`, { teamName: '' }, player), 'join').registration;
    fail(await call('POST', `/tournaments/${tournament.id}/join`, { teamName: '' }, player), 409, 'duplicate join blocked');
    fail(await call('POST', `/tournaments/${tournament.id}/join`, { teamName: '' }, player2), 409, 'slot limit enforced');
    const w = ok(await call('GET', '/wallet', undefined, player), 'wallet');
    assert.equal(w.wallet.available, 40000);
    assert.equal(w.transactions.filter((x) => x.type === 'entry_fee').length, 1);
    assert.ok(w.transactions.every((x) => x.id && x.key));
  });

  await t.test('room release only to registered players', async () => {
    ok(await call('POST', `/admin/tournaments/${tournament.id}/room`, { roomId: 'ROOM777', roomPassword: 'secret99', release: true }, admin), 'release room');
    const mine = ok(await call('GET', `/tournaments/${tournament.id}`, undefined, player), 'registered player view');
    assert.equal(mine.tournament.roomId, 'ROOM777');
    assert.equal(mine.tournament.roomPassword, 'secret99');
    const other = ok(await call('GET', `/tournaments/${tournament.id}`, undefined, player2), 'non-registered player view');
    assert.equal(other.tournament.roomId, undefined);
    assert.equal(other.tournament.roomVisible, false);
  });

  await t.test('cancellation with automatic refund', async () => {
    ok(await call('POST', `/registrations/${registration.id}/cancel`, {}, player), 'cancel');
    const w = ok(await call('GET', '/wallet', undefined, player), 'wallet after refund');
    assert.equal(w.wallet.available, 50000);
    fail(await call('POST', `/registrations/${registration.id}/cancel`, {}, player), 409, 'double refund blocked');
    // rejoin for results flow
    registration = ok(await call('POST', `/tournaments/${tournament.id}/join`, {}, player), 'rejoin').registration;
  });

  await t.test('deposit requires manual admin approval; screenshot alone never credits', async () => {
    deposit = ok(await call('POST', '/deposits', { amount: 20000, method: 'upi', upiRef: 'UTR123456' }, player), 'deposit request').deposit;
    assert.equal(deposit.status, 'pending');
    const pendingWallet = ok(await call('GET', '/wallet', undefined, player), 'wallet').wallet;
    assert.equal(pendingWallet.available, 40000, 'no auto credit');
    assert.equal(pendingWallet.pending, 20000, 'pending balance tracks the request');
    fail(await call('POST', `/admin/deposits/${deposit.id}/review`, { approve: true }, player2), 403, 'non-admin review blocked');
    ok(await call('POST', `/admin/deposits/${deposit.id}/review`, { approve: true, note: 'verified' }, admin), 'approve deposit');
    const approvedWallet = ok(await call('GET', '/wallet', undefined, player), 'wallet').wallet;
    assert.equal(approvedWallet.available, 60000);
    assert.equal(approvedWallet.pending, 0, 'pending balance settled');
    fail(await call('POST', `/admin/deposits/${deposit.id}/review`, { approve: true }, admin), 409, 'duplicate approval blocked');
  });

  await t.test('withdrawal reserves balance, prevents doubles, rejects and releases', async () => {
    withdrawal = ok(await call('POST', '/withdrawals', { amount: 20000, upiId: 'player@upi', holderName: 'Test Player' }, player), 'withdraw').withdrawal;
    assert.equal(withdrawal.status, 'pending');
    const w = ok(await call('GET', '/wallet', undefined, player), 'wallet');
    assert.equal(w.wallet.reserved, 20000);
    assert.equal(w.wallet.available, 40000);
    fail(await call('POST', '/withdrawals', { amount: 20000, upiId: 'player@upi', holderName: 'Test Player' }, player), 409, 'double withdrawal blocked');
    ok(await call('POST', `/admin/withdrawals/${withdrawal.id}/review`, { action: 'reject', reason: 'UTR mismatch' }, admin), 'reject withdrawal');
    const w2 = ok(await call('GET', '/wallet', undefined, player), 'wallet after reversal');
    assert.equal(w2.wallet.reserved, 0);
    assert.equal(w2.wallet.available, 60000);
  });

  await t.test('verified results, idempotent prize distribution, leaderboard', async () => {
    const me = ok(await call('GET', '/me', undefined, player), 'me').user;
    ok(await call('PATCH', '/admin/tournaments/' + tournament.id, { status: 'live' }, admin), 'set live');
    const pub = ok(await call('POST', `/admin/tournaments/${tournament.id}/results`, { results: [{ userId: me.id, rank: 1, prize: 15000 }] }, admin), 'publish results');
    assert.equal(pub.results.length, 1);
    fail(await call('POST', `/admin/tournaments/${tournament.id}/results`, { results: [{ userId: me.id, rank: 1, prize: 15000 }] }, admin), 409, 'duplicate prize distribution blocked');
    const w = ok(await call('GET', '/wallet', undefined, player), 'wallet after prize');
    assert.equal(w.wallet.winning, 15000);
    const lb = ok(await call('GET', '/leaderboard?period=all', undefined, player), 'leaderboard');
    assert.equal(lb.leaderboard[0].rank, 1);
    assert.equal(lb.leaderboard[0].winnings, 15000);
    assert.equal(lb.leaderboard[0].points, 100);
    const results = ok(await call('GET', '/my/results', undefined, player), 'my results');
    assert.equal(results.results.length, 1);
  });

  await t.test('notifications, support tickets and audit logs', async () => {
    const n = ok(await call('GET', '/notifications', undefined, player), 'notifications');
    assert.ok(n.notifications.length >= 5);
    assert.ok(n.unread > 0);
    ok(await call('POST', '/notifications/read', { all: true }, player), 'mark read');
    assert.equal(ok(await call('GET', '/notifications', undefined, player), 'notifications').unread, 0);
    const ticket = ok(await call('POST', '/support/tickets', { subject: 'Room issue', category: 'Room credentials', message: 'Cannot see the room ID' }, player), 'ticket').ticket;
    ok(await call('POST', `/admin/tickets/${ticket.id}/reply`, { message: 'Room is released now, please refresh.', status: 'resolved' }, admin), 'admin reply');
    const thread = ok(await call('GET', `/support/tickets/${ticket.id}`, undefined, player), 'thread');
    assert.equal(thread.messages.length, 2);
    const logs = ok(await call('GET', '/admin/logs', undefined, admin), 'logs');
    assert.ok(logs.logs.some((l) => l.action === 'deposit.approve'));
    assert.ok(logs.logs.every((l) => l.createdAt && l.adminEmail));
  });

  await t.test('compliance gate blocks unverified real-money mode', async () => {
    fail(await call('PUT', '/admin/settings', { mode: 'real' }, admin), 400, 'legal gate');
    const s = ok(await call('PUT', '/admin/settings', { legalVerified: true, paymentProviderVerified: true, termsUrl: 'https://example.com/terms', mode: 'real', minAge: 18, blockedRegions: ['Sikkim'] }, admin), 'enable real money');
    assert.equal(s.settings.mode, 'real');
    fail(await call('POST', '/deposits', { amount: 20000, method: 'upi', upiRef: 'UTR2' }, await registerRegional('Sikkim')), 403, 'blocked region');
    ok(await call('PUT', '/admin/settings', { mode: 'practice' }, admin), 'back to practice');
  });

  await t.test('Firebase rules & workflow files exist and are non-empty', async () => {
    for (const f of ['firestore.rules', 'storage.rules', 'firebase.json', 'firestore.indexes.json', '.github/workflows/ci.yml', 'functions/index.js']) {
      const file = path.resolve(process.cwd(), f);
      assert.ok(fs.existsSync(file), `${f} missing`);
      assert.ok(fs.statSync(file).size > 100, `${f} is empty`);
    }
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    assert.match(rules, /allow write: if false/);
    assert.match(rules, /match \/rooms\/\{id\}/);
  });

  server.close();
  store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function registerRegional(region) {
  const r = ok(await call('POST', '/auth/register', {
    email: `regional${Date.now()}@example.com`, password: 'password123', displayName: 'Regional Player',
    birthDate: '1990-01-01', region, acceptTerms: true,
  }), 'register regional');
  return r.token;
}
