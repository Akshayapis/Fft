import { useEffect, useRef } from 'react';

export function Logo({ compact = false, size = 38 }: { compact?: boolean; size?: number }) {
  return <div className="logo" style={{ gap: compact ? 0 : 11 }}>
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo-mark">
      <defs>
        <linearGradient id="nx-g" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#a855f7" /><stop offset="1" stopColor="#22d3ee" /></linearGradient>
        <linearGradient id="nx-g2" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#22d3ee" /><stop offset="1" stopColor="#3b82f6" /></linearGradient>
      </defs>
      <path d="M32 3 57 17v30L32 61 7 47V17Z" fill="none" stroke="url(#nx-g)" strokeWidth="3" />
      <path d="M32 11 50 21v22L32 53 14 43V21Z" fill="#0b1020" stroke="url(#nx-g2)" strokeWidth="1.5" opacity=".85" />
      <path d="M35 17 23 35h9l-3 13 13-20h-9l2-11Z" fill="url(#nx-g)" />
    </svg>
    {!compact && <div className="logo-text"><strong>NEXUS<span>ARENA</span></strong><small>TOURNAMENT CIRCUIT</small></div>}
  </div>;
}

/** Original, code-generated cinematic background: particles, glows, drifting light, smoke. */
export function ParticleCanvas({ dense = false }: { dense?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, raf = 0, t = 0;
    const particles = [] as { x: number; y: number; vx: number; vy: number; r: number; hue: number; a: number }[];
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(150, Math.round((w * h) / (dense ? 7000 : 14000)));
      particles.length = 0;
      for (let i = 0; i < count; i++) particles.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22, vy: -0.12 - Math.random() * 0.35,
        r: 0.7 + Math.random() * 2.2, hue: Math.random() > 0.5 ? 265 : 190, a: 0.2 + Math.random() * 0.6,
      });
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const draw = () => {
      t += 1;
      ctx.clearRect(0, 0, w, h);
      // drifting volumetric light beams
      for (let i = 0; i < 3; i++) {
        const x = w * (0.2 + i * 0.32) + Math.sin(t / (240 + i * 70)) * 40;
        const grad = ctx.createRadialGradient(x, h * 0.55, 0, x, h * 0.55, Math.max(w, h) * 0.38);
        grad.addColorStop(0, i === 1 ? 'rgba(34,211,238,0.055)' : 'rgba(139,92,246,0.07)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
      }
      for (const p of particles) {
        if (!reduce) { p.x += p.vx; p.y += p.vy; }
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 95%, 72%, ${p.a})`;
        ctx.shadowBlur = 12; ctx.shadowColor = `hsla(${p.hue}, 95%, 65%, .8)`;
        ctx.fill(); ctx.shadowBlur = 0;
      }
      // subtle connection grid
      ctx.strokeStyle = 'rgba(124,58,237,0.045)'; ctx.lineWidth = 1;
      const off = reduce ? 0 : (t * 0.12) % 46;
      for (let x = -46 + off; x < w; x += 46) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h * 0.3, h); ctx.stroke(); }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [dense]);
  return <div className="fx-layer" aria-hidden="true">
    <div className="fx-smoke" /><div className="fx-grid" /><div className="fx-orb orb-a" /><div className="fx-orb orb-b" /><div className="fx-orb orb-c" />
    <canvas ref={ref} className="fx-canvas" />
  </div>;
}

export function Splash({ progress = 60 }: { progress?: number }) {
  return <div className="splash">
    <ParticleCanvas dense />
    <div className="splash-inner">
      <div className="splash-logo"><Logo size={80} compact /></div>
      <div className="splash-name"><strong>NEXUS<span>ARENA</span></strong></div>
      <p>Initializing tournament circuit…</p>
      <div className="splash-bar"><span style={{ width: `${progress}%` }} /></div>
      <div className="splash-steps"><span>Connecting</span><span>Verifying session</span><span>Loading wallet</span></div>
    </div>
  </div>;
}
