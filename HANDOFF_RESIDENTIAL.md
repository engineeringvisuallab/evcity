# HANDOFF: RESIDENTIAL (ABASIK) AREAS OUTSIDE THE CITY - BUILDINGS ALONG THE ROADS (evcity)

Language: English only. This is the ONLY md file for the residential-building work. Do not create CHANGES_*.md files. When a step is done, update the status table in section 8 of THIS file.
Created 2026-11-19. Twin files: `HANDOFF_CITY_DESIGN.md` (the red city zones around J1: LAND ONLY, no buildings, NOT this work), `HANDOFF_ROAD_DESIGN.md` (roads).

---

## 0. THE USER'S ORDER (own words, keep them)

- "City area er baire je sob abasik ase sekhane building bosate hobe bises kore jekhane C and L road ase." = OUTSIDE the city area, in every residential (abasik) area, buildings must be placed, especially where C and L roads are.
- "only abasik area er C L and 2 lane and 4 lane jodi thake. mane abasik area only." = ONLY inside residential areas, along the C, L, 2-lane (R2) and 4-lane (R4) roads that lie there. Not farm / industrial / logistics zones.
- "apatoto agula akhon abasik area. please handoff banaw abasik residential area. and update koro. and building bosaw" (with 3 game screenshots: camera X 775 Z -2586, X 1520 Z -2555 = the north C / L / R2 grid; X -1860 Z 1917 = sw-newtown R2 grid) = for now THESE are the residential areas; make this handoff, keep it updated, and place the buildings.

## 1. HARD RULES

| # | Rule | Check |
|---|------|-------|
| RB1 | **ONLY INSIDE THE LISTED AREAS** (table 2), only along C / L / R2 / R4 roads. Nothing along R6, the 8-lane roads, the ring, J1, rail. Nothing in the red city zones (those belong to HANDOFF_CITY_DESIGN.md, which places NO buildings). | generator tries only roads named C- / L- / R2- / R4- whose points lie inside an area circle; candidate centre must be inside the circle |
| RB2 | **NO BUILDING ON OR TOO NEAR A ROAD.** Footprint keeps >= 1.5 m (generator) / >= 1.0 m (check) from the ribbon + footpath (halfWidth + max(shoulder, 3 m)) of EVERY road, own and others. | `scripts/residential-check.ts` |
| RB3 | **NO WATER, RAIL, FENCE, KEEP-OUT.** No wet point under the footprint + 5 m (h < water + 0.3), rail corridor + 10 m clear, no fenced engineering area, no site keep-out (library, mall, EVLab, proto, infra, airport, agro). | check |
| RB4 | **GROUND.** Ground range under the footprint <= 2.5 m (ASSUMED, place-buildings.ts uses 3 m). Residential flattening of the world zones stays as it is. | check |
| RB5 | **NO OVERLAP** with any hand placed, city fill or new building (SAT, 1 m gap in the generator). | check |
| RB6 | **POSITION ONLY, NO TERRAIN PAD.** The new buildings are NOT given to `TerrainGenerator` (its `ResidentialFlat.applyPlots` loops over ALL plots at every ground sample: ~1400 more plots would slow the whole game). `FillBuildings` puts a plinth under a sloping footprint. If pads are wanted later, make `applyPlots` use a grid first (PERFORMANCE_RULES.md). | TerrainGenerator.ts untouched |
| RB7 | **BUILDINGS ARE PLACED BY THE SCRIPT, NEVER BY HAND.** Change the rules in `scripts/residential-place.ts` and rerun; do not edit `src/buildings/PlacementsResidential.ts`. Hand placed buildings (`Placements.ts`) and the city fill (`PlacementsFill.ts`) are NOT touched. | git diff |
| RB8 | **ONE SMALL STEP PER SESSION**, PASS / FAIL list (a check not run is written NOT RUN), then STOP for the user's look. Changed files only in a versioned zip. Reply in short Banglish, md files English. | status table |

## 2. THE AREAS (circle = centre x, z m and radius m; world x = east, z = south)

| Area | centre | r | style | roads inside (game) | built so far |
|------|--------|---|-------|---------------------|--------------|
| se-dense | 1150, 1150 | 600 | dense | R2 | R1 |
| west-homes | -1550, 0 | 620 | dense | C-11..13, R2, R4 | R1 |
| sw-homes | -1150, 1150 | 600 | dense | R2 | R1 |
| east-homes | 1550, 60 | 600 | mid | C-5, L-29..31, R2 | R1 |
| south-suburb | 450, 2250 | 550 | sub | R4 | R1 |
| sw-newtown | -1900, 1750 | 650 | sub | R2, R4 (user screenshot 3) | R1 |
| west-suburb | -2450, 500 | 500 | sub | C-12 (60 m), R4 | R1 |
| RA-N | 1030, -2365 | 520 | sub | C-3, C-4, L-8..L-22, R2, R4 (user screenshots 1-2); world zone north-farms | R1 |
| RA-SW | -3150, 1500 | 520 | sub | C-2, L-3..L-7, R2 | R1 |
| east-suburb, north-homes | - | - | - | NO C / L / R2 / R4 road yet | none (no road) |
| village-west / village-sw | -2900, -1050 / -3150, 950 | 300 | - | only R4 | NOT done (user did not name villages) |

The circles of the 7 world residential zones are the housing circles of `scripts/housing-streets.ts` (A2 / STEP C). RA-N and RA-SW are NOT world residential zones: they are the C / L grids of the user's screenshots (AI choice of centre and radius to cover the lines + 150 m); the user may delete or move them. NOT included on purpose: C-6..C-10 (north-heavy / north-logistics = industrial), L-23..L-28 (east-works), C-1 / L-1 / L-2 (far SW, mountain), L-5/6 beyond RA-SW (outside the circle).

