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

## Not done yet (next steps)
- Lateral system: core walls + outriggers / belt trusses at the mechanical floors (21, 41, 60, 70).
- Podium: the tower columns have to continue down to the ground through the lobby (transfer), and the 109 m Presentation Hall roof needs long-span trusses.
