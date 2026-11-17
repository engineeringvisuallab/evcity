"""One-off fitting tool for Step 2.2: fits a closed straight-spiral-arc (PI) alignment to the reference ring shape (Roads.zip F3).
Result = a PI table (x, z, R, Ls) that is stored as DATA in src/roads/alignment/RingAlignment.ts. The game code only builds/checks it.
Run: python3 tools/ring-fit.py ref.json [N]   (ref.json = flat game coordinates of the ring, one closed loop)."""
import json, math, sys
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial import cKDTree

V = 100.0
RMIN = V * V / (127 * (0.08 + 0.12))
RLIM = 1.5 * RMIN
LS = 100.0
GSAME, GREV = 6 * V, 2 * V

def wrap(a): return (a + math.pi) % (2 * math.pi) - math.pi

def spiral_xy(l, R, Ls):
    th = l * l / (2 * R * Ls)
    x = l * (1 - th**2 / 10 + th**4 / 216 - th**6 / 9360 + th**8 / 685440)
    y = l * (th / 3 - th**3 / 42 + th**5 / 1320 - th**7 / 75600)
    return x, y

def geometry(PI, R):
    n = len(PI)
    nxt = np.roll(PI, -1, axis=0)
    e = nxt - PI
    h = np.arctan2(e[:, 1], e[:, 0])
    E = np.hypot(e[:, 0], e[:, 1])
    dl = np.array([wrap(h[i] - h[i - 1]) for i in range(n)])
    ths = LS / (2 * R)
    Xs, Ys = spiral_xy(LS, R, LS)
    p = Ys - R * (1 - np.cos(ths))
    k = Xs - R * np.sin(ths)
    Ts = (R + p) * np.tan(np.abs(dl) / 2) + k
    g = E - Ts - np.roll(Ts, -1)
    arc = np.abs(dl) - 2 * ths
    return h, E, dl, ths, Ts, g, arc

def sample(PI, R, ds):
    n = len(PI)
    h, E, dl, ths, Ts, g, arc = geometry(PI, R)
    pts = []
    for i in range(n):
        s = 1.0 if dl[i] > 0 else -1.0
        hin = h[i - 1]; hout = h[i]
        ts = PI[i] - Ts[i] * np.array([math.cos(hin), math.sin(hin)])
        # straight from previous ST to this TS is added by the previous element's end; here: spiral in, arc, spiral out
        nl = lambda a: np.array([-math.sin(a), math.cos(a)])
        d0 = np.array([math.cos(hin), math.sin(hin)])
        l = np.arange(0, LS + 1e-9, ds)
        x, y = spiral_xy(l, R[i], LS)
        si = ts[None, :] + np.outer(x, d0) + np.outer(s * y, nl(hin))
        sc = si[-1]
        hsc = hin + s * ths[i]
        cen = sc + s * R[i] * nl(hsc)
        a0 = math.atan2(sc[1] - cen[1], sc[0] - cen[0])
        sweep = s * arc[i]
        m = max(2, int(abs(sweep) * R[i] / ds))
        aa = a0 + np.linspace(0, sweep, m)
        ar = cen[None, :] + R[i] * np.stack([np.cos(aa), np.sin(aa)], axis=1)
        st = PI[i] + Ts[i] * np.array([math.cos(hout), math.sin(hout)])
        dO = np.array([math.cos(hout), math.sin(hout)])
        xo, yo = spiral_xy(l, R[i], LS)  # distance l measured from ST backwards
        so = (st[None, :] - np.outer(xo, dO) + np.outer(s * yo, nl(hout)))[::-1]
        pts += [si, ar, so]
        # straight to next TS
        nx = (i + 1) % n
        tsn = PI[nx] - Ts[nx] * np.array([math.cos(h[i]), math.sin(h[i])])
        L = np.hypot(*(tsn - st))
        m = max(2, int(L / ds))
        pts.append(st[None, :] + np.linspace(0, 1, m)[:, None] * (tsn - st)[None, :])
    return np.vstack(pts)

