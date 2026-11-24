# HANDOFF: 300 FT JUNCTION (Purbachal style) = 8-lane ring x R6-9 (6 lane) x R4-9 (4 lane), FULLY ENGINEERED

Written 2026-11-23. Language of this file: English. Reply to the user in Banglish. This is the ONLY md file for this junction. One micro-step per chat session, then STOP and wait for the user's OK. Update the status table in section 9 after every step.

> **DECISION 2026-11-24 (USER): TYPE A.** Ring stays on its embankment (profile and plan FIXED) and crosses on a BRIDGE over a ROUNDABOUT at natural ground; R6-9 (6 lane) and R4-9 (4 lane) meet the roundabout; 4 RAMPS climb to the 8-lane ring from both sides. Everything below about a ring underpass / trench / box (sections 1, 3 D2, D4, D6, section 5 steps, section 6) is TYPE B and is SUPERSEDED by section 11. Where they disagree, section 11 wins. The user's earlier sentences (roundabout, enter the 8 lane from 2 sides, 300 ft, fully engineered) stay.

## 0. What the user decided (data, do not change without asking)
0. USER 2026-11-24 (after seeing my first picture): in the photo there is a ROUNDABOUT (circle) on top of the underpass, and from the 2 sides (side roads) traffic can enter / leave the 8-lane main. So the ground junction is a ROUNDABOUT, not a plain signalised cross. Both the picture and section 3 D5 follow this.
1. USER 2026-11-23: he wants a "300 feet junction" like the Purbachal 300 Feet Highway Road (reference photo: main road runs in an underpass, side carriageways stay at ground, the cross road crosses on top at ground level with signals, green overhead guide sign, yellow-black kerb paint, chevron gore).
2. USER: the 8-lane ring road is the MAIN road. A 6-lane road and a 4-lane road go to the 2 sides (one on each side of the ring).
3. USER: fully engineered design, with every step and a full plan. 'You are my engineer' (earlier chats): small engineering decisions are taken by the AI, written in section 3 as D-numbers.
4. USER 2026-11-23: EVERY step must end with (a) a zip of the CHANGED files only (versioned name, e.g. EVCity_J300_J0_changed_v1.zip) and (b) a 3D picture of what that step builds or plans (tools/j300-perspective.py is the first one, docs/j300_concept_view.png (aerial view like the Purbachal photo); later steps replace it with a picture made from the real step data).
5. Standing rules: left-hand traffic, reuse what exists, PASS / FAIL printed by every check, never write PASS for a check that was not run (write NOT RUN), assumed numbers are marked ASSUMED, one step per chat, changed files only in a versioned zip, Config switch OFF until the user has looked in the game.

