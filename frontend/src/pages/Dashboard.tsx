import { useEffect, useState } from 'react';
import { api, fmtMoney, fmtPct } from '../lib/api';

interface DashboardData {
  portfolio: {
    currentBankroll: number;
    initialBankroll: number;
    totalPnl: number;
    roi: number;
    exposedCapital: number;
    availableCapital: number;
  };
  stats: {
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
    profitFactor: number;
    averagePnl: number;
    medianPnl: number;
    maxDrawdown: number;
    sharpeRatio: number;
    sortinoRatio: number;
    expectancy: number;
    targetHitRate: number;
    targetHitCi95: { lower: number; upper: number };
    observedP: number;
    breakEvenP: number;
    estimatedEdgePp: number;
    verdict: string;
    realized: { pnl: number };
  };
  marketsCount: number;
  opportunitiesCount: number;
  openTrades: number;
  mode: string;
  realExecutionEnabled: boolean;
  minimumTrades: number;
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'pos' | 'neg' | 'muted';
}) {
  return (
    <div className="panel rounded-md p-4">
      <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className={`mono mt-2 text-xl ${tone === 'pos' ? 'pos' : tone === 'neg' ? 'neg' : ''}`}>
        {value}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    const load = () => api<DashboardData>('/api/dashboard').then(setData).catch(console.error);
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  if (!data) {
    return <div className="text-[var(--muted)]">Cargando dashboard…</div>;
  }

  const pnlTone = data.portfolio.totalPnl >= 0 ? 'pos' : 'neg';

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Surebet LIVE paper — 1ª pata favorito (1.60–1.80), 2ª pata ≥5%
          </p>
        </div>
        <div className="flex gap-2">
          <span className="badge live">{data.mode}</span>
          <span className="badge paper">PAPER</span>
          {!data.realExecutionEnabled && <span className="badge">REAL OFF</span>}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Bankroll" value={fmtMoney(data.portfolio.currentBankroll)} />
        <Metric label="Bankroll inicial" value={fmtMoney(data.portfolio.initialBankroll)} />
        <Metric label="Total PnL" value={fmtMoney(data.portfolio.totalPnl)} tone={pnlTone} />
        <Metric label="ROI" value={fmtPct(data.portfolio.roi)} tone={pnlTone} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Trades" value={String(data.stats.trades)} />
        <Metric label="Win rate" value={fmtPct(data.stats.winRate, 1)} />
        <Metric
          label="Target hit rate"
          value={`${(data.stats.targetHitRate * 100).toFixed(1)}%`}
        />
        <Metric
          label="95% CI"
          value={`${(data.stats.targetHitCi95.lower * 100).toFixed(1)}% — ${(data.stats.targetHitCi95.upper * 100).toFixed(1)}%`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Expected value" value={fmtMoney(data.stats.expectancy)} />
        <Metric label="Realized value" value={fmtMoney(data.stats.realized.pnl)} />
        <Metric label="Max drawdown" value={fmtPct(data.stats.maxDrawdown, 1)} tone="neg" />
        <Metric label="Profit factor" value={fmtNumSafe(data.stats.profitFactor)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Avg trade" value={fmtMoney(data.stats.averagePnl)} />
        <Metric label="Median trade" value={fmtMoney(data.stats.medianPnl)} />
        <Metric label="Sharpe approx" value={fmtNumSafe(data.stats.sharpeRatio)} />
        <Metric label="Sortino approx" value={fmtNumSafe(data.stats.sortinoRatio)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Wins / Losses" value={`${data.stats.wins} / ${data.stats.losses}`} />
        <Metric label="Capital expuesto" value={fmtMoney(data.portfolio.exposedCapital)} />
        <Metric label="Capital disponible" value={fmtMoney(data.portfolio.availableCapital)} />
        <Metric
          label="Mercados / Oportunidades"
          value={`${data.marketsCount} / ${data.opportunitiesCount}`}
        />
      </div>

      <div className="panel rounded-md p-4">
        <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
          Verdict estadístico
        </div>
        <div className="mono mt-2 text-lg">{data.stats.verdict}</div>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          Observed p: {(data.stats.observedP * 100).toFixed(1)}% · Break-even p:{' '}
          {(data.stats.breakEvenP * 100).toFixed(1)}% · Estimated edge:{' '}
          {data.stats.estimatedEdgePp >= 0 ? '+' : ''}
          {data.stats.estimatedEdgePp.toFixed(1)} pp (estimación). Mínimo{' '}
          {data.minimumTrades} trades para significancia. Nunca se interpreta ROI positivo solo
          como prueba estadística.
        </p>
      </div>
    </div>
  );
}

function fmtNumSafe(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  return n.toFixed(2);
}
