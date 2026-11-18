#!/usr/bin/env python3
"""B7-3a-2: T22 (R6-11 end on M8, s 13430) TRUMPET geometry sheet. Numbers + picture only; changes NO src file.
Run: python3 tools/b7-3a-t22.py   (needs docs/b7_3a_t22_in.json from: npx tsx scripts/b7-3a-t22-export.ts docs)
Frame: origin = tap on the M8 axis, u = along M8 point order (A), v = LEFT of A (left-hand traffic: A runs on v>0, B on v<0). Stem R6-11 is on v<0.
Heading phi measured from +u toward +v (CCW in the (u,v) plane); left turn = +phi."""
import json, math, sys
import numpy as np
from scipy.optimize import least_squares
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt

D = json.load(open('docs/b7_3a_t22_in.json'))
cx, cz = D['tap']; main = np.array(D['main']); stem = np.array(D['stem']); g = D['grid']
i0 = int(np.argmin(abs(main[:, 0])));
a, b = max(0, i0 - 3), min(len(main) - 1, i0 + 3)
ex = np.array([main[b, 1] - main[a, 1], main[b, 2] - main[a, 2]]); ex /= np.linalg.norm(ex)   # u axis in world (x, z)
ev = np.array([ex[1], -ex[0]])                                                                  # v = left of A
def loc(x, z): d = np.array([x - cx, z - cz]); return float(d @ ex), float(d @ ev)
def wor(u, v): return cx + u * ex[0] + v * ev[0], cz + u * ex[1] + v * ev[1]
rows = np.array(g['rows']); WET = rows >= 1000; H = np.where(WET, rows - 1000, rows)
def ground(x, z):
    fx = (x - g['x0']) / g['step']; fz = (z - g['z0']) / g['step']; ix, iz = int(fx), int(fz)
    if ix < 0 or iz < 0 or ix >= rows.shape[1] - 1 or iz >= rows.shape[0] - 1: return float('nan'), False
    tx, tz = fx - ix, fz - iz
    h = (H[iz, ix] * (1 - tx) + H[iz, ix + 1] * tx) * (1 - tz) + (H[iz + 1, ix] * (1 - tx) + H[iz + 1, ix + 1] * tx) * tz
    w = bool(WET[iz:iz + 2, ix:ix + 2].any()); return float(h), w
# ---- inputs from the game data
S = {'hw': D['mainSection']['halfWidth'], 'med': D['mainSection']['medianHalf'], 'lw': D['mainSection']['laneW'], 'shy': D['mainSection']['shyOuter']}
LANE_OUT = S['hw'] - S['shy']             # outer lane edge 19.1
VEX = LANE_OUT + S['lw'] / 2              # ramp lane centre beside the outer lane 20.9
st = np.array([[s[0], *loc(s[1], s[2]), s[3], s[4]] for s in stem])       # q, u, v, y, hNat (q<=0, 0 = end on M8)
ys_end = st[-1, 3]; mainY = lambda u: float(np.interp(u, main[:, 0], main[:, 3]))
# stem axis direction (heading away from M8) from the last 60 m
p0, p1 = st[-1, 1:3], st[np.argmin(abs(st[:, 0] + 60)), 1:3]
psi_out = math.atan2(p1[1] - p0[1], p1[0] - p0[0])   # heading from the M8 end away along the stem
ang_stem = abs(math.degrees(math.atan2(math.sin(psi_out - math.pi / 2 * -1), math.cos(psi_out)))) 
print(f'stem outbound heading psi = {math.degrees(psi_out) % 360:.1f} deg in the (u,v) frame (270 = perpendicular to M8 toward v<0); angle to M8 = {90 - abs(math.degrees(psi_out) % 360 - 270):.1f} deg')
# stem point at the M8 axis crossing and lane lines
def stem_at(qd):  # point on the stem axis at distance qd (>0) from the M8 end, along the extended stem direction
    return p0 + qd * np.array([math.cos(psi_out), math.sin(psi_out)])
