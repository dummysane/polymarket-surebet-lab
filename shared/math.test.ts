import { describe, expect, it } from 'vitest';
import {
  applyCommission,
  applySlippage,
  breakEvenP,
  computeHedgeStake,
  computeTargetOdds,
  computeTradePnl,
  createSeededRng,
  maxDrawdown,
  oddsToPrice,
  priceToOdds,
  simulateLiquidityFill,
  wilsonConfidenceInterval,
} from './src/math/index.js';

describe('odds conversion', () => {
  it('converts price to odds', () => {
    expect(priceToOdds(0.5)).toBeCloseTo(2, 10);
    expect(priceToOdds(2 / 3)).toBeCloseTo(1.5, 10);
  });

  it('converts odds to price', () => {
    expect(oddsToPrice(2)).toBeCloseTo(0.5, 10);
  });
});

describe('target odds (FavoriteHedge 5%)', () => {
  it('favoriteOdds=1.50 => targetOdds ≈ 3.50', () => {
    const target = computeTargetOdds(1.5, 0.05);
    expect(target).toBeCloseTo(3.5, 5);
  });

  it('target price is inverse of target odds', () => {
    const odds = computeTargetOdds(1.5, 0.05);
    expect(oddsToPrice(odds)).toBeCloseTo(1 / 3.5, 5);
  });
});

describe('hedge stake', () => {
  it('equalizes payouts', () => {
    const hedge = computeHedgeStake(100, 1.5, 3.5);
    expect(hedge).toBeCloseTo((100 * 1.5) / 3.5, 8);
  });
});

describe('PnL and commission', () => {
  it('applies commission', () => {
    expect(applyCommission(100, 0.005)).toBeCloseTo(99.5, 8);
  });

  it('computes hedged profit', () => {
    const firstStake = 100;
    const favoriteOdds = 1.5;
    const hedgeOdds = 3.5;
    const hedgeStake = computeHedgeStake(firstStake, favoriteOdds, hedgeOdds);
    const result = computeTradePnl({
      firstStake,
      firstOdds: favoriteOdds,
      hedgeStake,
      hedgeOdds,
      commission: 0.005,
      hedged: true,
    });
    expect(result.grossProfit).toBeCloseTo(firstStake * favoriteOdds - firstStake - hedgeStake, 6);
    expect(result.commissionPaid).toBeCloseTo((firstStake + hedgeStake) * 0.005, 6);
  });
});

describe('slippage and liquidity', () => {
  it('applies buy slippage upward', () => {
    expect(applySlippage(0.4, 0.01, 'BUY')).toBeCloseTo(0.404, 8);
  });

  it('full fill when liquidity sufficient', () => {
    expect(simulateLiquidityFill(100, 200, true).status).toBe('FULL');
  });

  it('partial fill when allowed', () => {
    const r = simulateLiquidityFill(100, 40, true);
    expect(r.status).toBe('PARTIAL_FILL');
    expect(r.filledStake).toBe(40);
  });

  it('no fill when partial not allowed', () => {
    expect(simulateLiquidityFill(100, 40, false).status).toBe('NO_FILL');
  });
});

describe('drawdown and CI', () => {
  it('computes max drawdown', () => {
    expect(maxDrawdown([100, 120, 90, 95])).toBeCloseTo((120 - 90) / 120, 8);
  });

  it('wilson CI is within [0,1]', () => {
    const ci = wilsonConfidenceInterval(58, 100);
    expect(ci.lower).toBeGreaterThan(0);
    expect(ci.upper).toBeLessThan(1);
    expect(ci.lower).toBeLessThan(0.58);
    expect(ci.upper).toBeGreaterThan(0.58);
  });
});

describe('break-even p', () => {
  it('is ~28.6% for 5% target and 0.5% commission', () => {
    const p = breakEvenP({ targetProfit: 0.05, commission: 0.005 });
    expect(p).toBeCloseTo(0.286, 2);
  });
});

describe('seeded rng', () => {
  it('is deterministic', () => {
    const a = createSeededRng(20261001);
    const b = createSeededRng(20261001);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('surebet readiness', () => {
  it('favorite 1.70 with target dog locks ~5%', async () => {
    const { computeTargetOdds, isSurebetReady, surebetProfitPct } = await import('./src/math/index.js');
    const dog = computeTargetOdds(1.7, 0.05);
    expect(isSurebetReady(1.7, dog, 0.05)).toBe(true);
    expect(surebetProfitPct(1.7, dog)!).toBeGreaterThanOrEqual(0.049);
  });

  it('rejects incomplete arb', async () => {
    const { isSurebetReady } = await import('./src/math/index.js');
    expect(isSurebetReady(1.7, 2.0, 0.05)).toBe(false);
  });
});
