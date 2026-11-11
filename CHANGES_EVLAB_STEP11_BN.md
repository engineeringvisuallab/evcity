# EVLab Step 11: bairer bosar bench

EVLab-er bairer plaza, island-er quay (lake-er dhar) ar lake-er bairer bank-e bosar bench boshano holo. Notun tree toiri hoyni (`parkTrees()` ager moto, 812 ta). Bench-er jaiga, collider ar bosar jaiga (Step 12-er jonno) data hishebe ache.

## Koyta, kothay (65 ta bench, 195 ta bosar jaiga)
- **Plaza (18):** boro fountain-er chardike 8 ta (fountain theke 21 m, fountain-er dike mukh; basin 14.4 m, pani 17.7 m porjonto porhe, tai ring tar baire). Portal-er samne ar dokkhine 16 m faka, jate manush hete jete pare. Duita chhoto fountain-er dokkhin ar baire 1 ta kore (4 ta). Plaza-r purbo ar poshchim kinare 3 ta kore (6 ta), bhitorer dike mukh.
- **Island quay (24):** quay wall-er 2.2 m bhitore, prai 36 m por por, lake-er dike mukh.
- **Lake-er bairer bank (23):** lake-er kinar theke 3.5 m baire, prai 40 m por por, lake-er dike mukh.

## Kon jinish-er sathe conflict nei (test kore dekha)
- Road, bridge, avenue, west/east promenade, ring road, podium: bench-er kono kona ei jaiga-e porhe na (1 m margin).
- Lake-er pani ar dhalu bank: shob bench somotol jomi-te.
- Parking lot, cycle rack, fountain basin (2.4 m), plaza-r lamp ar flag pole (2.5 m).
- Park tree: tree-er gor bench-er kinar theke 0.9 m-er bhitore ashe na. Je jaiga-e gach ache, bench shesh theke 10 m-er moddhe soriye jay, na pele bad jay. Gach kichu bodlay ni.
- Cyclist ar car-driver-er route (20 ta route, ~9900 point) bench theke 1 m-er kachhe jay na.
- Shob bench flat plot-er bhitore, fence theke 10 m, highway-r dike 30 m dure.

## Model ar performance
- Bench: 1.8 m lomba, 0.52 m chawra, seat 0.45 m, pither uchchota 0.9 m. Teak slat (3 seat + 2 pith) ar kalo steel frame (2 ta pa, armrest, brace). ~190 triangle.
- Shob bench ek model: **2 ta InstancedMesh** (wood + steel) = 2 draw call, 65 instance. `castShadow = false` (chhoto prop, PERFORMANCE_RULES 2.2).
- Collider: ekta ghurano box (1.8 x 0.52 m, 0.9 m uchu) per bench, 65 ta, `EVLabManager` ager obb-er sathe banay (bridge-er moto shuru-te, tower-er ager colliders-er sathe).

## File
- Notun: `src/evlab/EVLabBenches.ts` (pure: `BENCH`, `benches()`, `benchSeats()`, `benchObbs()`, `inBenchZone()`, `plazaPoles()`), `src/evlab/EVLabBenchMesh.ts` (mesh), `scripts/evlab-benches-test.ts`, `CHANGES_EVLAB_STEP11_BN.md`.
- Bodlano: `src/evlab/EVLabGrounds.ts` (`buildBenches`, `GroundsBuild.obbs`), `src/evlab/EVLabManager.ts` (`obbs` shuru-te grounds-er bench collider), `package.json` (`test:evlab-benches`), `HANDOFF_EVLAB.md`.

## Step 12-er jonno (bench-e manush)
`benchSeats()` prottek bench-e 3 ta bosar jaiga dey: `{ id, bench, x, y, z, yaw }`. `x, z` = seat-er majhkhan (building-local), `y` = seat-er upor (floor theke 0.45 m, plaza-te 0.5 m), `yaw` = manush je dike takabe (0 = +z). Bosha manush-er jonno Step 10-er `PersonModel.setSeatedLimbs` ache.

## Adjust korte chaile
- Songkha / doori: `along('island', ISLAND, -2.2, 36, ...)` ar `along('bank', LAKE, 3.5, 40, ...)` (step = por por koto m). Plaza-r ring: `R = F.r + 7`. Bench-er size ar bosar jaiga: `BENCH` (EVLabBenches.ts). Rong: `EVLabBenchMesh.ts` (`woodMat`, `steelMat`).

## Jene rakho
- Ei sandbox-e `three` install kora chhilo na (network nei), tai `npm run build` / `tsc --noEmit` chalano jayni. Pure part (layout, clash, seat, collider, route clearance) `npm run test:evlab-benches` diye chalano, shob pass. Mesh code ta ekta chhoto `three` stand-in diye chalano hoyeche (2 InstancedMesh, 65 ta, size thik), kintu real `three`-e test-er mesh section (size, triangle) tomar machine-e prothom chalabe.
- Tomar machine-e chalao: `npm run test:evlab-benches`, `npm run test:evlab-cyclists`, `npm run test:evlab-arrivals`, `npm run test:tower`, `npx tsx scripts/mission-test.ts`, `npx tsc --noEmit`, `npm run build`.
- Browser-e (`npm run dev`) chokh diye dekho: bench gulo jomi-te thik boshche kina (quay-r kache, bank-e), mukh lake/fountain-er dike kina, palm gach-er kache ektu choto lage kina.
