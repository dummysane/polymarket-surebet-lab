import { describe, expect, it } from 'vitest';
import { computeTargetOdds, createSeededRng } from '@paperlab/shared';
import { LiveSurebetArbitrageStrategy } from '../src/strategies/FavoriteHedgeStrategy.js';
import { StrategyEngine } from '../src/strategies/StrategyEngine.js';
import { PortfolioManager } from '../src/portfolio/PortfolioManager.js';
import { PaperTradingEngine } from '../src/simulation/PaperTradingEngine.js';
import { MonteCarloEngine } from '../src/simulation/MonteCarloEngine.js';
import { DataQualityGate } from '../src/quality/DataQualityGate.js';
import { RealExecutionEngine } from '../src/execution/RealExecutionEngine.js';
import type { Market, MarketContext, StrategyConfig } from '@paperlab/shared';

const cfg: StrategyConfig = {
  name: 'LiveSurebetArb',
  minOdds: 1.6,
  maxOdds: 1.8,
  targetProfit: 0.05,
  stakePercentage: 0.02,
  commission: 0.005,
  executionDelayMs: 0,
  maxSlippage: 0.01,
  minLiquidity: 10,
  executionProbability: 1,
  allowPartialFills: true,
  enabled: true,
};

function makeMarket(yesPrice: number, isLive = true): Market {
  return {
    id: 'm1',
    eventId: 'e1',
    conditionId: null,
    slug: null,
    question: 'Team A vs Team B',
    sport: 'soccer',
    competition: 'Test',
    homeTeam: 'A',
    awayTeam: 'B',
    startTime: null,
    isLive,
    liveStatus: isLive ? 'TEST' : 'PreMatch',
    marketType: 'moneyline',
    active: true,
    closed: false,
    resolved: false,
    winningOutcome: null,
    umaResolutionStatus: null,
    yes: {
      outcome: 'YES',
      tokenId: 'y',
      price: yesPrice,
      bid: yesPrice - 0.01,
      ask: yesPrice + 0.01,
      spread: 0.02,
      volume: 1000,
      liquidity: 5000,
    },
    no: {
      outcome: 'NO',
      tokenId: 'n',
      price: 1 - yesPrice,
      bid: 1 - yesPrice - 0.01,
      ask: 1 - yesPrice + 0.01,
      spread: 0.02,
      volume: 1000,
      liquidity: 5000,
    },
    volume: 2000,
    liquidity: 10000,
    timestamp: new Date().toISOString(),
    dataKind: 'SIMULATED',
    mode: 'PAPER',
  };
}

describe('RealExecutionEngine', () => {
  it('is permanently disabled', () => {
    expect(RealExecutionEngine.ENABLED).toBe(false);
  });
});

describe('LiveSurebetArbitrageStrategy', () => {
  it('emits signal for live favorite in 1.60–1.80', () => {
    const strategy = new LiveSurebetArbitrageStrategy(cfg);
    const market = makeMarket(0.6); // odds ~1.667
    const ctx: MarketContext = {
      market,
      snapshots: [],
      now: new Date().toISOString(),
      mode: 'PAPER',
    };
    const signal = strategy.evaluate(ctx);
    expect(signal).not.toBeNull();
    expect(signal!.entryOdds).toBeCloseTo(1 / 0.6, 5);
    expect(signal!.targetOdds).toBeCloseTo(computeTargetOdds(1 / 0.6, 0.05), 5);
    expect(signal!.reason).toContain('LIVE');
    expect(signal!.arbPhase).toMatch(/F1_OPEN_FAVORITE|F3_COMPLETE_SUREBET/);
    expect(signal!.action).toBe('OPEN_FIRST_LEG');
  });

  it('F2 waits when first leg open and underdog not ready', () => {
    const strategy = new LiveSurebetArbitrageStrategy(cfg);
    const market = makeMarket(0.6);
    // underdog at 0.4 = odds 2.5; target for 1.667 fav ≈ 3.5, so not ready
    const signal = strategy.evaluate({
      market,
      snapshots: [],
      now: new Date().toISOString(),
      mode: 'PAPER',
      openFirstLeg: {
        entryOdds: 1 / 0.6,
        entrySide: 'YES',
        targetOdds: computeTargetOdds(1 / 0.6, 0.05),
        targetPrice: 1 / computeTargetOdds(1 / 0.6, 0.05),
        tradeId: 't1',
      },
    });
    expect(signal).not.toBeNull();
    expect(signal!.arbPhase).toBe('F2_WAIT_UNDERDOG');
    expect(signal!.action).toBe('MONITOR_UNDERDOG');
  });

  it('F3 completes when underdog reaches surebet', () => {
    const strategy = new LiveSurebetArbitrageStrategy(cfg);
    const market = makeMarket(0.6);
    // Force underdog (NO) to surebet-ready price: target odds ~3.5 → price ~0.286
    market.no.price = 0.28;
    market.yes.price = 0.72;
    const favOdds = 1.67;
    const signal = strategy.evaluate({
      market: { ...market, yes: { ...market.yes, price: 0.6 }, no: { ...market.no, price: 0.28 } },
      snapshots: [],
      now: new Date().toISOString(),
      mode: 'PAPER',
      openFirstLeg: {
        entryOdds: favOdds,
        entrySide: 'YES',
        targetOdds: computeTargetOdds(favOdds, 0.05),
        targetPrice: 1 / computeTargetOdds(favOdds, 0.05),
        tradeId: 't2',
      },
    });
    expect(signal).not.toBeNull();
    expect(signal!.arbPhase).toBe('F3_COMPLETE_SUREBET');
    expect(signal!.action).toBe('COMPLETE_SECOND_LEG');
  });

  it('rejects pre-match (not live)', () => {
    const strategy = new LiveSurebetArbitrageStrategy(cfg);
    expect(
      strategy.evaluate({
        market: makeMarket(0.6, false),
        snapshots: [],
        now: new Date().toISOString(),
        mode: 'PAPER',
      }),
    ).toBeNull();
  });

  it('rejects odds outside favorite band', () => {
    const strategy = new LiveSurebetArbitrageStrategy(cfg);
    expect(
      strategy.evaluate({
        market: makeMarket(0.9),
        snapshots: [],
        now: new Date().toISOString(),
        mode: 'PAPER',
      }),
    ).toBeNull();
  });
});

