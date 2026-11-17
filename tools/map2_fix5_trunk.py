#!/usr/bin/env python3
"""(FIX 4 apply script, built on map2_fix3.py) MAP-2 FIX 3 (user 2026-11-16): CLASS SEQUENCE. R6 must join an 8-lane road; R4 must join 8 or R6 (never only R2); R2 must join 8, R6 or R4.
Reads docs/map_all_roads_v3.json (after FIX 1), writes it back (v3) + docs/STEP_MAP2_FIX3_OUTPUT.txt.
Roots: built 8-lane roads (ring, J1 arms) and built 6-lane roads. FIXED: 8-lane, rail, J1, built roads (never moved).
METHOD (all my numbers, user may change them):
 1. CHAIN: a line whose end stops <= 100 m short of a passing road of the needed (or same) class is EXTENDED to it (end only moves, body stays),
    R3 refit (<= 25 m dev, radius >= 0.97 x class minimum), R1 crossing test, junction node >= 60 m from other nodes (else snapped to that node).
 2. 8-LANE: when no chain is possible, the best group (highest class, longest) takes ONE join on an 8-lane road:
    (a) an EXISTING tap within 70 m of the contact (R10 shift limit), or (b) a NEW tap at the contact if it keeps R5 / R6 spacing
    (>= 1600 m from every tap / join, >= 900 m from the J1 centre, never at J1 or the four ring x arm joins). Then step 1 again.
 3. What cannot be done under these rules is LISTED with the smallest change (nothing is broken silently).
Run: python3 tools/map2_fix3.py"""
import json, math, sys, os
ROOTS = set(json.load(open('docs/map2_roots.json')))   # FIX 4: 8-lane + built 6-lane that reach an 8-lane road (tools/map2_roots.py)
import numpy as np
from scipy.ndimage import binary_dilation
sys.path.insert(0, 'tools')
import map2_align as AL

SUF = os.environ.get('SUF', '')
J = json.load(open(os.environ.get('IN','docs/map_all_roads_v3_pre5.json')))   # FIX 4: start from the FIX 3c result
A3 = json.load(open('docs/a3_demand_x2.json')); NODE = {n['id']: n for n in A3['nodes']}
G = json.load(open('docs/a1_buildability.json')); rows = G['rows']; cell = G['cell']; half = G['half']
NEED = {6: (8,), 4: (8, 6), 2: (8, 6, 4)}
TOL = 100.0; JOIN = 25.0; NODE_GAP = 60.0; MAXSHIFT = 70.0
SPACING = float(os.environ.get('SPACING', '1600')); J1_CLEAR = 900.0; J1C = (-117.0, -277.0)   # J1 centre C9
ALLOWED = ['T7299', 'T8919', 'T13738', 'T18838', 'T-N880', 'T-E610', 'T-W960']
NOBRANCH = ['R1205', 'R4265', 'R12094', 'R16813']

poly = {}; cl = {}; built = set()
for b in J['built']:
    if ':' in b['name']: continue
    poly[b['name']] = np.array(b['pts'], float); cl[b['name']] = b['lanes']; built.add(b['name'])
roads = {r['id']: r for r in J['roads']}
for r in J['roads']: poly[r['id']] = np.array(r['pts'], float); cl[r['id']] = r['cls']
ids = [r['id'] for r in J['roads']]
# existing 8-lane nodes
tapxy = {k: (NODE[k]['x'], NODE[k]['z']) for k in ALLOWED}
b8 = [b for b in J['built'] if b['name'] == 'R6-8:m1']
if b8: tapxy['R6-8-tap'] = tuple(b8[0]['pts'][0])
joinxy = {k: (NODE[k]['x'], NODE[k]['z']) for k in NOBRANCH}
newtaps = {}

def seg_proj(p, a, b):
    d = b - a; L = float(d @ d)
    t = 0.0 if L == 0 else max(0.0, min(1.0, float((p - a) @ d) / L)); q = a + t * d
    return float(np.hypot(*(p - q))), q
