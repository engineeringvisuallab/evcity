# STEP RE-7: TERRAIN of RT-E (embankment / cut / retaining wall / structure split, join levels with the ring and the arm, drainage low points). Geometry data only, natural ground.
# Run:  python3 -I tools/rte-terrain.py docs   (needs docs/rte_site.json, RTE_LEVELS.json, RTE_SLIPS.json; reuses tools/rte-width.py up to its checks, i.e. the RE-4 / RE-5 solves and the RE-6 lane functions)
# Writes docs/RTE_TERRAIN.txt, docs/RTE_TERRAIN.json, docs/rte_terrain.png and src/roads/junction/RteTerrainData.ts (GENERATED).
import sys, json, math, io, contextlib
_L = open('tools/rte-width.py').read().split('\n')
_c = [k for k, l in enumerate(_L) if l.startswith('# ---------------- checks')][0]
with contextlib.redirect_stdout(io.StringIO()): exec('\n'.join(_L[:_c]))
LOG7 = []
def Q(s=''): LOG7.append(s); print(s)
chk = []
def C(txt, ok, note=''): chk.append((txt, bool(ok), note)); Q(f"{'PASS' if ok else 'FAIL'}  {txt}  {note}")

# ---- rules (ASSUMED values are marked) ----
FSL, CSL = 3.0, 2.0              # embankment 1:3, cut 1:2 (same as RE-1 .. RE-5)
WALL_H0 = MAXFILL                # fill above 7 m -> retaining wall (D5 = yes), the lane edge keeps the ring / stem edge line
WALL_MAX = 12.0                  # a wall higher than 12 m is not accepted: viaduct instead (ASSUMED)
STRUCT_H = PIER_H                # ramps (M3, M4): above 3 m the deck stands on piers (RE-1 convention), not on a fill
SKIRT = 30.0                     # embankment skirt (smoothstep back to natural ground) in the game carve, like J1Terrain (GroundJ1Terrain.ts); NOT used in the numbers
JOIN_TOL = 0.30                  # level difference allowed between a lane beside the ring / stem and the ring / stem level (ASSUMED)
MING = 0.005; FLAT_MAX = 30.0    # drainage: grade >= 0.5 % except flat runs <= 30 m (crest / sag tops)
BARW = BAR                       # barrier strip 0.5 m outside every added lane

def resample(pts, ys_, ds=2.0):
    pts = np.asarray(pts, float); s = np.r_[0, np.cumsum(np.hypot(*np.diff(pts, axis=0).T))]; n = max(2, int(round(s[-1] / ds)) + 1); ss = np.linspace(0, s[-1], n)
    return np.c_[np.interp(ss, s, pts[:, 0]), np.interp(ss, s, pts[:, 1])], np.interp(ss, s, ys_), ss
def near_ring(u, v): return abs(v) <= HW + 10
def near_stem(u, v): return v > HW and abs(u) <= HW + 12

EL = {}   # name -> dict(pts, y, s, w (total width incl. barrier), kind)
EL['M3'] = dict(pts=P3[:, :2], y=np.array([float(f3(s)[0]) for s in P3[:, 3]]), s=P3[:, 3], w=RW + 2 * BARW, kind='ramp', mask=ring_mask(P3))
EL['M4'] = dict(pts=P4[:, :2], y=np.array([float(f4(s)[0]) for s in P4[:, 3]]), s=P4[:, 3], w=RW + 2 * BARW, kind='ramp', mask=ring_mask(P4))
k66 = int(np.where(A2S[:, 1] > 66)[0][0]) if (A2S[:, 1] > 66).any() else len(A2S)
for nm, (P_, Y_) in (('A2S (ring + arc, v <= 66)', (A2S[:k66 + 1], A2S_Y[:k66 + 1])), ('S2A', (S2A, S2A_Y))):
    p2, y2, s2 = resample(P_, Y_); EL[nm] = dict(pts=p2, y=y2, s=s2, w=LANE + 2 * BARW, kind='slip', mask=np.zeros(len(s2), bool))
