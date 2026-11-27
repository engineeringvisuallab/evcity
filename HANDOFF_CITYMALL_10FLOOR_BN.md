# HANDOFF: City Mall 10 tola (atrium, lift, stair, category shajano shop, e-commerce link)

Notun chat-e evcity zip (full repo) attach kore "Part A" paste koro. Tarpor ek chat-e ek step, "Part C" theke.

**Ekhon porjonto: Step C4 done (27 Nov, code likha + tsc + `npm run test:mall-shops` PASS; `npm run test:mall` ar browser NOT RUN). NEXT: Step C5 (product + example link). Rooftop hotel + cafe: alada step H1 (Part C dekho).**
Note: C1 sandbox-e network chhilo na, tai `npm run test:mall` ar game-e chalano hoy ni. Sudhu tsc-er syntax check ar geometry-r hisab kora hoyeche. Age tumi `npm run test:mall` chalao, fail hole ami thik korbo.

---

## Part A: Context (prothom message-e paste koro)

```
Ami evcity game-er City Mall 10 tola korar kaj korchi. Project zip attach korlam.
Ami Banglish e likhi, tumio Banglish e, chhoto ar shohoj bhashay uttor dao. Ami coding jani na.

Age HANDOFF_CITYMALL_10FLOOR_BN.md pore nao (Part B, C, Done log). Tarpor src/mall/ (MallSite.ts, MallBuilder.ts, MallManager.ts, MallCatalog.ts, MallInteraction.ts, ProductModels.ts) pore nao.

Niyom:
- Ek chat-e ek step. Shudhu changed file dao (repo path soho, zip kore) ar HANDOFF_CITYMALL_10FLOOR_BN.md update kore dao (Done log + "Ekhon porjonto").
- Step shesh hole tsc syntax check ar scripts/mall-test.ts chalao. Network na thakle ba chalate na parle shetake spashto "chalano hoy ni" likho. Kono decision ami na bolle nijer matha theke nebe na, proshno koro.
- Notun grass/tree toiri korbe na. Mall plot / road / MallSite.ts er MALL_POLY, MALL_BUILDING, MALL_POS bodlabe na.
- Cinema/hospital er moto shob interior-e performance rule (PERFORMANCE_RULES.md) mane cholo.
```

---

## Part B: Decision gulo (ami / tumi ja thik korechho)

Tumi bolechho:
1. City Mall-er shob kichu real e-commerce website-er link-er sathe jukto. Ekhon example link; pore real site.
2. Puro mall 10 tola. Majhkhane 20 m diameter-er ekta gap (atrium), nichtola theke top floor porjonto.
3. Atrium-er upor khola rakha jabe na, glass diye dhaka (nahole bristi ashbe).
4. 2 pashe 2 ta lift, 2 pashe 2 ta stair (prottek pashe 1 lift + 1 stair).
5. Prottek tolay shundor kore jinispotro, category onujayi shajano; product onek, boro shundor kore.

Ami je design nilam (C1, tumi apotti korle bolo):
- **Podium + tower**: ager hall (glass wall road-er bend onujayi, ground concourse) thake 1 tola "podium" hishebe, ucho 4.6 m. Tar upor **tower** = 96 x 64 m block (MALL_SIZE), 10 tola x 5 m = 50 m.
- Ground floor khola (tower 40 ta column-er upor, entrance aisle z=0 te column nai). Tower-er glass wall podium-er roof level (4.6 m) theke roof (50 m) porjonto.
- Floor f-er slab: y = f*5-0.4 .. f*5. Floor 0..9. Slab 0.4 m (MALL_SLAB). Upper floor sudhu tower block-er upor (wings-er upor na).
- Atrium: gol, radius 10 m (MALL_ATRIUM_R), floor 1..9-e slab-e hole. Prottek floor-e glass balustrade + handrail (r = 10.3 m), 24 ta collider piece.
- Roof: collider puro rectangle solid (atrium-er upor-o), dekhte atrium-er hole-e **glass dome** (12 steel rib + 3 ring). Tai bristi/helicopter bhitore dhukbe na.
- `holesFor(f)` (MallBuilder.ts): slab-er hole-er list. C2 e lift/stair-er hole ekhane add korbe.
- Ground floor-e ager 12 zone (8 food, 4 fashion) ekhono ache, 4.6 m ceiling-e adjust kora. C3 e 10 tolay bhag hobe.

