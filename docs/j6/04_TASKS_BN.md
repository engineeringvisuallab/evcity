# Tasks (ei order-e, ekta ekta kore; prottek-er shesh-e zip + handoff update)

Notation: **Files** = jeguloy hat dite hobe. **Done when** = acceptance. Sob task-e: notun tsc error 0, notun test FAIL 0, flag OFF = ager moto.

## T01 Scenario edit layer + J6 edits
Goal: procedural road network-e deterministic edit (remove road segment / add road / remove pad) apply kora, spec = `03_SCENARIO_SPEC_BN.md` (R1-R3, A1-A4).
Files: `src/interchange/scenario/J6Scenario.ts` (data + types), `src/roads/RoadNetwork.ts` (hook after generation, before pads: find `addRoad`, `smoothRoute`, pad build ~line 166), `src/core/Config.ts` (`roads.scenario.enabled=false`, `roads.scenario.list`).
Steps: (1) read RoadNetwork/RoadPlan/Junctions; (2) add `applyScenario(net, scenario)`; (3) remove S4 tail, S5 head, pad 6 stubs; add A1-A3 as collector roads with terrain-following `ys`, `hNat`, `endY`; (4) pads regenerate for T, branch join, J57; (5) bridges/traffic graph/minimap see the result.
Done when: scenario ON -> `pads` has no id 6 (or J6 pad replaced by nothing), S4 reaches the centre, a road path exists S4(east) -> centre -> J57 and centre -> T -> S5(SW); no road overlaps F6 except at the centre; scenario OFF -> every road/pad identical to before (deep-equal test).

## T02 Scenario tests
`scripts/j6-scenario-test.ts` (stub present): connectivity (BFS on RoadGraph), pad count/ids, min distance between new roads and F6 outside the centre >= 25 m, grade <= road maxGrade, min radius >= 73 m, OFF == baseline. Add to docs.

## T03 Demand model (A2)
Files: `src/interchange/demand/Demand.ts`. Peak-hour `Demand` (`Analysis.ts` type: approaches[0..3] = circulation order, {thru,left,right}) from: (a) game AI traffic counts if available (`src/traffic/*`), else (b) road-class defaults (highway 1800+150+100 per dir, collector 250+120+80 — current assumption), (c) user override. Done when: `demandFor(junction)` returns 4 approaches, unit-tested, user can override.

## T04 West-leg alignment by Analysis
Use `analyzeJunction` with the real corridor (`site.crossY/crossGround` hooks: arc distance v) for candidate alignments of A2 (straight, curved-down-slope, curved + T at 130/250/350 m). Pick by min cut/fill, R >= 73 m, grade <= 8 %, T gap >= 150 m from the terminal. Output waypoints into `J6Scenario.ts`. Done when: chosen alignment cut <= ~25 m or documented; table in docs.

## T05 Level plan: grade-following + 'under' mode
Files: `src/interchange/Levels.ts`, `Builder.ts`, `InterchangeTypes.ts` (`upper: 'main'|'cross'|'none'`, new `lower: 'ground'|'depressed'`), `Parts.ts`. Today the plan is **flat-ground** (one y0): F6 grade 4-5 % => 10 m mismatch. New: main keeps its real profile (`mainY(u)`); cross road = mainY - (clearance 5.5 + deck 1.4) at the crossing, climbs at <= 6 % to the existing level ("daylight"). Ramps interpolate between main level at the gore and cross level at the terminal. Mirror what `Analysis.ts` computes (`crossUnder`, `rampProfile`). Done when: `buildInterchange` with `under` gives ramp ys = Analysis ys (+-0.3 m), validator OK, existing tests unchanged.

## T06 Underpass structures
F6 deck over the cross road (short bridge ~15 m span, abutments), retaining walls where cut > 6 m, drainage outfall note/object (sag), side slopes, culvert. Files: `Structures.ts`, `roads/BridgeBuilder.ts` (reuse), `Parts.ts`. Done when: no z-fight, clearance >= 5.5 m, walls only where cut > wallFromH, bridge physics (BridgePhysics.ts) lets cars pass.

## T07 Ramp gore / merge taper (Step 2c)
Ramps leave / join F6 tangentially with decel/accel lanes (116 / 152 m from `Standards.ts`), no overlap / z-fight at the junction with F6. Files: `Builder.ts`, `Junctions.ts`, `RoadAdapter.ts`. Done when: `interchange-network-test` OK, min lateral clearance between ramp and F6 kerb >= 0, taper lengths >= Standards.

## T08 Apply interchange in the network
`Config.roads.interchange.list` entry for J6 (diamond, under), support `cross: 'collector'`; replace the at-grade pad with the interchange; ramp ribbons + terrain cut; interchange-aware median (`MedianPlan`), U-turns, signs, trees, lights (`signs/*`, `Planting`). Done when: flag ON shows no at-grade crossing; OFF unchanged.

## T09 AI traffic on ramps (HIGH RISK)
`src/traffic/RoadGraph.ts`, `Route.ts`: one-way ramp links, gore/merge connections, terminal turns (signal/priority). Alada test: 200 AI cars from S4 east -> F6 north/south, F6 -> S4/west leg, no deadlock, no wrong-way. Done when: test passes + visual user check.

## T10 Analysis panel UI (A3)
Click a junction -> panel: 6 solutions, rank, possible / NOT possible + reason, v/c, LOS, conflicts, cost, land, lesson (bn/en toggle), weight sliders, assumption sliders, what-if (volume, speed). Files: `src/interchange/ui/AnalysisPanel.ts`, `src/i18n/bn.ts`, HUD hook. Done when: panel shows J6 table identical to `scripts/j6-analysis.ts`; Bangla strings in i18n.

## T11 Pattern coverage + 3-leg
Parclo: all 8 turns served (add cross->main ramps or document). Add trumpet / T-junction / roundabout geometry + analysis for 3-leg (`legs: 3`). Done when: `analysis-test` has coverage checks for every pattern.

## T12 Candidate preview + student mode (A4/A6)
Standalone 3D viewer: pick a solution, see it on the real J6 terrain. Student mode: "ei junction-e kon solution?" challenge + score using Analysis. Done when: viewer opens all feasible candidates; quiz scores vs `ranking`.

## T13 Construction schedule (timelapse 1)
`construction/Schedule.ts`: phases (site clearing, earthwork cut/fill, drainage, foundation/piles, abutment+wall, deck/girders, pavement layers subbase/base/asphalt, marking, barriers, signs, lights, landscaping), per-element start/end day, `progress(t) in 0..1`. Derived from the built interchange (ramps, walls, deck). Done when: every element has a schedule; Gantt-like table printed by a script; total days plausible (e.g. 18-24 months compressed).

## T14 Construction view
`ConstructionView.ts`: render element at progress p (earthwork height grows, walls rise, deck slides, asphalt layers appear), old road stays open until switch. Done when: scrubbing 0->1 shows the whole sequence, final == normal built interchange.

## T15 Machines
`Machines.ts`: excavator, dump truck, crane, paver, roller (InstancedMesh, animated on the active element). Done when: <= budget instances, machines follow active phase.

## T16 Timelapse camera, overlay, recorder
`TimelapseCamera.ts` (orbit + fixed drone), overlay "Day N / phase name / what is happening (bn)", speed control; `Recorder.ts` (`canvas.captureStream` + `MediaRecorder` -> .webm download). In-game playback too. Done when: one click records the full video.

## T17 Traffic diversion + performance + final
Traffic uses old road during construction, switches at the end; lazy build / LOD; final tests; handoff update.
