/**
 * Pure math helpers for odds, hedge sizing, PnL, and statistics.
 * All functions are deterministic and side-effect free.
 */

export function priceToOdds(price: number): number {
  if (price <= 0 || price >= 1) {
    throw new Error(`Invalid price for odds conversion: ${price}`);
  }
  return 1 / price;
}

export function oddsToPrice(odds: number): number {
  if (odds <= 1) {
    throw new Error(`Invalid odds: ${odds}`);
  }
  return 1 / odds;
}

/**
 * Target odds on the opposite side to lock ~targetProfit gross when hedging.
 * targetOdds = 1 / (1/(1+targetProfit) - 1/favoriteOdds)
 */
export function computeTargetOdds(favoriteOdds: number, targetProfit = 0.05): number {
  if (favoriteOdds <= 1) {
    throw new Error(`Invalid favoriteOdds: ${favoriteOdds}`);
  }
  const invTarget = 1 / (1 + targetProfit);
  const invFav = 1 / favoriteOdds;
  const denom = invTarget - invFav;
  if (denom <= 0) {
    throw new Error(
      `Cannot compute target odds: favoriteOdds=${favoriteOdds} too low for targetProfit=${targetProfit}`,
    );
  }
  return 1 / denom;
}

export function computeTargetPrice(favoriteOdds: number, targetProfit = 0.05): number {
  return oddsToPrice(computeTargetOdds(favoriteOdds, targetProfit));
}

/**
 * Hedge stake so that win on either side ≈ targetProfit * firstStake (gross, pre-commission).
 * firstStake * favoriteOdds ≈ hedgeStake * hedgeOdds ≈ totalStakes * (1 + targetProfit) when balanced.
 * For binary YES/NO on Polymarket, payout is stake/price = stake * odds.
 * We size hedge so: firstStake * favoriteOdds - firstStake - hedgeStake ≈ targetProfit * firstStake
 * and symmetrically when hedge wins.
 */
export function computeHedgeStake(
  firstStake: number,
  favoriteOdds: number,
  hedgeOdds: number,
  targetProfit = 0.05,
): number {
  if (firstStake <= 0 || favoriteOdds <= 1 || hedgeOdds <= 1) {
    throw new Error('Invalid inputs for hedge stake');
  }
  // Balanced hedge: equalize payouts
  // firstStake * favoriteOdds = hedgeStake * hedgeOdds
  // And we want net ≈ targetProfit * firstStake when both sides are taken:
  // payout - firstStake - hedgeStake = targetProfit * firstStake
  // Using equal payouts: payout = firstStake * favoriteOdds
  // firstStake * favoriteOdds - firstStake - hedgeStake = targetProfit * firstStake
  // hedgeStake = firstStake * favoriteOdds - firstStake - targetProfit * firstStake
  //            = firstStake * (favoriteOdds - 1 - targetProfit)
  // But for equal payouts hedgeStake = firstStake * favoriteOdds / hedgeOdds
  // Prefer equal-payout sizing (standard arb hedge):
  return (firstStake * favoriteOdds) / hedgeOdds;
}

export function applyCommission(amount: number, commissionRate: number): number {
  return amount * (1 - commissionRate);
}

export function computeCommission(amount: number, commissionRate: number): number {
  return amount * commissionRate;
}

export function applySlippage(price: number, slippage: number, side: 'BUY' | 'SELL'): number {
  if (side === 'BUY') {
    return Math.min(0.99, price * (1 + slippage));
  }
  return Math.max(0.01, price * (1 - slippage));
}

export function distanceToTarget(currentPrice: number, targetPrice: number): number {
  if (targetPrice <= 0) return Infinity;
  return (currentPrice - targetPrice) / targetPrice;
}

export interface FillResult {
  filledStake: number;
  fillRatio: number;
  status: 'FULL' | 'PARTIAL_FILL' | 'NO_FILL';
}

export function simulateLiquidityFill(
  requiredStake: number,
  availableLiquidity: number,
  allowPartialFills: boolean,
): FillResult {
  if (availableLiquidity <= 0) {
    return { filledStake: 0, fillRatio: 0, status: 'NO_FILL' };
  }
  if (availableLiquidity >= requiredStake) {
    return { filledStake: requiredStake, fillRatio: 1, status: 'FULL' };
  }
  if (!allowPartialFills) {
    return { filledStake: 0, fillRatio: 0, status: 'NO_FILL' };
  }
  const filledStake = availableLiquidity;
  return {
    filledStake,
    fillRatio: filledStake / requiredStake,
    status: 'PARTIAL_FILL',
  };
}

