# Road median: 5x higher, brown soil, grass + flowers

Config.ts (city.median): height 0.75 (was kerbH 0.15, now 5x), colliderH 0.5 -> 0.85, new `grass` block (range, perSeg, blades, flowerShare, height)
MedianPlan.ts / RoadSection.ts: use median.height (so hedges and trees stand on the raised soil)
MedianView.ts: soil is brown earth; grass + coloured flowers as merged meshes per 62 m bucket, drawn only within grass.range (90 m) of the player; no instancing, no wind
Cheap on purpose: ~8 triangles per tuft, 12 tufts per 3 m (x Quality grassMul), no shadows. Slow PC? lower grass.perSeg / grass.range, or grass.enabled = false.
Not compiled here (no node_modules): run `npm run dev`.
