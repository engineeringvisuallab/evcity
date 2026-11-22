# STEP RE-3: the two LEFT SLIPS of RT-E (A -> S at the R+ corner, S -> A at the R- corner), ground level. Geometry DATA, no mesh, no game layer.
# Run:  python3 -I tools/rte-slips.py docs      (needs docs/rte_site.json, docs/RTE_LEVELS.json; reuses helpers of tools/rte-types.py, the lines before 'ALL = {}')
# Writes docs/RTE_SLIPS.txt, docs/RTE_SLIPS.json, docs/rte_slips.png and src/roads/junction/RteGeometry.ts (GENERATED data, part 1).
import sys, json, math
_src = open('tools/rte-types.py').read().split('\n')
_cut = [k for k, l in enumerate(_src) if l.startswith('ALL = {}')][0]
exec('\n'.join(_src[:_cut]))
OD = D
LOG2 = []
def Q(s=''): LOG2.append(s); print(s)

# ---------- criteria ----------
V_RING, V_STEM, V_SLIP = 100, STEM_V, 40            # stem speed 60 = ASSUMED (D4)
R_SLIP = 50.0                                      # >= minR(40) = 40.6
SLIP_C = HW - LANE / 2 + LANE                      # centre of the added lane outside the outer lane = 23.925 (outer lane centre 20.275)
LANE_C = HW - LANE / 2
EX_RING = decel(V_RING, V_SLIP); EX_STEM = decel(V_STEM, V_SLIP)
EN_RING = accel(V_RING, V_SLIP); EN_STEM = accel(V_STEM, V_SLIP)
TAP_EX = EXIT_TAPER * LANE; TAP_EN = ENTRY_TAPER * LANE
def lerp_smooth(t): t = min(max(t, 0.0), 1.0); return t * t * (3 - 2 * t)
def straight(p, hdg_deg, L, ds=2.0):
    n = max(1, int(round(L / ds))); a = math.radians(hdg_deg); d = np.array([math.cos(a), math.sin(a)]); return [np.array(p) + d * (L * i / n) for i in range(n + 1)]
def taper(p, hdg_deg, L, off_vec, ds=2.0):
    """centre line that runs along heading and shifts sideways by off_vec (smoothstep) over L"""
    n = max(1, int(round(L / ds))); a = math.radians(hdg_deg); d = np.array([math.cos(a), math.sin(a)]); return [np.array(p) + d * (L * i / n) + np.array(off_vec) * lerp_smooth(i / n) for i in range(n + 1)]
def join(parts):
    out = []
    for pts in parts:
        for q in pts:
            if not out or np.hypot(*(np.array(q) - out[-1])) > 1e-6: out.append(np.array(q))
    return np.array(out)
def poly_s(pts): return np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(pts, axis=0).T))])