## 1. My reading of the request (CONFIRM in J0, one small question to the user)
- SITE (my reading, from the screenshot and the data): the ring (road 0, M8) at about X -1547, Z -2464, where R6-9 (cls 6, comes from the outside / north-west, last point (-1547,-2464)) and R4-9 (cls 4, comes from the inside / south-east, last point (-1547,-2463)) both end on the ring. The player was at X -1482, Z -2459 in the screenshot (about 65 m away). The ring there is on the straight between PI 3 (-2658.75,-1947.51) and PI 4 (-600.49,-2901.43), heading about 25 deg north of east. Crossing angles measured from the last segments: R6-9 about 94 deg, R4-9 about 84 deg (both inside the 70 .. 110 deg limit). R6 and R4 are in line (offset about 1 m), so this is a 4-leg CROSS, not two T junctions.
- MEANING: ring main 8 lane goes through. The 6-lane road is the north leg and the 4-lane road is the south leg ("2 pase 2 dike"). If the user meant something else (for example 6 + 4 lane SIDE roads along the ring), J0 must catch it before any work.
- CONCEPT (Purbachal type, 2 physical levels, updated 2026-11-24 to roundabout on top): ring MAIN 4 + 4 lanes in an UNDERPASS (cut-and-cover box); ring SIDE carriageways (local roads) at ground on both sides of the trench; R6 and R4 meet the side carriageways on a ROUNDABOUT (ASSUMED outer radius 62 m, circulating 14 m, island radius 48 m, circulates clockwise = left-hand traffic) built on top of the box roof; 4 arms: R6 (2 x 3 lane), R4 (2 x 2 lane), ring west side carriageways, ring east side carriageways. Ring-main users reach R6 / R4 by diverging to the side carriageway before the dive and through the roundabout; R6 / R4 users reach the main by leaving the roundabout on a side carriageway and merging into the main where it climbs back to ground. Ring through traffic never meets a signal.
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
- D4 Main <-> side carriageway connections (diverge and merge) at ground where the main is still / again at ground (about u = +-450 .. 560 m from the roundabout centre, before the dive and after the climb), these are the way the user's 'from the 2 sides onto the 8 lane' works: lengths from decelLength / accelLength / laneDropTaper (about 116 + 91 m exit, 241 + 183 m entry at V100), 4 connections (2 exits, 2 entries). Weave check on the side carriageway.
- D5 Junction on top = ROUNDABOUT (user 2026-11-24) over the box roof: 4 arms, entry flares, splitter islands, circulating 3 lanes (ASSUMED, decided in J3), deflection and entry angle checks, entry / circulating capacity (UK TRL / HCM style, not guessed), degree of saturation <= 0.85, stopping sight distance on every approach, pedestrian zebra crossings with refuge >= 2.4 m on every arm (or a footway under / over if the check fails), signal control on the roundabout only if J3 shows the unsignalised one fails (decision with numbers). Box length becomes about 124 m (roundabout diameter), not 90 m (J2 recalculates).
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
- **J1 TYPE + VERTICAL PLAN** (numbers + picture, no src): compare TYPE A (ring stays on its embankment, bridge over a ground roundabout, 4 ramps up to the ring) and TYPE B (photo type: ring dives in a box, roundabout on top) with numbers, see section 10; then underpass vs flyover fallback with numbers (trench length, depth, fill / cut m3, deck m2, groundwater), ring profile in the trench (levels, grades, K, tie-ins), box length, where the side carriageways sit. Recommend one, tell the user. docs/J300_TYPE.txt, json, png.
- **J2 CROSS-SECTIONS** (numbers): the 91.44 m budget at 5 stations (approach, wall, box, junction, transition), widening taper from 44.2 m, retaining walls, barriers. docs/J300_SECTIONS.txt, json, png.
- **J3 CALCULATION SHEET** (demand, roundabout capacity and geometry (radius, entry flare, deflection), signal need yes / no, lane layout, pocket / storage / taper / weave lengths, sight distance at every stop line and conflict, radii, superelevation): formulas shown, PASS / FAIL, ASSUMED list. docs/J300_CALC.txt, json.
- **J4 GEOMETRY DATA, ROUNDABOUT + ARMS** (pure math, no three.js): circulating lanes, island, splitter islands, entry / exit flares, crossings, all arm-to-arm movements, in the OpenJ1Geometry style. src/roads/junction/J300Geometry.ts (GENERATED data, nothing imports it yet) + check script.
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
- Roundabout on a box roof means the roof is about 124 m long and must carry a full roundabout (loads, drainage, island soil depth for trees): J7 checks it. Underpass 8 lane at 4 % needs about 0.9 km of trench: the first estimate in D2 can change in J1.

## 7. What was NOT done (honest)
2026-11-23: no code was changed and no check was run for this junction. The site facts in section 1 come from reading the data files (centrelines, ring PI table) with a small script, not from the game; ring level, water, rail and buildings are NOT measured. All widths and lengths in section 3 are first estimates (ASSUMED).

## 8. Starter prompt for a NEW chat
"Read HANDOFF_JUNCTION_300FT.md completely, then HANDOFF_JUNCTION_RTE.md sections 0 to 4 and HANDOFF_ROAD_DESIGN.md sections 3 and 13. We build the 300 feet junction on the ring (ring x R6-9 x R4-9). Run micro-step J0 only (site check script + ask me the one question). Reply in Banglish, one step per chat, only changed files in the zip, reuse what exists in the game, STOP after the step and wait for my OK."

