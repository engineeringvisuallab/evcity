# HANDOFF: EVLab relocation (J1-er pashe choto campus)

Notun chat-e eee.zip (full repo) attach kore "Part A" paste koro. Tarpor ek chat-e ek step, "Part C" theke.
Ei zip-er scripts/ folder-er duto file repo-te boshao: `evlab-front-survey.ts`, `evlab-front-search2.ts`.

**Ekhon porjonto: R0..R4 done (300 x 240 layout-e). R0b + R0c (user decision) + R0d (code: frame ghorano + notun plot 360 x 300) done. NEXT: R1b..R4b (notun size-e island/lake/bridge/parking/gate road/cyclist fit), tarpor R5 (R5_WIP.patch notun frame-e abar dekhte hobe), R6. OPEN (R0d-te dhora porechhe): plot-er dokkhin-purbo kone J1-er ground zone-er shathe 2.6 m porjonto flat hocche na, Done log "Step R0d" dekho.**

---

## Part A: Context (prothom message-e paste koro)

```
Ami evcity game-er EVLab campus notun jaigay soranor kaj korchi. Project eee.zip attach korlam.
Ami Banglish e likhi, tumio Banglish e uttor dao.

Niyom:
- Shudhu changed file gulo dao (repo-r path soho), structure bhanga jabe na. Zip korte bolle zip kore dao.
- Ek chat-e ek step. Step shesh hole test chalao (npm install age koro, npm run build, ar nicher test gulo) ar ami check kore bolbo.
- Kaj shuru korar age HANDOFF_EVLAB_RELOCATION_BN.md ar HANDOFF_EVLAB.md (shesh section "J1 / Citymall relocation") pore nao.
- Notun grass/tree toiri korbe na.
- Kono hisab/search korle arm-er J1 theke shuru (s = 0) pora ongsho dhorbe, shudhu J1_ARM_DATA (s >= 315) na.

Ki hoyeche: J1 (-87, -277, yaw 37.5) ar tar 4 ta 8-lane arm ager EVLab plot-er upor porechhe. Ami campus-ke choto kore,
shudhu "samner" ongsho rekhe, J1-er uttor dike, W arm ar N arm-er majhkhane wedge-e boshate chai.
```

---

## Part B: User-er decision (data, na pochondo hole age jiggesh koro)

1. Campus-er **surrounding area komabe**, shudhu **samner (gate-er dike) ongsho** thakbe.
2. **Pichoner lake lagbe na** (back lake + north bridge bad).
3. **Pichoner pahar kom kata**. Pahar-er kata ongsho **road ar bagan (garden)** hobe.
4. **8-lane road-er 2 dik theke** campus-e dhoka jabe (duto gate, duto arm theke).
5. User screenshot-e 2 ta blue mark dichchhilo: **W arm** (J1 theke proray 315 m, world proray (-337, -469), pixel theke ber kora tai +-90 m bhul) ar **N arm** (proray 325 m, world (111, -535), +-10 m).
6. **Plot size ekhono final na.** Kom pahar kata bhalo, ei boleche. Nicher table theke user-ke pochondo korte bolo.
7. Rail fixed. Je building/structure plot-er majhe porbe sheta thakte pare (pore re-place hobe).

## Part B2: Thik hisab (W arm + N arm-er majhkhane wedge, `WEDGE=NW`, plot + 40 m parking strip)

`WEDGE=NW PW=<chora> PD=<gobhir> npx tsx scripts/evlab-front-search2.ts`

| Plot | Cut (= fill) | Pahar-er relief | Centre (world) |
|---|---|---|---|
| 312 x 308 | 0.88 million m3 | 76 m | (-140, -670) |
| 312 x 260 | 0.51 million m3 | 64 m | (-140, -650) |
| **300 x 240** | **0.32 million m3** | 49 m | (-140, -630) |
| 290 x 230 | 0.28 million m3 | 45 m | (-140, -630) |
| 270 x 230 | 0.22 million m3 | 39 m | (-140, -620) |

- Ager (puron) plan: 2.1 million m3 kata. Ei table-er prottek-ta tar cheye onek kom.
- Ek chat-e ami bhul kore 0.03 million m3 bolechhilam (arm-er s < 315 ongsho dhori ni). Ei table-ta thik.
- Search-e: arm theke plot >= 60 m, parking strip >= 30 m, J1 box >= 110 m, rail >= 50 m.
- J1-er kachhe flat jaiga rail ar arm kete nile kom thake, tai plot-ke uttor-e pahar-er dike thelte hoy. Eta-i cut-er karon.

## Part B3: Code-e ki ki ache (ami porechhi)

Campus **building-local** frame-e (x = east, z = south, origin = podium centre). World = (EVLAB_POS.x + x, BUILDING_Z + z). Ekhon `BUILDING_Z = -260`, `EVLAB_POS = (-280, -250)`.