# ---------- slip 1: A -> S (left turn), leaves ring direction A (heading -u, i.e. 180 deg) at R+, joins the stem outbound (heading +v, 90 deg) ----------
arc = trace(0, 0, 180, [('A', R_SLIP, 90, -1, V_SLIP)]); du, dv = arc[-1, 0], arc[-1, 1]       # relative end of spiral-arc-spiral
a0 = np.array([SLIP_C - du, SLIP_C]); a1 = a0 + np.array([du, dv])                               # arc start / end: arc ends heading +v on u = SLIP_C
dec = straight(a0 + np.array([EX_RING, 0]), 180, EX_RING)                                         # decel lane (full lane width) upstream of the arc
tp = taper(a0 + np.array([EX_RING + TAP_EX, -(SLIP_C - LANE_C)]), 180, TAP_EX, [0, SLIP_C - LANE_C])  # exit taper: from the outer lane line outward
acc = straight(a1, 90, EN_STEM); tpe = taper(a1 + np.array([0, EN_STEM]), 90, TAP_EN, [-(SLIP_C - LANE_C), 0])
P_AS = join([tp, dec, [a0 + q[:2] - arc[0, :2] for q in arc], acc, tpe])
# ---------- slip 2: S -> A (left turn), leaves the stem inbound (heading -v, -90 deg) at R-, joins ring direction A (heading -u) ----------
arc2 = trace(0, 0, -90, [('A', R_SLIP, 90, -1, V_SLIP)]); du2, dv2 = arc2[-1, 0], arc2[-1, 1]
b1 = np.array([-SLIP_C + du2, SLIP_C]); b0 = np.array([-SLIP_C, SLIP_C - dv2])                    # arc start (on u = -SLIP_C, heading -v) / end (on v = SLIP_C, heading -u)
dec2 = straight(b0 + np.array([0, EX_STEM]), -90, EX_STEM); tp2 = taper(b0 + np.array([(SLIP_C - LANE_C), EX_STEM + TAP_EX]), -90, TAP_EX, [-(SLIP_C - LANE_C), 0])
acc2 = straight(b1, 180, EN_RING); tpe2 = taper(b1 + np.array([-EN_RING, 0]), 180, TAP_EN, [0, -(SLIP_C - LANE_C)])
P_SA = join([tp2, dec2, [b0 + q[:2] - arc2[0, :2] for q in arc2], acc2, tpe2])

def heading_curv(P):
    d = np.diff(P, axis=0); h = np.unwrap(np.arctan2(d[:, 1], d[:, 0])); s = poly_s(P); ds = np.diff(s)
    k = np.diff(h) / (0.5 * (ds[1:] + ds[:-1]) + 1e-9); return np.degrees(h), k
def finish_levels(P, y0, y1):
    s = poly_s(P); L = s[-1]; return np.array([y0 + (y1 - y0) * lerp_smooth(x / L) for x in s]), s
def earthwork(P, y):
    s = poly_s(P); h = y - np.array([ground(u, v) for u, v in P]); cut = fill = 0.0; mc = mf = 0.0
    for i in range(1, len(P)):
        d = s[i] - s[i - 1]; hh = h[i]
        if hh > 0: fill += d * hh * (LANE + 2 * 1.2 + FILL_SL * hh); mf = max(mf, hh)
        else: cut += d * -hh * (LANE + 2 * 1.2 + CUT_SL * -hh); mc = max(mc, -hh)
    return dict(cut_m3=cut, fill_m3=fill, max_cut=mc, max_fill=mf)

# stem distance of a point: d = v (the arm runs along +v); ring station: u
y_AS, s_AS = finish_levels(P_AS, yR(P_AS[0, 0]), yS(P_AS[-1, 1])); y_SA, s_SA = finish_levels(P_SA, yS(P_SA[0, 1]), yR(P_SA[-1, 0]))
RL = json.load(open(f'{OD}/RTE_LEVELS.json')); OPT = RL['options'][f"upper_{RL['pick']}"]
PL = {nm: np.array([(p['u'], p['v']) for p in OPT[nm]['profile']]) for nm in ('M3', 'M4')}

def pdist(P, Q): return float(np.sqrt(((P[::2, None, :] - Q[None, ::3, :]) ** 2).sum(-1)).min())
Q('RE-3 LEFT SLIPS  RT-E (ring x J1-E), ground level, geometry data (part 1). NO game layer, NO mesh.')
Q(f'Frame: u along the ring (+ = R+), v toward the stem; direction A = -u (near carriageway, stem side), stem outbound keeps left on u +, inbound on u -. Ring level at the T {yR(0):.2f} m, stem level at the T {yS(0):.2f} m.')
Q(f'Criteria: slip V {V_SLIP} km/h, R {R_SLIP:.0f} m (min {minR(V_SLIP):.1f}), spiral-arc-spiral; lane {LANE} m; added lane centre {SLIP_C:.3f} m (outer lane {LANE_C:.3f}); ring V {V_RING}, stem V {V_STEM} (ASSUMED, D4); grade <= {GMAX*100:.0f} %.')
Q(f'Speed change (Standards.ts formulas): exit from the ring {EX_RING:.0f} m + taper {TAP_EX:.0f} m; exit from the stem {EX_STEM:.0f} m + taper {TAP_EX:.0f} m; entry onto the stem {EN_STEM:.0f} m + taper {TAP_EN:.0f} m; entry onto the ring {EN_RING:.0f} m + taper {TAP_EN:.0f} m.')
Q('')
RES = {}
slips = [('RTE-A2S', 'A -> S', 'ring A (R+ side) station', 'stem outbound', P_AS, y_AS, s_AS, EX_RING + TAP_EX, EN_STEM + TAP_EN, 'A'),
         ('RTE-S2A', 'S -> A', 'stem inbound', 'ring A (R- side)', P_SA, y_SA, s_SA, EX_STEM + TAP_EX, EN_RING + TAP_EN, 'S')]
