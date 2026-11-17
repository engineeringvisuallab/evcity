# Plots docs/m8_stack_plan.json (written by scripts/m8-stack-check.ts) -> docs/m8_stack_plan.png. Run: python3 tools/m8-stack-plot.py
import json, numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
D, UF, SL, LO = 9.5, 400.0, 589.0, 12.0
def spread(t):
    x = np.clip((np.abs(t) - UF) / SL, 0, 1); return D * (1 - x * x * (3 - 2 * x))
R = json.load(open('docs/m8_stack_plan.json'))
fig, ax = plt.subplots(1, 2, figsize=(16, 8))
t = np.linspace(-900, 900, 600)
for a, lim in zip(ax, (900, 330)):
    for s in (1, -1):
        o = s * (LO + spread(t))
        lw = 14.6 * 380 / (2 * lim); a.plot(t, o, color='#ccc', lw=lw, solid_capstyle='butt', zorder=0); a.plot(-o, t, color='#ccc', lw=lw, solid_capstyle='butt', zorder=0)
    sc = None
    for r in R:
        sc = a.scatter(r['u'], r['v'], c=r['y'], s=6 if lim > 500 else 14, cmap='viridis', vmin=0, vmax=20.7)
        i = len(r['u']) // 2 if False else int(len(r['u']) * 0.45)
        a.annotate(r['id'], (r['u'][i], r['v'][i]), fontsize=9, weight='bold', bbox=dict(fc='w', ec='none', alpha=.8, pad=1))
    a.set_xlim(-lim, lim); a.set_ylim(-lim, lim); a.set_aspect('equal'); a.grid(alpha=.2)
ax[0].set_title('J1 stack, exit run 200 m / entry tail 390 m (height colour)')
ax[1].set_title('zoom: centre 660 x 660 m')
fig.colorbar(sc, ax=ax[0], shrink=.8, label='height above A (m)')
fig.savefig('docs/m8_stack_plan.png', dpi=100, bbox_inches='tight')
