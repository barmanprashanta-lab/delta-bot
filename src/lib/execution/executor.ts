import { placeOrder, cancelOrder } from '@/lib/delta/client';
import { ClaudeDecision, BotConfig, OrderSide, Order } from '@/types';
import { computeSize, validateLevels, clearsProfitFloor } from './risk';
import { WalletBalance } from '@/types';

export interface ExecutionPlan {
  side: OrderSide;
  sizeContracts: number;
  entryPrice: number | null;
  useMarketOrder: boolean;
  stopLoss: number;
  takeProfits: number[];   // laddered TP1/TP2/TP3
  tpSplit: number[];       // e.g. [0.4, 0.4, 0.2]
}

export interface ExecutionResult {
  executed: boolean;
  reason?: string;
  entryOrder?: Order;
  stopOrderId?: string;
  plan?: ExecutionPlan;
}

const TP_SPLIT = [0.4, 0.4, 0.2]; // 40/40/20 across T1/T2/T3

function directionToSide(direction: ClaudeDecision['direction']): OrderSide {
  return direction === 'SHORT' ? 'sell' : 'buy';
}

/** Builds an execution plan from Claude's decision, applying all risk gates. */
export function buildPlan(
  decision: ClaudeDecision,
  wallet: WalletBalance,
  markPrice: number,
  config: BotConfig
): { plan: ExecutionPlan | null; reason?: string } {
  if (decision.action !== 'OPEN') return { plan: null, reason: `Action is ${decision.action}` };
  if (decision.confidence < config.minConfidence) {
    return { plan: null, reason: `Confidence ${decision.confidence} < min ${config.minConfidence}` };
  }

  const entry = decision.useMarketOrder ? markPrice : decision.entryPrice ?? markPrice;

  const levels = validateLevels(decision, entry);
  if (!levels.valid) return { plan: null, reason: levels.reason };

  if (!clearsProfitFloor(decision, entry, config)) {
    return { plan: null, reason: 'TP1 does not clear fees + net profit floor' };
  }

  const sizing = computeSize(decision, wallet, markPrice, config);
  if (sizing.rejected) return { plan: null, reason: sizing.reason };

  const tps = [decision.takeProfit1, decision.takeProfit2, decision.takeProfit3]
    .filter((tp): tp is number => tp !== null);

  return {
    plan: {
      side: directionToSide(decision.direction),
      sizeContracts: sizing.sizeContracts,
      entryPrice: decision.useMarketOrder ? null : entry,
      useMarketOrder: decision.useMarketOrder,
      stopLoss: decision.stopLoss as number,
      takeProfits: tps,
      tpSplit: TP_SPLIT.slice(0, tps.length),
    },
  };
}

/**
 * Executes a plan. In PAPER mode it simulates fills without hitting the
 * exchange. In LIVE mode it places the entry, a reduce-only stop, and laddered
 * reduce-only take-profit orders. Never swallows errors.
 */
export async function executePlan(
  plan: ExecutionPlan,
  config: BotConfig
): Promise<ExecutionResult> {
  if (config.mode === 'PAPER') {
    return {
      executed: true,
      reason: 'PAPER fill simulated',
      plan,
      entryOrder: simulateOrder(plan, config),
    };
  }

  try {
    const entryOrder = await placeOrder({
      product_id: config.productId,
      side: plan.side,
      order_type: plan.useMarketOrder ? 'market' : 'limit',
      size: plan.sizeContracts,
      ...(plan.useMarketOrder ? {} : { limit_price: String(plan.entryPrice), post_only: true }),
      time_in_force: plan.useMarketOrder ? 'ioc' : 'gtc',
      client_order_id: `entry-${Date.now()}`,
    });

    const exitSide: OrderSide = plan.side === 'buy' ? 'sell' : 'buy';

    const stopOrder = await placeOrder({
      product_id: config.productId,
      side: exitSide,
      order_type: 'limit',
      size: plan.sizeContracts,
      limit_price: String(plan.stopLoss),
      reduce_only: true,
      time_in_force: 'gtc',
      client_order_id: `sl-${Date.now()}`,
    });

    for (let i = 0; i < plan.takeProfits.length; i++) {
      const tpSize = Math.max(1, Math.round(plan.sizeContracts * plan.tpSplit[i]));
      await placeOrder({
        product_id: config.productId,
        side: exitSide,
        order_type: 'limit',
        size: tpSize,
        limit_price: String(plan.takeProfits[i]),
        reduce_only: true,
        time_in_force: 'gtc',
        client_order_id: `tp${i + 1}-${Date.now()}`,
      });
    }

    return { executed: true, entryOrder, stopOrderId: stopOrder.id, plan };
  } catch (err: unknown) {
    return {
      executed: false,
      reason: `Execution failed: ${err instanceof Error ? err.message : String(err)}`,
      plan,
    };
  }
}

/**
 * Moves the live stop-loss to a new price by cancelling the old reduce-only
 * stop and placing a fresh one. The bot owns this — it runs on every price
 * tick, independent of Claude.
 */
export async function moveStopLoss(
  oldStopOrderId: string,
  newStop: number,
  side: OrderSide,
  size: number,
  config: BotConfig
): Promise<{ stopOrderId: string }> {
  if (config.mode === 'PAPER') {
    return { stopOrderId: `paper-sl-${Date.now()}` };
  }
  try {
    await cancelOrder(oldStopOrderId);
    const exitSide: OrderSide = side === 'buy' ? 'sell' : 'buy';
    const newOrder = await placeOrder({
      product_id: config.productId,
      side: exitSide,
      order_type: 'limit',
      size,
      limit_price: String(newStop),
      reduce_only: true,
      time_in_force: 'gtc',
      client_order_id: `sl-trail-${Date.now()}`,
    });
    return { stopOrderId: newOrder.id };
  } catch (err: unknown) {
    throw new Error(`Failed to move stop-loss: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function simulateOrder(plan: ExecutionPlan, config: BotConfig): Order {
  const now = Date.now();
  return {
    id: `paper-${now}`,
    clientOrderId: `paper-entry-${now}`,
    symbol: String(config.productId),
    side: plan.side,
    type: plan.useMarketOrder ? 'market' : 'limit',
    price: plan.entryPrice ?? 0,
    size: plan.sizeContracts,
    filledSize: plan.sizeContracts,
    status: 'filled',
    createdAt: now,
    updatedAt: now,
  };
}