describe('StrategyEngine shared path', () => {
  it('registers and evaluates', () => {
    const engine = new StrategyEngine();
    engine.register(new LiveSurebetArbitrageStrategy(cfg));
    const signals = engine.evaluate({
      market: makeMarket(0.6),
      snapshots: [],
      now: new Date().toISOString(),
      mode: 'BACKTEST',
    });
    expect(signals.length).toBe(1);
    expect(signals[0]!.mode).toBe('BACKTEST');
  });
});

describe('PaperTradingEngine', () => {
  it('opens first leg with latency simulation disabled (0ms)', async () => {
    const portfolio = new PortfolioManager(2000, 0.02);
    const paper = new PaperTradingEngine(portfolio, cfg, 42);
    const market = makeMarket(0.6);
    const engine = new StrategyEngine();
    engine.register(new LiveSurebetArbitrageStrategy(cfg));
    const signal = engine.evaluate({
      market,
      snapshots: [],
      now: new Date().toISOString(),
      mode: 'PAPER',
    })[0]!;

    const trade = await paper.openFromSignal(signal, market, async () => ({
      price: 0.6,
      liquidity: 10_000,
      timestamp: new Date().toISOString(),
    }));

    expect(trade).not.toBeNull();
    expect(trade!.status).toBe('FIRST_LEG_OPENED');
    expect(trade!.dataKind).toBe('SIMULATED');
  });
});

describe('MonteCarlo deterministic seed', () => {
  it('same seed => same P50', () => {
    const mc = new MonteCarloEngine();
    const params = {
      matches: 100,
      simulations: 200,
      initialBankroll: 2000,
      stakePercentage: 0.02,
      commission: 0.005,
      houseMargin: 0.03,
      slippage: 0.01,
      executionDelayMs: 500,
      targetProfit: 0.05,
      pTargetReached: 0.58,
      executionProbability: 0.98,
      seed: 20261001,
    };
    const a = mc.run(params);
    const b = mc.run(params);
    expect(a.finalBankroll.p50).toBe(b.finalBankroll.p50);
  });
});

describe('DataQualityGate', () => {
  it('blocks stale data', () => {
    const gate = new DataQualityGate();
    const report = gate.evaluate({
      timestamp: new Date(Date.now() - 60_000).toISOString(),
      marketId: 'm1',
      eventId: 'e1',
      tokenId: 't',
      question: 'q',
      outcome: 'YES',
      price: 0.5,
      bid: 0.49,
      ask: 0.51,
      spread: 0.02,
      volume: 1,
      liquidity: 100,
      dataKind: 'OBSERVED',
    });
    expect(report.stale).toBe(true);
    expect(gate.allowsSignals(report)).toBe(false);
  });
});

describe('seeded rng stability', () => {
  it('matches across modules', () => {
    const a = createSeededRng(1);
    const b = createSeededRng(1);
    expect(a()).toBe(b());
  });
});
