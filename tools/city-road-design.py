#!/usr/bin/env python3
"""CITY ROAD DESIGN v1 (evcity). Reads docs/city_free_land_grid.json (made by scripts/city-freeland-export.ts)
and docs/fit_chain/centre_fixed.json. Fixed: J1, 8-lane arms, ring, railway, built roads (R6/R4/R2/C/L ids in centre_fixed.json).
Makes the NEW streets (R4 primary, C collector) inside the free land, prints the checks, writes
docs/city_roads_v1.json, docs/city_roads_v1.png, docs/STEPCITYR2_OUTPUT.txt.  Run from the project root:  python3 tools/city-road-design.py
Needs: numpy, shapely, scikit-image, matplotlib.  Nothing in src/ is changed."""
import json, math, sys
import numpy as np
from functools import reduce
from shapely.geometry import Polygon, MultiPolygon, LineString, Point
from shapely.ops import unary_union, split
from skimage import measure
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap

G = json.load(open('docs/city_free_land_grid.json')); CF = json.load(open('docs/fit_chain/centre_fixed.json'))
C, X0, Z0 = G['cell'], G['x0'], G['z0']
ORDER = '~RXABCD'; A = np.array([[ORDER.index(ch) for ch in r] for r in G['rows']]); NZ, NX = A.shape
J1 = np.array([-87., -277.]); S0 = np.array([0., 300.])          # J1 centre, Central station
OUT = []                                                           # report lines
def say(s=''): print(s); OUT.append(s)

# ------------------------------------------------------------------ free land and faces
def rail_free():          # rail corridor cells under a VIADUCT (>= 8 m clear) can carry a street under the rail
    m = np.zeros(A.shape, bool)
    for r in G['rail']:
        for q in np.array(r):
            if q[2] - q[3] >= 8 and X0 < q[0] < X0 + NX * C and Z0 < q[1] < Z0 + NZ * C:
                i, j = int((q[0] - X0) / C), int((q[1] - Z0) / C); m[max(j - 4, 0):j + 5, max(i - 4, 0):i + 5] = True
    return m & (A == 1)
def free_polygon():
    f = (np.isin(A, [3, 4, 5]) | rail_free()).astype(float); ps = []
    for k in measure.find_contours(np.pad(f, 1), 0.5):
        pts = [(X0 + (x - 1 + .5) * C, Z0 + (y - 1 + .5) * C) for y, x in k]
        if len(pts) > 8:
            p = Polygon(pts); ps.append(p if p.is_valid else p.buffer(0))
    return reduce(lambda a, b: a.symmetric_difference(b), ps)
EXIST = [(l['id'], str(l['cls']), LineString(l['pts'])) for l in CF['lines'] if str(l['cls']) != '8']
EX_U = unary_union([ls for _, _, ls in EXIST])
def _rail_low():
    z = []
    for r, sg in zip(G['rail'], G['railSeg']):
        p = np.array(r)
        for a, b in zip(p[:-1], p[1:]):
            if min(a[2] - a[3], b[2] - b[3]) < 8: z.append(LineString([a[:2], b[:2]]).buffer(25))
    return unary_union(z) if z else Point(1e9, 1e9).buffer(1)
RAIL_LOW = _rail_low()
ARMS = [LineString(a) for a in G['arms']]
RAILS = [(s['id'], np.array(r)) for r, s in zip(G['rail'], G['railSeg'])]
def faces():
    fp = free_polygon().difference(Point(*J1).buffer(170))
    for a in ARMS:
        fp = fp.difference(LineString([J1, a.coords[0]]).buffer(40)).difference(a.buffer(45, cap_style=2))
    fp = fp.difference(EX_U.buffer(12)).buffer(-6).buffer(6)
    ps = [p for p in (fp.geoms if hasattr(fp, 'geoms') else [fp]) if p.area > 1.5e4]
    return sorted(ps, key=lambda p: (round(p.centroid.coords[0][1] / 400), p.centroid.coords[0][0]))
def lines_of(g):
    if g.is_empty: return []
    if isinstance(g, LineString): return [g]
    o = []
    for q in getattr(g, 'geoms', []): o += lines_of(q)
    return o
