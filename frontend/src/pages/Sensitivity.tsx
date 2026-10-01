import { useState } from 'react';
import { api, fmtMoney, fmtPct } from '../lib/api';

export default function Sensitivity() {
  const [data, setData] = useState<{
    rows: Array<{
      parameter: string;
      value: string;
      finalBankroll: number;
      roi: number;
      drawdown: number;
      ruinProbability: number;
    }>;
    stakeVsP: { rows: string[]; cols: string[]; values: number[][] };
    marginVsP: { rows: string[]; cols: string[]; values: number[][] };
    errorScenarios: Array<{
      id: string;
      label: string;
      finalBankroll: number;
      roi: number;
      drawdown: number;
      ruinProbability: number;
    }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const r = await api<typeof data>('/api/sensitivity', {
        method: 'POST',
        body: JSON.stringify({ simulations: 1000, matches: 1000, seed: 20261001 }),
      });
      setData(r);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium">Sensitivity</h1>
          <p className="text-sm text-[var(--muted)]">Análisis de parámetros + escenarios de error</p>
        </div>
        <span className="badge simulation">SIMULATION</span>
      </header>

      <button
        onClick={run}
        disabled={loading}
        className="rounded bg-[#1e2a44] px-4 py-2 text-sm hover:bg-[#243352] disabled:opacity-50"
      >
        {loading ? 'Calculando…' : 'Run sensitivity'}
      </button>

      {data && (
        <>
          <div className="panel overflow-auto rounded-md">
            <table className="data mono">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Value</th>
                  <th>Final bankroll</th>
                  <th>ROI</th>
                  <th>Drawdown</th>
                  <th>Ruin probability</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.parameter}</td>
                    <td>{r.value}</td>
                    <td>{fmtMoney(r.finalBankroll)}</td>
                    <td>{fmtPct(r.roi)}</td>
                    <td>{fmtPct(r.drawdown, 1)}</td>
                    <td>{fmtPct(r.ruinProbability, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Heatmap title="Stake × P(target) — median ROI" grid={data.stakeVsP} />
          <Heatmap title="Margin × P(target) — median ROI" grid={data.marginVsP} />

          <div className="panel overflow-auto rounded-md">
            <div className="border-b border-[var(--border)] px-3 py-2 text-sm">Error scenarios A–I</div>
            <table className="data mono">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Scenario</th>
                  <th>Final bankroll</th>
                  <th>ROI</th>
                  <th>DD</th>
                  <th>Ruin</th>
                </tr>
              </thead>
              <tbody>
                {data.errorScenarios.map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>{s.label}</td>
                    <td>{fmtMoney(s.finalBankroll)}</td>
                    <td>{fmtPct(s.roi)}</td>
                    <td>{fmtPct(s.drawdown, 1)}</td>
                    <td>{fmtPct(s.ruinProbability, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Heatmap({
  title,
  grid,
}: {
  title: string;
  grid: { rows: string[]; cols: string[]; values: number[][] };
}) {
  return (
    <div className="panel overflow-auto rounded-md p-4">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      <table className="data mono">
        <thead>
          <tr>
            <th></th>
            {grid.cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((r, i) => (
            <tr key={r}>
              <td>{r}</td>
              {grid.values[i]!.map((v, j) => (
                <td
                  key={j}
                  style={{
                    background:
                      v >= 0
                        ? `rgba(62, 207, 142, ${Math.min(0.55, Math.abs(v) * 2)})`
                        : `rgba(240, 113, 120, ${Math.min(0.55, Math.abs(v) * 2)})`,
                  }}
                >
                  {(v * 100).toFixed(1)}%
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
