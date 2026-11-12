import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Gamepad2, Trophy, Medal, CalendarClock, Coins, ArrowRight, Hash } from 'lucide-react';
import { api } from '../lib/api';
import { useLoad } from '../lib/hooks';
import { money, dateTime } from '../lib/format';
import { PageHeader, StatusBadge, EmptyState, SkeletonCards, ErrorState } from '../components/UICommon';

export function MyMatchesPage() {
  const { data, loading, error, reload } = useLoad(() => api.get<any>('/my/matches'), []);
  const list = data?.matches || [];
  return <>
    <PageHeader eyebrow="MY CIRCUIT" title="My Matches" subtitle="Every tournament you registered for, including cancellations." actions={<Link className="btn primary" to="/matches">Find a match</Link>} />
    {error && <ErrorState message={error} retry={reload} />}
    {loading && <SkeletonCards />}
    {!loading && !error && (list.length ? <div className="card"><div className="table-wrap"><table>
      <thead><tr><th>Tournament</th><th>Mode</th><th>Starts</th><th>Fee paid</th><th>Status</th><th /></tr></thead>
      <tbody>{list.map((m: any) => <tr key={m.id}>
        <td><strong>{m.tournament?.title || 'Tournament removed'}</strong><div className="dim tiny">{m.teamName || m.tournament?.gameMode}</div></td>
        <td>{m.tournament?.gameMode || '—'}<div className="dim tiny">{m.tournament?.teamType}</div></td>
        <td className="small">{dateTime(m.tournament?.startsAt)}</td><td>{money(m.feePaid)}</td>
        <td><StatusBadge status={m.status} /></td>
        <td>{m.tournament && <Link className="btn tiny ghost" to={`/matches/${m.tournament.id}`}>Open <ArrowRight size={12} /></Link>}</td>
      </tr>)}</tbody></table></div></div>
      : <EmptyState icon={<Gamepad2 size={26} />} title="No matches joined yet" text="Browse the tournament list and join a match to see it here." action={<Link className="btn primary" to="/matches">Browse matches</Link>} />)}
  </>;
}

export function ResultsPage() {
  const { data, loading, error, reload } = useLoad(() => api.get<any>('/my/results'), []);
  const list = data?.results || [];
  const total = list.reduce((n: number, r: any) => n + r.prize, 0);
  return <>
    <PageHeader eyebrow="VERIFIED OUTCOMES" title="My Results" subtitle="Only admin-verified results appear here and on the leaderboard." />
    <div className="grid grid-3 mb">
      <div className="stat-card"><div className="stat-label">Results published</div><div className="stat-value">{list.length}</div></div>
      <div className="stat-card"><div className="stat-label">Total prize credits</div><div className="stat-value">{money(total)}</div></div>
      <div className="stat-card"><div className="stat-label">Podium finishes</div><div className="stat-value">{list.filter((r: any) => r.rank <= 3).length}</div></div>
    </div>
    {error && <ErrorState message={error} retry={reload} />}
    {loading && <SkeletonCards count={3} />}
    {!loading && !error && (list.length ? <div className="card"><div className="table-wrap"><table>
      <thead><tr><th>Tournament</th><th>Rank</th><th>Prize</th><th>Verified</th><th /></tr></thead>
      <tbody>{list.map((r: any) => <tr key={r.id}>
        <td><strong>{r.tournament?.title || 'Tournament'}</strong><div className="dim tiny">{dateTime(r.tournament?.startsAt)}</div></td>
        <td><span className={`rank-badge ${r.rank <= 3 ? `rank-${r.rank}` : ''}`}>#{r.rank}</span></td>
        <td className="good strong">{money(r.prize)}</td><td className="small muted">{dateTime(r.createdAt)}</td>
        <td>{r.tournament && <Link className="btn tiny ghost" to={`/matches/${r.tournament.id}`}>Match</Link>}</td>
      </tr>)}</tbody></table></div></div>
      : <EmptyState icon={<Trophy size={26} />} title="No results yet" text="Results appear here after an admin verifies and publishes them." />)}
  </>;
}

