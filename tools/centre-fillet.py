# STEP 21.4a: put a circular arc (class minimum radius) into the tight corners that smoothing could not fix, on docs/centre_fixed.json.
# Run order: scripts/centre-fix.ts -> tools/centre-fillet.py -> tools/centre-fixed-export.py. Backup: docs/centre_fixed_pre_fillet.json (first run only).
import json, math, os, shutil, sys
SRC = 'docs/centre_fixed.json'; BAK = 'docs/centre_fixed_pre_fillet.json'
if not os.path.exists(BAK): shutil.copy(SRC, BAK)
J = json.load(open(BAK)); L = {l['id']: l for l in J['lines']}
H = math.hypot
def cum(P):
    c = [0.0]
    for a, b in zip(P, P[1:]): c.append(c[-1] + H(b[0] - a[0], b[1] - a[1]))
    return c
def at(P, c, s):
    s = max(0, min(c[-1], s))
    for i in range(len(P) - 1):
        if c[i + 1] >= s:
            f = (s - c[i]) / ((c[i + 1] - c[i]) or 1e-9); return [P[i][0] + f * (P[i + 1][0] - P[i][0]), P[i][1] + f * (P[i + 1][1] - P[i][1])]
    return list(P[-1])
def near(P, x, z):
    best = (1e9, None)
    for a, b in zip(P, P[1:]):
        dx, dz = b[0] - a[0], b[1] - a[1]; t = max(0, min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / ((dx * dx + dz * dz) or 1e-9)))
        q = [a[0] + t * dx, a[1] + t * dz]; d = H(x - q[0], z - q[1])
        if d < best[0]: best = (d, q)
    return best
def inter(a, b, c, d):
    r = (b[0] - a[0], b[1] - a[1]); s = (d[0] - c[0], d[1] - c[1]); den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-12: return False
    t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den; u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den
    return 1e-6 < t < 1 - 1e-6 and 1e-6 < u < 1 - 1e-6
def crossings(lines, mine):
    n = 0
    for o in lines:
        if o['id'] == mine['id']: continue
        for a, b in zip(mine['pts'], mine['pts'][1:]):
            for c, d in zip(o['pts'], o['pts'][1:]):
                if inter(a, b, c, d): n += 1
    return n
