# CHANGES_GUM_TREE v2 — gum choranor + sob gacher color/look

## Ki holo
1. GUM aro chorano: boro gach-er ~40% ekhon gum (age 26%). Dui shape: `gum` (choru crown, dal beshi chorano) ar `gum2` (lomba, upright, soru crown). Dal-er spread, limbLen, cards barano.
2. Ager gach (sal, segun, koroi etc) NOTUN banai ni, shudhu color thik:
   - pata: beshi ujjol, hue/sat/light variation beshi (halka holud-sobuj theke gaDho sobuj), far LOD (TILE_MASS) o same
   - leafTint: thanda/neutral/gorom sobuj mix
   - bark: kalo-brown theke halka grey-brown, fibre colour variation, moss patch
   - jungle-e gach 30% kalo hoto, ekhon 12% (TreePlacement tint)
3. Lata-pata (jungle floor): fern frond lomba o boro, shrub-e beshi pata + ujjol, lata-r vine beshi (7->9) o lomba, lobed pata boro (0.34 -> 0.42). Card ektu beshi.

## File
TreeTypes.ts, TreeAssets.ts, TreePlacement.ts, TreePreview.ts

## Dhyan dao
- Game/build NOT RUN (node_modules nai). Screenshot dekhe bolo.
- Tomar FPS ager screenshot e 22, 43M triangle: lata/gum card barano ektu cost dibe. Bhari lagle `cards` kom koro (STYLE_GUM/GUM2 5->4, lata/fern 4->3).
- Gum % : TreePlacement `bigKind` er `0.42`.
- Color beshi ujjol/dark: TreeAssets paintSprays light `32 + r()*16` ar paintMass `l` value.

---
# v3 — poRa gach, sukno pata, jungle phul

## Ki holo
1. PORA GACH (deadLog) mati-te dhuke jauya: age shudhu majhkhaner height dhore boshano hoto, tai uchu-nichu jomite ek prante dhuke jeto. Ekhon gach-er majh + duto prante (5 jaygay) ground height dekhe, jodi uchu-nichu beshi hoy (0.45 x scale) tobe oikhane log boshe na, ar bosle shobcheye uchu point-er upor boshe (ar mati-te dhoke na).
   Log aro beshi: logChance 0.08 -> 0.13, log-er pashe pata 3 -> 5. Random yaw age thekei ache, tai elomelo poRe thake.
2. SUKNO PATA beshi dekha jabe: patch-er chance 0.25 -> 0.5, layer 2 -> 3, patch boro (0.7-1.5 -> 1.0-2.0), pata boro ar ujjol (brightness barano), card 38 -> 46.
   Age shudhu ghono jongole hoto; ekhon sadharon bon-eo (kom ghonotto-te, forest density onujayi).
3. JUNGLE-E PHUL (olpo): shudhu jungle floor grass-e. Choto patch (~14 m) e beshi, baki jaygay khub kom. Holud (buttercup), beguni (lavender), lal (poppy), neel (cornflower). Shada phul na.

## File (v3 e notun): Config.ts (deadwood), GrassManager.ts, TreePlacement.ts, TreeAssets.ts

## Dhyan dao
- Game NOT RUN. Log-er jaygay khali thakle (jomi uchu-nichu) normal; log kom lagle Config deadwood.logChance barao, ba `logGround` er `0.45` barao (beshi uchu-nichu jomi-te-o boshbe).
- Phul beshi/kom: GrassManager `pick` er `0.09` (patch) ar `0.008` (baki).
- Sukno pata beshi/kom: Config deadwood.litterChance.

---
# v4 — dal-pala beshi, pata kom, gache gache alada real color

## Ki holo
1. PATA KOM, DAL-PALA BESHI (sob broadleaf gach: choto/boro, sal, segun, koroi, bot, shimul, oak, vase, debdaru, krishnachura; gum bade, oi gum already faka):
   - prottek cluster-e pata 60% kom (cards x 0.4)
   - main dal +2, pashe-r dal +25% (TreeAssets `limb`) tai dal-pala dekha jay
   - dur-er (far) gach-eo pata kom