def proj(p, Q):
    best = (1e18, None, 0)
    for i in range(len(Q) - 1):
        d, q = seg_proj(p, Q[i], Q[i + 1])
        if d < best[0]: best = (d, q, i)
    return best
def fproj(p, k):
    D = DENSE[k]; dd = np.hypot(D[:, 0] - p[0], D[:, 1] - p[1]); i = int(dd.argmin()); return float(dd[i]), D[i].copy(), i
def plen(P): return float(np.hypot(*np.diff(P, axis=0).T).sum())
def seg_x(a, b, c, d):
    o = lambda p, q, r: (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    return o(a, b, c) * o(a, b, d) < 0 and o(c, d, a) * o(c, d, b) < 0
def rs(A, step=10.0):
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(A, axis=0).T))]; n = max(2, int(d[-1] // step) + 1); s = np.linspace(0, d[-1], n)
    return np.c_[np.interp(s, d, A[:, 0]), np.interp(s, d, A[:, 1])]
def crossings(A, skip_end, target):
    """crossings of A with every road; the last `skip_end` m of A (the join) is not tested against the target road"""
    Ar = rs(A); n = 0; L = plen(A)
    seg = np.hypot(*np.diff(Ar, axis=0).T); cum = np.cumsum(seg)
    a0 = Ar[:-1]; a1 = Ar[1:]
    def o(p, q, r): return (q[..., 0] - p[..., 0]) * (r[..., 1] - p[..., 1]) - (q[..., 1] - p[..., 1]) * (r[..., 0] - p[..., 0])
    for k in poly:
        Q = COARSE[k]; b0 = Q[:-1]; b1 = Q[1:]
        if Q[:, 0].max() < Ar[:, 0].min() or Q[:, 0].min() > Ar[:, 0].max() or Q[:, 1].max() < Ar[:, 1].min() or Q[:, 1].min() > Ar[:, 1].max(): continue
        A0 = a0[:, None, :]; A1 = a1[:, None, :]; B0 = b0[None, :, :]; B1 = b1[None, :, :]
        X = (o(A0, A1, B0) * o(A0, A1, B1) < 0) & (o(B0, B1, A0) * o(B0, B1, A1) < 0)
        if k == target: X = X & (cum[:, None] <= L - skip_end)
        n += int(X.sum())
    return n
def cls_at(x, z):
    i = int((x + half) // cell); j = int((z + half) // cell); return rows[j][i] if 0 <= i < 200 and 0 <= j < 200 else '?'

# ---- passing set (class sequence) ----------------------------------------------------------------------------------------
DENSE = {}; COARSE = {}; CC = {}; VER = {}
def refresh(k):
    DENSE[k] = rs(poly[k], 5.0); COARSE[k] = rs(poly[k], 20.0); VER[k] = VER.get(k, 0) + 1
    for key in [x for x in CC if k in x]: del CC[key]
for _k in poly: refresh(_k)
def cdist(a, b):
    key = (a, b) if a < b else (b, a)
    if key not in CC:
        Pa, Pb = poly[a], poly[b]
        d = lambda p, D: float(np.sqrt(((D - p) ** 2).sum(1)).min())
        CC[key] = min(d(Pa[0], DENSE[b]), d(Pa[-1], DENSE[b]), d(Pb[0], DENSE[a]), d(Pb[-1], DENSE[a]))
    return CC[key]
def contact(a, b): return cdist(a, b)
def passing(tol):
    ok = {k for k in poly if k in ROOTS}
    near = {i: {} for i in ids}
    for i in ids:
        for k in poly:
            if k == i: continue
            d = cdist(i, k)
            if d <= tol: near[i][k] = d
    for j in J['junctions']:
        for a in j['roads']:
            for b in j['roads']:
                if a != b and a in near and b in poly: near[a][b] = 0.0
    ch = True
    while ch:
        ch = False
        for i in ids:
            if i in ok: continue
            if any(k in ok and d <= tol and (cl[k] in NEED[cl[i]] or cl[k] == cl[i]) for k, d in near[i].items()):
                ok.add(i); ch = True
    return ok

def junction_near(p, tgt):
    best = None
    for j in J['junctions']:
        d = math.hypot(j['x'] - p[0], j['z'] - p[1])
        if d < NODE_GAP and (best is None or d < best[0]): best = (d, j)
    return best

def try_extend(i, end, target, maxd, tag):
    """extend end (0 or -1) of line i to road `target`; returns (newpts, join point, node) or reason"""
    P = poly[i]; e = P[0] if end == 0 else P[-1]
    d, q, seg = fproj(e, target)
    if d > maxd: return 'too far (%.0f m)' % d
    jn = junction_near(q, target)
    if jn is not None and (target in jn[1]['roads'] or jn[1]['id'] in roads.get(target, {}).get('thru', [])): q = np.array([jn[1]['x'], jn[1]['z']])
    d = float(np.hypot(*(q - e)))
    if d <= JOIN: return None
    body = P if end == -1 else P[::-1]
    # approach tangent vs direction to the target
    t = body[-1] - body[max(0, len(body) - 4)]; v = q - body[-1]
    ang = math.degrees(math.acos(max(-1, min(1, float(t @ v) / (np.hypot(*t) * np.hypot(*v) + 1e-9)))))
    if ang > 60: return 'turn to target %.0f deg > 60' % ang
    Pn = np.vstack([body, q])
    fit = AL.fit_line(Pn, cl[i], maxdev=25.0)
    if not fit['ok'] or fit['minR'] < 0.97 * AL.PARAM[cl[i]]['Rmin']: return 'R3 refit failed (dev %.0f, minR %.0f)' % (fit['dev'], fit['minR'])
    A = fit['pts']
    if np.hypot(*(A[-1] - q)) > 3: return 'refit does not end on the target'
    # thru-junctions of the line must stay on the line
    for jid in roads[i].get('thru', []):
        jj = next(x for x in J['junctions'] if x['id'] == jid)
        if proj(np.array([jj['x'], jj['z']]), A)[0] > 20: return 'moves T-junction %s' % jid
    if crossings(A, 40.0, target): return 'new end crosses a road (R1)'
    bad = sum(1 for x, z in rs(A) if cls_at(x, z) in ('F', '~'))
    if bad * 10 > 40: return 'new end runs over fenced / water ground'
    if end == 0: A = A[::-1]
    return (A, q, fit)

def apply(i, end, target, res, tag):
    A, q, fit = res
    poly[i] = A; refresh(i)
    r = roads[i]
    # node
    jn = junction_near(q, target)
    if jn is not None and math.hypot(jn[1]['x'] - q[0], jn[1]['z'] - q[1]) < 1.0: j = jn[1]
    else:
        j = dict(id='J-%03d' % (len(J['junctions']) + 1), x=round(float(q[0]), 1), z=round(float(q[1]), 1), roads=[], tap=(cl[target] == 8)); J['junctions'].append(j)
    for k in (i, target):
        if k in poly and k not in j['roads']: j['roads'].append(k)
    if cl[target] != 8 and target in roads and j['id'] not in roads[target].setdefault('thru', []): roads[target]['thru'].append(j['id'])
    r['pts'] = [[round(float(x), 1), round(float(z), 1)] for x, z in A]; r['pis'] = fit['pis']; r['length_m'] = round(plen(A)); r['min_radius_m'] = round(fit['minR'])
    r['fix3'] = r.get('fix3', []) + ['%s end -> %s (%s)' % ('start' if end == 0 else 'end', target, tag)]
    return j

log = []; asks = []; FAIL = set()
def chain_pass():
    n = 0
    while True:
        ok = passing(JOIN); okt = passing(TOL)
        todo = [i for i in ids if i not in ok]
        done = False
        for i in sorted(todo, key=lambda x: -cl[x]):
            best = None
            for end in (0, -1):
                e = poly[i][0] if end == 0 else poly[i][-1]
                for k in poly:
                    if k == i or k not in ok or not (cl[k] in NEED[cl[i]] or cl[k] == cl[i]) or cl[k] == 8: continue
                    if k in roads and roads[k].get('cls') == cl[i] and k == i: continue
                    d = fproj(e, k)[0]
                    if JOIN < d <= TOL and (best is None or d < best[0]): best = (d, end, k)
            if best is None: continue
            d, end, k = best
            fk = ('c', i, end, k, VER[i], VER[k])
            if fk in FAIL: continue
            res = try_extend(i, end, k, TOL, 'chain')
            if not isinstance(res, tuple): FAIL.add(fk)
            if isinstance(res, tuple):
                j = apply(i, end, k, res, 'chain'); log.append('CHAIN  %-8s %s -> %-8s %3.0f m  node %s' % (i, 'start' if end == 0 else 'end  ', k, d, j['id'])); n += 1; done = True; break
            elif res is not None: asks.append((i, k, res))
        if not done: return n

def eight_lane_pass():
    ok = passing(JOIN); todo = [i for i in ids if i not in ok]
    # candidates: line end within TOL of an 8-lane road (or the 90 m cut)
    cand = []
    for i in todo:
        for end in (0, -1):
            e = poly[i][0] if end == 0 else poly[i][-1]
            for k in poly:
                if cl[k] != 8: continue
                d, q, _ = fproj(e, k)
                if d <= TOL: cand.append((i, end, k, d, q))
    # group weight = length of the lines that would pass through it (the group of the line, same-near graph)
    def weight(i):
        g = {i}; ch = True
        while ch:
            ch = False
            for a in todo:
                if a in g: continue
                if any(cdist(a, b) <= TOL for b in g): g.add(a); ch = True
        return sum(plen(poly[a]) * (1 + cl[a] / 2.0) for a in g)
    W = {i: weight(i) for i in {c[0] for c in cand}}
    cand.sort(key=lambda c: (-cl[c[0]], -W[c[0]], c[3]))
    for i, end, k, d, q in cand:
        why = None
        nodes = dict(tapxy); nodes.update(joinxy); nodes.update(newtaps)
        # (a) existing tap within the shift limit
        near_tap = min(((math.hypot(q[0] - x, q[1] - z), n) for n, (x, z) in tapxy.items()), default=(1e9, None))
        near_join = min(((math.hypot(q[0] - x, q[1] - z), n) for n, (x, z) in joinxy.items()), default=(1e9, None))
        target_pt = None; kind = None
        if near_tap[0] <= MAXSHIFT: target_pt = np.array(nodes[near_tap[1]]); kind = 'existing tap ' + near_tap[1]
        else:
            if math.hypot(q[0] - J1C[0], q[1] - J1C[1]) < J1_CLEAR: why = 'closer than %d m to the J1 centre (R5)' % J1_CLEAR
            elif near_join[0] < SPACING: why = '%.0f m from the ring x arm join %s (R5 no branch / spacing %d m)' % (near_join[0], near_join[1], SPACING)
            else:
                dn = min(((math.hypot(q[0] - x, q[1] - z), n) for n, (x, z) in nodes.items()), default=(1e9, None))
                if dn[0] < SPACING: why = '%.0f m from %s (tap spacing %d m)' % (dn[0], dn[1], SPACING)
                else: target_pt = q; kind = 'NEW tap'
        if target_pt is None:
            asks.append((i, k, why + '; nearest existing tap %s %.0f m' % (near_tap[1], near_tap[0]))); continue
        # make the 8-lane target point lie on the 8-lane road
        dd, qq, _ = fproj(target_pt, k)
        fk = ('e', i, end, k, VER[i], round(float(qq[0])), round(float(qq[1])))
        if fk in FAIL: continue
        res = try_extend_to_point(i, end, k, qq)
        if not isinstance(res, tuple): FAIL.add(fk)
        if isinstance(res, tuple):
            j = apply(i, end, k, res, '8-lane ' + kind)
            if kind == 'NEW tap': newtaps['N-' + j['id']] = (float(qq[0]), float(qq[1]))
            log.append('8-LANE %-8s %s -> %-6s %3.0f m  %s  node %s' % (i, 'start' if end == 0 else 'end  ', k, d, kind, j['id'])); return True
        else: asks.append((i, k, 'extension to the 8-lane road failed: %s' % res))
    return False

def try_extend_to_point(i, end, target, q):
    P = poly[i]; e = P[0] if end == 0 else P[-1]
    d = float(np.hypot(*(q - e)))
    if d <= JOIN: return None
    body = P if end == -1 else P[::-1]
    t = body[-1] - body[max(0, len(body) - 4)]; v = q - body[-1]
    ang = math.degrees(math.acos(max(-1, min(1, float(t @ v) / (np.hypot(*t) * np.hypot(*v) + 1e-9)))))
    if ang > 60: return 'turn to target %.0f deg > 60' % ang
    fit = AL.fit_line(np.vstack([body, q]), cl[i], maxdev=25.0)
    if not fit['ok'] or fit['minR'] < 0.97 * AL.PARAM[cl[i]]['Rmin']: return 'R3 refit failed (dev %.0f, minR %.0f)' % (fit['dev'], fit['minR'])
    A = fit['pts']
    if np.hypot(*(A[-1] - q)) > 3: return 'refit does not end on the target'
    for jid in roads[i].get('thru', []):
        jj = next(x for x in J['junctions'] if x['id'] == jid)
        if proj(np.array([jj['x'], jj['z']]), A)[0] > 20: return 'moves T-junction %s' % jid
    if crossings(A, 40.0, target): return 'new end crosses a road (R1)'
    if end == 0: A = A[::-1]
    return (A, q, fit)



# ===================== FIX 4 APPLY (AI engineering decision, user 2026-11-16 'your engineering decision') =====================
# A. R6-5 and R6-7 get a NEW connector piece (R6-5X, R6-7X, class 6) to the 8-lane road; built roads are not changed.
# B. lines that cross a new piece are SPLIT at the crossing (R1): both halves stay, a junction is made.
# C. every group that still does not touch a passing road is joined at an EXISTING tap (<= 900 m, blend: trim end 0..600 m, turn <= 75 deg, dev <= 60 m,
#    at most 2 branches per tap, one per side), highest class first.
MAXTURN = 75.0; MAXDEV = 60.0
LOG = []
def new_junction(x, z, roads_, tap=False):
    j = dict(id='J-%03d' % (len(J['junctions']) + 1), x=round(float(x), 1), z=round(float(z), 1), roads=list(roads_), tap=tap); J['junctions'].append(j); return j
def add_road(rid, cls_, A, note, extra=None):
    A = np.asarray(A, float); poly[rid] = A; cl[rid] = cls_; ids.append(rid); refresh(rid)
    r = dict(id=rid, cls=cls_, old=[], length_m=round(plen(A)), min_radius_m=0, shift_m=0, n0=None, n1=None, thru=[], bad_share=0.0, water_m=0, rail_m=0, rail_crossings=0, fenced_m=0,
             class_m={}, need=note, pis=0, pts=[[round(float(x), 1), round(float(z), 1)] for x, z in A], fix4=note)
    if extra: r.update(extra)
    J['roads'].append(r); roads[rid] = r; return r
def split_road(rid, q):
    """split line rid at the point nearest to q into rid+'a' and rid+'b'; junction roads / T-junctions are re-assigned"""
    A = poly[rid]; d, qq, i = proj(np.asarray(q, float), A)
    a = np.vstack([A[:i + 1], qq]); b = np.vstack([qq, A[i + 1:]])
    if plen(a) < 30 or plen(b) < 30:   # a stub shorter than 30 m is cut off: the line simply ENDS at the crossing (R1), same id
        keepP = b if plen(a) < 30 else a
        roads[rid]['pts'] = [[round(float(x), 1), round(float(z), 1)] for x, z in keepP]; roads[rid]['length_m'] = round(plen(keepP)); roads[rid]['fix4'] = 'end cut at (%.0f, %.0f) (R1)' % (qq[0], qq[1])
        poly[rid] = np.asarray(keepP, float); refresh(rid); return (rid, None, qq)
    ra = roads[rid]; ia, ib = rid + 'a', rid + 'b'
    for nid, P_ in ((ia, a), (ib, b)):
        r = dict(ra); r['id'] = nid; r['pts'] = [[round(float(x), 1), round(float(z), 1)] for x, z in P_]; r['length_m'] = round(plen(P_)); r['thru'] = []; r['fix4'] = 'split of %s at (%.0f, %.0f) (R1)' % (rid, qq[0], qq[1])
        J['roads'].append(r); roads[nid] = r; poly[nid] = np.asarray(P_, float); cl[nid] = cl[rid]; ids.append(nid)
    ia_, ib_ = roads[ia], roads[ib]; ia_['n1'] = None; ib_['n0'] = None; ia_['n0'] = ra.get('n0'); ib_['n1'] = ra.get('n1')
    J['roads'] = [r for r in J['roads'] if r['id'] != rid]; ids.remove(rid); del poly[rid]; del cl[rid]; del roads[rid]
    for k in (ia, ib): refresh(k)
    for j in J['junctions']:
        if rid in j['roads']:
            p = np.array([j['x'], j['z']]); j['roads'] = [x for x in j['roads'] if x != rid] + [ia if proj(p, poly[ia])[0] <= proj(p, poly[ib])[0] else ib]
    return ia, ib, qq
def piece_to(body_end_pts, q, cls_=6):
    fit = AL.fit_line(np.vstack([body_end_pts, q]), cls_, maxdev=15.0)
    A = fit['pts']; dd = np.hypot(*(A - body_end_pts[-1]).T); k = int(dd.argmin())   # start at the fit point nearest the built end (<= fit deviation), no jog
    return A[k:], fit
def tail(Q, L=200.0):
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(Q, axis=0).T))]; i = int(np.searchsorted(d, d[-1] - L)); return Q[i:]
def cross_points(A, skip=()):
    out = []
    for k, Q in poly.items():
        if k in skip: continue
        for i in range(len(A) - 1):
            for j in range(len(Q) - 1):
                if seg_x(A[i], A[i + 1], Q[j], Q[j + 1]):
                    d1 = A[i + 1] - A[i]; d2 = Q[j + 1] - Q[j]; M = np.array([d1, -d2]).T
                    try: t = np.linalg.solve(M, Q[j] - A[i])[0]; out.append((k, A[i] + t * d1))
                    except Exception: pass
    return out
