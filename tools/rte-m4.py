# STEP RE-5: right-turn ramp M4 (stem inbound -> ring B) of RT-E, and the CROSS-CHECK of all four ramps (M3, M4, A2S, S2A): crossings (R1), gore / weave spacing, stem lanes.
# Run:  python3 -I tools/rte-m4.py docs   (needs docs/rte_site.json, RTE_LEVELS.json, RTE_SLIPS.json; reuses tools/rte-m3.py up to the M3 / M4 solves)
# Writes docs/RTE_M4.txt, docs/RTE_M4.json, docs/rte_m4.png and src/roads/junction/RteM4Data.ts (GENERATED).
import sys, json, math
_L = open('tools/rte-m3.py').read().split('\n')
_c = [k for k, l in enumerate(_L) if l.startswith("Q('RE-4 RAMP M3")][0]
exec('\n'.join(_L[:_c]))
# D9 (engineer, 2026-11-22): M4 over M3 needs 5.5 m clear + the real girder depth of the M4 ring span (composite box L / 33 = 3.02 m, RE-8 D8a) = 8.52 m deck-to-surface; 8.6 m used (0.08 m margin, ASSUMED). The earlier 6.9 m (CLR + DECK) was too low for a 100 m girder.
STEP_UP = 8.6
LOG5 = []
def Q(s=''): LOG5.append(s); print(s)
NEED_M3 = make_need(M3['P'], M3['f'])
def need_m4(P_, f_): return max(nS(P_, f_), NEED_M3(P_, f_))
S2A_GORE_D = float(S2A[0, 1]) - EXIT_TAPER * LANE
D_MIN = max(24, int(math.ceil(S2A_GORE_D + 150)))
M4 = None
for d in range(D_MIN, 700):
    P = build_M4(d); mk = ring_mask(P)
    if mk.sum() < 2: continue
    y0 = yS(d); y1 = yR(P[-1, 0]); yc, f, g, cur, sp, c = solve_level(P, y0, y1, mk, need_m4)
    if ok_grade(P, f): M4 = dict(d=d, P=P, f=f, g=g, cur=cur, sp=sp, c=c, yc=yc, y0=y0, y1=y1, mk=mk); break

if M4 is None: print('NO M4 SOLUTION'); sys.exit(1)
P3, f3, P4, f4 = M3['P'], M3['f'], M4['P'], M4['f']
RAMPS = dict(M3=(P3[:, :2], f3, P3[:, 3]), M4=(P4[:, :2], f4, P4[:, 3]))
SLIPS = dict(A2S=(A2S, A2S_Y), S2A=(S2A, S2A_Y))
geom = dict(M3=P3[:, :2], M4=P4[:, :2], A2S=A2S, S2A=S2A)
def level_at(name, X):
    if name in RAMPS:
        P_, f_, s_ = RAMPS[name]; i = int(np.hypot(P_[:, 0] - X[0], P_[:, 1] - X[1]).argmin()); return float(f_(np.array([s_[i]]))[0])
    P_, y_ = SLIPS[name]; i = int(np.hypot(P_[:, 0] - X[0], P_[:, 1] - X[1]).argmin()); return float(y_[i])
def all_hits(P, Qp):
    out = []
    for i in range(len(P) - 1):
        a, b = P[i, :2], P[i + 1, :2]
        for j in range(len(Qp) - 1):
            c, d = Qp[j, :2], Qp[j + 1, :2]; r, q = b - a, d - c; den = r[0] * q[1] - r[1] * q[0]
            if abs(den) < 1e-9: continue
            w = c - a; t_ = (w[0] * q[1] - w[1] * q[0]) / den; s_ = (w[0] * r[1] - w[1] * r[0]) / den
            if 0 <= t_ <= 1 and 0 <= s_ <= 1: out.append(tuple(a + t_ * r))
    ded = []
    for X in out:
        if not any(math.hypot(X[0] - Y[0], X[1] - Y[1]) < 4 for Y in ded): ded.append(X)
    return ded

