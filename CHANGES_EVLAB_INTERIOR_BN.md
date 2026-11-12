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

## Step 3 (done): marble floors, no red, better chairs
- EVLabTextures.ts: the red carpet texture is now a polished light-grey marble (`carpet` keeps its name, so every floor that used it - tower offices, boardroom,
  wings, lobby strip, hall, ramps - is marble stone now).
- Red removed: rugRed is sand-coloured, chairRed is charcoal, hall seats (EVLabHall.ts) and chairRow are navy, library book colours changed.
- Chairs redesigned in EVLabFurnModels.ts: officeChair, meetingChair, execChair (contoured seats, curved backs, headrest, T-arms, castors / chrome base, quilted leather), and the chairs in deskPod.
- Worst level 37.2k triangles (limit 40k). Tests as before (fountains / parking / site fail on the original code too).

## Step 3b (done): the middle column of the lobby is gone
- The podium column at x = 0, z = 35 (straight ahead when you walk in, before the hall ramp) is removed too. The tower column above it is carried by TWIN transfer
  girders (x -9.2 .. 9.2, z 34.25 and 35.75, 82 MN each); the two columns beside it grow to 2.5 m (podium maxSide 2.5, was 2.2 for the whole tower).
  Files: EVLabStructure.ts (`inEntry`, PODIUM.maxSide / twinLoad), scripts/evlab-structure-test.ts (test adapted to twin girders).
- Now no column stands on the centre line of the lobby (x = 0) from the portal to the hall.

## Next steps (in order)
- Look at it in the browser and send screenshots / notes of anything that floats, overlaps or looks wrong.
- Polish round: lighting per floor kind, wall art / whiteboards in meeting rooms, hall wing details, performance check.
