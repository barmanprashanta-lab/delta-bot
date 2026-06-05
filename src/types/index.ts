// ─── Market Data ────────────────────────────────────────────────────────────

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface Trade {
  id: string;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  timestamp: number;
}

export interface Ticker {
  symbol: string;
  markPrice: number;
  indexPrice: number;
  lastPrice: number;
  volume24h: number;
  openInterest: number;
  fundingRate: number;
  timestamp: number;
}

// ─── Claude Decision Engine ──────────────────────────────────────────────────

export type ClaudeAction = 'OPEN' | 'HOLD' | 'CLOSE' | 'NO_TRADE';

/**
 * The structured decision Claude returns over the API. The bot executes this
 * verbatim — it performs NO independent market analysis of its own.
 */
export interface ClaudeDecision {
  action: ClaudeAction;
  direction: SignalDirection;      // LONG | SHORT | NEUTRAL
  confidence: number;              // 0–100
  entryPrice: number | null;       // limit price; null = use market
  useMarketOrder: boolean;         // Claude chooses limit vs market
  stopLoss: number | null;
  takeProfit1: number | null;
  takeProfit2: number | null;
  takeProfit3: number | null;
  sizeFraction: number;            // 0–1 of the allocated capital to deploy
  reasoning: string;
}

/** Raw, un-analysed market snapshot the bot ships to Claude each cycle. */
export interface MarketSnapshot {
  symbol: string;
  timestamp: number;
  ticker: Ticker;
  candles5m: Candle[];
  candles15m: Candle[];
  orderBook: OrderBook;
  recentTrades: Trade[];
  wallet: WalletBalance;
  openPosition: Position | null;
  openOrders: Order[];
  config: Pick<BotConfig, 'minNetProfitPct' | 'takerFeePct' | 'makerFeePct' | 'walletAllocationPct'>;
}

// ─── Signals & Analysis ─────────────────────────────────────────────────────

export type SignalDirection = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface Signal {
  decision: ClaudeDecision;
  snapshotTimestamp: number;
  latencyMs: number;              // time from snapshot capture to decision received
  timestamp: number;
}

// ─── Orders & Positions ─────────────────────────────────────────────────────

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'limit' | 'market';
export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'rejected';

export interface Order {
  id: string;
  clientOrderId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price: number;
  size: number;
  filledSize: number;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
}

export interface Position {
  symbol: string;
  side: OrderSide;
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  liquidationPrice: number;
  leverage: number;
}

export interface TradeRecord {
  id: string;
  signal: Signal;
  entryOrder: Order;
  exitOrders: Order[];
  entryPrice: number;
  exitPrice: number;
  size: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  netPnlPct: number;
  duration: number;
  status: 'open' | 'closed';
  openedAt: number;
  closedAt?: number;
}

// ─── Account & Bot State ─────────────────────────────────────────────────────

export interface WalletBalance {
  totalBalance: number;
  availableBalance: number;
  positionMargin: number;
  orderMargin: number;
  unrealizedPnl: number;
  currency: string;
}

export type BotStatus = 'RUNNING' | 'PAUSED' | 'STOPPED' | 'ERROR';

export interface BotState {
  status: BotStatus;
  startedAt?: number;
  lastSignal?: Signal;
  activePosition?: Position;
  openOrders: Order[];
  sessionStats: SessionStats;
  error?: string;
}

export interface SessionStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalNetPnl: number;
  totalFees: number;
  winRate: number;
  avgNetPnlPct: number;
  largestWin: number;
  largestLoss: number;
  currentDrawdown: number;
  peakBalance: number;
}

// ─── API Payloads ────────────────────────────────────────────────────────────

export interface DeltaApiResponse<T> {
  success: boolean;
  result: T;
  error?: { code: number; message: string };
}

export interface PlaceOrderPayload {
  product_id: number;
  side: OrderSide;
  order_type: OrderType;
  size: number;
  limit_price?: string;
  time_in_force?: 'gtc' | 'ioc' | 'fok';
  post_only?: boolean;
  reduce_only?: boolean;
  client_order_id?: string;
}

export interface BotConfig {
  symbol: string;
  productId: number;
  walletAllocationPct: number;    // 0.7 = 70%
  minNetProfitPct: number;        // 0.015 = 1.5%
  takerFeePct: number;            // 0.0005 = 0.05%
  makerFeePct: number;            // 0.0002 = 0.02%
  maxLeverage: number;
  maxPositionUsd: number;
  scanIntervalMs: number;         // how often a snapshot is sent to Claude
  priceMonitorMs: number;         // how often the local trailing-SL loop runs
  minConfidence: number;          // min Claude confidence to act (0-100)
  maxDrawdownPct: number;         // halt if session drawdown exceeds this
  trailTriggerPct: number;        // fraction of TP1 distance that arms the trail (0.75)
  trailBufferPct: number;         // profit locked in when trail arms (e.g. 0.001)
  mode: 'PAPER' | 'LIVE';         // PAPER by default; LIVE requires explicit opt-in
  claudeModel: string;
}
