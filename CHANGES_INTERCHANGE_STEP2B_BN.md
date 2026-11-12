# INTERCHANGE — Step 2b: ramp road gulo RoadNetwork-e (feature flag, default OFF)

Age apply koro: Step 1 (`evcity_interchange_foundation.zip`), Step 2a (`evcity_interchange_step2a.zip`). Tarpor eta.

## Ki hoyeche
- `Config.roads.interchange = { enabled: false, list: [] }` — **default off**. Off thakle road network **hubohu ager moto** (test diye prove kora).
- `RoadNetwork.layoutInterchanges()` — junction pad + earthen track-er **por** chole, tai pad logic ramp dekhe na. Prottek entry theke `buildInterchange()`; validation **error** thakle ba pattern bhul hole skip + `console.warn` (world build bhange na). Valid hole prottek ramp ekta `RoadSpec` (`kind: 'ramp'`, tier 3).
- `RawRoad.fixedY` + `buildFixedProfile()` — ramp-er surface height level plan theke **hubohu** (smoothing/grade-repair hoy na). Terrain cut/fill, ribbon mesh, street light — ager pipeline-i.
- `RoadNetwork.interchanges` — model-gulo public (porer step: bridge, renderer, AI eta porbe).
- `RoadGraph` — ramp-e AI spawn hoy na (`totalLength`, spot sampling, `randomSpot` theke ramp bad). Ramp-link AI Step 4-e.

## Ekhono nai (ei step-e)
Upper road-er bridge deck; ramp-er `elevated` ongsho ekhon **embankment** (matir dhal), pier/deck na; ramp-er gore/merge-e junction pad/taper — ramp-er shuru/shesh road-er lane-er upor **overlap** kore (flag on korle ei jaygay chhoto z-fight dekhte paro). AI ramp-e chole na. Eigulo Step 2c–4.

## Verify
- `scripts/interchange-network-test.ts` (notun, asol `TerrainGenerator`/`RoadNetwork`, ~40 s): ALL OK — flag off: ramp 0; flag on: 8 ramp road, **ager 341 road-er point/height hubohu same**, ramp height level plan-er sathe exact, pad sonkha same, deterministic (2 build same), RoadGraph spawn length same + `randomSpot` kokhono ramp pick kore na, bhul pattern skip + warn + bhalo-ta build.
- `tsc` (pura project): original main-er sathe error-er list **hubohu ek** (notun 0).
- `road-test.ts` (flag off): main-er moto-i 79 PASS, **2 FAIL ager theke-i ache** ("terrain equals the pad plane ... 0.4451 m", "all 341 roads form one connected network (128)") — original main-eo ekii; eta amar bodol-er karone na.
- `interchange-test.ts` ALL OK.
- Game chalano jayni (`node_modules` nai), tai flag on kore **chokhe dekha** tomar kaj.

## Notun / bodlano file
`src/core/Config.ts` (energy block-o ache: aistation-er sathe merge kora, order-e somossha nai), `src/roads/RoadNetwork.ts` (2a-r `KIND.ramp` shoho), `src/traffic/RoadGraph.ts`, `scripts/interchange-network-test.ts`, `docs/INTERCHANGE_SYSTEM_BN.md`.
