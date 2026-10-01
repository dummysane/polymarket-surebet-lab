import type { MarketContext, StrategySignal } from '@paperlab/shared';
import type { Strategy } from './Strategy.js';
import { logEvent } from '../utils/logger.js';

/**
 * Single StrategyEngine used by LIVE paper trading AND historical backtest.
 * No separate logic paths.
 */
export class StrategyEngine {
  private strategies: Strategy[] = [];

  register(strategy: Strategy): void {
    this.strategies.push(strategy);
  }

  clear(): void {
    this.strategies = [];
  }

  list(): Strategy[] {
    return [...this.strategies];
  }

  evaluate(context: MarketContext): StrategySignal[] {
    const signals: StrategySignal[] = [];
    for (const strategy of this.strategies) {
      try {
        const signal = strategy.evaluate(context);
        if (signal) {
          signals.push(signal);
          logEvent('signals', 'Strategy signal', {
            strategy: strategy.name,
            marketId: signal.marketId,
            distanceToTarget: signal.distanceToTarget,
            mode: context.mode,
            dataKind: 'ESTIMATED',
          });
        }
      } catch (err) {
        logEvent('errors', 'Strategy evaluate failed', {
          strategy: strategy.name,
          error: String(err),
        });
      }
    }
    return signals;
  }
}
