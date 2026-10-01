/**
 * HistoricalCsvProvider — BACKTEST tick replay.
 * CSV columns: timestamp,market_id,outcome,price,bid,ask,volume,liquidity
 */
import fs from 'node:fs';
import readline from 'node:readline';
import type { Market, MarketSnapshot, TradeSide } from '@paperlab/shared';
import { logEvent } from '../utils/logger.js';
import type { MarketDataProvider, MarketUpdateHandler } from '../market-data/MarketDataProvider.js';

export class HistoricalCsvProvider implements MarketDataProvider {
  readonly name = 'HistoricalCsvProvider';
  readonly mode = 'BACKTEST' as const;

  private handlers = new Set<MarketUpdateHandler>();
  private ticks: MarketSnapshot[] = [];
  private markets = new Map<string, Market>();
  private cursor = 0;

  constructor(private readonly csvPath: string) {}

  onUpdate(handler: MarketUpdateHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async load(): Promise<void> {
    const stream = fs.createReadStream(this.csvPath);
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let header: string[] | null = null;

    for await (const line of rl) {
      if (!line.trim() || line.startsWith('#')) continue;
      if (!header) {
        header = line.split(',').map((h) => h.trim().toLowerCase());
        continue;
      }
      const cols = line.split(',');
      const row: Record<string, string> = {};
      header.forEach((h, i) => {
        row[h] = (cols[i] ?? '').trim();
      });

      const outcome = row.outcome?.toUpperCase() as TradeSide;
      if (outcome !== 'YES' && outcome !== 'NO') continue;

      const snapshot: MarketSnapshot = {
        timestamp: row.timestamp!,
        marketId: row.market_id!,
        eventId: row.event_id ?? row.market_id!,
        tokenId: row.token_id ?? `${row.market_id}-${outcome}`,
        question: row.question ?? `Historical ${row.market_id}`,
        outcome,
        price: Number(row.price),
        bid: row.bid ? Number(row.bid) : null,
        ask: row.ask ? Number(row.ask) : null,
        spread: row.bid && row.ask ? Number(row.ask) - Number(row.bid) : null,
        volume: row.volume ? Number(row.volume) : null,
        liquidity: row.liquidity ? Number(row.liquidity) : null,
        dataKind: 'OBSERVED',
      };
      this.ticks.push(snapshot);
      this.upsertMarket(snapshot);
    }

    this.ticks.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    logEvent('backtest', 'CSV loaded', { ticks: this.ticks.length, path: this.csvPath });
  }

  private upsertMarket(s: MarketSnapshot): void {
    let m = this.markets.get(s.marketId);
    if (!m) {
      m = {
        id: s.marketId,
        eventId: s.eventId,
        conditionId: null,
        slug: null,
        question: s.question,
        sport: 'other',
        competition: null,
        homeTeam: null,
        awayTeam: null,
        startTime: null,
        isLive: true, // backtest ticks treated as live replay
        liveStatus: 'BACKTEST',
        marketType: 'binary',
        active: true,
        closed: false,
        resolved: false,
        winningOutcome: null,
        umaResolutionStatus: null,
        yes: {
          outcome: 'YES',
          tokenId: `${s.marketId}-YES`,
          price: 0.5,
          bid: null,
          ask: null,
          spread: null,
          volume: null,
          liquidity: null,
        },
        no: {
          outcome: 'NO',
          tokenId: `${s.marketId}-NO`,
          price: 0.5,
          bid: null,
          ask: null,
          spread: null,
          volume: null,
          liquidity: null,
        },
        volume: null,
        liquidity: null,
        timestamp: s.timestamp,
        dataKind: 'OBSERVED',
        mode: 'BACKTEST',
      };
      this.markets.set(s.marketId, m);
    }
    const q = s.outcome === 'YES' ? m.yes : m.no;
    q.price = s.price;
    q.bid = s.bid;
    q.ask = s.ask;
    q.spread = s.spread;
    q.volume = s.volume;
    q.liquidity = s.liquidity;
    q.tokenId = s.tokenId;
    m.timestamp = s.timestamp;
  }

  async getMarkets(): Promise<Market[]> {
    return [...this.markets.values()];
  }

  async getMarket(id: string): Promise<Market | null> {
    return this.markets.get(id) ?? null;
  }

  subscribeToMarket(_id: string): void {}
  unsubscribeFromMarket(_id: string): void {}

  /** Replay all ticks chronologically through the same update handlers */
  async replay(onTick?: (s: MarketSnapshot) => void): Promise<void> {
    this.cursor = 0;
    for (const tick of this.ticks) {
      this.upsertMarket(tick);
      for (const h of this.handlers) h(tick);
      onTick?.(tick);
      this.cursor += 1;
    }
  }

  getTicks(): MarketSnapshot[] {
    return this.ticks;
  }
}
