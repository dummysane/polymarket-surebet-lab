# Phase changelog

## FASE 1 — Market data scaffold
- Monorepo npm workspaces: `shared`, `database`, `backend`, `frontend`, `scripts`
- Prisma schema + Docker Compose PostgreSQL
- `MarketDataProvider` + `PolymarketGammaClobProvider` (Gamma + CLOB REST)
- Sports filter via `/sports` tags
- `MockMarketDataProvider` clearly labeled
- `RealExecutionEngine` stub hard-disabled
- Docs: `docs/POLYMARKET_API.md`

## FASE 2 — Snapshots + data quality
- `MemoryStore` persists market snapshots in-memory (Prisma ready when DB up)
- `DataQualityGate` blocks STALE/invalid for signals

## FASE 3 — Live UI + WSS
- `ClobMarketWebSocket` official market channel
- Frontend Live Markets page
- Backend WS fan-out `/ws`

## FASE 4 — StrategyEngine
- Shared engine for LIVE and BACKTEST
- `FavoriteHedgeStrategy` (5% target hedge)
- Opportunities API + UI

## FASE 5 — Paper trading
- Latency, slippage, liquidity, partial fills, execution probability
- `PortfolioManager` virtual bankroll

## FASE 6 — Settlement
- `SettlementEngine` from observed resolution fields only

## FASE 7 — Statistics
- Global + categorical + rolling regime + Wilson CI + break-even + verdicts

## FASE 8 — Backtest
- `HistoricalCsvProvider` + sample CSV
- Same StrategyEngine path

## FASE 9 — Monte Carlo
- Seeded simulator + bankroll curves P5–P95

## FASE 10 — Sensitivity
- Parameter grid + heatmaps + error scenarios A–I

## FASE 11 — Dashboard complete
- All sidebar pages, journal snapshots, alerts, CSV/JSON export, `strategy_report.json`
