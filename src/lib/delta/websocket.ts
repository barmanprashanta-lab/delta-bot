import WebSocket from 'ws';
import { Candle, OrderBook, Trade, Ticker } from '@/types';

type WsMessage =
  | { type: 'candle'; data: Candle }
  | { type: 'orderbook'; data: OrderBook }
  | { type: 'trade'; data: Trade }
  | { type: 'ticker'; data: Ticker };

type MessageHandler = (msg: WsMessage) => void;

const WS_URL = process.env.DELTA_WS_URL ?? 'wss://socket.india.delta.exchange';

export class DeltaWebSocket {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private subscriptions: string[] = [];
  private connected = false;

  connect(subscriptions: string[]): void {
    this.subscriptions = subscriptions;
    this.createConnection();
  }

  private createConnection(): void {
    this.ws = new WebSocket(WS_URL);

    this.ws.on('open', () => {
      this.connected = true;
      this.subscriptions.forEach(channel => {
        this.ws!.send(JSON.stringify({ type: 'subscribe', payload: { channels: [{ name: channel }] } }));
      });
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const json = JSON.parse(raw.toString());
        const msg = this.parseMessage(json);
        if (msg) this.handlers.forEach(h => h(msg));
      } catch (err) {
        console.error('[WS] parse error', err);
      }
    });

    this.ws.on('close', () => {
      this.connected = false;
      this.scheduleReconnect();
    });

    this.ws.on('error', (err: Error) => {
      console.error('[WS] error', err.message);
      this.ws?.close();
    });
  }

  private parseMessage(json: Record<string, unknown>): WsMessage | null {
    const type = json.type as string;

    if (type === 'candlestick_1m') {
      const d = json as { open: string; high: string; low: string; close: string; volume: string; start: number };
      return {
        type: 'candle',
        data: {
          timestamp: d.start * 1000,
          open: parseFloat(d.open),
          high: parseFloat(d.high),
          low: parseFloat(d.low),
          close: parseFloat(d.close),
          volume: parseFloat(d.volume),
        },
      };
    }

    if (type === 'l2_orderbook') {
      const d = json as { buy: { price: string; size: number }[]; sell: { price: string; size: number }[] };
      return {
        type: 'orderbook',
        data: {
          bids: d.buy.map(b => ({ price: parseFloat(b.price), size: b.size })),
          asks: d.sell.map(a => ({ price: parseFloat(a.price), size: a.size })),
          timestamp: Date.now(),
        },
      };
    }

    if (type === 'recent_trade') {
      const d = json as { id: number; price: string; size: number; buyer_role: string; timestamp: string };
      return {
        type: 'trade',
        data: {
          id: String(d.id),
          price: parseFloat(d.price),
          size: d.size,
          side: d.buyer_role === 'taker' ? 'buy' : 'sell',
          timestamp: new Date(d.timestamp).getTime(),
        },
      };
    }

    if (type === 'mark_price') {
      const d = json as { symbol: string; mark_price: string; index_price: string };
      return {
        type: 'ticker',
        data: {
          symbol: d.symbol,
          markPrice: parseFloat(d.mark_price),
          indexPrice: parseFloat(d.index_price),
          lastPrice: parseFloat(d.mark_price),
          volume24h: 0,
          openInterest: 0,
          fundingRate: 0,
          timestamp: Date.now(),
        },
      };
    }

    return null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('[WS] Reconnecting...');
      this.createConnection();
    }, 3000);
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.handlers.clear();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
