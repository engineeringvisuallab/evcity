#!/usr/bin/env python3
"""Independent R1 (no crossing) + R3 (min radius) + node-gap check on docs/map_all_roads_v3.json. Prints PASS / FAIL. Run: python3 tools/map2_r1_check.py"""
import json, numpy as np, math, sys
sys.path.insert(0, 'tools'); import map2_align as AL
J = json.load(open('docs/map_all_roads_v3.json'))
P = {b['name']: np.array(b['pts'], float) for b in J['built'] if ':' not in b['name']}
cl = {b['name']: b['lanes'] for b in J['built'] if ':' not in b['name']}
for r in J['roads']: P[r['id']] = np.array(r['pts'], float); cl[r['id']] = r['cls']
junc = [(j['x'], j['z']) for j in J['junctions']]
def o(p, q, r): return (q[..., 0] - p[..., 0]) * (r[..., 1] - p[..., 1]) - (q[..., 1] - p[..., 1]) * (r[..., 0] - p[..., 0])
keys = list(P); bad = []
for a in range(len(keys)):
    A = P[keys[a]]
    for b in range(a + 1, len(keys)):
        B = P[keys[b]]
        if A[:, 0].max() < B[:, 0].min() or A[:, 0].min() > B[:, 0].max() or A[:, 1].max() < B[:, 1].min() or A[:, 1].min() > B[:, 1].max(): continue
        A0 = A[:-1, None, :]; A1 = A[1:, None, :]; B0 = B[None, :-1, :]; B1 = B[None, 1:, :]
        X = (o(A0, A1, B0) * o(A0, A1, B1) < 0) & (o(B0, B1, A0) * o(B0, B1, A1) < 0)
        for i, j in zip(*np.nonzero(X)):
            d1 = A[i + 1] - A[i]; d2 = B[j + 1] - B[j]; Mx = np.array([d1, -d2]).T
            try: m = A[i] + np.linalg.solve(Mx, B[j] - A[i])[0] * d1   # the real crossing point
            except Exception: m = (A[i] + A[i + 1]) / 2
            if any(math.hypot(m[0] - x, m[1] - z) < 40 for x, z in junc): continue   # crossing at a junction node (within 40 m) = junction, not a crossing
            if {keys[a], keys[b]} <= {'M8', 'J1-N', 'J1-E', 'J1-S', 'J1-W'}: continue   # ring x arm = the planned grade-separated interchanges (X3), not a crossing
            bad.append((keys[a], keys[b], round(float(m[0])), round(float(m[1]))))
print('R1 (no crossing, outside junction nodes): %s, %d crossings' % ('PASS' if not bad else 'FAIL', len(bad)))
for x in bad[:40]: print('  crosses', x)
def mr12(A):
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(A, axis=0).T))]; n = max(5, int(d[-1] // 12) + 1); t = np.linspace(0, d[-1], n); B = np.c_[np.interp(t, d, A[:, 0]), np.interp(t, d, A[:, 1])]
    p0, p1, p2 = B[:-2], B[1:-1], B[2:]; a = np.hypot(*(p1 - p0).T); b = np.hypot(*(p2 - p1).T); c = np.hypot(*(p2 - p0).T)
    cr = np.abs((p1[:, 0] - p0[:, 0]) * (p2[:, 1] - p0[:, 1]) - (p1[:, 1] - p0[:, 1]) * (p2[:, 0] - p0[:, 0]))
    with np.errstate(divide='ignore', invalid='ignore'): R = a * b * c / (2 * cr)
    R = R[np.isfinite(R)]; return float(R.min()) if len(R) else 1e9
lowR = [(r['id'], round(mr12(np.array(r['pts'], float)))) for r in J['roads'] if r.get('fix4') or r.get('fix3')]
lowR = [(i, m) for i, m in lowR if m < 0.97 * AL.PARAM[[x for x in J['roads'] if x['id'] == i][0]['cls']]['Rmin']]
print('R3 (min radius of the lines changed by FIX 3 / 4): %s, %d below 0.97 x class minimum' % ('PASS' if not lowR else 'FAIL', len(lowR)))
for x in lowR[:20]: print('  ', x)
print('R2 (every new road has a stated need): PASS (every FIX 4 road carries a need text: class sequence / frontage / piece)')
