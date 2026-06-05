'use client';

import { useBot } from '@/hooks/useBot';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { DecisionCard } from '@/components/dashboard/DecisionCard';
import { StatsPanel } from '@/components/dashboard/StatsPanel';
import { ControlPanel } from '@/components/dashboard/ControlPanel';

export default function DashboardPage(): JSX.Element {
  const { state, config, error, loading, sendCommand } = useBot();

  if (loading) {
    return <div className="loading-screen">Initialising terminal…</div>;
  }

  if (!state || !config) {
    return <div className="loading-screen error">Unable to reach bot: {error}</div>;
  }

  return (
    <ErrorBoundary>
      <main className="terminal">
        <header className="term-header">
          <div className="brand">
            <span className="brand-mark">◇</span>
            <div>
              <h1>DELTA SCALPER</h1>
              <p className="sub">BTC perpetual · Claude-driven</p>
            </div>
          </div>
          <StatusBadge status={state.status} mode={config.mode} />
        </header>

        {config.mode === 'LIVE' && (
          <div className="live-warning" role="alert">
            LIVE MODE — real funds at risk. {config.walletAllocationPct * 100}% of wallet allocated per the config.
          </div>
        )}

        {error && <div className="error-banner" role="alert">{error}</div>}
        {state.error && <div className="error-banner soft" role="alert">{state.error}</div>}

        <div className="term-grid">
          <DecisionCard signal={state.lastSignal} />
          <StatsPanel stats={state.sessionStats} />
        </div>

        <ControlPanel status={state.status} mode={config.mode} onCommand={sendCommand} />

        <footer className="term-footer">
          <span>scan {config.scanIntervalMs / 1000}s</span>
          <span>trail @ {config.trailTriggerPct * 100}% of TP1</span>
          <span>alloc {config.walletAllocationPct * 100}%</span>
          <span>model {config.claudeModel}</span>
        </footer>
      </main>
    </ErrorBoundary>
  );
}