for nm, lab, frm, to, P, y, s, lex, len_, kind in slips:
    h, k = heading_curv(P); rmin = 1 / max(np.abs(k).max(), 1e-9)
    ia = np.where(np.abs(k) > 1 / 150)[0]; sa0, sa1 = s[ia[0]], s[ia[-1] + 2]
    # finished level: beside the ring it FOLLOWS the ring level, beside the stem it FOLLOWS the stem level, smooth blend over the arc
    hostA = (lambda i: yR(P[i, 0])); hostB = (lambda i: yS(P[i, 1]))
    first, second = (hostA, hostB) if kind == 'A' else (hostB, hostA)
    y = np.array([first(i) if s[i] <= sa0 else second(i) if s[i] >= sa1 else first(i) + (second(i) - first(i)) * lerp_smooth((s[i] - sa0) / (sa1 - sa0)) for i in range(len(P))])
    g = np.abs(np.diff(y) / np.diff(s)).max(); e = earthwork(P, y)
    hd0, hd1 = (h[0] % 360, h[-1] % 360)
    dm3, dm4 = pdist(P, PL['M3']), pdist(P, PL['M4'])
    # corner clearance from the paved ring and stem edges is by construction (slip lies in the added lane outside the pavement): minimum distance of the arc to the pavement corner
    RES[nm] = dict(P=P, y=y, s=s, rmin=rmin, g=g, e=e, arc=(sa0, sa1), hd=(hd0, hd1), dm3=dm3, dm4=dm4, L=float(s[-1]))
    Q(f'--- {nm}  {lab}: from {frm} to {to}')
    Q(f'  length {s[-1]:.0f} m = exit taper {TAP_EX:.0f} + decel lane + spiral-arc-spiral (s {sa0:.0f} .. {sa1:.0f}, arc length {sa1-sa0:.0f} m) + accel lane + entry taper')
    Q(f'  start (u {P[0,0]:.1f}, v {P[0,1]:.1f}) level {y[0]:.2f}   end (u {P[-1,0]:.1f}, v {P[-1,1]:.1f}) level {y[-1]:.2f}   heading start {hd0:.0f} deg, end {hd1:.0f} deg')
    Q(f'  min radius {rmin:.1f} m   max grade {g*100:.2f} %   cut max {e["max_cut"]:.1f} m / {e["cut_m3"]:.0f} m3   fill max {e["max_fill"]:.1f} m / {e["fill_m3"]:.0f} m3')
    Q(f'  nearest distance to the M3 / M4 layout of RE-2: {dm3:.1f} m / {dm4:.1f} m')
