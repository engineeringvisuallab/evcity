# J1 junction-e tree - fix

## Keno hoyechhilo
- J1-er upor-er tree gula city plot-er "garden tree" (`PlotTreeData.ts`, fixed list). Plot JSON theke baked, road / J1 check chhilo na. J1 pore design hoyechhe, tai plot-er tree junction-er pavement-e porechhe.
- Test (J1 centre theke 140 m): 14 ta plot tree junction/lane zone-er upor chhilo. Baki sob tree source (forest, street tree, EVLab park) ok chhilo.

## Ki change holo
- `src/vegetation/TreePlacement.ts`: notun `onRoadGround()` (road + kerb + junction pad + J1 pad/lane zone + tree clearance). `place()`-e plot tree-r jonno: road-er upor hole tree skip.
- Ekhon sob road-er upor-er plot tree-i bad jabe (J1 chhara onno road-o).

## Check
- J1 140 m: tree upor-e = 0 (age 14). PASS (tsx script).
- `npx tsc --noEmit`: PASS.
- Game-e chokh-e dekha: NOT RUN.
