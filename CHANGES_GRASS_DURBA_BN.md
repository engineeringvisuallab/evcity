# Grass: dark green durba, 3 triangles per blade, fixed colour, stronger wind

## 1. Kom vertex (GrassAssets.ts)
- Ager blade = 5 triangle = 15 vertex. Ekhon blade = **3 triangle = 5 vertex** (indexed geometry): root theke middle porjonto 1 ta quad (2 triangle) + 1 ta tip triangle.
- Vertex share kora, tai normal smooth (chikon). Grass tuft er total vertex ~3x kom.
- Flower er niche er grass: 9 blade er jaygay 4 blade.

## 2. Fixed dark green durba
- Blade tint fixed (straw / yellow blade nei). `GrassManager.ts`: GREEN = [0.07, 0.22, 0.05], LAWN = [0.08, 0.24, 0.055].
- Tuft er brightness, dry (unchu jomi), yellow, straw: sob bondho, shob grass ek rokom dark green.
- `Config.vegetation.grass.look`: strawShare 0, yellowShare 0.

## 3. Wind animation (jhir jhir)
- Wind ekhon world space e (shob grass ek dike hele), gust wave meadow er upor diye cholche.
- Prottek blade er alada fast flutter (9 ar 12 rad/s). Sway er poriman ager cheye ~3-4x (tip beshi nore, root fixed).
- `setWind` / Quality preset (`grassWind`) agerer moto kaj kore; 0 = still.

## Files
`src/vegetation/GrassAssets.ts`, `src/vegetation/GrassManager.ts`, `src/core/Config.ts`
