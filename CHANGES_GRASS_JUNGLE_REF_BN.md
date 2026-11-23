# CHANGES_GRASS_JUNGLE_REF — reference photo moto ghas + jungle-e lata/dal (2026-11-21)

## Ki holo (3 ta chhobi dekhe)
**Chhobi 1 (matir ghas, broad pata + blade mishano) ar chhobi 3 (laal matir upor boro tussock, seed plume shoho):**
1. **Notun 3 ta ghas model** (`GrassAssets.ts`, `TreeTypes.ts` GrassType 12, 13, 14):
   - `leafy` (13): 5-7 ta boro oval pata-r rosette (plantain / dock type). Proti pata midrib-e bhaj kora, midrib ektu ujjol, goray dark. 70 triangle.
   - `trefoil` (14): clover-er moto 3-leaflet pata-r patch (6 ta), patla dnata-y. 132 triangle.
   - `tussockSeed` (12): boro bunch ghas (chhobi 3) -- lomba blade-er fountain, majhkhan theke 14-20 ta patla dnata, dnatar mathay bristle-er seed plume (tan / kichu purple-brown). 860 triangle (near), 400 / 177 (door-e).
2. **Ghas-er blade ekta ekta kore alada** (`bladeTint`, `grass.look.bladeVariation: 1`): kono blade ektu halka, kono ektu gaero, 6 tar 1 ta roddur-lagano holud-shobuj. Ager moto sob blade ek rong chhilo. `0` korle ager moto.
3. **Khola jayga-y tussock ferot** (`grass.patch.clumpChance` 0 -> 0.15): ghas-er patch-gulor bhetor boro bunch ghas boshe. Ekhon prati ~1024 m2 tile-e ~9 ta (outside-city test-e). Tar 38% seed-plume wala (chhobi 3), baki upright / wide tussock. `0` korle ager moto (kono clump nai).
4. **Broad pata ar trefoil ghas-er sathe mishano** (`GrassManager.pick`): khola jayga / gach-er gorar ghas-e 12% leafy + 7% trefoil; jungle-er matite 18% leafy (chhoto chara-gach) + 5% trefoil; city lawn-e 5% + 7% (lawn-er weed / clover). Shukno (dry) jayga-y leafy/trefoil hoy na.
5. Size: `grass.leafy.maxHeight 0.16 m`, `trefoilHeight 0.14 m` (Config). Seed-plume bunch baki clump-er `clump.seedTall 1.3` gun lomba.

**Chhobi 2 (ghono jungle: patla tilted gach, jhulonto lata, tirjok dal):**
6. **Notun 2 ta jungle jinis** (`TreeAssets.ts`, `TreeKind.liana` 25, `TreeKind.tangle` 26):
   - `liana`: canopy theke matite jhulonto 3-5 ta patla kath-lata (8-12 m, kichu bhumi porjonto pouchay na), proti lata-y chhoto pata, ar ekta mota tirjok lata (2 ta strand pakano dori-r moto). ~450 triangle (near).
   - `tangle`: ek jayga theke 4-6 ta patla tilted young gach (4-9 m), pashe chhoto dal, dogay halka pata, ar tader opor diye ekta lomba tirjok dal (chhobi 2-er crisscross dal). ~590 triangle (near).
   - Kono collider nai (gari / manush bhetor diye jay). Shadow dey na.
7. **Placement** (`TreePlacement.cellVines`, `Config.vegetation.dense.vines`): proti 10 m jungle cell-e `lianaChance 0.08`, `tangleChance 0.09` (x jungle density x Quality treeMul). Nijer random stream, tai kono ager gach nore ni. Shudhu near chunk (LOD 0). A-coast jungle core-e: **6.4 liana/ha, 7.6 tangle/ha**. Jungle-er baire 0.
8. Jungle-er ghas-er clump ekhon flag 7 (agey flag 1 chhilo) -- jate jungle-e seed-plume (khola jayga-r jinis) na ashe. Jungle-er clump agey-r moto-i dekhabe.

