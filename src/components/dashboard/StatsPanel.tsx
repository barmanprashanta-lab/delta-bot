'use client';

import { SessionStats } from '@/types';

interface StatsPanelProps {
  stats: SessionStats;
}

export function StatsPanel({ stats }: StatsPanelProps): JSX.Element {
  const pnlClass = stats.totalNetPnl >= 0 ? 'pos' : 'neg';
  return (
    <div className="panel stats-panel">
      <h3 className="panel-title">Session</h3>
      <div className="stat-grid">
        <Stat label="Net PnL" value={`$${stats.totalNetPnl.toFixed(2)}`} cls={pnlClass} big />
        <Stat label="Trades" value={String(stats.totalTrades)} />
        <Stat label="Win Rate" value={`${stats.winRate.toFixed(0)}%`} />
        <Stat label="Avg Net %" value={`${(stats.avgNetPnlPct * 100).toFixed(2)}%`} />
        <Stat label="Fees Paid" value={`$${stats.totalFees.toFixed(2)}`} cls="neg" />
        <Stat label="Drawdown" value={`${(stats.currentDrawdown * 100).toFixed(1)}%`} cls="neg" />
      </div>
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  cls?: string;
  big?: boolean;
}

function Stat({ label, value, cls = '', big = false }: StatProps): JSX.Element {
  return (
    <div className={`stat ${big ? 'stat-big' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${cls}`}>{value}</span>
    </div>
  );
}
