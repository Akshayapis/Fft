export * from './UI';
import React from 'react';

export function StatCard({ label, value, icon, foot, to, format }: {
  label: string; value: number | string; icon?: React.ReactNode; foot?: string; to?: string;
  format?: (n: number) => string;
}) {
  const inner = <div className="stat-card hover">
    <div className="stat-top">
      <div>
        <div className="stat-value">{typeof value === 'number' && format ? format(value) : value}</div>
        <div className="stat-label">{label}</div>
      </div>
      {icon && <div className="stat-icon">{icon}</div>}
    </div>
    {foot && <div className="stat-foot">{foot}</div>}
  </div>;
  return to ? <a href={to} style={{ display: 'block' }}>{inner}</a> : inner;
}
