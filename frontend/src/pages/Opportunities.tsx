import { useEffect, useState } from 'react';
import { api, fmtNum, fmtPct } from '../lib/api';

interface Opp {
  marketId: string;
  side: string;
  hedgeSide: string;
  entryPrice: number;
  entryOdds: number;
  expectedPrice: number;
  targetOdds: number;
  underdogOddsNow?: number;
  surebetProfitPct?: number | null;
  surebetSum?: number;
  arbPhase?: string;
  action?: string;
  distanceToTarget: number;
  confidence: number;
  edge: number;
  reason: string;
  strategyName: string;
}

const PHASE_LABEL: Record<string, string> = {
  F0_SCAN_LIVE: 'F0 SCAN',
  F1_OPEN_FAVORITE: 'F1 ABRIR FAVORITO',
  F2_WAIT_UNDERDOG: 'F2 ESPERAR UNDERDOG',
  F3_COMPLETE_SUREBET: 'F3 CERRAR SUREBET',
  F4_LOCKED: 'F4 BLOQUEADO',
};

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
            Arbitraje por fases — F1 favorito 1.60–1.80 → F2 wait → F3 surebet ≥5% (PAPER)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge paper">PAPER</span>
          <span className="badge live">LIVE ONLY</span>
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
          <div key={o.marketId + (o.arbPhase ?? '') + o.side} className="panel rounded-md p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge live">{PHASE_LABEL[o.arbPhase ?? ''] ?? o.arbPhase ?? '—'}</span>
              <span className="badge paper">{o.action ?? 'SIGNAL'}</span>
            </div>
            <div className="mt-2 text-sm font-medium leading-snug">{o.reason.split(' | ')[1] ?? o.reason}</div>
            <div className="mono mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-[var(--muted)]">Favorito {o.side}</div>
                <div>
                  {fmtNum(o.entryPrice, 3)} · {fmtNum(o.entryOdds, 2)}
                </div>
              </div>
              <div>
                <div className="text-[var(--muted)]">Underdog {o.hedgeSide}</div>
                <div>
                  ahora {fmtNum(o.underdogOddsNow ?? 0, 2)} → obj {fmtNum(o.targetOdds, 2)}
                </div>
              </div>
              <div>
                <div className="text-[var(--muted)]">Distancia</div>
                <div className={o.distanceToTarget <= 0 ? 'pos' : ''}>
                  {fmtPct(o.distanceToTarget, 1)}
                </div>
              </div>
              <div>
                <div className="text-[var(--muted)]">Surebet</div>
                <div className={o.surebetProfitPct != null && o.surebetProfitPct >= 0.05 ? 'pos' : ''}>
                  {o.surebetProfitPct != null
                    ? `${(o.surebetProfitPct * 100).toFixed(1)}%`
                    : '—'}
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">{o.reason}</p>
          </div>
        ))}
        {!opps.length && (
          <div className="text-sm text-[var(--muted)]">
            Sin oportunidades F1/F2/F3 en vivo ahora.
          </div>
        )}
      </div>
    </div>
  );
}