Q('RE-5 RAMP M4 (S -> B) + CROSS-CHECK of the four ramps, RT-E.  Geometry data only.')
Q(f'Same corrected layout as RE-4 (spiral-arc-spiral end offset {ARC_D:.1f} m; ramps outside the stem pavement: M3 straight on u = +{U_OUT:.1f}, M4 straight on u = {U_IN:.1f}). Ring level at the T {yR(0):.2f}, stem level at the T {yS(0):.2f}.')
Q(f'M4 gore rule: the M4 gore (start of the ramp) must be >= weaveMin {WEAVE_MIN} m upstream of the S2A gore. S2A taper starts d {float(S2A[0,1]):.1f}, its gore is one taper ({EXIT_TAPER*LANE:.0f} m) further down the stem inbound = d {S2A_GORE_D:.1f}, so the M4 gore starts at d >= {D_MIN}. First d that also meets the 5 % grade and all clearances: d {M4["d"]}.')
chk = []
def C(txt, ok, note=''): chk.append((txt, bool(ok), note)); Q(f"{'PASS' if ok else 'FAIL'}  {txt}  {note}")
def hk(P):
    d = np.diff(P[:, :2], axis=0); h = np.unwrap(np.arctan2(d[:, 1], d[:, 0])); ds = np.diff(P[:, 3]); return np.degrees(h), np.diff(h) / (0.5 * (ds[1:] + ds[:-1]) + 1e-9)
