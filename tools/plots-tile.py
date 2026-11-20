# plots-tile.py : PLOT TILING P2. Cuts ALL free land inside the 1500 m circle into contiguous plots (no gaps between plots, no free land without a plot).
#   1. free land = docs/city_nogo.json without road / street / rail / keep-out / water / steep.  (hand buildings are free land: they go INSIDE a plot)
#   2. every free cell belongs to its NEAREST road side  -> the line where two roads meet in the middle is the long middle line of the sketch
#   3. along the road the land is cut every PLOT_W m with a line square to the road  -> the divider lines of the sketch
#   4. tiny pieces are merged into the neighbour plot, borders are made straight (polygon simplified)
# Run: python3 tools/plots-tile.py        Output: docs/city_plots_tiled.json  docs/city_plots_tiled.png  docs/city_plots_tiled_zoom.png
import json, base64, sys, collections
import numpy as np, cv2
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
PLOT_W = float(sys.argv[1]) if len(sys.argv) > 1 else 30.0     # plot width along the road (m)
MIN_AREA = 400.0                                                # smaller pieces are merged into a neighbour (m2)
MIN_INR = 7.0                                                   # a plot must fit a circle of this radius (m) = no thin strips, a building can stand on it
MIN_FILL = 0.45                                                 # plot area / its smallest rectangle: lower = bad (odd) shape
S = 2.0                                                         # raster cell (m)
R = 1500.0
N = json.load(open('docs/city_nogo.json')); RD = json.load(open('docs/city_roads_cl.json')); INP = json.load(open('docs/city_plots_input.json'))
nx, nz, X0, Z0, C = N['nx'], N['nz'], N['x0'], N['z0'], N['cell']
M = np.frombuffer(base64.b64decode(N['mask']), dtype=np.uint8).reshape(nz, nx)
WET = np.frombuffer(base64.b64decode(N['wet']), dtype=np.uint8).reshape(nz, nx) > 0
k = int(C / S); up = lambda a: np.kron(a, np.ones((k, k), a.dtype))
HARD = 1 | 2 | 4 | 8 | 16 | 64          # road, street, rail, keep-out, water, steep   (32 = hand building, 128 = soft: both are plot land)
W = nx * k; H = nz * k
gx = X0 + (np.arange(W) + .5) * S; gz = Z0 + (np.arange(H) + .5) * S
XX, ZZ = np.meshgrid(gx, gz)
free = (up(M & HARD) == 0) & ~up(WET) & (np.hypot(XX, ZZ) <= R)
print('free cells', int(free.sum()), 'ha', round(free.sum() * S * S / 1e4))
# ---- road points (every 2 m) with arc length s and tangent
P = []; T = []; RID = []; SS = []
for ri, r in enumerate(RD):
    xs = np.array(r['xs']); zs = np.array(r['zs'])
    if len(xs) < 2: continue
    s0 = 0.0
    for i in range(1, len(xs)):
        dx, dz = xs[i] - xs[i - 1], zs[i] - zs[i - 1]; L = float(np.hypot(dx, dz))
        if L < 1e-6: continue
        n = max(1, int(np.ceil(L / 2.0))); t = np.arange(n) / n
        P.append(np.c_[xs[i - 1] + dx * t, zs[i - 1] + dz * t]); T.append(np.tile([dx / L, dz / L], (n, 1)))
        RID.append(np.full(n, ri)); SS.append(s0 + L * t); s0 += L
P = np.vstack(P); T = np.vstack(T); RID = np.concatenate(RID); SS = np.concatenate(SS)
tree = cKDTree(P)
fj, fi = np.nonzero(free)
q = np.c_[gx[fi], gz[fj]]
d, ix = tree.query(q)
side = ((q[:, 0] - P[ix, 0]) * T[ix, 1] - (q[:, 1] - P[ix, 1]) * T[ix, 0] > 0).astype(np.int64)
key = RID[ix].astype(np.int64) * 2000000 + side * 1000000 + np.floor(SS[ix] / PLOT_W).astype(np.int64)
# ---- a free block that touches only ONE road and is small (the roundabout middle) is ONE plot, not pie slices
nf, fl = cv2.connectedComponents(free.astype(np.uint8), connectivity=4); fl = fl[fj, fi]
o = np.argsort(fl, kind='stable'); fs = fl[o]; a0 = np.searchsorted(fs, np.arange(nf)); a1 = np.searchsorted(fs, np.arange(nf), 'right')
n_isl = 0
for c in range(1, nf):
    sel = o[a0[c]:a1[c]]
    if 400 / (S * S) <= len(sel) <= 30000 / (S * S) and len(np.unique(RID[ix[sel]])) == 1:
        key[sel] = 9000000000 + c; n_isl += 1
