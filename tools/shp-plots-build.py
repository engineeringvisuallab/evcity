# STEP SHP-PLOTS: the user's drawn plots (Plot/Plot.shp, 18 polygons, no .prj) -> land plots in the game + one building on each plot.
# Run (from the project folder):  python3 tools/shp-plots-build.py Plot/Plot.shp        (pure python + numpy, no GIS library)
# Reads : Plot.shp (+ docs/city_nogo.json, docs/city_roads_cl.json, src/buildings/Placements*.ts for the things that already stand there)
# Writes: src/buildings/PlacementsShpPlots.ts (GENERATED), docs/shp_plots_result.json, docs/shp_plots_preview.png
#
# Grid = the game's GIS export grid (same as tools/city-shp-import.py): x = Easting - 5000, z = 5000 - Northing (x east, z south). No .prj: ASSUMED.
#
# What is done to every drawn polygon (the user: "samanno change koro, area onujai; samanno kombesi hote pare"):
#  1. frontage street = the street the polygon was drawn against; its footpath edge is 6.6 m from the street centre line (half road 3.6 + footpath 3)
#  2. free land = inside the drawn polygon (0.6 m in from its border, so two walls never touch), not on a road / rail / keep-out site / water cell
#     of docs/city_nogo.json, at least STREET_CLEAR from the centre of a city street (SH-*); checked on a 1 m grid
#  3. the drawn polygon is cut down to 4 of its own corners (the plot is a convex 4-corner shape, like every plot of the game: wall on the 4 sides,
#     ONE gate in the middle of the side that faces the street, trees inside). Every side that touches a hard cell (road, rail, site, water, street
#     clearance) is moved in, then the corners are grown again in small steps while the plot stays free. So a plot is a little smaller than the drawing, never bigger.
#  4. one building per plot: the biggest model of the table below that fits (plot - 10 m each way for the wall and the yard), front to the street
#  5. things that stood in the way and are now replaced by the new plots are listed in the TS file (old plot rows, vacant plots, hand placed buildings)
import json, struct, sys, math, re, base64, os
import numpy as np

W = 10000.0
SRC = sys.argv[1] if len(sys.argv) > 1 else 'Plot/Plot.shp'
STREET_CLEAR = 7.4     # m from the centre line of a city street (SH-*) to the plot wall: half road 3.6 + footpath 3.0 + 0.8 gap  ASSUMED
ERODE = 0.6            # m inside the drawn border
GRID = 1.0             # m
HARD = 1 | 4 | 8 | 16  # road, rail (30 m from axis), keep-out site, water   (STREET bit 2 is replaced by STREET_CLEAR, BUILDING bit 32 is checked below)
YARD = 10.0            # building footprint + 10 m = plot size needed (wall 0.45 + yard 4.5 each side)
MIN_SIDE = 22.0

# ------------------------------------------------------------------ shapefile
d = open(SRC, 'rb').read()
polys, i = [], 100
while i < len(d):
    rn, cl = struct.unpack('>ii', d[i:i + 8]); i += 8
    c = d[i:i + cl * 2]; i += cl * 2
    t, = struct.unpack('<i', c[:4])
    if t not in (5, 15, 25):
        continue
    nparts, npts = struct.unpack('<ii', c[36:44])
    parts = list(struct.unpack('<%di' % nparts, c[44:44 + 4 * nparts])) + [npts]
    o = 44 + 4 * nparts
    pts = [struct.unpack('<2d', c[o + 16 * k:o + 16 * k + 16]) for k in range(npts)]
    ring = pts[parts[0]:parts[1]]
    g = [(e - W / 2, W / 2 - n) for e, n in ring]
    if g[0] == g[-1]:
        g = g[:-1]
    polys.append((rn, np.array(g)))
print('polygons', len(polys))

