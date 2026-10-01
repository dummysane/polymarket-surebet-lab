import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function DataQuality() {
  const [data, setData] = useState<{
    events: Array<{
      marketId: string;
      timestamp: string;
      valid: boolean;
      stale: boolean;
      issues: string[];
      feedLatencyMs: number | null;
    }>;
    staleCount: number;
  } | null>(null);

  useEffect(() => {
    const load = () => api<typeof data>('/api/data-quality').then(setData).catch(console.error);
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-medium">Data Quality</h1>
        <p className="text-sm text-[var(--muted)]">
          STALE DATA bloquea señales — solo OBSERVED quality checks
        </p>
      </header>
      <div className="panel rounded-md p-4 text-sm">
        Eventos stale recientes: {data?.staleCount ?? 0}
      </div>
      <div className="panel overflow-auto rounded-md">
        <table className="data mono">
          <thead>
            <tr>
              <th>Time</th>
              <th>Market</th>
              <th>Valid</th>
              <th>Stale</th>
              <th>Latency ms</th>
              <th>Issues</th>
            </tr>
          </thead>
          <tbody>
            {(data?.events ?? []).map((e, i) => (
              <tr key={i}>
                <td>{new Date(e.timestamp).toLocaleTimeString()}</td>
                <td>{e.marketId}</td>
                <td>{e.valid ? 'Y' : 'N'}</td>
                <td className={e.stale ? 'neg' : ''}>{e.stale ? 'STALE' : 'OK'}</td>
                <td>{e.feedLatencyMs ?? '—'}</td>
                <td>{e.issues.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
