import { useState } from 'react';
import { api, fmtMoney, fmtPct } from '../lib/api';

export default function Backtest() {
  const [csvPath, setCsvPath] = useState('scripts/sample_ticks.csv');
  const [result, setResult] = useState<{
    trades: number;
    stats: { roi: number; trades: number; targetHitRate: number; verdict: string };
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const r = await api<typeof result>('/api/backtest', {
        method: 'POST',
        body: JSON.stringify({ csvPath }),
      });
      setResult(r);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium">Backtest</h1>
          <p className="text-sm text-[var(--muted)]">
            Mismo StrategyEngine que LIVE — ticks CSV cronológicos
          </p>
        </div>
        <span className="badge backtest">BACKTEST</span>
      </header>
      <div className="panel space-y-3 rounded-md p-4">
        <label className="block text-sm">
          Ruta CSV
          <input
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2 mono text-sm"
            value={csvPath}
            onChange={(e) => setCsvPath(e.target.value)}
          />
        </label>
        <button
          onClick={run}
          disabled={loading}
          className="rounded bg-[#1e2a44] px-4 py-2 text-sm hover:bg-[#243352] disabled:opacity-50"
        >
          {loading ? 'Reproduciendo…' : 'Run backtest'}
        </button>
      </div>
      {result && (
        <div className="panel rounded-md p-4 mono text-sm">
          <div>Trades: {result.stats.trades}</div>
          <div>ROI: {fmtPct(result.stats.roi)}</div>
          <div>Target hit: {(result.stats.targetHitRate * 100).toFixed(1)}%</div>
          <div>Verdict: {result.stats.verdict}</div>
          <div className="mt-2 text-[var(--muted)]">Bankroll ref {fmtMoney(2000)}</div>
        </div>
      )}
    </div>
  );
}