def rot(p, a): c, s = math.cos(a), math.sin(a); return np.array([c * p[0] - s * p[1], s * p[0] + c * p[1]])
def smooth_poly(P, inset, R=60):
    Q = P.buffer(-inset).buffer(-R).buffer(R).buffer(R).buffer(-R)
    return Q
def trim_near_existing(ls, d=50):                  # a frontage loop is not needed beside an existing street
    return [q for q in lines_of(ls.difference(EX_U.buffer(d))) if q.length > 60]

# ------------------------------------------------------------------ face designs
ROADS = []   # (id, class, LineString, role, need)
def add(i, c, ls, role, need):
    ls = ls.difference(EX_U.buffer(12)).difference(RAIL_LOW) if role not in ('link',) else ls
    for k, q in enumerate(lines_of(ls)):
        if q.length > (110 if role in ('loop', 'arc') else 60): ROADS.append((i if k == 0 else f'{i}.{k}', c, q, role, need))
def spine_and_ribs(P, ang, spines_v, rib_s, name, inset=26):
    Q = smooth_poly(P, inset)
    parts = [q for q in (Q.geoms if hasattr(Q, 'geoms') else [Q]) if q.area > 2.5e4]
    for pi, Lp in enumerate(sorted(parts, key=lambda q: -q.area)):
        nm = name + ('' if pi == 0 else chr(96 + pi))
        for k, q in enumerate(trim_near_existing(LineString(Lp.exterior.coords))): add(f'{nm}-LOOP{k+1}', 'C', q, 'loop', 'frontage / service road round the block, keeps lots off the 8-lane arm, rail and slope edge')
        a = math.radians(ang); cen = np.array(Lp.centroid.coords[0]); tow = lambda u, v: cen + rot((u, v), a)
        loc = np.array([rot(p - cen, -a) for p in Lp.exterior.coords]); u0, u1, v0, v1 = loc[:, 0].min(), loc[:, 0].max(), loc[:, 1].min(), loc[:, 1].max()
        inner = Lp.buffer(-1)
        for i, v in enumerate(sorted(spines_v)):
            for k, q in enumerate(lines_of(LineString([tow(u0 - 50, v), tow(u1 + 50, v)]).intersection(inner))):
                if q.length > 60: add(f'{nm}-P{i+1}{chr(97+k)}', 'R4', q, 'spine', 'primary street of the block, 4 lanes, takes the traffic of the ribs to the existing network')
        ed = [v0 - 50] + sorted(spines_v) + [v1 + 50]
        for bi in range(len(ed) - 1):
            u = u0 + rib_s * 0.6 + (rib_s / 2 if bi % 2 else 0)
            while u < u1 - 40:
                for k, q in enumerate(lines_of(LineString([tow(u, ed[bi]), tow(u, ed[bi + 1])]).intersection(inner))):
                    if q.length > 70: add(f'{nm}-C{bi+1}.{int(u)}{chr(97+k)}', 'C', q, 'rib', 'collector between the spine and the loop (T at both ends), blocks 240-260 m')
                u += rib_s
def station_radial(P):
    pol = lambda r, b: S0 + np.array([r * math.sin(math.radians(b)), -r * math.cos(math.radians(b))])
    inner = P.buffer(-26); parts = [g for g in (inner.geoms if hasattr(inner, 'geoms') else [inner])]
    north = [g for g in parts if g.centroid.coords[0][1] < 700 and g.area > 3e5][0]; south = [g for g in parts if g.centroid.coords[0][1] >= 700]
    north = north.buffer(-60).buffer(60).buffer(60).buffer(-60)
    bear = {'N': (352, 440, 'civic avenue to the plaza south of J1 (no join to J1)'), 'NE': (70, 330, 'to the existing R2-28 east road'), 'SE': (135, 420, 'to the existing R2-28 east / south road'),
            'S': (203, 400, 'to the existing R2-28 south road'), 'W': (270, 440, 'to the west edge and R4-20')}
    for k, (b, rc, need) in bear.items(): add(f'F11-RAD-{k}', 'R4', LineString([pol(120, b), pol(rc, b)]).intersection(north), 'radial', 'radial street from the station forecourt: ' + need)
    th = np.radians(np.arange(0, 361, 3)); cir = lambda r: LineString([S0 + r * np.array([math.sin(t), -math.cos(t)]) for t in th])
    add('F11-FORECOURT', 'R4', cir(120), 'ring', 'station forecourt ring (all 5 rails pass over on the viaduct)')
    add('F11-RING220', 'R4', cir(220).intersection(north), 'ring', 'inner ring road round the station, links the 5 radials with roundabouts')
    for k, q in enumerate(lines_of(cir(300).intersection(north).difference(EX_U.buffer(45)))):
        if q.length > 90: add(f'F11-ARC300.{k+1}', 'C', q, 'arc', 'collector arc between the radials (blocks about 200 x 260 m)')
    for k, q in enumerate(trim_near_existing(LineString(north.exterior.coords))): add(f'F11-LOOP{k+1}', 'C', q, 'loop', 'frontage / service road beside the 8-lane arms and the J1 area')
    return south