- `EVLabSite.ts`: `EVLAB_PLOT`, `EVLAB_FENCE`, `EVLAB_ROAD` (F6-er dike access road), `EVLAB_MOUTHS` (F6-e median cut), `DRIVE_X` strip, `evlabKeepout`, pad `height()`.
- `EVLabCampus.ts`: `ISLAND` (cx 0, cz 38.5, hx 125, hz 133.5, r 50), `LAKE` (hx 175, hz 183.5, r 100: 50 m lake band), `RING` (ring road), `BRIDGES` (S, N, W, E), `ROAD_RECTS`, `PLAZA` (z 60..132), `FOUNTAINS`, `parkTrees(halfX, zMin, zMax)`.
- `EVLabParking.ts`: `LOT` x 205..237.6, z 2..81 (E lake-er purbe), `DRIVE` (entry road dokkhine F6-e z 253), `ENTRY_ROUTE`.
- `EVLabParkingLot.ts`, `EVLabGrounds.ts` (avenue F6 porjonto, N connector, promenade), `EVLabCyclistPath.ts` (`AVENUE.z0 = 253`), `EVLabArrivalPath.ts` (`ENTRY_LEN`), `EVLabBenches.ts` (hard-coded promenade rect -205/205, bank filter |x| <= 228), `EVLabLakeWater.ts`, `EVLabParkTrees.ts`, `MedianPlan.ts` (`EVLAB_MOUTHS`), `LocalRoads.ts` (`evlabKeepout`), `TerrainGenerator.ts` (`evlab` pad), `MissionData.ts`.
- Tests ekhon: `evlab-site-test` 3 FAIL, `evlab-parking-test` 4 FAIL (J1 overlap-er karone, age theke). `evlab-benches-test` ALL OK. `npm install` ekhon cholbe.

J1 arm: `src/roads/junction/J1ArmData.ts` (`J1_ARM_DATA`, s = 315 theke), arm-er sidha ongsho s = 0..315 = J1 (-87,-277) theke direction N (0.609, -0.793), E (0.793, 0.609), S (-0.609, 0.793), W (-0.793, -0.609). Pavement 44.2 m (22.1 m protidike).

## Part B4: Notun layout-er proposal (jiggesh kore nao)

Plot ~300 m chora hole campus-ke aro choto korte hobe:
- `LAKE`: lake band 50 m theke **25 m** (hx 150). Lake pichone **nei**: north-e island-er north edge z = -95 porjonto, lake W/E-r shoru theke dokkhin porjonto, north end-e soru hoye mishe jabe (rounded rect, r 75).
- **N bridge** + N connector + N promenade **bad**.
- **W bridge ar E bridge = duto gate** (kintu choto, ~37 m, lake 25 m).
- **Parking** E lake-er purbo pashe-i thakbe (LOT.x0 ~162). Entry road dokkhine na giye **N arm-er dike** jabe (road N arm-er pavement edge porjonto, ~40 m).
- **W gate road**: W bridge-er landing theke W arm porjonto (~130 m, flat jomi).
- **S bridge + avenue**: plot-er dokkhin edge porjonto (F6 porjonto na). Cyclist ra ekhan theke ashbe (`AVENUE.z0` = plot edge).
- **Pahar**: plot-er pichone pahar-er slope kata hobe, tar upor back road + bagan (garden).

Khola proshno: **M8 fully controlled** (side junction nei). Gate road gulo arm-er shathe kivabe mishbe? (frontage road / slip / user-er decision). Prothom step-e shudhu road strip + flat jomi, junction detail pore.

---

## Part C: Step prompts (ek ek kore, order-e)

### Step R0: Size ar gate thik kora
```
Step R0: Plot size thik korte hobe. HANDOFF_EVLAB_RELOCATION_BN.md-er Part B2 table dekho, ami bolbo kon size. Tarpor Part B4-er layout ami OK korle R1 shuru. Ekhono kono code lekhbe na.
```

### Step R1: Site (plot, pad, fence, keepout)
```
Step R1: EVLabSite.ts-e notun plot (ami je size bolechi, centre table theke), notun EVLAB_PLOT/EVLAB_FENCE (sada rectangle), EVLAB_POS, BUILDING_Z (EVLabLayout.ts). F6-er access road, EVLAB_ROAD, EVLAB_MOUTHS, DRIVE_X strip bad. Notun: parking strip ar duto gate road-er flat strip pad-e dhoro. evlabKeepout update. scripts/evlab-site-test.ts update koro (F6/gate test bad, notun test: plot flat, arm theke >= 60 m, rail theke >= 50 m, J1 box theke >= 110 m). Shudhu changed file dao.
```