**Notun decision (26 Nov, C2-er pore, chhobi + uttor diye):**
- Building puro glass outline (`MALL_BUILDING`, prai 330 x 330 m, ~109,500 m2) jure hobe. Majhkhane choto 96 x 64 m block ar nay.
- Podium + tower alada thakbe na: niche theke upor porjonto **same footprint**, 10 tola (ager moto, 15 na).
- Atrium **100 m diameter** (radius 50 m), 20 m na. Majhkhane (block centre, MALL_POS).
- Prottek tolay puro area jure category onujayi onek example jinis. Bahire shudhu choto khola jayga (ager 12 m plaza + walkway).
- Ager C1 (podium + tower 96 x 64) ar C2 (stair/lift x +-13..20 m) ei design-e ar mele na: 100 m atrium-er bhitore porbe. R1-e shoranor kaj.
- Hisab: tola-prothi ~101,650 m2 (outline minus atrium 7,850 m2), 10 tola mile ~1 million m2. Tai floor +-1 visibility, floor-by-floor lazy build, instanced (PERFORMANCE_RULES) bhishon joruri.
- R1 shuru-te tumi bolechho: door 2 ta (road-er dike: east + north), pore tumi bolechho door 4 ta (east, north, west, south), stair + lift 2 jora (east + west, atrium-er dhar-e), bahire shudhu walkway.

---

## Part C: Step prompts (ek ek kore, order-e)

### Step C1: Building shell, atrium, glass roof, floor + collision. DONE (26 Nov)
Dekho "Done log".

### Step C2: Lift + stair (2 pashe). DONE (26 Nov)
Dekho "Done log".
```
Step C2: HANDOFF_CITYMALL_10FLOOR_BN.md-er Part B ar C2 dekho. Age open proshno gulo ek message-e jiggesh koro (tappable hole bhalo), uttor pele code shuru koro. Tarpor:
1. West ar east, dui pashe (local x ~ -hx+8 ar +hx-8, aisle z=0 theke dure, entrance blocking korbe na) 1 ta stair core + 1 ta lift core. Stair: switchback, prottek tola theke tola, dekhte shiri-r dhap, collider smooth (ramp collider, MallManager.createColliders ramp support ache) + side railing.
2. holesFor(f) e stair + lift shaft-er hole (slab-e), jate upor niche jaowa jay. Hole-er pashe railing.
3. Lift: glass cabin, button (call + floor select, key / click), cabin tola tola e uthe nambe, door khole/bondho, player cabin-er sathe uthbe (cabin-er floor kinematic collider), floor number display. Player cabin-e theke porle na.
4. Floor directory board prottek lift-er pashe (ekhon "Floor N" noam, C3 te department name).
5. mall-test: stair diye walker ground theke floor 9 porjonto uthte pare, lift cabin-e uthe tola change hoy.
```
Open proshno (C2 shuru-te jiggesh): lift-er speed, stair-er wide (1.6 m dhorchi), stair/lift ke ground floor-er kon jaygay (z) rakha.

