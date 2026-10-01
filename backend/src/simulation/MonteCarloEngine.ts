import {
  createSeededRng,
  maxDrawdown,
  mean,
  median,
  percentile,
  type MonteCarloParams,
  type MonteCarloResult,
} from '@paperlab/shared';

/**
 * Monte Carlo bankroll simulator — SIMULATED data only.
 */
export class MonteCarloEngine {
  run(params: MonteCarloParams): MonteCarloResult {
    const rng = createSeededRng(params.seed);
    const finals: number[] = [];
    const rois: number[] = [];
    const pnls: number[] = [];
    const drawdowns: number[] = [];
    const allCurves: number[][] = [];

    for (let s = 0; s < params.simulations; s++) {
      let bankroll = params.initialBankroll;
      const curve: number[] = [bankroll];
      for (let m = 0; m < params.matches; m++) {
        const stake = bankroll * params.stakePercentage;
        if (stake <= 0 || bankroll <= 0) {
          curve.push(bankroll);
          continue;
        }

        // execution fail
        if (rng() > params.executionProbability) {
          curve.push(bankroll);
          continue;
        }

        const hit = rng() < params.pTargetReached;
        let pnl: number;
        if (hit) {
          // Locked ~targetProfit minus round-trip costs
          const gross = stake * params.targetProfit;
          const costs =
            stake * (2 * params.commission + params.slippage + params.houseMargin * 0.25);
          pnl = gross - costs;
        } else {
          // Miss: near-fair directional settle / exit drag (NOT full stake loss)
          pnl = -stake * (params.commission + params.houseMargin * 0.5 + params.slippage * 0.5);
        }
        bankroll += pnl;
        curve.push(bankroll);
      }
      allCurves.push(curve);
      finals.push(bankroll);
      pnls.push(bankroll - params.initialBankroll);
      rois.push((bankroll - params.initialBankroll) / params.initialBankroll);
      drawdowns.push(maxDrawdown(curve));
    }

    const sortedFinals = [...finals].sort((a, b) => a - b);
    const steps = params.matches + 1;
    const meanCurve: number[] = [];
    const medianCurve: number[] = [];
    const p5Curve: number[] = [];
    const p25Curve: number[] = [];
    const p75Curve: number[] = [];
    const p95Curve: number[] = [];

    for (let i = 0; i < steps; i++) {
      const col = allCurves.map((c) => c[i] ?? c[c.length - 1]!).sort((a, b) => a - b);
      meanCurve.push(mean(col));
      medianCurve.push(percentile(col, 0.5));
      p5Curve.push(percentile(col, 0.05));
      p25Curve.push(percentile(col, 0.25));
      p75Curve.push(percentile(col, 0.75));
      p95Curve.push(percentile(col, 0.95));
    }

    // 5 random trajectories
    const trajectories: number[][] = [];
    for (let i = 0; i < 5; i++) {
      const idx = Math.floor(rng() * allCurves.length);
      trajectories.push(allCurves[idx]!);
    }

    const yearsApprox = params.matches / 365;
    const medianFinal = percentile(sortedFinals, 0.5);
    const cagr =
      yearsApprox > 0
        ? Math.pow(medianFinal / params.initialBankroll, 1 / Math.max(yearsApprox, 0.01)) - 1
        : 0;

    return {
      params,
      finalBankroll: {
        p5: percentile(sortedFinals, 0.05),
        p25: percentile(sortedFinals, 0.25),
        p50: percentile(sortedFinals, 0.5),
        p75: percentile(sortedFinals, 0.75),
        p95: percentile(sortedFinals, 0.95),
        mean: mean(finals),
      },
      totalPnl: { mean: mean(pnls), median: median(pnls) },
      roi: { mean: mean(rois), median: median(rois) },
      maxDrawdown: { mean: mean(drawdowns), median: median(drawdowns) },
      probabilityBankrollBelow50:
        finals.filter((b) => b < params.initialBankroll * 0.5).length / finals.length,
      probabilityBankrollBelow25:
        finals.filter((b) => b < params.initialBankroll * 0.25).length / finals.length,
      probabilityOfLosingMoney:
        finals.filter((b) => b < params.initialBankroll).length / finals.length,
      cagrApprox: cagr,
      trajectories,
      meanCurve,
      medianCurve,
      p5Curve,
      p25Curve,
      p75Curve,
      p95Curve,
      dataKind: 'SIMULATED',
      mode: 'SIMULATION',
    };
  }
}
