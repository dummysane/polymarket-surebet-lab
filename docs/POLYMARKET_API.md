# Polymarket API Integration

This document lists **only official public endpoints** used by Paper Lab.
Source of truth: [https://docs.polymarket.com](https://docs.polymarket.com/llms.txt)

**This system never places real orders.** CLOB write endpoints and authenticated user channels are intentionally unused.

## Architecture overview

| Layer | Base URL | Auth | Purpose |
|---|---|---|---|
| Gamma Markets API | `https://gamma-api.polymarket.com` | None (public) | Discover events, markets, sports metadata, resolution state |
| CLOB API (read) | `https://clob.polymarket.com` | None for public reads | Order books, prices, midpoints, spreads |
| CLOB Market WebSocket | `wss://ws-subscriptions-clob.polymarket.com/ws/market` | None | Real-time book / price updates |
| Sports WebSocket | `wss://sports-api.polymarket.com/ws` | None | Live scores (informational only) |
| Data API | `https://data-api.polymarket.com` | None | Aggregated price history buckets |

## Gamma — sports discovery

### `GET /sports`
Returns sports metadata including tag IDs used to filter markets.

### `GET /sports/market-types`
Valid sports market type strings (e.g. moneyline, spread, total, prop).

### `GET /teams`
Team roster metadata (`league`, `name`, `abbreviation` filters).

## Gamma — events and markets

### `GET /events/keyset`
Cursor-paginated events. Used with:

- `closed=false`
- `tag_id=<sport tag>`
- `limit` (max 100)
- `after_cursor` from previous `next_cursor`

### `GET /markets/keyset`
Cursor-paginated markets. Used with:

- `closed=false`
- `tag_id`
- `sports_market_types`
- `include_tag=true`
- `game_id` when available

### `GET /markets/{id}` / `GET /events/{id}`
Market/event detail including `clobTokenIds`, `outcomes`, `closed`, `uma_resolution_status`.

### `GET /events/slug/{slug}` / `GET /markets/slug/{slug}`
Lookup by Polymarket slug.

### `GET /tags/slug/{slug}`
Resolve tag slug → numeric `tag_id` for filtering.

## CLOB — prices and liquidity (read-only)

### `GET /book?token_id=`
Full aggregated order book for an outcome token. Used for bid/ask/liquidity.

### `POST /books`
Batch order books.

### `GET /price?token_id=&side=BUY|SELL`
Top-of-book price for a side.

### `POST /prices`
Batch prices.

### `GET /midpoint?token_id=`
Midpoint price.

### `GET /spread?token_id=`
Bid-ask spread.

### `GET /last-trade-price?token_id=`
Last trade price.

## CLOB Market WebSocket

Endpoint: `wss://ws-subscriptions-clob.polymarket.com/ws/market`

Subscribe (token IDs = `clobTokenIds`):

```json
{
  "assets_ids": ["<token_id>"],
  "type": "market",
  "initial_dump": true
}
```

Heartbeat: client sends text `PING` every 10s; server replies `PONG`.

Events used: `book`, `price_change`, `last_trade_price` (observed data only).

## Sports WebSocket (informational)

Endpoint: `wss://sports-api.polymarket.com/ws`

No subscription frame. Server sends `ping`; client replies `pong`.

Used only for game status awareness — **never** as a trading signal source by itself.

## Data API — historical (aggregated)

### `GET /v2/prices-history?token_id=&interval=&bucket_seconds=`
Bucketed history. **Not tick-level.**

For high-frequency backtests we use:

1. Our own `market_snapshots` table (OBSERVED ticks we stored), or
2. `HistoricalCsvProvider` CSV import (clearly labeled BACKTEST)

## Resolution / settlement

Settlement reads Gamma market fields:

- `closed`
- `uma_resolution_status`
- outcome prices / winning token when resolved

We do **not** invent results. Unresolved markets stay open in paper books.

## Explicitly NOT used

| Endpoint / channel | Reason |
|---|---|
| `POST /order` | Would place real orders |
| `DELETE /order` | Real order management |
| CLOB L1/L2 auth | Not required for paper lab |
| User WebSocket channel | Authenticated order updates |

`backend/src/execution/RealExecutionEngine.ts` exists as a **disabled stub** (`ENABLED = false`) for future separation only.

## Adapters in this repo

| Class | Mode | Notes |
|---|---|---|
| `PolymarketGammaClobProvider` | LIVE | Official Gamma + CLOB |
| `HistoricalCsvProvider` | BACKTEST | CSV tick replay |
| `MockMarketDataProvider` | MOCK | Tests / offline only — clearly marked |

## Data kind badges

Every payload is tagged:

- `OBSERVED` — from Polymarket APIs
- `SIMULATED` — paper fills / Monte Carlo
- `ESTIMATED` — signals, fair prices, CIs
- `REALIZED` — settled paper trade PnL