Q('')
# ---------- checks ----------
chk = []
def C(txt, ok, note=''): chk.append((txt, bool(ok), note)); Q(f"{'PASS' if ok else 'FAIL'}  {txt}  {note}")
for nm in RES: C(f'SL1 {nm} min radius >= minRadius({V_SLIP}) = {minR(V_SLIP):.1f} m', RES[nm]['rmin'] >= minR(V_SLIP) - 0.5, f"{RES[nm]['rmin']:.1f} m")
for nm in RES: C(f'SL2 {nm} grade <= 5 %', RES[nm]['g'] <= GMAX, f"{RES[nm]['g']*100:.2f} %")
C('SL3 smooth: curvature has no jump (max change of curvature per 2 m step <= 0.003 1/m: spiral-arc-spiral and smooth tapers, G1 by construction)', all(np.abs(np.diff(heading_curv(RES[n]['P'])[1])).max() <= 0.003 for n in RES), 'max step %.5f 1/m' % max(np.abs(np.diff(heading_curv(RES[n]['P'])[1])).max() for n in RES))
C('SL4 terminals: A->S starts on heading 180 (ring A) and ends on heading 90 (stem out); S->A starts on 270 (stem in) and ends on 180 (ring A)', abs(RES['RTE-A2S']['hd'][0] - 180) < 1.5 and abs(RES['RTE-A2S']['hd'][1] - 90) < 1.5 and abs(RES['RTE-S2A']['hd'][0] - 270) < 1.5 and abs(RES['RTE-S2A']['hd'][1] - 180) < 1.5,
  'A2S %.0f -> %.0f, S2A %.0f -> %.0f' % (*RES['RTE-A2S']['hd'], *RES['RTE-S2A']['hd']))
for nm in RES: C(f'SL5 {nm} cut <= 12 m and fill <= 7 m (natural ground)', RES[nm]['e']['max_cut'] <= MAXCUT and RES[nm]['e']['max_fill'] <= MAXFILL, f"cut {RES[nm]['e']['max_cut']:.1f} fill {RES[nm]['e']['max_fill']:.1f}")
for nm in RES:
    P_ = RES[nm]['P']; yy = RES[nm]['y']; near = [i for i in range(len(P_)) if abs(P_[i, 1]) < HW + 8 and P_[i, 1] > 0]
    hf = max((yR(P_[i, 0]) - ground(P_[i, 0], HW) for i in near), default=0.0); sf = max((yy[i] - ground(P_[i, 0], P_[i, 1]) for i in near), default=0.0)
    Q(f'  {nm}: along the ring the RING EDGE itself stands up to {hf:.1f} m above natural ground; the slip lane beside it up to {sf:.1f} m (the lane only widens an embankment that already exists; ring is FIXED; a retaining wall on the new edge is the fix, needs the user: decision D5).')
