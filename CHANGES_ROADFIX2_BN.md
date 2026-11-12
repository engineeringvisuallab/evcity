# CHANGES_ROADFIX2_BN - RC03 (S12/S5 shoja, J57) + RC04 (railway-r upor road uchu)

## Ki hoyeche
- RC03: S12 ar S5 J57 junction-er upor diye ekta shoja road. Age S5 J57 theke dokkhin-purbe niye ghure jeto (R 49 m), S12-er shesh-e hook chhilo (R 25 m). Ekhon S12-er 240 m ar S5-er 400 m notun kore aka, junction-e duto road-er ekii heading (10 digree). Radius >= 73 m. J57 pad ar J6-west jekhane chhilo sekhanei.
- RC04: S12 jekhane railway-r cut & cover box-er upor diye jay (-1815,-877), box-er roof ar road-er gap chhilo 0.05 m. Ekhon S12-er jonno rail 1.0 m beshi niche: road box-er roof-er theke komopokkhe 1.4 m upore. (Road-ke uchu korle kaj hoy na, rail-o road-er sathe niche namey: tai rail-ke nambano holo. Sudhu S12; onno road-er rail crossing ager moto.)
- Side effect (RC03): rail notun road-er sathe nijei mile gechhe; S12-er sathe crossing prai (-1866,-897)-e, ekhon box-er bodole tunnel.

## Files
- `src/roads/RoadCorrections.ts` (ROAD_FIXES, straightenThrough, RAIL_BOX_COVER), `src/roads/RoadNetwork.ts` (applyRoadFixes, scenarios-er por), `src/rail/RailNetwork.ts` (zone `extra`), `scripts/road-correction-test.ts`, `ROAD_CORRECTION_SYSTEM.md`, `HANDOFF.md`.

## Check
- `npx tsc --noEmit` OK. `road-correction-test` ALL PASS (RC01-RC04), `j6-scenario-test` ALL OK, `road-number-test`, `road-section-check` pass.
- `road-fit-test` 5 summary line fix-er age ar pore hubohu ek. Rail: issues 7 = 7, crossings 75 = 75, piers 531 -> 530.
- Game-e chokh diye dekha jayni (headless): look / FPS check baki.

## Ekhono baki
- J6 interchange T04 theke (west leg alignment) shuru hoy ni. J6 crossing-e pad nei karon "S4+J6-west x F6: bridge within 115 m" skip: grey patch tar jonno, T08-e thik hobe.
