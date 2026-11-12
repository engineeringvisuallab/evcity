# INTERCHANGE — candidate junctions (auto-generated)

`npx tsx scripts/interchange-candidates.ts` — 169 junction pads checked; 13 have two divided roads meeting at about 90 degrees.

Check = does the pattern fit: no water, no ground more than 9 m from the ramp height, no other road / pad within 20 m of a ramp. **OK** = fits; the best (biggest) pattern that fits is recommended.

| pad | x | z | main x cross | roads | cloverleaf | parclo | diamond | recommend |
|---|---|---|---|---|---|---|---|---|
| 0 | 0 | 0 | highway x highway | F4 x F6 | x (water 0, steep 0, road 49) | x (water 0, steep 0, road 27) | x (water 0, steep 0, road 14) | **none** |
| 2 | -930 | 98 | highway x arterial | F6 x P5 | x (water 0, steep 45, road 23) | x (water 0, steep 24, road 9) | x (water 0, steep 15, road 11) | **none** |
| 3 | 257 | -778 | highway x arterial | F4 x P6 | x (water 0, steep 106, road 19) | x (water 0, steep 51, road 8) | x (water 0, steep 46, road 12) | **none** |
| 10 | 2497 | -2761 | highway x arterial | F1 x P9 | x (water 16, steep 41, road 0) | x (water 4, steep 16, road 0) | x (water 4, steep 8, road 0) | **none** |
| 11 | 2602 | 1821 | highway x arterial | F2 x P10 | OK | OK | OK | **cloverleaf** |
| 12 | -2303 | 1704 | highway x arterial | F3 x P11 | x (water 0, steep 39, road 0) | x (water 0, steep 15, road 0) | x (water 0, steep 8, road 0) | **none** |
| 13 | 262 | -2820 | highway x arterial | F4 x P13 | x (water 0, steep 0, road 5) | OK | x (water 0, steep 0, road 7) | **parclo** |
| 35 | -1415 | 3715 | highway x arterial | IB x IR1 | x (water 156, steep 156, road 20) | x (water 78, steep 78, road 10) | x (water 64, steep 64, road 11) | **none** |
| 25 | 122 | -445 | highway x avenue | F4 x L145 | x (water 0, steep 0, road 71) | x (water 0, steep 0, road 31) | x (water 0, steep 0, road 30) | **none** |
| 36 | 582 | 622 | arterial x arterial | P10 x P2 | x (water 27, steep 31, road 37) | x (water 12, steep 14, road 17) | x (water 11, steep 11, road 15) | **none** |
| 39 | -543 | -822 | arterial x arterial | P5 x P6 | x (water 0, steep 98, road 0) | x (water 0, steep 50, road 0) | x (water 0, steep 41, road 0) | **none** |
| 40 | 782 | -642 | arterial x arterial | P9 x P7 | x (water 0, steep 18, road 29) | x (water 0, steep 11, road 13) | x (water 0, steep 9, road 15) | **none** |
| 41 | -2023 | -2835 | arterial x arterial | P12 x P13 | x (water 0, steep 0, road 17) | x (water 0, steep 0, road 9) | x (water 0, steep 0, road 10) | **none** |

## Ready to paste (2 junctions where at least one pattern fits)

Copy the lines you want into `Config.roads.interchange.list` and set `enabled: true`.

```ts
{ id: 'I11', pattern: 'cloverleaf', x: 2602, z: 1821, yaw: 1.783, main: 'highway', cross: 'arterial' }, // F2 x P10
{ id: 'I13', pattern: 'parclo', x: 262, z: -2820, yaw: 1.865, main: 'highway', cross: 'arterial' }, // F4 x P13
```

Verified in the real network (flag on): 2 of 2 interchanges built, 12 ramp roads (expected 12), no warnings.
