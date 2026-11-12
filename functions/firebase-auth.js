/** Firebase backend auth: Admin SDK verifies ID tokens; profile sync happens in /api/auth/session. */
import express from 'express';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { asyncRoute, HttpError, validate } from './shared/utils.js';
import { C, userView, ensureUser, logAdmin, requireUser, getSettings } from './shared/domain.js';
import { ageFrom } from './shared/utils.js';

export function createFirebaseAuth({ store }) {
  const auth = admin.auth();

  async function authenticate(req) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query?.token ? String(req.query.token) : null);
    if (!token) return null;
    let decoded;
    try { decoded = await auth.verifyIdToken(token, true); }
    catch { return null; }
    const user = await store.get(C.users, decoded.uid);
    const role = decoded.admin === true || user?.role === 'admin' ? 'admin' : 'user';
    return {
      id: decoded.uid, email: decoded.email || user?.email || '', role,
      suspended: !!user?.suspended, emailVerified: !!decoded.email_verified,
      region: user?.region || '', birthDate: user?.birthDate || '',
      selfExcludedUntil: user?.selfExcludedUntil || '', provider: decoded.firebase?.sign_in_provider || 'firebase',
    };
  }

  function buildAuthRouter() {
    const r = express.Router();
    // Called by the web client immediately after Firebase Auth sign-in/registration.
    r.post('/session', asyncRoute(async (req, res) => {
      const actor = await authenticate(req);
      if (!actor) throw new HttpError(401, 'A valid Firebase ID token is required.');
      const { displayName, region, birthDate, acceptTerms } = validate(z.object({
        displayName: z.string().max(60).optional().default(''), region: z.string().max(60).optional().default(''),
        birthDate: z.string().max(20).optional().default(''), acceptTerms: z.boolean().optional().default(true),
      }), req.body);
      const existing = await store.get(C.users, actor.id);
      if (!existing) {
        const settings = await getSettings(store);
        if (!acceptTerms) throw new HttpError(403, 'Please accept the terms and confirm eligibility.');
        if (birthDate && ageFrom(birthDate) < Number(settings.minAge || 18)) {
          throw new HttpError(403, `You must be at least ${settings.minAge || 18} years old to create an account.`);
        }
      }
      const user = await store.tx(async (tx) => {
        const u = await ensureUser(tx, { id: actor.id, email: actor.email, displayName, role: actor.role, emailVerified: actor.emailVerified });
        return tx.put(C.users, actor.id, { ...u, lastLoginAt: new Date().toISOString(),
          region: region || u.region || '', birthDate: birthDate || u.birthDate || '' });
      });
      const [profile, wallet] = await Promise.all([store.get(C.profiles, actor.id), store.get(C.wallets, actor.id)]);
      res.json({ user: userView(user, profile, wallet), token: req.headers.authorization?.slice(7) || '' });
    }));
    r.post('/admin/login', asyncRoute(async (req, res) => {
      const actor = await authenticate(req);
      if (!actor || actor.role !== 'admin') throw new HttpError(401, 'Incorrect admin credentials or missing admin claim.');
      await store.tx(async (tx) => logAdmin(tx, { id: actor.id, email: actor.email }, 'admin.login', 'session', actor.id, {}));
      res.json({ ok: true, user: { id: actor.id, email: actor.email, role: 'admin' } });
    }));
    r.post('/logout', asyncRoute(async (req, res) => {
      const actor = requireUser(req);
      try { await auth.revokeRefreshTokens(actor.id); } catch { /* token may already be short-lived */ }
      res.json({ ok: true });
    }));
    // Email verification, password reset and Google sign-in are handled by the
    // Firebase Auth client SDK; these endpoints never invent or store credentials.
    return r;
  }
  return { mode: 'firebase', authenticate, buildAuthRouter };
}
