# picture of CRR-1: python3 tools/city-rail-road-plot.py docs
import json, sys
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
d = sys.argv[1] if len(sys.argv) > 1 else 'docs'
R = json.load(open(d + '/city_rail_road_reach.json')); C = json.load(open(d + '/city_rail_road_ctx.json'))
fig, ax = plt.subplots(figsize=(11, 12))
for x, z in C['water']: ax.add_patch(plt.Rectangle((x, z), C['cell'], C['cell'], color='#42a5f5', lw=0))
for r in C['roads']:
    xs = [p[0] for p in r['p']]; zs = [p[1] for p in r['p']]
    if r['lanes'] >= 6: ax.plot(xs, zs, color='#b71c1c', lw=2)
    else: ax.plot(xs, zs, color='#9e9e9e', lw=0.8)
for ln in C['rail']:
    ax.plot([p[0] for p in ln], [p[1] for p in ln], color='#222', lw=1, ls=':')
col = {'south-1': '#00897b', 'north-1': '#6a1b9a', 'east-1': '#ef6c00', 'west-nw': '#1565c0', 'west-sw': '#c2185b'}
for k, v in R['lines'].items():
    # CRR-1b: the road is drawn in PARTS (split at the junctions with big roads)
    for part in v.get('parts', [{'path': v['path']}]):
        p = part['path']; ax.plot([a[0] for a in p], [a[1] for a in p], color=col[k], lw=7, alpha=.45, solid_capstyle='butt')
    for j in v.get('junctions', []):
        ax.plot(j['x'], j['z'], '*', color='gold', mec='k', ms=17, zorder=5)
        ax.annotate(f"{j['road']} s{j['s']} {'PASS' if j['pierOk'] else 'FAIL'}", (j['x'], j['z']), textcoords='offset points', xytext=(10, -4), fontsize=8, weight='bold', zorder=6)
    for n in v['nodes']:
        if n['lanes'] < 6: ax.plot(n['x'], n['z'], 'o', mfc='white', mec=col[k], ms=7, zorder=5)
    ax.plot(*v['endPoint'], 's', color=col[k], mec='k', ms=9)
    ax.annotate(f"{k}\n{v['reach']} m (END: {v['why']})", v['endPoint'], textcoords='offset points', xytext=(8, 8), fontsize=8, weight='bold')
    n = v['nearestSmallRoad']; ax.plot([v['endPoint'][0], n['x']], [v['endPoint'][1], n['z']], '--', color=col[k], lw=1)
ax.set_xlim(-800, 800); ax.set_ylim(1000, -600); ax.set_aspect('equal'); ax.grid(alpha=.3)
ax.set_title('CRR-1b: 4-lane road along the rail (pier row = median). star = junction with 8-lane road (road splits), circle = small road node, square = END (water / low rail), dashed = nearest small road')
fig.savefig(d + '/city_rail_road_reach.png', dpi=110, bbox_inches='tight')

