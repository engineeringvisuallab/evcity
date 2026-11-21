# plots-tile.py : PLOT TILING P4 (mixed plot sizes 500 / 700 / 1000 m2 in rows along the road, access roads as their own parcels, 2026-11-21).
#   Rows: plots of depth DEP m along the road; deep land gets back-to-back rows with an ACCESS ROAD (RW m wide, its own parcel, 'road': true) between the pairs of rows.
# (older text of P3 follows)
# plots-tile.py : PLOT TILING P3 (equal-area plots, 2026-11-21).
#   Normal plots all have (nearly) the SAME area = TARGET (default 1000 m2 = 15 katha, range ~670-1340 m2). Shape may vary with the road curve, area does not.
#   A building that needs more land (office, school, mall, hotel ... = W x D bigger than BIG_MIN) gets ONE big plot of its own size: like 2/3/5/10 normal plots joined.
# (older text of P2 follows)
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
from scipy.ndimage import minimum_filter1d
SIZES = [float(v) for v in sys.argv[1].split(',')] if len(sys.argv) > 1 else [500.0, 700.0, 1000.0]   # plot sizes (m2) mixed along every row: 500 / 700 / 1000 m2
DEP = 36.0                                                      # plot depth (m) from the road edge; a plot of 500 m2 is ~14 m wide, 1000 m2 ~28 m wide
RW = 8.0                                                        # width (m) of an ACCESS ROAD that is added where the land is too deep for one or two rows of plots (its own parcel)
BIG_MIN = 1300.0                                                # a building whose land (W x D) is bigger than this gets ONE big plot of its own size (= several normal plots joined)
MIN_AREA = 350.0                                                # smaller pieces are merged into a neighbour (m2)
MIN_INR = 5.0                                                   # a plot must fit a circle of this radius (m) = no thin strips, a building can stand on it
MIN_FILL = 0.45                                                 # plot area / its smallest rectangle: lower = bad (odd) shape
S = 2.0                                                         # raster cell (m)
R = 1500.0                                                      # the city circle
SIMPL = 3.0                                                     # border simplify tolerance (m): straight plot borders like a surveyed parcel
BUF = 120.0                                                     # plots also cover every building area: land within BUF m of any building (houses, flats, villages)
N = json.load(open('docs/city_nogo.json')); RD = json.load(open('docs/city_roads_cl.json')); INP = json.load(open('docs/city_plots_input.json'))
nx, nz, X0, Z0, C = N['nx'], N['nz'], N['x0'], N['z0'], N['cell']
M = np.frombuffer(base64.b64decode(N['mask']), dtype=np.uint8).reshape(nz, nx)
WET = np.frombuffer(base64.b64decode(N['wet']), dtype=np.uint8).reshape(nz, nx) > 0
k = int(C / S); up = lambda a: np.kron(a, np.ones((k, k), a.dtype))
HARD = 1 | 2 | 4 | 8 | 16 | 64          # road, street, rail, keep-out, water, steep   (32 = hand building, 128 = soft: both are plot land)
W = nx * k; H = nz * k
gx = X0 + (np.arange(W) + .5) * S; gz = Z0 + (np.arange(H) + .5) * S
# ---- plot area = the city circle + every place where buildings stand (all hand / fill / residential buildings, BUF m round each, small gaps closed)
area = np.hypot(gx[None, :], gz[:, None]) <= R
bm = np.zeros((H, W), np.uint8)
for kind in ('hand', 'fill'):
    for b in INP[kind]:
        i_, j_ = int((b['x'] - X0) / S), int((b['z'] - Z0) / S)
        if 0 <= i_ < W and 0 <= j_ < H: bm[j_, i_] = 1
