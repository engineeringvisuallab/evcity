# HANDOFF: the four RING T JUNCTIONS (8-lane ring x 8-lane arm), GROUND LEVEL, four DIFFERENT designs, fully engineered

Written 2026-11-15. This file REPLACES the plan for the ring junctions in HANDOFF_ROAD_DESIGN.md 15.8.1 item 2, 15.8.5, 15.8.6 and Step 9 (multi-level directional T / turbine / trumpet / hybrid). Those multi-level designs are NOT built any more. Everything else in HANDOFF_ROAD_DESIGN.md (standards, M8 section, smoothness rules, J1 rows, status table) still holds. Read sections 1, 3.1-3.9, 3.12 and 15.8.8-15.8.12 of that file together with this one.

## 0. What the user decided (data, do not change without asking)
1. Four T junctions where the four 8-lane arms (J1-N, J1-E, J1-S, J1-W) meet the 8-lane ring (road 0, "M8").
2. ALL FOUR AT GROUND LEVEL. No flyover, no underpass, no ramp on a structure. (Pedestrians: refuge islands or grade-separated footways only, like J1.)
3. The four must be DIFFERENT designs (and none of them is the J1 open star). "Different" means a different traffic-control principle, not a different colour: see section 3.
4. FULLY ENGINEERED: every design has a calculation sheet (demand, capacity, signal timing, lane layout, pocket / storage / taper / merge lengths, sight distance, radii, superelevation, grades, drainage, pedestrian crossing) with formulas shown and PASS / FAIL, like J1-b and J1-g1. Numbers come from `src/roads/standards/*` (Criteria, Checks, SectionTable). Nothing is guessed: a free choice is marked ASSUMED and listed.
5. Left-hand traffic (Bangladesh). Left turn = near-side (slip / free), RIGHT turn crosses the opposing flow.
6. Standing rules: reply in Banglish, one step per chat, only changed files in the zip + a `CHANGES_*_BN.md`, REUSE what exists (see section 2), headless check script per step.

## 1. Site facts (measured 2026-11-15 from the game code, headless; the steps re-measure and keep the numbers in `docs/`)
Ring: road 0 "M8", closed, length 19293 m, half width 22.1 m, 4 lanes per direction + median, design speed 100 km/h. The arms meet the ring at exactly 90.0 deg (T on the ring straight). The AI "T link" (`RoadGraph.tLinks`, `Route.tLink`) is a TEMPORARY stand-in that only merges cars; it is replaced by the real design movements in each junction's AI step.

| Arm | Ring station of the T (m) | Ring level at s-1000 / -500 / -150 / 0 / +150 / +500 / +1000 (m) | Ring structure near the T (s offset from the T) | Arm structure near the T |
|-----|------|------|------|------|
| J1-N | 12094 | 33.3 / 36.8 / 27.9 / 25.2 / 25.3 / 31.9 / 33.1 | bridge at +200 .. +260 | 440 .. 540 m from the T |
| J1-E | 16813 | 61.6 / 41.6 / 30.2 / 28.4 / 29.6 / 33.3 / 34.5 | bridge at -1200 .. -780 | 160 .. 700 m from the T |
| J1-S | 1208 | 22.1 / 20.3 / 19.7 / 19.7 / 20.0 / 28.2 / 31.5 | bridge at -420 .. -320 | 580 .. 800 m from the T |
| J1-W | 4263 | 32.1 / 16.5 / 20.9 / 22.9 / 22.3 / 20.8 / 21.8 | none within 1200 m | **16 .. 223 m from the T (viaduct nearly at the T)** |

Ring grade at the T is small everywhere (N about 0 .. 1.8 %, E 0.8 .. 1.2 %, S 0 .. 1.7 %, W 1.3 %). The old design numbers (N 11549, S 1205, W 5104, E 15309) are OLD: use the table. Rail: the railway cannot change (HANDOFF_ROAD_DESIGN.md 16, RAIL-B); each site step re-checks the rail plan and the river.