## UPDATE (painted texture): "shape / rong realistic hoy ni" bolar por
Ager version-er ghas flat rong-er polygon chhilo, tai ekhon **ghas pura bodle painted card** kora hoyeche:
- Notun file `src/vegetation/GrassTextures.ts`: canvas-e ghas ankbe (file lage na). 9 ta tile: solid white (phul/dnata-r jonno), lawn, wild, clump, tussock, tussockWide, tussockSeed (tan / purple-brown plume shoho), leafy (veined pata-r rosette, upor theke), trefoil (clover + pale chevron). Proti blade: tapered, banka, nijer shobuj, midrib, goray dark chhaya, dogay ujjol.
- Ghas-er model ekhon 2-4 ta crossed card (12-16 triangle; ager 400-860). Alpha-test (0.42) + alphaToCoverage. Leafy / trefoil = chhoto cone card. Sob ring-e height same.
- Rong: card-e asol shobuj ankano, tai instance palette ekhon shudhu **tint** (fresh green = kono poriborton nai, yellow-green = ektu garom, golden-dry = ektu brown). Phuler tuft-er blade ager moto dark green.
- Jungle: liana / tangle-e pata beshi (liana 12 ta/lata, tangle spray beshi, boro). Liana ~510 tri, tangle ~640 tri.
- Atlas 15 x 272 px = 4080 px (4096-er niche; tile ekhon 272, ager 448 chhilo, tai ghas-er pic ektu kom sharp -- dorkar hole bolo).
- Perf: ghas ager cheye halka (triangle onek kom); extra: ekta 4032x448 texture.
- **Ekhono game-e dekhi ni.** Atlas-er chhobi headless Chrome-e render kore dekhechi; 3D-te card-er upor-niche (v flip), alpha-edge, mip-e blade pathla hoye jaowa -- ei gulo game-e dekhe bolo. Upside-down dekhle `cardTuft`-er `v` (GrassAssets.ts) ulte dao.

- Rong-er variation (update 2): tuft-er rong palette theke strong tint (fresh / yellow-green / olive / blue-green / deep / lime / golden-dry / straw), brightness 0.8-1.2, ar texture-er bhetor proti blade-er hue-o alada. Shukno (dry) tuft hold-brown hoy, lime noy.

## UPDATE 3 (phul-er ghas realistic): "flower grass gula k real banaw"
- Phuler 6 tuft-o ekhon painted card (atlas-e notun 6 tile, ekhon 15 tile x 272 px = 4080 px). Ager polygon phul (70-280 tri) bad; ekhon proti tuft 12 tri.
- Proti tile: nicher ghas + 5-8 ta banka danta, danta-y pata, 1-2 ta kuri (bud), mathay asol phul: marigold (komola, 2 stor petal, dark eye), buttercup (5 gol holud petal + stamen), lavender (benguni floret-er spike), poppy (laal, crinkle, kalo dag + kalo stamen), cornflower (nil, spiky petal, benguni centre), cosmos (gulapi, 8 petal, holud centre). Proti phul-e halka / gaero variant, kon-ta dik theke dekha (squash/rotate) alada.
- Phuler card `aFlower=1`: ghas-er sobuj tint lage na, nijer rong thake.
- Purono geometric phul / blade code muche dewa hoyeche.
- Ekhono game-e dekhi ni; atlas headless Chrome-e render kore dekhechi.