def connect_piece(pid, built_name, build_end, tgt, qpt, note):
    B = poly[built_name]; body = B if build_end == -1 else B[::-1]
    A, fit = piece_to(tail(body, 200.0), np.asarray(qpt, float))
    ok_r = fit['minR'] >= 0.97 * AL.PARAM[6]['Rmin']
    cps0 = cross_points(A, skip=(built_name, tgt, pid))
    r = add_road(pid, 6, A, note, dict(min_radius_m=round(fit['minR']), rail_crossings=1 if pid == 'R6-7X' else 0))
    j0 = new_junction(A[0][0], A[0][1], [pid, built_name]); j1 = new_junction(A[-1][0], A[-1][1], [pid, tgt], tap=(cl[tgt] == 8))
    LOG.append('PIECE %s: %s end -> %s, %.0f m, min R %.0f (Rmin 229) %s, crosses %s' % (pid, built_name, tgt, plen(A), fit['minR'], 'R3 PASS' if ok_r else 'R3 FAIL', [c[0] for c in cps0]))
    donept = []
    for _ in range(10):
        cps = [c for c in cross_points(A, skip=(built_name, tgt, pid)) if all(math.hypot(c[1][0] - p[0], c[1][1] - p[1]) > 8 for p in donept)]
        if not cps: break
        k, pt = cps[0]; donept.append(pt)
        if k not in roads: LOG.append('  WARNING: piece crosses built road %s at (%.0f, %.0f): NOT split (built roads are fixed), ASK' % (k, pt[0], pt[1])); break
        s_ = split_road(k, pt)
        if s_ is None: break
        jj = new_junction(s_[2][0], s_[2][1], [pid] + [x for x in s_[:2] if x]); LOG.append('  R1 split / cut %s at (%.0f, %.0f) -> %s, junction %s' % (k, s_[2][0], s_[2][1], [x for x in s_[:2] if x], jj['id']))
    return r

