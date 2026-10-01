import {
  DEFAULTS,
  STRATEGY_NAME,
  type Market,
  type MarketContext,
  type MonteCarloParams,
  type StrategyConfig,
  type StrategySignal,
  type TradeSide,
} from '@paperlab/shared';
import { config } from '../config/index.js';
import { MemoryStore } from '../database/MemoryStore.js';
import type { MarketDataProvider } from '../market-data/MarketDataProvider.js';
import { PolymarketGammaClobProvider } from '../market-data/PolymarketGammaClobProvider.js';
import { HistoricalCsvProvider } from '../market-data/HistoricalCsvProvider.js';
import { MockMarketDataProvider } from '../mocks/MockMarketDataProvider.js';
import { ClobMarketWebSocket } from '../websocket/ClobMarketWebSocket.js';
import {
  SportsLiveWebSocket,
  isLiveByStartTime,
} from '../websocket/SportsLiveWebSocket.js';
import { DataQualityGate } from '../quality/DataQualityGate.js';
import { StrategyEngine } from '../strategies/StrategyEngine.js';
import { LiveSurebetArbitrageStrategy } from '../strategies/FavoriteHedgeStrategy.js';
import { PortfolioManager } from '../portfolio/PortfolioManager.js';
import { PaperTradingEngine } from '../simulation/PaperTradingEngine.js';
import { SettlementEngine } from '../settlement/SettlementEngine.js';
import { StatisticsEngine } from '../statistics/StatisticsEngine.js';
import { MonteCarloEngine } from '../simulation/MonteCarloEngine.js';
import { SensitivityEngine } from '../simulation/SensitivityEngine.js';
import { AlertService } from '../alerts/AlertService.js';
import { ImpliedProbabilityModel } from '../prediction/PredictionModel.js';
import { logEvent, logger } from '../utils/logger.js';

export class LabService {
  readonly store = new MemoryStore();
  readonly quality = new DataQualityGate();
  readonly strategyEngine = new StrategyEngine();
  readonly portfolio: PortfolioManager;
  readonly paper: PaperTradingEngine;
  readonly settlement: SettlementEngine;
  readonly stats = new StatisticsEngine();
  readonly monteCarlo = new MonteCarloEngine();
  readonly sensitivity = new SensitivityEngine();
  readonly alerts = new AlertService();
  readonly prediction = new ImpliedProbabilityModel();
  readonly ws = new ClobMarketWebSocket();
  readonly sportsLive = new SportsLiveWebSocket();

  provider: MarketDataProvider;
  strategyConfig: StrategyConfig;
  autoTrade = true;
  targetNearThreshold = 0.05;
  drawdownAlertPct = 0.15;
  lastMcResult: ReturnType<MonteCarloEngine['run']> | null = null;
  opportunities: StrategySignal[] = [];
  private started = false;