### Step R2: Campus layout (lake 25 m, back lake bad)
```
Step R2: EVLabCampus.ts: LAKE 25 m band (Part B4), N bridge/N connector bad, W/E bridge choto, S bridge choto, ROAD_RECTS, FOUNTAINS (north lake jet bad, bakigulo notun lake-er majhe), parkTrees limit. EVLabGrounds.ts, EVLabBridges.ts, EVLabBenches.ts (promenade rect, bank filter), EVLabLakeWater.ts, EVLabParkTrees.ts. evlab-lake-test, evlab-benches-test, evlab-fountains-test update koro ar chalao.
```

### Step R3: Parking + E gate
```
Step R3: EVLabParking.ts-e LOT-ke E lake-er purbe niye ashbo (LINK promenade-er shathe), DRIVE (entry road) N arm-er pavement edge porjonto (J1_ARM_DATA / s < 315 straight ongsho dhore). EVLabParkingLot.ts, EVLabArrivalPath.ts (ENTRY_LEN). evlab-parking-test, evlab-arrivals-test update koro.
```

### Step R4: W gate road + cyclists
```
Step R4: W bridge-er landing theke W arm porjonto gate road (flat jomi + road strip). EVLabCyclistPath.ts-e AVENUE.z0 = plot-er dokkhin edge. evlab-cyclists-test update koro.
```

### Step R5: Pichoner pahar -> road + bagan
```
Step R5: Plot-er pichone (uttor-e) je pahar kata porbe sheta slope diye mishabe (blend 48 m-er cheye choura), tar upor back road ar bagan (garden, notun tree na, ager park tree style). Cut/fill hisab dekhao.
```

### Step R6: Arm-er shathe junction
```
Step R6: Duto gate road N arm ar W arm-er shathe kivabe mishbe (M8 fully controlled). Ami bolbo (frontage road / slip). MedianPlan, RoadNetwork update.
```

---

