import Anthropic from '@anthropic-ai/sdk';
import { MarketSnapshot, ClaudeDecision, Signal, Candle, Trade } from '@/types';

const DECISION_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['OPEN', 'HOLD', 'CLOSE', 'NO_TRADE'] },
    direction: { type: 'string', enum: ['LONG', 'SHORT', 'NEUTRAL'] },
    confidence: { type: 'number' },
    entryPrice: { type: ['number', 'null'] },
    useMarketOrder: { type: 'boolean' },
    stopLoss: { type: ['number', 'null'] },
    takeProfit1: { type: ['number', 'null'] },
    takeProfit2: { type: ['number', 'null'] },
    takeProfit3: { type: ['number', 'null'] },
    sizeFraction: { type: 'number' },
    reasoning: { type: 'string' },
  },
  required: [
    'action', 'direction', 'confidence', 'entryPrice', 'useMarketOrder',
    'stopLoss', 'takeProfit1', 'takeProfit2', 'takeProfit3', 'sizeFraction', 'reasoning',
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are the sole decision engine for an autonomous BTC perpetual-futures scalping bot on Delta Exchange. You receive a raw market snapshot and must decide the entire trade. The bot performs ZERO analysis of its own — it executes exactly what you return.

Your objective: high-probability quick scalps targeting >1.5% NET profit after all fees and taxes. You are given the fee rates; the gap between your entry and take-profits MUST clear round-trip fees plus the 1.5% net floor before you choose OPEN.

Decision rules:
- action OPEN: only when momentum, order-book imbalance, trade flow and structure align with sufficient conviction. Set direction, stopLoss, takeProfit1/2/3 (laddered), entryPrice (null if useMarketOrder), and sizeFraction (0–1 of allocated capital).
- action HOLD: a position is open and you want to keep it as-is.
- action CLOSE: exit the open position now.
- action NO_TRADE: no edge; stay flat.
- In fast directional moves prefer useMarketOrder=true to avoid missed fills. Use a limit entryPrice only when you expect a pullback.
- SL and TPs must be on the correct side of entry for the chosen direction. For SHORT, SL is above entry and TPs below; for LONG the reverse.
- confidence is 0–100; be conservative. Returning NO_TRADE is always acceptable.

Respond with ONLY the JSON object matching the provided schema. No prose, no markdown.`;

/** Down-samples candles so the prompt stays compact and cheap. */
function compactCandles(candles: Candle[], keep = 30): Array<[number, number, number, number, number, number]> {
  return candles.slice(-keep).map(c => [
    Math.round(c.timestamp / 1000), c.open, c.high, c.low, c.close, Number(c.volume.toFixed(3)),
  ]);
}

function summariseTrades(trades: Trade[]): { buyVol: number; sellVol: number; lastPrice: number } {
  let buyVol = 0;
  let sellVol = 0;
  for (const t of trades) {
    if (t.side === 'buy') buyVol += t.size;
    else sellVol += t.size;
  }
  return {
    buyVol: Number(buyVol.toFixed(3)),
    sellVol: Number(sellVol.toFixed(3)),
    lastPrice: trades[0]?.price ?? 0,
  };
}

function buildUserPayload(snapshot: MarketSnapshot): string {
  const { ticker, orderBook, recentTrades, wallet, openPosition, config } = snapshot;
  const payload = {
    symbol: snapshot.symbol,
    ticker: {
      markPrice: ticker.markPrice,
      lastPrice: ticker.lastPrice,
      fundingRate: ticker.fundingRate,
      openInterest: ticker.openInterest,
      volume24h: ticker.volume24h,
    },
    candles5m: compactCandles(snapshot.candles5m),
    candles15m: compactCandles(snapshot.candles15m),
    orderBookTop: {
      bids: orderBook.bids.slice(0, 10).map(b => [b.price, b.size]),
      asks: orderBook.asks.slice(0, 10).map(a => [a.price, a.size]),
    },
    tradeFlow: summariseTrades(recentTrades),
    wallet: {
      available: wallet.availableBalance,
      total: wallet.totalBalance,
    },
    openPosition: openPosition
      ? {
          side: openPosition.side,
          size: openPosition.size,
          entryPrice: openPosition.entryPrice,
          markPrice: openPosition.markPrice,
          unrealizedPnl: openPosition.unrealizedPnl,
        }
      : null,
    fees: {
      taker: config.takerFeePct,
      maker: config.makerFeePct,
      minNetProfitPct: config.minNetProfitPct,
      walletAllocationPct: config.walletAllocationPct,
    },
    candleFormat: '[unixSec, open, high, low, close, volume]',
  };
  return JSON.stringify(payload);
}

function validateDecision(raw: unknown): ClaudeDecision {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Claude decision is not an object');
  }
  const d = raw as Record<string, unknown>;
  const actions = ['OPEN', 'HOLD', 'CLOSE', 'NO_TRADE'];
  const directions = ['LONG', 'SHORT', 'NEUTRAL'];

  if (!actions.includes(d.action as string)) throw new Error(`Invalid action: ${String(d.action)}`);
  if (!directions.includes(d.direction as string)) throw new Error(`Invalid direction: ${String(d.direction)}`);
  if (typeof d.confidence !== 'number' || d.confidence < 0 || d.confidence > 100) {
    throw new Error(`Invalid confidence: ${String(d.confidence)}`);
  }
  if (typeof d.sizeFraction !== 'number' || d.sizeFraction < 0 || d.sizeFraction > 1) {
    throw new Error(`Invalid sizeFraction: ${String(d.sizeFraction)}`);
  }

  return {
    action: d.action as ClaudeDecision['action'],
    direction: d.direction as ClaudeDecision['direction'],
    confidence: d.confidence,
    entryPrice: d.entryPrice === null ? null : Number(d.entryPrice),
    useMarketOrder: Boolean(d.useMarketOrder),
    stopLoss: d.stopLoss === null ? null : Number(d.stopLoss),
    takeProfit1: d.takeProfit1 === null ? null : Number(d.takeProfit1),
    takeProfit2: d.takeProfit2 === null ? null : Number(d.takeProfit2),
    takeProfit3: d.takeProfit3 === null ? null : Number(d.takeProfit3),
    sizeFraction: d.sizeFraction,
    reasoning: String(d.reasoning ?? ''),
  };
}

/**
 * Sends the raw snapshot to Claude and returns a fully-formed trade Signal.
 * Claude makes 100% of the analytical decision; the bot only relays data.
 */
export async function getDecision(snapshot: MarketSnapshot, model: string): Promise<Signal> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const client = new Anthropic({ apiKey });
  const t0 = Date.now();

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPayload(snapshot) }],
    tools: [
      {
        name: 'submit_decision',
        description: 'Submit the trade decision for the bot to execute.',
        input_schema: DECISION_SCHEMA as unknown as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_decision' },
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
  );
  if (!toolUse) throw new Error('Claude returned no tool_use decision block');

  const decision = validateDecision(toolUse.input);
  const latencyMs = Date.now() - t0;

  return {
    decision,
    snapshotTimestamp: snapshot.timestamp,
    latencyMs,
    timestamp: Date.now(),
  };
}