### Step R1: Notun shell: puro outline, 10 tola, 100 m atrium (C1 + C2 notun design-e). DONE (26 Nov)
Dekho "Done log". Nicher prompt purono record.
```
Step R1: HANDOFF_CITYMALL_10FLOOR_BN.md-er Part B "Notun decision" dekho. Age open proshno gulo ek message-e jiggesh koro (tappable hole bhalo), uttor pele code shuru koro. Tarpor:
1. Podium + tower alada na: puro MALL_BUILDING outline-er upor niche theke 50 m porjonto 10 tola, same footprint. Glass curtain wall puro outline-e (prottek floor level-e band, mullion), ground floor-e door (koita ar kothay jiggesh koro). MALL.W/D block (96 x 64), wingPieces, rectPoly, ground column, tower 4 wall bad.
2. Slab = outline polygon minus atrium (holesFor), roof = outline polygon (solid collider) + visible roof.
3. MALL_ATRIUM_R = 50 (100 m diameter), MALL_POS centre-e. Balustrade ring segment barao (24 -> ~64), glass dome 100 m (rise ~10 m, rib ar ring barao), roof atrium-er upor solid thakbe (bristi na dhuke).
4. Stair + lift (MallCores.ts geometry reuse korbe, frame / rotation parameter diye) atrium-er dhar-e shorao, koita jiggesh koro. MallLift / MallLiftPhysics / MallLiftControl reuse, notun kore likhbe na.
5. Column grid, ceiling light, floor tile (instanced) puro 330 m-e. Floor +-1 visibility ar lazy build MallManager-e thik rakho (PERFORMANCE_RULES.md).
6. Ager 12 zone / 36 product atrium-er bhitore pore: R1-e shegulo shoriye dao (temporary khali floor), C3-te puro bhag hobe.
7. scripts/mall-test.ts shob assert notun design onujayi (podium / tower 96 x 64 / atrium 10 m / ramp count bodlabe), walker floor 9, stair, lift.
```
Janar jinis: C1 (podium + tower) ar C2 (core position) ei step-e bodlay. C3 theke ager mototai, kintu floor area ekhon ~101,650 m2.

### Step C3: 10 tolar floor plan + shop layout + catalog (R1-er por; puro outline, ~101,650 m2 per floor). DONE (26 Nov)
Dekho "Done log". Nicher prompt purono record.
```
Step C3: MallCatalog.ts FLOORS ar CATEGORIES 10 tolar jonno bhag koro (nicher proposal), MallBuilder-e 12 zone-er jaygay prottek tolay ~8 ta shop (category zone) boshao: floor patch, shop-er nam sign (4 m ceiling-e thik size), "সব পণ্য দেখুন" board, dept sign (tola-er nam), tola-r shuru-te directory. Aisle ar atrium edge ar stair/lift core khali rakho. MallManager floor visibility (+-1) thik rakho.
```
Tola bhag (proposal, tumi onumodon koro):
| Tola | Department |
|---|---|
| 0 | Supermarket ar khabar (fruits, bakery, drinks, snacks, dairy, grain, sweets, daily) |
| 1 | Nari fashion |
| 2 | Purush ar shishu fashion |
| 3 | Jutha, bag, ghori, goyna |
| 4 | Mobile ar laptop |
| 5 | TV, audio, camera, gaming |
| 6 | Home appliance ar smart home |
| 7 | Furniture ar bichana |
| 8 | Rannaghor, decor, light, bagan |
| 9 | Khelna, boi, sports, gift (+ food court option) |

### Step H1: Rooftop hotel + cafe (tumi bolechho, C3-er pore, alada step; NOT STARTED)
```
Step H1: roof (y = 50, solid collider, dome atrium-er upor) er upor hotel + cafe. Age open proshno jiggesh koro: hotel koto boro (tola), roof-e jabe kibhabe (lift 9 theke roof porjonto barbe, stair, alada lift), cafe kothay.
```
Open: hotel-er size ar roof-e jaowar rasta tumi ekhono bolo ni ("pore thik korbo").

### Step C4: Shop-er shajano (fixture), category onujayi. DONE (27 Nov)
Dekho "Done log". Nicher prompt purono record.
```
Step C4: prottek category-r jonno shop fixture banao (Kit-er moto small helper functions, instanced/merged, PERFORMANCE_RULES.md): khabar-e shelf + fridge + fruit crate, fashion-e hanger rail + mannequin + folded table, electronics-e glass counter + wall TV, furniture-e room set, boi-te bookshelf, ityadi. Notun ProductKind model dorkar hole ProductModels.ts-e add (fridge, mannequin, shelf unit...).
```

### Step C5: Product (onek) + example link
```
Step C5: prottek category-te ~10 ta product (ekhon 3), shob-er example link (SHOP_LINK, your-shop.example.com/product/{slug}). Shelf/rack-e product shajano (turntable sudhu hero product-er jonno). Click = notun tab (MallInteraction.accept range: same floor y +-5). Instanced model dorkar (hajar mesh na). Real site-er link: sudhu SHOP_LINK.baseUrl ar apiUrl bodlabe.
```

