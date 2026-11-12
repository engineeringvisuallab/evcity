# EVLab avenue / entry road <-> F6 highway: proper join

Problem (screenshot): avenue F6-er upor diye dukhe shesh porjonto (z -7..+12) jachhilo; F6 ekhon 25.4 m choura (half 12.7), tai avenue highway-r lane-er majhe shesh hoto, south carriageway-te ekta ashesh stub; median kata nei, footpath kata nei; lamp (z 253) ar gach (z 246, 258) lane/footpath-er upor.

Fix:
- `EVLabSite.ts`: `EVLAB_ROAD.edgeZ` (-12.7 = F6 north edge), `EVLAB_MOUTHS` (avenue half 12, parking entry road half 5).
- `MedianPlan.ts`: `Crossing.mouth`. Avenue-r mukhe median kata (half + 7 m flare), tai gach/hedge/lamp (crossingZoneHas) auto bad. U-turn 25 m dure.
- `FootpathPlan.ts`: mouth-er pura width footpath level (dropped kerb duto praante).
- `MedianView.ts`: mouth-e median-er gape asphalt patch, zebra nei.
- `EVLabGrounds.ts` / `EVLabParkingLot.ts` / `EVLabRoads.ts`: avenue + entry road highway-r north edge-e shesh (ground follow kore), duto kone gol corner (`cornerFlare`). South stub nei.
- `EVLabGrounds.ts`: lamp z 253 bad (shudhu z 236). `EVLabCampus.ts`: avenue gach shudhu z 234.
- Entry road (x -58.7) hub junction pad-er bhitor, okhane median/footpath nei, tai kata lage nai; shudhu ribbon edge-e shesh.
Test: median/footpath pass; crossing/evlab-site-er 1ta FAIL agei chilo.
