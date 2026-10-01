import type { Market, PredictionOutput } from '@paperlab/shared';

export interface PredictionModel {
  name: string;
  predict(market: Market, side: 'YES' | 'NO'): PredictionOutput;
}

/**
 * Initial model: market implied probability only.
 * Prepared for future Elo / form / injuries / rankings extensions.
 */
export class ImpliedProbabilityModel implements PredictionModel {
  readonly name = 'ImpliedProbabilityModel';

  predict(market: Market, side: 'YES' | 'NO'): PredictionOutput {
    const price = side === 'YES' ? market.yes.price : market.no.price;
    return {
      estimatedProbability: price,
      confidence: 0.5,
      fairPrice: price,
      dataKind: 'ESTIMATED',
      source: this.name,
    };
  }
}

/** Placeholder for future models — not implemented without sufficient data */
export class TodoHistoricalModel implements PredictionModel {
  readonly name = 'TODO_HistoricalModel';

  predict(market: Market, side: 'YES' | 'NO'): PredictionOutput {
    // TODO: historical / Elo / injuries / rankings — requires external data feeds
    return new ImpliedProbabilityModel().predict(market, side);
  }
}
