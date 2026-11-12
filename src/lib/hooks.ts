import { useCallback, useEffect, useRef, useState } from 'react';

export function useLoad<T>(loader: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const fn = useRef(loader);
  fn.current = loader;
  const run = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await fn.current()); }
    catch (e: any) { if (e?.name !== 'AbortError') setError(e?.message || 'Could not load this page.'); }
    finally { setLoading(false); }
  }, deps);
  useEffect(() => { void run(); }, [run]);
  return { data, setData, loading, error, reload: run };
}

export function useCountdown(target?: string) {
  const [text, setText] = useState('—');
  useEffect(() => {
    if (!target) { setText('—'); return; }
    const tick = () => {
      const diff = new Date(target).getTime() - Date.now();
      if (Number.isNaN(diff)) { setText('—'); return; }
      if (diff <= 0) { setText('Started'); return; }
      const d = Math.floor(diff / 86400000), h = Math.floor(diff / 3600000) % 24,
        m = Math.floor(diff / 60000) % 60, s = Math.floor(diff / 1000) % 60;
      setText(`${d > 0 ? `${d}d ` : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [target]);
  return text;
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const id = window.setTimeout(() => setV(value), delay); return () => window.clearTimeout(id); }, [value, delay]);
  return v;
}
