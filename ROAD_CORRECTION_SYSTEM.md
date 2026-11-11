# ROAD CORRECTION SYSTEM (EVCity)

Put this file in the project root. In a NEW chat the user sends only: this zip + one screenshot.
The AI reads this file first and knows what to do. Replies in Banglish.

## 1. What the user sends (one screenshot = one correction)
The screenshot is a game view (usually top-down, camera high above the road) with these things on it:
- **Road number** handwritten next to the road (example `F3`, `F6`, `S12`, `IR2`) or the plate the game paints on the road. Junction = purple plate `J<id>`.
- **Green line** drawn by hand = the wanted NEW centreline of the road (or the wanted new shape of the corner). Red/other colour notes mean what the user writes next to them.
- **Live camera coordinates** in the HUD under the minimap: `X .. Y .. Z ..` (Bangla digits, e.g. `X -২৭৯৯ · Y ২৬০ · Z -৪৭৯` = X -2799, Y 260, Z -499). It is the CAMERA position, world metres. x = east, z = south, map centre 0,0.
- The minimap (top right) helps to see where on the 10 km map the view is.
If something is not readable (digit, which road, replace or add?) ask ONE short question; otherwise just do it.

## 2. Pixel -> world metres (do this for every screenshot)
Camera looking straight down, vertical FOV 70 (`Config.camera.fov`), image centre pixel = camera (X, Z), north up.
- ground height under camera h = Y - terrain height (about Y - 25 .. 40 on the plain; check with the terrain function if exact)
- visible height = 2 * h * tan(35 deg) = 1.4 * h metres, so `pxPerM = imageHeight / (1.4 * h)`
- **Better: calibrate with the road itself.** Highway full width = 25.4 m (3 lanes x 3.5 m x 2 + median + shy), arterial = 17.8 m, see `src/roads/RoadSection.ts` / `Config.city.roadSections`. Measure the road in pixels, divide. (Example screenshot 1895x861, Y 260: highway about 65 px wide = about 2.6 px/m.)
- `worldX = camX + (px - imgW/2) / pxPerM`,  `worldZ = camZ + (py - imgH/2) / pxPerM`
- Check: a known junction/road end in the picture must land within about 10 m of its real coordinate (RoadNetwork junction list, RoadPlan MAIN_NODES). If not, fix the scale first. If the camera is tilted (not top-down) say so and ask for a top-down screenshot.
- Precision: expect +-10 m from a hand drawing. That is fine: the router/smoother cleans the line.

## 3. Where roads come from (code map)
- `src/roads/RoadPlan.ts`: data. MAIN_NODES (C, N, E, S, W) + MAIN_EDGES F1..F7 (tier 1 freeways, `via` hints), PRIMARY (ring IR*, radials), SECONDARY, DISTRICT_LINKS (S10, S11 ...), ISLAND_PLAN.
- `src/roads/RoadNetwork.ts`: A* between the via points, then `smoothRoute` (Laplacian + Catmull-Rom). **Main highways F1-F7 keep their original shape on purpose** (railway, city plan, fuel stations `RoadStationSites.ts` are fitted to them), so changing them can move other things: check stations, rail, bridges, junction pads, road numbers.
- `src/roads/Junctions.ts` (pads, T / 4way / roundabout), `UTurns.ts`, `MedianPlan.ts`, `Roadside.ts`, `RoadNumberPlan.ts` (road + junction number plates), `JunctionMirrors.ts`.
- Debug overlay: key `3` (RoadDebug: orange highway, yellow arterial, green collector, cyan local, magenta bridge, junction poles).
- Known: W node = (-2850, -500) is where F3 (from S) ends and F6 (to C) starts.

