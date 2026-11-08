# Vehicle energy system (fuel + electric), rickshaw 150 km/h, bike removed, reckless rickshaws

## Removed
- `bike` (motorbike) is gone: spec, 3D model, wheels, parking slot, N menu, audio / lights / fire / fine tables, tests. `evbike` (Volt R) stays.

## Rickshaw
- Top speed 150 km/h (`SPEED_BOOST.rickshaw = 3`; set 1 for the old 50 km/h).
- AI rickshaws are reckless (70 % of them): 14 m/s, run red lights, see other vehicles very late -> real accidents with cars (`reckless`, `recklessSpeed` in VehicleSpec, `AIDriver.reckless`). Weight in traffic 0.12 -> 0.2.
- Crashes: damage from 4 m/s delta-v (`crashDv`, cars 9), `fragile` 2; a crash above 6 m/s (`crashEject`) tips it over and throws driver + passengers off.

## Energy (src/vehicles/Energy.ts)
- Full tank / battery = 10 / 15 / 20 km in normal condition: rickshaw 10, evhypar 15, evbike 15, bus 20 (electric); sedan 15, jeep 15, hypercar 10, auto 15, tank 10 (fuel). Suprim, tractor, combine, pickup never run out.
- Condition: > 60 km/h costs more, damage costs more, coasting costs little. Empty = no engine power.
- Only the vehicle the PLAYER drives uses energy (AI traffic does not).
- HUD: bar + estimated km left (bottom-left of the gauge), low / empty toasts.

## Fuel areas (no structures)
- `FUEL_LOTS` in parking/ParkingSite.ts: two empty areas along F4 (kept free of trees, nothing built). Stop inside -> tank fills in ~12 s (`vehicles/FuelAreas.ts`).

## Charging
- Not built. Planned points are listed in docs/CHARGING_POINTS.md. Until then the EVLAB fleet lot is the one charging depot.

## Stations, mine and main station (Step 1: land only, no structures)
- Small stations (`FUEL_LOTS`, parking/ParkingSite.ts): 6 areas along F4 (station-1..6). Standing still inside = fuel vehicles fill the tank, electric vehicles charge, and the player PAYS Gold (full tank 400, full battery 250; part-full costs less; no Gold = no refill). Prices: vehicles/FuelAreas.ts.
- Mine load area (`MINE_LOAD`, inside eng-mining, x -3320..-3280, z -420..-380): standing still loads fuel into a vehicle that can carry it (`CARGO_CAP`: rickshaw 0.5, auto 1, sedan 1, jeep 2, pickup 4, bus 4 m3; 8 s for a full load). HUD shows the load.
- Main station area (`MAIN_STATION_LOT`, start side of F4 next to station-1): standing still unloads (6 s) and pays 10000 Gold for 4 m3, proportionally less for less (`DELIVERY_BONUS`, `BONUS_CARGO`). Repeatable.
- Free EVLAB charging depot stays until real charge points are built.
- Still to check in game: the mine load spot must be drivable (move MINE_LOAD if not); F4 must be long enough for stations 3-6 (s up to 352).
