# HANDOFF: EVLab area (evcity game)

Notun chat-e evcity.zip attach kore age "Part A" paste koro. Tarpor ek chat-e ek step, "Part C" theke.

**Ekhon porjonto: Step 1, 1.1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 done. Porer step: Step 12 (bench-e manush). Pending: 1.1b, 1.2a/b/c (alada, pore).** Zip-e step 1-er changed file jodi na thake, step1 folder-er 2 ta file age paste koro.

---

## Part A: Context (prothom message-e paste koro)

```
Ami evcity game-er EVLab area-r kaj korchi. Project evcity.zip attach korlam.
Ami Banglish e (Bangla English akkhore) likhi, tumio Banglish e uttor dao.

Niyom:
- Shudhu changed file gulo dao, jate ami amar game-e paste korte pari. Structure bhanga jabe na.
- Ek chat-e ek step. Step shesh hole test chalao (npm run test:tower, scripts/mission-test.ts, npm run build) ar ami check kore bolbo.
- Notun grass/tree toiri korbe na, ager gulo-i thik koro.
- Kaj shuru korar age relevant file gulo pore bujhe nao.

Ager kaj (zip-er bhitore CHANGES_EVLAB_BUILDING_BN.md ar CHANGES_EVLAB_CAMPUS_BN.md pore nao):
- Tower 88 floor + roof garden, podium 176 x 116 m, entrance lobby, 3 door:
  West = Main Office, majhe 3 ramp = Presentation Hall, East = Engineering Lab.
- 2 stair + 2 lift (src/evlab/EVLabWings.ts, EVLabTowerLayout.ts).
- Lake ring, 4 bridge, fountain: EVLabCampus.ts, EVLabBridges.ts, EVLabFountains.ts, EVLabGrounds.ts, EVLabSite.ts.
- Mission: scripts/mission-test.ts, CHANGES_MISSIONS_v1.1_BN.md.
- People: CHANGES_PEOPLE_GRASS2_BN.md, scripts/people-test.ts.
- Parking: CHANGES_PARKING_LAYOUT_BN.md, CHANGES_EVLAB_STEP7_BN.md (EVLab campus-er notun parking lot). Bike: scripts/bike-test.ts.
```

---

## Part B: Ki ki korte hobe (shob mile)

1. EVLab area realistic ar workable hobe.
2. Office ar conference room-e kono manush thakbe na. Shudhu presentation-er somoy real manush thakbe.
3. Lift-er gate-er height aktu boro korte hobe.
4. Lake-er water-e realistic physics, fountain-eo (jharna).
5. Barir bairer manush boshe thakbe, tai bosar branch/bench lagbe.
6. Keu gari niye parking-e ashbe, keu cycle niye ashbe. Cycle model nai, banate hobe.
7. EVLab presentation mission:
   - Screen-e lekha text gulo remove.
   - Real Presentation Hall-e, presenter jekhane dnrabe sekhane mission-er green marker.
   - Mission-e dhukle seat gulote real manush automatic ese boshbe.
   - Mission shesh hole tara chole jabe.
8. EVLab-e parking nai, parking add korte hobe (gari rakhar jonno).

Kaj boro, tai chhoto chhoto step-e (akdom chhoto).

---

## Part C: Step prompts (ek ek kore, order-e)

### Step 1: Lift gate
```
Step 1: EVLab-er 2 ta lift-er gate/door-er height aktu boro koro (cabin-er bhitorer height-o proyojone). Collider, door animation ar tower-er shob floor-e same rakho. Shudhu changed file dao.
```

### Step 2: Office/conference khali
```
Step 2: Main Office ar Conference/Presentation Hall-e ekhon je manush ache sheta shobshomoy remove koro. Manush shudhu presentation mission cholar somoy thakbe. Ei step-e shudhu "default-e keu nei" korbe, mission-er manush porer step-e.
```

### Step 3: Mission text remove
```
Step 3: EVLab presentation mission-e screen-e lekha text/overlay gulo remove koro. Mission-er logic ar scoring jeno na bhange. Mission-test pass korao.
```

### Step 4: Green marker
```
Step 4: Presentation Hall-e presenter jekhane dnrabe sekhane ekta green mission marker boshao (baki mission-er marker-er moto). Marker-e dhukle mission shuru hobe. Ekhono manush ashar kaj korbe na.
```