def design():
    F = faces(); ROADS.clear()
    south = station_radial(F[11])
    for i, (nm, ang, vs, rs) in {5: ('F5', -65, [0], 260), 6: ('F6', -35, [0], 240), 8: ('F8', 107, [0], 240), 9: ('F9', -40, [0], 200), 14: ('F14', 60, [0], 200), 20: ('F20', 75, [0], 200)}.items():
        spine_and_ribs(F[i], ang, vs, rs, nm)
    for sp in south: spine_and_ribs(sp.buffer(26), 95, [0], 240, 'F11S')
    return F

# ------------------------------------------------------------------ links to the existing network (T at the end of a spine / radial)
def links():
    for id_, cls, ls, role, need in list(ROADS):
        if cls != 'R4' or role not in ('spine', 'radial'): continue
        for e in (Point(ROADS[[r[0] for r in ROADS].index(id_)][2].coords[0]), Point(ROADS[[r[0] for r in ROADS].index(id_)][2].coords[-1])):
            cand = sorted([(e.distance(el), eid, el) for eid, ec, el in EXIST])
            for d, eid, el in cand:
                if d > 230: break
                if d < 3: break
                lk = LineString([np.array(e.coords[0]), np.array(el.interpolate(el.project(e)).coords[0])])
                if any(lk.crosses(r[2]) for r in ROADS) or any(lk.crosses(o) for _, _, o in EXIST): continue
                if lk.distance(Point(*J1)) < 170 or any(lk.distance(m) < 45 for m in ARMS): continue
                if d < 60:
                    k0 = [r[0] for r in ROADS].index(id_); r0 = ROADS[k0]; co = list(r0[2].coords)
                    at_start = np.linalg.norm(np.array(co[0]) - np.array(lk.coords[0])) < 1
                    p1, p0 = (np.array(co[0]), np.array(co[1])) if at_start else (np.array(co[-1]), np.array(co[-2]))
                    t = (p1 - p0) / np.linalg.norm(p1 - p0); ray = LineString([p1, p1 + t * 90]); hit = ray.intersection(el)
                    if hit.is_empty: continue
                    q = np.array(hit.centroid.coords[0] if hit.geom_type != 'Point' else hit.coords[0])
                    co = [tuple(q)] + co if at_start else co + [tuple(q)]
                    ROADS[k0] = (r0[0], r0[1], LineString(co), r0[3], r0[4] + f'; ends with a T on existing {eid}'); break
                ROADS.append((f'LINK-{id_}-{eid}', 'C', lk, 'link', f'T onto existing {eid} ({d:.0f} m)')); break

def prune():
    # drop the weakest short street at a node pair closer than 60 m (rib / loop / link first, never radial / spine / ring)
    rank = {'conn': 7, 'link': 0, 'rib': 1, 'arc': 1, 'loop': 2, 'spine': 8, 'radial': 9, 'ring': 9}
    for _ in range(80):
        raw = [(np.array(r[2].coords[0]), k) for k, r in enumerate(ROADS)] + [(np.array(r[2].coords[-1]), k) for k, r in enumerate(ROADS)]
        nodes = []
        for q, k in raw:
            for n in nodes:
                if np.linalg.norm(n[0] - q) < 22: n[1].add(k); break
            else: nodes.append([q, {k}])
        hit = None
        for a in range(len(nodes)):
            for b in range(a + 1, len(nodes)):
                if np.linalg.norm(nodes[a][0] - nodes[b][0]) < 60: hit = nodes[a][1] | nodes[b][1]; break
            if hit: break
        if not hit: return
        cand = sorted(hit, key=lambda k: (rank[ROADS[k][3]], ROADS[k][2].length))
        if rank[ROADS[cand[0]][3]] >= 8: return
        ROADS.pop(cand[0])
