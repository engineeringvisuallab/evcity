# HK-3 LAYOUT NUMBERS (2026-11-22, no src change; numbers in docs/HK_LAYOUT.txt, picture docs/hk_layout.png)

Engineer's decision under the user's word 'tumi tomar moto ja lage korote thako' (2026-11-22): C-D roads go on the GROUND road (arm + link), the RING (flyover) gets plain exits. This matches the game's own 'cloverleaf-cd' rule (highway on the ground with C-D roads, the cross road is the overpass) and the video.
Existing structures / objects in the way may be removed later (user).

| Item | Value | Check |
|------|-------|-------|
| Pond loops (NE, SE) | R 55 m, V45 | PASS (min R at V45 = 55.0 m, exactly at the limit) |
| Lawn loops (NW, SW) | R 115 m, V60 | PASS (min 113.4 m) |
| Ramp rise | 6.9 m (clearance 5.5 + deck 1.4, game default); 7.8 m with a thick deck | grade 4.0 % (R55) / 4.5 % at 7.8 m: PASS, limit 5 % (270 deg arc only) |
| C-D road | offset 29.3 m from the axis, shift 12 m, exit transition 180 m, entry transition 240 m, V50 | formulas of PatternCD.ts |
| C-D extent, default slipSize 250 | 507 m south, 567 m north | FAIL south (link structure at 462 m); north PASS (584 m) |
| C-D extent, slipSize 150 | 407 m south, 467 m north | PASS both |
| Weave, east C-D (ponds) | about 190 m | PASS min 150, BELOW desirable 300 (ESTIMATE) |
| Weave, west C-D (lawns) | about 310 m | PASS (ESTIMATE) |
| Ring exit / entrance (V100) | decel 100->45 123 m, accel 45->85 167 m; 100->60: 99 m / 117 m | taper not included |
| Footprint of the 4 loops | 465 x 540 m | video estimate 600 - 700 m |

DECISION TAKEN: slipSize 150 (not the default 250), so the C-D roads end before the first link structure (462 m).
ASSUMED (not read from data): arm / link speed V80 and the M8 half width 22.1 m, kerb-lane centre 17.3 m for the C-D offset. The link is only 6 lanes (half 16 m): the real C-D offset there is smaller. Re-check in HK-5c.
NOT done: ramps are not joined to the roads (no spirals, no gores), loop positions are the schematic ones, terrain at the new loop positions is NOT re-checked (HK-0 boxes: NW fill 12.0 m FAIL, NE 12.9 m wet FAIL, SE 14.8 m wet FAIL, SW cut 10.9 m PASS: these stay open for HK-4 / HK-7). No game look, no tsc, no build. The weaves are estimates from the sketch.