RMIN = {'6': 229, '4': 113, '2': 41}
RO = {'R6-10': 113}   # R6-10: one 100 deg bend, R 229 m would need a 127 m shift; local design speed V60 = R 113 m
CASES = [('R6-10', (-3169, -3650)), ('R6-11', (1701, -1303)), ('R6-15', (-1764, -516)), ('R6-11', (2141, -1498)), ('R6-15', (-1300, -45)), ('R6-15', (-2325, -965)), ('R6-15', (-2016, -763))]
out = []
for lid, c0 in CASES:
    l = L[lid]; P = l['pts']; c = cum(P); R = RO.get(lid, RMIN[l['cls']])
    k = min(range(len(P)), key=lambda j: H(P[j][0] - c0[0], P[j][1] - c0[1]))
    s0 = c[k]
    # tangent directions from the polyline well before / after the corner window
    for W in (30, 45, 60, 80, 100, 130, 160, 200, 250, 300, 350):
        a1, a2 = at(P, c, s0 - W - 40), at(P, c, s0 - W); b1, b2 = at(P, c, s0 + W), at(P, c, s0 + W + 40)
        u = (a2[0] - a1[0], a2[1] - a1[1]); v = (b2[0] - b1[0], b2[1] - b1[1]); lu = H(*u); lv = H(*v); u = (u[0] / lu, u[1] / lu); v = (v[0] / lv, v[1] / lv)
        cr = u[0] * v[1] - u[1] * v[0]; dot = u[0] * v[0] + u[1] * v[1]; dl = math.atan2(cr, dot)
        # V = intersection of line (a2, u) and line (b1, v)
        den = u[0] * v[1] - u[1] * v[0]
        if abs(den) < 1e-9: continue
        t = ((b1[0] - a2[0]) * v[1] - (b1[1] - a2[1]) * v[0]) / den; V = (a2[0] + t * u[0], a2[1] + t * u[1])
        tl = R * math.tan(abs(dl) / 2)
        sa = s0 - W; sb = s0 + W
        # tangent points must lie on the straight parts: tl <= distance from V to the window ends
        if H(V[0] - a2[0], V[1] - a2[1]) + 1 < tl or H(V[0] - b1[0], V[1] - b1[1]) + 1 < tl: continue
        T1 = (V[0] - u[0] * tl, V[1] - u[1] * tl); T2 = (V[0] + v[0] * tl, V[1] + v[1] * tl)
        sg = 1 if dl > 0 else -1; ctr = (T1[0] - sg * u[1] * R * -1 * -1, T1[1] + sg * u[0] * R * -1 * -1)
        # centre lies to the left of u when turning left (dl > 0): left normal of u = (-u1, u0) in x-east z-south math sense used by atan2 above
        ctr = (T1[0] + sg * (-u[1]) * R, T1[1] + sg * u[0] * R)
        a_start = math.atan2(T1[1] - ctr[1], T1[0] - ctr[0]); n = max(2, int(abs(dl) * R / 8))
        arc = [[ctr[0] + R * math.cos(a_start + sg * abs(dl) * i / n), ctr[1] + R * math.sin(a_start + sg * abs(dl) * i / n)] for i in range(n + 1)]
        before = [p for i, p in enumerate(P) if c[i] < sa - 1e-6]; after = [p for i, p in enumerate(P) if c[i] > sb + 1e-6]
        newP = before + [list(at(P, c, sa))] + arc + [list(at(P, c, sb))] + after
        # keep only if the straight pieces join the arc without a back-step
        old = l['pts']; l['pts'] = newP
        shift = max(near(old, x, z)[0] for x, z in arc)
        cx = crossings(J['lines'], l); cx0 = crossings([dict(o) for o in J['lines'] if o['id'] != lid] + [dict(l, pts=old, id=lid)], dict(l, pts=old))
        if cx > cx0: l['pts'] = old; continue
        # snap the other line's end that sat on the corner onto the new arc
        moved = []
        for o in J['lines']:
            if o['id'] == lid or o['built']: continue
            for idx in (0, len(o['pts']) - 1):
                e = o['pts'][idx]
                if H(e[0] - P[k][0], e[1] - P[k][1]) < 25:
                    d, q = near(newP, e[0], e[1])
                    if d <= 30: o['pts'][idx] = [q[0], q[1]]; moved.append((o['id'], round(d)))
        out.append(f'{lid}: arc R {R} m, deflection {math.degrees(abs(dl)):.0f} deg, tangent {tl:.0f} m, window +-{W} m, max shift {shift:.0f} m, other ends moved {moved}, crossings {cx0} -> {cx}')
        break
    else: out.append(f'{lid}: NO fillet fits (straights too short); unchanged')
# R4-25: its start sits on R6-11 and the first 2 vertices make a 51 deg spike. New start = foot of vertex 2 on R6-11.
l = L['R4-25']; P = l['pts']; r = L['R6-11']
d, q = near(r['pts'], P[2][0], P[2][1])
old = list(P)
newP = [[q[0], q[1]]] + P[2:]
v1 = (newP[1][0] - newP[0][0], newP[1][1] - newP[0][1]); k2 = min(range(len(r['pts']) - 1), key=lambda i: near([r['pts'][i], r['pts'][i + 1]], q[0], q[1])[0]); w = (r['pts'][k2 + 1][0] - r['pts'][k2][0], r['pts'][k2 + 1][1] - r['pts'][k2][1])
ang = abs(math.degrees(math.atan2(v1[0] * w[1] - v1[1] * w[0], v1[0] * w[0] + v1[1] * w[1])))
ang = min(ang, 180 - ang)
l['pts'] = newP; cxn = crossings(J['lines'], l)
if H(*v1) >= 10 and ang >= 30 and cxn <= crossings([dict(o) for o in J['lines'] if o['id'] != 'R4-25'] + [dict(l, pts=old)], dict(l, pts=old)):
    out.append(f"R4-25: spike removed, start = foot of vertex 2 on R6-11 (start moved {H(q[0]-old[0][0], q[1]-old[0][1]):.0f} m), junction angle {ang:.0f} deg")
else:
    l['pts'] = old; out.append(f"R4-25: unchanged (foot piece {H(*v1):.0f} m, angle {ang:.0f} deg, crossings {cxn})")
json.dump(J, open(SRC, 'w'))
print('\n'.join(out))