ROOTS = set(json.load(open('docs/map2_roots.json')))
# ===================== FIX 5: TRUNK CONNECTORS (AI engineering decision, user 2026-11-16 'coto khato kaj thakle ses koro') =====================
# A line that still does not pass the class sequence gets a NEW connector road (class of the line, id TC-n) from one of its ends to a PASSING road of the needed (or same) class.
# 8-lane roads are NOT targets here (access only at taps, R5): the target is a passing 6 / 4 / 2-lane road. Rules: length <= 1500 m, arrival turn <= 90 deg,
# connector tangent to the line end (R3, radius >= 0.97 x class minimum), R1: no crossing of any road, <= 60 m fenced / water ground. Shortest first, highest class first.
MAXLEN = float(os.environ.get('MAXLEN','1500')); MAXTURN5 = float(os.environ.get('TURN5','90')); TC = 0; LOG = []
def new_junction(x, z, roads_, tap=False):
    j = dict(id='J-%03d' % (len(J['junctions']) + 1), x=round(float(x), 1), z=round(float(z), 1), roads=list(roads_), tap=tap); J['junctions'].append(j); return j
def add_road(rid, cls_, A, note, extra=None):
    A = np.asarray(A, float); poly[rid] = A; cl[rid] = cls_; ids.append(rid); refresh(rid)
    r = dict(id=rid, cls=cls_, old=[], length_m=round(plen(A)), min_radius_m=0, shift_m=0, n0=None, n1=None, thru=[], bad_share=0.0, water_m=0, rail_m=0, rail_crossings=0, fenced_m=0, class_m={}, need=note, pis=0, pts=[[round(float(x), 1), round(float(z), 1)] for x, z in A], fix5=note)
    if extra: r.update(extra)
    J['roads'].append(r); roads[rid] = r; return r
