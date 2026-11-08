# CHANGES_GRASS4 - green city lawn, city and highway roadsides

Built on step 3 (clumps, `CHANGES_GRASS3_BN.md`). All new numbers are Config knobs (see "Knobs").

## What changed

### 1. City lawn (grass)
- `src/city/CityGreen.ts` (new): one greenness field 0..1 (1 inside a planned city = distance to the hub < `CityPlan.maxRadius`, soft edge outside). Used by the grass placer, the terrain chunk worker and the tests.
- `GrassPlacement.ts`: the 0.5 `cityChance` thinning and `cityFactor` are gone. Inside a city the patch value is forced to 1, so the whole ground that is not road / pavement / plaza / parking / plot is lawn: dense short tufts (`grass.city.density` x the meadow density), a few small clumps, small flowers (daisy, clover, buttercup, `flowerShare`), and TALL clumps at tree bases (`TreePlacer.treesInRect`, new, same trees as `place`) and in a band along plot fences (`fenceReach`).
  Blocked list: roads + sidewalks (ribbon incl. the 3 m walk), city sidewalks (`cityWalkAt`), parking lots (`parkingContains`, newly added), plots / buildings / pads as before.
- Data flag (last float of an instance): 0 tuft, 1 clump, **2 lawn tuft**, **3 tall base/fence clump**. `GrassManager` makes lawn tufts short (`city.height`) and picks the models.
- `TreePlacement.ts` refactored into `cellTree()` (+ `treesInRect`); output verified identical to before (hash of 5 chunks).

### 2. Green terrain in cities
- Chunk worker builds a per-vertex mask `cityMask` (`buildCityMask`, same layout as the road mask incl. skirts; null outside cities, shared zero array on the main thread) -> attribute `aCity`.
- `TerrainMaterial.ts`: soil share x (1 - greenness), dry straw off, grass colour leans to a fresh lawn colour, only `slopeSoilKeep` of the slope soil stays. Soft edge = `terrain.cityGreen.fadeOut` (120 m).

### 3. City roads (only segments inside a planned city: `RoadNetwork.segmentCity`, tier 4 or `CityPlan.siteAt` of the segment midpoint, no bridges / earth tracks)
- Ribbon = asphalt + paved sidewalk, `city.roadside.sidewalk` = 3 m on both sides (also for tier 1-3 inside cities; the street PLAN keeps its old clearance, so the street layout is unchanged).
- Shader (`RoadMaterial.ts`): white dashed centre line + white edge lines, kerb stone, grey **basket-weave interlocking pavers** (procedural, grout fades with distance), concrete edging next to the lawn strip, **yellow-black striped kerb** at the median (freeway arms: 1.2 m median; arterials: centre kerb instead of the double yellow). Vertex code: +100 local street (as before), **+4000 city road tier 1-3**.
- `Roadside.ts` + `RoadsideView.ts` (new, instanced, grouped in 250 m squares, shown within `drawRadius` x type range at 2 Hz):
  - tree pits (square kerbed, every 24-30 m, both sides; small young trees, scale 0.42-0.6, deep green tint 0.58-0.7: `city.roadside.treeSpacing` and `streetTree`) + street trees that go through the NORMAL tree pipeline (chunk worker, LOD, colliders),
  - low flowering hedge (new model, 0.6-0.9 m, dense green, white/pink flowers) on freeway medians in the city and along open edges of the mall / EVLab / side parking lots,
  - street lamps (existing `StreetLights`) now stand on the sidewalk, behind the pits.
- Lawn strip between sidewalk and plot = the city lawn above.

### 4. Roads outside the city (tier 1-3)
- Highway shoulder 2.2 -> 1.5 m gravel (`city.highway.shoulder`).
- W-beam guardrail, posts every 4 m, only where the ground beside the road drops >= 0.8 m within 5 m (embankment) or on the OUTER side of curves tighter than 900 m; short runs removed, small gaps closed; never in a city, on asphalt or near junction pads.
- Verge: tall clump patch (`grass.verge`: reach 7 m, clumps x1.35 taller) + shrubs (same model family, 0.8-1.7x) beyond the shoulder.
- Street lights on ONE side only outside cities (spacing x1.4), alternating inside cities.

