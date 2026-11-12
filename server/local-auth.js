/** Local backend authentication: bcrypt + signed JWT, admin bootstrap, email verification. */
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import {
  HttpError, validate, clean, uid, now, sha256, randomToken, emailSchema,
  passwordSchema, ageFrom, rateLimiter, asyncRoute as wrap, bad, conflict, forbidden,
} from '../shared/utils.js';
import { C, getSettings, newUser, ensureUser, userView, notify, logAdmin, requireUser } from '../shared/domain.js';
import { playerId } from '../shared/utils.js';

export function createLocalAuth({ store, jwtSecret }) {
  const sign = (user, remember = false) => jwt.sign(
    { sub: user.id, role: user.role, tv: user.tokenVersion, email: user.email },
    jwtSecret, { expiresIn: remember ? '30d' : '7d', issuer: 'nexus-arena', audience: 'nexus-arena-web' },
  );

  async function authenticate(req) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return null;
    let payload;
    try { payload = jwt.verify(token, jwtSecret, { issuer: 'nexus-arena', audience: 'nexus-arena-web' }); }
    catch { return null; }
    const user = await store.get(C.users, payload.sub);
    if (!user || user.tokenVersion !== payload.tv || user.suspended === undefined) return null;
    return { id: user.id, email: user.email, role: user.role, suspended: !!user.suspended,
      emailVerified: !!user.emailVerified, region: user.region, birthDate: user.birthDate,
      selfExcludedUntil: user.selfExcludedUntil, provider: 'password' };
  }

  async function issueTokenFor(user, res, remember = false) {
    const [profile, wallet] = await Promise.all([store.get(C.profiles, user.id), store.get(C.wallets, user.id)]);
    return { token: sign(user, remember), user: userView(user, profile, wallet) };
  }

  function buildAuthRouter({ store: s, mailer, config: cfg = {}, changed = () => {} }) {
    const r = express.Router();
    const appUrl = (pathName) => `${cfg.appUrl || ''}${pathName}`;

    const createVerification = async (tx, user, type = 'verify') => {
      const token = randomToken();
      const entry = { id: uid('tok_'), userId: user.id, type, tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + (type === 'reset' ? 60 : 1440) * 60000).toISOString(),
        usedAt: '', createdAt: now() };
      await tx.put(C.tokens, entry.id, entry);
      const isReset = type === 'reset';
      await mailer.send({
        to: user.email,
        subject: isReset ? 'Reset your Nexus Arena password' : 'Verify your Nexus Arena email',
        text: isReset
          ? `Hello ${user.displayName},\n\nUse this token to reset your password: ${token}\nOpen ${appUrl('/reset-password')} and paste it. It expires in 60 minutes.\n\nIf you did not request this, ignore this email.`
          : `Welcome to Nexus Arena, ${user.displayName}!\n\nYour verification token is: ${token}\nOpen ${appUrl('/verify-email')} and paste it. It expires in 24 hours.`,
      });
      return token;
    };

    r.post('/register', rateLimiter({ max: 8 }), wrap(async (req, res) => {
      const body = validate(z.object({
        email: emailSchema, password: passwordSchema,
        displayName: z.string().trim().min(2).max(40),
        username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/, 'Use 3–24 letters, numbers or underscores').optional(),
        playerId: z.string().trim().min(3).max(24).optional(),
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth'),
        region: z.string().max(60).optional().default(''),
        acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Please accept the terms and confirm you are eligible' }) }),
        remember: z.boolean().optional().default(false),
      }), req.body);
      const settings = await getSettings(s);
      if (ageFrom(body.birthDate) < Number(settings.minAge || 18)) throw new HttpError(403, `You must be at least ${settings.minAge || 18} years old to create an account.`);
      const user = await s.tx(async (tx) => {
        const existing = await tx.list(C.users, { where: [{ field: 'email', op: '==', value: body.email }] });
        if (existing.length) conflict('An account with this email already exists.');
        const username = body.username || `${body.email.split('@')[0].replace(/[^a-z0-9_]/g, '').slice(0, 16) || 'player'}${Math.floor(Math.random() * 9000 + 1000)}`;
        if ((await tx.list(C.users, { where: [{ field: 'username', op: '==', value: username }] })).length) conflict('That username is already taken.');
        if (body.playerId && (await tx.list(C.profiles, { where: [{ field: 'playerId', op: '==', value: body.playerId }] })).length) conflict('That Player ID is already in use.');
        const id = uid('usr_');
        const doc = newUser({ id, email: body.email, displayName: clean(body.displayName, 40), username,
          passwordHash: bcrypt.hashSync(body.password, 10), birthDate: body.birthDate, region: clean(body.region, 60),
          emailVerified: false });
        await tx.put(C.users, id, doc);
        await tx.put(C.profiles, id, { userId: id, playerId: body.playerId || playerId(), avatar: '', banner: '', bio: '', phone: '', social: {}, createdAt: now(), updatedAt: now() });
        await tx.put(C.wallets, id, { userId: id, available: 0, winning: 0, pending: 0, reserved: 0,
          totalDeposited: 0, totalWinnings: 0, totalEntryFees: 0, totalWithdrawn: 0, updatedAt: now() });
        await tx.put(C.tokens, `${id}_consent`, { id: `${id}_consent`, userId: id, type: 'consent', termsAcceptedAt: now(), minAge: settings.minAge, createdAt: now() });
        await notify(tx, id, { type: 'welcome', title: 'Welcome to Nexus Arena', body: 'Your account is ready. Verify your email and explore the upcoming matches.', link: '/dashboard' });
        await createVerification(tx, doc);
        return doc;
      });
      changed(user.id);
      res.status(201).json(await issueTokenFor(user, res, body.remember));
    }));

    r.post('/login', rateLimiter({ max: 10 }), wrap(async (req, res) => {
      const { email, password, remember } = validate(z.object({ email: emailSchema, password: z.string().min(1).max(128), remember: z.boolean().optional().default(false) }), req.body);
      const user = (await s.list(C.users, { where: [{ field: 'email', op: '==', value: email }] }))[0];
      if (!user || !bcrypt.compareSync(password, user.passwordHash || '')) throw new HttpError(401, 'Incorrect email or password.');
      if (user.suspended) forbidden('This account is suspended. Contact support for help.');
      await s.tx(async (tx) => tx.put(C.users, user.id, { ...user, lastLoginAt: now() }));
      changed(user.id);
      res.json(await issueTokenFor({ ...user, lastLoginAt: now() }, res, remember));
    }));

    // Deliberately separate from the player login; checks the admin role server-side.
    r.post('/admin/login', rateLimiter({ max: 5, windowMs: 300000 }), wrap(async (req, res) => {
      const { email, password, remember } = validate(z.object({ email: emailSchema, password: z.string().min(1).max(128), remember: z.boolean().optional().default(false) }), req.body);
      const user = (await s.list(C.users, { where: [{ field: 'email', op: '==', value: email }] }))[0];
      if (!user || user.role !== 'admin' || !bcrypt.compareSync(password, user.passwordHash || '')) throw new HttpError(401, 'Incorrect admin credentials.');
      if (user.suspended) forbidden('This admin account is suspended.');
      await s.tx(async (tx) => { await tx.put(C.users, user.id, { ...user, lastLoginAt: now() }); await logAdmin(tx, { id: user.id, email: user.email }, 'admin.login', 'session', user.id, {}); });
      changed(user.id);
      res.json(await issueTokenFor({ ...user, lastLoginAt: now() }, res, remember));
    }));

    r.post('/logout', wrap(async (req, res) => {
      const actor = requireUser(req);
      const user = await s.get(C.users, actor.id);
      if (user) await s.tx(async (tx) => tx.put(C.users, user.id, { ...user, tokenVersion: Number(user.tokenVersion || 1) + 1 }));
      res.json({ ok: true });
    }));

    r.post('/forgot-password', rateLimiter({ max: 5, windowMs: 300000 }), wrap(async (req, res) => {
      const { email } = validate(z.object({ email: emailSchema }), req.body);
      const user = (await s.list(C.users, { where: [{ field: 'email', op: '==', value: email }] }))[0];
      if (user) await s.tx(async (tx) => { await createVerification(tx, user, 'reset'); });
      res.json({ ok: true, message: 'If an account exists for that email, a reset token has been sent.' });
    }));

    r.post('/reset-password', rateLimiter({ max: 8 }), wrap(async (req, res) => {
      const { token, password } = validate(z.object({ token: z.string().min(10).max(200), password: passwordSchema }), req.body);
      await s.tx(async (tx) => {
        const entry = (await tx.list(C.tokens, { where: [{ field: 'tokenHash', op: '==', value: sha256(token) }] })).find((t) => t.type === 'reset');
        if (!entry || entry.usedAt || Date.parse(entry.expiresAt) < Date.now()) bad('This reset link is invalid or has expired.');
        const user = await tx.get(C.users, entry.userId);
        if (!user) bad('This reset link is invalid.');
        await tx.put(C.tokens, entry.id, { ...entry, usedAt: now() });
        await tx.put(C.users, user.id, { ...user, passwordHash: bcrypt.hashSync(password, 10), tokenVersion: Number(user.tokenVersion || 1) + 1 });
        await notify(tx, user.id, { type: 'account', title: 'Password changed', body: 'Your password was reset. All previous sessions were signed out.', link: '/login' });
        changed(user.id);
      });
      res.json({ ok: true });
    }));

    r.post('/verify-email', wrap(async (req, res) => {
      const { token } = validate(z.object({ token: z.string().min(10).max(200) }), req.body);
      await s.tx(async (tx) => {
        const entry = (await tx.list(C.tokens, { where: [{ field: 'tokenHash', op: '==', value: sha256(token) }] })).find((t) => t.type === 'verify');
        if (!entry || entry.usedAt || Date.parse(entry.expiresAt) < Date.now()) bad('This verification link is invalid or has expired.');
        const user = await tx.get(C.users, entry.userId);
        if (!user) bad('This verification link is invalid.');
        await tx.put(C.tokens, entry.id, { ...entry, usedAt: now() });
        await tx.put(C.users, user.id, { ...user, emailVerified: true });
        await notify(tx, user.id, { type: 'account', title: 'Email verified', body: 'Your email address is now verified.', link: '/profile' });
        changed(user.id);
      });
      res.json({ ok: true });
    }));

    r.post('/resend-verification', wrap(async (req, res) => {
      const actor = requireUser(req);
      const user = await s.get(C.users, actor.id);
      if (!user) throw new HttpError(401, 'Account not found');
      if (user.emailVerified) conflict('Your email is already verified.');
      await s.tx(async (tx) => { await createVerification(tx, user, 'verify'); });
      res.json({ ok: true, message: 'A new verification token has been sent.' });
    }));

    r.post('/change-password', wrap(async (req, res) => {
      const actor = requireUser(req);
      const { oldPassword, newPassword } = validate(z.object({ oldPassword: z.string().min(1), newPassword: passwordSchema }), req.body);
      const user = await s.get(C.users, actor.id);
      if (!user?.passwordHash || !bcrypt.compareSync(oldPassword, user.passwordHash)) bad('Current password is incorrect.');
      await s.tx(async (tx) => {
        await tx.put(C.users, user.id, { ...user, passwordHash: bcrypt.hashSync(newPassword, 10), tokenVersion: Number(user.tokenVersion || 1) + 1 });
        await notify(tx, user.id, { type: 'account', title: 'Password changed', body: 'All sessions were signed out. Please sign in again.', link: '/login' });
      });
      changed(user.id);
      res.json({ ok: true, message: 'Password changed. Please sign in again.' });
    }));

    // Optional Google Identity Services. Only mounted when a client ID is configured.
    r.post('/google', rateLimiter({ max: 8 }), wrap(async (req, res) => {
      if (!cfg.googleClientId) throw new HttpError(501, 'Google sign-in is not configured. Add GOOGLE_CLIENT_ID to enable it.');
      const { credential } = validate(z.object({ credential: z.string().min(20).max(5000) }), req.body);
      const { OAuth2Client } = await import('google-auth-library');
      const client = new OAuth2Client(cfg.googleClientId);
      const ticket = await client.verifyIdToken({ idToken: credential, audience: cfg.googleClientId });
      const p = ticket.getPayload();
      if (!p?.email) bad('Google did not return an email address.');
      const email = p.email.toLowerCase();
      let user = (await s.list(C.users, { where: [{ field: 'email', op: '==', value: email }] }))[0];
      if (!user) {
        const id = uid('usr_');
        user = newUser({ id, email, displayName: clean(p.name || email.split('@')[0], 40).slice(0, 40) || 'Player',
          username: `${email.split('@')[0].replace(/[^a-z0-9_]/g, '').slice(0, 16)}${Math.floor(Math.random() * 9000 + 1000)}`,
          emailVerified: !!p.email_verified, provider: 'google' });
        await s.tx(async (tx) => { await ensureUser(tx, { id, email, displayName: user.displayName, emailVerified: user.emailVerified }); });
      }
      if (user.suspended) forbidden('This account is suspended.');
      res.json(await issueTokenFor(user, res, true));
    }));

    // Dev-only outbox: lets a local operator complete verification/reset without SMTP.
    if (cfg.devTokens) {
      r.get('/dev/outbox', wrap(async (req, res) => {
        const list = (await s.list(C.outbox, {})).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
        res.json({ messages: list.map((m) => ({ ...m, token: (m.text.match(/([a-f0-9]{64})/) || [])[1] || '' })),
          hint: 'Local dev outbox only. Configure SMTP for production.' });
      }));
    }
    return r;
  }

  return { mode: 'local', authenticate, buildAuthRouter, sign, createAdmin };

  async function createAdmin({ email, password, displayName = 'Administrator' }) {
    const normalized = String(email).trim().toLowerCase();
    const existing = (await store.list(C.users, { where: [{ field: 'email', op: '==', value: normalized }] }))[0];
    if (existing) {
      if (existing.role !== 'admin') throw new Error(`Account ${normalized} exists but is not an admin.`);
      await store.tx(async (tx) => tx.put(C.users, existing.id, { ...existing, passwordHash: bcrypt.hashSync(password, 10), suspended: false, tokenVersion: Number(existing.tokenVersion || 1) + 1 }));
      return existing.id;
    }
    const id = uid('adm_');
    await store.tx(async (tx) => {
      const user = newUser({ id, email: normalized, displayName, username: `admin_${id.slice(-5)}`, role: 'admin',
        passwordHash: bcrypt.hashSync(password, 10), emailVerified: true, provider: 'password' });
      await tx.put(C.users, id, user);
      await tx.put(C.profiles, id, { userId: id, playerId: playerId(), avatar: '', bio: '', createdAt: now(), updatedAt: now() });
      await tx.put(C.wallets, id, { userId: id, available: 0, winning: 0, pending: 0, reserved: 0, totalDeposited: 0, totalWinnings: 0, totalEntryFees: 0, totalWithdrawn: 0, updatedAt: now() });
      await logAdmin(tx, { id, email: normalized }, 'admin.bootstrap', 'user', id, {});
    });
    return id;
  }
}
