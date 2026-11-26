# Step 3: compact building interior (handoff)

## Shesh (layout test: 7 model, 0 problem; typecheck clean)
- `BuildingKit.ts`: `k.storeys(y0, floors, { heights?, floorH?, side, furnish })`, storey wise alada height.
- `HouseInterior.ts`: partition, bathroom, dayFloor, nightFloor (brick house, townhouse-3).
- `ShopInterior.ts`: shopFloor (ground shop 3.6 m) + upore flat (shop-house-3/4).
- `ApartmentInterior.ts`: lobbyFloor, flatFloor (landing side onujayi mirror), furnishApartment (apt-slim-9), furnishApartmentShops (apt-slim-14).
- `Furniture.ts`: shelf, shopCounter, crates.
- `compact.ts`: townhouse-3, shop-house-3/4, apt-slim-9, apt-slim-14 e `k.storeys` wire kora.
- apt-slim-9: pilotis soriye ground lobby; body ground (y=0.2) theke shuru. apt-slim-14: ground shop box + 12 flat floor ek box.

## Baki
1. `npm run build` (tsc + vite) real project e.
2. Browser e dekha: stair hole, railing, lobby/shop door, balcony ar window mil, lobby glass.
3. apt-slim-14 er uporer 2 set-back floor ekhono solid block (engine shudhu ground-level box ke room banay; elevated room er jonno claimBox + floor support + stair change lagbe).
4. Baki compact model (slim tower, office, hotel, bank) e interior nai.
