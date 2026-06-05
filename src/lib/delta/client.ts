import crypto from 'crypto';
import {
  DeltaApiResponse,
  Candle,
  OrderBook,
  Ticker,
  Order,
  Position,
  WalletBalance,
  PlaceOrderPayload,
  Trade,
} from '@/types';

const DELTA_BASE = process.env.DELTA_API_URL ?? 'https://api.india.delta.exchange';

function sign(
  secret: string,
  method: string,
  path: string,
  timestamp: string,
  body: string
): string {
  const message = method + timestamp + path + body;
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const apiKey = process.env.DELTA_API_KEY;
  const apiSecret = process.env.DELTA_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error('DELTA_API_KEY and DELTA_API_SECRET must be set');
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyStr = body ? JSON.stringify(body) : '';
  const signature = sign(apiSecret, method, path, timestamp, bodyStr);

  const url = `${DELTA_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
      'timestamp': timestamp,
      'signature': signature,
    },
    ...(bodyStr ? { body: bodyStr } : {}),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Delta API ${method} ${path} → ${res.status}: ${err}`);
  }

  const json: DeltaApiResponse<T> = await res.json();
  if (!json.success) {
    throw new Error(`Delta API error: ${JSON.stringify(json.error)}`);
  }

  return json.result;
}

// ─── Market Data ─────────────────────────────────────────────────────────────

export async function fetchCandles(
  symbol: string,
  resolution: number,
  start: number,
  end: number
): Promise<Candle[]> {
  const path = `/v2/history/candles?symbol=${symbol}&resolution=${resolution}&start=${start}&end=${end}`;
  const raw = await request<{ open: number[]; high: number[]; low: number[]; close: number[]; volume: number[]; time: number[] }>(
    'GET',
    path
  );
  return raw.time.map((t, i) => ({
    timestamp: t * 1000,
    open: raw.open[i],
    high: raw.high[i],
    low: raw.low[i],
    close: raw.close[i],
    volume: raw.volume[i],
  }));
}

export async function fetchOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
  const path = `/v2/l2orderbook/${symbol}?depth=${depth}`;
  const raw = await request<{ buy: { price: string; size: number }[]; sell: { price: string; size: number }[] }>(
    'GET',
    path
  );
  return {
    bids: raw.buy.map(b => ({ price: parseFloat(b.price), size: b.size })),
    asks: raw.sell.map(a => ({ price: parseFloat(a.price), size: a.size })),
    timestamp: Date.now(),
  };
}

export async function fetchTicker(symbol: string): Promise<Ticker> {
  const path = `/v2/tickers/${symbol}`;
  const raw = await request<{
    mark_price: string;
    index_price: string;
    close: string;
    volume: string;
    oi: string;
    funding_rate: string;
  }>('GET', path);
  return {
    symbol,
    markPrice: parseFloat(raw.mark_price),
    indexPrice: parseFloat(raw.index_price),
    lastPrice: parseFloat(raw.close),
    volume24h: parseFloat(raw.volume),
    openInterest: parseFloat(raw.oi),
    fundingRate: parseFloat(raw.funding_rate),
    timestamp: Date.now(),
  };
}

export async function fetchRecentTrades(symbol: string, limit = 100): Promise<Trade[]> {
  const path = `/v2/trades/${symbol}?limit=${limit}`;
  const raw = await request<{ id: number; price: string; size: number; buyer_role: string; timestamp: string }[]>(
    'GET',
    path
  );
  return raw.map(t => ({
    id: String(t.id),
    price: parseFloat(t.price),
    size: t.size,
    side: t.buyer_role === 'taker' ? 'buy' : 'sell',
    timestamp: new Date(t.timestamp).getTime(),
  }));
}

// ─── Account ──────────────────────────────────────────────────────────────────

