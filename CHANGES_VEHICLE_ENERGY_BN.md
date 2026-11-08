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
