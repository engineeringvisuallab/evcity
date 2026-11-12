# HANDOFF — J6 interchange + construction timelapse (evcity)

Base: `evcity.zip` (main) + `evcity_interchange_MERGED.zip` overlay (src/interchange, flag off). Banglish; technical word English.
Rule: prottek part-er shesh-e `tsc` (notun error 0) + `interchange-test` + `road-test` (79/2 same). Flag off thakle game ager moto. Prottek step-e **changed file dite hobe** (zip, `evcity/` path soho).

## NOTUN DIRECTION (user): EVCity = engineering analysis + shikkhonio game
Interchange shudhu "bananor" jinis noy: **je kono junction-e kon solution possible, kano (rule, capacity, safety, cost, terrain), shikkhar jonno dekhano**, tarpor chosen solution build. `src/interchange/Analysis.ts` ei engine (docs/JUNCTION_ANALYSIS_BN.md).

## Analysis parts (A) — age eigulo, tarpor build parts
| # | Part | Status |
|---|---|---|
| A1 | Analysis engine (rule, capacity, safety, cost, score, lesson en/bn) + test + J6 run | DONE |
| A2 | Demand: game-er AI traffic count / road class theke peak-hour volume (ekhon input) | next |
| A3 | Analysis panel UI: junction click -> table, ranking, bn lesson, weight / assumption slider, what-if (volume, speed) | |
| A4 | Candidate preview 3D (standalone viewer-e solution bachai) | |
| A5 | "Apply solution": chosen candidate game-e build (niche Part 5-9) | |
| A6 | Student mode: quiz / challenge ("ei junction-e kon solution?") | |

## Build / timelapse parts (age-er plan)
| # | Part | Status |
|---|---|---|
| 1 | Survey J6 | DONE (`scripts/j6-survey.ts`, `j6-dump.ts`) |
| 2 | Pattern + design parameter | DONE — `docs/INTERCHANGE_J6_DESIGN_BN.md`; Analysis diamond-under (north leg west-e bend) ke confirm korlo |
| 3 | Top + profile SVG, validator | next |
| 4 | Standalone 3D viewer artifact | |
| 5 | Step 2c: ramp gore/merge taper (no z-fight) | |
| **5a** | **Grade-following level plan** (`Levels.ts`: cross road underpass, F6 profile obikrito) | notun, Part 2-te ber holo |
| 6 | J6 config entry; old pad + stub soraano; S4/S5 realign (N leg), drainage, retaining wall | |
| 7 | F6-r upor bridge deck (F6 on grade, bridge over cross road) | F6 profile bodlay na — risk komlo |
| 8 | Interchange-aware median/UTurn/sign/gach/light | |
| 9 | AI ramp-e (RoadGraph one-way link) | high risk |
| 10-14 | Construction schedule, renderer, machinery, camera/overlay, video | timelapse |
| 15 | Traffic diversion during construction | |
| 16 | Perf + final test + handoff | |

## J6 facts (Part 1+2)
- J6 = pad id 6, x=-1731.8, z=-137.0, y=33.73, rCore 43.9. F6 (road 5, 6 lane, 100 km/h, grade 4-5 %), S4 (road 24, collector, bridge id 21 river, span 32 m), S5 (road 25, collector). Duto collector F6 duibar paar hoy (u=-68 ar pad); real cross road = S4 (south) + S5 (north).
- Interchange centre: **u=-68** (x=-1773.9, z=-190.4, y_F6=31.5), yaw 0.9018 rad (51.7 deg). Terrain: uttore pahar, dokkhine nodi.
- **Decision (user approval chai):** diamond, F6 on grade unchanged, cross road underpass (clearance 5.5 + deck 1.4 = 6.9 m), ramp 50 km/h, terminal V ~62 m, nose 200-240 m.
- Level plan flat-ground assumption F6 theke 10.3 m dure — Part 5a.

## Jana shimana
- Game chalano jay ni; proman = headless `TerrainGenerator` + `buildInterchange` + SVG/PNG. `three`/`vite` nai.
- Left-hand traffic: slip = left turn, loop = right turn. Cross road main-er 90 deg dhora hoy.
- `tsc` ~109 noise error ar `road-test` 2 FAIL — original main-eo ache.

## Files (Part 1-2)
`scripts/j6-survey.ts`, `scripts/j6-dump.ts`, `scripts/j6-design.ts`, `scripts/j6-plot.py`, `docs/INTERCHANGE_J6_DESIGN_BN.md`, `docs/interchange-preview/j6-existing-plan.png`, ei handoff.
Chalate: `npx tsx scripts/j6-design.ts` (~1 min), `npx tsx scripts/j6-dump.ts` then `python3 scripts/j6-plot.py`.

## Analysis-theke paoa dorkari finding (J6)
- North leg shoja uttore gele cut 45 m (pahar) -> **north leg west-e bend korte hobe** (S5 diagonal-er low ground); tahole diamond-under possible, cut ~57k m3.
- Parclo model-e cross->main turn-er ramp nei (4 ta ramp, 8 turn-er 4 ta) — Part 7-e fix.
- Next junction 465 m, guide 1000 m — warning.
- Files (A1): `src/interchange/Analysis.ts`, `src/interchange/index.ts` (1 line export), `scripts/analysis-test.ts`, `scripts/j6-analysis.ts`, `docs/JUNCTION_ANALYSIS_BN.md`.