export function WinsPage() {
  const { data, loading, error, reload } = useLoad(() => api.get<any>('/my/wins'), []);
  const list = data?.wins || [];
  return <>
    <PageHeader eyebrow="HALL OF FAME" title="My Wins" subtitle="Your podium finishes and verified prize credits." />
    {error && <ErrorState message={error} retry={reload} />}
    {loading && <SkeletonCards />}
    {!loading && !error && (list.length ? <div className="grid grid-3">{list.map((r: any) => <div className="card hover" key={r.id}>
      <div className="row between"><span className={`rank-badge ${r.rank <= 3 ? `rank-${r.rank}` : ''}`}>#{r.rank}</span><Medal size={20} color="#fbbf24" /></div>
      <h3 className="mt">{r.tournament?.title || 'Tournament'}</h3>
      <p className="muted small">{dateTime(r.tournament?.startsAt)}</p>
      <div className="divider" /><div className="row between"><span className="muted small">Prize credited</span><strong className="good">{money(r.prize)}</strong></div>
      {r.tournament && <Link className="btn ghost block mt" to={`/matches/${r.tournament.id}`}>View match</Link>}
    </div>)}</div> : <EmptyState icon={<Medal size={26} />} title="No podium finishes yet" text="Finish in the top three of a verified match to see it here." action={<Link className="btn primary" to="/matches">Join a match</Link>} />)}
  </>;
}

export function LeaderboardPage() {
  const [period, setPeriod] = useState('all');
  const { data, loading, error, reload } = useLoad(() => api.get<any>(`/leaderboard?period=${period}`), [period]);
  const rows = data?.leaderboard || [];
  return <>
    <PageHeader eyebrow="SEASON STANDINGS" title="Leaderboard" subtitle="Ranks are calculated from verified match results only — no manual padding." />
    <div className="tabs" role="tablist">{['daily', 'weekly', 'monthly', 'all'].map((p) => <button key={p} role="tab" aria-selected={period === p}
      className={`tab ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>{p[0].toUpperCase() + p.slice(1)}</button>)}</div>
    {error && <ErrorState message={error} retry={reload} />}
    {loading && <SkeletonCards />}
    {!loading && !error && (rows.length ? <div className="grid grid-main">
      <div className="card"><div className="card-head"><h3>Standings</h3><Hash size={16} className="dim" /></div>
        {rows.map((r: any) => <div className="leader-row" key={r.userId}>
          <div className={`rank-badge ${r.rank <= 3 ? `rank-${r.rank}` : ''}`}>{r.rank}</div>
          <div className="cell-user" style={{ flex: 1 }}>{r.avatar ? <img src={r.avatar} alt="" /> : <span className="avatar-fallback">{r.displayName?.[0]}</span>}
            <div><strong>{r.displayName}</strong><div className="dim tiny">{r.playerId} · {r.matches} matches · {r.winRate}% win rate</div></div></div>
          <div className="right"><strong className="small">{r.points} pts</strong><div className="dim tiny">{money(r.winnings)}</div></div>
        </div>)}
      </div>
      <div>
        <div className="card mb"><div className="card-head"><h3>Scoring</h3><Coins size={16} color="#fbbf24" /></div>
          <div className="kv mb"><span>1st place</span><strong>100 points</strong></div>
          <div className="kv mb"><span>2nd place</span><strong>60 points</strong></div>
          <div className="kv mb"><span>3rd place</span><strong>40 points</strong></div>
          <div className="kv"><span>Other verified finish</span><strong>10 points</strong></div>
          <p className="muted small mt">Ties break on total verified winnings, then number of wins.</p>
        </div>
        <div className="card"><div className="card-head"><h3>Season info</h3><CalendarClock size={16} color="#67e8f9" /></div>
          <p className="muted small">Period starts {dateTime(data.start)}. Only results verified by an admin contribute points. Suspended accounts remain visible but cannot enter new matches.</p>
        </div>
      </div>
    </div> : <EmptyState icon={<Trophy size={26} />} title="No ranked players yet" text="Once an admin publishes verified results, standings appear here automatically." />)}
  </>;
}
