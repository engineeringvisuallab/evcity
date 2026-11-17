ROADFIX step 1 (merge) DONE. Extract over the eee project root (all new files are named roadfix*, except docs/map_all_roads_v3.json and the regenerated src/roads/debug/RoadCentreData.ts).
CHANGED in the game tree: ONLY src/roads/debug/RoadCentreData.ts (debug centreline viewer data, regenerated from v3: 7 re-routed lines + 10 tunnel labels 'T<len>m'). No real road / rail / terrain code changed. Game NOT run, npm run build NOT run (no node_modules / network here).
Result (analysis on v3, tunnels exempt): lines with a problem 167 -> 155. HILL 75 -> 61, radius 8 -> 5.
 7 re-routed lines now clean: R4-38, R4-48, R4-81, R2-21.1, R2-65.1, R2-105.2, R2-138.2 (R4-48 / R4-81 only have short bridge runs over water)
 10 tunnels (cls 4 / 2): R4-5.2 200 m, R4-21.2 80, R4-26 80, R4-71.1 200, R4-79 320, R4-83.2 80, R2-125.2 80, R2-134 80, R2-138.1 240, R2-154 80
 R4-45 re-route (203 -> 1114 m) NOT used, original kept.
Tools: tools/roadfix-merge.py, tools/roadfix-export-ts.py (+ tools/roadfix_hier.py), scripts/roadfix-analyse.ts | roadfix-reroute.ts | roadfix-tunnel.ts.
Bug fixed in roadfix-lib.ts: profileCheck grade step 0.5 -> 0.2 m (R6 could never climb before).
Open: 60 R4/R2 HILL lines (no straight tunnel <= 640 m), 7 R6 lines, BLD lines with the building at the junction, R4-45.

ROADFIX step 2 (second pass) DONE.
CHANGED in the game tree: ONLY src/roads/debug/RoadCentreData.ts (debug centreline viewer data, regenerated from v3). No real road / rail / terrain code changed. Game NOT run, npm run build NOT run (no node_modules / network here).
Result (analysis on v3): lines with a problem 155 -> 147. HILL 61 -> 51.
 2a CURVED tunnel (scripts/roadfix-tunnel.ts, env CURVED=1, up to 1000 m, follows the line bend): 7 of 60 solved: R4-34 800 m, R4-35 440, R4-55 240, R4-58 360, R4-63 1000, R2-138.5 360, R2-150.1 120. Saved in docs/roadfix_tunnels2.json (field poly = the bend).
 2b FULL re-route (scripts/roadfix-reroute.ts, env FULL=1: path starts and ends exactly at the junction, no 45 m stubs): 3 of 53 solved: R2-138.6 617->899 m, R2-139.1 448->680, R2-144.1 732->1144. Saved in docs/roadfix_result2.json.
 Merge: tools/roadfix-merge.py now also reads *_result2 / *_tunnels2 -> docs/map_all_roads_v3.json (10 re-routed, 17 tunnels). Then python3 tools/roadfix-export-ts.py 6 4 2.
 Tools fixed: roadfix-analyse.ts checks curved tunnels along their bend (not a straight chord).
Still open: 50 HILL lines (cls 4: 13, cls 2: 37) that no tunnel <= 1000 m and no re-route can fix under the rules (cut <= 12, fill <= 7, grade, radius). 27 of them: search stops after a few nodes (the junction end is boxed in by steep ground); 22: search reaches the end but no legal level fits there. Needs a DECISION per line: viaduct / longer tunnel / move the junction / drop the line. Logs: docs/roadfix_reroute2_log.txt, docs/roadfix_tunnel2_log.txt.
Also still open: 7 R6 lines, BLD lines, R4-45, RAILX / WET / RAILNEAR lines (not touched in this step).

ROADFIX step 2c DONE (engineering solution for the last 50 HILL lines, cls 4 / 2).
 Order used: (1) go AROUND the hill: wider lattice search (+-1500 m, 2.5 M nodes) on the 22 lines that hit the node cap: 0 solved. (2) Where it can not go around: keep the centreline (smoothed only if radius < class minimum) and choose the road level per 10 m: earthwork (cut <= 12, fill <= 7), viaduct (level above the fill window, height <= 45 m), tunnel (cls 4 / 2, grade <= 4 %). Cheapest first: earthwork < viaduct < tunnel. Script: scripts/roadfix-struct.ts. Result docs/roadfix_struct.json (per line: segs, level every 10 m, mode string E/V/T/W) + log docs/roadfix_struct_log.txt.
 Independent re-check (grade, windows, viaduct height, tunnel window and grade): 50 of 50 PASS.
 Merge: tools/roadfix-merge.py also reads roadfix_struct.json (field roadfix.struct). Viewer labels now show V<len>m / T<len>m.
 Analysis on v3: HILL 51 -> 1 (the 1 left is an R6 line, not touched). Lines with a problem 147 -> 106 (left: WET, RAILX, BLD, RAILNEAR, 5 radius).
 Review notes: some lines are mostly structure (e.g. R2-183.1 whole line tunnel, R2-80 1050 m tunnel + 310 m viaduct, R4-22 630 m tunnel); tunnel pieces shorter than 80 m are really deep cuts > 12 m (cut-and-cover / retaining wall); a viaduct or tunnel may start right at a junction. The level profile is a first design: no vertical curves yet, no structure type (that is the next step: decorate with structures).

=== GOAL (user, 2026-11-16) ===
Make EVERY road a correct, smooth, FINAL centreline. FIXED (never move): 8-lane road, rail, J1. Everything else may be moved / re-routed / smoothed.
Buildings and engineering sites: the user replaces them LATER, so a road may pass through them. BLD is NOT a problem any more (ignore BLD in the analysis).
Hills: first try to go AROUND; if not possible use cut / fill, viaduct or tunnel (done for cls 4 / 2 in step 2c).

