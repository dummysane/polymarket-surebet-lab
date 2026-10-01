import { MonteCarloEngine } from './MonteCarloEngine.js';
import type { MonteCarloParams, MonteCarloResult } from '@paperlab/shared';

export interface SensitivityRow {
  parameter: string;
  value: string;
  finalBankroll: number;
  roi: number;
  drawdown: number;
  ruinProbability: number;
  dataKind: 'SIMULATED';
}

export interface SensitivityHeatmap {
  rows: string[];
  cols: string[];
  values: number[][]; // ROI
  dataKind: 'SIMULATED';
}

const ERROR_SCENARIOS = [
  { id: 'A', label: 'Perfect execution', executionDelayMs: 0, slippage: 0, executionProbability: 1 },
  { id: 'B', label: '250ms delay', executionDelayMs: 250, slippage: 0.005, executionProbability: 0.98 },
  { id: 'C', label: '500ms delay', executionDelayMs: 500, slippage: 0.005, executionProbability: 0.98 },
  { id: 'D', label: '1s delay', executionDelayMs: 1000, slippage: 0.005, executionProbability: 0.98 },
  { id: 'E', label: '2s delay', executionDelayMs: 2000, slippage: 0.005, executionProbability: 0.98 },
  { id: 'F', label: '1% slippage', executionDelayMs: 500, slippage: 0.01, executionProbability: 0.98 },
  { id: 'G', label: '2% slippage', executionDelayMs: 500, slippage: 0.02, executionProbability: 0.98 },
  { id: 'H', label: '5% failed execution', executionDelayMs: 500, slippage: 0.01, executionProbability: 0.95 },
  { id: 'I', label: '10% failed execution', executionDelayMs: 500, slippage: 0.01, executionProbability: 0.9 },
] as const;

export class SensitivityEngine {
  private mc = new MonteCarloEngine();

  runGrid(base: MonteCarloParams): {
    rows: SensitivityRow[];
    stakeVsP: SensitivityHeatmap;
    marginVsP: SensitivityHeatmap;
    errorScenarios: Array<SensitivityRow & { id: string; label: string }>;
  } {
    const rows: SensitivityRow[] = [];

    for (const stake of [0.01, 0.02, 0.05]) {
      rows.push(this.row(base, 'stake', `${stake * 100}%`, { ...base, stakePercentage: stake }));
    }
    for (const margin of [0.02, 0.03, 0.05]) {
      rows.push(this.row(base, 'margin', `${margin * 100}%`, { ...base, houseMargin: margin }));
    }
    for (const commission of [0, 0.005, 0.01]) {
      rows.push(
        this.row(base, 'commission', `${commission * 100}%`, { ...base, commission }),
      );
    }
    for (const slippage of [0, 0.0025, 0.005, 0.01]) {
      rows.push(this.row(base, 'slippage', `${slippage * 100}%`, { ...base, slippage }));
    }

    const stakeLevels = [0.01, 0.02, 0.05];
    const pLevels = [0.4, 0.5, 0.55, 0.6, 0.65, 0.7];
    const stakeVsP: SensitivityHeatmap = {
      rows: stakeLevels.map((s) => `${s * 100}%`),
      cols: pLevels.map((p) => `${(p * 100).toFixed(0)}%`),
      values: stakeLevels.map((stake) =>
        pLevels.map((p) => {
          const r = this.mc.run({ ...base, stakePercentage: stake, pTargetReached: p, simulations: Math.min(base.simulations, 500) });
          return r.roi.median;
        }),
      ),
      dataKind: 'SIMULATED',
    };

    const margins = [0.02, 0.03, 0.05];
    const marginVsP: SensitivityHeatmap = {
      rows: margins.map((m) => `${m * 100}%`),
      cols: pLevels.map((p) => `${(p * 100).toFixed(0)}%`),
      values: margins.map((houseMargin) =>
        pLevels.map((p) => {
          const r = this.mc.run({
            ...base,
            houseMargin,
            pTargetReached: p,
            simulations: Math.min(base.simulations, 500),
          });
          return r.roi.median;
        }),
      ),
      dataKind: 'SIMULATED',
    };

    const errorScenarios = ERROR_SCENARIOS.map((sc) => {
      const result = this.mc.run({
        ...base,
        executionDelayMs: sc.executionDelayMs,
        slippage: sc.slippage,
        executionProbability: sc.executionProbability,
        simulations: Math.min(base.simulations, 500),
      });
      return {
        id: sc.id,
        label: sc.label,
        parameter: 'scenario',
        value: sc.label,
        finalBankroll: result.finalBankroll.p50,
        roi: result.roi.median,
        drawdown: result.maxDrawdown.median,
        ruinProbability: result.probabilityBankrollBelow25,
        dataKind: 'SIMULATED' as const,
      };
    });

    return { rows, stakeVsP, marginVsP, errorScenarios };
  }

  private row(
    _base: MonteCarloParams,
    parameter: string,
    value: string,
    params: MonteCarloParams,
  ): SensitivityRow {
    const result: MonteCarloResult = this.mc.run({
      ...params,
      simulations: Math.min(params.simulations, 500),
    });
    return {
      parameter,
      value,
      finalBankroll: result.finalBankroll.p50,
      roi: result.roi.median,
      drawdown: result.maxDrawdown.median,
      ruinProbability: result.probabilityOfLosingMoney,
      dataKind: 'SIMULATED',
    };
  }
}
