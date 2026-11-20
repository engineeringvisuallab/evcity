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
MIN_AREA = 250.0                                                # smaller pieces are merged into a neighbour (m2)
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
# ---- connected pieces of the same key
idx = -np.ones((H, W), np.int64); idx[fj, fi] = np.arange(len(fj))
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
for it in range(8):
    area = np.bincount(comp, minlength=nc) * S * S
    ca, cb = comp[ea], comp[eb]; diff = ca != cb
    ca, cb = ca[diff], cb[diff]
    pair = collections.Counter()
    for a, b in zip(np.r_[ca, cb], np.r_[cb, ca]): pair[(a, b)] += 1
    best = {}
    for (a, b), c in pair.items():
        if area[a] >= MIN_AREA: continue
        sc = c * (3 if road_of[a] == road_of[b] else 1) * (2 if area[b] >= MIN_AREA else 1)
        if a not in best or sc > best[a][0]: best[a] = (sc, b)
    if not best: break
    mp = np.arange(nc)
    for a, (sc, b) in best.items(): mp[a] = b
    for _ in range(6): mp = mp[mp]
    comp = mp[comp]; _, comp = np.unique(comp, return_inverse=True); nc = comp.max() + 1
    road_of = np.zeros(nc, np.int64); np.maximum.at(road_of, comp, RID[ix] * 2 + side)
    print('merge pass', it, 'merged', len(best), 'plots', nc)
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
    plots.append({'id': len(plots), 'road': RD[r]['name'], 'side': int(side[sel[g]]), 'area': round(len(sel) * S * S), 'poly': poly,
                  'gate': [round(float(q0[g, 0]), 1), round(float(q0[g, 1]), 1)], 'face': [round(vx / L, 3), round(vz / L, 3)]})
print('plots', len(plots), ' area m2 min/median/max', min(p['area'] for p in plots), int(np.median([p['area'] for p in plots])), max(p['area'] for p in plots))
# ---- buildings: is every hand building inside a plot?
out_b = []
for b in INP['hand']:
    i = int((b['x'] - X0) / S); j = int((b['z'] - Z0) / S)
    if abs(b['x']) < R and 0 <= i < W and 0 <= j < H and np.hypot(b['x'], b['z']) <= R and lab[j, i] < 0: out_b.append(b['id'])
print('hand buildings centre NOT in a plot:', len(out_b), out_b[:20])
json.dump({'plot_w': PLOT_W, 'radius': R, 'plots': plots, 'hand_not_in_plot': out_b}, open('docs/city_plots_tiled.json', 'w'), separators=(',', ':'))
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
