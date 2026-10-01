import type { Market, MarketSnapshot, RunMode } from '@paperlab/shared';

export type MarketUpdateHandler = (snapshot: MarketSnapshot) => void;

/**
 * Abstraction over market data sources.
 * LIVE, BACKTEST and MOCK all implement this same contract.
 */
export interface MarketDataProvider {
  readonly name: string;
  readonly mode: RunMode;

  getMarkets(): Promise<Market[]>;
  getMarket(id: string): Promise<Market | null>;
  subscribeToMarket(id: string): void;
  unsubscribeFromMarket(id: string): void;
  onUpdate(handler: MarketUpdateHandler): () => void;
  start?(): Promise<void>;
  stop?(): Promise<void>;
}
