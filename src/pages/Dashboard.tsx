import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, Trophy, Medal, Gamepad2, ArrowUpRight, Radio, Sparkles, Flame, Megaphone, ChevronRight, ShieldCheck, Clock } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useAppData } from '../lib/appdata';
import { api } from '../lib/api';
import { useLoad, useCountdown } from '../lib/hooks';
import { money, shortMoney, dateTime, statusLabel } from '../lib/format';
import { PageHeader, StatusBadge, SkeletonCards, EmptyState, ErrorState, AnimatedNumber } from '../components/UICommon';
import { TournamentCard } from '../components/TournamentCard';

export function DashboardPage() {
  const { user } = useAuth();
  const { data } = useAppData();
  const navigate = useNavigate();
  const { data: matches, loading, error, reload } = useLoad(() => api.get<any>('/tournaments'), []);
  const all = matches?.tournaments || [];
  const upcoming = all.filter((t: any) => ['upcoming', 'registration_open', 'full'].includes(t.status));
  const live = all.filter((t: any) => t.status === 'live');
  const completed = all.filter((t: any) => t.status === 'completed');
  const featured = live[0] || upcoming[0] || all[0];
  const stats = user?.stats || { totalMatches: 0, totalWins: 0, totalEarnings: 0, podiums: 0 };
  const banners = data?.banners || [];
  const modes = Object.entries(all.reduce((acc: any, t: any) => { acc[t.gameMode] = (acc[t.gameMode] || 0) + 1; return acc; }, {}))
    .sort((a: any, b: any) => b[1] - a[1]).slice(0, 4);

  return <>
    <PageHeader eyebrow="COMMAND CENTER" title={`Welcome back, ${user?.displayName || 'Player'}`}
      subtitle="Your circuit at a glance — live matches, upcoming registrations and verified results."
      actions={<Link className="btn primary" to="/matches"><Gamepad2 size={16} /> Browse matches</Link>} />

    <div className="grid grid-4 mb">
      <Link to="/matches?status=upcoming" className="stat-card hover"><div className="stat-top"><div><AnimatedNumber value={upcoming.length} /><div className="stat-label">Upcoming Matches</div></div><div className="stat-icon"><CalendarClock size={19} /></div></div><div className="stat-foot">Open registrations & scheduled</div></Link>
      <Link to="/results" className="stat-card hover"><div className="stat-top"><div><AnimatedNumber value={stats.totalMatches} /><div className="stat-label">My Results</div></div><div className="stat-icon"><Trophy size={19} /></div></div><div className="stat-foot">Verified match outcomes</div></Link>
      <Link to="/wins" className="stat-card hover"><div className="stat-top"><div><AnimatedNumber value={stats.totalWins} /><div className="stat-label">My Wins</div></div><div className="stat-icon"><Medal size={19} /></div></div><div className="stat-foot">{stats.podiums || 0} podium finishes</div></Link>
      <Link to="/my-matches" className="stat-card hover"><div className="stat-top"><div><AnimatedNumber value={stats.totalMatches} /><div className="stat-label">Total Matches</div></div><div className="stat-icon"><Gamepad2 size={19} /></div></div><div className="stat-foot">{money(stats.totalEarnings)} total earnings</div></Link>
    </div>

    {data?.settings?.mode === 'practice' && <div className="legal-banner mb"><ShieldCheck size={18} />
      <span><strong>Practice mode.</strong> {data.settings.complianceNote} Real-money contests stay disabled until the operator verifies legality, payment providers, age gates and regional availability.</span></div>}

    {error && <ErrorState message={error} retry={reload} />}
    {loading && <SkeletonCards />}
    {!loading && !error && <>
      <div className="grid grid-main">
        <div>
          {featured ? <FeaturedCard tournament={featured} /> : <div className="card"><EmptyState title="No tournaments yet" text="An admin can create the first match from the Admin panel." action={<Link className="btn primary" to="/admin/tournaments">Open admin panel</Link>} /></div>}
          <div className="section-title"><h2>Upcoming tournaments</h2><Link className="link" to="/matches">View all <ChevronRight size={14} /></Link></div>
          {upcoming.length ? <div className="grid grid-3">{upcoming.slice(0, 3).map((t: any) => <TournamentCard key={t.id} t={t} />)}</div>
            : <EmptyState title="Nothing scheduled" text="New tournaments appear here as soon as the admin publishes them." />}
          <div className="section-title"><h2>Live matches</h2><Link className="link" to="/matches?status=live">Open live tab</Link></div>
          {live.length ? <div className="grid grid-3">{live.slice(0, 3).map((t: any) => <TournamentCard key={t.id} t={t} />)}</div>
            : <div className="card"><EmptyState icon={<Radio size={26} />} title="No live matches right now" text="Room credentials are released to registered players shortly before a match goes live." /></div>}
        </div>
        <div>
          {banners.length > 0 && <div className="card mb"><div className="card-head"><h3>Featured</h3><Sparkles size={16} color="#a78bfa" /></div>
            {banners.slice(0, 1).map((b: any) => <div key={b.id}>{b.image && <img src={b.image} alt={b.title} style={{ width: '100%', borderRadius: 12, marginBottom: 10 }} />}<strong>{b.title}</strong></div>)}</div>}
          <div className="card mb"><div className="card-head"><h3>Popular game modes</h3><Flame size={16} color="#fb7185" /></div>
            {modes.length ? modes.map(([mode, count]: any) => <button key={mode} className="row between" style={{ width: '100%', background: 'none', border: 0, padding: '10px 0', borderBottom: '1px solid var(--line)', color: 'var(--text)' }}
              onClick={() => navigate(`/matches?q=${encodeURIComponent(mode)}`)}><span>{mode}</span><span className="chip">{count} matches <ChevronRight size={12} /></span></button>)
              : <p className="muted small">Modes appear once tournaments are created.</p>}
          </div>
          <div className="card mb"><div className="card-head"><h3>Announcements</h3><Megaphone size={16} color="#67e8f9" /></div>
            {(data?.announcements || []).length ? data.announcements.slice(0, 4).map((a: any) => <div key={a.id} className="faq-item"><strong>{a.title}</strong><p>{a.body}</p><small className="dim">{dateTime(a.createdAt)}</small></div>)
              : <p className="muted small">No announcements from the admin team yet.</p>}
          </div>
          <div className="card"><div className="card-head"><h3>Recently completed</h3><Trophy size={16} color="#fcd34d" /></div>
            {completed.length ? completed.slice(0, 3).map((t: any) => <Link key={t.id} to={`/matches/${t.id}`} className="row between" style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
              <div><strong className="small">{t.title}</strong><div className="dim tiny">{dateTime(t.startsAt)}</div></div><StatusBadge status={t.status} /></Link>)
              : <p className="muted small">Completed matches and results will show here.</p>}
          </div>
        </div>
      </div>
    </>}
  </>;
}

function FeaturedCard({ tournament }: { tournament: any }) {
  const countdown = useCountdown(tournament.startsAt);
  return <div className="featured-card mb">
    <div className="row between wrap"><StatusBadge status={tournament.status} label={statusLabel(tournament.status)} /><span className="chip"><Clock size={13} /> {dateTime(tournament.startsAt)}</span></div>
    <div><div className="eyebrow">FEATURED TOURNAMENT</div><h2>{tournament.title}</h2>
      <p className="muted mt">{tournament.gameMode} · {tournament.teamType} · {tournament.mapName}</p>
      <div className="row gap wrap mt"><span className="chip">Prize pool {shortMoney(tournament.prizePool)}</span><span className="chip">Entry {money(tournament.entryFee)}</span><span className="chip">{tournament.joinedCount}/{tournament.slots} slots</span></div>
      <div className="row gap wrap mt"><div className="countdown-chip">{countdown}</div><span className="muted small">until kick-off</span></div>
    </div>
    <div className="row gap wrap mt"><Link className="btn primary" to={`/matches/${tournament.id}`}>View match <ArrowUpRight size={15} /></Link><Link className="btn ghost" to="/leaderboard">Leaderboard</Link></div>
  </div>;
}
