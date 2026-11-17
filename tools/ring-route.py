"""STEP 2.2b: least-cost corridor for the ring (round mountains, water, airport, rail, stations), then PI fit with tools/ring-fit.py.
Run: python3 tools/ring-route.py <ring_raster.json> <out-dir>"""
import json, sys, math, importlib.util
import numpy as np
from scipy.ndimage import uniform_filter, binary_dilation, gaussian_filter1d, distance_transform_edt
from scipy.spatial import cKDTree
from skimage.graph import MCP_Geometric
R_ = json.load(open(sys.argv[1])); out = sys.argv[2]
N = R_['n']; C = R_['cell']; HALF = R_['half']
h = np.array(R_['h'], float).reshape(N, N); wet = np.array(R_['wet']).reshape(N, N)
xs = -HALF + (np.arange(N) + 0.5) * C; X, Z = np.meshgrid(xs, xs)   # row = z index, col = x index
gz, gx = np.gradient(h, C); slope = np.hypot(gx, gz) * 100
slope = uniform_filter(slope, 3)
cost = np.ones((N, N))
cost += (np.maximum(0, slope - 10) / 10) ** 2 * 3
cost += np.where(wet == 2, 400, 0) + np.where(wet == 1, 10, 0)
cost += np.where(binary_dilation(wet > 0, iterations=2) & (wet == 0), 3, 0)
def inflate(r, m): return (X >= r['x0'] - m) & (X <= r['x1'] + m) & (Z >= r['z0'] - m) & (Z <= r['z1'] + m)
for r in R_['rects']:
    if r['id'] in ('airport', 'airport-sea', 'army', 'seaport'): cost += np.where(inflate(r, 150), 400, 0)
    else: cost += np.where(inflate(r, 40), 25, 0)
rail_pts = []
for e in R_['rail']:
    a = np.stack([e['xs'], e['zs']], 1)
    for i in range(len(a) - 1):
        m = max(2, int(np.hypot(*(a[i + 1] - a[i])) / 10)); rail_pts.append(a[i] + np.linspace(0, 1, m)[:, None] * (a[i + 1] - a[i]))
rail_pts = np.vstack(rail_pts)
dr = cKDTree(rail_pts).query(np.stack([X.ravel(), Z.ravel()], 1))[0].reshape(N, N)
cost += np.where(dr < 70, 12, 0) + np.where(dr < 30, 20, 0)
for s in R_['stations']: cost += np.where(np.hypot(X - s['x'], Z - s['z']) < s['r'] + 100, 400, 0)
ref = np.array(R_['ref']).reshape(-1, 2); dref = cKDTree(ref).query(np.stack([X.ravel(), Z.ravel()], 1))[0].reshape(N, N)
cost += np.minimum(0.3 * (dref / 150) ** 2, 40)
cost += np.where((np.abs(X) > 4700) | (np.abs(Z) > 4700), 100, 0)
cost += np.where(Z > 2900 - 100, 60, 0) * (X < 5000)  # keep clear of the coast band (coast z ~ 2840-3160)
np.save(f'{out}/ring_cost.npy', cost)
# anchors: ref ring points at fixed stations of the OLD ring, moved to the cheapest cell within 250 m
ref_closed = np.vstack([ref, ref[:1]]); seg = np.hypot(*np.diff(ref_closed, axis=0).T); cum = np.concatenate([[0], np.cumsum(seg)])
def ref_at(f):
    t = f * cum[-1]; return np.array([np.interp(t, cum, ref_closed[:, 0]), np.interp(t, cum, ref_closed[:, 1])])
ci = lambda v: int(np.clip((v + HALF) / C, 0, N - 1))
def snap(p, r=250):
    i0, j0 = ci(p[0]), ci(p[1]); k = int(r / C); best = None
    for j in range(max(0, j0 - k), min(N, j0 + k + 1)):
        for i in range(max(0, i0 - k), min(N, i0 + k + 1)):
            if best is None or cost[j, i] < best[0]: best = (cost[j, i], j, i)
    return best[1], best[2]
STATIONS = [float(a) for a in sys.argv[3].split(',')] if len(sys.argv) > 3 else [0, 3000, 4500, 10500, 13000, 16000, 19000]
anch = []
for s in STATIONS:
    p = ref_at(s / cum[-1] * 1.0 * (cum[-1] / 21390.0) / (cum[-1] / cum[-1]) if False else s / 21390.0)
    anch.append(snap(p))
path = []
for a, b in zip(anch, anch[1:] + anch[:1]):
    m = MCP_Geometric(cost, fully_connected=True)
    m.find_costs([a]); p = m.traceback(b)
    path += p[:-1]
path = np.array(path)
P = np.stack([xs[path[:, 1]], xs[path[:, 0]]], 1)
tot = sum(cost[j, i] for j, i in path)
print('anchors:', [(round(xs[i]), round(xs[j])) for j, i in anch]); print('path cells', len(path), 'length ~', round(len(path) * C * 1.1), 'm, cost', round(tot))
# smooth (periodic) and save for the fit
Ps = np.stack([gaussian_filter1d(P[:, 0], 8, mode='wrap'), gaussian_filter1d(P[:, 1], 8, mode='wrap')], 1)
json.dump(Ps.ravel().tolist(), open(f'{out}/ring_route.json', 'w'))
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
fig, ax = plt.subplots(figsize=(11, 11))
ax.imshow(np.minimum(slope, 80), extent=[-HALF, HALF, HALF, -HALF], cmap='terrain_r', alpha=.65, vmin=0, vmax=80)
ax.contour(X, Z, (wet > 0).astype(float), [0.5], colors='b', linewidths=.6)
ax.plot(ref[:, 0], ref[:, 1], 'k--', lw=1.2, label='old reference ring (Roads.zip F3)')
ax.plot(Ps[:, 0], Ps[:, 1], 'r', lw=2, label='least-cost route')
for e in R_['rail']: ax.plot(e['xs'], e['zs'], color='gray', lw=1)
for r in R_['rects']:
    ax.add_patch(plt.Rectangle((r['x0'], r['z0']), r['x1'] - r['x0'], r['z1'] - r['z0'], fill=False, ec='purple', lw=.8))
ax.set_xlim(-4500, 4500); ax.set_ylim(4000, -4300); ax.legend(); ax.set_title('slope (brown = steep), rail grey, fenced areas purple'); ax.set_aspect('equal')
plt.savefig(f'{out}/ring_route.png', dpi=90)
