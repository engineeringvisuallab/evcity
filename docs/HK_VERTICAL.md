# HK-4 VERTICAL PLAN, ring OVER (2026-11-22, no src change; numbers docs/HK_VERTICAL.txt, picture docs/hk_vertical.png)

Method: new ring level = deck level over the crossing, then eased into the OLD ring profile. West: the old ring climbs (31 m at +600), so the new ring stays level and merges into the climb (smooth max). East: the old ring is flat / falling, so a grade-controlled drop (crest curve K 50.9, hold, sag curve K 44) over the old level. Arm and link keep their profiles (D1).

| Item | Deck 1.4 m (game default) | Deck 2.3 m (thick flyover deck) |
|------|---------------------------|---------------------------------|
| Lower roads: highest level inside the crossing | 20.33 m | 20.33 m |
| Deck top at the node (20.33 + 5.5 clearance + deck) | 27.23 m | 28.13 m |
| Raise over the old ring (19.68 m) | 7.55 m | 8.45 m |
| WEST: merges into the old ring at about | +590 m | +625 m |
| WEST: max grade / sag K | 1.9 % / 44: PASS | 1.9 % / 44: PASS |
| WEST: more than 3 m above the old ring (piers or embankment) up to | +445 m | +465 m |
| EAST: length needed from the node | 439 m | 468 m |
| EAST: net grade (bump 3.2 % + old ring) | 3.91 %: PASS limit 4 %, FAIL desirable 3 % | same |
| EAST: more than 3 m above the old ring up to | -270 m | -300 m |
| EAST: fits before the river bridge at -312 m | FAIL (127 m over) | FAIL (156 m over) |

THE REAL PROBLEM: the east side. The ring cannot come down to the river bridge level (about 19 m) in the 312 m before the bridge: it needs 439 - 468 m. Choices (engineer proposes, the user's earlier word 'existing structures may be removed' covers the first):
- E1 REBUILD the ring river bridge (-312 .. -432) as part of the descent (graded deck). Needs about 440 - 470 m, the free length to about -520 m is enough on paper. Bridge level and river clearance are NOT checked: HK-4b.
- E2 shorter drop by allowing 4 % bump grade: saves only about 40 m, not enough, and breaks the 3 % desirable even more.
- E3 lower the arm / link under the ring (reduces the raise): changes D1 (arm and link keep profiles) and puts a sag in the wet east side. Not recommended.
RECOMMENDATION: E1.

NOTES (honest): (1) the 3 % 'desirable' limit FAILS on both sides only because the old ring itself climbs 3.5 % at +400 .. +500 on the west, and on the east the old ring adds to the drop; the 4 % limit holds. (2) Text in HK_VERTICAL.txt says 'equals the old ring's own climb at the join' on the WEST grade line: the number is simply the maximum grade of the new profile there, treat that wording as loose. (3) The west merge is an ESTIMATE: the blend only approaches the old ring (new ring within 1 m). (4) Fill height under the raised ring was NOT checked against natural ground; HK-0 had fill 12 m in the north-west and 12.9 - 14.8 m in the east boxes, and the raised ring is up to 7.5 - 8.5 m above its old level over 445 m west and 270 - 300 m east: a viaduct or retaining structure is likely (rule: fill over 7 m not allowed unless the user says).
NOT RUN: game, tsc, build, terrain / fill, drainage, river bridge level, loop ramp profiles (HK-5).