OFF = S['med'] if False else 0
R6_HW, R6_MED, R6_LW = D['stemSection']['halfWidth'], D['stemSection']['medianHalf'], D['stemSection']['laneW']
CC = R6_MED + R6_LW * 1.5                 # carriageway centre offset 7.25 (3 lanes of 3.5)
nrm = np.array([-math.sin(psi_out), math.cos(psi_out)])   # left of the stem outbound heading
def lane(qd, side):  # side +1 = outbound carriageway centre (left of outbound heading), -1 = inbound
    return stem_at(qd) + side * CC * nrm
print(f'stem outbound heading left normal = ({nrm[0]:.2f},{nrm[1]:.2f}); outbound carriageway lies on the {"+u (B-exit) side" if nrm[0] > 0 else "-u side"}')
# ---- path integrator: straight and spiral-arc-spiral pieces
def seg_line(P, L, n=None):
    x, y, h = P; n = max(2, int(L)); t = np.linspace(0, L, n + 1)[1:]
    pts = np.c_[x + t * math.cos(h), y + t * math.sin(h)]; return pts, (pts[-1, 0] if len(pts) else x, pts[-1, 1] if len(pts) else y, h)
def seg_curve(P, R, dth, Ls):
    """spiral-in Ls, arc, spiral-out Ls; dth signed total deflection (rad); needs |dth| >= Ls/R."""
    x, y, h = P; sg = 1 if dth >= 0 else -1; tot = abs(dth); arc = max(0.0, tot - Ls / R) * R
    L = 2 * Ls + arc; n = max(4, int(L)); out = []; ds = L / n
    for i in range(n):
        s = (i + 0.5) * ds
        k = (s / Ls if s < Ls else (1 if s < Ls + arc else max(0, (L - s) / Ls))) / R
        h += sg * k * ds; x += ds * math.cos(h - sg * k * ds / 2); y += ds * math.sin(h - sg * k * ds / 2); out.append((x, y))
    return np.array(out), (x, y, h)
def run(P, spec):
    pts = [np.array([[P[0], P[1]]])]; cur = P
    for s in spec:
        q, cur = (seg_line(cur, s[1]) if s[0] == 'L' else seg_curve(cur, s[1], s[2], s[3]))
        pts.append(q)
    return np.vstack(pts), cur
def hit(P, spec, target, free, init):
    def f(z):
        sp = [list(s) for s in spec]
        for (si, k), val in zip(free, z): sp[si][k] = val
        _, e = run(P, sp); return [e[0] - target[0], e[1] - target[1]]
    r = least_squares(f, init, bounds=([0.0] * len(init), [3000.0] * len(init)))
    sp = [list(s) for s in spec]
    for (si, k), val in zip(free, r.x): sp[si][k] = float(val)
    pts, e = run(P, sp); return pts, e, sp, float(np.hypot(e[0] - target[0], e[1] - target[1]))
V50R, V50LS, LOOPR, LOOPLS, SDR, SDLS = 75.0, 35.0, 45.0, 30.0, 100.0, 40.0
TAPER_EX, TAPER_EN = 91.3, 182.5
dec = lambda va, vb, a: abs((va / 3.6) ** 2 - (vb / 3.6) ** 2) / (2 * a)
EXIT_ZONE = TAPER_EX + dec(100, 50, 2.5); ENTRY_ZONE = TAPER_EN + dec(50, 85, 1.2)
print(f'exit zone {EXIT_ZONE:.1f} m (taper {TAPER_EX} + decel {dec(100,50,2.5):.1f}), entry zone {ENTRY_ZONE:.1f} m (taper {TAPER_EN} + accel {dec(50,85,1.2):.1f})')
Q = 140.0                                  # tie-in distance along the stem from the M8 axis end
RAMPS = {}
# m1 B -> R6 exit slip (left, easy): B heading 180, lane v=-VEX; ends on the OUTBOUND stem lane
P1 = (200.0, -VEX, math.pi)
dth1 = (psi_out - math.pi); dth1 = (dth1 + math.pi) % (2 * math.pi) - math.pi
t1 = lane(Q, +1)
pts, e, sp, err = hit(P1, [['L', 0.0], ['C', V50R, dth1, V50LS], ['L', 50.0]], t1, [(0, 1), (2, 1)], [1.0, 60.0])
# start u free: shift start; solve by moving start u
def solve_start_u(P, spec, target, free, init, u_guess):
    def f(z):
        PP = (z[0], P[1], P[2]); sp = [list(s) for s in spec]
        for (si, k), val in zip(free, z[1:]): sp[si][k] = val
        _, e = run(PP, sp); return [e[0] - target[0], e[1] - target[1]]
    r = least_squares(f, [u_guess] + init, bounds=([-900.0] + [0.0] * len(init), [900.0] + [3000.0] * len(init)))
    PP = (float(r.x[0]), P[1], P[2]); sp = [list(s) for s in spec]
    for (si, k), val in zip(free, r.x[1:]): sp[si][k] = float(val)
    pts, e = run(PP, sp); return pts, PP, sp, float(np.hypot(e[0] - target[0], e[1] - target[1]))
