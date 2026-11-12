import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, User, Shield, ArrowRight, Zap, Trophy, Wallet, Bell, MailCheck, KeyRound, CheckCircle2 } from 'lucide-react';
import { Logo, ParticleCanvas } from '../components/Brand';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { GOOGLE_CLIENT_ID, BACKEND } from '../lib/config';
import { useToast, Field, Spinner } from '../components/UI';

const REGIONS = ['Uttar Pradesh', 'Maharashtra', 'Delhi', 'Karnataka', 'Tamil Nadu', 'West Bengal', 'Gujarat', 'Rajasthan', 'Punjab', 'Haryana', 'Bihar', 'Madhya Pradesh', 'Kerala', 'Telangana', 'Andhra Pradesh', 'Assam', 'Odisha', 'Sikkim', 'Nagaland', 'Arunachal Pradesh', 'Jammu & Kashmir', 'Other / Outside India'];

export function AuthPage({ admin = false }: { admin?: boolean }) {
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'login' | 'signup' | 'forgot' | 'reset' | 'verify'>(admin ? 'login' : 'login');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<any>({
    email: '', password: '', displayName: '', username: '', birthDate: '', region: '',
    acceptTerms: false, remember: true, token: '', newPassword: '',
  });
  const [outbox, setOutbox] = useState<any[] | null>(null);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const googleEnabled = BACKEND === 'firebase' || !!GOOGLE_CLIENT_ID;

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast(ok, 'success'); }
    catch (e: any) { toast(e?.message || 'Something went wrong', 'error'); }
    finally { setBusy(false); }
  };

  const submitLogin = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (admin) await auth.adminLogin(form.email, form.password, form.remember);
      else await auth.login(form.email, form.password, form.remember);
      navigate(admin ? '/admin' : '/dashboard', { replace: true });
    }, admin ? 'Admin session started' : 'Welcome back, player!');
  };

  const submitRegister = (e: FormEvent) => {
    e.preventDefault();
    if (!form.acceptTerms) return toast('Please accept the terms and eligibility confirmation', 'error');
    if (!form.birthDate) return toast('Please enter your date of birth', 'error');
    void run(async () => { await auth.register(form); navigate('/dashboard', { replace: true }); }, 'Account created! Check your email for a verification token.');
  };

  const loadOutbox = async () => {
    try { const o = await api.get<any>('/auth/dev/outbox'); setOutbox(o.messages); }
    catch (e: any) { toast(e?.message || 'Outbox unavailable', 'error'); }
  };

  return <div className="auth-page">
    <div className="auth-visual">
      <ParticleCanvas dense />
      <Link to="/"><Logo size={46} /></Link>
      <div className="auth-hero">
        <div className="eyebrow">THE INDEPENDENT COMPETITIVE CIRCUIT</div>
        <h1>ENTER THE<br /><span>ARENA.</span></h1>
        <p>Compete in skill-based community tournaments, track verified results, manage your wallet, and climb the season leaderboard — all in one place.</p>
        <div className="auth-features">
          <div className="auth-feature"><Trophy size={15} color="#a78bfa" /> Verified results</div>
          <div className="auth-feature"><Wallet size={15} color="#67e8f9" /> Transparent ledger</div>
          <div className="auth-feature"><Bell size={15} color="#6ee7b7" /> Live notifications</div>
          <div className="auth-feature"><Zap size={15} color="#fcd34d" /> Instant room access</div>
        </div>
      </div>
      <div className="row gap small" style={{ color: '#6b76a0' }}><Shield size={14} /> Original branding · Independent community platform · Not affiliated with any game publisher</div>
    </div>

    <div className="auth-side">
      <ParticleCanvas />
      <div className="auth-card">
        <Logo size={42} />
        {admin ? <>
          <div className="eyebrow mt">SECURE OPERATIONS</div><h2>Admin sign in</h2>
          <p className="muted small mt">A separate, role-verified login for administrators. Admin actions are audited.</p>
        </> : <>
          <div className="auth-tabs">
            <button className={tab === 'login' ? 'active' : ''} onClick={() => setTab('login')}>Sign in</button>
            <button className={tab === 'signup' ? 'active' : ''} onClick={() => setTab('signup')}>Create account</button>
          </div>
        </>}

        {(tab === 'login') && <form onSubmit={submitLogin} className="mt">
          <Field label="Email address" required><div className="input-row"><Mail size={16} className="dim" />
            <input type="email" required autoComplete="email" placeholder="player@example.com" value={form.email} onChange={(e) => set('email', e.target.value)} /></div></Field>
          <Field label="Password" required><div className="password-wrap"><Lock size={16} className="dim" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input type={show ? 'text' : 'password'} required autoComplete="current-password" placeholder="••••••••" style={{ paddingLeft: 36 }}
              value={form.password} onChange={(e) => set('password', e.target.value)} />
            <button type="button" className="password-toggle" onClick={() => setShow((v) => !v)} aria-label="Toggle password visibility">{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div></Field>
          <div className="row between mb"><label className="checkbox-line"><input type="checkbox" checked={form.remember} onChange={(e) => set('remember', e.target.checked)} /> Remember me</label>
            {!admin && <button type="button" className="link-btn small" onClick={() => setTab('forgot')}>Forgot password?</button>}</div>
          <button className="btn primary block" disabled={busy}>{busy ? <Spinner /> : <><ArrowRight size={16} /> {admin ? 'Access admin panel' : 'Sign in'}</>}</button>
          {!admin && googleEnabled && <>
            <div className="auth-divider">OR CONTINUE WITH</div>
            <button type="button" className="btn block" onClick={() => void run(async () => { await auth.google(); navigate('/dashboard', { replace: true }); }, 'Signed in with Google')}>
              <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.5 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6.1C12.3 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.9 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.9c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7.2-10.2 7.2-17.6z"/><path fill="#FBBC05" d="M10.4 28.6a14.5 14.5 0 0 1 0-9.2l-7.8-6.1a24 24 0 0 0 0 21.4l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.6-5.9c-2.1 1.4-4.8 2.3-7.7 2.3-6.3 0-11.7-4.2-13.6-9.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg> Google</button>
          </>}
          <div className="auth-footer">{admin ? <>Not an admin? <Link className="link-btn" to="/login">Player sign in</Link></> : <>Operator? <Link className="link-btn" to="/admin/login">Admin panel</Link></>}</div>
        </form>}

        {(tab === 'signup' && !admin) && <form onSubmit={submitRegister}>
          <div className="form-grid">
            <Field label="Display name" required><input required minLength={2} maxLength={40} placeholder="e.g. ShadowStrike" value={form.displayName} onChange={(e) => set('displayName', e.target.value)} /></Field>
            <Field label="Username"><input placeholder="optional" maxLength={24} value={form.username} onChange={(e) => set('username', e.target.value)} /></Field>
          </div>
          <Field label="Email address" required><input type="email" required placeholder="player@example.com" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Password" hint="At least 8 characters" required><div className="password-wrap"><input type={show ? 'text' : 'password'} required minLength={8} placeholder="••••••••" value={form.password} onChange={(e) => set('password', e.target.value)} />
            <button type="button" className="password-toggle" onClick={() => setShow((v) => !v)}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></Field>
          <div className="form-grid">
            <Field label="Date of birth" required hint="18+ only; enforced server-side"><input type="date" required value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} /></Field>
            <Field label="Region" required><select required value={form.region} onChange={(e) => set('region', e.target.value)}><option value="">Select region</option>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
          </div>
          <label className="checkbox-line mb"><input type="checkbox" checked={form.acceptTerms} onChange={(e) => set('acceptTerms', e.target.checked)} />
            <span>I confirm I meet the minimum age and accept the <a className="link-btn" href="#terms" onClick={(e) => { e.preventDefault(); toast('Terms URL is configured by the operator in Admin → Settings', 'info'); }}>terms & fair-play policy</a>. I understand practice credits have no cash value.</span></label>
          <button className="btn primary block" disabled={busy}>{busy ? <Spinner /> : <><User size={16} /> Create account</>}</button>
          <div className="auth-footer">Already registered? <button className="link-btn" onClick={() => setTab('login')}>Sign in</button></div>
        </form>}

        {(tab === 'forgot' && !admin) && <form className="mt" onSubmit={(e) => { e.preventDefault(); void run(async () => {
          const msg = await auth.forgot(form.email); toast(msg, 'success');
          setTab(BACKEND === 'firebase' ? 'login' : 'reset');
        }, 'Reset instructions sent'); }}>
          <div className="eyebrow">ACCOUNT RECOVERY</div><h3>Forgot your password?</h3>
          <p className="muted small mt mb">We'll send a reset token to your email. No account details are revealed if the email is unknown.</p>
          <Field label="Email address" required><input type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="player@example.com" /></Field>
          <button className="btn primary block" disabled={busy}>{busy ? <Spinner /> : 'Send reset instructions'}</button>
          <div className="auth-footer"><button className="link-btn" onClick={() => setTab('login')}>Back to sign in</button></div>
        </form>}

        {(tab === 'reset' && !admin) && <form className="mt" onSubmit={(e) => { e.preventDefault(); void run(async () => {
          await auth.reset(form.token, form.newPassword); toast('Password updated. Sign in with your new password.', 'success'); setTab('login');
        }, 'Password updated'); }}>
          <div className="eyebrow"><KeyRound size={12} /> ACCOUNT RECOVERY</div><h3>Set a new password</h3>
          <Field label="Reset token" required><input required value={form.token} onChange={(e) => set('token', e.target.value)} placeholder="Paste token from email" /></Field>
          <Field label="New password" required><input type="password" required minLength={8} value={form.newPassword} onChange={(e) => set('newPassword', e.target.value)} /></Field>
          <button className="btn primary block" disabled={busy}>{busy ? <Spinner /> : 'Update password'}</button>
          <div className="auth-footer"><button className="link-btn" onClick={() => setTab('login')}>Back to sign in</button></div>
        </form>}

        {(tab === 'verify' && !admin) && <form className="mt" onSubmit={(e) => { e.preventDefault(); void run(async () => {
          await auth.verify(form.token); toast('Email verified', 'success'); setTab('login');
        }, 'Email verified'); }}>
          <div className="eyebrow"><MailCheck size={12} /> EMAIL VERIFICATION</div><h3>Verify your email</h3>
          <Field label="Verification token" required><input required value={form.token} onChange={(e) => set('token', e.target.value)} placeholder="Paste token from email" /></Field>
          <button className="btn primary block" disabled={busy}>{busy ? <Spinner /> : 'Verify email'}</button>
          <button type="button" className="btn ghost block mt" onClick={() => void run(async () => toast(await auth.resend(), 'success'), 'Verification email sent')}>Resend verification</button>
        </form>}

        {!admin && BACKEND === 'local' && auth.config?.devOutbox && <div className="divider" />
        }
        {!admin && BACKEND === 'local' && auth.config?.devOutbox && <div className="center">
          <button className="link-btn tiny" onClick={() => void loadOutbox()}>Local mail outbox (dev)</button>
          {outbox && <div className="mt small left" style={{ maxHeight: 170, overflowY: 'auto' }}>
            {outbox.length === 0 && <p className="muted">No messages yet.</p>}
            {outbox.map((m) => <div key={m.id} className="kv mb"><span>{m.subject} · {new Date(m.createdAt).toLocaleTimeString('en-IN')}</span>
              <strong className="mono small">{m.token || 'no token'}</strong>
              {m.token && <button className="btn tiny ghost mt" onClick={() => { set('token', m.token); setTab(m.subject.includes('Reset') ? 'reset' : 'verify'); }}>Use this token</button>}
            </div>)}
          </div>}
        </div>}
        {!admin && <div className="mt center"><button className="link-btn tiny" onClick={() => setTab('verify')}><CheckCircle2 size={12} /> Verify email</button></div>}
      </div>
    </div>
  </div>;
}

export function SetupRequiredPage() {
  return <div className="setup-page"><ParticleCanvas />
    <div className="card setup-card">
      <Logo size={48} /><div className="eyebrow mt-lg">CONFIGURATION REQUIRED</div>
      <h1>Connect your Firebase project</h1>
      <p className="muted mt">This deployment requested the Firebase backend, but no Firebase configuration was supplied. This app never invents credentials. Copy <code>.env.example</code> to <code>.env</code> and fill in your project's own values, then rebuild.</p>
      <pre className="mt">{`VITE_BACKEND=firebase
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_API_BASE_URL=https://<region>-<project>.cloudfunctions.net`}</pre>
      <p className="muted small mt">Then deploy the rules and functions: <code>npm run deploy:firebase</code>. See <strong>docs/FIREBASE_SETUP.md</strong> for the complete checklist. To run the fully working self-hosted backend instead, set <code>VITE_BACKEND=local</code> (or leave it unset).</p>
    </div>
  </div>;
}