## UPDATE 4 (2026-11-22): jungle thaplay thaplay + Central station park
**1. Jungle-er liana / tangle ekhon patch-e (sob jaygay noy).** `Config.vegetation.dense.vines.patch {scale:110, from:0.05, full:0.32, boost:2.5}`: 110 m-er noise, ~40% jungle-e vine ase (patch-er bhetor ager cheye ghono, baki jayga-y nai). Liana ar tangle-er alada patch. Mot vine ager ~60%: A-coast core 28 ha-te 103 liana + 147 tangle (age 182 / 215). Beshi/kom: `from` komale patch boro, `boost` baralei ghono. Ager moto sob jaygay: `from -1, boost 1`.
**2. Central station circle (RR-HUB ring, centre 0,300) er bhetor park.** Hotel nei dhore (tumi remove korecho; amar copy-te Placements.ts-e hotel-5star ache, ami ta chui ni, tomar copy-te nai). Layout (`src/park/CentralPark.ts`):
- majhe 15 m plaza + gol fountain (basin 7.5 m, tiered pedestal, jet); 8 ta radial path (3.2 m) plaza theke promenade; 51-55 m ring promenade (bench bhetore, lamp baire).
- 8 sector-e 8 ta oval phuler bed (stone kerb), proti bed-e 2 rong (bahire main, bhetor oval-e second): marigold / buttercup / lavender / poppy / cornflower / cosmos mishiye. Promenade-er baire ring border 6 rong, 12 sector.
- Bagan-er ghas = city lawn; bed-e ar border-e dhono phuler painted tuft (0.5 m grid, ~15 hajar tuft, 1.35x lomba, near ring-e phul, dur-e shobuj).
- Gach 24 ta: 8 narikel plaza-r kache, 16 ta krishnachura / koroi baire lawn-e. Bench 16, lamp 24 (lantern uggol rong, raat-e alo nei, shudhu rong).
- Files: `src/park/CentralPark.ts` (pure layout), `src/park/CentralParkLayer.ts` (mesh, Engine.ts-e jora), `GrassPlacement.ts` (lawn / paths / beds, `placePark`), `GrassManager.ts` (flag 9+: bed flower), `TreePlacement.ts` (`parkTreesInChunk`, park-e random gach nai). Test: `scripts/central-park-test.ts` PASS.
- **Game-e dekhi ni.** Dekhte hobe: (a) rail viaduct / pier / station seri park-er upor porle: grass / gach `railForm.inCorridor` diye bad jay, kintu path / kerb / bench / lamp mesh bad dey na (collider-o nai) -- clash dekhle bolo, oi jayga-r bed/bench soriye dibo; (b) terrain-er upor path ektu uchu / niche (+0.07 m); (c) shop-house-3 (-47.6, 296.8) circle-er bhetor, tomar copy-te thakle park-er upor porbe; (d) FPS (phuler tuft ~15k).
- Kono collider nai (fountain / kerb diye hete jay).

## UPDATE 5 (2026-11-23): pahar-e gach-er variety + mega gach
- **Pahar-e shudhu pine chhilo** (test: 100 m-er upore 91% pine). Ekhon pine max 45% (`vegetation.pineMax`), baki broadleaf / oak / vase / slender mishano + 20% debdaru (`hill.debdaru`) + boro gach (sal, segun, shimul, gum) -- test: pine 41%, broadleaf 13, vase 13, slender 12, oak 10, debdaru 4, boro gach ager cheye beshi.
- **Mega gach** (`vegetation.mega`): boro forest gach (sal, segun, koroi, bot, shimul, gum)-er majhe majhe ekta puro **scale kore** 1.9-2.5x (45-75 m, mota trunk + boro crown, ek-i model). 170 m-er noise patch-er bhetor 8%, baire 0.6% (~5-6% boro gach). Jungle-er shadharon giant 1.8x porjonto, tai mega tar cheye boro. Kom/beshi: `mega.patchChance` / `chance`, off: 0. Collider trunk-er scale-e boro hoy (ager system).
- Test: `scripts/hill-trees-test.ts` PASS. **Game-e dekhi ni**; boro gach-er FPS (crown boro) / shadow dekhe bolo. Mega-r ashe-pashe chhoto gach crown-er niche dhoke jabe (natural).

