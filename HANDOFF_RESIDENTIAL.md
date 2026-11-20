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

`npx tsx scripts/residential-place.ts --dry` (numbers only), `npx tsx scripts/residential-place.ts` (writes `src/buildings/PlacementsResidential.ts`; run it after ANY road change), `npx tsx scripts/residential-check.ts`, `npx tsx scripts/residential-roads-scan.ts` (road metres per area), `npx tsx scripts/res-junction-check.ts` (height step at every junction, RL3). Edit areas / mix in the top of `scripts/residential-place.ts`.

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
| RL1 road level = ground level in the 7 flat zones | done in code 2026-11-19, game NOT looked at | section 9, `RoadNetwork.reprofileResidential` |
| RL2 all 9 areas: road follows smoothed ground, 28 m terrace | done in code 2026-11-19, game NOT looked at | section 10 |
| RL3 step 1 junction harmony (branch ramps to the through road) | done in code 2026-11-19, game NOT looked at | section 11 |
| RL3 step 2 west-homes (R4-29 stub under the R6-15 bank) | done in code 2026-11-19, game NOT looked at; 1 question open (station pads) | section 12 |
| R2 user's look + corrections | waiting | |
| R3 community buildings (school, mosque, clinic ...) | not started | |
| R4 terrain pads | not started | needs applyPlots grid |

## 9. STEP RL1: ROAD LEVEL = GROUND LEVEL (2026-11-19, user: "road level and ground level same hobe, proyojon hole terrain nichu/uchu")

PROBLEM (measured, `scripts/res-level-scan.ts`): the C / L / R2 / R4 roads kept the heights planned on the NATURAL ground, but the flat residential zones (ResidentialFlat.ts) move the ground up to 8 m. Road minus ground 25 m beside the road: |d| > 1 m at 75-96 % of the points, up to +-7 m = the trench / bank in the user's screenshots (west-homes, R2-75 at X -1976 Z -466: road 24.3 m, ground 29.0 m, trench 4.7 m deep each side).
FIX: `RoadNetwork.reprofileResidential()` (called once at the end of the TerrainGenerator constructor, after the railway) lays every C / L / R2 / R4 road point on the flat zone ground: `ys = old + w * (ground - old)`, w = zone weight x railway-corridor fade (90 / 60 / 35 / 15 m). Points within 18 m of a road that is not moved (R6, M8, F ...), around bridges (6 points), outside the zones and inside the rail fade are PINNED; the shift grows at most 4 % per metre from a pinned point, then a grade repair keeps max(kind limit, old grade). `ResidentialFlat.weightAt()` is new. `daylightReach()` now measures against the flat ground too (`reachGround`), so cut / fill faces end on the real ground. Nothing else changed (rail, other roads, pads, TerrainGenerator.sample order).
RESULT (RUN, `scripts/res-level-check.ts`, before -> after, terrain-minus-road 8 m beside the road, p90): se-dense 1.6 -> 0.5, west-homes 1.7 -> 1.8 (hills inside the zone), sw-homes 0.8 -> 0.8, east-homes 1.5 -> 0.5, south-suburb 0.0 -> 0.0, sw-newtown 1.2 -> 0.1, west-suburb 1.1 -> 0.1. Road grade <= the limit of its kind everywhere (max 8.0 / 6.0 / 10.0 %). R2-75 (screenshot): terrain-road = 0.0 at -30..+30 m (30 m was +4.7 before; now 0.0 at all offsets tested).
CHECKS: `npx tsc --noEmit` clean, `npm run build` exit 0, `residential-check.ts` 8 PASS 0 FAIL after re-running `residential-place.ts` (RB7): 1418 -> 1671 buildings (flatter ground, more plots fit). `residential-flat-check.ts`: 5 FAIL before -> 4 FAIL after (east-homes / se-dense cross-slope now PASS; sw-homes 6.2 % and west-homes 4.0 % cross-slope, and the 2 old "step > 0.5 m" FAILs, are NOT fixed). `road-correction-test` RC01 FAIL same as before.
NOT DONE / NOT SEEN: the game LOOK (user has to look), FPS. RA-N and RA-SW are NOT flat zones, so their roads are unchanged (natural cross slope beside them, worst 14-33 m at 30 m offset on hills): next step RL2 = ground follows the road there (plateau + blend). west-homes / sw-homes hills inside the zone still have 2-5 m side slope (flat cap 8 m).

