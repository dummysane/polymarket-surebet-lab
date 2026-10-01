import { useEffect, useState } from 'react';
import { api, fmtNum, fmtPct } from '../lib/api';

interface Opp {
  marketId: string;
  side: string;
  entryPrice: number;
  entryOdds: number;
  expectedPrice: number;
  targetOdds: number;
  distanceToTarget: number;
  confidence: number;
  edge: number;
  reason: string;
  strategyName: string;
}

export default function Opportunities() {
  const [sort, setSort] = useState('distance');
  const [opps, setOpps] = useState<Opp[]>([]);

  useEffect(() => {
    const load = () =>
      api<{ opportunities: Opp[] }>(`/api/opportunities?sort=${sort}`)
        .then((r) => setOpps(r.opportunities))
        .catch(console.error);
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [sort]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium">Opportunities</h1>
          <p className="text-sm text-[var(--muted)]">
            Surebet LIVE — favorito 1.60–1.80, emparejamiento ≥5% (PAPER)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge paper">PAPER SIGNAL</span>
          <select
            className="rounded border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="distance">Distance to Target</option>
            <option value="ev">Expected Value</option>
            <option value="liquidity">Liquidity / Stake</option>
            <option value="confidence">Confidence</option>
          </select>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {opps.map((o) => (
          <div key={o.marketId + o.side} className="panel rounded-md p-4">
            <div className="text-[11px] text-[var(--muted)]">{o.strategyName}</div>
            <div className="mt-1 text-sm font-medium leading-snug">{o.reason.split(';')[0]}</div>
            <div className="mono mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-[var(--muted)]">{o.side}</div>
                <div>{fmtNum(o.entryPrice, 3)}</div>
              </div>
              <div>
                <div className="text-[var(--muted)]">Odds</div>
                <div>{fmtNum(o.entryOdds, 2)}</div>
              </div>
              <div>
                <div className="text-[var(--muted)]">Target</div>
                <div>{fmtNum(o.expectedPrice, 3)}</div>
              </div>
              <div>
                <div className="text-[var(--muted)]">Target odds</div>
                <div>{fmtNum(o.targetOdds, 2)}</div>
              </div>
              <div>
                <div className="text-[var(--muted)]">Distance</div>
                <div className={o.distanceToTarget <= 0 ? 'pos' : ''}>
                  {fmtPct(o.distanceToTarget, 1)}
                </div>
              </div>
              <div>
                <div className="text-[var(--muted)]">Confidence</div>
                <div>{fmtPct(o.confidence, 0)}</div>
              </div>
            </div>
            <div className="mt-3">
              <span className="badge paper">PAPER SIGNAL</span>
            </div>
          </div>
        ))}
        {!opps.length && (
          <div className="text-sm text-[var(--muted)]">No hay oportunidades en rango ahora.</div>
        )}
      </div>
    </div>
  );
}