2. GACHE GACHE ALADA REAL COLOR (gaRir moto: ek model, onek rong): proti gach-er nijer rong, position theke fix hoy (ghurle bodlay na):
   normal sobuj 34%, holud-sobuj 18%, gaDho neel-sobuj 12%, olive 11%, lime 9%, sonali 7%, mora-kamla (rust) 5%, lal-bronze 4%
   Pine, palm, banana, bamboo, krishnachura (lal phul) e eta lage na.
   Choto/boro size age thekei alada (scale random).

## File (v4 e notun): TreeAssets.ts, TreeChunkBuilder.ts (v3-r sob file shoho)

## Dhyan dao
- Game NOT RUN. Pata beshi kom lagle TreeAssets `leafCluster` er `0.4`; dal aro beshi: `limb` er `+ 2` ar `1.25`.
- Rong beshi/kom: TreeChunkBuilder `LEAF_FAMILIES` (prothom number = jomano chance). Lal/kamla kom chaile oi duto-r jaygay sobuj-er chance barao.

---
# v5 — wind sob somoy na: majhe majhe batas

## Ki holo
- Notun file `src/vegetation/WindGust.ts`: wind-er ekta "gust" system. Besirbhag somoy batas NEI (kono kichu nore na). Majhe majhe batas ashe, ~45-80 sec bole (dhire shuru, dhire kome), tarpor 6-13 minute shanto. Gor-e 10 minute-e 1 minute (simulate kore dekhechi: 10.0%). Prottek bar random, ghoRi dhore na. Game shuru-r 20 sec - 4 minute-er moddhe prothom batas.
- Gach: batas-e SHUDHU PATA nore (flutter + ek-pashe-pashe), gach/dal proy nore na (trunk sway 88% kom).
- Ghash (grass): ekoi batas-e nore, batas na thakle sthir. Quality setting-er grassWind age moto kaj kore (shudhu gust-er shathe gun hoy).
- Tune: Config.ts `vegetation.gust` {firstMin, firstMax, lenMin, lenMax, calmMin, calmMax, rise, fall}. Batas beshi chaile calm kom koro (360-780 -> 180-360). Pata aro beshi norle TreeAssets shader-er `0.11`, `0.12`, `0.09` barao.
- TreePreview-te o kaj kore (prothom batas ashte somoy lagbe).

## File (v5 e notun): WindGust.ts (notun), TreeAssets.ts, GrassAssets.ts, Config.ts
## Game NOT RUN.

---
# v6 — puraton gach: pata -50%, dal-pala +200%; lata-pata remove; matir pata single

## Ki holo
1. PURATON GACH (broadleaf, oak, vase, slender, Sal, Segun, Koroi, Bot, Shimul, Debdaru, acacia; GUM bade): pata ager theke 50% kom, dal-pala 3 gun (+200%).
   - Dal: 3 level-e prottek-te 1.44x (1.44^3 = 3). TreeAssets `BRANCH_LEVEL_MUL`.
   - Pata: prottek dal-er dogay gor-e (cards x 0.4 / 6) ta pata (kothao 0, kothao 1). Dur-er gach-e o 12 -> 6.
   - Pine, palm (Narikel/Khejur/Tal), banana, bamboo, Krishnachura-te hat dii ni.
2. LATA-PATA FULL REMOVE: fern, shrub, lata ar kothao boshe na (TreePlacement `cellThicket`). Young tree/bamboo age moto. Kind-gula enum-e ache (number na bodlate).
3. MATIR PATA = SINGLE PATA: ager 46-card patch bondho. Ekhon prottek ta = 1 ta pata (1 card, 2 triangle), notun TILE_SINGLE (ek-ta pata-r chobi). Prottek pata-r nijer sukno rong (brown, tan, rust, straw, olive-brown, lal-brown) position theke. Choto-choto, ilomelo choRano: litterLayers 16, litterChance 0.7, litterScale 0.8-1.4, aroundLog 10 (Config deadwood).
4. ATLAS: tile 800 -> 584 px. Karon: gum tile (ami) + notun single-leaf tile mile 7 tile, 7 x 800 = 5600 px; kichu phone-e 4096-er beshi texture cholbe na. 7 x 584 = 4088 (< 4096). Pata-r chobi ektu kom sharp.

