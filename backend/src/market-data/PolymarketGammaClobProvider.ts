import type { Market, MarketSnapshot, OutcomeQuote, TradeSide } from '@paperlab/shared';
import { config } from '../config/index.js';
import { logEvent, logger } from '../utils/logger.js';
import type { MarketDataProvider, MarketUpdateHandler } from './MarketDataProvider.js';
import {
  inferMarketType,
  isBinaryMarket,
  isSportEnabled,
  normalizeSport,
  parseTagIds,
  type SportsMetadata,
} from './sportsFilter.js';

interface GammaMarketRaw {
  id: string | number;
  eventId?: string | number;
  events?: Array<{ id?: string | number; title?: string; slug?: string; startTime?: string }>;
  conditionId?: string;
  condition_id?: string;
  slug?: string;
  question?: string;
  outcomes?: string | string[];
  outcomePrices?: string | string[];
  clobTokenIds?: string | string[];
  volume?: string | number;
  volumeNum?: number;
  liquidity?: string | number;
  liquidityNum?: number;
  active?: boolean;
  closed?: boolean;
  umaResolutionStatus?: string;
  sportsMarketType?: string;
  gameId?: string;
  startDate?: string;
  endDate?: string;
  tags?: Array<{ id?: number; slug?: string; label?: string }>;
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return [];
    }
  }
  return [];
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

export class PolymarketGammaClobProvider implements MarketDataProvider {
  readonly name = 'PolymarketGammaClobProvider';
  readonly mode = 'LIVE' as const;

  private handlers = new Set<MarketUpdateHandler>();
  private subscribed = new Set<string>();
  private marketsCache = new Map<string, Market>();
  private tokenToMarket = new Map<string, { marketId: string; outcome: TradeSide }>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private sportTagIds: number[] = [];

