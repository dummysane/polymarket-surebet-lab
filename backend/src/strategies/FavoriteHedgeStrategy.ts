import {
  STRATEGY_NAME,
  computeTargetOdds,
  computeTargetPrice,
  distanceToTarget,
  isSurebetReady,
  priceToOdds,
  surebetProfitPct,
  type ArbAction,
  type ArbPhase,
  type MarketContext,
  type StrategyConfig,
  type StrategySignal,
} from '@paperlab/shared';
import type { Strategy } from './Strategy.js';

/**
 * Arbitraje surebet LIVE por fases (PAPER ONLY — nunca órdenes reales).
 *
 * F0_SCAN_LIVE        → solo mercados in-play
 * F1_OPEN_FAVORITE    → favorito en [minOdds, maxOdds] (def. 1.60–1.80) → abrir 1ª pata
 * F2_WAIT_UNDERDOG    → 1ª pata abierta; vigilar underdog hasta objetivo
 * F3_COMPLETE_SUREBET → underdog alcanza cuota que cierra surebet ≥ targetProfit (5%)
 * F4_LOCKED           → ambas patas simuladas; beneficio bloqueado (lo gestiona paper engine)
 *
 * Matemática surebet:
 *   1/favOdds + 1/dogOdds ≤ 1/(1+targetProfit)
 *   targetDogOdds = 1 / (1/(1+targetProfit) - 1/favOdds)
 */
export class LiveSurebetArbitrageStrategy implements Strategy {
  readonly name = STRATEGY_NAME;

  constructor(private readonly cfg: StrategyConfig) {}

  evaluate(context: MarketContext): StrategySignal | null {
    if (!this.cfg.enabled) return null;
    const { market } = context;
    if (!market.active || market.closed) return null;

    // ─── F0: solo LIVE ───────────────────────────────────────────
    if (!market.isLive) return null;

    // Si ya hay 1ª pata abierta → evaluar F2 / F3
    if (context.openFirstLeg) {
      return this.evaluateWaitOrComplete(context);
    }

    // Sin posición → evaluar F1 (apertura favorito)
    return this.evaluateOpenFavorite(context);
  }

  /** F1 — detectar favorito en rango y proponer apertura de 1ª pata */
  private evaluateOpenFavorite(context: MarketContext): StrategySignal | null {
    const { market } = context;
    const legs = this.resolveLegs(market.yes, market.no);
    if (!legs) return null;

    const { favoriteOdds, favoritePrice, favoriteSide, hedgeSide, hedgeQuote, underdogOdds } =
      legs;

    // Favorito debe estar en banda configurable (default 1.60–1.80)
    if (favoriteOdds < this.cfg.minOdds || favoriteOdds > this.cfg.maxOdds) {
      return null;
    }

    const liquidity = legs.favQuote.liquidity ?? market.liquidity ?? 0;
    if (liquidity < this.cfg.minLiquidity) return null;

    let targetOdds: number;
    let targetPrice: number;
    try {
      targetOdds = computeTargetOdds(favoriteOdds, this.cfg.targetProfit);
      targetPrice = computeTargetPrice(favoriteOdds, this.cfg.targetProfit);
    } catch {
      return null;
    }

    const dist = distanceToTarget(hedgeQuote.price, targetPrice);
    const sum = 1 / favoriteOdds + 1 / underdogOdds;
    const alreadySurebet = isSurebetReady(favoriteOdds, underdogOdds, this.cfg.targetProfit);
    const profitNow = surebetProfitPct(favoriteOdds, underdogOdds);

    // Si YA hay surebet completa al detectar favorito, acción = completar ambas
    // (en paper abrimos 1ª y 2ª en secuencia). Si no, abrimos 1ª y esperamos.
    const phase: ArbPhase = alreadySurebet ? 'F3_COMPLETE_SUREBET' : 'F1_OPEN_FAVORITE';

    return this.buildSignal(context, {
      favoriteSide,
      hedgeSide,
      favoritePrice,
      favoriteOdds,
      targetOdds,
      targetPrice,
      underdogOdds,
      underdogPrice: hedgeQuote.price,
      surebetSum: sum,
      surebetProfitPct: profitNow,
      arbPhase: phase,
      action: 'OPEN_FIRST_LEG',
      distanceToTarget: dist,
      edge: alreadySurebet ? (profitNow ?? this.cfg.targetProfit) : Math.max(0, this.cfg.targetProfit * 0.1),
      confidence: alreadySurebet ? 0.9 : 0.55,
      reason: [
        `F0 LIVE ✓`,
        `F1 FAVORITO ${favoriteSide} @ ${favoriteOdds.toFixed(2)} (banda ${this.cfg.minOdds}–${this.cfg.maxOdds})`,
        `objetivo underdog ${hedgeSide} cuota ${targetOdds.toFixed(2)}`,
        `underdog ahora ${underdogOdds.toFixed(2)} · dist ${(dist * 100).toFixed(1)}%`,
        alreadySurebet
          ? `F3 SUREBET YA LISTA ~${((profitNow ?? 0) * 100).toFixed(1)}% → abrir 1ª y completar`
          : `F2 tras apertura: esperar underdog para ≥${(this.cfg.targetProfit * 100).toFixed(0)}%`,
      ].join(' | '),
    });
  }

