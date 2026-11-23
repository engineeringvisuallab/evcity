# HK-5a / 5b / 5c: FOUR EQUAL LOOPS + SLIPS + C-D ROADS (2026-11-22; no src change)
Supersedes the earlier loop notes (pond R60 / lawn R115, then equal R115). Data: HK_LOOPS_A.txt + hk_loops_a.json (east loops), HK_LOOPS_B.txt + hk_loops_b.json (west loops), HK_CD_SLIPS.txt + hk_cd_slips.json (slips, C-D), picture hk_loops_all.png. Details of slips and C-D: docs/HK_CD_SLIPS.md.

## Correction (honest)
An earlier report said 'R115 is the best equal size'. It is only the largest that stays dry. The slip ramps go OUTSIDE the loops, so a bigger loop needs a much bigger slip: slipSize that clears the loop by 14 m is 280 m for R60, 310 m for R70, 350 m for R80, 390 m for R95 (the game default is 250 m, made for loop R48). That is why the final size is R80, not R115.

## Size study (all four loops equal)
| R / V | ring weave | C-D weave | slipSize needed | east valley |
|-------|-----------|-----------|-----------------|-------------|
| 60 / 40 | 140 m FAIL | 118 m FAIL | 280 m | dry, fill 7.2 - 7.9 m |
| 70 / 42 | 160 m | 138 m FAIL | 310 m | not run |
| **80 / 45** | **175 m PASS** | **153 m PASS** | **350 m** | dry, fill 7.3 - 7.8 m |
| 95 / 50 | 200 m | 178 m | 390 m | dry, fill 7.4 - 7.7 m |
| 115 / 55 | 235 m | 213 m | more than 390 m (not run) | dry, fill 7.4 - 7.7 m |
| 135 / 60 | - | - | - | WET: fill 18.4 m, 49 of 233 samples wet |
Weave minimum 150 m, desirable 300 m (Standards.ts). Radius rule: Validate.ts (e + f 0.21) needs 75.9 m for V45; Standards.ts says 55.0 m (HK-3 used that: wrong for the build).
CHOICE: R80 m / V45, the smallest equal loop whose weaves reach the 150 m minimum on both the ring and the C-D road.

## Numbers, R80 / V45 loops
| Item | Value |
|------|-------|
| Spiral (comfort C 0.6) | 45 m each end, arc 332.0 m, total 422.0 m, curvature 0 at both ends, end tangent in the ring lane (0.0 arc-min) |
| South loops (link side) | SE: from the east C-D road (x +23.2, y -76.4, southbound) to the ring south lane (x +81.3, y -17.3, westbound); SW = x-mirror |
| North loops (arm side) | NE / NW: the same shape moved 6.1 m away from the axis: C-D x +-29.3, y +76.4, ring lane x +-87.4 (NE exit, NW entrance) |
| Vertical (HK-4 deck 1.4) | see HK_LOOPS_A.txt / HK_LOOPS_B.txt (rise 6.7 - 8.7 m, peak grade 2.4 - 3.1 %, limit 5 % PASS) |
| Ring aux lanes | exit decel 123 m + taper 91 m; entrance accel 167 m + taper 183 m: through and past the crossing, so the flyover deck is wider (HK-6) |
| Slip (left turn) | V50, Rs 110 m (Validate needs 93.7 m), 45 deg arc + straight + 45 deg arc, slipSize 350 m, length about 518 m, plan gap to the loop at least 14 m; ends tangent in the ring lane |
| Ground C-D roads | arm side offset 29.3 m (shift 12.0, exit 180 m, entry 240 m); link side offset 23.2 m (shift 11.4, exit 180 m, entry 230 m); V50. East C-D reaches 607 m at the arm end, 657 m at the link end; west C-D 607 m at the link end, 667 m at the arm end |
| C-D S-bend (29.3 to 23.2 m) | two reverse arcs R 93.7 m, 47.4 m long, between the ring deck edge (25.8 m) and the loop start (76.4 m): 50.7 m available, margin 3.2 m: TIGHT; a 1:15 taper (91.5 m) would not fit |
| Ring C-D roads | recommendation only, not designed (HK-6) |
| Weave | ring north lane 174.8 m, ring south lane 162.6 m (through lanes, V100), ground C-D 152.8 m (V50 road): PASS min 150, BELOW desirable 300 (WARN, not reachable with any loop that fits the site) |

## Checks (the three scripts: 0 FAIL in the slip / C-D script; 2 FAIL in each loop script, all the same site issue)
DECISION (engineer, 2026-11-22, user delegated): the 'fill over 7 m' FAIL of the first runs was a wrong check. The game builds every ramp stretch higher than pierFromH 3 m as a dry VIADUCT on piers (Builder.ts, RoadNetwork.ts step 3D-A); DESIGN.maxFill 7 m is the limit for road corridor EMBANKMENTS. So the loops are viaducts where they are high: height above natural ground at most SE 7.2, NE 7.8, NW 7.5, SW 7.2 m, with about 96 m (SE), 294 m (NE), 297 m (NW) and 147 m (SW) of each 422 m loop on piers; only the stretches up to 3 m are embankment. No pier height limit was found in the game rules: scripts check 12 m (PASS). Cut at most 2.4 m. All four loops dry.
WARN: the first link structure (462 m south) and the first arm structure (584 m north) are inside the new C-D extents (607 m / 667 m): they must be moved / rebuilt (user: existing structures may be removed). The ring C-D east end (667 m) lies beyond the 520 m of the rebuilt river bridge zone: HK-6.
ENGINEER NOTE: a C-D road does not make the weave longer; it moves the weaving from the V100 / V80 through lanes to a V50 road beside them (safety, capacity). Weave length is set by the loop spacing. The ring C-D road is a RECOMMENDATION (not yet decided by the user); without it the weave is on the through lanes of the ring: 174.8 m.

## NOT run
Validate.ts on real Ramp objects, the game, tsc, build, fill / cut under slips and C-D roads, the ring C-D deck width and structure, the link / arm structures, signing.

## FOUR LEGS ARE NOT ALIKE (user, 2026-11-22): ring both sides + arm = 8 lane (M8, V100, half 22.1 m); island link = 6 lane (M6, V80, half 16.0 m, kerb lane centre 11.75 m)
The first HK-5 run used the 8-lane numbers on the link side too. FIXED (second run of all three scripts): the C-D roads beside the link are 23.2 m from the axis (29.3 m beside the arm), the two south quadrants are the north quadrants moved 6.1 m towards the axis, and the C-D roads change offset in a reverse curve south of the ring (see the table). The arm is an M8 = V100 (not V80 as first assumed); the transitions did not change (15 x shift decides).
STILL OPEN: how the ground road itself goes from 8 lane (arm) to 6 lane (link) under the ring deck (junction patch, 25 m between the ring axis and the link start) is NOT designed (HK-6); the S-bend margin of the C-D roads is only 3.2 m.
