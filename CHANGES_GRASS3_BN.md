# Step 4: 80 % less grass + big grass CLUMPS in the important places

## What the player gets
- About 87 % fewer grass instances (tufts + clumps) and about 80 % fewer blades than before (measured around 4 city sites, see the test below).
- The grass that stays in the important places is made of big CLUMPS: 60..110 blades growing out of one root, tall and upright in the
  middle, arching outwards at the edge (like real bunch grass), about 0.6..1.7 m wide and 0.55..1.2 m tall.

## How it works
- `Config.vegetation.grass.thin = 0.12`: the small tufts are only 12 % of what they were (same deterministic subset, so nothing jumps between LOD rings).
- `Config.vegetation.grass.clump`: clumps grow on their own 1.6 m grid, in groups with gaps between them (noise, `groupScale`):
  - full chance (`chanceImportant`) next to roads (road mask widened by `roadStep`) and around landmark plots / placed buildings
    (mall, EVLab, library, agro, airport, army, SWTP / STP, placed buildings: full chance within `landmarkReach` = 24 m, half chance up to 48 m);
  - a lower chance (`chanceMeadow`) in lush open meadow; half as many inside planned city areas, thinner in forests.
- Clumps obey exactly the same no-grass rules as tufts (water, beach, roads, rail, steep ground, airports, plots, fields ...): `GrassPlacer.blocked()`.
- New models in `GrassAssets.ts`: `GrassType.tussock` (upright, dense) and `GrassType.tussockWide` (wider, more arching, some straw blades). They exist in
  all 3 LOD rings (far rings: fewer blades `clumpDensity`, a bit wider `clumpSize`, every 2nd clump `clumpStride` in the last ring).
- Data layout: `GRASS_STRIDE` 7 -> 8, the new last float is the clump flag (0 tuft, 1 clump). Workers / manager / tests use the constant.

## Files
`src/core/Config.ts`, `src/vegetation/{GrassPlacement,GrassAssets,GrassManager,TreeTypes}.ts`, `src/workers/messages.ts`, `scripts/grass-clump-test.ts` (new).

## Tests
`npx tsx scripts/grass-clump-test.ts`: instance + blade reduction, clumps not in water / beach / on roads / steep ground, road sides >= 2x denser than open
meadow, deterministic, far ring is a subset of the full tile. All OK. Tweak the look with `thin`, `clump.chanceImportant`, `clump.chanceMeadow`,
`clump.width` / `clump.height`.
