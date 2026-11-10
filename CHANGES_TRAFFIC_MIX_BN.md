# TRAFFIC MIX — truck kom, car beshi, hypercar + evhypar road-e

Keno: highway-te prai 40% gari truck/tanker chhilo. Ekhon kom.

## Bodlano (shudhu number)
`src/vehicles/VehicleSpec.ts` (use weight):
- sedan 0.28 -> 0.4
- jeep 0.1 -> 0.18
- truck (cargo) 0.22 -> 0.05
- tanker (oil) 0.12 -> 0.03
- hypercar (Volt GT) none -> car(0.05)  (ekhon traffic-e ashe)
- evhypar none -> car(0.05)  (ekhon traffic-e ashe)

`src/core/Config.ts`: `traffic.target` 34 -> 40 (ektu beshi gari).

Highway-te ekhon truck+tanker ~9% (age ~40%).

## Kintu ager moto
- truck/tanker ekhono highway-only, kerb lane-e.
- hypercar / evhypar bhalo driver moto road limit-er moddhe chole (overtake ar race pore).
- tsc chalano jayni (zip-e node_modules chhilo na); change shudhu number.
