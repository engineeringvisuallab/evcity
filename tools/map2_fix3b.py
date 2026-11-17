#!/usr/bin/env python3
"""MAP-2 FIX 3 (user 2026-11-16): CLASS SEQUENCE. R6 must join an 8-lane road; R4 must join 8 or R6 (never only R2); R2 must join 8, R6 or R4.
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
J = json.load(open('docs/map_all_roads_v3.json'))   # FIX 3b: start from the FIX 3 result
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


# ===== FIX 3b: built 6-lane roots, turn limit relaxed by BLEND (trim the end of the body, refit, T-junction <= 75 deg) =====
MAXTURN = 75.0; MAXDEV = 60.0; MAXD = 350.0; TRIMS = (0, 100, 200, 300, 400, 600)
def try_blend(i, end, target, trim):
    P = poly[i]; body = P if end == -1 else P[::-1]
    # cut `trim` m off the end of the body
    seg = np.hypot(*np.diff(body, axis=0).T); cum = np.r_[0, np.cumsum(seg)]
    keepL = cum[-1] - trim
    if keepL < 150: return 'body too short after trim'
    n = int(np.searchsorted(cum, keepL)); cut = body[:n].copy()
    t_ = (keepL - cum[n - 1]) / max(seg[n - 1], 1e-9); cut = np.vstack([cut, body[n - 1] + t_ * (body[n] - body[n - 1])])
    e = cut[-1]; d, q, _ = fproj(e, target)
    jn = junction_near(q, target)
    if jn is not None and target in jn[1]['roads']: q = np.array([jn[1]['x'], jn[1]['z']])
    tv = cut[-1] - cut[max(0, len(cut) - 4)]; v = q - cut[-1]
    ang = math.degrees(math.acos(max(-1, min(1, float(tv @ v) / (np.hypot(*tv) * np.hypot(*v) + 1e-9)))))
    # angle between the join road direction and the arriving line (T needs 15..90 deg)
    D = DENSE[target]; k0 = int(np.argmin(np.hypot(*(D - q).T))); tr = D[min(k0 + 3, len(D) - 1)] - D[max(k0 - 3, 0)]
    arr = v if np.hypot(*v) > 1 else tv
    inc = math.degrees(math.acos(max(-1, min(1, abs(float(arr @ tr)) / (np.hypot(*arr) * np.hypot(*tr) + 1e-9)))))
    if ang > MAXTURN: return 'turn %.0f deg > %.0f' % (ang, MAXTURN)
    fit = AL.fit_line(np.vstack([cut, q]), cl[i], maxdev=MAXDEV)
    if not fit['ok'] or fit['minR'] < 0.97 * AL.PARAM[cl[i]]['Rmin']: return 'R3 refit failed (dev %.0f, minR %.0f)' % (fit['dev'], fit['minR'])
    A = fit['pts']
    if np.hypot(*(A[-1] - q)) > 3: return 'refit does not end on target'
    for jid in roads[i].get('thru', []):
        jj = next(x for x in J['junctions'] if x['id'] == jid)
        if proj(np.array([jj['x'], jj['z']]), A)[0] > 20: return 'moves T-junction %s' % jid
    if crossings(A, 40.0, target): return 'crosses a road (R1)'
    bad = sum(1 for x, z in rs(A) if cls_at(x, z) in ('F', '~'))
    if bad * 10 > 40: return 'fenced / water ground'
    if end == 0: A = A[::-1]
    return (A, q, fit)

before = passing(JOIN); b0 = {c: sum(1 for i in ids if cl[i] == c and i not in before) for c in (6, 4, 2)}
log = []; fails = []
progress = True
while progress:
    progress = False; ok = passing(JOIN); todo = [i for i in ids if i not in ok]
    cands = []
    for i in todo:
        for end in (0, -1):
            e = poly[i][0] if end == 0 else poly[i][-1]
            for k in built:
                if cl[k] != 6: continue
                d = fproj(e, k)[0]
                if d <= MAXD: cands.append((d, i, end, k))
    cands.sort()
    for d, i, end, k in cands:
        why = None
        for trim in TRIMS:
            res = try_blend(i, end, k, trim)
            if isinstance(res, tuple) or res is None: break
            why = res
        if isinstance(res, tuple):
            j = apply(i, end, k, res, 'blend trim %d' % trim)
            log.append('BLEND  %-8s %s -> %-6s %3.0f m  trim %d m  dev %.0f m  minR %.0f  node %s' % (i, 'start' if end == 0 else 'end  ', k, d, trim, res[2]['dev'], res[2]['minR'], j['id']))
            progress = True; break
        else: fails.append((i, k, d, why))
after = passing(JOIN); b1 = {c: sum(1 for i in ids if cl[i] == c and i not in after) for c in (6, 4, 2)}
for r in J['roads']: r['pts'] = [[round(float(x), 1), round(float(z), 1)] for x, z in poly[r['id']]] if r.get('fix3') else r['pts']
json.dump(J, open('docs/map_all_roads_v3.json', 'w'))
L = ['STEP MAP2-FIX3b: built 6-lane roots, turn limit relaxed by BLEND (trim end of body 0..600 m, refit <= %d m dev, arrival turn <= %d deg).' % (MAXDEV, MAXTURN),
     'NOT joined before: R6 %d, R4 %d, R2 %d. After: R6 %d, R4 %d, R2 %d.' % (b0[6], b0[4], b0[2], b1[6], b1[4], b1[2]), '']
L += log
L += ['', 'TRIED AND FAILED (last reason per line/root):']
seenk = set()
for i, k, d, why in fails:
    if (i, k) in seenk: continue
    seenk.add((i, k)); L.append('  %-9s -> %-6s %3.0f m : %s' % (i, k, d, why))
open('docs/STEP_MAP2_FIX3B_OUTPUT.txt', 'w').write('\n'.join(L) + '\n'); print('\n'.join(L))
