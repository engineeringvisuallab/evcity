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

## Step 2 (done): ground floor
- EVLabLobby.ts: reception desks, sofas and plants are now kit models (reception, sofaLeather / sofaVelvet scaled, palm1 / palm2); added two lounge groups
  (x +-66, z 47), four round dining tables, benches at the portal, fire extinguishers, first aid boxes and clocks on the south wall.
- EVLabWings.ts: Main Office = deskPod workstations, real reception counter + waiting sofa, meeting tables with chairs, filing cabinets, plants.
  Engineering Lab = labBench with stools, light racks on the north wall (the motor test rigs with the spinning rotor are unchanged).
- The column at x = 0, z = 35 (between the core blocks) stays: carrying it on a girder fails the engineering checks (column would need 2.4 m, flange plate 541 mm).

## Next steps (in order)
- Look at it in the browser and send screenshots / notes of anything that floats, overlaps or looks wrong (model sizes, wall items, colours).
- Polish round: lighting per floor kind, wall art / whiteboards in meeting rooms, hall wing details, performance check.