### Step 5: Hall-e manush ase ar bose
```
Step 5: Mission shuru hole Presentation Hall-er seat gulote real manush automatic ese boshbe (alada alada somoy-e, ekshathe na). Seat-e thikmoto boshar pose hobe. Ekhono shesh-er kaj korbe na.
```

### Step 6: Mission shesh, chole jabe
```
Step 6: Mission shesh hole hall-er manush uthe door diye chole jabe, tarpor remove hobe. Mission abar dhukle abar ashbe. Mission-test update koro.
```

### Step 7: Parking lot layout
```
Step 7: EVLab-er jonno parking lot add koro (road theke dhukar path, slot, line). Shudhu lot toiri, gari ekhono na. CHANGES_PARKING_LAYOUT_BN.md-er style follow koro. Ring road ar lake-e jeno na lage.
```

### Step 8: Gari ase park kore
```
Step 8: Mission shuru hole kichu manush gari niye ese EVLab parking-e park korbe, gari theke nere building-e jabe. Mission shesh hole abar gari niye jabe.
```

### Step 9: Cycle model
```
Step 9: Ekta realistic cycle model banao (frame, 2 chaka, handle, seat, pedal), game-er style-e. Eta bike-test.ts-er bike-er theke alada, manush chalabe, tai simple. Shudhu model, ekhono movement na.
```

### Step 10: Cycle rack ar cycle-wala manush
```
Step 10: EVLab-e cycle rack/stand add koro. Mission-e kichu manush cycle chalaye ese rack-e rekhe building-e jabe, shesh hole cycle niye chole jabe.
```

### Step 11: Bairer bosar jaiga
```
Step 11: EVLab-er bairer plaza/lake-er dhare bosar bench/branch boshao. Notun tree toiri korbe na. Collider ar road-er sathe conflict thakbe na.
```

### Step 12: Bench-e manush
```
Step 12: Step 11-er bench gulote manush boshe thakbe (kichu bench-e boshe, kichu khali). Boshar pose thikmoto howa chai.
```

### Step 13: Lake water physics
```
Step 13: EVLab lake-er water realistic koro: wave, reflection/fresnel, ar bridge/quay-r kache ripple. Performance-e jeno beshi na lage. Shudhu EVLabGrounds.ts-er water onsho-e kaj koro.
```

### Step 14: Fountain physics
```
Step 14: EVLabFountains.ts-er fountain-e realistic physics dao: pani-r fota gravity-te projectile-er moto uthbe-nambe, pool-e porle splash ar ripple hobe, shamanno hawa-e dole. Ekta InstancedMesh-i rakho jate performance thik thake.
```

---

## Done log (ki ki holo)

- **Step 1 (done):** lift door height 2.3 -> 2.9 m, cabin height 2.9 -> 3.3 m (`CAB` in `src/evlab/EVLabTowerLayout.ts`). Door lintel solid, landing collider ar door leaf auto update hoy (`CAB.doorH` theke). `src/evlab/EVLabCore.ts`: door-er opore floor number-er height `y + h + 0.45` (ceiling 3.8 m-er niche thake), cabin-er bhitorer floor display `y = 2.7`. Test pass: evlab-tower-test, mission-test, tsc. Stair door (`ST.doorH`) ager motoi.

- **Step 1.1 (done):** tower floor (level 1..88) structural frame. `EVLabTowerLayout.ts`: `STRUCT`, `colSide`, `colLoad`, `beamSection`, `columnsOf(n)`, `beamsOf(n)` (load hisab kore column size, span/18 diye beam depth). `levelColliders` e column collider, `floorPlan` e column-er upor furniture bad. `EVLabFloors.ts`: column ar beam draw (instanced, concrete). Test: `evlab-tower-test.ts`-e structure check add. Hisab: `EVLAB_STRUCTURE_ASSESSMENT.md`. Column: level 1-e perimeter 1.25 m / interior 1.75 m, level 88-e 0.60 m.
- **Step 5 (done):** mission shuru hole hall khali theke manush alada alada somoy-e dhoke (3 door, ramp, aisle, row), seat-e boshe (real manush: matha, torso, haat, pa, 8 instanced mesh). `EVLabAudiencePath.ts` (route/timing, pure), `EVLabAudience.ts`, `Q.hallFill`. Chole jawa Step 6. Test: `npm run test:evlab-audience`.
- **Step 6 (done):** `HallStage` wiring (PresentationHall -> MissionManager -> Engine -> EVLabManager): overlay khulle manush ase, bondho hole `EVLabManager.endPresentation()` -> `audience.dismiss()`: uthe, ulte route diye door diye chole jay, hide. Mood hook (listen/clap/ovation). Overlay ekhono opaque (3D hall tokhon dekha jay na).

