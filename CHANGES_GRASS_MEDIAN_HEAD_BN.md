# Patch 3: tree grass denser, median uses game grass + concrete walls, steady head

1. Tree-base grass (Config.vegetation.grass.treeBase): reach 2.6 m, chance 1, core 0.75 (full density out to 75 % of the radius). Quality grassDense: low 2, medium 3, high 4.
   GrassPlacement.treeNear uses `core`.
2. Median grass = the game's own grass: GrassPlacement.placeMedian puts tufts (flag 5) on the median soil, GrassManager.pick flag 5 = game grass kinds + game flowers
   (buttercup, lavender, poppy, cornflower). Config.city.median.grass { enabled, perSeg 18, flowerShare 0.14 }. The custom grass meshes of the last patch are gone.
3. Median walls: the real concrete photo of the building kit (BuildingTextures 'concrete') on the kerb walls and tops (MedianView: uv + 2 material groups). Soil stays brown.
4. Head shake: HumanMotion.gait lifts the head by 70 % of the hip drop (max 5 cm) so the hip bounce of each step does not shake the head; relax / resetPose ease it back.
Also in this zip (from patch 2): MedianPlan.ts, RoadSection.ts (median height 0.75).
Not compiled here (no node_modules): run `npm run dev`.
