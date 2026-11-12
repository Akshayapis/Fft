import { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Swords, ArrowDownToLine, ArrowUpFromLine, Trophy, LifeBuoy,
  Settings2, Image, ScrollText, Receipt, Shield, LogOut, Plus, Search, Ban, CheckCircle2,
  XCircle, Eye, Pencil, Trash2, Send, Radio, Lock, Megaphone, Coins, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLoad, useDebounced } from '../lib/hooks';
import { money, shortMoney, dateTime, dateOnly } from '../lib/format';
import { PageHeader, StatusBadge, EmptyState, SkeletonCards, ErrorState, Chart, Modal, Field, Tabs, Spinner, useToast, useConfirm } from '../components/UICommon';

const ADMIN_NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'User management', icon: Users },
  { to: '/admin/tournaments', label: 'Tournaments', icon: Swords },
  { to: '/admin/results', label: 'Results & prizes', icon: Trophy },
  { to: '/admin/deposits', label: 'Deposits', icon: ArrowDownToLine },
  { to: '/admin/withdrawals', label: 'Withdrawals', icon: ArrowUpFromLine },
  { to: '/admin/transactions', label: 'Transactions', icon: Receipt },
  { to: '/admin/support', label: 'Support tickets', icon: LifeBuoy },
  { to: '/admin/banners', label: 'Banners & notices', icon: Image },
  { to: '/admin/settings', label: 'App settings', icon: Settings2 },
  { to: '/admin/logs', label: 'Activity logs', icon: ScrollText },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  if (user && user.role !== 'admin') return <div className="card center" style={{ maxWidth: 520, margin: '60px auto' }}>
    <Shield size={40} color="#fb7185" /><h2 className="mt">Admin access required</h2>
    <p className="muted mt">Your account does not have administrator permissions.</p>
    <div className="row gap center mt" style={{ justifyContent: 'center' }}><Link className="btn ghost" to="/dashboard">Back to dashboard</Link><Link className="btn primary" to="/admin/login">Admin sign in</Link></div>
  </div>;
  return <>
    <PageHeader eyebrow="OPERATIONS CONSOLE" title="Admin Panel" subtitle="Every action here is verified server-side and recorded with your identity and a timestamp."
      actions={<><Link className="btn ghost" to="/dashboard">Player view</Link>
        <button className="btn ghost" onClick={async () => { if (await confirm('Sign out of the admin session?', { title: 'Sign out' })) { await logout(); navigate('/admin/login'); } }}><LogOut size={15} /> Logout</button></>} />
    <div className="admin-layout">
      <nav className="admin-nav card" style={{ padding: 8 }}>{ADMIN_NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => isActive ? 'active' : ''}><n.icon size={16} /> {n.label}</NavLink>)}</nav>
      <div style={{ minWidth: 0 }}><Outlet /></div>
    </div>
  </>;
}

export function AdminDashboardPage() {
  const { data, loading, error, reload } = useLoad(() => api.get<any>('/admin/overview'), []);
  const d = data || {};
  const cards = [
    ['Total users', d.totalUsers], ['Active users (30d)', d.activeUsers], ['Total tournaments', d.totalTournaments],
    ['Live matches', d.liveMatches], ['Completed matches', d.completedMatches], ['Approved deposits', money(d.totalDeposits)],
    ['Pending deposits', d.pendingDeposits], ['Pending withdrawals', d.pendingWithdrawals],
    ['Total entry fees', money(d.totalEntryFees)], ['Prizes distributed', money(d.totalPrizes)],
    ['Open tickets', d.openTickets], ['Registrations', d.totalRegistrations],
  ];
  return <>
    {error && <ErrorState message={error} retry={reload} />}
    {loading && <SkeletonCards count={8} />}
    {!loading && !error && <>
      <div className="grid grid-4">{cards.map(([label, value]) => <div className="admin-stat" key={String(label)}><span>{label}</span><strong>{value as any}</strong></div>)}</div>
      <div className="grid grid-2 mt-lg">
        <div className="card"><div className="card-head"><h3>New users · 7 days</h3><Users size={16} color="#a78bfa" /></div><Chart data={d.charts?.registrations || []} color="var(--violet)" /></div>
        <div className="card"><div className="card-head"><h3>Deposit volume (₹) · 7 days</h3><ArrowDownToLine size={16} color="#22d3ee" /></div><Chart data={d.charts?.deposits || []} color="var(--cyan)" /></div>
      </div>
      <div className="card mt-lg"><div className="card-head"><h3>Quick actions</h3><Shield size={16} className="good" /></div>
        <div className="row gap wrap">
          <Link className="btn primary" to="/admin/tournaments"><Plus size={15} /> Create tournament</Link>
          <Link className="btn ghost" to="/admin/deposits"><CheckCircle2 size={15} /> Review deposits {d.pendingDeposits ? `(${d.pendingDeposits})` : ''}</Link>
          <Link className="btn ghost" to="/admin/withdrawals"><Coins size={15} /> Review withdrawals {d.pendingWithdrawals ? `(${d.pendingWithdrawals})` : ''}</Link>
          <Link className="btn ghost" to="/admin/results"><Trophy size={15} /> Publish results</Link>
          <Link className="btn ghost" to="/admin/support"><LifeBuoy size={15} /> Support queue</Link>
          <Link className="btn ghost" to="/admin/settings"><Settings2 size={15} /> Compliance settings</Link>
        </div>
      </div>
    </>}
  </>;
}

