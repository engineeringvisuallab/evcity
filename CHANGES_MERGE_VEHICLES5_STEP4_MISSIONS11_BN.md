# CHANGES - MERGE: vehicles5 + step4 (Station Step 3+4) + Missions v1.1

Banglish note: 3 ta zip ekshathe base game e merge kora hoyeche. Game nosto hoy ni (`tsc --noEmit` clean).

## Ki ki merge hoyeche
1. **evcity_vehicles5** (vehicles 2,3,4,5 cumulative): `src/vehicles/{Cockpit,VehicleModel,Vehicle,VehicleSpec,VehicleLights}.ts`, `CHANGES_VEHICLE_{LIGHTS,STEP3,STEP4}_BN.md`. Engine.ts nei (vehicle er jonno Engine change lage na).
2. **step4-changed** (Step 3 + Step 4): road-side fuel station + charge point (11 + 11) pure map e. Notun: `src/parking/{RoadStationSites,StationLayout,StationPads}.ts`, `scripts/{gen-road-stations,station-structures-test}.ts`, `CHANGES_STEP4_BN.md`. Update: `ParkingSite, ParkingLots, StationStructures, TerrainGenerator (stationPads hook), FuelAreas`, `charge-points-test`, `docs/CHARGING_POINTS.md`, `VEHICLE_ENERGY_HANDOFF_BN.md`.
3. **EVCity_Missions_v1_1**: Presentation Hall mission (`src/missions/Hall*.ts`, `PresentationHall.ts`), update `MissionData/Manager/Types/Voice`, `Minimap.ts`, `PreviewRig.ts`, `mission-test`, `parking-fence-test`. **EVLab campus remove**: `EVLab.ts`, `EVLabBuilders.ts`, `EVLabManager.ts`, `preview-evlab.html` mucha hoyeche; `EVLabSite.ts` thake (level plot, keep-out).
4. **Missions v1.0**: base e age theke chilo, kichu korar chilo na.

## Engine.ts (hand-merge, CRLF rakha)
Kono zip er Engine.ts overwrite kora hoy ni (shob purono). Shudhu ei hunk gulo:
- EVLab: `EVLabManager` import, `evlab` field, constructor block, `evlab.update`, `evlab.dispose` remove.
- Step 3/4: `ROAD_STATION_SITES` import, `CHARGE_LOTS/FUEL_LOTS` import remove, `stationPhysics` (SignPhysics), minimap `mapStations` road sites theke, `stationStructures.update(px, pz, lamp)` + `stationPhysics.update`, `stationStructures.dispose()` (age chilo na), `stationPhysics.dispose()`.
- Base er `MissionMarkers` (import, field, create, update, dispose), `CabinState.rain`, tree-climb hint **rakha**.
- `src/missions/index.ts`: v1.1 er Hall export + base er `MissionMarkers` export, duto-i.

## Check
`npx tsc --noEmit` clean. Test: mission, charge-points, station-structures, parking-fence, pump, tanker, evlab-site, start: PASS. Baki test: base er sathe tulona kore dekha hoyeche, kono notun fail nai (details: HANDOFF.md).
