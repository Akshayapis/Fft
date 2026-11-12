import { Link } from 'react-router-dom';
import { Users, Ticket, ArrowRight, Radio } from 'lucide-react';
import { StatusBadge, Progress } from './UI';
import { money, shortMoney, dateTime } from '../lib/format';
import { useCountdown } from '../lib/hooks';

export function TournamentCard({ t, compact = false }: { t: any; compact?: boolean }) {
  const countdown = useCountdown(t.startsAt);
  const pct = t.slots ? Math.round((t.joinedCount / t.slots) * 100) : 0;
  return <Link to={`/matches/${t.id}`} className="tournament-card hover">
    <div className="tournament-banner">
      {t.banner ? <img src={t.banner} alt="" /> : <div className="pattern" />}
      <div className="banner-status"><StatusBadge status={t.status} /></div>
      <div className="banner-mode">{t.gameMode}</div>
    </div>
    <div className="tournament-body">
      <div className="row between"><h3>{t.title}</h3>{t.status === 'live' && <Radio size={16} className="bad" />}</div>
      <div className="tournament-meta"><span className="chip">{t.teamType}</span><span className="chip">{t.mapName}</span>{t.joined && <span className="chip" style={{ color: '#6ee7b7' }}>✓ Joined</span>}</div>
      <div className="tournament-stats">
        <div><span>Prize pool</span><strong>{shortMoney(t.prizePool)}</strong></div>
        <div><span>Entry fee</span><strong>{money(t.entryFee)}</strong></div>
        <div><span>Slots</span><strong>{t.joinedCount}/{t.slots}</strong></div>
      </div>
      {!compact && <>
        <div className="slots-line"><span><Users size={12} /> {pct}% filled</span><span>{dateTime(t.startsAt)}</span></div>
        <Progress value={t.joinedCount} max={t.slots} />
        <div className="row between"><span className="chip"><Ticket size={12} /> Starts in {countdown}</span>
          <span className="btn tiny ghost">Details <ArrowRight size={13} /></span></div>
      </>}
    </div>
  </Link>;
}