  onUpdate(handler: MarketUpdateHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(snapshot: MarketSnapshot): void {
    for (const h of this.handlers) h(snapshot);
  }

  async start(): Promise<void> {
    await this.refreshSportsTags();
    await this.getMarkets();
    this.pollTimer = setInterval(() => {
      void this.refreshSubscribedQuotes().catch((err) =>
        logger.error({ err }, 'quote refresh failed'),
      );
    }, 5_000);
    logEvent('market-data', 'Polymarket provider started', {
      sportsTags: this.sportTagIds.length,
      mode: this.mode,
    });
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private async refreshSportsTags(): Promise<void> {
    try {
      const sports = await fetchJson<SportsMetadata[]>(`${config.gammaBaseUrl}/sports`);
      const enabled = config.enabledSports;
      const tagIds = new Set<number>();
      for (const s of sports) {
        const sportKey = normalizeSport(s.sport);
        if (!isSportEnabled(sportKey, enabled) && enabled.length > 0) {
          // still include if raw sport string matches enabled list
          if (!enabled.includes(s.sport.toLowerCase())) continue;
        }
        for (const id of parseTagIds(s.tags)) tagIds.add(id);
      }
      // If filter emptied everything, fall back to all sports tags
      if (tagIds.size === 0) {
        for (const s of sports) {
          for (const id of parseTagIds(s.tags)) tagIds.add(id);
        }
      }
      this.sportTagIds = [...tagIds];
      logEvent('market-data', 'Loaded sports tags', { count: this.sportTagIds.length });
    } catch (err) {
      logger.warn({ err }, 'Failed to load /sports — will fetch without tag filter');
      this.sportTagIds = [];
    }
  }

  async getMarkets(): Promise<Market[]> {
    const markets: Market[] = [];
    const tagIds = this.sportTagIds.length > 0 ? this.sportTagIds.slice(0, 8) : [null];

    for (const tagId of tagIds) {
      let cursor: string | null = null;
      let pages = 0;
      while (pages < 3) {
        const params = new URLSearchParams({
          closed: 'false',
          limit: '50',
          include_tag: 'true',
        });
        if (tagId !== null) params.set('tag_id', String(tagId));
        if (cursor) params.set('after_cursor', cursor);

        try {
          const data = await fetchJson<{
            markets?: GammaMarketRaw[];
            next_cursor?: string | null;
            nextCursor?: string | null;
          } | GammaMarketRaw[]>(`${config.gammaBaseUrl}/markets/keyset?${params}`);

          const batch = Array.isArray(data) ? data : (data.markets ?? []);
          for (const raw of batch) {
            const mapped = this.mapMarket(raw);
            if (!mapped) continue;
            if (!isSportEnabled(mapped.sport, config.enabledSports) && config.enabledSports.length) {
              // keep soccer/other sports matching tags we already filtered
            }
            markets.push(mapped);
            this.marketsCache.set(mapped.id, mapped);
            this.tokenToMarket.set(mapped.yes.tokenId, { marketId: mapped.id, outcome: 'YES' });
            this.tokenToMarket.set(mapped.no.tokenId, { marketId: mapped.id, outcome: 'NO' });
          }

          cursor = Array.isArray(data)
            ? null
            : (data.next_cursor ?? data.nextCursor ?? null);
          pages += 1;
          if (!cursor) break;
        } catch (err) {
          logger.warn({ err, tagId }, 'markets/keyset page failed — trying /markets fallback');
          await this.fallbackMarkets(markets, tagId);
          break;
        }
      }
    }

    if (markets.length === 0) {
      await this.fallbackMarkets(markets, null);
    }

    // Prefer binary markets
    const binary = markets.filter((m) => m.yes.tokenId && m.no.tokenId);
    logEvent('market-data', 'Fetched markets', {
      total: binary.length,
      dataKind: 'OBSERVED',
    });
    return binary;
  }

  private async fallbackMarkets(markets: Market[], tagId: number | null): Promise<void> {
    const params = new URLSearchParams({
      closed: 'false',
      limit: '50',
      active: 'true',
    });
    if (tagId !== null) params.set('tag_id', String(tagId));
    try {
      const batch = await fetchJson<GammaMarketRaw[]>(
        `${config.gammaBaseUrl}/markets?${params}`,
      );
      for (const raw of batch) {
        const mapped = this.mapMarket(raw);
        if (!mapped) continue;
        markets.push(mapped);
        this.marketsCache.set(mapped.id, mapped);
        this.tokenToMarket.set(mapped.yes.tokenId, { marketId: mapped.id, outcome: 'YES' });
        this.tokenToMarket.set(mapped.no.tokenId, { marketId: mapped.id, outcome: 'NO' });
      }
    } catch (err) {
      logger.error({ err }, 'fallback /markets failed');
    }
  }

  async getMarket(id: string): Promise<Market | null> {
    if (this.marketsCache.has(id)) {
      return this.marketsCache.get(id)!;
    }
    try {
      const raw = await fetchJson<GammaMarketRaw>(`${config.gammaBaseUrl}/markets/${id}`);
      const mapped = this.mapMarket(raw);
      if (mapped) this.marketsCache.set(mapped.id, mapped);
      return mapped;
    } catch (err) {
      logger.error({ err, id }, 'getMarket failed');
      return null;
    }
  }

  subscribeToMarket(id: string): void {
    this.subscribed.add(id);
    logEvent('market-data', 'Subscribed market', { marketId: id });
  }

  unsubscribeFromMarket(id: string): void {
    this.subscribed.delete(id);
  }

  /** Enrich with CLOB book for a token — OBSERVED */
  async fetchBook(tokenId: string): Promise<{
    bid: number | null;
    ask: number | null;
    spread: number | null;
    liquidity: number | null;
    mid: number | null;
  }> {
    try {
      const book = await fetchJson<{
        bids?: Array<{ price: string; size: string }>;
        asks?: Array<{ price: string; size: string }>;
        timestamp?: string | number;
      }>(`${config.clobBaseUrl}/book?token_id=${encodeURIComponent(tokenId)}`);

      const bestBid = book.bids?.length
        ? Math.max(...book.bids.map((b) => Number(b.price)))
        : null;
      const bestAsk = book.asks?.length
        ? Math.min(...book.asks.map((a) => Number(a.price)))
        : null;
      const spread =
        bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
      const askLiquidity = (book.asks ?? [])
        .slice(0, 5)
        .reduce((s, a) => s + Number(a.size) * Number(a.price), 0);
      const mid =
        bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : bestAsk ?? bestBid;

      return {
        bid: bestBid,
        ask: bestAsk,
        spread,
        liquidity: askLiquidity || null,
        mid,
      };
    } catch (err) {
      logger.warn({ err, tokenId }, 'CLOB /book failed');
      return { bid: null, ask: null, spread: null, liquidity: null, mid: null };
    }
  }

  private async refreshSubscribedQuotes(): Promise<void> {
    const ids = [...this.subscribed];
    if (ids.length === 0) {
      // refresh a sample of cached markets
      ids.push(...[...this.marketsCache.keys()].slice(0, 20));
    }
    for (const marketId of ids) {
      const market = this.marketsCache.get(marketId) ?? (await this.getMarket(marketId));
      if (!market) continue;
      const yesBook = await this.fetchBook(market.yes.tokenId);
      const noBook = await this.fetchBook(market.no.tokenId);
      const ts = new Date().toISOString();

      const updateOutcome = (
        side: TradeSide,
        quote: OutcomeQuote,
        book: Awaited<ReturnType<PolymarketGammaClobProvider['fetchBook']>>,
      ): OutcomeQuote => ({
        ...quote,
        price: book.mid ?? book.ask ?? quote.price,
        bid: book.bid,
        ask: book.ask,
        spread: book.spread,
        liquidity: book.liquidity ?? quote.liquidity,
      });

      market.yes = updateOutcome('YES', market.yes, yesBook);
      market.no = updateOutcome('NO', market.no, noBook);
      market.timestamp = ts;
      market.liquidity = (market.yes.liquidity ?? 0) + (market.no.liquidity ?? 0);
      this.marketsCache.set(market.id, market);

      for (const side of ['YES', 'NO'] as TradeSide[]) {
        const q = side === 'YES' ? market.yes : market.no;
        const snapshot: MarketSnapshot = {
          timestamp: ts,
          marketId: market.id,
          eventId: market.eventId,
          tokenId: q.tokenId,
          question: market.question,
          outcome: side,
          price: q.price,
          bid: q.bid,
          ask: q.ask,
          spread: q.spread,
          volume: q.volume,
          liquidity: q.liquidity,
          dataKind: 'OBSERVED',
        };
        this.emit(snapshot);
      }
    }
  }

  private mapMarket(raw: GammaMarketRaw): Market | null {
    const outcomes = parseJsonArray(raw.outcomes);
    const prices = parseJsonArray(raw.outcomePrices).map(Number);
    const tokens = parseJsonArray(raw.clobTokenIds);
    if (tokens.length < 2) return null;
    if (!isBinaryMarket(outcomes.length ? outcomes : ['Yes', 'No'])) return null;

    const event = raw.events?.[0];
    const eventId = String(raw.eventId ?? event?.id ?? raw.id);
    const question = raw.question ?? 'Unknown market';
    const tagSlug = raw.tags?.[0]?.slug ?? raw.tags?.[0]?.label ?? null;
    const sport = normalizeSport(tagSlug);

    const yesPrice = Number.isFinite(prices[0]) ? prices[0]! : 0.5;
    const noPrice = Number.isFinite(prices[1]) ? prices[1]! : 1 - yesPrice;

    const teams = this.parseTeams(question, event?.title);

    return {
      id: String(raw.id),
      eventId,
      conditionId: raw.conditionId ?? raw.condition_id ?? null,
      slug: raw.slug ?? null,
      question,
      sport,
      competition: tagSlug,
      homeTeam: teams.home,
      awayTeam: teams.away,
      startTime: raw.startDate ?? event?.startTime ?? null,
      isLive: false, // set by LabService via Sports WS / startTime heuristic
      liveStatus: null,
      marketType: inferMarketType(question, raw.sportsMarketType),
      active: raw.active !== false,
      closed: Boolean(raw.closed),
      resolved: Boolean(raw.closed && raw.umaResolutionStatus),
      winningOutcome: null,
      umaResolutionStatus: raw.umaResolutionStatus ?? null,
      yes: {
        outcome: 'YES',
        tokenId: tokens[0]!,
        price: yesPrice,
        bid: null,
        ask: null,
        spread: null,
        volume: toNumber(raw.volumeNum ?? raw.volume),
        liquidity: toNumber(raw.liquidityNum ?? raw.liquidity),
      },
      no: {
        outcome: 'NO',
        tokenId: tokens[1]!,
        price: noPrice,
        bid: null,
        ask: null,
        spread: null,
        volume: null,
        liquidity: null,
      },
      volume: toNumber(raw.volumeNum ?? raw.volume),
      liquidity: toNumber(raw.liquidityNum ?? raw.liquidity),
      timestamp: new Date().toISOString(),
      dataKind: 'OBSERVED',
      mode: 'LIVE',
    };
  }

  private parseTeams(
    question: string,
    title?: string,
  ): { home: string | null; away: string | null } {
    const text = title ?? question;
    const vs = text.split(/\s+vs\.?\s+|\s+v\s+/i);
    if (vs.length === 2) {
      return { home: vs[0]!.trim(), away: vs[1]!.replace(/\?.*/, '').trim() };
    }
    return { home: null, away: null };
  }
}