print('one-road islands made one plot each:', n_isl)
# ---- connected pieces of the same key
idx = -np.ones((H, W), np.int64); idx[fj, fi] = np.arange(len(fj))
# ---- a building is never cut by a plot border: all free cells under it (+2 m round it) get ONE key (the most common one under it)
n_keep = 0
for kind in ('hand', 'fill'):
    for b in INP[kind]:
        if np.hypot(b['x'], b['z']) > R + 40: continue
        w, dp = b['W'], b['D']
        if kind == 'hand':
            if abs(abs(b.get('yaw', 0)) % 3.1416 - 1.5708) < .1: w, dp = dp, w
        else: w = dp = max(w, dp)          # fill buildings: direction not known, so a square that holds the building in any direction
        i0 = max(int((b['x'] - w / 2 - 2 - X0) / S), 0); i1 = min(int((b['x'] + w / 2 + 2 - X0) / S) + 1, W)
        j0 = max(int((b['z'] - dp / 2 - 2 - Z0) / S), 0); j1 = min(int((b['z'] + dp / 2 + 2 - Z0) / S) + 1, H)
        win = idx[j0:j1, i0:i1]; ids = win[win >= 0]
        if len(ids) == 0: continue
        ks, cn = np.unique(key[ids], return_counts=True); key[ids] = ks[np.argmax(cn)]; n_keep += 1
print('buildings kept whole inside one plot:', n_keep)
def edges(a, b, ia, ib):
    m = (ia >= 0) & (ib >= 0); return a[m], b[m]
ea, eb = [], []
for (ia, ib) in ((idx[:, :-1], idx[:, 1:]), (idx[:-1, :], idx[1:, :])):
    m = (ia >= 0) & (ib >= 0); ea.append(ia[m]); eb.append(ib[m])
ea = np.concatenate(ea); eb = np.concatenate(eb)
same = key[ea] == key[eb]
n = len(fj)
G = coo_matrix((np.ones(same.sum()), (ea[same], eb[same])), shape=(n, n))
nc, comp = connected_components(G, directed=False)
print('first cut pieces', nc)
# ---- merge small pieces into the neighbour with the longest shared border (prefer the same road + side)
road_of = np.zeros(nc, np.int64); np.maximum.at(road_of, comp, RID[ix] * 2 + side)
def bad_plots(comp, nc):
    """plots that are too small, too thin or odd shaped"""
    area = np.bincount(comp, minlength=nc) * S * S; bad = area < MIN_AREA
    order = np.argsort(comp, kind='stable'); cs = comp[order]; st = np.searchsorted(cs, np.arange(nc)); en = np.searchsorted(cs, np.arange(nc), 'right')
    for c in np.nonzero(~bad)[0]:
        sel = order[st[c]:en[c]]; ci, cj = fi[sel], fj[sel]
        m = np.zeros((cj.max() - cj.min() + 3, ci.max() - ci.min() + 3), np.uint8); m[cj - cj.min() + 1, ci - ci.min() + 1] = 1
        inr = cv2.distanceTransform(m, cv2.DIST_L2, 3).max() * S - S / 2
        pts = np.c_[ci, cj].astype(np.float32); (_, (rw, rh), _) = cv2.minAreaRect(pts); fill = len(sel) / max(1.0, (rw + 1) * (rh + 1))
        if inr < MIN_INR or fill < MIN_FILL: bad[c] = True
    return bad, area
for it in range(12):
    bad, area = bad_plots(comp, nc)
    ca, cb = comp[ea], comp[eb]; diff = ca != cb
    ca, cb = ca[diff], cb[diff]
    pair = collections.Counter()
    for a, b in zip(np.r_[ca, cb], np.r_[cb, ca]): pair[(a, b)] += 1
    best = {}; taken = set()
    for (a, b), c in sorted(pair.items(), key=lambda kv: area[kv[0][0]]):     # smallest first
        if not bad[a]: continue
        sc = c * (3 if road_of[a] == road_of[b] else 1) * (2 if not bad[b] else 1)
        if a not in best or sc > best[a][0]: best[a] = (sc, b)
    # a bad plot that is the target of another bad plot is not moved in the same pass (no chains)
    tg = {b for (_, b) in best.values()}
    mp = np.arange(nc)
    for a, (sc, b) in best.items():
        if a in tg and bad[b] is False: continue
        if b in best and best[b][1] == a and a > b: continue                  # two bad plots pointing at each other: move only one
        mp[a] = b
    for _ in range(8): mp = mp[mp]
    if (mp == np.arange(nc)).all(): print('merge pass', it, 'nothing more to merge'); break
    comp = mp[comp]; _, comp = np.unique(comp, return_inverse=True); nc = comp.max() + 1
    road_of = np.zeros(nc, np.int64); np.maximum.at(road_of, comp, RID[ix] * 2 + side)
    print('merge pass', it, 'bad', int(bad.sum()), 'plots now', nc)
