import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ShieldCheck, QrCode, Upload, CheckCircle2, Clock, XCircle, Info } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAppData } from '../lib/appdata';
import { useLoad } from '../lib/hooks';
import { uploadFile } from '../lib/realtime';
import { money, dateTime } from '../lib/format';
import { PageHeader, Field, StatusBadge, EmptyState, SkeletonCards, ErrorState, Spinner, useToast } from '../components/UICommon';

export function DepositPage() {
  const { user } = useAuth();
  const { data: pub, reload: reloadGlobal } = useAppData();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api.get<any>('/deposits'), []);
  const s = pub?.settings || {};
  const methods = s.paymentMethods || [];
  const [method, setMethod] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [custom, setCustom] = useState('');
  const [upiRef, setUpiRef] = useState('');
  const [screenshot, setScreenshot] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!method && methods.length) setMethod(methods[0].id); }, [methods.length]);
  useEffect(() => { if (!amount && s.depositAmounts?.length) setAmount(s.depositAmounts[0]); }, [s.depositAmounts]);
  const selected = methods.find((m: any) => m.id === method);
  const effectiveAmount = custom ? Math.round(Number(custom) * 100) : amount;

  const submit = async () => {
    if (!effectiveAmount || effectiveAmount < (s.minDeposit || 0)) return toast(`Minimum deposit is ${money(s.minDeposit)}`, 'error');
    if (effectiveAmount > (s.maxDeposit || 0)) return toast(`Maximum deposit is ${money(s.maxDeposit)}`, 'error');
    if (!method) return toast('Choose a payment method', 'error');
    setBusy(true);
    try {
      await api.post('/deposits', { amount: effectiveAmount, method, upiRef, screenshotUrl: screenshot });
      toast('Deposit request submitted — pending manual verification', 'success');
      setUpiRef(''); setScreenshot(''); setCustom(''); await reload(); await reloadGlobal();
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  const onFile = async (file?: File) => {
    if (!file || !user) return;
    setBusy(true);
    try { const url = await uploadFile(file, user.id, 'deposit'); setScreenshot(url); toast('Screenshot attached', 'success'); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  return <>
    <PageHeader eyebrow="ADD CREDITS" title="Deposit" subtitle="Submit a payment request. An admin verifies it manually — a screenshot alone never credits your wallet." />
    {s.mode === 'practice' && <div className="legal-banner mb"><ShieldCheck size={17} /><span><strong>Practice mode.</strong> Balances are platform credits with no cash value. No real-money payment is taken until the operator completes legal and payment-provider verification. Deposits below are manual credit requests reviewed by an admin.</span></div>}
    <div className="grid grid-main">
      <div>
        <div className="card mb"><div className="card-head"><h3>1 · Choose amount</h3><span className="chip">Min {money(s.minDeposit)} · Max {money(s.maxDeposit)}</span></div>
          <div className="amount-grid">{(s.depositAmounts || []).map((a: number) => <button key={a} className={`amount-btn ${!custom && amount === a ? 'selected' : ''}`}
            onClick={() => { setAmount(a); setCustom(''); }}>{money(a)}</button>)}</div>
          <div className="mt"><Field label="Or enter a custom amount (₹)"><input type="number" min={1} step="1" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. 750" /></Field></div>
          <div className="info-banner"><Info size={16} /> <span>Selected: <strong>{money(effectiveAmount)}</strong>. Your available balance is {money(user?.wallet?.available || 0)}.</span></div>
        </div>
        <div className="card mb"><div className="card-head"><h3>2 · Payment method</h3><ArrowDownToLine size={16} color="#67e8f9" /></div>
          {methods.length ? <div className="pill-nav mb">{methods.map((m: any) => <button key={m.id} className={`btn small ${method === m.id ? 'primary' : 'ghost'}`} onClick={() => setMethod(m.id)}>{m.label}</button>)}</div>
            : <p className="muted small">No payment methods are enabled yet. Ask an admin to configure them in Settings.</p>}
          {selected && <div className="info-banner"><span>{selected.note || 'Follow the instructions configured by the admin, then submit the reference number.'}</span></div>}
          {selected?.upiId && <div className="kv mt"><span>UPI ID</span><strong className="mono">{selected.upiId}</strong></div>}
          {selected?.qrUrl && <div className="row gap mt"><div className="qr-box"><QrCode size={90} /><img src={selected.qrUrl} alt="Payment QR" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /></div>
            <div className="muted small">Scan the QR code with any UPI app. Payment screenshots are optional but speed up verification.</div></div>}
        </div>
        <div className="card"><div className="card-head"><h3>3 · Submit proof</h3><Upload size={16} color="#a78bfa" /></div>
          <Field label="UPI reference / transaction number" hint="12-digit UTR or reference from your payment app"><input value={upiRef} maxLength={80} onChange={(e) => setUpiRef(e.target.value)} placeholder="e.g. 4289 1234 5678" /></Field>
          <Field label="Payment screenshot (optional)"><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => void onFile(e.target.files?.[0])} /></Field>
          {screenshot && <img className="upload-preview mb" src={screenshot} alt="Payment screenshot preview" />}
          <button className="btn primary block" disabled={busy || !method} onClick={() => void submit()}>{busy ? <Spinner /> : <>Submit deposit request · {money(effectiveAmount)}</>}</button>
          <p className="muted tiny mt center">Your request will be marked <strong>Pending</strong>. Credit happens only after explicit admin approval.</p>
        </div>
      </div>
      <div>
        <div className="card mb"><div className="card-head"><h3>Request status</h3><Clock size={16} color="#fbbf24" /></div>
          {error && <ErrorState message={error} retry={reload} />}
          {loading && <SkeletonCards count={2} />}
          {!loading && !error && ((data?.deposits || []).length ? (data?.deposits || []).slice(0, 6).map((d: any) => <div className="kv mb" key={d.id}>
            <div className="row between"><strong>{money(d.amount)}</strong><StatusBadge status={d.status} /></div>
            <div className="dim tiny mono">{d.id}</div><div className="dim tiny">{dateTime(d.createdAt)} · {d.method}</div>
            {d.adminNote && <p className="muted small mt">Note: {d.adminNote}</p>}
            {d.screenshotUrl && <a className="link-btn tiny" href={d.screenshotUrl} target="_blank" rel="noreferrer">View screenshot</a>}
          </div>) : <EmptyState icon={<CheckCircle2 size={24} />} title="No requests yet" text="Your deposit history and review status will appear here." />)}
        </div>
        <div className="card"><div className="card-head"><h3>How verification works</h3><ShieldCheck size={16} className="good" /></div>
          <div className="row gap mb"><CheckCircle2 size={16} className="good" /><span className="small">Admin reviews reference & screenshot</span></div>
          <div className="row gap mb"><Clock size={16} className="warn" /><span className="small">Status: Pending → Approved / Rejected</span></div>
          <div className="row gap"><XCircle size={16} className="bad" /><span className="small">Rejected requests are never credited</span></div>
        </div>
      </div>
    </div>
  </>;
}
