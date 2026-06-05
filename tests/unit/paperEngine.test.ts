import { openPaperPosition, processPriceTick, finalizeTrade } from '@/lib/execution/paperEngine';
import { ExecutionPlan } from '@/lib/execution/executor';

const taker = 0.0005;
const maker = 0.0002;

function shortPlan(): ExecutionPlan {
  return {
    side: 'sell',
    sizeContracts: 100,
    entryPrice: 60000,
    useMarketOrder: true,
    stopLoss: 60400,
    takeProfits: [59000, 58500, 58000],
    tpSplit: [0.4, 0.4, 0.2],
  };
}

describe('openPaperPosition', () => {
  it('records a taker entry fee for a market order', () => {
    const pos = openPaperPosition(shortPlan(), 60000, taker, maker, 'r', 80);
    const expectedFee = 60000 * 0.001 * 100 * taker;
    expect(pos.entryFee).toBeCloseTo(expectedFee);
    expect(pos.remainingSize).toBe(100);
  });
});

describe('processPriceTick — short', () => {
  it('fills TP1 (40%) when price drops to TP1', () => {
    const pos = openPaperPosition(shortPlan(), 60000, taker, maker, 'r', 80);
    const { position, newFills, closed } = processPriceTick(pos, 59000);
    expect(closed).toBe(false);
    expect(newFills).toHaveLength(1);
    expect(newFills[0].level).toBe('TP1');
    expect(newFills[0].sizeContracts).toBe(40);
    expect(newFills[0].grossPnl).toBeGreaterThan(0);
    expect(position.remainingSize).toBe(60);
  });

  it('fills all three TPs across descending ticks and closes', () => {
    let pos = openPaperPosition(shortPlan(), 60000, taker, maker, 'r', 80);
    pos = processPriceTick(pos, 59000).position;
    pos = processPriceTick(pos, 58500).position;
    const last = processPriceTick(pos, 58000);
    expect(last.closed).toBe(true);
    expect(last.position.remainingSize).toBe(0);
  });

  it('closes the remainder at the stop and books a loss on the stopped portion', () => {
    const pos = openPaperPosition(shortPlan(), 60000, taker, maker, 'r', 80);
    const { newFills, closed } = processPriceTick(pos, 60400); // SL hit immediately
    expect(closed).toBe(true);
    expect(newFills[0].level).toBe('SL');
    expect(newFills[0].grossPnl).toBeLessThan(0);
  });

  it('labels the exit TRAIL when the stop has been trailed to TP1 and price reverses into it', () => {
    // Short fills TP1 (40%), the stop is then trailed down to TP1 to lock profit,
    // and price reverses back up into that trailed stop, closing the remainder.
    let pos = openPaperPosition(shortPlan(), 60000, taker, maker, 'r', 80);
    pos = processPriceTick(pos, 59000).position;   // TP1 fills, remaining 60
    pos.stopLoss = pos.takeProfits[0];             // trail stop to TP1 (59000)
    const tick = processPriceTick(pos, 59000);     // price reverses up into the stop
    expect(tick.closed).toBe(true);
    expect(tick.newFills.some(f => f.level === 'TRAIL')).toBe(true);
  });
});

describe('finalizeTrade', () => {
  it('computes net P&L after entry and exit fees for a winning short', () => {
    let pos = openPaperPosition(shortPlan(), 60000, taker, maker, 'reason', 80);
    pos = processPriceTick(pos, 59000).position;
    pos = processPriceTick(pos, 58500).position;
    pos = processPriceTick(pos, 58000).position;
    const closed = finalizeTrade(pos, 'PAPER');

    expect(closed.result).toBe('WIN');
    expect(closed.netPnl).toBeLessThan(closed.grossPnl); // fees deducted
    expect(closed.fees).toBeGreaterThan(0);
    expect(closed.sizeContracts).toBe(100);
    expect(closed.avgExitPrice).toBeGreaterThan(58000);
    expect(closed.avgExitPrice).toBeLessThan(59000);
  });

  it('reports a loss when stopped out for more than fees', () => {
    const pos = openPaperPosition(shortPlan(), 60000, taker, maker, 'r', 80);
    const stopped = processPriceTick(pos, 60400).position;
    const closed = finalizeTrade(stopped, 'PAPER');
    expect(closed.result).toBe('LOSS');
    expect(closed.netPnl).toBeLessThan(0);
  });
});
