# EVLab Tower: structural assessment (step 1.1)

Code: `STRUCT`, `colSide`, `colLoad`, `beamSection`, `columnsOf`, `beamsOf` in `src/evlab/EVLabTowerLayout.ts`. Drawing: `src/evlab/EVLabFloors.ts`.

## Assumptions (gravity frame, tributary-area method)
- Factored floor load qu = 13 kN/m2 (1.2 D + 1.6 L; D = slab, finishes, facade, services; L = office).
- Column spacing about 9 m along the facade. Perimeter column takes bay x hz/2, interior column (line z = centre) takes bay x hz, of every floor above it.
- High-strength tied column: f'c 80 MPa, steel ratio 4 %, fy 420 MPa, phi 0.52, capacity about 42.7 MPa of section. Side = sqrt(load / capacity), rounded up to 50 mm, min 0.60 m, max 2.20 m.
- Beam depth = span / 18 (rounded up to 50 mm, 0.30 to 0.90 m), width about 0.55 x depth. Beams hang under the slab (ceiling), the slab is 0.40 m.

## Result
| Level | Columns | Perimeter | Interior | Deepest beam |
|---|---|---|---|---|
| 1 | 43 | 1.25 m | 1.75 m | 0.80 m |
| 22 | 40 | 1.10 m | 1.50 m | 0.75 m |
| 44 | 34 | 0.85 m | 1.20 m | 0.70 m |
| 66 | 28 | 0.60 m | 0.85 m | 0.65 m |
| 88 | 22 | 0.60 m | 0.60 m | 0.60 m |

Columns follow the facade plate (setbacks), so the count drops going up. No column stands inside the two core blocks. Furniture that would sit on a column is skipped.

## Step 1.1b: podium, hall roof, mechanical floors
Code: `src/evlab/EVLabStructure.ts` (numbers), drawn in `EVLabLobby.ts` (podium), `EVLabHall.ts` (trusses), `EVLabFloors.ts` (mechanical floors). Test: `npx tsx scripts/evlab-structure-test.ts`.
These are preliminary sizes to draw believable members, not a design.

**Podium (lobby).** All 43 level-1 tower columns continue to the ground (38 columns after merging the two that stand at the same spot at each end of the centre line). Load at the foot = tributary load of all floors above + one more slab (the podium roof). Section = sqrt(load / capacity), same capacity as above (80 MPa, 4 % steel). Perimeter 1.25 m, interior 1.80 m at the foot.
Three columns on the north line (x = 0 and x = +-27.6) would stand in the hall ramps. They are carried by steel transfer girders (S460) in the podium roof zone (bottom face 16.3 m, top 19 m, 1.4 m wide, 2.7 m deep: the roof slab is part of the girder). Each girder spans 18.4 m between the neighbouring columns and carries 66 MN: M = P L / 4 = 304 MNm, flange area about 0.30 m2 (a 217 mm plate over 1.4 m), so the two neighbouring columns grow to 1.55 m.
Weak point: a 66 MN transfer on 18 m is very heavy. In a real project the column grid or the ramp positions would be changed to avoid it.

**Presentation Hall roof (109 x 70.5 m, column-free).** Steel Warren trusses every 9 m (12 trusses) span the 70.5 m depth, wall to wall. Roof load 10 kN/m2 factored, so w = 90 kN/m per truss, M = 55.9 MNm, V = 3.2 MN. Depth 2.35 m (the roof zone: bottom chord just under the 17 m ceiling, top chord under the 19 m deck), chord force 23.8 MN, box chord 0.65 m with 30 mm walls (S355), diagonals 0.25 m box.
Weak point: span / depth = 30 is on the slender side. Deflection (about L/160 without camber) needs a camber of about 0.25 m and a stiffer top chord / roof deck acting together. A deeper truss would mean a higher roof.

**Mechanical floors 21, 41, 60, 70.** Outrigger trusses on the tower centre line (z = 35) from the outer face of each core block to the last interior column, floor to ceiling, X-braced, with one open 6-9 m panel as a doorway so that the north and south halves stay connected. Belt truss round the facade (chords at floor and ceiling, one diagonal per bay) tying the perimeter columns together. Sizes follow the interior column size (outrigger chord 0.6 x column, belt 0.4 x column). Closed outrigger panels are walls for the player, the belt truss is in the glass wall plane (no collider).

## Not done yet (next steps)
- Wind and seismic check of the tower with the outriggers (only the members are drawn here, not analysed).
- Moving the lobby ramps or the column grid so that the transfer girders are not needed.
