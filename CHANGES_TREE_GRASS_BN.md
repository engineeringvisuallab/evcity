# Tree-base grass: bigger, fuller, prettier

Config.ts
- treeBase: reach 3.2 -> 4.6 m, chance 0.7 -> 0.95 (wider and thicker ring around every tree)
- tuft.maxHeight 0.64 -> 0.95, widthScale 0.8 -> 1.1
- look.bladeWidth 0.84 -> 1.35 (wider blades, less thin)
- single.blades 3-5 -> 6-9 (fuller tufts)
- denseFade [8,18] -> [12,26]
Quality.ts
- grassDense: low 1, medium 2, high 3 (extra tufts, only inside tree rings because open land has no grass)
City lawn is unchanged. If the game gets slow: lower grassDense (Quality.ts) or single.blades back to [4,6].
Not compiled/tested here: check with `npm run dev`.
