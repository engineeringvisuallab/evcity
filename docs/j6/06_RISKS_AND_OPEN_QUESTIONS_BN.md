# Risks and open questions
## User-ke jiggesh (uttor na pele default-e agao, kintu lekho)
1. South branch existing S5-e join kore (dhorechi) — naki notun road?
2. West leg alignment: analysis-er bend (cut komano) naki shoja (sketch)? Default = analysis-recommended.
3. T junction position: sketch ~130 m vs prostab 250 m+. Default = 250 m+.
4. Demand source: AI traffic count nai hole road-class default (T03).
## Risks
- Procedural roads: edit kore pad/bridge/traffic graph/minimap/trees sob consistent rakha (T01) — shobcheye boro risk.
- Level plan flat-ground assumption (`Levels.ts`): F6 grade 4-5 % -> 10 m mismatch (T05).
- Parclo model-e cross->main ramp nei (T11) (analysis-e dekha jay).
- AI traffic ramp-e (RoadGraph one-way link): high risk, alada test (T09).
- Terrain cut 20 m+ west hill: retaining wall / slope kit (T06).
- Timelapse performance: instancing + lazy build (T17).
- Analysis constants (HCM, unit cost) assumption — user-er project standard-e replace korte pare.
- `interchange-network-test` 1 check FAIL on the current repo network (see 05_RULES_AND_TESTS_BN.md "Known failing check"). Verify on the real build (three installed): interchange files (InterchangeView.ts, viewer.ts, Parts.ts...) were compiled only in a sandbox without `three` types.
