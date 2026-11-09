# CHANGES_GRASS5 - textured grass cards, dark green, dense everywhere

Terrain mesh, elevation and coordinates are NOT touched (no change in src/terrain/Terrain{Generator,MeshData,ChunkBuilder,Physics}.ts). Only the terrain shader colour changed.

## What changed
- `public/assets/grass-atlas.webp` (new): 42 grass clusters cut from the two grass sheets (35 green, 7 dry/straw), 8 x 6 cells.
- `src/vegetation/GrassAtlasData.ts` (new, generated): cell heights + classes (low / mid / tall green, dry).
- `src/vegetation/GrassCards.ts` (new): card geometry (3 / 2 / 2 crossed quads per LOD ring = 6 / 4 / 4 triangles) + one alpha-tested atlas material (wind, size fade, dark root).
- `GrassAssets.ts`: tufts (lawn, wild, clump, seed) and clumps (tussock, tussockWide) use the card geometry; flowers keep their 3D models.
- `GrassManager.ts`: per-instance atlas cell (`aCell`), size in metres from the cluster height, dark-green / straw tint through the instance colour.
- `Config.ts`: new `vegetation.grass.cards` knobs; patch `coverage` 0.22 -> 0.9, `minValue` 0.25 -> 0.05, `coreAt` 0.85 -> 0.35 (grass nearly everywhere); `terrain.soilFrom/soilTo` 0.30/0.44 -> 0.60/0.74 (only occasional soil).
- `TerrainMaterial.ts`: ground colour under the grass is dark green (colours only).

## Knobs (Config.vegetation.grass.cards)
`enabled` (false = old blade models), `greenTint` (darker = smaller numbers), `dryTint`, `brightness`, `dryShare` / `dryPatchShare` (straw clusters), `heightMul`, `clumpHeight`, `alphaCut`, `rootDark`.
Denser / sparser: `patch.coverage`, `cell`. Less soil: raise `terrain.soilFrom/soilTo`.

## NOT verified (no GPU, no npm here)
Run `npm run build` first. Check in the browser: colour (tweak `greenTint`), fps (placement is ~3-4x denser, but a card is 4-6 triangles vs 60-110 blades), card edges. `grass-clump-test.ts` / `grass-city-test.ts` have coverage bounds from the old sparse patches and will need new bounds.
