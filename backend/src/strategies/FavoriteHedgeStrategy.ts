import {
  STRATEGY_NAME,
  computeTargetOdds,
  computeTargetPrice,
  distanceToTarget,
  priceToOdds,
  type MarketContext,
  type StrategyConfig,
  type StrategySignal,
} from '@paperlab/shared';
import type { Strategy } from './Strategy.js';

/**
 * LiveSurebetArbitrage — paper-only surebet strategy.
 *
 * Flow (SIMULATED, never real orders):
 * 1. Only LIVE in-play markets
 * 2. Open first leg on the FAVORITE when odds ∈ [minOdds, maxOdds] (default 1.60–1.80)
 * 3. Compute underdog target so that 1/favOdds + 1/dogOdds ≤ 1/(1+targetProfit)
 *    → locks ≥ targetProfit (default 5%) gross surebet when second leg fills
 * 4. When underdog price rises enough (odds fall to target), simulate second leg
 */
export class LiveSurebetArbitrageStrategy implements Strategy {
  readonly name = STRATEGY_NAME;

  constructor(private readonly cfg: StrategyConfig) {}

  evaluate(context: MarketContext): StrategySignal | null {
    if (!this.cfg.enabled) return null;
    const { market } = context;
    if (!market.active || market.closed) return null;

    // LIVE ONLY — pre-match markets are ignored
    if (!market.isLive) return null;

    const yesOdds = priceToOdds(market.yes.price);
    const noOdds = priceToOdds(market.no.price);
    const favoriteIsYes = market.yes.price >= market.no.price;
    const favoriteOdds = favoriteIsYes ? yesOdds : noOdds;
    const favoritePrice = favoriteIsYes ? market.yes.price : market.no.price;
    const favoriteSide = favoriteIsYes ? 'YES' : 'NO';
    const hedgeSide = favoriteIsYes ? 'NO' : 'YES';
    const hedgeQuote = favoriteIsYes ? market.no : market.yes;
    const underdogOddsNow = favoriteIsYes ? noOdds : yesOdds;

    if (favoriteOdds < this.cfg.minOdds || favoriteOdds > this.cfg.maxOdds) {
      return null;
    }

    let targetOdds: number;
    let targetPrice: number;
    try {
      targetOdds = computeTargetOdds(favoriteOdds, this.cfg.targetProfit);
      targetPrice = computeTargetPrice(favoriteOdds, this.cfg.targetProfit);
    } catch {
      return null;
    }

    // Implied surebet edge if we could fill both legs at current prices
    const impliedSum = 1 / favoriteOdds + 1 / underdogOddsNow;
    const surebetComplete = impliedSum <= 1 / (1 + this.cfg.targetProfit);
    const lockedProfitIfComplete = surebetComplete ? 1 / impliedSum - 1 : null;

    const dist = distanceToTarget(hedgeQuote.price, targetPrice);
    const liquidity = hedgeQuote.liquidity ?? market.liquidity ?? 0;
    if (liquidity < this.cfg.minLiquidity) {
      return null;
    }

    const edge = surebetComplete
      ? (lockedProfitIfComplete ?? this.cfg.targetProfit)
      : Math.max(0, -dist);
    const confidence = Math.min(
      1,
      Math.max(0.15, surebetComplete ? 0.95 : 1 - Math.min(1, Math.abs(dist))),
    );

    return {
      marketId: market.id,
      eventId: market.eventId,
      timestamp: context.now,
      side: favoriteSide,
      hedgeSide,
      entryPrice: favoritePrice,
      entryOdds: favoriteOdds,
      expectedPrice: targetPrice,
      targetOdds,
      edge,
      confidence,
      recommendedStake: 0,
      reason: [
        `LIVE SUREBET`,
        `1ª pata FAVORITO ${favoriteSide} @ ${favoriteOdds.toFixed(2)}`,
        `2ª pata ${hedgeSide} objetivo cuota ${targetOdds.toFixed(2)} (precio ${targetPrice.toFixed(4)})`,
        `underdog ahora ${underdogOddsNow.toFixed(2)}`,
        `distancia ${(dist * 100).toFixed(1)}%`,
        surebetComplete
          ? `SUREBET LISTA ~${((lockedProfitIfComplete ?? 0) * 100).toFixed(1)}%`
          : `esperando emparejamiento ≥${(this.cfg.targetProfit * 100).toFixed(0)}%`,
      ].join(' | '),
      strategyName: this.name,
      distanceToTarget: dist,
      dataKind: 'ESTIMATED',
      mode: context.mode,
    };
  }
}

/** @deprecated alias — use LiveSurebetArbitrageStrategy */
export { LiveSurebetArbitrageStrategy as FavoriteHedgeStrategy };
