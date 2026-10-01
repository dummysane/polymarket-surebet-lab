import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function Settings() {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [autoTrade, setAutoTrade] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<{ config: Record<string, unknown>; autoTrade: boolean }>('/api/strategies').then((r) => {
      setConfig(r.config);
      setAutoTrade(r.autoTrade);
    });
  }, []);

  async function save() {
    if (!config) return;
    await api('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ ...config, autoTrade }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!config) return <div className="text-[var(--muted)]">Cargando…</div>;

  const fields: Array<[string, number | boolean]> = [
    ['minOdds', Number(config.minOdds)],
    ['maxOdds', Number(config.maxOdds)],
    ['targetProfit', Number(config.targetProfit)],
    ['stakePercentage', Number(config.stakePercentage)],
    ['commission', Number(config.commission)],
    ['executionDelayMs', Number(config.executionDelayMs)],
    ['maxSlippage', Number(config.maxSlippage)],
    ['minLiquidity', Number(config.minLiquidity)],
    ['executionProbability', Number(config.executionProbability)],
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-medium">Settings</h1>
        <p className="text-sm text-[var(--muted)]">
          Solo paper trading. Ejecución real permanentemente desactivada.
        </p>
      </header>

      <div className="panel grid max-w-2xl gap-3 rounded-md p-4 sm:grid-cols-2">
        {fields.map(([key, val]) => (
          <label key={key} className="text-xs text-[var(--muted)]">
            {key}
            <input
              type="number"
              step="any"
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 mono text-sm text-[var(--text)]"
              value={val as number}
              onChange={(e) => setConfig({ ...config, [key]: Number(e.target.value) })}
            />
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm text-[var(--text)]">
          <input
            type="checkbox"
            checked={Boolean(config.allowPartialFills)}
            onChange={(e) => setConfig({ ...config, allowPartialFills: e.target.checked })}
          />
          allowPartialFills
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--text)]">
          <input type="checkbox" checked={autoTrade} onChange={(e) => setAutoTrade(e.target.checked)} />
          auto paper trade
        </label>
        <div className="text-xs text-[var(--muted)] sm:col-span-2">
          Stake presets:{' '}
          {[0.005, 0.01, 0.02, 0.03, 0.05].map((s) => (
            <button
              key={s}
              className="mr-1 rounded border border-[var(--border)] px-2 py-0.5"
              onClick={() => setConfig({ ...config, stakePercentage: s })}
            >
              {s * 100}%
            </button>
          ))}
        </div>
      </div>

      <button onClick={save} className="rounded bg-[#1e2a44] px-4 py-2 text-sm hover:bg-[#243352]">
        Guardar
      </button>
      {saved && <span className="ml-2 text-sm pos">Guardado</span>}

      <div className="panel rounded-md p-4 text-sm text-[var(--muted)]">
        <div className="badge">REAL_EXECUTION_ENABLED = false</div>
        <p className="mt-2">
          Exportar:{' '}
          <a className="text-[var(--accent)]" href="/api/export/trades?format=csv">
            trades CSV
          </a>
          {' · '}
          <a className="text-[var(--accent)]" href="/api/export/ticks?format=json">
            ticks JSON
          </a>
          {' · '}
          <a className="text-[var(--accent)]" href="/api/export/strategy-report">
            strategy_report.json
          </a>
        </p>
      </div>
    </div>
  );
}