  constructor() {
    this.strategyConfig = {
      name: STRATEGY_NAME,
      minOdds: config.minOdds,
      maxOdds: config.maxOdds,
      targetProfit: config.targetProfit,
      stakePercentage: config.stakePercentage,
      commission: config.commission,
      executionDelayMs: config.executionDelayMs,
      maxSlippage: config.maxSlippage,
      minLiquidity: config.minLiquidity,
      executionProbability: config.executionProbability,
      allowPartialFills: config.allowPartialFills,
      enabled: true,
    };
    this.portfolio = new PortfolioManager(config.initialBankroll, config.stakePercentage);
    this.paper = new PaperTradingEngine(this.portfolio, this.strategyConfig, config.seed);
    this.settlement = new SettlementEngine(this.paper, this.portfolio);
    this.strategyEngine.register(new LiveSurebetArbitrageStrategy(this.strategyConfig));

    this.provider =
      config.marketDataMode === 'mock'
        ? new MockMarketDataProvider()
        : new PolymarketGammaClobProvider();
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.provider.onUpdate((snapshot) => this.onSnapshot(snapshot));
    await this.provider.start?.();

    const markets = await this.provider.getMarkets();
    for (const m of markets) {
      this.markLiveStatus(m);
      this.store.upsertMarket(m);
      this.provider.subscribeToMarket(m.id);
      if (this.provider instanceof PolymarketGammaClobProvider) {
        this.ws.registerAsset(m.yes.tokenId, {
          marketId: m.id,
          eventId: m.eventId,
          question: m.question,
          outcome: 'YES',
        });
        this.ws.registerAsset(m.no.tokenId, {
          marketId: m.id,
          eventId: m.eventId,
          question: m.question,
          outcome: 'NO',
        });
      }
    }

    if (config.marketDataMode === 'live') {
      this.ws.onSnapshot((s) => this.onSnapshot(s));
      try {
        this.ws.connect();
      } catch (err) {
        logger.warn({ err }, 'WS connect failed — REST polling fallback active');
      }
      try {
        this.sportsLive.connect();
      } catch (err) {
        logger.warn({ err }, 'Sports live WS failed — using startTime heuristic');
      }
    }

    // Periodic strategy evaluation (live surebet scan)
    setInterval(() => {
      void this.evaluateAll().catch((err) => logger.error({ err }, 'evaluateAll failed'));
    }, 3_000);

    // Refresh live flags
    setInterval(() => {
      for (const m of this.store.markets.values()) {
        this.markLiveStatus(m);
      }
    }, 10_000);

    // Settlement poll
    setInterval(() => {
      void this.pollSettlements().catch((err) => logger.error({ err }, 'settlement poll failed'));
    }, 30_000);

    logEvent('lab', 'LabService started', {
      markets: markets.length,
      mode: config.marketDataMode,
      realExecution: false,
    });
  }

  private onSnapshot(snapshot: import('@paperlab/shared').MarketSnapshot): void {
    const market = this.store.markets.get(snapshot.marketId);
    const report = this.quality.evaluate(snapshot, market);
    this.store.addQuality(report);

    if (report.stale) {
      this.alerts.push('STALE_DATA', `Stale data for ${snapshot.marketId}`, 'warn', {
        issues: report.issues,
      });
      return;
    }

    this.store.addSnapshot(snapshot);
    this.paper.recordPrice(snapshot.marketId, snapshot.outcome, snapshot.price, snapshot.timestamp);
  }

  async evaluateAll(): Promise<StrategySignal[]> {
    const signals: StrategySignal[] = [];
    const markets = [...this.store.markets.values()].filter((m) => {
      if (!m.active || m.closed) return false;
      this.markLiveStatus(m);
      if (config.liveOnly && !m.isLive) return false;
      return true;
    });

    for (const market of markets) {
      const latest = this.store.getSnapshots(market.id, 2);
      const report = latest[0] ? this.quality.evaluate(latest[0], market) : null;
      if (report && !this.quality.allowsSignals(report)) continue;

      const context: MarketContext = {
        market,
        snapshots: this.store.getSnapshots(market.id, 50),
        now: new Date().toISOString(),
        mode: config.marketDataMode === 'live' ? 'LIVE' : 'PAPER',
      };

      const found = this.strategyEngine.evaluate(context);
      for (const signal of found) {
        signal.recommendedStake = this.portfolio.recommendedStake();
        this.store.addSignal(signal);
        signals.push(signal);

        if (signal.distanceToTarget < this.targetNearThreshold) {
          this.alerts.push(
            'TARGET_NEAR',
            `Target within ${(Math.abs(signal.distanceToTarget) * 100).toFixed(1)}% — ${market.question}`,
            'info',
            { marketId: market.id },
          );
        }

        this.alerts.push('OPPORTUNITY', `Paper signal: ${market.question}`, 'info', {
          marketId: market.id,
          distance: signal.distanceToTarget,
        });

        if (this.autoTrade && signal.distanceToTarget < 0.25) {
          await this.tryOpen(signal, market);
        }
      }
    }

    this.opportunities = [...signals, ...this.opportunities]
      .filter((s, i, arr) => arr.findIndex((x) => x.marketId === s.marketId) === i)
      .sort((a, b) => a.distanceToTarget - b.distanceToTarget)
      .slice(0, 100);

    this.checkDrawdown();
    return signals;
  }

