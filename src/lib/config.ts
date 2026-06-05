import { BotConfig } from '@/types';
import { BotOrchestrator } from '@/lib/execution/orchestrator';

export const DEFAULT_CONFIG: BotConfig = {
  symbol: process.env.BOT_SYMBOL ?? 'BTCUSD',
  productId: Number(process.env.BOT_PRODUCT_ID ?? '27'),
  walletAllocationPct: 0.7,
  minNetProfitPct: 0.015,
  takerFeePct: 0.0005,
  makerFeePct: 0.0002,
  maxLeverage: Number(process.env.BOT_MAX_LEVERAGE ?? '5'),
  maxPositionUsd: Number(process.env.BOT_MAX_POSITION_USD ?? '5000'),
  scanIntervalMs: Number(process.env.BOT_SCAN_INTERVAL_MS ?? '15000'),
  priceMonitorMs: Number(process.env.BOT_PRICE_MONITOR_MS ?? '1000'),
  minConfidence: Number(process.env.BOT_MIN_CONFIDENCE ?? '65'),
  maxDrawdownPct: Number(process.env.BOT_MAX_DRAWDOWN_PCT ?? '0.1'),
  trailTriggerPct: 0.75,
  trailBufferPct: 0.001,
  // PAPER is the default. Set BOT_MODE=LIVE only after backtesting + paper validation.
  mode: process.env.BOT_MODE === 'LIVE' ? 'LIVE' : 'PAPER',
  claudeModel: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
};

// Module-level singleton so the loop survives across API route invocations
// within the same server process.
let instance: BotOrchestrator | null = null;

export function getBot(): BotOrchestrator {
  if (!instance) instance = new BotOrchestrator(DEFAULT_CONFIG);
  return instance;
}
