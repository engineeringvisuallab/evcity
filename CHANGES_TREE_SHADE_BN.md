# Gach kalo lagche -> shade soft kora

Shomossa: gach er pata (bishesh kore sun er ulto dike) prai kalo dekhacchilo.
Karon: pata card er normal random, Lambert e sun er ulto dik e ambient chara kichu thake na; tar upor brightness 0.72 x leafDark (0.78/0.84/0.8).

## Bodol
- src/vegetation/TreeAssets.ts : leaf shader e "shade floor" (outgoingLight kom hole diffuse x shadeFloor x dinerAlo porjonto uthbe). Raat e sun kom, tai raat kalo thake. Crown card brightness floor 0.72 -> 0.86.
- src/core/Config.ts : `vegetation.leafDark` [0.78,0.84,0.8] -> [0.88,0.95,0.86]; notun `vegetation.shadeFloor` [0.34,0.44,0.3].

## Tune
- Aro halka shade: shadeFloor baratao (jemon 0.45,0.55,0.4). Ager moto kalo: shadeFloor [0,0,0].
- Aro deep green: leafDark komao.
- `tsc --noEmit` pass. Game e chalie dekha hoy ni (screenshot dekhe kora).