## Done log
- **Step R0 (done):** plot size = **300 x 240** (centre (-140, -630), cut 0.32 Mm3, relief 49 m). Part B4 layout OK.
- **Step R1 (done):** `EVLabSite.ts`: `EVLAB_PLOT` x -290..10, z -750..-510 (plain 4-corner `EVLAB_FENCE`), `EVLAB_POS` (-140, -630), `EVLAB_PARKING_STRIP` (x 10..50, 40 m, outside the fence), `EVLAB_GATE_ROADS` (W: plot west edge -> W arm, ~118 m; E: car park -> N arm, ~36 m; PROVISIONAL straight flat strips, ends 24 m from the arm centre line = pavement edge). Pad = plot + strip + 2 gate road strips (ROAD_FLAT 14 m, BLEND 48 m). `EVLAB_MOUTHS` = [] (no F6 cut), `DRIVE_X` bad, `EVLAB_ROAD.endZ/edgeZ` = plot south edge (provisional, EVLabGrounds / ParkingLot / CyclistPath still read it until R2-R4), `EVLAB_SCALE` = 1. `evlabKeepout` = plot + strip + 30 m, and the 2 gate road strips. `EVLabLayout.ts`: `BUILDING_Z` -260 -> **-650** (local z -100..+140 = plot). Test: `scripts/evlab-site-test.ts` (new, ALL OK), `scripts/start-test.ts` (fence check updated, ALL OK). **Dhoroto hobe R2-te:** campus island ekhono 267 m gobhir (z -95..172) + lake, plot 240 m gobhir: island chhoto korte hobe (south ~z 115 porjonto), nahole south bridge/plaza plot-er bairey porbe. `evlab-benches-test`-er 1 ta check (bench plot-er bhitore) ekhon FAIL, R2-te thik hobe.
(Survey: scripts/evlab-front-survey.ts, scripts/evlab-front-search2.ts.)
- **Step R2 (done):** `BUILDING_Z` -650 -> **-660** (local plot z -90..+150; evlab-site-test updated). `EVLabCampus.ts`: `ISLAND` cz 20, hx 125, hz 105 (z -85..125); `LAKE` cz 32.5, hx 150, hz 117.5, r 75 (25 m band W/S/E, touches the fence, shares the island's north edge z -85, no back lake); `RING` cz 17.5, hz 87.5; `BRIDGES` = S (119..156, 24 m), W / E (+-119..156, 16 m, at `GATE_Z` 48.5 = world z -611.5), N bridge + arch style removed; `ROAD_RECTS`; `PLAZA` z 60..95, `PLAZA_FOUNTAIN` (0, 77.5, r 10); `FOUNTAINS` (6 lake jets, none north); `parkTrees` limits +-150 / -90..150 (148 trees). `EVLabGrounds.ts` (no F6 avenue / N / promenades; west / east / south link roads), `EVLabBridges.ts` (cable fan scaled to 37 m), `EVLabBenches.ts` (36 benches: plaza 16, island 20, no bank), `EVLabLakeWater.ts` (uBr size = number of bridges), `EVLabParkTrees.ts` (REACH 160), `EVLabSite.ts` (W gate road starts at `GATE_Z`), `EVLabSitterPlan.ts` comment. Tests updated and green: evlab-lake, evlab-benches (except the route check below), evlab-site, evlab-sitters. evlab-fountains: 3 FAIL exist in the original zip too (phaseOf, splash droplets, bases), not from R2.
- **Still open for R3 / R4 (expected FAIL now):** evlab-parking-test (15), evlab-cyclists-test, and the route check 'cyclists and car drivers pass at least 1 m from every bench' in evlab-benches-test: parking lot / entry road / `AVENUE.z0` / arrival routes still use the old layout.
- **Step R3 (done):** `EVLabParking.ts`: `LINK.z` 48.5 (= `GATE_Z`), `LOT` x 157..189.6 (inside the parking strip, 1 m beyond the E bridge deck), z 2..81 (same as before: 26 bays per row, so `ARRIVAL_CARS` bay ids stay); `DRIVE` x 173.3 leaves the cross aisle south and bends (quadratic curve, `DRIVE_PTS`, `DRIVE_LEN` ~ 75 m, `driveOffset(off)` for the two lanes, `driveDist`) to `DRIVE_END` local (204.4, 146.2) = world (64.4, -513.8): the pavement edge of the N arm (24.2 m from its centre line, 280 m along the arm), meeting it square. `EVLabSite.ts`: E gate road = `DRIVE_PTS` (same pad strip). `EVLabParkingLot.ts`: entry road drawn along `DRIVE_PTS` (no F6 corner flares). `EVLabArrivalPath.ts`: `ENTRY_LEN` = `DRIVE_LEN`, cars use the west lane in and the east lane out along the curve, the walk goes over the E bridge, along the ring road and along the north edge of the plaza (z 61.5) to the portal. Tests green: evlab-parking, evlab-arrivals (and site, lake, sitters, audience, cycle).
- **Known for R6:** near the arm (< 55 m from its centre line) the natural ground is up to ~1.2 m off the level pad (arm embankment); evlab-parking-test measures it (limit 2.5 m). The junction itself and its terrain blend are Step R6.
- **Still open for R4 (expected FAIL now):** evlab-cyclists-test (100) and the route check in evlab-benches-test ('cyclists and car drivers pass at least 1 m from every bench': 57 points, all from the cyclists' routes; the car drivers' walks are clean): `EVLabCyclistPath.ts` `AVENUE.z0` and the cyclist routes still use the old layout.
- **Step R4 (done):** `EVLabCyclistPath.ts`: `AVENUE.z0` = plot-er dokkhin edge (local z 150 = `EVLAB_PLOT.z1 - BUILDING_Z`); `PLAZA_RIDE` notun (plaza ekhon z 60..95: `junctionZ` 90.6, `laneZ` 1, `legX` 37, `plazaZ` = `PLAZA.z1`); `walkOf` notun route (rack-er pashchim prante x 22 diye uttore z 61.5, tarpor portal-e, fountain-er bench ring-er majh diye na giye). `EVLabCampus.ts`: plaza-r debdaru gach-er sar z1-5 -> z1-7.5 (cycle lane-er jonno jaiga). `EVLabSite.ts`: W gate road ekhon ekta smooth curve (`W_GATE_PTS`, cubic Bezier, ~121 m, W bridge-er shesh (fence-er 6 m baire) theke pashchim-mukhi hoye shuru, W arm-e square-e mishe, pavement edge-er 24.1 m, sorbonimno bend radius 28 m); `EVLAB_GATE_ROADS[0].pts = W_GATE_PTS`. `EVLabGrounds.ts`: W gate road-er asphalt ribbon ankha (jomi onujayi uchchota, E drive-er moto; `ground` function diye). Test: `evlab-cyclists-test` (all ok), `evlab-benches-test` (ALL OK, ager 57 point FAIL ar nei), `evlab-site-test` (ALL OK + notun W road check), `evlab-parking`, `evlab-arrivals`, `evlab-lake`, `evlab-sitters`, `evlab-audience`, `evlab-cycle`, `evlab-structure`, `start-test` green; `npm run build` ok.
- **Known for R5 / R6:** cyclist-ra plot-er dokkhin edge-e (z 150) shuru hoy ar shekhane shesh hoy (S avenue ekhono kono road-er shathe juktona, R6-te thik hobe, cholte thakle pop-in dekha jabe). W gate road arm-er pavement edge-e shesh, junction R6.


---

## Part D: Notun requirement (14 Nov) - R5-er age R0b + R0c

Game-e dekhe user-er bhabna: (1) tower-er tulonay campus (island, lake, plaza) **onek choto** lage, pichoner pahar tower-er khub kachhe. User campus-er jaiga **boro** korte chay (tower-er chardike beshi jaiga). (2) **Building ke road-er shathe parallel kore banate hobe** (ekhon campus yaw 0, axis-aligned, J1 ar tar arm gulo 37.5 degree ghurano, tai building road-er shathe tirjok).

### Notun step order (age R0b, R0c, tarpor R1..R4 abar verify, tarpor R5, R6)
- **R0b: plot size abar thik kora.** Part B2 table-er boro size gulo (312 x 260 = 0.51 Mm3, 312 x 308 = 0.88 Mm3, ba aro boro) theke user pochondo korbe. Kom pahar kata bhalo (aage kom cut-er option dekhao). Ekhono code lekhbe na.
- **R0c: orientation (yaw).** User-ke jiggesh koro: building kon road-er shathe parallel hobe (N arm, W arm; J1-er 4 ta arm 90 degree, tai duto-i ek sathe parallel hobe jodi frame J1 yaw (37.5 degree) diye ghorano hoy) ar gate (samner dik) kon dike. Tarpor frame ghorabe: `EVLAB_POS.yaw`, ar world <-> building-local transform.
  Code-e ja ja axis-aligned dhorey ney (sob update lagbe): `EVLabSite.ts` (`outside()`, `PAD`, `insideFence`, `EVLAB_FENCE`, `evlabKeepout`, `EVLAB_GATE_ROADS` / `W_GATE_PTS` / `DRIVE_PTS` world points, "Yaw is 0, so everything is axis-aligned" comment), `EVLabParkTrees.ts` (chunk filter, `wx = EVLAB_POS.x + t.x`), `EVLabManager.ts` (building group placement), terrain pad (`TerrainGenerator.ts`), `scripts/evlab-site-test.ts` (axis-aligned loops), `evlab-front-search2.ts` (axis-aligned search: rotated rectangle-e korte hobe).
  Notun search: rotated plot (yaw = J1 yaw) arm-er majhkhane wedge-e boshao; arm theke >= 60 m, rail >= 50 m, J1 box >= 110 m, cut/fill kom.
- **R1..R4:** notun size ar yaw-e abar verify/update (plot, pad, fence, keepout, campus, parking, gate roads, cyclists). Test gulo green kora.

### R5 WIP (patch, apply KORA HOY NI)
`R5_WIP.patch` (repo root theke `git apply R5_WIP.patch`). Eta **300 x 240 m-er porano size ar yaw 0-er jonno** lekha, size/yaw bodlale abar dekhte hobe. Tate ache:
- `EVLabCampus.ts`: `BACK` (pichoner 40 m strip: bagan z -114..-90, pathor path z -102.5, back road centre z -120 10 m chora, verge), bagan-er gach (duto staggered row, ager park tree kind), 
- `EVLabSite.ts`: pad uttore 40 m barano (`EVLAB_BACK_STRIP`), uttor dike pahar **graded cut slope** (`GRADE_N` = 1.0, rise/metre, 45 degree; `RAMP_END` 160 m, `RAMP_FADE` 40 m): smoothstep skirt-er bodole, karon pahar-er natural grade ~65-100%, smoothstep skirt hoy cliff (206%) noy onek bishal cut. Corner-e `northW()` diye smooth.
- `EVLabGrounds.ts`: lawn, stone path, low wall, back road (straight, x -150..190, lamps).
- `scripts/evlab-back-hill.ts`: cut/fill ar uttor profile hisab dekhay (`npx tsx scripts/evlab-back-hill.ts`).
- Cut/fill (300 x 240 plot + 40 m strip + parking strip): R4 obostha cut 0.92 Mm3 (uttor-e cliff 206%); R5 WIP: GRADE_N 0.75 -> 2.34 Mm3, **1.0 -> 1.79 Mm3 (uttor ongsho 1.22)**, 1.3 -> 1.58, 1.6 -> 1.48 (fill sob-khetre 0.11 Mm3). Pahar-er natural grade onek steep, tai gentle slope mane onek cut. WIP-te existing test (site, benches, cyclists) green, kintu notun test lekha hoy ni.
- Bhabo: back strip-er 40 m pahar-er ghonishto, cut-er boro ongsho. Plot size/yaw thik hole strip-er gobhirota abar dekho.

### Done log (14 Nov)
- R5 shuru hoyechhilo, user screenshot dekhiye bolle campus choto + building road-er shathe parallel hote hobe. R5 WIP patch-e rakha holo, zip-e code R4 obostha-e ache.


### R0b hisab (14 Nov, `scripts/evlab-rot-search.ts`; zip-e ache)
`WEDGE=NW PW=<chora> PD=<gobhir> YAW=<0 ba 37.5> npx tsx scripts/evlab-rot-search.ts` (plot + 40 m parking strip, arm >= 60, J1 box >= 110, rail >= 50; YAW 37.5 = plot-er dhar J1-er arm-er shathe parallel). Prottek size-er shera 3 ta placement-er prothom ta:

| Plot | YAW 0 (ekhonkar moto) | YAW 37.5 (road-er shathe parallel) |
|---|---|---|
| 300 x 240 (ekhon) | cut 0.37 Mm3, relief 54 m, centre (-140, -640) | **cut 0.19 Mm3, relief 41 m**, centre (-140, -580) |
| 360 x 300 | cut 1.21 Mm3, relief 90 m, centre (-140, -700) | **cut 0.69 Mm3, relief 78 m**, centre (-140, -620) |
| 420 x 340 | cut 2.13 Mm3, relief 114 m, centre (-160, -740) | **cut 1.64 Mm3, relief 109 m**, centre (-160, -660) |

- Ghurale cut onek kome (arms-er shathe parallel hole plot J1-er kachhe ase, pahar theke dure). Kintu J1 box-er gap 114-130 m (limit 110), tai ghurano plot-e J1 theke bishesh dure sora jay na.
- Boro size-e cut druto bare (360 x 300 = prai 3.5 gun beshi). 360 x 300, yaw 37.5 (0.69 Mm3) ekta moddho option.
- Note: 300 x 240, yaw 37.5-e ekta ajob placement ache: centre (-400, -260), cut 0.01 Mm3, relief 3 m (prai somotol), arm gap 69, J1 gap 122. Eta wedge-er (J1-er uttor-poshchim) bairey hote pare, user ke jiggesh koro (dekhte hobe sheta kon jaigay, pashe road/rail ase kina).
- Ei hisab shudhu jomi-r uchchota (12 m grid) dhore; pad-er blend skirt ar uttor-er pahar slope (R5 WIP) alada.
- User-er kaj: size ar yaw (kon arm-er shathe parallel) bachbe. Tarpor R0c theke code.

### Step R0d (done, 14 Nov): frame ghorano (yaw 37.5) + notun plot 360 x 300

**User decision (R0b + R0c):** plot 360 x 300 m, centre world (-140, -620), yaw 37.5 deg (plot-er dhar J1-er arm-er shathe parallel; N arm ar W arm 90 deg tai duto-i parallel), cut ~0.69 Mm3, relief 78 m. Duto gate: south-west (W arm-er dike), south-east (N arm-er dike). Flat core-er chardike boro porishor (park) pahar-er natural slope onujayi (R5-te), notun tree/grass na.

**Code (kono kichu R1-R4 layout-er number bodlay ni, shudhu site + yaw):**
- `EVLabSite.ts` (sob notun): `EVLAB_YAW` (37.5 deg), `EVLAB_POS` = {x -140, z -620, yaw} = **plot-er centre (world)**. `EVLAB_ORIGIN` = building-er origin (world) = plot centre theke local -z-te 30 m (ager 300 x 240 plot-er moto, tai R1-R4-er local number thik thake) = (-121.74, -643.80). `localToWorld(lx, lz)` / `worldToLocal(x, z)`: world = ORIGIN + R(yaw) * local, R = [cos -sin; sin cos]. Local +x = J1 "E" arm direction (cos, sin), local +z (gate dik) = J1 "S" arm direction (-sin, cos). **Kono jaygay hat diye offset jog korbe na, ei duto function use koro.**
- `EVLAB_PLOT` ekhon **building-LOCAL** (x -180..180, z -120..180; centre local z 30). `EVLAB_PARKING_STRIP` local (x 180..220, 40 m). `EVLAB_FENCE` = 4 ta ghorano corner (WORLD). `EVLAB_PLOT_AABB` = world bounding box (shudhu rough zone test-er jonno, ghorano plot eta bhore na). `insideFence`, `EVLabSite.inside/contains/near/height/outside`, `evlabKeepout` sob ghorano frame-e (local e kore, ghurale doori bodlay na). Pre-check box (`inBox`) theke dur-er point-e rotation hisab hoy na.
- `EVLabSite` class: `x, z` = plot centre, `ox, oz` = building origin, `halfX` 180, `halfZ` 150, `centreLz` 30, `toWorld()`, `toLocal()`. `gateZ` getter bad.
- Pad (local): plot + 40 m parking strip (x -180..220, z -120..180) + gate road strip (ROAD_FLAT 14 m), blend 48 m (R5-te uttor-e baraabe).
- `EVLAB_GATE_ROADS` ekhon `local` (building-local) + `pts` (world). **PROVISIONAL:** R3/R4-er shape local frame-e rakha (E = `DRIVE_PTS`, W = bridge-er shesh local (-156, 48.5) theke 30 m "west" sidha). Arm porjonto ar jay na (arm-er shathe miloner kaj R3b/R4b). Old Bezier `W_GATE_PTS` bad.
- `BUILDING_Z` **bad** (`EVLabLayout.ts`). Jekhane `EVLAB_POS.x + x, BUILDING_Z + z` chhilo shekhane `localToWorld`.
- `EVLabManager.ts`: building group `position (ox, floorY, oz)`, `rotation.y = -yaw` (three.js: local->world x' = cos*x - sin*z hole rotation.y = -yaw). Rapier fixed body ar lift cab kinematic body-ao ghorano (cab: block yaw - building yaw), cab position `toWorld`. `entrance`, `position`, `teleportLocal`, `enterStage`, `dist`, `local` (player local) sob `toWorld/toLocal` diye. `faceSouth` (Engine.ts) = orbit yaw `PI - yaw` (local south = gate dik).
- `EVLabParkTrees.ts`: chunk filter ekhon building origin-er chardike REACH 215 (ghorano park radius ~213 m), tree position `localToWorld`.
- `TerrainGenerator.ts`: floorY = ghorano plot-er upor 17 x 17 grid-er median (`toWorld`). `EVLabGrounds.ts`: W gate road local point (`w.local`), `EVLabCyclistPath.ts`: `AVENUE.z0` **150 (ager plot-er dokkhin edge) rakha**, R4b-te 180 hobe. `MissionData.ts`: presenter place `localToWorld`. `index.ts`: notun export.
- Tests/scripts: `evlab-site-test.ts` (notun: ghorano frame, 1 transform round trip, plot flat, arm >= 60, strip >= 30, rail >= 50, J1 >= 110, keepout, gate road local), `evlab-parking-test.ts` (`W` helper), `evlab-benches-test.ts`, `mission-test.ts`, `start-test.ts`, `eng-zones-test.ts` (`EVLAB_PLOT_AABB`), `j1-game-check.ts` (`insideFence`), `evlab-move-search.ts` (`EVLAB_POS`).

**Numbers (evlab-site-test):** floorY 20.42. J1 centre campus frame-e (251, 270): plot-er dokkhin edge z 180 (W arm centre line theke 90 m), purbo edge x 180 (N arm centre line theke 71 m). Plot -> arm 71 m (>= 60 OK), strip -> arm 31 m (>= 30 OK), plot + strip -> rail 242 m (>= 50 OK), plot -> J1 centre 114 m (>= 110 OK), road surface plot + strip + 4 m = 0, strip-er purbo edge theke N arm-er asphalt 6 m. Mall plot overlap nei.

**OPEN (test FAIL, ei step-e thik kora hoy ni, user-er decision lagbe):** `evlab-site-test`: (1) "plot flat": range 2.62 m, (2) "car park strip within 1 m of pad": 2.58 m. Karon: J1-er **ground zone** (`roads.maskAt`, `j1.sample` weight) J1 centre theke ~154 m porjonto jay (R0b search shudhu 110 m dhorechhilo), tai plot-er dokkhin-purbo kone (local x 124..180, z 150..180, lake-er baire) ar strip-er dokkhin-purbo ongsho-e road mask 1 hoy ar terrain pad (k = 1 - mask) bondho hoye J1-er ground thake. Plot-er ~5986 sample-er moddhe 81 ta > 1 m off (ca 1300 m2), baki sob flat. Option: (a) plot centre kichu NW-e (J1 theke ~40 m dure) soraba, (b) SE kone chhute dewa, (c) pad-ke fence-er bhitore J1 ground-er upor jitano (J1 terrain-e dhap toiri hote pare), (d) J1 ground zone chhoto kora. Ami kono-ta nijer matha theke korini.

**Test obostha (ei sandbox-e network nei, `npm install` fail kore, `three`/`rapier`/`vite` nei, tai `npm run build` ar three-import kora test chalano jay ni):**
- Chalano gese: `evlab-site-test` (2 FAIL, upore), `evlab-benches-test` ALL OK, `mission-test` ok, `start-test` ALL OK, `eng-zones-test` (4 FAIL, **original zip-eo same 4 ta**: army zone, 17% water, 2 railway, R0d-er sathe somporko nei). Changed file-gulor syntax check (ts.transpileModule) ok.
- Chalano jay ni (three lage): `evlab-parking`, `evlab-arrivals`, `evlab-cycle`, `evlab-cyclists`, `evlab-sitters`, `evlab-lake`, `evlab-fountains`, `evlab-audience-model`, `evlab-structure`, `evlab-tower`, `evlab-partition`, ar `npm run build`. **Tomar machine-e `npm install`, `npm run build` ar ei test gulo chalaiye result pathao.**
- Ager theke jana expected FAIL (R1b-R4b-te thik hobe): `evlab-parking-test` (lot ekhono local x 157..189.6 = notun strip 180..220-er baire; entry road N arm porjonto jay na, arm-end checks), `evlab-fountains-test` 3 FAIL (original-eo ache). Baki test gulo ager moto local number-e, ashar kotha green, kintu ami chalate pari ni.
- Dhorano chhoto bishoy: lake water shader-er micro-ripple normal local axis-e, ghorano frame-e shamanno alada dik (sun glint-e dekha jabe na, cosmetic).

### Step R6x (PLAN, 15 Nov, user order; shuru hoy ni): EVLab 90 deg anticlockwise ghuriye road-er kache ana
**User (15 Nov):** "ekhon image-e EVLab jemon ase thik anticlockwise 90 rotate kore road-er kache ane dao. Road theke 5 m walking way, tarpor bagan 5 m, tarpor lake 5 m, tarpor EVLab building etc. parbe?" (image: mall-er purbo-e, mall-er pashe; EVLab building-er lomba ongsho purbo-dike, chardike lake ring, uttor-e road, bam-e (pashchim) J1 S arm-er moto khara road).
**AI-er uttor:** parbo, kintu boro kaj (ek chat-er shesh limit-e kora uchit na): site + pad + gate road + parking + lake + tree + cyclist path + mission + test sob bodlay. Tai plan:
1. **Jiggesh (ek proshno):** kon road-er kache? (image-e EVLab-er bam-e khara road = J1 S arm, nichey ARM-er W road). Rotate-er por kon dike ekhon building-er samne (gate) hobe?
2. EVLAB_YAW 37.5 deg theke 90 deg ghurano (37.5 - 90 ba +90, direction user-er "anticlockwise" onujayi screen-e dekhe thik), EVLAB_POS notun. Road edge theke: 5 m walking way + 5 m bagan (garden) + 5 m lake = 15 m, tarpor building. Ager plot 360 x 300 theke koto lagbe (building + lake ring) ta headless script-e mepe dekhao.
3. Pad (flat), cut / fill, J1 ground zone (~154 m), arm gap (ager test: arm >= 60 m, ekhon notun niyom 15 m), rail >= 50, keepout, mall pad-er sathe overlap nei (mall plot -> notun EVLab).
4. Gate road, parking strip, EVLabGrounds (W gate), EVLabParkTrees, EVLabCyclistPath (AVENUE), MissionData presenter, TerrainGenerator floorY, test update (evlab-site-test ... ).
5. Honest: three / rapier nei tai onek EVLab test ar npm run build chalano jay na; tomar machine-e chalate hobe.
**R6x user-er sudhrano (15 Nov, pore):** (a) lake 5 m na: lake **ja ache tai thakbe** (width bodlabe na). Shudhu road theke 5 m walking way, tarpor 5 m bagan, tarpor ager lake + building. (b) **Road kisu bodlabe na** (J1 arm, ring, R6, sob). (c) Pahar kata ba bari-er bhitore pora = problem na. (d) 90 deg anticlockwise, user-er image-er jaigay (in place) ghurano. **Mil nei:** user-er image-e EVLab proay (-100, -350)-er kache (HUD X -334, Z -336, camera 562 m), kintu ei zip-er code-e EVLab plot centre (-140, -620), building origin (-121.7, -643.8), yaw 37.5 deg (R0d). J1 (-87,-277) image-er EVLab-er jaigay porbe, tai image purano build-er hote pare. Notun chat-e AGE jiggesh: image-er build, na code-er (-140,-620) jaiga? Uttor pele headless script (rotate, road gap, cut / fill, bari overlap list) tarpor code.

### 15 Nov (pore): Step R6x REPLACED
R6x-er plan ar user-er notun order (notun garden shudhu paharer pashe, boro lekha, real-time clock, road theke 5 m offset 2 dike) **HANDOFF_EVLAB_ROTATE_BN.md** (steps RT0..RT6)-e niye gelo. Notun kaj oi file theke koro. Purano R-step (R0..R4 done, R5 WIP patch, R6) ager moto.

### 15 Nov (RT1)
EVLab ekhon yaw -52.5 deg (ager 37.5 deg theke 90 deg CCW, ager-ei jaygay). Details: HANDOFF_EVLAB_ROTATE_BN.md Done log RT1.

### 15 Nov (RT2)
EVLab-er ager garden (park trees) bondho: HANDOFF_EVLAB_ROTATE_BN.md Done log RT2.

### 15 Nov (RT3)
Notun garden (paharer pashe, shudhu narikel / palm / khejur): HANDOFF_EVLAB_ROTATE_BN.md Done log RT3.

### 15 Nov (RT4)
Pahar-er slope / upor-er palm: HANDOFF_EVLAB_ROTATE_BN.md Done log RT4.

## Step R-J1 (2026-11-21, user: "evlab k J1 er dike x-98 z-363 point a lake er edge thakbe") - TRIED, UNDONE
Tried PLOT_CENTRE (-140, -620) -> (-110, -521.6) (yaw same): lake SW corner arc then touches world (-98, -363). Result: game did not start (TypeError reading 'length'): J1 is at local (-180, 197) of the moved plot, so the W arm axis runs along the plot's west edge (local x -180) and the N arm axis 17 m south of the plot (z 197 vs plot z1 180); the walk path (EVLabSite.makeWalkPath) got length -0.08 m and NaN points. Back at (-140, -620). The point (-98, -363) is 61 m from the W arm axis AND 61 m from the N arm axis, but the plot is 30 m wider than the lake on every side, so the plot (fence, ring road, pad) must be cut or moved further out. Waits for the user: (A) plot margin cut on the W and S side, or (B) plot >= 60 m from both arm axes (lake corner about world (-108, -434)).