h4, k4 = hk(P4); rmin = 1 / max(np.abs(k4).max(), 1e-9)
m4 = measure(P4, M4['y0'], M4['yc'], M4['mk'], M4['y1'], 'M4')
L4 = float(P4[-1, 3])
exitlen = decel(VH, VR_SEMI) + EXIT_TAPER * LANE
XS = seg_hit(P4, S2A); clrS = f4(at_s(P4, XS))[0] - level_at('S2A', XS)
X34 = seg_hit(P4, P3); sep34 = float(f4(at_s(P4, X34))[0]) - float(f3(at_s(P3, X34))[0])
stemM4 = P4[P4[:, 1] > 100][:, :2]; stemS = S2A[S2A[:, 1] > 100]
dlat = float(np.sqrt(((stemM4[::3, None, :] - stemS[None, :, :]) ** 2).sum(-1)).min()) if len(stemM4) and len(stemS) else 999.0
need_lat = LANE / 2 + 0.5 + RW / 2
u_entry0 = float(P4[-1, 0]) - (ENTRY_LEN + 10); u_end = float(P4[-1, 0])
RAIL_U = 481.0                                     # elevated rail crosses the ring at +481 m (RE-0)
Q('')
Q(f"M4 plan: leaves the stem inbound at d {M4['d']} (v {P4[0,1]:.0f}) beside the stem on u = {P4[0,0]:.1f}, runs down toward the ring, right turn spiral-arc-spiral R {R_SEMI:.0f} m (90 deg) to heading +u on the far side (v {P4[-1,1]:.1f}), entry lane + taper on ring B from u {u_entry0:.0f} to u {u_end:.0f} ({ENTRY_LEN:.0f} m); length {L4:.0f} m.")
Q(f"M4 levels: start {M4['y0']:.2f} (stem inbound level at d {M4['d']}), deck {M4['yc']:.2f} m (ring + {M4['yc']-yR(0):.1f}), end {M4['y1']:.2f} (ring B level at u {u_end:.0f}). Ring clearance {M4['c']:.2f} m; over the S2A slip arc at ({XS[0]:.0f}, {XS[1]:.0f}) {clrS:.2f} m; over M3 {sep34:+.2f} m at ({X34[0]:.0f}, {X34[1]:.0f}); vertical curves: " + '; '.join(f"{c['kind']} s={c['s']:.0f} A={c['A']:+.1f} % L={c['L']:.0f}" for c in M4['cur']))
Q('')
C(f'M1 plan radius >= minRadius(50) = {minR(50):.1f} m', rmin >= minR(50) - 0.5, f'{rmin:.1f} m')
C('M2 smooth: no curvature jump (<= 0.003 1/m per 2 m step), G1 by construction', np.abs(np.diff(k4)).max() <= 0.003, f'max step {np.abs(np.diff(k4)).max():.5f}')
mg4 = maxgrade(P4, f4); C('M3 grade <= 5 % on the curved profile', mg4 <= GMAX + 1e-4, f'{mg4*100:.2f} %')
C(f'M4 clearance over the ring pavement >= {RISE} m', M4['c'] >= RISE - 0.01, f"{M4['c']:.2f} m")
C(f'M5 clearance over the S2A slip arc >= {RISE} m', clrS >= RISE - 0.01, f'{clrS:.2f} m')
C(f'M5b M4 deck over M3 deck >= {STEP_UP} m at the X', sep34 >= STEP_UP - 0.01, f'{sep34:.2f} m')
bad = [c for c in M4['cur'] if not c['fits']]; C('M6 vertical curves L >= K*A and fit', not bad, f"{len(M4['cur'])} curves")
ok7 = abs(f4(np.array([0.0]))[0] - M4['y0']) < .05 and abs(f4(np.array([L4]))[0] - M4['y1']) < .05
C('M7 tie-in levels: start = stem inbound level at the gore, end = ring B level', ok7, f"{M4['y0']:.2f} -> {M4['y1']:.2f}")
C(f'M8 side by side with the S2A slip lane on the stem (v > 100): centre distance >= {need_lat:.2f} m', dlat >= need_lat - 0.05, f'{dlat:.2f} m')
umax = float(P4[P4[:, 1] > HW + 1][:, 0].max()); C(f'M9 outside the paved stem: ramp edge >= 0.5 m from u {-HW} (centre line, v > {HW+1:.0f})', -umax - RW / 2 >= HW + 0.5 - 1e-3, f'centre u {umax:.2f}, edge {umax+RW/2:.2f}')
C('M10 cut <= 12 m and fill <= 7 m (natural ground)', m4['max_cut'] <= MAXCUT and m4['max_fill'] <= MAXFILL, f"cut {m4['max_cut']:.1f} fill {m4['max_fill']:.1f}")
C(f'M11 rail >= {RAIL_CLEAR:.0f} m (ASSUMED, D3)', m4['rail_m'] >= RAIL_CLEAR, f"{m4['rail_m']:.0f} m")
C(f'M12 ring B entry ends {RAIL_CLEAR:.0f} m before the rail crossing (u {RAIL_U:.0f})', u_end + RAIL_CLEAR <= RAIL_U, f'entry u {u_entry0:.0f} .. {u_end:.0f}, margin {RAIL_U-u_end:.0f} m')
x0, x1 = M4['d'], M4['d'] + exitlen
o4 = sum(max(0.0, min(x1, hi) - max(x0, lo)) for lo, hi in (ARM_VIA, ARM_VIA2))
C('M13 stem: M4 exit lane + taper (d %d .. %d) keep clear of the arm viaducts' % (x0, x1), o4 == 0, f'overlap {o4:.0f} m (same D1 fact)')
C(f'M14 gore spacing on the stem inbound: M4 gore (d {M4["d"]}) to S2A gore (d {S2A_GORE_D:.0f}) >= weaveMin {WEAVE_MIN} m', M4['d'] - S2A_GORE_D >= WEAVE_MIN - 0.5, f'{M4["d"]-S2A_GORE_D:.0f} m (desirable {WEAVE_DES} m is NOT met)')

