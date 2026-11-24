# ROAD BRIDGES (sob road a bridge) - kon file bodlalo

## Somossa
Game a 62 ta bridge register kora chilo, kintu tar moddhe 35 ta (R6-7, R4-*, R2-*, C-1) er kono deck mesh, pier ba collider chilo na:
shudhu road ribbon hawa te jhulchilo, upor diye gari/player cholte parto na. Ar R6-10, R6-11 nodi er upor diye 11 m uchu mati-r bandh diye gechilo, bridge-i register hoy nai.

## Ki kora holo
1. `src/roads/RoadNetwork.ts` - notun `bridgeWetGaps()`: R6/R4/R2/C/L road er jei jaygay nodir pani er upor road ache kintu bridge nai, shekhane bridge register kore (high fill thakle puro fill-stretch, duto pase 16 m approach slab). R6-10 (i161-169, 64 m) ar R6-11 (i24-35, 88 m) paise.
2. `src/roads/ring/RingBridgeGeometry.ts` - notun `roadViaduct()` (deck + parapet + abutment + collision face + pier). Soru road (2 lane) = 1 ta wall pier, chaura road (4/6 lane) = 2 ta column. Onno road pier er niche thakle pier soriye dey / bad dey. Notun `otherRoadStructures()`; `ringStructures()` o design number BODLAYNI.
3. `src/roads/ring/RingStructureLayer.ts` - ring+arm bridge er pashapashi ei 37 ta bridge o mesh + collider paye.
4. `scripts/road-bridges-check.ts` (notun) - 10 check.

## Check (npx tsx ...)
- road-bridges-check: 10 PASS 0 FAIL (64 bridge, sob er deck owner ache, 37 ta notun deck, 23 ta te pier, nodir upor bridge-hin road 0).
- Age theke fail kora check (ring-facade, j1-arms-game, ring-bridge-mesh, rail-city-profile) original code a o EKOI fail, notun fail nai. railway PLAN same (j1-arms-game: PASS).
- mission-test, r6-game-check, ring-structures-check: PASS. tsc: amar file a error nai.
- NOT RUN: npm run build (node_modules nai), game a dekha. `test:tower` package.json a nai.
