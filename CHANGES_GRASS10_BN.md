# Ghash 10x ghono + 3x uchu, mission marker e shudhu chhoto cylinder

## Update: 5x ghono + dark green + kom load
- Ghonotto 5 gun (`grass.dense` = 5; Quality: high 5, medium 3, low 2).
- Load kom: extra (dense) tuft gulo alada InstancedMesh e, ar tader fade dur kom (`grass.denseFade` = [10, 24] m): 10 m porjonto puro 5x, 24 m e shesh, dhire dhire chhoto hoye mile jay (pop nei).
  Je tile 24 m er dure, tar extra tuft ankai hoy na. Tai 5x ghono shudhu player er kache; dure ager moto (1x). Vertex ar draw load onek kome.
- Ghash er rong dark green: `GREEN` [0.13, 0.28, 0.07] (ager [0.25, 0.42, 0.12]), lawn o dark; holud / khor rong er ghash o kom (`look.yellowShare` 0.12, `strawShare` 0.04).
- Files: Config.ts, Quality.ts, GrassAssets.ts, GrassManager.ts (+ ager ta er GrassPlacement.ts, workers, ChunkLoader)

## Update: shoru, chikon ghash
- Blade er chowra `look.bladeWidth` = 0.42 gun (GrassAssets `blade()`), ar agar dik aro soru (tapering). Tuft er chowra `widthScale` 1.1 -> 0.8.
- Mota broad-leaf `clump` model er bhag 26% -> 8% (shoru `wild` ar `lawn` beshi).

## Update: sob jaygay ghash, 70% durba, aro chikon, 7.5x
- Ghash sob jaygay: `patch.coverage` = 1 (khali patch nei), `minChance` 0.9, ar brown mati prai nei (`terrain.soilFrom/soilTo` 0.8 / 0.95). Road, bari, jol ar khara pahar e ghash hoy na (ager moto).
- 70% durba: meadow er tuft er 70% `lawn` (durba, shoru dhoroner ghash) model, 18% `wild`, baki 12% clump / seed.
- Aro chikon: `look.bladeWidth` 0.42 -> 0.28.
- Ghonotto ager (5x) er 1.5 gun = 7.5x (`grass.dense` = 7.5; Quality: high 7.5, medium 4.5, low 3). Dur er ring e extra tuft nei.

## 1. Meadow er shadharon ghash (single grass)
- Ghonotto: prottek accepted cell e ekhon `grass.dense` ta tuft (ager 1 ta). High = 3x, medium = 2x, low = 1x (`Quality.ts` e `grassDense`, ar `Config.vegetation.grass.dense` = 3 default).
  Extra tuft gulo oi cell er bhitore, same terrain/slope test, deterministic. Dur er LOD ring e `dense / stride^2` (kom-pokkhe 1), tai dur er ring ta near ring er subset-i thake.
  City lawn (mown) er ghonotto bodlay ni. Extra tuft e phul hoy na (phul er sonkhya ager moto-i).
- Height: `tuft.maxHeight` 0.2 -> 0.6 m (blade ~3-60 cm). Width: `widthScale` 2.2 -> 1.1 (3x uchu, kintu shudhu ~1.5x chowra, tai blade gulo shoja darai).
- Clump (tussock): `clump.maxHeight` 0.5 -> 1.0 m (2x). Verge clump o tai 2x.
- Phul: `tuft.flowerMaxHeight` 0.4 m (2x). City lawn: ager size (`tuft.lawnMaxHeight` 0.2, `lawnWidthScale` 2.2).
- Performance: ekta near tile e ~50 000 tuft. Tai `GrassManager` ekhon tile ta kayekta frame e bhag kore build kore (ek frame e 5-9 ms), jate ekbar e boro hitch na hoy.
  Dhimi device e `grassDense` kombe: Settings e Graphics low/medium nile.

## 2. Mission marker
- Boro sobuj ring, halka disc ar uchu light pillar muche deya hoyeche. Shudhu chhoto cylinder (1 m chowra, 1.5 m uchu) thake.
- Mission logic, arrival radius ager moto-i. Shudhu circle ta ar dekha jay na.

## Files
`src/core/Config.ts`, `src/core/Quality.ts`, `src/world/ChunkLoader.ts`, `src/workers/messages.ts`, `src/workers/chunk.worker.ts`,
`src/vegetation/GrassPlacement.ts`, `src/vegetation/GrassManager.ts`, `src/missions/MissionMarkers.ts`, `scripts/grass-dense-test.ts` (notun), `CHANGES_GRASS10_BN.md`.

## Test
`npx tsc --noEmit` OK. `npx tsx scripts/grass-dense-test.ts`: dense 3 = thik 3x, primary tuft ager moto, deterministic, dur ring subset.