  /** F2 / F3 — con 1ª pata abierta: ¿ya se puede cerrar la surebet? */
  private evaluateWaitOrComplete(context: MarketContext): StrategySignal | null {
    const open = context.openFirstLeg!;
    const { market } = context;
    const hedgeSide = open.entrySide === 'YES' ? 'NO' : 'YES';
    const hedgeQuote = hedgeSide === 'YES' ? market.yes : market.no;
    const underdogOdds = priceToOdds(hedgeQuote.price);
    const favoriteOdds = open.entryOdds;
    const sum = 1 / favoriteOdds + 1 / underdogOdds;
    const ready = isSurebetReady(favoriteOdds, underdogOdds, this.cfg.targetProfit);
    const profit = surebetProfitPct(favoriteOdds, underdogOdds);
    const dist = distanceToTarget(hedgeQuote.price, open.targetPrice);

    const liquidity = hedgeQuote.liquidity ?? market.liquidity ?? 0;
    if (liquidity < this.cfg.minLiquidity && ready) {
      // surebet math ok but no liquidity — keep waiting
      return this.buildSignal(context, {
        favoriteSide: open.entrySide,
        hedgeSide,
        favoritePrice: 1 / favoriteOdds,
        favoriteOdds,
        targetOdds: open.targetOdds,
        targetPrice: open.targetPrice,
        underdogOdds,
        underdogPrice: hedgeQuote.price,
        surebetSum: sum,
        surebetProfitPct: profit,
        arbPhase: 'F2_WAIT_UNDERDOG',
        action: 'MONITOR_UNDERDOG',
        distanceToTarget: dist,
        edge: 0,
        confidence: 0.4,
        reason: `F2 WAIT | surebet math OK pero liquidez insuficiente (${liquidity.toFixed(0)}) | trade ${open.tradeId}`,
      });
    }

    if (ready) {
      return this.buildSignal(context, {
        favoriteSide: open.entrySide,
        hedgeSide,
        favoritePrice: 1 / favoriteOdds,
        favoriteOdds,
        targetOdds: open.targetOdds,
        targetPrice: open.targetPrice,
        underdogOdds,
        underdogPrice: hedgeQuote.price,
        surebetSum: sum,
        surebetProfitPct: profit,
        arbPhase: 'F3_COMPLETE_SUREBET',
        action: 'COMPLETE_SECOND_LEG',
        distanceToTarget: dist,
        edge: profit ?? this.cfg.targetProfit,
        confidence: 0.95,
        reason: [
          `F3 COMPLETE SUREBET`,
          `1ª pata ${open.entrySide} @ ${favoriteOdds.toFixed(2)}`,
          `2ª pata ${hedgeSide} @ ${underdogOdds.toFixed(2)}`,
          `suma implícita ${sum.toFixed(4)}`,
          `beneficio bruto bloqueable ~${((profit ?? 0) * 100).toFixed(2)}% ≥ ${(this.cfg.targetProfit * 100).toFixed(0)}%`,
          `trade ${open.tradeId}`,
        ].join(' | '),
      });
    }

    return this.buildSignal(context, {
      favoriteSide: open.entrySide,
      hedgeSide,
      favoritePrice: 1 / favoriteOdds,
      favoriteOdds,
      targetOdds: open.targetOdds,
      targetPrice: open.targetPrice,
      underdogOdds,
      underdogPrice: hedgeQuote.price,
      surebetSum: sum,
      surebetProfitPct: profit,
      arbPhase: 'F2_WAIT_UNDERDOG',
      action: 'MONITOR_UNDERDOG',
      distanceToTarget: dist,
      edge: Math.max(0, -dist),
      confidence: Math.min(0.8, Math.max(0.2, 1 - Math.abs(dist))),
      reason: [
        `F2 WAIT UNDERDOG`,
        `favorito fijado @ ${favoriteOdds.toFixed(2)}`,
        `underdog ahora ${underdogOdds.toFixed(2)} → objetivo ${open.targetOdds.toFixed(2)}`,
        `distancia ${(dist * 100).toFixed(1)}%`,
        `suma ${sum.toFixed(4)} (surebet si ≤ ${(1 / (1 + this.cfg.targetProfit)).toFixed(4)})`,
      ].join(' | '),
    });
  }

