"""STEP 21.7-2 pictures (read only). Run: python3 tools/centre-junction-geom-plot.py docs
Reads docs/centre_junction_geom.json (scripts/centre-junction-geom.ts), docs/centre_junction.json and docs/fit_chain/centre_fixed.json.
Writes docs/centre_junction_geom.png (whole map: roundabout size, T pocket fit, fix list),
       docs/centre_junction_geom_sheet.png (the 3 T types and the 2 roundabout sizes drawn TO SCALE, 1 m = 1 m),
       docs/centre_junction_geom_zoom.png (the R4-10 cluster N104 / N106 / N108 / N114 / N094 / N112 with true circle and pad sizes)."""
import json, math, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle, Polygon, Wedge
from matplotlib.lines import Line2D

D = sys.argv[1] if len(sys.argv) > 1 else 'docs'
G = json.load(open(f'{D}/centre_junction_geom.json'))
J = json.load(open(f'{D}/centre_junction.json'))
C = json.load(open(f'{D}/fit_chain/centre_fixed.json'))
K = G['constants']
COL = {'8': '#222222', '6': '#1f5fbf', '4': '#d62728', '2': '#2ca02c', 'C': '#8c564b', 'L': '#9467bd'}
LW = {'8': 2.4, '6': 1.6, '4': 1.3, '2': 0.7, 'C': 0.6, 'L': 0.6}
FIT = {'FULL': '#2ca02c', 'SHORT': '#ff7f0e', 'NO': '#d62728', '-': '#7f7f7f'}

# ---------- 1. whole map ----------
fig, ax = plt.subplots(figsize=(15, 15), dpi=110)
for l in C['lines']:
    if l.get('dropped'): continue
    c = str(l['cls']); ax.plot([p[0] for p in l['pts']], [p[1] for p in l['pts']], color=COL.get(c, '#999'), lw=LW.get(c, 0.6), alpha=0.5 if c in '2CL' else 0.85, zorder=1)
for r in G['roundabouts']:
    ax.scatter(r['x'], r['z'], marker='D', s=(60 if r['lanes'] == 2 else 30), c='#1f5fbf' if r['lanes'] == 2 else '#17becf', edgecolors='k', linewidths=0.5, zorder=3)
for t in G['tjunctions']:
    ax.scatter(t['x'], t['z'], marker='s' if t['kind'] == 'TA' else 'o', s=34, c=FIT[t['pocketFit']], edgecolors='k', linewidths=0.4, zorder=3)
for q in G['fixList']:
    multi = len(q['reasons']) > 1
    ax.scatter(q['x'], q['z'], s=210 if multi else 120, facecolors='none', edgecolors='red' if any(r.startswith('(d)') for r in q['reasons']) else 'magenta', linewidths=1.5, zorder=4)
    if multi: ax.annotate(q['id'], (q['x'], q['z']), xytext=(8, 8), textcoords='offset points', fontsize=7, color='red', weight='bold', zorder=6)
ax.set_aspect('equal'); ax.grid(alpha=0.2)
ax.set_title('STEP 21.7-2: roundabouts (diamond: cyan 1-lane ICD 30-35 m, blue 2-lane ICD 50 m), T nodes (circle = priority, square = signalised) coloured by right-turn pocket fit,\nrings = merged fix list (red: new geometry FAIL, magenta: only a / b / c of 21.7-1). Labels = nodes with 2 or more reasons', fontsize=9)
leg = [Line2D([], [], marker='D', color='w', markerfacecolor='#17becf', markeredgecolor='k', ms=8, label='roundabout 1-lane'), Line2D([], [], marker='D', color='w', markerfacecolor='#1f5fbf', markeredgecolor='k', ms=9, label='roundabout 2-lane'),
       Line2D([], [], marker='o', color='w', markerfacecolor=FIT['FULL'], markeredgecolor='k', ms=8, label='T, full pocket fits'), Line2D([], [], marker='o', color='w', markerfacecolor=FIT['SHORT'], markeredgecolor='k', ms=8, label='T, only 40 km/h pocket fits'),
       Line2D([], [], marker='o', color='w', markerfacecolor=FIT['NO'], markeredgecolor='k', ms=8, label='T, no pocket fits'), Line2D([], [], marker='o', color='w', markerfacecolor=FIT['-'], markeredgecolor='k', ms=8, label='T, no pocket (priority T)'),
       Line2D([], [], marker='o', color='w', markerfacecolor='none', markeredgecolor='red', ms=11, label='fix list (new in 21.7-2)'), Line2D([], [], marker='o', color='w', markerfacecolor='none', markeredgecolor='magenta', ms=11, label='fix list (21.7-1 only)')]
ax.legend(handles=leg, loc='lower left', fontsize=8)
fig.savefig(f'{D}/centre_junction_geom.png', bbox_inches='tight'); plt.close(fig)

