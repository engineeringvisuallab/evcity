# HANDOFF: EVLab ghurano (90 deg CCW) + notun garden + lekha + clock (steps RT1..RT6)

Notun chat-e eee.zip (full repo) attach kore "Part A" paste koro. Tarpor ek chat-e ek step, "Part C" theke.
Ei file HANDOFF_EVLAB_RELOCATION_BN.md-er "Step R6x (PLAN)" ke **replace kore** (R6x-er plan ar user-er notun order mile na). Step naam RT1..RT6, jate purano R-step (R0..R6) er shathe na mishe.

**Ekhon porjonto: RT0 done (hisab), RT1 done (15 Nov: in-place 90 deg CCW, yaw -52.5). RT2 done (ager garden bad), RT3 done (paharer pashe garden, plot-er bhitore), RT4 done (paharer slope + uporer palm, plot-er baire). RT5 done (tower-er 4 facade-e lekha). RT6 done (real-time clock + Settings-e country). RT7 done (15 Nov: W arm theke 5 m walking path). NEXT: shudhu gate road / parking strip final shape (R3b / R4b), alada chat-e. Test obostha ar open kaj: Done log "RT1" / "RT2".**

---

## Part A: Context (prothom message-e paste koro)

```
Ami evcity game-er EVLab campus-er kaj korchi. Project eee.zip attach korlam.
Ami Banglish e likhi, tumio Banglish e uttor dao.

Niyom:
- Prottek step-er shesh-e DUTO zip dao: (1) pura changed project zip (exe thakle exe soho), (2) shudhu changed file-er choto zip (repo-r path soho).
- Zip dewar por tarpor next step. Ek chat-e ek step.
- Prottek change-er por HANDOFF (HANDOFF_EVLAB_ROTATE_BN.md-er Done log) update koro, jate keu (dev ba AI) pore bujhe kaj chalate pare.
- Kaj shuru korar age HANDOFF_EVLAB_ROTATE_BN.md, HANDOFF_EVLAB_RELOCATION_BN.md (shesh section Step R0d) ar HANDOFF_EVLAB.md pore nao.
- Locator niyom: world <-> local ekmatro EVLabSite.localToWorld / worldToLocal diye. Hat diye offset jog korbe na.

Ki chai: EVLab campus 90 deg anticlockwise ghurabo (position-o sarbe, 2 road theke 5 m offset), ager garden bad, notun garden
shudhu paharer pashe (ar paharer uporeo), char dike boro lekha, char dike real-time clock (setting theke country).
```

---

## Part B: User-er decision (data; na pochondo hole age jiggesh koro)

1. **Rotate:** pura EVLab campus (tower, lake, island, parking, gate road, fountain, bench, cyclist path, sob) ekta unit hishebe **90 deg anticlockwise** ghurbe. Screen-e (top view, uttor upore) dekhe anticlockwise.
2. **UPDATED 15 Nov (user, RT0-er por): ONLY ROTATE, position sarbe na.** EVLab ekhon jei position-e ache (plot centre (-140, -620)), sei position-e shudhu 90 deg CCW ghurbe. 2 road theke 5 m offset ar position soranor kaj **bad** (RT0 dekhiyechhe duto road theke ek-sathe 5 m shombhob na, J1 junction-e pore). Road-er 5 m walking path pore alada kaj hishebe asbe, jodi lage.
3. **Kon 2 road:** image-e (user-er 15 Nov screenshot) EVLab-er **pashchim-e** uttor-dokkhin road (J1 S arm-er moto khara road) ar **dokkhin-e** purbo-pashchim road (W arm / E-W road). Duto road-er edge (pavement edge) theke 5 m.
4. **Ager (puron) garden: bad.** Notun garden = **shudhu paharer pashe boro garden** + **paharer uporeo kichu**. Shudhu **boro narikel gach (coconut), palm gach, khejur gach (date palm)**. Onno kono gach/jhop/bush na.
5. **Lekha:** campus-er **char dike** boro boro lekha: **"Engineering Visual Lab EVLab"**.
6. **Clock:** char dike **real-time clock**. Time **setting theke jekono country-r** select kora jabe (timezone).
7. **Road kichu bodlabe na** (J1 arm, ring, M8, sob). Pahar kata ba bari-er bhitore pora = problem na. Mall-er shathe overlap thakbe na.
8. Ek bare shob kora jabe na, tai step-wise (RT1..RT6).

