# CHANGES_JUNGLE — dui jaygay ghono jongol (jungle spots)

## Ki holo
Notun system banai ni. Age-r ghono bon (`denseAt` / `Config.vegetation.dense`) ta-i reuse kora hoyeche. Shudhu forest district-er baire dui ta gol "jungle spot" jora hoyeche.
Spot-er bhetor ager moto-i: ghono canopy, boro gach (sal, segun, koroi, bot, shimul), understory, bash (lomba), ghas thin.

## Jaygaa (Config.vegetation.jungleSpots)
| id | centre x, z | full radius | fade |
|---|---|---|---|
| A-coast (sea-r kinara, east-hills-south) | 4769, 2296 | 500 m | 150 m |
| B-river (nodi-r pashe, west-delta) | -2718, 1167 | 500 m | 150 m |

Coordinate gulo screenshot-er HUD (camera position) theke pora, tai ekbar game-e verify korte hobe. Radius / fade `Config.ts`-e ek line-e badla jay.

## File
- src/core/Config.ts — `jungleSpots` list (dense-er thik niche)
- src/vegetation/TreePlacement.ts — `denseAt()` ekhon spot-gulo-o dekhe (edge ragged, forest district-er moto)
- scripts/jungle-spots-test.ts — notun test

## Test (npx tsx scripts/jungle-spots-test.ts)
A-coast: circle-er bhetor 849 -> 6838 tree (x8, 87/ha), 9 chunk 321 ms
B-river: circle-er bhetor 1046 -> 6024 tree (x5.8, 77/ha), 9 chunk 348 ms
PASS. Duita spot-i 100% land.

## Dhyan dao
- tree-test.ts (310 problems) ar bamboo-tall-test.ts (FAIL) spot chhara-o ekoi result dey: age theke chhilo, ei step-er karone noy.
- Terrain-er rong (brown -> shobuj) ei step-e kori ni. Gach-er niche ground ekhono brown dekhabe. Dorkar hole alada step.
- Gach/ha beshi mone hole `Config.vegetation.dense.chance` / `understory` komao, ba spot-er `r` chhoto koro.
