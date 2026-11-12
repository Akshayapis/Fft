import crypto from 'node:crypto';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const bad = (message, details) => { throw new HttpError(400, message, details); };
export const unauthorized = (message = 'Authentication required') => { throw new HttpError(401, message); };
export const forbidden = (message = 'You do not have permission to do that') => { throw new HttpError(403, message); };
export const notFound = (message = 'Not found') => { throw new HttpError(404, message); };
export const conflict = (message = 'This action has already been processed') => { throw new HttpError(409, message); };
export const unavailable = (message) => { throw new HttpError(503, message); };

export const uid = (prefix = '') => `${prefix}${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
export const now = () => new Date().toISOString();
export const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('hex');
export const txnId = () => `NX${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
export const playerId = () => `NA-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

/** Money is ALWAYS stored as integer paise. Never a float. */
export const paise = (rupees) => Math.round(Number(rupees) * 100);
export const rupees = (p) => (Number(p || 0) / 100).toFixed(2);
export const money = (p) => `₹${(Number(p || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function validate(schema, data) {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    bad(`${first.path.join('.') || 'input'}: ${first.message}`);
  }
  return parsed.data;
}

export const asInt = (v, name, min = 0, max = 100000000) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) bad(`${name} must be a whole number between ${min} and ${max}`);
  return n;
};

export const clean = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const safeUrl = (v) => {
  const s = clean(v, 600);
  if (!s) return '';
  if (/^https:\/\//i.test(s) || s.startsWith('/uploads/') || s.startsWith('data:image/')) return s;
  return '';
};

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(160);
export const passwordSchema = z.string().min(8, 'Use at least 8 characters').max(128);

export function ageFrom(dateString) {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return 0;
  const today = new Date();
  let age = today.getUTCFullYear() - d.getUTCFullYear();
  const m = today.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

export const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Tiny in-process rate limiter (auth + money endpoints). */
export function rateLimiter({ windowMs = 60_000, max = 12 } = {}) {
  const hits = new Map();
  return (req, _res, next) => {
    const key = `${req.ip || 'ip'}:${req.path}:${(req.body && req.body.email) || ''}`;
    const entry = hits.get(key);
    const t = Date.now();
    if (!entry || t - entry.start > windowMs) hits.set(key, { start: t, count: 1 });
    else if (++entry.count > max) return next(new HttpError(429, 'Too many attempts. Please wait a moment and try again.'));
    if (hits.size > 5000) for (const [k, v] of hits) if (t - v.start > windowMs) hits.delete(k);
    next();
  };
}

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export const sortBy = (items, field = 'createdAt', dir = 'desc') => [...items].sort((a, b) => {
  const av = a[field] ?? '', bv = b[field] ?? '';
  const c = av < bv ? -1 : av > bv ? 1 : 0;
  return dir === 'desc' ? -c : c;
});

export function periodStart(period) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  if (period === 'weekly') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  if (period === 'monthly') d.setUTCDate(1);
  if (period === 'all') return '1970-01-01T00:00:00.000Z';
  return d.toISOString();
}
