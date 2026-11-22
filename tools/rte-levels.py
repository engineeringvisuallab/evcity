# STEP RE-2: vertical plan of OPT-1 (outside directional T) for RT-E. Numbers + picture, NO src change.
# Run:  python3 tools/rte-levels.py docs      (needs docs/rte_site.json; reuses the plan layout and helpers of tools/rte-types.py, the lines before 'ALL = {}')
# Writes docs/RTE_LEVELS.txt, docs/RTE_LEVELS.json, docs/rte_levels.png
# New compared with RE-1: the profile has VERTICAL CURVES (crest / sag, K from src/roads/standards/Checks.ts minVerticalK), the clearance over the ring is
# measured on the curved profile (not on the PVI), the X crossing M3 x M4 is measured at the real crossing point, the tie-in levels are listed,
# and the gore / nose distances on the stem are solved again with the curves.
import sys, json, math
_src = open('tools/rte-types.py').read().split('\n')
_cut = [k for k, l in enumerate(_src) if l.startswith('ALL = {}')][0]
exec('\n'.join(_src[:_cut]))   # defines trace, yR, yS, ground, measure, helpers, constants (HW, RISE, STEP_UP, ...)
OD = D                         # output directory (D of the exec'd code = argv[1])

LOG2 = []
def Q(s=''): LOG2.append(s); print(s)

# ---------- vertical criteria (1:1 from src/roads/standards/Checks.ts minVerticalK and src/interchange/Standards.ts stoppingSight) ----------
def ssd(V): return 0.278 * V * 2.5 + V * V / (254 * (3.4 / 9.81))     # tPR 2.5, aBrake 3.4
def kmin(V):
    S = ssd(V); return dict(S=S, crest=S * S / 658, sag=S * S / (120 + 3.5 * S))
KR = kmin(VR_SEMI)
MINLC = 30.0        # minimum vertical curve length (m)  ASSUMED, no number found in Criteria.ts

def vprofile(pvi, V=VR_SEMI):
    """pvi: list of (s, y). Parabolic curves at the inner PVIs, L = max(MINLC, K * |A %|), crest or sag."""
    k = kmin(V); pts = list(pvi); n = len(pts); xs = [p[0] for p in pts]
    g = [(pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]) for i in range(n - 1)]
    curves = []
    for i in range(1, n - 1):
        A = (g[i] - g[i - 1]) * 100.0
        if abs(A) < 1e-9: continue
        K = k['crest'] if A < 0 else k['sag']; L = max(MINLC, K * abs(A))
        room = 2 * min((pts[i][0] - pts[i - 1][0]) * (1.0 if i - 1 == 0 else 0.5), (pts[i + 1][0] - pts[i][0]) * (1.0 if i + 1 == n - 1 else 0.5))
        curves.append(dict(i=i, s=pts[i][0], y=pts[i][1], A=A, K_needed=K, L=L, room=room, fits=L <= room + 1e-6, kind='crest' if A < 0 else 'sag'))
    def y(sv):
        a = np.atleast_1d(np.asarray(sv, float)); out = np.empty_like(a)
        for ix, x in enumerate(a):
            j = min(max(int(np.searchsorted(xs, x)) - 1, 0), n - 2); yt = pts[j][1] + g[j] * (x - pts[j][0])
            for c in curves:
                L = min(c['L'], c['room']); lo, hi = c['s'] - L / 2, c['s'] + L / 2
                if lo < x < hi:
                    gi, go = g[c['i'] - 1], g[c['i']]; t = x - lo; yt = c['y'] + gi * (lo - c['s']) + gi * t + (go - gi) * t * t / (2 * L); break
            out[ix] = yt
        return out
    return y, g, curves

def ring_mask(P): return deck_over_ring(P, -HW, HW)

def ramp_profile(P, y0, y1, yc, mask):
    s = P[:, 3]; idx = np.where(mask)[0]; s1, s2 = float(s[idx[0]]), float(s[idx[-1]]); L = float(s[-1])
    f, g, cur = vprofile([(0.0, y0), (s1, yc), (s2, yc), (L, y1)]); return f, g, cur, (s1, s2)

