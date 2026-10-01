# Deploy: Live Surebet Paper Lab

## Qué hace en producción

Escanea mercados deportivos **LIVE** de Polymarket, simula surebets paper:

1. Abre 1ª pata en el **favorito** (cuotas 1.60–1.80 por defecto)
2. Espera a que el no-favorito suba hasta completar surebet ≥ **5%**
3. Simula 2ª pata y registra si se habría ganado/perdido

**Nunca envía órdenes reales.**

## Opción recomendada gratis: Render

1. Sube el repo a GitHub (público o privado).
2. Entra en [https://render.com](https://render.com) → New → Blueprint
3. Conecta el repo (detecta `render.yaml`)
4. Deploy

O manualmente:

- **New → Web Service**
- Runtime: **Docker**
- Plan: **Free**
- Health check: `/api/health`

URL típica: `https://polymarket-surebet-lab.onrender.com`

### Limitación free de Render

El servicio **se duerme tras ~15 min sin tráfico**. Para análisis continuo:

- Abre el dashboard de vez en cuando, o
- Usa un ping externo gratis (p. ej. [cron-job.org](https://cron-job.org)) cada 10 min a `/api/health`

## Alternativa local 24/7

```bash
npm install
npm run build
MARKET_DATA_MODE=live LIVE_ONLY=true npm start
```

## Variables clave

| Var | Default | Significado |
|---|---|---|
| `LIVE_ONLY` | true | Solo partidos en vivo |
| `MIN_ODDS` / `MAX_ODDS` | 1.60 / 1.80 | Rango favorito 1ª pata |
| `TARGET_PROFIT` | 0.05 | Surebet mínimo 5% |
| `REAL_EXECUTION_ENABLED` | false | Siempre off |
