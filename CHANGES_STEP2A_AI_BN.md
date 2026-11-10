# STEP 2A — AI energy model (pure numbers)

Notun file (kono purono file bodlayni):
- `src/traffic/AIEnergy.ts` — AI gari-r energy: `makeAiEnergy` (spawn level 30–100 %, driver threshold 15–35 %), `drainAi` (Energy.ts-er `consumptionFactor`, player-er moto), `aiNeed` (none / normal / emergency <10 % / empty), `rangeLeftM`, `canReach`, `siteAccepts` (fuel gari -> fuel station; bus -> bus bay cp-03/06/09; onno EV -> CP ba station), `refillAi`.
- `scripts/ai-energy-test.ts` — 46 PASS (`npx tsx scripts/ai-energy-test.ts`).

Check: `tsc --strict` direct AIEnergy.ts + test-e clean; full `npx tsc --noEmit` sandbox-e shudhu vite/node types missing error dey (code error na).
Ekhono Vehicle / TrafficManager-e connect kora hoyni (Step 2D).
