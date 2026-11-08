# Grass rework: PATCHES + big CLUMPS + brown soil ground

## 1. Grass grows in patches (no more even, thin scatter)
- A low-frequency noise (`Config.vegetation.grass.patch.scale` = 40 m) decides where grass grows. `coverage` (0.22) = share of the land inside a patch
  (the noise threshold is found from the world seed, so it is a real share).
- Inside a patch (core): dense cover. Tufts keep exactly their old density (`density` 1) and clumps are close together and overlap (`clumpChance`).
- Outside a patch: bare soil, no tuft at all (patch value below `minValue` 0.25).
- Soft rim: median 3.8 m wide (`edge`); at the rim there are fewer and smaller tufts / clumps (`edgeScale` = size at the very rim).
- Road sides and landmark plots (mall, EVLab, library, agro, airport, army, SWTP / STP, placed buildings) are pulled into a patch (`boost`, `roadStep`,
  `landmarkReach`), with the same soft rim.
- Amount: total instances (tufts + clumps) are ~28 % of the old amount (measured around 4 city sites), ~34 % of the old blade count.
- Still deterministic, and a far LOD ring is exactly a subset of the full tile (tufts and clumps).

## 2. Clumps (tussocks)
- One clump = 60..110 blades from one root, tall and upright in the middle, arching outwards at the edge, ~0.6..1.7 m wide, 0.55..1.2 m tall.
  Models `GrassType.tussock` / `tussockWide` in `GrassAssets.ts`, in all 3 LOD rings. Own grid `clump.cell` 1.6 m, only inside patches.
- `GRASS_STRIDE` is 8: the last float is the clump flag (0 tuft, 1 clump).

## 3. Ground: brown soil is the main terrain
- `Config.terrain.soilFrom / soilTo` (0.30 / 0.44, was 0.50 / 0.64 hard-coded in the shader): soil covers ~80 % of the flat land. Lower = more soil.

## Files
`src/core/Config.ts`, `src/terrain/TerrainMaterial.ts`, `src/vegetation/{GrassPlacement,GrassAssets,GrassManager,TreeTypes}.ts`, `src/workers/messages.ts`,
`scripts/grass-clump-test.ts`.

## Test
`npx tsx scripts/grass-clump-test.ts`: amount 20-32 % of the old, no tuft / clump outside a patch, no tuft farther than 8 m from a core (0.5 %), rims 2.5-6 m,
core density = old meadow, no grass in water / beach / roads / steep ground, deterministic, LOD subset. All OK. A tile takes ~110 ms in the worker.