def resample(P, ds):
    P = np.vstack([P, P[:1]])
    seg = np.hypot(*np.diff(P, axis=0).T)
    c = np.concatenate([[0], np.cumsum(seg)])
    t = np.arange(0, c[-1], ds)
    return np.stack([np.interp(t, c, P[:, 0]), np.interp(t, c, P[:, 1])], axis=1)

def dp(P, tol):
    def rec(a, b):
        A, B = P[a], P[b]
        d = B - A
        L = np.hypot(*d)
        idx = np.arange(a + 1, b)
        if len(idx) == 0: return [a]
        dist = np.abs(d[0] * (P[idx, 1] - A[1]) - d[1] * (P[idx, 0] - A[0])) / L
        j = dist.argmax()
        if dist[j] > tol: return rec(a, idx[j]) + rec(idx[j], b)
        return [a]
    return rec(0, len(P) - 1) + [len(P) - 1]

def dp_closed(P, tol):
    far = int(np.hypot(*(P - P[0]).T).argmax())
    full = np.vstack([P, P[:1]])
    return dp(full[: far + 1], tol)[:-1] + [i + far for i in dp(full[far:], tol)[:-1]]

def fit(shape, N, tol0=None):
    dense = resample(shape, 5)
    sparse = resample(shape, 25)
    tree_dense = cKDTree(dense)
    # initial PIs: Douglas-Peucker, tolerance searched until N vertices remain
    lo, hi = 1.0, 1500.0
    for _ in range(40):
        mid = (lo + hi) / 2
        idx = dp_closed(dense, mid)
        if len(idx) > N: lo = mid
        else: hi = mid
    idx = dp_closed(dense, hi)
    PI0 = dense[idx]
    n = len(PI0)
    x0 = np.concatenate([PI0.ravel(), np.full(n, 1500.0)])
    lb = np.concatenate([np.full(2 * n, -1e5), np.full(n, RLIM)])
    ub = np.concatenate([np.full(2 * n, 1e5), np.full(n, 20000.0)])

    def resid(x):
        PI = x[:2 * n].reshape(n, 2); R = x[2 * n:]
        h, E, dl, ths, Ts, g, arc = geometry(PI, R)
        pen = []
        for i in range(n):
            gm = GSAME if (dl[i] * dl[(i + 1) % n] > 0) else GREV
            pen.append(max(0.0, gm - g[i]) * 20.0)
            pen.append(max(0.0, 0.05 - arc[i]) * 50000)
        al = sample(PI, R, 5)
        d1 = cKDTree(al).query(sparse)[0]
        al2 = al[np.linspace(0, len(al) - 1, 860).astype(int)]
        d2 = tree_dense.query(al2)[0]
        return np.concatenate([d1, d2, pen])
    r = least_squares(resid, x0, bounds=(lb, ub), loss='soft_l1', f_scale=20, max_nfev=200, x_scale=np.concatenate([np.full(2 * n, 100.0), np.full(n, 500.0)]))
    PI = r.x[:2 * n].reshape(n, 2); R = r.x[2 * n:]
    al = sample(PI, R, 5)
    dev = cKDTree(al).query(dense)[0]
    h, E, dl, ths, Ts, g, arc = geometry(PI, R)
    return PI, R, dev, g, dl, arc

if __name__ == '__main__':
    shape = np.array(json.load(open(sys.argv[1]))).reshape(-1, 2)
    if np.allclose(shape[0], shape[-1]): shape = shape[:-1]
    Ns = [int(sys.argv[2])] if len(sys.argv) > 2 else [8, 10, 12, 14, 16]
    for N in Ns:
        PI, R, dev, g, dl, arc = fit(shape, N)
        n = len(PI)
        bad = [i for i in range(n) if g[i] < (GSAME if dl[i] * dl[(i + 1) % n] > 0 else GREV) - 1e-6]
        print(f'N={n}: mean dev {dev.mean():.1f} m, p95 {np.percentile(dev, 95):.1f}, max {dev.max():.1f}; Rmin {R.min():.0f}; min arc {np.degrees(arc.min()):.1f} deg; straights below rule: {len(bad)}; min g {g.min():.0f}; turn signs {int((dl>0).sum())}+/{int((dl<0).sum())}-')
        np.save(f'/tmp/fit_{n}.npy', np.column_stack([PI, R]))