### OPEN proshno (RT-er age user-ke jiggesh koro, nijer matha theke dhorbe na)
- **O1 (ANSWERED 15 Nov: code-er jaiga (-140,-620) thik, ei jaygay-i only rotate):** user-er image-e EVLab proay (-100, -350) (HUD X -334, Z -336), kintu zip-er code-e EVLab plot centre (-140, -620), building origin (-121.7, -643.8), yaw 37.5 (R0d). Image purano build-er hote pare. **Image-er build, na code-er jaiga?**
- **O2 (ANSWERED 15 Nov: 5 m walking path. Mane pavement edge -> 5 m walking path -> lake. 10 m garden ager bad):** purbe user bolechhilo "road theke 5 m offset, tarpor 10 m choto-height garden, tarpor lake". Pore bolechhe "ager garden bad, notun garden shudhu paharer pashe". **Road ar lake-er majhe ki thakbe?** (5 m faka jomi / kichu na / path)
- **O3:** garden-er gach gulo **paharer pashe** (campus-er je side-e pahar) shudhu, baki 3 side-e lake-er pashe kichu thakbe na, ei dhorbo?
- **O4:** paharer **uporer** gach koto ghono, ar pahar-er kon slope-e (shesh ar steep ongsho-e gach boshano jay na)?
- **O5 (ASSUMED 15 Nov, RT5: user uttor dey ni, "step start" bolechhilo, AI-er suggestion dhora hoyechhe; bodlate chaile RT5 abar kholo):** tower-er 4 facade-e, levels 3..13, capital 6.5..16 m. Ager proshno: lekha 4 dike: kon jinis-er upor (tower-er 4 facade, na lake-er dhar-e boro sign wall, na jomi-te boro letter)? Height koto?
- **O6 (ASSUMED 15 Nov, RT6: user bolechhe "tumi tomar moto sob gula kore felo", AI-er suggestion dhora hoyechhe; bodlate chaile RT6 abar kholo):** analog dial + niche digital HH:MM:SS, tower-er 4 facade-e (levels 17..20), default Bangladesh. Ager proshno: clock 4 dike: tower-er 4 facade-e boro dial, na 4 ta clock pillar? Analog na digital? Default country ki?

---

## Part B2: Code-e ki ki ache (ami porechhi, 15 Nov zip)

- **Frame:** `EVLabSite.ts`: `EVLAB_YAW` (37.5 deg), `EVLAB_POS` {x -140, z -620, yaw} = plot centre world, `EVLAB_ORIGIN` = building origin world (-121.74, -643.80), `localToWorld`/`worldToLocal`, `EVLAB_PLOT` (local x -180..180, z -120..180), `EVLAB_PARKING_STRIP` (x 180..220), `EVLAB_FENCE` (4 ta world corner), `EVLAB_PLOT_AABB`, `insideFence`, `EVLAB_GATE_ROADS` (W + E, local + world pts), `EVLabSite` class (`toWorld`, `toLocal`, `height`, `inside`, `outside`, `near`), `evlabKeepout`, pad (plot + strip + gate road strip, ROAD_FLAT 14 m, BLEND 48 m).
- **Campus (local):** `EVLabCampus.ts`: `ISLAND` (cz 20, hx 125, hz 105), `LAKE` (25 m band, cz 32.5, hx 150, hz 117.5, r 75), `RING`, `BRIDGES` (S, W, E), `PLAZA`, `FOUNTAINS`, `parkTrees`. `EVLabGrounds.ts` (link roads, W gate road ribbon), `EVLabBridges.ts`, `EVLabBenches.ts`, `EVLabLakeWater.ts`, `EVLabParkTrees.ts` (chunk filter, REACH 215, `localToWorld`), `EVLabParking.ts` / `EVLabParkingLot.ts` / `EVLabArrivalPath.ts`, `EVLabCyclistPath.ts` (`AVENUE.z0` 150, R4b-te 180 hobe), `EVLabManager.ts` (building group: position (ox, floorY, oz), `rotation.y = -yaw`; Rapier fixed body + lift cab).
- **Building:** `EVLabLayout.ts` `BLD` hx 88, hz 58, H 17; `EVLabFacade.ts`, `EVLabTowerView.ts`, `EVLabTowerTextures.ts` (lekha/clock-er jonno texture), `EVLabShell.ts`. Spire 442 m.
- **World:** `TerrainGenerator.ts` (pad, floorY = plot-er 17x17 grid median), `MissionData.ts` (presenter place), `LocalRoads.ts` (`evlabKeepout`), J1: `src/roads/junction/J1ArmData.ts` (J1 (-87,-277), arm direction N (0.609,-0.793), E (0.793,0.609), S (-0.609,0.793), W (-0.793,-0.609), pavement 44.2 m, 22.1 m protidike).
- **Settings:** `src/ui/SettingsMenu.ts`, `src/ui/HudSettings.ts` (clock-er country select ekhane), `src/environment/DayNight.ts` (game-er din-raat, real-time clock-er shathe alada, mishabe na).
- **Test script:** `scripts/evlab-*.ts` (site, parking, benches, cyclists, arrivals, lake, fountains, sitters, audience, structure, tower, cycle), `scripts/start-test.ts`, `scripts/eng-zones-test.ts`, `scripts/mission-test.ts`. Known pre-existing FAIL: `evlab-fountains-test` 3, `eng-zones-test` 4 (original-eo ache), `evlab-site-test` 2 (R0d OPEN: plot flat 2.62 m, strip 2.58 m, J1 ground zone). Ager sandbox-e three/rapier nei, tai onek test + `npm run build` ager chat-e chalano jay ni: user-er machine-e chalate bolo.

