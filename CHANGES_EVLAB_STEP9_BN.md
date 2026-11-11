# EVLab Step 9: cycle model

Ekta simple, realistic city cycle (shudhu model, ekhono chole na). Bike-test.ts-er motorbike (`EVBIKE`) theke alada.

## Ki ki ache
- Diamond frame (top, down, seat tube, head tube, seat stay, chain stay), fork + crown, handlebar (swept-back) + stem, grip, bell, headlight.
- 2 ta spoked wheel (tyre, rim, hub, 16 spoke), rear sprocket, crank + chain ring + 2 pedal, chain (upor-niche), saddle + seat post, rear carrier (jinish rakhar plate) + reflector.
- Size: lomba 1.78 m, chawra 0.68 m (handlebar), uchchota 1.02 m, wheelbase 1.11 m, wheel radius 0.335 m (28").

## Kibhabe use kore
```ts
const kit = new CycleKit();                 // ekbar, shob cycle-er jonno (geometry + material share)
const c = buildCycle(kit, CYCLE_PAINT[2]);   // rong
scene.add(c.root);
c.place(x, floorY, z, heading);              // heading 0 = nak +z
c.setSteer(0.2);                             // handlebar (rad, + = bame), +-0.6 porjonto
c.roll(dist);                                // chaka + pedal ghore
c.setPedal(angle);                           // pedal level thake
kit.dispose();                               // shesh e
```
- +Z samne, +x bam, y = 0 maati, origin maatite duto tyre-er majhkhane.
- `CYCLE.saddle`, `CYCLE.grip` (bam/dan), `CYCLE.pedal`, `CYCLE.axleF/axleR`, `CYCLE.headTop/headBot` = rider (Step 10) ar rack-er jonno.
- Performance: ~14 mesh, ~2k triangle, geometry shared. 10 ta cycle = ~140 draw call, tai Step 10-e shudhu kachher cycle dekhano (ba instancing) bhalo.

## File
- Notun: `src/evlab/EVLabCycle.ts`, `scripts/evlab-cycle-test.ts`, `CHANGES_EVLAB_STEP9_BN.md`.
- Bodlano: `package.json` (`test:evlab-cycle`), `HANDOFF_EVLAB.md`.

## Test
`npm run test:evlab-cycle` (size, tyre maati chhoy, symmetric, geometry share, steering head tube-er axis-e, pedal level, roll, place, rider point), `tsc --noEmit` pass. Browser-e dekha baki (aloya ar rong ke game-er style-e mile kina).
