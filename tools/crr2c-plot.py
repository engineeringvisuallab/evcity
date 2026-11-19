# STEP CRR-2c picture: for each of the 5 lines the CRR-2b loop (asphalt 23 m wide) around its leave point with the own rail piers; red = the pier stands closer than 14.7 m to the loop centreline (inside asphalt / shoulder / too close), green = ok.
# Run: python3 tools/crr2c-plot.py docs      (needs docs/crr2c_geo.json from scripts/crr2c-geo.ts) -> docs/crr2c_piers.png
import json, math, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
d = sys.argv[1] if len(sys.argv) > 1 else 'docs'
G = json.load(open(d + '/crr2c_geo.json'))['lines']
HALF, CLR = 11.5, 14.7
def dist_poly(x, z, P, start=0):
    m = 1e9
    for k in range(start, len(P) - 1):
        vx, vz = P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]
        l2 = vx * vx + vz * vz or 1
        t = max(0, min(1, ((x - P[k][0]) * vx + (z - P[k][1]) * vz) / l2))
        m = min(m, math.hypot(x - P[k][0] - t * vx, z - P[k][1] - t * vz))
    return m
fig, axs = plt.subplots(2, 3, figsize=(17, 11))
axs = axs.ravel()
summary = {}
for ax, (id, L) in zip(axs, G.items()):
    P = L['loop']
    # asphalt band
    left, right = [], []
    for i in range(len(P)):
        a, b = P[max(0, i - 1)], P[min(len(P) - 1, i + 1)]
        l = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
        nx, nz = -(b[1] - a[1]) / l, (b[0] - a[0]) / l
        left.append((P[i][0] + nx * HALF, P[i][1] + nz * HALF)); right.append((P[i][0] - nx * HALF, P[i][1] - nz * HALF))
    poly = left + right[::-1]
    ax.fill([p[0] for p in poly], [p[1] for p in poly], color='#9aa0a6', alpha=0.55, lw=0, label='loop asphalt (23 m)')
    ax.plot([p[0] for p in P], [p[1] for p in P], color='#202124', lw=1, label='loop centreline')
    ax.plot([p[0] for p in L['rail']], [p[1] for p in L['rail']], color='#1a73e8', lw=1.2, ls='--', label='rail centreline')
    bad = 0
    for q in L['piers']:
        after = q['s'] > L['st'] + 0.01
        dd = dist_poly(q['x'], q['z'], P, 0 if after else 12)
        ok = dd >= CLR
        bad += 0 if ok else 1
        ax.add_patch(plt.Rectangle((q['x'] - 1.6, q['z'] - 1.6), 3.2, 3.2, color='#188038' if ok else '#d93025', zorder=5))
        ax.annotate(f"s{q['s']:.0f}\n{dd:.1f} m", (q['x'], q['z']), textcoords='offset points', xytext=(5, 5), fontsize=7, color='#188038' if ok else '#d93025')
    ax.plot([P[0][0]], [P[0][1]], 'k*', ms=12, label=f"leave s {L['st']:.0f}")
    ax.set_aspect('equal'); ax.set_title(f"{id}: loop leaves at s {L['st']:.0f} (R {L['R']}), {bad} pier(s) closer than {CLR} m", fontsize=10)
    ax.grid(alpha=0.25); ax.legend(fontsize=7, loc='best')
    xs = [p[0] for p in P[:60]] + [q['x'] for q in L['piers']]; zs = [p[1] for p in P[:60]] + [q['z'] for q in L['piers']]
    ax.set_xlim(min(xs) - 25, max(xs) + 25); ax.set_ylim(min(zs) - 25, max(zs) + 25)
    summary[id] = bad
axs[-1].axis('off')
axs[-1].text(0, 0.9, 'CRR-2c: own rail piers vs the CRR-2b loops\n\nred square = pier centre closer than 14.7 m\n(11.5 loop half + 1.6 pier half + 1.6 gap)\nto the loop centreline\ngreen = ok\n\npiers before the leave point are in the median\nof the rail part (6.4 m) and are only tested\nagainst the loop beyond 60 m of arc.', fontsize=10, va='top')
plt.tight_layout(); plt.savefig(d + '/crr2c_piers.png', dpi=110)
print('piers too close:', summary, 'total', sum(summary.values()))