---

## Part C: Step prompts (ek ek kore, order-e)

### Step RT0: Size/jaiga thik kora (code na)
```
Step RT0: HANDOFF_EVLAB_ROTATE_BN.md-er Part B-er OPEN proshno O1..O6 ami uttor dichchhi. Tarpor headless script-e (three nei) hisab koro: 90 deg CCW ghurale plot-er ar building + lake-er footprint kothay porbe, 2 road (O1 onujayi kon duto) theke 5 m offset-e koto sorate hobe, cut/fill, J1 ground zone (~154 m), rail >= 50 m, mall plot overlap, bari overlap list. Ekhono kono game code lekhbe na. Result user ke dekhao.
```

### Step RT1 (DONE 15 Nov, in place): Ghurano
```
Step RT1: RT0-er hisab onujayi EVLAB_YAW 90 deg CCW ghurao (37.5 -> -52.5), EVLAB_POS ager-ei (position soranor kaj nei, offset nei). Shob jaygay localToWorld/worldToLocal. EVLabSite (plot, fence, pad, keepout, gate road), TerrainGenerator pad/floorY, EVLabManager (group rotation, Rapier body, lift cab), EVLabParkTrees chunk filter, MissionData, Engine faceSouth, EVLabCyclistPath (AVENUE), evlab-site-test + baki test update. Gate road ar parking strip notun dik-e (road-er shathe mile). Shudhu notun ghurano, notun garden/lekha/clock ekhon na.
```

### Step RT2 (DONE 15 Nov): Ager garden bad
```
Step RT2: Ager (puron) garden, park tree, bagan, small tree shob bad (EVLabParkTrees.ts, EVLabCampus parkTrees, R5_WIP.patch-er BACK garden: apply koro na). Ekhon lake-er pashe kono garden thakbe na. Perf: tree count komle PERFORMANCE_RULES.md onujayi. Test update.
```

### Step RT3 (DONE 15 Nov, plot-er bhitore flat jaygay): Paharer pashe boro garden
```
Step RT3: Shudhu paharer pashe (campus-er je side-e pahar) boro garden. Gach shudhu boro narikel, palm, khejur. Notun mesh/model (instanced, PERFORMANCE_RULES.md mene), flat jomi + pahar slope-er upor, gach slope-er upor thik joto (terrain height diye). Collision gach-e (age park tree-er moto).
```

### Step RT4 (DONE 15 Nov): Paharer uporeo gach
```
Step RT4: Paharer uporeo (slope-er upor, steep na hole) kichu narikel/palm/khejur gach. Ghonotto O4-er uttor onujayi. Chunk filter, perf check.
```

### Step RT5 (DONE 15 Nov): Char dike boro lekha
```
Step RT5: Campus-er char dike boro boro lekha "Engineering Visual Lab EVLab" (O5-er uttor onujayi jaiga/height). Texture ba extruded text, notun font lagle offline-e embed koro (network nei). Raat-e dekha jay emon material (emissive halka), perf check.
```

### Step RT6 (DONE 15 Nov): Real-time clock + country setting
```
Step RT6: Char dike real-time clock (O6 onujayi). Time = Intl.DateTimeFormat + timeZone (IANA zone), sekonde-e update (canvas texture update ek-i texture, 4 clock share kore, per-frame na). SettingsMenu.ts / HudSettings.ts-e country (timezone) select, default O6, localStorage-e save. DayNight.ts-er game time-er shathe mishabe na. Test: timezone offset logic (headless).
```

---

