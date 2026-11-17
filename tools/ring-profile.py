# STEP 3.2-3.5: grade line (vertical profile) of the ring + cut and fill volumes.  python3 tools/ring-profile.py <grid.json> <out-dir>
# Input: ring_ground_grid.json (scripts/ring-profile-export.ts). Everything in metres.
import json, sys, math
import numpy as np
grid = json.load(open(sys.argv[1])); out = sys.argv[2]
G = np.array(grid['g']); W = np.array(grid['w']); OFF = np.array(grid['off'], float); L = grid['length']; STEP = grid['step']
n = G.shape[0]; ci = int(np.where(OFF == 0)[0][0])
E_HALF = 24.2   # formation half width: pavement edge 22.1 + guardrail 0.6 + verge/ditch 1.5 (table 3.5)
# --- side slopes. FILL 1:3 (3.7). CUT: 1:2 for the first 8 m of height, then 8 m tiers at 1:1.5 with a 2 m bench (3.10 high-cut rule)
def cut_h(r):   # height above formation reached at horizontal distance r from the formation edge
    r = np.asarray(r, float); h = np.where(r <= 16, r / 2, 0.0)
    rr = np.maximum(r - 16, 0); t = np.floor(rr / 14); rem = rr - t * 14
    hh = 8 + 8 * t + np.where(rem < 2, 0, np.minimum(8, (rem - 2) / 1.5))
    return np.where(r <= 16, h, hh)
def areas(gp, y):
    """cut and fill area (m2) of ONE cross-section with ground row gp (offsets OFF) and formation level y. Returns cut, fill, cut depth at centre."""
    cut = fill = 0.0
    for sgn in (-1, 1):
        idx = [i for i, o in enumerate(OFF) if sgn * o >= 0]; idx.sort(key=lambda i: abs(OFF[i]))
        xs = np.array([abs(OFF[i]) for i in idx]); gs = gp[idx]
        # inside the formation
        for k in range(len(xs) - 1):
            if xs[k] >= E_HALF: break
            x0, x1 = xs[k], min(xs[k + 1], E_HALF)
            d0, d1 = gs[k] - y, np.interp(x1, xs, gs) - y
            if d0 * d1 >= 0:
                a = (abs(d0) + abs(d1)) / 2 * (x1 - x0)
                if d0 + d1 > 0: cut += a
                else: fill += a
            else:
                t = d0 / (d0 - d1); a0 = abs(d0) * t * (x1 - x0) / 2; a1 = abs(d1) * (1 - t) * (x1 - x0) / 2
                if d0 > 0: cut += a0; fill += a1
                else: fill += a0; cut += a1
        # side slope beyond the formation edge
        xe = np.arange(E_HALF, 70.01, 0.5); ge = np.interp(xe, xs, gs); r = xe - E_HALF
        if np.interp(E_HALF, xs, gs) - y >= 0:   # cut side: daylight where ground drops to the slope line
            top = y + cut_h(r); inside = ge > top
            k = np.argmax(~inside) if (~inside).any() else len(xe) - 1
            cut += float(np.sum((ge[:k] - top[:k]) * 0.5))
        else:
            top = y - r / 3; inside = ge < top
            k = np.argmax(~inside) if (~inside).any() else len(xe) - 1
            fill += float(np.sum((top[:k] - ge[:k]) * 0.5))
    return cut, fill
# --- DP over grade line nodes every 60 m.  Level step Q = 0.48 m  ->  0.8 % per node; max grade 5 steps = 4.0 % ; grade change 1 step per node -> K = 60/0.8 = 75 (needs crest 51, sag 44 at V100)
SP = 60; Q = 0.48; NN = int(round(L / SP)); GM = 5
lo = math.floor((G.min() - 5) / Q); hi = math.ceil((G.max() + 25) / Q); NL = hi - lo + 1
levels = (np.arange(NL) + lo) * Q
# bridge floor: where the ROW is wet, the formation must be at least water + 3 m (freeboard + deck)
def node_cost(i):
    s = i * SP; j = min(int(round(s / STEP)), n - 1)
    gp = G[j]; c = np.zeros(NL)
    # fast cost: area between ground and level inside the formation + side slope terms (m_cut/2*d^2, m_fill/2*d^2)
    xs = OFF; sel = np.abs(xs) <= E_HALF; xx = xs[sel]; gg = gp[sel]
    dd = gg[None, :] - levels[:, None]
    base = np.trapezoid(np.abs(dd), xx, axis=1)
    ge = np.array([np.interp(-E_HALF, OFF, gp), np.interp(E_HALF, OFF, gp)])
    de = ge[None, :] - levels[:, None]
    c = base + (np.maximum(de, 0) ** 2 * 1.2).sum(1) + (np.maximum(-de, 0) ** 2 * 1.5).sum(1)
    # deep cuts and tall fills cost much more per m3 (haul, benching, walls): quadratic weight
    cd = np.maximum(gp[ci] - levels, 0); fd = np.maximum(levels - gp[ci], 0)
    c = c + 0.6 * cd ** 2 + 0.9 * fd ** 2
    ww = W[max(j - 6, 0):j + 7]; wet = ww[ww > -900]
    if wet.size: c = c + np.where(levels < wet.max() + 3.0, 1e6, 0)
    return c