### Step C6: Atrium + ground floor decor + wings
```
Step C6: atrium-er ground floor-e fountain / garden island / seating, wings (podium) e plant, bench, info kiosk, entrance polish, outside tower sign, night light (emissive).
```

### Step C7: Performance + test + final
```
Step C7: draw call / triangle ginti, floor visibility (inside: +-1 floor, outside: tower shell sudhu), mobile, scripts/mall-test.ts full chalao, HANDOFF final update.
```

---

## Done log

### Step C1 (26 Nov): shell, atrium, glass roof, floors, collision
**Changed files:**
- `src/mall/MallSite.ts`: MALL_FLOORS 1 -> 10, MALL_FH 14 -> 5, notun MALL_ATRIUM_R = 10, MALL_SLAB = 0.4.
- `src/mall/MallBuilder.ts`: podium (outline wall 4.6 m, doorway 3.6 m + lintel + sign + canopy), wing roof at 5.0 m, 9 upper slab (atrium hole, tile top, trimesh collider), atrium balustrade, 40 ground column, tower glass wall (4 obb) + mullion + floor band (instanced), glass dome + rib, ceiling light (instanced) for floor 1..9, solid roof (collider) + visible roof with hole, ground floor zone sign / pole gulo 4.6 m ceiling-e adjust, `surfaceAt` multi-floor, `holesFor(f)` hook.
- `src/mall/MallManager.ts`: header + start banner text.
- `scripts/mall-test.ts`: notun assert (10 floor, podium/tower wall, roof solid over atrium, 9 floor slab, atrium open, surfaceAt, balustrade walker, floor 9 walker).

**Test:** chalano hoy ni (sandbox-e network + node_modules nai). tsc syntax check (three module bad diye) clean. Geometry hisab (dome base y = 50, railing rotation) python-e check kora.
**Janar jinis:**
- C1-e upor-er tola-e jaowar rasta nai (lift/stair C2). Tai ekhon sudhu bahir theke tower ar atrium dekha jay, ar ground floor-e atrium-er niche dariye upore tarano.
- Upper floor ekhon khali (C3-C5 te bhorbe).
- `MallManager.group.visible` 900 m-e dure gele lukay (C7-e dekhbo tower-er jonno beshi koraa lagbe kina).
- Podium (wings) puro outline-er upor 1 tola; upor-er tola sudhu tower block-er upor.

### Step C2 (26 Nov): lift + stair, 2 pashe
**Tomar decision (C2 shuru-te):** stair + lift atrium-er duipashe (west ar east), stair 2.4 m choura, lift 8 m/s. Stair/lift core-er jaygay ami thik korechi (nicher "Layout").
**Layout (block local, east-er; west = x-e mirror):** stair z 9.5..14.5 (aisle-er dokkhin), x 13..20.1 (switchback, 2 flight, 15 dhap each, ramp 29 deg). Lift z -13.2..-10.4 (aisle-er uttor), x 15.3..17.7, door aisle-er dike, lobby z -10.4..-8. Aisle |z| < 8 khali.
**Notun file (src/mall/):**
- `MallCores.ts`: shob number (STAIR, LIFT, hole, footprint, stairModel, cabin parts, lobby/doorway helper). Pure, three.js nai.
- `MallCoreBuilder.ts`: stair (instanced step/slab/glass rail/handrail, skirt merge), lift shaft + cabin + door leaf + call button + floor plate + directory board (floor group-e, floor-er sathe lukay).
- `MallLift.ts`: lift car logic (door, queue, 8 m/s, braking). EVLabLifts.ts-er moto, mall-er number diye.
- `MallLiftPhysics.ts`: Rapier body (landing door blocker + kinematic cabin), game ar test duitar jonno ek-i code.
- `MallLiftControl.ts`: G (lobby-te lift dak, cabin-e floor bachho), button click, floor panel, player cabin-er sathe uthe (Player.teleportTo), shaft-e atke gele lobby-te phire.
**Changed file:** `MallBuilder.ts` (holesFor + buildCores + ceiling light core-er upor na + surfaceAt hole), `MallManager.ts` (MallLiftControl, click action, G, text), `core/Engine.ts` (1 line: mall-e `teleport`), `evlab/EVLabLiftUI.ts` (optional floor list parameter, EVLab-er jonno kono poriborton nai; mall-er lift-e eta REUSE kora hoyeche), `scripts/mall-test.ts`.
**Test:** `npm run test:mall` chalano hoy ni (sandbox-e network nai, three + rapier install hoy ni). Chalano hoyeche: nijer file gulor tsc type check (three bad diye) clean; pure logic (lift queue, 8 m/s, door doorway-e bondho hoy na, shob door shut thake moving-e) ar geometry (hole overlap nai, ramp continuous, head room 2.1 m) PASS. mall-test.ts-e notun assert likha ache (36 ramp / 72 rail, stair west+east ground theke floor 9, rail well-er pashe, lift 0->9 speed, lift-e uthe floor 5, lift away thakle door shut) kintu Rapier chhara chole ni. **Age tumi `npm run test:mall` chalao, fail hole ami thik korbo.**
**Janar jinis:**
- Lift 0 -> 9 prai 15 s (accel 2.5 m/s2 dhorechi, top 8 m/s). Aro druto chaile `LIFT.accel` (MallCores.ts) baro.
- Ground floor-er 3 ta product-er viewing spot (cx -24 ar 24 zone-er ek ta kore) stair core-er bhitore porche; mall-test-e ota "pending". C3-te shop layout core-er bahire jabe.
- Directory board ekhon "Floor N" noam; C3-te department name (MallCoreBuilder.ts dirTex + MallCores.ts floorNameBn).
- Browser-e ekbar dekhte hobe: stair uthar feel, lift-e player carry smooth kina, stair-er pashe jaygay.
- MallViewer.ts (alada viewer) lift animate kore na (shudhu game-e).