Free straight ring length each side of the T (from the table): N about 200 m on the + side (bridge), 1000+ m on the - side; E 780 m on the - side, 1000+ m on the + side; S 320 m on the - side, 1000+ m on the + side; W 1000+ m both sides. The W arm has almost no stem length (viaduct 16 m from the ring): its design must not need stem storage.

## 2. What already exists (REUSE, do not rewrite)
- `src/roads/standards/Criteria.ts` (DESIGN, CRITERIA, minRadius, speedChangeLength, stoppingSight), `Checks.ts` (laneDropTaper, ...), `SectionTable.ts` (SECTION_M8, SECTION_M6 ...).
- J1 pattern, all pure math + mesh + game layer: `src/roads/junction/OpenJ1Geometry.ts` (arm frame (s, o), `PathB`, `buildMovements`, `pavedOutline`), `OpenJ1Mesh.ts` (surface, kerb, islands, markings), `GroundJ1Terrain.ts` (pad plane + lane zone + skirt, `sample`, `levelAt`, `cover`), `GroundJ1Layer.ts`, `J1ArmProfiles.ts`. Copy the STRUCTURE of these files for each new junction (one geometry, one mesh, one terrain per junction), reuse their helpers.
- `src/roads/RoadNetwork.ts`: `layoutJ1Arms`, `addJ1Arms` (arms are added after the railway), the ring `apply()` carve (`j1Cells`, `J1Terrain.sample`) is the place where a ring junction pad carves the terrain.
- AI and signals: `src/traffic/J1Link.ts` (movements -> world paths), `Route.ts` (`enterJ1`, `pushJ1`, `tLink`, `curveOnto`), `TrafficSignals.ts` (`makeJ1`, `onLeg` lateral bands, `brakeLimit`, `redLightCrossing`), `TrafficLightLayer.ts` (poles from `SignalArm`), `RoadGraph.tLinks`. Generalise `J1Link` to a `JunctionLink` (one class, a list of movements per junction) instead of copying it four times.
- U-turn openings of divided roads: `src/roads/UTurns.ts`, `MedianPlan.ts`, `RoadGraph.uturns` (used by the median U-turn design).
- Interchange analysis tools that still apply to ground junctions: `src/interchange/Geometry2D.ts`, `Validate.ts`, `demand/*`.
- Check scripts to copy: `scripts/j1-g2-check.ts`, `j1-g3-check.ts`, `j1-g4-check.ts`, `j1-arms-game-check.ts`, `j1-ai-check.ts`.

## 3. The movements of a T (left-hand traffic) and why the four designs are different
Legs: ring side R- (lower station), ring side R+ (higher station), stem S (the arm). Look at the T from the stem. Ring direction A = the direction whose KEEP-LEFT lane is on the stem side, ring direction B = the other one.
- Ring through A and B (4 lanes each, the heavy flow).
- S -> left onto ring: a slip, joins the lane of direction A (near side). No conflict.
- S -> right onto ring: crosses ring through A, joins direction B. **Conflict with A.**
- Ring A -> left into the stem: a slip, no conflict.
- Ring B -> right into the stem: crosses ring through A (it turns across the near-side lanes). **Conflict with A.**
KEY FACT: only ring direction A conflicts. Ring direction B passes the T with no crossing at all (only a merge and a diverge). Every design below uses this fact in a different way. Which of R- / R+ is A depends on the side of the ring the arm sits on: the geometry step computes it per junction.

