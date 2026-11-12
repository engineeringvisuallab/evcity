# JUNCTION ANALYSIS — engineering + shikkhonio engine (Banglish)

File: `src/interchange/Analysis.ts` (pure, three.js nai). Test: `scripts/analysis-test.ts` (20 check). J6 run: `scripts/j6-analysis.ts`.

## Ki kore
Ekta junction-er jonno (`JunctionContext`: main + cross road section, peak-hour demand, site/terrain, spacing) 6 ta solution ber kore:
at-grade signal, roundabout, diamond (cross under), diamond (main over), partial cloverleaf, cloverleaf.
Prottek solution-er jonno: **RULE** (fail/warn + karon), **CAPACITY** (v/c, delay, LOS), **SAFETY** (conflict point, topology theke gona), **GEOMETRY** (ramp km, land envelope, cut/fill, deck, wall, weaving), **COST** (unit-rate index), **SCORE** (weight editable), **LESSON** (en + bn, student-er jonno karon soho).
`formatReport(analysis,'en'|'bn')` plain-text table + lesson dey.

## Formula (shob public, `ASSUMPTIONS` / `UNIT_COSTS` / `DEFAULT_WEIGHTS`-e editable)
- Signal: Webster cycle C=(1.5L+5)/(1-Y); HCM-style delay d=d1+d2; sat flow 1900, lost 4 s/phase, right-turn eq 1.5.
- Roundabout: HCM 6th entry capacity 1380 e^(-1.0e-3 vc) (1 lane), 1420 e^(-0.85e-3 vc)+1420 e^(-0.91e-3 vc) (2 lane); delay HCM unsignalised formula; circulating flow = thru+right (prev leg) + right (leg before).
- Ramp / kerb-lane / cross-road merge check: lane cap 2200, kerb-lane share 0.45, ramp cap slip/diamond 1900, loop 1200 (planning value).
- Conflict point: 4-leg 32, T 9, roundabout 8; one-way ramp T = 4 (enumerate kore ber kora); gore = 1 diverge, merge = 1 merge.
- Weaving: ramp event-gulo theke (merge-er pore diverge); < 150 m fail, < 300 m warn (`CRITERIA`).
- Earthwork: strip road, slope 1V:2H, 6 m-er beshi hole retaining wall.
**Shotorko:** eigulo planning-level. HCM constant gulo project-er nijer standard-er sathe milie nin (ami smriti theke boshiyechi, tai verify korben).

## J6 result (assumed demand: F6 1800+150+100 per dir, cross 250+120+80)
| Solution | Result |
|---|---|
| At-grade signal | NOT POSSIBLE: F6 100 km/h access-controlled (v/c 0.76 shotteo rule fail) |
| Roundabout | NOT POSSIBLE: speed + 3 lane; entry v/c 2.36 |
| Diamond, main over | NOT POSSIBLE: F6 grade 4-5 % + overpass rise = 8.6 % > 8 % |
| Parclo | NOT POSSIBLE: cut 37 m, ar cross->main turn-er ramp nei (modelled pattern 4 ramp, 8 turn-er 4 ta) |
| Cloverleaf | NOT POSSIBLE: cut 38 m, weaving 101 m < 150 m |
| **Diamond, cross under** | **Possible if north leg west-e bend kore (cut 57k m3, 21 m deep cut warn).** Seja uttore (pahar-e) gele cut 45 m: NOT POSSIBLE |
Ei ta-i student-er shikkha: "kon solution kothay, kano".
Warning shob-e: next junction 465 m (<1000 m guide). Chalate: `J6_NORTH=straight|west`, `J6_MAIN=`, `J6_CROSS=`.

## Ekhon-er sima
- Geometry: 3 pattern (diamond/parclo/cloverleaf) `buildInterchange` theke; diamond-under-er ramp height / trench Analysis-e hishab (game-e geometry Part 5a-te).
- 4-leg only; 3-leg (trumpet, T) pore.
- Parclo model: 8 turn-er 4 ta served — pattern fix Part 7.
- Demand ekhon input (game-e AI traffic count theke ante Part A2).
