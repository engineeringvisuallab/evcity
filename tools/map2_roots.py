#!/usr/bin/env python3
"""MAP-2 FIX 4 step 1: which BUILT 6-lane roads really reach an 8-lane road (touch <= TOUCH m, directly or through other built 6-lane roads)?
Roots for the class-sequence rule = 8-lane + only the connected built 6-lane roads. Run: python3 tools/map2_roots.py"""
import json, numpy as np
from scipy.spatial import cKDTree
TOUCH = 30.0; PH = 150.0   # PH = junction placeholder gap (the 90 m cut + margin): built road ends there on purpose, counts as joined to the 8-lane road
J = json.load(open('docs/map_all_roads_v3.json'))
def dense(P, s=5.0):
    P = np.array(P, float); d = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]; n = max(2, int(d[-1] // s) + 1); t = np.linspace(0, d[-1], n)
    return np.c_[np.interp(t, d, P[:, 0]), np.interp(t, d, P[:, 1])]
B = {b['name']: (b['lanes'], dense(b['pts'])) for b in J['built'] if ':' not in b['name']}
T = {k: cKDTree(v[1]) for k, v in B.items()}
def gap(a, b):
    """smallest distance between the two polylines, and between an END of a and b"""
    d = T[b].query(B[a][1])[0].min(); de = min(T[b].query(B[a][1][0])[0], T[b].query(B[a][1][-1])[0]); return d, de
eight = [k for k, v in B.items() if v[0] == 8]; six = [k for k, v in B.items() if v[0] == 6]
conn = set(); ch = True
while ch:
    ch = False
    for k in six:
        if k in conn: continue
        for o in eight + sorted(conn):
            if o != k and gap(k, o)[0] <= TOUCH: conn.add(k); ch = True; break
ph = set(); ch = True
while ch:
    ch = False
    for k in six:
        if k in conn or k in ph: continue
        for o in eight + sorted(conn) + sorted(ph):
            if o != k and gap(k, o)[1] <= PH or (o != k and gap(k, o)[0] <= TOUCH): ph.add(k); ch = True; break
print('BUILT 6-lane roots check (touch <= %.0f m, placeholder gap <= %.0f m):' % (TOUCH, PH))
out = []
for k in six:
    near = sorted(((gap(k, o)[0], o) for o in B if o != k and (B[o][0] >= 6)))[:3]
    s = 'CONNECTED to 8-lane (chain)' if k in conn else ('PLACEHOLDER GAP <= %.0f m (counts as root)' % PH if k in ph else 'ISOLATED (NOT a root)')
    line = '  %-7s %s | nearest: %s' % (k, s, ', '.join('%s %.0f m' % (o, d) for d, o in near)); print(line); out.append(line)
json.dump(sorted(conn | ph) + eight, open('docs/map2_roots.json', 'w'))
open('docs/STEP_MAP2_FIX4_ROOTS.txt', 'w').write('\n'.join(out) + '\n')