def reconnect():
    # a group of new streets cut off from the network gets ONE straight C link to the nearest connected street (T), no crossing, <= 600 m
    from shapely.ops import nearest_points
    for _ in range(12):
        n = len(ROADS); ex_u = EX_U.buffer(3); seen = set(k for k in range(n) if ROADS[k][2].distance(ex_u) < 1); stack = list(seen)
        while stack:
            k = stack.pop()
            for j in range(n):
                if j not in seen and ROADS[k][2].distance(ROADS[j][2]) < 3: seen.add(j); stack.append(j)
        lost = [k for k in range(n) if k not in seen]
        if not lost: return
        best = None
        ends = [np.array(r[2].coords[0]) for r in ROADS] + [np.array(r[2].coords[-1]) for r in ROADS]
        def node_ok(pt):
            d = [np.linalg.norm(e - np.array(pt)) for e in ends]
            return all(x < 3 or x >= 60 for x in d)
        for k in lost:
            for tgt in [ROADS[j][2] for j in seen] + [el for _, _, el in EXIST]:
                if ROADS[k][2].distance(tgt) < 3: continue
                a, b = nearest_points(ROADS[k][2], tgt); lk = LineString([a, b])
                if lk.length > 600 or (best and lk.length >= best[0]) or not (node_ok(a.coords[0]) and node_ok(b.coords[0])): continue
                if any(lk.crosses(r[2]) for r in ROADS) or any(lk.crosses(o) for _, _, o in EXIST) or any(lk.distance(m) < 45 for m in ARMS) or lk.distance(Point(*J1)) < 170 or lk.intersects(RAIL_LOW) or any(cls_at(*lk.interpolate(t).coords[0]) == '~' for t in np.arange(0, lk.length, 10)): continue
                best = (lk.length, lk, ROADS[k][0])
        if not best: return
        ROADS.append((f'CONN-{best[2]}', 'C', best[1], 'conn', f'connection of the group of {best[2]} to the street network ({best[0]:.0f} m)'))
# ------------------------------------------------------------------ checks
def cls_at(x, z):
    i, j = int((x - X0) / C), int((z - Z0) / C)
    return ORDER[A[j, i]] if 0 <= i < NX and 0 <= j < NZ else '?'
def radius_min(ls, step=20):
    n = max(int(ls.length // step), 3); pts = np.array([ls.interpolate(i / n, normalized=True).coords[0] for i in range(n + 1)]); rm = 1e9
    for a, b, c in zip(pts[:-2], pts[1:-1], pts[2:]):
        ab, bc, ca = np.linalg.norm(a - b), np.linalg.norm(b - c), np.linalg.norm(c - a); ar = abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])) / 2
        if ar > 1e-6: rm = min(rm, ab * bc * ca / (4 * ar))
    return rm
