/**
 * Shared, backend-agnostic business logic.
 * Everything financial lives here and runs inside an atomic store transaction.
 * The SQLite adapter and the Cloud Functions/Firestore adapter both consume it.
 */
import { uid, now, txnId, playerId as makePlayerId, bad, conflict, forbidden, notFound, HttpError, money, ageFrom } from './utils.js';

export const C = {
  users: 'users', profiles: 'profiles', wallets: 'wallets', transactions: 'transactions',
  tournaments: 'tournaments', registrations: 'registrations', results: 'results',
  deposits: 'deposits', withdrawals: 'withdrawals', notifications: 'notifications',
  tickets: 'tickets', ticketMessages: 'ticketMessages', settings: 'settings',
  banners: 'banners', announcements: 'announcements', adminLogs: 'adminLogs',
  tokens: 'tokens', outbox: 'outbox', deletionRequests: 'deletionRequests', rooms: 'rooms', reminders: 'reminders',
};

export const DEFAULT_SETTINGS = {
  appName: 'Nexus Arena',
  tagline: 'Compete. Conquer. Collect.',
  // ── Legal compliance: real-money contests are OFF until an admin attests ──
  mode: 'practice',                 // 'practice' | 'real'
  legalVerified: false,
  paymentProviderVerified: false,
  termsUrl: '',
  complianceNote: 'Practice mode: all balances are platform credits with no cash value. No real-money contests are active.',
  minAge: 18,
  allowedRegions: [],              // empty = all regions allowed in practice mode
  blockedRegions: ['AN', 'Sikkim', 'Assam', 'Odisha', 'Telangana', 'Andhra Pradesh', 'Arunachal Pradesh', 'Nagaland'],
  responsiblePlay: { dailyDepositLimit: 1000000, monthlyDepositLimit: 10000000, selfExclusionDays: 30 },
  // ── Payments ──
  paymentMethods: [
    { id: 'upi', label: 'UPI', enabled: true, upiId: '', qrUrl: '', note: 'Pay to the UPI ID configured by the admin, then submit the reference number below.' },
    { id: 'bank', label: 'Bank transfer', enabled: false, note: '' },
  ],
  depositAmounts: [10000, 30000, 50000, 100000, 200000, 500000], // paise
  minDeposit: 10000, maxDeposit: 50000000,
  minWithdrawal: 20000, maxWithdrawal: 5000000,
  withdrawalFeePercent: 0, withdrawalFeeFlat: 0,
  allowWinningForEntry: false, allowWinningWithdrawal: true,
  requireEmailVerification: false,
  cancellationMinutes: 30, cancellationFeePercent: 0,
  // ── Content ──
  categories: ['Battle Royale', 'Clash Squad', 'Lone Wolf', 'Team Deathmatch'],
  faq: [
    { q: 'How do I join a tournament?', a: 'Open All Matches, choose a tournament with open registration, review the rules and tap Join Match. The entry fee is deducted from your available balance.' },
    { q: 'When do I get the room ID and password?', a: 'The admin releases room credentials shortly before the match starts. They appear on the match page only for registered players.' },
    { q: 'How are winnings credited?', a: 'After results are verified and published, prize credits are added to your Winning balance and appear in your transaction ledger.' },
    { q: 'How long do deposits take?', a: 'Deposits are reviewed manually by an admin. A screenshot alone never credits your wallet.' },
    { q: 'What is practice mode?', a: 'Balances are platform credits with no cash value. Real-money contests are disabled until legality and payment providers are verified by the operator.' },
  ],
  contact: { email: '', telegram: '', discord: '', whatsapp: '', hours: '10:00 – 22:00 IST' },
  announcement: '',
  updatedAt: '1970-01-01T00:00:00.000Z',
};

export async function getSettings(store) {
  const doc = await store.get(C.settings, 'app');
  return { ...DEFAULT_SETTINGS, ...(doc || {}), responsiblePlay: { ...DEFAULT_SETTINGS.responsiblePlay, ...(doc?.responsiblePlay || {}) } };
}

