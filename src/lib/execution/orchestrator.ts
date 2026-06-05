import { BotConfig, BotState, Signal, SessionStats, OrderSide } from '@/types';
import { buildSnapshot } from '@/lib/analysis/snapshot';
import { getDecision } from '@/lib/analysis/claudeEngine';
import { buildPlan, executePlan, moveStopLoss } from '@/lib/execution/executor';
import { fetchTicker, fetchOpenPosition } from '@/lib/delta/client';
import {
  TrailState,
  computeTrailingStop,
  isStopBreached,
} from '@/lib/execution/trailingStop';

const EMPTY_STATS: SessionStats = {
  totalTrades: 0,
  winningTrades: 0,
  losingTrades: 0,
  totalNetPnl: 0,
  totalFees: 0,
  winRate: 0,
  avgNetPnlPct: 0,
  largestWin: 0,
  largestLoss: 0,
  currentDrawdown: 0,
  peakBalance: 0,
};

/**
 * Singleton orchestrator. Two independent timers:
 *  1. Decision loop (slow, ~scanIntervalMs): snapshot → Claude → execute.
 *  2. Trail loop (fast, ~priceMonitorMs): local SL ratcheting, no Claude call.
 */
export class BotOrchestrator {
  private config: BotConfig;
  private state: BotState;
  private decisionTimer: ReturnType<typeof setInterval> | null = null;
  private trailTimer: ReturnType<typeof setInterval> | null = null;
  private trail: (TrailState & { stopOrderId: string }) | null = null;
  private listeners: Set<(state: BotState) => void> = new Set();

  constructor(config: BotConfig) {
    this.config = config;
    this.state = {
      status: 'STOPPED',
      openOrders: [],
      sessionStats: { ...EMPTY_STATS },
    };
  }

  getState(): BotState {
    return this.state;
  }

  getConfig(): BotConfig {
    return this.config;
  }

  onUpdate(fn: (state: BotState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach(fn => fn(this.state));
  }

  start(): void {
    if (this.state.status === 'RUNNING') return;
    this.state.status = 'RUNNING';
    this.state.startedAt = Date.now();
    this.state.error = undefined;
    this.emit();

    this.decisionTimer = setInterval(() => {
      void this.runDecisionCycle();
    }, this.config.scanIntervalMs);

    this.trailTimer = setInterval(() => {
      void this.runTrailCycle();
    }, this.config.priceMonitorMs);
  }

  pause(): void {
    this.state.status = 'PAUSED';
    this.emit();
  }

  stop(): void {
    if (this.decisionTimer) clearInterval(this.decisionTimer);
    if (this.trailTimer) clearInterval(this.trailTimer);
    this.decisionTimer = null;
    this.trailTimer = null;
    this.trail = null;
    this.state.status = 'STOPPED';
    this.emit();
  }

  /** Slow loop: ask Claude what to do and act on it. */
  private async runDecisionCycle(): Promise<void> {
    if (this.state.status !== 'RUNNING') return;

    try {
      if (this.isDrawdownBreached()) {
        this.state.status = 'PAUSED';
        this.state.error = 'Max drawdown breached — auto-paused';
        this.emit();
        return;
      }

      const snapshot = await buildSnapshot(this.config);
      const signal = await getDecision(snapshot, this.config.claudeModel);
      this.state.lastSignal = signal;

      const staleMs = Date.now() - signal.snapshotTimestamp;
      if (staleMs > this.config.scanIntervalMs * 2) {
        this.emit();
        return; // decision too stale to act on safely
      }

      await this.act(signal, snapshot.wallet.availableBalance, snapshot.ticker.markPrice);
      this.emit();
    } catch (err: unknown) {
      this.state.status = 'ERROR';
      this.state.error = err instanceof Error ? err.message : String(err);
      this.emit();
    }
  }

  private async act(signal: Signal, available: number, markPrice: number): Promise<void> {
    const { decision } = signal;

    if (decision.action === 'CLOSE' && this.state.activePosition) {
      // Close handled by submitting a reduce-only market exit (omitted detail).
      this.trail = null;
      return;
    }

    if (decision.action !== 'OPEN' || this.state.activePosition) return;

    const wallet = {
      currency: 'USDT',
      totalBalance: available,
      availableBalance: available,
      positionMargin: 0,
      orderMargin: 0,
      unrealizedPnl: 0,
    };

    const { plan, reason } = buildPlan(decision, wallet, markPrice, this.config);
    if (!plan) {
      this.state.error = reason;
      return;
    }

    const result = await executePlan(plan, this.config);
    if (!result.executed) {
      this.state.error = result.reason;
      return;
    }

    const entry = plan.entryPrice ?? markPrice;
    this.trail = {
      entryPrice: entry,
      takeProfit1: plan.takeProfits[0],
      currentStop: plan.stopLoss,
      side: plan.side as OrderSide,
      armed: false,
      stopOrderId: result.stopOrderId ?? `paper-sl-${Date.now()}`,
    };
    this.state.sessionStats.totalTrades += 1;
  }

  /** Fast loop: ratchet the SL locally once price reaches 75% of TP1. */
  private async runTrailCycle(): Promise<void> {
    if (this.state.status !== 'RUNNING' || !this.trail) return;

    try {
      const ticker = await fetchTicker(this.config.symbol);
      const price = ticker.markPrice;

      if (isStopBreached(price, this.trail)) {
        this.trail = null;
        this.state.activePosition = undefined;
        await this.refreshPosition();
        this.emit();
        return;
      }

      const update = computeTrailingStop(price, this.trail, {
        trailTriggerPct: this.config.trailTriggerPct,
        trailBufferPct: this.config.trailBufferPct,
      });

      if (update && update.newStop !== this.trail.currentStop) {
        const moved = await moveStopLoss(
          this.trail.stopOrderId,
          update.newStop,
          this.trail.side,
          this.state.activePosition?.size ?? 1,
          this.config
        );
        this.trail = { ...this.trail, currentStop: update.newStop, armed: update.armed, stopOrderId: moved.stopOrderId };
        this.emit();
      } else if (update?.armed && !this.trail.armed) {
        this.trail.armed = true;
      }
    } catch (err: unknown) {
      this.state.error = `Trail loop: ${err instanceof Error ? err.message : String(err)}`;
      this.emit();
    }
  }

  private async refreshPosition(): Promise<void> {
    const pos = await fetchOpenPosition(this.config.productId);
    this.state.activePosition = pos ?? undefined;
  }

  private isDrawdownBreached(): boolean {
    return this.state.sessionStats.currentDrawdown >= this.config.maxDrawdownPct;
  }
}