### Step R1 (26 Nov): notun shell, puro outline, 10 tola, 100 m atrium
**Tomar decision (R1 shuru-te):** door 2 ta (east + north, road-er dike), pore bolle 4 ta (+ west z=0 line, + south x=0 line), stair + lift 2 jora (east + west), bahire shudhu walkway.
**Changed files:**
- `src/mall/MallSite.ts`: `MALL_SIZE` bad, `MALL_ATRIUM_R` = 50, notun `MALL_EXTENT`, `MALL_DOORS` = 4 ta (`id` E / N / W / S, `lx lz nx nz`; E = z=0 line east wall, N = x=0 line north wall, W = z=0 line west wall, S = x=0 line south wall; E prothom, spawn / crossing E door-er sathe ager moto).
- `src/mall/MallCores.ts`: `STAIR.x0 = atrium R + 3`, `LIFT.xc = atrium R + 6.5` (shape ar z ager moto). 1 unused variable shoranor jonno edit.
- `src/mall/MallCoreBuilder.ts`: 2 ta unused import bad (kono kaj-er poriborton nai).
- `src/mall/MallBuilder.ts`: puro notun. Podium / tower / block nai. Puro outline-e 10 tola, 50 m glass wall (1 merged mesh), door gap + lintel + sign + canopy + roof billboard (4 ta), slab = outline minus atrium minus stair/lift hole (floor 1..9), roof collider = closed solid (atrium-er upor-o), dome 100 m (rise 10 m, 32 rib + 4 ring, 1 merged mesh), column grid 12 m + ceiling light + atrium rail (64 piece) floor-by-floor lazy (`ensureFloor(f)`), 12 zone / 36 product shoriye dewa (`shops` / `items` khali, C3-te ashbe).
- `src/mall/MallLayout.ts` (NOTUN): column + light position (pure, three.js nai).
- `src/mall/MallColliders.ts` (NOTUN): `createStaticColliders`, `FloorColliders` (floor-er column / rail collider shudhu player jei floor-e), `floorsAround`. Game ar test duitar ek-i code.
- `src/mall/MallManager.ts`: static collider notun function-e, per-floor collider, floor visibility (+-1) + `ensureFloor`, near = 40 m-er moto bahire / bhitore, banner text.
- `src/mall/MallViewer.ts`: 10 floor, minimap polygon + atrium, camera / fog boro, column collide.
- `src/mall/index.ts`: export (`MALL_SIZE` bad, `MALL_EXTENT` + `MALL_DOORS` add).
- `scripts/mall-test.ts`: notun design onujayi (atrium 100 m, 2 door, wall 50 m, column, rail 64, ensureFloor, roof, floor slab, stair, lift).
**Test (sotti obostha):**
- Layout check (tsx, door on outline, normal bahire, door road-er dike, core atrium-er bahire, column aisle / atrium / wall theke dure): PASS (678 column, 669 light per floor).
- tsc (three + rapier stub diye, mall file-er): clean, shudhu 3 ta stub-er noise (`implicit any` callback).
- `npm run test:mall`: NOT RUN (sandbox-e network nai, three + rapier install nai). Ager step (C1, C2) er test-o ekhono chalano hoy ni.
- Browser / headless run: NOT RUN.
**Loder upor probhab: MEDIUM (browser-e mapa hoy ni, NOT RUN):**
- Static: ~25 draw call (glass wall, mullion, band, ground, 9 slab, roof, dome, rib, cores, lift). Floor-prothi lazy: ~4 draw call (column, light, rail glass, handrail), 3 floor visible = ~12.
- Triangle: column ~8k per floor (678 x 12), ground + slab polygon hole sho.
- Collider: static (wall ~60, floor / roof trimesh 12, cores) + 678 column + 64 rail shudhu player-er floor-er. Floor chhere gele remove.
- Shadow: kono castShadow nai, notun light nai. Low tier-e alada kichu kombano hoy ni (column 1 x 1 m, light strip, instanced).
**Janar jinis:**
- Spawn ar E door ager jaygay (E door = z=0 line-er east wall). MedianPlan / Engine / start-test MALL_DOORS-er `side`, `x`, `z` ager moto pay.
- `MedianPlan` MALL_DOORS-er prottek door-er samne zebra crossing khuje (jodi nearest divided road `maxDist`-er moddhe thake). N / W / S door-er jonno kono crossing ashche kina game-e dekhte hobe, na hole Config.ts / MedianPlan bodlano lagbe (tumi bolle korbo).
- Atrium 100 m, tai ground floor-e atrium-er niche floor flat ache (ground tile puro outline-e), upor theke tarano jay.
- Upor-er floor khali (column + light chhara). C3-te shop boshbe, core-er bahire.
- Stair / lift atrium-er rail theke ~3 m / 6.5 m bahire, atrium-er east + west-e. Floor 3 stair-well rail test ager C2 test-er shift kora (Rapier chhara chole ni).
- Browser-e ekbar dekhte hobe: atrium dome, door, floor lazy build hiccup, stair / lift atrium-er dhar-e.

