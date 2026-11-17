# STEP 21.4b RIM LINES: R2 / C / L only. A station is BAD when the finished level is more than 25 m under the ground (tunnel) or more than 25 m over it (high viaduct), runs of 40 m (cut) / 60 m (fill) or more.
# Decision (AI engineering, user: "you solve"): no tunnel and no 25 m viaduct on a local road. The line is cut back to the good part = dead end (R5 / user rule: dead ends stay).
#   line WITH nodes (end of another line on it): cut only the end pieces that lie outside every node (no connection is lost); a bad run in the middle stays and is listed.
#   line WITHOUT nodes: the longest good piece is kept; under 100 m the line is DROPPED (flag 'dropped').
# Run after tools/centre-fillet.py and scripts/centre-profile.ts, before tools/centre-fixed-export.py. Reads docs/centre_fixed_pre_rim.json + docs/centre_profile_pre_rim.json (first-run copies), writes docs/centre_fixed.json.
import json, math
J = json.load(open('docs/centre_fixed_pre_rim.json')); P = {l['id']: l for l in json.load(open('docs/centre_profile_pre_rim.json'))['lines']}
H = math.hypot; DS = 10; TUN = 25; HIGH = 25; MINCUT = 40; MINFILL = 60; MARG = 2; KEEPMIN = 100
def dseg(p, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]; t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / ((dx * dx + dz * dz) or 1))); return H(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz)
def dline(p, l): return min(dseg(p, a, b) for a, b in zip(l['pts'], l['pts'][1:]))
def runs(flag, minlen):
    out = []; r = None
    for k, f in enumerate(flag + [False]):
        if f and r is None: r = k
        if not f and r is not None:
            if (k - r) * DS >= minlen: out.append((r, k))
            r = None
    return out
res = []; L = {l['id']: l for l in J['lines']}
for lid, p in P.items():
    l = L[lid]
    if l['cls'] not in ('2', 'C', 'L') or l['built']: continue
    g, h = p['g'], p['h']; n = len(g)
    bad = [False] * n
    for a, b in runs([g[k] - h[k] > TUN for k in range(n)], MINCUT) + runs([h[k] - g[k] > HIGH for k in range(n)], MINFILL):
        for k in range(a, b): bad[k] = True
    if not any(bad): continue
    nodes = []
    for o in J['lines']:
        if o['id'] == lid: continue
        for e in (o['pts'][0], o['pts'][-1]):
            if dline(e, l) < 15: nodes.append(min(range(n), key=lambda k: H(p['x'][k] - e[0], p['z'][k] - e[1])))
    if not nodes:
        good = []; r = None
        for k, f in enumerate(bad + [True]):
            if not f and r is None: r = k
            if f and r is not None: good.append((r, k)); r = None
        good = [(a + MARG, b - MARG) for a, b in good if (b - a - 2 * MARG) * DS >= KEEPMIN]
        if not good: l['dropped'] = True; res.append(f'{lid:7} {l["cls"]} len {(n-1)*DS} m: NO good piece of 100 m, line DROPPED'); continue
        a, b = max(good, key=lambda q: q[1] - q[0]); mid = []
    else:
        lo, hi = min(nodes), max(nodes)
        bs = [k for k in range(n) if bad[k] and k < lo - MARG]; be = [k for k in range(n) if bad[k] and k > hi + MARG]
        a = (max(bs) + MARG + 1) if bs else 0; b = (min(be) - MARG) if be else n - 1
        mid = [k for k in range(a, b + 1) if bad[k]]
    if (b - a) * DS < KEEPMIN:
        l['dropped'] = True; res.append(f'{lid:7} {l["cls"]} len {(n-1)*DS} m: only {(b-a)*DS} m would be left between the bad runs / nodes, line DROPPED (nodes on it: {len(nodes)})'); continue
    # cut the polyline to stations a..b (station k = k * 10 m along the line)
    pts = l['pts']; cum = [0.0]
    for q, r in zip(pts, pts[1:]): cum.append(cum[-1] + H(r[0] - q[0], r[1] - q[1]))
    def at(s):
        s = max(0, min(cum[-1], s))
        for i in range(len(pts) - 1):
            if cum[i + 1] >= s:
                f = (s - cum[i]) / ((cum[i + 1] - cum[i]) or 1e-9); return [pts[i][0] + f * (pts[i + 1][0] - pts[i][0]), pts[i][1] + f * (pts[i + 1][1] - pts[i][1])]
        return list(pts[-1])
    s0, s1 = a * DS, min(b * DS, cum[-1])
    if a == 0 and b == n - 1: res.append(f'{lid:7} {l["cls"]} len {(n-1)*DS} m: bad run in the MIDDLE with nodes on both sides, unchanged (listed): ' + ', '.join(f'{x*DS}-{y*DS}' for x, y in runs([bad[k] for k in range(n)], 10))); continue
    new = [at(s0)] + [q for i, q in enumerate(pts) if s0 < cum[i] < s1] + [at(s1)]
    l['pts'] = new; l.setdefault('notes', []).append(f'21.4b rim: kept s {s0:.0f}-{s1:.0f} of {cum[-1]:.0f} m (dead end)')
    res.append(f'{lid:7} {l["cls"]} len {(n-1)*DS} m -> kept s {s0:.0f}-{s1:.0f} ({s1-s0:.0f} m, cut {cum[-1]-(s1-s0):.0f} m), nodes kept {len(nodes)}' + (f', bad middle left {len(mid)*DS} m' if mid else ''))
J['rim_note'] = 'STEP 21.4b rim cut-back applied by tools/centre-rim.py'
json.dump(J, open('docs/centre_fixed.json', 'w'))
print('\n'.join(res)); print(sum('DROPPED' in r for r in res), 'dropped,', len(res), 'lines touched')