def tail(Q, L=200.0):
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(Q, axis=0).T))]; i = int(np.searchsorted(d, d[-1] - L)); return Q[i:]
def connector(i, end, k, q):
    P = poly[i]; body = P if end == -1 else P[::-1]; bt = tail(body, 150.0)
    tv = bt[-1] - bt[max(0, len(bt) - 4)]; v = q - bt[-1]
    ang = math.degrees(math.acos(max(-1, min(1, float(tv @ v) / (np.hypot(*tv) * np.hypot(*v) + 1e-9)))))
    if ang > MAXTURN5: return 'turn %.0f deg > %.0f' % (ang, MAXTURN5)
    fit = AL.fit_line(np.vstack([bt, q]), cl[i], maxdev=20.0)
    if not fit['ok']: return 'R3 fit failed (dev %.0f)' % fit['dev']
    A = fit['pts']; dd = np.hypot(*(A - bt[-1]).T); st = int(dd.argmin()); A = A[st:]
    if len(A) < 2 or np.hypot(*(A[-1] - q)) > 3: return 'fit does not end on the target'
    A = np.vstack([A[:-1], q]) if np.hypot(*(A[-1] - q)) > 0.5 else A
    if plen(A) > MAXLEN: return 'longer than %d m' % MAXLEN
    mr = AL.min_radius(A) if len(A) >= 3 else 1e9
    if mr < 0.97 * AL.PARAM[cl[i]]['Rmin'] and fit['minR'] < 0.97 * AL.PARAM[cl[i]]['Rmin']: return 'R3 radius %.0f' % min(mr, fit['minR'])
    if crossings(A, 40.0, k): return 'crosses a road (R1)'
    if sum(1 for x, z in rs(A) if cls_at(x, z) in ('F', '~')) * 10 > 60: return 'fenced / water ground'
    return (A, fit)