# ------------------------------------------------------------------ game data
NG = json.load(open('docs/city_nogo.json'))
X0, Z0, CELL, NX, NZ = NG['x0'], NG['z0'], NG['cell'], NG['nx'], NG['nz']
MASK = np.frombuffer(base64.b64decode(NG['mask']), dtype=np.uint8).reshape(NZ, NX)
ROADS = json.load(open('docs/city_roads_cl.json'))


def seg_dist(px, pz, xs, zs):
    """distance of the points (arrays px, pz) to the polyline (xs, zs)"""
    best = np.full(px.shape, 1e9)
    for k in range(len(xs) - 1):
        ax, az, bx, bz = xs[k], zs[k], xs[k + 1], zs[k + 1]
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz
        if L2 == 0:
            continue
        t = np.clip(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1)
        best = np.minimum(best, np.hypot(px - (ax + t * dx), pz - (az + t * dz)))
    return best


def near_roads(poly, rad=60):
    cx, cz = poly.mean(axis=0)
    out = []
    for r in ROADS:
        if min(abs(np.array(r['xs']) - cx)) > 400 and min(abs(np.array(r['zs']) - cz)) > 400:
            continue
        out.append(r)
    return out


def inside(poly, px, pz):
    c = np.zeros(px.shape, dtype=bool)
    n = len(poly)
    for k in range(n):
        xi, zi = poly[k]; xj, zj = poly[(k + 1) % n]
        if zi == zj:
            continue
        cond = ((zi > pz) != (zj > pz)) & (px < (xj - xi) * (pz - zi) / (zj - zi) + xi)
        c ^= cond
    return c


def edge_dist(poly, px, pz):
    best = np.full(px.shape, 1e9)
    n = len(poly)
    for k in range(n):
        ax, az = poly[k]; bx, bz = poly[(k + 1) % n]
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz
        t = np.clip(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1)
        best = np.minimum(best, np.hypot(px - (ax + t * dx), pz - (az + t * dz)))
    return best


def max_rect(valid):
    H, Wd = valid.shape
    heights = [0] * Wd
    best = (0, 0, 0, 0, 0)
    for r in range(H):
        for c in range(Wd):
            heights[c] = heights[c] + 1 if valid[r, c] else 0
        stack = []
        for c in range(Wd + 1):
            h = heights[c] if c < Wd else 0
            start = c
            while stack and stack[-1][1] >= h:
                s, hh = stack.pop()
                area = hh * (c - s)
                if area > best[0]:
                    best = (area, r - hh + 1, r + 1, s, c)
                start = s
            stack.append((start, h))
    return best


def rect_corners(cx, cz, t, n, u0, u1, v0, v1):
    P = lambda u, v: [cx + t[0] * u + n[0] * v, cz + t[1] * u + n[1] * v]
    return [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)]


def sat_overlap(A, B, margin=0.0):
    """two convex polygons overlap (SAT); margin > 0 treats A as bigger by margin"""
    for poly in (A, B):
        n = len(poly)
        for k in range(n):
            ax, az = poly[k]; bx, bz = poly[(k + 1) % n]
            nx_, nz_ = -(bz - az), bx - ax
            L = math.hypot(nx_, nz_)
            if L == 0:
                continue
            nx_, nz_ = nx_ / L, nz_ / L
            pa = [p[0] * nx_ + p[1] * nz_ for p in A]
            pb = [p[0] * nx_ + p[1] * nz_ for p in B]
            if max(pa) + margin < min(pb) or max(pb) + margin < min(pa):
                return False
    return True


def foot(p):
    c, s = math.cos(p['yaw']), math.sin(p['yaw'])
    out = []
    for lx, lz in ((-p['W'] / 2, -p['D'] / 2), (p['W'] / 2, -p['D'] / 2), (p['W'] / 2, p['D'] / 2), (-p['W'] / 2, p['D'] / 2)):
        out.append((p['x'] + lx * c + lz * s, p['z'] - lx * s + lz * c))
    return out