export function AdminUsersPage() {
  const toast = useToast(); const confirm = useConfirm();
  const [q, setQ] = useState(''); const debounced = useDebounced(q);
  const [detail, setDetail] = useState<any>(null); const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useLoad(() => api.get<any>(`/admin/users?q=${encodeURIComponent(debounced)}`), [debounced]);
  const users = data?.users || [];
  const openDetail = async (id: string) => { try { setDetail(await api.get(`/admin/users/${id}`)); } catch (e: any) { toast(e.message, 'error'); } };
  const suspend = async (u: any) => {
    if (!await confirm(`${u.suspended ? 'Reactivate' : 'Suspend'} ${u.displayName}? This is recorded in the audit log.`, { title: 'Account status', danger: !u.suspended })) return;
    setBusy(true);
    try { await api.post(`/admin/users/${u.id}/suspend`, { suspended: !u.suspended, reason: u.suspended ? 'Reviewed by admin' : 'Policy review' }); toast('Account updated', 'success'); await reload(); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  return <div className="card">
    <div className="card-head"><h3>User management</h3><span className="chip">{users.length} accounts</span></div>
    <div className="input-row mb"><Search size={16} className="dim" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email, username or Player ID…" /></div>
    {error && <ErrorState message={error} retry={reload} />}
    {loading && <SkeletonCards count={3} />}
    {!loading && !error && (users.length ? <div className="table-wrap"><table>
      <thead><tr><th>Player</th><th>Email</th><th>Player ID</th><th>Balance</th><th>Role</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{users.map((u: any) => <tr key={u.id}>
        <td><div className="cell-user">{u.avatar ? <img src={u.avatar} alt="" /> : <span className="avatar-fallback">{u.displayName?.[0]}</span>}<div><strong>{u.displayName}</strong><div className="dim tiny">@{u.username}</div></div></div></td>
        <td className="small">{u.email}</td><td className="mono tiny">{u.playerId}</td><td>{money((u.wallet?.available || 0) + (u.wallet?.winning || 0))}</td>
        <td><span className="chip">{u.role}</span></td><td className="small muted">{dateOnly(u.createdAt)}</td>
        <td><StatusBadge status={u.suspended ? 'rejected' : 'approved'} label={u.suspended ? 'Suspended' : 'Active'} /></td>
        <td><div className="table-actions"><button className="btn tiny ghost" onClick={() => void openDetail(u.id)}><Eye size={12} /> View</button>
          {u.role !== 'admin' && <button className={`btn tiny ${u.suspended ? 'success' : 'danger'}`} disabled={busy} onClick={() => void suspend(u)}>{u.suspended ? <CheckCircle2 size={12} /> : <Ban size={12} />}{u.suspended ? 'Reactivate' : 'Suspend'}</button>}</div></td>
      </tr>)}</tbody></table></div> : <EmptyState icon={<Users size={24} />} title="No users found" text="Try a different search term." />)}
    {detail && <Modal title={detail.user.displayName} subtitle={`${detail.user.email} · ${detail.user.playerId}`} onClose={() => setDetail(null)} wide>
      <div className="grid grid-4 mb">
        <div className="admin-stat"><span>Available</span><strong>{money(detail.user.wallet?.available)}</strong></div>
        <div className="admin-stat"><span>Winning</span><strong>{money(detail.user.wallet?.winning)}</strong></div>
        <div className="admin-stat"><span>Reserved</span><strong>{money(detail.user.wallet?.reserved)}</strong></div>
        <div className="admin-stat"><span>Matches</span><strong>{detail.registrations.length}</strong></div>
      </div>
      <h4>Wallet transactions</h4>
      {detail.transactions.length ? <div className="table-wrap mt mb"><table><thead><tr><th>ID</th><th>Type</th><th>Amount</th><th>Description</th><th>Date</th></tr></thead>
        <tbody>{detail.transactions.slice(0, 20).map((t: any) => <tr key={t.id}><td className="mono tiny">{t.id}</td><td>{t.type}</td>
          <td className={t.amount > 0 ? 'good' : ''}>{money(t.amount)}</td><td className="small muted">{t.description}</td><td className="small muted">{dateTime(t.createdAt)}</td></tr>)}</tbody></table></div>
        : <p className="muted small">No transactions yet.</p>}
      <div className="row gap">
        <button className="btn ghost" onClick={async () => {
          const reason = window.prompt('Reason for the manual balance adjustment (audit logged):'); if (!reason) return;
          const amount = Number(window.prompt('Amount in ₹ (negative to debit):')); if (!Number.isFinite(amount) || !amount) return;
          try { await api.post('/admin/adjustments', { userId: detail.user.id, amount: Math.round(amount * 100), reason, bucket: 'available' }); toast('Adjustment applied', 'success'); setDetail(await api.get(`/admin/users/${detail.user.id}`)); }
          catch (e: any) { toast(e.message, 'error'); }
        }}><Coins size={14} /> Adjust balance</button>
        <span className="muted small">Every adjustment is written to the append-only ledger and audit log.</span>
      </div>
    </Modal>}
  </div>;
}

export function AdminTransactionsPage() {
  const [q, setQ] = useState(''); const debounced = useDebounced(q);
  const { data, loading, error, reload } = useLoad(() => api.get<any>(`/admin/transactions?q=${encodeURIComponent(debounced)}`), [debounced]);
  return <div className="card"><div className="card-head"><h3>Global transaction ledger</h3><Receipt size={16} color="#67e8f9" /></div>
    <div className="input-row mb"><Search size={16} className="dim" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transaction ID, user, type…" /></div>
    {error && <ErrorState message={error} retry={reload} />}{loading && <SkeletonCards count={3} />}
    {!loading && !error && ((data?.transactions || []).length ? <div className="table-wrap"><table>
      <thead><tr><th>Transaction ID</th><th>User</th><th>Type</th><th>Bucket</th><th>Description</th><th>Date</th><th className="right">Amount</th></tr></thead>
      <tbody>{(data?.transactions || []).map((t: any) => <tr key={t.id}><td className="mono tiny">{t.id}</td><td className="mono tiny">{t.userId}</td>
        <td><span className="chip">{t.type.replace(/_/g, ' ')}</span></td><td>{t.bucket}</td><td className="small muted">{t.description}</td>
        <td className="small muted">{dateTime(t.createdAt)}</td><td className={`right mono ${t.amount > 0 ? 'good' : ''}`}>{t.amount > 0 ? '+' : ''}{money(t.amount)}</td></tr>)}</tbody>
    </table></div> : <EmptyState icon={<Receipt size={24} />} title="No transactions" text="Ledger entries appear as users deposit, join matches and receive prizes." />)}
  </div>;
}

/* ── Tournaments ─────────────────────────────────────────────────── */
const EMPTY_TOURNAMENT: any = {
  title: '', gameMode: 'Battle Royale', teamType: 'Squad', entryFee: 10000, slots: 48,
  prizePool: 100000, prize1: 50000, prize2: 30000, prize3: 20000,
  matchDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), matchTime: '20:00',
  registrationClose: '', mapName: 'Bermuda', matchType: 'Ranked', banner: '', description: '',
  rules: '1. Fair play only — no cheats, macros or teaming.\n2. Join the room 10 minutes before start.\n3. Results are verified by the admin team.\n4. Screenshots may be required for disputes.',
  status: 'registration_open', roomId: '', roomPassword: '',
};
function TournamentForm({ initial, onSave, onClose }: { initial: any; onSave: (v: any) => Promise<void>; onClose: () => void }) {
  const [v, setV] = useState<any>({ ...EMPTY_TOURNAMENT, ...initial });
  const [busy, setBusy] = useState(false);
  const set = (k: string, value: any) => setV((x: any) => ({ ...x, [k]: value }));
  const num = (k: string, rupees = true) => ({ value: rupees ? (Number(v[k]) / 100 || '') : v[k], onChange: (e: any) => set(k, rupees ? Math.round(Number(e.target.value) * 100) : Number(e.target.value)) });
  const submit = async () => { setBusy(true); try { await onSave(v); } finally { setBusy(false); } };
  return <Modal title={initial?.id ? 'Edit tournament' : 'Create tournament'} subtitle="All fields are validated server-side. Room credentials stay private until released." onClose={onClose} wide>
    <div className="form-grid">
      <div className="full"><Field label="Tournament title" required><input value={v.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Friday Night Showdown" /></Field></div>
      <Field label="Game mode" required><select value={v.gameMode} onChange={(e) => set('gameMode', e.target.value)}>{['Battle Royale', 'Clash Squad', 'Lone Wolf', 'Team Deathmatch', 'Custom Room'].map((m) => <option key={m}>{m}</option>)}</select></Field>
      <Field label="Team type" required><select value={v.teamType} onChange={(e) => set('teamType', e.target.value)}>{['Solo', 'Duo', 'Squad'].map((m) => <option key={m}>{m}</option>)}</select></Field>
      <Field label="Entry fee (₹)" required><input type="number" min={0} {...num('entryFee')} /></Field>
      <Field label="Total slots" required><input type="number" min={1} {...num('slots', false)} /></Field>
      <Field label="Prize pool (₹)" required><input type="number" min={0} {...num('prizePool')} /></Field>
      <Field label="Status" required><select value={v.status} onChange={(e) => set('status', e.target.value)}>
        {[['upcoming', 'Upcoming'], ['registration_open', 'Registration Open'], ['full', 'Full'], ['live', 'Live'], ['completed', 'Completed'], ['cancelled', 'Cancelled']].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
      <Field label="1st place (₹)"><input type="number" min={0} {...num('prize1')} /></Field>
      <Field label="2nd place (₹)"><input type="number" min={0} {...num('prize2')} /></Field>
      <Field label="3rd place (₹)"><input type="number" min={0} {...num('prize3')} /></Field>
      <Field label="Match date" required><input type="date" value={v.matchDate} onChange={(e) => set('matchDate', e.target.value)} /></Field>
      <Field label="Start time" required><input type="time" value={v.matchTime} onChange={(e) => set('matchTime', e.target.value)} /></Field>
      <Field label="Registration closes at"><input type="datetime-local" value={v.registrationClose} onChange={(e) => set('registrationClose', e.target.value)} /></Field>
      <Field label="Map"><input value={v.mapName} onChange={(e) => set('mapName', e.target.value)} /></Field>
      <Field label="Match type"><input value={v.matchType} onChange={(e) => set('matchType', e.target.value)} /></Field>
      <div className="full"><Field label="Banner URL" hint="Use an original image URL or upload through the banners manager"><input value={v.banner} onChange={(e) => set('banner', e.target.value)} placeholder="https://… or /uploads/…" /></Field></div>
      <div className="full"><Field label="Description"><textarea value={v.description} onChange={(e) => set('description', e.target.value)} /></Field></div>
      <div className="full"><Field label="Rules"><textarea rows={6} value={v.rules} onChange={(e) => set('rules', e.target.value)} /></Field></div>
      <Field label="Room ID" hint="Hidden from players until released"><input value={v.roomId} onChange={(e) => set('roomId', e.target.value)} /></Field>
      <Field label="Room password" hint="Hidden from players until released"><input value={v.roomPassword} onChange={(e) => set('roomPassword', e.target.value)} /></Field>
    </div>
    <div className="info-banner mb"><Lock size={15} /> Credentials are stored in a private collection. Only registered players see them after you release them.</div>
    <button className="btn primary block" disabled={busy || !v.title} onClick={() => void submit()}>{busy ? <Spinner /> : 'Save tournament'}</button>
  </Modal>;
}

export function AdminTournamentsPage() {
  const toast = useToast(); const confirm = useConfirm();
  const { data, loading, error, reload } = useLoad(() => api.get<any>('/admin/tournaments'), []);
  const [form, setForm] = useState<any>(null); const [room, setRoom] = useState<any>(null);
  const [regs, setRegs] = useState<any>(null); const [busy, setBusy] = useState(false);
  const list = data?.tournaments || [];
  const toastReload = async () => { await reload(); };
  const save = async (v: any) => {
    try {
      if (v.id) await api.patch(`/admin/tournaments/${v.id}`, v); else await api.post('/admin/tournaments', v);
      toast('Tournament saved', 'success'); setForm(null); await toastReload();
    } catch (e: any) { toast(e.message, 'error'); }
  };
  const cancel = async (t: any) => {
    if (!await confirm(`Cancel ${t.title}? All joined players are refunded automatically and notified.`, { title: 'Cancel tournament', danger: true })) return;
    try { await api.del(`/admin/tournaments/${t.id}`); toast('Tournament cancelled and players refunded', 'success'); await toastReload(); }
    catch (e: any) { toast(e.message, 'error'); }
  };
  const release = async () => {
    setBusy(true);
    try { await api.post(`/admin/tournaments/${room.id}/room`, { roomId: room.roomId, roomPassword: room.roomPassword, release: true }); toast('Room credentials released to registered players', 'success'); setRoom(null); await toastReload(); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  const setStatus = async (t: any, status: string) => {
    try { await api.patch(`/admin/tournaments/${t.id}`, { status }); toast('Status updated', 'success'); await toastReload(); }
    catch (e: any) { toast(e.message, 'error'); }
  };
  const viewRegs = async (t: any) => { try { setRegs({ t, rows: (await api.get<any>(`/admin/tournaments/${t.id}/registrations`)).registrations }); } catch (e: any) { toast(e.message, 'error'); } };
  return <div className="card">
    <div className="card-head"><h3>Tournament management</h3><button className="btn primary small" onClick={() => setForm({})}><Plus size={14} /> Create tournament</button></div>
    {error && <ErrorState message={error} retry={reload} />}{loading && <SkeletonCards count={3} />}
    {!loading && !error && (list.length ? <div className="table-wrap"><table>
      <thead><tr><th>Tournament</th><th>Mode</th><th>Entry / Prize</th><th>Slots</th><th>Starts</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{list.map((t: any) => <tr key={t.id}>
        <td><strong>{t.title}</strong><div className="dim tiny mono">{t.id}</div></td><td className="small">{t.gameMode} · {t.teamType}</td>
        <td className="small">{money(t.entryFee)} / {shortMoney(t.prizePool)}</td><td>{t.joinedCount}/{t.slots}</td>
        <td className="small muted">{dateTime(t.startsAt)}</td><td><StatusBadge status={t.status} /></td>
        <td><div className="table-actions">
          <button className="btn tiny ghost" onClick={() => setForm(t)}><Pencil size={12} /> Edit</button>
          <button className="btn tiny ghost" onClick={() => void viewRegs(t)}><Eye size={12} /> Players</button>
          <button className="btn tiny ghost" onClick={() => setRoom({ ...t })}><Radio size={12} /> Room</button>
          <select className="btn tiny" style={{ width: 135, padding: '5px 8px' }} value={t.status} onChange={(e) => void setStatus(t, e.target.value)}>
            {[['upcoming', 'Upcoming'], ['registration_open', 'Reg. open'], ['full', 'Full'], ['live', 'Live'], ['completed', 'Completed'], ['cancelled', 'Cancelled']].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          {t.status !== 'cancelled' && <button className="btn tiny danger" onClick={() => void cancel(t)}><Trash2 size={12} /> Cancel</button>}
        </div></td>
      </tr>)}</tbody></table></div> : <EmptyState icon={<Swords size={24} />} title="No tournaments yet" text="Create your first match to open registration." action={<button className="btn primary" onClick={() => setForm({})}>Create tournament</button>} />)}
    {form && <TournamentForm initial={Object.keys(form).length ? form : null} onSave={save} onClose={() => setForm(null)} />}
    {room && <Modal title="Release room credentials" subtitle={room.title} onClose={() => setRoom(null)}>
      <div className="legal-banner mb"><Lock size={16} /> Only registered players of this match will be able to view these credentials.</div>
      <Field label="Room ID" required><input value={room.roomId || ''} onChange={(e) => setRoom({ ...room, roomId: e.target.value })} /></Field>
      <Field label="Room password"><input value={room.roomPassword || ''} onChange={(e) => setRoom({ ...room, roomPassword: e.target.value })} /></Field>
      <button className="btn primary block" disabled={busy || !room.roomId} onClick={() => void release()}>{busy ? <Spinner /> : <>Release to joined players</>}</button>
    </Modal>}
    {regs && <Modal title={`Joined players — ${regs.t.title}`} subtitle={`${regs.rows.length} registrations`} onClose={() => setRegs(null)} wide>
      {regs.rows.length ? <div className="table-wrap"><table><thead><tr><th>Player</th><th>Email</th><th>Player ID</th><th>Team</th><th>Fee</th><th>Status</th></tr></thead>
        <tbody>{regs.rows.map((r: any) => <tr key={r.id}><td><strong>{r.displayName}</strong></td><td className="small">{r.email}</td><td className="mono tiny">{r.playerId}</td>
          <td>{r.teamName || '—'}</td><td>{money(r.feePaid)}</td><td><StatusBadge status={r.status} /></td></tr>)}</tbody></table></div>
        : <EmptyState icon={<Users size={24} />} title="No players joined" />}
    </Modal>}
  </div>;
}

/* ── Results & prize distribution ────────────────────────────────── */
export function AdminResultsPage() {
  const toast = useToast(); const confirm = useConfirm();
  const { data, loading, error, reload } = useLoad(() => api.get<any>('/admin/tournaments'), []);
  const [selected, setSelected] = useState('');
  const { data: regs, reload: reloadRegs } = useLoad(() => selected ? api.get<any>(`/admin/tournaments/${selected}/registrations`) : Promise.resolve({ registrations: [] }), [selected]);
  const [rows, setRows] = useState<any[]>([]); const [busy, setBusy] = useState(false);
  const list = data?.tournaments || [];
  const tournament = list.find((t: any) => t.id === selected);
  const pick = (id: string) => { setSelected(id); setRows([]); };
  const addRow = (userId = '', rank = 1, prize = 0) => setRows((r) => [...r, { userId, rank, prize }]);
  const publish = async () => {
    if (!rows.length || rows.some((r) => !r.userId)) return toast('Select a player for every rank', 'error');
    if (!await confirm(`Publish results for ${tournament.title}? Prize credits are distributed once and cannot be duplicated.`, { title: 'Verify & publish results', danger: true })) return;
    setBusy(true);
    try { await api.post(`/admin/tournaments/${selected}/results`, { results: rows }); toast('Results verified, published and prizes credited', 'success'); setRows([]); await reload(); await reloadRegs(); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  return <div className="card">
    <div className="card-head"><h3>Results & prize distribution</h3><Trophy size={16} color="#fbbf24" /></div>
    <div className="info-banner mb"><ShieldCheckIcon /> Publishing is atomic: verified results are written once, prize credits are applied through the ledger with idempotency keys, and every participant is notified. Duplicate distribution is rejected by the server.</div>
    <Field label="Select tournament" required><select value={selected} onChange={(e) => pick(e.target.value)}><option value="">Choose a match…</option>{list.map((t: any) => <option key={t.id} value={t.id}>{t.title} · {t.status}{t.resultPublished ? ' · published' : ''}</option>)}</select></Field>
    {error && <ErrorState message={error} retry={reload} />}{loading && <SkeletonCards count={2} />}
    {tournament && <div className="mt">
      <div className="grid grid-4 mb">
        <div className="admin-stat"><span>Prize pool</span><strong>{money(tournament.prizePool)}</strong></div>
        <div className="admin-stat"><span>1st / 2nd / 3rd</span><strong style={{ fontSize: 15 }}>{shortMoney(tournament.prize1)} / {shortMoney(tournament.prize2)} / {shortMoney(tournament.prize3)}</strong></div>
        <div className="admin-stat"><span>Joined</span><strong>{tournament.joinedCount}</strong></div>
        <div className="admin-stat"><span>Results</span><strong>{tournament.resultPublished ? 'Published' : 'Pending'}</strong></div>
      </div>
      {tournament.resultPublished ? <div className="legal-banner"><CheckCircle2 size={16} /> Results for this match are already verified and rewards distributed. The server blocks a second distribution.</div>
        : <>
          <div className="row between mb"><h4>Rankings</h4><div className="row gap"><button className="btn ghost small" onClick={() => {
            const players = (regs?.registrations || []).filter((r: any) => r.status === 'joined').slice(0, 3);
            setRows(players.map((p: any, i: number) => ({ userId: p.userId, rank: i + 1, prize: [tournament.prize1, tournament.prize2, tournament.prize3][i] || 0 })));
          }}>Auto-fill top 3</button><button className="btn primary small" onClick={() => addRow()}><Plus size={13} /> Add rank</button></div></div>
          {(regs?.registrations || []).length === 0 && <p className="muted small mb">No players registered for this match yet.</p>}
          {rows.map((r, i) => <div className="row gap mb" key={i}>
            <select value={r.userId} onChange={(e) => setRows((x) => x.map((v, j) => j === i ? { ...v, userId: e.target.value } : v))} style={{ flex: 2 }}>
              <option value="">Select player…</option>{(regs?.registrations || []).filter((p: any) => p.status === 'joined').map((p: any) => <option key={p.userId} value={p.userId}>{p.displayName} · {p.playerId}</option>)}
            </select>
            <input type="number" min={1} style={{ width: 90 }} value={r.rank} onChange={(e) => setRows((x) => x.map((v, j) => j === i ? { ...v, rank: Number(e.target.value) } : v))} placeholder="Rank" />
            <input type="number" min={0} step="1" style={{ width: 130 }} value={r.prize / 100} onChange={(e) => setRows((x) => x.map((v, j) => j === i ? { ...v, prize: Math.round(Number(e.target.value) * 100) } : v))} placeholder="Prize ₹" />
            <button className="icon-btn" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><XCircle size={16} /></button>
          </div>)}
          <button className="btn primary mt" disabled={busy || !rows.length} onClick={() => void publish()}>{busy ? <Spinner /> : <><Trophy size={15} /> Verify & publish results</>}</button>
        </>}
    </div>}
  </div>;
}
function ShieldCheckIcon() { return <Shield size={16} />; }

/* ── Deposits ────────────────────────────────────────────────────── */
export function AdminDepositsPage() {
  const toast = useToast(); const confirm = useConfirm();
  const { data, loading, error, reload } = useLoad(() => api.get<any>('/admin/deposits'), []);
  const [tab, setTab] = useState('pending'); const [review, setReview] = useState<any>(null); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const all = data?.deposits || [];
  const list = tab === 'all' ? all : all.filter((d: any) => d.status === tab);
  const doReview = async (approve: boolean) => {
    if (!await confirm(`${approve ? 'Approve and credit' : 'Reject'} ${money(review.amount)} for ${review.displayName}? ${approve ? 'This writes a ledger entry.' : 'No balance will change.'}`, { title: 'Review deposit', danger: !approve })) return;
    setBusy(true);
    try { await api.post(`/admin/deposits/${review.id}/review`, { approve, note }); toast(approve ? 'Deposit approved and credited' : 'Deposit rejected', 'success'); setReview(null); setNote(''); await reload(); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  return <div className="card"><div className="card-head"><h3>Deposit requests</h3><RefreshCw size={16} className="dim" /></div>
    <Tabs active={tab} onChange={setTab} tabs={[{ id: 'pending', label: 'Pending', count: all.filter((d: any) => d.status === 'pending').length }, { id: 'approved', label: 'Approved', count: all.filter((d: any) => d.status === 'approved').length }, { id: 'rejected', label: 'Rejected', count: all.filter((d: any) => d.status === 'rejected').length }, { id: 'all', label: 'All' }]} />
    {error && <ErrorState message={error} retry={reload} />}{loading && <SkeletonCards count={2} />}
    {!loading && !error && (list.length ? <div className="table-wrap"><table>
      <thead><tr><th>Request</th><th>Player</th><th>Amount</th><th>Method / UTR</th><th>Proof</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>{list.map((d: any) => <tr key={d.id}><td className="mono tiny">{d.id}</td><td><strong>{d.displayName}</strong><div className="dim tiny">{d.email}</div></td>
        <td className="strong">{money(d.amount)}</td><td className="small">{d.method}<div className="dim tiny mono">{d.upiRef || '—'}</div></td>
        <td>{d.screenshotUrl ? <a className="link-btn tiny" href={d.screenshotUrl} target="_blank" rel="noreferrer"><Eye size={12} /> View</a> : '—'}</td>
        <td><StatusBadge status={d.status} /></td><td className="small muted">{dateTime(d.createdAt)}</td>
        <td>{d.status === 'pending' ? <div className="table-actions"><button className="btn tiny success" onClick={() => setReview({ ...d, approve: true })}><CheckCircle2 size={12} /> Approve</button>
          <button className="btn tiny danger" onClick={() => setReview({ ...d, approve: false })}><XCircle size={12} /> Reject</button></div> : <span className="dim tiny">{d.adminNote || '—'}</span>}</td>
      </tr>)}</tbody></table></div> : <EmptyState icon={<ArrowDownToLine size={24} />} title="No requests in this view" />)}
    {review && <Modal title={`${review.approve ? 'Approve' : 'Reject'} deposit`} subtitle={`${review.displayName} · ${money(review.amount)}`} onClose={() => setReview(null)}>
      {review.screenshotUrl && <img className="upload-preview mb" src={review.screenshotUrl} alt="Payment proof" />}
      <div className="kv mb"><span>UPI reference</span><strong className="mono">{review.upiRef || 'Not provided'}</strong></div>
      <Field label={review.approve ? 'Approval note (optional)' : 'Rejection reason'} ><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={review.approve ? 'Verified against payment provider' : 'Explain why this request is rejected'} /></Field>
      <button className={`btn block ${review.approve ? 'success' : 'danger'}`} disabled={busy} onClick={() => void doReview(review.approve)}>{busy ? <Spinner /> : 'Confirm review'}</button>
    </Modal>}
  </div>;
}

/* ── Withdrawals ─────────────────────────────────────────────────── */
export function AdminWithdrawalsPage() {
  const toast = useToast(); const confirm = useConfirm();
  const { data, loading, error, reload } = useLoad(() => api.get<any>('/admin/withdrawals'), []);
  const [tab, setTab] = useState('pending'); const [review, setReview] = useState<any>(null); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  const all = data?.withdrawals || [];
  const list = tab === 'all' ? all : all.filter((w: any) => tab === 'pending' ? ['pending', 'processing'].includes(w.status) : w.status === tab);
  const act = async (action: string) => {
    if (!await confirm(`${action === 'paid' ? 'Mark this withdrawal as paid' : action === 'reject' ? 'Reject and return the reserved balance' : 'Mark as processing'} — ${money(review.amount)} to ${review.displayName}?`, { title: 'Withdrawal review', danger: action === 'reject' })) return;
    setBusy(true);
    try { await api.post(`/admin/withdrawals/${review.id}/review`, { action, reason }); toast('Withdrawal updated', 'success'); setReview(null); setReason(''); await reload(); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  return <div className="card"><div className="card-head"><h3>Withdrawal requests</h3><Coins size={16} color="#fbbf24" /></div>
    <Tabs active={tab} onChange={setTab} tabs={[{ id: 'pending', label: 'To review', count: all.filter((w: any) => ['pending', 'processing'].includes(w.status)).length }, { id: 'paid', label: 'Paid', count: all.filter((w: any) => w.status === 'paid').length }, { id: 'rejected', label: 'Rejected', count: all.filter((w: any) => w.status === 'rejected').length }, { id: 'all', label: 'All' }]} />
    {error && <ErrorState message={error} retry={reload} />}{loading && <SkeletonCards count={2} />}
    {!loading && !error && (list.length ? <div className="table-wrap"><table>
      <thead><tr><th>Request</th><th>Player</th><th>Amount / Net</th><th>UPI / Holder</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>{list.map((w: any) => <tr key={w.id}><td className="mono tiny">{w.id}</td><td><strong>{w.displayName}</strong><div className="dim tiny">{w.email}</div></td>
        <td>{money(w.amount)}<div className="dim tiny">Net {money(w.net)} · fee {money(w.fee)}</div></td>
        <td className="small">{w.upiId}<div className="dim tiny">{w.holderName}{w.bankName ? ` · ${w.bankName}` : ''}</div></td>
        <td><StatusBadge status={w.status} /></td><td className="small muted">{dateTime(w.createdAt)}</td>
        <td>{['pending', 'processing'].includes(w.status) ? <button className="btn tiny primary" onClick={() => setReview(w)}><Eye size={12} /> Review</button>
          : <span className="dim tiny">{w.rejectionReason || w.reviewedBy || '—'}</span>}</td>
      </tr>)}</tbody></table></div> : <EmptyState icon={<ArrowUpFromLine size={24} />} title="No requests in this view" />)}
    {review && <Modal title="Review withdrawal" subtitle={`${review.displayName} · ${money(review.amount)}`} onClose={() => setReview(null)}>
      <div className="kv-grid mb">
        <div className="kv"><span>UPI ID</span><strong className="small">{review.upiId}</strong></div>
        <div className="kv"><span>Holder</span><strong className="small">{review.holderName}</strong></div>
        <div className="kv"><span>Net payout</span><strong className="good">{money(review.net)}</strong></div>
        <div className="kv"><span>Reserved</span><strong>{money(review.amount)}</strong></div>
      </div>
      <Field label="Rejection reason (only for reject)"><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain the rejection to the player" /></Field>
      <div className="row gap wrap">
        <button className="btn ghost" disabled={busy} onClick={() => void act('processing')}>Mark processing</button>
        <button className="btn danger" disabled={busy} onClick={() => void act('reject')}>Reject & release funds</button>
        <button className="btn success" disabled={busy} onClick={() => void act('paid')}>Mark paid</button>
      </div>
      <p className="muted tiny mt">Mark paid only after the payout has actually been sent. Reject returns the reserved balance automatically.</p>
    </Modal>}
  </div>;
}

/* ── Support tickets ─────────────────────────────────────────────── */
export function AdminSupportPage() {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get<any>('/admin/tickets'), []);
  const [tab, setTab] = useState('open'); const [detail, setDetail] = useState<any>(null);
  const [reply, setReply] = useState(''); const [busy, setBusy] = useState(false);
  const all = data?.tickets || [];
  const list = tab === 'all' ? all : all.filter((t: any) => t.status === tab);
  const open = async (id: string) => { try { setDetail(await api.get(`/admin/tickets/${id}`)); } catch (e: any) { toast(e.message, 'error'); } };
  const send = async (status = 'resolved') => {
    setBusy(true);
    try { await api.post(`/admin/tickets/${detail.ticket.id}/reply`, { message: reply, status }); setReply(''); setDetail(await api.get(`/admin/tickets/${detail.ticket.id}`)); await reload(); toast('Reply sent', 'success'); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  const setStatus = async (status: string) => {
    try { await api.post(`/admin/tickets/${detail.ticket.id}/status`, { status }); setDetail(await api.get(`/admin/tickets/${detail.ticket.id}`)); await reload(); toast('Ticket status updated', 'success'); }
    catch (e: any) { toast(e.message, 'error'); }
  };
  return <div className="card"><div className="card-head"><h3>Support queue</h3><LifeBuoy size={16} color="#a78bfa" /></div>
    <Tabs active={tab} onChange={setTab} tabs={[{ id: 'open', label: 'Open', count: all.filter((t: any) => t.status === 'open').length }, { id: 'resolved', label: 'Resolved', count: all.filter((t: any) => t.status === 'resolved').length }, { id: 'closed', label: 'Closed', count: all.filter((t: any) => t.status === 'closed').length }, { id: 'all', label: 'All' }]} />
    {error && <ErrorState message={error} retry={reload} />}{loading && <SkeletonCards count={2} />}
    {!loading && !error && (list.length ? <div className="table-wrap"><table>
      <thead><tr><th>Ticket</th><th>Player</th><th>Category</th><th>Messages</th><th>Status</th><th>Updated</th><th /></tr></thead>
      <tbody>{list.map((t: any) => <tr key={t.id}><td><strong>{t.subject}</strong><div className="dim tiny mono">{t.id}</div></td>
        <td className="small">{t.displayName}<div className="dim tiny">{t.email}</div></td><td className="small">{t.category}</td><td>{t.messageCount}</td>
        <td><StatusBadge status={t.status} /></td><td className="small muted">{dateTime(t.updatedAt)}</td>
        <td><button className="btn tiny ghost" onClick={() => void open(t.id)}><Eye size={12} /> Open</button></td></tr>)}</tbody>
    </table></div> : <EmptyState icon={<LifeBuoy size={24} />} title="No tickets in this view" />)}
    {detail && <Modal title={detail.ticket.subject} subtitle={`${detail.ticket.displayName} · ${detail.ticket.category}`} onClose={() => setDetail(null)} wide>
      <div className="row between mb"><StatusBadge status={detail.ticket.status} /><div className="row gap"><button className="btn tiny ghost" onClick={() => void setStatus('open')}>Reopen</button><button className="btn tiny ghost" onClick={() => void setStatus('closed')}>Close ticket</button></div></div>
      <div className="ticket-thread mb">{detail.messages.map((m: any) => <div key={m.id} className={`message ${m.senderRole === 'admin' ? 'admin' : ''}`}>
        <strong className="tiny">{m.senderRole === 'admin' ? 'Admin' : detail.ticket.displayName}</strong><p className="small mt">{m.message}</p>
        {m.attachment && <a className="link-btn tiny" href={m.attachment} target="_blank" rel="noreferrer">View attachment</a>}
        <small>{dateTime(m.createdAt)}</small></div>)}</div>
      <Field label="Your reply"><textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply to the player…" /></Field>
      <div className="row gap wrap"><button className="btn primary" disabled={busy || !reply.trim()} onClick={() => void send('resolved')}><Send size={15} /> Reply & resolve</button>
        <button className="btn ghost" disabled={busy || !reply.trim()} onClick={() => void send('open')}>Reply & keep open</button></div>
    </Modal>}
  </div>;
}

/* ── Admin settings ──────────────────────────────────────────────── */
export function AdminSettingsPage() {
  const toast = useToast(); const confirm = useConfirm();
  const { data, loading, error, reload } = useLoad(() => api.get<any>('/admin/settings'), []);
  const [form, setForm] = useState<any>(null); const [busy, setBusy] = useState(false);
  const s = form || data?.settings || {};
  const set = (k: string, v: any) => setForm({ ...s, [k]: v });
  const nested = (k: string, sk: string, v: any) => setForm({ ...s, [k]: { ...(s[k] || {}), [sk]: v } });
  const toList = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);
  const save = async () => {
    if (!await confirm('Save app-wide settings? Changes affect every user immediately and are audit logged.', { title: 'Save settings' })) return;
    setBusy(true);
    try {
      const body: any = { ...s };
      delete body.audit; delete body.updatedAt;
      await api.put('/admin/settings', body);
      toast('Settings saved', 'success'); setForm(null); await reload();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  if (error) return <ErrorState message={error} retry={reload} />;
  if (loading || !data) return <SkeletonCards count={4} />;
  return <div className="card"><div className="card-head"><h3>App settings & compliance</h3><button className="btn primary small" disabled={busy} onClick={() => void save()}>{busy ? <Spinner /> : 'Save settings'}</button></div>
    <div className="legal-banner mb"><AlertTriangle size={16} /><span><strong>Legal gate:</strong> switching to real-money mode requires legal verification, payment-provider verification and a published terms URL. Age gates, blocked regions and responsible-play limits apply automatically. Do not enable real-money contests until legality and payment-provider requirements are verified in your jurisdiction.</span></div>
    <div className="grid grid-2">
      <div><h4 className="mb">Branding & mode</h4>
        <Field label="App name"><input value={s.appName || ''} onChange={(e) => set('appName', e.target.value)} /></Field>
        <Field label="Tagline"><input value={s.tagline || ''} onChange={(e) => set('tagline', e.target.value)} /></Field>
        <Field label="Homepage announcement"><textarea value={s.announcement || ''} onChange={(e) => set('announcement', e.target.value)} /></Field>
        <Field label="Contest mode"><select value={s.mode || 'practice'} onChange={(e) => set('mode', e.target.value)}><option value="practice">Practice (no real money)</option><option value="real">Real money (requires verification)</option></select></Field>
        <label className="checkbox-line mb"><input type="checkbox" checked={!!s.legalVerified} onChange={(e) => set('legalVerified', e.target.checked)} /> I have verified the legality of paid contests in every enabled region</label>
        <label className="checkbox-line mb"><input type="checkbox" checked={!!s.paymentProviderVerified} onChange={(e) => set('paymentProviderVerified', e.target.checked)} /> Payment provider requirements are verified</label>
        <Field label="Terms & conditions URL"><input value={s.termsUrl || ''} onChange={(e) => set('termsUrl', e.target.value)} placeholder="https://…" /></Field>
        <Field label="Compliance note shown to users"><textarea value={s.complianceNote || ''} onChange={(e) => set('complianceNote', e.target.value)} /></Field>
        <Field label="Minimum age"><input type="number" min={13} max={21} value={s.minAge || 18} onChange={(e) => set('minAge', Number(e.target.value))} /></Field>
      </div>
      <div><h4 className="mb">Payments & limits (₹)</h4>
        <div className="form-grid">
          <Field label="Min deposit"><input type="number" value={(s.minDeposit || 0) / 100} onChange={(e) => set('minDeposit', Math.round(Number(e.target.value) * 100))} /></Field>
          <Field label="Max deposit"><input type="number" value={(s.maxDeposit || 0) / 100} onChange={(e) => set('maxDeposit', Math.round(Number(e.target.value) * 100))} /></Field>
          <Field label="Min withdrawal"><input type="number" value={(s.minWithdrawal || 0) / 100} onChange={(e) => set('minWithdrawal', Math.round(Number(e.target.value) * 100))} /></Field>
          <Field label="Max withdrawal"><input type="number" value={(s.maxWithdrawal || 0) / 100} onChange={(e) => set('maxWithdrawal', Math.round(Number(e.target.value) * 100))} /></Field>
          <Field label="Withdrawal fee %"><input type="number" step="0.5" value={s.withdrawalFeePercent || 0} onChange={(e) => set('withdrawalFeePercent', Number(e.target.value))} /></Field>
          <Field label="Flat fee (₹)"><input type="number" value={(s.withdrawalFeeFlat || 0) / 100} onChange={(e) => set('withdrawalFeeFlat', Math.round(Number(e.target.value) * 100))} /></Field>
          <Field label="Cancellation cut-off (min)"><input type="number" value={s.cancellationMinutes || 0} onChange={(e) => set('cancellationMinutes', Number(e.target.value))} /></Field>
          <Field label="Cancellation fee %"><input type="number" value={s.cancellationFeePercent || 0} onChange={(e) => set('cancellationFeePercent', Number(e.target.value))} /></Field>
        </div>
        <Field label="Quick deposit amounts (₹, comma-separated)"><input value={(s.depositAmounts || []).map((a: number) => a / 100).join(', ')} onChange={(e) => set('depositAmounts', toList(e.target.value).map((x) => Math.round(Number(x) * 100)).filter((n) => n > 0))} /></Field>
        <label className="checkbox-line mb"><input type="checkbox" checked={!!s.allowWinningForEntry} onChange={(e) => set('allowWinningForEntry', e.target.checked)} /> Allow winning balance for entry fees</label>
        <label className="checkbox-line mb"><input type="checkbox" checked={!!s.allowWinningWithdrawal} onChange={(e) => set('allowWinningWithdrawal', e.target.checked)} /> Allow winning balance for withdrawals</label>
        <label className="checkbox-line"><input type="checkbox" checked={!!s.requireEmailVerification} onChange={(e) => set('requireEmailVerification', e.target.checked)} /> Require email verification before joining</label>
      </div>
    </div>
    <div className="divider" />
    <div className="grid grid-2">
      <div><h4 className="mb">Responsible play & regions</h4>
        <Field label="Daily deposit limit (₹)"><input type="number" value={(s.responsiblePlay?.dailyDepositLimit || 0) / 100} onChange={(e) => nested('responsiblePlay', 'dailyDepositLimit', Math.round(Number(e.target.value) * 100))} /></Field>
        <Field label="Monthly deposit limit (₹)"><input type="number" value={(s.responsiblePlay?.monthlyDepositLimit || 0) / 100} onChange={(e) => nested('responsiblePlay', 'monthlyDepositLimit', Math.round(Number(e.target.value) * 100))} /></Field>
        <Field label="Default self-exclusion days"><input type="number" value={s.responsiblePlay?.selfExclusionDays || 30} onChange={(e) => nested('responsiblePlay', 'selfExclusionDays', Number(e.target.value))} /></Field>
        <Field label="Blocked regions (comma-separated)"><input value={(s.blockedRegions || []).join(', ')} onChange={(e) => set('blockedRegions', toList(e.target.value))} /></Field>
        <Field label="Allowed regions (blank = all)"><input value={(s.allowedRegions || []).join(', ')} onChange={(e) => set('allowedRegions', toList(e.target.value))} /></Field>
        <Field label="Game categories (comma-separated)"><input value={(s.categories || []).join(', ')} onChange={(e) => set('categories', toList(e.target.value))} /></Field>
      </div>
      <div><h4 className="mb">Payment methods & contact</h4>
        {(s.paymentMethods || []).map((m: any, i: number) => <div className="card mb" key={m.id} style={{ padding: 12 }}>
          <label className="checkbox-line mb"><input type="checkbox" checked={!!m.enabled} onChange={(e) => set('paymentMethods', s.paymentMethods.map((x: any, j: number) => j === i ? { ...x, enabled: e.target.checked } : x))} /> <strong>{m.label}</strong></label>
          <Field label="UPI ID"><input value={m.upiId || ''} onChange={(e) => set('paymentMethods', s.paymentMethods.map((x: any, j: number) => j === i ? { ...x, upiId: e.target.value } : x))} /></Field>
          <Field label="QR image URL"><input value={m.qrUrl || ''} onChange={(e) => set('paymentMethods', s.paymentMethods.map((x: any, j: number) => j === i ? { ...x, qrUrl: e.target.value } : x))} /></Field>
          <Field label="Instructions"><textarea value={m.note || ''} onChange={(e) => set('paymentMethods', s.paymentMethods.map((x: any, j: number) => j === i ? { ...x, note: e.target.value } : x))} /></Field>
        </div>)}
        <Field label="Support email"><input value={s.contact?.email || ''} onChange={(e) => nested('contact', 'email', e.target.value)} /></Field>
        <div className="form-grid">
          <Field label="Telegram"><input value={s.contact?.telegram || ''} onChange={(e) => nested('contact', 'telegram', e.target.value)} /></Field>
          <Field label="Discord"><input value={s.contact?.discord || ''} onChange={(e) => nested('contact', 'discord', e.target.value)} /></Field>
          <Field label="WhatsApp"><input value={s.contact?.whatsapp || ''} onChange={(e) => nested('contact', 'whatsapp', e.target.value)} /></Field>
          <Field label="Support hours"><input value={s.contact?.hours || ''} onChange={(e) => nested('contact', 'hours', e.target.value)} /></Field>
        </div>
      </div>
    </div>
    <div className="divider" />
    <div className="row between mb"><h4>FAQ</h4><button className="btn ghost small" onClick={() => set('faq', [...(s.faq || []), { q: '', a: '' }])}><Plus size={13} /> Add FAQ</button></div>
    {(s.faq || []).map((f: any, i: number) => <div className="card mb" key={i} style={{ padding: 12 }}>
      <Field label="Question"><input value={f.q} onChange={(e) => set('faq', s.faq.map((x: any, j: number) => j === i ? { ...x, q: e.target.value } : x))} /></Field>
      <Field label="Answer"><textarea value={f.a} onChange={(e) => set('faq', s.faq.map((x: any, j: number) => j === i ? { ...x, a: e.target.value } : x))} /></Field>
      <button className="btn tiny danger" onClick={() => set('faq', s.faq.filter((_: any, j: number) => j !== i))}><Trash2 size={12} /> Remove</button>
    </div>)}
    <button className="btn primary block mt" disabled={busy} onClick={() => void save()}>{busy ? <Spinner /> : 'Save all settings'}</button>
  </div>;
}

/* ── Banners, announcements, broadcast ───────────────────────────── */
export function AdminBannersPage() {
  const toast = useToast(); const confirm = useConfirm();
  const { data, loading, error, reload } = useLoad(() => api.get<any>('/admin/banners'), []);
  const { data: anns, reload: reloadAnns } = useLoad(() => api.get<any>('/admin/announcements'), []);
  const [form, setForm] = useState<any>(null); const [ann, setAnn] = useState<any>(null); const [busy, setBusy] = useState(false);
  const saveBanner = async () => {
    setBusy(true);
    try { if (form.id) await api.patch(`/admin/banners/${form.id}`, form); else await api.post('/admin/banners', form); toast('Banner saved', 'success'); setForm(null); await reload(); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  const saveAnn = async () => {
    setBusy(true);
    try { await api.post('/admin/announcements', ann); toast('Announcement published and broadcast', 'success'); setAnn(null); await reloadAnns(); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  return <>
    <div className="card mb"><div className="card-head"><h3>Banners</h3><button className="btn primary small" onClick={() => setForm({ title: '', image: '', link: '', active: true })}><Plus size={14} /> Add banner</button></div>
      {error && <ErrorState message={error} retry={reload} />}{loading && <SkeletonCards count={2} />}
      {!loading && !error && ((data?.banners || []).length ? <div className="grid grid-3">{(data?.banners || []).map((b: any) => <div className="card" key={b.id} style={{ padding: 12 }}>
        {b.image && <img src={b.image} alt="" style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 10 }} />}
        <strong className="small">{b.title}</strong><div className="dim tiny">{b.link || 'No link'}</div>
        <div className="row gap mt"><StatusBadge status={b.active ? 'approved' : 'rejected'} label={b.active ? 'Active' : 'Hidden'} />
          <button className="btn tiny ghost" onClick={() => setForm(b)}><Pencil size={12} /> Edit</button>
          <button className="btn tiny danger" onClick={async () => { if (await confirm('Delete this banner?', { danger: true, title: 'Delete banner' })) { await api.del(`/admin/banners/${b.id}`); toast('Banner deleted', 'success'); await reload(); } }}><Trash2 size={12} /></button></div>
      </div>)}</div> : <EmptyState icon={<Image size={24} />} title="No banners" text="Add a banner to highlight a tournament on the dashboard." />)}
    </div>
    <div className="card"><div className="card-head"><h3>Announcements & broadcast</h3><button className="btn primary small" onClick={() => setAnn({ title: '', body: '', broadcast: true })}><Megaphone size={14} /> New announcement</button></div>
      {(anns?.announcements || []).length ? (anns?.announcements || []).map((a: any) => <div className="kv mb" key={a.id}><div className="row between"><strong>{a.title}</strong>
        <button className="btn tiny danger" onClick={async () => { if (await confirm('Delete this announcement?', { danger: true })) { await api.del(`/admin/announcements/${a.id}`); await reloadAnns(); } }}><Trash2 size={12} /></button></div>
        <p className="muted small">{a.body}</p><small className="dim">{dateTime(a.createdAt)}</small></div>)
        : <p className="muted small">No announcements yet.</p>}
      <div className="divider" />
      <button className="btn ghost" onClick={async () => {
        const title = window.prompt('Notification title:'); if (!title) return;
        const body = window.prompt('Notification message:'); if (!body) return;
        try { const out = await api.post<any>('/admin/notifications/broadcast', { title, body, audience: 'players' }); toast(`Sent to ${out.count} players`, 'success'); }
        catch (e: any) { toast(e.message, 'error'); }
      }}><Send size={14} /> Send push-style notification to all players</button>
    </div>
    {form && <Modal title={form.id ? 'Edit banner' : 'Add banner'} onClose={() => setForm(null)}>
      <Field label="Title" required><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
      <Field label="Image URL" hint="Use an original asset URL"><input value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} /></Field>
      <Field label="Link"><input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} /></Field>
      <label className="checkbox-line mb"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Show on dashboard</label>
      <button className="btn primary block" disabled={busy} onClick={() => void saveBanner()}>{busy ? <Spinner /> : 'Save banner'}</button>
    </Modal>}
    {ann && <Modal title="Publish announcement" subtitle="Optionally notify every player instantly." onClose={() => setAnn(null)}>
      <Field label="Title" required><input value={ann.title} onChange={(e) => setAnn({ ...ann, title: e.target.value })} /></Field>
      <Field label="Message" required><textarea value={ann.body} onChange={(e) => setAnn({ ...ann, body: e.target.value })} /></Field>
      <label className="checkbox-line mb"><input type="checkbox" checked={ann.broadcast} onChange={(e) => setAnn({ ...ann, broadcast: e.target.checked })} /> Broadcast as a notification to all players</label>
      <button className="btn primary block" disabled={busy || !ann.title || !ann.body} onClick={() => void saveAnn()}>{busy ? <Spinner /> : 'Publish'}</button>
    </Modal>}
  </>;
}

/* ── Admin activity logs ─────────────────────────────────────────── */
export function AdminLogsPage() {
  const { data, loading, error, reload } = useLoad(() => api.get<any>('/admin/logs'), []);
  return <div className="card"><div className="card-head"><h3>Admin activity logs</h3><ScrollText size={16} color="#67e8f9" /></div>
    <p className="muted small mb">Every admin action is recorded with timestamp, admin identity, action and entity.</p>
    {error && <ErrorState message={error} retry={reload} />}{loading && <SkeletonCards count={3} />}
    {!loading && !error && ((data?.logs || []).length ? <div className="table-wrap"><table>
      <thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
      <tbody>{(data?.logs || []).map((l: any) => <tr key={l.id}><td className="small muted">{dateTime(l.createdAt)}</td>
        <td className="small">{l.adminEmail}<div className="dim tiny mono">{l.adminId}</div></td>
        <td><span className="chip">{l.action}</span></td><td className="small">{l.entity}<div className="dim tiny mono">{l.entityId}</div></td>
        <td><pre className="tiny" style={{ margin: 0, padding: 6, maxWidth: 300, overflow: 'auto' }}>{JSON.stringify(l.details || {})}</pre></td></tr>)}</tbody>
    </table></div> : <EmptyState icon={<ScrollText size={24} />} title="No admin actions yet" />)}
  </div>;
}
