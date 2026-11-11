# EVLab Step 12: Bench-e manush + pump station-er upor-er building remove

## Ki holo
1. **Main Station Pump Station-er upor-er boro building remove.** Oita chilo `tower-residential` (28 tola, 45 x 45 m, x 20 / z -260), pump pad-er (36.5, -253.4) thik upor boshano. `src/buildings/Placements.ts` theke oi row bad. Model registry-te ache, onno jaiga-e boshate chaile ekta row add koro.
2. **Bench-e manush (Step 12).** Step 11-er 65 bench-e real `PersonModel` boshe thake. Songkha `Q.evlabBenchSitters`: low 6, medium 12, high 20. Bakigulo bench khali.
   - Plaza, island quay ar lake-er bairer bank, tinta jaigar bench-er onupate bhag kora. Ek bench-e max 2 jon (dui pranter seat, 1.16 m dure), ek jon hole 3 seat-er jekono ekta.
   - Pose: pith bench-er hele-r kache (ektu pichone), uru seat-e, shin niche, **pa duto thik maatite** (every body size-er jonno two-link diye hisab, miss 0.000 m). Kono kono manush dui haat kole, kono ekjon ek haat seat-e rakhe. Kichu manush ektu pashe takay.
   - Build: player 260 m-er kache prothom ashle, dure gele hide. Ekbar pose dile per-frame kono kaj nei.
   - Physics nei (arrivals/cyclists-er moto, shudhu dekha jay). Bench-er collider ager moto.

## Changed / notun file
- notun: `src/evlab/EVLabSitterPlan.ts`, `src/evlab/EVLabBenchSitters.ts`, `scripts/evlab-sitters-test.ts`
- changed: `src/evlab/EVLabManager.ts`, `src/core/Quality.ts` (CRLF thik), `src/buildings/Placements.ts`, `scripts/placements-test.ts` (CRLF thik), `package.json` (`test:evlab-sitters`), `HANDOFF_EVLAB.md`

## Test (ei sandbox-e chalano)
- `npm run test:evlab-sitters` all ok; `test:evlab-benches`, `test:evlab-cyclists`, `test:evlab-audience`, `test:evlab-arrivals` ok
- `npx tsc --noEmit` clean, `npm run build` ok
- `npm run test:placements`: notun check 2b (pump pad-er upor building nei) PASS. Ekta ager theke-i thaka FAIL ("all 54 spots...": cinema, upazila_complex, city_hall) amar change-er age-o chilo, ekhon 53 spot, ei step-er sathe somporko nei.
- Real model-er pa: bone position diye check kora (ankle y = target), tai pa maatite.

## Browser-e dekho
- Plaza-r fountain-er bench-e, island quay-te, lake-er bank-e kichu manush boshe ache kina; pa maatite, pith bench-e, mukh fountain/lake-er dike.
- Main pump station-er upor ar boro building nei.