## 9. Status table (update here)
| Step | Name | Status | User OK | Notes |
|------|------|--------|---------|-------|
| J-plan | This handoff | DONE 2026-11-23 (no code) | waiting | site reading and concept need the user's confirmation in J0 |
| J0 | Site check + confirm | DONE 2026-11-24, user chose TYPE A | OK (choice) | section 10 findings, section 11 plan |
| J1 | Type A numbers + vertical plan | not started | | |
| J2 | Cross-sections | not started | | |
| J3 | Calculation sheet | not started | | |
| J4 | Geometry: roundabout + arms | not started | | |
| J5 | Geometry: main + side + connections | not started | | |
| J6 | Terrain | not started | | |
| J7 | Structures (data) | not started | | |
| J8 | Mesh + markings | not started | | |
| J9 | Game hook-up | not started | | |
| J10 | Traffic graph + AI | not started | | |
| J11 | Signs + lights + tour | not started | | |
| J12 | Final | not started | | |

## 10. J0 RESULT (2026-11-24, headless run of scripts/j300-site-check.ts on the real game data)
FINDINGS (numbers in docs/J300_SITE.txt, json, profile picture docs/j300_site_profile.png):
- Ring station at the crossing 7594 m of 19293 m. The ring is on a long EMBANKMENT here: ring surface 28.5 m vs natural ground 18.8 m = 9.7 m fill at the crossing, 8 .. 21 m fill from u -700 to +450 (ring_profile_report.txt: tall fill st 6800-8060, max 20.7 m). Natural ground is flat (about 19 m) from u -500 to +150, then rises.
- So the ring is already high above R6-9 / R4-9. A 7.8 m dive of the ring does NOT dig into ground: the box floor would be about 20.7 m, still above natural ground 18.8 m (the "trench" is a cut through the embankment, with the box sitting almost on natural ground).
- EAST side limits: water on the ROW at u +540 .. +680 (ring has a bridge at ring st 8150-8200 there), natural ground rises to 47.9 m at u +500 and 71.5 m at u +700 (hill, max cross slope 24.9 %, FAIL against 6 %); a ring profile change to the east (needed for type B) would run into that hill and the water bridge.
- WEST side limit: the railway crosses under / over the ring at about u -600 (rail 10 m from the axis there, FAIL against the 75.7 m ROW + 30 m clearance rule, report only: the crossing already exists in the game). The planned merge / diverge zones at u -450 .. -560 stop 40 m before it.
- Buildings: none on the ROW, 3 within 300 m of the crossing. Engineering areas: none. Rail at the crossing itself: 322 m away. Other roads in the zone: R2-10 about 76 m from the axis (check in J1). Neighbouring ring junctions: nearest radial join W is 2146 m away.
- NOT RUN: groundwater level and flotation (not modelled in the game), trees on the ROW, trench drainage.

TWO REAL TYPES (the user must pick one, AI recommends A):
- TYPE A (recommended by the data): ring stays exactly as it is (profile fixed, H4 respected) on its embankment and crosses on a bridge about 124+ m long over a ROUNDABOUT built on the natural ground (about 18.8 m). R6-9 and R4-9 meet the roundabout at ground. The 8-lane ring is reached from 2 sides by 4 ramps that climb the 9.7 m (about 250 m long at 4 %) beside the embankment ("2 pas diye 8 lane e jawa"). Clearance 9.7 m over the roundabout is more than 5.5 m + deck depth. No excavation, no groundwater problem, no hill / water conflict, works with the existing fill. Picture: docs/j300_optionA_view.png.
- TYPE B (the photo type: roundabout on top, ring dives in a box): needs the ring profile lowered about 8 m over about 1 km (the ring comes down from 34 m at u -450 to about 20.7 m, then must climb to the old profile east, 4 % maximum, into the hill and over the water bridge), so about a new ring profile for 1.5 km, large box under a roundabout on a fill plateau, R6 / R4 have to climb 9.7 m to the roundabout. Possible but much bigger and it hits the east hill and the ring bridge. Picture: docs/j300_concept_view.png (shown on flat ground, not on the embankment).
Both give the user's "roundabout" and "enter the 8 lane from the 2 sides". J1 prices both (fill, cut, deck m2, ramp length, ring profile change) and the AI engineer recommends one; the user decides.

