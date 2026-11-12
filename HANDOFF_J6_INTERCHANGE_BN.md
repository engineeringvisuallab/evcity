# HANDOFF — J6 interchange + analysis + timelapse (evcity)

**Onno AI/developer: age `docs/j6/00_START_HERE_BN.md` poro.** Eta short status; details `docs/j6/`-e.
Rule: Banglish kotha, English code. Prottek step-e changed+notun file zip (`evcity/` path soho). Flag OFF = game ager moto. Notun tsc error 0, notun test FAIL 0 (baseline: tsc ~109 noise, road-test 2 FAIL, original main-eo).

## Direction
EVCity = engineering-analysis + shikkhonio game. Junction-e kon solution possible/kano (analysis) -> chosen solution build -> construction timelapse video.

## Status
| ID | Task | Status |
|---|---|---|
| done | Survey, design decision (diamond, F6 on grade, cross road underpass), Analysis engine + tests + J6 run | DONE |
| T01 | Scenario edit layer + J6 edits | DONE (flag `Config.roads.scenario.enabled`, OFF = ager moto). West leg / south branch alignment = PLACEHOLDER (provisional grade 18 %), T04 replace korbe. Centre-e pad nei (S4 bridge 109 m door, rule 115 m): T08 diamond bosabe |
| T02 | Scenario tests | PARTIAL: `scripts/j6-scenario-test.ts` (OFF == original digest, ON connectivity / pads / bridges / untouched roads) ALL OK. Baaki: radius >= 73 m, grade <= limit (T04-er por) |
| T03 | Demand model | DONE (`demand/Demand.ts`, `scripts/demand-test.ts` ALL OK): override > AI count provider > road-class default. AI traffic count provider ekhono wire kora nei (T10 / T09-e) |
| T04 | West-leg alignment by Analysis | TODO |
| T05 | Level plan: grade-following + 'under' | TODO |
| T06 | Underpass structures (F6 deck, walls, drainage) | TODO |
| T07 | Ramp gore/merge taper | TODO |
| T08 | Apply interchange in network (+ median/sign/tree/light) | TODO |
| T09 | AI traffic on ramps (high risk) | TODO |
| T10 | Analysis panel UI (bn) | TODO (`ui/AnalysisPanel.ts`) |
| T11 | Pattern coverage (parclo), 3-leg | TODO |
| T12 | Candidate preview + student mode | TODO |
| T13-T16 | Timelapse: schedule, view, machines, camera/overlay/recorder | TODO (`construction/*`) |
| T17 | Traffic diversion, perf, final | TODO |

## Key facts (details: docs/j6/02, 03)
- J6 = pad id 6 (x -1731.8, z -137.0). **Interchange centre x -1774.0, z -190.3, yaw 0.9018** (68 m SW of the pad, where S4 (east, river bridge) meets F6). Nearest junction J57 at 463 m.
- User sketch: remove pad J6 + stubs + S5 parallel part; cross road east-west: S4 east, new road west to J57 with a T and a south branch to S5.
- Analysis (assumed demand): only **diamond, cross road under** is possible, IF the west leg bends down-slope (straight = 45 m cut). Signal/roundabout fail (100 km/h highway), diamond-over fails (grade 8.6 %), parclo/cloverleaf fail (cut 37-38 m, weaving, missing turns).
- Roads are PROCEDURAL (RoadNetwork.ts) -> T01 is the highest-risk step.

## Files
Done: `src/interchange/Analysis.ts`, `index.ts`, `scripts/analysis-test.ts j6-analysis.ts j6-survey.ts j6-dump.ts j6-design.ts j6-plot.py j6-scenario-data.ts`, `docs/INTERCHANGE_J6_DESIGN_BN.md JUNCTION_ANALYSIS_BN.md j6/*`.
Stubs: `src/interchange/{scenario,demand,ui,construction}/*`, `scripts/j6-scenario-test.ts`.