## UPDATE 6 (2026-11-23): ghas aro realistic rong + ghono
- **Rong:** ager ghas uggol lime-sobuj, sob blade ek rokom chhilo. Ekhon proti blade-er nijer saturation (dull), hue olive theke nil-sobuj, ~14% blade mora (khor / brown), ~25% blade-er dog roddure shukano (sobuj theke khor), mule dark chhaya + chhoto blade-er "skirt" (tuft-er gora bhora). Instance palette: lime 10% -> 3%, olive / deep / straw / dry beshi, brightness 0.8-1.2 -> 0.7-1.06, red cap kom. Roddur-er glow (back-light) 0.55 -> 0.3, tint kom holud.
- **Ghono:** ager ghas shudhu gach-er gorar ring-e (reach 2.6 m) chhilo, khola meadow patch-er code bondho chhilo. Ekhon `grass.treeBase.meadow: 0.5` -- meadow patch (`grass.patch.coverage` 0.3 -> 0.4) o ghas dey, ring reach 3.0, `maxChance` 0.4, `minChance` 0.2, `widthScale` 1.25 (tuft ektu chaura). Mapa (`scripts/grass-density-test.ts`, khola jayga-r 600 tile): tuft **~2.0x** (97k -> 199k). **FPS-e chap porbe** (tumi preset low-e 28 FPS dekhiyechho) -- bhari hole `treeBase.meadow` 0.5 -> 0.25, ba `grass.patch.coverage` 0.4 -> 0.3, ba Quality preset-er `grassMul` komao. `meadow: 0` = ager moto shudhu gach-er gora.
- Game-e dekhi ni; atlas headless Chrome-e render kore dekhechi.

## UPDATE 7 (2026-11-23): gach-er gora ghas, boro pata, narikel, park ghas
- **Gach-er gorar ghas ring bondho:** `grass.treeBase.enabled: false`. Ghas ekhon shudhu patchy meadow (`grass.patch.coverage` 0.4) + jungle floor + city lawn. Meadow-r jonno `maxChance` 0.5, `minChance` 0.28 (ring chhara ghas komle ei duto barao). Mapa: ager gach-er ring-er tulonay ~1.9x tuft. `treeBase.enabled: true` dile ager moto ring.
- **Boro pata ghas (leafy rosette + clover/trefoil) sob jaygay bondho:** `grass.broadLeaf: false`. Oi jaygay choto sorou ekok ghas (durba type lawn) boshe. Model code ache, water lily-r jonno rekhechhi (game-e ekhon water lily nai, tai ami banai ni).
- **Park-er narikel gach remove** (ekhon park-e 16 ta gach: krishnachura / koroi).
- **Park-er lawn 2x lomba:** park-er ghas alada flag (8), `grass.parkLawnTall: 2`. Phul-er bed / border ager moto.
- **Jungle-er single durba-type ghas:** ager moto-i ache, ami chui ni (jungle floor-er `lawn` / `wild` type). Leafy / trefoil bad dewar fole oi share-o ei sorou ghas-e giyeche.
- Game-e dekhi ni. Test: central-park, grass-reference, jungle-vines PASS; typecheck clean.

## UPDATE 8 (2026-11-23): jungle-er ghas = chikon sobuj durba
- Notun ghas type `durba` (GrassType 15) + notun tile (atlas ekhon 16 tile x 256 px = 4096 px): soru, mosrin (glossy highlight), uggol-kintu-prakritik sobuj blade, mora blade nai. Rong palette bad: shudhu halka / gaero sobuj (jungle durba kokhono holud / shukno hoy na).
- Jungle floor mix: 70% durba, 11% trefoil (triple pata), 6% leafy (single boro pata), 12% choto tussock; phul majhe majhe (ager moto patch-e). Jungle chhara sob jaygay boro pata / trefoil bondho (`grass.broadLeaf: false`), jungle-e chalu.
- Atlas tile 272 -> 256 (ghas-er chhobi ektu kom sharp). Test: grass-reference (jungle mix), models (durba 12 tri), typecheck PASS.

