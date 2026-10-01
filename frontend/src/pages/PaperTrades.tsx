import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, fmtMoney, fmtNum } from '../lib/api';

interface Trade {
  tradeId: string;
  timestamp: string;
  marketId: string;
  entrySide: string;
  entryPrice: number;
  entryOdds: number;
  targetOdds: number;
  stake: number;
  status: string;
  pnl: number | null;
  mode: string;
  dataKind: string;
}

export default function PaperTrades() {
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    const load = () =>
      api<{ trades: Trade[] }>('/api/trades').then((r) => setTrades(r.trades)).catch(console.error);
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium">Paper Trades</h1>
          <p className="text-sm text-[var(--muted)]">Operaciones ficticias — nunca órdenes reales</p>
        </div>
        <span className="badge paper">PAPER</span>
      </header>
      <div className="panel overflow-auto rounded-md">
        <table className="data mono">
          <thead>
            <tr>
              <th>Time</th>
              <th>Trade</th>
              <th>Side</th>
              <th>Entry</th>
              <th>Odds</th>
              <th>Target Odds</th>
              <th>Stake</th>
              <th>Status</th>
              <th>PnL</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.tradeId}>
                <td>{new Date(t.timestamp).toLocaleString()}</td>
                <td className="max-w-[140px] truncate">{t.tradeId}</td>
                <td>{t.entrySide}</td>
                <td>{fmtNum(t.entryPrice, 3)}</td>
                <td>{fmtNum(t.entryOdds, 2)}</td>
                <td>{fmtNum(t.targetOdds, 2)}</td>
                <td>{fmtMoney(t.stake)}</td>
                <td>{t.status}</td>
                <td className={t.pnl !== null && t.pnl >= 0 ? 'pos' : t.pnl !== null ? 'neg' : ''}>
                  {t.pnl !== null ? fmtMoney(t.pnl) : '—'}
                </td>
                <td>
                  <Link className="text-[var(--accent)]" to={`/journal/${t.tradeId}`}>
                    Journal
                  </Link>
                </td>
              </tr>
            ))}
            {!trades.length && (
              <tr>
                <td colSpan={10} className="text-[var(--muted)]">
                  Sin paper trades todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
