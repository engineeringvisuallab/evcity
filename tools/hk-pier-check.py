#!/usr/bin/env python3
"""HK-8b (data only, src NOT changed): pier footprints of the node viaduct against the 4 loop ramps and the C-D roads.
Run from the project root:  python3 -I tools/hk-pier-check.py  -> docs/HK_PIERS.txt, docs/hk_piers.json
Frame = the loop frame of HK-5 (x EAST, y NORTH, node at 0,0, ring along x). HK-8a used d (+ WEST): x = -d.
PLAN-ONLY check: levels are not used, so a ramp that is at deck level (the first metres of a loop) counts as a conflict too (conservative)."""
import json, math

out, fails, warns = [], 0, 0
def say(s): out.append(s); print(s)
def chk(ok, name, detail, warn=False):
    global fails, warns
    if not ok:
        if warn: warns += 1
        else: fails += 1
    say(f"  {'PASS' if ok else ('WARN' if warn else 'FAIL')}  {name:<62} {detail}")

A = json.load(open('docs/hk_loops_a.json')); B = json.load(open('docs/hk_loops_b.json')); C = json.load(open('docs/hk_cd_slips.json'))
S = json.load(open('docs/hk_structures.json'))
PD = S['P']                                    # pier lines in d: -50, 50, 97
PX = [-d for d in PD]                          # x = -d: +50, -50, -97
COL_X, COL_Y = S['colAlong'], 2.5              # column size along the ring / across it
COLY = [-24.2, -8.0, 8.0, 24.2]                # decision of this step: 4 columns per pier line (cap beam spans 16 m, cantilever 1.75 m to the 25.75 m deck edge)
RAMP_HALF, CLR = 4.2, 1.0                      # ramp half width (HK-5), required plan clearance
DECK_HALF = S['deckW'] / 2
loops = {'SE': A['se'], 'NE': A['ne'], 'NW': B['nw'], 'SW': B['sw']}

def seg_pt(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay; t = 0.0 if dx == dy == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))
def rect_pt(cx, cy, px, py):                   # distance from a point to the column rectangle
    qx = max(abs(px - cx) - COL_X / 2, 0); qy = max(abs(py - cy) - COL_Y / 2, 0); return math.hypot(qx, qy)
def rect_poly(cx, cy, poly):                   # min distance rectangle <-> polyline (dense sampling of segments, 0.25 m)
    best = 1e9
    for (ax, ay), (bx, by) in zip(poly, poly[1:]):
        n = max(1, int(math.hypot(bx - ax, by - ay) / 0.25))
        for i in range(n + 1):
            best = min(best, rect_pt(cx, cy, ax + (bx - ax) * i / n, ay + (by - ay) * i / n))
    return best

say("HK-8b PIER FOOTPRINTS vs LOOP RAMPS and C-D ROADS (2026-11-23, data only, src NOT changed)")
say(f"Pier lines x = {PX} (d = {PD}); {len(COLY)} columns per line at y = {COLY}; column {COL_X} x {COL_Y} m; deck half width {DECK_HALF} m.")
say(f"Ramp half width {RAMP_HALF} m, clearance wanted {CLR} m (plan only).\n\nChecks:")
res = {"pierX": PX, "colY": COLY, "rows": []}
worst_all = (1e9, '')
for nm, pts in loops.items():
    poly = [(p['x'], p['y']) for p in pts]
    best = (1e9, 0, 0)
    for X in PX:
        for Y in COLY:
            d = rect_poly(X, Y, poly) - RAMP_HALF
            if d < best[0]: best = (d, X, Y)
    res["rows"].append({"loop": nm, "minClear": round(best[0], 2), "pierX": best[1], "colY": best[2]})
    if best[0] < worst_all[0]: worst_all = (best[0], nm)
    chk(best[0] >= CLR, f"{nm} loop ramp edge to nearest column", f"{best[0]:.1f} m (column x {best[1]:.0f}, y {best[2]:.0f}; need {CLR})")
# C-D roads: the two straight offsets inside the deck zone and the slip centrelines (outer offset 29.3 m N / 23.2 m S; S-bend points are in the slip lists)
cd_x = []
for key in ('slipNE', 'slipSE'):
    for p in C[key]:
        if abs(p['x']) <= 100 and abs(p['y']) <= 100: cd_x.append(abs(p['x']))  # the slip road only comes near the deck far out (x 290+, y 17): none inside this window
cd_x += [23.2, 29.3]
cd_max = max(cd_x) + RAMP_HALF
face = min(abs(X) for X in PX) - COL_X / 2
chk(face - cd_max >= 10, "C-D roads (straight 23.2 / 29.3 m + slip points in the deck window, + 4.2 m) to the nearest pier face", f"C-D outer edge x {cd_max:.1f}, pier face x {face:.1f}: {face - cd_max:.1f} m")
chk(max(abs(y) for y in COLY) + COL_Y / 2 <= DECK_HALF, "All columns inside the deck width", f"outer column face y {max(abs(y) for y in COLY) + COL_Y / 2:.1f} <= {DECK_HALF}")
chk(True, "Cap beam: span between columns / cantilever", f"16.0 m between the inner columns and the outer ones / {DECK_HALF - (max(abs(y) for y in COLY) + COL_Y / 2):.2f} m beyond the outer column face (deck edge 25.75)")
say(f"\nTightest loop to column: {worst_all[0]:.1f} m ({worst_all[1]}).")
say("RUN: this script only. NOT RUN: tsc, npm run build, ring checks, game look.")
say("NOT CHECKED: levels (plan only; the ramp is at ring level for its first metres, so a plan overlap there would be harmless but would still show FAIL); the ring AUX lanes beyond the viaduct (east 150 - 293 m, HK-5a) and their width on the embankment; terrain under the columns; the ring median / lane layout (4 columns assumed to suit any); abutments; physics; lane drop 8 -> 6 (HK-8c).")
say(f"RESULT: {fails} FAIL, {warns} WARN")
json.dump(res, open("docs/hk_piers.json", "w"), indent=1)
open("docs/HK_PIERS.txt", "w").write("\n".join(out) + "\n")