FAIL = {}; progress = True; rounds = 0
while progress and rounds < 120:
    progress = False; rounds += 1
    ok = passing(JOIN); todo = sorted([i for i in ids if i not in ok], key=lambda x: -cl[x])
    cands = []
    for i in todo:
        for end in (0, -1):
            e = poly[i][0] if end == 0 else poly[i][-1]
            for k in ok:
                if k == i or cl[k] == 8: continue
                if not (cl[k] in NEED[cl[i]] or cl[k] == cl[i]): continue
                d, q, _ = fproj(e, k)
                if 25 < d <= MAXLEN: cands.append((-cl[i], d, i, end, k, q))
    cands.sort(key=lambda c: (c[0], c[1]))
    for _, d, i, end, k, q in cands:
        fk = (i, end, k, VER[i], VER[k])
        if fk in FAIL: continue
        res = connector(i, end, k, q)
        if not isinstance(res, tuple): FAIL[fk] = res; continue
        A, fit = res; TC += 1; tid = 'TC-%d' % TC
        add_road(tid, cl[i], A, 'FIX 5 trunk connector: line %s end -> passing road %s (%.0f m), class sequence', dict(min_radius_m=round(float(AL.min_radius(A)) if len(A) >= 3 else 0)))
        roads[tid]['need'] = 'FIX 5 trunk connector: line %s -> passing road %s (%.0f m), class sequence (R%d must join %s)' % (i, k, plen(A), cl[i], '/'.join(str(x) for x in NEED[cl[i]]))
        j0 = new_junction(A[0][0], A[0][1], [tid, i]); j1 = new_junction(A[-1][0], A[-1][1], [tid, k])
        LOG.append('TRUNK %-6s class %d: %-9s %s -> %-9s %5.0f m  min R %.0f  nodes %s %s' % (tid, cl[i], i, 'start' if end == 0 else 'end  ', k, plen(A), float(AL.min_radius(A)) if len(A) >= 3 else 0, j0['id'], j1['id']))
        progress = True; break