def stem_lane(nm, side, d0, d1, step=2.0):
    ds_ = np.arange(d0, d1 + 0.01, step); P_ = []; w_ = []
    for d in ds_:
        ls = [l for l in (lanes_outbound(d) if side == 'out' else lanes_inbound(d)) if l[0] == nm]
        if not ls: P_.append((np.nan, d)); w_.append(0); continue
        c, w = ls[0][1], ls[0][2]; P_.append(((1 if side == 'out' else -1) * c, d)); w_.append(w + BARW)
    P_ = np.array(P_); ok = ~np.isnan(P_[:, 0])
    return dict(pts=P_[ok], y=np.array([yS(d) for d in P_[ok, 1]]), s=ds_[ok] - ds_[ok][0], w=np.array(w_)[ok], kind='stem', mask=np.zeros(ok.sum(), bool), d=ds_[ok])
EL['stem out: A2S/combined lane'] = stem_lane('A2S/combined lane', 'out', 66, 510)
EL['stem out: M3 lane'] = stem_lane('M3 lane', 'out', 151, 328)
EL['stem in: M4 exit lane'] = stem_lane('M4 exit lane', 'in', M4['d'], M4_T0)
VIA = (ARM_VIA, ARM_VIA2)
def in_via(d): return any(a <= d <= b for a, b in VIA)

SEG = []; TOT = {}; SAGS = []; FLATS = []; JOIN = []; hmax_fill = hmax_cut = hmax_wall = 0.0; toes = []
for nm, e in EL.items():
    P_, y_, s_, w_ = e['pts'], e['y'], e['s'], e['w']; n = len(s_); ds_ = float(np.mean(np.diff(s_))) if n > 1 else 2.0
    w_arr = np.full(n, w_) if np.isscalar(w_) else np.asarray(w_)
    typ = []; hh = []
    for k in range(n):
        u, v = float(P_[k, 0]), float(P_[k, 1]); lat = (u + math.copysign(0.5 * w_arr[k], u)) if e['kind'] == 'stem' else u
        g = ground(lat, v); h = float(y_[k] - g); hh.append(h)
        if e['kind'] == 'stem' and in_via(v): t_ = 'viaduct'
        elif e['kind'] == 'ramp': t_ = 'structure' if (e['mask'][k] or h > STRUCT_H) else ('fill' if h > 0 else 'cut')
        else: t_ = 'structure' if h > WALL_MAX else 'wall' if h > WALL_H0 else 'fill' if h > 0 else 'cut'
        typ.append(t_)
        # level join beside the ring / the arm
        if e['kind'] != 'ramp':
            if near_ring(u, v): JOIN.append((nm, s_[k], float(y_[k] - yR(u))))
            elif near_stem(u, v): JOIN.append((nm, s_[k], float(y_[k] - yS(v))))
    hh = np.array(hh)
    # quantities per sample (adjacent to an existing ring / arm embankment the new fill is a strip w * h, otherwise the trapezoid)
    q = dict(fill=0.0, cut=0.0, wall_area=0.0, wall_len=0.0, structure_len=0.0, viaduct_len=0.0, land=0.0)
    for k in range(n):
        h = hh[k]; w = w_arr[k]; u, v = float(P_[k, 0]), float(P_[k, 1]); adj = near_ring(u, v) or near_stem(u, v) or e['kind'] == 'stem'
        t_ = typ[k]
        if t_ == 'fill': q['fill'] += ds_ * (h * w if adj else h * (w + FSL * h)); q['land'] += ds_ * (w + (0 if adj else 2 * FSL * h)); hmax_fill = max(hmax_fill, h)
        elif t_ == 'wall': q['fill'] += ds_ * h * w; q['wall_area'] += ds_ * h; q['wall_len'] += ds_; q['land'] += ds_ * (w + 1.0); hmax_wall = max(hmax_wall, h)
        elif t_ == 'cut': q['cut'] += ds_ * (-h) * (w + CSL * -h); q['land'] += ds_ * (w + 2 * CSL * -h); hmax_cut = max(hmax_cut, -h)
        elif t_ == 'structure': q['structure_len'] += ds_
        else: q['viaduct_len'] += ds_
        if t_ in ('fill', 'cut') and not adj: toes.append((u, v, h, w))
    # segments (merge consecutive samples of the same type)
    k0 = 0
    for k in range(1, n + 1):
        if k == n or typ[k] != typ[k0]:
            sl = slice(k0, k); SEG.append(dict(el=nm, type=typ[k0], s0=round(float(s_[k0]), 1), s1=round(float(s_[k - 1]), 1), len=round(float(s_[k - 1] - s_[k0]), 1), hmax=round(float(np.abs(hh[sl]).max()), 2), pts=[[round(float(x), 1), round(float(z), 1)] for x, z in (world(a, b) for a, b in P_[k0:k:4])]))
            k0 = k
    # drainage: sag points, flat runs
    g = np.diff(y_) / np.maximum(np.diff(s_), 1e-6)
    for k in range(1, len(g)):
        if g[k - 1] < -1e-4 and g[k] > 1e-4: SAGS.append(dict(el=nm, s=round(float(s_[k]), 1), level=round(float(y_[k]), 2), type=typ[k], h=round(float(hh[k]), 2)))
    run = 0.0
    for k in range(len(g)):
        if abs(g[k]) < MING: run += s_[k + 1] - s_[k]
        else:
            if run > FLAT_MAX: FLATS.append((nm, round(float(s_[k] - run), 1), round(run, 1)))
            run = 0.0
    if run > FLAT_MAX: FLATS.append((nm, round(float(s_[-1] - run), 1), round(run, 1)))
    TOT[nm] = {k_: round(v_, 0 if k_ not in ('wall_len',) else 0) for k_, v_ in q.items()}

