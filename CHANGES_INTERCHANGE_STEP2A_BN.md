# INTERCHANGE — Step 2a: `RoadKind 'ramp'` (shudhu type, behaviour ek)

(Step 1 `evcity_interchange_foundation.zip` ager upor. Eta tar porer chhoto dhap.)

## Ki hoyeche
`RoadKind`-e notun ekta man `'ramp'` (one-way, 1 lane ramp). Type bodlale je jaygay `Record<RoadKind, ...>` ba `KIND[kind]` ache, shegulote ekta row joda holo, nahole TypeScript error dito:
- `src/roads/RoadTypes.ts` — `RoadKind`-e `'ramp'`.
- `src/roads/RoadNetwork.ts` — `KIND.ramp` (halfWidth 4.2, 1 lane, 50 km/h, grade 0.05, step 8).
- `src/roads/Junctions.ts` — `STUB.ramp = 26`, `KERB.ramp = 12` (collector-er moto).
- `src/environment/StreetLights.ts` — `CLASS.ramp` (arterial-er kachhakachhi).
- `src/vehicles/VehicleUse.ts` — `ALL_ROADS` ar `MAIN_ROADS`-e `'ramp'` (gari ramp-e chalte parbe); `CITY_ROADS` / `STREETS`-e na (ramp freeway-r ongsho).
- `src/interchange/RoadAdapter.ts` — placeholder `'collector'` er jaygay `'ramp'`.
- `docs/INTERCHANGE_SYSTEM_BN.md` — Wiring table-e step 1 tick.

## Behaviour
**Kono poriborton nai.** Ekhon kono road-i `kind: 'ramp'` na, tai notun row gulo kokhono pora hoy na. Game ager moto-i.

## Verify
- Pura project `tsc` (strict) — original main-er sathe error-er list **hubohu ek** (109 ta noise, shob missing `three`/`rapier` type theke). Notun error 0. (Check-er upay: `Junctions.ts` er row sriye dile TS2741 error ashe, mane check kaj kore.)
- `scripts/interchange-test.ts` ALL OK, `scripts/station-visit-test.ts` ALL OK.
- Game chalano jayni (`node_modules` nai).

## Porer dhap (Step 2b)
Ekta interchange (`diamond`) `RoadNetwork`-e ramp road hishebe dhukano — kintu ekta feature-flag-er pichone (default off), jate game nosto na hoy.