## 10. STEP RL2: ALL 9 AREAS, ROAD FOLLOWS THE GROUND, FLAT TERRACE BESIDE THE ROAD (2026-11-19, user: "ja baki ase segula koro, road uchu korar dorkar hole road uchu koro")

NEW `src/terrain/ResidentialAreas.ts` (the 9 circles of section 2 + `areaWeight`, taper 120 m). CHANGED `RoadNetwork.reprofileResidential` (+ `splat`, `RoadSpec.plateau`, `daylightReach` / `apply` / cell reach use the terrace) and `TerrainGenerator` (weights, PLATEAU_M = 28).
- Road: in a flat zone it still goes to the flat ground; elsewhere in the 9 circles (RA-N, RA-SW, hill parts) it goes to the GROUND SMOOTHED over +-20 m (5 samples), at most 3.5 m up or down (up to 8 m inside the flat zones): a road in a hollow is RAISED, a road on a ridge is lowered, so cut and fill beside it get small. Same pins (18 m from other roads, bridges, rail fade), 4 % per metre, grade repair.
- Terrace: the earthwork platform of these roads is 28 m wider on each side (flat at road level, covers the building plots), then the normal 1:2 cut / 1:3 fill face. Terrace only inside the circle (fades out within ~20 m of its edge). Asphalt, shoulder and footpath widths are NOT changed (separate `splat` array).
RESULT (RUN, `scripts/res-level-check.ts`, terrain minus road, p90 at 8 / 15 / 30 m): all 9 areas 0.0 / 0.0-0.6 / 0.0-2.7 (RA-N 0.0 / 0.6 / 2.7, RA-SW 0.0 / 0.0 / 0.7). Worst single points: RA-N 5.3 m, RA-SW 3.2 m at 8 m (next to a pinned junction with another road), west-homes 14 m (near the rail cut-and-cover, not changed). Max road grade 6-10 %, never above the limit of its kind.
BUILDINGS (RB7): regenerated, 1883 (RL1: 1671, start 1418). `residential-check.ts` 8 PASS 0 FAIL. tsc clean, `npm run build` exit 0.
FAILS THAT REMAIN / NEW (`residential-flat-check.ts`, 7 FAIL; was 5 at the start, 4 after RL1): old: 2 x "step > 0.5 m" (sw-homes, west-homes), cross slope sw-homes 3.97 %, west-homes 4.02 %. NEW: plot (-640, 760) range 0.99 m and (-540, 820) 0.65 m (limit 0.6, hand placed fill plots at the edge of sw-homes) and east-homes street cross slope 3.13 % (limit 3 %). Not fixed.
NOT SEEN: the game look and FPS (the terrace makes the earthwork cells of ~1000 road segments wider). Not done: villages, east-suburb, north-homes (no road), community buildings (R3), plot pads (R4).

## 11. STEP RL3-1: JUNCTION HARMONY (2026-11-19, user: "onno road er 18 m er moddhe road height pinned, 3-5 m mismatch ... road ke dhire dhire milao")

FOUND (RUN, `scripts/res-junction-check.ts`, 84 junction ends inside the areas): the 3-5 m mismatches in RA-N / RA-SW were NOT at R6 / M8 / F (a pinned road keeps the height of the road it joins: steps there 0.0-0.1 m). They were where TWO moved roads meet: each is moved on its own, so the branch kept its old height while the through road moved. Before: R2-16 / C-4 against R4-11 4.31 m, C-4 against R2-74 4.07 m, L-5 / R4-7 3.04 m, C-2 / L-5 2.09 m, R2-75 / R2-76 against R4-29 2.23 m, L-15 / R2-13 1.70 m, C-13 / R4-29 1.43 m, L-20 / L-21 against C-4 1.36 m, and 8 more under 1.2 m (20 ends over 0.25 m).
FIX: `RoadNetwork.harmonizeResidentialJunctions` (new, called at the end of `reprofileResidential`, before the cut / fill reach is rebuilt). A junction = an end of a moved road within 8 m of another road. Through road = a road that is not moved, else a moved road that is touched away from its end, else the LONGEST road of an end cluster (ties by name). The branch end gets the through road's height at that point; the shift fades out with a smoothstep over Ld = clamp(1.5 |step| / 4 %, 30 m .. 0.5 x road length, 220 m) (adds ~4 % grade at most), then a grade repair walks away from the junction (keeps max(limit of its kind, own old grade)). The through road is never changed. Junction records inside the areas follow the road heights. Bridges stop the blend. A not-moved road more than 1.5 m off in height is a CROSSING (viaduct / cut-and-cover), not a junction: skipped here (RL3 step 2).
RESULT (RUN): pass list 90 ends, 29 had a step over 0.03 m (20 of them over 0.25 m), worst step 4.31 m -> 0.02 m; independent scan 83 ends, worst 0.02 m, 0 over 0.25 m. `res-level-check.ts` terrain minus road at 8 m, worst: RA-N 5.3 -> 1.5 m, RA-SW 3.2 -> 1.5 m (p90 still 0.0); other areas unchanged. Grade: max 10.0 %, worst excess over the kind limit 0.1 % (R2-76[70] 8.1 %, same point and same value as before the change: 0.05 % in the original zip).
BUILDINGS (RB7): regenerated 1883 -> 1892, `residential-check.ts` 8 PASS 0 FAIL.
NOT RUN / NOT SEEN: the game look and FPS. `npx tsc --noEmit` / `npm run build` NOT RUN (no node_modules, no network here): `tsc --noEmit --types ""` gives 527 errors, all from the missing `three` / rapier modules, and the SAME 527 on the original zip (none in RoadNetwork.ts); the check scripts ran with tsx. Not changed: rail, R6, M8, F, other roads, terrain, plateau. Still open then: R4-29 / R6-15 13.8 m = step 2 (section 12).

