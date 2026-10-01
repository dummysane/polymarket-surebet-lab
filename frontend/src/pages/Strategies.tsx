import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function Strategies() {
  const [data, setData] = useState<{
    strategies: string[];
    config: Record<string, unknown>;
    autoTrade: boolean;
  } | null>(null);

  useEffect(() => {
    api<typeof data>('/api/strategies').then(setData).catch(console.error);
  }, []);

  if (!data) return <div className="text-[var(--muted)]">Cargando…</div>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-medium">Strategies</h1>
        <p className="text-sm text-[var(--muted)]">
          Motor único para LIVE y BACKTEST — LiveSurebetArb (paper)
        </p>
      </header>
      <div className="panel rounded-md p-4">
        <div className="text-sm">Registradas: {data.strategies.join(', ')}</div>
        <div className="mt-2 text-sm text-[var(--muted)]">
          Auto-trade paper: {data.autoTrade ? 'ON' : 'OFF'}
        </div>
        <pre className="mono mt-4 overflow-auto text-xs text-[var(--muted)]">
          {JSON.stringify(data.config, null, 2)}
        </pre>
      </div>
    </div>
  );
}
