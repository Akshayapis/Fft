import { useState } from 'react';
import { ArrowUpFromLine, ShieldCheck, Landmark, Wallet, Clock, Info } from 'lucide-react';
import { api } from '../lib/api';
import { useAppData } from '../lib/appdata';
import { useAuth } from '../lib/auth';
import { useLoad } from '../lib/hooks';
import { money, dateTime } from '../lib/format';
import { PageHeader, Field, StatusBadge, EmptyState, SkeletonCards, ErrorState, Spinner, useToast } from '../components/UICommon';

export function WithdrawPage() {
  const { user } = useAuth();
  const { data: pub, reload: reloadGlobal } = useAppData();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get<any>('/withdrawals'), []);
  const s = pub?.settings || {};
  const [amount, setAmount] = useState('');
  const [form, setForm] = useState({ upiId: '', holderName: '', accountNumber: '', ifsc: '', bankName: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const paiseAmount = Math.round(Number(amount) * 100) || 0;
  const withdrawable = (user?.wallet?.available || 0) + (s.allowWinningWithdrawal ? (user?.wallet?.winning || 0) : 0);
  const fee = Math.round(paiseAmount * (s.withdrawalFeePercent || 0) / 100) + (s.withdrawalFeeFlat || 0);
  const net = Math.max(0, paiseAmount - fee);
  const hasPending = (data?.withdrawals || []).some((w: any) => ['pending', 'processing'].includes(w.status));

  const submit = async () => {
    if (paiseAmount < (s.minWithdrawal || 0)) return toast(`Minimum withdrawal is ${money(s.minWithdrawal)}`, 'error');
    if (paiseAmount > (s.maxWithdrawal || 0)) return toast(`Maximum withdrawal is ${money(s.maxWithdrawal)}`, 'error');
    if (paiseAmount > withdrawable) return toast('Amount exceeds your withdrawable balance', 'error');
    if (!form.upiId || !form.holderName) return toast('Enter your UPI ID and account holder name', 'error');
    setBusy(true);
    try {
      await api.post('/withdrawals', { amount: paiseAmount, ...form });
      toast('Withdrawal requested — funds reserved', 'success');
      setAmount(''); await reload(); await reloadGlobal();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  return <>
    <PageHeader eyebrow="CASH OUT" title="Withdraw" subtitle="Request a payout. Funds are reserved atomically so they can never be spent twice." />
    {s.mode === 'practice' && <div className="legal-banner mb"><ShieldCheck size={17} /><span><strong>Practice mode.</strong> Balances are platform credits with no cash value. Real payouts require verified legality, payment providers and regional eligibility.</span></div>}
    <div className="grid grid-main">
      <div>
        <div className="card mb"><div className="card-head"><h3>Withdrawal request</h3><ArrowUpFromLine size={17} color="#67e8f9" /></div>
          <div className="info-banner mb"><Wallet size={16} /><span>Available to withdraw: <strong>{money(withdrawable)}</strong> · Min {money(s.minWithdrawal)} · Max {money(s.maxWithdrawal)}</span></div>
          <Field label="Amount (₹)" required><input type="number" min={1} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 500" /></Field>
          <div className="form-grid">
            <Field label="UPI ID" required><input value={form.upiId} onChange={(e) => set('upiId', e.target.value)} placeholder="name@bank" /></Field>
            <Field label="Account holder name" required><input value={form.holderName} onChange={(e) => set('holderName', e.target.value)} placeholder="As on bank account" /></Field>
            <Field label="Bank account number" hint="Optional, if enabled by admin"><input value={form.accountNumber} onChange={(e) => set('accountNumber', e.target.value)} placeholder="Optional" /></Field>
            <Field label="IFSC code"><input value={form.ifsc} onChange={(e) => set('ifsc', e.target.value)} placeholder="Optional" /></Field>
            <Field label="Bank name"><input value={form.bankName} onChange={(e) => set('bankName', e.target.value)} placeholder="Optional" /></Field>
          </div>
          <div className="kv-grid mb">
            <div className="kv"><span>Requested</span><strong>{money(paiseAmount)}</strong></div>
            <div className="kv"><span>Fee ({(s.withdrawalFeePercent || 0)}%{s.withdrawalFeeFlat ? ` + ${money(s.withdrawalFeeFlat)}` : ''})</span><strong>{money(fee)}</strong></div>
            <div className="kv"><span>You receive</span><strong className="good">{money(net)}</strong></div>
          </div>
          {hasPending && <div className="legal-banner mb"><Clock size={16} /><span>You already have a request in progress. Wait for it to be paid or rejected before submitting another.</span></div>}
          <button className="btn primary block" disabled={busy || hasPending} onClick={() => void submit()}>{busy ? <Spinner /> : 'Request withdrawal'}</button>
        </div>
        <div className="card"><div className="card-head"><h3>Payout policy</h3><Landmark size={16} color="#a78bfa" /></div>
          <p className="muted small">Requests move through Pending → Processing → Paid, or Rejected with a reason. Rejected requests return the reserved amount to your balance automatically. Only one active request is allowed at a time.</p>
        </div>
      </div>
      <div className="card"><div className="card-head"><h3>Withdrawal history</h3><StatusBadge status={(data?.withdrawals || []).length ? 'pending' : 'completed'} label={`${(data?.withdrawals || []).length} requests`} /></div>
        {error && <ErrorState message={error} retry={reload} />}
        {loading && <SkeletonCards count={2} />}
        {!loading && !error && ((data?.withdrawals || []).length ? (data?.withdrawals || []).map((w: any) => <div className="kv mb" key={w.id}>
          <div className="row between"><strong>{money(w.amount)}</strong><StatusBadge status={w.status} /></div>
          <div className="dim tiny mono">{w.id}</div>
          <div className="small muted">{dateTime(w.createdAt)} · {w.upiId}</div>
          <div className="small muted">Net {money(w.net)} · Fee {money(w.fee)}</div>
          {w.rejectionReason && <p className="bad small mt">Reason: {w.rejectionReason}</p>}
        </div>) : <EmptyState icon={<Info size={24} />} title="No withdrawals yet" text="Your payout requests and their status will appear here." />)}
      </div>
    </div>
  </>;
}