## 4. The correction mechanism (BUILT, RC01)
All hand corrections live in ONE file: `src/roads/RoadCorrections.ts` (data `ROAD_CORRECTIONS` + pure geometry `replaceCorner`, `minRadius`). `RoadNetwork.layoutMain` calls `applyMainCorrections(out)` right after the main roads are routed, BEFORE height profile, junction pads, median, bridges, rail (rail plans itself against the finished roads, so it adapts).
```ts
{ id: 'RC01', mode: 'replace-corner', roads: ['F3','F6'] /* [runs INTO node, runs OUT of node] */, node: 'W',
  pts: [[x,z], ...],  /* traced green line, from the roads[0] side to the roads[1] side */
  lead?: 50,          /* m of old road re-drawn before/after the drawn line so the curve joins with the road heading */
  note: '...' }
```
What `replace-corner` does: cuts F3 at the vertex nearest to the first drawn point (minus `lead`), F6 at the vertex nearest to the last drawn point (plus `lead`), drops the old corner stub, builds ONE cubic-Hermite curve (road heading at both ends, drawn line smoothed + thinned because hand wobble gives R < 80 m), resamples every 8 m. The node (here `W`) moves to the middle of the curve; F3 ends there, F6 starts there; junction record + node height follow. The drawn line is followed within about 10 m (the smoothing pulls it slightly to the inside of the bend).
Only mode so far: `replace-corner` for two MAIN roads (F1-F7) meeting at a MAIN_NODES node. Other cases (reshape a middle stretch, add a road, remove a road, primary/secondary/district links S*, IR*) = add a new mode in the same file + one hook in `RoadNetwork` (generic, no road-specific `if`), then document it here.
Limits seen in RC01: highway min radius guard = 120 m in the test (ideal for 100 km/h is 250 m: a drawn corner that tight gets a warning in the answer, not a silent change). After the correction no junction pad is needed at the node (two roads run on, 2.8 deg biggest vertex turn).

## 5. Steps for the AI for each screenshot
1. Read this file, `HANDOFF.md`, newest `CHANGES_*.md`. Open the screenshot, list: road numbers, junction numbers, camera X/Y/Z, green line.
2. Convert pixels to world metres (section 2). Write the result in the answer (start, end, 3-6 middle points, junction ids) so the user can say "wrong" early.
3. Say in 3 lines what you understood (replace or add? which stub is removed? what happens to the junction?). Then do it, do not wait unless truly unclear.
4. Add the entry to `ROAD_CORRECTIONS`. Keep the hook generic: no road-specific `if` in RoadNetwork.
5. Check: `npm ci` first (sandbox has no node_modules), `npx tsc --noEmit`; `npx tsx scripts/road-correction-test.ts` (15 s, extend it for every new mode); `scripts/road-number-test.ts`, `scripts/road-section-check.ts`, `scripts/road-fit-test.ts` (~2 min; compare its 5 summary lines with and without the correction: RC01 left them identical); rail: compare `rail.edges/crossings/piers/issues` with and without the correction (RC01: same 7 issues, one rail-over-road crossing moved 45 m east, one fewer crossing). To test 'without', temporarily add `ROAD_CORRECTIONS.length = 0;` at the end of RoadCorrections.ts and remove it again. Do NOT use `git stash` on CRLF files (it converts line endings).
6. Check by eye if possible: debug overlay (key 3) positions vs the screenshot; mention what could not be checked headless (look, FPS).
7. Update the log (section 6) and `HANDOFF.md` (one line). Keep CRLF in files that use CRLF.
8. Deliver: zip of CHANGED files only + this file, and a short `CHANGES_ROADFIX_BN.md` (Bangla) with the correction ids.

## 6. Correction log (newest first)
| id | date | roads / junctions | what | status |
|----|------|-------------------|------|--------|
| RC01 | 2026-11-11 | F3, F6, node W (real position -2830,-520, was a sharp ~90 deg corner) | User drew a smooth green curve from F3 about (-2767,-345) to F6 about (-2624,-533) (camera X -2799 Y 260 Z -499, 2.6 px/m, checked: real F3/F6 centrelines overlay the screenshot within 3 m). Old corner stub removed, node W moved to (-2714,-453), min radius 180 m, highway 168 m shorter. Rail crossing near F6 moved to (-2535,-549). | DONE, needs a look in the running game |

## 7. Rules the user already gave
- One correction per screenshot; the system is always this one (no new system per image).
- Replies in Banglish; changed files only in the zip; do not break railway, stations, bridges, road numbers, U-turns, median, mirrors.
