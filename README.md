# Polymarket Live Surebet Paper Lab

Laboratorio de **paper trading** para surebets en partidos **LIVE** de Polymarket.

> **Nunca coloca órdenes reales.**

## Estrategia (simulación)

1. Solo eventos **en vivo**
2. 1ª pata en el **favorito** si la cuota está entre **1.60 y 1.80**
3. Calcula la cuota del no-favorito para cerrar surebet con **≥ 5%**
4. Cuando el underdog sube y empareja → simula 2ª pata y registra PnL

## Repo

https://github.com/dummysane/polymarket-surebet-lab

## Desplegar gratis en Render (recomendado)

[Deploy to Render](https://render.com/deploy?repo=https://github.com/dummysane/polymarket-surebet-lab)

1. Abre el enlace (cuenta gratis, sin tarjeta)
2. Confirma el Blueprint (`render.yaml` + Docker)
3. Deploy → URL HTTPS pública

El plan free se duerme ~15 min sin tráfico. Mantén vivo con ping a `/api/health` cada 10 min ([cron-job.org](https://cron-job.org)).

Detalle: [`docs/DEPLOY.md`](docs/DEPLOY.md)

## Local

```bash
cp .env.example .env
npm install
npm run build -w shared
npm run dev
```

- Dashboard: http://localhost:5173
- API: http://localhost:3001

Offline: `MARKET_DATA_MODE=mock`

## Tests

```bash
npm test
```