## Done log
- (15 Nov) Plan toiri, kono code na.
- **Step RT0 (done, 15 Nov, hisab, game code bodlay ni):** `scripts/evlab-rt0-rotate.ts` (`npx tsx scripts/evlab-rt0-rotate.ts`). Dhorechhi: footprint = lake outer + 5 m path + car park (local x -155..195, z -90..155); notun yaw = 37.5 - 90 = **-52.5 deg**; tokhon local +x = J1 **N** arm direction, local +z (gate/south) = J1 **E** arm direction, local -z = W arm direction. Pavement half 22.1 m; "5 m" = pavement edge theke 5 m walking path, tarpor lake.
  - Ekhon (yaw 37.5): lake theke arm pavement edge: N 79 m, W 98 m, J1 128 m, cut 0.37 Mm3, relief 60 m.
  - Ghure ek-i jaygay (yaw -52.5, origin (-121.74, -643.80)): N 79, W 98, J1 150 m, cut 0.40 Mm3, relief 55 m. **Pahar (ucchu kone) local (193, -90) = parking kone, mane campus-er W-arm-er dike + N-arm-er dike pichone.**
  - **Dui road-er theke 5 m ek-sathe SHOMBHOB NA:** W arm ar N arm 90 deg-e J1-te mishe; duto-r theke 5 m dile campus-er kone J1 junction-er (~38 m kache) upor pore. J1 box >= 110 m niyom (R0b) rakhle shobcheye kache: N 19 m + W 88 m (origin (-80,-600), cut 0.21 Mm3), ba N 82 m + W 40 m (origin (-160,-600), cut 0.26 Mm3).
  - **Ek road-e ~5 m:** N arm ~5 m (origin (-40,-640)..(-20,-660), W arm 144-173 m dure, cut 0.32-0.38 Mm3, J1 164-191 m); W arm ~12 m (origin (-420,-300), cut 0.01 Mm3, relief 2 m, kintu W arm-er pashchim, **City Mall relocation plot-er shathe overlap check kora hoy ni**, J1 123 m).
  - **OPEN 1 (user decision):** 5 m kon road theke? (a) N arm-e 5 m, W arm-e jotota J1 box dey, (b) W arm-e 5 m, N arm-e jotota dey, (c) dui-ta-i ~(N 19 + W 88) ba (N 82 + W 40) kono ekta.
  - **OPEN 2 (mismatch):** user-er image-e EVLab-er **pashchime** N-S road ar **dokkhine** E-W road (camera J1 yaw-e ghora, tai N arm upor-dike, E arm dan-dike): mane EVLab **N arm ar E arm-er majhe (NE wedge)**. Code-er EVLab **N arm ar W arm-er majhe (NW wedge)** (purbe N arm, dokkhine W arm). User bolechhe code-er jaiga thik, kintu 2 road-er dik image-er sathe mile na. Ager jiggesh koro: kon wedge-e rakhbe?
  - Ei hisab shudhu jomi-r uchchota (12 m grid, plot + strip), pad blend ar pahar slope alada.
- **Step RT1 (done, 15 Nov): campus 90 deg CCW ghurano, ager-ei jaygay (plot centre (-140, -620) fixed).** User decision: "evlab akhon jei position-e ase sei position-e only rotate".
  - `src/evlab/EVLabSite.ts`: `EVLAB_YAW` 37.5 -> **-52.5 deg** (37.5 - 90). Baki shob (`EVLAB_POS`, `EVLAB_ORIGIN`, `localToWorld`/`worldToLocal`, fence, pad, keepout, EVLabManager group rotation, Engine `faceSouth`, EVLabParkTrees, TerrainGenerator floorY) ager-er moto yaw theke hisab hoy, tai arekta-o line bodlate hoyni. Plot centre fixed, **building origin sore** (-121.7, -643.8) -> **(-163.8, -638.3)** (plot centre theke local 30 m "north"). Local axes ekhon: **+x = J1 N arm direction, +z (gate / south) = J1 E arm direction, -z (pahar side) = J1 W arm direction**. Plot rectangle (local x -180..180, z -120..180) + parking strip (x 180..220) local number ager-ei.
  - `scripts/evlab-site-test.ts`: yaw check -52.5, frame check (+x = N arm, +z = E arm), parallel check, arm gap limit 60 -> **55** (ekhon 59.8 m, ager 71 m: ghure plot-er je dhar arm-er dike ache sheta ekhon gobhir), mall overlap test **MALL_POLY** diye (age MALL_PLOT bounding box chhilo, diagonal strip-e false hit dito; asol polygon-e overlap 0, nearest mall vertex 103 m).
  - Test: `evlab-site-test` 1 FAIL (**"plot flat" 2.73 m**, R0d-er open: J1 ground zone, ager 2.62 m), `evlab-benches-test` ALL OK, `mission-test` ok, `start-test` 1 FAIL (**original zip-eo ache**: mall door vs start lot, mall relocation-er karone), `eng-zones-test` 4 FAIL (original-eo). Plot -> J1 centre 117 m (>= 110 OK), parking strip -> arm 101 m, rail 274 m. `npm run build` ar three-er test gulo (`evlab-parking`, `-arrivals`, `-cycle`, `-cyclists`, `-sitters`, `-lake`, `-fountains`, `-structure`, `-tower`) ei sandbox-e (three/rapier nei) chalano jay ni: **tomar machine-e chalao**.
  - **Open (pore):** (1) E gate road / parking strip ager-er moto local jaygay (PROVISIONAL, arm porjonto jay na, R3b/R4b); ghurar por parking strip ekhon N arm direction-er dike, gate (south) E arm direction-er dike. (2) Pahar ekhon campus-er local x +193 / z -90 kone (parking kone), mane W-arm-er dike (-z) + N arm direction (+x) pichone: RT3/RT4 garden-er jaiga. (3) Image-er EVLab (N arm-er purbe, E arm-er uttore) ar code-er EVLab (N arm-er pashchime, W arm-er uttore) alada wedge-e. User code-er jaiga bolechhe, tai ei-ta-i thik dhora holo.
