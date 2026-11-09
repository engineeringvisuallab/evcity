# Trees step 1: new tree MODELS (not placed in the world yet)

## New files
- src/vegetation/PalmAssets.ts   palm atlas (painted on a canvas, no image files) + models: narikel, khejur, tal, kola, krishnachura
- src/preview/TreePreview.ts + preview-trees.html   dev viewer: `npm run dev`, then open /preview-trees.html (drag = turn, wheel = zoom, buttons = pick a tree, LOD 0/1)

## Changed files (copy over, same paths)
- src/vegetation/TreeTypes.ts       TreeKind 6..16 added, TREE_KIND_COUNT = 17, usesPalmAtlas()
- src/vegetation/TreeAssets.ts      Mesh helpers (ribbon, blob, leafAlong), buttress + banyan aerial roots, sal/segun/koroi/bot/shimul/debdaru, second material (materialFor(kind))
- src/vegetation/TreeChunkBuilder.ts  uses assets.materialFor(kind)
- src/vegetation/TreePhysics.ts     trunk collider entry for every new kind

## Kinds (scale 1 = full-grown tree)
| id | name | height | note |
|----|------|--------|------|
| 6  | Sal         | ~22 m | straight, narrow dense crown |
| 7  | Segun       | ~19 m | big leaves |
| 8  | Koroi       | ~18 m, 23 m wide | flat umbrella |
| 9  | Bot (banyan)| ~24 m, 33 m wide | buttresses, hanging + pillar roots |
| 10 | Shimul      | ~31 m | buttress roots, tiered branches |
| 11 | Narikel     | ~17 m | leaning, ringed trunk, nuts |
| 12 | Khejur      | ~11 m | diamond-scar trunk, date bunches |
| 13 | Tal         | ~22 m | dark straight trunk, fan leaves, fruit |
| 14 | Kola        | ~5.6 m | clump of 3 stems, torn leaves, bunch |
| 15 | Krishnachura| ~12 m, 15 m wide | red flowers |
| 16 | Debdaru     | ~12 m | slim column (roadside) |

## Not done yet
- Placement: the models exist but TreePlacement does not use kinds 6..16 yet (so nothing new appears in the game world).
- City roadside / median planting.
- Climbing.
- Checked only in a separate test renderer (three.js was not available offline): the in-game look (light, shadows, wind) still needs your eyes.
