# HANDOFF: CITY ROAD DESIGN (streets of the red city zones around J1) - evcity

Language: English only. This is the ONLY md file for the city street work. Its twin for land use and plots is `HANDOFF_CITY_DESIGN.md` (read it too). Do not create CHANGES_*.md files. When a step is done, update the status table in section 9 of THIS file.

Created 2026-11-18. Zones Z01-Z10 come from `HANDOFF_CITY_DESIGN.md` section 2 (UNCALIBRATED first trace of `docs/city_red_zones_user_sketch.png`). Nothing in this file has been RUN: no script, no tsc, no npm run build, no game look, no water check (the chat that wrote it had no node_modules and no network). Everything marked ASSUMED is a planning number of the AI, not from the web, not confirmed by the user.

---

## 0. THE USER'S ORDER (own words, keep them)

- "Game er J1 er ase pase area gula. main city." = the RED zones around J1 are the MAIN CITY (twin file section 0).
- "ami age road chai. city er jonno real engineering road solution. you are my city builder expert." (2026-11-18) = ROADS come first; real engineering street solution for the city; work as the user's city builder / road engineer.
- "handoff_city_design er moto kore road handoff banate hobe." (2026-11-18) = this file is the road twin of `HANDOFF_CITY_DESIGN.md`, same form.
- From the twin (apply to the streets): "jaiga sonkulan na hoy" (not cramped), hospital on the OUTER side with more land, university toward a SIDE with big land, "real engineering hoy. kono ajgobi kisu na koro" (real numbers, nothing random). The road design follows the land-use layout.
- From the road work (HANDOFF_ROAD_DESIGN.md, 2026-11-18): roads first, junctions are only numbers now, junction connection roads (mouths, ramps, slips, loops, pads, markings) come later. The user does not code: act as his engineer, decide and fix yourself, say only when something conflicts with a fixed item.

## 1. HARD RULES (every session, every step; a step with a FAIL is NOT done)

| # | Rule | Check |
|---|------|-------|
| CR1 | **STREETS ONLY.** No building is placed, moved or deleted, no plot is cut here (plots belong to the twin). `src/buildings/*` are NOT touched. Rail plan, the ring and the J1 arms are NOT changed. `Config.ts` / `RoadNetwork.ts` are touched only if really needed, and the user is told FIRST in plain words what will change. | git diff of src lists no forbidden file |
| CR2 | **THE RED SKETCH IS THE BORDER.** Every new street lies inside a red zone or is a LINK from a zone to the existing network. Where the sketch breaks the ground or a fixed object, do NOT change it silently: print the place and the number, show the smallest change, ask ONE small question. | script prints 'sketch kept' / 'sketch conflict at ...' per zone |
| CR3 | **FIXED = J1 (C10 (-87,-277), yaw 37.5), the four 8-lane arms, the ring, the railway (plan AND heights), rivers / lakes / sea, built roads (M8, R6-2 .. R6-8, slips, M6-1), EVLab, City Mall.** Everything else may move. | clearance to each fixed object printed per street |
| CR4 | **NO CROSSING (road R1 / X1 / X6).** A crossing is a node: both streets end there, new streets start from it. Nodes >= 60 m apart. Streets meet only as T or roundabout, no '+' at grade. A smaller road never crosses a bigger one (X2). | own crossing test over every pair, 0 crossings |
| CR5 | **NO BRANCH FROM J1 OR FROM A RING x ARM JOIN (road R5).** An 8-lane road is touched only at a TAP on the open road: >= 1600 m from every other tap / join, >= 600 m from the J1 plaza edge. Access to the zones comes from the existing R6 / R4 / R2 / C / L network. No zone may need a branch the rule forbids: if one does, SAY SO with the numbers and ask. | tap list recomputed from the node list |
| CR6 | **NO RANDOM STREET (R2) AND NO ZIG-ZAG (R3).** Every street carries a stated need (zone, AADT or function) and its class limit. Only straight - spiral - arc - spiral - straight, no zig-zag, no chord. A grid is allowed only when each edge passes R3. | smoothness check on every centreline, need printed per street |
| CR7 | **GROUND AND WATER FIRST (R8).** Run the water check `sc.water > sc.h` FIRST in every step that makes geometry (every 10 m along the line); a street over wet ground needs a deck >= water + 1.5 m. Then slope, cut / fill, rail, fenced land. | PASS / FAIL, a check that was not run is written NOT RUN, never PASS |
| CR8 | **ROADS AND PLOTS ARE ONE DESIGN.** Streets are cut round the land-use blocks of the twin (interleaved order, section 8). A plot with no access street is a FAIL (twin CD6). Hospital: 2 gates (main + emergency), not on a local street. University: own ring road, 2 gates, bus stop at the gate. | access check per plot |
| CR9 | **ONE SMALL STEP PER SESSION.** Say the plan first, do ONE step, print PASS / FAIL, then STOP for the user's OK. Decision needed = ONE small question. Say plainly what was NOT run (tsc, npm run build, game look). Files: update existing md only (this file, the twin, the pointer in HANDOFF_ROAD_DESIGN.md), ONE zip of only the changed files, versioned name (for example `EVCity_CITYROAD_R0_v1.0.zip`), CRLF kept in CRLF files. | zip content list |
| CR10 | **BANGLISH REPLY, SHORT.** The user writes Banglish; the reply is short, simple Banglish. The md files stay English. | - |

## 2. THE ZONES (from the twin, first trace, UNCALIBRATED, +-25 % area, +-80 m position until twin step C0)

