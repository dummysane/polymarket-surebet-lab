import type { MarketContext, StrategySignal } from '@paperlab/shared';

export interface Strategy {
  name: string;
  evaluate(context: MarketContext): StrategySignal | null;
}
