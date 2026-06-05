import {
  fetchCandles,
  fetchOrderBook,
  fetchTicker,
  fetchRecentTrades,
  fetchWalletBalance,
  fetchOpenPosition,
  fetchOpenOrders,
} from '@/lib/delta/client';
import { MarketSnapshot, BotConfig } from '@/types';

const FIVE_MIN = 300;
const FIFTEEN_MIN = 900;
const CANDLE_LOOKBACK = 60; // candles per timeframe

/**
 * Collects a raw market snapshot. Performs NO indicator math or analysis —
 * it only fetches and shapes data for Claude to reason over.
 */
export async function buildSnapshot(config: BotConfig): Promise<MarketSnapshot> {
  const now = Math.floor(Date.now() / 1000);
  const start5m = now - FIVE_MIN * CANDLE_LOOKBACK;
  const start15m = now - FIFTEEN_MIN * CANDLE_LOOKBACK;

  let result: [
    Awaited<ReturnType<typeof fetchTicker>>,
    Awaited<ReturnType<typeof fetchCandles>>,
    Awaited<ReturnType<typeof fetchCandles>>,
    Awaited<ReturnType<typeof fetchOrderBook>>,
    Awaited<ReturnType<typeof fetchRecentTrades>>,
    Awaited<ReturnType<typeof fetchWalletBalance>>,
    Awaited<ReturnType<typeof fetchOpenPosition>>,
    Awaited<ReturnType<typeof fetchOpenOrders>>,
  ];

  try {
    result = await Promise.all([
      fetchTicker(config.symbol),
      fetchCandles(config.symbol, FIVE_MIN, start5m, now),
      fetchCandles(config.symbol, FIFTEEN_MIN, start15m, now),
      fetchOrderBook(config.symbol, 20),
      fetchRecentTrades(config.symbol, 100),
      fetchWalletBalance('USDT'),
      fetchOpenPosition(config.productId),
      fetchOpenOrders(config.productId),
    ]);
  } catch (err: unknown) {
    throw new Error(`Snapshot build failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const [ticker, candles5m, candles15m, orderBook, recentTrades, wallet, openPosition, openOrders] = result;

  return {
    symbol: config.symbol,
    timestamp: Date.now(),
    ticker,
    candles5m,
    candles15m,
    orderBook,
    recentTrades,
    wallet,
    openPosition,
    openOrders,
    config: {
      minNetProfitPct: config.minNetProfitPct,
      takerFeePct: config.takerFeePct,
      makerFeePct: config.makerFeePct,
      walletAllocationPct: config.walletAllocationPct,
    },
  };
}