Q('RE-7 TERRAIN  RT-E.  Natural ground (not the carved ground), geometry data only, ring and arm profiles frozen.')
Q(f'Rules: embankment 1:{FSL:.0f}, cut 1:{CSL:.0f}; ground-level lanes and slips: fill > {WALL_H0:.0f} m = retaining wall (D5 yes), > {WALL_MAX:.0f} m = structure (ASSUMED); ramps M3 / M4: deck on piers above {STRUCT_H:.0f} m or over a road (RE-1 convention), else fill / cut; arm viaduct windows 160..271 / 391..694 = widened viaduct (RE-6); 0.5 m barrier strip outside every lane; the strip beside an existing ring / arm embankment is a w x h strip (no new slope), elsewhere a trapezoid. Game skirt {SKIRT:.0f} m (like GroundJ1Terrain) is for RE-9.')
Q('')
Q('PER ELEMENT (m3 / m2 / m, rounded):')
for nm, t_ in TOT.items(): Q(f"  {nm}: fill {t_['fill']:.0f} m3, cut {t_['cut']:.0f} m3, wall {t_['wall_len']:.0f} m long ({t_['wall_area']:.0f} m2 face), structure {t_['structure_len']:.0f} m (ramp on piers / over a road), viaduct widening {t_['viaduct_len']:.0f} m, land {t_['land']:.0f} m2")
SUM = {k_: sum(t_[k_] for t_ in TOT.values()) for k_ in ('fill', 'cut', 'wall_area', 'wall_len', 'structure_len', 'viaduct_len', 'land')}
Q(f"TOTAL: fill {SUM['fill']:.0f} m3, cut {SUM['cut']:.0f} m3 (net borrow {SUM['fill'] - SUM['cut']:.0f} m3 from outside the junction), retaining wall {SUM['wall_len']:.0f} m / {SUM['wall_area']:.0f} m2, ramp structure {SUM['structure_len']:.0f} m, viaduct widening {SUM['viaduct_len']:.0f} m, land {SUM['land'] / 1e4:.2f} ha")
walls = [s for s in SEG if s['type'] == 'wall']
Q('RETAINING WALLS (D5): ' + ('; '.join(f"{w['el']} s {w['s0']:.0f}..{w['s1']:.0f} ({w['len']:.0f} m, up to {w['hmax']:.1f} m)" for w in walls) if walls else 'none'))
strs = [s for s in SEG if s['type'] == 'structure']
Q('RAMP STRUCTURES (input of RE-8): ' + '; '.join(f"{w['el']} s {w['s0']:.0f}..{w['s1']:.0f} ({w['len']:.0f} m, up to {w['hmax']:.1f} m high)" for w in strs))
Q('')
mj = max(JOIN, key=lambda r: abs(r[2])) if JOIN else None
C(f'T1 embankment fill (not walls) <= {MAXFILL} m', hmax_fill <= MAXFILL + 1e-6, f'max fill {hmax_fill:.1f} m')
C(f'T2 cut <= {MAXCUT} m', hmax_cut <= MAXCUT, f'max cut {hmax_cut:.1f} m')
C(f'T3 retaining wall <= {WALL_MAX:.0f} m (ASSUMED limit)', hmax_wall <= WALL_MAX, f'max wall {hmax_wall:.1f} m')
C(f'T4 level join: every lane beside the ring / arm is within {JOIN_TOL} m of the ring / arm level (ASSUMED tolerance)', mj is not None and abs(mj[2]) <= JOIN_TOL, f'worst {mj[0]} s {mj[1]:.0f}: {mj[2]:+.2f} m over {len(JOIN)} samples' if mj else 'no samples')
def outfall(el, s0, lev):
    e = EL[el]; i = int(np.abs(e['s'] - s0).argmin()); u0, v0 = float(e['pts'][i, 0]), float(e['pts'][i, 1]); best = None
    for r in range(10, 151, 10):
        for a in range(0, 360, 15):
            u, v = u0 + r * math.cos(math.radians(a)), v0 + r * math.sin(math.radians(a))
            if abs(v) <= HW + 2 or (v > HW and abs(u) <= HW + 2): continue          # not inside the ring / arm pavement
            if v * v0 <= 0 or u * u0 < -1e-9 and abs(u0) > HW: continue             # stay on the same side of the ring and of the arm (no pipe under a carriageway)
            if ground(u, v) <= lev - (0.01 * r + 0.5): best = (r, round(float(ground(u, v)), 1), round(float(u), 0), round(float(v), 0)); break
        if best: break
    return best