C = np.array([node_cost(i) for i in range(NN)])
NG = 2 * GM + 1; gvals = np.arange(-GM, GM + 1)
LAPS = 4; T = NN * LAPS
INF = 1e18
cost = np.full((NL, NG), INF); ground0 = int(np.argmin(np.abs(levels - G[0, ci])))
cost[:, :] = 0
back = np.zeros((T, NL, NG, 2), dtype=np.int16)
for t in range(1, T):
    new = np.full((NL, NG), INF); bl = np.zeros((NL, NG), dtype=np.int16); bg = np.zeros((NL, NG), dtype=np.int16)
    for gi in range(NG):          # new grade index gi
        g = gvals[gi]
        best = np.full(NL, INF); bgi = np.zeros(NL, dtype=np.int16)
        for dg in (-1, 0, 1):     # previous grade index
            pj = gi - dg
            if pj < 0 or pj >= NG: continue
            prev = cost[:, pj]
            # level now = level prev + g steps  ->  prev level = now - g
            shifted = np.full(NL, INF)
            if g >= 0: shifted[g:] = prev[:NL - g] if g > 0 else prev
            else: shifted[:g] = prev[-g:]
            cand = shifted + (0.02 * abs(g) ** 2 + 0.05 * abs(dg))
            best = np.where(cand < best, cand, best); bgi = np.where(cand < best + 1e-9, pj, bgi)
        new[:, gi] = best + C[t % NN]
        bg[:, gi] = bgi
    cost = new; back[t, :, :, 1] = bg
    # store level back implicitly: prev level = level - g
# best end state and trace back
lv, gi = np.unravel_index(np.argmin(cost), cost.shape)
path = [(lv, gi)]
for t in range(T - 1, 0, -1):
    pj = back[t, lv, gi, 1]; lv = lv - gvals[gi]; gi = pj; path.append((lv, gi))
path.reverse()
lvl = np.array([levels[p[0]] for p in path])
# take the 3rd lap and report the closure gap against the 4th lap
lap = lambda k: lvl[k * NN:(k + 1) * NN]
nodes = lap(2); gap = float(np.max(np.abs(lap(2) - lap(3))))
print(f'grade-line nodes {NN} every {SP} m, level step {Q} m, closure gap between lap 3 and lap 4: {gap:.2f} m')
# final profile: nodes -> every 10 m, linear + 120 m moving average (vertical curves), exactly periodic
def period_interp(s):
    f = (s / SP) % NN; i0 = int(math.floor(f)); t = f - i0
    return nodes[i0 % NN] * (1 - t) + nodes[(i0 + 1) % NN] * t
y = np.array([period_interp(i * STEP) for i in range(n)])
k = 6; ys = np.array([np.mean([y[(i + d) % n] for d in range(-k, k + 1)]) for i in range(n)])
y = ys
gr = np.array([(y[(i + 1) % n] - y[i - 1]) / (2 * STEP) * 100 for i in range(n)])
# earthwork
cutA = np.zeros(n); fillA = np.zeros(n)
for i in range(n): cutA[i], fillA[i] = areas(G[i], y[i])
cutV = cutA * STEP; fillV = fillA * STEP
depth = G[:, ci] - y   # + = cut at the centreline, - = fill
res = dict(length=L, step=STEP, y=y.tolist(), ground=G[:, ci].tolist(), grade=gr.tolist(), cutA=cutA.tolist(), fillA=fillA.tolist(), depth=depth.tolist())
json.dump(res, open(f'{out}/ring_profile.json', 'w'))
import csv
with open(f'{out}/ring_profile.csv', 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['station_m', 'ground_m', 'design_m', 'depth_m(+cut/-fill)', 'grade_pct', 'cut_area_m2', 'fill_area_m2'])
    for i in range(n): w.writerow([i * STEP, f'{G[i, ci]:.2f}', f'{y[i]:.2f}', f'{depth[i]:.2f}', f'{gr[i]:.2f}', f'{cutA[i]:.1f}', f'{fillA[i]:.1f}'])