pts, PP, sp, err = solve_start_u(P1, [['L', 0.0], ['C', V50R, dth1, V50LS], ['L', 50.0]], t1, [(2, 1)], [60.0], 100.0)
RAMPS['m1'] = dict(name='B->R6 exit slip', pts=pts, start=PP, spec=sp, err=err, R=V50R, speed=50, lanes=1)
# m2 R6 -> B entry slip (left, easy): from inbound stem lane heading toward M8 (psi_out+180) to B lane v=-VEX heading 180
t2 = lane(Q, -1); h2 = psi_out + math.pi; dth2 = (math.pi - h2 + math.pi) % (2 * math.pi) - math.pi
def solve_end_u(Pst, spec, vend, free, init):
    def f(z):
        sp = [list(s) for s in spec]
        for (si, k), val in zip(free, z): sp[si][k] = val
        _, e = run(Pst, sp); return [e[1] - vend, 0.0]
    r = least_squares(f, init, bounds=([0.0] * len(init), [3000.0] * len(init)))
    sp = [list(s) for s in spec]
    for (si, k), val in zip(free, r.x): sp[si][k] = float(val)
    pts, e = run(Pst, sp); return pts, e, sp, float(abs(e[1] - vend))
pts, e, sp, err = solve_end_u((t2[0], t2[1], h2), [['L', 10.0], ['C', V50R, dth2, V50LS], ['L', 0.0]], -VEX, [(0, 1)], [20.0])
RAMPS['m2'] = dict(name='R6->B entry slip', pts=pts, start=(t2[0], t2[1], h2), spec=sp, err=err, R=V50R, speed=50, lanes=1, merge_u=float(e[0]))
# m3 A -> R6 LOOP (A exit LEFT, 270 deg left turn, crosses M8 heading west, lands on the OUTBOUND stem lane)
dth3 = (psi_out - 0.0) % (2 * math.pi)            # CCW from phi 0 to psi_out (about 264 deg)
P3 = (60.0, VEX, 0.0)
pts, PP, sp, err = solve_start_u(P3, [['L', 0.0], ['C', LOOPR, dth3, LOOPLS], ['L', 80.0]], lane(Q, +1), [(2, 1)], [80.0], 60.0)
RAMPS['m3'] = dict(name='A->R6 loop', pts=pts, start=PP, spec=sp, err=err, R=LOOPR, speed=40, lanes=1)
# m4 R6 -> A semi-direct: inbound stem lane, straight over M8 to the east, right 90, south, S-curve back, merge A heading south at v=VEX
t4 = lane(Q, -1); h4 = psi_out + math.pi
def f4(z):
    L0, L1, th = z
    spec = [['L', L0], ['C', SDR, (0.0 - h4 + math.pi) % (2 * math.pi) - math.pi if False else -(h4 % (2 * math.pi)) if h4 % (2 * math.pi) < math.pi else -(h4 % (2 * math.pi)), SDLS], ['L', L1], ['C', SDR, -th, SDLS], ['C', SDR, th, SDLS], ['L', 0.0]]
    _, e = run((t4[0], t4[1], h4), spec); return [e[1] - VEX, e[2] if False else 0.0]
