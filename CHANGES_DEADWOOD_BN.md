# CHANGES_DEADWOOD - jangle e sukno gach + sukno pata, jangle x1.5 ghono (2026-11-20)

## Ki holo
1. **Jangle 1.5 gun ghono**: `Config.vegetation.dense.thicket.layers` 6 -> 10. Ager gach er jaygay kono nora-chora nai (proti layer er nijer random stream), shudhu notun lata-pata / chhoto gach beshi boshe.
   Test: A-coast core e 599/ha -> 919/ha = **x1.53** (layers 6 er tulonay).
2. **Notun model 1: `deadLog` (sukno gach)** - `TreeKind.deadLog = 21`. Purono, sukno, dhushor-roong gach mati-te pore ache: ~7 m lomba, ~0.9 m mota (scale 1), bhanga dal-er gura, mul-er shikor, bhanga doga. 380 tri (near) / 204 tri (far).
3. **Notun model 2: `leafLitter` (sukno pata)** - `TreeKind.leafLitter = 22`. ~2.6 m choura jayga jure sukno pata (brown / tan / mortcha / khor-roong), kichu sukno dal. 124 tri (near) / 56 tri (far). Notun texture banai ni: ager pata-tile e sukno roong er tint (atlas 4096 er niche-i thake, phone safe).
4. **Placement (`TreePlacement.cellDeadwood`)**: shudhu ghono jangle (jungle density > 0.02) er near chunk (LOD 0). Proti 10 m cell e: porha gach `logChance 0.08` (0.75..1.3 scale, gentle jomi, slope limit er ordhek), 2 layer x `litterChance 0.25` ta sukno pata, ar proti porha gach er pashe `aroundLog 3` ta pata-er stup. Jol, beach, road, city, tree line, dhal beshi hole boshe na. Nijer random stream, ager kono gach soray ni.
5. **Collider nai** (`TREE_TRUNK` r 0.03 < passRadius): gari/manush upor diye jete pare. (Collider chaile: capsule/box dorkar, TreePhysics e ekhon shudhu vertical cylinder.)
6. `footY`: deadwood mati er upor boshe (trunk er moto 0.35 m dhuke jay na).
7. `TreePreview.ts` e notun duto nam (preview-trees.html e dekhte paro).

## Config (komate / barate)
`Config.vegetation.dense.deadwood`: `logChance` 0.08, `logScale` [0.75, 1.3], `litterLayers` 2, `litterChance` 0.25, `litterScale` [0.7, 1.5], `aroundLog` 3.
Frame rate komle: `litterChance` ba `aroundLog` komao, na hole `thicket.layers` 10 -> 8.

## File (shudhu changed / notun)
src/core/Config.ts, src/vegetation/{TreeTypes,TreeAssets,TreePlacement}.ts, src/preview/TreePreview.ts,
scripts/{jungle-thicket-test,tree-test}.ts (update), scripts/deadwood-model-test.ts (notun), scripts/road-rail-clash-report.ts (notun, niche dekho)

## Test (chalano holo)
- `npx tsc --noEmit` clean; `npm run build` OK
- `scripts/jungle-thicket-test.ts` PASS (x1.53, 5.8 porha gach/ha, ~47 pata-stup/ha core e, deadwood off kora jay)
- `scripts/deadwood-model-test.ts` PASS (size, tri, mati er niche jay na)
- `scripts/jungle-spots-test.ts` PASS
- `scripts/tree-test.ts`: 310 problem = ager moto-i (notun problem 0; test e deadwood er height rule alada kora holo)
- Chalate parini: tree-physics-test, tree-destruction-test, tree-climb-test (heavy), GAME E DEKHA NOT RUN - model er roong/look browser e dekhte hobe (preview-trees.html e Dead log, Dry leaves).

## Dhyan dao
- Sukno pata er roong ager sobuj pata-texture er upor tint; jodi beshi holud/lal lage `DRY_LEAF` (TreeAssets.ts) er 4 ta roong badlao.
- Loader/FPS: jangle e instance beshi (x1.5 + porha gach + pata). Mapa hoyni; Quality `treeMul` ke-o komay.
