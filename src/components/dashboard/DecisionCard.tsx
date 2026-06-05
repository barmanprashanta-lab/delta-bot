'use client';

import { Signal } from '@/types';

interface DecisionCardProps {
  signal: Signal | undefined;
}

export function DecisionCard({ signal }: DecisionCardProps): JSX.Element {
  if (!signal) {
    return (
      <div className="panel decision-card">
        <h3 className="panel-title">Claude&apos;s Call</h3>
        <p className="muted">Awaiting first decision cycle…</p>
      </div>
    );
  }

  const { decision, latencyMs } = signal;
  const dirClass = decision.direction.toLowerCase();

  return (
    <div className="panel decision-card">
      <div className="decision-head">
        <h3 className="panel-title">Claude&apos;s Call</h3>
        <span className={`action-tag action-${decision.action.toLowerCase()}`}>
          {decision.action}
        </span>
      </div>

      <div className={`direction-banner dir-${dirClass}`}>
        <span className="direction-text">{decision.direction}</span>
        <span className="confidence">{decision.confidence.toFixed(0)}% conf</span>
      </div>

      <dl className="level-grid">
        <div><dt>Entry</dt><dd>{fmt(decision.entryPrice)}{decision.useMarketOrder ? ' (mkt)' : ''}</dd></div>
        <div><dt>Stop</dt><dd className="sl">{fmt(decision.stopLoss)}</dd></div>
        <div><dt>TP1</dt><dd className="tp">{fmt(decision.takeProfit1)}</dd></div>
        <div><dt>TP2</dt><dd className="tp">{fmt(decision.takeProfit2)}</dd></div>
        <div><dt>TP3</dt><dd className="tp">{fmt(decision.takeProfit3)}</dd></div>
        <div><dt>Size</dt><dd>{(decision.sizeFraction * 100).toFixed(0)}%</dd></div>
      </dl>

      <p className="reasoning">{decision.reasoning}</p>
      <p className="latency">decision latency {latencyMs} ms</p>
    </div>
  );
}

function fmt(v: number | null): string {
  return v === null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
