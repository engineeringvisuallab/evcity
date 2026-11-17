# HANDOFF: City Mall relocation (J1 E arm-er jonno)

Notun chat-e eee.zip (full repo) attach kore "Part A" paste koro. Tarpor ek chat-e ek step, "Part C" theke.

**Ekhon porjonto: M0 + M1 done (14 Nov), M1d done (15 Nov: red line theke 5 m walkway). Plot, pad, keepout notun jaigay boshano. Code-e shudhu src/mall/MallSite.ts + TerrainGenerator.ts (floor sample grid) bodlechhe. MallBuilder / MallManager / ParkingSite / Engine / MedianPlan / Jobs ekhono PURONO jaigar hisabe (M2/M3-er kaj). NEXT: M2 (building + plaza). M2-er shuru-te Part B2-er baki OPEN proshno (floor step, door, building size) jiggesh korte hobe.**

---

## Part A: Context (prothom message-e paste koro)

```
Ami evcity game-er City Mall relocation-er kaj korchi. Project eee.zip attach korlam.
Ami Banglish e likhi, tumio Banglish e uttor dao.

Age HANDOFF_CITYMALL_RELOCATION_BN.md pore nao (Part B, B2, B3). Sathe HANDOFF_EVLAB_RELOCATION_BN.md-er "Step R0d" section (ghorano frame, localToWorld / worldToLocal) ar src/mall/ (MallSite.ts, MallManager.ts, MallBuilder.ts) pore nao.

Niyom:
- Ek chat-e ek step. Shudhu changed file dao (repo path soho) ar HANDOFF_CITYMALL_RELOCATION_BN.md update kore dao (Done log + "Ekhon porjonto").
- Step shesh hole npm install, npm run build ar mall/start/parking test gulo chalao. Jodi sandbox-e network na thake ar chalate na paro, shetake spashto bolo, ja chalate paroni sheta ke "chalano hoy ni" likhe dao.
- Notun grass/tree toiri korbe na.
- Kono decision ami na bolle nijer matha theke nebe na, proshno koro.
- Arm-er hisab J1 theke (s = 0) shuru, shudhu J1_ARM_DATA (s >= 315) na.

Ki hoyeche: J1 (-87, -277, yaw 37.5) ar tar 8-lane arm gulo-r madhye E arm ager City Mall plot-er upor diye jay. EVLab ager jaiga theke puro soriye onno jaigay newa hoyeche (EVLAB_POS (-140, -620)), tai J1-er pashchim dike ager campus-er jaiga ekhon khali. Ami City Mall-ke shei khali jaigay nite chai (Part B3). Railway fixed.
```

---

## Part B: Survey (14 Nov, `scripts/mall-reloc-search.ts` = headless, kichu bodlay na)

- Ager mall plot: `MALL_POLY` (`src/mall/MallSite.ts`), x 13..160, z -175..-13, ~17,300 m2 (building outline `MALL_BUILDING` ~15,800 m2; ভিতরের shopping block `MALL_SIZE` 96 x 64). F4 road (pashchim), F7 (dokkhin), viaduct (purbo)-er kone, spawn crossing-er pashe.
- Conflict: J1-E arm-er centre line plot-er uttor-purbo ongsho diye tirjok jay (plot-e (57, -166) theke (145, -99)). Baki 3 arm plot theke >= 179 m dure.
- Plot-e thakle 96 x 64 block arm theke 20 m-er beshi gap-e fit kore na (90 x 60 porjonto 20 m gap-e fit kore, 78 x 52 40 m gap-e).
- Ager jaiga-te onno jaiga (150 x 110 plot) thakle spawn-er 250 m-er moddhe kono jaiga nei; 317-450 m-er moddhe kichu ache (purbo-e viaduct-er opare (400, -200), pashchime (-300, -260) etc.). Eta user nei nai, B3-te onno jaiga bachai kora hoyeche.
- Mall-er shathe jora jinis (M1-M3-e dekhte hobe): spawn/start lot ar parking (`src/parking/ParkingSite.ts`: MALL_LOT, APRON, EVLAB_LOT, FRONT_ROW, SIDE_LOT, `lotToWorld`, `START_LOT_POS`; sob F4-er shathe bandha, ager mall-er door-er pashe), `Engine.ts` (west door theke start camera, `MALL_DOORS`), `src/roads/MedianPlan.ts` (door-er samne zebra crossing, `MALL_DOORS` theke), `LocalRoads.ts` (`mallKeepout`: purono zone x -4..235, z -205..6 bondho thakbe, notun plot-er keepout jog hobe), `TerrainGenerator.ts` (mall pad + `floorY`), `src/economy/Jobs.ts` ("সিটি মল ডিপো" = MALL_LOT), `Roadside.ts` (hedge), `scripts/start-test.ts`, `scripts/mall-test.ts`, `eng-zones-test.ts`, `charge-points-test.ts`, `evlab-site-test.ts` (`MALL_PLOT` overlap check), `fill-*.ts`, `place-buildings.ts`, `placements-test.ts`, `proto-building-test.ts` (`mallKeepout`).

