# J6 INTERCHANGE — START HERE (onno AI / developer-er jonno)

User: civil + transportation engineer (30 bochhor). Kotha **Banglish** (Bangla English akkhore), technical word English. Code ar comment English.
Project: **EVCity** = three.js game, **engineering-analysis + shikkhonio** (educational). Interchange ekta "shudhu banano" jinis noy: je kono junction-e kon solution possible, kano, seta dekhano; tarpor chosen solution build; sathe construction timelapse video.

## Poro (ei order-e)
1. `01_USER_INTENT_BN.md` — user ki chay, sketch-er byakkha (`assets/user-sketch-j6.png`).
2. `02_J6_FACTS_BN.md` — J6-er survey number, terrain, road id.
3. `03_SCENARIO_SPEC_BN.md` — **ki soraate hobe, ki jorte hobe** (road id, index, coordinate). Data: `data/j6-scenario-data.json`.
4. `../INTERCHANGE_J6_DESIGN_BN.md` — design decision (diamond, F6 on grade, cross road underpass) + parameter.
5. `../JUNCTION_ANALYSIS_BN.md` — analysis engine (`src/interchange/Analysis.ts`) + J6 result.
6. `04_TASKS_BN.md` — **kaj-er list** (T01..T17), prottek-ta-r acceptance test.
7. `05_RULES_AND_TESTS_BN.md` — delivery rule, command, baseline noise.
8. `06_RISKS_AND_OPEN_QUESTIONS_BN.md`.

## Ja ager-e ready
- `src/interchange/` (flag-off interchange system: diamond / cloverleaf / parclo / CD, Standards, Validate, Builder) — user-er MERGED zip.
- **Notun, ready:** `src/interchange/Analysis.ts` (+`index.ts` export), `scripts/analysis-test.ts` (20 check pass), `scripts/j6-analysis.ts`, `scripts/j6-survey.ts`, `j6-dump.ts`, `j6-design.ts`, `j6-plot.py`, `j6-scenario-data.ts`.
- **Skeleton (khali stub, kaj baki):** `src/interchange/scenario/`, `demand/`, `ui/`, `construction/`, `scripts/j6-scenario-test.ts`.

## Folder structure
```
evcity/
  HANDOFF_J6_INTERCHANGE_BN.md        status table (short)
  docs/
    INTERCHANGE_J6_DESIGN_BN.md       Part 2 design decision
    JUNCTION_ANALYSIS_BN.md           analysis engine doc
    j6/
      00_START_HERE_BN.md  01_USER_INTENT_BN.md  02_J6_FACTS_BN.md  03_SCENARIO_SPEC_BN.md
      04_TASKS_BN.md  05_RULES_AND_TESTS_BN.md  06_RISKS_AND_OPEN_QUESTIONS_BN.md
      assets/   user-sketch-j6.png  existing-plan-uv.png  screenshot-j6-original.png
      data/     j6-scenario-data.json
    interchange-preview/j6-existing-plan.png
  src/interchange/
    Analysis.ts  (DONE)   index.ts (+export)
    scenario/J6Scenario.ts        T01  (stub)
    demand/Demand.ts              T03  (stub)
    ui/AnalysisPanel.ts           T10  (stub)
    construction/Schedule.ts ConstructionView.ts Machines.ts TimelapseCamera.ts Recorder.ts   T13-T17 (stub)
  scripts/
    analysis-test.ts j6-analysis.ts j6-survey.ts j6-dump.ts j6-design.ts j6-plot.py j6-scenario-data.ts  (DONE)
    j6-scenario-test.ts           T01/T02 test (stub)
```
