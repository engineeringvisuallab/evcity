# Weapon wheel + highway AI traffic

## Weapon wheel (B) - src/combat/CombatSystem.ts, src/combat/GunIcons.ts (new)
- B opens the wheel. Mouse wheel turns the highlight round the circle (down = next, up = previous).
- B or a click takes the highlighted gun and closes the wheel. Esc closes it without changing the gun.
- Hover still highlights and click still equips, like before.
- English gun names + a silhouette icon for each of the 10 guns (also a bigger one in the centre).
- While the wheel is open nothing fires and the camera does not zoom.

## Highway AI traffic - src/traffic/*, src/vehicles/VehicleUse.ts, VehicleSpec.ts, src/core/Config.ts
- Config.traffic.highway: big highways (6 lanes) have their own limit: cars up to 130 km/h (each driver 70-98 %), cargo truck 75 km/h, fuel tanker 80 km/h.
- Cars drive in the middle / fast lanes, trucks, tankers and buses in the kerb lane. Cars in the next lane no longer block each other.
- Cargo trucks and fuel tankers appear in AI traffic (USE.highway, weight 0.22 / 0.12) and stay on highways only.
- Drivers look further ahead at high speed (braking distance), and freeway cars spawn already moving.
- Cycle rickshaws and CNG autos no longer spawn on / turn onto a highway.