  private async tryOpen(signal: StrategySignal, market: Market): Promise<void> {
    const trade = await this.paper.openFromSignal(signal, market, async (side: TradeSide) => {
      const quote = side === 'YES' ? market.yes : market.no;
      // Re-fetch from provider if possible
      if (this.provider instanceof PolymarketGammaClobProvider) {
        const book = await this.provider.fetchBook(quote.tokenId);
        return {
          price: book.mid ?? book.ask ?? quote.price,
          liquidity: book.liquidity ?? quote.liquidity ?? 0,
          timestamp: new Date().toISOString(),
        };
      }
      const m = await this.provider.getMarket(market.id);
      const q = side === 'YES' ? m?.yes ?? quote : m?.no ?? quote;
      return {
        price: q.price,
        liquidity: q.liquidity ?? 0,
        timestamp: new Date().toISOString(),
      };
    });

    if (trade && trade.status === 'FIRST_LEG_OPENED') {
      this.alerts.push('EXECUTION_SIMULATED', `First leg opened ${trade.tradeId}`, 'info', {
        tradeId: trade.tradeId,
      });
    }
  }

  private async pollSettlements(): Promise<void> {
    for (const market of this.store.markets.values()) {
      const fresh = await this.provider.getMarket(market.id);
      if (!fresh) continue;
      this.store.upsertMarket(fresh);
      if (fresh.closed || fresh.resolved) {
        const settled = this.settlement.settleMarket(fresh);
        for (const t of settled) {
          this.alerts.push('TRADE_CLOSED', `Settled ${t.tradeId} PnL=${t.pnl}`, 'info', {
            tradeId: t.tradeId,
          });
        }
      }
    }
  }

  private checkDrawdown(): void {
    const state = this.portfolio.getState();
    const dd =
      state.initialBankroll > 0
        ? Math.max(0, (state.initialBankroll - state.currentBankroll) / state.initialBankroll)
        : 0;
    if (dd >= this.drawdownAlertPct) {
      this.alerts.push(
        'DRAWDOWN_EXCEEDED',
        `Drawdown ${(dd * 100).toFixed(1)}% exceeds threshold`,
        'critical',
        { dd },
      );
    }

    const rolling = this.stats.rolling(this.paper.getTrades());
    if (rolling.strategyDegradation) {
      this.alerts.push('STRATEGY_DEGRADATION', rolling.note ?? 'Degradation detected', 'warn');
    }
  }

  updateSettings(partial: Partial<StrategyConfig> & { autoTrade?: boolean; initialBankroll?: number }): void {
    Object.assign(this.strategyConfig, partial);
    if (partial.stakePercentage !== undefined) {
      this.portfolio.setStakePercentage(partial.stakePercentage);
    }
    if (partial.autoTrade !== undefined) this.autoTrade = partial.autoTrade;
    this.strategyEngine.clear();
    this.strategyEngine.register(new LiveSurebetArbitrageStrategy(this.strategyConfig));
  }

  /** Mark market as LIVE using Sports WS (preferred) or startTime heuristic */
  markLiveStatus(market: Market): void {
    const fromWs =
      this.sportsLive.isLiveSlug(market.slug) ??
      this.sportsLive.isLiveSlug(market.competition) ??
      null;
    if (fromWs !== null) {
      market.isLive = fromWs;
      market.liveStatus = fromWs ? 'InProgress' : 'NotLive';
      return;
    }
    // Mock / backtest already set isLive
    if (market.liveStatus === 'InProgress' || market.liveStatus === 'BACKTEST' || market.liveStatus === 'TEST') {
      market.isLive = true;
      return;
    }
    const byTime = isLiveByStartTime(market.startTime);
    market.isLive = byTime;
    market.liveStatus = byTime ? 'InferredLive' : market.startTime ? 'PreMatch' : 'Unknown';
  }

