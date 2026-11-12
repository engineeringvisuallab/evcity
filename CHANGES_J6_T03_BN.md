# J6 T03 — Demand model

`src/interchange/demand/Demand.ts` (pure, game-e kono change nei):
- `demandFor(main, cross, overrides?, counts?)` -> `Demand` (Analysis.ts-er type, 4 approach circulation order-e).
- `resolveDemand(...)` -> demand + kon number kotha theke elo (`override` / `count` / `default`), T10 panel-er jonno.
- Priority: user override > AI count (jodi provider dewa hoy) > road-class default (highway 1800/150/100, collector 250/120/80, arterial, local).
- Invalid (negative / NaN) number ignore hoy.

Test: `npx tsx scripts/demand-test.ts` (ALL OK). tsc-te notun error nei.
Baaki: AI traffic count provider wire kora (T09/T10).