H4TURN = -((h4 % (2 * math.pi)))            # right turn to heading 0 (south)
if H4TURN < -math.pi: H4TURN += 2 * math.pi
def build_m4(L0, L1, th, L2):
    spec = [['L', L0], ['C', SDR, H4TURN, SDLS], ['L', L1], ['C', SDR, -th, SDLS], ['C', SDR, th, SDLS], ['L', L2]]
    return run((t4[0], t4[1], h4), spec) + (spec,)
th4 = math.radians(55.0)
def r4(z):
    pts, e, _ = build_m4(z[0], z[1], th4, 0.0); return [e[1] - VEX, e[0] - 280.0]
sol = least_squares(r4, [120.0, 100.0], bounds=([0.0, 0.0], [1500.0, 1500.0]))
pts, e, spec4 = build_m4(sol.x[0], sol.x[1], th4, 0.0)
RAMPS['m4'] = dict(name='R6->A semi-direct (outside the loop)', pts=pts, start=(t4[0], t4[1], h4), spec=spec4, err=float(np.hypot(e[1] - VEX, e[0] - 280.0)), R=SDR, speed=50, lanes=1, merge_u=float(e[0]))
# ---- measures
def length(p): return float(np.sum(np.hypot(*np.diff(p, axis=0).T)))
def minrad(p, step=12):
    q = p[::step]
    if len(q) < 3: return float('inf')
    h = np.arctan2(np.diff(q[:, 1]), np.diff(q[:, 0])); dh = np.abs((np.diff(h) + np.pi) % (2 * np.pi) - np.pi); ds = np.hypot(np.diff(q[:, 0]), np.diff(q[:, 1]))
    c = dh / (0.5 * (ds[1:] + ds[:-1])); return float(1 / max(c.max(), 1e-9))
for k, r in RAMPS.items():
    p = r['pts']; r['len'] = length(p); r['minR'] = minrad(p)
    r['wet'] = sum(1 for (u, v) in p[::5] if ground(*wor(u, v))[1])
    r['ground'] = [ground(*wor(u, v))[0] for (u, v) in p[::10]]
    print(f"{k} {r['name']}: length {r['len']:.0f} m, min radius {r['minR']:.0f} m (design R {r['R']}), end miss {r['err']:.2f} m, wet samples {r['wet']}")
    print(f"     start u {r['start'][0]:.1f} v {r['start'][1]:.1f}" + (f", merge u {r['merge_u']:.1f}" if 'merge_u' in r else ''))
# ---- level plan: over or under?
yA0 = mainY(0.0); CLEAR, DECK, MARG = 5.5, 2.0, 0.3; SEP = CLEAR + DECK + MARG
# crossing station of the stem axis with the M8 axis (v=0), distance along the stem
def prof_stem(q):  # existing R6-11 level at q (q<=0 toward the stem start)
    return float(np.interp(q, st[:, 0], st[:, 3]))
print(f'M8 level at the tap {yA0:.2f}; separation needed {SEP:.1f} m (clear {CLEAR} + deck {DECK} + margin {MARG}); R6-11 level at q=-100/-200/-300: {prof_stem(-100):.2f}/{prof_stem(-200):.2f}/{prof_stem(-300):.2f}')
gx, gz = wor(0, 0)
def stem_ground(q): x, z = stem_at(-q) if False else (None, None); return None
sg_line = []
for qd in range(-400, 401, 20):
    px, py = p0 + (-qd) * np.array([math.cos(psi_out), math.sin(psi_out)]) if False else p0 + qd * np.array([math.cos(psi_out), math.sin(psi_out)])
    hh, ww = ground(*wor(px, py)); sg_line.append((qd, hh, ww))
print('ground on the stem axis extended (qd = distance from M8 axis toward the stem; negative = east of M8):')
print('  ' + ' '.join(f'{q}:{h:.1f}{"W" if w else ""}' for q, h, w in sg_line if q % 60 == 0))

