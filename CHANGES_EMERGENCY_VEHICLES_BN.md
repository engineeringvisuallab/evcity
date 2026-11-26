# Ambulance + Police gari (asol gari, building er samne)
- Notun: `AMBULANCE` vehicle (VehicleSpec, VehicleModel, VehicleLights, Gold) - chalano jay.
- Notun: `src/buildings/EmergencyParking.ts` - hospital (2 ambulance), clinic (1 ambulance), thana (2 sedan + 1 jeep police gari) er samne.
- Notun: `src/vehicles/PoliceLivery.ts` - police gari te roof light + navy stripe.
- `VehicleManager.addParkedNear()` - gari shudhu player 160 m er moddhe thakle toiri hoy (performance).
- Building model theke fake gari (jeep/van/ambulance/car) ar fake tree/palm bad (BuildingKit.tree, village.palm no-op). Orchard (fruit/mango) gach rakha hoyeche.