print(f'max |grade| {np.abs(gr).max():.2f} %   mean {np.abs(gr).mean():.2f} %   share above 3 % {100*np.mean(np.abs(gr)>3):.1f} %')
tot_c, tot_f = cutV.sum(), fillV.sum()
print(f'TOTAL CUT {tot_c/1e6:.2f} million m3   TOTAL FILL {tot_f/1e6:.2f} million m3   net (cut - fill) {(tot_c-tot_f)/1e6:.2f} million m3')
# ranges
def rng(mask, name, val, unit):
    runs = []; i = 0
    while i < n:
        if mask[i]:
            j = i
            while j + 1 < n and mask[j + 1]: j += 1
            m = i + int(np.argmax(np.abs(val[i:j + 1]))); runs.append((i * STEP, j * STEP + STEP, val[m], m * STEP)); i = j + 1
        else: i += 1
    print(f'\n{name}')
    if not runs: print('  none')
    for a, b, v, at in runs: print(f'  station {a:6.0f} - {b:6.0f}  {b-a:5.0f} m   max {abs(v):5.1f} {unit} at {at:.0f}')
    return runs
rng(depth > 12, 'DEEP CUT: centreline more than 12 m below the ground (3.7 limit; user decision = cut it)', depth, 'm deep')
rng(depth > 30, 'VERY DEEP CUT over 30 m', depth, 'm deep')
rng(-depth > 7, 'TALL FILL: more than 7 m above the ground (3.7 limit)', depth, 'm high')
rng(np.abs(gr) > 3, 'GRADE ABOVE 3 % (desirable limit; hard limit 4 %)', gr, '%')
# volumes by chunk of ring
print('\nCUT / FILL PER 1 km OF RING (million m3)')
for a in range(0, int(L), 1000):
    i0, i1 = a // STEP, min((a + 1000) // STEP, n)
    print(f'  {a/1000:4.0f}-{min(a+1000, L)/1000:5.1f} km   cut {cutV[i0:i1].sum()/1e6:7.3f}   fill {fillV[i0:i1].sum()/1e6:7.3f}   max depth {depth[i0:i1].max():6.1f} / {depth[i0:i1].min():6.1f} m')
# bridges needed: water on centreline or fill height > 7 over water
wc = [i for i in range(n) if W[i, ci] > -900 and W[i, ci] > G[i, ci] + 0.05]
print('\nWATER STRETCHES (bridge): design height above the water level')
runs = []; i = 0
while i < len(wc):
    j = i
    while j + 1 < len(wc) and wc[j + 1] - wc[j] <= 3: j += 1
    a, b = wc[i], wc[j]; wl = max(W[a:b + 1, ci]); runs.append((a, b)); print(f'  station {a*STEP:6.0f} - {b*STEP+STEP:6.0f}  {(b-a)*STEP+STEP:4.0f} m   water {wl:5.1f} m   road {max(y[a:b+1]):5.1f} m   clearance {min(y[a:b+1])-wl:4.1f} m'); i = j + 1
# picture
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
fig, ax = plt.subplots(3, 1, figsize=(18, 11), sharex=True)
st = np.arange(n) * STEP
ax[0].fill_between(st, 0, G[:, ci], color='#c9b48a', label='natural ground'); ax[0].plot(st, y, color='#d62728', lw=1.6, label='designed road level')
ax[0].fill_between(st, G[:, ci], y, where=y < G[:, ci], color='#ff7f0e', alpha=.55, label='CUT'); ax[0].fill_between(st, G[:, ci], y, where=y >= G[:, ci], color='#2ca02c', alpha=.55, label='FILL')
ax[0].set_ylabel('height (m)'); ax[0].legend(loc='upper right'); ax[0].set_title('Ring road long section: natural ground, designed level, cut and fill')
ax[1].plot(st, gr, color='k', lw=.8); ax[1].axhline(4, color='r', ls='--'); ax[1].axhline(-4, color='r', ls='--'); ax[1].axhline(3, color='orange', ls=':'); ax[1].axhline(-3, color='orange', ls=':'); ax[1].set_ylabel('road grade (%)')
ax[2].fill_between(st, 0, cutA, color='#ff7f0e', label='cut area (m2)'); ax[2].fill_between(st, 0, -fillA, color='#2ca02c', label='fill area (m2, plotted down)'); ax[2].set_ylabel('cross-section area (m2)'); ax[2].set_xlabel('ring station (m)'); ax[2].legend(loc='upper right')
for a in ax:
    a.grid(alpha=.3)
    for x, d in ((10143, 'N'), (15382, 'E'), (500, 'S'), (4709, 'W')): a.axvline(x, color='purple', ls=':')
plt.tight_layout(); plt.savefig(f'{out}/ring_profile.png', dpi=100)