- **Step RT2 (done, 15 Nov): ager garden bad.**
  - Ager garden = `parkTrees()` (`EVLabCampus.ts`, 148 ta gach: ring road + island shore + lake bank palm row, plaza debdaru, island / bank lawn tree) jeta `EVLabParkTrees.evlabParkTreesInChunk` diye `TreePlacement.ts` (line ~456) game-er normal gach hishebe boshto.
  - `EVLabCampus.ts`: notun `export const OLD_GARDEN = false`. `EVLabParkTrees.ts`: `OLD_GARDEN` false hole `evlabParkTreesInChunk` shob chunk-e `[]` dey, tai game-e ei 148 ta gach ar boshe na. **`parkTrees()` list ta ekhono ache (kintu kono gach draw hoy na)**: karon `EVLabBenches` (bench jaiga), cyclist route ar tader test eta diye gach avoid kore; list muchle bench-er jaiga bodle jeto. Eta RT3-e notun garden-er infra hishebe kaj-e lagbe (ba pore shoriye dewa jabe, jodi bench layout bodlano thik hoy).
  - Grass/lawn mesh alada kono garden `EVLabGrounds` / `EVLabCampus`-e nei (grep: lawn/hedge/flower/bush/shrub kichu na), tai ar kichu soranor nei. Natural terrain-er gach plot-er pad-e age-i bondho. R5_WIP.patch-er BACK garden **apply kora hoy ni** (apply korbe na).
  - Test: `scripts/evlab-benches-test.ts`-e notun check (7): campus-er chardike chunk scan kore 0 park tree (`OLD_GARDEN` true korle 148 FAIL dekhay, check kora). `evlab-benches-test` ALL OK. `evlab-site-test` 1 FAIL (plot flat 2.73 m, RT1-er open, ager-er moto). `npm run build` ar three-er test (parking, cyclists) ei sandbox-e chalano jay ni: tomar machine-e chalao.
  - Dekhte: game-e campus-er lake / island / ring-er dhare ar plaza-te ar kono gach thakbe na. Eta ei step-er ashol uddessho.
- **Step RT3 (done, 15 Nov): paharer pashe notun garden (shudhu plot-er bhitore, flat pad-e).**
  - Pahar kon dike (headless mepe dekha, natural ground - floorY, campus local frame): **local -z (uttor, lake-er pichone) ar local +x (purbo, parking-er uttore)**: 15 m baire 4.6 m uchu, 30 m-e 23 m, 50 m-e 48 m. Local +z (south) ar local -x (west) flat (3 m-er moddhe). Mane pahar ekhon J1 W arm direction (-z) ar N arm direction (+x) pichone.
  - Notun file `src/evlab/EVLabGarden.ts`: `gardenTrees()` (deterministic, **197 ta**), `GARDEN_BANDS` (north: x -177..177, z -117..-91; east: x 152..177, z -117..-8, fence theke 3 m bhitore, lake + 6 m bank, parking zone + 6 m, bridge / link road + 6 m kata), `GARDEN_KINDS` = coconut 11, date palm 12, palm (palmyra) 13 **chhara kichu na**, `GARDEN_MIN_GAP` 5 m, scale 1.0..1.5 (pahar-er dike boro), 7 m jittered grid. Notun gach / mesh toiri hoy ni: `EVLabParkTrees.evlabParkTreesInChunk` `[...(OLD_GARDEN ? parkTrees() : []), ...gardenTrees()]` ke game-er normal gach hishebe (collider, LOD, climbing shoho) chunk-e dey. `REACH` 215 -> 225.
  - Test `scripts/evlab-garden-test.ts` (notun, ALL OK): 3 kind-i, shob gach band-er bhitore, fence-er bhitore, lake / parking / bridge theke dure, 5 m gap, gach-er niche jomi floorY (0.00 m off), chunk planting = ekdom ei gach, old list planted na. `evlab-benches-test` ALL OK (check (7) ekhon: planted == garden). `evlab-site-test` 1 FAIL (plot flat 2.73 m, RT1-er open).
  - **Shimana:** garden shudhu flat plot-er bhitore (uttor band 27 m gobhir, purbo band 25 m). Fence-er baire pahar-er slope RT4. Gach-er height tree kind-er nijoshwo model, mathay chhoto na (user ager "small height garden" bolechhilo, pore "boro gach" bolechhe: boro-i dhorechhi, jodi chhoto chay scale bodlano jay).
  - Tomar machine-e dekho: `npm run build` + game-e campus-er uttor + purbo dike palm-er saar. Dekhar jinis: gach gulo lake-er pichone, tower-er pichone na, parking lot-er uttore, flat jomi-te; collision / perf (chunk-e ~200 gach).