for s_ in SAGS: s_['outfall'] = outfall(s_['el'], s_['s'], s_['level']) if s_['type'] == 'cut' else None
bad = [s for s in SAGS if s['type'] == 'cut' and s['outfall'] is None]
Q(f"Sag points (low points of the profile, water collects): {len(SAGS)}" + ''.join(f"\n  {s['el']} s {s['s']:.0f}: level {s['level']:.2f}, on {s['type']}" + (f", surface is {-s['h']:.1f} m below the ground there (cut); nearest gravity outfall (same side of the roads, ground at least 1 % + 0.5 m below the sag): {s['outfall'][0]} m away at ground {s['outfall'][1]} m, (u {s['outfall'][2]:.0f}, v {s['outfall'][3]:.0f})" if s['type'] == 'cut' and s['outfall'] else '') for s in SAGS))
C('T5 every sag in a cut has a gravity outfall within 150 m (FEASIBILITY only: the catch basin and the pipe are NOT designed, RE-9)', not bad, f"{sum(1 for s in SAGS if s['type'] == 'cut')} sag(s) in a cut, {len(bad)} without an outfall")
C(f'T6 no flat run (grade < {MING*100:.1f} %) longer than {FLAT_MAX:.0f} m (the profiles are fixed: flats get cross fall 2 % + deck drains / edge inlets, RE-8 / RE-9, NOT designed)', not FLATS, f'{len(FLATS)} runs: ' + '; '.join(f'{a} s {b:.0f} L {c_:.0f} m' for a, b, c_ in FLATS) if FLATS else '0 runs')
tp = np.array([[u + math.copysign(0.5 * w + FSL * max(h, 0), u), v, 0, 0] for u, v, h, w in toes[::3]]) if toes else np.zeros((0, 4)); rdt = rail_dist(tp) if len(tp) else 999.0
C(f'T7 rail >= {RAIL_CLEAR:.0f} m from every embankment / cut toe on open ground (ASSUMED D3)', rdt >= RAIL_CLEAR, f'{rdt:.0f} m')
Q('NOT RUN  gore pads (flat areas between a lane and its ramp at the six gores / noses: volume NOT computed), final carved ground and the J1-style skirt (RE-9), drainage network (only low points, no pipes / culverts / outfalls designed), trees, grass, buildings, wall structure design, ring median U-turn openings, Validate.ts, full tsc, npm run build, the game.')

