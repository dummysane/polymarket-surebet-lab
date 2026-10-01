import { useEffect, useState } from 'react';
import { api, fmtNum } from '../lib/api';

interface Market {
  id: string;
  question: string;
  sport: string;
  isLive?: boolean;
  liveStatus?: string | null;
  competition: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  yes: { price: number; liquidity: number | null };
  no: { price: number; liquidity: number | null };
  volume: number | null;
  liquidity: number | null;
  timestamp: string;
  mode: string;
  dataKind: string;
}

export default function LiveMarkets() {
  const [markets, setMarkets] = useState<Market[]>([]);

  useEffect(() => {
    const load = () =>
      api<{ markets: Market[] }>('/api/markets')
        .then((r) => setMarkets(r.markets))
        .catch(console.error);
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium">Live Markets</h1>
          <p className="text-sm text-[var(--muted)]">Datos OBSERVED de Polymarket (o MOCK)</p>
        </div>
        <span className="badge live">LIVE</span>
      </header>
      <div className="panel overflow-auto rounded-md">
        <table className="data mono">
          <thead>
            <tr>
              <th>Market</th>
              <th>Live</th>
              <th>Sport</th>
              <th>Match</th>
              <th>YES</th>
              <th>Odds Y</th>
              <th>NO</th>
              <th>Odds N</th>
              <th>Liquidity</th>
              <th>Volume</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((m) => (
              <tr key={m.id}>
                <td className="max-w-[280px] truncate" title={m.question}>
                  {m.question}
                </td>
                <td>
                  {m.isLive ? (
                    <span className="badge live">LIVE</span>
                  ) : (
                    <span className="badge">{m.liveStatus ?? 'PRE'}</span>
                  )}
                </td>
                <td>{m.sport}</td>
                <td>
                  {m.homeTeam && m.awayTeam ? `${m.homeTeam} vs ${m.awayTeam}` : m.competition ?? '—'}
                </td>
                <td>{fmtNum(m.yes.price, 3)}</td>
                <td>{fmtNum(1 / m.yes.price, 2)}</td>
                <td>{fmtNum(m.no.price, 3)}</td>
                <td>{fmtNum(1 / m.no.price, 2)}</td>
                <td>{fmtNum(m.liquidity, 0)}</td>
                <td>{fmtNum(m.volume, 0)}</td>
                <td>{new Date(m.timestamp).toLocaleTimeString()}</td>
              </tr>
            ))}
            {!markets.length && (
              <tr>
                <td colSpan={11} className="text-[var(--muted)]">
                  Sin mercados aún — el backend está sincronizando Gamma/CLOB…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
