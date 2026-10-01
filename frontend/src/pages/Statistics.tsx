import { useEffect, useState } from 'react';
import { api, fmtMoney, fmtPct } from '../lib/api';

export default function Statistics() {
  const [data, setData] = useState<{
    global: Record<string, unknown>;
    byCategory: Record<string, Record<string, Record<string, unknown>>>;
    rolling: {
      historical: Record<string, unknown>;
      recent: Record<string, Record<string, unknown>>;
      strategyDegradation: boolean;
      note: string | null;
    };
  } | null>(null);

  useEffect(() => {
    api<typeof data>('/api/statistics').then(setData).catch(console.error);
  }, []);

  if (!data) return <div className="text-[var(--muted)]">Cargando estadísticas…</div>;
  const g = data.global as {
    trades: number;
    winRate: number;
    roi: number;
    maxDrawdown: number;
    profitFactor: number;
    targetHitRate: number;
    targetHitCi95: { lower: number; upper: number };
    observedP: number;
    breakEvenP: number;
    estimatedEdgePp: number;
    verdict: string;
    percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
    sharpeRatio: number;
    sortinoRatio: number;
    calmarRatio: number;
    expectancy: number;
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-medium">Statistics</h1>
        <p className="text-sm text-[var(--muted)]">REALIZED vs ESTIMATED — con incertidumbre</p>
      </header>

      <div className="panel rounded-md p-4">
        <div className="mono text-sm">
          Verdict: <strong>{g.verdict}</strong>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3 mono text-xs">
          <div>Trades: {g.trades}</div>
          <div>Win rate: {fmtPct(g.winRate, 1)}</div>
          <div>ROI: {fmtPct(g.roi)}</div>
          <div>P(target): {(g.targetHitRate * 100).toFixed(1)}%</div>
          <div>
            95% CI: {(g.targetHitCi95.lower * 100).toFixed(1)}% —{' '}
            {(g.targetHitCi95.upper * 100).toFixed(1)}%
          </div>
          <div>
            Observed p {(g.observedP * 100).toFixed(1)}% · BE {(g.breakEvenP * 100).toFixed(1)}% ·
            Edge {g.estimatedEdgePp >= 0 ? '+' : ''}
            {g.estimatedEdgePp.toFixed(1)} pp
          </div>
          <div>Max DD: {fmtPct(g.maxDrawdown, 1)}</div>
          <div>PF: {Number.isFinite(g.profitFactor) ? g.profitFactor.toFixed(2) : '∞'}</div>
          <div>Expectancy: {fmtMoney(g.expectancy)}</div>
          <div>Sharpe: {g.sharpeRatio.toFixed(2)}</div>
          <div>Sortino: {Number.isFinite(g.sortinoRatio) ? g.sortinoRatio.toFixed(2) : '∞'}</div>
          <div>Calmar: {g.calmarRatio.toFixed(2)}</div>
        </div>
        <div className="mt-3 text-xs text-[var(--muted)] mono">
          PnL percentiles: P5 {fmtMoney(g.percentiles.p5)} · P25 {fmtMoney(g.percentiles.p25)} ·
          P50 {fmtMoney(g.percentiles.p50)} · P75 {fmtMoney(g.percentiles.p75)} · P95{' '}
          {fmtMoney(g.percentiles.p95)}
        </div>
      </div>

      {data.rolling.strategyDegradation && (
        <div className="panel rounded-md border-[var(--neg)] p-4 text-sm neg">
          STRATEGY DEGRADATION — {data.rolling.note}
        </div>
      )}

      <div className="panel overflow-auto rounded-md p-4">
        <h2 className="mb-3 text-sm font-medium">Por categoría (odds bucket)</h2>
        <table className="data mono">
          <thead>
            <tr>
              <th>Bucket</th>
              <th>Trades</th>
              <th>ROI</th>
              <th>P(target)</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.byCategory.oddsBucket ?? {}).map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{String(v.trades)}</td>
                <td>{fmtPct(Number(v.roi))}</td>
                <td>{(Number(v.targetHitRate) * 100).toFixed(1)}%</td>
                <td>{String(v.verdict)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <a
        className="inline-block text-sm text-[var(--accent)]"
        href="/api/export/strategy-report"
      >
        Descargar strategy_report.json
      </a>
    </div>
  );
}
