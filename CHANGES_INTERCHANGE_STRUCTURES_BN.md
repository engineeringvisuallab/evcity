# INTERCHANGE — Structure kit (arch, pavilion, fountain, palm, billboard, retaining wall)

Age apply koro: Step 1, 2a, 2b (candidates optional). **Game-er kono file bodlay ni** — shudhu `src/interchange/` + script + docs.

## Ki
Tomar reference chhobi-r moto onek rokom structure thakbe, tai structure ekta **registry**:
- `src/interchange/Structures.ts` (notun): `STRUCTURE_DEFS` (arch, pavilion, fountain, palm, billboard), `DRESSING_PRESETS` (`plain` / `garden` / `grand`), placement rule, `STRUCTURE_BUDGET`, seeded random.
- `InterchangeSpec.dressing` (notun, optional; default = `plain` = ager moto kichu na). `InterchangeModel`-e `structures` (instance row), `walls` (retaining wall ribbon), `budget`.
- Load: ek def = ekta InstancedMesh shob interchange-er jonno; wall = ribbon; 600 instance-er beshi hole `budget` warn.
- Notun structure = `STRUCTURE_DEFS`-e ek row + `placeStructures()`-e ekta case.
- `Parts.ts`: `rampAt()` export; `Builder.ts`, `InterchangeTypes.ts`, `index.ts`: dressing joda.
- Preview SVG/PNG ekhon `grand` dressing-shoho (arch, pavilion, fountain, palm, billboard).

## Verify
- `scripts/interchange-test.ts`: **56 check ALL OK** (ager 41 + 15 notun): plain = kichu na; grand cloverleaf = 2 arch, 2 pavilion + 2 fountain, palm ring, 4 billboard; arch thik upper road-er centreline-e, raised deck-er upor; palm shob loop-er bhitore; shob structure footprint-er bhitore; deterministic; alada id = alada arrangement; explicit list; diamond; embankment-e wall.
- `tsc --strict` interchange + script: error nai.
- Top-view chhobi nijer chokhe dekha (docs/interchange-preview/cloverleaf.png).

## Ekhono nai
Renderer (InstancedMesh draw, pavilion/arch-er asol 3D mesh) — eta wiring-er porer dhap. Config entry-te `dressing` field ekhono nai (renderer-er shathe dibo).
