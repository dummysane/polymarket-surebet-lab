import {
  breakEvenP,
  maxDrawdown,
  mean,
  median,
  oddsBucket,
  percentile,
  profitFactor,
  sharpeRatio,
  sortinoRatio,
  stdDev,
  wilsonConfidenceInterval,
  type PaperTrade,
  type StrategyStats,
  type StrategyVerdict,
} from '@paperlab/shared';
import { config } from '../config/index.js';

export class StatisticsEngine {
  compute(trades: PaperTrade[], strategyName?: string): StrategyStats {
    const filtered = strategyName
      ? trades.filter((t) => t.strategyName === strategyName)
      : trades;

    const realized = filtered.filter(
      (t) => t.dataKind === 'REALIZED' && t.pnl !== null &&
        (t.status === 'SETTLED' || t.status === 'HEDGE_SIMULATED'),
    );
    const unrealized = filtered.filter(
      (t) =>
        t.status === 'FIRST_LEG_OPENED' ||
        t.status === 'TARGET_REACHED' ||
        t.status === 'TIMEOUT',
    );

    const pnls = realized.map((t) => t.pnl!);
    const wins = pnls.filter((p) => p > 0);
    const losses = pnls.filter((p) => p <= 0);
    const sorted = [...pnls].sort((a, b) => a - b);

    const equity: number[] = [];
    let bankroll = config.initialBankroll;
    for (const t of [...realized].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
      bankroll += t.pnl!;
      equity.push(bankroll);
    }

    const returns = pnls.map((p, i) => {
      const stake = realized[i]!.stake || 1;
      return p / stake;
    });

    const validOpps = filtered.filter((t) =>
      ['FIRST_LEG_OPENED', 'TARGET_REACHED', 'HEDGE_SIMULATED', 'SETTLED', 'TIMEOUT'].includes(
        t.status,
      ),
    );
    const hits = filtered.filter(
      (t) => t.status === 'HEDGE_SIMULATED' || t.status === 'TARGET_REACHED' ||
        (t.timeToTargetMs !== null && t.timeToTargetMs !== undefined),
    );
    // Count target reached more precisely
    const targetReached = filtered.filter(
      (t) =>
        t.status === 'HEDGE_SIMULATED' ||
        t.status === 'TARGET_REACHED' ||
        (t.timeToTargetMs != null && t.timeToTargetMs >= 0),
    ).length;
    const nOpps = Math.max(validOpps.length, 1);
    const observedP = validOpps.length ? targetReached / validOpps.length : 0;
    const targetCi = wilsonConfidenceInterval(targetReached, validOpps.length || 1);
    const be = breakEvenP({
      targetProfit: config.targetProfit,
      commission: config.commission,
    });

    const avgPnl = mean(pnls);
    const dd = maxDrawdown(equity.length ? equity : [config.initialBankroll]);
    const totalPnl = pnls.reduce((a, b) => a + b, 0);
    const roi = config.initialBankroll > 0 ? totalPnl / config.initialBankroll : 0;
    const calmar = dd > 0 ? roi / dd : 0;

    const ci95 = wilsonLikeMeanCI(pnls);

    const verdict = this.verdict({
      trades: realized.length,
      avgPnl,
      ciLower: ci95.lower,
      observedP,
      breakEvenP: be,
    });

    return {
      strategyName: strategyName ?? 'ALL',
      trades: realized.length,
      wins: wins.length,
      losses: losses.length,
      winRate: realized.length ? wins.length / realized.length : 0,
      averagePnl: avgPnl,
      medianPnl: median(pnls),
      stdPnl: stdDev(pnls),
      profitFactor: profitFactor(pnls),
      roi,
      maxDrawdown: dd,
      sharpeRatio: sharpeRatio(returns),
      sortinoRatio: sortinoRatio(returns),
      calmarRatio: calmar,
      expectancy: avgPnl,
      ci95,
      percentiles: {
        p5: percentile(sorted, 0.05),
        p25: percentile(sorted, 0.25),
        p50: percentile(sorted, 0.5),
        p75: percentile(sorted, 0.75),
        p95: percentile(sorted, 0.95),
      },
      targetHitRate: observedP,
      targetHitCi95: targetCi,
      breakEvenP: be,
      observedP,
      estimatedEdgePp: (observedP - be) * 100,
      realized: {
        trades: realized.length,
        pnl: totalPnl,
        roi,
      },
      unrealized: {
        trades: unrealized.length,
        pnl: 0,
        roi: 0,
      },
      verdict,
      dataKind: realized.length ? 'REALIZED' : 'ESTIMATED',
    };
  }

  byCategory(trades: PaperTrade[]): Record<string, Record<string, StrategyStats>> {
    const realized = trades.filter((t) => t.pnl !== null);
    const groups: Record<string, Record<string, PaperTrade[]>> = {
      oddsBucket: {},
      status: {},
      side: {},
    };

    for (const t of realized) {
      const bucket = oddsBucket(t.entryOdds);
      (groups.oddsBucket[bucket] ??= []).push(t);
      (groups.status[t.status] ??= []).push(t);
      (groups.side[t.entrySide] ??= []).push(t);
    }

    const out: Record<string, Record<string, StrategyStats>> = {};
    for (const [dim, map] of Object.entries(groups)) {
      out[dim] = {};
      for (const [key, list] of Object.entries(map)) {
        out[dim][key] = this.compute(list);
      }
    }
    return out;
  }

  rolling(trades: PaperTrade[], windows = [50, 100, 250, 500]) {
    const realized = trades
      .filter((t) => t.pnl !== null)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const full = this.compute(realized);
    const recent: Record<string, StrategyStats> = {};
    for (const w of windows) {
      recent[`last_${w}`] = this.compute(realized.slice(-w));
    }

    const degradation =
      recent.last_50 &&
      full.observedP - recent.last_50.observedP > 0.1 &&
      recent.last_50.roi < full.roi;

    return {
      historical: full,
      recent,
      strategyDegradation: Boolean(degradation),
      note: degradation
        ? 'STRATEGY DEGRADATION — recent p and ROI deteriorated vs historical (estimate)'
        : null,
    };
  }

  private verdict(input: {
    trades: number;
    avgPnl: number;
    ciLower: number;
    observedP: number;
    breakEvenP: number;
  }): StrategyVerdict {
    if (input.trades < config.minimumTrades) return 'INSUFFICIENT_SAMPLE';
    if (input.ciLower > 0 && input.observedP > input.breakEvenP) {
      return 'STATISTICALLY_SIGNIFICANT';
    }
    if (input.avgPnl > 0 && input.observedP > input.breakEvenP) return 'PROMISING';
    if (input.avgPnl < 0 || input.observedP < input.breakEvenP) return 'NEGATIVE_EXPECTANCY';
    return 'INSUFFICIENT_SAMPLE';
  }
}

function wilsonLikeMeanCI(values: number[]): { lower: number; upper: number; level: number } {
  if (values.length < 2) return { lower: 0, upper: 0, level: 0.95 };
  const m = mean(values);
  const s = stdDev(values);
  const se = s / Math.sqrt(values.length);
  const z = 1.96;
  return { lower: m - z * se, upper: m + z * se, level: 0.95 };
}
