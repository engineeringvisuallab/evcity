# HK-7: TERRAIN under the new ring profile and the interchange (2026-11-22; src NOT changed; evidence: docs/HK_RING_CHECKS.txt)

## What was done
1. The HK-6 ring patch was written into a copy of src/roads/ring/RingProfileData.ts (docs/RingProfileData.hk.ts: 120 of the 1929 samples change; every other value is identical to the original).
2. The game's own ring check scripts (scripts/ring-*-check.ts of the zip, run with tsx on the real RoadNetwork / terrain code) were run on the ORIGINAL and on the PATCHED profile (scripts/hk-ring-checks.sh).

## Result
| Check | Original | Patched |
|-------|----------|---------|
| ring-structures-check (5 checks: wet = structure, no fill over 25 m outside a structure, approach slabs, no earth dam, ground 0.3 m under the slab) | 5 PASS | 5 PASS |
| ring-road-check | 7 PASS | 7 PASS |
| ring-ribbons-check | 15 PASS | 15 PASS |
| ring-cut-check | 1 PASS, 3 FAIL (already failing) | 1 PASS, 3 FAIL: 'ground inside the envelope' bad points 42 -> 57 (+15, around ring stations 1360 - 1800 = 150 - 590 m WEST of the node: the new west embankment) |
| ring-drive-check | 1 PASS, 2 FAIL (already failing) | 1 PASS, 2 FAIL: collider-height samples over 0.25 m 133 -> 142; the stretch 'pavement hangs over lower ground' at 149-152 grows 32 -> 40 m (stations about 1490 - 1530 = 280 - 320 m west) |
| ring-facade-check, ring-row-check | 5 PASS 4 FAIL / 7 PASS 1 FAIL (already failing: old expectations: one road, no pads, engineering areas) | identical |
| ring-profile-check, ring-ground-check | do not print PASS / FAIL (profile check crashed on Node, ground check only writes a file) | same |

So the patch does NOT break any check that passed. The game's terrain rule already follows the raised ring (earth embankment, skirt), the structure rule needs no change (the river bridge and the viaduct zones are automatic), and the only visible effect is a small worsening (+15 envelope points, +9 hanging samples) of checks that were ALREADY failing, all on the new west embankment, 150 - 590 m west of the node.

## Engineer's reading and decisions
- No new terrain pad for the ring: the existing ring terrain rule is used. Loops and slips: the game's interchange pipeline (Builder.ts, 3D-A) turns every stretch higher than 3 m into a bridge and builds embankment below it, so the ground under the ramps is made by the existing pipeline (not yet tested with these loops: HK-13).
- The west embankment (150 - 590 m west of the node, up to 7.5 m) is the one place to improve: the 15 extra 'outside the envelope' points sit there. Cheapest fix, to be done in HK-8 / HK-13 and not by a new pad: extend the hand-made node viaduct from +160 m to about +300 m, or flatten the first 140 m of the descent. Decision deferred until HK-8 shows the real numbers.
- The node itself (the hand-made viaduct, d -110 .. +160 m, 51.5 m wide) needs a pad only where the arm / link / C-D roads pass under: the ground there is the existing arm and link ground, which is not changed (D1).

## NOT done / honest
- No game run (no visual check), no tsc, no build. The pre-existing FAILs (cut, drive, facade, row) were NOT fixed: they are older issues, not part of this work.
- The ground under the C-D roads (607 - 667 m each side) and the slips (518 m each) was not tested: they are not in the game yet.
- The profile check crashed on this Node version before printing anything: no result.
