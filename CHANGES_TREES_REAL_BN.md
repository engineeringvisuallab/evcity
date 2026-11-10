# Trees: only the tank fells them + light footpath

- src/vehicles/VehicleManager.ts : knockTrees() removed. Only the tank (crushTrees) and blasts fell trees. Cars/buses/trucks hit trees like solid objects.
- src/core/Config.ts : passRadius 0.16 -> 0.05, passHeight 1.0 -> 0.6 (thin trees now have a trunk collider; revert these two if too many colliders)
- src/roads/RoadsideView.ts : tree pit soil dark brown -> light stone, pit kerb lighter
- src/roads/FootpathView.ts : kerb / walk / edge colours lighter (white-block look)
- src/roads/RoadMaterial.ts : sidewalk pavers + kerb lighter
Not compiled here (no node_modules in the upload): run `npm run dev` and check.