# ---------- 2. standard sheet, to scale ----------
def road_h(ax, x0, x1, hw, col='#555'):  # horizontal road, half width hw, centre y=0
    ax.add_patch(Rectangle((x0, -hw), x1 - x0, 2 * hw, fc='#d9d9d9', ec=col, lw=0.8, zorder=1))
    ax.plot([x0, x1], [0, 0], color='white', lw=1, ls='--', zorder=2)

def t_sheet(ax, title, hw_maj, hw_min, R, pocket, slip, store, taper_, decel_):
    L = 260
    road_h(ax, -L, 60, hw_maj)
    ax.add_patch(Rectangle((-hw_min, -L / 3 * 0 - 120), 2 * hw_min, 120 - hw_maj, fc='#d9d9d9', ec='#555', lw=0.8, zorder=1))   # minor road to -y
    for sx in (-1, 1):   # kerb returns: grey square R x R minus the quarter circle of the kerb
        x_in = sx * hw_min; x_out = sx * (hw_min + R)
        sq = Rectangle((min(x_in, x_out), -hw_maj - R), R, R, fc='#d9d9d9', ec='none', zorder=1); ax.add_patch(sq)
        cc = Circle((x_out, -hw_maj - R), R, fc='white', ec='#555', lw=0.8, zorder=1.5); ax.add_patch(cc); cc.set_clip_path(sq)
    if pocket:  # eastbound traffic = NORTH half in left-hand traffic; the right-turn pocket is a lane next to the centre line, ending at the minor road
        tot = taper_ + decel_ + store
        ax.add_patch(Polygon([[-tot, 0], [-tot + taper_, 3.5], [0, 3.5], [0, 0]], closed=True, fc='#ffe0a3', ec='#c77700', lw=1, zorder=3))
        ax.annotate('', xy=(-tot, 12), xytext=(0, 12), arrowprops=dict(arrowstyle='<->', color='#c77700'))
        ax.text(-tot / 2, 15, f'right-turn pocket {tot:.0f} m = taper {taper_:.0f} + decel {decel_:.0f} + storage {store:.0f}', ha='center', fontsize=8, color='#c77700')
    if slip:
        ax.text(0, -hw_maj - R - 8, f'plus slip lane R {R:.0f} m, width {K["SLIP_W"]:.0f} m at both corners (length 42 m from 60 km/h)', ha='center', fontsize=8, color='#1f5fbf')
    ax.annotate('', xy=(-hw_min, -hw_maj - 2), xytext=(-hw_min - R, -hw_maj - 2), arrowprops=dict(arrowstyle='<->', color='k'))
    ax.text(-hw_min - R / 2, -hw_maj - 10, f'R {R:.0f}', ha='center', fontsize=8)
    ax.set_title(title, fontsize=9, loc='left'); ax.set_aspect('equal'); ax.set_xlim(-L, 60); ax.set_ylim(-70, 30); ax.axis('off')

fig = plt.figure(figsize=(16, 22), dpi=100)
gs = fig.add_gridspec(4, 2, height_ratios=[1, 1, 1, 1.5])
a1 = fig.add_subplot(gs[0, :]); a2 = fig.add_subplot(gs[1, :]); a3 = fig.add_subplot(gs[2, :])
t_sheet(a1, 'T signalised A x A, major R4 (V 60, approach 60): right-turn pocket 167 m, slip lanes R 25 m (R6 major: pocket 170 m)', 7, 7, 25, True, True, 30, 81, 56)
t_sheet(a2, 'T priority + right-turn pocket, major R4 (V 60): kerb R 15 m (minor R2 / C), R 10 m (minor L); pocket 152 m = taper 81 + decel 56 + storage 15 (R6 major V 80: 295 m)', 7, 3.3, 15, True, False, 15, 81, 56)
t_sheet(a3, 'T priority, no pocket: kerb R 12 m (R2 / C x R2 / C), R 10 m (one L street), R 8 m (L x L); sight 0.278 V 7.5 s = V40 83 m, V30 63 m', 3.3, 3.3, 12, False, False, 0, 0, 0)
for k, (lanes, icd, ttl) in enumerate([(1, 30, '1-lane, ICD 30 m (24 nodes; N084 35 m)\ncirc. width 5.5, entry 4.5, R 15 / 20, island 19 m'), (2, 50, '2-lane, ICD 50 m (13 nodes)\ncirc. width 9, entry 7, R 20 / 30, island 32 m')]):
    a = fig.add_subplot(gs[3, k]); cw = 5.5 if lanes == 1 else 9.0
    a.add_patch(Circle((0, 0), icd / 2, fc='#d9d9d9', ec='#555', lw=1)); a.add_patch(Circle((0, 0), icd / 2 - cw, fc='#a8d5a2', ec='#555', lw=1))
    ew = 4.5 if lanes == 1 else 7.0
    for ang in (0, 90, 180, 270):
        c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang)); n = (-s, c)
        P = [(c * (icd / 2 - 1) + n[0] * ew, s * (icd / 2 - 1) + n[1] * ew), (c * (icd / 2 + 25) + n[0] * ew, s * (icd / 2 + 25) + n[1] * ew), (c * (icd / 2 + 25) - n[0] * ew, s * (icd / 2 + 25) - n[1] * ew), (c * (icd / 2 - 1) - n[0] * ew, s * (icd / 2 - 1) - n[1] * ew)]
        a.add_patch(Polygon(P, fc='#d9d9d9', ec='#555', lw=1)); a.add_patch(Polygon([(c * (icd / 2 + 3) + n[0] * 1.5, s * (icd / 2 + 3) + n[1] * 1.5), (c * (icd / 2 + 22), s * (icd / 2 + 22)), (c * (icd / 2 + 3) - n[0] * 1.5, s * (icd / 2 + 3) - n[1] * 1.5)], fc='#a8d5a2', ec='#555', lw=0.6))
    a.set_xlim(-icd / 2 - 35, icd / 2 + 35); a.set_ylim(-icd / 2 - 35, icd / 2 + 35); a.set_aspect('equal'); a.set_title(ttl, fontsize=8, loc='left'); a.axis('off')
    a.annotate('', xy=(icd / 2, -icd / 2 - 8), xytext=(-icd / 2, -icd / 2 - 8), arrowprops=dict(arrowstyle='<->')); a.text(0, -icd / 2 - 20, f'ICD {icd} m', ha='center', fontsize=9)
