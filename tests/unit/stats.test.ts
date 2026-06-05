import { computeStats } from '@/lib/execution/stats';
import { ClosedPaperTrade } from '@/types';

function trade(netPnl: number, result: 'WIN' | 'LOSS', overrides: Partial<ClosedPaperTrade> = {}): ClosedPaperTrade {
  return {
    id: `t-${Math.random()}`,
    side: 'sell',
    entryPrice: 60000,
    avgExitPrice: 59000,
    sizeContracts: 100,
    notionalUsd: 6000,
    grossPnl: netPnl + 3,
    fees: 3,
    netPnl,
    netPnlPct: netPnl / 6000,
    durationMs: 60000,
    result,
    fills: [],
    openedAt: 0,
    closedAt: 1000,
    mode: 'PAPER',
    reasoning: 'r',
    confidence: 80,
    ...overrides,
  };
}

describe('computeStats', () => {
  it('returns an empty-but-seeded stat block for no trades', () => {
    const s = computeStats([], 1000);
    expect(s.totalTrades).toBe(0);
    expect(s.peakBalance).toBe(1000);
  });

  it('aggregates wins, losses, and net P&L (newest-first input)', () => {
    const trades = [trade(50, 'WIN'), trade(-20, 'LOSS'), trade(30, 'WIN')];
    const s = computeStats(trades, 1000);
    expect(s.totalTrades).toBe(3);
    expect(s.winningTrades).toBe(2);
    expect(s.losingTrades).toBe(1);
    expect(s.totalNetPnl).toBeCloseTo(60);
    expect(s.winRate).toBeCloseTo(66.7, 0);
  });

  it('tracks largest win and loss', () => {
    const s = computeStats([trade(120, 'WIN'), trade(-75, 'LOSS')], 1000);
    expect(s.largestWin).toBe(120);
    expect(s.largestLoss).toBe(-75);
  });

  it('computes peak-to-trough drawdown on the equity curve', () => {
    // oldest-first equity: 1000 → 1100 → 900 (dd = 200/1100 ≈ 0.1818) → 1000
    const newestFirst = [trade(100, 'WIN'), trade(-200, 'LOSS'), trade(100, 'WIN')];
    const s = computeStats(newestFirst, 1000);
    expect(s.currentDrawdown).toBeCloseTo(0.1818, 3);
    expect(s.peakBalance).toBe(1100);
  });
});
