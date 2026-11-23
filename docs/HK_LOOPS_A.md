# HK-5a: EAST POND LOOPS (SE + NE), centreline data (2026-11-22; no src change; numbers docs/HK_LOOPS_A.txt, data docs/hk_loops_a.json, picture docs/hk_loops_a.png)

Local frame: x EAST, y NORTH, node at (0, 0). SE loop = southbound east C-D road -> westbound ring (right turn, left-hand traffic). NE loop = the same shape mirrored about the ring axis, travelled the other way (eastbound ring -> southbound C-D road).

## Change to HK-3 (found by this step)
HK-3 used Standards.ts: R55 is enough for V45. The game build validates ramps with Validate.ts, which uses e + f = 0.21 and needs 75.9 m for V45. So the pond loop is now R 60 m, V40 (Validate needs 60.0 m, Standards 40.6 m). The lawn loops (HK-5b) will be checked the same way: Validate needs 113.4 m for V55 and 135.5 m for V60, so R115 means V55, not V60 (or R135 for V60).

## Numbers
| Item | Value |
|------|-------|
| Radius / speed | R 60 m, V40 |
| Spiral (clothoid), comfort C 0.6 | Ls 40 m each end (V^3 / (R C) = 38.1 m, rounded up) |
| Arc | 242.7 m; total centreline 322.7 m |
| Start (exit gore on the C-D road) | x 29.3, y -59.0, heading south, curvature 0 |
| End (tangent in the ring south lane) | x 70.0, y -17.3, heading west, curvature 0 (error 0.0 arc-min) |
| Plan extent | x 29.3 .. 150.4, y -138.4 .. -17.3 (SE); mirrored for NE |
| Arc centre | (90.6, -78.9); clear infield radius for the pond about 44 m (60 - 4.2 ramp half width - 12 verge) |
| Vertical (smoothstep, HK-4 deck 1.4) | SE: link level 20.3 m -> ring 27.0 m, rise 6.8 m, peak grade 3.1 %. NE: arm level 18.8 m -> ring 27.0 m, rise 8.3 m, peak grade 3.8 %. Limit 5 %: PASS |
| Ring aux lanes | NE exit: decel 130 m + taper 91 m: starts about 151 m WEST of the node. SE entrance: accel 181 m + taper 183 m: runs about 293 m west of the node, over and past the crossing. The flyover deck needs an auxiliary lane on the east side through the crossing (+3.65 m), HK-6 |

## Checks (script scripts/hk-loops-a.ts: RESULT 2 FAIL, both are the site)
PASS: tangent end, curvature 0 at both ends, radius (Validate and Standards), grade, loop stays east of the C-D road.
FAIL (site constraint, not a script error): SE loop fill 7.2 m and NE loop fill 7.9 m on natural ground, limit 7 m (DESIGN.maxFill). Both loops are DRY (0 wet samples of 108 each), better than the HK-0 east boxes suggested. Cut is 1.0 / 0.7 m only. Over the limit by 0.2 and 0.9 m: needs the user's word (fill over 7 m), or a retaining wall, or lowering the ramp by shifting the rise.

## OPEN (honest)
- H4: on the RING, the SE loop entrance is followed by the SW lawn loop exit after the crossing: weave about 170 - 250 m (ESTIMATE), above the 150 m minimum, below the 300 m desirable. Cloverstack-style C-D roads on the ring would cure it (more width). To decide in HK-5c with the lawn-loop numbers.
- Natural ground only: the raised ring, the carved ground and the C-D embankment are not in the fill numbers.
- NOT RUN: Validate.ts on real Ramp objects, the game, tsc, build, loops 3 + 4 (HK-5b), C-D roads and slips (HK-5c).