fig.suptitle('STEP 21.7-2 standard sheet, drawn to scale (1 m = 1 m). Left-hand traffic: the pocket serves the RIGHT turn. All numbers from scripts/centre-junction-geom.ts', fontsize=11)
fig.savefig(f'{D}/centre_junction_geom_sheet.png', bbox_inches='tight'); plt.close(fig)

# ---------- 3. zoom: R4-10 cluster ----------
ids = {'N104', 'N106', 'N108', 'N114', 'N094', 'N112', 'N033', 'N034', 'N035', 'N113'}
nodes = {n['id']: n for n in J['nodes']}
pts = [(nodes[i]['x'], nodes[i]['z']) for i in ids if i in nodes]
x0 = min(p[0] for p in pts) - 120; x1 = max(p[0] for p in pts) + 120; z0 = min(p[1] for p in pts) - 120; z1 = max(p[1] for p in pts) + 120
fig, ax = plt.subplots(figsize=(11, 11 * (z1 - z0) / (x1 - x0)), dpi=110)
for l in C['lines']:
    if l.get('dropped'): continue
    c = str(l['cls']); xs = [p[0] for p in l['pts']]; zs = [p[1] for p in l['pts']]
    if max(xs) < x0 or min(xs) > x1 or max(zs) < z0 or min(zs) > z1: continue
    ax.plot(xs, zs, color=COL.get(c, '#999'), lw=LW.get(c, 0.6) * 2.2, alpha=0.8, zorder=1)
    k = len(xs) // 2
    ax.annotate(l['id'], (xs[k], zs[k]), fontsize=6, color=COL.get(c, '#999'))
for r in G['roundabouts']:
    if x0 < r['x'] < x1 and z0 < r['z'] < z1:
        ax.add_patch(Circle((r['x'], r['z']), r['icd'] / 2, fc='#bfe9f0', ec='k', lw=0.8, zorder=3)); ax.annotate(f"{r['id']} ICD {r['icd']}", (r['x'], r['z']), xytext=(10, 8), textcoords='offset points', fontsize=7, weight='bold')
for t in G['tjunctions']:
    if x0 < t['x'] < x1 and z0 < t['z'] < z1:
        ax.scatter(t['x'], t['z'], marker='s' if t['kind'] == 'TA' else 'o', s=40, c=FIT[t['pocketFit']], edgecolors='k', zorder=4)
        ax.annotate(f"{t['id']} {t['pocketFit']}" + (f" avail {t['avail']:.0f}/{(t['pocket'] or {}).get('total', 0):.0f}/{(t['pocketShort'] or {}).get('total', 0):.0f}" if t['pocket'] else ''), (t['x'], t['z']), xytext=(8, -12), textcoords='offset points', fontsize=7)
ax.set_xlim(x0, x1); ax.set_ylim(z0, z1); ax.set_aspect('equal'); ax.grid(alpha=0.25)
ax.set_title('R4-10 cluster: circles at true size; T label = pocket fit, "avail / full / short" in m (N104, N108, N114 do not fit even the short pocket)', fontsize=9)
fig.savefig(f'{D}/centre_junction_geom_zoom.png', bbox_inches='tight'); plt.close(fig)
print('wrote', D + '/centre_junction_geom.png', D + '/centre_junction_geom_sheet.png', D + '/centre_junction_geom_zoom.png')
