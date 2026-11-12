import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Users, Trophy, Ticket, ShieldCheck, Lock, Coins, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLoad, useCountdown } from '../lib/hooks';
import { money, dateTime, statusLabel } from '../lib/format';
import { PageHeader, StatusBadge, Progress, EmptyState, Skeleton, ErrorState, Modal, Field, CopyButton, Spinner, useToast, useConfirm } from '../components/UICommon';
import { useAppData } from '../lib/appdata';

export function MatchDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const { reload: reloadGlobal } = useAppData();
  const { data, loading, error, reload } = useLoad(() => api.get<any>(`/tournaments/${id}`), [id]);
  const [joinOpen, setJoinOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [members, setMembers] = useState([{ name: '', playerId: '' }]);
  const t = data?.tournament;
  const countdown = useCountdown(t?.startsAt);

  const doJoin = async () => {
    setBusy(true);
    try {
      await api.post(`/tournaments/${id}/join`, { teamName, members: members.filter((m) => m.name.trim()) });
      toast('Registration confirmed — entry fee deducted', 'success');
      setJoinOpen(false); await reload(); await reloadGlobal();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  const doCancel = async () => {
    if (!data?.registration) return;
    if (!await confirm('Cancel this registration? The entry fee is refunded according to the admin cancellation rules.', { title: 'Cancel registration', danger: true })) return;
    setBusy(true);
    try { await api.post(`/registrations/${data.registration.id}/cancel`, {}); toast('Registration cancelled and balance refunded', 'success'); await reload(); await reloadGlobal(); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  if (loading) return <><PageHeader title="Match details" /><div className="card"><Skeleton height={190} /><div className="mt"><Skeleton height={24} width="50%" /><Skeleton height={14} width="80%" /></div></div></>;
  if (error || !t) return <><PageHeader title="Match details" /><ErrorState message={error || 'Tournament not found'} retry={reload} /><Link className="btn ghost mt" to="/matches"><ArrowLeft size={15} /> Back to matches</Link></>;

  const canJoin = t.status === 'registration_open' && !t.joined && t.joinedCount < t.slots;
  const roomVisible = t.roomVisible && (t.joined || user?.role === 'admin');
  return <>
    <PageHeader eyebrow="MATCH ROOM" title={t.title} subtitle={`${t.gameMode} · ${t.teamType} · ${t.mapName}`}
      actions={<><Link className="btn ghost" to="/matches"><ArrowLeft size={15} /> All matches</Link><StatusBadge status={t.status} /></>} />
    <div className="detail-hero mb">
      <div className="detail-banner">{t.banner ? <img src={t.banner} alt="" /> : <div className="tournament-banner" style={{ height: '100%' }}><div className="pattern" /></div>}
        <div className="detail-banner-content"><div><div className="eyebrow">{statusLabel(t.status)}</div><h2>{t.title}</h2></div>
          <div className="countdown-chip">{countdown}</div></div>
      </div>
    </div>
    <div className="grid grid-main">
      <div>
        <div className="card mb"><div className="kv-grid">
          <div className="kv"><span>Prize pool</span><strong className="good">{money(t.prizePool)}</strong></div>
          <div className="kv"><span>Entry fee</span><strong>{money(t.entryFee)}</strong></div>
          <div className="kv"><span>Slots</span><strong>{t.joinedCount} / {t.slots}</strong></div>
          <div className="kv"><span>Match type</span><strong>{t.matchType}</strong></div>
          <div className="kv"><span>Map</span><strong>{t.mapName}</strong></div>
          <div className="kv"><span>Mode</span><strong>{t.gameMode}</strong></div>
          <div className="kv"><span>Match date</span><strong>{dateTime(t.startsAt)}</strong></div>
          <div className="kv"><span>Registration closes</span><strong>{t.registrationClose ? dateTime(t.registrationClose) : 'At kick-off'}</strong></div>
        </div>
          <div className="mt"><div className="row between small muted mb"><span><Users size={13} /> {t.joinedCount} joined · {Math.max(0, t.slots - t.joinedCount)} slots left</span><span>{t.slots ? Math.round(t.joinedCount / t.slots * 100) : 0}%</span></div><Progress value={t.joinedCount} max={t.slots} /></div>
        </div>
        <div className="card mb"><div className="card-head"><h3>Prize distribution</h3><Trophy size={17} color="#fbbf24" /></div>
          <div className="grid grid-3">{[['🥇 First place', t.prize1], ['🥈 Second place', t.prize2], ['🥉 Third place', t.prize3]].map(([label, value]: any) =>
            <div className="kv" key={label}><span>{label}</span><strong className="good">{money(value)}</strong></div>)}</div>
        </div>
        <div className="card mb"><div className="card-head"><h3>Rules & description</h3><ShieldCheck size={17} color="#6ee7b7" /></div>
          {t.description && <p className="muted small mb">{t.description}</p>}
          <div className="info-banner"><ShieldCheck size={16} /><span>Fair play is mandatory. Results are verified by an admin before any prize is credited. Paid contests are subject to regional availability and age verification.</span></div>
          {t.rules && <pre style={{ whiteSpace: 'pre-wrap', marginTop: 14 }}>{t.rules}</pre>}
        </div>
        <div className="card"><div className="card-head"><h3>Joined players ({data.participants.length})</h3><Users size={17} color="#a78bfa" /></div>
          {data.participants.length ? <div className="table-wrap"><table><thead><tr><th>Player</th><th>Team</th><th>Player ID</th><th>Joined</th></tr></thead><tbody>
            {data.participants.map((p: any) => <tr key={p.id}><td><div className="cell-user">{p.avatar ? <img src={p.avatar} alt="" /> : <span className="avatar-fallback">{p.displayName[0]}</span>}<strong>{p.displayName}</strong></div></td>
              <td>{p.teamName || '—'}</td><td className="mono small">{p.playerId || '—'}</td><td className="muted small">{dateTime(p.joinedAt)}</td></tr>)}
          </tbody></table></div> : <EmptyState icon={<Users size={24} />} title="No players yet" text="Be the first to register for this match." />}
        </div>
      </div>
      <div>
        <div className="card mb">
          <div className="card-head"><h3>Registration</h3><Ticket size={17} color="#67e8f9" /></div>
          {t.joined ? <><div className="info-banner"><CheckCircle2 size={16} /> <span>You are registered. {money(data.registration?.feePaid)} was deducted from your wallet.</span></div>
            <button className="btn danger block mt" disabled={busy} onClick={() => void doCancel()}>{busy ? <Spinner /> : 'Cancel registration'}</button></>
            : canJoin ? <><p className="muted small mb">Entry fee {money(t.entryFee)} will be deducted from your available balance inside an atomic transaction. Duplicate registrations are blocked.</p>
              <button className="btn primary block" onClick={() => setJoinOpen(true)}>Join match · {money(t.entryFee)}</button></>
              : <div className="locked-box"><AlertTriangle size={18} /><span>{t.status === 'full' ? 'All slots are taken.' : t.status === 'live' ? 'This match is already live.' : t.status === 'completed' ? 'This match has finished.' : t.status === 'cancelled' ? 'This tournament was cancelled.' : 'Registration is not open yet.'}</span></div>}
          <div className="divider" />
          <div className="row between small"><span className="muted">Your balance</span><strong>{money((user?.wallet?.available || 0) + (user?.wallet?.winning || 0))}</strong></div>
          <Link className="btn ghost block mt" to="/deposit">Top up wallet</Link>
        </div>
        <div className="card mb"><div className="card-head"><h3>Room credentials</h3>{roomVisible ? <CheckCircle2 size={17} className="good" /> : <Lock size={17} className="muted" />}</div>
          {roomVisible ? <div className="room-box">
            <div className="row between mb"><span className="muted small">Room ID</span><CopyButton value={t.roomId || ''} /></div>
            <div className="room-value">{t.roomId || '—'}</div><div className="divider" />
            <div className="row between mb"><span className="muted small">Password</span><CopyButton value={t.roomPassword || ''} /></div>
            <div className="room-value">{t.roomPassword || '—'}</div>
          </div> : <div className="locked-box"><Lock size={18} /><span>{t.roomReleased ? 'Room credentials are visible only to registered players. Join the match to view them.' : 'The admin has not released the room ID and password yet. You will get a notification when they do.'}</span></div>}
        </div>
        {data.results.length > 0 && <div className="card"><div className="card-head"><h3>Verified results</h3><Trophy size={17} color="#fbbf24" /></div>
          {data.results.map((r: any) => <div key={r.id} className={`leader-row`}><div className={`rank-badge ${r.rank <= 3 ? `rank-${r.rank}` : ''}`}>#{r.rank}</div>
            <div style={{ flex: 1 }}><strong className="small">{r.userId === user?.id ? 'You' : 'Player'}</strong><div className="dim tiny">Verified {dateTime(r.createdAt)}</div></div>
            <strong className="good">{money(r.prize)}</strong></div>)}
        </div>}
      </div>
    </div>
    {joinOpen && <Modal title="Join this match" subtitle={`${t.title} · ${money(t.entryFee)} entry fee`} onClose={() => setJoinOpen(false)}>
      <div className="info-banner mb"><Coins size={16} /> <span>The entry fee is charged from your available balance now. Cancellations follow the admin's {data && 'configured'} cut-off rule and refund automatically.</span></div>
      {(t.teamType !== 'Solo') && <>
        <Field label="Team name"><input value={teamName} maxLength={40} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Night Raiders" /></Field>
        {members.map((m, i) => <div className="row gap mb" key={i}>
          <input placeholder={`Member ${i + 1} name`} value={m.name} maxLength={40} onChange={(e) => setMembers((x) => x.map((v, j) => j === i ? { ...v, name: e.target.value } : v))} />
          <input placeholder="In-game ID (optional)" value={m.playerId} maxLength={30} onChange={(e) => setMembers((x) => x.map((v, j) => j === i ? { ...v, playerId: e.target.value } : v))} />
          {members.length > 1 && <button className="icon-btn" onClick={() => setMembers((x) => x.filter((_, j) => j !== i))}>×</button>}
        </div>)}
        {members.length < (t.teamType === 'Duo' ? 2 : 4) && <button className="btn ghost small mb" onClick={() => setMembers((x) => [...x, { name: '', playerId: '' }])}>+ Add member</button>}
      </>}
      <div className="row between mt"><span className="muted small">Available balance</span><strong>{money(user?.wallet?.available || 0)}</strong></div>
      <button className="btn primary block mt" disabled={busy} onClick={() => void doJoin()}>{busy ? <Spinner /> : `Confirm & pay ${money(t.entryFee)}`}</button>
    </Modal>}
  </>;
}