export async function fetchWalletBalance(currency = 'USDT'): Promise<WalletBalance> {
  const path = `/v2/wallet/balances`;
  const raw = await request<{ asset_symbol: string; balance: string; available_balance: string; position_margin: string; order_margin: string; unrealized_pnl: string }[]>(
    'GET',
    path
  );
  const wallet = raw.find(w => w.asset_symbol === currency);
  if (!wallet) throw new Error(`No ${currency} wallet found`);
  return {
    currency,
    totalBalance: parseFloat(wallet.balance),
    availableBalance: parseFloat(wallet.available_balance),
    positionMargin: parseFloat(wallet.position_margin),
    orderMargin: parseFloat(wallet.order_margin),
    unrealizedPnl: parseFloat(wallet.unrealized_pnl),
  };
}

export async function fetchOpenPosition(productId: number): Promise<Position | null> {
  const path = `/v2/positions?product_id=${productId}`;
  const raw = await request<{
    size: number;
    entry_price: string;
    mark_price: string;
    unrealized_pnl: string;
    realized_pnl: string;
    liquidation_price: string;
    leverage: string;
  } | null>('GET', path);

  if (!raw || raw.size === 0) return null;
  return {
    symbol: String(productId),
    side: raw.size > 0 ? 'buy' : 'sell',
    size: Math.abs(raw.size),
    entryPrice: parseFloat(raw.entry_price),
    markPrice: parseFloat(raw.mark_price),
    unrealizedPnl: parseFloat(raw.unrealized_pnl),
    realizedPnl: parseFloat(raw.realized_pnl),
    liquidationPrice: parseFloat(raw.liquidation_price),
    leverage: parseFloat(raw.leverage),
  };
}

// ─── Order Execution ──────────────────────────────────────────────────────────

export async function placeOrder(payload: PlaceOrderPayload): Promise<Order> {
  const raw = await request<{
    id: string;
    client_order_id: string;
    product_id: number;
    side: string;
    order_type: string;
    limit_price: string;
    size: number;
    unfilled_size: number;
    state: string;
    created_at: string;
    updated_at: string;
  }>('POST', '/v2/orders', payload as unknown as Record<string, unknown>);

  return {
    id: String(raw.id),
    clientOrderId: raw.client_order_id ?? '',
    symbol: String(raw.product_id),
    side: raw.side as 'buy' | 'sell',
    type: raw.order_type as 'limit' | 'market',
    price: parseFloat(raw.limit_price ?? '0'),
    size: raw.size,
    filledSize: raw.size - raw.unfilled_size,
    status: mapOrderState(raw.state),
    createdAt: new Date(raw.created_at).getTime(),
    updatedAt: new Date(raw.updated_at).getTime(),
  };
}

export async function cancelOrder(orderId: string): Promise<void> {
  await request<unknown>('DELETE', `/v2/orders/${orderId}`);
}

export async function fetchOpenOrders(productId: number): Promise<Order[]> {
  const path = `/v2/orders?product_id=${productId}&state=open`;
  const raw = await request<{
    id: string;
    client_order_id: string;
    side: string;
    order_type: string;
    limit_price: string;
    size: number;
    unfilled_size: number;
    state: string;
    created_at: string;
    updated_at: string;
  }[]>('GET', path);

  return raw.map(o => ({
    id: String(o.id),
    clientOrderId: o.client_order_id ?? '',
    symbol: String(productId),
    side: o.side as 'buy' | 'sell',
    type: o.order_type as 'limit' | 'market',
    price: parseFloat(o.limit_price ?? '0'),
    size: o.size,
    filledSize: o.size - o.unfilled_size,
    status: mapOrderState(o.state),
    createdAt: new Date(o.created_at).getTime(),
    updatedAt: new Date(o.updated_at).getTime(),
  }));
}

function mapOrderState(state: string): Order['status'] {
  switch (state) {
    case 'open': return 'open';
    case 'closed': return 'filled';
    case 'cancelled': return 'cancelled';
    default: return 'rejected';
  }
}
