import json, numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
d = json.load(open('/tmp/j6.json'))
T = np.array(d['terrain'])  # rows u, cols v
us = np.arange(-400, 401, 8)
fig, ax = plt.subplots(figsize=(10, 10))
# plot with u horizontal, v vertical
ax.contourf(us, us, T.T, levels=np.arange(-20, 62, 2), cmap='terrain', alpha=.6)
cs = ax.contour(us, us, T.T, levels=np.arange(-20, 62, 4), colors='k', linewidths=.3)
ax.clabel(cs, fontsize=6)
col = {'5': ('#333', 25), '24': ('#1565c0', 9.6), '25': ('#e67e22', 9.6), '33': ('#2e7d32', 9.6)}
for k, r in d['roads'].items():
    p = np.array(r['pts'])
    if len(p) == 0: continue
    c, w = col.get(k, ('#888', 5))
    ax.plot(p[:, 0], p[:, 1], color=c, lw=w * 0.5, label=f"{k} {r['name']}", solid_capstyle='butt')
    b = p[p[:, 3] >= 0]
    if len(b): ax.plot(b[:, 0], b[:, 1], color='red', lw=w * 0.5 + 1, alpha=.5)
po = np.array(d['padOutline']); ax.plot(np.r_[po[:, 0], po[0, 0]], np.r_[po[:, 1], po[0, 1]], 'm-', lw=1)
ax.set_aspect('equal'); ax.set_xlim(-400, 400); ax.set_ylim(-400, 400); ax.grid(alpha=.3)
ax.set_xlabel('u along F6 (m)'); ax.set_ylabel('v across (m)'); ax.legend(loc='upper left'); ax.set_title('J6 existing (bridges red); contours relative to pad y=33.7')
plt.savefig('/tmp/j6-plan.png', dpi=80)
