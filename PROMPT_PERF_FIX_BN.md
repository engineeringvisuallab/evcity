# PROMPT (new chat): EVCity game load / FPS fix - step by step

Project: eee.zip (EVCity, three.js + Electron-free web game). Read FIRST: HANDOFF.md, PERFORMANCE_RULES.md, newest CHANGES_*.md.
Reply in Banglish. After EVERY step: (1) `npx tsc --noEmit` + tests of the touched area, (2) a CHANGES_*.md, (3) update HANDOFF.md, (4) give the FULL project zip AND a zip of the changed files (with paths), then go to the next step. Do not break existing systems. Do not set a draw/triangle number by guessing: measure with the overlay.

## PROGRESS (update after every step)
- Step 1 marineFish: DONE (see CHANGES_PERF_STEP1_MARINEFISH_BN.md; 1.18 M -> 0 on land / ~4 k at sea at low; headless numbers, browser F2 re-measure still to do by the user).
- Steps 2-8: not started.

## Problem
The game is heavy and the PC hangs. User PC: GTX 1050 (ANGLE Direct3D11), 12 cores, 16 GB, Chrome, preset low, shadow off, canvas 0.5-1.3 MP. FPS ~24-30, frame ~33 ms.
The J1 signal masts are NOT the cause (3 draw calls, ~3000 triangles; FPS the same with `?j1masts=0`).

## Measured with the overlay (F2 -> Copy report; the report ends with a "HEAVIEST" list: visible meshes in view, grouped by name, triangles | meshes | instances; PerfOverlay.heavyList)
Three reports (preset low): triangles 3.65 M / 3.59 M / 2.78 M, draw calls 1736 / 675 / 2441, geometries 4122 / 3198 / 4207, textures 171 / 118 / 181, JS heap 620 / 563 / 637 MB (earlier runs up to 1.9 GB), colliders ~17,000 (16921 / 17139 / 17248), dyn-res scale 0.60 / 0.95 / 1.00, FPS always about 30.
Top consumers in ALL three (triangles):
- `Scene > WorldRoot > marineFish`: 1,178,496 triangles, 1 mesh, 528 instances = about 1/3 of everything, always drawn. ==> STEP 1.
- `WorldRoot > fill-buildings > Mesh`: 391k - 622k triangles, ~480-520 meshes, 1600-2340 instances.
- `WorldRoot > vegetation > trees kind0..kind17`: together about 1.5 - 2 M in the park view (kind17 608k, kind15 284k, kind16 179k, kind12 138k ...), only 3-8 meshes per kind.
- `WorldRoot > CityLibrary > Mesh`: 118k triangles in ONE mesh with 9854 instances.
- `EVLabGrounds > EVLabFountains > Mesh`: 72k (2073 instances). `Scene > Mesh`: 148k in 1291 meshes (cars / people / props?). `Scene > SkinnedMesh`: 105k (21 = people).
- terrain `LOD0` tiles 33,792 triangles each; rail 39k; train 35k; `junction-j1-ground` 36k.

## Steps (one by one, measure before and after with the same view)
1. `marineFish` (1.18 M): find the code (grep marineFish). Per fish triangle count, instance count 528, distance / frustum culling, LOD (far fish = few triangles or billboards), a Quality.ts preset field (low = 35-60 % of high, PERFORMANCE_RULES.md 2.1), only near water / near the player. Target: <= 100 k triangles at low. Re-measure.
2. Trees (`vegetation > trees kindN`): per-kind triangle count, LOD levels / impostors for far trees, far-density per preset in Quality.ts, instance culling by distance. Target: trees <= 400 k at low.
3. `fill-buildings` (0.4-0.6 M, 500 meshes): simpler far geometry, merge, distance cull, preset field.
4. Small ones: CityLibrary instanced mesh (9854 instances x 12 tris), fountains, cars / people (`Scene > Mesh` 1291 meshes), terrain LOD0 count, rail / train.
5. DYNAMIC RESOLUTION: `DynamicResolution` in Quality.ts: scale 0.60 .. 1.00 while FPS stays 30 (so it already reacts, but the bottleneck is triangles / draw calls, not pixels). Make it also reduce far draw distance / density when FPS < 30 for > 3 s, and do not let the render-resolution drop hide the real problem.
6. COLLIDERS ~17,000: why so many; stream them by `PhysicsConfig.activeRadius`, drop far ones, check trimesh colliders.
7. MEMORY: JS heap 0.6 - 1.9 GB and rising between runs. Stand still 5 min, take two reports 5 min apart; if heap / geometries (3000-4200) / textures (118-181) grow, find the leak (dispose of geometry / material / texture, chunk unload, people / cars despawn). Geometries 4000+ is itself high: share geometries.
8. Final: one more 3-place report (EVLab parking lot, J1 centre, open field), compare with the numbers above, write the result into HANDOFF.md. Target at low on this PC: <= 1.2 M triangles, <= 1000 draw calls, steady 45-60 FPS.

## Also (not perf): J1 signal masts
The 4 masts of J1 stand on the 4 ash median island heads (o = -W, s = 19.75 + 0.8). Not seen in a running game by the AI. If the user says the position / arm length / head visibility is wrong, adjust `MAST_S_IN` in `src/traffic/J1MastSpec.ts` and `TrafficSignals.makeJ1`; test `npx tsx scripts/j1-signal-mast-check.ts`.
