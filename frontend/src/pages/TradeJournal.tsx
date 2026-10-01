import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, fmtMoney, fmtNum } from '../lib/api';

export default function TradeJournal() {
  const { id } = useParams();
  const [trades, setTrades] = useState<{ tradeId: string }[]>([]);
  const [detail, setDetail] = useState<{
    trade: Record<string, unknown>;
    events: Array<{ timestamp: string; type: string; payload: Record<string, unknown> }>;
    priceSnapshots: Record<string, number | null>;
  } | null>(null);

  useEffect(() => {
    api<{ trades: { tradeId: string }[] }>('/api/trades')
      .then((r) => setTrades(r.trades))
      .catch(console.error);
  }, []);

  useEffect(() => {
    const tradeId = id ?? trades[0]?.tradeId;
    if (!tradeId) return;
    api<typeof detail>(`/api/trades/${tradeId}`).then(setDetail).catch(console.error);
  }, [id, trades]);

  if (!detail?.trade) {
    return <div className="text-[var(--muted)]">Selecciona un trade en Paper Trades.</div>;
  }

  const t = detail.trade as {
    tradeId: string;
    entryPrice: number;
    targetPrice: number;
    maxPriceReached: number | null;
    timestamp: string;
    timeToTargetMs: number | null;
    slippage: number | null;
    status: string;
    pnl: number | null;
    closeReason: string | null;
    stake: number;
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-medium">Trade Journal</h1>
        <p className="mono mt-1 text-sm text-[var(--muted)]">{t.tradeId}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Entry" value={fmtNum(t.entryPrice, 4)} />
        <Info label="Target" value={fmtNum(t.targetPrice, 4)} />
        <Info label="Max reached" value={fmtNum(t.maxPriceReached, 4)} />
        <Info label="PnL" value={t.pnl !== null ? fmtMoney(t.pnl) : '—'} />
        <Info label="Stake" value={fmtMoney(t.stake)} />
        <Info label="Slippage" value={t.slippage !== null ? fmtNum(t.slippage, 4) : '—'} />
        <Info
          label="Time to target"
          value={t.timeToTargetMs != null ? `${(t.timeToTargetMs / 1000).toFixed(1)}s` : '—'}
        />
        <Info label="Close reason" value={t.closeReason ?? t.status} />
      </div>

      <div className="panel rounded-md p-4">
        <h2 className="text-sm font-medium">Price snapshots around signal</h2>
        <div className="mono mt-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-5">
          {Object.entries(detail.priceSnapshots).map(([k, v]) => (
            <div key={k} className="border border-[var(--border)] p-2">
              <div className="text-[var(--muted)]">{k}</div>
              <div>{v !== null ? fmtNum(v, 4) : '—'}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel overflow-auto rounded-md">
        <table className="data mono">
          <thead>
            <tr>
              <th>Time</th>
              <th>Event</th>
              <th>Payload</th>
            </tr>
          </thead>
          <tbody>
            {detail.events.map((e, i) => (
              <tr key={i}>
                <td>{new Date(e.timestamp).toLocaleString()}</td>
                <td>{e.type}</td>
                <td className="max-w-[480px] truncate">{JSON.stringify(e.payload)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel rounded-md p-3">
      <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">{label}</div>
      <div className="mono mt-1 text-sm">{value}</div>
    </div>
  );
}