## 3. HOW THE PLOTS ARE MADE (scripts/residential-place.ts)

- For every road C- / L- / R2- / R4- (game road, `gen.roads.roads`) that touches an area: walk the centreline from 14 m to (length - 14 m), both sides. A road belongs to the first area that holds its middle.
- Footprint W (along the road) x D (depth, FRONT = local +z turned to the road, yaw = atan2(-nx, -nz)). Sizes = the tables (include the yard): house-tin 11x12, house-semi-pucca 11x12, house-brick-2 / -3 13x16, townhouse-3 10x12, apartment-mid 18x13, apt-slim-9 15x14, shop-house-3 13x12, shop-house-4 11x11.
- Offset from the centreline = halfWidth + max(shoulder, 3 m footpath) + setback + D / 2. Setback beyond the footpath (ASSUMED): L 2 m, C 3 m, R2 3 m, R4 5 m. Gap between neighbours: dense 1.5 m, mid 2.5 m, sub 4 m.
- Model mix per style and road class (MIX table in the script, weights ASSUMED): suburb = tin / semi-pucca / brick houses on L, brick houses + townhouses + a few shop houses and flats on C / R2, shop houses + flats on R4; dense = townhouses + flats on L, flats + shop houses on C / R2 / R4; mid in between. No villa (24x28 too big), no tower.
- A candidate that fails is retried with the two smallest models, then the cursor moves 5 m.
- Deterministic (seeded by road name + side + area): the same rules give the same table.

## 4. WHAT CHANGED IN src (2026-11-19, step R1)

NEW `src/buildings/PlacementsResidential.ts` (GENERATED: `RESIDENTIAL_PLACEMENTS` + `DRAWN_FILL_PLACEMENTS = FILL + RESIDENTIAL`). CHANGED (one import + one loop each): `FillBuildings.ts` (draws them, instanced, chunks, LOD), `Placements.ts` (`placementContains` grid: trees / grass keep out), `vegetation/Homesteads.ts` (palms around rural houses), `export/RealModel.ts`, `export/GisLayers.ts` (exports include them). NOT changed: `TerrainGenerator.ts`, roads, rail, `Config.ts`, hand placed buildings, `PlacementsFill.ts`.

## 5. RESULT OF STEP R1 (RUN)

- Generator: 1418 buildings (se-dense 174, west-homes 136, sw-homes 34, east-homes 166, south-suburb 27, sw-newtown 286, west-suburb 26, RA-N 316, RA-SW 253). Models: townhouse-3 299, shop-house-3 275, house-brick-2 196, house-brick-3 189, apartment-mid 161, apt-slim-9 132, shop-house-4 108, house-semi-pucca 40, house-tin 18. Candidates tried 28 k: ok 1418, outside circle 20.2 k, slope 5.0 k, road 966, building 758, blocked 267, water 157, rail 0, surface 0.
- `scripts/residential-check.ts` (own code): 8 PASS, 0 FAIL (model ids, overlap 0, road gap 0, surface 0, rail 0, wet 0, fence 0, ground range worst 2.50 m).
- Pictures made by me: RA-N and sw-newtown (buildings beside the roads, front to the road, none on a road).
- NOT RUN: `npx tsc --noEmit`, `npm run build` (no node_modules / network here), the game LOOK (instancing, plinth on slopes, FPS with +1418 buildings, palms around the houses), `fill-test`, `fill-runtime-test`.
- Honest limits: sw-homes (34) and the suburbs (27 / 26) are thin because the ground is steep or the roads are short; many roads of the areas (R2 lines) have free ends, buildings keep 14 m from road ends; RA-N / RA-SW circles are my choice; sizes, setbacks, gaps, 2.5 m slope and the model mix are ASSUMED numbers.

## 6. HOW TO RERUN

`npx tsx scripts/residential-place.ts --dry` (numbers only), `npx tsx scripts/residential-place.ts` (writes `src/buildings/PlacementsResidential.ts`; run it after ANY road change), `npx tsx scripts/residential-check.ts`, `npx tsx scripts/residential-roads-scan.ts` (road metres per area). Edit areas / mix in the top of `scripts/residential-place.ts`.

## 7. WHAT THE USER DECIDES NEXT (ONE question at a time)

1. Look in the game (RA-N, sw-newtown first): too dense / too many shop houses / wrong model mix / too close to the road?
2. Are RA-N and RA-SW right as residential areas, and should villages (R4 only) and east-suburb / north-homes (no road yet) get buildings when roads exist?
3. Other building types for the areas (school, mosque, clinic, shop centre, playground, green) = plots of the city-design kind; this step placed ONLY homes and shop houses.
4. Terrain pads under the buildings (needs a grid index in `ResidentialFlat.applyPlots` first, RB6).

## 8. STATUS TABLE (update here)

| Step | Status | Note |
|------|--------|------|
| R0 scan (road metres per area, existing buildings 0-2 per area) | done 2026-11-19 | `scripts/residential-roads-scan.ts` |
| R1 homes along C / L / R2 / R4 in 9 areas | done in code 2026-11-19, 8 PASS 0 FAIL, game NOT looked at | 1418 buildings, `PlacementsResidential.ts` |
| R2 user's look + corrections | waiting | |
| R3 community buildings (school, mosque, clinic ...) | not started | |
| R4 terrain pads | not started | needs applyPlots grid |
