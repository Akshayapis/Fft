import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, Swords } from 'lucide-react';
import { api } from '../lib/api';
import { useLoad, useDebounced } from '../lib/hooks';
import { PageHeader, Tabs, EmptyState, SkeletonCards, ErrorState } from '../components/UICommon';
import { TournamentCard } from '../components/TournamentCard';

const TABS = [
  { id: 'all', label: 'All Matches' }, { id: 'upcoming', label: 'Upcoming' },
  { id: 'registration_open', label: 'Registration Open' }, { id: 'live', label: 'Live Now' },
  { id: 'completed', label: 'Completed' }, { id: 'cancelled', label: 'Cancelled' },
];
export function MatchesPage() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('status') || 'all';
  const [tab, setTab] = useState(initial);
  const [q, setQ] = useState(params.get('q') || '');
  const [mode, setMode] = useState('all');
  const debounced = useDebounced(q, 250);
  const { data, loading, error, reload } = useLoad(() => api.get<any>('/tournaments'), []);
  const all = data?.tournaments || [];
  const modes: string[] = [...new Set<string>(all.map((t: any) => String(t.gameMode)))].sort();
  const list = all.filter((t: any) => {
    if (tab === 'upcoming' && !['upcoming', 'registration_open', 'full'].includes(t.status)) return false;
    if (tab !== 'all' && tab !== 'upcoming' && t.status !== tab) return false;
    if (mode !== 'all' && t.gameMode !== mode) return false;
    return !debounced || `${t.title} ${t.gameMode} ${t.mapName} ${t.teamType}`.toLowerCase().includes(debounced.toLowerCase());
  });

  return <>
    <PageHeader eyebrow="TOURNAMENT CIRCUIT" title="All Matches" subtitle="Browse every match, check slots and register before the cut-off." />
    <div className="card mb">
      <div className="row gap wrap">
        <div className="input-row" style={{ flex: 1, minWidth: 220 }}><Search size={16} className="dim" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, mode or map…" /></div>
        <div style={{ minWidth: 180 }}><select value={mode} onChange={(e) => setMode(e.target.value)}><option value="all">All game modes</option>{modes.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
        <span className="chip"><SlidersHorizontal size={13} /> {list.length} matches</span>
      </div>
    </div>
    <Tabs tabs={TABS.map((t) => ({ ...t, count: t.id === 'all' ? all.length : t.id === 'upcoming' ? all.filter((x: any) => ['upcoming', 'registration_open', 'full'].includes(x.status)).length : all.filter((x: any) => x.status === t.id).length }))}
      active={tab} onChange={(id) => { setTab(id); if (id === 'all') setParams({}); else setParams({ status: id }); }} />
    {error && <ErrorState message={error} retry={reload} />}
    {loading && <SkeletonCards count={6} />}
    {!loading && !error && (list.length ? <div className="grid grid-3">{list.map((t: any) => <TournamentCard key={t.id} t={t} />)}</div>
      : <EmptyState icon={<Swords size={26} />} title="No matches found" text="Try another tab or clear the search filters. New matches appear as soon as the admin creates them." />)}
  </>;
}
