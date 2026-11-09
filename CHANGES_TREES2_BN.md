# EVCity - gach step 2 (roadside, median, forest, gram, gache otha)

Eta `evcity_1.zip` (main game) er sathe merge kora: step 1 (notun gach model) + step 2 ekshathe. Zip e shudhu changed file ache, `evcity` er opore same path e copy korle hoy.

## Merge
- Main game e Player.ts, PlayerModel.ts, Engine.ts, i18n/bn.ts alada bodlechhilo: 3-way merge kora, kono conflict hoy ni. Baki file main e bodlay ni, tai shorashori nilam.
- Merged project e `tsc --noEmit`, `tree-test`, `tree-climb-test` pass.

## Footpath e gach (notun)
- Age pit er kendro asphalt theke 1.0 m chhilo, 1.2 m pit 0.4-1.6 m jure thakto, mane 3 m footpath er thik majhkhane. Ekhon `roadside.pitOffset = 0.75`: pit footpath er kerb er pashe (0.15-1.35 m), majhkhane 1.65 m hatar jaygay khali. Pedestrian ~1.85 m e hate, lamp 2.1 m e, tai kono dhakka nei.
- Ulto dike (barir dike) nite chaile `pitOffset` ~2.3 koro, kintu tokhon lamp ar pedestrian er line bodlate hobe.
- Gach er list ar pit ekii loop theke ase, tai ager street gach er upor notun gach double hoy na (purono gach protisthapon, joma noy).

## Ki hoyeche
1. **City road**: footpath e Debdaru / Krishnachura / palm (khejur, narikel), road onujayi pattern (`Roadside.ts`, `STREET_THEMES`). Gach er gap 18-24 m.
2. **Median**: freeway median e Debdaru ba khejur, proti 11-15 m (junction er 16 m bad). Road er upor dariye thake.
3. **Forest er boro gach**: sal, segun, koroi, bot, shimul, jongoler bhetore. Nichu jomi: sob; pahar: sal, shimul, segun (`bigKind`). Scale 0.55-1.15.
4. **Gram**: rural bari (mud-hut, bamboo-hut, house-tin, baganbari ityadi) er 32 m er moddhe narikel, kola, khejur, tal, chhaya gach (`Homesteads.ts`). Pukur/lake/nodir 6-7 m er moddhe, 40 m er niche jomite palm o kola.
5. **Position**: dhalu jomite gacher gora slope x trunk radius nichu (max 1.4 m). Street gach chunk er sima theke bairey jay na.
6. **Gache otha**: gach er gaye hete Space. W/S ooth-nam, A/D ghora, Space lafiye namo, C chhere dao. Kola ar kata gach climbable noy. Kon gach koto uchu: `TREE_TRUNK[kind].climb` (`TreeTypes.ts`).
7. Config: `bigTreeChance`, `bigTreeScale`, `homestead`, `bank`, `player.climb`, `treeSpacing`.

## Test
- `npx tsc --noEmit`: pass
- `scripts/tree-test.ts`: ALL OK
- `scripts/tree-climb-test.ts` (notun, Rapier diye): ALL OK
- `tree-physics-test`, `tree-destruction-test`, `grass-city-test`: pass
- `street-test`, `quality-density-test`: original code-eo fail kore (amar change er karone noy)

## Ja baki ache
- **Game e chokhe dekha hoy ni**: gach er rong, size, median e koto ghono lage, mukut road e jhuke pore kina. Ekhane dekhe `STREET_KIND` (scale/tint), `MEDIAN_TREE_STEP`, `treeSpacing` thik korte hobe.
- Median gach er trunk collider e gari dhakka khay; traffic AI er upor prabhab dekha hoy ni.
- Gram e rural bari shudhu kichu ta, tai narikel/khejur kom (world e prai 300 narikel, 80 kola). Aro chaile `homestead.chance` baro, ba village zone e alada scatter jog korte hobe.
- Pukur alada terrain feature noy, tai "pukur" mane ekhon lake/nodi/pani. Chhoto pukur chaile alada kore model korte hobe.
- Climbing: mobile touch e Space = jump button, C er touch button nei (release shudhu Space diye lafiye hoy). Gach theke porle fall damage nei. Camera pahari gach er mukut er bhetore dhuke jete pare.
- Boro gach er model (sal, shimul, bot) er performance (FPS) low quality tier e dekha hoy ni.
- "Pahare boro tree" amar bojha: pahare kon boro gach boshbe (upore dekho). Onno mane hole bolo.
