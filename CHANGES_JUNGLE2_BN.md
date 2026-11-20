# CHANGES_JUNGLE2 — jungle 2.5 gun ghono + lata-pata + ghas er type + poshupakhi

## Ki holo
1. **2.5 gun ghono (TreePlacement.ts, Config.ts)**: jungle-er proti 10 m cell-e `dense.thicket.layers` (4 ta) extra jaygay chhoto gach boshe. Ager gach (canopy + understory) jemon chhilo temni, shudhu extra add hoyeche, tai kono gach jaygay shore ni.
   Test: A-coast core e 117/ha -> 300/ha = **x2.57**. Kombesi korte chaile `dense.thicket.layers` ba `chance` komao.
2. **Latapata (notun 3 ta model, TreeAssets.ts)**: `fern` (felon pata), `shrub` (jhopa), `lata` (lata-e dhaka dhipi, jhulonto lata). Extra gach er 60% ei tinta. Collider nai, tai manush/gari er bhetor dhukte pare. 40% chhoto pine/gach.
3. **Jungle er ghas (GrassPlacement.ts, GrassManager.ts)**: jungle er mati-te ekdom faka thake na; sob cell-e ghas, 2.2 gun lomba, type mishano (wild, lawn, clump, seed, tussock). Notun flag 6.
4. **Poshupakhi (AnimalManager.ts, Species.ts)**: jungle e `JUNGLE_HABITAT` table (horin, bon shukor, hati, bhaluk, moyur, khorgosh). Player jungle e thakle: land animal max +60%, proti species cap +80%, bagh/chitabagh/nekre/shiyal beshi ashe (predator limit x2, hunter chance 60% -> 85%).
5. `TreeTypes.ts`: kind 18/19/20 (fern, shrub, lata), `TREE_KIND_COUNT` 21. `TreePreview.ts` e nam jora (preview-trees.html e dekhte paro).

## File (shudhu changed)
src/core/Config.ts, src/vegetation/{TreeTypes,TreeAssets,TreePlacement,GrassPlacement,GrassManager}.ts, src/animals/{Species,AnimalManager}.ts, src/preview/TreePreview.ts, scripts/jungle-thicket-test.ts

## Test (chalano holo)
- `npx tsx scripts/jungle-thicket-test.ts` PASS (x2.57, lata-pata 36%)
- `npx tsx scripts/jungle-spots-test.ts` PASS
- `scripts/tree-test.ts`: 310 problem, ager moto-i (notun problem 0)
- `grass-clump-test.ts`: ager theke 5 ta FAIL chhilo, ekhono 5 ta (alada, ei step er noy). Ekta fail er nam bodlecche ("clumps exist" ekhon pass, "clump sizes are sane" fail), jungle clump er size er karone, ekhon dekhini.
- Chalate parini (node_modules nai): `npm run build`, animals-test, tree-physics-test, tree-climb-test. Tumi game e dekhe bolo.

## Loader upor provab
লোডের উপর প্রভাব: **মাঝারি** (jungle er vitor)
- Gach/lata instance: jungle e ~2.5x (instanced, draw call proti chunk prati kind e 1 ta kore 3 ta beshi), triangle: chhoto model (fern/shrub/lata ~ kom hajar tri), approximate.
- Low tier: `Q.treeMul` (0.3 / 0.5 / 0.7) thicket ke-o komay; animal cap `Q.landAnimals` theke ashe.
- Shadow: notun mesh alada shadow setting nai, ager tree er moto.
- Ghas: jungle e ghas ber beshi (tile-e placement ~ beshi), grass radius 35 m er bhetor-i.
- Browser e FPS mapa hoyni.

## Dhyan dao
- Gach er niche mati ekhono brown dekhabe (terrain colour, alada step).
- Frame rate kombe: `dense.thicket.layers` 4 -> 2, ba `grass.jungle.chance` komao.

## 2026-11-20: jungle e ghas nai (user: ghas remove, shudhu gach ar lata-pata)
- `Config.ts` grass.jungle: floor/chance/clumpChance = 0, notun `clear: 0.1` (jungle density 0.1 er upore kono tuft/clump hoy na); `GrassPlacement.ts` e duto loop (tuft + clump) e `if (jd > JG.clear) continue`.
- `dense.thicket.undergrowth` 0.6 -> 0.8 (fern / shrub / lata beshi). Model notun add kori ni, ager 3 ta (fern, shrub, lata) i ache.
- Mapa: jungle e ghas OLD ~630k-764k -> NOW 0 (2 ta jungle spot, r 300 m). jungle-thicket-test PASS. Game e dekha NOT RUN, npm run build NOT RUN.

## 2026-11-20: jungle er baire gach boro (user: game er gach boro, jungle er gach thik ache)
- `Config.ts` vegetation: `treeSizeOutside: 1.4` (sadharon gach, gram er gach), `treeSizeOutsideBig: 1.2` (sal, segun, koroi, bot, shimul). `TreePlacement.ts` forestTree / homeTree e scale gunon, jungle (dz = 1) e gunon nai, jungle er kinara dhire dhire milay. Bamboo, street tree, ghas bodlai ni.
- Mapa: khola jayga gach er gor size 0.98 -> 1.36 (+38%), jungle 0.928 -> 0.931 (prai same). jungle-thicket-test PASS. Game e dekha NOT RUN.
