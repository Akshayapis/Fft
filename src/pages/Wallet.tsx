import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet as WalletIcon, ArrowDownToLine, ArrowUpFromLine, Coins, Receipt, ShieldCheck, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { useLoad } from '../lib/hooks';
import { money, dateTime } from '../lib/format';
import { PageHeader, Tabs, StatusBadge, EmptyState, SkeletonCards, ErrorState, Chart, AnimatedNumber } from '../components/UICommon';

const TYPES: Record<string, string> = {
  deposit_credit: 'Deposit', entry_fee: 'Entry fee', refund: 'Refund', prize: 'Prize',
  withdrawal_reserve: 'Withdrawal hold', withdrawal_reversal: 'Withdrawal reversed',
  withdrawal_paid: 'Withdrawal paid', admin_adjustment: 'Admin adjustment',
};
export function WalletPage() {
  const [tab, setTab] = useState('all');
  const { data, loading, error, reload } = useLoad(() => api.get<any>('/wallet'), []);
  const w = data?.wallet || {};
  const all = data?.transactions || [];
  const list = tab === 'all' ? all : tab === 'deposits' ? data?.deposits || [] : tab === 'withdrawals' ? data?.withdrawals || [] : data?.entryHistory || [];
  const total = (w.available || 0) + (w.winning || 0) + (w.reserved || 0);
  const chart = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10);
    return { label: day.slice(5), value: all.filter((t: any) => t.createdAt?.startsWith(day) && t.amount > 0).reduce((n: number, t: any) => n + t.amount, 0) / 100 };
  });
  return <>
    <PageHeader eyebrow="SECURE LEDGER" title="My Wallet" subtitle="Every credit and debit is an append-only, server-side transaction with a unique ID."
      actions={<><Link className="btn primary" to="/deposit"><ArrowDownToLine size={15} /> Deposit</Link><Link className="btn ghost" to="/withdraw"><ArrowUpFromLine size={15} /> Withdraw</Link></>} />
    <div className="grid grid-main mb">
      <div className="card wallet-hero">
        <div className="row between"><div><div className="stat-label">Total balance</div><div className="stat-value"><AnimatedNumber value={total} format={(n) => money(n)} /></div></div><WalletIcon size={32} color="#c4b5fd" /></div>
        <p className="muted small mt">Available + winning + reserved. Balances can only be changed by trusted server-side operations.</p>
        <div className="wallet-buckets mt">
          <div className="bucket"><span>Available</span><strong className="good">{money(w.available)}</strong></div>
          <div className="bucket"><span>Winning</span><strong style={{ color: '#fbbf24' }}>{money(w.winning)}</strong></div>
          <div className="bucket"><span>Pending</span><strong>{money(w.pending)}</strong></div>
          <div className="bucket"><span>Reserved</span><strong style={{ color: '#67e8f9' }}>{money(w.reserved)}</strong></div>
        </div>
      </div>
      <div className="card"><div className="card-head"><h3>Lifetime totals</h3><TrendingUp size={16} color="#6ee7b7" /></div>
        <div className="row between mb"><span className="muted small">Deposited</span><strong>{money(w.totalDeposited)}</strong></div>
        <div className="row between mb"><span className="muted small">Winnings</span><strong className="good">{money(w.totalWinnings)}</strong></div>
        <div className="row between mb"><span className="muted small">Entry fees</span><strong>{money(w.totalEntryFees)}</strong></div>
        <div className="row between"><span className="muted small">Withdrawn</span><strong>{money(w.totalWithdrawn)}</strong></div>
      </div>
    </div>
    <div className="card mb"><div className="card-head"><h3>Credits — last 7 days</h3><Coins size={16} color="#fbbf24" /></div><Chart data={chart} /></div>
    <div className="legal-banner mb"><ShieldCheck size={17} /><span><strong>Ledger integrity:</strong> clients can never write balances directly. Deposits require manual admin approval, withdrawals reserve funds atomically, and prize distribution is idempotent.</span></div>
    <Tabs active={tab} onChange={setTab} tabs={[
      { id: 'all', label: 'All transactions', count: all.length },
      { id: 'entry', label: 'Entry fees', count: (data?.entryHistory || []).length },
      { id: 'deposits', label: 'Deposits', count: (data?.deposits || []).length },
      { id: 'withdrawals', label: 'Withdrawals', count: (data?.withdrawals || []).length },
    ]} />
    {error && <ErrorState message={error} retry={reload} />}
    {loading && <SkeletonCards />}
    {!loading && !error && (list.length ? <div className="card"><div className="table-wrap"><table>
      <thead>{tab === 'all' ? <tr><th>Transaction ID</th><th>Type</th><th>Description</th><th>Date</th><th className="right">Amount</th></tr>
        : <tr><th>ID</th><th>Amount</th><th>Status</th><th>Method / Ref</th><th>Date</th></tr>}</thead>
      <tbody>{list.map((t: any) => tab === 'all' ? <tr key={t.id}>
        <td className="mono small">{t.id}</td><td><span className="chip">{TYPES[t.type] || t.type}</span></td>
        <td className="small muted">{t.description || '—'}</td><td className="small muted">{dateTime(t.createdAt)}</td>
        <td className={`right strong mono ${t.amount > 0 ? 'good' : ''}`}>{t.amount > 0 ? '+' : ''}{money(t.amount)}</td>
      </tr> : <tr key={t.id}><td className="mono small">{t.id}</td><td className="strong">{money(t.amount)}</td>
        <td><StatusBadge status={t.status} /></td><td className="small muted">{t.method || t.upiId || t.upiRef || '—'}</td><td className="small muted">{dateTime(t.createdAt)}</td></tr>)}
      </tbody></table></div></div>
      : <EmptyState icon={<Receipt size={26} />} title="Nothing here yet" text="Your transactions, deposits and withdrawals will appear as soon as you use them." />)}
  </>;
}