## Part B3: User-er decision (14 Nov)

1. **Jaiga:** J1-er pashchim dike, **W arm ar S arm-er majhe** (W arm-er bend-er bhitore, ager EVLab campus-er jaiga). User map-e (mall_area_map.png, 100 m grid) laal kore dekhiyechhe. Ei jaiga ekhon khali (EVLab soriye newa hoyeche).
   **Laal boundary-er prai world coordinate (+-20 m, hat diye ankha, ghorey ghorey):**
   (-537,-450) (-500,-494) (-425,-497) (-375,-487) (-300,-412) (-212,-344) (-137,-281) (-125,-256) (-150,-219) (-212,-169) (-262,-88) (-325,-31) (-375,-19) (-437,-21) (-500,-44) (-575,-100) (-650,-137) (-681,-179) (-637,-237) (-612,-287) (-581,-350) (-550,-412)
   Uttor-purbo edge W arm-er dike (arm-er prai pashe), dokkhin-purbo edge S arm-er dike, pashchim edge W arm-er bend, dokkhin-pashchim kone railway (magenta)-er kachhe. **Plot ei boundary-r bhitore thakbe, shudhu offset-er jonno kata jabe.**
2. **Offset:** road (8-lane edge, shoulder soho) theke ar rail theke **>= 10 m**. Parking ar alada facility-er jonno proyojon hole **15-20 m**.
3. **Size:** City Mall **ager cheye boro** hobe (ager building ~15,800 m2 outline / 96 x 64 block). Koto boro seta user ekhono bole ni.
4. **Land:** jaigay kichu ongsho somotol, kichu uchu (pahar-er dike). **Somotol ongsho-e floor somotol (flat), pahar-er dike-r ongsho-e building-er floor ektu uchu hobe.** Natun grass/tree toiri hobe na.

## Part B4: Step M1 result (14 Nov, done)

**Plot (`MALL_POLY` in `src/mall/MallSite.ts`, 34 corner, smooth, generated by `scripts/mall-new-plot.ts`, headless):**
- Red boundary (B3 point 1) theke shudhu offset kata hoyechhe: road edge (J1 arm = 22.1 m half pavement, onno road = halfWidth + shoulder) theke >= 15 m (+4 m grid margin; asol closest 19 m), rail theke >= 15 m (asol 18.8 m), road earthwork (road mask > 0) theke 4 m, ar J1 centre theke >= 156 m (asol 160 m) (J1 ground zone, EVLab R0d-te dekha 154 m porjonto road mask 1). Plot red-er bhitore 100% (703 edge sample, 0 baire).
- Area **124,843 m2** (red 163,990 m2-er 76%; 23% = 15 m buffer + J1 ground zone-er kata tip). Ager plot 17,300 m2-er ~7.3 gun.
- Building outline `MALL_BUILDING` = plot theke aro 12 m bhitore (env BINSET), 29 corner, **109,528 m2** (ager 15,800 m2-er ~7 gun); road/rail theke >= 25 m. 15 m + 12 m ring = parking / facility / plaza-r jaiga.
- `MALL_POS` = (-433.9, -244.5), yaw -0.6545 (= -37.5 deg, local +x = J1 W arm-er dike). `MALL_SIZE` (96 x 64 block) ekhono ager size; M2-te boro hobe.
- Corner, ar buffer ke 15 m theke 20 m kora: `BUF=20 SW=3 SI=4 TOL=1.5 MARGIN=4 npx tsx scripts/mall-new-plot.ts`, tarpor output JSON MALL_POLY / MALL_BUILDING-e boshao (script-er `PLOT:` / `BUILDING:` line).