## File (v6 e notun): TreeAssets.ts, TreePlacement.ts, Config.ts, TreeChunkBuilder.ts
## Game NOT RUN. Dal beshi/kom: BRANCH_LEVEL_MUL. Pata kom/beshi: leafCluster `want`. Sukno pata beshi/kom: Config deadwood.

---
# v7 — gaDho sobuj pata + bot gach er dal chhoraye deya

## Ki holo
1. PATA GaDho SOBUJ: ager gach gulo beshi light/holud-sobuj chilo. Ekhon beshirbhag gach gaDho sobuj / neel-sobuj / medium sobuj, kichu olive, shamanno lime, khub kom sonali/morcha. Prottek gach-er nijer rong ager moto position theke fix.
   - `TreeChunkBuilder.LEAF_FAMILIES`: notun chance (gaDho sobuj 36%, neel-sobuj 22%, medium 16%, olive 12%, lime 7%, sonali 4%, morcha 3%). Ager: normal 34%, holud-sobuj 18%, lime 9%, sonali 7%, morcha+lal 9%.
   - `TreeAssets` atlas: pata hue +10 (96 -> 106, lobed 100 -> 110), light -5, far mass tile (paintMass) hue +10 / light -4. `leafTint`: holud card er chance 40% kom ar kom holud.
   - `Config.vegetation.leafDark` [0.88,0.95,0.86] -> [0.82,0.93,0.82].
2. BOT GACH SHONGKUCHITO CHILO -> PROSARITO: age dal gulo uchu-nichu jottopakano dome (~34 m choura, 19 m uchu). Ekhon lomba, shoja, proay horizontal dal, chapta mukut (~45 m choura, 16 m uchu), pillar root (3 -> 5) ar jhulonto shiker (18 -> 28) beshi. Leaf card 12 -> 22 (dal beshi chhoraye geche, pata pashapashi na thake).
   - `Style.horiz` (notun option, shudhu bot-e use): dal shoja rakhe, mati-te dhoke na.
   - STYLE_BOT: startFrac 0.3, spread [1.0,1.3], limbLen 13, lenRatio [0.68,0.6], crownY 10, rx 19, ry 5, clusterR 2.4, horiz 0.6, fork 2.
   - Triangle: bot gach prati ~13.2k -> ~14.5k (bot kom thake, FPS e proay farak na).

## File: TreeAssets.ts, TreeChunkBuilder.ts, Config.ts
## Dhyan dao
- Game NOT RUN (shudhu geometry node e chalay side-view dekhechi, `tsc --noEmit` 0 error). Screenshot dekhe bolo.
- Aro gaDho chao: `leafDark` kombao (0.82 -> 0.75) ba LEAF_FAMILIES-er prothom duto-r chance barao. Aro holud-sobuj chao: LEAF_FAMILIES lime/olive chance barao.
- Bot aro chhoraye chao: STYLE_BOT `limbLen` (13) ar `rx`. Aro uchu chao: `spread` kombao (1.0 -> 0.8) ba `horiz` kombao.

---
# v7b — triangle komano (look na bodle)

## Karon (measure kore)
Sadharon gach (round/oak/vase/slender, kache) proti gach ~8.5-11k triangle, tar 93% DAL-PALA (bark tube), pata shudhu ~740. Sobcheye beshi level-3 shoru dal: 416 ta x 18 tri = 7.5k (bark-er 74%). Karon v6-er dal-pala 3x (`BRANCH_LEVEL_MUL`). Bot gach-er bhag proy 0 (49 chunk e 5 ta), tai bot-er change triangle-er karon na.
Ghono jongol / pahar-e sob gach-er 80%+ triangle ei 4 ta kind (round, vase, slender, oak), pine ~11%.

