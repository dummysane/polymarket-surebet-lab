import {
  applySlippage,
  computeHedgeStake,
  computeTradePnl,
  createSeededRng,
  simulateLiquidityFill,
  type Market,
  type PaperTrade,
  type PaperTradeEvent,
  type StrategyConfig,
  type StrategySignal,
  type TradeSide,
} from '@paperlab/shared';
import { config } from '../config/index.js';
import type { PortfolioManager } from '../portfolio/PortfolioManager.js';
import { logEvent } from '../utils/logger.js';

export interface ExecutionQuote {
  price: number;
  liquidity: number;
  timestamp: string;
}

/**
 * PaperTradingEngine — simulates fills with latency, slippage, liquidity, and RNG.
 * NEVER sends real orders.
 */
export class PaperTradingEngine {
  private trades = new Map<string, PaperTrade>();
  private events = new Map<string, PaperTradeEvent[]>();
  private openByMarket = new Map<string, string>();
  private rng: () => number;
  private priceHistory = new Map<string, Array<{ t: number; price: number; side: TradeSide }>>();

  constructor(
    private readonly portfolio: PortfolioManager,
    private readonly strategyConfig: StrategyConfig,
    seed = config.seed,
  ) {
    this.rng = createSeededRng(seed);
  }

  getTrades(): PaperTrade[] {
    return [...this.trades.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  getTrade(id: string): PaperTrade | undefined {
    return this.trades.get(id);
  }

  getEvents(tradeId: string): PaperTradeEvent[] {
    return this.events.get(tradeId) ?? [];
  }

  recordPrice(marketId: string, side: TradeSide, price: number, timestamp: string): void {
    const key = marketId;
    const arr = this.priceHistory.get(key) ?? [];
    arr.push({ t: Date.parse(timestamp), price, side });
    // keep last ~5 minutes of ticks in memory
    const cutoff = Date.now() - 5 * 60_000;
    this.priceHistory.set(
      key,
      arr.filter((p) => p.t >= cutoff),
    );

    const tradeId = this.openByMarket.get(marketId);
    if (!tradeId) return;
    const trade = this.trades.get(tradeId);
    if (!trade || trade.status === 'SETTLED' || trade.status === 'CANCELLED') return;

    if (side === trade.entrySide) {
      trade.maxPriceReached = Math.max(trade.maxPriceReached ?? trade.entryPrice, price);
    }

    // Check hedge target on opposite side
    if (side !== trade.entrySide && trade.status === 'FIRST_LEG_OPENED') {
      if (price <= trade.targetPrice * (1 + this.strategyConfig.maxSlippage)) {
        void this.tryHedge(trade, price, timestamp);
      }
    }
  }

  async openFromSignal(
    signal: StrategySignal,
    market: Market,
    getDelayedQuote: (side: TradeSide) => Promise<ExecutionQuote>,
  ): Promise<PaperTrade | null> {
    if (this.openByMarket.has(signal.marketId)) {
      return null;
    }

    const stake = this.portfolio.recommendedStake();
    const reserve = this.portfolio.reserve(stake);
    if (!reserve.ok) {
      logEvent('paper', 'Insufficient capital', { stake, dataKind: 'SIMULATED' });
      return null;
    }

    const tradeId = `pt_${Date.now()}_${Math.floor(this.rng() * 1e6)}`;
    const delay = this.strategyConfig.executionDelayMs;

    this.pushEvent(tradeId, 'LATENCY_WAIT', {
      detectedPrice: signal.entryPrice,
      delayMs: delay,
    });

    // Simulate latency: wait, then re-quote
    await sleep(delay);
    const quote = await getDelayedQuote(signal.side);

    // Execution probability
    if (this.rng() > this.strategyConfig.executionProbability) {
      this.portfolio.release(stake);
      const trade = this.createTrade(tradeId, signal, reserve.bankrollBefore, stake, {
        status: 'NO_EXECUTION',
        closeReason: 'EXECUTION_PROBABILITY_FAIL',
        fillRatio: 0,
        executionDelayMs: delay,
      });
      this.pushEvent(tradeId, 'NO_EXECUTION', { reason: 'EXECUTION_PROBABILITY_FAIL' });
      return trade;
    }

    const slipped = applySlippage(quote.price, this.strategyConfig.maxSlippage, 'BUY');
    const priceMoveTooFar =
      Math.abs(slipped - signal.entryPrice) / signal.entryPrice > this.strategyConfig.maxSlippage * 2;

    // Re-validate favorite odds range after delay
    const odds = 1 / slipped;
    if (
      odds < this.strategyConfig.minOdds ||
      odds > this.strategyConfig.maxOdds ||
      priceMoveTooFar
    ) {
      this.portfolio.release(stake);
      const trade = this.createTrade(tradeId, signal, reserve.bankrollBefore, stake, {
        status: 'NO_EXECUTION',
        closeReason: 'PRICE_MOVED_AFTER_LATENCY',
        slippage: (slipped - signal.entryPrice) / signal.entryPrice,
        executionDelayMs: delay,
        entryPrice: slipped,
        entryOdds: odds,
      });
      this.pushEvent(tradeId, 'NO_EXECUTION', {
        reason: 'PRICE_MOVED_AFTER_LATENCY',
        detected: signal.entryPrice,
        available: slipped,
      });
      return trade;
    }

    const fill = simulateLiquidityFill(
      stake,
      quote.liquidity,
      this.strategyConfig.allowPartialFills,
    );

    if (fill.status === 'NO_FILL') {
      this.portfolio.release(stake);
      const trade = this.createTrade(tradeId, signal, reserve.bankrollBefore, stake, {
        status: 'NO_FILL',
        closeReason: 'INSUFFICIENT_LIQUIDITY',
        fillRatio: 0,
        executionDelayMs: delay,
      });
      this.pushEvent(tradeId, 'NO_FILL', { required: stake, available: quote.liquidity });
      return trade;
    }

    if (fill.status === 'PARTIAL_FILL') {
      this.portfolio.release(stake - fill.filledStake);
      this.pushEvent(tradeId, 'PARTIAL_FILL', {
        required: stake,
        filled: fill.filledStake,
        ratio: fill.fillRatio,
      });
    }

    const filledStake = fill.filledStake;
    const entryOdds = 1 / slipped;
    const potentialLoss = filledStake;
    const hedgeStakeEst = computeHedgeStake(
      filledStake,
      entryOdds,
      signal.targetOdds,
      this.strategyConfig.targetProfit,
    );

    const trade = this.createTrade(tradeId, signal, reserve.bankrollBefore, filledStake, {
      status: fill.status === 'PARTIAL_FILL' ? 'PARTIAL_FILL' : 'FIRST_LEG_OPENED',
      entryPrice: slipped,
      entryOdds,
      fillRatio: fill.fillRatio,
      slippage: (slipped - signal.entryPrice) / signal.entryPrice,
      executionDelayMs: delay,
      potentialLoss,
      potentialProfit: filledStake * this.strategyConfig.targetProfit,
      hedgeStake: hedgeStakeEst,
      maxPriceReached: slipped,
    });

    // After partial, still track as open first leg
    trade.status = 'FIRST_LEG_OPENED';
    this.openByMarket.set(signal.marketId, tradeId);
    this.pushEvent(tradeId, 'FIRST_LEG_OPENED', {
      price: slipped,
      stake: filledStake,
      targetPrice: signal.expectedPrice,
      market: market.question,
    });
    this.pushEvent(tradeId, 'SLIPPAGE_APPLIED', {
      detected: signal.entryPrice,
      executed: slipped,
    });

    logEvent('paper', 'First leg opened (SIMULATED)', {
      tradeId,
      stake: filledStake,
      dataKind: 'SIMULATED',
    });

    return trade;
  }

  private async tryHedge(trade: PaperTrade, observedPrice: number, timestamp: string): Promise<void> {
    this.pushEvent(trade.tradeId, 'TARGET_REACHED', {
      observedPrice,
      targetPrice: trade.targetPrice,
      timestamp,
    });
    trade.status = 'TARGET_REACHED';
    trade.timeToTargetMs = Date.parse(timestamp) - Date.parse(trade.timestamp);

    await sleep(this.strategyConfig.executionDelayMs);

    if (this.rng() > this.strategyConfig.executionProbability) {
      this.pushEvent(trade.tradeId, 'NO_EXECUTION', { leg: 'hedge' });
      trade.closeReason = 'HEDGE_EXECUTION_FAILED';
      // leave first leg open for settlement
      trade.status = 'FIRST_LEG_OPENED';
      return;
    }

    const slipped = applySlippage(observedPrice, this.strategyConfig.maxSlippage, 'BUY');
    if (slipped > trade.targetPrice * (1 + this.strategyConfig.maxSlippage)) {
      this.pushEvent(trade.tradeId, 'NO_EXECUTION', {
        reason: 'HEDGE_SLIPPAGE_EXCEEDED',
        slipped,
        target: trade.targetPrice,
      });
      trade.status = 'FIRST_LEG_OPENED';
      return;
    }

    const hedgeOdds = 1 / slipped;
    const hedgeStake = computeHedgeStake(
      trade.stake,
      trade.entryOdds,
      hedgeOdds,
      this.strategyConfig.targetProfit,
    );

    const reserve = this.portfolio.reserve(hedgeStake);
    if (!reserve.ok) {
      this.pushEvent(trade.tradeId, 'NO_EXECUTION', { reason: 'INSUFFICIENT_BANKROLL_FOR_HEDGE' });
      trade.status = 'FIRST_LEG_OPENED';
      return;
    }

    const fill = simulateLiquidityFill(
      hedgeStake,
      // use stake as proxy min liquidity already checked upstream; assume ok for paper
      hedgeStake * 2,
      this.strategyConfig.allowPartialFills,
    );

    if (fill.status === 'NO_FILL') {
      this.portfolio.release(hedgeStake);
      this.pushEvent(trade.tradeId, 'NO_FILL', { leg: 'hedge' });
      trade.status = 'FIRST_LEG_OPENED';
      return;
    }

    const actualHedge = fill.filledStake;
    if (fill.status === 'PARTIAL_FILL') {
      this.portfolio.release(hedgeStake - actualHedge);
      this.pushEvent(trade.tradeId, 'PARTIAL_FILL', { leg: 'hedge', filled: actualHedge });
    }

    const pnl = computeTradePnl({
      firstStake: trade.stake,
      firstOdds: trade.entryOdds,
      hedgeStake: actualHedge,
      hedgeOdds,
      commission: this.strategyConfig.commission,
      hedged: true,
    });

    trade.hedgeStake = actualHedge;
    trade.hedgePrice = slipped;
    trade.hedgeOdds = hedgeOdds;
    trade.grossProfit = pnl.grossProfit;
    trade.commission = pnl.commissionPaid;
    trade.netProfit = pnl.netProfit;
    trade.pnl = pnl.netProfit;
    trade.roi = pnl.roi;
    trade.totalVolume = pnl.totalVolume;
    trade.status = 'HEDGE_SIMULATED';
    trade.closeReason = 'HEDGE_COMPLETED';
    trade.dataKind = 'REALIZED';
    trade.bankrollAfter = this.portfolio.applyPnl(pnl.netProfit, trade.stake + actualHedge);
    this.openByMarket.delete(trade.marketId);

    this.pushEvent(trade.tradeId, 'HEDGE_SIMULATED', {
      hedgePrice: slipped,
      hedgeStake: actualHedge,
      netProfit: pnl.netProfit,
      dataKind: 'REALIZED',
    });

    logEvent('paper', 'Hedge simulated', {
      tradeId: trade.tradeId,
      netProfit: pnl.netProfit,
      dataKind: 'REALIZED',
    });
  }

  settleUnhedged(tradeId: string, firstLegWon: boolean, reason: string): PaperTrade | null {
    const trade = this.trades.get(tradeId);
    if (!trade) return null;
    if (trade.status === 'HEDGE_SIMULATED' || trade.status === 'SETTLED') return trade;

    const pnl = computeTradePnl({
      firstStake: trade.stake,
      firstOdds: trade.entryOdds,
      hedgeStake: 0,
      hedgeOdds: 1,
      commission: this.strategyConfig.commission,
      hedged: false,
      firstLegWon,
    });

    trade.grossProfit = pnl.grossProfit;
    trade.commission = pnl.commissionPaid;
    trade.netProfit = pnl.netProfit;
    trade.pnl = pnl.netProfit;
    trade.roi = pnl.roi;
    trade.totalVolume = pnl.totalVolume;
    trade.status = 'SETTLED';
    trade.closeReason = reason;
    trade.dataKind = 'REALIZED';
    trade.bankrollAfter = this.portfolio.applyPnl(pnl.netProfit, trade.stake);
    this.openByMarket.delete(trade.marketId);
    this.pushEvent(tradeId, 'SETTLED', { firstLegWon, reason, pnl: pnl.netProfit });
    return trade;
  }

  timeoutTrade(tradeId: string, reason = 'TIMEOUT'): void {
    const trade = this.trades.get(tradeId);
    if (!trade || trade.status === 'SETTLED' || trade.status === 'HEDGE_SIMULATED') return;
    // Keep capital reserved until settlement; mark timeout status for tracking
    trade.status = 'TIMEOUT';
    trade.closeReason = reason;
    this.pushEvent(tradeId, 'TIMEOUT', { reason });
  }

  getPriceSnapshotsAround(marketId: string, centerTs: string): Record<string, number | null> {
    const center = Date.parse(centerTs);
    const offsets = [-30, -10, -5, -1, 0, 1, 5, 10, 30];
    const hist = this.priceHistory.get(marketId) ?? [];
    const result: Record<string, number | null> = {};
    for (const sec of offsets) {
      const target = center + sec * 1000;
      let best: number | null = null;
      let bestDist = Infinity;
      for (const p of hist) {
        const d = Math.abs(p.t - target);
        if (d < bestDist) {
          bestDist = d;
          best = p.price;
        }
      }
      result[`${sec}s`] = bestDist < 2000 ? best : null;
    }
    return result;
  }

  private createTrade(
    tradeId: string,
    signal: StrategySignal,
    bankrollBefore: number,
    stake: number,
    overrides: Partial<PaperTrade>,
  ): PaperTrade {
    const trade: PaperTrade = {
      tradeId,
      strategyName: signal.strategyName,
      marketId: signal.marketId,
      eventId: signal.eventId,
      timestamp: signal.timestamp,
      bankrollBefore,
      stake,
      entryPrice: signal.entryPrice,
      entryOdds: signal.entryOdds,
      entrySide: signal.side,
      targetPrice: signal.expectedPrice,
      targetOdds: signal.targetOdds,
      hedgeStake: null,
      hedgePrice: null,
      hedgeOdds: null,
      potentialProfit: null,
      potentialLoss: stake,
      status: 'PENDING_EXECUTION',
      bankrollAfter: null,
      pnl: null,
      grossProfit: null,
      commission: null,
      netProfit: null,
      roi: null,
      totalVolume: null,
      slippage: null,
      executionDelayMs: null,
      fillRatio: 1,
      maxPriceReached: null,
      timeToTargetMs: null,
      closeReason: null,
      dataKind: 'SIMULATED',
      mode: signal.mode === 'BACKTEST' ? 'BACKTEST' : 'PAPER',
      ...overrides,
    };
    this.trades.set(tradeId, trade);
    return trade;
  }

  private pushEvent(
    tradeId: string,
    type: PaperTradeEvent['type'],
    payload: Record<string, unknown>,
  ): void {
    const ev: PaperTradeEvent = {
      tradeId,
      timestamp: new Date().toISOString(),
      type,
      payload,
      dataKind: (payload.dataKind as PaperTradeEvent['dataKind']) ?? 'SIMULATED',
    };
    const list = this.events.get(tradeId) ?? [];
    list.push(ev);
    this.events.set(tradeId, list);
  }
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