## 12. STEP RL3-2: WEST-HOMES (2026-11-19, user: "rail cut-and-cover er kachhe 14 m mismatch ... pahar e 2-5 m side slope")

FOUND (RUN): the 14 m is NOT the railway (no rail edge within 150 m of it, `diag` over `gen.rail.edges`). R4-29 started 3 m from R6-15, but R6-15 runs 13 m ABOVE the ground there (4 % arterial across a valley: y 41.1, natural 28.4), so R4-29 ended inside R6's bank and R6's fill met the R4-29 terrace in a 14 m wall (first 4 points, one side). It was never a junction (13.8 m height difference at the same point).
FIX: `RoadNetwork.trimResidentialStubs` (new, first thing in `reprofileResidential`): a moved road that ends within 8 m of a road that is NOT moved and more than 1.5 m off in height is cut back until its end is clear of the bank (half width + shoulder of the other road + 2.2 x height difference). R4-29 start: 7 points = 56 m cut (now 111 points, 876 m). Bridges of that road (index shift), the junction record at the old end follow; limits: not on a bridge, not more than 25 % of the road, road of 12 points or more. Only R4-29 triggers it (every other end inside the areas is a real junction).
RESULT (RUN): west-homes worst terrain-minus-road at 8 m 14.4 -> 8.5 m; the 8.5 m is under the R4-29 bridge (i 38-46, valley deck, wanted). Remaining 3 points >= 1.5 m outside bridges: R2-76 start 3.8 m.
FOUND, NOT FIXED: R2-76 start (X -1881 Z -377): 3-4 m hole on one side at 8-15 m offset. Cause = `ROAD_STATION_SITES` cp-03 (charge point, host road "F6", pad floor 23.4 m) and station-3 (fuel, 60 m away, 23.7 m): the pad (`StationPads`) is applied AFTER the roads and gives way only to the road core, so it cuts the 28 m terrace. There is no road named F6 (or any F*) in the network now: the 22 sites in RoadStationSites.ts name host roads F1-F7 that do not exist, so their pad heights are not the heights of any present road. Both sit inside west-homes. Needs the user's decision (move / drop these two, or let the pad give way to the terrace). The "pahar e 2-5 m side slope": after RL2 it is p90 1.1 m at 30 m offset in west-homes and 0.0 in sw-homes (res-level-check); the cross-slope FAILs are step 3. UPDATE 2026-11-20: the old station sites (cp-03 / station-3 on F6) are REMOVED; RoadStationSites.ts was regenerated (new ids, sites beside M8 / J1 / R6 / R4 and in the residential areas), so this open question is obsolete; residential-check.ts NOT RUN after the change.
BUILDINGS (RB7): regenerated 1892 -> 1886, `residential-check.ts` 8 PASS 0 FAIL. `res-junction-check.ts` PASS (0 junction ends over 0.25 m).
NOT RUN / NOT SEEN: the game look, FPS, tsc (partly, as in section 11: no node_modules; `tsc --noEmit --types ""` shows no error in RoadNetwork.ts), npm run build. Rail not changed.
