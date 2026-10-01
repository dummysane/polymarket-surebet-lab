import type { FastifyInstance } from 'fastify';
import { lab } from '../services/LabService.js';
import { RealExecutionEngine } from '../execution/RealExecutionEngine.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({
    ok: true,
    realExecutionEnabled: RealExecutionEngine.ENABLED,
    mode: lab.provider.mode,
  }));

  app.get('/api/dashboard', async () => lab.dashboard());

  app.get('/api/markets', async () => {
    const markets = [...lab.store.markets.values()];
    const kinds = new Set(markets.map((m) => m.dataKind));
    return {
      dataKind: kinds.size === 1 ? [...kinds][0] : 'MIXED',
      mode: lab.provider.mode,
      markets,
    };
  });

  app.get('/api/markets/:id', async (req) => {
    const { id } = req.params as { id: string };
    const market = lab.store.markets.get(id) ?? (await lab.provider.getMarket(id));
    return { market, snapshots: lab.store.getSnapshots(id, 200) };
  });

  app.get('/api/opportunities', async (req) => {
    const q = req.query as { sort?: string };
    let list = [...lab.opportunities];
    switch (q.sort) {
      case 'liquidity':
        list = list.sort((a, b) => b.recommendedStake - a.recommendedStake);
        break;
      case 'confidence':
        list = list.sort((a, b) => b.confidence - a.confidence);
        break;
      case 'ev':
        list = list.sort((a, b) => b.edge - a.edge);
        break;
      default:
        list = list.sort((a, b) => a.distanceToTarget - b.distanceToTarget);
    }
    return { dataKind: 'ESTIMATED', mode: 'PAPER', opportunities: list };
  });

  app.get('/api/trades', async () => ({
    dataKind: 'SIMULATED',
    mode: 'PAPER',
    trades: lab.paper.getTrades(),
  }));

  app.get('/api/trades/:id', async (req) => {
    const { id } = req.params as { id: string };
    const trade = lab.paper.getTrade(id);
    if (!trade) return { error: 'not_found' };
    return {
      trade,
      events: lab.paper.getEvents(id),
      priceSnapshots: lab.paper.getPriceSnapshotsAround(trade.marketId, trade.timestamp),
      dataKind: trade.dataKind,
    };
  });

  app.get('/api/portfolio', async () => lab.portfolio.getState());

  app.get('/api/statistics', async () => {
    const trades = lab.paper.getTrades();
    return {
      global: lab.stats.compute(trades),
      byCategory: lab.stats.byCategory(trades),
      rolling: lab.stats.rolling(trades),
    };
  });

  app.get('/api/strategies', async () => ({
    strategies: lab.strategyEngine.list().map((s) => s.name),
    config: lab.strategyConfig,
    autoTrade: lab.autoTrade,
  }));

  app.post('/api/settings', async (req) => {
    const body = req.body as Record<string, unknown>;
    lab.updateSettings(body as Parameters<typeof lab.updateSettings>[0]);
    return { ok: true, config: lab.strategyConfig, autoTrade: lab.autoTrade };
  });

  app.post('/api/montecarlo', async (req) => {
    const body = (req.body ?? {}) as Record<string, number>;
    const result = lab.runMonteCarlo(body);
    return result;
  });

  app.get('/api/montecarlo/last', async () => lab.lastMcResult);

  app.post('/api/sensitivity', async (req) => {
    const body = (req.body ?? {}) as Record<string, number>;
    const base = {
      matches: body.matches ?? 1000,
      simulations: body.simulations ?? 1000,
      initialBankroll: body.initialBankroll ?? 2000,
      stakePercentage: body.stakePercentage ?? 0.02,
      commission: body.commission ?? 0.005,
      houseMargin: body.houseMargin ?? 0.03,
      slippage: body.slippage ?? 0.01,
      executionDelayMs: body.executionDelayMs ?? 500,
      targetProfit: body.targetProfit ?? 0.05,
      pTargetReached: body.pTargetReached ?? 0.58,
      executionProbability: body.executionProbability ?? 0.98,
      seed: body.seed ?? 20261001,
    };
    return lab.sensitivity.runGrid(base);
  });

  app.post('/api/backtest', async (req) => {
    const body = req.body as { csvPath?: string };
    const csvPath = body.csvPath ?? 'scripts/sample_ticks.csv';
    const result = await lab.runBacktest(csvPath);
    return { mode: 'BACKTEST', ...result };
  });

  app.get('/api/data-quality', async () => ({
    dataKind: 'OBSERVED',
    events: lab.store.qualityEvents.slice(0, 100),
    staleCount: lab.store.qualityEvents.filter((e) => e.stale).length,
  }));

  app.get('/api/alerts', async () => ({ alerts: lab.alerts.list() }));

  app.post('/api/evaluate', async () => {
    const signals = await lab.evaluateAll();
    return { count: signals.length, signals };
  });

  app.get('/api/export/strategy-report', async (_req, reply) => {
    const report = lab.exportStrategyReport();
    reply.header('Content-Disposition', 'attachment; filename="strategy_report.json"');
    return report;
  });

  app.get('/api/export/:kind', async (req, reply) => {
    const { kind } = req.params as { kind: string };
    const format = ((req.query as { format?: string }).format ?? 'json').toLowerCase();
    let rows: unknown[] = [];
    switch (kind) {
      case 'markets':
        rows = [...lab.store.markets.values()];
        break;
      case 'ticks':
        rows = lab.store.snapshots.slice(-10_000);
        break;
      case 'signals':
        rows = lab.store.signals;
        break;
      case 'trades':
        rows = lab.paper.getTrades();
        break;
      case 'results':
        rows = lab.paper.getTrades().filter((t) => t.pnl !== null);
        break;
      case 'simulations':
        rows = lab.lastMcResult ? [lab.lastMcResult] : [];
        break;
      default:
        return reply.code(404).send({ error: 'unknown_kind' });
    }

    if (format === 'csv') {
      const csv = toCsv(rows as Record<string, unknown>[]);
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="${kind}.csv"`);
      return csv;
    }
    reply.header('Content-Disposition', `attachment; filename="${kind}.json"`);
    return { dataKind: 'MIXED', kind, rows };
  });

  // Guard: any attempt to hit a real-order route fails
  app.post('/api/real/order', async (_req, reply) => {
    return reply.code(403).send({
      error: 'REAL_EXECUTION_DISABLED',
      message: 'This lab never places real Polymarket orders.',
    });
  });
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]!);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => escape(r[k])).join(','))].join('\n');
}
