# HANDOFF: CITY DESIGN (land use and building plots, NO buildings) - evcity

Language: English only. This is the ONLY md file for the land-use / plot work. Its twin for the streets is `HANDOFF_CITY_ROAD_DESIGN.md`. Do not create CHANGES_*.md files. When a step is done, update the status table in section 9 of THIS file.

Created 2026-11-18 from the user's screenshot `docs/city_red_zones_user_sketch.png` (game top view around J1, camera X -81 / Z -50, height 1063 m).

---

## 0. THE USER'S ORDER (own words, keep them)

- "Game er J1 er ase pase area gula. main city." = the RED outlined areas around J1 are the MAIN CITY.
- "ekhane sob dhoroner building and office hobe. Police, hospital, School buildings etc ja ja baki thake. city ke sajate hobe red portion er vitore." = every kind of building and office must find a place INSIDE the red zones (police, hospital, schools and everything that is still missing).
- "tumi akjon city design expert hisebe amar city design korbe. only building er jonno area nirdharon korbe but kono building bosabe na." = work as a city design EXPERT. Only fix the LAND (plot) for each building. Do NOT place any building.
- "jaiga sonkulan na hoy. hospital er jonno aktu besi jaiga dorkar. tai aktu bairer dike boro jaiga niye korle valo. university ta aktu paser dike boro jaiga niye korle valo." = plots must NOT be cramped. Hospital: more land, on the OUTER side. University: big land, toward a SIDE. The road design follows this layout (road handoff).
- "real engineering hoy. kono ajgobi kisu na koro." = real planning and engineering numbers, nothing random.

## 1. HARD RULES (every session, every step; a step with a FAIL is NOT done)

| # | Rule | Check |
|---|------|-------|
| CD1 | **LAND ONLY.** No building is placed, moved, deleted or edited. `src/buildings/*` (Placements.ts, PlacementsFill.ts, FillBuildings.ts, ProtoSite.ts) are NOT touched. Existing buildings inside the red zones are only LISTED (they are replaced later, user rule 21.56). | git diff shows no change in src/buildings |
| CD2 | **THE RED SKETCH IS THE BORDER (like R10).** Every plot lies fully inside a red zone. Nothing outside. Where the sketch breaks the ground or a fixed object (rail, J1, 8-lane arm, river), do NOT change it silently: print the place and the number, show the smallest change, ask ONE small question. | script prints 'sketch kept' / 'sketch conflict at ...' per zone |
| CD3 | **FIXED = J1 (C10 (-87,-277), yaw 37.5), the four 8-lane arms, the ring, the railway (plan AND heights), rivers / lakes / sea.** Everything else may move. | zone check prints clearance to each fixed object |
| CD4 | **NOT CRAMPED.** Every plot is at least its MINIMUM area (table 4) and the zone keeps a RESERVE (10-15 % of net land unplanned, for growth). Hospital and university get the biggest plots (table 4) on the outer / side positions. If the land of the red zones is not enough for a programme, SAY SO with the numbers and ask; never squeeze a plot below its minimum. | plot table check: area >= minimum, reserve share printed |
| CD5 | **REAL NUMBERS.** Every size, distance and share comes from table 4 / 5 (planning norm ranges, marked ASSUMED until the user OKs them) or from the game data. Every plot row prints the rule that gave it. No number without a source. | output lists the source of each number |
| CD6 | **ROADS AND PLOTS ARE ONE DESIGN.** Plots are cut along the road skeleton of `HANDOFF_CITY_ROAD_DESIGN.md` (interleaved order, section 8). A plot with no access road is a FAIL. No branch from J1 (road rule R5): access to the zones comes from the existing R6 / R4 / R2 / C / L network and from taps >= 600 m from the J1 plaza edge. | access check per plot |
| CD7 | **ONE SMALL STEP PER SESSION.** Say the plan first, do ONE step, print PASS / FAIL (a check that was NOT run is written NOT RUN, never PASS), then STOP and wait for the user's OK. If a decision is needed ask ONE small question. | status table |
| CD8 | **FILES.** Update existing md (this file + road twin + HANDOFF_ROAD_DESIGN.md pointer only), no new md. Give ONE zip of ONLY THE CHANGED FILES with a versioned name (e.g. `EVCity_CITY_C0_v1.0.zip`). Say what was NOT run (tsc, npm run build, game look). | zip content list |
| CD9 | **BANGLISH REPLY, SHORT.** The user writes Banglish; the reply is short, simple Banglish. The md files stay English. | - |