- **Step 7 (done):** EVLab campus-er parking lot. Jaiga: lake-er purbo dike, east bridge/promenade-er shesh (building-local x 205..237.6, z 2..81; world x -75..-42, z -258..-179). 4 row (A,B,C,D) nose-in bay 2.6 x 4.8 m, 96 slot, row A-te promenade walkway-er gap. Entry road (10 m) lot-er dokkhin theke F6 highway porjonto (building-local x 221.3, z 81..253 = world x -58.7, z -7); shesh 15 m highway-er level-e (0.54 m niche) namche, ribbon terrain follow kore. `src/evlab/EVLabParking.ts` (pure: `LOT`, `DRIVE`, `ROWS`, `SLOTS` {id,row,x,z,yaw}, `AISLE_X`, `CROSS_Z`, `ENTRY_ROUTE`, `LAMPS`, `inParkingZone`) = Step 8-er jonno data. `EVLabParkingLot.ts` (mesh: asphalt, 1 merged paint mesh, kerb, entry road, 4 lamp). `EVLabSite.ts`: entry road-er flat strip (`DRIVE_X`) + street keep-out. `EVLabCampus.ts`: park tree lot-er upor theke filter (baki gach same jaiga-e). `EVLabGrounds.ts`: `buildGrounds(P, ground?)`. `EVLabRoads.ts`: `roadStrip(..., ys?)`. Test: `npm run test:evlab-parking` (31 check). Gari ekhono nei (Step 8). Ager "EVLAB_LOT" (ParkingSite.ts) mall-er start fleet lot, eta alada.
- **Step 8 (done):** Mission-e gari ese park kore. `src/evlab/EVLabArrivalPath.ts` (pure: `planArrivals`, `ARRIVAL_CARS`, route/`sampleRoute`/`roundCorners`, `speedIn/Out`) + `EVLabArrivals.ts` (state machine: wait, driveIn, park, walkIn, inside, walkOut, board, back, turn, driveOut, gone; game-er `VehicleModel`/`PersonModel`, physics nei). `EVLabManager`: `enterStage` -> `arrivals.start()`, `endPresentation`/`leaveStage` -> `arrivals.dismiss()`, update/dispose. Songkha `Q.evlabArrivals` (2/4/5). Test: `npm run test:evlab-arrivals`. Browser-e real model chokh diye dekha baki (node-e VehicleModel chole na).
- **Step 9 (done):** Cycle model (shudhu model, movement nei). `src/evlab/EVLabCycle.ts`: `CycleKit` (shared geometry + material, onek cycle-e ekta kit), `Cycle`/`buildCycle(kit, color)` (diamond frame, fork, handlebar, saddle, 2 spoked wheel, crank + pedal, chain, rear carrier; ~14 mesh, ~2k triangle), `CYCLE` (wheel, axle, saddle, grip, pedal, head tube-er sonkha: rider ar rack-er jonno), `CYCLE_PAINT` (7 rong). +Z samne, +x bam, y=0 maati, origin duto tyre-er majhkhane maatite. `setSteer(rad)` (head tube-er axis-e ghore), `setPedal(a)` (pedal soman thake), `roll(d)` (chaka + crank ghore), `place(x,y,z,heading)`. Test: `npm run test:evlab-cycle`. Browser-e dekha baki.
- **Step 10 (done):** Cycle rack + cycle-wala manush. Rack: plaza-r purbo dike (building-local x 24..34, z 63.5..66.5, portal-er purbo-dokkhin), 6 ta steel hoop (1 InstancedMesh) + 12 bay, shob cycle nose uttore (building-er dike). `src/evlab/EVLabCycleRack.ts` (pure: `RACK`, `CYCLE_SLOTS`, `RACK_PAD`, `inRackZone`), `EVLabCycleRackMesh.ts` (hoop + pad), `EVLabGrounds.ts` e `buildCycleRack`. `EVLabCampus.ts`: rack pad-e porha ekta debdaru (x 34, z 64) filter hoy. Cyclist: `EVLabCyclistPath.ts` (pure: route avenue -> south bridge -> plaza -> bay, `planCyclists`, speed), `EVLabCyclistPose.ts` (pure: rider IK, pa pedal-e, haat grip-e), `EVLabCyclists.ts` (state machine: wait, rideIn, park, walkIn, inside, walkOut, mount, back, turn, rideOut, gone), `EVLabCyclistModels.ts` (real `Cycle` + `PersonModel`). `PersonModel.setSeatedLimbs` (notun, CRLF) = cyclist-er pa/haat pose. `EVLabManager`: `enterStage` -> `cyclists.start(Q.evlabCyclists)`, `endPresentation`/`leaveStage` -> `cyclists.dismiss()`. Songkha `Q.evlabCyclists` (2/3/4). Test: `npm run test:evlab-cyclists` (+ `test:evlab-cycle`-e RIDE = CYCLE check). Browser-e real model chokh diye dekha baki.
- **Step 11 (done):** Bairer bosar bench. 65 ta (plaza 18, island quay 24, lake-er bairer bank 23), 195 ta bosar jaiga. `src/evlab/EVLabBenches.ts` (pure: `BENCH`, `benches()`, `benchSeats()` = Step 12-er jonno {id, bench, x, y, z, yaw}, `benchObbs()`, `inBenchZone()`, `plazaPoles()`), `EVLabBenchMesh.ts` (2 InstancedMesh: wood + steel, castShadow false). `EVLabGrounds.ts`: `buildBenches`, `GroundsBuild.obbs`. `EVLabManager.ts`: bench collider (ghurano box, 65 ta) `obbs` e. Notun tree nei (`parkTrees` ager moto); bench gach, road, bridge, ring road, lake, parking, cycle rack, fountain, lamp ar cyclist/driver route theke dure thake. Test: `npm run test:evlab-benches`. Browser-e real `three` diye chokh-e dekha baki.

