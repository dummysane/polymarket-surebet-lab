import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, fmtMoney, fmtPct } from '../lib/api';

interface McResult {
  finalBankroll: { p5: number; p25: number; p50: number; p75: number; p95: number; mean: number };
  probabilityOfLosingMoney: number;
  probabilityBankrollBelow50: number;
  probabilityBankrollBelow25: number;
  cagrApprox: number;
  meanCurve: number[];
  medianCurve: number[];
  p5Curve: number[];
  p25Curve: number[];
  p75Curve: number[];
  p95Curve: number[];
  trajectories: number[][];
  params: { simulations: number; matches: number };
}

export default function MonteCarlo() {
  const [params, setParams] = useState({
    matches: 1000,
    simulations: 1000,
    initialBankroll: 2000,
    stakePercentage: 0.02,
    commission: 0.005,
    houseMargin: 0.03,
    slippage: 0.01,
    executionDelayMs: 500,
    targetProfit: 0.05,
    pTargetReached: 0.58,
    executionProbability: 0.98,
    seed: 20261001,
  });
  const [result, setResult] = useState<McResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const r = await api<McResult>('/api/montecarlo', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      setResult(r);
    } finally {
      setLoading(false);
    }
  }

  const chartData = useMemo(() => {
    if (!result) return [];
    return result.meanCurve.map((_, i) => ({
      i,
      mean: result.meanCurve[i],
      median: result.medianCurve[i],
      p5: result.p5Curve[i],
      p25: result.p25Curve[i],
      p75: result.p75Curve[i],
      p95: result.p95Curve[i],
      t0: result.trajectories[0]?.[i],
      t1: result.trajectories[1]?.[i],
      t2: result.trajectories[2]?.[i],
      t3: result.trajectories[3]?.[i],
      t4: result.trajectories[4]?.[i],
    }));
  }, [result]);

  function set<K extends keyof typeof params>(key: K, value: number) {
    setParams((p) => ({ ...p, [key]: value }));
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium">Monte Carlo</h1>
          <p className="text-sm text-[var(--muted)]">Datos SIMULATION — seed determinista</p>
        </div>
        <span className="badge simulation">SIMULATION</span>
      </header>

      <div className="panel grid gap-3 rounded-md p-4 sm:grid-cols-3 lg:grid-cols-4">
        {(
          [
            ['simulations', params.simulations],
            ['matches', params.matches],
            ['initialBankroll', params.initialBankroll],
            ['stakePercentage', params.stakePercentage],
            ['commission', params.commission],
            ['houseMargin', params.houseMargin],
            ['slippage', params.slippage],
            ['pTargetReached', params.pTargetReached],
            ['executionProbability', params.executionProbability],
            ['targetProfit', params.targetProfit],
            ['seed', params.seed],
          ] as const
        ).map(([key, val]) => (
          <label key={key} className="text-xs text-[var(--muted)]">
            {key}
            <input
              type="number"
              step="any"
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 mono text-sm text-[var(--text)]"
              value={val}
              onChange={(e) => set(key, Number(e.target.value))}
            />
          </label>
        ))}
        <div className="flex items-end gap-2">
          {[500, 1000, 5000, 10000].map((n) => (
            <button
              key={n}
              className="rounded border border-[var(--border)] px-2 py-1 text-xs"
              onClick={() => set('simulations', n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={run}
        disabled={loading}
        className="rounded bg-[#1e2a44] px-4 py-2 text-sm hover:bg-[#243352] disabled:opacity-50"
      >
        {loading ? 'Simulando…' : 'Run simulation'}
      </button>

      {result && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="P5" value={fmtMoney(result.finalBankroll.p5)} />
            <Stat label="P25" value={fmtMoney(result.finalBankroll.p25)} />
            <Stat label="P50" value={fmtMoney(result.finalBankroll.p50)} />
            <Stat label="P75" value={fmtMoney(result.finalBankroll.p75)} />
            <Stat label="P95" value={fmtMoney(result.finalBankroll.p95)} />
            <Stat label="P(loss)" value={fmtPct(result.probabilityOfLosingMoney, 1)} />
            <Stat label="P(bankroll&lt;50%)" value={fmtPct(result.probabilityBankrollBelow50, 1)} />
            <Stat label="CAGR approx" value={fmtPct(result.cagrApprox, 1)} />
          </div>

          <div className="panel h-[360px] rounded-md p-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="#1e2430" />
                <XAxis dataKey="i" stroke="#7a8494" hide />
                <YAxis stroke="#7a8494" />
                <Tooltip contentStyle={{ background: '#12151a', border: '1px solid #1e2430' }} />
                <Legend />
                <Line type="monotone" dataKey="p5" stroke="#3b4555" dot={false} strokeWidth={1} />
                <Line type="monotone" dataKey="p25" stroke="#4b5568" dot={false} strokeWidth={1} />
                <Line type="monotone" dataKey="median" stroke="#6b8cff" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="mean" stroke="#c4b5fd" dot={false} strokeWidth={1} />
                <Line type="monotone" dataKey="p75" stroke="#4b5568" dot={false} strokeWidth={1} />
                <Line type="monotone" dataKey="p95" stroke="#3b4555" dot={false} strokeWidth={1} />
                <Line type="monotone" dataKey="t0" stroke="#3ecf8e33" dot={false} />
                <Line type="monotone" dataKey="t1" stroke="#3ecf8e33" dot={false} />
                <Line type="monotone" dataKey="t2" stroke="#3ecf8e33" dot={false} />
                <Line type="monotone" dataKey="t3" stroke="#3ecf8e33" dot={false} />
                <Line type="monotone" dataKey="t4" stroke="#3ecf8e33" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel rounded-md p-3">
      <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className="mono mt-1 text-lg">{value}</div>
    </div>
  );
}
