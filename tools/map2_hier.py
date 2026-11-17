#!/usr/bin/env python3
"""MAP-2 V3: class-sequence rule check on docs/map_all_roads_v2.json (nothing is moved, only reported).
RULE (user, 2026-11-16): R6 must join an 8-lane road; R4 must join 8 or R6 (never only R2); R2 must join 8, R6 or R4.
A line PASSES when one of its ends (or its body, T-junction) is within TOL of a road of the needed class that itself passes,
or of a same-class road that passes (chain: R2 -> R4 -> R6 -> 8). Built 8-lane roads (M8, J1-*) are the roots; built 6-lane roads count as passing.
Run: python3 tools/map2_hier.py   (writes docs/STEP_MAP2_V3_OUTPUT.txt)"""
import json, math, collections
ROOTS = set(json.load(open('docs/map2_roots.json')))   # FIX 4: 8-lane + built 6-lane that reach an 8-lane road (tools/map2_roots.py)
TOL = 100.0
JOIN = 25.0  # end this close (or in a junction) = joined; 25-100 m = a gap: the line stops short (e.g. the 90 m cut before an 8-lane road)
NEED = {6: (8,), 4: (8, 6), 2: (8, 6, 4)}

def load():
    import os
    J = json.load(open('docs/map_all_roads_v3.json' if os.path.exists('docs/map_all_roads_v3.json') else 'docs/map_all_roads_v2.json'))
    poly, cl = {}, {}
    for b in J['built']:
        if ':' not in b['name']:
            poly[b['name']] = b['pts']; cl[b['name']] = b['lanes']
    for r in J['roads']:
        poly[r['id']] = r['pts']; cl[r['id']] = r['cls']
    return J, poly, cl

def seg_d(p, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]; L = dx * dx + dz * dz
    t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz)

def dist_poly(p, P):
    return min(seg_d(p, P[i], P[i + 1]) for i in range(len(P) - 1))

def contact(P, Q):
    """smallest distance between an END of one line and the BODY of the other"""
    return min(min(dist_poly(P[0], Q), dist_poly(P[-1], Q)), min(dist_poly(Q[0], P), dist_poly(Q[-1], P)))

def analyse():
    J, poly, cl = load()
    ids = [r['id'] for r in J['roads']]
    near = collections.defaultdict(dict)  # id -> {other: distance}
    keys = list(poly)
    for i in ids:
        for k in keys:
            if k == i: continue
            d = contact(poly[i], poly[k])
            if d <= TOL: near[i][k] = d
    for j in J['junctions']:  # junction membership = contact too
        for a in j['roads']:
            for b in j['roads']:
                if a != b and a in poly and b in poly: near[a][b] = min(near[a].get(b, 1e9), 0.0)
    def fix(tol):
        ok = {k for k in poly if k in ROOTS}  # roots: built 8-lane, built 6-lane
        changed = True
        while changed:
            changed = False
            for i in ids:
                if i in ok: continue
                if any(k in ok and d <= tol and (cl[k] in NEED[cl[i]] or cl[k] == cl[i]) for k, d in near[i].items()):
                    ok.add(i); changed = True
        return ok
    ok = fix(TOL)          # passes if a connecting piece up to 100 m would join it
    joined = fix(JOIN)     # really joined now (end within 25 m of the road, or a junction)
    # a line that only touches same-class passing roads passes through the chain; but a line that ONLY chains to equal class
    # without the first bigger-class contact somewhere in its chain cannot pass, because roots are 8-lane / built 6-lane
    return J, poly, cl, ids, ok, joined

def nearest_fix(i, poly, cl, ok):
    best = (1e9, None)
    for k in poly:
        if k == i or k not in ok or cl[k] not in NEED[cl[i]]: continue
        d = contact(poly[i], poly[k])
        if d < best[0]: best = (d, k)
    return best

def main():
    J, poly, cl, ids, ok, joined = analyse()
    out = ['MAP-2 V3: class-sequence rule (R6 -> 8; R4 -> 8 / R6, never only R2; R2 -> 8 / R6 / R4). TOL %d m. Nothing was moved.' % TOL,
           'Roots: built 8-lane (M8, J1-N/E/S/W) and built 6-lane roads. JOINED = really touching now (<= 25 m or a junction); GAP = stops short (25-100 m). A line passes by touching a passing road of the needed class, or a passing road of its own class (chain).', '']
    bad_all = {}
    for c in (6, 4, 2):
        L = [i for i in ids if cl[i] == c]
        gap = [i for i in L if i in ok and i not in joined]
        bad = [i for i in L if i not in ok]
        bad_all.update({i: 1 for i in bad + gap})
        out.append('R%d: %d lines, JOINED %d, GAP (stops short, <= %d m piece would join) %d, FAIL (nothing in %d m) %d' % (c, len(L), len(L) - len(gap) - len(bad), TOL, len(gap), TOL, len(bad)))
        for i in gap:
            best = (1e9, None)
            for k in joined:
                if k == i or not (cl[k] in NEED[cl[i]] or cl[k] == cl[i]): continue
                d = contact(poly[i], poly[k])
                if d < best[0]: best = (d, k)
            if best[0] <= TOL: out.append('  %-9s GAP   stops %.0f m short of %s: a %.0f m piece would join it' % (i, best[0], best[1], best[0]))
            else: out.append('  %-9s GAP   joins only through the GAP lines of its group (nearest joined road %.0f m)' % (i, best[0]))
        for i in bad:
            d, k = nearest_fix(i, poly, cl, ok)
            if k is None: out.append('  %-9s FAIL  no passing road of the needed class anywhere' % i)
            else: out.append('  %-9s FAIL  smallest change: extend end %.0f m to %s%s' % (i, d, k, '' if d <= 70 else ' (> 70 m: ASK)'))
        out.append('')
    open('docs/STEP_MAP2_V3_OUTPUT.txt', 'w', newline='').write('\r\n'.join(out) + '\r\n')
    print('\n'.join(l for l in out if l.startswith('R')))
    return bad_all

if __name__ == '__main__': main()
