export const money = (p: number | string | undefined | null) =>
  `₹${(Number(p || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const shortMoney = (p: number | string | undefined | null) =>
  `₹${(Number(p || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
export const dateTime = (value?: string) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};
export const dateOnly = (value?: string) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-IN', { dateStyle: 'medium' });
};
export const relative = (value?: string) => {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};
export const statusLabel = (s: string) => ({
  upcoming: 'Upcoming', registration_open: 'Registration open', full: 'Full', live: 'Live',
  completed: 'Completed', cancelled: 'Cancelled', pending: 'Pending', approved: 'Approved',
  rejected: 'Rejected', processing: 'Processing', paid: 'Paid', open: 'Open', resolved: 'Resolved', closed: 'Closed',
  joined: 'Joined', 'registration closed': 'Closed',
}[s] || s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
export const statusTone = (s: string): 'good' | 'warn' | 'bad' | 'info' | 'muted' => {
  if (['approved', 'paid', 'completed', 'live', 'resolved', 'verified'].includes(s)) return 'good';
  if (['pending', 'processing', 'upcoming', 'full', 'open'].includes(s)) return 'warn';
  if (['rejected', 'cancelled', 'suspended', 'closed'].includes(s)) return 'bad';
  if (['registration_open'].includes(s)) return 'info';
  return 'muted';
};
export const initials = (name?: string) => (name || 'P').trim().split(/\s+/).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('') || 'P';
export const AVATARS = [
  'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7c3aed"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs><rect width="120" height="120" rx="26" fill="#0b1020"/><circle cx="60" cy="60" r="42" fill="url(#g)"/><path d="M60 28 L44 64 H58 L52 92 L76 54 H62 L68 28 Z" fill="#05060f"/></svg>'),
  'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#22d3ee"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs><rect width="120" height="120" rx="26" fill="#08111f"/><path d="M20 84 L60 22 L100 84 Z" fill="url(#g)"/><circle cx="60" cy="62" r="12" fill="#05060f"/></svg>'),
  'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f43f5e"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs><rect width="120" height="120" rx="26" fill="#160a12"/><circle cx="60" cy="60" r="40" fill="none" stroke="url(#g)" stroke-width="10"/><path d="M60 30 V60 L82 72" stroke="#fff" stroke-width="8" stroke-linecap="round" fill="none"/></svg>'),
  'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#a855f7"/><stop offset="1" stop-color="#ec4899"/></linearGradient></defs><rect width="120" height="120" rx="26" fill="#10081c"/><path d="M28 78 Q60 12 92 78 Z" fill="url(#g)"/><rect x="46" y="70" width="28" height="22" rx="6" fill="#05060f"/></svg>'),
  'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#34d399"/><stop offset="1" stop-color="#0ea5e9"/></linearGradient></defs><rect width="120" height="120" rx="26" fill="#06121a"/><path d="M60 18 L92 40 V80 L60 102 L28 80 V40 Z" fill="url(#g)"/><circle cx="60" cy="60" r="16" fill="#05060f"/></svg>'),
  'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fbbf24"/><stop offset="1" stop-color="#fb7185"/></linearGradient></defs><rect width="120" height="120" rx="26" fill="#16100a"/><path d="M60 20 L70 48 L100 50 L76 68 L84 98 L60 80 L36 98 L44 68 L20 50 L50 48 Z" fill="url(#g)"/></svg>'),
];