- **Step RT4 (done, 15 Nov): pahar-er slope ar uporer palm (plot-er baire).**
  - Notun file `src/evlab/EVLabHill.ts`: `evlabHillTreesInChunk(floorY, ox, oz, size, ground)`. Chunk-er world-aligned 10 m jittered grid (`HILL_CELL`), tai chunk grid-er upor nirbhor kore na (test: 4 quarter = pura square). Jaiga: plot + car park strip-er **hill side (local -z uttor, local +x purbo)**-e, fence theke `HILL_MIN_OUT` 6 m .. `HILL_REACH` 250 m baire. Shudhu **asol** (natural) jomi-te: floor-er cheye >= `HILL_MIN_REL` 2 m uchu, slope <= `HILL_MAX_SLOPE` 0.45 (steep jaygay palm boshe na, shekhane ager natural forest-i thake). `HILL_TOP` 40 m-er upor = pahar-er matha, ghono (`HILL_P_TOP` 0.32), nichu slope-e komm (`HILL_P_SLOPE` 0.16), duto-i clump noise diye grove-er moto. Shudhu coconut / date palm / palm, scale 1.0..1.45.
  - `src/vegetation/TreePlacement.ts` `place()`: `evlabHillTreesInChunk` call, ground = `gen.sample` (h + slope), `ok` = `!nearRoad && cityFactor >= 0.999 && !waterNear(6)` (nearRoad-e rail corridor, port, airport, road shob ache). Foot height `footY` (ager gach-er moto). Notun mesh na.
  - Test `scripts/evlab-hill-test.ts` (ALL OK): 271 palm (slope-e 64, pahar-er matha-e 207) natural terrain-e (game-e road / rail / water bad jaoar por kom hobe), shudhu 3 kind, hill side, fence-er baire, slope <= 0.45, chunk-independent, deterministic, ok=false hole 0. `evlab-garden-test`, `evlab-benches-test` ALL OK. `evlab-site-test` 1 FAIL (plot flat, RT1-er open).
  - **Shimana / jante rakho:** (1) palm gulo natural forest-er shathe overlap korte pare (natural gach-er shathe dedupe kora hoy ni, tai ghona jaygay palm + forest tree mishe thakbe). (2) `ok` callback-er test sandbox-e (three nei) chalano jay ni, shudhu `place()` bhitor-e. Tomar machine-e `npm run build` ar game-e pahar-er upor-er palm dekho (perf: ~270 + 197 palm). (3) Jodi pahar-er upor beshi / kom chao: `HILL_P_TOP` / `HILL_P_SLOPE` bodlao.
