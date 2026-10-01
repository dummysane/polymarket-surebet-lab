import type { DataQualityReport, Market, MarketSnapshot } from '@paperlab/shared';
import { config } from '../config/index.js';

export class DataQualityGate {
  evaluate(snapshot: MarketSnapshot, market?: Market | null): DataQualityReport {
    const issues: string[] = [];
    const now = Date.now();
    const ts = Date.parse(snapshot.timestamp);
    let feedLatencyMs: number | null = null;

    if (!Number.isFinite(ts)) {
      issues.push('INVALID_TIMESTAMP');
    } else {
      feedLatencyMs = now - ts;
      if (feedLatencyMs > config.staleDataMs) {
        issues.push('STALE_DATA');
      }
      if (ts > now + 60_000) {
        issues.push('FUTURE_TIMESTAMP');
      }
    }

    if (!Number.isFinite(snapshot.price) || snapshot.price <= 0 || snapshot.price >= 1) {
      issues.push('INVALID_PRICE');
    }

    if (market && (!market.active || market.closed)) {
      issues.push('MARKET_INACTIVE');
    }

    if (snapshot.liquidity !== null && snapshot.liquidity < config.minLiquidity) {
      issues.push('LOW_LIQUIDITY');
    }

    if (snapshot.spread !== null && snapshot.spread > 0.15) {
      issues.push('WIDE_SPREAD');
    }

    const stale = issues.includes('STALE_DATA');
    const valid = issues.length === 0 || (issues.length === 1 && issues[0] === 'LOW_LIQUIDITY');

    return {
      marketId: snapshot.marketId,
      timestamp: snapshot.timestamp,
      valid: issues.filter((i) => i !== 'LOW_LIQUIDITY').length === 0,
      stale,
      issues,
      feedLatencyMs,
      dataKind: 'OBSERVED',
    };
  }

  /** Signals must not be generated on stale/invalid data */
  allowsSignals(report: DataQualityReport): boolean {
    if (report.stale) return false;
    if (report.issues.includes('INVALID_PRICE')) return false;
    if (report.issues.includes('INVALID_TIMESTAMP')) return false;
    if (report.issues.includes('MARKET_INACTIVE')) return false;
    return true;
  }
}
