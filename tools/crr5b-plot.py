# STEP CRR-5b picture: plan of the 12 corridor pieces (blue = along the rail with the 6.4 m pier median, orange = loop), existing roads grey, rail dashed, rail piers standing IN loop asphalt = red x;
# below: surface profile of each line (road y, natural ground, rail clearance cap). Run: python3 tools/crr5b-plot.py docs   (needs docs/crr5b_geo.json from scripts/crr-check.ts)
import json, sys, math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
d = sys.argv[1] if len(sys.argv) > 1 else 'docs'
G = json.load(open(d + '/crr5b_geo.json'))
fig = plt.figure(figsize=(15, 15))
ax = fig.add_axes([0.04, 0.34, 0.92, 0.64])
for r in G['existing']:
    ax.plot(r['x'], r['z'], color='#bbbbbb', lw=1.6 if r['lanes'] >= 6 else 0.7, zorder=1)
for e in G['rail']:
    p = e['pts']
    ax.plot([q[0] for q in p], [q[1] for q in p], color='#444444', lw=0.8, ls='--', zorder=2)
for p in G['pieces']:
    c = '#1f6fd1' if p['kind'] == 'rail' else '#ee7d12'
    ax.plot(p['x'], p['z'], color=c, lw=3.2, zorder=3, solid_capstyle='butt')
    m = len(p['x']) // 2
    ax.annotate(p['name'].replace('CRR-', ''), (p['x'][m], p['z'][m]), fontsize=8, color=c, xytext=(6, 6), textcoords='offset points', zorder=5)
if G['pierInAsphalt']:
    ax.plot([q[0] for q in G['pierInAsphalt']], [q[1] for q in G['pierInAsphalt']], 'x', color='red', ms=9, mew=2, zorder=6, label='rail pier IN loop asphalt (%d)' % len(G['pierInAsphalt']))
    ax.legend(loc='lower left')
ax.set_aspect('equal'); ax.set_xlim(-950, 700); ax.set_ylim(1000, -420); ax.grid(alpha=0.25)
ax.set_title('CRR-5b: 12 corridor road pieces in the game (flag Config.roads.corridorRoads, default OFF).  blue = along the rail (pier row = median 6.4 m), orange = loop (R4 median)')
lines = ['S1', 'N1', 'E1', 'WNW', 'WSW']
for k, ln in enumerate(lines):
    a = fig.add_axes([0.05 + k * 0.19, 0.06, 0.165, 0.22])
    s0 = 0
    for p in [q for q in G['pieces'] if q['name'].startswith('CRR-' + ln + '-')]:
        L = [0.0]
        for i in range(1, len(p['x'])):
            L.append(L[-1] + math.hypot(p['x'][i] - p['x'][i - 1], p['z'][i] - p['z'][i - 1]))
        s = [s0 + v for v in L]
        a.plot(s, p['ground'], color='#2e8b3a', lw=1, label='natural ground' if s0 == 0 else None)
        a.plot(s, p['y'], color='#000000', lw=1.6, label='road surface' if s0 == 0 else None)
        if p['cap']:
            a.plot(s, p['cap'], color='#d11f1f', lw=1, ls=':', label='max for 7.0 m under the rail' if s0 == 0 else None)
        s0 = s[-1]
    a.set_title(ln, fontsize=9); a.grid(alpha=0.25); a.set_xlabel('m along the road')
    if k == 0:
        a.set_ylabel('height m'); a.legend(fontsize=6)
fig.savefig(d + '/crr5b_roads.png', dpi=80)
print('written', d + '/crr5b_roads.png')