**Pad / land:** natural ground in plot min 17.0, median 18.4, p90 ~20, max ~31 m. **floorY = 18.42** (median, TerrainGenerator-e ekhon pura plot bbox 41 x 41 sample). Pura plot **ek-i level-e flat** (range 0.0 cm, mall-site-test), pahar-er dike (NW, ~9,500 m2 > floor+3 m, max ~13 m) kete flat kora hoyechhe. `BLEND` 16 -> 40 m (pahar-e cliff na hoy; skirt max 0.77 m/m). Road earthwork-er jaigay pad nijer theke soriye jay (road mask), tai plot edge road theke 15 m+ rakha hoyechhe jate pad 100% flat thake.
**ASSUMPTION (user bole ni, B2 point 2):** stepped / uchu floor ekhono kora hoy ni, ek-dhap flat. User-er "pahar-er dike floor ektu uchu" M2-te dhap hishebe korte hobe (jiggesh kore).

**Keepout:** `mallKeepout` = purono zone (x -4..235, z -205..6) + notun plot polygon + 30 m (ager moto bbox na, polygon). Local street network ager moto (localStats 0, hash same).

**Test:** `scripts/mall-site-test.ts` (notun, ALL OK: plot red-er bhitore, road >= 15, rail >= 15, J1 >= 150, flat < 7 cm, road/J1-arm overlap 0, building plot-er bhitore, keepout). `scripts/mall-test.ts` M1-er jonno update (flat < 7 cm, glass wall >= 15 m, skirt cliff test road-mask bad diye, tree test notun chunk range, notun "mall J1-er pashchime" test); 4 ta check `PENDING` (M2/M3: hug roads, spawn-er kache, west doorway, food/fashion zone layout) -> mall-test ALL OK. `npm run build` ok.
**Ekhono FAIL (M3-er kaj):** `start-test` "player stands 15-45 m from the door" (spawn ager mall door-er pashe, notun mall 497 m dure). **Baseline-er (original zip-eo) same fail:** evlab-site-test 2 (plot flat 2.6 m, strip 2.58 m), eng-zones-test 4, charge-points-test 2, placements-test 1, proto-building-test 1; M1-er karone notun fail nei.

**M1b (14 Nov, user: "samner dike smooth na, smooth koro, road porjonto ash concrete koro"):**
- Outline smooth: contour-er 4 m staircase moving average (SW=3, SI=4) diye smooth kora, tarpor Douglas-Peucker TOL 1.5. Plot / building duitai smooth. Road-mask cell (earthwork) ekhon plot-independent obstacle (age ager pad-er upor nirbhor korto, tai oscillate korto).
- **Ash concrete apron:** `MALL_APRON = 16` m (MallSite.ts) plot edge theke road / rail-er dike, kintu `MALL_RED`-er baire na (MallSite.ts-e `MALL_RED` = user-er red polygon). `MallManager.buildApron()`: strip mesh, terrain-er upor shuye thake (`terrain.heightAt + 3 cm`), tai pahar-er dike-o kaj kore. Same ash colour (0xb4bcc6) plaza-r moto. ~70% jaigay puro 16 m, red-er edge-e kome jay (SW, min 3 m). Collider lage na (terrain collider-e hanta jay).
- NOT seen in a running game: apron-er z-fight / road shoulder-er shathe mel dekha dorkar. Jodi road porjonto gap thake: `MALL_APRON` baro (plot edge road theke ~19 m, tai 18 porjonto nirapod).
**Ager mall-er jaiga (x 13..160, z -175..-13):** ekhon khali (pad nei, MALL_POLY theke bad). Kono decision nei (B2 point 5): M3-te jiggesh kora hobe. Keepout ekhono bondho.
**M2/M3-er jonno jana dorkar:** MallBuilder zone layout (12 zone, 96 x 64 block) ekhon MALL_BUILDING_LOCAL (111,840 m2) onujayi; MALL_DOORS ekhon outline-er local z = 0 line-e (west side -1, east side +1, J1-er dik east). Spawn / parking / door crossing / depot sob ekhono purono jaigay (File list Part B-te).

## Part B2: proshno + uttor (M1-er por ekhono OPEN ja ja, nicher list)

**User-er uttor (14 Nov, M1):** "puro red area nite hobe, shudhu road ar rail theke 15/20 m buffer, parking ar onno facility-r jonno. Ei vabe place koro." => size (1) = puro red area minus buffer; shape (3) = red area-r bend follow kora. Baki (2, 4, 5, 6, 7) user ekhono bole ni; M1 e nijer matha theke je default dhorechi seta Part B4-e "ASSUMPTION" likha.

Mul proshno gulo:

1. **Size:** koto boro? (e.g. building outline koto m2 / block koto m, plaza koto)
2. **Floor:** uchu ongsho-e **kotota** uchu (m) ar **koyta dhap** (ek-dhap, na dhapey dhapey)? Dhap-er majhe ramp/seedhi lagbe kina? Mall-er bhitore floor-er level bodlale kon shop/zone kothay jabe (MallBuilder)?
3. **Shape:** laal boundary-r moto bend-ey bendh (road edge follow kora, ager moto 8+ corner) rakhbe, na sidha/ghorano rectangle (W arm ba S arm-er shathe parallel) korbe?
4. **Spawn ar start parking:** ager mall F4/F7-er kone-te, spawn-er pashe chhilo; notun jaiga spawn (7, -126) theke ~400 m dure. Spawn ar F4-er parking (MALL_LOT, APRON, EVLAB_LOT, FRONT_ROW, SIDE_LOT) kothay jabe? Spawn ager jaigay thakbe (mall-er door theke dure) na mall-er kachhe soraba? Notun mall-er parking ki alada lot hobe?
5. **Ager mall-er jaiga:** (x 13..160, z -175..-13) ekhon khali hoye jabe. Shetake ki kora hobe (khali, park, onno kichu)? Local street keepout (purono zone) ekhonkar moto bondho thakbe, na khule debe?
6. **Door:** koyta door, kon dike (J1-er dike, W arm-er dike, S arm-er dike)? Door-er samne zebra crossing (MedianPlan) kon road-e?
7. **J1-er ground zone:** J1 centre theke ~154 m porjonto road mask 1 hoy (EVLab step R0d-te dekha). Laal boundary-er purbo tip J1 centre theke ~40 m dure. Plot-ke J1 centre theke minimum koto m dure rakhbo (EVLab-er jonno 110 m chhilo)?

---

## Part C: Step prompts (ek ek kore, order-e)

### Step M0 (done)
Survey + jaiga decision (Part B, B3).

### Step M1: Site (plot, pad, keepout) - DONE (14 Nov), Part B4 dekho
```
Step M1: HANDOFF_CITYMALL_RELOCATION_BN.md-er Part B3 ar B2 dekho. Age B2-er OPEN proshno gulo jiggesh koro (ek message-e shob, tappable hole bhalo), uttor pele code shuru koro. Tarpor:
1. Laal boundary (B3 point 1) theke notun plot polygon (MALL_POLY) ber koro: road edge ar rail theke >= 10 m (parking-er ongsho-e 15-20 m, ami je size bolbo), J1 centre theke ami je doori bolbo. Headless script (scripts/mall-new-plot.ts, kichu bodlay na) diye dekhao: plot-er area, kothay somotol, kothay uchu (height contour), cut/fill.
2. MallSite.ts-e notun MALL_POLY / MALL_BUILDING / MALL_POS / MALL_DOORS, pad (somotol ongsho flat, uchu ongsho-e floor step), mallKeepout (notun plot + purono zone), contains/inside. Ghorano frame hole EVLabSite.ts-er moto localToWorld / worldToLocal.
3. TerrainGenerator-er mall pad ar eng-zones / evlab-site / fill / placements test-er MALL_PLOT reference update koro.
Test: mall-site test (plot flat, road >= 10 m, rail >= 10 m, J1 gap, arm overlap nei, keepout). Je test fail kore tar list dao.
```

### Step M2: Building + plaza
```
Step M2: MallBuilder / MallManager-e notun plot-e building outline, glass wall, plaza, stepped floor (B2 decision onujayi), entrance. mall-test update koro.
```

### Step M3: Parking, spawn, road link
```
Step M3: ParkingSite-er mall lot, entry road, start lot, spawn, Engine.ts west-door logic, MedianPlan zebra crossing, Jobs.ts depot, Roadside hedge notun jaigay milao. start-test, parking test update koro. Ager mall-er jaiga (B2 point 5 decision) shamlao.
```

### Step M4: Final check
```
Step M4: sob test chalao (npm run build, mall, start, parking, eng-zones). J1 arm ar mall-er majhe overlap nei, ta test-e dekhao.
```

---