kk = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * int(BUF / S) + 1,) * 2)
bm = cv2.dilate(bm, kk); bm = cv2.morphologyEx(bm, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * int(60 / S) + 1,) * 2))
area |= bm > 0; del bm
cv2.imwrite('docs/city_plots_area.png', area.astype(np.uint8) * 255)
print('plot area ha', int(area.sum() * S * S / 1e4))
free = (up(M & HARD) == 0) & ~up(WET) & area
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
nf, fl = cv2.connectedComponents(free.astype(np.uint8), connectivity=4); fl = fl[fj, fi]
key = np.zeros(len(fj), np.int64)      # filled below: equal-area cutting
# ---- connected pieces of the same key
idx = -np.ones((H, W), np.int64); idx[fj, fi] = np.arange(len(fj))
# ---- 1. BIG plots: a building whose land (W x D) is bigger than BIG_MIN gets one plot that is its own rectangle (+2 m). Bigger need = bigger plot (like 2/3/5/10 plots joined).
BIGK = 8000000000
bigid = np.zeros((H, W), np.int32)
nbig = 0; big_names = []
bigs = sorted([b for b in INP['hand'] if X0 < b['x'] < X0 + nx * C and Z0 < b['z'] < Z0 + nz * C and b['W'] * b['D'] > BIG_MIN], key=lambda b: -b['W'] * b['D'])
for b in bigs:
    y = b.get('yaw') or 0; c_, s_ = np.cos(y), np.sin(y); w_, d_ = b['W'] + 4, b['D'] + 4
    pts = np.array([[(b['x'] + u * c_ + v * s_ - X0) / S, (b['z'] - u * s_ + v * c_ - Z0) / S] for u, v in ((-w_ / 2, -d_ / 2), (w_ / 2, -d_ / 2), (w_ / 2, d_ / 2), (-w_ / 2, d_ / 2))])
    tmp = np.zeros((H, W), np.uint8); cv2.fillPoly(tmp, [np.round(pts * 16).astype(np.int32)], 1, shift=4)
    nbig += 1; bigid[(tmp > 0) & (bigid == 0)] = nbig; big_names.append(b['id'])
bg = bigid[fj, fi]
key[bg > 0] = BIGK + bg[bg > 0].astype(np.int64)
print('big plots (one per building that needs more than', int(BIG_MIN), 'm2):', nbig)
# ---- 2. every other free cell: group = (free block, nearest road, side). In the ROAD FRAME (s along the road, t from the road edge) the group is cut into
#         ROWS of depth DEP: plots (sizes mixed 500 / 700 / 1000 m2, cut square to the road) and, if the land is deeper, an ACCESS ROAD between two back-to-back rows.
ROADK = 9000000000
def win_of(b, kind):
    w, dp = b['W'], b['D']
    if kind == 'hand':
        if abs(abs(b.get('yaw', 0)) % 3.1416 - 1.5708) < .1: w, dp = dp, w
    else: w = dp = max(w, dp)
    return (max(int((b['x'] - w / 2 - 2 - X0) / S), 0), min(int((b['x'] + w / 2 + 2 - X0) / S) + 1, W), max(int((b['z'] - dp / 2 - 2 - Z0) / S), 0), min(int((b['z'] + dp / 2 + 2 - Z0) / S) + 1, H))
bwin = np.zeros((H, W), bool)       # land under a normal building (+2 m): never becomes an access road
for kind in ('hand', 'fill'):
    for b in INP[kind]:
        if not (X0 < b['x'] < X0 + nx * C and Z0 < b['z'] < Z0 + nz * C): continue
        if kind == 'hand' and b['W'] * b['D'] > BIG_MIN: continue
        i0, i1, j0, j1 = win_of(b, kind); bwin[j0:j1, i0:i1] = True
