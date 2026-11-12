import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { X, Check, AlertTriangle, Info, Loader2, Copy, Inbox } from 'lucide-react';
import { statusLabel, statusTone } from '../lib/format';

/* ── Toasts ──────────────────────────────────────────────────────── */
type Toast = { id: number; message: string; tone: 'success' | 'error' | 'info' };
const ToastCtx = createContext<(message: string, tone?: Toast['tone']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, message, tone }]);
    window.setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4800);
  }, []);
  return <ToastCtx.Provider value={push}>
    {children}
    <div className="toast-stack" aria-live="polite">
      {items.map((t) => <div key={t.id} className={`toast toast-${t.tone}`} role="status">
        <span className="toast-icon">{t.tone === 'success' ? <Check size={16} /> : t.tone === 'error' ? <AlertTriangle size={16} /> : <Info size={16} />}</span>
        <span>{t.message}</span>
        <button className="icon-btn tiny" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} aria-label="Dismiss"><X size={14} /></button>
      </div>)}
    </div>
  </ToastCtx.Provider>;
}

/* ── Confirmation dialog ─────────────────────────────────────────── */
type ConfirmState = { message: string; title: string; danger: boolean; resolve: (v: boolean) => void } | null;
const ConfirmCtx = createContext<(message: string, opts?: { title?: string; danger?: boolean }) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState>(null);
  const confirm = useCallback((message: string, opts: { title?: string; danger?: boolean } = {}) =>
    new Promise<boolean>((resolve) => setState({ message, title: opts.title || 'Please confirm', danger: !!opts.danger, resolve })), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  return <ConfirmCtx.Provider value={confirm}>
    {children}
    {state && <div className="modal-backdrop" onClick={() => close(false)}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={`confirm-icon ${state.danger ? 'danger' : ''}`}><AlertTriangle size={22} /></div>
        <h3>{state.title}</h3><p className="muted">{state.message}</p>
        <div className="row end gap mt">
          <button className="btn ghost" onClick={() => close(false)}>Cancel</button>
          <button className={`btn ${state.danger ? 'danger' : 'primary'}`} onClick={() => close(true)}>Confirm</button>
        </div>
      </div>
    </div>}
  </ConfirmCtx.Provider>;
}

/* ── Modal ───────────────────────────────────────────────────────── */
export function Modal({ title, subtitle, onClose, children, wide = false }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head">
        <div><h3>{title}</h3>{subtitle && <p className="muted small">{subtitle}</p>}</div>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <div className="modal-body">{children}</div>
    </div>
  </div>;
}

/* ── Primitives ──────────────────────────────────────────────────── */
export const Spinner = ({ size = 20 }: { size?: number }) => <Loader2 size={size} className="spin" />;
export const Skeleton = ({ height = 18, width = '100%' }: { height?: number; width?: string | number }) =>
  <div className="skeleton" style={{ height, width }} />;
export const SkeletonCards = ({ count = 4 }: { count?: number }) => <div className="grid grid-4">
  {Array.from({ length: count }, (_, i) => <div className="card" key={i}><Skeleton height={16} width="45%" /><div className="mt"><Skeleton height={34} width="65%" /></div><Skeleton height={12} width="80%" /></div>)}
</div>;
export function EmptyState({ title, text, icon, action }: { title: string; text?: string; icon?: React.ReactNode; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon || <Inbox size={26} />}</div><h3>{title}</h3>{text && <p className="muted">{text}</p>}{action && <div className="mt">{action}</div>}</div>;
}
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={`badge tone-${statusTone(status)}`}><i />{label || statusLabel(status)}</span>;
}
export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: string; actions?: React.ReactNode }) {
  return <div className="page-head">
    <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>
    {actions && <div className="row gap wrap">{actions}</div>}
  </div>;
}
export function AnimatedNumber({ value, format = (n: number) => n.toLocaleString('en-IN'), duration = 700 }: {
  value: number; format?: (n: number) => string; duration?: number;
}) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(value); return; }
    let raf = 0; const start = performance.now(); const from = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setShown(Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(shown)}</>;
}
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const toast = useToast();
  return <button className="btn tiny ghost" onClick={async () => {
    try { await navigator.clipboard.writeText(value); toast(`${label} copied`, 'success'); }
    catch { toast('Could not copy — select the text manually', 'error'); }
  }}><Copy size={13} /> {label}</button>;
}
export function Field({ label, hint, children, required }: { label: string; hint?: string; children: React.ReactNode; required?: boolean }) {
  return <label className="field"><span className="field-label">{label}{required && <em> *</em>}</span>{children}{hint && <small className="field-hint">{hint}</small>}</label>;
}
export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string; count?: number }[]; active: string; onChange: (id: string) => void }) {
  return <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.id} role="tab" aria-selected={active === t.id}
    className={`tab ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
    {t.label}{t.count !== undefined && <span className="tab-count">{t.count}</span>}
  </button>)}</div>;
}
export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div className="progress"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>;
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="card error-card"><AlertTriangle size={20} /><div><strong>Could not load data</strong><p className="muted small">{message}</p></div>{retry && <button className="btn ghost" onClick={retry}>Retry</button>}</div>;
}
export function Chart({ data, color = 'var(--violet)' }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return <div className="chart">{data.map((d, i) => <div className="chart-col" key={i} title={`${d.label}: ${d.value}`}>
    <div className="chart-bar" style={{ height: `${Math.max(4, (d.value / max) * 100)}%`, background: color }} />
    <span>{d.label}</span>
  </div>)}</div>;
}