# ---- level plan check: R6 OVER M8 (separation %.1f m) and ramps rise / fall linearly between their end levels
yR6 = yA0 + SEP
print(f'R6 deck over M8: {yR6:.2f} m; existing R6-11 level 200 m west {prof_stem(-200):.2f} m -> approach grade R6 from 200 m west to the bridge: {(yR6 - prof_stem(-200)) / 200 * 100:.2f} %')
print(f'UNDER option: R6 would have to be at {yA0 - SEP:.2f} m; from {prof_stem(-200):.2f} m (200 m west) that is {(prof_stem(-200) - (yA0 - SEP)) / 200 * 100:.1f} % downhill (R6 limit 4 %) -> FAIL, OVER chosen')
def cutfill(p, y0, y1):
    n = len(p); L = np.r_[0, np.cumsum(np.hypot(*np.diff(p, axis=0).T))]; lv = y0 + (y1 - y0) * L / L[-1]
    gh = np.array([ground(*wor(u, v))[0] for u, v in p]); d = lv - gh
    return float(np.nanmax(d)), float(np.nanmax(-d)), (y1 - y0) / L[-1] * 100
for k, (y0, y1) in {'m1': (yA0, yR6), 'm3': (yA0, yR6), 'm2': (yR6, mainY(RAMPS['m2']['merge_u'])), 'm4': (yR6, mainY(RAMPS['m4']['merge_u']))}.items():
    f_, c_, gr_ = cutfill(RAMPS[k]['pts'], y0, y1); RAMPS[k]['fill'] = f_; RAMPS[k]['cut'] = c_; RAMPS[k]['grade'] = gr_
    print(f"{k}: levels {y0:.1f} -> {y1:.1f}, mean grade {gr_:.2f} %, max fill {f_:.1f} m, max cut {c_:.1f} m (centre line vs ground)")

json.dump({'frame': {'origin': [cx, cz], 'eu': ex.tolist(), 'ev': ev.tolist()}, 'psi_out_deg': math.degrees(psi_out), 'ramps': {k: {'name': r['name'], 'len': r['len'], 'minR': r['minR'], 'pts_uv': np.round(r['pts'][::5], 2).tolist()} for k, r in RAMPS.items()}}, open('docs/b7_3a_t22_geom.json', 'w'))
# ---- picture (world orientation: x east, z south)
fig, ax = plt.subplots(figsize=(11, 11))
xs = np.linspace(g['x0'], g['x0'] + g['step'] * (rows.shape[1] - 1), rows.shape[1]); zs = np.linspace(g['z0'], g['z0'] + g['step'] * (rows.shape[0] - 1), rows.shape[0])
cs = ax.contour(xs, zs, np.where(WET, np.nan, H), levels=list(range(16, 130, 4)), colors='#8a7b66', linewidths=0.6); ax.clabel(cs, fmt='%d', fontsize=6)
ax.contourf(xs, zs, np.where(WET, 1, np.nan), levels=[0.5, 1.5], colors=['#7fb3e6'], alpha=0.7)
ax.plot(main[:, 1], main[:, 2], 'k-', lw=2, label='M8 axis'); ax.plot(stem[:, 1], stem[:, 2], color='#c0392b', lw=2, label='R6-11 (game)')
cols = {'m1': '#e67e22', 'm2': '#27ae60', 'm3': '#8e44ad', 'm4': '#16a085'}
for k, r in RAMPS.items():
    w = np.array([wor(u, v) for u, v in r['pts']]); ax.plot(w[:, 0], w[:, 1], color=cols[k], lw=2.2, label=f"{k} {r['name']}" + (' (NOT SOLVED: end miss %.0f m)' % r['err'] if r['err'] > 1 else ''), ls='--' if r['err'] > 1 else '-')
for u in (EXIT_ZONE, -EXIT_ZONE):
    pass
ax.set_xlim(cx - 330, cx + 330); ax.set_ylim(cz + 330, cz - 330); ax.set_aspect('equal'); ax.legend(loc='lower left', fontsize=8); ax.set_title('T22 R6-11 x M8: trumpet geometry (plan, x east / z south). Blue = water.')
ax.plot(cx, cz, 'k+', ms=14); plt.savefig('docs/b7_3a_t22.png', dpi=110, bbox_inches='tight')
print('wrote docs/b7_3a_t22_geom.json, docs/b7_3a_t22.png')
