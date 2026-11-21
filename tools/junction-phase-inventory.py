"""STEP 24.1 JUNCTION PHASE INVENTORY (read only). Run: python3 tools/junction-phase-inventory.py docs
Reads docs/centre_junction.json, docs/centre_vprofile.json, docs/ring_samples_5m.csv, docs/ring_profile.csv,
      docs/fit_chain/centre_fixed.json, src/roads/alignment/RingAlignment.ts (the 4 radial joins, copied below).
Writes docs/junction_phase_inventory.json, docs/JUNCTION_PHASE_INVENTORY.txt, docs/junction_phase_inventory.png.
Nothing in src or in the other data files is changed. Every rule below is MY SCREENING RULE (the user may change it)."""
import json, math, csv, sys, collections
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

D = sys.argv[1] if len(sys.argv) > 1 else 'docs'
J = json.load(open(f'{D}/centre_junction.json'))
V = json.load(open(f'{D}/centre_vprofile.json'))
C = json.load(open(f'{D}/fit_chain/centre_fixed.json'))
LINES = {l['id']: l for l in V['lines']}
RING = []
with open(f'{D}/ring_samples_5m.csv') as f:
    for r in csv.DictReader(f):
        RING.append((float(r['station_m']), float(r['x']), float(r['z'])))
PROF = {}
with open(f'{D}/ring_profile.csv') as f:
    for r in csv.DictReader(f):
        PROF[int(float(r['station_m']))] = (float(r['design_m']), float(r['grade_pct']))

# --- constants (MY choices, printed) ---------------------------------------------------------
MERGE_GAP = 600.0        # two taps on the same 8-lane road closer than this are one MERGE GROUP (one interchange with a collector road)
SPACING_MOTORWAY = 1600  # 3.8, urban
RADIAL = {'N': (1711.6, -3145.4, 11549), 'E': (2354.5, 1436.9, 16813), 'S': (-1131.6, 2301.8, 1205), 'W': (-2595.0, -591.5, 5104)}

# --- tier A: 8-lane x 8-lane --------------------------------------------------------------
tierA = [
    {'id': 'J1', 'what': 'J1 centre, 4 arms x 8 lanes, ground open star', 'status': 'BUILT (J1-g4)', 'work': 'none now (AI / signal check only)'},
    {'id': 'RT-N', 'what': 'ring x J1-N, 3-leg, ground, proposed CGT', 'status': 'not built (AI stand-in tLink)', 'work': 'HANDOFF_RING_T_JUNCTIONS T0..Tx'},
    {'id': 'RT-E', 'what': 'ring x J1-E, 3-leg, ground, proposed CFI', 'status': 'not built', 'work': 'same'},
    {'id': 'RT-W', 'what': 'ring x J1-W, 3-leg, ground, proposed MUT', 'status': 'not built', 'work': 'same'},
    {'id': 'RT-S', 'what': 'ring x J1-S x island link M6-1, 4-leg (D17-1), grade-separated', 'status': 'not built (M6-1 and its bridge are built)', 'work': 'type chosen in 17.4c / 9.2'},
]

# --- tier B: the 22 taps (R4 / R6 ends on an 8-lane road) -----------------------------------
def line_end_level(line, end):
    p = LINES[line]['pvi']
    return p[0][1] if end == 'S' else p[-1][1]

def ring_info(x, z):
    st, rx, rz = min(RING, key=lambda r: (r[1] - x) ** 2 + (r[2] - z) ** 2)
    k = int(round(st / 10) * 10)
    lv, gr = PROF.get(k, (None, None))
    return round(st), lv, gr

taps = []
for t in J['taps']:
    e = t['ends']
    cls = sorted({LINES[x['line']]['cls'] for x in e})
    row = {'id': t['id'], 'on': t['on'], 'x': round(t['x']), 'z': round(t['z']),
           'ends': [(x['line'] + x['end'], round(x['angle'])) for x in e],
           'cls': 'R6' if '6' in cls else 'R4', 'minorLevel': [line_end_level(x['line'], x['end']) for x in e]}
    if t['on'] == 'M8':
        st, lv, gr = ring_info(t['x'], t['z'])
        row.update(ringStation=st, mainLevel=lv, mainGrade=gr)
    taps.append(row)

def dist(a, b):
    return math.hypot(a['x'] - b['x'], a['z'] - b['z'])

# merge groups (same 8-lane road, closer than MERGE_GAP)
groups = []
used = set()
for i, a in enumerate(taps):
    if a['id'] in used: continue
    g = [a]; used.add(a['id'])
    changed = True
    while changed:
        changed = False
        for b in taps:
            if b['id'] in used or b['on'] != a['on']: continue
            if any(dist(b, m) < MERGE_GAP for m in g):
                g.append(b); used.add(b['id']); changed = True
    groups.append(g)
