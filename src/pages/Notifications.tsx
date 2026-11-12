import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, Trophy, Wallet, Megaphone, Gamepad2, LifeBuoy, Lock, Inbox } from 'lucide-react';
import { api } from '../lib/api';
import { useAppData } from '../lib/appdata';
import { useLoad } from '../lib/hooks';
import { dateTime, relative } from '../lib/format';
import { PageHeader, Tabs, EmptyState, SkeletonCards, ErrorState, Spinner, useToast } from '../components/UICommon';

const ICONS: Record<string, any> = { registration: Gamepad2, room: Lock, result: Trophy, deposit: Wallet, withdrawal: Wallet, announcement: Megaphone, support: LifeBuoy, welcome: Bell, account: Bell, admin: Bell, match: Gamepad2 };
export function NotificationsPage() {
  const toast = useToast();
  const { reload: reloadGlobal } = useAppData();
  const [tab, setTab] = useState('all');
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useLoad(() => api.get<any>('/notifications'), []);
  const all = data?.notifications || [];
  const list = tab === 'all' ? all : tab === 'unread' ? all.filter((n: any) => !n.read) : all.filter((n: any) => n.read);
  const mark = async (ids: string[], allMark = false) => {
    setBusy(true);
    try { await api.post('/notifications/read', { ids, all: allMark }); await reload(); await reloadGlobal(); toast('Marked as read', 'success'); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  return <>
    <PageHeader eyebrow="ALERT CENTER" title="Notifications" subtitle="Registration, room releases, results, deposits, withdrawals and announcements."
      actions={<button className="btn ghost" disabled={busy || !all.some((n: any) => !n.read)} onClick={() => void mark([], true)}>{busy ? <Spinner /> : <><CheckCheck size={15} /> Mark all read</>}</button>} />
    <Tabs active={tab} onChange={setTab} tabs={[{ id: 'all', label: 'All', count: all.length }, { id: 'unread', label: 'Unread', count: all.filter((n: any) => !n.read).length }, { id: 'read', label: 'Read', count: all.filter((n: any) => n.read).length }]} />
    {error && <ErrorState message={error} retry={reload} />}
    {loading && <SkeletonCards count={4} />}
    {!loading && !error && (list.length ? <div className="card" style={{ padding: 0 }}>
      {list.map((n: any) => { const Icon = ICONS[n.type] || Bell; return <div key={n.id} className={`notification-item ${n.read ? '' : 'unread'}`}>
        {!n.read && <div className="notif-dot" />}
        <div className="notif-icon"><Icon size={17} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row between wrap gap"><strong>{n.title}</strong><span className="dim tiny">{relative(n.createdAt)}</span></div>
          <p className="muted small mt">{n.body}</p>
          <div className="row gap mt"><span className="dim tiny">{dateTime(n.createdAt)}</span>
            {n.link && <Link className="link-btn tiny" to={n.link}>Open</Link>}
            {!n.read && <button className="link-btn tiny" onClick={() => void mark([n.id])}>Mark read</button>}
          </div>
        </div>
      </div>; })}
    </div> : <EmptyState icon={<Inbox size={26} />} title={tab === 'unread' ? 'All caught up!' : 'No notifications yet'} text="Important updates about your matches and wallet will arrive here." />)}
  </>;
}