# existing things (parsed from the source files)
def rows(path):
    txt = open(path, encoding='utf8').read()
    out = []
    for m in re.finditer(r"\{ id: '([^']+)', x: (-?[\d.]+), z: (-?[\d.]+), yaw: (-?[\d.]+), W: (\d+), D: (\d+)", txt):
        out.append({'id': m.group(1), 'x': float(m.group(2)), 'z': float(m.group(3)), 'yaw': float(m.group(4)), 'W': int(m.group(5)), 'D': int(m.group(6))})
    return out


HAND = rows('src/buildings/Placements.ts')
FILL = rows('src/buildings/PlacementsFill.ts') + rows('src/buildings/PlacementsResidential.ts')
ptxt = open('src/buildings/PlacementsPlots.ts', encoding='utf8').read()
OLD_PL = [json.loads(m) for m in re.findall(r'^\s*(\{"id":"PL-.*?\}),?\r?$', ptxt, re.M)]
OLD_PLB = [json.loads(m) for m in re.findall(r'^\s*(\{"id":"[a-z_0-9-]+","x".*?\}),?\r?$', ptxt, re.M)]
vtxt = open('src/buildings/PlacementsVacant.ts', encoding='utf8').read()
OLD_V = [json.loads(m) for m in re.findall(r'^\s*(\{"id":"V-.*?\}),?\r?$', vtxt, re.M)]
print('existing: hand', len(HAND), 'fill+res', len(FILL), 'PL', len(OLD_PL), 'plot buildings', len(OLD_PLB), 'vacant', len(OLD_V))

# ------------------------------------------------------------------ the plots
def poly_area(p):
    return 0.5 * abs(sum(p[k][0] * p[(k + 1) % len(p)][1] - p[(k + 1) % len(p)][0] * p[k][1] for k in range(len(p))))


def to_quad(poly):
    """convex polygon -> 4 of its own corners (the least important corner is cut first), so the quad lies inside the drawing"""
    pts = [tuple(p) for p in poly]
    while len(pts) > 4:
        best, bi = 1e18, 0
        for k in range(len(pts)):
            a_, b_, c_ = pts[k - 1], pts[k], pts[(k + 1) % len(pts)]
            ar = 0.5 * abs((b_[0] - a_[0]) * (c_[1] - a_[1]) - (c_[0] - a_[0]) * (b_[1] - a_[1]))
            if ar < best:
                best, bi = ar, k
        pts.pop(bi)
    return pts


def line_of(a_, b_, inward):
    dx, dz = b_[0] - a_[0], b_[1] - a_[1]
    L = math.hypot(dx, dz)
    nx_, nz_ = -dz / L, dx / L
    if nx_ * inward[0] + nz_ * inward[1] < 0:
        nx_, nz_ = -nx_, -nz_
    return [a_[0], a_[1], dx / L, dz / L, nx_, nz_]      # point, direction, inward normal


def lines_to_quad(ls):
    out = []
    for k in range(4):
        l1, l2 = ls[k - 1], ls[k]
        det = l1[2] * (-l2[3]) - l1[3] * (-l2[2])
        if abs(det) < 1e-9:
            return None
        rx, rz = l2[0] - l1[0], l2[1] - l1[1]
        s = (rx * (-l2[3]) - rz * (-l2[2])) / det
        out.append((l1[0] + l1[2] * s, l1[1] + l1[3] * s))
    return out


def convex_inside(q, px, pz, m=0.0):
    """points inside the convex quad q, at least m from every edge"""
    sg = 1.0 if poly_signed(q) > 0 else -1.0
    ok_ = np.ones(px.shape, dtype=bool)
    for k in range(4):
        ax, az = q[k]; bx, bz = q[(k + 1) % 4]
        L = math.hypot(bx - ax, bz - az)
        ok_ &= sg * ((bx - ax) * (pz - az) - (bz - az) * (px - ax)) / L >= m
    return ok_


def poly_signed(p):
    return 0.5 * sum(p[k][0] * p[(k + 1) % len(p)][1] - p[(k + 1) % len(p)][0] * p[k][1] for k in range(len(p)))


