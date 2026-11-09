# Ghash 10x ghono + 3x uchu, mission marker e shudhu chhoto cylinder

## 1. Meadow er shadharon ghash (single grass)
- Ghonotto: prottek accepted cell e ekhon `grass.dense` ta tuft (ager 1 ta). High = 10x, medium = 6x, low = 3x (`Quality.ts` e `grassDense`, ar `Config.vegetation.grass.dense` = 10 default).
  Extra tuft gulo oi cell er bhitore, same terrain/slope test, deterministic. Dur er LOD ring e `dense / stride^2` (kom-pokkhe 1), tai dur er ring ta near ring er subset-i thake.
  City lawn (mown) er ghonotto bodlay ni. Extra tuft e phul hoy na (phul er sonkhya ager moto-i).
- Height: `tuft.maxHeight` 0.2 -> 0.6 m (blade ~3-60 cm). Width: `widthScale` 2.2 -> 1.1 (3x uchu, kintu shudhu ~1.5x chowra, tai blade gulo shoja darai).
- Clump (tussock): `clump.maxHeight` 0.5 -> 1.0 m (2x). Verge clump o tai 2x.
- Phul: `tuft.flowerMaxHeight` 0.4 m (2x). City lawn: ager size (`tuft.lawnMaxHeight` 0.2, `lawnWidthScale` 2.2).
- Performance: ekta near tile e ~170 000 tuft. Tai `GrassManager` ekhon tile ta kayekta frame e bhag kore build kore (ek frame e 5-9 ms), jate ekbar e boro hitch na hoy.
  Dhimi device e `grassDense` kombe: Settings e Graphics low/medium nile.

## 2. Mission marker
- Boro sobuj ring, halka disc ar uchu light pillar muche deya hoyeche. Shudhu chhoto cylinder (1 m chowra, 1.5 m uchu) thake.
- Mission logic, arrival radius ager moto-i. Shudhu circle ta ar dekha jay na.

## Files
`src/core/Config.ts`, `src/core/Quality.ts`, `src/world/ChunkLoader.ts`, `src/workers/messages.ts`, `src/workers/chunk.worker.ts`,
`src/vegetation/GrassPlacement.ts`, `src/vegetation/GrassManager.ts`, `src/missions/MissionMarkers.ts`, `scripts/grass-dense-test.ts` (notun), `CHANGES_GRASS10_BN.md`.

## Test
`npx tsc --noEmit` OK. `npx tsx scripts/grass-dense-test.ts`: dense 10 = thik 10x, primary tuft ager moto, deterministic, dur ring subset.
