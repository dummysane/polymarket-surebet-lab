# Polymarket Paper Lab

Laboratorio cuantitativo de **paper trading** para mercados deportivos YES/NO de Polymarket.

> **Nunca coloca órdenes reales.** El módulo `RealExecutionEngine` está permanentemente desactivado.

## Arranque rápido

```bash
cp .env.example .env
npm install
npm run build -w shared
# Opcional si tienes Docker:
docker compose up -d
npm run db:generate
npm run db:push
# Sin Docker: el backend usa MemoryStore y funciona igual para paper trading
npm run dev
```

- API: http://localhost:3001
- Dashboard: http://localhost:5173

Para desarrollo offline sin red Polymarket:

```bash
# en .env
MARKET_DATA_MODE=mock
```

## Qué responde el sistema

> Si hubiera usado esta estrategia en N mercados observados, con comisiones, slippage, latencia, liquidez y fallos de ejecución… ¿habría ganado dinero?

## Arquitectura

Ver plan e interfaces en:

- [`docs/POLYMARKET_API.md`](docs/POLYMARKET_API.md) — endpoints oficiales usados
- [`docs/PHASES.md`](docs/PHASES.md) — fases implementadas

Motores principales:

| Motor | Rol |
|---|---|
| MarketDataProvider | Gamma/CLOB/CSV/Mock |
| StrategyEngine | Único para LIVE + BACKTEST |
| PaperTradingEngine | Fills simulados |
| PortfolioManager | Bankroll ficticio |
| SettlementEngine | Resolución observada |
| StatisticsEngine | Inferencia estadística |
| MonteCarlo / Sensitivity | Escenarios SIMULATION |

## Tests

```bash
npm test
```

Caso canónico: `favoriteOdds = 1.50` → `targetOdds ≈ 3.50`.

## Export

- `/api/export/trades?format=csv`
- `/api/export/strategy-report`
- `/api/export/ticks?format=json`

## Licencia / aviso

Solo investigación y simulación. No es consejo financiero. No opera capital real.