| Zone | centre (x, z) m | area ha | where | street job (proposal, NOT decided) |
|------|-----------------|---------|-------|------------------------------------|
| Z01 | (-723, 149) | 12.9 | far WEST, biggest, beside the west rail line | university side: own ring road, 2 gates, quiet side |
| Z02 | (-357, 351) | 8.9 | SOUTH-WEST | neighbourhood: collector + local grid |
| Z03 | (-157, 544) | 4.2 | far SOUTH, left of the south arm | neighbourhood |
| Z04 | (-78, 61) | 11.1 | CENTRE block, J1 - Central station | arterial frontage, 400 m access gap, civic core |
| Z05 | (116, 497) | 4.8 | far SOUTH, right of the south arm | neighbourhood |
| Z06 | (136, -363) | 10.4 | NORTH-EAST, along the north arm | commercial / offices, service road |
| Z07 | (268, 239) | 5.5 | SOUTH-EAST of Central station | station side: bus terminal access |
| Z08 | (392, -332) | 8.8 | NORTH-EAST, strip between two arms | mixed |
| Z09 | (454, 31) | 4.1 | EAST, small | mixed, small |
| Z10 | (675, -270) | 7.7 | far EAST, outer side | hospital: 2 gates, emergency exit, away from J1 and rail |

About 78 ha gross. Roads take 25-30 % of the gross zone area (twin section 4): about 20-23 ha of streets for the whole city. The street plan must meet that figure, not exceed it.

## 3. WHAT EXISTS TODAY (read, do not guess)

- Fixed roads: J1 + arms J1-N / E / S / W (`src/roads/junction/GroundJ1*.ts`, `J1ArmData.ts`), ring M8, built R6 (R6-2 .. R6-8, R6-9 .. R6-15), slips and the J1-E half interchange (R6-8, T03 s 1485).
- Planned and now in the game (HANDOFF_ROAD_DESIGN.md 21.72; data in `docs/fit_chain/centre_fixed.json`, `src/roads/r4|r2|c|l/*NewLineData.ts`): the lines nearest to J1 (nearest point, from the 2026-11-18 scan): R4-12 494 m, R2-28 508, R2-18 558, R2-61 689, R2-19 748, R4-20 852, R2-77 887, R2-29 959, R6-15 1071, R4-9 1082, R6-12 1085, R4-13 1130, R2-30 1179, R2-43 1183, R2-17 1195, R2-31 1209, R2-76 1234, R2-32 1251, L-30 1318, R2-33 1407. Which of them run through which red zone is NOT known yet: step R0 lists it.
- Old Stage 10B local streets: `src/roads/LocalRoads.ts`, `Config.city.localRoads` (sites [0], lattice per CityPlan area, minEdge 60, minConnect 82, maxConnect 420, mainTSpacing 120, junctionKeepout 80). NOT checked against CR4 / CR5 / CR6 yet (a lattice is a chord grid). Step R0 checks it; the old city plan SITE0 in `src/city/CityPlan.ts` is replaced inside the red zones (twin section 3).
- Section widths: `src/roads/section/*`, `src/roads/standards/*`, `HANDOFF_ROAD_DESIGN.md` 3.1 / 3.5. Read the real numbers in R0; the ROW values in section 4 are ASSUMED until then.
- Fixed objects near the zones: Central station (about (0, 300), raised to 34 m), rail lines (west-nw, west-sw, north-1, east-1 ...), rivers, lakes. **Conflict to check in R0:** the twin names `EVLAB_PLOT` as x -520..-40, z -470..-30; the code in the zip (`src/evlab/EVLabSite.ts`, HANDOFF_EVLAB_RELOCATION_BN.md) has the EVLab plot turned and at EVLAB_POS (-140, -620). The CODE is the truth; correct the twin if it differs.
- Missing from the zip that the twin names: `docs/city_red_zones_user_sketch.png`, `tools/city-zone-trace.py`, `docs/city_zones_trace.json` / `.png`. Without them Z01-Z10 above are numbers only: the user must attach them again for C0 / R0.

## 4. STREET PROGRAMME (ASSUMED planning numbers, step R1 prints the table, the user OKs or changes it)

| Class | Role in the zones | Lane | Speed km/h | Max grade | Min radius m | ROW m (ASSUMED) | Access / node rule |
|---|---|---|---|---|---|---|---|
| R4 | arterial spine, feeds a zone from the network | 4, divided | 60 | 6 % | 130 | 36-40 | accesses >= 200 m apart (400 m in the centre), no local street joins it |
| R2 | collector / service road along arterials | 2 | 50 | 8 % | 70 | 22-24 | joins R4 / R6 by T, nodes >= 60 m |
| C | neighbourhood collector (schools, clinics, mosque, shops) | 2 | 40 | 8 % | 60 | 18-20 | blocks 200-300 m |
| L | local street, homes | 2 | 30 | 10 % | 30 | 12-14 | blocks 80-120 m, T offset >= 30 m, dead end <= 150 m with turning head >= 9 m radius |

Footpath on both sides of every class; separate cycle track on R4 and R2; grade-separated crossing on 4+ lane roads (road handoff 3.14). Special accesses: hospital two gates (main on C or R2, emergency on a different street with a free exit), fire station and local police direct exit onto an arterial or collector, university gate with a bus stop and a bay, mall and supermarket with a service road, Central station bus terminal with its own access.

## 5. PLANNING RULES (why a street is where it is)

- Hierarchy (road handoff 3.14): arterial -> collector -> local. A local street never joins an arterial or an arm (X2); it reaches a collector, the collector reaches an R4 / R2 / R6 line.
- Block size: 80-120 m in the city centre, 200-300 m between collectors. Hospital, university and schools keep away from arterials, the rail line and 8-lane arms (twin table 4).
- Distances to keep: building line 6-10 m arterial, 4-6 m collector, 3-5 m local; 30-50 m planted buffer from M8 / M6; >= 30 m from the railway axis; >= 30 m from a river / lake bank (ASSUMED); no street on wet ground without a deck.
- Sight and stopping: take the real function `stoppingSight` (`GroundJ1Geometry.ts`); ASSUMED about 30 m at 30 km/h, 45 m at 40, 65 m at 50.
- Dead ends: the user wants dead ends to stay dead ends (21.3 decision); do not join them just to make a network.
- Drainage and levels: the street level follows the vertical chain method (21.12 / 21.39), drain with `centre-drain.ts`, deck >= water + 1.5 m. Plot pads: only read the terrain work of HANDOFF_ROAD_DESIGN.md section 22, do not change it.
- Junctions: NODE NUMBERS only now (N..., T...). No mouth, kerb radius, pocket, signal. These come after the user has looked at the roads (21.61).