## 2. THE SKETCH TODAY (first trace, UNCALIBRATED)

Tool: `tools/city-zone-trace.py` (`S=1.67 OX=0 OZ=0 python3 tools/city-zone-trace.py`) reads `docs/city_red_zones_user_sketch.png` and writes `docs/city_zones_trace.json` (polygons, world metres) and `docs/city_zones_trace.png` (numbered picture). Scale 1.67 m per pixel is a FIRST GUESS from the camera height and two known points (J1, Central station); the numbers below are +-25 % in area and +-80 m in position until step C0 calibrates them.

| Zone | centre (x, z) m | area ha | where (north = -z) |
|------|-----------------|---------|--------------------|
| Z01 | (-723, 149) | 12.9 | far WEST, biggest zone, beside the west rail line, away from J1 |
| Z02 | (-357, 351) | 8.9 | SOUTH-WEST |
| Z03 | (-157, 544) | 4.2 | far SOUTH, left of the south arm |
| Z04 | (-78, 61) | 11.1 | CENTRE block between J1 and Central station |
| Z05 | (116, 497) | 4.8 | far SOUTH, right of the south arm |
| Z06 | (136, -363) | 10.4 | NORTH-EAST of J1, along the north arm |
| Z07 | (268, 239) | 5.5 | SOUTH-EAST of Central station |
| Z08 | (392, -332) | 8.8 | NORTH-EAST, strip between two arms |
| Z09 | (454, 31) | 4.1 | EAST, small |
| Z10 | (675, -270) | 7.7 | far EAST, outer side |

Total about 78 ha (0.78 km2) gross. This is SMALL for a whole city centre: a 500-bed hospital (about 6 ha) and a compact university (about 10 ha) alone are 20 % of it. The honest consequence is stated in step C2 before any plot is cut.

## 3. WHAT EXISTS TODAY (read, do not guess)

- `src/city/CityPlan.ts`: ZoneKind (residential, commercial, mixed, industrial, civic, education, health, utility, transport, recreation, green), ZONE_COLOR, BUILDING_TYPES (the full list of building ids: house-*, apartment-*, shop-row, supermarket, mall, office-mid, office-tower, bank, hotel, city-hall, court, police-station, fire-station, post-office, library, museum, community-center, primary-school, high-school, college, university-building, engineering-lab, hospital, clinic, diagnostic, mosque, temple, church, eidgah, graveyard, substation, water-tower, pumping-station, telecom-tower, bus-terminal, rail-station, parking-multistory, taxi-stand, helipad, park, playground, stadium, sports-complex, pond, garden ...). The site templates there are the OLD city plan (SITE0) and are replaced by this work inside the red zones.
- `src/buildings/Placements.ts`: placed buildings with their zone names (for example `hospital` at (300, -160) zone metro-core, `fire_station` at (-180, 80)). Read only. Step C0 lists which placed buildings lie inside each red zone.
- `src/city/WorldZones.ts` and `src/city/EngineeringZones.ts`: world zones (metro-core, ...) and fenced engineering areas (eng-biomed, ...). Keep-outs.
- Fixed objects near the red zones: J1 open star (C10 (-87,-277), yaw 37.5), arms J1-N / E / S / W, Central station (about (0, 300), raised to 34 m), rail lines (west-nw, west-sw, north-1, east-1 ...), the rivers, EVLAB_PLOT (x -520..-40, z -470..-30, campus centre (-280,-250)). Source of truth for roads and rail: `HANDOFF_ROAD_DESIGN.md` sections 12, 15, 16, 21.
- Roads ALREADY in the game (R6 / R4 / R2 / C / L lines, `src/roads/*/..NewLineData.ts`, `docs/fit_chain/centre_fixed.json`) run through these zones. They are NOT deleted by this work; the road twin lists them and the user decides keep / move.