def clearance(P, f, mask):
    idx = np.where(mask)[0]; yy = f(P[idx, 3]); return float(min(yy[k] - yR(P[i, 0]) for k, i in enumerate(idx)))

def at_s(P, pt):
    d = np.hypot(P[:, 0] - pt[0], P[:, 1] - pt[1]); return float(P[int(d.argmin()), 3])

def make_need(Pl, fl):
    def need(P_, f_):
        X = seg_hit(P_, Pl)
        if X is None: return -1.0
        return STEP_UP - (float(f_(at_s(P_, X))[0]) - float(fl(at_s(Pl, X))[0]))
    return need

def solve_level(P, y0, y1, mask, need=None):
    """smallest PVI level yc so that the curved profile clears the ring by RISE and (if given) the other ramp by STEP_UP"""
    yc = yR(0) + RISE
    for _ in range(80):
        f, g, cur, sp = ramp_profile(P, y0, y1, yc, mask); c = clearance(P, f, mask); d = RISE - c
        if need is not None: d = max(d, need(P, f))
        if d <= 0.005: break
        yc += d + 0.01
    return yc, f, g, cur, sp, c

def maxgrade(P, f):
    s = np.arange(0, P[-1, 3], 2.0); y = f(s); return float(np.abs(np.diff(y) / np.diff(s)).max())

def build_M4(d): return trace(U_IN, d, -90, [('S', max(d - (V_OUT + R_SEMI), 0.5)), ('A', R_SEMI, 90, +1, VR_SEMI), ('S', ENTRY_LEN + 10)])
def build_M3(T3, dn): return trace(U_OUT - R_SEMI - T3, V_OUT, 0, [('S', T3), ('A', R_SEMI, 90, +1, VR_SEMI), ('S', max(dn - (V_OUT + R_SEMI), 0.5))])
def ok_grade(P, f): return maxgrade(P, f) <= GMAX + 1e-4

def solve_M4(need=None):
    for d in range(24, 700):
        P = build_M4(d); mk = ring_mask(P)
        if mk.sum() < 2: continue
        y0 = yS(d); y1 = yR(P[-1, 0]); yc, f, g, cur, sp, c = solve_level(P, y0, y1, mk, need)
        if ok_grade(P, f): return dict(d=d, P=P, f=f, g=g, cur=cur, sp=sp, c=c, yc=yc, y0=y0, y1=y1, mk=mk)
    return None

def solve_M3(need_fn_builder=None, other=None):
    """first T3 (exit run on the ring) so that the RISE up to the ring crossing is <= 5 %, then the stem distance dn so that the descent is <= 5 %."""
    for T3 in range(0, 700, 5):
        P = build_M3(T3, 150); mk = ring_mask(P)
        if mk.sum() < 2: continue
        need = need_fn_builder(other) if other else None
        y0 = yR(P[0, 0]); yc, f, g, cur, sp, c = solve_level(P, y0, yS(150), mk, need)
        if (yc - y0) / sp[0] <= GMAX + 1e-4: break
    else: return None
    for dn in range(24, 699):
        P = build_M3(T3, dn); mk = ring_mask(P)
        if mk.sum() < 2: continue
        y0 = yR(P[0, 0]); y1 = yS(dn); need = need_fn_builder(other) if other else None
        yc, f, g, cur, sp, c = solve_level(P, y0, y1, mk, need)
        if ok_grade(P, f): return dict(T3=T3, d=dn, P=P, f=f, g=g, cur=cur, sp=sp, c=c, yc=yc, y0=y0, y1=y1, mk=mk)
    return None

def design(upper):
    """lower ramp first (ring clearance only), then the upper ramp (ring clearance + STEP_UP over the lower one at the real X)."""
    if upper == 'M4':
        M3 = solve_M3(); M4 = solve_M4(make_need(M3['P'], M3['f'])) if M3 else None
    else:
        M4 = solve_M4(); M3 = solve_M3(lambda o: make_need(o['P'], o['f']), M4) if M4 else None
    if not (M3 and M4): return None
    return dict(M3=M3, M4=M4, dn3=M3['d'], dg4=M4['d'], T3=M3['T3'])

