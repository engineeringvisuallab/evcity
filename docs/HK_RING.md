# HK-6: RING PROFILE AND STRUCTURES at the node, ring OVER (2026-11-22; DATA ONLY, src NOT changed)
Files: docs/HK_RING.txt (script output), docs/hk_ring_patch.csv (every sample within +-800 m: station, old level, new level, natural ground, fill, wet), docs/hk_ring_patch.json (the changed samples as index -> level), scripts/hk-ring-profile.ts. The old HK-6 row spoke of 'arm end and link start new profile': with D1 (ring over) the raised axis is the RING; arm and link keep their profiles.

## New ring profile (RingProfileData.ts grid, 10 m)
- Node at ring station 1207.8 m (ring length 19292.8 m). Station increases WEST: d = station - 1207.8 (+ west, - east).
- 120 of the 160 samples in +-800 m change: d -428 m (east) to +762 m (west). Max raise 7.55 m (deck top at the node 27.23 m, deck 1.4). Level deck |d| <= 51.5 m.
- Max grade on the 10 m grid 3.9 % (east descent, d -248 m): PASS the 4 % motorway limit, above the 3 % desirable. The change meets the old profile at both ends (no step).
- Fixed on the way: HK-4's west merge stopped 0.9 m above the old ring at +600 m (7 % step on the grid); the leftover is now faded out over 600 - 780 m with a smoothstep.
- The patch is in the zip as data. It is NOT applied to src/roads/ring/RingProfileData.ts (that file is generated from docs/ring_profile.csv by tools/ring-profile-to-ts.py); applying it, and re-running the existing ring checks, is the first job of HK-7 / HK-13.

## What the game's own structure rules do with this profile (RoadNetwork.bridgeRing)
| Rule | Result |
|------|--------|
| Wet centreline = BRIDGE by itself | d -418 .. -328 (90 m): the river bridge. It is rebuilt automatically at the new, graded level: lowest deck underside 3.25 m above the water (old ring: 2.82 m): PASS (needs 1.0 m). So E1 needs NO hand-made bridge |
| Fill over 7.5 m beside a river valley = VIADUCT by itself (otherwise an earth embankment up to 25 m) | d -408 .. -338 (inside the river bridge), d -98 .. +12 (110 m), d +102 .. +152 (50 m) |
| Ring more than 3 m above natural ground | d -178 .. +462 (640 m) on embankment / viaduct, d +552 .. +602 (50 m); highest 12.9 m at d -348 (the old ring is already 12.0 m there) |
| Deck over the arm, link and C-D roads | NO rule makes it (arm and link are junction roads): a HAND-MADE structure, HK-8 |

## Engineer decisions
1. NODE VIADUCT (hand-made, HK-8): from d -110 m (east) to +160 m (west), 270 m including the 16 m approach slabs, covering the whole stretch that is above 7.5 m and the crossing. Deck width: M8 half width 22.1 m + one auxiliary lane (3.65 m) each side = 25.75 m half, 51.5 m wide, because the loops' aux lanes run through the crossing (HK-5). The span over the lower roads must clear |x| <= 33.5 m (arm side C-D outer edge); the span layout and piers are HK-8.
2. West embankment (d +160 .. +462, up to 7.5 m high, 300 m): earth embankment by the ring terrain rule, checked in HK-7 (skirt, cut). Not a viaduct: it is not beside a river valley.
3. East descent d -110 .. -418: embankment up to the river bridge, then the automatic bridge, then the old ring again at d -428.

## OPEN (honest)
- 8 lane (arm) to 6 lane (link) of the ground road under the ring deck: NOT designed. The junction patch is 25 m (ring axis to link start) and lies completely under the 51.5 m deck, so the change can be hidden there, but a lane drop in 25 m is not possible: HK-8 must decide (idea: the 4th arm lane becomes the exit lane to the C-D road; it needs the arm data to narrow near the node).
- The existing ring checks (ring-structures, ring-facade, ring-cut) are not in the zip: not run. src not patched. No game, no tsc, no build.
- Earthwork volume of the 640 m embankment and the effect on the neighbours (the 3 % desirable grade is exceeded on the east descent).