## 4. LAND PROGRAMME: SIZES (ASSUMED planning ranges, step C1 prints the table, the user OKs or changes it)

Plot = land the building owns (building + yard + parking + own green). Roads are NOT inside the plot area.

| Programme (BUILDING_TYPES id) | min plot ha | target ha | placement rule |
|---|---|---|---|
| hospital (general, about 500 beds) + ambulance yard + helipad + parking | 5.0 | 6.5-8.0 | OUTER edge of the city, on the zone side that faces open land / outer road; two separate gates (main + emergency); 50 m planted buffer from houses and schools; helipad clear cone; NOT beside J1; NOT beside the rail (noise / vibration, assumed >= 100 m from the track) |
| university (campus: university-building, engineering-lab, dormitory, library, sports, green) | 9.0 | 10-12 (biggest plot of the city) | SIDE zone, one compact campus plot with its own internal ring road, 2 gates, quiet side (>= 60 m from an 8-lane road), bus stop at the gate, reserve land beside it |
| college | 2.0 | 2.5-3.5 | education cluster next to the university or a neighbourhood centre |
| high-school | 1.0 | 1.2-1.6 | not on an arterial; <= 1.5 km from homes; playground inside |
| primary-school | 0.4 | 0.5-0.8 | inside a neighbourhood, 400-800 m walk from homes, NO 4-lane road to cross |
| police-station (HQ) | 0.6 | 0.8-1.0 | civic core, on a 4-lane road with a free exit |
| police-station (local) | 0.3 | 0.3-0.5 | spread so every zone is inside the response radius (ASSUMED 2 km) |
| fire-station | 0.3 | 0.4-0.5 | on an arterial, direct exit, response radius ASSUMED 2 km (about 4 min) |
| city-hall + court | 1.5 | 2.0-3.0 | civic core, near the 4-lane network |
| post-office, community-center, library, museum | 0.1-0.3 each | 0.2-0.8 each | neighbourhood centres / civic core |
| office-tower | 0.4 | 0.5-1.0 | near J1 / the central block / Central station (transit access) |
| office-mid, bank, hotel | 0.25 | 0.3-0.6 | central block, along arterials (access >= 200 m apart, 400 m in the centre) |
| mall / supermarket | 1.5 / 0.6 | 3.0-5.0 / 0.8-1.2 | on an arterial with a service road; NOT inside a quiet neighbourhood |
| clinic, diagnostic, pharmacy | 0.15 | 0.2-0.4 | every neighbourhood centre |
| mosque / temple / church | 0.2 | 0.3-0.6 | every neighbourhood, <= 500 m from homes; eidgah / graveyard only on outer land if the user wants them |
| bus-terminal | 1.0 | 1.5-2.0 | next to Central station, own access, not on a local street |
| parking-multistory, taxi-stand | 0.2 | 0.3-0.6 | central block and station |
| substation, water-tower, pumping-station, telecom-tower | 0.05-0.2 | 0.1-0.4 | zone edge, fenced, 3-5 m planted screen |
| park / playground / garden / pond | 0.3 | 0.5-2.0 | 10-15 % of the city; every plot <= 400 m from green |
| residential block / apartment / row-house (mixed) | block 0.6 | block 0.8-1.5 | between the centre and the outer zones, local grid |
| stadium / sports-complex | 3.0 | 4.0-6.0 | OUTER zone only, big plot, two roads |

Land-use shares (ASSUMED, of NET land after roads) for a compact centre: institution (hospital, university, schools, civic) 30-35 %, commercial and offices 25-30 %, mixed residential 15-20 %, green and recreation 10-15 %, utility and transport 5-8 %, reserve 10-15 %. Roads take 25-30 % of the GROSS zone area (arterials, collectors, locals, footpaths); this is the figure the road twin has to meet.

## 5. PLANNING RULES (why a plot is where it is)

