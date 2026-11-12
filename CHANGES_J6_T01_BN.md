# J6 T01 — Scenario edit layer (road network edit)

Flag: `Config.roads.scenario.enabled` (default **false** = game ager moto, digest diye proman: 341 road / 169 pad / 39 bridge, hash same).
Test korte: `Config.roads.scenario.enabled = true` (Config.ts), tarpor game / `npx tsx scripts/j6-scenario-test.ts`.

## Ki hoy (ON hole)
- Pad J6 (old) nei. S4-er north bend soro, S4 shoja centre (F6) porjonto jay (bridge-gulo thik thake).
- S5-er F6-er pashe parallel head soro. S5 ekhon branch hoye **T junction-e** west leg-er sathe mishe (pad ache).
- Notun road `J6-west`: centre -> J57 (J57 ekhon 4-way pad, S5 x2 + S12 + west).
- Baaki shob road same (F6 shudhu purano pad-er kache, S12 J57-er kache, E34 earthen track S5-r sathe bodle jay — ei-gulo downstream effect).

## Files
- `src/interchange/scenario/J6Scenario.ts` (spec + pure helpers)
- `src/roads/RoadNetwork.ts` (`applyScenarios`, cut / fuse / checkScenarioPads)
- `src/core/Config.ts` (`roads.scenario`)
- `scripts/j6-scenario-test.ts` (ALL OK), `scripts/j6-net-digest.ts`, `docs/j6/data/j6-baseline-off.json`
- docs: `HANDOFF_J6_INTERCHANGE_BN.md`, `docs/j6/03_SCENARIO_SPEC_BN.md`

## Jana dorkar (honest)
1. **Grade:** shoja centre -> J57 (465 m) 14.5 % uthe (J57 y 99, centre 31.5); collector limit 10 %. South branch 16.8 %. Provisional `maxGrade 0.18` dewa ache (placeholder). T04-e alignment >= ~700 m lagbe, ba west leg J57-te na diye S5-r nichu jaygay join korte hobe — **user-er sidhanto lagbe**.
2. **Centre-e pad nei:** pad rule "bridge within 115 m" (S4 bridge centre theke 109 m). T08-e diamond bosbe.
3. Test baseline: `road-test` 2 FAIL (ager moto), tsc error count same (3 = noise), analysis-test ok.
