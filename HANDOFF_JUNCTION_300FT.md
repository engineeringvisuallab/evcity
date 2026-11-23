# HANDOFF: 300 FT JUNCTION (Purbachal style) = 8-lane ring x R6-9 (6 lane) x R4-9 (4 lane), FULLY ENGINEERED

Written 2026-11-23. Language of this file: English. Reply to the user in Banglish. This is the ONLY md file for this junction. One micro-step per chat session, then STOP and wait for the user's OK. Update the status table in section 9 after every step.

## 0. What the user decided (data, do not change without asking)
1. USER 2026-11-23: he wants a "300 feet junction" like the Purbachal 300 Feet Highway Road (reference photo: main road runs in an underpass, side carriageways stay at ground, the cross road crosses on top at ground level with signals, green overhead guide sign, yellow-black kerb paint, chevron gore).
2. USER: the 8-lane ring road is the MAIN road. A 6-lane road and a 4-lane road go to the 2 sides (one on each side of the ring).
3. USER: fully engineered design, with every step and a full plan. 'You are my engineer' (earlier chats): small engineering decisions are taken by the AI, written in section 3 as D-numbers.
4. Standing rules: left-hand traffic, reuse what exists, PASS / FAIL printed by every check, never write PASS for a check that was not run (write NOT RUN), assumed numbers are marked ASSUMED, one step per chat, changed files only in a versioned zip, Config switch OFF until the user has looked in the game.

## 1. My reading of the request (CONFIRM in J0, one small question to the user)
- SITE (my reading, from the screenshot and the data): the ring (road 0, M8) at about X -1547, Z -2464, where R6-9 (cls 6, comes from the outside / north-west, last point (-1547,-2464)) and R4-9 (cls 4, comes from the inside / south-east, last point (-1547,-2463)) both end on the ring. The player was at X -1482, Z -2459 in the screenshot (about 65 m away). The ring there is on the straight between PI 3 (-2658.75,-1947.51) and PI 4 (-600.49,-2901.43), heading about 25 deg north of east. Crossing angles measured from the last segments: R6-9 about 94 deg, R4-9 about 84 deg (both inside the 70 .. 110 deg limit). R6 and R4 are in line (offset about 1 m), so this is a 4-leg CROSS, not two T junctions.
- MEANING: ring main 8 lane goes through. The 6-lane road is the north leg and the 4-lane road is the south leg ("2 pase 2 dike"). If the user meant something else (for example 6 + 4 lane SIDE roads along the ring), J0 must catch it before any work.
- CONCEPT (Purbachal type, 3 levels of thinking, 2 physical levels): ring MAIN 4 + 4 lanes in an UNDERPASS (cut-and-cover box); ring SIDE carriageways (local roads) at ground on both sides of the trench; R6 and R4 cross at ground on top of the box roof with a signalised 4-leg junction together with the side carriageways. Ring through traffic never meets a signal.
- Why underpass and not flyover for the main: the ring's own level is not touched upward (no 8-lane viaduct), the ground junction on top keeps R6 / R4 at their own levels, and it is the layout in the photo. If J1 (site check) shows the groundwater or the ground makes the trench impossible, fallback = main on a flyover with the same side-carriageway layout (decided by the AI engineer, user told).