### Step C3 (26 Nov): 10 tolar floor plan + 8 shop per tola + sign / board / directory
**Tomar decision (C3 shuru-te):** tola bhag handoff proposal-i (hotel alada, pore), prottek tolay ~8 shop, atrium-er chardike gol ring + bahir dike aro ring, rooftop hotel + cafe alada step-e (pore).
**Tola bhag:** 0 supermarket ar khabar, 1 nari fashion, 2 purush ar shishu fashion, 3 jutha / bag / ghori / goyna, 4 mobile ar laptop, 5 TV / audio / camera / gaming, 6 home appliance ar smart home, 7 furniture ar bichana, 8 rannaghor / decor / light / bagan, 9 khelna / boi / sports / gift. Prottek tolay 8 ta category = 80 category.
**Shop layout (ASSUMED: tumi number dao ni, `MallShops.ts` SHOP-e bodlano jay):** inner ring r 66..105 m (4 shop, 4 quadrant), ring aisle 12 m, outer ring r 117 m theke glass wall-er 4 m age porjonto (4 shop). 4 ta door-aisle (11 m, axis-er opor) ar atrium-er dhar-er 16 m promenade (stair / lift core ekhane) khali. Shop-er size inner ~4,800 m2, outer ~12,700..17,100 m2. Shop-er bhetore ekhon shudhu floor patch, sign, board; shelf / product pore (C4 / C5).
**Changed files:**
- `src/mall/MallCatalog.ts`: `FLOORS` 10 tola (floor nam + department Bangla / English), `CATEGORIES` 40 theke 80 (8 per tola; purono id gulo rekhe floor bodlano, notun 48 ta category), demo product shudhu purono id-r (mens, womens, kidswear-er demo product bad, kintu notun category-r product C5-te).
- `src/mall/MallShops.ts` (NOTUN): 8 ta shop slot (pure, three.js nai): polygon, sign / board / view pose, `deptPoses()`.
- `src/mall/MallBuilder.ts`: prottek tolar 8 shop (`ensureFloor`): floor patch (8 ta ek mesh, vertex color), shop nam sign (14 x 1.6 m, ceiling-er 4.6 m-e thik, ceiling theke jhulche), "সব পণ্য দেখুন" board (pickable, `categoryUrl`) + post, tola-r nam sign (4 axis aisle-er opor, duidik, ek mesh). `releaseFloor(f)` (dur-e gele mesh + canvas texture + pickable fele deya). `shops` 80 ta (viewPos nijer tolay). Post collider `floorSolids[f]`-e.
- `src/mall/MallCoreBuilder.ts`: lift-er pashe directory board-e prottek tolar department nam.
- `src/mall/MallManager.ts`: player-er +-2 tolar baire floor `releaseFloor`.
- `src/mall/MallViewer.ts`: shop list scroll (80 button).
- `package.json`: notun script `test:mall-shops`.
- `scripts/mall-shops-check.ts` (NOTUN, pure): outline star-shaped, 8 slot, shop outline-er bhetore, 4 door-aisle ar atrium khali, core promenade-e, overlap nai, board post column-e na, 80 category / 8 per tola.
- `scripts/mall-test.ts`: 80 shop, floorSolids = column + 8 post, ensureFloor / releaseFloor assert.
**Test (sotti obostha):**
- `npm run test:mall-shops`: ALL OK (headless tsx chalano hoyeche).
- tsc (three + rapier stub diye, mall file-er): clean, shudhu 3 ta stub noise (`implicit any` callback).
- `npm run test:mall`: NOT RUN (Rapier install nai). Browser / headless render: NOT RUN.
**Loder upor probhab: MEDIUM (browser-e mapa hoy ni, NOT RUN):**
- Prottek floor (lazy, +-1 floor visible = ~3): ~23 draw call (column 1, light 1, rail 2, patch 1, shop sign 8, board 8, post 1, dept sign 1). 3 floor = ~70 + static ~25.
- Canvas texture: floor-e 17 ta (~6 MB GPU), `releaseFloor` +-2 tolar baire fele dey. Floor shuru-te build hole ekbar ~17 canvas ankbe (hiccup hote pare, browser-e dekho).
- Triangle: shop patch ~8 x 200, baki ager moto.
- Shadow: kono castShadow nai, notun light nai.
**Janar jinis:**
- Shop gulo ekhon khali (patch + sign + board), shelf / product C4 / C5-te. Notun 48 category-r demo product nai (C5).
- Sign 14 m choura, 12 m column grid-er column-er bhetor diye jete pare (kono kono sign-er majhe column dhukte pare). Dekhe bolo.
- Sign shudhu ek dik theke dekha jay (centre-er dike), pichone dekha jay na.
- Outer shop boro (~15,000 m2), bhetore dur-e board / sign: tumi bolle shop aro bhag korbo (8 theke 12 / 16, ekhon tumi 8 bolechho).
- MedianPlan-er door crossing (N / W / S) ekhono dekha hoy ni (R1 note).