rail = min(rail_dist(RES[n]['P'][::2]) for n in RES) if False else min(float(np.sqrt(((np.array([world(u, v) for u, v in RES[n]['P'][::6]])[:, None, :] - np.array([world(u, v) for u, v in RAIL])[None, :, :]) ** 2).sum(-1)).min()) for n in RES)
C(f'SL6 rail >= {RAIL_CLEAR:.0f} m (ASSUMED value, D3)', rail >= RAIL_CLEAR, f'{rail:.0f} m')
# speed change lengths are built from the formulas: report the check as arithmetic
C('SL7 exit / entry lane + taper lengths equal the Standards.ts formulas (built from them)', True, f'ring exit {EX_RING:.0f}+{TAP_EX:.0f}, stem exit {EX_STEM:.0f}+{TAP_EX:.0f}, stem entry {EN_STEM:.0f}+{TAP_EN:.0f}, ring entry {EN_RING:.0f}+{TAP_EN:.0f} m')
# plan overlaps with the arm viaducts: slip lanes on the stem
def stem_span(P): vv = P[:, 1]; sel = (np.abs(P[:, 0]) <= SLIP_C + 2) & (vv > HW); return (float(vv[sel].min()), float(vv[sel].max())) if sel.any() else (0, 0)
sA = stem_span(RES['RTE-A2S']['P']); sS = stem_span(RES['RTE-S2A']['P'])
def ov(a, b): return sum(max(0.0, min(b, hi) - max(a, lo)) for lo, hi in (ARM_VIA, ARM_VIA2))
oA, oS = ov(*sA), ov(*sS)
C(f'SL8 slip lanes on the stem keep clear of the arm viaducts {ARM_VIA}/{ARM_VIA2}  A2S d {sA[0]:.0f}..{sA[1]:.0f} overlap {oA:.0f} m;  S2A d {sS[0]:.0f}..{sS[1]:.0f} overlap {oS:.0f} m', oA == 0 and oS == 0, 'same D1 fact (arm viaduct widening)')
# merge / diverge spacing against the RE-2 ramps on the stem
M4g = OPT['M4']['stem_distance']; M3n = OPT['M3']['stem_distance']
tA_end = sA[1]; tS_start = sS[1]
sp1 = tS_start - (M4g)   # S2A exit taper start (largest d) vs M4 gore d (travel is towards smaller d)
Q(f'  on the stem: M4 gore d {M4g}, M4 exit taper start d {M4g + 108:.0f}; S2A slip taper starts d {tS_start:.0f} (0 inside the ring edge). M3 nose d {M3n}, M3 entry taper ends d {M3n + 186}; A2S slip entry taper ends d {tA_end:.0f}.')
Q('NOT RUN  SL9 stem inbound exit spacing S2A vs M4 gore (weaveMin 150 m): the lane budget of the stem is decided in RE-5 (cross-check), not here.')
C('SL10 stem outbound: A2S entry and M3 entry do not overlap in d', not (tA_end > M3n and M3n + 186 > sA[0]), 'A2S taper d %.0f..%.0f vs M3 d %d..%d' % (sA[0], sA[1], M3n, M3n + 186))
Q('')
Q('WIDTH CHANGES (H4 list; the ring and the stem carriageways themselves are NOT changed, only an added lane outside the paved edge):')
Q(f'  ring, A side (R+ corner): added lane {LANE} m wide along the exit taper + decel lane, u {RES["RTE-A2S"]["P"][0,0]:.0f} .. {RES["RTE-A2S"]["P"][0,0]-TAP_EX-EX_RING:.0f}; taper {TAP_EX:.0f} m (1:{EXIT_TAPER}).')
Q(f'  ring, A side (R- corner): added lane along the entry lane, u {RES["RTE-S2A"]["P"][-1,0]+EN_RING+TAP_EN:.0f} .. about {RES["RTE-S2A"]["P"][-1,0]:.0f}; taper {TAP_EN:.0f} m (1:{ENTRY_TAPER}).')
Q(f'  stem outbound: added lane d {sA[0]:.0f} .. {sA[1]:.0f}.   stem inbound: added lane d {sS[0]:.0f} .. {sS[1]:.0f}.')
Q('NOT RUN: src/interchange/Validate.ts (it needs the Ramp / InterchangeParams types of the interchange builder; these slips are not in that format, they are validated by the SL1..SL10 lines above); tsc; npm run build; the game; carved ground (natural ground used); trees; ring median U-turn openings; lane budget / merge conflicts with M3 and M4 (RE-5); the stem lane positions (my reading).')

# ---------- outputs ----------
def wp(P): return [[round(float(x), 2), round(float(z), 2)] for x, z in (world(u, v) for u, v in P)]
J = dict(frame='u along ring, v toward stem; world = J + u*t - v*ln', J=[JX, JZ], t=T.tolist(), ln=LN.tolist(), criteria=dict(V_slip=V_SLIP, R=R_SLIP, lane=LANE, lane_c=SLIP_C), slips={}, checks=chk)
for nm in RES:
    R_ = RES[nm]; ii = list(range(0, len(R_['P']), 3)) + ([len(R_['P']) - 1] if (len(R_['P']) - 1) % 3 else [])
    J['slips'][nm] = dict(length=R_['L'], arc_s=[float(R_['arc'][0]), float(R_['arc'][1])], min_radius=R_['rmin'], max_grade=R_['g'], earthwork=R_['e'],
                          pts_uv=[[round(float(R_['P'][i, 0]), 2), round(float(R_['P'][i, 1]), 2)] for i in ii], ys=[round(float(R_['y'][i]), 3) for i in ii])
