# INTERCHANGE FOUNDATION — Step 1 (shob interchange-er common jinis)

**Shudhu notun file. Game-er kono purono file bodlay ni, tai game-e kono poriborton hobe na (ekhono wired na).**

## Ki hoyeche
- `src/interchange/` — pure TypeScript module (three.js / game import nai): ramp geometry, height/level plan, pattern table, validator, AI link, instanced part data, decoration zone, `RoadSpec` adapter.
- 3 ta pattern: **diamond** (4 ramp), **cloverleaf** (8), **partial cloverleaf** (4). Left-hand traffic-er jonno.
- Notun pattern = `registerPattern(...)` e ek row (role table) — notun geometry/renderer na.
- `scripts/interchange-test.ts` — 41 check (ramp sonkha, validation, deterministic, 5 ta yaw-e ghurale same, cross-road bridge, left-hand join, custom pattern, bhul input dhora). **ALL OK.**
- `scripts/interchange-preview.ts` + `docs/interchange-preview/` — 3 pattern-er top-view SVG/PNG.
- `docs/INTERCHANGE_SYSTEM_BN.md` — design, parameter table, load niyom, **wiring checklist (porer step)**, shimana.

## Ki nai (ekhono)
RoadNetwork/Junctions/RoadGraph/AI/renderer-er sathe jora (Step 2+). Ramp physics check kora hoy ni. Trumpet / stack / collector-distributor pattern nai.

## Verification
- `tsx scripts/interchange-test.ts` -> ALL OK. Build ~1–8 ms per interchange.
- `tsc --strict --noUnusedLocals --noUnusedParameters` interchange file + script-e error nai (asol `RoadSpec` type-er biruddhe).
- Top-view SVG nijer chokhe dekha: 4 loop + 4 slip alada quadrant-e, ramp-er dik left-hand, gap >= 14 m.
- Pura game `npm run typecheck`/build chalano jayni (`node_modules` nai); jehetu kono existing file bodlay ni, jhuki nai.

## Porer step (prostab)
1. `RoadKind 'ramp'` + network-e ramp dhukano + upper road-e bridge deck. 2. Junction pad (terminal) + AI link. 3. Renderer (instanced parts, decor zone). 4. Median/sign/gach interchange-aware. 5. Tomar screenshot-er junction-e prothom diamond/parclo boshano.