## 11. TYPE A PLAN (replaces section 5; ONE micro-step per chat, STOP after each for the user's OK; each step ends with a changed-files zip + a 3D picture)
FIXED: ring plan and profile (ring surface about 28.5 m at the crossing, 9.7 m above natural ground 18.8 m), rail, river, H1-H9 of section 4 (H4 now: nothing of the ring changes, the ring surface is only replaced by a bridge deck at the same level inside the bridge length).
DATA to start from (docs/J300_SITE.txt/json): ring station 7594 m, ring height 27.5 .. 28.5 m within +-150 m, natural ground flat about 19 m from u -500 to +150, rail crossing the ring at about u -600, water + hill from u +540, R2-10 about 76 m from the axis.
- **J1 TYPE A NUMBERS + VERTICAL PLAN** (numbers + picture, no src): bridge length and span layout over the roundabout (about 124 m outer diameter + slopes, ASSUMED), clearance (9.7 m minus deck depth against 5.5 m), roundabout pad level (natural 18.8 m, drainage fall), R6 / R4 arm levels and grades, ramp grades (9.7 m rise at 4 % maximum = at least 243 m plus vertical curves), where the 4 ramps start / end on the ring (inside u -450 .. +450 so the rail at u -600 and the water at u +540 are untouched), extra fill for the ramps and the roundabout pad (m3), R2-10 conflict, R1 crossing list. docs/J300_TYPEA.txt, json, png + 3D picture.
- **J2 CROSS-SECTIONS** (numbers): ring bridge deck (44.2 m, parapets, drainage), embankment slopes and widening for the ramps, roundabout carriageway and splitter islands, R6 2 x 3 lane and R4 2 x 2 lane arms, ramp 2 lane + shoulders, the 300 ft (91.44 m) ROW budget at the bridge (ring 44.2 + ramps + green / drain), sections at 5 stations.
- **J3 CALCULATION SHEET**: roundabout capacity and geometry (entry flare, deflection, circulating lanes, degree of saturation <= 0.85, signal need yes / no), ramp diverge / merge onto the 8-lane ring (V100: deceleration and acceleration lengths and tapers, weave check), ramp radii and superelevation, sight distances (roundabout entries, merge nose), pedestrian crossings, drainage of the low roundabout pad (flooding risk, fall, outfall), demand ASSUMED list.
- **J4 GEOMETRY DATA, ROUNDABOUT + ARMS** (pure math, no three.js): circulating lanes, island, splitter islands, entry / exit flares, crossings, arm links. src/roads/junction/J300Geometry.ts (GENERATED data) + check script.
- **J5 GEOMETRY DATA, RAMPS + GORES**: 4 ramps (roundabout to ring and ring to roundabout), gore noses, merge / diverge tapers, ramp profile, embankment widening footprint, check script (grades, K, lengths, G1).
- **J6 TERRAIN**: roundabout pad (cut / fill), ramp embankments with slopes, joins with the ring embankment and the arms, drainage; pattern GroundJ1Terrain.ts / RteTerrainData.ts. Check script (cut / fill, water, slope limits).
- **J7 STRUCTURES (data)**: bridge deck, girders, piers, abutments or retaining walls, bearing and parapet data, ramp retaining walls, culverts, as data like RteStructData.ts. Check script (clearance, spans).
- **J8 MESH + MARKINGS**: bridge, piers, ramps, roundabout, kerbs (yellow-black), islands, lines, arrows, zebra, chevron gore. Game layer with a Config switch default OFF.
- **J9 GAME HOOK-UP**: replace the ring embankment surface by the bridge inside its length (the ring mesh and ring carve must open a hole for the roundabout at ground and keep the ring surface level), carve the pad and ramp terrain, collision, minimap. Config ON only for the look.
- **J10 TRAFFIC GRAPH + AI**: ring lanes with ramps, roundabout rules (give way to the circulating flow), R6 / R4 links, every movement reachable, check script.
- **J11 SIGNS + LIGHTS + ENGINEERING TOUR**: Bangla + English green gantry signs on the ring before the ramps, lights, Bangla tour stop.
- **J12 FINAL**: all checks, drive of every movement by player and AI, rail / river / structures re-check, zip, status table.
Step statuses J1 .. J12: see section 9 (names for J1, J4, J5 changed above, the rest keep their names; J5 is ramps now, J6 terrain is pad + ramp embankments).

## 12. Starter prompt for the NEXT chat (J1)
"Read HANDOFF_JUNCTION_300FT.md completely (banner, sections 10 and 11 first), then HANDOFF_JUNCTION_RTE.md sections 0 to 4. TYPE A is decided. Run micro-step J1 only. Reply in Banglish, short, one step per chat, changed-files zip + a 3D picture at the end, reuse what exists in the game, STOP and wait for my OK."