def run_checks():
    say('CHECKS'); fails = 0
    def chk(ok, t):
        nonlocal fails; say(('PASS  ' if ok else 'FAIL  ') + t); fails += 0 if ok else 1
    # crossings (proper crossings of two new streets), ring x radial = roundabout node, anything else = FAIL
    rab, bad = [], []
    for i in range(len(ROADS)):
        for j in range(i + 1, len(ROADS)):
            a, b = ROADS[i], ROADS[j]
            if a[2].crosses(b[2]):
                pt = a[2].intersection(b[2]); ids = {a[3], b[3]}
                pc = pt.centroid
                if min(Point(a[2].coords[0]).distance(pc), Point(a[2].coords[-1]).distance(pc), Point(b[2].coords[0]).distance(pc), Point(b[2].coords[-1]).distance(pc)) < 3: continue
                (rab if ids <= {'ring', 'radial', 'arc'} else bad).append((a[0], b[0], [round(v) for v in pt.centroid.coords[0]]))
    chk(not bad, f'no crossing of two new streets except roundabout nodes (CR4): {len(bad)} bad' + (' ' + str(bad[:4]) if bad else ''))
    say(f'      roundabout nodes ring x radial / arc: {len(rab)}')
    ex = [(a[0], e[0], [round(v) for v in a[2].intersection(e[2]).centroid.coords[0]]) for a in ROADS for e in EXIST if a[2].crosses(e[2])]
    chk(not ex, f'no new street crosses an existing street: {len(ex)} ' + (str(ex[:4]) if ex else ''))
    near_arm = [(a[0], round(a[2].distance(m))) for a in ROADS for m in ARMS if a[2].distance(m) < 45]
    chk(not near_arm, f'every new street >= 45 m from an 8-lane arm axis: {len(near_arm)} too close ' + (str(near_arm[:3]) if near_arm else ''))
    chk(all(a[2].distance(Point(*J1)) > 170 for a in ROADS), 'no new street inside 170 m of J1 centre, no branch from J1 or an arm (CR5)')
    # ground and water
    wet = steep = tot = 0; wetl = []
    for id_, cls, ls, *_ in ROADS:
        n = int(ls.length // 10) + 1
        for i in range(n + 1):
            x, z = ls.interpolate(min(i * 10, ls.length)).coords[0]; k = cls_at(x, z); tot += 1
            if k == '~': wet += 1; wetl.append(id_)
            if k == 'D': steep += 1
    chk(wet == 0, f'WATER check: {wet} of {tot} points (10 m) on water' + (' ' + str(sorted(set(wetl))[:5]) if wet else ''))
    say(f'      slope: {100*steep/tot:.1f} % of the points are on steep ground (> 15 %, class D)  [grading needed there, R4 step]')
    # radius
    lim = {'R4': 130, 'C': 60}; badr = [(a[0], round(radius_min(a[2]))) for a in ROADS if a[2].length > 80 and radius_min(a[2]) < lim[a[1]] * 0.9]
    chk(not badr, f'min radius R4 >= 130 m, C >= 60 m (10 % slack for the 20 m sampling): {len(badr)} short ' + (str(badr[:5]) if badr else ''))
    # rail crossings
    rc = []
    for id_, cls, ls, *_ in ROADS:
        for rid, rp in RAILS:
            rl = LineString(rp[:, :2])
            if ls.crosses(rl):
                pt = ls.intersection(rl).centroid; k = rl.project(pt); q = np.array([rl.interpolate(k).coords[0]]); j = int(np.argmin(np.hypot(rp[:, 0] - pt.x, rp[:, 1] - pt.y)))
                rc.append((id_, rid, round(pt.x), round(pt.y), round(float(rp[j, 2] - rp[j, 3]), 1)))
    low = [r for r in rc if r[4] < 8]
    chk(not low, f'street under the railway: {len(rc)} places, all need >= 8 m clear under the viaduct: {len(low)} low ' + (str(low[:4]) if low else ''))
    for r in sorted(rc, key=lambda r: r[1]): say(f'      under rail {r[1]:<9} {r[0]:<20} at ({r[2]},{r[3]})  clear {r[4]} m')
    # node spacing (ends and roundabouts)
    raw = [np.array(ls.coords[0]) for _, _, ls, *_ in ROADS] + [np.array(ls.coords[-1]) for _, _, ls, *_ in ROADS]
    nodes = []
    for q in raw:
        for n in nodes:
            if np.linalg.norm(n[0] - q) < 22: n[1] += 1; break
        else: nodes.append([q, 1])
    close = sum(1 for i in range(len(nodes)) for j in range(i + 1, len(nodes)) if np.linalg.norm(nodes[i][0] - nodes[j][0]) < 60)
    chk(close == 0, f'street ends >= 60 m apart (CR4 node spacing): {close} pairs closer')
    # connectivity: every new street must reach the existing network through other new streets
    ex_u = EX_U.buffer(3); n = len(ROADS); seen = set(); stack = [k for k in range(n) if ROADS[k][2].distance(ex_u) < 1]
    seen.update(stack)
    while stack:
        k = stack.pop()
        for j in range(n):
            if j not in seen and ROADS[k][2].distance(ROADS[j][2]) < 3: seen.add(j); stack.append(j)
    lost = [ROADS[k][0] for k in range(n) if k not in seen]
    chk(not lost, f'every new street reaches the existing street network: {len(lost)} cut off ' + (str(lost[:12]) if lost else ''))
    chk(True, 'NOT RUN: npx tsc, npm run build, game look (no src change in this step)')
    return fails

# ------------------------------------------------------------------ output
def draw(F, path):
    col = {'R4': '#f57c00', 'C': '#0288d1'}; fig, ax = plt.subplots(figsize=(15, 15), dpi=75)
    cols = ['#9ecbf0', '#9e9e9e', '#bdbdbd', '#2e7d32', '#8bc34a', '#ffe082', '#eeeeee']
    ax.imshow(A, cmap=ListedColormap(cols), vmin=-.5, vmax=6.5, extent=[X0, X0 + NX * C, Z0 + NZ * C, Z0], interpolation='nearest', alpha=.5)
    for _, r in RAILS: ax.plot(r[:, 0], r[:, 1], 'k--', lw=1.2)
    for a in ARMS + [LineString(G['ring']), LineString(G['isl'])]: ax.plot(*a.xy, color='#b71c1c', lw=3)
    for _, _, l in EXIST: ax.plot(*l.xy, color='#1a237e', lw=1.3)
    for id_, cls, ls, role, need in ROADS: ax.plot(*ls.xy, color=col[cls], lw={'R4': 3, 'C': 1.6}[cls])
    ax.plot(*J1, 'ko', ms=9); ax.text(J1[0], J1[1] - 30, 'J1', ha='center', weight='bold'); ax.plot(*S0, 'ms'); ax.text(10, 330, 'Central stn', color='purple', fontsize=8)
    from matplotlib.lines import Line2D
    ax.legend(handles=[Line2D([], [], color='#b71c1c', lw=3, label='8-lane (fixed)'), Line2D([], [], color='k', ls='--', label='railway (fixed, viaduct)'), Line2D([], [], color='#1a237e', label='existing R6/R4/R2/C/L (fixed)'),
                       Line2D([], [], color='#f57c00', lw=3, label='NEW R4 primary (4 lane)'), Line2D([], [], color='#0288d1', lw=1.6, label='NEW C collector (2 lane)')], loc='lower left', fontsize=9)
    ax.set_xlim(-1100, 900); ax.set_ylim(1450, -700); ax.set_aspect('equal'); ax.grid(alpha=.25)
    ax.set_title('CITY ROAD DESIGN v1: new primary + collector streets on the real free land (local L streets come next)', fontsize=10)
    plt.tight_layout(); plt.savefig(path)
if __name__ == '__main__':
    F = design(); links(); prune()
    for _ in range(4): reconnect(); prune()
    ex_u = EX_U.buffer(3); n = len(ROADS); seen = set(k for k in range(n) if ROADS[k][2].distance(ex_u) < 1); stack = list(seen)
    while stack:
        k = stack.pop()
        for j in range(n):
            if j not in seen and ROADS[k][2].distance(ROADS[j][2]) < 3: seen.add(j); stack.append(j)
    dropped = [ROADS[k][0] for k in range(n) if k not in seen]
    for nm in dropped: ROADS.pop([r[0] for r in ROADS].index(nm))
    say('CITY ROAD DESIGN v1 (R4 primary + C collector). Fixed: J1, arms, ring, rail, built roads. Local L streets = next step.')
    byc = {}
    for _, cls, ls, *_ in ROADS: byc[cls] = byc.get(cls, 0) + ls.length
    say('NEW STREETS: ' + ', '.join(f'{k} {v/1000:.1f} km' for k, v in sorted(byc.items())) + f'  ({len(ROADS)} lines)')
    if dropped: say('dropped (no way to reach the network without breaking a check): ' + ', '.join(dropped))
    fails = run_checks(); say(f'\nRESULT: {"ALL RUN CHECKS PASS" if not fails else str(fails) + " FAIL"}')
    json.dump({'note': 'NEW streets v1, world metres (x, z). cls R4 = 4 lane primary, C = 2 lane collector. role/need per street.', 'roads': [{'id': i, 'cls': c, 'role': r, 'need': n, 'len': round(l.length, 1), 'pts': [[round(x, 1), round(z, 1)] for x, z in l.coords]} for i, c, l, r, n in ROADS]}, open('docs/city_roads_v1.json', 'w'))
    draw(F, 'docs/city_roads_v1.png'); open('docs/STEPCITYR2_OUTPUT.txt', 'w').write('\n'.join(OUT) + '\n')
