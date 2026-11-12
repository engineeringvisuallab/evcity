# Engineering check (Standards.ts) — ami nijer design audit korlam

`src/interchange/Standards.ts`: AASHTO Green Book (metric) formula, table copy kora nai: Rmin = V^2/(127(e+f)), SSD, decel/accel lane (kinematic), crest K, weaving min. Sob constant `CRITERIA`-te: project-er standard (RHD / AASHTO) dile sheta-i boshbe.
`npx tsx scripts/standards-report.ts` — cloverleaf-er ramp radius -> speed, grade, weaving length, taper check.
Ekhono `validate()`-e jora hoy ni (criteria confirm howar por).

## Notun: `cloverleaf-cd` (C-D road soho cloverleaf, real-world design)
- `PatternCD.ts`: mainline-e 1 ta exit + 1 ta entrance, slip/loop shob C-D road-e. Exit transition >= decel length ar 15:1; entrance >= accel length. Length `Standards.ts` theke (kinematic).
- `Validate.ts`: C-D lane-e join ar C-D theke diverge/merge-ke gap/crossing bhul dhore na (CD_ZONE 120 m); baki check ager moto.
- `Levels.ts`: `-cd` pattern-e cross road upper (overpass), highway ground-e.
- Audit (`scripts/standards-report.ts`): loop 70 m -> exit 150 m OK, entrance 190 m OK, C-D weaving 159 m OK (min 150; desirable 300 ekhono nei), validator ok. Footprint ~623 m (length ~1160 m).
- Ekhono baki: clothoid transition, superelevation (data-te), median/C-D barrier mesh, sign gantry, drainage.
