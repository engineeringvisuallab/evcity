# HK-5b: WEST LAWN LOOPS (NW + SW), centreline data (2026-11-22; no src change; numbers docs/HK_LOOPS_B.txt, data docs/hk_loops_b.json, picture docs/hk_loops_all.png with all four loops)

Local frame: x EAST, y NORTH, node (0, 0). NW loop = northbound west C-D road -> eastbound ring (the SE loop turned by 180 degrees). SW loop = the NW loop mirrored about the ring axis and travelled the other way (westbound ring -> C-D road).

## Speed change against HK-3
Lawn loop R115 is V55 under Validate.ts (needs 113.4 m), not V60 (needs 135.0 m). HK-3 said V60: changed to V55.

## Numbers
| Item | Value |
|------|-------|
| Radius / speed | R 115 m, V55 |
| Spiral (comfort C 0.6) | Ls 55 m each end (V^3 / (R C) = 51.7 m, rounded up); arc 486.9 m; total 596.9 m |
| Start (exit gore / C-D) | x -29.3, y +106.4 (NW), heading north, curvature 0 |
| End (tangent in the ring north lane) | x -117.4, y +17.3, heading east, curvature 0 (error 0.0 arc-min) |
| Plan extent (NW) | x -260.4 .. -29.3, y 17.3 .. 248.4 m (SW mirrored) |
| Arc centre | NW (-145.5, +133.9), SW (-145.5, -133.9); clear infield radius about 99 m (115 - 4.2 - 12) |
| Vertical (smoothstep, HK-4 deck 1.4) | NW: arm level 18.0 m -> ring 27.3 m, rise 9.2 m, peak grade 2.3 %. SW: link level 20.3 m -> ring 27.3 m, rise 7.0 m, peak grade 1.8 %. Limit 5 %: PASS |
| Ring aux lanes | SW exit: decel 108 m + taper 91 m, starts about 81 m EAST of the node. NW entrance: accel 135 m + taper 183 m, runs about 200 m east of the node, over and past the crossing. The flyover deck needs an auxiliary lane on the west side too (HK-6) |

## H4 weave on the ring (the open item of HK-5a, now computed)
SE entrance at x = +70.0 and SW exit at x = -117.4: 187.4 m between the gore points (the same by symmetry for NE exit / NW entrance). PASS the 150 m minimum, BELOW the 300 m desirable (WARN). Cure if the user wants the desirable length: C-D roads on the ring too (cloverstack), costs more width. Decision for HK-5c.

## Checks (scripts/hk-loops-b.ts: RESULT 2 FAIL, 1 WARN)
PASS: tangent end, curvature 0 at both ends, radius (Validate 113.4 m, Standards 91.6 m), grade, loop west of the C-D road, cut (NW 0.0 m, SW 2.7 m, limit 12 m), both loops DRY (0 wet of 200).
FAIL (site constraint, not a script error): fill NW 7.6 m and SW 7.5 m on natural ground, limit 7 m (DESIGN.maxFill). With HK-5a the four loops are over the limit by 0.2 - 0.9 m. STILL OPEN: the user has not said whether fill over 7 m is allowed.
WARN: weave 187 m (below the desirable 300 m).

## Correction to HK-5a (found while doing this step)
The first HK-5a run read the link level at distance + 25 m instead of distance - 25 m (the link starts 25 m south of the ring axis). The SE loop's ground level changes by less than 0.1 m; numbers were re-run and are unchanged at one decimal. The script (scripts/hk-loops-a.ts) is fixed.

## NOT run
Validate.ts on real Ramp objects, the game, tsc, build, C-D roads and slips (HK-5c), terrain after the ring raise and carving.
