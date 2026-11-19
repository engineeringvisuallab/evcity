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
| R0 | not started | next step (after twin C0) |
| R1 | not started | |
| R2 | not started | |
| R3 | not started | |
| R4 | not started | |
| R5 | not started | |
| R6 | not started | |

## 10. HOW TO START IN A NEW CHAT

Paste: "Read HANDOFF_CITY_ROAD_DESIGN.md completely (rules first), then HANDOFF_CITY_DESIGN.md, then the HARD RULES block and 'CURRENT ORDER' at the top of HANDOFF_ROAD_DESIGN.md. Work as a city road engineer. Do ONLY step R0 (list the roads, fixed objects and old local streets inside each red zone). Run the water check first, say the plan first, change no src before telling me in plain words, PASS / FAIL list (NOT RUN where not run), then STOP. Reply in short Banglish. Changed files only in a versioned zip."
