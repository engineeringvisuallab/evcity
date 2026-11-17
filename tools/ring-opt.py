"""STEP 2.2b: local search of the PI table (x, z, R) against the obstacle cost raster. Keeps the smoothness rules (R >= 1.5 Rmin, straights >= 6V / 2V, arc > 0).
Run: python3 tools/ring-opt.py <ring_raster.json> <ring_cost.npy> <start.npy> <out.npy> [iterations] [seed]"""
import json, sys, math, importlib.util
import numpy as np
spec = importlib.util.spec_from_file_location('rf', __file__.replace('ring-opt.py', 'ring-fit.py')); rf = importlib.util.module_from_spec(spec); spec.loader.exec_module(rf)
R_ = json.load(open(sys.argv[1])); cost = np.load(sys.argv[2]); X0 = np.load(sys.argv[3]); outp = sys.argv[4]
iters = int(sys.argv[5]) if len(sys.argv) > 5 else 4000; rng = np.random.default_rng(int(sys.argv[6]) if len(sys.argv) > 6 else 1)
N = R_['n']; C = R_['cell']; HALF = R_['half']
n = len(X0); PI = X0[:, :2].copy(); R = X0[:, 2].copy()
def J(PI, R):
    h, E, dl, ths, Ts, g, arc = rf.geometry(PI, R)
    pen = 0.0
    for i in range(n):
        gm = rf.GSAME if dl[i] * dl[(i + 1) % n] > 0 else rf.GREV
        pen += max(0.0, gm - g[i]) * 40 + max(0.0, 0.05 - arc[i]) * 80000
    pen += np.maximum(0, rf.RLIM - R).sum() * 50
    al = rf.sample(PI, R, 10); c = np.clip(((al + HALF) / C).astype(int), 0, N - 1)
    return float(cost[c[:, 1], c[:, 0]].sum() * 10 / C) + pen + 0.0004 * len(al) * 10
best = J(PI, R); print('start J', round(best), flush=True)
step = np.array([150.0, 150.0, 400.0])
for it in range(iters):
    sc = max(0.12, 1 - it / iters)
    P2 = PI.copy(); R2 = R.copy(); k = rng.integers(n)
    mode = rng.random()
    if mode < 0.7: P2[k] += rng.normal(0, step[0] * sc, 2)
    elif mode < 0.85: R2[k] = max(rf.RLIM, R2[k] * math.exp(rng.normal(0, 0.25 * sc)))
    else:
        P2[k] += rng.normal(0, step[0] * sc, 2); P2[(k + 1) % n] += rng.normal(0, step[0] * sc, 2)
    j = J(P2, R2)
    if j < best: best, PI, R = j, P2, R2
    if it % 500 == 0: print(it, round(best), flush=True)
np.save(outp, np.column_stack([PI, R])); print('final J', round(best))