### 5. Polish
- Colour: every tuft is fresh green, yellow-green or straw (`look.strawShare`, `yellowShare`); city lawn has its own fresh green, never straw.
- Roots: blade root brightness is a knob (`look.rootDark`, 0.45 = as before) for all tufts / clumps.
- Wind: new uniform `uGrassWind` (`look.wind`; sway already grows with blade height, so short lawn moves little). `GrassAssets.setWind()`.
- LOD fade: unchanged rings and fade (40/80/170 m), the lawn follows them.
- `Quality.ts`: `roadsideMul` (0.55 / 0.8 / 1) and `grassWind` (0.6 / 1 / 1) per preset; lawn density follows the existing `grassMul` (0.6 / 0.85 / 1).

## Knobs (Config.ts)
`terrain.cityGreen`, `vegetation.grass.city / verge / look`, `city.roadside` (sidewalk, treeSpacing, pitSize, pitOffset, hedge, drawRadius, kerbStripe, kerbWidth, paver), `city.highway` (postStep, dropMin, curveRadius, shoulder, railHeight, lampStepMul, shrub*). Note: `grass.cityChance` was removed.

## Tests
- `npx tsx scripts/grass-city-test.ts` (new): no grass on roads / sidewalks / parking / plots; free city ground has >= 4 lawn tufts per m2 (measured 6.2); tall base/fence clumps exist; greenness 1 inside / 0 outside / monotonic soft edge; mask layout; every city segment has >= 3 m sidewalk; pits on sidewalks, none on asphalt, median spacing 13.5 m; hedges 0.6-0.9 m; posts every 4 m (median 4.04), none in city or on asphalt, none buried in cuttings; shrubs not on roads; highway shoulder 1.5 m. ALL OK.
- `scripts/grass-clump-test.ts` updated: its spots now lie OUTSIDE the cities and it ignores lawn instances (flags 2/3). Share bound 12-32 %: the unchanged step-3 code gives 15.0 % at these spots, this code 14.7 %.
- `scripts/tree-test.ts` updated: street trees may stand on the sidewalk / in city zones, but never on asphalt (height check still applies). ALL OK.
- Unchanged and passing: local-roads-test, city-plan-test. `road-test` has the same 2 failures as the original zip (pad plane 0.19 m, 128 components).

## Measurements (`npx tsx scripts/grass4-perf.ts`, player at the point, radius 170 m, high preset)
| viewpoint | grass instances before -> after | grass triangles before -> after | roadside models drawn |
|---|---|---|---|
| city street | 15.0k -> 23.3k | 1.11 M -> 1.49 M | 1249 inst / 127 k tri |
| city lawn (park side) | 12.8k -> 15.7k | 0.80 M -> 0.84 M | 1181 / 120 k |
| highway verge | 12.8k -> 13.1k | 0.96 M -> 0.99 M | 1330 / 77 k |
| open meadow | 8.8k -> 8.8k | 0.63 M -> 0.62 M | 49 / 2 k |

Placement CPU in the chunk worker: 13 ms / tile in the city (same as before), 8 ms on the verge, 3 ms in the meadow. Whole-world roadside totals: 3660 pits / trees, 2121 hedge pieces, 13.6k shrubs, 16.7k posts, 65 km of W-beam. Triangles per model: hedge ~160, shrub 174, pit 50, post 12, beam 16.

## NOT verified here (please check in the browser)
- **Frame time**: the sandbox has no GPU and no npm access; the numbers above are draw load (instances, triangles), not fps. Compare fps near the city with the debug HUD; if needed lower `grass.city.density`, `city.roadside.drawRadius` or use the quality presets.
- **Visual result**: the shader code (pavers, striped kerb, white lines, terrain green) and the new models could not be rendered or GLSL-compiled here. Placement logic and the model builders were run headless with a stub of three.js; the full-project `tsc` could not run (three / rapier not installed). Run `npm run build` first; expect at worst small typing or GLSL typos in `RoadMaterial.ts`, `TerrainMaterial.ts`, `RoadsideView.ts`, `GrassManager.ts`.
- Mixed junction pads (arms of different tiers) still show the old gravel border; the roundabout / pad corners have no pits.
- The tree pit trees use the existing vase / broadleaf / slender models at scale 0.7-0.95.

## Map symbols (added later)
- Minimap: fuel stations (orange square, white pump) and charging points (green square, white lightning bolt). The 6 small stations show both side by side, the main station a pump, the EVLab depot a bolt. Close and medium zoom only. Files: `src/ui/Minimap.ts`, `src/core/Engine.ts`.
