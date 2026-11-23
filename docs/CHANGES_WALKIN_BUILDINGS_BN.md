# Walk-in buildings (bhitore dhuka jay) + doors + mosque wudu

- BuildingKit.ts: boro ground-er box (>=2 m high, room-er moto) ekhon hollow room (4 wall + samner door opening + ceiling/roof). Onno box/cylinder solid collider hishebe record hoy. Door-er opening-e thaka jhanla/painted door shoriye deya hoy. Ucchu floor-e step banano hoy.
- models/ModelInfo.ts (notun): solids / doors / wudu data. BuildingInfo.ts (notun): cache.
- BuildingPhysics.ts: ekta box er jaygay proti building-er asol shape-er collider (wall, door gap, roof, plinth, column).
- BuildingInteract.ts (notun): door leaf (hinge, bhitore khole), E diye khola/bondho; mosque-e oju-khana tap-e E = 8 step oju. MOSQUE_REQUIRE_WUDU = true korle oju chhara hall-er door khulbe na.
- religious.ts: mosque hall-e boro door (3.4 m), oju-khana tap register.
- BuildingManager.ts: thana prototype ekhon model-er nijer collider use kore (bhitore dhoka jay).
- Engine.ts, PlacedBuildings.ts, FillBuildings.ts, RidePrompt.ts: wiring.
- Shudhu ground floor-e dhoka jay (upore sheri nei). Game ar Rapier-e chalano hoyni; 70 model headless-e chalie kono error nei, door/solid dekhechi.
