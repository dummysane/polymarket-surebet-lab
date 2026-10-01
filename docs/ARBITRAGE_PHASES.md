# Arbitraje surebet por fases (PAPER)

Estrategia: **LiveSurebetArb** — solo simulación, nunca órdenes reales.

## Flujo

```
F0 SCAN LIVE
    │  ¿partido in-play?
    ▼
F1 OPEN FAVORITE
    │  cuota favorito ∈ [1.60, 1.80]
    │  → simular 1ª pata PAPER
    ▼
F2 WAIT UNDERDOG
    │  esperar a que suba el no-favorito
    │  hasta 1/fav + 1/dog ≤ 1/1.05
    ▼
F3 COMPLETE SUREBET
    │  simular 2ª pata PAPER
    │  beneficio bruto bloqueado ≥ 5%
    ▼
F4 LOCKED
       PnL paper registrado (REALIZED)
```

## Matemática

Con favorito a cuota `F` y objetivo de beneficio `g = 0.05`:

```
targetDogOdds = 1 / (1/(1+g) - 1/F)
```

Ejemplo: `F = 1.70` → `targetDogOdds ≈ 2.92`.

Surebet lista cuando:

```
1/F + 1/D ≤ 1/(1+g)
```

## Qué NO hace

- No opera pre-match
- No abre underdog primero
- No envía órdenes a Polymarket
- No declara “rentable” sin muestra estadística suficiente
