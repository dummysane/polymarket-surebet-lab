export interface AppDefaults {
  initialBankroll: number;
  stakePercentage: number;
  commission: number;
  targetProfit: number;
  minOdds: number;
  maxOdds: number;
  executionDelayMs: number;
  maxSlippage: number;
  executionProbability: number;
  allowPartialFills: boolean;
  staleDataMs: number;
  minLiquidity: number;
  minimumTrades: number;
  confidenceLevel: number;
  seed: number;
}

export const DEFAULTS: AppDefaults = {
  initialBankroll: 2000,
  stakePercentage: 0.02,
  commission: 0.005,
  targetProfit: 0.05,
  /** Favorite odds band for opening first surebet leg */
  minOdds: 1.6,
  maxOdds: 1.8,
  executionDelayMs: 500,
  maxSlippage: 0.01,
  executionProbability: 0.98,
  allowPartialFills: true,
  staleDataMs: 15_000,
  minLiquidity: 10,
  minimumTrades: 500,
  confidenceLevel: 0.95,
  seed: 20261001,
};

export const STAKE_OPTIONS = [0.005, 0.01, 0.02, 0.03, 0.05] as const;

/** Live in-play surebet / arbitrage paper strategy */
export const STRATEGY_NAME = 'LiveSurebetArb';
