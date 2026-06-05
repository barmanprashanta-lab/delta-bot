import { computeSize, validateLevels, clearsProfitFloor } from '@/lib/execution/risk';
import { ClaudeDecision, WalletBalance, BotConfig } from '@/types';

const config: BotConfig = {
  symbol: 'BTCUSD',
  productId: 27,
  walletAllocationPct: 0.7,
  minNetProfitPct: 0.015,
  takerFeePct: 0.0005,
  makerFeePct: 0.0002,
  maxLeverage: 5,
  maxPositionUsd: 50000,
  scanIntervalMs: 15000,
  priceMonitorMs: 1000,
  minConfidence: 65,
  maxDrawdownPct: 0.1,
  trailTriggerPct: 0.75,
  trailBufferPct: 0.001,
  mode: 'PAPER',
  claudeModel: 'claude-sonnet-4-6',
};

const wallet: WalletBalance = {
  currency: 'USDT',
  totalBalance: 1000,
  availableBalance: 1000,
  positionMargin: 0,
  orderMargin: 0,
  unrealizedPnl: 0,
};

function decision(overrides: Partial<ClaudeDecision> = {}): ClaudeDecision {
  return {
    action: 'OPEN',
    direction: 'SHORT',
    confidence: 80,
    entryPrice: 60000,
    useMarketOrder: false,
    stopLoss: 60400,
    takeProfit1: 58900,
    takeProfit2: 58500,
    takeProfit3: 58000,
    sizeFraction: 1,
    reasoning: 'test',
    ...overrides,
  };
}

describe('computeSize', () => {
  it('caps allocation at 70% of the wallet', () => {
    const r = computeSize(decision(), wallet, 60000, config);
    expect(r.rejected).toBe(false);
    // margin should not exceed 70% of 1000 = 700.
    expect(r.marginUsd).toBeLessThanOrEqual(700);
  });

  it('rejects a zero size fraction', () => {
    const r = computeSize(decision({ sizeFraction: 0 }), wallet, 60000, config);
    expect(r.rejected).toBe(true);
  });

  it('rejects an invalid mark price', () => {
    const r = computeSize(decision(), wallet, 0, config);
    expect(r.rejected).toBe(true);
  });

  it('respects the max position cap', () => {
    const cappedConfig = { ...config, maxPositionUsd: 100 };
    const r = computeSize(decision(), wallet, 60000, cappedConfig);
    expect(r.notionalUsd).toBeLessThanOrEqual(100);
  });
});

describe('validateLevels', () => {
  it('accepts a valid short', () => {
    expect(validateLevels(decision(), 60000).valid).toBe(true);
  });

  it('rejects a short with stop below entry', () => {
    const r = validateLevels(decision({ stopLoss: 59000 }), 60000);
    expect(r.valid).toBe(false);
  });

  it('rejects a long with TP below entry', () => {
    const r = validateLevels(
      decision({ direction: 'LONG', stopLoss: 59000, takeProfit1: 58000 }),
      60000
    );
    expect(r.valid).toBe(false);
  });

  it('rejects a neutral direction', () => {
    expect(validateLevels(decision({ direction: 'NEUTRAL' }), 60000).valid).toBe(false);
  });
});

describe('clearsProfitFloor', () => {
  it('passes when TP1 clears fees + 1.5% floor', () => {
    // 60000 → 58900 is ~1.83% gross; minus 0.1% round-trip fees ≈ 1.73% net.
    expect(clearsProfitFloor(decision(), 60000, config)).toBe(true);
  });

  it('fails when TP1 is too close to clear the floor', () => {
    const tight = decision({ takeProfit1: 59800 }); // ~0.33% gross
    expect(clearsProfitFloor(tight, 60000, config)).toBe(false);
  });
});