## Notun steps (user chaiechhe: 1.1 ar 1.2)

- **1.1b (pore):** podium-e column (tower-er column ground porjonto transfer, lobby-te), hall roof-e long-span truss, mech floor (21, 41, 60, 70) e outrigger / belt truss.
- **1.2a:** lift ar stair-er 2 ta core block ghure lobby-r dike mukh (ekhon door south-e, lobby-r majhkhane mukh korbe). Core, stair, lift, collider, door, test shob update.
- **1.2b:** lift + stair lobby area-ke glass partition diye office area theke alada kora.
- **1.2c:** office-e dhukar jonno alada glass gate/door (floor-e furniture ar collider-er sathe).

## Progress checklist

- [x] 1 Lift gate (done)
- [x] 1.1 Structure frame (done)
- [ ] 1.1b Podium column, hall truss, outrigger
- [ ] 1.2a Core rotate to lobby
- [ ] 1.2b Glass partition lift/lobby
- [ ] 1.2c Separate office gate
- [x] 2 Office/conference khali (done, CHANGES_EVLAB_STEP2_BN.md)
- [x] 3 Mission text remove (done, CHANGES_EVLAB_STEP3_BN.md)
- [x] 4 Green marker (done, CHANGES_EVLAB_STEP4_BN.md)
- [x] 5 Hall-e manush ase, bose (done)
- [x] 6 Mission shesh, chole jay (done)
- [x] 7 Parking lot (done)
- [ ] 8 Gari park
- [x] 9 Cycle model
- [x] 10 Cycle rack + cycle-wala (done, CHANGES_EVLAB_STEP10_BN.md)
- [x] 11 Bairer bench (done, CHANGES_EVLAB_STEP11_BN.md)
- [ ] 12 Bench-e manush
- [ ] 13 Lake water physics
- [ ] 14 Fountain physics