result = []
for rn, poly in polys:
    cx, cz = poly.mean(axis=0)
    roads = near_roads(poly)
    best = (1e9, None)
    for r in roads:
        dd = seg_dist(poly[:, 0], poly[:, 1], r['xs'], r['zs']).min()
        if dd < best[0]:
            best = (dd, r)
    dmin, road = best
    quad = to_quad(poly)
    centre = np.array(quad).mean(axis=0)
    # frontage edge = the quad edge nearest to the street
    fi, fd = 0, 1e9
    for k in range(4):
        m_ = np.array([(quad[k][0] + quad[(k + 1) % 4][0]) / 2, (quad[k][1] + quad[(k + 1) % 4][1]) / 2])
        dd = seg_dist(np.array([m_[0]]), np.array([m_[1]]), road['xs'], road['zs'])[0]
        if dd < fd:
            fd, fi = dd, k
    # edge lines, inward normals; the three edges that are not on the street are moved in by ERODE (two walls never touch)
    ls = []
    for k in range(4):
        l_ = line_of(quad[k], quad[(k + 1) % 4], centre - np.array(quad[k]))
        if k != fi:
            l_[0] += l_[4] * ERODE; l_[1] += l_[5] * ERODE
        ls.append(l_)
    q = lines_to_quad(ls)
    # push every edge in until no hard cell (road / rail / site / water / street clearance) is inside
    for it in range(60):
        xs_ = [p[0] for p in q]; zs_ = [p[1] for p in q]
        gx = np.arange(math.floor(min(xs_)) + GRID / 2, max(xs_), GRID); gz = np.arange(math.floor(min(zs_)) + GRID / 2, max(zs_), GRID)
        PX, PZ = np.meshgrid(gx, gz)
        ins = convex_inside(q, PX, PZ, 0.0)
        ci = np.clip(((PX - X0) // CELL).astype(int), 0, NX - 1); cj = np.clip(((PZ - Z0) // CELL).astype(int), 0, NZ - 1)
        hard = (MASK[cj, ci] & HARD) != 0
        for r in roads:
            if r['name'].startswith('SH-'):
                hard |= seg_dist(PX, PZ, r['xs'], r['zs']) < STREET_CLEAR
        hard &= ins
        if not hard.any():
            break
        hx, hz = PX[hard], PZ[hard]
        # each hard point belongs to the edge it is closest to (signed distance to the edge line, from the inside)
        dists = np.stack([(hx - l_[0]) * l_[4] + (hz - l_[1]) * l_[5] for l_ in ls])
        owner = np.argmin(np.abs(dists), axis=0)
        for k in range(4):
            sel = owner == k
            if sel.any():
                need = dists[k][sel].max() + 0.5
                ls[k][0] += ls[k][4] * need; ls[k][1] += ls[k][5] * need
        q2 = lines_to_quad(ls)
        if q2 is None or poly_area(q2) < 200:
            q = None; break
        q = q2
    if q is None:
        print('plot', rn, 'NOT PLACED (no free land)'); continue
    # grow the quad again: the push-in above is greedy and can take more than it must (rail corner). Move the 4 corners in small random
    # steps and keep a step when the quad is still convex, inside the drawing (ERODE from its border) and free of every hard cell, and bigger.
    bx0, bx1 = poly[:, 0].min(), poly[:, 0].max(); bz0, bz1 = poly[:, 1].min(), poly[:, 1].max()
    GX, GZ = np.meshgrid(np.arange(math.floor(bx0) + GRID / 2, bx1, GRID), np.arange(math.floor(bz0) + GRID / 2, bz1, GRID))
    ci = np.clip(((GX - X0) // CELL).astype(int), 0, NX - 1); cj = np.clip(((GZ - Z0) // CELL).astype(int), 0, NZ - 1)
    HG = (MASK[cj, ci] & HARD) != 0
    for r in roads:
        if r['name'].startswith('SH-'):
            HG |= seg_dist(GX, GZ, r['xs'], r['zs']) < STREET_CLEAR

    def good(qq):
        if poly_area(qq) < 200:
            return False
        sg = 1.0 if poly_signed(qq) > 0 else -1.0
        for k in range(4):
            a_, b_, c_ = qq[k - 1], qq[k], qq[(k + 1) % 4]
            v1 = (a_[0] - b_[0], a_[1] - b_[1]); v2 = (c_[0] - b_[0], c_[1] - b_[1])
            cr_ = sg * (v2[0] * v1[1] - v2[1] * v1[0])
            dt_ = v1[0] * v2[0] + v1[1] * v2[1]
            ang = math.degrees(math.atan2(abs(cr_), dt_))
            if cr_ <= 0 or ang < 45 or ang > 135:
                return False
        vx = np.array([p[0] for p in qq]); vz = np.array([p[1] for p in qq])
        if not (inside(poly, vx, vz).all() and (edge_dist(poly, vx, vz) >= ERODE - 1e-6).all()):
            return False
        return not (HG & convex_inside(qq, GX, GZ, 0.0)).any()

    cur = [tuple(p) for p in q]
    if good(cur):
        rng_ = np.random.default_rng(rn)
        for step in (6.0, 3.0, 1.5, 0.75, 0.4):
            for _ in range(500):
                k = int(rng_.integers(4))
                cand = list(cur)
                cand[k] = (cur[k][0] + rng_.normal() * step, cur[k][1] + rng_.normal() * step)
                if poly_area(cand) > poly_area(cur) and good(cand):
                    cur = cand
        q = cur
    quad = q
    # corner order: corners 0-1 = frontage edge
    quad = [quad[(fi + k) % 4] for k in range(4)]
    F = math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]); Dp = math.hypot(quad[3][0] - quad[0][0], quad[3][1] - quad[0][1])
    ex, ez = (quad[1][0] - quad[0][0]) / F, (quad[1][1] - quad[0][1]) / F
    cc = [sum(p[0] for p in quad) / 4, sum(p[1] for p in quad) / 4]
    nrm = np.array([-ez, ex])
    if np.dot(nrm, np.array(cc) - np.array(quad[0])) > 0:
        nrm = -nrm            # outward (plot -> street)
    gate = [(quad[0][0] + quad[1][0]) / 2, (quad[0][1] + quad[1][1]) / 2]
    area = poly_area(quad)
    result.append({'rec': rn, 'street': road['name'], 'poly0': poly.tolist(), 'quad': [list(p) for p in quad], 'F': F, 'Dp': Dp, 'area': area,
                   'drawn': float(poly_area(poly)), 'dir': [float(nrm[0]), float(nrm[1])], 'gate': gate, 'c': cc})
    print('plot', rn, road['name'], 'drawn %.0f m2 -> plot %.0f m2 (%.0f%%), road side %.0f m, depth %.0f m' % (poly_area(poly), area, 100 * area / poly_area(poly), F, Dp))

# ------------------------------------------------------------------ buildings
# model, W, D (footprint incl. yard), cap, programme text
POOL = [
    ('hotel-3star', 39, 32, 1, 'Hotel'),
    ('supermarket', 33, 36, 1, 'Supermarket'),
    ('cinema', 27, 35, 1, 'Cinema'),
    ('office-mid', 27, 26, 3, 'Office'),
    ('apartment-high', 27, 20, 4, 'Apartments (high)'),
    ('bank', 26, 24, 2, 'Bank'),
    ('restaurant', 24, 26, 2, 'Restaurant'),
    ('villa', 24, 28, 1, 'Villa'),
    ('clinic', 22, 25, 2, 'Clinic'),
    ('apartment-mid', 18, 13, 3, 'Apartments (mid)'),
    ('shop-row', 26, 11, 3, 'Shop row'),
    ('pharmacy', 9, 11, 2, 'Pharmacy'),
]
used = {}


def fit_spot(p, bw, bd):
    """centre of a (bw+YARD) x (bd+YARD) rectangle turned to the street that lies inside the plot, nearest to the plot centre; None if there is none"""
    q = [tuple(c) for c in p['quad']]
    yaw = math.atan2(p['dir'][0], p['dir'][1])
    c_, s_ = math.cos(yaw), math.sin(yaw)
    best = None
    xs_ = [c[0] for c in q]; zs_ = [c[1] for c in q]
    for x in np.arange(min(xs_), max(xs_), 1.0):
        for z in np.arange(min(zs_), max(zs_), 1.0):
            cs = []
            for lx, lz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                hx, hz = lx * (bw + YARD) / 2, lz * (bd + YARD) / 2
                cs.append((x + hx * c_ + hz * s_, z - hx * s_ + hz * c_))
            if all(convex_inside(q, np.array([a_]), np.array([b_]), 0.0)[0] for a_, b_ in cs):
                dd = math.hypot(x - p['c'][0], z - p['c'][1])
                if best is None or dd < best[0]:
                    best = (dd, x, z)
    return None if best is None else (best[1], best[2], yaw)


order = sorted(range(len(result)), key=lambda k: -result[k]['area'])
for k in order:
    p = result[k]
    pick = None
    for mid, bw, bd, cap, prog in POOL:
        if used.get(mid, 0) >= cap:
            continue
        spot = fit_spot(p, bw, bd)
        if spot:
            pick = (mid, bw, bd, prog, spot); break
    if pick is None:
        p['building'] = None
        continue
    used[pick[0]] = used.get(pick[0], 0) + 1
    x, z, yaw = pick[4]
    p['building'] = {'id': pick[0], 'x': round(x, 1), 'z': round(z, 1), 'yaw': round(yaw, 4), 'W': pick[1], 'D': pick[2], 'zone': 'city-plot', 'seed': 2000 + p['rec']}
    p['prog'] = pick[3]
print('buildings', {k: v for k, v in used.items()}, 'plots without building', sum(1 for p in result if p['building'] is None))

# ------------------------------------------------------------------ what the new plots replace / clash with
newq = [[tuple(q) for q in p['quad']] for p in result]
drop_pl = sorted({o['id'] for o in OLD_PL if any(sat_overlap([tuple(c) for c in o['poly']], q, 3.0) for q in newq)})
drop_v = sorted({o['id'] for o in OLD_V if any(sat_overlap([tuple(c) for c in o['poly']], q, 3.0) for q in newq)})
repl = [h for h in HAND if any(sat_overlap(foot(h), q, 3.0) for q in newq)]
# old plot buildings of the dropped old plots (by seed 1000 + index of the PL row: same seed as the plot-building rows)
dropped_prog = {o['id']: o['prog'] for o in OLD_PL if o['id'] in drop_pl}
pl_bld_seed = {}
for o in OLD_PL:
    num = int(o['id'][3:])
    pl_bld_seed[o['id']] = 1000 + num - 1
drop_seeds = sorted(pl_bld_seed[i] for i in drop_pl)
fill_hit = [f for f in FILL if any(sat_overlap(foot(f), q, 1.0) for q in newq)]
fill_centre_in = [f for f in fill_hit if any(inside(np.array(q), np.array([f['x']]), np.array([f['z']]))[0] for q in newq)]
print('old plots replaced:', [(i, dropped_prog[i]) for i in drop_pl])
print('vacant plots replaced:', drop_v)
print('hand buildings replaced:', [(h['id'], h['x'], h['z']) for h in repl])
print('city-fill / residential houses touching a new plot:', len(fill_hit), '(centre inside a plot: %d)' % len(fill_centre_in))
# the new plots against each other and against the buildings that stay
bad = 0
for a in range(len(newq)):
    for b in range(a + 1, len(newq)):
        if sat_overlap(newq[a], newq[b], 0.0): bad += 1; print('OVERLAP plots', result[a]['rec'], result[b]['rec'])
for p in result:
    if p['building']:
        fb = foot(p['building'])
        q = [tuple(c) for c in p['quad']]
        # footprint inside the plot wall
        inq = all(inside(np.array(q), np.array([x]), np.array([z]))[0] for x, z in fb)
        if not inq: bad += 1; print('building outside plot', p['rec'])
        for h in HAND:
            if h in repl: continue
            if sat_overlap(fb, foot(h), 0): bad += 1; print('building hits hand building', p['rec'], h['id'])
print('problems:', bad)

# ------------------------------------------------------------------ write
json.dump({'note': 'shp plots in game metres (x east, z south): quad = plot rectangle (corners 0-1 road side), poly0 = the drawn polygon', 'plots': result,
           'drop_pl': drop_pl, 'drop_vacant': drop_v, 'replaces_hand': repl, 'drop_seeds': drop_seeds}, open('docs/shp_plots_result.json', 'w'))

NL = '\r\n'
ts = []
ts.append("// GENERATED by tools/shp-plots-build.py from Plot/Plot.shp (the plots the user drew). Do not edit by hand: rerun the tool." )
ts.append("// 18 drawn polygons -> %d land plots (4-corner plots, road side = corners 0-1, ONE gate on the road side, trees inside) + one building on each plot." % len(result))
ts.append("// Plots can be a little smaller than the drawing: they keep off roads, rail and the footpath edge of the streets (see the tool header).")
ts.append("// What the new plots replace (the old plot rows, vacant plots and hand placed buildings that stood in the same land) is listed at the bottom.")
ts.append("// Switch: SHP_PLOTS_ON below (false = none of it, the old plots and buildings stay as before). Also off when Config.city.plots.enabled is false.")
ts.append("import type { BuildingPlacement } from './Placements';")
ts.append("import type { CityPlot } from './PlacementsPlots';")
ts.append("import { Config } from '../core/Config';")
ts.append("")
ts.append("const SHP_PLOTS_ON = true;")
ts.append("const ON = SHP_PLOTS_ON && Config.city.plots.enabled;")
ts.append("")
ts.append("const SHP_PLOTS_ALL: readonly CityPlot[] = [")
for p in result:
    q = [[round(c[0], 1), round(c[1], 1)] for c in p['quad']]
    row = {'id': 'SP-%02d' % p['rec'], 'prog': (p['prog'] if p['building'] else 'Empty plot') + ' (drawn plot %d)' % p['rec'], 'kind': 'inst' if p['building'] else 'empty', 'street': p['street'],
           'ha': round(p['area'] / 10000, 2), 'c': [round(p['c'][0], 1), round(p['c'][1], 1)], 'poly': q, 'gates': [[round(p['gate'][0], 1), round(p['gate'][1], 1)]],
           'dir': [round(p['dir'][0], 4), round(p['dir'][1], 4)]}
    ts.append("  " + json.dumps(row, separators=(',', ':')) + ",")
ts.append("] as unknown as readonly CityPlot[];")
ts.append("")
ts.append("const SHP_BUILDINGS_ALL: readonly BuildingPlacement[] = [")
for p in result:
    if p['building']:
        b = p['building']
        ts.append("  { id: '%s', x: %s, z: %s, yaw: %s, W: %d, D: %d, zone: 'city-plot', seed: %d }," % (b['id'], b['x'], b['z'], b['yaw'], b['W'], b['D'], b['seed']))
ts.append("];")
ts.append("")
ts.append("export const SHP_PLOTS: readonly CityPlot[] = ON ? SHP_PLOTS_ALL : [];")
ts.append("export const SHP_PLOT_BUILDINGS: readonly BuildingPlacement[] = ON ? SHP_BUILDINGS_ALL : [];")
ts.append("/** Old city plot rows (PlacementsPlots.ts) that stood in the same land: dropped (their buildings too, by seed). */")
ts.append("export const SHP_DROP_PLOT_IDS: readonly string[] = ON ? %s : [];" % json.dumps(drop_pl))
ts.append("export const SHP_DROP_PLOT_BUILDING_SEEDS: readonly number[] = ON ? %s : [];" % json.dumps(drop_seeds))
ts.append("/** Vacant plots (PlacementsVacant.ts) that stood in the same land: dropped. */")
ts.append("export const SHP_DROP_VACANT_IDS: readonly string[] = ON ? %s : [];" % json.dumps(drop_v))
ts.append("/** Hand placed buildings (Placements.ts) that stood in the same land: replaced by the new plot building. */")
ts.append("export const SHP_REPLACES: readonly { id: string; x: number; z: number }[] = ON ? %s : [];" % json.dumps([{'id': h['id'], 'x': h['x'], 'z': h['z']} for h in repl]))
open('src/buildings/PlacementsShpPlots.ts', 'w', encoding='utf8', newline='').write(NL.join(ts) + NL)
print('wrote src/buildings/PlacementsShpPlots.ts')

# ------------------------------------------------------------------ picture
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Polygon as MP
    fig, ax = plt.subplots(figsize=(11, 13))
    X_0, X_1, Z_0, Z_1 = -520, -120, 80, 540
    i0 = int((X_0 - X0) / CELL); i1 = int((X_1 - X0) / CELL); j0 = int((Z_0 - Z0) / CELL); j1 = int((Z_1 - Z0) / CELL)
    sub = MASK[j0:j1, i0:i1]
    img = np.ones(sub.shape + (3,))
    img[(sub & 16) > 0] = (0.6, 0.8, 1); img[(sub & 2) > 0] = (1, 0.92, 0.92); img[(sub & 1) > 0] = (1, 0.7, 0.7); img[(sub & 4) > 0] = (0.8, 0.8, 0.8)
    ax.imshow(img, extent=(X0 + i0 * CELL, X0 + i1 * CELL, Z0 + j1 * CELL, Z0 + j0 * CELL), origin='upper', interpolation='nearest')
    for r in ROADS:
        ax.plot(r['xs'], r['zs'], '-', color='darkred', lw=1)
    for o in OLD_PL:
        ax.add_patch(MP(o['poly'], fill=False, ec='blue', lw=1, ls='--' if o['id'] in drop_pl else '-'))
    for o in OLD_V:
        ax.add_patch(MP(o['poly'], fill=False, ec='purple', lw=0.7, ls=':' if o['id'] in drop_v else '-'))
    for p in result:
        ax.add_patch(MP(p['poly0'], fill=False, ec='green', lw=1, ls='--'))
        ax.add_patch(MP(p['quad'], fill=True, fc=(0, 0.6, 0, 0.25), ec='darkgreen', lw=1.6))
        ax.plot([p['quad'][0][0], p['quad'][1][0]], [p['quad'][0][1], p['quad'][1][1]], color='orange', lw=3)
        ax.plot(*p['gate'], 'o', color='red', ms=4)
        if p['building']:
            ax.add_patch(MP(foot(p['building']), fill=True, fc=(0.4, 0.4, 0.4, 0.7), ec='k', lw=0.8))
            ax.text(p['c'][0], p['c'][1], '%d\n%s' % (p['rec'], p['building']['id']), ha='center', va='center', fontsize=6.5, color='white')
        else:
            ax.text(p['c'][0], p['c'][1], str(p['rec']), ha='center', va='center', fontsize=8)
    ax.set_xlim(X_0, X_1); ax.set_ylim(Z_1, Z_0); ax.set_aspect('equal'); ax.grid(alpha=.3)
    ax.set_title('SHP PLOTS  green dashed = drawn  green fill = plot  orange = road side  red dot = gate  grey = building  dashed blue/dotted purple = old plots replaced')
    plt.tight_layout(); plt.savefig('docs/shp_plots_preview.png', dpi=75)
    print('wrote docs/shp_plots_preview.png')
except Exception as e:
    print('picture skipped:', e)
