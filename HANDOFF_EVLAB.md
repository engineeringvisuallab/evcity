# HANDOFF: EVLab area (evcity game)

Notun chat-e evcity.zip attach kore age "Part A" paste koro. Tarpor ek chat-e ek step, "Part C" theke.

**Ekhon porjonto: Step 1 ar Step 1.1 done. Porer step: Step 1.2a (tarpor Step 2).** Zip-e step 1-er changed file jodi na thake, step1 folder-er 2 ta file age paste koro.

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
- Parking: CHANGES_PARKING_LAYOUT_BN.md. Bike: scripts/bike-test.ts.
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
- [ ] 2 Office/conference khali
- [ ] 3 Mission text remove
- [ ] 4 Green marker
- [ ] 5 Hall-e manush ase, bose
- [ ] 6 Mission shesh, chole jay
- [ ] 7 Parking lot
- [ ] 8 Gari park
- [ ] 9 Cycle model
- [ ] 10 Cycle rack + cycle-wala
- [ ] 11 Bairer bench
- [ ] 12 Bench-e manush
- [ ] 13 Lake water physics
- [ ] 14 Fountain physics