- Hierarchy gives land use (road handoff 3.14): arterials = commercial / offices, collectors = neighbourhood spines (schools, clinics, mosques, shops), local streets = homes.
- Setbacks: arterial building line 6-10 m, collector 4-6 m, local 3-5 m; 30-50 m planted buffer from M8 / M6.
- Noise and safety: hospital, university, schools keep away from arterials, the rail line and the 8-lane arms (distances in table 4); homes keep 30-50 m from M8.
- Walking distance: school 400-800 m, mosque 500 m, green 400 m, bus stop 400 m.
- Service radius: police and fire 2 km (ASSUMED), clinic per neighbourhood.
- Rail clearance: plots keep >= 30 m from the railway axis (road handoff ROADFIX R3: 30 m); J1 keeps its footprint (plaza radius 300 m open star, see 15.8). Water: >= 30 m from a river / lake bank (ASSUMED), no plot on wet ground.
- Ground: a plot is only on ground where the pad can be made with cut / fill <= 3 m (hill parts stay green or reserve). The residential flattening of `HANDOFF_ROAD_DESIGN.md` 22 is a TERRAIN work package; this work only reads the ground.
- Phasing: the plot table marks `phase 1` (built first: hospital, police, fire, school, offices near J1) and `reserve` (kept free).

## 6. STEP PLAN (one step per session, STOP for the user's OK after each)

| Step | What | Output |
|---|---|---|
| C0 | **Calibrate and trace.** Calibrate the screenshot with two known points (J1, Central station, the arms) and the camera data; re-run `tools/city-zone-trace.py` with the right S / OX / OZ; print the 10 polygons in world metres, areas, and a picture over the game map (rail, rivers, arms, EVLab plot). List existing buildings, roads (R6 / R4 / R2 / C / L ids), zones and engineering areas inside each zone. | `docs/city_zones_trace.json`, `docs/city_zones_trace.png`, `docs/STEPCITYC0_OUTPUT.txt`, a script `scripts/city-zone-scan.ts` (reads the game data headless, like residential-flat-scan.ts) |
| C1 | **Ground and constraints per zone.** Natural / current ground: slope p50 / p90, cut / fill for a flat pad, wet cells, rail and river clearance, J1 and arm buffers, existing fixed roads. NET usable land per zone. Print table 4 in numbers for the user to OK or change. | `docs/STEPCITYC1_OUTPUT.txt`, `docs/city_zone_ground.json` |
| C2 | **Programme and land balance.** Sum the target areas of table 4 for the whole city and compare with the net land of C1. Say plainly if it fits, what is squeezed, and what the options are (smaller target, reserve, extend a zone). ONE question to the user. | `docs/STEPCITYC2_OUTPUT.txt` |
| C3 | **Zone to land use (the big decision).** Proposal for what each zone is, with the reason per zone (distance from J1, rail, access class, noise). Starting proposal (NOT decided, the user OKs): Z10 (far east, outer) = HEALTH (hospital + ambulance + helipad + buffer); Z01 (far west, biggest) = EDUCATION (university campus + college + reserve beside it); Z04 (centre block) = offices, bank, hotel, civic (city-hall, court, police HQ); Z06 and Z08 (north-east along the arms) = offices, mall, mixed; Z07 and Z09 = Central station side: bus terminal, hotel, market, parking; Z02, Z03, Z05 = neighbourhoods: homes, schools, clinics, mosque, local police / fire, green. Check each with sections 4 and 5 numbers. | `docs/STEPCITYC3_OUTPUT.txt`, `docs/city_landuse.json`, picture |
| C4 | **Road skeleton first** (road twin R1-R2), then **plots for ONE zone per session**: cut the land-use blocks into plots along the new roads, in table 4 sizes, with reserve. Start with the two special zones (Z10, then Z01), then Z04, then the rest. | `docs/city_plots_Znn.json`, picture |
| C5 | **Plot table and checks.** One table `docs/city_plots.json` (id, zone, programme id from BUILDING_TYPES, polygon, area, access road id, setbacks, phase / reserve). Checks: inside the red zone, no overlap, area >= minimum, access, rail / water / J1 clearance, reserve share, every programme of table 4 placed or listed as NOT PLACED with the reason. | `scripts/city-plot-check.ts`, `docs/STEPCITYC5_OUTPUT.txt` |
| C6 | **See it in the game (only after the user OK).** A debug layer like the key-3 road layer: plot outlines in ZONE_COLOR with id labels, free camera. No building, no terrain change. Pads / terrain for the plots come later with the user. | `src/city/CityPlotLayer.ts` (new), one Config switch (default OFF) |

