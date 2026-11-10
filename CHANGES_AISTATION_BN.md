# STEP 2 — AI gari-r energy + station-e fuel/charge

(Ei zip-e Step 1 (overtake) er file-o ache: `AIDriver.ts`, `Route.ts`, `RoadGraph.ts` — shob ekshathe overlay koro.)

## Ki hoy ekhon
- **AI gari-r energy komey** (player-er moto, `Energy.ts` er `consumptionFactor`). Race car (`persistent`) bad. AI kokhono `Config.traffic.energy.floor` (6%) er niche jay na — dry hoye highway block kore na.
- Energy `lowAt` (28%) er niche gele driver **nijer road-e, samne, free station** khoje:
  - petrol/diesel/CNG gari (sedan, jeep, hypercar, auto) -> **fuel station** (`kind: 'fuel'`)
  - electric (rickshaw, bus, evhypar) -> **charge point** (`kind: 'charge'`); bus shudhu lomba bay-te (`hw >= 6`: cp-03, cp-06, cp-09)
  - tanker / tank ei logic-e nei.
- Station-e dhuke: kerb lane (dhire dhire, ~80 m-e) -> driveway -> pump-er jaygay thame (`FuelAreas`-er lot-er bhitore) -> tank/battery bhore (empty->full: fuel 9 s, charge 14 s, kom hole kom; minimum 3 s) -> abar lane-e merge.
- **Queue hoy na**: ekta site-e ek gari. Reserve thakle porer gari ei station skip kore egiye jay. Gari station theke ~42 m dure gele site free hoy; gari remove hole ba 240 s por reservation nijei chhere dey.
- Je gari-r station-er opor (opposite carriageway-te) — shei dike dhoke na (median-er opare).
- Notun gari spawn-e energy 35%..100%. Station samne 900 m-er moddhe thakle 40% chance-e ~12–26% niye spawn hoy, jate player cholchhe dekhte pay.
- Lane-change ekhon dhire hoy (route-e prottek point-e max 0.45 m), tai fast lane theke kerb lane-e jhatka lage na.

## Geometry (headless sim diye check kora)
- **Fuel station**: left turn -> entry lane (x=-8) -> left turn -> island-er **road-er dike** face (`z = 6.0`, corridor use hoy na, solid-er kachhe jay na) -> pump-e stop (`x = 2`) -> right turn -> exit lane (x=+8) -> left turn -> lane.
- **Charge point**: 40 m-er smooth S-curve, bay-r moddhe stop, abar S-curve. Bus-er jonno aligned hoye dhoke (canopy column-e lage na).
- `scripts/station-detour-test.ts`: AIDriver-er pure pursuit + lookahead simulate kore, 22 ta site-er shob variant (lane dur 18/21.8/25 m, sedan/hypercar/jeep/bus) — kono solid/island-e lage na, pump-e thame, lane-e fire ashe.
- `scripts/station-visit-test.ts`: fake highway-te `StationStops` (match, direction, reserve/expire) + `RouteBuilder` (detour build, gap nei, lane drift, cancel).

## Notun / bodlano file
- NOTUN `src/traffic/StationDetour.ts` (pure path), `src/traffic/StationStops.ts` (site<->road, reservation, VisitState).
- `src/traffic/Route.ts`: `visit`, `beginVisit()`, `detour()`, `RoutePt.pump`, lane easing.
- `src/traffic/AIDriver.ts`: 4th ctor param `stations`, `stationLogic()`, pump-e thamar braking, `releaseStation()`.
- `src/traffic/TrafficManager.ts`: `StationStops` banay, spawn energy, remove-e release.
- `src/vehicles/Vehicle.ts`: AI-ro energy kome (floor shoho). `Energy.ts`: shudhu comment. `Config.ts`: `traffic.energy`. `traffic/index.ts`: export.

## Jana kotha / risk
- **Game chalano jayni** (`node_modules` nai). Headless test pass + type-check-e notun error nai (three/rapier type chhara).
- AI gari player-er kachhe (~285 m) thakle-i thake, tai station-visit shudhu player station-er kachhe thakle dekha jabe. Tai low-energy spawn bias deya.
- Station-er bhitore player-er gari dariye thakle AI atke thakbe; 200 s por pump chhere egiye jay.
- Real physics-e (wheel, tyre) tight turn (R=4 m) e ektu alada hote pare; jodi pump island-e lage, `StationDetour.ts`-er `PUMP_Z` baro koro (`R_PUMP` baraio).
- Avenue/arterial-e station nei — shob F1..F7 highway-te.
- Tuning: `Config.traffic.energy` (lowAt, lowShare, fuelSeconds...).