### Step C4 (27 Nov): shop-er shajano (fixture)
**Tomar decision (C4 shuru-te):** khola plan (shelf / rack-er row, majhe aisle, deyal nai), ~300 fixture per shop (medium), shob solid (ghure jete hobe).
**Fixture:** 16 dhoron (family): gondola shelf, fridge (glass door), crate table, glass counter, hanger rail + mannequin + folded table, TV stand, electronics mix, appliance box, room set (sofa / bed / dining / office), bookshelf, sports rack, cycle rack, plant / decor shelf. 80 category-r prottek-ta ek family-te (`FAMILY_OF`, `MallFixtures.ts`). Fixture = "bay" (1 ta shelf unit ityadi, 3..12 ta box), tai ~230 bay per shop (cap 300, row thin kore) = ~1,400 bay per tola, ~8,000..16,000 box per floor.
**Layout:** row z = 12 m-er gunitok (column z = 6 + 12 m, tai row column-e legey na), bay-er length-er gune x-e boshe, bay shop polygon-er bhetore (0.4 m), board post theke 1 m dure, door aisle / atrium / core khali. Row alternate yaw (0 / pi). Cap-er beshi hole prottek k-tha row rakhe (shob floor-e ek-i row, tai ghonotto ek).
**Changed files:**
- `src/mall/MallFixtures.ts` (NOTUN): 16 family-r bay (box list, pure), `FAMILY_OF`, `layoutShop()` (scanline, cached) -> `bays` + `runs`.
- `src/mall/MallBuilder.ts`: `buildMall(catalog, { fixtureCap })`; prottek shop-e 1 opaque + 1 glass InstancedMesh (instance colour = category colour / fixed), `fixtureGroups[f]`, `shopLayouts`. Collider = bay-er run-prothi 1 ta (`floorSolids`-e, floor-e ~55 ta, 560 ta 10 tolay), column / post-er moto shudhu player-er floor-e.
- `src/mall/MallManager.ts`: `buildMall`-e `Q.mallFixtures`; fixture shudhu player-er floor-e (ar bahir theke ground floor) dekha jay.
- `src/mall/MallViewer.ts`: fixture shudhu current floor-e.
- `src/core/Quality.ts`: notun `mallFixtures` (low 100, medium 200, high 300), PERFORMANCE_RULES.
- `scripts/mall-shops-check.ts`: fixture assert (16 family, 80 category family, bay shop-er bhetore, column / post / aisle-e na, run overlap nai, bay run-e ache, floor-e box ginti).
- `scripts/mall-test.ts`: floorSolids = column + 8 post + run, fixture mesh ensureFloor / releaseFloor, fixture run-e walker atke.
**Test (sotti obostha):**
- `npm run test:mall-shops`: ALL OK (headless tsx chalano hoyeche), fixture assert shoho.
- tsc (three + rapier stub diye, mall + Quality file-er): clean, shudhu 3 ta stub noise.
- `scripts/quality-density-test.ts`: 6 ta FAIL, kintu amar change-er age-o (original Quality.ts diyeo) 6 ta-i FAIL chhilo (tree / rock grass share, high multiplier, Config people / traffic). Amar `mallFixtures` field-er jonno notun fail nai.
- `npm run test:mall`: NOT RUN (Rapier install nai). Browser / headless render: NOT RUN.
**Loder upor probhab: MEDIUM theke BESHI (browser-e mapa hoy ni, NOT RUN):**
- Draw call: prottek shop 2 (opaque + glass) = ~16 per floor, shudhu player-er floor-e dekha jay (baki floor-er fixture hidden). Ager C3-er ~23 per floor-er upor.
- Triangle: 100,000..195,000 per floor (high setting, sudhu current floor-e). medium (200) ~ 2/3, low (100) ~ 1/3. Instance data ~1 MB per floor.
- Collider: ~55 fixture run per floor (column 678 shoho ~740).
- Shadow: kono castShadow nai, notun light nai.
- Low tier: `Q.mallFixtures` 100 (medium 200). Tier build-er shomoy porhe, game chalar shomoy bodle na.
- Floor build (lazy): prottek shop-e ~2 mesh, instance matrix build ~8,000..16,000 box (kichu ms), first-time hiccup hote pare. Dur-e gele `releaseFloor` fele dey.
**Janar jinis:**
- Fixture-e kono product nai (shelf-e sudhu rongin block). Asol product C5-te shelf / rack-e boshbe (turntable shudhu hero product-er jonno).
- Shelf rang = category colour (c1 / c2 / c3 haka). Mannequin box diye banano (simple), pore detail dewa jay.
- Fixture-e click kora jay na (pick shudhu board / lift button).
- Outer shop boro, row 12 m pitch, ~12 / 24 m tei rows: fika jayga beshi lagte pare. Browser-e dekho, ghono / fika bolo (pitch / cap bodlano jay).
- Fixture row alternate yaw-e shob dik-e mukh kore, kintu rail / fridge-er shamne pechon bola jay na (symmetric) .
- Sign (14 m) ar column ager moto kothao dhukte pare; fixture-er upor-e sign nai (sign 2.9 m-er upore, fixture <= 2.1 m).
