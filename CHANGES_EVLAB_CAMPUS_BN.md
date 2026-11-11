# EVLab campus: bigger tower, lake ring, 4 bridges, jharna (fountains)

## Notun / bodlano file
- `src/evlab/EVLabCampus.ts` (notun, pure): island, lake, ring road, bridge list, fountain list, park tree list.
- `src/evlab/EVLabBridges.ts` (notun): 4 ta bridge (S cable-stayed, N white arch, W stone, E steel truss). Deck ground-er sathe flush, collider ase.
- `src/evlab/EVLabFountains.ts` (notun): jharna / fountain (water drops, 1 ta InstancedMesh). Plaza-te 3 ta, lake-e 8 ta.
- `src/evlab/EVLabRoads.ts` (notun): road ribbon, quay wall, asphalt texture.
- `src/evlab/EVLabParkTrees.ts` (notun): park tree gulo game-er normal tree hishebe chunk-e jure dey.
- `src/evlab/EVLabGrounds.ts`: notun kore lekha (lake water, quay, ring road, plaza, lamp, flag). Purono crude tree/pool bad.
- `src/evlab/EVLabSite.ts`: `height()` e lake carve (lake bed terrain-e kata).
- `src/vegetation/TreePlacement.ts`: `place()` e park tree append.
- `src/evlab/EVLabTowerLayout.ts`: tower 1.6x choura (`TOWER_WIDEN`), 88 floor + roof garden (level 89). Core / stair / lift AGER MOTOI.
- `src/evlab/EVLabLayout.ts`, `EVLabFacade.ts`: spire 442 m.
- `src/evlab/EVLabManager.ts`: bridge collider jure dilam.
- `scripts/evlab-tower-test.ts`: level 68/69 -> `T.top` / `T.roof`, grid X +-85.

## Ja same ase
Podium (150 x 100), lobby, Presentation Hall, 2 ta stair, 2 ta lift (size, speed, door).

## Test
`npm run test:tower` ebong `npm run build` chalao.