## 7. WHAT THE USER MUST DECIDE (ask ONE question at a time, only when the step needs it)

1. Table 4 sizes (OK or change). 2. Land balance (C2): what to do if 78 ha is not enough. 3. Zone to land use (C3). 4. University and hospital positions after seeing the numbers. 5. Existing buildings inside the zones: replaced later (user rule), confirm per zone when a plot needs the space.

## 8. ORDER WITH THE ROAD TWIN (interleaved, never plots alone or roads alone)

C0 -> R0 (road twin: list the existing roads in the zones) -> C1 -> C2 -> C3 -> R1 (city arterial skeleton: connections to the existing network, no branch from J1) -> C4 for Z10 and Z01 -> R2 (collectors) -> C4 for the other zones -> R3 (local streets) -> C5 -> R4 ... (road twin section 6). Each session does ONE of these.

## 9. STATUS TABLE (update here)

| Step | Status | Note |
|---|---|---|
| Handoffs written | done 2026-11-18 | this file + `HANDOFF_CITY_ROAD_DESIGN.md`, `tools/city-zone-trace.py`, `docs/city_red_zones_user_sketch.png`, `docs/city_zones_trace.json` / `.png` (UNCALIBRATED) |
| LU-1 (marked-area land-use proposal, section 11) | done 2026-11-20 (numbers copied from the previous chat, scripts LOST, nothing recomputed except sums) | 1.4 ha over-fill flag, per-building areas missing |
| C0 | not started | next step (with LU-1 border, section 11) |
| C1 | not started | |
| C2 | not started | |
| C3 | not started | |
| C4 | not started | |
| C5 | not started | |
| C6 | not started | |

## 10. HOW TO START IN A NEW CHAT

Paste: "Read HANDOFF_CITY_DESIGN.md completely (rules first), then HANDOFF_CITY_ROAD_DESIGN.md, then the HARD RULES block at the top of HANDOFF_ROAD_DESIGN.md. Work as a city design expert. Do ONLY step C0 (calibrate the red zones, trace, list what is inside each zone). Say the plan first, no building is placed, PASS / FAIL list, then STOP. Reply in short Banglish. Changed files only in a versioned zip."

## 11. LAND-USE PROPOSAL v1 FOR THE USER'S MARKED AREA (user job 2026-11-20, picture `city_landuse_plan_1.png`)

USER WORDS (Banglish, keep): "only mark kora jaigai ki ki building office shop mall(asei) evlab asei, university, Madrasah, school etc ki ki hobe segula k kivabe sajano jai and sajanor jonno land kototuku lagbe and sei onujai road hobe. existing road to asei sei onujai r kothia kemon road lagbe sevabe plan daw. and cityroad design and city deisng handoff a update korte hobe." = inside the marked (blue) border only: list what goes where (office, shop, mall, EVLab (exists), university, madrasah, schools ...), how to arrange it, how much land each needs, and roads that follow it; the existing roads stay as they are and the new roads are planned to fit; both city handoffs must be updated.

STATUS: PROPOSAL, positions +-100 m (printed on the picture), planning norms are ASSUMED. The numbers below were copied from the output of the PREVIOUS chat (it hit its limit). Its scripts `final.py` and `lu_final.json` lived in `/tmp` and are LOST: nothing here was recomputed in this chat except the sums marked (sum). NOT RUN: any script, tsc, build, water check (the zip has no node_modules and the chat has no network). The relation of this marked border (about 320 ha, picture axes x -1150..1400, z -1700..1000 m, x east, z south) to the old red zones Z01-Z10 of section 2 is NOT settled; step C0 must overlay both and the user says which border wins.

District table (ha; gross = inside the marked border, wet = water cells, fixed = fixed objects (EVLab 12.4 in EVL, 2.8 in CORE), net = usable after roads and margins, explicit = named buildings, housing = homes, pop = people, primary / mosque / clinic = count, park = ha):