# CRR-2: loops (best candidate of each line), drawn over the CRR-1 picture
import os
if os.path.exists(d + '/city_rail_road_loops.json') and json.load(open(d + '/city_rail_road_loops.json')).get('reach') == R.get('version'):
    Lp = json.load(open(d + '/city_rail_road_loops.json'))
    fig, ax = plt.subplots(figsize=(11, 12))
    for x, z in C['water']: ax.add_patch(plt.Rectangle((x, z), C['cell'], C['cell'], color='#42a5f5', lw=0))
    for r in C['roads']:
        xs = [p[0] for p in r['p']]; zs = [p[1] for p in r['p']]
        ax.plot(xs, zs, color='#b71c1c' if r['lanes'] >= 6 else '#9e9e9e', lw=2 if r['lanes'] >= 6 else 0.8)
    for ln in C['rail']: ax.plot([p[0] for p in ln], [p[1] for p in ln], color='#222', lw=1, ls=':')
    for k, v in Lp['lines'].items():
        if not v['good']: continue
        g = v['good'][0]; R1k = R['lines'][k]
        along = R1k['path'][:max(2, int((g['st'] - R1k['start']) / 10) + 1)]
        ax.plot([a[0] for a in along], [a[1] for a in along], color=col[k], lw=8, alpha=.5, solid_capstyle='butt')
        ax.plot([a[0] for a in g['path']], [a[1] for a in g['path']], color=col[k], lw=4)
        ax.plot(*g['T'], 'o', color=col[k], mec='k', ms=8)
        ax.annotate(f"{k}: along rail s {g['st']} m, loop {g['len']} m, R {g['R']}\nT on {g['target']}", g['T'], textcoords='offset points', xytext=(8, -14), fontsize=8, weight='bold')
        for j in R1k.get('junctions', []):
            if j['s'] < g['st']:
                ax.plot(j['x'], j['z'], '*', color='gold', mec='k', ms=15, zorder=5)
                ax.annotate(f"{j['road']} junction", (j['x'], j['z']), textcoords='offset points', xytext=(10, -4), fontsize=7, weight='bold', zorder=6)
        for n in R1k['nodes']:
            if n['lanes'] < 6 and n['s'] < g['st']: ax.plot(n['x'], n['z'], 'o', mfc='white', mec=col[k], ms=7, zorder=5)
    ax.set_xlim(-800, 800); ax.set_ylim(1000, -600); ax.set_aspect('equal'); ax.grid(alpha=.3)
    ax.set_xlim(-860, 800)
    ax.set_title('CRR-2b: road along the rail (wide) + loop at the real END (line) + T on a small road (dot); star = junction with 8-lane road, circle = small road node')
    fig.savefig(d + '/city_rail_road_loops.png', dpi=110, bbox_inches='tight')

# CRR-5a: the 5 roads as they will be built + every existing road they touch
if os.path.exists(d + '/city_rail_road_conflicts.json'):
    Cf = json.load(open(d + '/city_rail_road_conflicts.json'))
    fig, ax = plt.subplots(figsize=(11, 12))
    for x, z in C['water']: ax.add_patch(plt.Rectangle((x, z), C['cell'], C['cell'], color='#42a5f5', lw=0))
    names = set(it['road'] for v in Cf['lines'].values() for it in v['items'])
    for r in C['roads']:
        xs = [p[0] for p in r['p']]; zs = [p[1] for p in r['p']]
        hit = r['name'] in names
        ax.plot(xs, zs, color='#b71c1c' if r['lanes'] >= 6 else ('#111' if hit else '#9e9e9e'), lw=2 if r['lanes'] >= 6 else (1.6 if hit else 0.8), ls='-' if (r['lanes'] >= 6 or not hit) else '--')
    for k, v in Cf['lines'].items():
        ax.plot([a[0] for a in v['path']], [a[1] for a in v['path']], color=col[k], lw=9, alpha=.55, solid_capstyle='butt')
        ax.annotate(k, v['path'][len(v['path']) // 3], textcoords='offset points', xytext=(-30, 10), fontsize=9, weight='bold', color=col[k])
        for it in v['items']:
            for c in it['crossings']:
                big = it['lanes'] >= 6
                ax.plot(c['x'], c['z'], '*' if big else 'D', color='gold' if big else 'white', mec='k', ms=16 if big else 9, zorder=6)
                ax.annotate(f"{it['road']} {'PASS' if c['pierOk'] else 'FAIL'}", (c['x'], c['z']), textcoords='offset points', xytext=(10, -6), fontsize=8, weight='bold', zorder=7)
            if it['role'].startswith('T target'):
                ax.plot(*v['path'][-1], 'o', color=col[k], mec='k', ms=8, zorder=6)
                ax.annotate(f"T on {it['road']}", v['path'][-1], textcoords='offset points', xytext=(8, 6), fontsize=8, weight='bold', zorder=7)
    ax.set_xlim(-860, 800); ax.set_ylim(1000, -600); ax.set_aspect('equal'); ax.grid(alpha=.3)
    ax.set_title('CRR-5a: the 5 roads + existing roads they touch (dashed black). star = 8-lane junction, diamond = crossing node, dot = T. Nothing needs removing')
    fig.savefig(d + '/city_rail_road_conflicts.png', dpi=110, bbox_inches='tight')