export function publicSettings(s) {
  return {
    appName: s.appName, tagline: s.tagline, mode: s.mode, complianceNote: s.complianceNote,
    minAge: s.minAge, blockedRegions: s.blockedRegions, allowedRegions: s.allowedRegions,
    termsUrl: s.termsUrl, legalVerified: s.legalVerified, paymentProviderVerified: s.paymentProviderVerified,
    paymentMethods: (s.paymentMethods || []).filter((m) => m.enabled),
    depositAmounts: s.depositAmounts, minDeposit: s.minDeposit, maxDeposit: s.maxDeposit,
    minWithdrawal: s.minWithdrawal, maxWithdrawal: s.maxWithdrawal,
    withdrawalFeePercent: s.withdrawalFeePercent, withdrawalFeeFlat: s.withdrawalFeeFlat,
    cancellationMinutes: s.cancellationMinutes, categories: s.categories, faq: s.faq,
    contact: s.contact, announcement: s.announcement, requireEmailVerification: s.requireEmailVerification,
    responsiblePlay: s.responsiblePlay, updatedAt: s.updatedAt,
  };
}

export function complianceCheck(s, user) {
  if (s.mode !== 'real') return;
  if (!s.legalVerified || !s.paymentProviderVerified || !s.termsUrl) {
    throw new HttpError(403, 'Real-money contests are disabled: legal verification, payment-provider verification and a terms URL are required in Admin → Settings.');
  }
  if (user?.birthDate) {
    const age = ageFrom(user.birthDate);
    if (age < (s.minAge || 18)) throw new HttpError(403, `You must be at least ${s.minAge || 18} years old to enter paid contests.`);
  }
  const region = String(user?.region || '');
  if (region && (s.blockedRegions || []).some((r) => r.toLowerCase() === region.toLowerCase())) {
    throw new HttpError(403, 'Paid contests are not available in your region.');
  }
  if ((s.allowedRegions || []).length && region && !s.allowedRegions.some((r) => r.toLowerCase() === region.toLowerCase())) {
    throw new HttpError(403, 'Paid contests are not available in your region yet.');
  }
  if (user?.selfExcludedUntil && new Date(user.selfExcludedUntil) > new Date()) {
    throw new HttpError(403, 'Self-exclusion is active on this account. It lifts automatically after the chosen period.');
  }
}

export function newUser({ id, email, displayName, username, role = 'user', emailVerified = false, region = '', birthDate = '', passwordHash = '', provider = 'password' }) {
  const t = now();
  return {
    id, email, displayName, username, role, emailVerified, region, birthDate,
    passwordHash, provider, suspended: false, suspendReason: '', tokenVersion: 1,
    deletionRequested: false, selfExcludedUntil: '', createdAt: t, lastLoginAt: t,
  };
}

export async function ensureUser(tx, { id, email, displayName, role = 'user', emailVerified = false }) {
  let user = await tx.get(C.users, id);
  if (!user) {
    const base = String(email || 'player').split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 18) || 'player';
    user = newUser({ id, email, displayName: displayName || base, username: `${base}_${id.slice(0, 4)}`, role, emailVerified, provider: 'firebase' });
    await tx.put(C.users, id, user);
    await tx.put(C.profiles, id, {
      userId: id, avatar: '', banner: '', bio: '', playerId: makePlayerId(),
      phone: '', social: {}, createdAt: now(), updatedAt: now(),
    });
    await tx.put(C.wallets, id, emptyWallet(id));
    await notify(tx, id, { type: 'welcome', title: 'Welcome to Nexus Arena', body: 'Your account and wallet are ready. Check the upcoming matches to get started.', link: '/matches' });
  }
  return user;
}

export const emptyWallet = (userId) => ({
  userId, available: 0, winning: 0, pending: 0, reserved: 0,
  totalDeposited: 0, totalWinnings: 0, totalEntryFees: 0, totalWithdrawn: 0,
  updatedAt: now(),
});

export async function getWallet(tx, userId) {
  const w = await tx.get(C.wallets, userId) || emptyWallet(userId);
  return { ...w, available: Number(w.available || 0), winning: Number(w.winning || 0), pending: Number(w.pending || 0), reserved: Number(w.reserved || 0) };
}

export function userView(user, profile, wallet) {
  if (!user) return null;
  return {
    id: user.id, email: user.email, displayName: user.displayName, username: user.username,
    role: user.role, emailVerified: !!user.emailVerified, suspended: !!user.suspended,
    suspendReason: user.suspendReason || '', region: user.region || '', birthDate: user.birthDate || '',
    createdAt: user.createdAt, lastLoginAt: user.lastLoginAt, deletionRequested: !!user.deletionRequested,
    selfExcludedUntil: user.selfExcludedUntil || '', provider: user.provider || 'password',
    avatar: profile?.avatar || '', playerId: profile?.playerId || '', bio: profile?.bio || '',
    phone: profile?.phone || '', banner: profile?.banner || '',
    wallet: wallet ? {
      available: wallet.available || 0, winning: wallet.winning || 0,
      pending: wallet.pending || 0, reserved: wallet.reserved || 0,
      totalDeposited: wallet.totalDeposited || 0, totalWinnings: wallet.totalWinnings || 0,
      totalEntryFees: wallet.totalEntryFees || 0, totalWithdrawn: wallet.totalWithdrawn || 0,
    } : null,
  };
}

