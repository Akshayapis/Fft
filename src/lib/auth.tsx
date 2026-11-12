import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken, setToken } from './api';
import { BACKEND, firebaseConfig, GOOGLE_CLIENT_ID } from './config';

export type User = {
  id: string; email: string; displayName: string; username: string; role: 'user' | 'admin';
  emailVerified: boolean; suspended: boolean; avatar: string; playerId: string; wallet: any;
  stats?: any; unread?: number; createdAt: string; region?: string; birthDate?: string;
  selfExcludedUntil?: string; bio?: string; phone?: string; deletionRequested?: boolean;
};
type AuthValue = {
  booting: boolean; user: User | null; backend: string; config: any;
  refresh: () => Promise<void>;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  register: (data: any) => Promise<void>;
  adminLogin: (email: string, password: string, remember?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  forgot: (email: string) => Promise<string>;
  reset: (token: string, password: string) => Promise<void>;
  verify: (token: string) => Promise<void>;
  resend: () => Promise<string>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<string>;
  google: () => Promise<void>;
};
const Ctx = createContext<AuthValue>(null as any);
export const useAuth = () => useContext(Ctx);

let fbAuth: any = null;
async function firebaseAuth() {
  if (fbAuth) return fbAuth;
  const { initializeApp, getApps } = await import('firebase/app');
  const { getAuth } = await import('firebase/auth');
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  fbAuth = getAuth(app);
  return fbAuth;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<any>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!getToken()) { if (alive.current) setUser(null); return; }
    try {
      const me = await api.get<any>('/me');
      if (alive.current) setUser(me.user);
    } catch (e: any) {
      if (e?.status === 401) { setToken(''); if (alive.current) setUser(null); }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    (async () => {
      try { setConfig(await api.get('/config')); } catch { setConfig(null); }
      if (BACKEND === 'firebase') {
        try {
          const auth = await firebaseAuth();
          const { onIdTokenChanged } = await import('firebase/auth');
          onIdTokenChanged(auth, async (fbUser: any) => {
            if (!fbUser) { setToken(''); if (alive.current) setUser(null); setBooting(false); return; }
            const t = await fbUser.getIdToken();
            setToken(t, true);
            try { await api.post('/auth/session', { displayName: fbUser.displayName || '' }); } catch { /* profile sync retried on refresh */ }
            await refresh();
            setBooting(false);
          });
        } catch { setBooting(false); }
      } else {
        await refresh();
        setBooting(false);
      }
    })();
    const onUnauthorized = () => setUser(null);
    window.addEventListener('nexus:unauthorized', onUnauthorized);
    return () => { alive.current = false; window.removeEventListener('nexus:unauthorized', onUnauthorized); };
  }, [refresh]);

  const localLogin = async (path: string, email: string, password: string, remember = true) => {
    const out = await api.post<any>(path, { email, password, remember });
    setToken(out.token, remember);
    if (out.user) setUser(out.user);
    await refresh();
  };

  const firebaseSignIn = async (email: string, password: string) => {
    const auth = await firebaseAuth();
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    await signInWithEmailAndPassword(auth, email, password);
    const t = await auth.currentUser!.getIdToken(true);
    setToken(t, true);
    await api.post('/auth/session', { displayName: auth.currentUser?.displayName || '' });
    await refresh();
  };

  const value: AuthValue = useMemo(() => ({
    booting, user, backend: BACKEND, config, refresh,
    async login(email, password, remember = true) {
      if (BACKEND === 'firebase') return firebaseSignIn(email, password);
      return localLogin('/auth/login', email, password, remember);
    },
    async adminLogin(email, password, remember = true) {
      if (BACKEND === 'firebase') {
        await firebaseSignIn(email, password);
        const { signOut } = await import('firebase/auth');
        const auth = await firebaseAuth();
        const claims = (await auth.currentUser!.getIdTokenResult(true)).claims;
        if (claims.admin !== true) { await signOut(auth); throw new Error('This account does not have admin permissions.'); }
        await api.post('/auth/admin/login', {});
        await refresh();
        return;
      }
      return localLogin('/auth/admin/login', email, password, remember);
    },
    async register(data) {
      if (BACKEND === 'firebase') {
        const auth = await firebaseAuth();
        const { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } = await import('firebase/auth');
        const cred = await createUserWithEmailAndPassword(auth, data.email, data.password);
        try { await updateProfile(cred.user, { displayName: data.displayName }); } catch { /* optional */ }
        const t = await cred.user.getIdToken(true);
        setToken(t, true);
        await api.post('/auth/session', { displayName: data.displayName, birthDate: data.birthDate, region: data.region, acceptTerms: data.acceptTerms });
        try { await sendEmailVerification(cred.user); } catch { /* deliver later */ }
        await refresh();
        return;
      }
      const out = await api.post<any>('/auth/register', { ...data, acceptTerms: true });
      setToken(out.token, data.remember ?? true);
      if (out.user) setUser(out.user);
      await refresh();
    },
    async logout() {
      try {
        if (BACKEND === 'firebase') { const auth = await firebaseAuth(); const { signOut } = await import('firebase/auth'); await signOut(auth); }
        else await api.post('/auth/logout', {});
      } catch { /* still clear local state */ }
      setToken('');
      setUser(null);
    },
    async forgot(email) {
      if (BACKEND === 'firebase') {
        const auth = await firebaseAuth(); const { sendPasswordResetEmail } = await import('firebase/auth');
        await sendPasswordResetEmail(auth, email);
        return 'If an account exists, a password reset email has been sent.';
      }
      const out = await api.post<any>('/auth/forgot-password', { email });
      return out.message;
    },
    async reset(token, password) {
      if (BACKEND === 'firebase') {
        const auth = await firebaseAuth(); const { confirmPasswordReset } = await import('firebase/auth');
        await confirmPasswordReset(auth, token, password); return;
      }
      await api.post('/auth/reset-password', { token, password });
    },
    async verify(token) {
      if (BACKEND === 'firebase') {
        const auth = await firebaseAuth(); const { applyActionCode } = await import('firebase/auth');
        await applyActionCode(auth, token); await refresh(); return;
      }
      await api.post('/auth/verify-email', { token }); await refresh();
    },
    async resend() {
      if (BACKEND === 'firebase') {
        const auth = await firebaseAuth(); const { sendEmailVerification } = await import('firebase/auth');
        if (!auth.currentUser) throw new Error('Please sign in first.');
        await sendEmailVerification(auth.currentUser);
        return 'Verification email sent. Check your inbox.';
      }
      const out = await api.post<any>('/auth/resend-verification', {});
      return out.message;
    },
    async changePassword(oldPassword, newPassword) {
      if (BACKEND === 'firebase') {
        const auth = await firebaseAuth();
        const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('firebase/auth');
        const u = auth.currentUser;
        if (!u || !u.email) throw new Error('Please sign in again first.');
        await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, oldPassword));
        await updatePassword(u, newPassword);
        return 'Password updated.';
      }
      const out = await api.post<any>('/auth/change-password', { oldPassword, newPassword });
      setToken(''); setUser(null);
      return out.message;
    },
    async google() {
      if (BACKEND === 'firebase') {
        const auth = await firebaseAuth();
        const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
        await signInWithPopup(auth, new GoogleAuthProvider());
        const t = await auth.currentUser!.getIdToken(true);
        setToken(t, true);
        await api.post('/auth/session', { displayName: auth.currentUser?.displayName || '', acceptTerms: true });
        await refresh();
        return;
      }
      if (!GOOGLE_CLIENT_ID) throw new Error('Google sign-in is not configured on this deployment.');
      const credential = await new Promise<string>((resolve, reject) => {
        const existing = document.getElementById('google-gsi') as HTMLScriptElement | null;
        const boot = () => {
          const g = (window as any).google?.accounts?.id;
          if (!g) return reject(new Error('Google Identity Services could not load. Check your network.'));
          g.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r: any) => r?.credential ? resolve(r.credential) : reject(new Error('Google sign-in was cancelled.')) });
          g.prompt();
        };
        if (existing && (window as any).google?.accounts?.id) return boot();
        const s = document.createElement('script');
        s.id = 'google-gsi'; s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
        s.onload = boot; s.onerror = () => reject(new Error('Google Identity Services could not load.'));
        document.head.appendChild(s);
      });
      const out = await api.post<any>('/auth/google', { credential });
      setToken(out.token, true);
      await refresh();
    },
  }), [booting, user, config, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