  private resolveLegs(
    yes: { price: number; liquidity: number | null },
    no: { price: number; liquidity: number | null },
  ) {
    try {
      const yesOdds = priceToOdds(yes.price);
      const noOdds = priceToOdds(no.price);
      const favoriteIsYes = yes.price >= no.price;
      return {
        favoriteIsYes,
        favoriteOdds: favoriteIsYes ? yesOdds : noOdds,
        favoritePrice: favoriteIsYes ? yes.price : no.price,
        favoriteSide: (favoriteIsYes ? 'YES' : 'NO') as 'YES' | 'NO',
        hedgeSide: (favoriteIsYes ? 'NO' : 'YES') as 'YES' | 'NO',
        favQuote: favoriteIsYes ? yes : no,
        hedgeQuote: favoriteIsYes ? no : yes,
        underdogOdds: favoriteIsYes ? noOdds : yesOdds,
      };
    } catch {
      return null;
    }
  }

  private buildSignal(
    context: MarketContext,
    p: {
      favoriteSide: 'YES' | 'NO';
      hedgeSide: 'YES' | 'NO';
      favoritePrice: number;
      favoriteOdds: number;
      targetOdds: number;
      targetPrice: number;
      underdogOdds: number;
      underdogPrice: number;
      surebetSum: number;
      surebetProfitPct: number | null;
      arbPhase: ArbPhase;
      action: ArbAction;
      distanceToTarget: number;
      edge: number;
      confidence: number;
      reason: string;
    },
  ): StrategySignal {
    // Attach live liquidity from market quotes
    const m = context.market;
    const favLiq = p.favoriteSide === 'YES' ? m.yes.liquidity : m.no.liquidity;
    const dogLiq = p.hedgeSide === 'YES' ? m.yes.liquidity : m.no.liquidity;
    void favLiq;
    void dogLiq;

    return {
      marketId: m.id,
      eventId: m.eventId,
      timestamp: context.now,
      side: p.favoriteSide,
      hedgeSide: p.hedgeSide,
      entryPrice: p.favoritePrice,
      entryOdds: p.favoriteOdds,
      expectedPrice: p.targetPrice,
      targetOdds: p.targetOdds,
      underdogOddsNow: p.underdogOdds,
      underdogPriceNow: p.underdogPrice,
      surebetSum: p.surebetSum,
      surebetProfitPct: p.surebetProfitPct,
      arbPhase: p.arbPhase,
      action: p.action,
      edge: p.edge,
      confidence: p.confidence,
      recommendedStake: 0,
      reason: p.reason,
      strategyName: this.name,
      distanceToTarget: p.distanceToTarget,
      dataKind: 'ESTIMATED',
      mode: context.mode,
    };
  }
}

export { LiveSurebetArbitrageStrategy as FavoriteHedgeStrategy };
