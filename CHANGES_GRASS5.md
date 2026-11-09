# CHANGES_GRASS5 - single grass (3-5 blades), dense; earthy green city ground

## Grass (src/vegetation/GrassAssets.ts, src/core/Config.ts)
- The first zip's grass system is kept (same blade models, colours, LOD rings, wind, placement).
- Every tuft model now has only 3-5 blades (`grass.single`, near ring; the far rings go down to 3). `single.enabled = false` = old many-blade tufts.
- Big clumps (tussocks) are switched off (`patch.clumpChance`, `city.clumpChance`, `city.baseChance`, `verge.clumpChance` = 0): only single grass.
- Denser: `cell` 0.25 -> 0.2 m, grass nearly everywhere (`patch.coverage` 0.9, `minValue` 0.05, `coreAt` 0.35), `city.density` 1, `city.height` 0.6.
- LOD rings: ring 0 now to 20 m (was 30), ring 1 to 45 m (was 60); stride 1 / 2 / 4 as before.

## Terrain colour (only the green city ground)
- `TerrainMaterial.ts`: the bright lawn green of the city ground is now an earthy olive green (same family as the open ground).
- `Config.terrain.cityGreen`: `amount` 1 -> 0.55 (some brown soil shows through), `lawnTint` 0.65 -> 0.35.
- Terrain mesh / elevation / coordinates and the open-ground colours are unchanged.

## NOT verified (no GPU, no npm here)
Run `npm run build` first. If it is too heavy: raise `cell` (0.25), lower `patch.coverage`, or use a lower quality preset. Tests with grass counts (grass-clump-test, grass-city-test) have the old bounds.
