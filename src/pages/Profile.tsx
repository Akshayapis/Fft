import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, Save, KeyRound, ShieldCheck, Trash2, LogOut, Trophy, Wallet, Gamepad2, MailCheck, Upload, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAppData } from '../lib/appdata';
import { uploadFile } from '../lib/realtime';
import { AVATARS, money, dateOnly, initials } from '../lib/format';
import { PageHeader, Field, Modal, Spinner, useToast, useConfirm, AnimatedNumber, StatusBadge } from '../components/UICommon';

export function ProfilePage() {
  const { user, refresh, changePassword, resend, logout } = useAuth();
  const { reload: reloadGlobal } = useAppData();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<any>({ displayName: user?.displayName || '', username: user?.username || '', playerId: user?.playerId || '', bio: user?.bio || '', phone: user?.phone || '', avatar: user?.avatar || '', region: user?.region || '' });
  const [busy, setBusy] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState({ oldPassword: '', newPassword: '' });
  const [avatarOpen, setAvatarOpen] = useState(false);
  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    try { await api.patch('/profile', form); await refresh(); await reloadGlobal(); toast('Profile updated', 'success'); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  const chooseAvatar = async (url: string) => {
    setBusy(true);
    try { await api.patch('/profile', { avatar: url }); set('avatar', url); await refresh(); toast('Avatar updated', 'success'); setAvatarOpen(false); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  const onFile = async (f?: File) => {
    if (!f || !user) return;
    setBusy(true);
    try { const url = await uploadFile(f, user.id, 'avatar'); await chooseAvatar(url); }
    catch (e: any) { toast(e.message, 'error'); setBusy(false); }
  };
  const changePwd = async () => {
    setBusy(true);
    try { const msg = await changePassword(pwd.oldPassword, pwd.newPassword); toast(msg, 'success'); setPwdOpen(false); navigate('/login'); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  const deleteRequest = async () => {
    if (!await confirm('Submit an account deletion request? An admin will review it in the support queue.', { title: 'Request account deletion', danger: true })) return;
    setBusy(true);
    try { await api.post('/profile/delete-request', { reason: 'User requested account deletion from profile.' }); toast('Deletion request submitted', 'success'); await refresh(); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  const doLogout = async () => { if (await confirm('Sign out of Nexus Arena?', { title: 'Sign out' })) { await logout(); navigate('/login'); } };

  return <>
    <PageHeader eyebrow="PLAYER IDENTITY" title="My Profile" subtitle="Manage your identity, in-game ID, security and account lifecycle." />
    <div className="card mb"><div className="profile-hero">
      <div style={{ position: 'relative' }}>
        {user?.avatar ? <img src={user.avatar} alt="Avatar" /> : <div className="avatar-fallback">{initials(user?.displayName)}</div>}
        <button className="icon-btn" style={{ position: 'absolute', right: -8, bottom: -8 }} onClick={() => setAvatarOpen(true)} aria-label="Change avatar"><Camera size={16} /></button>
      </div>
      <div style={{ flex: 1, minWidth: 200 }}><div className="eyebrow">{user?.playerId || 'PLAYER'}</div><h2>{user?.displayName}</h2>
        <p className="muted small">@{user?.username} · {user?.email} · Joined {dateOnly(user?.createdAt)}</p>
        <div className="row gap wrap mt"><StatusBadge status={user?.emailVerified ? 'approved' : 'pending'} label={user?.emailVerified ? 'Email verified' : 'Email unverified'} />
          {user?.deletionRequested && <StatusBadge status="processing" label="Deletion requested" />}</div>
      </div>
      <div className="row gap wrap"><button className="btn ghost" onClick={() => setPwdOpen(true)}><KeyRound size={15} /> Change password</button>
        {!user?.emailVerified && <button className="btn ghost" onClick={() => void (async () => { try { toast(await resend(), 'success'); } catch (e: any) { toast(e.message, 'error'); } })()}><MailCheck size={15} /> Verify email</button>}
        <button className="btn ghost" onClick={() => void doLogout()}><LogOut size={15} /> Logout</button></div>
    </div></div>

    <div className="grid grid-3 mb">
      <Link to="/my-matches" className="stat-card hover"><div className="stat-label">Total matches</div><div className="stat-value"><AnimatedNumber value={user?.stats?.totalMatches || 0} /></div><div className="stat-foot"><Gamepad2 size={13} /> View match history</div></Link>
      <Link to="/wins" className="stat-card hover"><div className="stat-label">Total wins</div><div className="stat-value"><AnimatedNumber value={user?.stats?.totalWins || 0} /></div><div className="stat-foot"><Trophy size={13} /> View winning history</div></Link>
      <Link to="/wallet" className="stat-card hover"><div className="stat-label">Total earnings</div><div className="stat-value" style={{ fontSize: 26 }}>{money(user?.stats?.totalEarnings || 0)}</div><div className="stat-foot"><Wallet size={13} /> Wallet summary</div></Link>
    </div>

    <div className="grid grid-main">
      <div className="card"><div className="card-head"><h3>Edit profile</h3><Save size={16} color="#a78bfa" /></div>
        <div className="form-grid">
          <Field label="Display name"><input value={form.displayName} onChange={(e) => set('displayName', e.target.value)} maxLength={40} /></Field>
          <Field label="Username"><input value={form.username} onChange={(e) => set('username', e.target.value)} maxLength={24} /></Field>
          <Field label="Player ID"><input value={form.playerId} onChange={(e) => set('playerId', e.target.value)} maxLength={24} /></Field>
          <Field label="Phone"><input value={form.phone} onChange={(e) => set('phone', e.target.value)} maxLength={20} /></Field>
          <Field label="Region"><input value={form.region} onChange={(e) => set('region', e.target.value)} maxLength={60} /></Field>
          <Field label="Email" hint="Email changes require support verification"><input value={user?.email || ''} disabled /></Field>
          <div className="full"><Field label="Bio"><textarea value={form.bio} onChange={(e) => set('bio', e.target.value)} maxLength={300} placeholder="Short bio shown on your profile" /></Field></div>
        </div>
        <button className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? <Spinner /> : <><Save size={15} /> Save changes</>}</button>
      </div>
      <div>
        <div className="card mb"><div className="card-head"><h3>Wallet summary</h3><Wallet size={16} color="#67e8f9" /></div>
          <div className="row between mb"><span className="muted small">Available</span><strong>{money(user?.wallet?.available)}</strong></div>
          <div className="row between mb"><span className="muted small">Winning</span><strong className="good">{money(user?.wallet?.winning)}</strong></div>
          <div className="row between mb"><span className="muted small">Reserved</span><strong>{money(user?.wallet?.reserved)}</strong></div>
          <div className="divider" /><Link className="btn ghost block" to="/wallet">Open wallet</Link>
        </div>
        <div className="card mb"><div className="card-head"><h3>Account security</h3><ShieldCheck size={16} className="good" /></div>
          <p className="muted small mb">Sessions are signed JWTs (or Firebase ID tokens). Changing your password signs out every session. Your password is hashed with bcrypt and never stored in plain text.</p>
          <button className="btn ghost block mb" onClick={() => setPwdOpen(true)}><KeyRound size={15} /> Change password</button>
          <button className="btn danger block" disabled={busy || user?.deletionRequested} onClick={() => void deleteRequest()}><Trash2 size={15} /> {user?.deletionRequested ? 'Deletion requested' : 'Request account deletion'}</button>
        </div>
        <div className="card"><div className="card-head"><h3>Account details</h3><CheckCircle2 size={16} className="good" /></div>
          <div className="kv mb"><span>Account ID</span><strong className="mono small">{user?.id}</strong></div>
          <div className="kv mb"><span>Created</span><strong>{dateOnly(user?.createdAt)}</strong></div>
          <div className="kv"><span>Role</span><strong>{user?.role}</strong></div>
        </div>
      </div>
    </div>

    {avatarOpen && <Modal title="Choose your avatar" subtitle="Pick a premium gaming avatar or upload your own image." onClose={() => setAvatarOpen(false)}>
      <div className="avatar-grid mb">{AVATARS.map((a) => <button key={a} className={`avatar-choice ${form.avatar === a ? 'selected' : ''}`} onClick={() => void chooseAvatar(a)}><img src={a} alt="Avatar option" /></button>)}</div>
      <input ref={fileRef} type="file" accept="image/*" onChange={(e) => void onFile(e.target.files?.[0])} />
      <p className="muted tiny mt center"><Upload size={12} /> PNG, JPG, WEBP or GIF · max 3 MB</p>
    </Modal>}
    {pwdOpen && <Modal title="Change password" subtitle="All existing sessions will be signed out." onClose={() => setPwdOpen(false)}>
      <Field label="Current password" required><input type="password" value={pwd.oldPassword} onChange={(e) => setPwd({ ...pwd, oldPassword: e.target.value })} /></Field>
      <Field label="New password" hint="At least 8 characters" required><input type="password" minLength={8} value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} /></Field>
      <button className="btn primary block" disabled={busy || !pwd.oldPassword || pwd.newPassword.length < 8} onClick={() => void changePwd()}>{busy ? <Spinner /> : 'Update password'}</button>
    </Modal>}
  </>;
}