def line_report(DD):
    M3, M4 = DD['M3'], DD['M4']; P3, f3, P4, f4 = M3['P'], M3['f'], M4['P'], M4['f']; dn3, dg4 = DD['dn3'], DD['dg4']
    X = seg_hit(P3, P4); sep = float(f3(at_s(P3, X))[0]) - float(f4(at_s(P4, X))[0]); chk = []
    mg3, mg4 = maxgrade(P3, f3), maxgrade(P4, f4)
    chk.append(('V1 grade <= 5 % on the curved profile (M3, M4)', mg3 <= GMAX + 1e-4 and mg4 <= GMAX + 1e-4, 'M3 %.2f %%, M4 %.2f %%' % (mg3 * 100, mg4 * 100)))
    chk.append(('V2 clearance over the ring pavement >= %.1f m (5.5 + deck + girder), M3 / M4' % RISE, M3['c'] >= RISE - 0.01 and M4['c'] >= RISE - 0.01, 'M3 %.2f m, M4 %.2f m' % (M3['c'], M4['c'])))
    chk.append(('V3 X crossing M3 x M4: upper over lower >= %.1f m' % STEP_UP, abs(sep) >= STEP_UP - 0.01, 'M3 - M4 = %+.2f m at plan point (%.0f, %.0f)' % (sep, X[0], X[1])))
    allc = [(n, c) for n, cs in (('M3', M3['cur']), ('M4', M4['cur'])) for c in cs]; bad = [(n, c) for n, c in allc if not c['fits']]
    chk.append(('V4 every vertical curve has L >= K * A and fits between its neighbours (K crest %.1f, sag %.1f, L min %.0f m)' % (KR['crest'], KR['sag'], MINLC), not bad,
                '%d curves; %s' % (len(allc), 'all fit' if not bad else '; '.join('%s s=%.0f needs L %.0f room %.0f' % (n, c['s'], c['L'], c['room']) for n, c in bad))))
    e = lambda f_, s_: float(f_(s_)[0])
    ok5 = abs(e(f3, 0.0) - M3['y0']) < .05 and abs(e(f3, P3[-1, 3]) - M3['y1']) < .05 and abs(e(f4, 0.0) - M4['y0']) < .05 and abs(e(f4, P4[-1, 3]) - M4['y1']) < .05
    chk.append(('V5 tie-in levels: M3 ring -> stem, M4 stem -> ring (m)', ok5, 'M3 %.2f -> %.2f, M4 %.2f -> %.2f' % (M3['y0'], M3['y1'], M4['y0'], M4['y1'])))
    for txt, ok in stem_flags(dn3, dg4): chk.append(('V6 ' + txt, ok, ''))
    m3 = measure(P3, M3['y0'], M3['yc'], M3['mk'], M3['y1'], 'M3'); m4 = measure(P4, M4['y0'], M4['yc'], M4['mk'], M4['y1'], 'M4')
    mc = max(m3['max_cut'], m4['max_cut']); mf = max(m3['max_fill'], m4['max_fill'])
    chk.append(('V7 cut <= 12 m and fill <= 7 m (ramps)', mc <= MAXCUT and mf <= MAXFILL, 'cut %.1f, fill %.1f' % (mc, mf)))
    chk.append(('V8 rail >= %.0f m from every ramp point (ASSUMED value, D3)' % RAIL_CLEAR, min(m3['rail_m'], m4['rail_m']) >= RAIL_CLEAR, '%.0f m' % min(m3['rail_m'], m4['rail_m'])))
    return dict(chk=chk, X=X, sep=sep, m3=m3, m4=m4)

