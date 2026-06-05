import { OrderSide } from '@/types';

export interface TrailState {
  entryPrice: number;
  takeProfit1: number;
  currentStop: number;
  side: OrderSide;          // 'sell' = short, 'buy' = long
  armed: boolean;           // has the 75%-of-TP trigger fired yet
}

export interface TrailParams {
  trailTriggerPct: number;  // 0.75 = arm when 75% of the way to TP1
  trailBufferPct: number;   // profit locked in once armed (fraction of entry)
}

/**
 * Computes the fraction (0–1) of the move from entry toward TP1 that price has
 * achieved. Negative if price moved against the position.
 */
export function progressToTp(currentPrice: number, state: TrailState): number {
  const span = state.takeProfit1 - state.entryPrice; // signed
  if (span === 0) return 0;
  return (currentPrice - state.entryPrice) / span;
}

/**
 * Given the latest price, returns a new stop-loss if the trail should move,
 * else null. Once armed (price reached trailTriggerPct of TP1), the stop is
 * pulled to entry ± buffer to lock in profit and never loosened afterward.
 *
 * LONG (buy):  stop sits below price, only ratchets up.
 * SHORT (sell): stop sits above price, only ratchets down.
 */
export function computeTrailingStop(
  currentPrice: number,
  state: TrailState,
  params: TrailParams
): { newStop: number; armed: boolean } | null {
  const progress = progressToTp(currentPrice, state);
  const shouldArm = state.armed || progress >= params.trailTriggerPct;

  if (!shouldArm) return null;

  const buffer = state.entryPrice * params.trailBufferPct;
  let candidateStop: number;

  if (state.side === 'buy') {
    // Lock profit: stop at entry + buffer, then trail under price as it rises.
    const breakevenPlus = state.entryPrice + buffer;
    const trailUnderPrice = currentPrice - buffer;
    candidateStop = Math.max(breakevenPlus, trailUnderPrice);
    // Ratchet only upward.
    if (candidateStop <= state.currentStop) {
      return state.armed ? null : { newStop: state.currentStop, armed: true };
    }
  } else {
    // SHORT: lock profit at entry - buffer, trail above price as it falls.
    const breakevenMinus = state.entryPrice - buffer;
    const trailOverPrice = currentPrice + buffer;
    candidateStop = Math.min(breakevenMinus, trailOverPrice);
    // Ratchet only downward.
    if (candidateStop >= state.currentStop) {
      return state.armed ? null : { newStop: state.currentStop, armed: true };
    }
  }

  return { newStop: Number(candidateStop.toFixed(2)), armed: true };
}

/** True if the current price has breached the stop and a close is required. */
export function isStopBreached(currentPrice: number, state: TrailState): boolean {
  return state.side === 'buy'
    ? currentPrice <= state.currentStop
    : currentPrice >= state.currentStop;
}
