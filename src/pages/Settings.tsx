import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Bell, Palette, Ban, HeartPulse, Globe2, Scale, Info, KeyRound, Trash2, Check } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAppData } from '../lib/appdata';
import { useToast, PageHeader, Field, Modal, Spinner, StatusBadge } from '../components/UICommon';
import { dateOnly } from '../lib/format';

export function SettingsPage() {
  const { user, refresh, config, backend } = useAuth();
  const { data } = useAppData();
  const toast = useToast();
  const s = data?.settings || {};
  const [compact, setCompact] = useState(() => localStorage.getItem('nexus_compact') === 'true');
  const [reduce, setReduce] = useState(() => localStorage.getItem('nexus_reduce') === 'true');
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [excludeOpen, setExcludeOpen] = useState(false);
  const toggle = (key: string, value: boolean, setter: (v: boolean) => void) => {
    localStorage.setItem(key, String(value)); setter(value);
    document.documentElement.classList.toggle('compact-mode', key === 'nexus_compact' ? value : compact);
    toast('Preference saved on this device', 'success');
  };
  const selfExclude = async () => {
    setBusy(true);
    try { await api.post('/profile/self-exclude', { days }); await refresh(); toast(`Paid contests paused for ${days} days`, 'success'); setExcludeOpen(false); }
    catch (e: any) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  const activeExclusion = user?.selfExcludedUntil && new Date(user.selfExcludedUntil) > new Date();
  return <>
    <PageHeader eyebrow="PREFERENCES" title="Settings" subtitle="Account preferences, safety controls and platform compliance information." />
    <div className="grid grid-2">
      <div className="card"><div className="card-head"><h3><Palette size={17} color="#a78bfa" /> Appearance</h3></div>
        <label className="checkbox-line mb"><input type="checkbox" checked={compact} onChange={(e) => toggle('nexus_compact', e.target.checked, setCompact)} /><span>Compact spacing (saved on this device)</span></label>
        <label className="checkbox-line"><input type="checkbox" checked={reduce} onChange={(e) => toggle('nexus_reduce', e.target.checked, setReduce)} /><span>Reduce decorative animation (respects your OS setting automatically)</span></label>
        <div className="divider" />
        <p className="muted small">The background is generated entirely in code — particles, glows, smoke and drifting light. No external video or official game art is used.</p>
      </div>
      <div className="card"><div className="card-head"><h3><Bell size={17} color="#67e8f9" /> Notifications</h3></div>
        <p className="muted small mb">All match, wallet, result and announcement notifications are delivered to your in-app notification center. Unread counts update live.</p>
        <Link className="btn ghost block" to="/notifications">Open notification center</Link>
      </div>
      <div className="card"><div className="card-head"><h3><ShieldCheck size={17} className="good" /> Compliance & eligibility</h3><StatusBadge status={s.mode === 'real' ? 'approved' : 'pending'} label={s.mode === 'real' ? 'Real-money enabled' : 'Practice mode'} /></div>
        <div className="kv mb"><span>Minimum age</span><strong>{s.minAge || 18} years</strong></div>
        <div className="kv mb"><span>Real-money contests</span><strong>{s.mode === 'real' ? 'Enabled' : 'Disabled'}</strong></div>
        <div className="kv mb"><span>Terms URL</span><strong className="small">{s.termsUrl || 'Not configured'}</strong></div>
        <div className="kv mb"><span>Blocked regions</span><strong className="small">{(s.blockedRegions || []).slice(0, 4).join(', ') || 'None'}{(s.blockedRegions || []).length > 4 ? ` +${s.blockedRegions.length - 4}` : ''}</strong></div>
        <p className="muted small mt">{s.complianceNote}</p>
      </div>
      <div className="card"><div className="card-head"><h3><HeartPulse size={17} color="#fb7185" /> Responsible play</h3></div>
        <div className="kv mb"><span>Daily deposit limit</span><strong>₹{((s.responsiblePlay?.dailyDepositLimit || 0) / 100).toLocaleString('en-IN')}</strong></div>
        <div className="kv mb"><span>Monthly deposit limit</span><strong>₹{((s.responsiblePlay?.monthlyDepositLimit || 0) / 100).toLocaleString('en-IN')}</strong></div>
        {activeExclusion && <div className="legal-banner mb"><Ban size={16} /> Self-exclusion is active until {dateOnly(user.selfExcludedUntil)}.</div>}
        <button className="btn ghost block" onClick={() => setExcludeOpen(true)}><Ban size={15} /> Take a break (self-exclude)</button>
        <p className="muted tiny mt">Self-exclusion blocks paid contests for the chosen period. It cannot be reversed early.</p>
      </div>
      <div className="card"><div className="card-head"><h3><Globe2 size={17} color="#67e8f9" /> Platform</h3></div>
        <div className="kv mb"><span>Backend</span><strong>{backend === 'firebase' ? 'Firebase / Firestore' : 'Self-hosted / SQLite'}</strong></div>
        <div className="kv mb"><span>API mode</span><strong>{config?.mode || 'practice'}</strong></div>
        <div className="kv mb"><span>Account region</span><strong>{user?.region || 'Not set'}</strong></div>
        <div className="kv"><span>Google sign-in</span><strong>{config?.googleClientId || backend === 'firebase' ? 'Available' : 'Not configured'}</strong></div>
      </div>
      <div className="card"><div className="card-head"><h3><Scale size={17} color="#fbbf24" /> Legal</h3></div>
        <p className="muted small">Nexus Arena is an independent community platform with original branding. It is not affiliated with, endorsed by, or connected to any game publisher. Skill-based contests with entry fees and cash prizes may be regulated in your jurisdiction; operators must verify legality, payment-provider requirements, age restrictions and regional availability before enabling real-money mode.</p>
        <div className="divider" />
        <div className="row gap wrap"><Link className="btn ghost small" to="/support"><Info size={14} /> Support & FAQ</Link><Link className="btn ghost small" to="/profile"><KeyRound size={14} /> Security</Link><Link className="btn ghost small" to="/profile"><Trash2 size={14} /> Delete account</Link></div>
      </div>
    </div>
    {excludeOpen && <Modal title="Take a break" subtitle="Self-exclusion pauses paid contests on your account." onClose={() => setExcludeOpen(false)}>
      <div className="legal-banner mb"><Ban size={16} /> This is a responsible-play safeguard. It takes effect immediately and cannot be undone early.</div>
      <Field label="Duration (days)" required><input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} /></Field>
      <button className="btn primary block" disabled={busy} onClick={() => void selfExclude()}>{busy ? <Spinner /> : <><Check size={15} /> Activate self-exclusion</>}</button>
    </Modal>}
  </>;
}
