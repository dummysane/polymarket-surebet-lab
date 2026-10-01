import type { Market, PaperTrade, TradeSide } from '@paperlab/shared';
import type { PaperTradingEngine } from '../simulation/PaperTradingEngine.js';
import type { PortfolioManager } from '../portfolio/PortfolioManager.js';
import { logEvent } from '../utils/logger.js';

/**
 * SettlementEngine — resolves paper trades from OBSERVED market resolution.
 * Does not invent outcomes.
 */
export class SettlementEngine {
  constructor(
    private readonly paper: PaperTradingEngine,
    private readonly _portfolio: PortfolioManager,
  ) {}

  settleMarket(market: Market): PaperTrade[] {
    const settled: PaperTrade[] = [];
    if (!market.closed && !market.resolved) {
      return settled;
    }

    const winning = inferWinningOutcome(market);
    if (!winning) {
      logEvent('settlement', 'Market closed but winning outcome unknown — skip', {
        marketId: market.id,
        dataKind: 'OBSERVED',
      });
      return settled;
    }

    for (const trade of this.paper.getTrades()) {
      if (trade.marketId !== market.id) continue;
      if (trade.status === 'HEDGE_SIMULATED' || trade.status === 'SETTLED') continue;
      if (
        trade.status !== 'FIRST_LEG_OPENED' &&
        trade.status !== 'TIMEOUT' &&
        trade.status !== 'TARGET_REACHED' &&
        trade.status !== 'PARTIAL_FILL'
      ) {
        continue;
      }

      const firstLegWon = trade.entrySide === winning;
      const result = this.paper.settleUnhedged(
        trade.tradeId,
        firstLegWon,
        `MARKET_RESOLVED_${winning}`,
      );
      if (result) {
        settled.push(result);
        logEvent('settlement', 'Paper trade settled', {
          tradeId: result.tradeId,
          pnl: result.pnl,
          dataKind: 'REALIZED',
        });
      }
    }
    return settled;
  }
}

function inferWinningOutcome(market: Market): TradeSide | null {
  if (market.winningOutcome) return market.winningOutcome;
  // Polymarket resolved markets typically show winning token price ~1
  if (market.yes.price >= 0.95 && market.no.price <= 0.05) return 'YES';
  if (market.no.price >= 0.95 && market.yes.price <= 0.05) return 'NO';
  return null;
}