Catalogue of ground designs for a 3-leg T on an 8-lane divided road (the "design family" is the principle):
| Code | Design | Principle | Strength | Weak point / where it fails |
|------|--------|-----------|----------|-----------------------------|
| CGT | Continuous-green T (with median refuge) | direction B runs free all the time (merge lane + diverge pocket only); one signal serves the stem and ring A; stem right turns cross A in a protected phase | high ring capacity, only 2 phases, freight keeps moving | needs a merge lane after the stem right turn (accel + taper about 190 m) on the B downstream side |
| CFI | Continuous-flow (displaced right turn) T | the ring B -> stem right turn is moved to the other side of the opposing flow upstream (crossover signalised in step with the main signal), so the main intersection has 2 phases | highest capacity at ground level | needs about 300 m of straight ring upstream on that side and a stem approach of at least the queue length |
| RND | Large signalised roundabout, 3 legs, free left slips | circulation instead of crossing; the stem and both ring sides enter through signalised entries | compact (about 100 m radius), needs almost no ring length, easy for pedestrians | capacity: 4 ring through lanes do not fit one circulatory carriageway; passes only if the demand step says so, otherwise fall back to the seagull (SGL) |
| MUT | Median U-turn T (Michigan type) | no direct stem right turn and no direct ring B -> stem right turn: both are made as a left turn + a U-turn in a median opening 350 .. 450 m away; the main signal has 2 phases and the stem needs almost no storage | stem can be very short, simple signal | longer trip for the right-turners, U-turn openings in the ring median (reuse UTurns / MedianPlan) |
| SGL | Signalised seagull (fallback only) | stem right turn waits in a median refuge island and merges into B; signal protects the crossing of A | small footprint | refuge length and merge length |
| OPT | Open signalised T with slips and pockets (J1 family) | NOT USED: it would repeat the J1 principle | | |

### 3.1 PROPOSED assignment (PROPOSAL, the user says OK or changes it in step T0; the capacity check of each step can reject it, then the next design of the catalogue is taken and the user is told)
| Junction | Design | Why, from the site facts |
|----------|--------|--------------------------|
| Ring N (st 12094) | **CGT** | highest freight flow (north hub): keep B free-flowing; flat; the free ring side (the - side, 1000+ m) takes the merge lane; the + side has a bridge at +200 m, so the A side with the stem pocket must be the one with room (decide the orientation in T-N a) |
| Ring E (st 16813) | **CFI** | 780 m clear on the - side and 1000+ m on the + side, ring grade about 1 %; the arm has 160 m before its viaduct, so the stem queue storage must fit 160 m (checked) |
| Ring S (st 1208) | **RND** (fallback SGL) | only 320 m clear on the - side (river bridge), flat ground ring: a compact solution suits; demand check decides |
| Ring W (st 4263) | **MUT** | the arm is on a viaduct 16 m from the ring: no stem storage, so no stem right turn; the ring has 1000+ m clear both sides for the two U-turn openings |
Each of the four therefore has a different control principle, and none is the J1 open star.

## 4. Design rules every junction must meet (checked by code, PASS / FAIL in the sheet)
1. Geometry from the standards only: lane width 3.65 m (`DESIGN.laneWidth`), M8 half width 22.1 m, approach speed step 100 -> 60 km/h (`speedChangeLength`, a = `CRITERIA.aDecel`), taper `laneDropTaper(V)`, slip arc radius for 40 km/h, minimum radius `minRadius(V)`, stopping sight `stoppingSight(V)` at every stop line, conflict point and merge.
2. Crossing angle of the stem with the ring is 90 deg (given, 70..110 allowed).
3. Grades: ring and arm through the junction <= 3 %, junction pad cross fall 1.5 .. 3 % for drainage, no flat spot (< 0.3 %) over more than 40 m, vertical curves keep K (3.3 / 3.12). The pad plane is fitted to the ring and arm profiles like J1-g3 (same level AND grade at the join, difference dies out in a cubic).
4. Capacity by Webster / HCM style formulas with the demand of `src/interchange/demand` (ring and arm flows, share of right / left turns, heavy vehicles, ASSUMED values listed); signal cycle, phase lengths, lost time, degree of saturation <= 0.9 for the design hour, queue storage per lane <= the storage length of the layout.
5. Smoothness (3.12): no kink, curvature changes only through spirals, no S-bend without a straight, joins with the ring and arm keep G1 continuity.
6. Pedestrians: refuge islands >= 2.4 m wide or grade-separated footway (like J1); islands have kerb, nose, and the crossing is in line with the stop line.
7. Spacing: the nearest structure of the ring or the arm keeps its clearance from the pad and the tapers (table in section 1; if the junction does not fit, say so and propose another design, do not move the ring or the arm without the user).
8. Drainage and terrain: the pad carves the terrain like J1 (plane + lane zone + skirt of 30 m, smoothstep), no water, no building or tree left on the carriageway, the railway and rail structures unchanged.
9. Signs and markings: stop lines, lane lines, arrows, zebra, guide lines, island paint, signal poles (TrafficLightLayer) built from the same data as the geometry.