# T11 / T12 and T19 / T20 are on the ring, the J1-E / J1-N ones on arms: same 'on' string.
for g in groups:
    ids = [m['id'] for m in g]
    r6 = any(m['cls'] == 'R6' for m in g)
    angle_min = min(a for m in g for (_, a) in m['ends'])
    g_info = {'taps': ids, 'on': g[0]['on'], 'r6': r6, 'angleMin': angle_min,
              'pairGap': round(min([dist(a, b) for a in g for b in g if a is not b] or [0]))}
    for m in g: m['group'] = ids
    # screening: type family (proposal), left-hand traffic
    if len(g) > 1:
        g_info['proposal'] = ('ONE merged interchange with a collector-distributor road' + (' (CHAIN of %d taps, total length %d m: check whether one C-D road or two interchanges)' % (len(g), round(sum(dist(g[i], g[i+1]) for i in range(len(g)-1)))) if len(g) > 2 else '') + ' (two exits would be < 600 m apart, weave 3.8)')
    elif r6:
        g_info['proposal'] = 'R6 tap: trumpet (3-leg) or half directional; R6 passes over or under the 8-lane road'
    elif angle_min < 70:
        g_info['proposal'] = 'R4 tap at a skew angle < 70 deg: realign the last 150 m to 90 deg first, then trumpet'
    else:
        g_info['proposal'] = 'R4 tap: compact trumpet / half diamond (one loop or two slips, minor road crosses over or under)'
    g.append(g_info)
groupList = [g[-1] for g in groups]
for g in groups: g.pop()

# --- tier C: arterial x arterial nodes (no 8-lane road) -----------------------------------
ART = lambda cls: all(c in ('R4', 'R6') for c in cls.split('x'))
nodes = J['nodes']
arterial = [n for n in nodes if ART(n['cls'])]
real = [n for n in nodes if (ART(n['cls']) and not n['type'].startswith('CONT')) or n['type'] == 'GRADE-SEPARATED']  # N074 is R2 x R4 but grade-separated
tierC = []
for n in real:
    has6 = 'R6' in n['cls']
    gs = n['type'] == 'GRADE-SEPARATED'
    if gs:
        cand = 'YES (ground forces it, 21.7-1: at grade it would need 230 m at 6 % / 99 m at 8 %)'
    elif has6:
        cand = 'CONDITIONAL (R6 arm: decide after the demand step)'
    else:
        cand = 'no (R4 x R4, signalised T at grade)'
    tierC.append({'id': n['id'], 'cls': n['cls'], 'legs': n['legs'], 'angle': None if n['angle'] is None else round(n['angle']), 'type': n['type'], 'interchange': cand})

# --- tier D: R2 / C / L ------------------------------------------------------------------
tierD = collections.Counter(n['type'] for n in nodes if not ART(n['cls']) and n['type'] != 'GRADE-SEPARATED')

# near-by pairs between a tier-C node and a tap (spacing problem)
near = []
for n in real:
    for t in taps:
        d = dist({'x': n['x'], 'z': n['z']}, t)
        if d < 400: near.append((n['id'], t['id'], round(d)))

out = {
    'constants': {'MERGE_GAP_m': MERGE_GAP, 'SPACING_MOTORWAY_m': SPACING_MOTORWAY},
    'tierA': tierA, 'taps': taps, 'tapGroups': groupList, 'tierC': tierC,
    'tierD': dict(tierD), 'nodes': len(nodes), 'continuations': sum(1 for n in nodes if n['type'].startswith('CONT')),
    'arterialNodesNearTap': near,
}
json.dump(out, open(f'{D}/junction_phase_inventory.json', 'w'), indent=1)

# --- text -----------------------------------------------------------------------------------
L = []
P = L.append
P('STEP 24.1 JUNCTION PHASE INVENTORY (read only, tools/junction-phase-inventory.py)')
P(f'nodes in docs/centre_junction.json: {len(nodes)}; continuations (no junction): {out["continuations"]}; real junction nodes: {len(nodes) - out["continuations"]}')
P('')
P('TIER A  8-lane x 8-lane (5): ' + ', '.join(a['id'] for a in tierA))
for a in tierA: P(f"   {a['id']:5s} {a['what']} | {a['status']} | {a['work']}")
P('')
P(f'TIER B  taps on an 8-lane road: {len(taps)} taps, {sum(1 for t in taps if t["cls"]=="R6")} with an R6 end, {sum(1 for t in taps if t["cls"]=="R4")} R4 only')
for t in taps:
    lv = ''
    if 'mainLevel' in t: lv = f" ring st {t['ringStation']} level {t['mainLevel']} grade {t['mainGrade']} % minor end {t['minorLevel']}"
    P(f"   {t['id']} on {t['on']:5s} {t['cls']} {t['ends']} ({t['x']},{t['z']}){lv}")
