/**
 * Nexus Arena API — one contract, two trusted backends.
 * `createApp` is used by the self-hosted SQLite server AND by the Firebase
 * Cloud Function (see functions/index.js). No client can ever write a wallet
 * balance directly: every mutation goes through an atomic store transaction.
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { z } from 'zod';
import {
  HttpError, asyncRoute, validate, clean, safeUrl, uid, now, sortBy, asInt, rateLimiter, money,
  periodStart, bad, conflict, forbidden, playerId,
} from './utils.js';
import {
  C, getSettings, publicSettings, complianceCheck, getWallet, ledger, spendSplit, notify,
  notifyAdmins, logAdmin, userView, requireUser, requireAdmin, tournamentView, missing,
} from './domain.js';

const moneyAmount = z.number().int().positive().max(50000000);
const tournamentSchema = z.object({
  title: z.string().trim().min(3).max(120),
  gameMode: z.string().trim().min(2).max(60),
  teamType: z.enum(['Solo', 'Duo', 'Squad']),
  entryFee: z.number().int().min(0).max(50000000),
  slots: z.number().int().min(1).max(10000),
  prizePool: z.number().int().min(0).max(1000000000),
  prize1: z.number().int().min(0).max(1000000000),
  prize2: z.number().int().min(0).max(1000000000),
  prize3: z.number().int().min(0).max(1000000000),
  matchDate: z.string().min(4).max(40),
  matchTime: z.string().min(1).max(20),
  registrationClose: z.string().max(40).optional().default(''),
  mapName: z.string().max(80).optional().default('Bermuda'),
  matchType: z.string().max(80).optional().default('Battle Royale'),
  banner: z.string().max(700).optional().default(''),
  description: z.string().max(5000).optional().default(''),
  rules: z.string().max(10000).optional().default(''),
  status: z.enum(['upcoming', 'registration_open', 'full', 'live', 'completed', 'cancelled']).default('upcoming'),
  roomId: z.string().max(80).optional().default(''),
  roomPassword: z.string().max(80).optional().default(''),
});

export function createApp({ store, auth, mailer, storage, events, mode = 'local', config = {} }) {
  const app = express();
  const api = express.Router();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '4mb' }));

  const changed = (...ids) => { for (const id of ids.filter(Boolean)) events?.emit('change', String(id)); };
  const actorOf = (req) => ({ id: req.actor.id, email: req.actor.email, role: req.actor.role });

  api.use((req, _res, next) => {
    Promise.resolve(auth.authenticate(req)).then((actor) => { req.actor = actor; next(); }).catch(() => { req.actor = null; next(); });
  });

  api.get('/health', (_req, res) => res.json({ ok: true, backend: mode, time: now() }));
  api.get('/config', asyncRoute(async (_req, res) => {
    const s = await getSettings(store);
    res.json({
      backend: mode, appName: s.appName, tagline: s.tagline, mode: s.mode,
      googleClientId: config.googleClientId || '', requireEmailVerification: s.requireEmailVerification,
      complianceNote: s.complianceNote, realMoneyEnabled: s.mode === 'real', devOutbox: !!config.devOutbox,
      firebase: mode === 'firebase' ? (config.firebase || {}) : null,
    });
  }));
  api.get('/public', asyncRoute(async (_req, res) => {
    const s = await getSettings(store);
    const [banners, announcements] = await Promise.all([
      store.list(C.banners, { where: [{ field: 'active', op: '==', value: true }] }),
      store.list(C.announcements, {}),
    ]);
    res.json({
      settings: publicSettings(s),
      banners: sortBy(banners, 'createdAt'),
      announcements: sortBy(announcements, 'createdAt').slice(0, 12),
    });
  }));

  // Provider-specific auth routes: local JWT/password flows or Firebase ID-token session sync.
  if (auth.buildAuthRouter) api.use('/auth', auth.buildAuthRouter({ store, mailer, config, changed }));

  // ── Session / profile ────────────────────────────────────────────────
  api.get('/me', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const [user, profile, wallet, registrations, results, notifications] = await Promise.all([
      store.get(C.users, a.id), store.get(C.profiles, a.id), store.get(C.wallets, a.id),
      store.list(C.registrations, { where: [{ field: 'userId', op: '==', value: a.id }] }),
      store.list(C.results, { where: [{ field: 'userId', op: '==', value: a.id }] }),
      store.list(C.notifications, { where: [{ field: 'userId', op: '==', value: a.id }] }),
    ]);
    const joined = registrations.filter((r) => r.status === 'joined');
    const wins = results.filter((r) => r.rank === 1);
    const settings = await getSettings(store);
    res.json({
      user: { ...userView(user, profile, wallet), stats: {
        totalMatches: joined.length, totalWins: wins.length,
        totalEarnings: results.reduce((n, r) => n + Number(r.prize || 0), 0),
        podiums: results.filter((r) => r.rank <= 3).length,
      }, unread: notifications.filter((n) => !n.read).length },
      settings: publicSettings(settings),
    });
  }));

  api.patch('/profile', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const body = validate(z.object({
      displayName: z.string().trim().min(2).max(40).optional(),
      username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/, 'Use 3–24 letters, numbers or underscores').optional(),
      playerId: z.string().trim().min(3).max(24).optional(),
      avatar: z.string().max(700).optional(),
      banner: z.string().max(700).optional(),
      bio: z.string().max(300).optional(),
      phone: z.string().max(20).optional(),
      region: z.string().max(60).optional(),
    }), req.body);
    const view = await store.tx(async (tx) => {
      const user = missing(await tx.get(C.users, a.id), 'Account');
      const profile = await tx.get(C.profiles, a.id) || { userId: a.id, playerId: playerId() };
      if (body.username && body.username !== user.username) {
        const clash = await tx.list(C.users, { where: [{ field: 'username', op: '==', value: body.username }] });
        if (clash.some((u) => u.id !== a.id)) conflict('That username is already taken.');
      }
      if (body.playerId) {
        const clash = await tx.list(C.profiles, { where: [{ field: 'playerId', op: '==', value: body.playerId }] });
        if (clash.some((p) => p.userId !== a.id)) conflict('That Player ID is already linked to another account.');
      }
      const nextUser = { ...user, ...(body.displayName ? { displayName: body.displayName } : {}),
        ...(body.username ? { username: body.username } : {}), ...(body.region !== undefined ? { region: clean(body.region, 60) } : {}) };
      const nextProfile = { ...profile, ...(body.playerId ? { playerId: body.playerId } : {}),
        ...(body.avatar !== undefined ? { avatar: safeUrl(body.avatar) } : {}),
        ...(body.banner !== undefined ? { banner: safeUrl(body.banner) } : {}),
        ...(body.bio !== undefined ? { bio: clean(body.bio, 300) } : {}),
        ...(body.phone !== undefined ? { phone: clean(body.phone, 20) } : {}), updatedAt: now() };
      await tx.put(C.users, a.id, nextUser);
      await tx.put(C.profiles, a.id, nextProfile);
      return userView(nextUser, nextProfile, await tx.get(C.wallets, a.id));
    });
    changed(a.id);
    res.json({ user: view });
  }));

  api.post('/profile/avatar', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    if (!storage) throw new HttpError(501, 'In Firebase mode avatars are uploaded directly to Cloud Storage from the client.');
    const url = await storage.save(req.body?.dataUrl, a.id, 'avatar');
    const profile = await store.get(C.profiles, a.id) || { userId: a.id, playerId: playerId() };
    await store.put(C.profiles, a.id, { ...profile, avatar: url, updatedAt: now() });
    changed(a.id);
    res.json({ url });
  }));

  api.post('/uploads', asyncRoute(async (req, res) => {
    requireUser(req);
    if (!storage) throw new HttpError(501, 'In Firebase mode files are uploaded directly to Cloud Storage from the client.');
    const url = await storage.save(req.body?.dataUrl, req.actor.id, clean(req.body?.kind, 30) || 'attachment');
    res.json({ url });
  }));

  api.post('/profile/delete-request', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const reason = clean(validate(z.object({ reason: z.string().max(500).optional().default('') }), req.body).reason, 500);
    await store.tx(async (tx) => {
      const user = missing(await tx.get(C.users, a.id), 'Account');
      if (user.deletionRequested) conflict('A deletion request is already open for this account.');
      await tx.put(C.users, a.id, { ...user, deletionRequested: true });
      const ticket = { id: uid('tk_'), userId: a.id, subject: 'Account deletion request', category: 'account',
        status: 'open', priority: 'normal', createdAt: now(), updatedAt: now(), lastReplyAt: now() };
      await tx.put(C.tickets, ticket.id, ticket);
      const firstMessage = { id: uid('msg_'), ticketId: ticket.id, senderId: a.id,
        senderRole: 'user', message: reason || 'Please delete my account and associated data.', attachment: '', createdAt: now() };
      await tx.put(C.ticketMessages, firstMessage.id, firstMessage);
      await tx.put(C.deletionRequests, a.id, { userId: a.id, reason, status: 'pending', createdAt: now() });
      await notify(tx, a.id, { type: 'account', title: 'Deletion request received', body: 'An admin will review your request. You can still use your account meanwhile.', link: '/support' });
      await notifyAdmins(tx, { type: 'admin', title: 'Account deletion request', body: `${user.displayName} requested account deletion.`, link: '/admin/support' });
    });
    changed(a.id);
    res.json({ ok: true });
  }));

  api.post('/profile/self-exclude', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const days = asInt(validate(z.object({ days: z.number().int().min(1).max(365) }), req.body).days, 'days', 1, 365);
    const until = new Date(Date.now() + days * 86400000).toISOString();
    const user = await store.get(C.users, a.id);
    await store.put(C.users, a.id, { ...user, selfExcludedUntil: until });
    await store.tx(async (tx) => notify(tx, a.id, { type: 'account', title: 'Self-exclusion active',
      body: `Paid contests are paused until ${new Date(until).toLocaleDateString('en-IN')}.`, link: '/settings' }));
    changed(a.id);
    res.json({ until });
  }));

  // ── Wallet ───────────────────────────────────────────────────────────
  api.get('/wallet', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const w = await getWallet(store, a.id);
    const txs = await store.list(C.transactions, { where: [{ field: 'userId', op: '==', value: a.id }] });
    const deposits = await store.list(C.deposits, { where: [{ field: 'userId', op: '==', value: a.id }] });
    const withdrawals = await store.list(C.withdrawals, { where: [{ field: 'userId', op: '==', value: a.id }] });
    res.json({ wallet: w, transactions: sortBy(txs, 'createdAt'), deposits: sortBy(deposits, 'createdAt'),
      withdrawals: sortBy(withdrawals, 'createdAt'),
      entryHistory: sortBy(txs.filter((t) => t.type === 'entry_fee' || t.type === 'refund'), 'createdAt') });
  }));
  api.get('/wallet/transactions', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const txs = await store.list(C.transactions, { where: [{ field: 'userId', op: '==', value: a.id }] });
    res.json({ transactions: sortBy(txs, 'createdAt') });
  }));

  // ── Tournaments ──────────────────────────────────────────────────────
  const buildStart = (date, time) => {
    const t = Date.parse(`${date}T${time}`);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
    const d = Date.parse(date);
    return new Date(Number.isNaN(d) ? Date.now() + 86400000 : d).toISOString();
  };

  api.get('/tournaments', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const [all, regs] = await Promise.all([
      store.list(C.tournaments, {}),
      store.list(C.registrations, { where: [{ field: 'userId', op: '==', value: a.id }] }),
    ]);
    const mine = new Set(regs.filter((r) => r.status === 'joined').map((r) => r.tournamentId));
    const status = String(req.query.status || '');
    const q = String(req.query.q || '').toLowerCase();
    let items = all.filter((t) => (!status || t.status === status) && (!q || `${t.title} ${t.gameMode} ${t.mapName}`.toLowerCase().includes(q)));
    items = sortBy(items, 'startsAt', 'asc').map((t) => ({ ...tournamentView(t, { isAdmin: a.role === 'admin', registered: false }), joined: mine.has(t.id) }));
    res.json({ tournaments: items });
  }));

  api.get('/tournaments/:id', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const t = missing(await store.get(C.tournaments, req.params.id), 'Tournament');
    const regs = await store.list(C.registrations, { where: [{ field: 'tournamentId', op: '==', value: t.id }] });
    const joined = regs.filter((r) => r.status === 'joined');
    const users = await store.list(C.users, {});
    const profiles = await store.list(C.profiles, {});
    const uMap = new Map(users.map((u) => [u.id, u]));
    const pMap = new Map(profiles.map((p) => [p.userId, p]));
    const results = await store.list(C.results, { where: [{ field: 'tournamentId', op: '==', value: t.id }] });
    const roomVisible = !!t.roomReleased && (joined.some((r) => r.userId === a.id) || a.role === 'admin');
    const roomDoc = roomVisible ? await store.get(C.rooms, t.id) : null;
    res.json({
      tournament: { ...tournamentView({ ...t, ...(roomDoc ? { roomId: roomDoc.roomId, roomPassword: roomDoc.roomPassword } : {}) }, { isAdmin: a.role === 'admin', registered: roomVisible }), joined: joined.some((r) => r.userId === a.id) },
      registration: regs.find((r) => r.userId === a.id && r.status === 'joined') || null,
      participants: joined.map((r) => ({
        id: r.id, userId: r.userId, teamName: r.teamName, members: r.members || [],
        displayName: uMap.get(r.userId)?.displayName || 'Player', avatar: pMap.get(r.userId)?.avatar || '',
        playerId: pMap.get(r.userId)?.playerId || '', joinedAt: r.joinedAt,
      })),
      results: sortBy(results, 'rank', 'asc'),
    });
  }));

  api.post('/tournaments/:id/join', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const body = validate(z.object({
      teamName: z.string().trim().max(40).optional().default(''),
      members: z.array(z.object({ name: z.string().max(40), playerId: z.string().max(30).optional().default('') })).max(4).optional().default([]),
    }), req.body);
    const out = await store.tx(async (tx) => {
      const t = missing(await tx.get(C.tournaments, req.params.id), 'Tournament');
      const user = missing(await tx.get(C.users, a.id), 'Account');
      const settings = await getSettings(tx);
      if (t.status !== 'registration_open') throw new HttpError(409, `Registration is ${t.status.replace('_', ' ')} for this tournament.`);
      if (t.registrationClose && Date.parse(t.registrationClose) < Date.now()) throw new HttpError(409, 'Registration has closed for this match.');
      const regs = await tx.list(C.registrations, { where: [{ field: 'tournamentId', op: '==', value: t.id }] });
      const joined = regs.filter((r) => r.status === 'joined');
      if (joined.some((r) => r.userId === a.id)) conflict('You are already registered for this tournament.');
      if (joined.length >= Number(t.slots)) conflict('All slots are taken for this tournament.');
      complianceCheck(settings, user);
      if (settings.requireEmailVerification && !user.emailVerified) throw new HttpError(403, 'Verify your email address before joining a match.');
      const wallet = await getWallet(tx, a.id);
      const split = spendSplit(wallet, Number(t.entryFee || 0), !!settings.allowWinningForEntry);
      const reg = {
        id: uid('reg_'), tournamentId: t.id, userId: a.id, teamName: clean(body.teamName, 40),
        members: body.members.map((m) => ({ name: clean(m.name, 40), playerId: clean(m.playerId, 30) })),
        feePaid: Number(t.entryFee || 0), feeSplit: split, status: 'joined', joinedAt: now(),
        cancelledAt: '', refundAmount: 0,
      };
      if (split.fromAvailable) await ledger(tx, { userId: a.id, type: 'entry_fee', amount: -split.fromAvailable,
        bucket: 'available', description: `Entry fee — ${t.title}`, key: `entry:${reg.id}:available`, actor: a.id, meta: { tournamentId: t.id } });
      if (split.fromWinning) await ledger(tx, { userId: a.id, type: 'entry_fee', amount: -split.fromWinning,
        bucket: 'winning', description: `Entry fee — ${t.title}`, key: `entry:${reg.id}:winning`, actor: a.id, meta: { tournamentId: t.id } });
      await tx.put(C.registrations, reg.id, reg);
      const nextCount = joined.length + 1;
      await tx.patch(C.tournaments, t.id, { joinedCount: nextCount, status: nextCount >= Number(t.slots) ? 'full' : t.status, updatedAt: now() });
      await notify(tx, a.id, { type: 'registration', title: 'Registration confirmed', body: `You are in: ${t.title}. ${money(t.entryFee)} was deducted from your wallet.`, link: `/matches/${t.id}` });
      return reg;
    });
    changed(a.id);
    res.status(201).json({ registration: out });
  }));

  api.post('/registrations/:id/cancel', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const out = await store.tx(async (tx) => {
      const reg = missing(await tx.get(C.registrations, req.params.id), 'Registration');
      if (reg.userId !== a.id) forbidden('You can only cancel your own registration.');
      if (reg.status !== 'joined') conflict('This registration is no longer active.');
      const t = missing(await tx.get(C.tournaments, reg.tournamentId), 'Tournament');
      const settings = await getSettings(tx);
      if (['live', 'completed', 'cancelled'].includes(t.status)) throw new HttpError(409, 'This match can no longer be cancelled.');
      const minutesLeft = (Date.parse(t.startsAt) - Date.now()) / 60000;
      if (minutesLeft < Number(settings.cancellationMinutes || 0)) throw new HttpError(409, `Cancellations close ${settings.cancellationMinutes} minutes before the match starts.`);
      const fee = Math.round(Number(reg.feePaid || 0) * Number(settings.cancellationFeePercent || 0) / 100);
      const refund = Number(reg.feePaid || 0) - fee;
      const split = reg.feeSplit || { fromAvailable: refund, fromWinning: 0 };
      const scale = Number(reg.feePaid || 0) ? refund / Number(reg.feePaid) : 0;
      const backAvailable = Math.round((split.fromAvailable || 0) * scale);
      const backWinning = Math.round((split.fromWinning || 0) * scale);
      if (backAvailable) await ledger(tx, { userId: a.id, type: 'refund', amount: backAvailable, bucket: 'available',
        description: `Registration cancelled — ${t.title}`, key: `refund:${reg.id}:available`, actor: a.id, meta: { tournamentId: t.id } });
      if (backWinning) await ledger(tx, { userId: a.id, type: 'refund', amount: backWinning, bucket: 'winning',
        description: `Registration cancelled — ${t.title}`, key: `refund:${reg.id}:winning`, actor: a.id, meta: { tournamentId: t.id } });
      await tx.put(C.registrations, reg.id, { ...reg, status: 'cancelled', cancelledAt: now(), refundAmount: refund });
      const regs = await tx.list(C.registrations, { where: [{ field: 'tournamentId', op: '==', value: t.id }] });
      const left = regs.filter((r) => r.status === 'joined').length;
      await tx.patch(C.tournaments, t.id, { joinedCount: left, status: t.status === 'full' ? 'registration_open' : t.status, updatedAt: now() });
      await notify(tx, a.id, { type: 'registration', title: 'Registration cancelled', body: `${money(refund)} was refunded to your wallet.`, link: '/wallet' });
      return { refund, status: 'cancelled' };
    });
    changed(a.id);
    res.json(out);
  }));

  api.get('/my/matches', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const [regs, all] = await Promise.all([
      store.list(C.registrations, { where: [{ field: 'userId', op: '==', value: a.id }] }), store.list(C.tournaments, {}),
    ]);
    const map = new Map(all.map((t) => [t.id, t]));
    res.json({ matches: sortBy(regs, 'joinedAt').map((r) => ({ ...r, tournament: map.get(r.tournamentId) ? tournamentView(map.get(r.tournamentId), { registered: true }) : null })) });
  }));

  api.get('/my/results', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const [results, all] = await Promise.all([
      store.list(C.results, { where: [{ field: 'userId', op: '==', value: a.id }] }), store.list(C.tournaments, {}),
    ]);
    const map = new Map(all.map((t) => [t.id, t]));
    res.json({ results: sortBy(results, 'createdAt').map((r) => ({ ...r, tournament: map.get(r.tournamentId) || null })) });
  }));

  api.get('/my/wins', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const [results, all] = await Promise.all([
      store.list(C.results, { where: [{ field: 'userId', op: '==', value: a.id }] }), store.list(C.tournaments, {}),
    ]);
    const map = new Map(all.map((t) => [t.id, t]));
    res.json({ wins: sortBy(results.filter((r) => r.rank <= 3), 'createdAt').map((r) => ({ ...r, tournament: map.get(r.tournamentId) || null })) });
  }));

  // ── Deposits ─────────────────────────────────────────────────────────
  api.post('/deposits', rateLimiter({ max: 10 }), asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const body = validate(z.object({
      amount: moneyAmount, method: z.string().max(30).min(1), upiRef: z.string().max(80).optional().default(''),
      screenshotUrl: z.string().max(700).optional().default(''), note: z.string().max(300).optional().default(''),
    }), req.body);
    const out = await store.tx(async (tx) => {
      const s = await getSettings(tx);
      const user = missing(await tx.get(C.users, a.id), 'Account');
      if (body.amount < Number(s.minDeposit) || body.amount > Number(s.maxDeposit)) bad(`Deposit must be between ${money(s.minDeposit)} and ${money(s.maxDeposit)}.`);
      const method = (s.paymentMethods || []).find((m) => m.id === body.method && m.enabled);
      if (!method) bad('That payment method is not enabled by the admin.');
      if (method.id === 'upi' && !clean(body.upiRef, 80) && !body.screenshotUrl) bad('Enter the UPI reference number or attach a payment screenshot.');
      complianceCheck(s, user);
      if (s.mode === 'real') {
        const deposits = await tx.list(C.deposits, { where: [{ field: 'userId', op: '==', value: a.id }] });
        const dayStart = periodStart('daily');
        const monthStart = periodStart('monthly');
        const today = deposits.filter((d) => d.createdAt >= dayStart && d.status !== 'rejected').reduce((n, d) => n + d.amount, 0);
        const month = deposits.filter((d) => d.createdAt >= monthStart && d.status !== 'rejected').reduce((n, d) => n + d.amount, 0);
        if (today + body.amount > Number(s.responsiblePlay?.dailyDepositLimit || 0)) throw new HttpError(429, 'Daily responsible-play deposit limit reached.');
        if (month + body.amount > Number(s.responsiblePlay?.monthlyDepositLimit || 0)) throw new HttpError(429, 'Monthly responsible-play deposit limit reached.');
      }
      const dep = {
        id: uid('dep_'), userId: a.id, amount: body.amount, method: body.method,
        upiRef: clean(body.upiRef, 80), screenshotUrl: safeUrl(body.screenshotUrl), note: clean(body.note, 300),
        status: 'pending', adminNote: '', reviewedBy: '', createdAt: now(), reviewedAt: '',
      };
      await tx.put(C.deposits, dep.id, dep);
      await ledger(tx, { userId: a.id, type: 'deposit_pending', amount: dep.amount, bucket: 'pending',
        description: `Deposit request pending — ${dep.id}`, key: `deposit:${dep.id}:pending`, actor: a.id });
      await notify(tx, a.id, { type: 'deposit', title: 'Deposit request received', body: `${money(dep.amount)} is pending manual verification. It is not credited until an admin approves it.`, link: '/deposit' });
      await notifyAdmins(tx, { type: 'admin', title: 'New deposit request', body: `${user.displayName} submitted ${money(dep.amount)} for review.`, link: '/admin/deposits' });
      return dep;
    });
    changed(a.id);
    res.status(201).json({ deposit: out });
  }));
  api.get('/deposits', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    res.json({ deposits: sortBy(await store.list(C.deposits, { where: [{ field: 'userId', op: '==', value: a.id }] }), 'createdAt') });
  }));

  // ── Withdrawals ──────────────────────────────────────────────────────
  api.post('/withdrawals', rateLimiter({ max: 10 }), asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const body = validate(z.object({
      amount: moneyAmount, upiId: z.string().trim().min(3).max(80), holderName: z.string().trim().min(2).max(80),
      accountNumber: z.string().max(40).optional().default(''), ifsc: z.string().max(20).optional().default(''),
      bankName: z.string().max(60).optional().default(''),
    }), req.body);
    const out = await store.tx(async (tx) => {
      const s = await getSettings(tx);
      const user = missing(await tx.get(C.users, a.id), 'Account');
      complianceCheck(s, user);
      if (body.amount < Number(s.minWithdrawal) || body.amount > Number(s.maxWithdrawal)) bad(`Withdrawal must be between ${money(s.minWithdrawal)} and ${money(s.maxWithdrawal)}.`);
      const pending = (await tx.list(C.withdrawals, { where: [{ field: 'userId', op: '==', value: a.id }] })).filter((w) => ['pending', 'processing'].includes(w.status));
      if (pending.length) conflict('You already have a withdrawal in progress. Wait for it to be resolved before requesting another.');
      const fee = Math.round(body.amount * Number(s.withdrawalFeePercent || 0) / 100) + Number(s.withdrawalFeeFlat || 0);
      const gross = body.amount;
      const wallet = await getWallet(tx, a.id);
      const split = spendSplit(wallet, gross, !!s.allowWinningWithdrawal);
      const wd = {
        id: uid('wd_'), userId: a.id, amount: gross, fee, net: gross - fee,
        upiId: clean(body.upiId, 80), holderName: clean(body.holderName, 80),
        accountNumber: clean(body.accountNumber, 40), ifsc: clean(body.ifsc, 20), bankName: clean(body.bankName, 60),
        status: 'pending', rejectionReason: '', split, reviewedBy: '', createdAt: now(), reviewedAt: '', paidAt: '',
      };
      if (split.fromAvailable) await ledger(tx, { userId: a.id, type: 'withdrawal_reserve', amount: -split.fromAvailable,
        bucket: 'available', description: `Withdrawal reserved — ${wd.id}`, key: `wd:${wd.id}:reserve:available`, actor: a.id });
      if (split.fromWinning) await ledger(tx, { userId: a.id, type: 'withdrawal_reserve', amount: -split.fromWinning,
        bucket: 'winning', description: `Withdrawal reserved — ${wd.id}`, key: `wd:${wd.id}:reserve:winning`, actor: a.id });
      await ledger(tx, { userId: a.id, type: 'withdrawal_reserve', amount: gross, bucket: 'reserved',
        description: `Withdrawal reserved — ${wd.id}`, key: `wd:${wd.id}:reserve:hold`, actor: a.id });
      await tx.put(C.withdrawals, wd.id, wd);
      await notify(tx, a.id, { type: 'withdrawal', title: 'Withdrawal requested', body: `${money(gross)} has been reserved. It cannot be spent twice.`, link: '/withdraw' });
      await notifyAdmins(tx, { type: 'admin', title: 'New withdrawal request', body: `${user.displayName} requested ${money(gross)}.`, link: '/admin/withdrawals' });
      return wd;
    });
    changed(a.id);
    res.status(201).json({ withdrawal: out });
  }));
  api.get('/withdrawals', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    res.json({ withdrawals: sortBy(await store.list(C.withdrawals, { where: [{ field: 'userId', op: '==', value: a.id }] }), 'createdAt') });
  }));

  // ── Leaderboard (computed only from verified results) ────────────────
  api.get('/leaderboard', asyncRoute(async (req, res) => {
    requireUser(req);
    const period = ['daily', 'weekly', 'monthly', 'all'].includes(String(req.query.period)) ? String(req.query.period) : 'all';
    const start = periodStart(period);
    const [results, registrations, tournaments, users, profiles] = await Promise.all([
      store.list(C.results, {}), store.list(C.registrations, {}), store.list(C.tournaments, {}),
      store.list(C.users, {}), store.list(C.profiles, {}),
    ]);
    const tMap = new Map(tournaments.map((t) => [t.id, t]));
    const periodResults = results.filter((r) => r.verified && r.createdAt >= start);
    const matchCount = new Map();
    for (const r of registrations) {
      if (r.status !== 'joined') continue;
      const t = tMap.get(r.tournamentId);
      if (!t || t.status !== 'completed') continue;
      if (t.startsAt && t.startsAt < start) continue;
      matchCount.set(r.userId, (matchCount.get(r.userId) || 0) + 1);
    }
    const rows = new Map();
    for (const r of periodResults) {
      const cur = rows.get(r.userId) || { userId: r.userId, matches: 0, wins: 0, winnings: 0, points: 0, podiums: 0 };
      cur.winnings += Number(r.prize || 0);
      cur.points += ({ 1: 100, 2: 60, 3: 40 }[r.rank] || 10);
      if (r.rank === 1) cur.wins++;
      if (r.rank <= 3) cur.podiums++;
      rows.set(r.userId, cur);
    }
    for (const [userId, n] of matchCount) {
      if (!rows.has(userId)) rows.set(userId, { userId, matches: 0, wins: 0, winnings: 0, points: 0, podiums: 0 });
      rows.get(userId).matches += n;
    }
    const uMap = new Map(users.map((u) => [u.id, u]));
    const pMap = new Map(profiles.map((p) => [p.userId, p]));
    const leaderboard = [...rows.values()].map((r) => {
      const u = uMap.get(r.userId) || {};
      return { ...r, matches: Math.max(r.matches, periodResults.filter((x) => x.userId === r.userId).length),
        displayName: u.displayName || 'Player', username: u.username || '', avatar: pMap.get(r.userId)?.avatar || '',
        playerId: pMap.get(r.userId)?.playerId || '', suspended: !!u.suspended,
        winRate: r.matches ? Math.round((r.wins / Math.max(r.matches, r.wins)) * 100) : (r.wins ? 100 : 0) };
    }).sort((a, b) => b.points - a.points || b.winnings - a.winnings || b.wins - a.wins)
      .map((r, i) => ({ ...r, rank: i + 1 }));
    res.json({ period, start, leaderboard });
  }));

  // ── Notifications ────────────────────────────────────────────────────
  api.get('/notifications', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const list = sortBy(await store.list(C.notifications, { where: [{ field: 'userId', op: '==', value: a.id }] }), 'createdAt');
    res.json({ notifications: list, unread: list.filter((n) => !n.read).length });
  }));
  api.post('/notifications/read', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const { ids, all } = validate(z.object({ ids: z.array(z.string().max(60)).max(200).optional().default([]), all: z.boolean().optional().default(false) }), req.body);
    await store.tx(async (tx) => {
      const list = await tx.list(C.notifications, { where: [{ field: 'userId', op: '==', value: a.id }] });
      for (const n of list) if ((all || ids.includes(n.id)) && !n.read) await tx.put(C.notifications, n.id, { ...n, read: true });
    });
    changed(a.id);
    res.json({ ok: true });
  }));
  api.get('/events', (req, res) => {
    if (!events) return res.status(501).json({ error: 'Real-time events are provided by Firestore listeners in Firebase mode.' });
    const token = String(req.query.token || '');
    const header = req.headers.authorization || '';
    req.headers.authorization = token ? `Bearer ${token}` : header;
    auth.authenticate(req).then((actor) => {
      if (!actor) return res.status(401).end();
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
      res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, userId: actor.id })}\n\n`);
      const onChange = (id) => { if (String(id) === actor.id || id === '*') res.write(`event: change\ndata: ${JSON.stringify({ at: now() })}\n\n`); };
      const ping = setInterval(() => res.write(`: ping\n\n`), 25000);
      events.on('change', onChange);
      req.on('close', () => { clearInterval(ping); events.off('change', onChange); });
    }).catch(() => res.status(401).end());
  });

  // ── Support ──────────────────────────────────────────────────────────
  api.get('/support/tickets', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const list = await store.list(C.tickets, { where: [{ field: 'userId', op: '==', value: a.id }] });
    const messages = await store.list(C.ticketMessages, {});
    res.json({ tickets: sortBy(list, 'updatedAt').map((t) => ({ ...t, messageCount: messages.filter((m) => m.ticketId === t.id).length })) });
  }));
  api.post('/support/tickets', rateLimiter({ max: 12 }), asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const body = validate(z.object({
      subject: z.string().trim().min(3).max(120), category: z.string().max(40).min(1),
      message: z.string().trim().min(5).max(4000), attachment: z.string().max(700).optional().default(''),
    }), req.body);
    const ticket = await store.tx(async (tx) => {
      const t = { id: uid('tk_'), userId: a.id, subject: clean(body.subject, 120), category: clean(body.category, 40),
        status: 'open', priority: 'normal', createdAt: now(), updatedAt: now(), lastReplyAt: now() };
      const m = { id: uid('msg_'), ticketId: t.id, senderId: a.id, senderRole: 'user',
        message: clean(body.message, 4000), attachment: safeUrl(body.attachment), createdAt: now() };
      await tx.put(C.tickets, t.id, t);
      await tx.put(C.ticketMessages, m.id, m);
      await notify(tx, a.id, { type: 'support', title: 'Support ticket created', body: `We received "${t.subject}". An admin will reply here.`, link: `/support/${t.id}` });
      await notifyAdmins(tx, { type: 'admin', title: 'New support ticket', body: t.subject, link: '/admin/support' });
      return t;
    });
    changed(a.id);
    res.status(201).json({ ticket });
  }));
  api.get('/support/tickets/:id', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const t = missing(await store.get(C.tickets, req.params.id), 'Ticket');
    if (t.userId !== a.id && a.role !== 'admin') forbidden();
    const messages = sortBy((await store.list(C.ticketMessages, {})).filter((m) => m.ticketId === t.id), 'createdAt', 'asc');
    res.json({ ticket: t, messages });
  }));
  api.post('/support/tickets/:id/reply', asyncRoute(async (req, res) => {
    const a = requireUser(req);
    const body = validate(z.object({ message: z.string().trim().min(1).max(4000), attachment: z.string().max(700).optional().default('') }), req.body);
    const out = await store.tx(async (tx) => {
      const t = missing(await tx.get(C.tickets, req.params.id), 'Ticket');
      if (t.userId !== a.id) forbidden();
      if (t.status === 'closed') conflict('This ticket is closed. Create a new ticket for a new issue.');
      const m = { id: uid('msg_'), ticketId: t.id, senderId: a.id, senderRole: 'user',
        message: clean(body.message, 4000), attachment: safeUrl(body.attachment), createdAt: now() };
      await tx.put(C.ticketMessages, m.id, m);
      await tx.patch(C.tickets, t.id, { status: 'open', updatedAt: now(), lastReplyAt: now() });
      await notifyAdmins(tx, { type: 'admin', title: 'Ticket reply', body: `${t.subject} — new reply from player.`, link: '/admin/support' });
      return m;
    });
    changed(a.id);
    res.status(201).json({ message: out });
  }));

  // ── Admin panel ──────────────────────────────────────────────────────
  const adminTx = async (req, action, entity, entityId, fn) => {
    const a = requireAdmin(req);
    const result = await store.tx(async (tx) => {
      const r = await fn(tx, a);
      await logAdmin(tx, actorOf(req), action, entity, entityId, r?.audit || {});
      return r;
    });
    changed('*');
    return result;
  };

  api.get('/admin/overview', asyncRoute(async (req, res) => {
    requireAdmin(req);
    const [users, tournaments, deposits, withdrawals, txs, tickets, results, regs] = await Promise.all([
      store.list(C.users, {}), store.list(C.tournaments, {}), store.list(C.deposits, {}),
      store.list(C.withdrawals, {}), store.list(C.transactions, {}), store.list(C.tickets, {}),
      store.list(C.results, {}), store.list(C.registrations, {}),
    ]);
    const activeSince = new Date(Date.now() - 30 * 86400000).toISOString();
    res.json({
      totalUsers: users.filter((u) => u.role === 'user').length,
      activeUsers: users.filter((u) => u.role === 'user' && u.lastLoginAt >= activeSince).length,
      suspendedUsers: users.filter((u) => u.suspended).length,
      totalTournaments: tournaments.length,
      liveMatches: tournaments.filter((t) => t.status === 'live').length,
      completedMatches: tournaments.filter((t) => t.status === 'completed').length,
      totalDeposits: deposits.filter((d) => d.status === 'approved').reduce((n, d) => n + d.amount, 0),
      pendingDeposits: deposits.filter((d) => d.status === 'pending').length,
      pendingWithdrawals: withdrawals.filter((w) => ['pending', 'processing'].includes(w.status)).length,
      totalEntryFees: txs.filter((t) => t.type === 'entry_fee').reduce((n, t) => n - t.amount, 0),
      totalPrizes: results.reduce((n, r) => n + Number(r.prize || 0), 0),
      openTickets: tickets.filter((t) => t.status !== 'closed').length,
      totalRegistrations: regs.filter((r) => r.status === 'joined').length,
      charts: {
        registrations: Array.from({ length: 7 }, (_, i) => {
          const day = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10);
          return { label: day.slice(5), value: users.filter((u) => u.createdAt?.startsWith(day)).length };
        }),
        deposits: Array.from({ length: 7 }, (_, i) => {
          const day = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10);
          return { label: day.slice(5), value: deposits.filter((d) => d.createdAt?.startsWith(day)).reduce((n, d) => n + d.amount, 0) / 100 };
        }),
      },
    });
  }));

  api.get('/admin/users', asyncRoute(async (req, res) => {
    requireAdmin(req);
    const q = String(req.query.q || '').toLowerCase();
    const [users, profiles, wallets] = await Promise.all([store.list(C.users, {}), store.list(C.profiles, {}), store.list(C.wallets, {})]);
    const pMap = new Map(profiles.map((p) => [p.userId, p]));
    const wMap = new Map(wallets.map((w) => [w.userId, w]));
    const list = users.filter((u) => !q || `${u.email} ${u.displayName} ${u.username} ${pMap.get(u.id)?.playerId || ''}`.toLowerCase().includes(q));
    res.json({ users: sortBy(list, 'createdAt').map((u) => ({ ...userView(u, pMap.get(u.id), wMap.get(u.id)), passwordHash: undefined })) });
  }));
  api.get('/admin/users/:id', asyncRoute(async (req, res) => {
    requireAdmin(req);
    const user = missing(await store.get(C.users, req.params.id), 'User');
    const [profile, wallet, txs, regs, results, deposits, withdrawals] = await Promise.all([
      store.get(C.profiles, user.id), store.get(C.wallets, user.id),
      store.list(C.transactions, { where: [{ field: 'userId', op: '==', value: user.id }] }),
      store.list(C.registrations, { where: [{ field: 'userId', op: '==', value: user.id }] }),
      store.list(C.results, { where: [{ field: 'userId', op: '==', value: user.id }] }),
      store.list(C.deposits, { where: [{ field: 'userId', op: '==', value: user.id }] }),
      store.list(C.withdrawals, { where: [{ field: 'userId', op: '==', value: user.id }] }),
    ]);
    res.json({ user: { ...userView(user, profile, wallet), passwordHash: undefined }, transactions: sortBy(txs, 'createdAt'),
      registrations: regs, results, deposits: sortBy(deposits, 'createdAt'), withdrawals: sortBy(withdrawals, 'createdAt') });
  }));
  api.post('/admin/users/:id/suspend', asyncRoute(async (req, res) => {
    const { suspended, reason } = validate(z.object({ suspended: z.boolean(), reason: z.string().max(300).optional().default('') }), req.body);
    await adminTx(req, suspended ? 'user.suspend' : 'user.reactivate', 'user', req.params.id, async (tx, a) => {
      const user = missing(await tx.get(C.users, req.params.id), 'User');
      if (user.id === a.id) bad('You cannot suspend your own admin account.');
      if (user.role === 'admin') forbidden('Admin accounts cannot be suspended from this panel.');
      await tx.put(C.users, user.id, { ...user, suspended, suspendReason: clean(reason, 300) });
      await notify(tx, user.id, { type: 'account', title: suspended ? 'Account suspended' : 'Account reactivated',
        body: suspended ? `Your account was suspended. Reason: ${clean(reason, 300) || 'Policy review'}.` : 'Your account is active again.', link: '/support' });
      return { audit: { suspended, reason } };
    });
    res.json({ ok: true });
  }));
  api.get('/admin/transactions', asyncRoute(async (req, res) => {
    requireAdmin(req);
    const q = String(req.query.q || '').toLowerCase();
    const list = await store.list(C.transactions, {});
    res.json({ transactions: sortBy(list, 'createdAt').filter((t) => !q || `${t.id} ${t.userId} ${t.type} ${t.description}`.toLowerCase().includes(q)) });
  }));
  api.post('/admin/adjustments', asyncRoute(async (req, res) => {
    const body = validate(z.object({ userId: z.string().min(1), amount: z.number().int().min(-50000000).max(50000000).refine((n) => n !== 0),
      reason: z.string().trim().min(3).max(300), bucket: z.enum(['available', 'winning']).default('available') }), req.body);
    const entry = await adminTx(req, 'wallet.adjustment', 'wallet', body.userId, async (tx) => {
      const user = missing(await tx.get(C.users, body.userId), 'User');
      const e = await ledger(tx, { userId: user.id, type: 'admin_adjustment', amount: body.amount,
        bucket: body.bucket, description: `Admin adjustment: ${clean(body.reason, 300)}`,
        key: `adjust:${uid('')}`, actor: req.actor.id, meta: { reason: body.reason } });
      await notify(tx, user.id, { type: 'wallet', title: body.amount > 0 ? 'Balance credited' : 'Balance adjusted',
        body: `${body.amount > 0 ? '+' : ''}${money(body.amount)} — ${clean(body.reason, 300)}`, link: '/wallet' });
      return { ...e, audit: { amount: body.amount, reason: body.reason, bucket: body.bucket } };
    });
    res.status(201).json({ transaction: entry });
  }));

  api.get('/admin/tournaments', asyncRoute(async (req, res) => {
    requireAdmin(req);
    const [t, rooms] = await Promise.all([store.list(C.tournaments, {}), store.list(C.rooms, {})]);
    const rMap = new Map(rooms.map((r) => [r.tournamentId, r]));
    res.json({ tournaments: sortBy(t, 'createdAt').map((x) => ({ ...x, roomId: rMap.get(x.id)?.roomId || '', roomPassword: rMap.get(x.id)?.roomPassword || '' })) });
  }));
  api.post('/admin/tournaments', asyncRoute(async (req, res) => {
    const body = validate(tournamentSchema, req.body);
    if (body.prize1 + body.prize2 + body.prize3 > body.prizePool) bad('The three rank prizes cannot exceed the prize pool.');
    const t = await adminTx(req, 'tournament.create', 'tournament', 'new', async (tx, a) => {
      const id = uid('trn_');
      const doc = { id, ...body, title: clean(body.title, 120), description: clean(body.description, 5000),
        rules: clean(body.rules, 10000), banner: safeUrl(body.banner), joinedCount: 0, roomReleased: false,
        resultPublished: false, startsAt: buildStart(body.matchDate, body.matchTime),
        createdAt: now(), updatedAt: now(), createdBy: a.id };
      delete doc.roomId; delete doc.roomPassword;
      await tx.put(C.rooms, id, { tournamentId: id, roomId: clean(body.roomId, 80), roomPassword: clean(body.roomPassword, 80), updatedAt: now() });
      await tx.put(C.tournaments, id, doc);
      return { ...doc, roomId: body.roomId, roomPassword: body.roomPassword, audit: { title: doc.title, status: doc.status, entryFee: doc.entryFee } };
    });
    res.status(201).json({ tournament: t });
  }));
  api.patch('/admin/tournaments/:id', asyncRoute(async (req, res) => {
    const body = validate(tournamentSchema.partial(), req.body);
    const t = await adminTx(req, 'tournament.update', 'tournament', req.params.id, async (tx) => {
      const old = missing(await tx.get(C.tournaments, req.params.id), 'Tournament');
      const doc = { ...old, ...body, updatedAt: now() };
      if (body.roomId !== undefined || body.roomPassword !== undefined) {
        const prevRoom = await tx.get(C.rooms, old.id) || { tournamentId: old.id, roomId: '', roomPassword: '' };
        await tx.put(C.rooms, old.id, { ...prevRoom,
          ...(body.roomId !== undefined ? { roomId: clean(body.roomId, 80) } : {}),
          ...(body.roomPassword !== undefined ? { roomPassword: clean(body.roomPassword, 80) } : {}), updatedAt: now() });
      }
      delete doc.roomId; delete doc.roomPassword;
      if (body.matchDate || body.matchTime) doc.startsAt = buildStart(doc.matchDate, doc.matchTime);
      if (doc.prize1 + doc.prize2 + doc.prize3 > doc.prizePool) bad('The three rank prizes cannot exceed the prize pool.');
      if (doc.joinedCount > Number(doc.slots)) bad('Slots cannot be lower than the number of joined players.');
      if (['live', 'completed'].includes(old.status) && body.entryFee !== undefined && body.entryFee !== old.entryFee) bad('Entry fee cannot change after a match goes live.');
      if (Number(doc.joinedCount) >= Number(doc.slots) && doc.status === 'registration_open') doc.status = 'full';
      if (old.roomReleased && !body.roomReleased && body.roomId === undefined) doc.roomReleased = old.roomReleased;
      await tx.put(C.tournaments, doc.id, doc);
      if (old.status !== doc.status || old.roomReleased !== doc.roomReleased) {
        const regs = await tx.list(C.registrations, { where: [{ field: 'tournamentId', op: '==', value: doc.id }] });
        const message = old.roomReleased !== doc.roomReleased && doc.roomReleased
          ? { type: 'room', title: 'Room credentials released', body: `${doc.title}: open the match page to view the room ID and password.`, link: `/matches/${doc.id}` }
          : { type: 'match', title: 'Match status updated', body: `${doc.title} is now ${doc.status.replace('_', ' ')}.`, link: `/matches/${doc.id}` };
        for (const r of regs.filter((x) => x.status === 'joined')) await notify(tx, r.userId, message);
      }
      return { ...doc, audit: { changes: Object.keys(body) } };
    });
    res.json({ tournament: t });
  }));
  api.delete('/admin/tournaments/:id', asyncRoute(async (req, res) => {
    await adminTx(req, 'tournament.cancel', 'tournament', req.params.id, async (tx) => {
      const t = missing(await tx.get(C.tournaments, req.params.id), 'Tournament');
      const regs = await tx.list(C.registrations, { where: [{ field: 'tournamentId', op: '==', value: t.id }] }).then((l) => l.filter((r) => r.status === 'joined'));
      await tx.put(C.tournaments, t.id, { ...t, status: 'cancelled', updatedAt: now() });
      const settings = await getSettings(tx);
      for (const r of regs) {
        const split = r.feeSplit || { fromAvailable: r.feePaid, fromWinning: 0 };
        if (split.fromAvailable) await ledger(tx, { userId: r.userId, type: 'refund', amount: split.fromAvailable, bucket: 'available',
          description: `Tournament cancelled — ${t.title}`, key: `refund:cancel:${r.id}:available`, actor: req.actor.id });
        if (split.fromWinning) await ledger(tx, { userId: r.userId, type: 'refund', amount: split.fromWinning, bucket: 'winning',
          description: `Tournament cancelled — ${t.title}`, key: `refund:cancel:${r.id}:winning`, actor: req.actor.id });
        await tx.put(C.registrations, r.id, { ...r, status: 'cancelled', cancelledAt: now(), refundAmount: r.feePaid });
        await notify(tx, r.userId, { type: 'match', title: 'Tournament cancelled', body: `${t.title} was cancelled. ${money(r.feePaid)} was refunded.`, link: '/wallet' });
      }
      return { audit: { refunded: regs.length, cancellationMinutes: settings.cancellationMinutes } };
    });
    res.json({ ok: true });
  }));
  api.get('/admin/tournaments/:id/registrations', asyncRoute(async (req, res) => {
    requireAdmin(req);
    const [regs, users, profiles] = await Promise.all([
      store.list(C.registrations, { where: [{ field: 'tournamentId', op: '==', value: req.params.id }] }),
      store.list(C.users, {}), store.list(C.profiles, {}),
    ]);
    const uMap = new Map(users.map((u) => [u.id, u])); const pMap = new Map(profiles.map((p) => [p.userId, p]));
    res.json({ registrations: sortBy(regs, 'joinedAt', 'asc').map((r) => ({ ...r,
      displayName: uMap.get(r.userId)?.displayName || 'Player', email: uMap.get(r.userId)?.email || '',
      playerId: pMap.get(r.userId)?.playerId || '' })) });
  }));
  api.post('/admin/tournaments/:id/room', asyncRoute(async (req, res) => {
    const body = validate(z.object({ roomId: z.string().trim().min(1).max(80), roomPassword: z.string().max(80).optional().default(''), release: z.boolean().default(true) }), req.body);
    await adminTx(req, 'tournament.room', 'tournament', req.params.id, async (tx) => {
      const t = missing(await tx.get(C.tournaments, req.params.id), 'Tournament');
      await tx.put(C.rooms, t.id, { tournamentId: t.id, roomId: clean(body.roomId, 80), roomPassword: clean(body.roomPassword, 80), updatedAt: now() });
      await tx.put(C.tournaments, t.id, { ...t, roomReleased: body.release, updatedAt: now() });
      if (body.release) {
        const regs = await tx.list(C.registrations, { where: [{ field: 'tournamentId', op: '==', value: t.id }] });
        for (const r of regs.filter((x) => x.status === 'joined')) await notify(tx, r.userId,
          { type: 'room', title: 'Room ID & password released', body: `${t.title}: credentials are now visible on the match page.`, link: `/matches/${t.id}` });
      }
      return { audit: { released: body.release } };
    });
    res.json({ ok: true });
  }));
  api.post('/admin/tournaments/:id/results', asyncRoute(async (req, res) => {
    const body = validate(z.object({
      results: z.array(z.object({ userId: z.string().min(1), rank: z.number().int().min(1).max(1000), prize: z.number().int().min(0).max(1000000000) })).min(1).max(200),
    }), req.body);
    const ranks = body.results.map((r) => r.rank);
    if (new Set(ranks).size !== ranks.length) bad('Each rank must be unique.');
    if (new Set(body.results.map((r) => r.userId)).size !== body.results.length) bad('A player can appear only once in the results.');
    const published = await adminTx(req, 'results.publish', 'tournament', req.params.id, async (tx, a) => {
      const t = missing(await tx.get(C.tournaments, req.params.id), 'Tournament');
      if (t.resultPublished) conflict('Results were already published and rewards distributed for this match.');
      const total = body.results.reduce((n, r) => n + r.prize, 0);
      if (total > Number(t.prizePool)) bad(`Total prizes (${money(total)}) exceed the prize pool (${money(t.prizePool)}).`);
      const regs = await tx.list(C.registrations, { where: [{ field: 'tournamentId', op: '==', value: t.id }] });
      const joined = new Set(regs.filter((r) => r.status === 'joined').map((r) => r.userId));
      const created = [];
      for (const r of body.results) {
        if (!joined.has(r.userId)) bad('Every ranked player must be a registered participant.');
        const result = { id: uid('res_'), tournamentId: t.id, userId: r.userId, rank: r.rank, prize: r.prize,
          verified: true, verifiedBy: a.id, createdAt: now(), createdBy: a.id, season: 'current' };
        await tx.put(C.results, result.id, result);
        if (r.prize > 0) await ledger(tx, { userId: r.userId, type: 'prize', amount: r.prize, bucket: 'winning',
          description: `Rank #${r.rank} prize — ${t.title}`, key: `result:${t.id}:${r.userId}`, actor: a.id,
          meta: { tournamentId: t.id, rank: r.rank } });
        await notify(tx, r.userId, { type: 'result', title: `Result published: Rank #${r.rank}`, body: `${t.title} — ${money(r.prize)} credited to your winning balance.`, link: '/results' });
        created.push(result);
      }
      await tx.put(C.tournaments, t.id, { ...t, status: 'completed', resultPublished: true, updatedAt: now() });
      return { results: created, audit: { count: created.length, totalPrize: total } };
    });
    res.status(201).json(published);
  }));

  api.get('/admin/deposits', asyncRoute(async (req, res) => {
    requireAdmin(req);
    const [deps, users] = await Promise.all([store.list(C.deposits, {}), store.list(C.users, {})]);
    const uMap = new Map(users.map((u) => [u.id, u]));
    res.json({ deposits: sortBy(deps, 'createdAt').map((d) => ({ ...d, displayName: uMap.get(d.userId)?.displayName || 'Player', email: uMap.get(d.userId)?.email || '' })) });
  }));
  api.post('/admin/deposits/:id/review', asyncRoute(async (req, res) => {
    const body = validate(z.object({ approve: z.boolean(), note: z.string().max(300).optional().default('') }), req.body);
    const out = await adminTx(req, body.approve ? 'deposit.approve' : 'deposit.reject', 'deposit', req.params.id, async (tx, a) => {
      const d = missing(await tx.get(C.deposits, req.params.id), 'Deposit');
      if (d.status !== 'pending') conflict('This deposit request has already been reviewed.');
      await tx.put(C.deposits, d.id, { ...d, status: body.approve ? 'approved' : 'rejected',
        adminNote: clean(body.note, 300), reviewedBy: a.id, reviewedAt: now() });
      await ledger(tx, { userId: d.userId, type: 'deposit_settle', amount: -d.amount, bucket: 'pending',
        description: `Deposit ${body.approve ? 'approved' : 'rejected'} — ${d.id}`, key: `deposit:${d.id}:settle`, actor: a.id });
      if (body.approve) {
        await ledger(tx, { userId: d.userId, type: 'deposit_credit', amount: d.amount, bucket: 'available',
          description: `Deposit approved — ${d.id}`, key: `deposit:${d.id}:credit`, actor: a.id, meta: { method: d.method } });
        await notify(tx, d.userId, { type: 'deposit', title: 'Deposit approved', body: `${money(d.amount)} has been credited to your available balance.`, link: '/wallet' });
      } else {
        await notify(tx, d.userId, { type: 'deposit', title: 'Deposit rejected', body: `${money(d.amount)} was not credited. ${clean(body.note, 300) || 'Contact support if you believe this is an error.'}`, link: '/deposit' });
      }
      return { audit: { approve: body.approve, amount: d.amount, note: body.note } };
    });
    res.json(out);
  }));

  api.get('/admin/withdrawals', asyncRoute(async (req, res) => {
    requireAdmin(req);
    const [wds, users] = await Promise.all([store.list(C.withdrawals, {}), store.list(C.users, {})]);
    const uMap = new Map(users.map((u) => [u.id, u]));
    res.json({ withdrawals: sortBy(wds, 'createdAt').map((w) => ({ ...w, displayName: uMap.get(w.userId)?.displayName || 'Player', email: uMap.get(w.userId)?.email || '' })) });
  }));
  api.post('/admin/withdrawals/:id/review', asyncRoute(async (req, res) => {
    const body = validate(z.object({ action: z.enum(['processing', 'paid', 'reject']), reason: z.string().max(300).optional().default('') }), req.body);
    const out = await adminTx(req, `withdrawal.${body.action}`, 'withdrawal', req.params.id, async (tx, a) => {
      const w = missing(await tx.get(C.withdrawals, req.params.id), 'Withdrawal');
      if (!['pending', 'processing'].includes(w.status)) conflict('This withdrawal has already been resolved.');
      if (body.action === 'reject') {
        const split = w.split || { fromAvailable: w.amount, fromWinning: 0 };
        await ledger(tx, { userId: w.userId, type: 'withdrawal_reversal', amount: -w.amount, bucket: 'reserved',
          description: `Withdrawal rejected — ${w.id}`, key: `wd:${w.id}:reverse:hold`, actor: a.id });
        if (split.fromAvailable) await ledger(tx, { userId: w.userId, type: 'withdrawal_reversal', amount: split.fromAvailable, bucket: 'available',
          description: `Withdrawal reversed — ${w.id}`, key: `wd:${w.id}:reverse:available`, actor: a.id });
        if (split.fromWinning) await ledger(tx, { userId: w.userId, type: 'withdrawal_reversal', amount: split.fromWinning, bucket: 'winning',
          description: `Withdrawal reversed — ${w.id}`, key: `wd:${w.id}:reverse:winning`, actor: a.id });
        await tx.put(C.withdrawals, w.id, { ...w, status: 'rejected', rejectionReason: clean(body.reason, 300), reviewedBy: a.id, reviewedAt: now() });
        await notify(tx, w.userId, { type: 'withdrawal', title: 'Withdrawal rejected', body: `${money(w.amount)} was returned to your balance. ${clean(body.reason, 300)}`, link: '/withdraw' });
      } else if (body.action === 'paid') {
        await ledger(tx, { userId: w.userId, type: 'withdrawal_paid', amount: -w.amount, bucket: 'reserved',
          description: `Withdrawal paid — ${w.id}`, key: `wd:${w.id}:paid`, actor: a.id, meta: { net: w.net, upiId: w.upiId } });
        await tx.put(C.withdrawals, w.id, { ...w, status: 'paid', reviewedBy: a.id, reviewedAt: now(), paidAt: now() });
        await notify(tx, w.userId, { type: 'withdrawal', title: 'Withdrawal paid', body: `${money(w.net)} has been sent to ${w.upiId}.`, link: '/withdraw' });
      } else {
        await tx.put(C.withdrawals, w.id, { ...w, status: 'processing', reviewedBy: a.id, reviewedAt: now() });
        await notify(tx, w.userId, { type: 'withdrawal', title: 'Withdrawal processing', body: `${money(w.amount)} is being processed by the admin team.`, link: '/withdraw' });
      }
      return { audit: { action: body.action, amount: w.amount, reason: body.reason } };
    });
    res.json(out);
  }));

  api.get('/admin/tickets', asyncRoute(async (req, res) => {
    requireAdmin(req);
    const [tickets, users, messages] = await Promise.all([store.list(C.tickets, {}), store.list(C.users, {}), store.list(C.ticketMessages, {})]);
    const uMap = new Map(users.map((u) => [u.id, u]));
    res.json({ tickets: sortBy(tickets, 'updatedAt').map((t) => ({ ...t, displayName: uMap.get(t.userId)?.displayName || 'Player',
      email: uMap.get(t.userId)?.email || '', messageCount: messages.filter((m) => m.ticketId === t.id).length })) });
  }));
  api.get('/admin/tickets/:id', asyncRoute(async (req, res) => apiSupportTicket(req, res)));
  api.post('/admin/tickets/:id/reply', asyncRoute(async (req, res) => {
    const body = validate(z.object({ message: z.string().trim().min(1).max(4000), status: z.enum(['open', 'resolved', 'closed']).optional() }), req.body);
    const m = await adminTx(req, 'ticket.reply', 'ticket', req.params.id, async (tx, a) => {
      const t = missing(await tx.get(C.tickets, req.params.id), 'Ticket');
      const msg = { id: uid('msg_'), ticketId: t.id, senderId: a.id, senderRole: 'admin',
        message: clean(body.message, 4000), attachment: '', createdAt: now() };
      await tx.put(C.ticketMessages, msg.id, msg);
      await tx.put(C.tickets, t.id, { ...t, status: body.status || 'resolved', updatedAt: now(), lastReplyAt: now() });
      await notify(tx, t.userId, { type: 'support', title: 'Admin replied to your ticket', body: `${t.subject}: ${clean(body.message, 120)}`, link: `/support/${t.id}` });
      return { ...msg, audit: { status: body.status || 'resolved' } };
    });
    res.status(201).json({ message: m });
  }));
  api.post('/admin/tickets/:id/status', asyncRoute(async (req, res) => {
    const { status } = validate(z.object({ status: z.enum(['open', 'resolved', 'closed']) }), req.body);
    await adminTx(req, 'ticket.status', 'ticket', req.params.id, async (tx) => {
      const t = missing(await tx.get(C.tickets, req.params.id), 'Ticket');
      await tx.put(C.tickets, t.id, { ...t, status, updatedAt: now() });
      await notify(tx, t.userId, { type: 'support', title: 'Ticket status updated', body: `${t.subject} is now ${status}.`, link: `/support/${t.id}` });
      return { audit: { status } };
    });
    res.json({ ok: true });
  }));

  api.get('/admin/settings', asyncRoute(async (req, res) => { requireAdmin(req); res.json({ settings: await getSettings(store) }); }));
  api.put('/admin/settings', asyncRoute(async (req, res) => {
    const body = validate(z.object({
      appName: z.string().max(60).optional(), tagline: z.string().max(120).optional(),
      mode: z.enum(['practice', 'real']).optional(), legalVerified: z.boolean().optional(),
      paymentProviderVerified: z.boolean().optional(), termsUrl: z.string().max(300).optional(),
      complianceNote: z.string().max(500).optional(), minAge: z.number().int().min(13).max(21).optional(),
      allowedRegions: z.array(z.string().max(60)).max(200).optional(), blockedRegions: z.array(z.string().max(60)).max(200).optional(),
      responsiblePlay: z.object({ dailyDepositLimit: z.number().int().min(0), monthlyDepositLimit: z.number().int().min(0), selfExclusionDays: z.number().int().min(1).max(365) }).partial().optional(),
      paymentMethods: z.array(z.object({ id: z.string().max(30), label: z.string().max(60), enabled: z.boolean(), upiId: z.string().max(80).optional(), qrUrl: z.string().max(700).optional(), note: z.string().max(500).optional() })).max(20).optional(),
      depositAmounts: z.array(z.number().int().min(100).max(50000000)).max(20).optional(),
      minDeposit: z.number().int().min(100).optional(), maxDeposit: z.number().int().min(100).optional(),
      minWithdrawal: z.number().int().min(100).optional(), maxWithdrawal: z.number().int().min(100).optional(),
      withdrawalFeePercent: z.number().min(0).max(25).optional(), withdrawalFeeFlat: z.number().int().min(0).max(100000).optional(),
      allowWinningForEntry: z.boolean().optional(), allowWinningWithdrawal: z.boolean().optional(),
      requireEmailVerification: z.boolean().optional(), cancellationMinutes: z.number().int().min(0).max(10080).optional(),
      cancellationFeePercent: z.number().min(0).max(100).optional(), categories: z.array(z.string().max(60)).max(40).optional(),
      faq: z.array(z.object({ q: z.string().max(300), a: z.string().max(1500) })).max(60).optional(),
      contact: z.object({ email: z.string().max(120), telegram: z.string().max(120), discord: z.string().max(120), whatsapp: z.string().max(120), hours: z.string().max(120) }).partial().optional(),
      announcement: z.string().max(600).optional(),
    }), req.body);
    const s = await adminTx(req, 'settings.update', 'settings', 'app', async (tx) => {
      const old = await getSettings(tx);
      const next = { ...old, ...body, responsiblePlay: { ...old.responsiblePlay, ...(body.responsiblePlay || {}) },
        contact: { ...old.contact, ...(body.contact || {}) }, updatedAt: now() };
      if (next.mode === 'real' && (!next.legalVerified || !next.paymentProviderVerified || !next.termsUrl)) {
        bad('Real-money mode requires legal verification, payment-provider verification and a published terms URL.');
      }
      if (next.minDeposit > next.maxDeposit || next.minWithdrawal > next.maxWithdrawal) bad('Minimum limits cannot exceed maximum limits.');
      await tx.put(C.settings, 'app', next);
      return { ...next, audit: { changes: Object.keys(body), mode: next.mode } };
    });
    res.json({ settings: { ...s, audit: undefined } });
  }));

  api.get('/admin/banners', asyncRoute(async (req, res) => { requireAdmin(req); res.json({ banners: sortBy(await store.list(C.banners, {}), 'createdAt') }); }));
  api.post('/admin/banners', asyncRoute(async (req, res) => {
    const body = validate(z.object({ title: z.string().trim().min(2).max(100), image: z.string().max(700), link: z.string().max(300).optional().default(''), active: z.boolean().optional().default(true) }), req.body);
    const b = await adminTx(req, 'banner.create', 'banner', 'new', async (tx) => {
      const doc = { id: uid('bnr_'), title: clean(body.title, 100), image: safeUrl(body.image), link: clean(body.link, 300), active: body.active, createdAt: now(), createdBy: req.actor.id };
      await tx.put(C.banners, doc.id, doc); return { ...doc, audit: { title: doc.title } };
    });
    res.status(201).json({ banner: b });
  }));
  api.patch('/admin/banners/:id', asyncRoute(async (req, res) => {
    const body = validate(z.object({ title: z.string().max(100).optional(), image: z.string().max(700).optional(), link: z.string().max(300).optional(), active: z.boolean().optional() }), req.body);
    await adminTx(req, 'banner.update', 'banner', req.params.id, async (tx) => {
      const b = missing(await tx.get(C.banners, req.params.id), 'Banner');
      await tx.put(C.banners, b.id, { ...b, ...body, image: body.image !== undefined ? safeUrl(body.image) : b.image, updatedAt: now() });
      return { audit: { changes: Object.keys(body) } };
    });
    res.json({ ok: true });
  }));
  api.delete('/admin/banners/:id', asyncRoute(async (req, res) => {
    await adminTx(req, 'banner.delete', 'banner', req.params.id, async (tx) => { await tx.del(C.banners, req.params.id); return { audit: {} }; });
    res.json({ ok: true });
  }));
  api.get('/admin/announcements', asyncRoute(async (req, res) => { requireAdmin(req); res.json({ announcements: sortBy(await store.list(C.announcements, {}), 'createdAt') }); }));
  api.post('/admin/announcements', asyncRoute(async (req, res) => {
    const body = validate(z.object({ title: z.string().trim().min(2).max(120), body: z.string().trim().min(2).max(2000), broadcast: z.boolean().optional().default(true) }), req.body);
    const a = await adminTx(req, 'announcement.create', 'announcement', 'new', async (tx, admin) => {
      const doc = { id: uid('ann_'), title: clean(body.title, 120), body: clean(body.body, 2000), createdAt: now(), createdBy: admin.id };
      await tx.put(C.announcements, doc.id, doc);
      if (body.broadcast) {
        const users = await tx.list(C.users, { where: [{ field: 'role', op: '==', value: 'user' }] });
        for (const u of users) await notify(tx, u.id, { type: 'announcement', title: doc.title, body: doc.body, link: '/notifications' });
      }
      return { ...doc, audit: { broadcast: body.broadcast } };
    });
    res.status(201).json({ announcement: a });
  }));
  api.delete('/admin/announcements/:id', asyncRoute(async (req, res) => {
    await adminTx(req, 'announcement.delete', 'announcement', req.params.id, async (tx) => { await tx.del(C.announcements, req.params.id); return { audit: {} }; });
    res.json({ ok: true });
  }));
  api.get('/admin/logs', asyncRoute(async (req, res) => {
    requireAdmin(req);
    res.json({ logs: sortBy(await store.list(C.adminLogs, {}), 'createdAt').slice(0, 500) });
  }));
  api.post('/admin/notifications/broadcast', asyncRoute(async (req, res) => {
    const body = validate(z.object({ title: z.string().trim().min(2).max(120), body: z.string().trim().min(2).max(1000), audience: z.enum(['all', 'players', 'admins']).default('players') }), req.body);
    const count = await adminTx(req, 'notification.broadcast', 'notification', '*', async (tx) => {
      const users = await tx.list(C.users, {});
      const targets = users.filter((u) => body.audience === 'all' || (body.audience === 'players' ? u.role === 'user' : u.role === 'admin'));
      for (const u of targets) await notify(tx, u.id, { type: 'announcement', title: clean(body.title, 120), body: clean(body.body, 1000), link: '/notifications' });
      return { count: targets.length, audit: { audience: body.audience, count: targets.length } };
    });
    res.json({ count: count.count });
  }));

  async function apiSupportTicket(req, res) {
    requireAdmin(req);
    const t = missing(await store.get(C.tickets, req.params.id), 'Ticket');
    const [messages, user] = await Promise.all([store.list(C.ticketMessages, {}), store.get(C.users, t.userId)]);
    res.json({ ticket: { ...t, displayName: user?.displayName || 'Player', email: user?.email || '' },
      messages: sortBy(messages.filter((m) => m.ticketId === t.id), 'createdAt', 'asc') });
  }

  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }));
  // Also mount at the root so a Cloud Functions URL /api/<function>/me works alongside Hosting rewrites.
  app.use(api);
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError || err.status) {
      return res.status(err.status || 400).json({ error: err.message, details: err.details });
    }
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    console.error('[api error]', err);
    return res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
  });
  return app;
}