Q('')
Q('CROSS-CHECK of the four ramps (R1 crossings, gore / weave spacing, stem lanes)')
pairs = [('M3', 'M4'), ('M3', 'A2S'), ('M3', 'S2A'), ('M4', 'A2S'), ('M4', 'S2A'), ('A2S', 'S2A')]
XL = []
for a, b in pairs:
    for X in all_hits(geom[a], geom[b]):
        la, lb = level_at(a, X), level_at(b, X); sep = abs(la - lb); upper = a if la > lb else b
        need = STEP_UP if (a in RAMPS and b in RAMPS) else RISE
        XL.append(dict(a=a, b=b, at=[round(float(X[0]), 1), round(float(X[1]), 1)], upper=upper, sep=round(sep, 2), need=need))
Q(f'Plan crossings found between the four ramp centrelines: {len(XL)}')
for x in XL: Q(f"  {x['a']} x {x['b']} at ({x['at'][0]}, {x['at'][1]}): {x['upper']} is over, {x['sep']:.2f} m (need {x['need']})")
C('X1 R1: every plan crossing of two ramps is a designed bridge with the needed clearance', len(XL) > 0 and all(x['sep'] >= x['need'] - 0.01 for x in XL), f'{len(XL)} crossings, min sep {min(x["sep"] for x in XL):.2f} m' if XL else 'none found')
C('X1b R1: A2S and S2A (both ground level) do not cross each other', not any({x["a"], x["b"]} == {"A2S", "S2A"} for x in XL))
exp = {frozenset(('M3', 'A2S')), frozenset(('M4', 'S2A')), frozenset(('M3', 'M4'))}
C('X1c the crossings are the three expected ones (M3 over A2S, M4 over S2A, M4 over M3), no other', {frozenset((x['a'], x['b'])) for x in XL} == exp, ', '.join(sorted(f"{x['a']}x{x['b']}" for x in XL)))
# ring-level: exits / entries per carriageway
m3_exit = float(P3[0, 0]); a2s_exit_gore = float(A2S[0, 0]) - EXIT_TAPER * LANE; s2a_entry0 = float(S2A[-1, 0])
Q(f'Ring B (increasing u): M3 exit gore u {m3_exit:.0f} (taper starts u {m3_exit-exitlen:.0f}), then M4 entry u {u_entry0:.0f} .. {u_end:.0f}. Exit before entry: gap {u_entry0-m3_exit:.0f} m, no weave (info; weaveMin {WEAVE_MIN}).')
C('X2 ring B: M3 exit to M4 entry gap >= weaveMin (exit first, so no weave; checked anyway)', u_entry0 - m3_exit >= WEAVE_MIN, f'{u_entry0-m3_exit:.0f} m')
Q(f'Ring A (decreasing u): A2S exit taper starts u {float(A2S[0,0]):.0f}, gore u {a2s_exit_gore:.0f}; S2A entry ends u {s2a_entry0:.0f}. Exit then entry: no weave (info).')
C('X3 stem inbound: two exits M4 and S2A, gore to gore >= weaveMin', M4['d'] - S2A_GORE_D >= WEAVE_MIN - 0.5, f'{M4["d"]-S2A_GORE_D:.0f} m (desirable {WEAVE_DES} NOT met)')
# stem outbound entries: A2S slip lane and M3 both join the outbound carriageway
dn3 = M3['d']; m3_en = (dn3, dn3 + accel(STEM_V, VR_SEMI) + ENTRY_TAPER * LANE); a2s_en = (float(A2S[-1, 1]) if False else 66.0, 310.0)
ov = max(0.0, min(m3_en[1], a2s_en[1]) - max(m3_en[0], a2s_en[0]))
C(f'X4 stem outbound: A2S entry (d {a2s_en[0]:.0f}..{a2s_en[1]:.0f}) and M3 entry (d {m3_en[0]:.0f}..{m3_en[1]:.0f}) do not overlap', ov == 0, f'overlap {ov:.0f} m, UNSOLVED: both want the outside lane of the outbound carriageway, needs the user (D6)')
# lane budget (added lanes outside the 4 through lanes) per viaduct window
LB = dict(inbound=[('M4 exit lane + taper', x0, x1), ('S2A exit taper + lane', 66.0, float(S2A[0, 1]))], outbound=[('A2S entry lane + taper', a2s_en[0], a2s_en[1]), ('M3 entry lane + taper (1 lane of the 2-lane ramp, ASSUMED)', m3_en[0], m3_en[1])])
Q('Stem lane budget (4 through lanes each way stay; ADDED lanes outside them, one lane each, ASSUMED same convention as RE-3 / RE-4):')
need_w = {}
for side, items in LB.items():
    for vi, (lo, hi) in enumerate((ARM_VIA, ARM_VIA2)):
        mx = 0; seg = []
        for dd in range(int(lo), int(hi) + 1, 2):
            n = sum(1 for _, a_, b_ in items if a_ <= dd <= b_)
            if n: seg.append(dd)
            mx = max(mx, n)
        need_w[f'{side}_viaduct{vi+1}'] = dict(window=[lo, hi], max_added_lanes=mx, length_m=(max(seg) - min(seg)) if seg else 0, d_range=[min(seg), max(seg)] if seg else None)
        Q(f"  {side} over viaduct {lo}..{hi}: up to {mx} added lane(s)" + (f" on d {min(seg)}..{max(seg)} ({max(seg)-min(seg)} m)" if seg else ' (clear)'))