## 2. Site facts already known (re-measure in J0, keep numbers in docs/)
- Ring: road 0 'M8', closed, 19293 m, 4 + 4 lanes, median 6 m, half width 22.1 m (44.2 m total), V100, lane 3.65 m (SECTION_M8 in src/roads/standards/SectionTable.ts). Ring PI table: src/roads/alignment/RingAlignment.ts.
- R6-9 and R4-9: src/roads/debug/RoadCentreData.ts (CENTRE_ROADS, whole metres). docs/AI_JUNCTION_AUDIT.txt lists R6-9 start and R4-9 start / end as free ends WITHOUT a junction station: nothing is designed here yet, cars on R6-9 / R4-9 stop at the ring end.
- NOT YET MEASURED (J0 must): ring level and grade at the site, ground height within 600 m, water / water table, rail (the minimap in the screenshot shows pink lines close to the road: check if that is the railway), buildings, trees, hills, the 'abasik' areas, neighbouring junctions / structures on the ring (RT-N at st 12094 and the other T points are far, but re-check), station number of the crossing on the ring.
- Existing junction work to copy the STRUCTURE from (do not rewrite): src/roads/junction/OpenJ1Geometry.ts, OpenJ1Mesh.ts, GroundJ1Terrain.ts, GroundJ1Layer.ts (ground junction pattern); RteGeometry.ts, RteStructData.ts, RteMesh.ts, RteLayer.ts, RteTerrainData.ts (structure data + mesh + terrain, newest pattern, HANDOFF_JUNCTION_RTE.md); src/traffic/RteLink.ts, J1Link.ts, TrafficSignals.ts (AI and signals); src/roads/UTurns.ts, MedianPlan.ts; src/rail/RailTunnel.ts (grep for a road tunnel mesh before writing one); src/interchange/Standards.ts and src/roads/standards/* (Criteria, Checks, SectionTable).

## 3. Engineer decisions (first proposal, each can be changed by a step with a reason; the user is told)
- D1 ROW 300 ft = 91.44 m total width at the junction, tapering to the normal ring width over the transition. Budget, ASSUMED, final numbers in J2: outer footpath + cycle 5.0 m | side carriageway 3 lanes 3 x 3.65 = 10.95 m + edge 0.5 m | wall / barrier / drain strip 2.0 m | main box (2 x (4 x 3.65 + 0.5 + 1.0) + central wall 1.2 = 33.4 m clear, thick walls about 35 m) | 2.0 m | side carriageway 11.5 m | footpath 5.0 m | green, drain and utility strip about 10 m each side to close the 91.44 m. Extra land outside the old 44.2 m is needed (about 23.6 m each side): the user allowed extra land at RT-E; confirm for here in J0.
- D2 Main in underpass: clearance 5.5 m + deck depth (about 7.8 m total, rule H2 of HANDOFF_JUNCTION_RTE.md); approach grade 4 % maximum (aim 3 %), sag K from Criteria; first estimate each approach 350 .. 400 m incl. vertical curve, box about 70 .. 90 m under the crossing roads, so the trench is about 0.8 .. 1.0 km. The ring PROFILE is changed only inside this stretch, G1 (level and grade) at both tie-ins, the rest of the ring and its structures are FIXED. Design speed in the box: 80 km/h ASSUMED (V100 outside).
- D3 Side carriageways: 3 lanes each direction on each side of the trench (two carriageways, one per ring direction), at ground, continuous through the junction. Local traffic, buses, bikes.
- D4 Main <-> side connections (diverge and merge) in the approach trench zone before the walls get high: lengths from decelLength / accelLength / laneDropTaper (about 116 + 91 m exit, 241 + 183 m entry at V100), 4 connections (2 exits, 2 entries). Weave check on the side carriageway.
- D5 At-grade junction on top: signalised 4-leg (ring side carriageway x R6 x R4); protected right turns (left-hand traffic: right turn crosses the opposing flow), free left slips with islands, 3-phase or 4-phase decided by Webster calculation (not guessed), degree of saturation <= 0.9, pedestrian crossings with refuge islands >= 2.4 m, or a grade-separated footway if the calculation fails.
- D6 Drainage and groundwater: the trench is a bathtub. Needs a sump at the low point + pump station, a flotation check (uplift safety factor >= 1.1 ASSUMED), and the water level of the game ground / nearby water. If the check fails: raise the box, add weight / piles (data only), or fall back to a flyover (D0 fallback).
- D7 Look (from the photo): yellow-black striped kerb on the barrier and island noses, chevron gore paint, green overhead guide sign gantry (Bangla + English, reuse the road sign board system, see HANDOFF_ROAD_DESIGN.md section 23), high-mast / pole lights, central divider.

## 4. Hard rules (every step prints PASS / FAIL)
H1 Geometry from the standards only (Criteria.ts, Checks.ts, SectionTable.ts, Standards.ts); curves straight - spiral - arc - spiral - straight, G1 at every join, no kink.
H2 Clearance 5.5 m + deck depth over every carriageway crossed; clear height in the box from the lowest roof point to the pavement.
H3 R1: no road crosses another without a connection or a designed structure; list every crossing.
H4 Ring and R6-9 / R4-9 centrelines stay where they are in plan (the crossing point can move along the ring by a few metres only to fit the site, user told); only the ring PROFILE inside the trench stretch changes.
H5 Grades: ring in trench <= 4 %, side roads and R6 / R4 on top <= 3 % through the pad, cross fall 1.5 .. 3 %, no flat spot (< 0.3 %) over 40 m, K per 3.3 / 3.12 of HANDOFF_ROAD_DESIGN.md.
H6 Rail and river unchanged; rail clearance 30 m (as ROADFIX R3); if the pink line near the site is the railway, report the distance in J0.
H7 Ground: cut / fill limits (cut 12 m, fill 7 m at the pavement edge unless a wall or structure), no water on the carriageway, no building or tree left on the carriageway.
H8 Capacity: Webster / HCM style, demand from src/interchange/demand, ASSUMED values listed.
H9 Config switch OFF until the user has looked in the game.

## 5. Micro-steps (ONE per session, each ends with STOP and the user's OK)
Each step: a script in scripts/ or tools/, output in docs/, PASS / FAIL list, a picture where stated, this file updated, versioned zip of changed files only, and a list of what was run (tsc, npm run build, the script) and what was NOT run.
- **J0 SITE CHECK + CONFIRM** (headless, no src change): scripts/j300-site-check.ts -> docs/J300_SITE.txt, json, picture. Ring station and level / grade at the crossing, R6-9 and R4-9 end points and angles, ground and water within 600 m, rail, buildings, trees, hills, neighbouring structures. ONE question to the user: (a) is the reading of section 1 right, (b) extra land OK. Result: which side limits the trench length.
- **J1 TYPE + VERTICAL PLAN** (numbers + picture, no src): underpass vs flyover fallback with numbers (trench length, depth, fill / cut m3, deck m2, groundwater), ring profile in the trench (levels, grades, K, tie-ins), box length, where the side carriageways sit. Recommend one, tell the user. docs/J300_TYPE.txt, json, png.
- **J2 CROSS-SECTIONS** (numbers): the 91.44 m budget at 5 stations (approach, wall, box, junction, transition), widening taper from 44.2 m, retaining walls, barriers. docs/J300_SECTIONS.txt, json, png.
- **J3 CALCULATION SHEET** (demand, capacity, signal timing, lane layout, pocket / storage / taper / weave lengths, sight distance at every stop line and conflict, radii, superelevation): formulas shown, PASS / FAIL, ASSUMED list. docs/J300_CALC.txt, json.
- **J4 GEOMETRY DATA, GROUND JUNCTION** (pure math, no three.js): edges, lane centrelines, islands, slips, stop lines, 12 at-grade movements + through movements, in the OpenJ1Geometry style. src/roads/junction/J300Geometry.ts (GENERATED data, nothing imports it yet) + check script.
- **J5 GEOMETRY DATA, MAIN + SIDE + CONNECTIONS**: ring main alignment and profile in the trench, side carriageways, the 4 diverge / merge connections, gores, weave check. Same style, check script.
- **J6 TERRAIN**: trench cut, side slopes or retaining walls, pad for the ground junction, join with the ring and the roads, drainage, sump. Pattern RteTerrainData.ts / GroundJ1Terrain.ts. Check script (cut / fill, water, flotation).
- **J7 STRUCTURES (data)**: box culvert (roof, walls, base slab, wall panels), approach retaining walls, pump house, gantry and light pole positions, as data like RteStructData.ts. Check script (clearance, uplift, spans).
- **J8 MESH + MARKINGS**: trench, box with lighting, walls, side carriageways, kerbs, barriers, islands, lines, arrows, zebra, chevron gore, yellow-black kerb paint. Game layer with a Config switch default OFF. Check script builds the mesh headless.
- **J9 GAME HOOK-UP**: carve the terrain in RoadNetwork (ring apply() carve and `j1Cells` style set for this pad), switch the ring profile in the trench stretch, collision (player and cars drive in the underpass), minimap shows it. Config ON only for the look.
- **J10 TRAFFIC GRAPH + AI**: lanes joined (main, side, R6, R4), every movement reachable, signals from the same data (TrafficSignals pattern), remove temporary end links of R6-9 / R4-9 (H2 end link), AI never uses the main lanes to stop at the signal, check script (no jump, red / green, free movements never stopped).
- **J11 SIGNS + LIGHTS + ENGINEERING TOUR**: Bangla + English green gantry signs before the diverge, speed signs, high-mast lights, underpass lights, tour stop that explains the junction in Bangla.
- **J12 FINAL**: all checks, drive-through of every movement by the player and by AI, rail / river / structures re-check, zip, status table, CHANGES_J300_BN.md.

## 6. Known risks
- The ring is ONE closed road: changing its profile in a stretch changes the carve and the cell grid; do the terrain step with the ring profile frozen after J1.
- Groundwater and flotation can kill the underpass: found in J0 / J1, not later.
- Extra land (23.6 m each side) may hit buildings, trees, the abasik areas or the rail: J0 lists them; building replacement is out of scope (buildings are replaced later).
- Signal lateral bands (`SignalArm.latMin / latMax`) must be exact so a free movement is never stopped by a signal of another group; keep the `brakeLimit` look-ahead (75 m).
- The ring median: the diverge / merge connections and U-turn openings cut it; MedianPlan / UTurns must know them.
- Underpass 8 lane at 4 % needs about 0.9 km of trench: the first estimate in D2 can change in J1.

## 7. What was NOT done (honest)
2026-11-23: no code was changed and no check was run for this junction. The site facts in section 1 come from reading the data files (centrelines, ring PI table) with a small script, not from the game; ring level, water, rail and buildings are NOT measured. All widths and lengths in section 3 are first estimates (ASSUMED).

## 8. Starter prompt for a NEW chat
"Read HANDOFF_JUNCTION_300FT.md completely, then HANDOFF_JUNCTION_RTE.md sections 0 to 4 and HANDOFF_ROAD_DESIGN.md sections 3 and 13. We build the 300 feet junction on the ring (ring x R6-9 x R4-9). Run micro-step J0 only (site check script + ask me the one question). Reply in Banglish, one step per chat, only changed files in the zip, reuse what exists in the game, STOP after the step and wait for my OK."

## 9. Status table (update here)
| Step | Name | Status | User OK | Notes |
|------|------|--------|---------|-------|
| J-plan | This handoff | DONE 2026-11-23 (no code) | waiting | site reading and concept need the user's confirmation in J0 |
| J0 | Site check + confirm | not started | | |
| J1 | Type + vertical plan | not started | | |
| J2 | Cross-sections | not started | | |
| J3 | Calculation sheet | not started | | |
| J4 | Geometry: ground junction | not started | | |
| J5 | Geometry: main + side + connections | not started | | |
| J6 | Terrain | not started | | |
| J7 | Structures (data) | not started | | |
| J8 | Mesh + markings | not started | | |
| J9 | Game hook-up | not started | | |
| J10 | Traffic graph + AI | not started | | |
| J11 | Signs + lights + tour | not started | | |
| J12 | Final | not started | | |