## 6. STEP PLAN (one step per session, STOP for the user's OK after each)

| Step | What | Output |
|---|---|---|
| R0 | **List what is there.** Water check first (NOT RUN if there is no node_modules). Per zone: existing roads (R6 / R4 / R2 / C / L ids, length inside the zone), Stage 10B local streets, fixed objects, buildings (list only), taps and nodes. Check Stage 10B against CR4 / CR5 / CR6. Settle the EVLab plot conflict of section 3. | `docs/STEPCITYR0_OUTPUT.txt`, script `scripts/city-road-scan.ts` (reads the game data headless, like the twin's `city-zone-scan.ts`), picture |
| R1 | **Arterial skeleton.** How each zone is reached from the existing network (no branch from J1, CR5): which R4 / R2 / R6 line serves which zone, where a link or a tap is needed, with lengths. Print section 4 in numbers for the user to OK or change. Check that roads fit the 25-30 % share. ONE question to the user. | `docs/STEPCITYR1_OUTPUT.txt`, `docs/city_road_skeleton.json` |
| R2 | **Collectors (C class)** for ONE zone per session, round the land-use blocks of the twin (start with Z10 hospital and Z01 university, then Z04, then the rest). Centrelines R3, 0 crossings (CR4), nodes >= 60 m. | `docs/city_roads_Znn.json`, picture |
| R3 | **Local streets (L class)** per zone: block grid 80-120 m with straight - spiral - arc - spiral - straight edges, dead ends, T offsets. | `docs/city_roads_Znn.json` |
| R4 | **Profile and earthwork.** Vertical profile, grade, cut / fill (<= 3 m for plots, road limits of road handoff 3.3), drain, bridge decks where the water check says so, per zone. | `docs/STEPCITYR4_OUTPUT.txt` |
| R5 | **Street table and checks.** One table `docs/city_roads.json` (id, zone, class, centreline, length, need, node ids, access plots). Checks: inside the zone, 0 crossings, nodes >= 60 m, R5 taps, grades, water, rail / river clearance, every plot has access. | `scripts/city-road-check.ts`, `docs/STEPCITYR5_OUTPUT.txt` |
| R6 | **See it in the game (only after the user's OK).** Add the streets to the key-3 road layer (or a data file like `R2NewLineData.ts` with a Config switch, default OFF), headless check, `npx tsc --noEmit`, `npm run build`, the user looks with the free camera V. Terrain pads and building plots stay with the twin. | data file + one Config switch (say first) |

## 7. WHAT THE USER MUST DECIDE (ask ONE question at a time, only when the step needs it)

1. Section 4 numbers (OK or change). 2. Which existing road lines in the zones stay, move or go (R0 list). 3. Old Stage 10B local streets: switch off inside the red zones, or keep? 4. If a zone cannot be reached without a branch from J1 or an arm (CR5): new tap, link from another road, or allow? 5. Zone to land use (twin C3) fixes where the hospital and the university streets go. 6. Existing buildings in the way: replaced later (user rule 21.56), confirm per street when it needs the space.

## 8. ORDER WITH THE PLOT TWIN (interleaved, never plots alone or roads alone)

C0 -> R0 -> C1 -> C2 -> C3 -> R1 -> C4 (Z10, Z01) -> R2 -> C4 (other zones) -> R3 -> C5 -> R4 -> R5 -> R6 (same as twin section 8). Each session does ONE of these.

## 9. STATUS TABLE (update here)

| Step | Status | Note |
|---|---|---|
| Handoff written | done 2026-11-18 | this file; nothing in src or data changed; NOT RUN: water check, scripts, tsc, npm run build, game |
| CRR-1 | done 2026-11-19 (numbers + picture only, see section 11) | rail-corridor road reach; user said 'next step' = OK |
| CRR-2 | done 2026-11-19 (numbers + picture only, section 11) | loops + T at the 5 ends; SUPERSEDED in part by decision 5 (junction instead of end at J1) |
| CRR-1b / CRR-2b | next | re-run with decision 5, see section 11 |
| R0 | not started | next step (after twin C0) |
| R1 | not started | |
| R2 | not started | |
| R3 | not started | |
| R4 | not started | |
| R5 | not started | |
| R6 | not started | |

## 10. HOW TO START IN A NEW CHAT

Paste: "Read HANDOFF_CITY_ROAD_DESIGN.md completely (rules first), then HANDOFF_CITY_DESIGN.md, then the HARD RULES block and 'CURRENT ORDER' at the top of HANDOFF_ROAD_DESIGN.md. Work as a city road engineer. Do ONLY step R0 (list the roads, fixed objects and old local streets inside each red zone). Run the water check first, say the plan first, change no src before telling me in plain words, PASS / FAIL list (NOT RUN where not run), then STOP. Reply in short Banglish. Changed files only in a versioned zip."

## 11. RAIL-CORRIDOR ROAD (CRR) - user job 2026-11-19, runs BEFORE R0 by the user's order

USER WORDS (Banglish, keep): "railway er pier er 2 pase 2 lane 2 lane 4 lane er road hobe. river cross korar agei mor ghure existing road er sathe connect hobe junction die." / "road j onle rail er baire jabe na amon na. rail er pilar ta hobe road er medien. r 4 lane er jonno jototuku jaiga lage lagbe" / "station k ignore koro. station er nicheo same. station pore design korbo." / "r a loop o hobe".

DECIDED (by the user, 2026-11-19):
1. A 4-lane road (2 + 2) runs ALONG each rail viaduct: the rail pier row is the MEDIAN; the road takes as much width as 4 lanes need (it is not limited to the rail footprint).
2. The road may LEAVE the rail (loop / turn) to join an existing road with a junction; this must happen BEFORE the river. Loops at the ends are allowed.
3. The STATION IS IGNORED: under the station the road is designed like on any other viaduct piece; the station is designed later. (User clarified 2026-11-19: 'station ignore mane station er niche diye road hobe' = the road RUNS UNDER the station too; the script has no station blocker.)
4. The user's pink sketch (3 screenshots: sketch over the plan, RU-1..RU-4 picture) is the wanted route; rule-breaking parts are fixed by the smallest change (earlier check: sketch 4456 m, 1624 m ok, 568 m caution, 2264 m broke rules: water, 8-lane crossing, station, tunnel, low viaduct, grade > 8 %, curve < 80 m). Station is no longer a rule break.

5. (2026-11-19, NEW, overrides the 'never cross 8 / 6-lane' rule of CRR-1 / CRR-2) If the rail-corridor road must cross another road (also an 8 / 6-lane J1 arm, ring), it becomes a JUNCTION at the crossing and the corridor road is SPLIT into two parts at that node. So the CRR-1 ENDs caused by J1-E (north-1), J1-S (west-nw) and J1-S + water (west-sw) are no longer ends: the road goes on through the junction until water / low rail / tunnel. The 45 m 'big road clearance' rule of CRR-2 is dropped, a junction node spacing rule (CR4) replaces it. Under the viaduct no pier may stand inside the junction: the crossing road passes between the piers, check the pier spacing.
6. User asked 'ami jeta diyeci ata korte problem ki ki?' (answered 2026-11-19, read from the picture, approximate): the pink sketch crosses J1-E at (252, -29) and J1-S at (-347, 47) (now allowed as junctions); east pink (480..500, 170..330) touches the river; south-1 rail comes down at (80, 814) (road cannot go under, loop before); dead ends (650, -400), (500, 170), (-640, 580) hook, west loop end; tight corners (north top (330, -500), west loop two corners, east hook (500, 170), south (-330, 890)) are below R 75 m (V50 minimum); pink is about 8 m wide, the real road is about 22.4 m; nodes with small roads R2-28 (south-1 s 310, east-1 s 270) and R4-20 (west-sw s 400) need T / roundabout; the 5 roads meet at Central (hub later, station ignored).

(DONE 2026-11-19, see CRR-1b RESULT below) NEXT STEP WAS = CRR-1b: run scripts/city-rail-road-reach.ts again with rule 5 (J1 crossing = junction node, not END; ENDs only water / low rail / tunnel), then CRR-2b loops at the real ENDs only (south-1, east-1, west-sw; check north-1 and west-nw ends: edge end or far), update docs and the picture, update this handoff, give the WHOLE project zip.

SECTION (ASSUMED from the RU picture legend, not from the web, user may change): median 6.4 m (pier row inside), 2 lanes x 3.5 m per side + 1.0 m shoulder => road edge 11.2 m from the rail line, about 22.4 m wide. In the picture: RU-1 198 m, RU-2 250 m, RU-3 308 m, RU-4 434 m (old result, made with the old rules incl. the station as a blocker; superseded by CRR-1).

RULES USED BY CRR (scripts/city-rail-road-reach.ts, numbers at its top): clearance rail deck underside - road surface >= Config.roads.roadRailBuffer.railOverRoad (7.0 m, road on the natural ground; deficit <= 2.0 m = shallow cut 'lower', more = END); water (sc.water > sc.h - 0.3) across +-(11.2 + 3) m = END; 8 / 6-lane road (ring, J1 arms, M6, R6) is never crossed (CR4 / CR5) = END; crossing with a small existing road = NODE (listed); the 5 lines start where each centreline is >= 28.4 m from all the others (the rail edges start about 70 m from the Central station point, so all 5 start at s 0).

CRR-1 RESULT (2026-11-19, headless, REAL game data TerrainGenerator + rail, run with tsx; docs/STEP_CRR1_OUTPUT.txt, docs/city_rail_road_reach.json, docs/city_rail_road_reach.png, tools/city-rail-road-plot.py):
| line | reach from Central | END reason | END point (x, z) | small-road crossings (node) | nearest small road to the end |
|---|---|---|---|---|---|
| south-1 | 450 m | rail clearance 4.8 m (< 5.0), rail comes down to the ground | (80, 814) | R2-28 at s 310 | R2-28 145 m |
| north-1 | 350 m | 8-lane J1-E crossing | (252, -29) | none | R4-12 75 m |
| east-1 | 350 m | rail clearance low (river side) | (414, 341) | R2-28 at s 270 | R2-28 81 m |
| west-nw | 360 m | 8-lane J1-S crossing | (-347, 47) | none | R4-20 449 m |
| west-sw | 780 m | water + J1-S crossing | (-695, 789) | R4-20 at s 400 | R2-31 69 m |
Clearance along the used pieces: south-1 4.8..13.3 m (30 m shallow cut), north-1 10.4..13.5, east-1 4.8..13.2 (20 m shallow cut), west-nw 12.9..14.4, west-sw 9.8..19.9. Cross slope over +-11.2 m is under 3 m everywhere (0 m of the used pieces above). Total reach 2290 m.
FINDINGS: (a) the 8-lane J1 arms cut across north-1 (252, -29), west-nw (-347, 47) and west-sw (-695, 789); a road along the rail cannot cross them (CR4), so at these three places the road must turn away (loop) BEFORE the arm or end; the ENDs are exactly the loop places. (b) south-1 and east-1 end because the rail comes down to the ground near the river: the loop must start earlier than the END (a loop needs about 100-200 m, not sized yet). (c) 5 roads of 22.4 m width meet at the Central hub: the hub (roundabout / junction) is for the station step later, CRR-1 only keeps the lines apart. (d) rail pier-to-road rule: pierToDeckEdge 3 m is about road BRIDGE decks; here the piers are in the median, not checked yet.
NOT RUN / NOT DONE: tsc, npm run build, game look; loops (shape, radius, spiral), the T / junction with the existing roads, vertical profile, junction levels, the pier row clearance to the lane edge (median 6.4 m vs pier width), the sketch parts that leave the rail (west loop, north loop, south-east link, the link west-sw to the south road at (-100, 890)); the nodes with small roads are not designed.

CRR-2 RESULT (SUPERSEDED by CRR-2b below for north-1 and west-nw; 2026-11-19, headless, REAL game data, run with tsx; scripts/city-rail-road-loops.ts, docs/city_rail_road_loops.json, docs/STEP_CRR2_OUTPUT.txt, docs/city_rail_road_loops.png via tools/city-rail-road-plot.py; needs docs/city_rail_road_reach.json of CRR-1). USER 2026-11-19: 'next step'.
SHAPE (R3): the road follows the rail up to the leave point s, then ONE bend straight - spiral Ls - arc R - spiral Ls - straight, arriving PERPENDICULAR (T) on an existing small road (lanes < 6, no ramps). d1 / d2 are solved so the line ends exactly on the target; the search keeps the road on the rail as long as it can (every metre of early leave costs 3 m of loop). ASSUMED numbers (planning only, user may change): V50 city arterial, R 75..450 m with Ls 35..80 m (R < 100 m is penalised), last straight >= 40 m, deflection <= 150 deg, 8 / 6-lane road kept >= 45 m away and never crossed, other rail lines >= 20 m, other small roads not crossed, natural ground grade <= 6 % over 20 m (a real profile is CRR-4), water across +-14.2 m = none.
| line | road along the rail | loop bend | loop length | T (perpendicular) on | max ground grade | nearest 8/6-lane road |
|---|---|---|---|---|---|---|
| south-1 | s 0..380 | R 100, Ls 40, 97.4 deg | 277 m | R2-29 at (-103, 889) | 5.4 % | 432 m |
| north-1 | s 0..60 | R 100, Ls 40, 40.2 deg | 168 m | R2-28 at (241, 148) | 1.6 % | 140 m |
| east-1 | s 0..80 | R 100, Ls 40, -48.4 deg | 194 m | R2-28 at (319, 258) | 1.6 % | 179 m |
| west-nw | s 0..200 | R 75, Ls 35, -103.7 deg | 509 m | R4-20 at (-488, 476) | 4.6 % | 56 m |
| west-sw | s 0..610 | R 75, Ls 35, -146.6 deg | 401 m | R4-20 at (-340, 830) | 4.9 % | 71 m |
Total loops 1549 m. Alternatives (2-3 per line) are in the json and STEP_CRR2_OUTPUT.txt.
FINDINGS: (a) north-1 and east-1 leave the rail EARLY (s 60 / s 80) although the CRR-1 reach is 350 m: later loops on north-1 fail the 45 m clearance to J1-E (7846 of 8001 checked shapes), on east-1 they fail the 6 % natural ground grade (river bank) or cross R2-x (5869 / 2126 of 8001). Options for the user: accept the early loop, or allow a steeper ground grade / cut and fill (CRR-4 decides), or let the loop pass closer to J1-E. (b) west-nw: the loop runs 56 m beside the J1-S arm and is 509 m long (the straight after the bend is 336 m); west-sw: bend of 146.6 deg (a real U-turn) with R 75 m, V50 minimum, 71 m from the arm, 140 m from the water. (c) R 75 m is the V50 minimum; R >= 100 m needs the V50 to be kept, not a lower speed. (d) south-1 loop ends at (-103, 889): the user's pink sketch had the same T at (-100, 890). (e) The leave point is NOT yet smooth with the rail curvature (the bend starts where the rail may still be curved; checked later in CRR-4). (f) The T crossings of the nodes R2-28 (south-1 s 310, east-1 s 270) and R4-20 (west-sw s 400) along the rail are CRR-3.
NOT RUN / NOT DONE (CRR-2): tsc, npm run build, game look; vertical profile; the T junction layout (the T is only a point + direction); node spacing 60 m (CR4); the median 6.4 m on the loop (the pier row ends at the leave point, the loop road has a normal median, not designed); other small-road nodes; buildings / zones on the loops are ignored (CR1, plots belong to the twin).

CRR-1b RESULT (2026-11-19, headless, REAL game data, tsx; USER rule 5: a crossing with a big road is a JUNCTION NODE, not an END). Files: scripts/city-rail-road-reach.ts (changed), tools/city-rail-road-plot.py (changed: parts, junction stars, small-road circles; the loops picture is drawn only when the loops json matches the reach version), docs/city_rail_road_reach.json (new, version 'crr1b', has `junctions` and `parts`), docs/city_rail_road_reach.png, docs/STEP_CRR1B_OUTPUT.txt; the old CRR-1 json is kept as docs/city_rail_road_reach_crr1.json.
ENDs are now only water / low rail (clearance) / tunnel. South-1, east-1 and west-sw are unchanged (their ENDs were never J1).
| line | reach | END reason | END point (x, z) | junctions with 8-lane roads (node, road splits) | parts (s, length) | small-road nodes |
|---|---|---|---|---|---|---|
| south-1 | 450 m | low rail (clearance 4.8) | (80, 814) | none | 0..450 | R2-28 s 310 |
| north-1 | 640 m | low rail (clearance -2.2, rail comes to the ground) | (305, -314) | J1-E s 350 at (249, -19), 65 deg | 0..350 (350) + 350..640 (290) | none |
| east-1 | 350 m | low rail (river side) | (414, 341) | none | 0..350 | R2-28 s 270 |
| west-nw | 830 m | low rail | (-754, -189) | J1-S s 360 at (-339, 52), 83 deg; J1-W s 790 at (-717, -167), 89 deg | 0..360 + 360..790 (430) + 790..830 (40) | none |
| west-sw | 780 m | water | (-695, 789) | none inside the reach (the J1-S crossing lies behind the water END) | 0..780 | R4-20 s 400 |
Total reach 3050 m (CRR-1: 2290 m). Min clearance on used pieces: south-1 4.8, north-1 -2.2 (END point), east-1 4.8, west-nw 4.4 (END point), west-sw 9.8 m.
PIER CHECK at the 3 junctions (assumed section of the crossing 8-lane road: 8 x 3.5 m / 2 + 1.0 m shoulder = 15 m half, pier 3.2 m, pierRoadGap 1.6 m, skew angle taken into account; needed distance along the rail from the crossing point to each pier): J1-E needs >= 20 m, piers at 42 m before and 20 m after (TIGHT, margin about 0, rounded numbers), the rail piece is a STEEL SPAN (no pier at the crossing); J1-S needs >= 18 m, piers 36 / 30 m, steel span; J1-W needs >= 18 m, piers 31 / 50 m, steel span. All 3 PASS. Note: the rail (not the road) decides these spans; the corridor road at the junction was not designed, only checked.
FINDINGS: (a) north-1 now reaches 640 m and crosses J1-E, so the old north-1 loop (s 60, CRR-2) is no longer needed: the loop belongs at the real END (305, -314). (b) west-nw now reaches 830 m and crosses J1-S and J1-W; its old CRR-2 loop (s 200, 509 m) is dropped; the loop goes to the real END (-754, -189). (c) The last part of west-nw (J1-W s 790 to END s 830) is only 40 m: shorter than the 60 m node spacing rule (CR4), so it is a stub; options: the road ENDS at J1-W, or the loop starts before s 830. (d) west-sw ENDs at water (-695, 789) (CRR-1 said water + J1-S; J1-S is behind it). (e) The 8-lane road under the viaduct: whether the junction is at grade or the 8-lane road is a bridge there is not checked (CRR-4 vertical profile). (f) The CRR-2 result above is SUPERSEDED for north-1 and west-nw; south-1, east-1, west-sw had the same ENDs, but CRR-2b must still be rerun with the new reach json (the old docs/city_rail_road_loops.* belong to CRR-1 and are stale).
RUN: scripts/city-rail-road-reach.ts (tsx, real TerrainGenerator + rail), plot tool (matplotlib). NOT RUN: tsc, npm run build, game look (no node_modules, no network in this chat); the junction layout, the vertical profile, the corridor road at the junction, the node T / roundabout for the small roads (CRR-3), loops (CRR-2b).
NEXT QUESTION FOR THE USER (ONE): CRR-2b next (loops at the 5 real ENDs south-1, north-1, east-1, west-nw, west-sw; west-nw stub 40 m: ends at J1-W or loop before)? Say OK.

CRR-2b RESULT (2026-11-19, headless, REAL game data, tsx; USER 'koro tumi engineer'). Files: scripts/city-rail-road-loops.ts (changed), tools/city-rail-road-plot.py (changed), docs/city_rail_road_loops.json (version 'crr1b'), docs/STEP_CRR2B_OUTPUT.txt, docs/city_rail_road_loops.png. Needs docs/city_rail_road_reach.json of CRR-1b. This SUPERSEDES the CRR-2 result above (old files docs/STEP_CRR2_OUTPUT.txt kept for history).
USER CORRECTIONS on the CRR-1b picture (drawn, 2026-11-19): (1) west-nw does NOT go on to J1-W: it leaves the rail BEFORE J1-W, loops west then south, T on a small road near (-780, 360); (2) west-sw leaves the rail early (about (-590, 715)) and turns south to the small road near (-630, 805), no road to the water END.
RULE CHANGES vs CRR-2 (engineer decision): the 45 m 'big road clearance' is replaced by BIGCLR 30 m (= 11.2 half road + 15 half 8-lane road + 3.8 m gap, roads never overlap); a loop still never CROSSES a big road; leave point >= 60 m from every junction / small-road node of its line (CR4); search back 900 m from the END; R 75..450 V50, Ls by R, last straight >= 40 m, deflection <= 150 deg, ground grade <= 6 % over 20 m, other rail >= 20 m, water over +-14.2 m = none (same as CRR-2).
| line | road along the rail | loop bend | loop length | T (perpendicular) on | max ground grade | nearest 8/6-lane road |
|---|---|---|---|---|---|---|
| south-1 | s 0..380 (END 450) | R 100, Ls 40, 97.4 deg | 277 m | R2-29 at (-103, 889) | 5.4 % | 432 m |
| north-1 | s 0..550, J1-E junction at s 350 (END 640) | R 100, Ls 40, 117 deg | 317 m | R4-12 at (522, -252) | 4.5 % | 186 m |
| east-1 | s 0..80 (END 350) | R 100, Ls 40, -48.4 deg | 194 m | R2-28 at (319, 258) | 1.6 % | 179 m |
| west-nw | s 0..580, J1-S junction at s 360 (END 830, J1-W NOT used) | R 75, Ls 35, -99 deg, then 389 m straight | 555 m | R2-77 at (-810, 348) | 4.6 % | 117 m |
| west-sw | s 0..610 (END 780) | R 75, Ls 35, -146.6 deg | 401 m | R4-20 at (-340, 830) | 4.9 % | 71 m |
Total loops 1744 m. Alternatives (up to 3 per line) are in the json and STEP_CRR2B_OUTPUT.txt (e.g. north-1 leave s 450, loop 250 m, T on R4-12 at (448, -158), 98 m from the 8-lane road; west-sw leave s 470, R 75, loop 276 m, T on R4-20 at (-343, 750), 152 m from the 8-lane road).
FINDINGS: (a) west-nw: the user's loop PASSES (leave s 580, T on R2-77 at (-810, 348), 30 m west of his drawn end; the bend is R 75, the V50 minimum; the J1-W junction and the 40 m stub are gone). (b) west-sw: the user's loop (T near (-630, 805)) does NOT pass, even with BIGCLR 12 m and ground grade 10 %: 338 shapes, 0 pass; reasons (CORRECTED 2026-11-19, the first note had the J1-S reason wrong, it belongs to the hint-free search): the loop would cross another small road (200 shapes), come within 20 m of a rail line (80) or exceed the 6 % ground grade (58). The best passing loop is the old CRR-2 U-turn (leave s 610, R 75, 146.6 deg, T on R4-20 at (-340, 830), 401 m); a shorter alternative leaves at s 470 (loop 276 m, T on R4-20 at (-343, 750)). (c) north-1 now has its loop at the real END side (leave s 550, east to R4-12), no longer the early loop at s 60. (d) east-1 still leaves early (s 80, ground grade above 6 % on the river bank later, as in CRR-2). (e) All loops are R 75 / R 100 (V50), leave points are not yet smooth with the rail curvature (CRR-4).
RUN: city-rail-road-loops.ts (tsx, real TerrainGenerator + rail), plot tool (matplotlib), diagnostic runs for west-sw with looser limits (script copy, deleted). NOT RUN: tsc, npm run build, game look (no node_modules, no network); vertical profile; T junction layout (a point + direction only); median 6.4 m on the loop (the pier row ends at the leave point); buildings / zones on the loops ignored (CR1).
NEXT QUESTION FOR THE USER (ONE): west-sw: accept the U-turn loop (leave s 610, 401 m, T on R4-20 at (-340, 830)), or the shorter one (leave s 470, 276 m, T on R4-20 at (-343, 750))? Then CRR-3 (the T / roundabout at the small-road nodes R2-28, R4-20 and the 5 T ends).

USER SKETCH 2 (2026-11-19, numbers 1-8 drawn on the CRR-2b picture, question 'amon noy keno?'). My reading: tick near the west-nw end = OK; 8 = a hub circle round Central (the 5 roads meet there, later step, station ignored); 3 = the R2-28 node on east-1 (T / roundabout, CRR-3); 1 + 5 = north-1 goes on along the rail north to about (353, -540), then east to about (636, -407); 4 = east road leaves the rail near its END and ends at about (507, 174); x + circle + 7 = the old west-sw target (-630, 805) crossed out, new target on the small road near (-594, 871); 'x 2' and 6 not understood.
DIAGNOSTIC (headless, same checks, not saved): north-1 with the T near (640, -400): 2291 shapes, 0 pass (ground grade above 6 % 2078, J1-E closer than 30 m 186, other rail within 20 m 27); the sketch line itself goes on along the rail past the north-1 END (305, -314) where the rail is low (clearance -2.2 m), so it is no longer 'road along the viaduct'; east with T at (507, 174): 0 shapes, because (507, 174) lies ON the J1-E 8-lane road, there is no small road within 120 m (CR5: an 8-lane road is touched only at a tap); west-sw with T near (-594, 871): 1117 shapes, 0 pass (crosses another small road 700, other rail within 20 m 280, grade 137).

USER ORDER 2026-11-19 ('next step e road gula bosaw. you are my engineer. existing road jodi thake tahole segula k ami kisu cross dici remove korte hobe'): the next step puts the CRR roads INTO THE GAME. Where a new road crosses or overlaps an existing road, make a junction / T when the rules allow; if it does not work, the existing road may be trimmed or REMOVED (user allows). List every such existing road with a proposal BEFORE touching it.
ENGINEER DECISIONS (final for CRR-5, from CRR-1b / CRR-2b; sketch-2 wishes that fail the rules are NOT built, they stay open ideas): five roads = docs/city_rail_road_reach.json (`parts`, split at the J1 junctions) + docs/city_rail_road_loops.json (`good[0]` of each line): south-1 loop s 380 -> R2-29 (-103, 889); north-1 J1-E junction s 350, loop s 550 -> R4-12 (522, -252); east-1 loop s 80 -> R2-28 (319, 258); west-nw J1-S junction s 360, loop s 580 -> R2-77 (-810, 348) (user tick OK, J1-W not used); west-sw U-turn s 610 -> R4-20 (-340, 830). Section: median 6.4 m (pier row), 2 + 2 lanes of 3.5 m + 1.0 m shoulder, 22.4 m wide; the loop part has a normal median (not designed). Small-road nodes on the rail (R2-28 on south-1 s 310 and east-1 s 270, R4-20 on west-sw s 400) = T / roundabout (CRR-3), the 5 loop ends = T. Central hub (circle 8 of sketch 2) and the station come later; the 5 roads start 70 m from Central and stop there. Sketch-2 'x 2' and '6' not understood: ignored.
CRR-5 PLAN (one step per session, STOP for the user's OK): CRR-5a (headless, src untouched): (1) read the build order in RoadNetwork.ts (roads, applyRoadFixes in RoadCorrections.ts ROAD_FIXES, pads, THEN the railway) and the rail pier rule (RailContext.pierFree, RailNetwork.placePiers: piers avoid asphalt + shoulder + pierRoadGap 1.6 m): the corridor road is built from the RAIL centreline but the rail is built after the roads, and the rail would see the new asphalt as an obstacle and move its piers / make steel spans: decide how (road centreline from the saved json as fixed data, the median 6.4 m kept free of asphalt, piers allowed in the median); (2) table of EVERY existing road that crosses, overlaps or lies within 25 m of the 5 roads (name, lanes, where) with the proposal junction / T / trim / remove; (3) NOT RUN list. CRR-5b: add the 5 roads to the game (data + RoadNetwork), tsc / npm run build by the user on his machine, look in the game. CRR-5c: mesh / section with the pier median, junction pads. CRR-3 (T / roundabout design at the nodes) and CRR-4 (vertical profile) are folded into 5b / 5c only as far as the game needs them; say so in the step.

CRR-5a RESULT (2026-11-19, headless, REAL game data, tsx, src UNTOUCHED). Files: scripts/city-rail-road-conflicts.ts (new), tools/city-rail-road-plot.py (changed: third picture), docs/city_rail_road_conflicts.json, docs/STEP_CRR5A_OUTPUT.txt, docs/city_rail_road_conflicts.png.
(1) BUILD ORDER (read from the code): RoadNetwork constructor (tiers, ring, scenarios, applyRoadFixes, pads, earth tracks, interchanges, J1 terrain, buildSegments) -> sea port -> RailNetwork (the plan sees the roads built so far; it calls roads.addJ1Arms() BEFORE its long section, RailNetwork.ts line 292, so the long section also sees the J1 arms, R6, R4, R2, C and L new lines) -> RailFormation -> TerrainGenerator calls addJ1Arms again (no-op). sample(): natural ground -> ResidentialFlat -> roads.apply -> railForm.apply (rail earthworks win over road earthworks) -> port. Rail pier rule: RailContext.pierFree refuses a pier within planHalfWidth + shoulder + pier half 1.6 + pierRoadGap 1.6 m of any road centreline, near pads and road bridges; piers move 15 m or become steel spans. RULE 'THE RAILWAY CANNOT CHANGE' (user, 2026-11-14).
DECISION (engineer): the 5 corridor roads join the network in a NEW method (name proposal addCorridorRoads) called from TerrainGenerator AFTER `this.rail`, `this.railForm` and the J1 arms exist, NOT inside addJ1Arms (that one runs before the rail long section). So the rail never sees the new asphalt: no pier moves, no new steel span, the rail plan stays exactly as it is. After adding: clear chunkSegs, padCells, chunkPads, cells, j1Cells and call buildSegments (same as addJ1Arms). The centreline comes from the saved docs json (fixed data: reach path up to the leave point + loop path), switched by a Config flag (default OFF until the user has seen it). Pier row vs lanes: median half 3.2 m, pier half 1.6 m => 1.6 m between pier and lane edge (= pierRoadGap 1.6, OK); the rail deck (half 5.8 m) overhangs each inner lane by 2.6 m at 7 m or more clearance (OK).
(2) CONFLICT TABLE (existing roads within 25 m edge to edge of the 5 new roads; new half width 11.2 m; the first contact in each row is the one meant by design):
| new road | existing road | contact | meant as | pier check (crossing road passes between two piers) |
|---|---|---|---|---|
| south-1 | R2-28 (2 lanes) | crossing (59, 670) s 304, angle 85 deg | small-road node | piers 44 / 10 m, need 8 m, PASS (margin 2 m) |
| south-1 | R2-29 (2 lanes) | T end (-103, 889) | T target | - |
| north-1 | J1-E (8 lanes) | crossing (249, -19) s 340, angle 68 deg, arm at GRADE (road 20.4 m, ground 20.6 m, not on a bridge) | J1 junction (rule 5) | piers 32 / 30 m, need 20 m, STEEL SPAN, PASS |
| north-1 | R4-12 (4 lanes) | T end (522, -252) | T target | - |
| east-1 | R2-28 (2 lanes) | T end (319, 258) | T target | - |
| west-nw | J1-S (8 lanes) | crossing (-339, 52) s 351, angle 83 deg, arm at GRADE (18.3 / 18.2 m) | J1 junction (rule 5) | piers 27 / 39 m, need 18 m, STEEL SPAN, PASS |
| west-nw | R2-77 (2 lanes) | T end (-810, 348) | T target | - |
| west-sw | R4-20 (4 lanes) | crossing (-381, 559) s 391, angle 87 deg | node | piers 18 / 22 m, need 11 m, PASS |
| west-sw | R4-20 | T end (-340, 830) | T target | - |
| west-sw | R2-30, R2-31 | no contact, gap 16.5 m and 12.7 m | near only | - |
No junction pad lies within core + 21 m of any new road. NO EXISTING ROAD NEEDS TO BE REMOVED OR TRIMMED (the user's permission is not used). The existing small roads are only TOUCHED: 3 crossings (R2-28 south-1, R4-20 west-sw, and the 2 J1 arms) and 5 T ends.
FINDINGS: (a) the J1-E and J1-S arms are at ground level at the crossings, so an at-grade junction is possible (no ramps). (b) CR5 (8-lane road touched only at a tap, >= 600 m from the J1 plaza edge, >= 1600 m between taps) is BROKEN at both J1 junctions: J1-E crossing is 424 m and J1-S crossing 414 m from the J1 centre (plaza edge about 100 m closer than that). The user's rule 5 (2026-11-19) says a crossing with J1 is a junction, so the engineer follows rule 5 and records the deviation here; the 8-lane junction design (signals, turn lanes) is CRR-3. (c) Roundabouts are NOT possible at the nodes on the rail (the pier row stands in the median, no free island): CRR-3 proposal = 4-leg signalised junction at grade where the crossing road passes through the gap between two piers (R2-28 gap 54 m, R4-20 gap 40 m, J1 arms steel span), or the small road is cut into two T's. Decide in CRR-3. (d) R4-20 is a 4-lane road (not small): the node is 4 x 4 lanes. (e) the loop ends are T on roads of 2 lanes (R2-29, R2-28, R2-77) and 4 lanes (R4-12, R4-20), existing roads are not changed.
RUN: scripts/city-rail-road-conflicts.ts (tsx, real TerrainGenerator + rail + roads), plot tool. NOT RUN: tsc, npm run build, game look (no node_modules, no network in this chat); nothing is in the game yet; vertical profile of the 5 roads (CRR-4: road on natural ground, the 'lower' shallow-cut pieces south-1 30 m, north-1 30 m, east-1 20 m, west-nw 20 m with clearance below 7 m need a cut; railForm earthworks win over road earthworks there); the section (median 6.4 m with pier row, normal median on the loops); junction layout; traffic graph and pads for the new nodes.
NEXT QUESTION FOR THE USER (ONE): J1-E and J1-S junctions break the 600 m rule CR5 (about 100 m from the plaza): the engineer follows his rule 5 and builds them. OK? Then CRR-5b (add the 5 roads to the game: new method after the rail, Config flag, centreline from the json, heights on the natural ground, tsc / npm run build on his machine, look in the game).

CRR STEP PLAN (one step per session, STOP for the user's OK): CRR-2 loops and end connections (for each END: loop start s, spiral-arc-spiral, radius >= class limit, T into the nearest small road, water + 8-lane check on the loop, picture); CRR-3 nodes with the small roads (R2-28, R4-20) = T / roundabout, no '+'; CRR-4 vertical profile (road on ground or shallow cut, clearance under the rail >= 7.0 m, loop levels); CRR-5 the road in the game (RoadNetwork layout, mesh, shader section median 6.4 m with piers), checks; later: Central hub with the station.
NEXT QUESTION FOR THE USER (ONE): north-1 / east-1 leave the rail at s 60 / 80: accept, or allow steeper ground (CRR-4) so the road stays on the rail longer? CRR-3 can start after his OK.
