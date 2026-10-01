import type { DataQualityReport, Market, MarketSnapshot, StrategySignal } from '@paperlab/shared';

/** In-memory store — works without PostgreSQL; Prisma sync is optional enhancement */
export class MemoryStore {
  markets = new Map<string, Market>();
  snapshots: MarketSnapshot[] = [];
  signals: StrategySignal[] = [];
  qualityEvents: DataQualityReport[] = [];

  upsertMarket(market: Market): void {
    this.markets.set(market.id, market);
  }

  addSnapshot(snapshot: MarketSnapshot): void {
    this.snapshots.push(snapshot);
    if (this.snapshots.length > 100_000) {
      this.snapshots.splice(0, this.snapshots.length - 80_000);
    }
    const m = this.markets.get(snapshot.marketId);
    if (m) {
      const q = snapshot.outcome === 'YES' ? m.yes : m.no;
      q.price = snapshot.price;
      q.bid = snapshot.bid;
      q.ask = snapshot.ask;
      q.spread = snapshot.spread;
      q.liquidity = snapshot.liquidity ?? q.liquidity;
      q.volume = snapshot.volume ?? q.volume;
      m.timestamp = snapshot.timestamp;
    }
  }

  addSignal(signal: StrategySignal): void {
    this.signals.unshift(signal);
    if (this.signals.length > 5_000) this.signals.length = 5_000;
  }

  addQuality(report: DataQualityReport): void {
    this.qualityEvents.unshift(report);
    if (this.qualityEvents.length > 2_000) this.qualityEvents.length = 2_000;
  }

  getSnapshots(marketId?: string, limit = 500): MarketSnapshot[] {
    const list = marketId
      ? this.snapshots.filter((s) => s.marketId === marketId)
      : this.snapshots;
    return list.slice(-limit);
  }
}