| District | Use (from the picture legend) | gross | wet | fixed | net | explicit | housing | pop | primary | mosque | clinic | park |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CORE | civic + business (Civic + Police HQ, Fire x3) | 37.5 | 0.0 | 2.8 | 22.5 | 21.4 | 1.1 | 267 | 0 | 0 | 0 | 0.1 |
| STN | station side (Bus terminal) | 21.2 | 1.0 | 0.0 | 13.1 | 11.7 | 1.3 | 321 | 0 | 0 | 0 | 0.1 |
| NEB | offices + mall (Mall NE) | 35.6 | 0.0 | 0.0 | 23.1 | 15.6 | 5.8 | 1448 | 1 | 1 | 1 | 0.5 |
| HLT | health, outer east (Hospital) | 36.1 | 0.9 | 0.0 | 22.8 | 14.7 | 6.3 | 1583 | 1 | 1 | 1 | 0.5 |
| EMX | homes + mixed | 11.5 | 0.6 | 0.0 | 7.1 | 2.2 | 4.5 | 1137 | 1 | 1 | 0 | 0.4 |
| EVL | EVLab (fixed) + reserve | 22.3 | 0.0 | 12.4 | 6.4 | 3.0 | 3.2 | 797 | 0 | 0 | 0 | 0.3 |
| WNR | homes | 17.0 | 0.0 | 0.0 | 11.0 | 3.4 | 5.9 | 1474 | 1 | 1 | 1 | 0.5 |
| EDU | university side (University, College, Madrasah) | 44.8 | 1.0 | 0.0 | 28.4 | 27.8 | 0.5 | 137 | 0 | 0 | 0 | 0.0 |
| RSW | homes | 20.2 | 0.4 | 0.0 | 12.8 | 3.8 | 7.2 | 1801 | 1 | 1 | 1 | 0.6 |
| RS | homes | 15.4 | 1.1 | 0.0 | 9.2 | 2.6 | 5.2 | 1312 | 1 | 1 | 1 | 0.4 |
| BAZ | south bazaar + mall (City Mall + bazaar) | 32.7 | 2.8 | 0.0 | 19.4 | 12.7 | 5.1 | 1272 | 1 | 1 | 1 | 0.4 |
| RIV | river green + stadium (Stadium) | 26.2 | 4.1 | 0.0 | 14.3 | 12.9 | 1.3 | 335 | 0 | 0 | 0 | 0.1 |
| TOTAL (sum) | | 320.5 | 11.9 | 15.2 | 190.1 | | 47.5 | 11,882 | 7 | 7 | 6 | |

Rules used by the previous chat's script (read back from its patch and output, so partly DERIVED): people = housing ha x DENS, DENS about 250 persons/ha (derived: 1448.1 / 5.8); a district gets neighbourhood primary schools / mosques only if its housing >= 4.0 ha (primary = ceil(pop / 5000), mosque = ceil(pop / 3500)), a clinic only if housing >= 5.0 ha (1 clinic); land per unit: primary school 0.6 ha, mosque 0.4 ha, clinic 0.25 ha, park / playground 8 % of housing ha; the education zone and park reserves were reduced in that run. Programme lines printed: housing / mixed apartments (net) 12 blocks 47.5 ha; primary school (neighbourhood) 7 x = 4.2 ha; primary school 4 x = 2.4 ha; student housing 1 x = 4.0 ha; neighbourhood park / playground 12 x = 3.8 ha; mosque 7 x = 2.9 ha and mosque (neighbourhood) 7 x = 2.8 ha (two lines, unclear whether the same 7 mosques: CHECK); clinic (neighbourhood) 6 x = 1.5 ha; jame mosque 1 x = 1.0 ha. TOTAL programme + housing 191.5 ha.

ROAD RULE FOR THIS BORDER (user, 2026-11-20): new streets inside the city are 2-lane only (see `HANDOFF_CITY_ROAD_DESIGN.md` section 12); plots must therefore get access from 2-lane C / R2 / L streets or from the existing roads.