export function computeTradePnl(params: {
  firstStake: number;
  firstOdds: number;
  hedgeStake: number;
  hedgeOdds: number;
  commission: number;
  hedged: boolean;
  firstLegWon?: boolean;
}): {
  grossProfit: number;
  commissionPaid: number;
  netProfit: number;
  roi: number;
  totalVolume: number;
} {
  const { firstStake, firstOdds, hedgeStake, hedgeOdds, commission, hedged, firstLegWon } = params;
  const totalVolume = firstStake + (hedged ? hedgeStake : 0);

  let grossProfit: number;
  if (hedged) {
    // Equalized payout approx: receive firstStake * firstOdds (or hedge equivalent), pay both stakes
    const payout = firstStake * firstOdds;
    grossProfit = payout - firstStake - hedgeStake;
  } else if (firstLegWon === true) {
    grossProfit = firstStake * firstOdds - firstStake;
  } else if (firstLegWon === false) {
    grossProfit = -firstStake;
  } else {
    grossProfit = 0;
  }

  const commissionPaid = computeCommission(totalVolume, commission);
  const netProfit = grossProfit - commissionPaid;
  const roi = firstStake > 0 ? netProfit / firstStake : 0;

  return { grossProfit, commissionPaid, netProfit, roi, totalVolume };
}

export function stakeFromBankroll(bankroll: number, stakePercentage: number): number {
  return Math.max(0, bankroll * stakePercentage);
}

export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (p <= 0) return sortedAsc[0]!;
  if (p >= 1) return sortedAsc[sortedAsc.length - 1]!;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo]!;
  const w = idx - lo;
  return sortedAsc[lo]! * (1 - w) + sortedAsc[hi]! * w;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const v = values.reduce((acc, x) => acc + (x - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return percentile(s, 0.5);
}

export function maxDrawdown(equityCurve: number[]): number {
  if (equityCurve.length === 0) return 0;
  let peak = equityCurve[0]!;
  let maxDd = 0;
  for (const v of equityCurve) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (peak - v) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

export function profitFactor(pnls: number[]): number {
  const gains = pnls.filter((x) => x > 0).reduce((a, b) => a + b, 0);
  const losses = Math.abs(pnls.filter((x) => x < 0).reduce((a, b) => a + b, 0));
  if (losses === 0) return gains > 0 ? Infinity : 0;
  return gains / losses;
}

export function sharpeRatio(returns: number[], riskFree = 0): number {
  if (returns.length < 2) return 0;
  const excess = returns.map((r) => r - riskFree);
  const s = stdDev(excess);
  if (s === 0) return 0;
  return mean(excess) / s;
}

export function sortinoRatio(returns: number[], riskFree = 0): number {
  if (returns.length < 2) return 0;
  const excess = returns.map((r) => r - riskFree);
  const downside = excess.filter((r) => r < 0);
  if (downside.length === 0) return mean(excess) > 0 ? Infinity : 0;
  const downsideDev = Math.sqrt(downside.reduce((a, r) => a + r ** 2, 0) / downside.length);
  if (downsideDev === 0) return 0;
  return mean(excess) / downsideDev;
}

/**
 * Wilson score interval for a binomial proportion.
 */
export function wilsonConfidenceInterval(
  successes: number,
  n: number,
  z = 1.96,
): { lower: number; upper: number; level: number } {
  if (n <= 0) return { lower: 0, upper: 0, level: 0.95 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return {
    lower: Math.max(0, (center - margin) / denom),
    upper: Math.min(1, (center + margin) / denom),
    level: 0.95,
  };
}

/**
 * Approximate break-even hit rate for the favorite+hedge strategy.
 *
 * Model (documented estimate):
 * - On target hit: lock ~targetProfit gross, pay round-trip costs.
 * - On miss: assume near-fair exit / settlement drag ≈ missCost (not -100% stake).
 * breakEvenP = costs / (targetProfit + costs)
 *
 * Example: commission 0.5% × 2 + missCost 1% → costs 2% → BE ≈ 28.6% for 5% target.
 */
export function breakEvenP(params: {
  targetProfit: number;
  commission: number;
  averageLossFraction?: number;
}): number {
  const roundTrip = 2 * params.commission;
  const missCost = params.averageLossFraction ?? 0.01;
  const costs = roundTrip + missCost;
  if (params.targetProfit + costs <= 0) return 1;
  return Math.max(0, Math.min(1, costs / (params.targetProfit + costs)));
}

export function oddsBucket(odds: number): string {
  const buckets = [
    [1.3, 1.4],
    [1.4, 1.5],
    [1.5, 1.6],
    [1.6, 1.7],
    [1.7, 1.8],
    [1.8, 1.9],
  ] as const;
  for (const [lo, hi] of buckets) {
    if (odds >= lo && odds < hi) return `${lo.toFixed(2)}–${hi.toFixed(2)}`;
  }
  if (odds < 1.3) return '<1.30';
  return '≥1.90';
}

/** Mulberry32 seeded PRNG for deterministic simulations */
export function createSeededRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