Q('RE-2 VERTICAL PLAN  OPT-1 outside directional T, ring x J1-E (RT-E).  Layout-level plan of RE-1 + vertical curves.  NO src change.')
Q(f'Frame: u along the ring, v toward the stem. Ring level at the T {yR(0):.2f} m, stem level at the T {yS(0):.2f} m. Over the ring: {RISE} m (5.5 clear + deck + girder), 2nd level +{STEP_UP} m.')
Q(f'Vertical criteria (Checks.ts minVerticalK, ramp V {VR_SEMI} km/h): SSD {KR["S"]:.1f} m, K crest {KR["crest"]:.1f}, K sag {KR["sag"]:.1f}; grade <= {GMAX*100:.0f} %; minimum curve length {MINLC:.0f} m (ASSUMED).')
Q('')
OUT = {}; SUM = {}
for upper in ('M4', 'M3'):
    DD = design(upper)
    if DD is None: Q(f'[upper ramp = {upper}] no solution within 700 m'); Q(''); continue
    R = line_report(DD); OUT[upper] = (DD, R); M3, M4 = DD['M3'], DD['M4']; P3, P4 = M3['P'], M4['P']
    Q(f'[upper ramp = {upper}]')
    Q(f"  M3 B->S : length {P3[-1,3]:.0f} m | start on ring B (u {P3[0,0]:.0f}) level {M3['y0']:.2f} | deck level {M3['yc']:.2f} m = ring + {M3['yc']-yR(0):.1f} | ring clearance {M3['c']:.2f} m | end on the stem outbound at d {DD['dn3']} level {M3['y1']:.2f} | exit run on the ring T3 = {DD['T3']} m")
    Q(f"  M4 S->B : length {P4[-1,3]:.0f} m | start on the stem inbound at d {DD['dg4']} level {M4['y0']:.2f} | deck level {M4['yc']:.2f} m = ring + {M4['yc']-yR(0):.1f} | ring clearance {M4['c']:.2f} m | end on ring B (u {P4[-1,0]:.0f}) level {M4['y1']:.2f}")
    Q("  M3 curves: " + '; '.join(f"{c['kind']} at s={c['s']:.0f} A={c['A']:+.1f} % L={c['L']:.0f} m" for c in M3['cur']))
    Q("  M4 curves: " + '; '.join(f"{c['kind']} at s={c['s']:.0f} A={c['A']:+.1f} % L={c['L']:.0f} m" for c in M4['cur']))
    Q(f"  X crossing at ({R['X'][0]:.0f}, {R['X'][1]:.0f}): M3 level minus M4 level = {R['sep']:+.2f} m (positive = M3 is the upper ramp)")
    Q(f"  quantities: deck M3 {R['m3']['deck_m2']:.0f} + M4 {R['m4']['deck_m2']:.0f} = {R['m3']['deck_m2']+R['m4']['deck_m2']:.0f} m2 | fill {R['m3']['fill_m3']+R['m4']['fill_m3']:.0f} m3 | cut {R['m3']['cut_m3']+R['m4']['cut_m3']:.0f} m3 | ramp length {P3[-1,3]+P4[-1,3]:.0f} m")
    for txt, ok, note in R['chk']: Q(f"  {'PASS' if ok else 'FAIL'}  {txt}  {note}")
    SUM[upper] = dict(deck=R['m3']['deck_m2'] + R['m4']['deck_m2'], fill=R['m3']['fill_m3'] + R['m4']['fill_m3'], cut=R['m3']['cut_m3'] + R['m4']['cut_m3'], fails=[t for t, ok, _ in R['chk'] if not ok],
                      dn3=DD['dn3'], dg4=DD['dg4'], upper_deck=max(M3['yc'], M4['yc']))
    Q('')

Q('COMPARISON (which ramp is the upper one)')
Q('| upper | deck m2 | fill m3 | cut m3 | M4 gore d (m) | M3 nose d (m) | upper deck level (m) | FAIL lines |')
Q('|---|---|---|---|---|---|---|---|')
for k, v in SUM.items(): Q(f"| {k} | {v['deck']:.0f} | {v['fill']:.0f} | {v['cut']:.0f} | {v['dg4']} | {v['dn3']} | {v['upper_deck']:.1f} | {len(v['fails'])} |")
best = min(SUM, key=lambda k: (len(SUM[k]['fails']), SUM[k]['cut'] + SUM[k]['fill'])) if SUM else None
Q('')
Q(f'PICK (engineer): upper ramp = {best} (fewest FAIL lines, then least earthwork). D1..D4 of RE-1 stay open with their defaults.')
Q('NOT DONE / NOT RUN: final geometry (RE-3..RE-5 redraw the plan), carved ground (natural ground used), real girder depth (7.8 m total is ASSUMED from section 24), minimum curve length 30 m (ASSUMED), matching of the ramp end grade to the ring / stem grade at the four tie-ins (listed, not solved), trees / drainage / city-plan buildings, U-turn openings of the ring median, tsc / npm run build / game (no src change).')