P(f'   MERGE GROUPS (same 8-lane road, closer than {MERGE_GAP:.0f} m): {len(groupList)} interchanges for {len(taps)} taps')
for g in groupList: P(f"   {'+'.join(g['taps']):14s} on {g['on']:5s} gap {g['pairGap']} m, min angle {g['angleMin']} | {g['proposal']}")
P('')
P(f'TIER C  arterial x arterial nodes (+ N074): {len(real)} real junctions (continuations left out)')
for c in tierC: P(f"   {c['id']} {c['cls']} {c['legs']} angle {c['angle']} | {c['type']} | interchange: {c['interchange']}")
P('')
P('TIER D  R2 / C / L at grade: ' + ', '.join(f'{k}: {v}' for k, v in tierD.items()))
P('')
P('arterial node within 400 m of a tap (spacing, look at them together): ' + str(near))
open(f'{D}/JUNCTION_PHASE_INVENTORY.txt', 'w').write('\n'.join(L) + '\n')
print('\n'.join(L))

# --- picture ----------------------------------------------------------------------------------
COL = {'8': '#222222', '6': '#1f5fbf', '4': '#d62728', '2': '#2ca02c', 'C': '#8c564b', 'L': '#9467bd'}
LW = {'8': 2.4, '6': 1.6, '4': 1.3, '2': 0.5, 'C': 0.4, 'L': 0.4}
fig, ax = plt.subplots(figsize=(15, 15), dpi=100)
for l in C['lines']:
    if l.get('dropped'): continue
    c = str(l['cls'])
    ax.plot([p[0] for p in l['pts']], [p[1] for p in l['pts']], color=COL.get(c, '#999'), lw=LW.get(c, 0.5), alpha=0.35 if c in '2CL' else 0.85, zorder=1)
ax.plot([r[1] for r in RING], [r[2] for r in RING], color='#222', lw=2.4, zorder=1)
for n in nodes:
    if n['type'].startswith('CONT') or ART(n['cls']): continue
    ax.scatter(n['x'], n['z'], s=5, c='#bbbbbb', zorder=2)
for c in tierC:
    n = next(q for q in nodes if q['id'] == c['id'])
    col = '#000' if c['interchange'].startswith('YES') else '#ff7f0e' if c['interchange'].startswith('COND') else '#d62728'
    ax.scatter(n['x'], n['z'], s=60, c=col, edgecolors='k', zorder=4, marker='*' if c['interchange'].startswith('YES') else 'o')
    ax.annotate(c['id'], (n['x'], n['z']), xytext=(4, 3), textcoords='offset points', fontsize=6.5, color=col, zorder=6)
for g in groupList:
    members = [t for t in taps if t['id'] in g['taps']]
    for t in members:
        ax.scatter(t['x'], t['z'], marker='^', s=70, c='#1f5fbf' if g['r6'] else '#ffd700', edgecolors='k', zorder=5)
        ax.annotate(t['id'], (t['x'], t['z']), xytext=(5, -9), textcoords='offset points', fontsize=6.5, zorder=6)
    if len(members) > 1:
        ax.plot([m['x'] for m in members], [m['z'] for m in members], color='#ff00ff', lw=2, zorder=3)
ax.scatter(-87, -277, marker='P', s=240, c='#00aa00', edgecolors='k', zorder=7)
ax.annotate('J1', (-87, -277), xytext=(8, 8), textcoords='offset points', fontsize=10, weight='bold', zorder=8)
for k, (x, z, _) in RADIAL.items():
    ax.scatter(x, z, marker='s', s=170, c='#00cccc', edgecolors='k', zorder=7)
    ax.annotate('RT-' + k, (x, z), xytext=(8, 8), textcoords='offset points', fontsize=10, weight='bold', zorder=8)
ax.set_aspect('equal'); ax.grid(alpha=0.25); ax.invert_yaxis()  # game z grows to the south: invert so NORTH is up
ax.set_title('Junction phase inventory (north up): J1 green +, ring joins cyan squares, taps triangles (blue = R6 end, yellow = R4 only, magenta = merge group),\narterial nodes (star = grade-separated forced, orange = conditional interchange, red = at grade)', fontsize=9)
fig.savefig(f'{D}/junction_phase_inventory.png', bbox_inches='tight')
print('png written')