bw = bwin[fj, fi]
rest = np.nonzero(bg == 0)[0]
gkey = (fl[rest].astype(np.int64) * 1000 + RID[ix[rest]]) * 2 + side[rest]
ug, ginv = np.unique(gkey, return_inverse=True)
gord = np.argsort(ginv, kind='stable'); gs = ginv[gord]; g0 = np.searchsorted(gs, np.arange(len(ug))); g1 = np.searchsorted(gs, np.arange(len(ug)), 'right')
SSa = SS[ix]
rngp = np.random.default_rng(5)
nextk = 1; nroad = 0; AC = S * S
for gi in range(len(ug)):
    sel = rest[gord[g0[gi]:g1[gi]]]
    s_ = SSa[sel]; t_ = d[sel]
    bi = np.floor((s_ - s_.min()) / 4).astype(np.int64); nb_ = int(bi.max()) + 1
    tm = np.full(nb_, np.inf); np.minimum.at(tm, bi, t_)
    okb = np.isfinite(tm)
    if okb.sum() < nb_: tm = np.interp(np.arange(nb_), np.nonzero(okb)[0], tm[okb])
    tm = minimum_filter1d(tm, 5, mode='nearest')
    tt = t_ - tm[bi]                                   # distance from the road edge of the free land
    Tm = float(tt.max())
    segs = [['P', 0.0, DEP]]; pos = DEP
    while True:
        rem = Tm - pos
        if rem >= 2 * DEP + RW:
            segs += [['P', pos, pos + DEP], ['R', pos + DEP, pos + DEP + RW], ['P', pos + DEP + RW, pos + 2 * DEP + RW]]; pos += 2 * DEP + RW
        elif rem >= 1.7 * DEP + RW:
            segs += [['P', pos, pos + DEP], ['R', pos + DEP, pos + DEP + RW], ['P', pos + DEP + RW, 1e9]]; break
        else:
            segs[-1][2] = 1e9; break                   # the rest of the depth goes into the last row (a deeper plot)
    segs[-1][2] = 1e9
    sid = np.full(len(sel), -1, np.int64)
    for k_, (kd, t0, t1) in enumerate(segs): sid[(tt >= t0) & (tt < t1)] = k_
    for k_ in range(len(segs)):                        # land under a building is never road: it joins the row before the road
        if segs[k_][0] == 'R': sid[(sid == k_) & bw[sel]] = k_ - 1
    for k_, (kd, t0, t1) in enumerate(segs):
        m = sid == k_
        if not m.any(): continue
        cs_ = sel[m]
        if kd == 'R':
            key[cs_] = ROADK + nroad; nroad += 1; continue
        o_ = np.lexsort((tt[m], s_[m])); cs_ = cs_[o_]
        total = len(cs_) * AC; sizes = rngp.choice(SIZES, size=int(total / min(SIZES)) + 3)
        acc = 0.0; cuts = []
        for sz in sizes:
            if total - (acc + sz) < MIN_AREA: break
            acc += sz; cuts.append(int(round(acc / AC)))
        lab_ = np.searchsorted(np.array(cuts, np.int64), np.arange(len(cs_)), 'right') if cuts else np.zeros(len(cs_), np.int64)
        key[cs_] = nextk + lab_; nextk += len(cuts) + 1
print('row plots cut:', nextk - 1, ' access road strips:', nroad)
# ---- 3. a normal building is never cut by a plot border: all free cells under it (+2 m round it) join the plot that holds most of it
idx = -np.ones((H, W), np.int64); idx[fj, fi] = np.arange(len(fj))
n_keep = 0
for kind in ('hand', 'fill'):
    for b in INP[kind]:
        if not (X0 < b['x'] < X0 + nx * C and Z0 < b['z'] < Z0 + nz * C): continue
        if kind == 'hand' and b['W'] * b['D'] > BIG_MIN: continue
        i0, i1, j0, j1 = win_of(b, kind)
        win = idx[j0:j1, i0:i1]; ids = win[win >= 0]
        if len(ids) == 0: continue
        ids = ids[key[ids] < BIGK]
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
isbig = np.zeros(nc, bool); isbig[comp[(key >= BIGK) & (key < ROADK)]] = True; isroad = np.zeros(nc, bool); isroad[comp[key >= ROADK]] = True
def bad_plots(comp, nc):
    """plots that are too small, too thin or odd shaped"""
    area = np.bincount(comp, minlength=nc) * S * S; bad = (area < MIN_AREA) & ~isbig & ~isroad
    order = np.argsort(comp, kind='stable'); cs = comp[order]; st = np.searchsorted(cs, np.arange(nc)); en = np.searchsorted(cs, np.arange(nc), 'right')
    for c in np.nonzero(~bad & ~isroad)[0]:
        sel = order[st[c]:en[c]]; ci, cj = fi[sel], fj[sel]
        m = np.zeros((cj.max() - cj.min() + 3, ci.max() - ci.min() + 3), np.uint8); m[cj - cj.min() + 1, ci - ci.min() + 1] = 1
        inr = cv2.distanceTransform(m, cv2.DIST_L2, 3).max() * S - S / 2
        pts = np.c_[ci, cj].astype(np.float32); (_, (rw, rh), _) = cv2.minAreaRect(pts); fill = len(sel) / max(1.0, (rw + 1) * (rh + 1))
        if (inr < MIN_INR or fill < MIN_FILL) and not isbig[c]: bad[c] = True
    return bad, area
