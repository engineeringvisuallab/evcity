# HANDOFF: JUNCTION RT-E (ring x J1-E arm, 8-lane x 8-lane) RAMP INTERCHANGE

Written 2026-11-22. Language: English. This is the ONLY md file for this junction. One micro-step per chat session, because the chat limit was hit before. Update the status table in section 9 after every step. Reply to the user in Banglish.

## 0. What the user decided (data, do not change without asking)
1. The junction is at X 2335, Z 1438 (user's reading). It is the ring x J1-E join: ring station 16813, (2354, 1437), 8-lane x 8-lane, ground level now.
2. USER 2026-11-22: 'Ramp shoho interchange' = a grade-separated interchange WITH ramps. This replaces the ground-level CFI proposed for ring E in HANDOFF_RING_T_JUNCTIONS.md (section 3.1) for THIS junction only. Ring N, W, S are not touched by this handoff.
3. USER (earlier chat, pasted): the ramp curves (loops) must go round the OUTSIDE of the ring, not through the ring carriageway. If the outside does not work, the ramp may use the ring MEDIAN, and then the road / median may be widened. Extra land is allowed. 'You are my engineer, fix it.'
4. USER 2026-11-22: split the work into small steps (the chat limit ends too early), take the steps from the road design handoff, and give this handoff first.
5. Standing rules: left-hand traffic, reuse what exists, the ring (road 0) and the J1-E arm profile and structures are FIXED (change them only with the user's word), PASS / FAIL printed by every check, never write PASS for a check that was not run, say plainly what was NOT run.

## 1. Words used (from HANDOFF_RING_T_JUNCTIONS.md section 3)
Legs: stem S = the J1-E arm, ring side R- (lower station), ring side R+ (higher station). Ring direction A = the direction whose keep-left lane is on the stem side; direction B = the other one. Only A conflicts with the turning flows (right turns cross it). Which of R- / R+ is A is computed in RE-0.
Movements of a 3-leg T (left-hand traffic):
- through A, through B (4 lanes each),
- S to A: left turn, slip, no conflict,
- A to S: left turn, slip, no conflict,
- S to B: RIGHT turn, crosses A,
- B to S: RIGHT turn, crosses A.
The pasted old chat called two ramps M3 (B to stem) and M4 (stem to B) and used 'ring A / B carriageway', 'stem', 'S3 bridge'. I READ them as the two right-turn movements. The geometry file of that chat is NOT in the zip, so M3 / M4 are designed again from the real data; do not copy numbers from the pasted text (the 6 m to 13 m median, the 7 m / 14 m bridge heights are ASSUMED, not verified).

## 2. Site facts already known (from the zip, re-measure in RE-0)
- Ring: road 0 'M8', closed, 19293 m, 4 + 4 lanes, median 6 m, half width 22.1 m, V100, lane 3.65 m (SECTION_M8 = build('M8', 4, 6) in src/roads/standards/SectionTable.ts). The arm meets the ring at exactly 90 deg.
- Ring level near the T (m) at s-1000 / -500 / -150 / 0 / +150 / +500 / +1000: 61.6 / 41.6 / 30.2 / 28.4 / 29.6 / 33.3 / 34.5. CORRECTION 2026-11-22 (RE-0): R- is the EAST-NORTH-EAST side and the ring CLIMBS toward it at 4 % (61.6 m at s-1000) into the hill; R+ is the WEST-SOUTH-WEST side and is flat. An earlier line of this file said 'falls from the west': wrong.
- Ring structure near the T: a bridge at -1200 .. -780 m. Arm structure: its viaduct starts only 160 m from the T (up to 700 m). So the stem has little room.
- Free straight ring: 780 m on the minus side, 1000 m or more on the plus side.
- Nothing is built at this junction. The AI uses the temporary tLink (RoadGraph.tLinks, Route.tLink).
- Do NOT confuse with 'Ring E st 15309' in section 15.8 of HANDOFF_ROAD_DESIGN.md: that is an OLD number (a 35 m high fill inside viaduct S6). The real station is 16813.
- Neighbours on the ring: T18 at st 18733 (1920 m away), RT-N at 12094. No tap is within 1900 m, so spacing is not the problem.

## 3. What exists and is reused
- src/interchange/: Builder.ts (buildInterchange), Patterns.ts (registerPattern, roles slip / loop / diamondOff / diamondOn), PatternCD.ts (collector-distributor), Levels.ts (makeLevels, yOf, rampProfile), Standards.ts (CRITERIA: rampMaxGrade 5 %, weaveMin 150, weaveDesirable 300, aDecel 2.5, aAccel 1.2; decelLength, accelLength, minRadius, stoppingSight), Validate.ts (validate), Geometry2D.ts, Structures.ts, RoadAdapter.ts (rampToRoadSpec), Analysis.ts.
- src/roads/standards/ (Criteria, Checks, SectionTable). J1 pattern for terrain and mesh: src/roads/junction/OpenJ1Geometry.ts, OpenJ1Mesh.ts, GroundJ1Terrain.ts, GroundJ1Layer.ts. Slip example: src/roads/r6/R6SlipData.ts. Trumpet attempt: tools/b7-3a-t22.py, docs/b7_3a_t22*, section 21.60 of HANDOFF_ROAD_DESIGN.md (m1 m2 m3 PASS, m4 not solved: read why before copying).
- Rules 21.47 to 21.53 and section 24 of HANDOFF_ROAD_DESIGN.md (clearance 5.5 m + deck, about 7.8 m total; trumpet needs about 2 x (taper 91 + decel 100) = 380 m; weave 150 m minimum, 300 m desirable).
- Ring and arm carve: RoadNetwork.ts (layoutJ1Arms, addJ1Arms, ring apply() carve).
- Check scripts to copy: scripts/j1-g2-check.ts, j1-g3-check.ts, j1-g4-check.ts, interchange-test.ts.

## 4. Hard rules for this junction (every step prints PASS / FAIL)
H1 Ramps: V 40 to 60 km/h, minimum radius from minRadius(V), grade 5 % or less (rampMaxGrade), cross fall, K from Standards.
H2 Grade separation: clearance 5.5 m + deck depth over every carriageway crossed; the profile of the ring and the arm is not changed.
H3 R1: no road crosses another except in a ramp bridge that is designed (a ramp passing over / under a carriageway is the interchange itself; list every such crossing).
H4 Outside first: a ramp curve goes round the outside of the ring. The median route is used only when the outside fails a number (land, rail, river, building, hill, bridge). Widening the median or the road is allowed, but every width change is listed with its length and taper.
H5 Smoothness: straight - spiral - arc - spiral - straight, no kink, G1 at every join with the ring, arm and ramp.
H6 Speed change lanes from decelLength / accelLength; gore and nose per Standards; weave length at least weaveMin.
H7 Ground: slope, cut / fill (limits like the ring: cut 12 m, fill 7 m at the pavement edge unless a wall or structure), water, rail, buildings, trees. Rail and river unchanged.
H8 Config switch OFF until the user has looked in the game.

## 5. Micro-steps (ONE per session, each ends with STOP and the user's OK)
Each step: a script in scripts/, its output in docs/, PASS / FAIL list, a picture where the step says so, this file updated, a zip of the changed files, and a list of what was run (tsc, npm run build, the script) and what was NOT run.
- RE-0 SITE CHECK (headless, no src change): scripts/rte-site-check.ts to docs/RTE_SITE.txt. Re-measure ring and arm profile, A / B side, ground within 600 m, cut / fill, water, rail, buildings and trees, structures, free land on the outside of each carriageway, ring median width. Picture of the site. Output: which side has room for the loop.
- RE-1 TYPE OPTIONS (numbers + picture, no src): 2 or 3 options (for example trumpet with the loop outside, parclo, half diamond with two slips + one loop) with land, ramp length, bridge height, grades, cost proxy (deck m2, fill m3), and the outside route versus the median route. Recommend one. The user picks. Docs/RTE_TYPES.txt + png.
- RE-2 VERTICAL PLAN (numbers): which ramp passes over / under which carriageway, ramp profiles (Levels.ts), clearance, grades, K, tie-in levels with the ring and the arm. docs/RTE_LEVELS.json.
- RE-3 LEFT SLIPS (geometry data): S to A and A to S, centrelines, terminals, taper / decel / accel, Validate. src/roads/junction/RteGeometry.ts (part 1).
- RE-4 RIGHT-TURN RAMP M3 (B to S): centreline, spiral / arc, terminals, Validate.
- RE-5 RIGHT-TURN RAMP M4 (S to B): same; then the cross-check of all four ramps (R1, weave, gore spacing).
- RE-6 WIDTH CHANGE (only if RE-1 chose the median route, or a width is needed): median / road widening, tapers, join with the ring cross-section.
- RE-7 TERRAIN: pad / embankment / cut, retaining wall, join with the ring and arm (like GroundJ1Terrain), drainage. Check script.
- RE-8 STRUCTURES: ramp bridges (deck, girders, piers, abutments) as data for the game; the existing ring structure registry (ringStructures) is the pattern.
- RE-9 MESH + MARKING: ramp surfaces, kerbs, barriers, gore, arrows, signs, lamps; Config switch default OFF.
- RE-10 TRAFFIC GRAPH + AI: lanes joined, every movement reachable, remove the tLink stand-in for this arm, check script.
- RE-11 GAME CHECK + FINAL: switch ON in the headless check, tsc, npm run build, all earlier PASS checks stay PASS (j1-arms-game-check, j1-game-check, ring-facade, ring-cut, ring-structures, rail-city-profile-check), the user looks in the game, drive test of each movement.
Do not start the next step before the user says OK.

## 6. Known risks
- The arm viaduct is 160 m from the T: a ramp that needs the stem for storage or a long taper may not fit; check in RE-0 / RE-1.
- The ring climbs 4 % toward R- (east-north-east, into the hill, cut up to 24 m on the far side): a ramp on the R- side meets a rising ring and a hill; the R+ side is flat but the elevated rail crosses the ring at +481 m (RE-0).
- The ring is one closed road: a pad changes its carve and cell grid (see HANDOFF_RING_T_JUNCTIONS.md section 6).
- The ring median has U-turn openings (UTurns.ts, MedianPlan.ts): a median route or a widening must tell them.
- Old numbers in the docs (RING_RADIAL_JOINS still has old N and W stations): use the E station 16813 only.

## 7. What was NOT done (honest)
Nothing is designed or built yet. M3 / M4 are my reading of a pasted chat. RE-0 (section 10) re-measured the site with natural ground (not the final carved ground); trees, grass, drainage and the look in the game were NOT checked.

## 8. Starter prompt for a NEW chat
"Read HANDOFF_JUNCTION_RTE.md completely, then sections 1, 3 and 24 of HANDOFF_ROAD_DESIGN.md and HANDOFF_RING_T_JUNCTIONS.md sections 1 to 4. Run only the next step that is not DONE in the status table (section 9). Numbers + picture + PASS / FAIL, update the status table, zip of the changed files, say what was NOT run, STOP and wait for my OK. Reply in Banglish."

## 9. Status table (update here)
| Step | Name | Status | User OK | Notes |
|------|------|--------|---------|-------|
| RE-plan | This handoff | DONE 2026-11-22 (no code) | waiting | user chose 'Ramp shoho interchange' |
| RE-0 | Site check | DONE 2026-11-22 (headless, 2 FAIL = site constraints, see section 10; tsc run) | waiting | scripts/rte-site-check.ts, tools/rte-site-plot.py, docs/RTE_SITE.txt, rte_site.json, rte_site.png |
| RE-1 | Type options | not started | | next |
| RE-2 | Vertical plan | not started | | |
| RE-3 | Left slips | not started | | |
| RE-4 | Ramp M3 | not started | | |
| RE-5 | Ramp M4 + cross-check | not started | | |
| RE-6 | Width change | not started | | only if needed |
| RE-7 | Terrain | not started | | |
| RE-8 | Structures | not started | | |
| RE-9 | Mesh + marking | not started | | |
| RE-10 | Traffic graph + AI | not started | | |
| RE-11 | Game check + final | not started | | |

## 10. RE-0 RESULT (2026-11-22; scripts/rte-site-check.ts, natural ground, headless; the picture is docs/rte_site.png)
Frame: R- = east-north-east of the T (ring station falls), R+ = west-south-west (station rises). The stem (J1-E arm) comes from the north-north-west and is on the right of the increasing direction, so direction A (keep-left lane on the stem side) = DECREASING station (R+ to R-), direction B = increasing station (R- to R+), running on the FAR (south-south-east) carriageway.
Facts (RUN): junction (2354.5, 1437.0), ring station 16813, ring and arm 90.0 deg, ring nearly straight (R about 2840 m within 400 m), ring level at the T 28.41 m = arm end level. Ring grade within +-300 m at most 2.87 % (PASS, limit 3). Ring structure on R-: s-1496 .. -776. Arm structures from the T: 160-271 m and 391-694 m. Ring median 6 m (half 3), 4 lanes of 3.65 m per direction, half width 22.1 m. No building within 400 m. Roads within 700 m: R2-45 (535 m), R2-55 (612 m), R2-46 (624 m). Rail east-2 (elevated, about 33.7 m at its nearest point) crosses the ring at +481 m on R+ and passes 330 m from the T.
Four quadrants, box 80..600 m along the ring, 25..200 m from the ring centreline (ground above ring = cut, below = fill):
| Quadrant | cut max | fill max | notes |
|---|---|---|---|
| R- / FAR (hill side) | 24.1 m | 8.4 m | slope up to 49 %, no water, no building, rail 422 m: FAIL for cut (limit 12) |
| R- / STEM | 3.2 m | 17.3 m | ring is high on the ground here (fill / structure), rail 243 m |
| R+ / FAR | 8.5 m | 6.8 m | cut and fill within the limits (PASS), but the rail is only 15 m from the sampled points: FAIL for rail clearance |
| R+ / STEM | 9.6 m | 12.2 m | rail 10 m from the sampled points |
MEANING for RE-1 (my reading, not decided): the best land for an OUTSIDE loop is the R+ / FAR quarter (flat, no water, no building), but the elevated rail crosses the ring at +481 m, so the ramp zone there is about 400 m long at most and must keep a clearance from the rail piers (the clearance value is not fixed yet, ask). Direction B (far carriageway) diverges on the R- side, upstream, where the far side is the hill (cut up to 24 m): an outside exit for M3 (B to stem) has a hard site, a cut or a retaining wall is needed, or the median route. The arm has only 160 m before its first structure. The 2 FAIL lines of the script are these two site constraints (R- / FAR cut, R+ / FAR rail), they are findings, not a broken script.
NOT run: trees, grass, drainage, ring carve with the final ground, the game look, rail pier positions and the exact rail clearance.