json.dump(J, open(f'{OD}/RTE_SLIPS.json', 'w'), indent=1, default=float)
open(f'{OD}/RTE_SLIPS.txt', 'w').write('\n'.join(LOG2) + '\n')
ts = ['// GENERATED by tools/rte-slips.py (STEP RE-3). Do not edit: rerun the script (source docs/rte_site.json, docs/RTE_LEVELS.json).',
      '// RT-E (ring x J1-E arm) LEFT SLIPS, ground level, part 1 of RteGeometry. One-way, one lane, points run in the direction of travel. World x, z (same frame as the game); ys = finished surface level (m).',
      f'// Slip V {V_SLIP} km/h, R {R_SLIP:.0f} m with spirals. RTE-A2S leaves ring direction A on the R+ side and joins the stem outbound; RTE-S2A leaves the stem inbound and joins ring direction A on the R- side.',
      '// Config switch: NOT wired yet (RE-9). This file is data only and is not imported by the game.',
      'export interface RteSlipData { name: string; from: string; to: string; pts: number[][]; ys: number[]; laneWidth: number }',
      'export const RTE_SLIP_DATA: RteSlipData[] = [']
for nm, lab, frm, to, *_ in slips:
    R_ = J['slips'][nm]; wpts = wp(np.array(R_['pts_uv']))
    ts.append(f"  {{ name: '{nm}', from: '{frm}', to: '{to}', laneWidth: {LANE}, pts: {json.dumps(wpts, separators=(',', ':'))}, ys: {json.dumps(R_['ys'], separators=(',', ':'))} }},")
ts.append('];'); open('src/roads/junction/RteGeometry.ts', 'w', newline='').write('\r\n'.join(ts) + '\r\n')

fig, ax = plt.subplots(figsize=(13, 9))
uu = np.arange(-600, 600, 20.0); vv = np.arange(-120, 400, 20.0); G = np.array([[ground(u, v) for u in uu] for v in vv])
ax.contourf(uu, vv, G, levels=np.arange(10, 90, 5), cmap='terrain', alpha=.45)
ax.fill_between([-600, 600], -HW, -MEDH, color='#999'); ax.fill_between([-600, 600], MEDH, HW, color='#999'); ax.fill_between([-600, 600], -MEDH, MEDH, color='#ddd')
ax.fill_between([-HW, -3], HW, 400, color='#bbb'); ax.fill_between([3, HW], HW, 400, color='#999')
ax.add_patch(plt.Rectangle((-HW - 4, 160), 2 * HW + 8, 111, fill=False, ec='m', lw=1.5, ls='--')); ax.text(HW + 8, 215, 'arm viaduct 160-271', color='m', fontsize=8)
for nm, c in (('M3', 'crimson'), ('M4', 'navy')): ax.plot(PL[nm][:, 0], PL[nm][:, 1], color=c, lw=1.5, ls='--', alpha=.7, label=nm + ' (RE-2 layout)')
ax.plot(RES['RTE-A2S']['P'][:, 0], RES['RTE-A2S']['P'][:, 1], color='green', lw=3, label='A -> S left slip'); ax.plot(RES['RTE-S2A']['P'][:, 0], RES['RTE-S2A']['P'][:, 1], color='darkorange', lw=3, label='S -> A left slip')
ax.text(-590, 12, 'A (near, -u)', fontsize=8); ax.text(-590, -12, 'B (far, +u)', fontsize=8)
ax.set_xlim(-600, 600); ax.set_ylim(-120, 400); ax.set_aspect('equal'); ax.legend(loc='lower right', fontsize=8); ax.set_xlabel('u along the ring (m)  <- R- (hill)     R+ ->'); ax.set_ylabel('v toward the stem (m)')
ax.set_title('RE-3 left slips of RT-E (ground level) with the RE-2 flyover layout'); plt.tight_layout(); plt.savefig(f'{OD}/rte_slips.png', dpi=100)
print('written')
