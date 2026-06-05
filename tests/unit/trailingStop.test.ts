import {
  computeTrailingStop,
  progressToTp,
  isStopBreached,
  TrailState,
  TrailParams,
} from '@/lib/execution/trailingStop';

const params: TrailParams = { trailTriggerPct: 0.75, trailBufferPct: 0.001 };

describe('progressToTp', () => {
  it('returns 0.75 when long price is 75% of the way to TP1', () => {
    const state: TrailState = { entryPrice: 100, takeProfit1: 110, currentStop: 95, side: 'buy', armed: false };
    expect(progressToTp(107.5, state)).toBeCloseTo(0.75);
  });

  it('returns 0.75 for a short moving down toward TP1', () => {
    const state: TrailState = { entryPrice: 100, takeProfit1: 90, currentStop: 105, side: 'sell', armed: false };
    expect(progressToTp(92.5, state)).toBeCloseTo(0.75);
  });

  it('is negative when price moves against a long', () => {
    const state: TrailState = { entryPrice: 100, takeProfit1: 110, currentStop: 95, side: 'buy', armed: false };
    expect(progressToTp(98, state)).toBeLessThan(0);
  });
});

describe('computeTrailingStop — arming at 75% of TP1', () => {
  it('does not arm a long below the 75% trigger', () => {
    const state: TrailState = { entryPrice: 100, takeProfit1: 110, currentStop: 95, side: 'buy', armed: false };
    expect(computeTrailingStop(105, state, params)).toBeNull(); // 50% of the way
  });

  it('arms and locks profit on a long once 75% is reached', () => {
    const state: TrailState = { entryPrice: 100, takeProfit1: 110, currentStop: 95, side: 'buy', armed: false };
    const result = computeTrailingStop(107.5, state, params);
    expect(result).not.toBeNull();
    expect(result!.armed).toBe(true);
    // Stop should now be in profit (above entry) for a long.
    expect(result!.newStop).toBeGreaterThan(state.entryPrice);
  });

  it('arms and locks profit on a short once 75% is reached', () => {
    const state: TrailState = { entryPrice: 100, takeProfit1: 90, currentStop: 105, side: 'sell', armed: false };
    const result = computeTrailingStop(92.5, state, params);
    expect(result).not.toBeNull();
    expect(result!.armed).toBe(true);
    // Stop should now be in profit (below entry) for a short.
    expect(result!.newStop).toBeLessThan(state.entryPrice);
  });
});

describe('computeTrailingStop — ratchet direction', () => {
  it('only ratchets a long stop upward, never down', () => {
    // Stop already advanced to 105; price pulls back to 103 — must not loosen.
    const state: TrailState = { entryPrice: 100, takeProfit1: 110, currentStop: 105, side: 'buy', armed: true };
    const result = computeTrailingStop(103, state, params);
    expect(result).toBeNull();
  });

  it('only ratchets a short stop downward, never up', () => {
    // Stop already advanced to 95; price bounces to 97 — must not loosen.
    const state: TrailState = { entryPrice: 100, takeProfit1: 90, currentStop: 95, side: 'sell', armed: true };
    const result = computeTrailingStop(97, state, params);
    expect(result).toBeNull();
  });

  it('moves a long stop up as price advances further', () => {
    const state: TrailState = { entryPrice: 100, takeProfit1: 110, currentStop: 100.1, side: 'buy', armed: true };
    const result = computeTrailingStop(109, state, params);
    expect(result).not.toBeNull();
    expect(result!.newStop).toBeGreaterThan(state.currentStop);
  });
});

describe('isStopBreached', () => {
  it('detects a long stop breach when price falls to the stop', () => {
    const state: TrailState = { entryPrice: 100, takeProfit1: 110, currentStop: 101, side: 'buy', armed: true };
    expect(isStopBreached(101, state)).toBe(true);
    expect(isStopBreached(101.5, state)).toBe(false);
  });

  it('detects a short stop breach when price rises to the stop', () => {
    const state: TrailState = { entryPrice: 100, takeProfit1: 90, currentStop: 99, side: 'sell', armed: true };
    expect(isStopBreached(99, state)).toBe(true);
    expect(isStopBreached(98.5, state)).toBe(false);
  });
});
