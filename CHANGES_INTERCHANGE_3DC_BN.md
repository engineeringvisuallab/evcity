# INTERCHANGE — Step 3D-C: standalone 3D (road-e boshano lage na)

Ager step-gulor upor apply koro. Game/road-e **kichu bodlay na**: notun file + `index.ts`-e 2 line export.

## Notun
- `src/interchange/InterchangeView.ts` — `buildInterchangeObject(model, opts)` -> `THREE.Group`. Ramp deck (concrete body + asphalt top), main/cross road strip (upper road deck soho), pier / lamp / rail post, arch, pavilion, fountain, palm, billboard, retaining wall, garden/pond disc. Prottek dhoroner jinis = **1 ta InstancedMesh**.
- `src/interchange/viewer.ts` + `interchange-viewer.html` — game chhara alada dekhar page: `npm run dev` -> `/interchange-viewer.html`. Pattern (cloverleaf/diamond/parclo) ar dressing (plain/garden/grand) button-e bodlano jay.

## Pore main game-e add korte
```ts
import { buildInterchange } from './interchange';
import { buildInterchangeObject } from './interchange/view';
const model = buildInterchange({ id, pattern, x, z, y, yaw, main, cross, dressing: 'grand' }, groundFn);
const view = buildInterchangeObject(model, { ground: groundFn, drawRoads: false }); // drawRoads:false = shudhu ramp + structure, road-gulo game-er nijer
scene.add(view.group);
```

## Jante rakho
- **Chalie dekha hoy ni** (ei machine-e `three` nai). Code-ta `three`-er common API-te lekha; `npm run typecheck` + viewer-e chokhe dekhe bolo ki thik na.
- Instance yaw = road-er heading (cos yaw, sin yaw), mesh `-yaw` ghure. Jodi arch/billboard ulta ghure thake, `addInstances`-e `-yaw` ta `+yaw` korlei hobe.
- Arch mesh 20 m chora banano, instance-e z-te stretch hoy.
- LOD (`lodNear/lodFar`) ekhono nei: viewer shob dekhay. Game-e add korar shomoy camera distance loop lagbe.