after = passing(JOIN); b1 = {c: sum(1 for i in ids if cl[i] == c and i not in after) for c in (6, 4, 2)}
for r in J['roads']:
    if r.get('fix3') or r.get('fix4') or r.get('fix5'): r['pts'] = [[round(float(x), 1), round(float(z), 1)] for x, z in poly[r['id']]]
json.dump(J, open('docs/map_all_roads_v3.json', 'w'))
L = ['STEP MAP2-FIX5: trunk connectors (class sequence) to PASSING 6 / 4 / 2-lane roads, 8-lane roads not targeted (R5).', 'NOT joined now: R6 %d, R4 %d, R2 %d (before FIX 5: 18 / 41 / 44).' % (b1[6], b1[4], b1[2]), 'Connectors made: %d, total length %.0f m' % (TC, sum(plen(poly['TC-%d' % n]) for n in range(1, TC + 1))), '']
L += LOG + ['', 'STILL NOT JOINED (%d lines), last reason per line:' % sum(b1.values())]
for i in ids:
    if i not in after:
        rs_ = [v for k, v in FAIL.items() if k[0] == i]; L.append('  R%d %-10s %s' % (cl[i], i, (rs_[-1] if rs_ else 'no passing road of the needed class within %d m of an end' % MAXLEN)))
open('docs/STEP_MAP2_FIX5_OUTPUT.txt', 'w').write('\n'.join(L) + '\n'); print('\n'.join(L[:12]))