OPEN FLAGS: (1) 191.5 ha programme is 1.4 ha MORE than the net land 190.1 ha (sum): either the printed total counts something the districts do not, or it is a real over-fill; recheck in C2. (2) The per-building areas behind 'explicit' (university, college, madrasah, hospital, mall, stadium, civic, bus terminal, bazaar, offices) are NOT in this chat: only district sums survived. They must be listed again with area per building (table 4 norms) before plots are cut. (3) Schools above primary (secondary school, high school, college count) are not in the printed lines except College / University / Madrasah named on the picture: ask the user once whether secondary schools are wanted.

NEXT STEP (proposal, user OKs): C0 + C2 together on this border: re-trace the 12 district polygons from the picture (axis ticks give the scale) into world metres, overlay the old Z01-Z10 and the game data, rebuild the explicit building list with areas, and fix the 1.4 ha mismatch. Roads follow in the road twin section 12.

## 12. CITY PLOTS BESIDE THE 17 CITY STREETS (STEP 3, user job 2026-11-20)

USER WORDS (Banglish, keep): "city center er road gular pase building sajate hobe. office university, madrasah mosque, park police station, hospital etc." then "kisu plot fakao rakhte hobe. ahono basa hoy nai only boundary diye ghera. only road er pase gate. boundary er vitore kisu gaspala hoye ase." then "jesob model new segula banate hobe na. existing jegula ase segula sothik jaigai bosaw" then "river er upore to probe na abar? ok koro" = line the 17 city streets (City_Road.shp, HANDOFF_CITY_ROAD_DESIGN.md section 13) with plots; some plots stay EMPTY (boundary wall + a gate only on the road side + some trees / bushes inside); NO new building model, only the existing models; no plot on water.

WHAT WAS DONE: `tools/city-plots-plan.py` (input `docs/city_plots_input.json` = `scripts/city-plots-dump.ts`, made with the plots switch OFF) puts 43 plots (47.6 ha: 36.1 building, 7.6 park, 4.0 empty reserve) beside the streets, front edge 14 m from the street centre line, >= 12 m from every street, no overlap with each other or any hand placed building. Output: `src/buildings/PlacementsPlots.ts` (generated: plots, 35 buildings with yaw so the front looks at the street), `docs/city_plots_proposal.json`, `docs/city_plots_step2.png`. Game: NEW `src/buildings/PlotYards.ts` (2.4 m wall in 3 m pieces on the ground, gate gap 8 m on the road side only (hospital: 2 gates), pillars + lintel, trees and bushes, instanced); `src/buildings/Placements.ts` BUILDING_PLACEMENTS = hand placed + plot buildings, the OLD hospital (220, -250) is dropped; `src/buildings/PlacementsResidential.ts` DRAWN_FILL_PLACEMENTS drops the houses whose centre is inside a plot (80 houses); `src/core/Config.ts` ONE switch `Config.city.plots.enabled` (true; false = nothing of this); `src/core/Engine.ts` creates / disposes PlotYards; `src/buildings/index.ts` export.
EXISTING MODELS ONLY: madrasah = the mosque model (plot 1.56 ha, mostly empty yard); university campus = university-building + engineering-lab + dormitory; park = no building, trees only; hospital = the existing model moved from beside SH-25 (35 m, inside the 12 m street rule) to a 5 ha plot on free land beside SH-25 (centre (369, -228)); police HQ and fire station stay where they are, one local police plot (police_station model) south. No bus terminal / city hall model exists: not placed.
CHECKS (headless): water 0 wet of 43 plots (13 x 13 points each, same test as residential-place.ts); plot-plot overlap 0; plot vs hand building overlap 0; every building footprint inside its plot (>= 2 m from the wall); PlotYards run with a three.js stub: 5232 wall pieces, 132 gate parts (44 gates), 2053 trees, 2796 bushes, 0 plants outside a plot or on a building, 0 wall pieces in a gate gap, 0 NaN. Ground range under big plots is large (hospital 9 m, university 11 m, mall 9-10 m, big parks 7-9 m): buildings get their plinth from PlacedBuildings, the yard ground stays natural.
NOT RUN: `npm run build` (no node_modules; tsc 7.0.2 over the new / changed files found only the missing three / rapier modules), the REAL three.js render, game look, rail clearance of the plots, wall collider, terrain pad / flat yard, the 2nd (side) emergency gate of the hospital on a different street, cars entering the gates.