## Ki holo
- level-3 twig: 4 point -> 3 point (start, majh, dogha), 3 side. Gach-er shape (dal-pala, rng stream) ek-i thake, shudhu shoru dal-er tube kom triangle.
- level-2 dal: 4 side -> 3 side (`SEG` = [9,5,3,3]).
- Fol (near LOD triangle/gach): round 10.9k -> 7.9k (-27%), oak 11.2k -> 8.1k, vase 8.5k -> 6.2k, slender 8.5k -> 6.3k, sal 9.0k -> 6.7k, segun 10.6k -> 7.7k, koroi, shimul, debdaru ~-27%, gum -15%, bot 13.2k -> 11.1k (notun spread + 22 card shoho, ager cheyeo kom). Pine na bodlano.
- Far LOD (42 tri) bodlay ni.

## Aro komate chaile (look badle)
- `BRANCH_LEVEL_MUL` 1.44 -> 1.3 (dal-pala 3x -> 2.2x): ~-20% aro.
- Kache-r (LOD0) chunk er range Config-e kombao: beshirbhag triangle LOD0 chunk-e.
- Majh-LOD (detail 2, level-3 twig bad) alada geometry + TreeChunkBuilder e distance split: boro kaaj, amake bolo.

---
# v7c — bot SIMPLE tree (gum-er moto): kom dal, boro pata, ~2.5k triangle

## Ki holo
- Bot gach ekhon gum-er moto "simple" tree: dal-pala 3x multiplier nai, extra dal nai, prottek dal-er dogay fixed 9 ta boro pata card (2.4-3.6 m). Chhoraye thaka banyan shape thake (lomba proay horizontal dal, chapta mukut ~35-40 m choura, ~15 m uchu), 6 ta buttress, 4 ta pillar root, 14 ta jhulonto shiker.
- Triangle (near LOD) proti bot: 13.2k (shuru) -> 11.1k (v7b) -> ~2.5k (ekhon, ~-80%). Far LOD ager moto (152).
- Notun `Style.simple` option (TreeAssets): `limb` o `leafCluster` e gum-er (airy) moto kaj kore, kintu normal leaf tile. Je kono gach-ke ei option diye simple kora jay (age gum-er jonno `leafTile === TILE_GUM` chilo).
- STYLE_BOT: primary 6, kids [2,2], fork 1, cards 9, clusterR 2.8, card [2.4,3.6], buttress 6, aerial {hang 14, pillars 4}, simple true.

## Tune
- Aro ghono pata: STYLE_BOT `cards` (9) ba `card` size. Aro faka/kom triangle: `cards` kombao.
- Aro dal: `primary` (6) ba `kids` [2,2] barao.
## Game NOT RUN; geometry node-e chalay side-view dekhechi, tsc 0 error.

---
# v7d — choto gach er shonkha 25%

## Ki holo
- Choto gach (broadleaf, oak, vase, slender; uchchota < 10 m) er shonkha 25% kora hoyeche (75% bad). Boro gach, pine, palm, bamboo, shohor-er gach (street/plot) bodlay ni.
- Kon gach thakbe ta position theke fix (hash), tai ghurle/LOD bodlale bodlay na, pop kore na. Kache o dur-er chunk, collider, ghas-er clump shob ek-i gach dhore (`cellTree`/`cellTree2` e filter, `treesInRect` o same).
- Jungle-er thicket-er young tree (`cellThicket`) o ei filter-e pore.
- Config: `vegetation.smallTrees: { maxHeight: 10, keep: 0.25 }`. `keep` 1 = ager moto shob. `maxHeight` barale aro boro gach "choto" dhora hobe.
- Measure (X 4273 Z 2360 er kache, 49 chunk): broadleaf-family gach 28,554 -> 7,996 (-72%; shob choto na, kichu boro thake). Pine/sal/segun ek-i.
- File: TreePlacement.ts (thinSmall/dropSmall), Config.ts.
## Dhyan dao
- Game NOT RUN. Jongol faka lagle `keep` 0.25 -> 0.4. "25% kome" (mane 75% thakbe) chaile `keep: 0.75`.