for it in range(12):
    bad, area = bad_plots(comp, nc)
    ca, cb = comp[ea], comp[eb]; diff = ca != cb
    ca, cb = ca[diff], cb[diff]
    pair = collections.Counter()
    for a, b in zip(np.r_[ca, cb], np.r_[cb, ca]): pair[(a, b)] += 1
    best = {}; taken = set()
    for (a, b), c in sorted(pair.items(), key=lambda kv: area[kv[0][0]]):     # smallest first
        if not bad[a] or isroad[b]: continue
        sc = c * (3 if road_of[a] == road_of[b] else 1) * (2 if not bad[b] else 1) * (0.15 if isbig[b] else 1)
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
    isbig = np.zeros(nc, bool); isbig[comp[(key >= BIGK) & (key < ROADK)]] = True; isroad = np.zeros(nc, bool); isroad[comp[key >= ROADK]] = True
    print('merge pass', it, 'bad', int(bad.sum()), 'plots now', nc)
bad, area = bad_plots(comp, nc); print('still bad (no neighbour, small islands):', int(bad.sum()), ' area of them m2', int(area[bad].sum()))
# ---- polygons
acc_idx = np.nonzero(key >= ROADK)[0]
if len(acc_idx):
    tacc = cKDTree(np.c_[gx[fi[acc_idx]], gz[fj[acc_idx]]]); dacc, iacc = tacc.query(np.c_[gx[fi], gz[fj]])
else: tacc = None; dacc = np.full(len(fj), 1e9); iacc = np.zeros(len(fj), np.int64)
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
    cc = max(cnt, key=cv2.contourArea); ap = cv2.approxPolyDP(cc, SIMPL / (S / 4), True)[:, 0, :]
    poly = [[round(X0 + (x0 + (px + .5) / 4) * S, 1), round(Z0 + (z0 + (pz + .5) / 4) * S, 1)] for px, pz in ap]
    if len(poly) < 3:   # tiny island: keep it as a plot with its own small outline
        ap = cv2.convexHull(cc)[:, 0, :]; poly = [[round(X0 + (x0 + (px + .5) / 4) * S, 1), round(Z0 + (z0 + (pz + .5) / 4) * S, 1)] for px, pz in ap]
        if len(poly) < 3: continue
    if isroad[c]:      # access road parcel (its own parcel, not a plot)
        plots.append({'id': len(plots), 'road': 'access road', 'access': True, 'side': 0, 'area': round(len(sel) * S * S), 'tiny': False, 'big': False, 'poly': poly, 'gate': [0, 0], 'face': [0, 0]}); continue
    q0 = np.c_[gx[ci], gz[cj]]; dd = d[sel]; da = dacc[sel]; g = int(np.argmin(np.minimum(dd, da))); r = RID[ix[sel[g]]]
    if da[g] < dd[g]: vx, vz = tacc.data[iacc[sel[g]]][0] - q0[g, 0], tacc.data[iacc[sel[g]]][1] - q0[g, 1]     # this plot faces an access road
    else: vx, vz = P[ix[sel[g]], 0] - q0[g, 0], P[ix[sel[g]], 1] - q0[g, 1]
    L = float(np.hypot(vx, vz)) or 1.0
    plots.append({'id': len(plots), 'road': RD[r]['name'], 'access': False, 'side': int(side[sel[g]]), 'area': round(len(sel) * S * S), 'tiny': bool(bad[c]), 'big': bool(isbig[c]), 'poly': poly,
                  'gate': [round(float(q0[g, 0]), 1), round(float(q0[g, 1]), 1)], 'face': [round(vx / L, 3), round(vz / L, 3)]})