J = dict(frame='u along ring (+ = R+), v toward stem; levels in m; profile every 10 m, s = distance along the ramp from its start', pick=best,
         criteria=dict(K_crest=KR['crest'], K_sag=KR['sag'], grade_max=GMAX, rise_over_ring=RISE, step_up=STEP_UP, min_curve_len=MINLC), options={})
for k, (DD, R) in OUT.items():
    o = {}
    for nm in ('M3', 'M4'):
        M = DD[nm]; P, f = M['P'], M['f']; L = float(P[-1, 3]); ss = np.append(np.arange(0, L, 10.0), L); ii = [int(np.abs(P[:, 3] - s_).argmin()) for s_ in ss]
        o[nm] = dict(length=L, start_level=M['y0'], end_level=M['y1'], pvi_level=M['yc'], ring_crossing_s=[float(M['sp'][0]), float(M['sp'][1])], ring_clearance=M['c'], max_grade=maxgrade(P, f),
                     curves=[dict(kind=c['kind'], s=round(c['s'], 1), A_percent=round(c['A'], 2), L=round(c['L'], 1), K=round(c['K_needed'], 1)) for c in M['cur']],
                     stem_distance=DD['dn3'] if nm == 'M3' else DD['dg4'], M3_exit_run_T3=DD['T3'] if nm == 'M3' else None,
                     profile=[dict(s=round(float(s_), 1), u=round(float(P[i, 0]), 1), v=round(float(P[i, 1]), 1), y=round(float(f(s_)[0]), 3)) for s_, i in zip(ss, ii)])
    o['X'] = [float(R['X'][0]), float(R['X'][1])]; o['M3_minus_M4_at_X'] = R['sep']; o['summary'] = SUM[k]; o['checks'] = [(a, bool(b), c) for a, b, c in R['chk']]
    J['options'][f'upper_{k}'] = o
json.dump(J, open(f'{OD}/RTE_LEVELS.json', 'w'), indent=1, default=float)
open(f'{OD}/RTE_LEVELS.txt', 'w').write('\n'.join(LOG2) + '\n')

fig, axs = plt.subplots(len(OUT), 1, figsize=(12, 5.2 * len(OUT)), squeeze=False)
for ax, (k, (DD, R)) in zip(axs[:, 0], OUT.items()):
    for nm, col in (('M3', 'crimson'), ('M4', 'navy')):
        M = DD[nm]; P, f = M['P'], M['f']; ss = np.linspace(0, P[-1, 3], 300); ix = [int(np.abs(P[:, 3] - s_).argmin()) for s_ in ss]
        ax.plot(ss, f(ss), color=col, lw=2.5, label=f'{nm} ramp level'); ax.plot(ss, [ground(P[i, 0], P[i, 1]) for i in ix], color=col, lw=.8, ls=':', label=f'{nm} natural ground')
        ax.plot(ss, [yR(P[i, 0]) for i in ix], color=col, lw=.8, ls='--', alpha=.6); ax.axvspan(M['sp'][0], M['sp'][1], color=col, alpha=.08)
    ax.set_title(f'RE-2 upper ramp = {k}: profiles (dashed = ring level, shaded = ring crossing, M3 minus M4 at X = {R["sep"]:+.1f} m)'); ax.set_xlabel('s along the ramp (m)'); ax.set_ylabel('level (m)'); ax.legend(fontsize=8, ncol=3); ax.grid(alpha=.3)
plt.tight_layout(); plt.savefig(f'{OD}/rte_levels.png', dpi=100)
print('written', OD)