## Jeta kori ni
- **fern / shrub / lata (puraton lata-pata) ferot ani ni.** CHANGES_GUM_TREE_BN.md-e tumi bolechile "LATA-PATA FULL REMOVE" -- tai oigulo off-i ache. Notun liana / tangle alada kind, oder sathe milay nai.
- Gach-er tolar mati-r rong (brown) bodlai ni (agey-r note: alada step).
- Chhobi 2-er trunk-e sobuj moss / bark-er notun texture add kori ni.

## File (changed)
`src/core/Config.ts`, `src/vegetation/{GrassTextures (notun),TreeTypes,TreeAssets,TreePlacement,TreeChunkBuilder,GrassAssets,GrassManager,GrassPlacement}.ts`, `src/preview/TreePreview.ts` (notun nam: preview-trees.html-e dekhte parbe: "Liana", "Tangle"). Notun test: `scripts/jungle-vines-test.ts`, `scripts/grass-reference-test.ts`.
Dhyan: `TreeKind` e gum2 (24) er por notun kind (25, 26) bosechhe, tai `kind >= TreeKind.gum` check-gulo `isGum(kind)` e bodlano hoyeche (TreePlacement 2 jaygay, TreeChunkBuilder shadow check). Notun kode-e `>= gum` likho na.

## Test (ei sandbox-e `three` / node_modules nai: three-er jaygay chhoto stub diye chalano)
- `scripts/jungle-vines-test.ts` PASS (A-coast: 182 liana + 215 tangle 28 ha-te; jungle-er baire 0; LOD 1-e 0; Config 0 korle 0; collider radius < passRadius).
- `scripts/grass-reference-test.ts` PASS (type-er mishel, open-land clump flag 1 > 20, jungle clump flag 7, `clumpChance 0` off).
- Model sanity (NaN nai, index thik, ground-er niche jay na): liana / tangle / leafy / trefoil / tussockSeed, tin ring-ei.
- Typecheck (`tsc`, three stub-e): amar bodlano file-e kono notun error nai. `npm run build` ar game-e dekha **CHALATE PARINI**.

## Perf (NOT MEASURED, game-e FPS dekha hoy ni)
- Jungle: liana ~450 tri, tangle ~590 tri (near). Jungle core-e 380 m-er bhetor (~45 ha) ~290 liana + ~345 tangle = hishab-e **~0.33 million triangle** extra (shudhu jungle-e, shudhu near chunk). Eta amar hishab, mapa noy. **Bhari lagle:** `dense.vines.lianaChance` / `tangleChance` 0.08 / 0.09 -> 0.04 / 0.045, ba 0 (off). Aro dekhte chaile baro.
- Ghas: tussockSeed ring 0-e 860 tri, 9 ta/tile. Bhari lagle `grass.patch.clumpChance` 0.15 -> 0.08.
- Ghas-er 3 ta notun type = tile-e max 3 ta extra InstancedMesh (draw call).
- PERFORMANCE_RULES.md-er rule-er sathe milai ni; FPS tumi game-e dekhe bolo.

## Dhyan dao
- Ghas-er rong ekhono instance palette theke ashe (fresh green / olive / ...). Broad pata ektu ujjol (x1.12). Chhobi 1-er moto roddur-er dag (dappled light) ei step-e nai.
- Open land-e ghas ekhono "patch" ar "gach-er gora"-y; patch na thakle khali mati thakbe (agey-r design). Aro beshi / kom chaile `grass.patch.coverage` ba `clumpChance` badlao.
- Trefoil-er leaflet-gulo ekta-r upor ekta overlap kore (alada height-e, tai z-fight hoy na bole mone kori) -- game-e jhilmil korle bolo.