  async runBacktest(csvPath: string): Promise<{ trades: number; stats: ReturnType<StatisticsEngine['compute']> }> {
    const pathMod = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = pathMod.resolve(pathMod.dirname(fileURLToPath(import.meta.url)), '../../..');
    const resolved = pathMod.isAbsolute(csvPath) ? csvPath : pathMod.join(root, csvPath);
    const hist = new HistoricalCsvProvider(resolved);
    await hist.load();
    this.portfolio.setMode('BACKTEST');
    this.portfolio.reset(config.initialBankroll);

    const backtestPaper = new PaperTradingEngine(this.portfolio, this.strategyConfig, config.seed);
    const engine = new StrategyEngine();
    engine.register(new LiveSurebetArbitrageStrategy(this.strategyConfig));

    hist.onUpdate((snapshot) => {
      backtestPaper.recordPrice(snapshot.marketId, snapshot.outcome, snapshot.price, snapshot.timestamp);
    });

    const markets = await hist.getMarkets();
    for (const market of markets) {
      const context: MarketContext = {
        market,
        snapshots: [],
        now: market.timestamp,
        mode: 'BACKTEST',
      };
      // Initial evaluate before replay
      void engine.evaluate(context);
    }

    await hist.replay(async (tick) => {
      const market = await hist.getMarket(tick.marketId);
      if (!market) return;
      const context: MarketContext = {
        market,
        snapshots: [],
        now: tick.timestamp,
        mode: 'BACKTEST',
      };
      const signals = engine.evaluate(context);
      for (const signal of signals) {
        signal.recommendedStake = this.portfolio.recommendedStake();
        if (signal.distanceToTarget < 0.2) {
          await backtestPaper.openFromSignal(signal, market, async (side) => {
            const q = side === 'YES' ? market.yes : market.no;
            return {
              price: q.price,
              liquidity: q.liquidity ?? 10_000,
              timestamp: tick.timestamp,
            };
          });
        }
      }
    });

    // Copy trades into main paper engine for UI visibility is complex; return stats directly
    const trades = backtestPaper.getTrades();
    // Merge into main paper for journal
    for (const t of trades) {
      (this.paper as unknown as { trades: Map<string, typeof t> }).trades.set(t.tradeId, t);
    }

    return { trades: trades.length, stats: this.stats.compute(trades) };
  }

  runMonteCarlo(params: Partial<MonteCarloParams>) {
    const full: MonteCarloParams = {
      matches: params.matches ?? 1000,
      simulations: params.simulations ?? 1000,
      initialBankroll: params.initialBankroll ?? config.initialBankroll,
      stakePercentage: params.stakePercentage ?? this.strategyConfig.stakePercentage,
      commission: params.commission ?? this.strategyConfig.commission,
      houseMargin: params.houseMargin ?? 0.03,
      slippage: params.slippage ?? this.strategyConfig.maxSlippage,
      executionDelayMs: params.executionDelayMs ?? this.strategyConfig.executionDelayMs,
      targetProfit: params.targetProfit ?? this.strategyConfig.targetProfit,
      pTargetReached: params.pTargetReached ?? 0.58,
      executionProbability: params.executionProbability ?? this.strategyConfig.executionProbability,
      seed: params.seed ?? config.seed,
    };
    this.lastMcResult = this.monteCarlo.run(full);
    return this.lastMcResult;
  }

  dashboard() {
    const trades = this.paper.getTrades();
    const stats = this.stats.compute(trades, STRATEGY_NAME);
    const portfolio = this.portfolio.getState();
    return {
      portfolio,
      stats,
      tradesCount: trades.length,
      openTrades: trades.filter((t) =>
        ['FIRST_LEG_OPENED', 'TARGET_REACHED', 'TIMEOUT'].includes(t.status),
      ).length,
      marketsCount: this.store.markets.size,
      opportunitiesCount: this.opportunities.length,
      mode: config.marketDataMode === 'live' ? 'LIVE' : 'PAPER',
      dataKinds: {
        markets: 'OBSERVED',
        trades: 'SIMULATED/REALIZED',
        stats: stats.dataKind,
      },
      realExecutionEnabled: false,
      verdict: stats.verdict,
      minimumTrades: config.minimumTrades,
    };
  }

  exportStrategyReport() {
    const trades = this.paper.getTrades();
    return {
      generatedAt: new Date().toISOString(),
      strategy: this.strategyConfig,
      dashboard: this.dashboard(),
      stats: this.stats.compute(trades),
      byCategory: this.stats.byCategory(trades),
      rolling: this.stats.rolling(trades),
      monteCarlo: this.lastMcResult,
      note: 'Statistical estimates only. Badges: OBSERVED / SIMULATED / ESTIMATED / REALIZED.',
      realExecutionEnabled: false,
    };
  }
}

export const lab = new LabService();