## 5. Micro-steps (ONE per session, STOP after each, the user says OK; the J1-b / g1..g4 pattern)
Run per junction in the order N (CGT), E (CFI), W (MUT), S (RND). Tx = N, E, W, S.
- **T0** (once): site re-check of the four T points (the table of section 1 as a script `scripts/ring-t-site-check.ts`, with rail, river, buildings, zone plan), user confirms the design assignment (3.1) and orientation of A / B per junction. Output `docs/RINGT_SITE.txt`.
- **Tx-a** calculation sheet of the chosen design: demand, capacity, phases, lane layout, lengths, radii, sight, grades. Headless, formulas shown, PASS / FAIL, `docs/RINGT_x_a.json` + `.txt`.
- **Tx-b** geometry data (pure math, arm frame (s, o) along the ring, no three.js): edges, lane centre lines, islands, movements (list like `buildMovements`: id, from, to, kind, phase, lanes, radius, speed, pts, joints), check script (area, widths, conflicts, tapers, sight).
- **Tx-c** terrain pad + join with the ring and the arm (level, cut / fill, skirt), check script.
- **Tx-d** mesh + markings + game layer (surface, kerb, islands, lane / edge / stop lines, zebra, arrows, guide lines), check script that builds the mesh headless.
- **Tx-e** AI and signals: `JunctionLink` (movements -> routes, general version of `J1Link`), signal pad from the same data, remove the stand-in `tLink` for this arm, check script (every movement reachable, no jump, red / green, free movements never stopped).
- **T-final**: all four in the game together, rail / river / structure re-check, one drive-through per movement, update the status table, `CHANGES_RINGT_*_BN.md`.
Wait for the user's OK after every micro-step. Update the status table in HANDOFF_ROAD_DESIGN.md (no new md files except the `CHANGES_*_BN.md` of the step).

## 6. Known risks
- The ring is ONE closed road: a pad on the ring changes its carve and the cell grid (`j1Cells`-style set per junction), do the terrain step with the ring profile frozen.
- The ring has a median: the pocket, refuge, U-turn opening and crossover all cut it; `MedianPlan` / `UTurns` must know the new openings (the existing random U-turn AI must not use a junction opening wrongly).
- AI: signal lateral bands (`SignalArm.latMin / latMax`) must be exact for every design so a free movement is never stopped by a signal of another group; keep the `brakeLimit` look-ahead (75 m) in mind: zone speed <= 60 km/h at the stop line.
- Capacity of ground junctions on 8 lanes is limited by nature: if a calculation fails, report it and propose the next design of the catalogue, never hide a FAIL.
- Site N: the bridge at +200 m limits the + side; site S: bridge at -320 m; site W: the viaduct at 16 m from the ring; site E: the ring climbs steeply 780 m to the west.

## 7. Definition of done (per junction and for all four)
All checks of the micro-steps PASS, the junction is built in the game, driven through by the player and by AI cars in every movement, signals correct, the four designs are really different, no structure, rail or river changed, the status table is updated, a `CHANGES_RINGT_*_BN.md` exists.

## 8. Starter prompt for a NEW chat
"Read HANDOFF_RING_T_JUNCTIONS.md completely, then sections 1, 3 and 15.8 of HANDOFF_ROAD_DESIGN.md. We design the four ring T junctions (ground level, four different designs, fully engineered). Run micro-step T0 only (site check script + confirm the design assignment with me). Reply in Banglish, one step per chat, only changed files in the zip, reuse what exists in the game, STOP after the step and wait for my OK."