C('X5 stem viaducts need no widening (D1 default = widen)', all(v['max_added_lanes'] == 0 for v in need_w.values()), 'FAIL = D1 is bigger than the RE-1 default: see the lane numbers above')
Q('NOT RUN  Validate.ts, full tsc, npm run build, the game, carved ground, trees, ring median U-turn openings, girder depth (7.8 m assumed), lane budget solution X4 (decision D6), exit-lane geometry of M4 on the stem (taper / lane drawn only as lengths, not as a polyline).')

# ---- outputs ----
def wp(P): return [[round(float(x), 2), round(float(z), 2)] for x, z in (world(u, v) for u, v in P)]
ss = np.append(np.arange(0, L4, 6.0), L4); ii = [int(np.abs(P4[:, 3] - s_).argmin()) for s_ in ss]; ys = [round(float(f4(s_)[0]), 3) for s_ in ss]
J = dict(frame='u along ring, v toward stem; world = J + u*t - v*ln', J=[JX, JZ], t=T.tolist(), ln=LN.tolist(),
         M4=dict(length=L4, u_ramp=U_IN, gore_d=M4['d'], exit_lane_taper=[x0, x1], min_radius=rmin, max_grade=mg4, deck_level=M4['yc'], ring_clearance=M4['c'], slip_clearance=float(clrS), over_M3=sep34,
                 ring_crossing_s=[float(M4['sp'][0]), float(M4['sp'][1])], entry_u=[u_entry0, u_end], curves=[dict(kind=c['kind'], s=round(c['s'], 1), A_percent=round(c['A'], 2), L=round(c['L'], 1)) for c in M4['cur']],
                 pts_uv=[[round(float(P4[i, 0]), 2), round(float(P4[i, 1]), 2)] for i in ii], ys=ys, quantities=dict(deck_m2=m4['deck_m2'], fill_m3=m4['fill_m3'], cut_m3=m4['cut_m3'], max_cut=m4['max_cut'], max_fill=m4['max_fill'])),
         crossings=XL, stem_lane_budget=need_w, checks=chk)