## Done log
- **M1d (15 Nov, user screenshot: red line = City Mall line; "red mark line theke 5 m hobe walkway, tarpore city mall, red line er offset"):** Plot / building / pad / terrain / collider BODLAY NI. Ash concrete apron ekhon user-er red line porjonto jay, ar red line theke bhetore 5 m = **walkway** (halka pathor, `0xdcd6c8`), tarpor apron / mall.
  - **Red line code-e kemon:** screenshot theke exact coordinate neya jay ni (camera perspective, road uchu). Tai rule = red line road pavement + shoulder / rail edge theke `MALL_RED_GAP` = **6 m** (ASSUMED: 6 + 5 walkway = mall edge road theke 11 m = M1c-er 10-12 m). J1 junction (lane zone s 0..315 W + S arm, 26 m; corner kerb 54 m circle) ager apron-e miss hoto (`T.roads.roads`-e nei), ekhon obstacle. Screenshot-er sathe mele dekha (J1 centre + arm road edge diye overlay): dan dik (W arm) ar niche (S arm) red line-er ~5 m bhitore pore, slip-lane fillet-e notch (54 m circle), uttor / pashchim dik (camera perspective-e mapa jay ni) road-relative rule-i dhora.
  - **Notun file (pure, three nei):** `src/mall/MallBands.ts` `mallBands(T)`: plot outline ~3 m, outward normal, `wRed` (plot edge theke red line doori), `wApron` = `max(0, wRed - MALL_WALK)`, `hit` (road / rail-e thamlo kina; pahar-er dike road nei: `min(ww, MALL_APRON)` = 16 m ager moto). `MallSite.ts`: `MALL_WALK` = 5, `MALL_RED_GAP` = 6. `MallManager.buildApron()` ekhon `THREE.Group` (apron `0xb4bcc6` + walkway 2 cm uchu, polygonOffset), dispose traverse kore. `MALL_ROAD_GAP` / `MALL_APRON_MAX`-er logic MallManager-e nei (const rakha ache, `scripts/mall-apron-check.ts` PURONO M1c logic, ar kaje lagbe na: `mall-bands-check.ts` ta-i ekhon check).
  - **Headless number (`npm run test:mall-bands`, ALL OK):** 465 outline point, red line plot edge theke min 13 m / median 21 m / max 47 m, 426 point road / rail-e thame, baki pahar-er dik; walkway 5 m shobjay, 90 %+ jaygay full. `mall-site-test` ALL OK.
  - **NOT RUN:** `npm run build`, `scripts/mall-test.ts` (three nei), game-e dekha (walkway-er z-fight, uchu road embankment slope-er upor walkway, notch). Red line koto kache chay: `MALL_RED_GAP` (kom = red line road-er aro kache, apron / walkway chaura). Walkway-te lamp / bench / kerb nei, M3 (parking / road link) ar M2 (building) ager moto baki.
- **M1c (15 Nov, user: "samner shape red porjonto smooth baraw, road theke mall porjonto 10-12 m offset, ata terrain na, mall-er extra ongso (walking + parking)"):** Plot / building / pad / terrain BODLAY NI. Shudhu ash concrete apron (visual strip, physics nei) ekhon plot edge theke road / rail-er dike barey jotokkhon na road edge theke `MALL_ROAD_GAP` = 11 m thake (MallSite.ts, MALL_APRON_MAX 70). Road-er kache thakle purono red edge-er baire-o jay (user-er notun red line road dhore ache); road na thakle (pahar-er dik) ager 16 m. Smooth: width 6 bar average. Headless number (scripts/mall-apron-check.ts): apron 7.5 .. 40.4 m (ager 16 fixed), road / rail edge porjonto gap min 11.5, gorp 12.3 m. Changed: src/mall/MallSite.ts, src/mall/MallManager.ts; notun scripts/mall-apron-check.ts. PASS: mall-site-test ALL OK. NOT RUN: npm run build, scripts/mall-test.ts (three install nei), game-e dekha (user-er red line-er sathe mil, apron-er upor road embankment slope, z-fight). Jodi 10-12 m-er jaygay 11 bodlate chai: MALL_ROAD_GAP. Parking lane / ramp ekhono M3-te.
- **M1b (14 Nov):** smooth outline + ash concrete apron (MALL_APRON 16, MallManager.buildApron, MALL_RED). Changed: MallSite.ts, MallManager.ts, scripts/mall-new-plot.ts.
- **M1 (14 Nov):** site boshano. User: "puro red area, shudhu road/rail theke 15-20 m buffer". MALL_POLY 34 corner 124,843 m2, MALL_BUILDING 109,528 m2, MALL_POS (-433.9,-244.5) yaw -37.5, floorY 18.42 flat, BLEND 40, polygon keepout. Notun: scripts/mall-new-plot.ts, scripts/mall-site-test.ts. Changed: src/mall/MallSite.ts, src/terrain/TerrainGenerator.ts, scripts/mall-test.ts. Part B4.
- **Survey (14 Nov):** Part B. Code kichu bodlay ni. Notun file: `scripts/mall-reloc-search.ts` (headless search, kichu bodlay na).
- **M0 (14 Nov):** user jaiga bachlo (Part B3: J1-er pashchim, W arm ar S arm-er majhe). Offset 10 m (parking-er jonno 15-20 m), mall boro, flat + pahar-er dike uchu floor. Open proshno B2-te.