bad, area = bad_plots(comp, nc); print('still bad (no neighbour, small islands):', int(bad.sum()), ' area of them m2', int(area[bad].sum()))
# ---- polygons
order = np.argsort(comp, kind='stable'); cs = comp[order]; starts = np.searchsorted(cs, np.arange(nc)); ends = np.searchsorted(cs, np.arange(nc), 'right')
plots = []; lab = -np.ones((H, W), np.int32)
for c in range(nc):
    sel = order[starts[c]:ends[c]]; ci, cj = fi[sel], fj[sel]
    lab[cj, ci] = c
    x0, x1, z0, z1 = ci.min() - 1, ci.max() + 2, cj.min() - 1, cj.max() + 2
    m = np.zeros((z1 - z0, x1 - x0), np.uint8); m[cj - z0, ci - x0] = 1
    m4 = cv2.resize(m, None, fx=4, fy=4, interpolation=cv2.INTER_NEAREST)       # 0.5 m pixels: borders of neighbours touch
    cnt, _ = cv2.findContours(m4, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cnt: continue
    cc = max(cnt, key=cv2.contourArea); ap = cv2.approxPolyDP(cc, 1.5 / (S / 4), True)[:, 0, :]
    poly = [[round(X0 + (x0 + (px + .5) / 4) * S, 1), round(Z0 + (z0 + (pz + .5) / 4) * S, 1)] for px, pz in ap]
    if len(poly) < 3:   # tiny island: keep it as a plot with its own small outline
        ap = cv2.convexHull(cc)[:, 0, :]; poly = [[round(X0 + (x0 + (px + .5) / 4) * S, 1), round(Z0 + (z0 + (pz + .5) / 4) * S, 1)] for px, pz in ap]
        if len(poly) < 3: continue
    q0 = np.c_[gx[ci], gz[cj]]; dd = d[sel]; g = int(np.argmin(dd)); r = RID[ix[sel[g]]]
    vx, vz = P[ix[sel[g]], 0] - q0[g, 0], P[ix[sel[g]], 1] - q0[g, 1]; L = float(np.hypot(vx, vz)) or 1.0
    plots.append({'id': len(plots), 'road': RD[r]['name'], 'side': int(side[sel[g]]), 'area': round(len(sel) * S * S), 'tiny': bool(bad[c]), 'poly': poly,
                  'gate': [round(float(q0[g, 0]), 1), round(float(q0[g, 1]), 1)], 'face': [round(vx / L, 3), round(vz / L, 3)]})
print('plots', len(plots), ' area m2 min/median/max', min(p['area'] for p in plots), int(np.median([p['area'] for p in plots])), max(p['area'] for p in plots))
# ---- buildings: which plot is each hand / fill building in?  (centre cell, and all 4 corners in the SAME plot)
from scipy.ndimage import distance_transform_edt
dist, (ni, nj) = distance_transform_edt(lab < 0, return_indices=True)
def cell(x, z): return int((x - X0) / S), int((z - Z0) / S)
bld = []; out_b = []; split_b = []
for kind in ('hand', 'fill'):
    for n_, b in enumerate(INP[kind]):
        if np.hypot(b['x'], b['z']) > R: continue
        w, dp = max(b['W'] - 8, 4), max(b['D'] - 8, 4)      # the body of the building (the rest of W x D is yard)
        if abs(abs(b.get('yaw') or 0) % 3.1416 - 1.5708) < .1: w, dp = dp, w
        i, j = cell(b['x'], b['z']); pid = int(lab[j, i]); nm = b.get('id', kind) + '#' + str(n_) if kind == 'fill' else b['id']
        if pid < 0:
            jj, ii = nj[j, i], ni[j, i]; out_b.append({'id': nm, 'kind': kind, 'x': b['x'], 'z': b['z'], 'to_x': round(X0 + (ii + .5) * S, 1), 'to_z': round(Z0 + (jj + .5) * S, 1), 'dist': round(float(dist[j, i] * S), 1)}); continue
        cps = {int(lab[cell(b['x'] + sx * w / 2, b['z'] + sz * dp / 2)[1], cell(b['x'] + sx * w / 2, b['z'] + sz * dp / 2)[0]]) for sx in (-1, 1) for sz in (-1, 1)}
        if (cps - {-1}) != {pid}: split_b.append(nm)
        bld.append([nm, pid])
print('buildings centre in a plot:', len(bld), ' centre NOT in a plot:', len(out_b), [o_['id'] for o_ in out_b[:12]], ' footprint crosses a plot border:', len(split_b))
# ---- TREES inside plots: only a FEW, always the game's own tree kinds (no new models). Garden trees stand >= 4 m from the plot border, >= 3 m from every building body, >= 11 m from each other.
#      budget per plot = clear ground / 1200 m2 (max 12), so small or crowded plots get none.
blk = np.zeros((H, W), np.uint8)
for kind in ('hand', 'fill'):
    for b in INP[kind]:
        if np.hypot(b['x'], b['z']) > R + 40: continue
        w, dp = max(b['W'] - 8, 4) + 6, max(b['D'] - 8, 4) + 6; y = b.get('yaw') or 0; c_, s_ = np.cos(y), np.sin(y)
        pts = np.array([[(b['x'] + u * c_ + v * s_ - X0) / S, (b['z'] - u * s_ + v * c_ - Z0) / S] for u, v in ((-w / 2, -dp / 2), (w / 2, -dp / 2), (w / 2, dp / 2), (-w / 2, dp / 2))])
        cv2.fillPoly(blk, [np.round(pts * 16).astype(np.int32)], 1, shift=4)
de = distance_transform_edt(lab >= 0) * S
KINDS = [(15, .75, 1.05, 3), (0, .8, 1.1, 3), (4, .8, 1.1, 2), (3, .75, 1.0, 1), (11, .75, 1.05, 2), (5, .85, 1.1, 1)]   # (TreeKind, scale min, scale max, weight): krishnachura, broadleaf, vase, oak, coconut, slender
KP = np.array([k[3] for k in KINDS], float); KP /= KP.sum()
rng2 = np.random.default_rng(11); trees = []
for c in range(nc):
    if bad[c] or c >= len(plots) and False: continue
    sel = order[starts[c]:ends[c]]; ci, cj = fi[sel], fj[sel]
    ok = (de[cj, ci] >= 4) & (blk[cj, ci] == 0)
    n_t = min(12, int(ok.sum() * S * S / 1200))
    if n_t <= 0: continue
    cand = np.nonzero(ok)[0]; rng2.shuffle(cand); mine = []
    for q_ in cand:
        x_, z_ = gx[ci[q_]], gz[cj[q_]]
        if all((x_ - a_) ** 2 + (z_ - b_) ** 2 >= 121 for a_, b_ in mine): mine.append((x_, z_))
        if len(mine) >= n_t: break
    for x_, z_ in mine:
        kd = KINDS[rng2.choice(len(KINDS), p=KP)]
        trees.append([round(float(x_), 1), round(float(z_), 1), kd[0], round(float(rng2.uniform(kd[1], kd[2])), 2), round(float(rng2.uniform(0, 6.2832)), 2)])
print('garden trees (existing game kinds):', len(trees), ' per plot max', 12)
json.dump(trees, open('docs/city_plot_trees.json', 'w'), separators=(',', ':'))
json.dump({'plot_w': PLOT_W, 'radius': R, 'plots': plots, 'buildings': bld, 'outside': out_b, 'cross_border': split_b}, open('docs/city_plots_tiled.json', 'w'), separators=(',', ':'))
# ---- pictures
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
rng = np.random.default_rng(3)
def draw(fn, xl, zl, size, title):
    fig, ax = plt.subplots(figsize=size, dpi=80)
    img = np.ones((nz, nx, 3)); 
    for bit, col in ((64, (1, .93, .7)), (16, (.55, .75, 1)), (8, (1, .6, .2)), (4, (.6, .35, .15)), (2, (.8, .8, .8)), (1, (.2, .2, .2))): img[(M & bit) > 0] = col
    ax.imshow(img, extent=(X0, X0 + nx * C, Z0 + nz * C, Z0), origin='upper')
    pc = PolyCollection([p['poly'] for p in plots], facecolors=[tuple(rng.uniform(.55, .95, 3)) for _ in plots], edgecolors='k', linewidths=.35); ax.add_collection(pc)
    ax.set_xlim(*xl); ax.set_ylim(zl[1], zl[0]); ax.set_aspect('equal'); ax.set_title(title); fig.savefig(fn, bbox_inches='tight'); plt.close(fig)
draw('docs/city_plots_tiled.png', (-1500, 1500), (-1500, 1500), (16, 16), f'TILED PLOTS {len(plots)}  (every colour patch = one plot, black line = plot border)')
draw('docs/city_plots_tiled_zoom.png', (-500, 400), (-250, 500), (18, 15), 'ZOOM: tiled plots')