/**
 * Append-only ledger. Every balance change goes through here.
 * `key` is an idempotency key: the same operation can never be applied twice.
 */
export async function ledger(tx, { userId, type, amount, bucket = 'available', description, key, actor = 'system', meta = {} }) {
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt === 0) bad('Invalid ledger amount');
  const existing = await tx.list(C.transactions, { where: [{ field: 'key', op: '==', value: key }] });
  if (existing.length) conflict('This transaction has already been processed.');
  const wallet = await getWallet(tx, userId);
  const next = { ...wallet };
  next[bucket] = Number(next[bucket] || 0) + amt;
  if (next[bucket] < 0) throw new HttpError(409, `Insufficient ${bucket} balance (${money(wallet[bucket])} available).`);
  if (type === 'deposit_credit') next.totalDeposited = Number(next.totalDeposited || 0) + (amt > 0 ? amt : 0);
  if (type === 'prize') next.totalWinnings = Number(next.totalWinnings || 0) + (amt > 0 ? amt : 0);
  if (type === 'entry_fee') next.totalEntryFees = Number(next.totalEntryFees || 0) + (amt < 0 ? -amt : 0);
  if (type === 'withdrawal_paid') next.totalWithdrawn = Number(next.totalWithdrawn || 0) + (amt < 0 ? -amt : 0);
  next.updatedAt = now();
  const entry = {
    id: txnId(), userId, type, amount: amt, bucket, balanceAfter: next,
    description, key, actor, meta, createdAt: now(),
  };
  await tx.put(C.transactions, entry.id, entry);
  await tx.put(C.wallets, userId, next);
  return entry;
}

/** Spend from available (and optionally winning) balance; returns the split. */
export function spendSplit(wallet, amount, allowWinning) {
  const fromAvailable = Math.min(wallet.available, amount);
  const fromWinning = allowWinning ? Math.min(wallet.winning, amount - fromAvailable) : 0;
  if (fromAvailable + fromWinning < amount) {
    throw new HttpError(409, `Insufficient balance. Need ${money(amount)}, you have ${money(wallet.available + (allowWinning ? wallet.winning : 0))} withdrawable.`);
  }
  return { fromAvailable, fromWinning };
}

export async function notify(tx, userId, { type, title, body, link = '' }) {
  const n = { id: uid('nt_'), userId, type, title, body, link, read: false, createdAt: now() };
  await tx.put(C.notifications, n.id, n);
  return n;
}

export async function notifyAdmins(tx, { type, title, body, link = '/admin' }) {
  const admins = await tx.list(C.users, { where: [{ field: 'role', op: '==', value: 'admin' }] });
  for (const a of admins) await notify(tx, a.id, { type, title, body, link });
}

export async function logAdmin(tx, actor, action, entity, entityId, details = {}) {
  const entry = {
    id: uid('log_'), adminId: actor?.id || 'system', adminEmail: actor?.email || 'system',
    action, entity, entityId: String(entityId || ''), details, createdAt: now(),
  };
  await tx.put(C.adminLogs, entry.id, entry);
  return entry;
}

export const requireUser = (req) => {
  if (!req.actor) { const e = new HttpError(401, 'Please sign in to continue'); throw e; }
  if (req.actor.suspended) forbidden('This account is suspended. Contact support for help.');
  return req.actor;
};
export const requireAdmin = (req) => {
  const u = requireUser(req);
  if (u.role !== 'admin') forbidden('Admin access required.');
  return u;
};
export const missing = (value, label = 'Resource') => { if (!value) notFound(`${label} not found`); return value; };

/** Strip private room credentials unless the viewer is an eligible registered player. */
export function tournamentView(t, { isAdmin = false, registered = false } = {}) {
  const out = { ...t };
  const released = !!t.roomReleased && (registered || isAdmin);
  if (!released) { delete out.roomId; delete out.roomPassword; }
  out.roomReleased = !!t.roomReleased;
  out.roomVisible = released;
  return out;
}
