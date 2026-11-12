import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { subscribeToChanges } from './realtime';

type PublicData = { settings: any; banners: any[]; announcements: any[] };
const Ctx = createContext<{ data: PublicData | null; unread: number; reload: () => Promise<void>; online: boolean }>(null as any);
export const useAppData = () => useContext(Ctx);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { user, refresh } = useAuth();
  const [data, setData] = useState<PublicData | null>(null);
  const [unread, setUnread] = useState(0);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  const reload = useCallback(async () => {
    try {
      const pub = await api.get<PublicData>('/public');
      setData(pub); setOnline(true);
    } catch { setOnline(false); }
    if (user) {
      try { const n = await api.get<{ unread: number }>('/notifications'); setUnread(n.unread); }
      catch { /* handled elsewhere */ }
      try { await refresh(); } catch { /* noop */ }
    } else setUnread(0);
  }, [user?.id, refresh]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (!user?.id) return;
    return subscribeToChanges(user.id, () => {
      void api.get<{ unread: number }>('/notifications').then((n) => setUnread(n.unread)).catch(() => {});
      void api.get<PublicData>('/public').then(setData).catch(() => {});
    });
  }, [user?.id]);
  useEffect(() => {
    const up = () => { setOnline(true); void reload(); };
    const down = () => setOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, [reload]);

  return <Ctx.Provider value={{ data, unread, reload, online }}>{children}</Ctx.Provider>;
}
