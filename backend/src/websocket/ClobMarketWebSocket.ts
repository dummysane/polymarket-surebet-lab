/**
 * CLOB Market WebSocket client — OBSERVED real-time prices.
 * Endpoint: wss://ws-subscriptions-clob.polymarket.com/ws/market
 */
import WebSocket from 'ws';
import type { MarketSnapshot, TradeSide } from '@paperlab/shared';
import { config } from '../config/index.js';
import { logEvent, logger } from '../utils/logger.js';

export type WsSnapshotHandler = (snapshot: MarketSnapshot) => void;

export class ClobMarketWebSocket {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private assetMap = new Map<string, { marketId: string; eventId: string; question: string; outcome: TradeSide }>();
  private handlers = new Set<WsSnapshotHandler>();
  private intentionalClose = false;

  onSnapshot(handler: WsSnapshotHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  registerAsset(
    tokenId: string,
    meta: { marketId: string; eventId: string; question: string; outcome: TradeSide },
  ): void {
    this.assetMap.set(tokenId, meta);
  }

  connect(): void {
    this.intentionalClose = false;
    this.ws = new WebSocket(config.clobWsUrl);

    this.ws.on('open', () => {
      logEvent('websocket', 'CLOB market WS connected');
      this.subscribeAll();
      this.pingTimer = setInterval(() => {
        this.ws?.send('PING');
      }, 10_000);
    });

    this.ws.on('message', (data) => {
      const text = data.toString();
      if (text === 'PONG') return;
      try {
        const msg = JSON.parse(text) as Record<string, unknown> | Record<string, unknown>[];
        const events = Array.isArray(msg) ? msg : [msg];
        for (const ev of events) this.handleEvent(ev);
      } catch (err) {
        logger.warn({ err, text: text.slice(0, 200) }, 'WS parse error');
      }
    });

    this.ws.on('close', () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      logEvent('websocket', 'CLOB market WS closed');
      if (!this.intentionalClose) {
        setTimeout(() => this.connect(), 3_000);
      }
    });

    this.ws.on('error', (err) => {
      logger.error({ err }, 'CLOB WS error');
    });
  }

  private subscribeAll(): void {
    const assets = [...this.assetMap.keys()];
    if (!assets.length || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        assets_ids: assets,
        type: 'market',
        initial_dump: true,
      }),
    );
    logEvent('websocket', 'Subscribed assets', { count: assets.length });
  }

  resubscribe(): void {
    this.subscribeAll();
  }

  private handleEvent(ev: Record<string, unknown>): void {
    const eventType = String(ev.event_type ?? ev.type ?? '');
    const assetId = String(ev.asset_id ?? ev.assetId ?? '');
    const meta = this.assetMap.get(assetId);
    if (!meta) return;

    let price: number | null = null;
    let bid: number | null = null;
    let ask: number | null = null;
    let liquidity: number | null = null;

    if (eventType === 'book' || ev.bids || ev.asks) {
      const bids = (ev.bids as Array<{ price: string; size: string }> | undefined) ?? [];
      const asks = (ev.asks as Array<{ price: string; size: string }> | undefined) ?? [];
      bid = bids.length ? Math.max(...bids.map((b) => Number(b.price))) : null;
      ask = asks.length ? Math.min(...asks.map((a) => Number(a.price))) : null;
      price = bid !== null && ask !== null ? (bid + ask) / 2 : ask ?? bid;
      liquidity = asks.slice(0, 5).reduce((s, a) => s + Number(a.size) * Number(a.price), 0);
    } else if (eventType === 'price_change' || ev.price !== undefined) {
      price = Number(ev.price);
    } else if (eventType === 'last_trade_price') {
      price = Number(ev.price);
    }

    if (price === null || !Number.isFinite(price)) return;

    const snapshot: MarketSnapshot = {
      timestamp: new Date(Number(ev.timestamp) || Date.now()).toISOString(),
      marketId: meta.marketId,
      eventId: meta.eventId,
      tokenId: assetId,
      question: meta.question,
      outcome: meta.outcome,
      price,
      bid,
      ask,
      spread: bid !== null && ask !== null ? ask - bid : null,
      volume: null,
      liquidity,
      dataKind: 'OBSERVED',
    };

    for (const h of this.handlers) h(snapshot);
  }

  stop(): void {
    this.intentionalClose = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
  }
}
