# EVLab tower: area 2.5x (height ager moto 88 floor)

- Tower-er plate (88 floor-er upor-er onsho) north-south-e 2.5x gobhir: depth 29 m -> 72.5 m (level 1), area 2.5x. Width ager moto.
- South face (samner dik) jekhane chhilo sekhanei, plate piconer (north) dike barlo: z -23 .. 49.5 (level 1). Podium (176 x 116 m) ar niche-r Hall/lobby/wing ekdom change hoyni.
- `EVLabTowerLayout.ts`: `TOWER_DEEPEN = 2.5`, `Ring.cz` (plate-er center z), `ringPoints/inRing/slab/glass wall` notun cz diye. Column frame: core line (z 35) + north-e aro row (z 12.5 theke north face porjonto, protiti <= 18 m); beam shob row-e. Furniture/desk grid, meeting room notun north dike-o bhore.
- `EVLabFacade.ts`, `EVLabFloors.ts`: crown mast, logo, sign, deck strip notun center diye.
- `EVLabStructure.ts`: z < 14 (hall/wing-er upor) tower column ground porjonto jabe na, podium roof-e shesh (`carriedByRoof`). Hall column-free thake.
- Test: structure-test-e area/south-face/podium check; tower-test-e walk grid Z0 = -30.
- Boka jaygay: hall roof truss ar wing roof beam ei notun load-er jonno ekhono resize kora hoyni (porer step-e korte pari).
