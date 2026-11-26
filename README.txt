Ei file gulo project er same path e paste koro (purono file replace hobe):
  src/buildings/models/HospitalInterior.ts   (NOTUN)
  src/buildings/models/MedFurniture.ts       (6 ta notun piece + vertex komano)
  src/buildings/models/health.ts             (hospital e storeys + lobby)
  src/buildings/models/BuildingKit.ts        (interior group alada)
  src/buildings/PlacedBuildings.ts           (kache gele interior dekha)
  scripts/interior-test.ts                   (NOTUN, test)
Test: node --import ./scripts/img-stub.mjs --import tsx scripts/interior-test.ts hospital