=== REMAINING WORK (one step per session, PASS / FAIL list, stop, wait for OK) ===
R1  WET (52 lines): road over water. Decide per line: short -> bridge over water (mark it), long or avoidable -> move the line out of the water.
R2  RAILX (37 lines): road crosses the rail. Rail is fixed. Keep the crossing as bridge / underpass (mark it, level must fit), or move the crossing. Report to the user any line that crosses a J1 arm or the ring, or runs near rail.
R3  RAILNEAR (14 lines): road within 30 m of a track without a crossing -> move it out of the rail clearance.
R4  Radius (5 lines): R6-10, R6-31, R6-32, R4-45, R4-52. R4-45 old re-route was 203 -> 1114 m (too long); find a shorter way or smooth it.
R5  R6: the 1 HILL line + the 7 R6 lines with a problem (R6 never tunnel; viaduct / re-route / smooth).
R6  FINAL SMOOTH of ALL lines: straight - spiral - arc - spiral - straight (R3 rule 3.12), no zig-zag, radius >= class minimum, ends fixed at junctions. Re-run the analysis: the only things left may be declared structures (bridge / viaduct / tunnel).
R7  Freeze docs/map_all_roads_v4.json = FINAL centreline, regenerate src/roads/debug/RoadCentreData.ts, update this README, give full zip + changed zip.
NOT in this scope (later, by the user or another phase): replacing buildings and engineering sites, structure types / portals / vertical curves, real road building in the game code, npm run build / game run (could not be run here).
Known facts: HILL 51 -> 1 (R6). Problem lines 106 / 278. Counts: WET 52, RAILX 37, BLD 23 (ignored now), RAILNEAR 14, R 5, HILL 1. Short tunnels < 80 m are deep cuts (> 12 m); a few lines are mostly structure (R2-183.1, R2-80, R4-22).

=== R1 WET DONE (2026-11-16) ===
Rule: every wet run <= 60 m -> bridge mark; longer run -> try to move the line out of the water (lattice, junction to junction, +-900 m); if not possible -> LONG BRIDGE kept and reported. Lines with a tunnel / viaduct profile are never moved (bridge mark only).
Result: 52 lines with water. 32 SHORT bridges (<= 60 m, incl. 2 locked lines R4-26, R2-80). 20 LONG bridges kept: no dry path found (14 no path +-900 m, 3 radius, 3 still water): R6-29 R6-32 R6-34 R4-24 R4-37 R4-48 R2-6.3 R2-43.1 R2-43.2 R2-61.2 R2-62.1 R2-73 R2-78.2 R2-85.2 R2-89.2 R2-105.1 R2-107.2 R2-109.1 (+2 more in docs/roadfix_wet_log.txt). Longest water run 240 m (R2-105.1). 0 lines moved.
Data: docs/roadfix_wet.json, docs/roadfix_wet_log.txt, scripts/roadfix-wet.ts. Merge writes roadfix.bridges (s0, s1, len) into docs/map_all_roads_v3.json; viewer label B<len>m. Analysis: WET lines 52 -> 0 (all declared as bridge), lines with a problem 106 -> 71 (BLD 23 still counted by the script, ignore per user; without BLD: 51).
Bridge level / clearance over water NOT designed (structure phase). J1 / ring crossing: no line was moved, so nothing new crosses a J1 arm or the ring. npm run build / game NOT run.
NEXT: R2 RAILX (37 lines).

=== R2 RAILX DONE (2026-11-16) ===
Rail is fixed. Rule: a road that crosses the rail at ground level (rail < 9 m above ground) becomes an OVERPASS (road >= 7.5 m above the rail, span zone = 30 m / sin(angle), 25-100 m) or, if the rail is on a bridge, an UNDERPASS (road <= 7 m below the rail deck, cut <= 12 m). Rail in a deep tunnel (> 40 m below ground, 5 crossings): road passes over, nothing to do. The road level is solved by the same cheapest-first level programme as step 2c (earthwork < viaduct / rail-span < tunnel), grade limits kept, independent re-check PASS.
Script: scripts/roadfix-railx.ts (data docs/roadfix_railx.json, log docs/roadfix_railx_log.txt). Merge writes roadfix.struct (replaces a line's older tunnel / struct) and roadfix.railx (type, at, angle, rail height, road level). Viewer label RO<n> overpass / RU<n> underpass.
Result: 27 of 37 RAILX lines solved: overpass 21 crossings, underpass 3 lines (R6-21, R4-37, R2-6.4, R2-54.1), rail-in-tunnel 5 crossings (R4-63 x2, R2-139.2, R2-152 x2). Analysis: RAILX lines 37 -> 10, lines with a problem 71 -> 52 (BLD ignored: 29).
10 lines NOT solved: the JUNCTION sits inside the rail clearance (4-33 m from the track), a line alone can not fix that. Needs a decision (move the junction, or the line ends at the rail): R6-18 (J-95, 25 m), R4-21.1 (J-38, 4 m), R4-31 (J-61, 5 m, runs nearly parallel to the rail, angle 4), R2-12.3 and R2-30.2 (J-08, 17 / 19 m), R2-78.1 (J-57, 5 m), R2-82 (J-61, 9 m), R2-109.3 (J-89, 33 m), R2-125.1 and R2-129.2 (J-95, 16 / 25 m).
No line was moved, so nothing new crosses a J1 arm or the ring. Overpass / underpass structure types, approach ramps detail, vertical curves NOT designed. npm run build / game NOT run.
NEXT: R3 RAILNEAR (14 lines) + the 10 junction-at-rail lines above.
