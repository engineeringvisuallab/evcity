# EVLab Step 1: baki 3 ta kaj (1.2b, 1.2c, 1.1b)

## 1.2b Glass partition (lift/stair lobby)
- Office floor-e (kind `office`, 69 ta level) core block-er majher lobby (x -13.75..13.75, z 28.95..41.05) north ar south dike floor-to-ceiling glass partition diye office theke alada.
- `EVLabTowerLayout.ts`: `LOBBY`, `PART`, `partitionOf(n)`, `partitionSolids(n)`, `nearLobby()`. Desk gulo lobby ar gate-er samner jaiga theke shore gelo.
- `EVLabFloors.ts`: glass panel, gold rail/mullion, lobby-te marble floor.

## 1.2c Office gate
- Prottek partition-e 1ta glass gate (3.0 m chora, 2.6 m uchu, double sliding door, opore fixed glass, gold frame, "OFFICE <-> LIFTS & STAIRS" sign). Collider-e gate shobshomoy khola (player ashe jay), door leaf gulo khola obosthay aka (animation ekhono na).
- Other floor (garden, mech, restaurant, ...) agey moto khola.

## 1.1b Structure
- Notun file `EVLabStructure.ts`.
- Podium: 38 ta column ground porjonto (lobby-te), 3 ta column ramp-e porto bole steel transfer girder-e (`EVLabLobby.ts`-e aka, collider ashe).
- Hall roof: 12 ta steel Warren truss, 70.5 m span (`EVLabHall.ts`).
- Mech floor 21/41/60/70: outrigger truss (majhkhane 1 ta khola panel = doroja) + belt truss (`EVLabFloors.ts`). Outrigger collider `EVLabManager.ts`-e.
- Hisab ar durbol jaiga: `EVLAB_STRUCTURE_ASSESSMENT.md`.

## Test
- `npx tsx scripts/evlab-partition-test.ts`, `npx tsx scripts/evlab-structure-test.ts` (notun, pure layout, pass).
- Ei zip-er package.json-e `test:tower` script chhilo na, tai package.json bodlai ni. Notun test gulo `npx tsx scripts/...` diye chalao.
