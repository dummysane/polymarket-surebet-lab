/**
 * MOCK MarketDataProvider — clearly identified.
 * Used for offline tests and when MARKET_DATA_MODE=mock.
 * Does NOT claim to be live Polymarket data.
 */
import type { Market, MarketSnapshot } from '@paperlab/shared';
import { logEvent } from '../utils/logger.js';
import type { MarketDataProvider, MarketUpdateHandler } from '../market-data/MarketDataProvider.js';

function mockMarket(id: string, yesPrice: number, overrides: Partial<Market> = {}): Market {
  const noPrice = Math.max(0.01, Math.min(0.99, 1 - yesPrice));
  return {
    id,
    eventId: `event-${id}`,
    conditionId: `cond-${id}`,
    slug: `mock-${id}`,
    question: overrides.question ?? `MOCK: Team A vs Team B — ${id}`,
    sport: overrides.sport ?? 'soccer',
    competition: overrides.competition ?? 'MOCK League',
    homeTeam: overrides.homeTeam ?? 'Team A',
    awayTeam: overrides.awayTeam ?? 'Team B',
    startTime: new Date(Date.now() - 15 * 60_000).toISOString(), // already started → LIVE
    marketType: 'moneyline',
    isLive: true,
    liveStatus: 'InProgress',
    active: true,
    closed: false,
    resolved: false,
    winningOutcome: null,
    umaResolutionStatus: null,
    yes: {
      outcome: 'YES',
      tokenId: `mock-yes-${id}`,
      price: yesPrice,
      bid: yesPrice - 0.01,
      ask: yesPrice + 0.01,
      spread: 0.02,
      volume: 50_000,
      liquidity: 5_000,
    },
    no: {
      outcome: 'NO',
      tokenId: `mock-no-${id}`,
      price: noPrice,
      bid: noPrice - 0.01,
      ask: noPrice + 0.01,
      spread: 0.02,
      volume: 40_000,
      liquidity: 4_000,
    },
    volume: 90_000,
    liquidity: 9_000,
    timestamp: new Date().toISOString(),
    dataKind: 'SIMULATED',
    mode: 'PAPER',
    ...overrides,
  };
}

export class MockMarketDataProvider implements MarketDataProvider {
  readonly name = 'MockMarketDataProvider';
  readonly mode = 'PAPER' as const;

  private handlers = new Set<MarketUpdateHandler>();
  private markets: Market[];
  private subscribed = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private tick = 0;

  constructor(markets?: Market[]) {
    this.markets = markets ?? [
      mockMarket('mock-1', 0.6),
      mockMarket('mock-2', 0.58, {
        question: 'MOCK LIVE: Real Madrid vs Atletico',
        homeTeam: 'Real Madrid',
        awayTeam: 'Atletico',
      }),
      mockMarket('mock-3', 0.62, {
        sport: 'nba',
        question: 'MOCK LIVE: Lakers vs Celtics',
        homeTeam: 'Lakers',
        awayTeam: 'Celtics',
        competition: 'NBA',
      }),
    ];
  }

  onUpdate(handler: MarketUpdateHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async start(): Promise<void> {
    logEvent('market-data', 'MOCK provider started — data is SIMULATED', {
      provider: this.name,
    });
    this.timer = setInterval(() => this.advance(), 2_000);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
  }

  async getMarkets(): Promise<Market[]> {
    return this.markets.map((m) => ({ ...m, timestamp: new Date().toISOString() }));
  }

  async getMarket(id: string): Promise<Market | null> {
    return this.markets.find((m) => m.id === id) ?? null;
  }

  subscribeToMarket(id: string): void {
    this.subscribed.add(id);
  }

  unsubscribeFromMarket(id: string): void {
    this.subscribed.delete(id);
  }

  /** Advance mock prices to occasionally hit hedge targets */
  private advance(): void {
    this.tick += 1;
    for (const m of this.markets) {
      // Slowly move NO price toward target for mock-2
      const drift = (Math.sin(this.tick / 5) + 1) * 0.02;
      if (m.id === 'mock-2') {
        m.no.price = Math.max(0.2, Math.min(0.45, 0.42 - drift));
        m.yes.price = Math.max(0.01, Math.min(0.99, 1 - m.no.price));
      } else {
        m.yes.price = Math.max(0.51, Math.min(0.75, m.yes.price + (Math.random() - 0.5) * 0.01));
        m.no.price = Math.max(0.01, Math.min(0.99, 1 - m.yes.price));
      }
      m.timestamp = new Date().toISOString();
      for (const side of ['YES', 'NO'] as const) {
        const q = side === 'YES' ? m.yes : m.no;
        const snapshot: MarketSnapshot = {
          timestamp: m.timestamp,
          marketId: m.id,
          eventId: m.eventId,
          tokenId: q.tokenId,
          question: m.question,
          outcome: side,
          price: q.price,
          bid: q.bid,
          ask: q.ask,
          spread: q.spread,
          volume: q.volume,
          liquidity: q.liquidity,
          dataKind: 'SIMULATED',
        };
        for (const h of this.handlers) h(snapshot);
      }
    }
  }
}
