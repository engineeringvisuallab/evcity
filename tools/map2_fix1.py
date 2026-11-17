#!/usr/bin/env python3
"""MAP-2 FIX 1 (user 2026-11-16): HILLS. Unbuilt centrelines (R6 / R4 / R2 of docs/map_all_roads_v2.json) are moved AROUND hills.
RULES (user): 8-lane roads, rail and J1 are FIXED; roads already built in the game are NOT touched (they are not in 'roads');
everything else is moved later (relocation), so only the centreline is fixed now.
HILL RULE: R4 / R2 (and R6): if a line can go round a hill with a SMALL cut / fill, it goes round. TUNNEL only when no way round exists.
Method: per piece between pinned points (line ends + T-junctions), cheapest path on the A1 50 m ground grid inside a corridor round the old piece,
then R3 refit (straight - spiral - arc - spiral - straight), then R1 crossing check against every other road. A change is kept only if ALL pass.
Run: python3 tools/map2_fix1.py     writes docs/map_all_roads_v3.json, docs/STEP_MAP2_FIX1_OUTPUT.txt"""
import json, math, sys
import numpy as np
from skimage.graph import route_through_array
from scipy.ndimage import binary_dilation
sys.path.insert(0, 'tools')
import map2_align as AL

J = json.load(open('docs/map_all_roads_v2.json'))
G = json.load(open('docs/a1_buildability.json')); rows = G['rows']; cell = G['cell']; half = G['half']; N = G['n']
COST = {'A': 1.0, 'B': 1.2, 'C': 2.0, 'D': 8.0, 'E': 60.0, 'R': 6.0}   # MY numbers; F, X and water are blocked
BLOCK = 1e6
CORR = {6: 6, 4: 6, 2: 6}   # corridor half width in cells (6 x 50 = 300 m round the old piece)
MAXDEV = 60.0               # R3 refit may move at most 60 m from the routed path (the 50 m grid path is coarse)
GRID = np.full((N, N), BLOCK)
for j in range(N):
    for i in range(N):
        GRID[j, i] = COST.get(rows[j][i], BLOCK)