## UPDATE 9 — jungle durba: soru, lomba, same-height, 2/3 pata mile 1 gass
- `GrassTextures.ts`: durba tile ekhon `groups` mode-e ankа — 9ta plant, prottek plant-e 2-3ta soru pata (1.5–2.6 px), prai same height, prottek plant-er nijer halka/gaRo sobuj shade. Mota pata/skirt nai.
- `GrassManager.ts`: jungle clump (flag 7) ekhon durba; jungle floor = 85% durba, 10% trefoil, 5% leafy; durba tint halka..gaRo sobuj (0.82–1.16).
- `GrassAssets.ts`: durba card lomba (h 0.55).
- `Config.ts`: `grass.jungle.chance 0.2→0.3`, `tall 0.85→1.0` (aro ghono, aro lomba). Flower ager moto majhe majhe.
- Test: `scripts/grass-reference-test.ts` flag 7 expectation update.

## UPDATE 10 — jungle e lata (liana) gach besi
- `Config.ts` `dense.vines`: `lianaChance 0.08→0.14`, `tangleChance 0.09→0.09` (same), patch `from 0.05→-0.25`, `full 0.32→0.1`, `boost 2.5→3` (patch boro, beshi jaygay). Test: ~5/ha theke ~25/ha liana.
- FPS komle `lianaChance` komao (ek liana ~300 triangle, shudhu kase LOD 0).

## UPDATE 11 — sob ager (chobi-wala) grass remove, ekhon asol 3D grass
- `GrassAssets.ts`: sob green grass (lawn, durba, wild, clump, tussock, seed, leafy, trefoil) er painted card model bad. Ekhon `bladeTuft`: ek tuft = 2-3ta chhoto plant, prottek plant 2-3 ta single pata (prottek pata 3 triangle), prai same height, plant-er nijer halka/gaRo sobuj, goray gaRo ogray halka. Chobi/texture nai.
- Flower card gulo (marigold, buttercup, lavender, poppy, cornflower, cosmos) ager moto majhe majhe thakbe.
- Material key `grass-fade-v9`. Tuft e ~21-27 triangle (near), kom (far).
- Density/jaygay bodlai nai (GrassManager/Config same). Aro kom/besi chaile `Config.ts grass.*` e chance.

## UPDATE 12 — grass aro ghono, gaRo rong, rong mix (sobuj + mora)
- `GrassAssets.ts` `bladeTuft`: tuft e plant 3→4 (near), 2→3 (mid). Prottek plant er nijer rong: 58% gaRo/moddho sobuj, 16% olive, 12% halka-lime, 8% sukno khor (straw), 6% mora brown. Rong ager cheye gaRo (lime kome gese). Key `grass-fade-v10`.
- `Config.ts`: `grass.maxChance 0.5→0.7`, `grass.jungle.chance 0.3→0.45` (aro ghono). FPS komle eigulo komao.

## UPDATE 13 — player: white helmet + sunglasses
- `people/PersonModel.ts` `ENGINEER_LOOK.headwearColor` → `0xf4f2ea` (white helmet; gari-te boshle-o same look).
- `characters/PlayerModel.ts`: chokhe sunglass (2 ta kalo lens, frame, kan porjonto temple), head bone e lage. `setSunglasses(on)`.
- `core/Engine.ts`: `setSunglasses(environment.lampOn < 0.4 && !mall.inside)` — din e thake, rate (street lamp jolle) ar mall er bhitore khule jay.

## UPDATE 14 — jungle grass aro ghono, chikon, gaRo
- `Config.ts`: `grass.jungle.chance 0.45→0.9`, `floor 0.9→1.0` (prottek jungle cell e grass, ager cheye ~2x).
- `GrassAssets.ts` `bladeTuft(lush)`: jungle (durba / trefoil / leafy) tuft e plant +1, shudhu gaRo sobuj (dry/mora nai), goray onek gaRo, ogray halka (chikon, sleek dekhay). Key `grass-fade-v11`.
- `GrassManager.ts`: durba tint aro gaRo (0.78–1.04).
- FPS komle `jungle.chance` komao (0.6).