pa = np.array([p['area'] for p in plots if not p['access'] and not p['big'] and not p['tiny']])
print('plots', sum(1 for p in plots if not p['access']), ' access road parcels', sum(1 for p in plots if p['access']), ' road area ha', round(sum(p['area'] for p in plots if p['access']) / 1e4, 1))
print('normal plot area m2 pct 5/25/50/75/95', np.percentile(pa, [5, 25, 50, 75, 95]).round().tolist())
# ---- buildings: which plot is each hand / fill building in?  (centre cell, and all 4 corners in the SAME plot)
from scipy.ndimage import distance_transform_edt
dist, (ni, nj) = distance_transform_edt(lab < 0, return_indices=True)
def cell(x, z): return int((x - X0) / S), int((z - Z0) / S)
bld = []; out_b = []; split_b = []
for kind in ('hand', 'fill'):
    for n_, b in enumerate(INP[kind]):
        if not (X0 < b['x'] < X0 + nx * C and Z0 < b['z'] < Z0 + nz * C): continue
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
        if not (X0 < b['x'] < X0 + nx * C and Z0 < b['z'] < Z0 + nz * C): continue
        w, dp = max(b['W'] - 8, 4) + 6, max(b['D'] - 8, 4) + 6; y = b.get('yaw') or 0; c_, s_ = np.cos(y), np.sin(y)
        pts = np.array([[(b['x'] + u * c_ + v * s_ - X0) / S, (b['z'] - u * s_ + v * c_ - Z0) / S] for u, v in ((-w / 2, -dp / 2), (w / 2, -dp / 2), (w / 2, dp / 2), (-w / 2, dp / 2))])
        cv2.fillPoly(blk, [np.round(pts * 16).astype(np.int32)], 1, shift=4)
de = distance_transform_edt(lab >= 0) * S
KINDS = [(15, .75, 1.05, 3), (0, .8, 1.1, 3), (4, .8, 1.1, 2), (3, .75, 1.0, 1), (11, .75, 1.05, 2), (5, .85, 1.1, 1)]   # (TreeKind, scale min, scale max, weight): krishnachura, broadleaf, vase, oak, coconut, slender
KP = np.array([k[3] for k in KINDS], float); KP /= KP.sum()
rng2 = np.random.default_rng(11); trees = []
for c in range(nc):
    if bad[c] or isroad[c]: continue
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
json.dump({'plot_w': 0, 'sizes': SIZES, 'depth': DEP, 'access_road_width': RW, 'big_buildings': big_names, 'radius': R, 'plots': plots, 'buildings': bld, 'outside': out_b, 'cross_border': split_b}, open('docs/city_plots_tiled.json', 'w'), separators=(',', ':'))
# ---- pictures
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
rng = np.random.default_rng(3)
def draw(fn, xl, zl, size, title):
    fig, ax = plt.subplots(figsize=size, dpi=80)
    img = np.ones((nz, nx, 3)); 
    for bit, col in ((64, (1, .93, .7)), (16, (.55, .75, 1)), (8, (1, .6, .2)), (4, (.6, .35, .15)), (2, (.8, .8, .8)), (1, (.2, .2, .2))): img[(M & bit) > 0] = col
    ax.imshow(img, extent=(X0, X0 + nx * C, Z0 + nz * C, Z0), origin='upper')
    pc = PolyCollection([p['poly'] for p in plots], facecolors=[(.2, .45, .95) if p.get('access') else tuple(rng.uniform(.55, .95, 3)) for p in plots], edgecolors='k', linewidths=.35); ax.add_collection(pc)
    ax.set_xlim(*xl); ax.set_ylim(zl[1], zl[0]); ax.set_aspect('equal'); ax.set_title(title); fig.savefig(fn, bbox_inches='tight'); plt.close(fig)
draw('docs/city_plots_tiled.png', (X0, X0 + nx * C), (Z0, Z0 + nz * C), (17, 19), f'TILED PLOTS {len(plots)}  (every colour patch = one plot, black line = plot border)')
draw('docs/city_plots_tiled_zoom.png', (-500, 400), (-250, 500), (18, 15), 'ZOOM: tiled plots (city centre)')
draw('docs/city_plots_tiled_zoom2.png', (-3700, -3000), (1100, 1800), (16, 16), 'ZOOM 2: a residential area (south-west)')
