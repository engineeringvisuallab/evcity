# Bamboo groves (bash jhar) + dense forest (ghono bon) + green mission circles

Three things in one pass. All three are drawing / placement only: no mission logic and no physics rules changed.

## 1. Mission place = green circular cylinder
- NEW `src/missions/MissionMarkers.ts`: every mission place has a small green cylinder marker (1 m wide, 1.5 m high) at its centre, always visible, plus a ground ring and a faint disc on the arrival circle. The tall light pillar is off (`SHOW_WALL = false`).
- The tracked mission pulses; a passed mission turns dim grey-green; the others are plain green. No collider: the player walks straight through.
- Changed `src/missions/index.ts` (export) and `src/core/Engine.ts` (create after `MissionManager`, `update` next to `minimap.update`, `dispose`). New missions added to `MissionData.ts` get their cylinder automatically.
- Tune: `HEIGHT`, `GREEN`, opacity numbers at the top / in `update()` of MissionMarkers.ts.

## 2. Bamboo (kind 17, `TreeKind.bamboo`)
- Model (`src/vegetation/PalmAssets.ts`): one clump = 26 green culms (10-14 m) that lean out and arch over, pale node rings, drooping sprays of narrow bamboo leaves, thick leaf tufts at the tips. Far LOD = 13 culms. Scale 1 = ~12 m high, ~8 m across.
- ATLAS CHANGE: two new tiles (4 = bamboo culm, 10 = bamboo leaf spray). Every other palm-atlas tile moved by one (`PALM_BARK_TILES` 4 -> 5, atlas 4096 -> 4992 px wide). All of it is inside PalmAssets.ts and uses the constants, nothing else needs to change.
- `TreeTypes.ts`: kind 17, `TREE_KIND_COUNT = 18`, `usesPalmAtlas` includes it, collider r = 1.0 m (not climbable).
- Placement (`TreePlacement.ts`, `bambooTree`): BAMBOO GROVES = noise patches (about 25 % of the low land has some bamboo, about 6 % is a full grove) on land lower than 60 m, gentle slope, not in water, not on roads / city / farm / airport plots. Plus a share of bamboo among the homestead trees (14 %) and pond / river bank trees (20 %).
- Own random stream: no existing tree moved.
- Config: `Config.vegetation.bamboo` (`scale` = patch size, `from` / `full` = how much land, `chance` = clump density, `maxHeight`, `clumpScale`, `homestead`, `bankShare`).

## 3. Dense forest (ghono bon)
- Where: the four `forest` districts of the world map (`WorldRegions.ts`: north-forest, northeast-forest, nw-woodland, east-woodland). The jungle fades in over 260 m at the district edge, with a ragged (noise) edge.
- What changed in `TreePlacement.ts`:
  - canopy chance per 10 m cell 0.55 -> 0.96 and big forest trees (sal, segun, koroi, bot, shimul) 45 % -> 62 % of them,
  - NEW second tree per cell (`cellTree2`, the understory): young shade trees, bamboo thickets on low land (10 %), a few young big trees (10 %). It stands on the opposite half of the cell from the canopy tree, so trunks never overlap,
  - `forestAt()` returns 1 in the jungle, so the grass layer thins out under the dense trees (same rule as for every forest).
- Everything else still applies (roads, water, slope, tree line, city plans, farms, airports keep free).
- Config: `Config.vegetation.dense` (`fade`, `chance`, `bigChance`, `understory`, `understoryScale`, `bambooShare`, `bigShare`).
- Cost: these districts now have about 2.5-3 x more trees. If the frame rate drops: lower `dense.understory` (0.9 -> 0.5) first, then `dense.chance`. The quality preset multiplier (`mul`) still applies.

## Files
New: `src/missions/MissionMarkers.ts`
Changed: `src/core/Config.ts`, `src/core/Engine.ts`, `src/missions/index.ts`, `src/vegetation/PalmAssets.ts`, `src/vegetation/TreeTypes.ts`, `src/vegetation/TreePlacement.ts`, `src/preview/TreePreview.ts` (name of kind 17 in the viewer)

## Check in the game
1. Missions: open the list (`\`), the green pillars must stand on the mission places and match the minimap pins. Track one: it pulses. Pass one: it dims.
2. Bamboo: `npm run dev`, open `/preview-trees.html`, pick "Bamboo (bash jhar)", turn it, LOD 0/1. Then look for groves on low land and behind rural houses / pond banks.
3. Dense forest: fly / drive into the north and east forest districts. Walk in the jungle: trunks must not overlap, the understory must not block roads.

## Not verified
three.js was not available where this was written: the code type-checks (no errors in the changed files) but was NOT run. The look of the bamboo (leaf spray painting, culm curve, colours), the green of the pillar, and the frame rate in the jungle still need your eyes. Send me a screenshot and I will adjust.