- **Step RT5 (done, 15 Nov): tower-er 4 facade-e boro lekha "ENGINEERING VISUAL LAB / EVLab".**
  - **Decision (ASSUMED, user O5-er uttor dey ni, AI-er suggestion A):** tower-er 4 facade (S, N, E, W), levels **3..13** (y 27.4 .. 73.6 m, podium roof-er upore, prothom sky-garden set-back (level 15)-er niche, jekhane tower shobcheye chaura). Ground sign wall / jomi-te letter **kora hoy ni**. Existing south logo (level 34, 44 x 11 m) ager-ei, bodlay ni.
  - **Layout:** E / W (50 m-er moto chaura): 3 line `ENGINEERING` 7.5 m / `VISUAL LAB` 7.5 m / `EVLab` 13 m (sonali), condensed (squeeze 0.62). N / S (107 m chaura): 2 line `ENGINEERING VISUAL LAB` 6.5 m / `EVLab` 16 m. Letter cream + gold, gaye dark outline. Text lekha-r fixed 1024 px canvas, `measureText` diye na mille choto hoy (cut hoy na).
  - **Notun file (pure):** `src/evlab/EVLabLettersPlan.ts` (`LETTER_BAND`, `LAYOUTS`, `FACE_LAYOUT`, `letterQuads()` = prottek level + face-er ekta quad, glass wall-er sathe sathe (facade leans 0.18 m, tai strip level by level follow kore), `LETTER_OFFSET` 0.55 m glass-er samne (slab ledge 0.405 m). u = face-er majhkhan theke dane-ke baraye (S +x, N -x, E -z, W +z), tai kono face-e ulta na.
  - **Notun file (three):** `src/evlab/EVLabLetters.ts` `buildTowerLetters(P)`: 2 transparent canvas texture (side, wide), 2 mesh (44 quad = 88 triangle), `MeshBasicMaterial` (unlit sign: raat-e-o dekha jay), alphaTest 0.4, castShadow false, `setNight(k)` shudhu din-e halka dim (0.82 -> 1.0).
  - **Hook:** `EVLabFacade.ts` (3 jaygay: import, `g.add(letters.group)` logo-r pore, `setNight`-e `letters.setNight`). Facade group building group-er bhitore, tai yaw (-52.5) niye ghure, kono world offset nei. South face local +z = J1 E arm direction (test-e check).
  - **Test:** `scripts/evlab-letters-test.ts` (notun, ALL OK): band level range, 44 quad, text block band-er bhitore, line width texture-er bhitore, texture width glass-er shortest straight segment-er bhitore (54 <= 55.3, 96 <= 107.2), outward normal, **mirror na** (u dan-e baray, 1 m = 1 m), centred, ledge-er samne, south face J1 E arm direction-e. `package.json`: `test:evlab-letters`. Ei sandbox-e `three` nei, tai test ekta temporary stub `three` diye chalano (repo-te rakha hoy ni). `evlab-site-test` 1 FAIL (plot flat 2.73 m, RT1-er open, ager-ei), `evlab-garden-test` ALL OK. `npm run build`, `npm run typecheck` ar canvas text drawing (font, size, outline) **ei sandbox-e chalano jay ni: user-er machine-e dekho**.
  - **Load-er upor prabhab: kom.** Notun draw call 2, triangle 88, texture 2 (1024 x 876 ar 1024 x 493), per-frame kaj nei, light / shadow nei. Low tier-e alada kom kora hoy ni (shamanno).
  - **Dekhar jinis (machine-e):** (1) tower-er 4 dike lekha thik porha jay (ulta na) ar glass-er shathe lege ache; (2) font fallback (`Arial Black`/Arial) e letter cut hoy ni; (3) lake-er dhar theke 100-150 m dure theke parha jay; (4) raat-e ar din-e dhokhe na. Jodi lekha choto mone hoy: `LAYOUTS` cap / `LETTER_BAND` (level 2..14) bodlano jay; boro korte hole E / W-te ar jaiga nei (straight glass 55 m), tokhon ground sign wall (option B) alada step.
- **Step RT6 (done, 15 Nov): tower-er 4 facade-e real-time clock + Settings-e country.**
  - **Decision (ASSUMED, user O6-er uttor dey ni):** analog dial (12 numeral, 60 tick, hour / minute kalo, second lal) + niche digital `HH:MM:SS` (sonali). Tower-er 4 facade (S, E, N, W), levels **17..20** (y 86.2 .. 103 m): prothom set-back (15)-er upore, lekha (RT5, levels 3..13)-er upore, porer set-back (30)-er niche. Alada pillar **kora hoy ni** (notun mesh lagto). Default country **Bangladesh** (Asia/Dhaka).
  - **Real time:** `Date.now()` + `Intl.DateTimeFormat` (IANA zone), tai summer time (DST) date onujayi nije bodle (UK 29 Mar, New York, Sydney test-e dekha). **DayNight.ts / game hours-er shathe kono mil nei** (test-e clock source file-e `DayNight` / `hours` nei check kora).
  - **Notun file (pure):** `src/evlab/EVLabClockZones.ts` (`COUNTRIES` 62 ta, Bangladesh prothom, baki A..Z; `countryOf(code)` ojana code = Bangladesh; `clockTime(zone, ms)`, `utcOffsetMin`, `digital`, `handAngles`; ekadhik zone-er deshe rajdhani-r zone: US = New_York, CA = Toronto, RU = Moscow, BR = Sao_Paulo, AU = Sydney, CN = Shanghai, IN = Kolkata, ID = Jakarta), `src/evlab/EVLabClockPlan.ts` (`CLOCK_BAND`, `CLOCK_W` 20 m, `DIAL`, `DIGITAL`, `clockQuads()`).
  - **Notun file (three):** `src/evlab/EVLabClock.ts` `buildTowerClock(P)`: **1 ta canvas texture (1024 x 860) 4 clock share kore**, 1 mesh (16 quad = 32 triangle), dial / tick / numeral ekbar alada canvas-e anka, **prottek sekonde-e (frame-e na) ekbar** hat + digital abar anka, country bodlale sathe sathe. `MeshBasicMaterial` (sign), alphaTest, castShadow false. `tick(nowMs)`, `setCountry(code)`, `setNight(k)`.
  - **Refactor:** `EVLabLettersPlan.ts`-e `bandQuads(n0, n1, widthOf, offset)` (RT5-er `letterQuads()` ekhon eta-i call kore, RT5 test ager-ei ALL OK). Clock ar lekha ek-i method-e glass-er shathe lege thake.
  - **Hook:** `EVLabFacade.ts` (`buildTowerClock`, `update` e `clock.tick(Date.now())`, `FacadeBuild.setClockCountry`, `setNight`), `EVLabManager.ts` `setClockCountry(code)`, `Engine.ts` `applyHudOptions` e `this.evlab?.setClockCountry(v.clockCountry)`.
  - **Settings:** `HudSettings.ts` notun `clockCountry` (default `'BD'`, `evcity.settings` localStorage-e save, bhul / ojana code = BD, purano save (country chhara) o load hoy). `SettingsMenu.ts` notun section "EVLab টাওয়ার ঘড়ি (দেশ)": ekta `<select>` (country + UTC offset), `change` -> `store.set('clockCountry', ...)`. `EVLabTowerView.ts`: `G` key-r check-e `SELECT` (select-e likhle lift call na hoy).
  - **Test:** `scripts/evlab-clock-test.ts` (notun, ALL OK, 38 check): country list (unique, valid IANA, sorted), 9 deshe 12:00 UTC-er shomoy (BD 18:00, IN 17:30, NP 17:45, JP 21:00, US 07:00, AU 23:00 ...), offset / summer time, midnight 23:59:59 -> 00:00:00, hat-er angle, clock 4 face-e (above set-back, lekha-r upore, glass-er bhitore, ulta na), DayNight use kore na, HudSettings default / bhul code / save. `package.json`: `test:evlab-clock`. **Ad-hoc smoke (repo-te nei):** fake canvas diye `buildTowerClock` chalano: ek sekonde-e 3 bar tick = 1 bar anka, porer sekonde = 1, country bodlale = 1, bhul code = Bangladesh. Ager test: `evlab-letters-test`, `evlab-garden-test`, `evlab-hill-test` ALL OK, `mission-test` ok, `evlab-site-test` 1 FAIL (plot flat 2.73 m, RT1-er open, ager-ei).
  - **Ei sandbox-e chalano jay ni (user-er machine-e):** `npm run build`, `npm run typecheck`, game-e real canvas (font, dial, hat, digital ekdom thik porha jay kina), Settings menu-e select (UI, Bangla text, dropdown theme-e dekhte thik kina).
  - **Load-er upor prabhab: kom.** Notun draw call 1, triangle 32, texture 1 (1024 x 860, 4 clock share), 1 sekonde-e ekbar canvas anka (~1024 x 860, per-frame na), light / shadow nei, Settings-e ekta select (DOM ekbar toiri). Quality preset / Perf overlay (F2)-e alada setting dorkar nei (eta performance setting na, display-er pochondo). Browser-e FPS mapa hoy ni.
- **Step RT7 (done, 15 Nov): W arm theke campus porjonto 5 m choura walking path (user: "tumi tomar moto koro", road-er choice AI-er).**
  - **Kon road: W arm (N arm na).** Karon RT0-er "N 79 / W 98" number puron J1 position-er chhilo (script-e J1 (-87,-277) hard-coded). Ekhon-kar `J1ArmData` diye (campus position fixed, yaw -52.5): fence theke arm pavement edge **W 38 m, N 79 m**; lake theke **W 68 m, N 109 m** (`evlab-rt0-rotate.ts` abar chalale-o W 68 / N 109 ashe, handoff-er RT0 line-er ulta). Tai W arm-i kache, ar W bridge + W gate road-o sei dike. N arm local z ~281-e campus-er dokkhin-e 100 m dure.
  - **Ki toiri:** `EVLabSite.ts`: `EVLAB_WALK_PATH` (`WALK_WIDTH` 5, `WALK_ARM_EDGE` 24.2 = gate road-er moto verge edge, `WALK_Z` 37.5, `makeWalkPath()`). Straight local -x dike (turned frame), W arm axis (`J1ArmData` 'J1-W'-er prothom duto point, lane zone-e pechone barano) theke 24.2 m (campus-er dike) theke W bridge landing (local x -156) porjonto, **59.7 m**, 5 m ontor ontor point. Path **W gate road-er uttor dike** (local -z), gate road edge theke 0.5 m faka (gate road halfWidth 8, z 48.5). `contains()` (gach / pathor nei) ar `evlabKeepout()` (local street nei) path-ke dhore, BOX-e path point jog kora.
  - `EVLabGrounds.ts`: path ribbon (`roadStrip`, halka pathor texture `t.stone`, polygonOffset gate road-er upore), height = `ground(x, z) + 0.1` (terrain-er upor, W gate road-er moto). Notun collider / mesh model nei, shudhu 1 ta ribbon (draw call 1).
  - **Test:** `scripts/evlab-walkpath-test.ts` (notun, `npm run test:evlab-walkpath`, ALL OK, 14 check): 5 m, sidha, landing-e shesh, arm axis theke 24.20 m, campus-er dike, length 59.7, gate road theke 0.5 m, mall polygon-e nei, contains / keepout true. Natural ground path-e 18.0..18.3 m (slope 1.1 %), floor 20.5 m: pad-er blend-e 2.2 m uthe (shobcheye beshi ~5 %). Regression: `evlab-garden-test`, `evlab-hill-test`, `evlab-benches-test` ALL OK, `evlab-site-test` 1 FAIL (**plot flat 2.73 m**, RT1-er open, ager-ei).
  - **Shimana / jante rakho:** (1) Path arm-er lane zone-e (s ~243) mishe: ground ekhane arm-er pad level (~18 m), tai path pad-er dike uthe. J1 slip lane kerb 23.4 m, path 24.2 m-e shuru (0.8 m margin). (2) Path-er shesh-e bridge-er deck-e dhukte hole road edge (0.5 m) par hote hobe: **R4b-te gate road-er shape thik hole path-er mukh / crossing thik korbe** (`WALK_Z` bodlalei hobe). (3) Path ekhono PROVISIONAL, lamp / bench nei. (4) `npm run build`, `typecheck`, game-e look **ei sandbox-e chalano jay ni** (three nei): tomar machine-e dekho: W arm-er pashe theke campus-er W bridge porjonto path ribbon, gate road-er pashe, gach nei.
  - **Baki:** R3b / R4b (gate road + parking strip final shape), alada chat-e.
