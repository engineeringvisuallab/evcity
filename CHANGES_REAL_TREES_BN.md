# CHANGES_REAL_TREES v1 — Step 1: 4 ta jhopalo gach real korano

## Ki holo
`broadleaf`, `oak`, `vase`, `slender` (TreeAssets.ts STYLE_ROUND / OAK / VASE / SLENDER) notun shape:
- trunk lomba ar nongra (8-10.5 m), pata-r dal onek upore (startFrac 0.5-0.65)
- dal kom (primary 4-5), `simple: true` (dal-pala multiplier nai), pata-clump kom (cards 3)
- pata = gum-er jhulonto pata (TILE_GUM, halka grey-green, lime na) -> fanke akash dekha jay
- gum, gum2, sal, segun ar baki kind chhuiyni

## Triangle (near LOD, measured)
broadleaf 7946 -> 2090, oak 8080 -> 1874, vase 6218 -> 1838, slender 6304 -> 1666

## Ar je file
TreePlacement.ts (SMALL_H height 9.4.. -> 15..), TreeTypes.ts (TREE_TRUNK climb height + r)

## Check
- `tsc --noEmit` PASS
- scripts/tree-test.ts: ager moto-i 854757 PROBLEMS (original zip-eo same, amar change-er karon na)
- Game / preview-trees.html browser e RUN HOY NI. Tumi dekhe bolo.

## Adjust
- Aro faka: cards 3 -> 2; aro bhora: cards 4
- Pata boro/choto: `card: [..]`; gum-er moto na chaile leafTile line muche dao
- Gach choto lagle trunkH / crownY komao

---
# Step 2 — jungle ground (pata, phul, ghas) + shadow

## Jungle ground
- Sukno pata ~2.7x beshi: Config `deadwood` litterLayers 3, litterChance 0.7, clusterLeaves [8,20], loneChance 0.45 (Quality treeMul onujayi low preset e kom hoy)
- Phul beshi: GrassManager `pick` patch 0.09 -> 0.26, baki jaygay 0.008 -> 0.05 (holud, beguni, lal, neel; shada na)
- Ghas ferot: Config grass.jungle floor 0.9, chance 0.35, clumpChance 0.1, clear 2 (ager 0 = ghas chhilo na). Beshi/kom: chance, clumpChance

## Shadow
- Gache-r shadow (tree castShadow) ekhon shudhu shadow level "high" e (settings e shadow bar-bar chaile high kora jay). Undergrowth, log, pata-r shadow nai.
- Auto: bhalo PC (high class) -> high e shuru; medium class -> medium, 20 s full speed hole high try kore; low class (durbol PC/phone) -> default "low" shadow (ager moto "off" na), dhimi hole auto off kore dey
- Settings -> Chhaya e off/low/medium/high/auto, jokhon khushi barano jay
- Files: ShadowQuality.ts (TIER_SHADOW low start), Engine.ts, TreeChunkBuilder.ts (setTreeShadows), Config.ts, GrassManager.ts, shadow-quality-test.ts

## Check
tsc PASS, shadow-quality-test PASS. Ager FAIL gulo (deadwood-model-test, grass-city/clump/rock, jungle-thicket) original zip-eo same FAIL. Game e RUN HOY NI.

---
# Step 2b — jongol ghas halka, chhoto, phul-er sathe mil

- Ghas chhoto: Config grass.jungle `tall` 2.2 -> 0.85 (tussock clump `tallClump` 0.7)
- Phul ghas-er cheye ektu uchu: `tallFlower` 2.0 (phul ~0.8 m, ghas ~0.5 m)
- Ghas-er rong halka: GrassManager `JUNGLE_GREEN` (0.17, 0.43, 0.10) + proti tuft e halka holud-sobuj mishel (`pick * 0.7`)
- Shudhu ghas na: lata-pata (fern / shrub / lata) 50% -> 65% (Config dense.thicket.undergrowth)
- Check: tsc PASS. Game e RUN HOY NI.
- Aro halka: JUNGLE_GREEN barao. Ghas aro chhoto: `tall` komao. Phul aro uchu: `tallFlower` barao.

---
# Step 2c — shadow aro beshi + sunlight aro bright

- Sunlight: DayNight.ts din-er sun `lightI` 1.7 -> 2.3 ar 3.0 -> 4.2; ambient `hemiI` 0.98 -> 0.9 ar 1.15 -> 0.95 (sun beshi, ambient ektu kom = shadow ar contrast beshi dekha jay)
- Shadow spec (ShadowQuality.ts): low 2048 / 210 m (ager 1024 / 170), medium 4096 / 300 m (ager 2048 / 260), high 4096 / 450 m (ager 350)
- Gache-r shadow ekhon medium ar high duto-tei (ager shudhu high)
- Low preset default shadow "low" thakbe, kintu low ekhon ager cheye boro
- Check: tsc PASS, daynight-test PASS, shadow-quality-test PASS (high er expectation 350 -> 450). Game e RUN HOY NI.
- Aro bright: DayNight `lightI` barao. Beshi hot/dhimi hole: ShadowQuality SHADOW_SPECS komao.

---
# Step 2d — krishnachura-r lal phul 60%

- PalmAssets.ts STYLE_KRISHNA `bloom` 12 -> 7 (near) ; TreeAssets.ts far LOD phul card 14 -> 14 x 0.6
- Aro kom/beshi: `bloom` number. tsc PASS. Game e RUN HOY NI.
