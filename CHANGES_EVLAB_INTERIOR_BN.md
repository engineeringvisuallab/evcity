# EVLab interior - step 1: real furniture + entry column

Unzip over the project root (same paths as in the project).

## What changed
1. Entry column: the podium column in the middle of the portal (x = 0, z = 48.6) is gone. The tower column above it is now carried by a transfer girder
   over the entrance (x -9.2 .. 9.2); the two neighbouring columns grow to 1.7 m. File: src/evlab/EVLabStructure.ts (`inEntry`).
2. Furniture kit added to the project: EVLabFurniture.ts (Composite / Furnish) and EVLabFurnModels.ts (all models).
   New models: execChair, execDesk, barCounter (bar8 / bar10), boardTable, meetSet44, libStackL, readTable, chairRow, roundTable, parkBench, telescope,
   deskPod (light open-plan pod), rackL0..3 (light racks).
3. EVLabTowerLayout.ts `floorPlan`: every floor now places real kit models (lounge groups, service corners with copier / pantry / cooler / bin,
   fire extinguisher + first aid + clock on the core faces, bars, boardroom tables, library, conference seating, labs, data centre racks).
   Per-level furniture budget FURN_BUDGET = 26000 triangles (the tower test keeps a level under 40k).
4. EVLabFloors.ts: the old flat boxes are gone; all items are drawn as instanced kit models.

## Tests
evlab-tower, evlab-structure, evlab-partition and the other EVLab tests pass (worst level 36.5k triangles).
evlab-fountains, evlab-parking and evlab-site fail on the ORIGINAL code too (not caused by this step).

## Next steps (in order)
- Step 2: the podium lobby (ground floor), Presentation Hall wings and the lift lobby interior with the same kit; check the other column at x = 0, z = 35 (between the cores).
- Step 3: polish: lighting on each floor kind, signs, materials, performance check in the browser.
