import { NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import LiveMarkets from './pages/LiveMarkets';
import Opportunities from './pages/Opportunities';
import PaperTrades from './pages/PaperTrades';
import TradeJournal from './pages/TradeJournal';
import Strategies from './pages/Strategies';
import Backtest from './pages/Backtest';
import MonteCarlo from './pages/MonteCarlo';
import Statistics from './pages/Statistics';
import Sensitivity from './pages/Sensitivity';
import DataQuality from './pages/DataQuality';
import Settings from './pages/Settings';

const NAV = [
  ['/', 'Dashboard'],
  ['/markets', 'Live Markets'],
  ['/opportunities', 'Opportunities'],
  ['/trades', 'Paper Trades'],
  ['/journal', 'Trade Journal'],
  ['/strategies', 'Strategies'],
  ['/backtest', 'Backtest'],
  ['/montecarlo', 'Monte Carlo'],
  ['/statistics', 'Statistics'],
  ['/sensitivity', 'Sensitivity'],
  ['/data-quality', 'Data Quality'],
  ['/settings', 'Settings'],
] as const;

export default function App() {
  return (
    <div className="flex h-full min-h-screen">
      <aside className="w-56 shrink-0 border-r border-[var(--border)] bg-[#0e1116] px-3 py-5">
        <div className="mb-6 px-2">
          <div className="mono text-[11px] tracking-[0.2em] text-[var(--muted)]">PAPER LAB</div>
          <div className="mt-1 text-sm font-medium">Polymarket Quant</div>
          <div className="mt-2 flex gap-1">
            <span className="badge paper">PAPER</span>
            <span className="badge live">NO REAL ORDERS</span>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `rounded px-2 py-1.5 text-[13px] ${
                  isActive
                    ? 'bg-[#1a2030] text-white'
                    : 'text-[var(--muted)] hover:bg-[#151922] hover:text-[var(--text)]'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto p-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/markets" element={<LiveMarkets />} />
          <Route path="/opportunities" element={<Opportunities />} />
          <Route path="/trades" element={<PaperTrades />} />
          <Route path="/journal" element={<TradeJournal />} />
          <Route path="/journal/:id" element={<TradeJournal />} />
          <Route path="/strategies" element={<Strategies />} />
          <Route path="/backtest" element={<Backtest />} />
          <Route path="/montecarlo" element={<MonteCarlo />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/sensitivity" element={<Sensitivity />} />
          <Route path="/data-quality" element={<DataQuality />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