def ij(x, z): return (min(N - 1, max(0, int((z + half) // cell))), min(N - 1, max(0, int((x + half) // cell))))
def cls_at(x, z): j, i = ij(x, z); return rows[j][i]
def plen(P): return float(sum(math.dist(P[k], P[k + 1]) for k in range(len(P) - 1)))
def resample(P, step=10.0):
    P = np.asarray(P, float); d = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
    n = max(2, int(d[-1] // step) + 1); s = np.linspace(0, d[-1], n)
    return np.c_[np.interp(s, d, P[:, 0]), np.interp(s, d, P[:, 1])], d[-1] / (n - 1)
def stats(P):
    Q, st = resample(P, 10.0); c = {}
    for x, z in Q: k = cls_at(x, z); c[k] = c.get(k, 0) + 1
    return {k: round(v * st) for k, v in c.items()}
def hill(s): return s.get('D', 0) + s.get('E', 0)
def bad(s): return s.get('F', 0) + s.get('~', 0) + s.get('X', 0)

def seg_x(a, b, c, d):
    def o(p, q, r): return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    return o(a, b, c) * o(a, b, d) < 0 and o(c, d, a) * o(c, d, b) < 0
def crosses(P, Q, skip=15.0):
    """proper crossings of two polylines (ignores a touch within `skip` m of an end of P = a junction)"""
    P = resample(P, 20.0)[0]; Q = resample(Q, 20.0)[0]; n = 0
    for a in range(len(P) - 1):
        if min(math.dist(P[a], P[0]), math.dist(P[a], P[-1])) < skip: continue
        for b in range(len(Q) - 1):
            if seg_x(P[a], P[a + 1], Q[b], Q[b + 1]): n += 1
    return n

OCC = np.zeros((N, N), int)
def raster(P):
    m = np.zeros((N, N), bool)
    for x, z in resample(P, 20.0)[0]: m[ij(x, z)] = True
    return binary_dilation(m, iterations=1)
RAST = {}
def route(P, w, rid=None):
    """cheapest path along old piece P inside a w-cell corridor; ends stay"""
    mask = np.zeros((N, N), bool)
    for x, z in resample(P, 20.0)[0]: mask[ij(x, z)] = True
    mask = binary_dilation(mask, iterations=w)
    C = np.where(mask, GRID, BLOCK)
    if rid is not None:   # keep off every other road (R1), except round this piece's own ends / pins
        occ = np.zeros((N, N), bool)
        for k, m in RAST.items():
            if k != rid: occ |= m
        near = np.zeros((N, N), bool)
        for p in (P[0], P[-1]): near[ij(*p)] = True
        near = binary_dilation(near, iterations=4)
        C[occ & ~near] = BLOCK
    a = ij(*P[0]); b = ij(*P[-1]); C[a] = 1.0; C[b] = 1.0
    path, cost = route_through_array(C, a, b, fully_connected=True, geometric=True)
    if cost >= BLOCK: return None
    pts = [list(P[0])] + [[-half + (i + .5) * cell, -half + (j + .5) * cell] for j, i in path[1:-1]] + [list(P[-1])]
    return pts

JX = {j['id']: (j['x'], j['z']) for j in J['junctions']}
ALL = {r['id']: r['pts'] for r in J['roads']}
for b in J['built']:
    if ':' not in b['name']: ALL[b['name']] = b['pts']
report = []; changed = {}
for k, q in ALL.items(): RAST[k] = raster(q)
for r in J['roads']:
    P = np.asarray(r['pts'], float); cl = r['cls']; s0 = stats(P)
    row = dict(id=r['id'], cls=cl, len0=round(plen(P)), hill0=hill(s0), E0=s0.get('E', 0), status='ok-no-hill')
    if hill(s0) < 60:
        report.append(row); continue
    # pins: line ends + T-junctions on the body, in order along the line
    pins = [0, len(P) - 1]
    for jid in r.get('thru', []):
        x, z = JX[jid]; k = int(np.argmin(np.hypot(P[:, 0] - x, P[:, 1] - z)))
        if 0 < k < len(P) - 1: pins.append(k)
    pins = sorted(set(pins)); new = []
    for a, b in zip(pins[:-1], pins[1:]):
        seg = P[a:b + 1]
        if hill(stats(seg)) < 40: piece = [list(p) for p in seg]
        else:
            cands = [route(seg, w, r['id']) for w in (CORR[cl], 10)]
            cands = [c for c in cands if c]
            piece = min(cands, key=lambda c: (stats(c).get('E', 0) * 4 + hill(stats(c)))) if cands else [list(p) for p in seg]
            if hill(stats(piece)) >= hill(stats(seg)): piece = [list(p) for p in seg]
        new += piece if not new else piece[1:]
    fit = AL.fit_line(np.asarray(new), cl, maxdev=MAXDEV)
    if not fit['ok'] or fit['minR'] < 0.97 * AL.PARAM[cl]['Rmin']:
        row['status'] = 'KEEP old (R3 refit failed: dev %.0f m, minR %.0f)' % (fit['dev'], fit['minR']); report.append(row); continue
    A = fit['pts']; s1 = stats(A)
    row.update(len1=round(plen(A)), hill1=hill(s1), E1=s1.get('E', 0), bad1=bad(s1), minR=round(fit['minR']), shift=round(fit['dev']))
    xc = sum(crosses(A, q) for k, q in ALL.items() if k != r['id'])
    xc += sum(crosses(A, [p for p in q]) for k, q in [] )
    if xc: row['status'] = 'KEEP old (new route crosses %d road(s), R1)' % xc; report.append(row); continue
    if bad(s1) > bad(s0): row['status'] = 'KEEP old (new route has more fenced / water / fixed-road ground)'; report.append(row); continue
    if plen(A) > 1.7 * plen(P): row['status'] = 'KEEP old (new route %.1fx longer)' % (plen(A) / plen(P)); report.append(row); continue
    if hill(s1) >= 0.8 * hill(s0): row['status'] = 'KEEP old (no real gain: hill %d -> %d m)' % (hill(s0), hill(s1)); report.append(row); continue
    row['status'] = 'MOVED'; changed[r['id']] = (A, fit); report.append(row)
    ALL[r['id']] = [list(map(float, p)) for p in A]; RAST[r['id']] = raster(ALL[r['id']])

# tunnel candidates = still more than 100 m of very steep ground after the best try
for row in report:
    e = row.get('E1', row['E0'])
    row['tunnel_candidate'] = e > 100
# write v3
for r in J['roads']:
    if r['id'] in changed:
        A, fit = changed[r['id']]
        r['pts'] = [[round(float(x), 1), round(float(z), 1)] for x, z in A]
        r['pis'] = fit['pis']; r['length_m'] = round(plen(A)); r['min_radius_m'] = round(fit['minR'])
        r['shift_m'] = max(r.get('shift_m', 0), round(fit['dev'])); r['fix1'] = 'moved round hill'
json.dump(J, open('docs/map_all_roads_v3.json', 'w'))
# text output
moved = [x for x in report if x['status'] == 'MOVED']; hills = [x for x in report if x['status'] != 'ok-no-hill']
L = ['STEP MAP2-FIX1: hills. %d unbuilt lines, %d have 60 m or more of steep (D / E) ground, %d MOVED round the hill, %d kept.' % (len(report), len(hills), len(moved), len(hills) - len(moved))]
L.append('hill metres (D + E) before: %d m, after: %d m (all lines)' % (sum(x['hill0'] for x in report), sum(x.get('hill1', x['hill0']) if x['status'] == 'MOVED' else x['hill0'] for x in report)))
L.append('very steep (E) metres before: %d, after: %d' % (sum(x['E0'] for x in report), sum(x.get('E1', x['E0']) if x['status'] == 'MOVED' else x['E0'] for x in report)))
for c in (6, 4, 2):
    xs = [x for x in hills if x['cls'] == c]; L.append('R%d: %d with hill, %d moved' % (c, len(xs), len([x for x in xs if x['status'] == 'MOVED'])))
L.append(''); L.append('id | len old | hill old | E old | status | len new | hill new | E new | minR | shift | tunnel?')
for x in hills:
    L.append('%s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s' % (x['id'], x['len0'], x['hill0'], x['E0'], x['status'], x.get('len1', ''), x.get('hill1', ''), x.get('E1', ''), x.get('minR', ''), x.get('shift', ''), 'TUNNEL-CANDIDATE' if x['tunnel_candidate'] else ''))
open('docs/STEP_MAP2_FIX1_OUTPUT.txt', 'w').write('\n'.join(L) + '\n'); print('\n'.join(L[:8]))
