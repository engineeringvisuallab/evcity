"""STEP 2.2b: fit the closed PI alignment (straight-spiral-arc) to the least-cost corridor and score every try on the real obstacles.
Run: python3 tools/ring-refit.py <ring_raster.json> <ring_route.json> <out-dir> [N list]"""
import json, sys, math, importlib.util
import numpy as np
from scipy.spatial import cKDTree
spec = importlib.util.spec_from_file_location('rf', __file__.replace('ring-refit.py', 'ring-fit.py')); rf = importlib.util.module_from_spec(spec); spec.loader.exec_module(rf)
R_ = json.load(open(sys.argv[1])); route = np.array(json.load(open(sys.argv[2]))).reshape(-1, 2); out = sys.argv[3]
Ns = [int(a) for a in sys.argv[4].split(',')] if len(sys.argv) > 4 else [10, 12, 14, 16, 18]
N = R_['n']; C = R_['cell']; HALF = R_['half']
h = np.array(R_['h'], float).reshape(N, N); wet = np.array(R_['wet']).reshape(N, N)
gz, gx = np.gradient(h, C); slope = np.hypot(gx, gz) * 100
from scipy.ndimage import uniform_filter
slope = uniform_filter(slope, 3)
def cell(p): return np.clip(((p + HALF) / C).astype(int), 0, N - 1)
rail = []
for e in R_['rail']:
    a = np.stack([e['xs'], e['zs']], 1)
    for i in range(len(a) - 1):
        m = max(2, int(np.hypot(*(a[i + 1] - a[i])) / 10)); rail.append(a[i] + np.linspace(0, 1, m)[:, None] * (a[i + 1] - a[i]))
railT = cKDTree(np.vstack(rail))
def score(PI, R, tag=''):
    al = rf.sample(PI, R, 5); c = cell(al)
    s = slope[c[:, 1], c[:, 0]]; w = wet[c[:, 1], c[:, 0]]
    L = len(al) * 5
    rep = {}
    rep['len_km'] = L / 1000
    rep['steep_m(>25%)'] = float((s > 25).sum() * 5); rep['very_steep_m(>60%)'] = float((s > 60).sum() * 5)
    rep['sea_m'] = float((w == 2).sum() * 5)
    wi = (w == 1).astype(int); rep['inland_water_crossings'] = int(((wi[1:] - wi[:-1]) == 1).sum())
    bad = 0; touch = []
    for r in R_['rects']:
        crit = r['id'] in ('airport', 'airport-sea', 'army', 'seaport')
        m = 100 if crit else 0
        ins = (al[:, 0] > r['x0'] - m) & (al[:, 0] < r['x1'] + m) & (al[:, 1] > r['z0'] - m) & (al[:, 1] < r['z1'] + m)
        if ins.any(): touch.append((r['id'], int(ins.sum() * 5), 'CRITICAL' if crit else 'eng'))
    rep['fenced_areas_touched'] = touch
    d = railT.query(al)[0]; rep['rail_closer_than_40m_m'] = float((d < 40).sum() * 5)
    cr = ((d[1:] < 25) & (d[:-1] >= 25)).sum(); rep['rail_crossings_approx'] = int(cr)
    for st in R_['stations']:
        if (np.hypot(al[:, 0] - st['x'], al[:, 1] - st['z']) < st['r'] + 60).any(): rep.setdefault('rail_stations_hit', []).append(st['id'])
    dv = cKDTree(route).query(al)[0]; rep['dev_from_corridor_max'] = float(dv.max()); rep['dev_from_corridor_mean'] = float(dv.mean())
    h_, E, dl, ths, Ts, g, arc = rf.geometry(PI, R)
    n = len(PI); gm = [rf.GSAME if dl[i] * dl[(i + 1) % n] > 0 else rf.GREV for i in range(n)]
    rep['Rmin'] = float(R.min()); rep['straight_rule_fails'] = int(sum(g[i] < gm[i] - 1e-6 for i in range(n))); rep['min_arc_deg'] = float(np.degrees(arc.min()))
    rep['coast_min_m'] = float(2840 - al[:, 1].max()); rep['edge_min_m'] = float(5000 - np.abs(al).max())
    return rep
shape = route
res = {}
for n in Ns:
    PI, Rr, dev, g, dl, arc = rf.fit(shape, n)
    rep = score(PI, Rr); rep['N'] = len(PI); res[len(PI)] = (PI, Rr, rep)
    print(f"N={len(PI)}: " + json.dumps({k: (round(v, 1) if isinstance(v, float) else v) for k, v in rep.items()}))
    np.save(f'{out}/refit_{len(PI)}.npy', np.column_stack([PI, Rr]))