# ---- outputs ----
J = dict(frame='u along ring, v toward stem; world = J + u*t - v*ln; segments sampled every 8 m (pts = centre line, world x z)', rules=dict(fill_slope=FSL, cut_slope=CSL, wall_above=WALL_H0, wall_max=WALL_MAX, struct_h=STRUCT_H, skirt=SKIRT, barrier=BARW), per_element=TOT, total=SUM, segments=SEG, sags=SAGS, flats=FLATS, join_worst=mj, checks=chk)
json.dump(J, open(f'{OD}/RTE_TERRAIN.json', 'w'), indent=1, default=float); open(f'{OD}/RTE_TERRAIN.txt', 'w').write('\n'.join(LOG7) + '\n')
ts = ['// GENERATED by tools/rte-terrain.py (STEP RE-7). Do not edit: rerun the script (sources docs/rte_site.json, RTE_LEVELS.json, RTE_SLIPS.json).',
      '// RT-E earthwork segments on natural ground: embankment (fill) / cut / retaining wall (wall) / ramp structure / widened arm viaduct, per element. pts = centre line, world x, z. Config switch NOT wired yet (RE-9). Data only, not imported by the game.',
      'export type RteEarthType = \'fill\' | \'cut\' | \'wall\' | \'structure\' | \'viaduct\';',
      'export interface RteEarthSeg { el: string; type: RteEarthType; s0: number; s1: number; len: number; hmax: number; pts: number[][] }',
      'export const RTE_EARTH_RULES = ' + json.dumps(J['rules'], separators=(',', ':')) + ';',
      'export const RTE_EARTH_SEGS: RteEarthSeg[] = ' + json.dumps(SEG, separators=(',', ':')) + ';']
open('src/roads/junction/RteTerrainData.ts', 'w', newline='').write('\r\n'.join(ts) + '\r\n')
fig, axs = plt.subplots(1, 2, figsize=(16, 11), gridspec_kw=dict(width_ratios=[1.6, 1]))
ax = axs[0]; uu = np.arange(-500, 560, 20.0); vv = np.arange(-100, 560, 20.0); G = np.array([[ground(u, v) for u in uu] for v in vv]); ax.contourf(uu, vv, G, levels=np.arange(10, 90, 5), cmap='terrain', alpha=.35)
ax.fill_between([-500, 560], -HW, HW, color='#bbb'); ax.fill_betweenx([HW, 560], -HW, HW, color='#bbb')
col = dict(fill='green', cut='red', wall='black', structure='royalblue', viaduct='magenta')
for nm, e in EL.items():
    P_ = e['pts']; ty = [s for s in SEG if s['el'] == nm]
    for sg in ty:
        m = (e['s'] >= sg['s0'] - 1e-6) & (e['s'] <= sg['s1'] + 1e-6); ax.plot(P_[m, 0], P_[m, 1], color=col[sg['type']], lw=4 if sg['type'] == 'wall' else 2.2)
for sg in SAGS: 
    e = EL[sg['el']]; i = int(np.abs(e['s'] - sg['s']).argmin()); ax.plot(e['pts'][i, 0], e['pts'][i, 1], 'v', color='orange', ms=8)
for t_, c in col.items(): ax.plot([], [], color=c, lw=3, label=t_)
ax.plot([], [], 'v', color='orange', label='sag (low point)'); ax.legend(fontsize=8); ax.set_aspect('equal'); ax.set_xlim(-500, 560); ax.set_ylim(-100, 560); ax.set_title('RE-7 earthwork type along every lane / ramp (natural ground)'); ax.set_xlabel('u (m)'); ax.set_ylabel('v / d (m)')
ax = axs[1]; names = list(TOT); ax.barh(range(len(names)), [TOT[n]['fill'] for n in names], color='green', label='fill m3'); ax.barh(range(len(names)), [-TOT[n]['cut'] for n in names], color='red', label='cut m3'); ax.set_yticks(range(len(names))); ax.set_yticklabels(names, fontsize=7); ax.legend(); ax.grid(alpha=.3); ax.set_title('Fill (+) and cut (-) per element (m3)')
plt.tight_layout(); plt.savefig(f'{OD}/rte_terrain.png', dpi=100); print('written')