json.dump(J, open(f'{OD}/RTE_M4.json', 'w'), indent=1, default=float); open(f'{OD}/RTE_M4.txt', 'w').write('\n'.join(LOG5) + '\n')
ts = ['// GENERATED by tools/rte-m4.py (STEP RE-5). Do not edit: rerun the script (sources docs/rte_site.json, RTE_LEVELS.json, RTE_SLIPS.json).',
      '// RT-E ramp M4 (stem inbound -> ring B), semi-direct flyover, 2 lanes, one-way, points run in the direction of travel. World x, z; ys = finished deck / surface level (m).',
      f'// V 50 km/h, R {R_SEMI:.0f} m with spirals, ramp centre u = {U_IN:.1f} m beside the stem. Config switch: NOT wired yet (RE-9). Data only, not imported by the game.',
      'export interface RteRampData { name: string; from: string; to: string; deckWidth: number; pts: number[][]; ys: number[] }',
      'export const RTE_M4_DATA: RteRampData = ' + "{ name: 'RTE-M4', from: 'stem inbound exit', to: 'ring B (far carriageway) entry', deckWidth: %s, pts: %s, ys: %s };" % (RW, json.dumps(wp(P4[ii, :2]), separators=(',', ':')), json.dumps(ys, separators=(',', ':')))]
open('src/roads/junction/RteM4Data.ts', 'w', newline='').write('\r\n'.join(ts) + '\r\n')

fig, axs = plt.subplots(2, 1, figsize=(13, 13), gridspec_kw=dict(height_ratios=[2, 1]))
ax = axs[0]; uu = np.arange(-300, 500, 20.0); vv = np.arange(-120, 400, 20.0); G = np.array([[ground(u, v) for u in uu] for v in vv]); ax.contourf(uu, vv, G, levels=np.arange(10, 90, 5), cmap='terrain', alpha=.4)
ax.fill_between([-300, 500], -HW, -MEDH, color='#999'); ax.fill_between([-300, 500], MEDH, HW, color='#999'); ax.fill_between([-300, 500], -MEDH, MEDH, color='#ddd'); ax.fill_between([-HW, -3], HW, 400, color='#bbb'); ax.fill_between([3, HW], HW, 400, color='#999')
for lo, hi in (ARM_VIA, ARM_VIA2): ax.add_patch(plt.Rectangle((-HW - 4, lo), 2 * HW + 8, hi - lo, fill=False, ec='m', lw=1.5, ls='--'))
ax.plot(A2S[:, 0], A2S[:, 1], color='green', lw=2, label='A->S slip'); ax.plot(S2A[:, 0], S2A[:, 1], color='darkorange', lw=2, label='S->A slip')
ax.plot(P3[:, 0], P3[:, 1], color='crimson', lw=2.5, label='M3 B->S'); ax.plot(P4[:, 0], P4[:, 1], color='navy', lw=3.5, label='M4 S->B (RE-5)')
for x in XL: ax.plot([x['at'][0]], [x['at'][1]], 'kx', ms=10)
ax.set_aspect('equal'); ax.set_xlim(-300, 500); ax.set_ylim(-120, 400); ax.legend(fontsize=8, loc='lower right'); ax.set_title('RE-5 four ramps (plan); x = designed crossings'); ax.set_xlabel('u (m)'); ax.set_ylabel('v (m)')
ax = axs[1]; s_ = np.linspace(0, L4, 300); ix = [int(np.abs(P4[:, 3] - a).argmin()) for a in s_]
ax.plot(s_, f4(s_), color='navy', lw=2.5, label='M4 level'); ax.plot(s_, [ground(P4[i, 0], P4[i, 1]) for i in ix], 'k:', lw=.8, label='natural ground')
ax.axvspan(M4['sp'][0], M4['sp'][1], color='navy', alpha=.08); ax.axvline(at_s(P4, XS), color='darkorange', ls='--', lw=1, label='over S2A slip'); ax.axvline(at_s(P4, X34), color='crimson', ls='--', lw=1, label='over M3'); ax.legend(fontsize=8); ax.grid(alpha=.3); ax.set_xlabel('s along M4 (m)'); ax.set_ylabel('level (m)'); ax.set_title('M4 profile')
plt.tight_layout(); plt.savefig(f'{OD}/rte_m4.png', dpi=100); print('written')
