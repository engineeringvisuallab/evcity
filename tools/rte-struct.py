# STEP RE-8: STRUCTURES of RT-E = ramp bridges (M3, M4) and arm viaduct widening (D1 wedges) as DATA: deck, girder, pier, abutment. NO mesh.
# Run:  python3 -I tools/rte-struct.py docs   (needs docs/rte_site.json, RTE_LEVELS.json, RTE_SLIPS.json; reuses tools/rte-width.py up to its checks, i.e. the RE-4 / RE-5 solves and the RE-6 lane functions)
# Writes docs/RTE_STRUCT.txt, docs/RTE_STRUCT.json, docs/rte_struct.png and src/roads/junction/RteStructData.ts (GENERATED, data only, not imported by the game).
import sys, json, math, io, contextlib
_L = open('tools/rte-width.py').read().split('\n')
_c = [k for k, l in enumerate(_L) if l.startswith('# ---------------- checks')][0]
with contextlib.redirect_stdout(io.StringIO()): exec('\n'.join(_L[:_c]))
LOG8 = []
def Q(s=''): LOG8.append(s); print(s)
chk = []
def C(txt, ok, note='', tag=None):
    st = tag or ('PASS' if ok else 'FAIL'); chk.append((txt, st, note)); Q(f'{st}  {txt}  {note}')
SJ = json.load(open('docs/rte_site.json'))

# ------------------------------------------------------------------ decisions and numbers (ASSUMED where marked)
D7 = 'D7 (engineer, new): ramp bridges = single-cell post-tensioned concrete box girder, continuous, one hammer-head pier per support line on the ramp axis; the arm viaduct is widened by a CANTILEVER WING where the net width is <= CANT_MAX and by its OWN independent box wedge on single columns where it is wider; the existing arm deck (a plain girder abutment to abutment, no piers, 16 m approach slabs) is NOT loaded by the new piers.'
D8 = 'D8 REVISED (user order 2026-11-22: one pier in the ring median for each ramp, no 100 m span): the old text follows as history - (a) the plan crossing of the ring by M3 and M4 leaves NO pier position between the ring edges (the 90 deg turn is made over the ring, RE-4 / RE-5), so each ramp has ONE span of about 100 m there: composite steel-concrete box, constant depth L / 33 (ASSUMED feasible, structural design NOT RUN); (b) over every other road the span is chosen so that girder depth <= deck-to-surface - 5.5 m (DP with a penalty); (c) where that is impossible (M4 over M3) the profile is NOT changed here (RE-5 owns it), the shortfall is printed as FAIL and the fix is named.'
GAP = 3.0          # pier column face to the barrier strip of a road below (ASSUMED; same value as Config.roads.roadRailBuffer.pierToDeckEdge)
BARS = 0.5         # barrier strip outside every paved edge / added lane (RE-6 convention)
MEDH = 6.3         # ring median clear half width (ASSUMED from HANDOFF section 25: clear ~12.6 m; Config highway section medianHalf ~6.5); a ramp pier may stand in the median (D8 revised, user order 2026-11-22)
COLA, COLB = 2.4, 3.0            # pier column foot, along x across (ASSUMED, between VI and IB numbers of RingBridgeGeometry.ts)
TOPA, TOPB = 1.8, 2.6            # column top
CAPH, CAPA = 1.4, 2.8            # hammer-head cap height / length along the road (ASSUMED, as IB)
RC = 0.5 * math.hypot(COLA, COLB)   # column foot circle radius 1.92
EMBED = 3.0                      # column foot goes this far below the ground (ASSUMED; RingBridgeGeometry VI.embed is 6, a pile cap is not designed here)
SPAN_T, SPAN_MIN, SPAN_MAX = 40.0, 16.0, 70.0   # ramp spans: target / minimum / maximum (ASSUMED; the max is raised stepwise if a crossing needs it and then reported)
SLIM_CONST = 45.0                # spans up to this: concrete box, constant depth L / 22 (min 1.6); longer (only the two ring spans): composite steel-concrete box, constant depth L / 33 (D8, ASSUMED ratios)
VPEN = 2000.0                    # DP penalty per metre of girder depth above what a crossing below allows (best effort, the rest is reported as FAIL in S3)
STRUCT_APPROACH = 16.0           # src/roads/ring/RingStructures.ts STRUCT.approach: approach slab at each end of an arm structure (on the embankment)
DECK_DEPTH_ARM = 1.5             # STRUCT.deckDepth: depth of the existing arm deck
ARM_DECK_HALF = 22.4             # ASSUMED: RoadNetwork deckHalfWidth = halfWidth + shoulder + 0.3 with the M8 paved edge 22.1 (not read from the game, headless)
CANT_MAX = 4.5                   # largest net overhang of a cantilever wing (ASSUMED)
WING_T0, WING_K = 0.25, 0.12     # wing slab thickness = 0.25 + 0.12 x net width at the root (ASSUMED), tip 0.25 m
WEDGE_SPAN_MAX = 48.0            # src VI.spanLong
VCLR = 5.5                       # H2 / 3.6: clearance over a road
RAIL_OVER = 9.0                  # Config.roads.roadRailBuffer.roadOverRail: road surface above top of rail
RAIL_WIRE = 6.9                  # RAIL_DESIGN.messengerHeight above rail
WIRE_MARGIN = 1.0                # deck underside above the messenger wire (ASSUMED)
WALL_MAX_ST = 12.0               # as RE-7 T3
PIER_MAX_H = 25.0                # tallest column accepted (ASSUMED)
NARROW = 91.0                    # RE-6: ramp deck 9.7 -> 6.1 m over the last 91 m
RW_N = 6.1
RING_ADD = {1: [(94.0, 315.0), (-459.0, -96.0)], -1: [(-380.0, -173.0), (75.0, 420.0)]}   # added lanes outside the paved ring edge: +1 = near (stem) side (A2S exit, S2A entry), -1 = far side (M3 exit, M4 entry)

Rail = np.array(RAIL, float)
rp = SJ['railPts']; RAILLV = np.array([[r[2], -r[3], r[4]] for r in rp if not (isinstance(r[4], float) and math.isnan(r[4]))])
def rail_level(u, v):
    k = int(np.argmin((RAILLV[:, 0] - u) ** 2 + (RAILLV[:, 1] - v) ** 2)); return float(RAILLV[k, 2])
def rail_d(u, v): return float(np.sqrt(((Rail - np.array([u, v])) ** 2).sum(1)).min())
def seg_d(P, u, v):
    P = np.asarray(P, float)[:, :2]; a = P[:-1]; b = P[1:]; ab = b - a; l2 = (ab ** 2).sum(1) + 1e-12; w = np.array([u, v]) - a
    t = np.clip((w * ab).sum(1) / l2, 0, 1); q = a + ab * t[:, None]; dd = np.sqrt(((q - np.array([u, v])) ** 2).sum(1)); k = int(dd.argmin()); return float(dd[k]), k, float(t[k])
def yawW(h_deg):
    d = math.cos(math.radians(h_deg)) * T - math.sin(math.radians(h_deg)) * LN; return float(math.atan2(d[1], d[0]))
OWN = {'M3': (-380.0, -173.0), 'M4': (75.0, 420.0)}   # the far-side added lane of a ramp is the ramp's OWN exit / entry lane (the deck becomes that lane), not an obstacle for its own piers
def ring_edge(u, sgn, who=None):
    e = HW + BARS
    for a, b in RING_ADD[sgn]:
        if who in OWN and sgn == -1 and (a, b) == OWN[who]: continue
        if a <= u <= b: e = HW + LANE + BARS
    return e
def env_edge(side, d):
    if d < HW or d > 538: return HW + BARS
    ew = env(side, d)[0]; return HW + (ew if ew > 0 else BARS)

# plan clearance of a point (u, v) to every obstacle on the ground / below the ramp, edge to point (m), negative = inside; per obstacle name
def below(u, v, who):
    out = {}
    if abs(v) < MEDH: out['ring median'] = (MEDH - BARS) - abs(v)   # inside the ring median: clearance to the median barrier strip (carriageways are NOT under a median pier)
    else: out['ring'] = abs(v) - ring_edge(u, 1 if v >= 0 else -1, who) if abs(v) <= 80 else 999
    if v > HW - 1: out['stem'] = min(abs(u) - env_edge('out' if u >= 0 else 'in', v), 999)
    dA, _, _ = seg_d(A2S, u, v); out['A2S'] = dA - (LANE / 2 + BARS)
    dS, _, _ = seg_d(S2A, u, v); out['S2A'] = dS - (LANE / 2 + BARS)
    if who == 'M4': out['M3 deck'] = seg_d(P3, u, v)[0] - 4.85 - 1.5
    if who == 'M3': out['M4 deck'] = seg_d(P4, u, v)[0] - 4.85 - 1.5
    return out

# ------------------------------------------------------------------ ramp structures
def surf_under(nm, P, k_, off, R3_=None):
    hd = math.radians(P[k_, 2]); u = P[k_, 0] - math.sin(hd) * off; v = P[k_, 1] + math.cos(hd) * off; res = []
    if abs(v) <= HW + BARS: res.append(('ring', yR(u)))
    dA, kA, _ = seg_d(A2S, u, v)
    if dA <= LANE / 2 + BARS and v > HW: res.append(('A2S slip', float(A2S_Y[kA])))
    dS, kS, _ = seg_d(S2A, u, v)
    if dS <= LANE / 2 + BARS and v > HW: res.append(('S2A slip', float(S2A_Y[kS])))
    if v > HW and abs(u) <= HW + 0.2 and abs(u) < 25: res.append(('stem', yS(v)))
    if nm == 'M4' and R3_ is not None:
        d3, k3, _ = seg_d(P3, u, v)
        if d3 <= 4.85: res.append(('M3 deck', float(R3_['ys'][k3])))
    return res
def depth_of(L): return max(1.6, L / 22.0) if L <= SLIM_CONST else L / 33.0
def ramp(name, P, f, s0, s1, other_pts, y_end_narrow, R3_=None, med_pier=True):
    """P (u, v, heading, s) every 2 m; structure s0 .. s1 (RE-7); returns dict"""
    S_ = P[:, 3]; n = len(S_)
    ys = np.array([float(f(s)[0]) for s in S_]); g = np.array([ground(P[k, 0], P[k, 1]) for k in range(n)])
    ok_k = np.where((S_ >= s0 - 1e-6) & (S_ <= s1 + 1e-6))[0]
    wd0 = np.full(n, 9.7)
    Aav = np.full(n, 99.0)   # depth a crossing below allows at this sample: deck-to-surface - 5.5, over the whole deck width
    for k in range(n):
        for off in (-0.45 * wd0[k], 0.0, 0.45 * wd0[k]):
            for nm_, lev in surf_under(name, P, k, off, R3_): Aav[k] = min(Aav[k], float(ys[k]) - lev - VCLR)
    # candidate pier stations: every 2 m inside, column circle clear of every obstacle by GAP, tall enough
    cand = []
    for k in ok_k:
        if S_[k] - s0 < 6 or s1 - S_[k] < 6: continue
        u, v = float(P[k, 0]), float(P[k, 1]); cl = min(below(u, v, name).values())
        if cl - RC < GAP: continue
        if ys[k] - 1.6 - g[k] < 2.0: continue            # the deck is too low there for a pier (at grade)
        cand.append(k)
    # D8 revised: one pier is FORCED in the ring median, at the sample where the ramp axis is nearest to the ring axis (v = 0)
    Sf = None
    if med_pier:
        kv = [k for k in ok_k if abs(P[k, 1]) < 12.0]
        kf = min(kv, key=lambda k: abs(P[k, 1]))
        Sf = float(S_[kf])
        if kf not in cand: cand.append(kf)   # must pass S2 (printed): column face >= GAP from the median barrier strip
    cand = np.array(sorted(cand), int)
    nodes = [ok_k[0]] + list(cand) + [ok_k[-1]]
    def dp(smax):
        INF = 1e18; m = len(nodes); cost = [INF] * m; prv = [-1] * m; cost[0] = 0.0
        for j in range(1, m):
            for i in range(j):
                if cost[i] >= INF: continue
                L = S_[nodes[j]] - S_[nodes[i]]
                if L < SPAN_MIN or (L > smax): continue
                if Sf is not None and S_[nodes[i]] < Sf - 1e-6 and S_[nodes[j]] > Sf + 1e-6: continue   # no span may jump over the forced median pier
                am = float(Aav[nodes[i]:nodes[j] + 1].min()); c = cost[i] + (L - SPAN_T) ** 2 + VPEN * max(0.0, depth_of(L) - am)
                if c < cost[j]: cost[j] = c; prv[j] = i
        if cost[m - 1] >= INF: return None
        path = []; j = m - 1
        while j >= 0: path.append(nodes[j]); j = prv[j]
        return path[::-1]
    smax = SPAN_MAX; path = dp(smax)
    while path is None and smax < 120: smax += 5; path = dp(smax)   # raised stepwise; only the ring crossing needs it (see D8)
    if path is None: return dict(name=name, error='no pier layout up to 120 m span')
    sup = [float(S_[k]) for k in path]; spans = [sup[i + 1] - sup[i] for i in range(len(sup) - 1)]
    # girder depth per sample (constant for short spans, haunched for long ones)
    depth = np.zeros(n); spn = np.zeros(n)
    for k in range(n):
        s = S_[k]
        if s < sup[0] or s > sup[-1]: depth[k] = np.nan; continue
        i = min(max(np.searchsorted(sup, s, side='right') - 1, 0), len(spans) - 1); L = spans[i]; x = (s - 0.5 * (sup[i] + sup[i + 1])) / (0.5 * L); spn[k] = L
        depth[k] = depth_of(L)
    wdt = np.full(n, 9.7)
    for k in range(n):
        s = S_[k]
        if y_end_narrow[0] is not None and y_end_narrow[0] <= s <= y_end_narrow[1]: wdt[k] = 9.7 - (9.7 - RW_N) * (s - y_end_narrow[0]) / (y_end_narrow[1] - y_end_narrow[0])
        elif y_end_narrow[1] is not None and s > y_end_narrow[1]: wdt[k] = RW_N
    soff = ys - depth
    piers = []
    for s in sup[1:-1]:
        k = int(np.argmin(np.abs(S_ - s))); u, v, h = float(P[k, 0]), float(P[k, 1]), float(P[k, 2]); x, z = world(u, v)
        capb = min(wdt[k] - 1.0, 8.7); fy = g[k] - EMBED; capy = soff[k] - CAPH
        piers.append(dict(s=round(s, 1), x=round(float(x), 2), z=round(float(z), 2), yaw=round(yawW(h), 4), u=round(u, 2), v=round(v, 2), deckY=round(float(ys[k]), 3), soffitY=round(float(soff[k]), 3), capY=round(float(capy), 3), footY=round(float(fy), 3),
                          colH=round(float(capy - fy), 2), clearH=round(float(capy - g[k]), 2), foot=[COLA, COLB], top=[TOPA, TOPB], cap=[CAPA, round(capb, 2), CAPH], width=round(float(wdt[k]), 2)))
    abut = []
    for s in (sup[0], sup[-1]):
        k = int(np.argmin(np.abs(S_ - s))); u, v, h = float(P[k, 0]), float(P[k, 1]), float(P[k, 2]); x, z = world(u, v)
        abut.append(dict(s=round(s, 1), x=round(float(x), 2), z=round(float(z), 2), yaw=round(yawW(h), 4), deckY=round(float(ys[k]), 3), seatY=round(float(soff[k]), 3), botY=round(float(min(soff[k] - 1.0, g[k] - 2.0)), 3), thick=3.2, width=round(float(wdt[k]) - 0.6, 2), groundY=round(float(g[k]), 2)))
    return dict(name=name, s0=sup[0], s1=sup[-1], P=P, S=S_, ys=ys, g=g, depth=depth, spn=spn, wdt=wdt, soff=soff, piers=piers, abut=abut, spans=spans, smax_used=smax, ncand=len(cand))

def s_of_u(P, u_target):
    k = np.where(P[:, 0] >= u_target)[0]; return float(P[k[0], 3]) if len(k) else float(P[-1, 3])
R3 = ramp('M3', P3, lambda s: f3(s), 8.0, 350.5, P4, (float(P3[-1, 3]) - NARROW, float(P3[-1, 3])))
s_u75 = s_of_u(P4[P4[:, 1] < -20], 75.0)
R4 = ramp('M4', P4, lambda s: f4(s), 0.0, 533.0, P3, (s_u75 - NARROW, s_u75), R3)
for R_ in (R3, R4):
    if 'error' in R_: Q('ERROR ' + R_['name'] + ': ' + R_['error']); sys.exit(1)

# ------------------------------------------------------------------ arm viaduct widening (D1): cantilever wing or own wedge
def wedge(key, zone):
    side = 'out' if key.startswith('out') else 'in'; sg = 1 if side == 'out' else -1
    lo, hi = zone['window']; d0, d1 = zone['d_range']; ds = np.arange(d0, d1 + 0.01, 4.0)
    if ds[-1] < d1 - 1e-6: ds = np.r_[ds, d1]
    w = np.array([max(0.0, env(side, d)[0]) for d in ds]); net = np.maximum(0.0, w - (ARM_DECK_HALF - HW))
    part = ['approach' if (d < lo + STRUCT_APPROACH or d > hi - STRUCT_APPROACH) else 'main' for d in ds]
    mainnet = max([net[i] for i in range(len(ds)) if part[i] == 'main'] + [0.0])
    kind = 'cantilever wing' if mainnet <= CANT_MAX else 'own wedge on columns'
    y = np.array([yS(d) for d in ds]); uc = HW + w / 2
    pts = [world(sg * uc[i], ds[i]) for i in range(len(ds))]
    gnd_o = np.array([ground(sg * (HW + w[i]), ds[i]) for i in range(len(ds))])
    rec = dict(key=key, side=side, window=[lo, hi], d0=float(ds[0]), d1=float(ds[-1]), kind=kind, ds=ds, w=w, net=net, part=part, y=y, uc=uc, pts=pts, g_out=gnd_o, sg=sg)
    am0, am1 = lo + STRUCT_APPROACH, hi - STRUCT_APPROACH
    rec['abut_d'] = [am0, am1]
    if kind == 'cantilever wing':
        rec['wing_t'] = [round(WING_T0 + WING_K * float(x), 2) for x in net]
        rec['piers'] = []
    else:
        i0 = [i for i in range(len(ds)) if part[i] == 'main']; a, b = ds[i0[0]], ds[i0[-1]]
        n_sp = max(1, int(math.ceil((b - a) / WEDGE_SPAN_MAX - 1e-9))); sup = [a + (b - a) * i / n_sp for i in range(n_sp + 1)]
        L = (b - a) / n_sp; dep = max(1.6, L / 22.0)
        piers = []
        for dd_ in sup[1:-1]:
            wi = float(np.interp(dd_, ds, w)); u = sg * (HW + wi / 2); x, z = world(u, dd_); yy = float(np.interp(dd_, ds, y)); gg = ground(u, dd_); capy = yy - dep - CAPH
            piers.append(dict(d=round(dd_, 1), x=round(float(x), 2), z=round(float(z), 2), yaw=round(yawW(90.0 if side == 'out' else 90.0), 4), u=round(u, 2), v=round(dd_, 2), deckY=round(yy, 3), soffitY=round(yy - dep, 3), capY=round(capy, 3), footY=round(gg - EMBED, 3),
                              colH=round(capy - gg + EMBED, 2), clearH=round(capy - gg, 2), foot=[COLA, COLB], top=[TOPA, TOPB], cap=[CAPA, round(min(wi - 1.0, 8.7), 2), CAPH], width=round(wi, 2)))
        rec['piers'] = piers; rec['spans'] = [L] * n_sp; rec['depth'] = dep
        # approach parts: retaining wall under the outer edge
    rec['wall'] = [dict(d=round(float(ds[i]), 1), h=round(float(y[i] - (DECK_DEPTH_ARM if part[i] == 'approach' else 0) - gnd_o[i]), 2)) for i in range(len(ds)) if part[i] == 'approach']
    return rec
WED = {k: wedge(k, z) for k, z in ZONES.items()}

# ------------------------------------------------------------------ report
Q('RE-8 STRUCTURES  RT-E.  Ramp bridges M3 / M4 and arm viaduct widening as DATA (deck, girder, pier, abutment). No mesh. Natural ground, ring and arm profile / structure FIXED, left-hand traffic, Config switch OFF (RE-9).')
Q(D7)
Q(D8)
Q(f'Numbers (ASSUMED unless a source is named): pier gap to a road below {GAP} m (= roadRailBuffer.pierToDeckEdge), column foot {COLA} x {COLB} m, top {TOPA} x {TOPB}, cap {CAPA} x (deck - 1.0, max 8.7) x {CAPH} m, footing {EMBED} m below ground; span target {SPAN_T:.0f} / min {SPAN_MIN:.0f} / max {SPAN_MAX:.0f} m; girder depth L / 22 (min 1.6) up to {SLIM_CONST:.0f} m, composite box L / 33 above (D8); cantilever wing limit {CANT_MAX} m; arm existing deck half width {ARM_DECK_HALF} m (ASSUMED, not read from the game); approach slab {STRUCT_APPROACH:.0f} m (STRUCT.approach); ramp deck narrows 9.7 -> {RW_N} m in the last {NARROW:.0f} m (RE-6 convention).')
Q('')
for R_ in (R3, R4):
    Q(f"{R_['name']}: structure s {R_['s0']:.1f} .. {R_['s1']:.1f} ({R_['s1'] - R_['s0']:.1f} m), {len(R_['piers'])} piers, {len(R_['spans'])} spans, longest {max(R_['spans']):.1f} m (span limit used {R_['smax_used']:.0f} m), tallest pier {max(p['colH'] for p in R_['piers']):.1f} m (clear height {max(p['clearH'] for p in R_['piers']):.1f} m), girder depth {np.nanmin(R_['depth']):.2f} .. {np.nanmax(R_['depth']):.2f} m, deck {np.nanmax(R_['wdt']):.1f} -> {np.nanmin(R_['wdt']):.1f} m")
    Q('   spans (m): ' + ', '.join(f'{x:.1f}' for x in R_['spans']))
    Q('   piers (s / u / v / deck level / column height): ' + '; '.join(f"{p['s']:.0f} ({p['u']:.0f}, {p['v']:.0f}) {p['deckY']:.1f} h{p['colH']:.1f}" for p in R_['piers']))
    Q('   abutments: ' + '; '.join(f"s {a['s']:.1f} deck {a['deckY']:.2f} ground {a['groundY']:.2f}" for a in R_['abut']))
Q('')
Q('ARM VIADUCT WIDENING (D1): kind per wedge')
for k, r in WED.items():
    Q(f"  {k}: d {r['d0']:.0f}..{r['d1']:.0f}, viaduct window {r['window'][0]}..{r['window'][1]} (approach slabs d {r['window'][0]}..{r['abut_d'][0]:.0f} and {r['abut_d'][1]:.0f}..{r['window'][1]}), width {r['w'][0]:.2f} -> {r['w'][-1]:.2f} m from the paved edge (net of the existing deck edge {r['net'][0]:.2f} -> {r['net'][-1]:.2f} m), kind: {r['kind']}" + (f", wing slab {r['wing_t'][0]:.2f} m at the root" if r['kind'] == 'cantilever wing' else f", {len(r['piers'])} column(s) at d " + ', '.join(f"{p['d']:.0f}" for p in r['piers']) + f", {len(r['spans'])} spans of {r['spans'][0]:.1f} m, box depth {r['depth']:.2f} m, column clear height " + ', '.join(f"{p['clearH']:.1f}" for p in r['piers']) + ' m'))
    ap = [x for x in r['wall'] if x['h'] > 0]
    if ap: Q(f"     approach slabs on the embankment: retaining wall under the outer edge up to {max(x['h'] for x in ap):.1f} m high over {len(ap) * 4} m (4 m samples)")
Q('')

# ------------------------------------------------------------------ checks
allp = [(R_['name'], p) for R_ in (R3, R4) for p in R_['piers']] + [(f'wedge {k}', p) for k, r in WED.items() for p in r['piers']]
# S1 spans: normal spans <= 70 m; the one span per ramp over the ring is forced by the plan crossing (D8)
def forced(R_):
    return [x for x in R_['spans'] if x > SPAN_MAX]
nrm = [x for R_ in (R3, R4) for x in R_['spans'] if x <= SPAN_MAX]
C(f'S1 every span except the ring-crossing spans <= {SPAN_MAX:.0f} m', max(nrm) <= SPAN_MAX + 1e-6, f"longest normal span {max(nrm):.1f} m (M3 {max([x for x in R3['spans'] if x <= SPAN_MAX]):.1f}, M4 {max([x for x in R4['spans'] if x <= SPAN_MAX]):.1f})")
fr = forced(R3) + forced(R4)
C('S1b no span over 70 m any more: no forced ring-crossing span (D8 revised: one pier per ramp in the ring median)', len(fr) == 0, f"M3 spans {', '.join(f'{x:.1f}' for x in R3['spans'])}; M4 spans {', '.join(f'{x:.1f}' for x in R4['spans'])}")
for R_ in (R3, R4):
    mp = [p for p in R_['piers'] if abs(p['v']) < MEDH]
    C(f"S1c {R_['name']} has exactly one pier in the ring median (|v| < {MEDH} m, on the ring axis side by side with the other ramp's median pier)", len(mp) == 1, ', '.join(f"s {p['s']:.0f} u {p['u']:.1f} v {p['v']:.2f} deck {p['deckY']:.1f} column {p['colH']:.1f} m" for p in mp))
# S2 pier plan clearance to every road below / beside
worst = (999, '')
for nm, p in allp:
    if nm.startswith('wedge'): continue
    cl = min(below(p['u'], p['v'], nm).items(), key=lambda kv: kv[1]); worst = min(worst, (cl[1] - RC, f"{nm} pier s {p['s']:.0f} to {cl[0]}"))
C(f'S2 every ramp pier column face is >= {GAP} m from the barrier strip of every road / slip / other ramp below', worst[0] >= GAP - 1e-6, f'tightest {worst[0]:.2f} m ({worst[1]})')
# S3 vertical clearance over every crossed road (soffit above the surface below)
CL = {}
for R_ in (R3, R4):
    for k_ in range(len(R_['S'])):
        if not (R_['s0'] <= R_['S'][k_] <= R_['s1']) or np.isnan(R_['depth'][k_]): continue
        for off in (-0.45 * R_['wdt'][k_], 0.0, 0.45 * R_['wdt'][k_]):
            for nm_, lev in surf_under(R_['name'], R_['P'], k_, off, R3):
                c_ = float(R_['soff'][k_] - lev); key = (R_['name'], nm_)
                if key not in CL or c_ < CL[key][0]: CL[key] = (c_, float(R_['S'][k_]), float(R_['depth'][k_]), float(R_['ys'][k_] - lev))
SHORT = {}
for (a, b), (c_, s_, dp_, dk) in sorted(CL.items()):
    C(f'S3 {a} over {b}: underside above the road surface >= {VCLR} m (5.5 + real girder depth)', c_ >= VCLR - 1e-6, f'{c_:.2f} m clear at s {s_:.0f} (deck-to-surface {dk:.2f} m, girder {dp_:.2f} m there)')
    if c_ < VCLR - 1e-6: SHORT[(a, b)] = (VCLR - c_, s_)
for (a, b), (sh, s_) in SHORT.items():
    Q(f'   -> {a} over {b}: short by {sh:.2f} m at s {s_:.0f}. Profiles are RE-4 / RE-5 outputs and are NOT changed in RE-8 (only RE-8 was ordered). FIX (proposal D8c, NOT applied): raise the upper deck by about {sh + 0.05:.2f} m there, i.e. a re-run of the ramp solve; M4 has grade budget (max 3.82 % of 5 %, RE-5), ring / S2A clearances only grow, M3 stays as it is.')
# S4 column heights
hmax = max(p['colH'] for _, p in allp)
C(f'S4 every column <= {PIER_MAX_H:.0f} m tall (ASSUMED limit)', hmax <= PIER_MAX_H, f'tallest {hmax:.1f} m')
# S5 pier-to-pier separation between the structures
dmin = 999; who = ''
for i in range(len(allp)):
    for j in range(i + 1, len(allp)):
        if allp[i][0] == allp[j][0]: continue
        dd_ = math.hypot(allp[i][1]['u'] - allp[j][1]['u'], allp[i][1]['v'] - allp[j][1]['v'])
        if dd_ < dmin: dmin = dd_; who = f"{allp[i][0]} s/d {allp[i][1].get('s', allp[i][1].get('d')):.0f} / {allp[j][0]} s/d {allp[j][1].get('s', allp[j][1].get('d')):.0f}"
C('S5 piers of different structures >= 6 m apart in plan (ASSUMED)', dmin >= 6.0, f'closest {dmin:.1f} m ({who})')
# S6 wedges
for k, r in WED.items():
    mainnet = max([r['net'][i] for i in range(len(r['ds'])) if r['part'][i] == 'main'] + [0.0])
    if r['kind'] == 'cantilever wing': C(f'S6 {k}: cantilever wing, largest net overhang on the main span <= {CANT_MAX} m (ASSUMED limit)', mainnet <= CANT_MAX, f'{mainnet:.2f} m (the existing deck edge and its capacity to carry a wing are NOT checked)')
    else: C(f'S6 {k}: own wedge on columns, every span <= {WEDGE_SPAN_MAX:.0f} m (VI.spanLong)', max(r['spans']) <= WEDGE_SPAN_MAX + 1e-6, f"{len(r['spans'])} spans of {r['spans'][0]:.1f} m, {len(r['piers'])} column(s)")
    wl = max([x['h'] for x in r['wall']] + [0.0])
    C(f'S6b {k}: retaining wall under the approach-slab wedge <= {WALL_MAX_ST:.0f} m (ASSUMED limit, as RE-7 T3)', wl <= WALL_MAX_ST, f'{wl:.1f} m')
# S7 rail: every new pier >= 30 m (D3) from the rail line
rmin = min([rail_d(p['u'], p['v']) for _, p in allp] + [999.0]); rw = min([(rail_d(p['u'], p['v']), nm) for nm, p in allp] + [(999.0, '')])
C(f'S7 every NEW pier is >= {RAIL_CLEAR:.0f} m from the rail centre line (D3)', rw[0] >= RAIL_CLEAR, f'nearest {rw[0]:.0f} m ({rw[1]})')
# S8 rail: the widened deck over the rail, vertical (Config roadOverRail 9.0) and electrification margin
ov = []
for k, r in WED.items():
    for i, d in enumerate(r['ds']):
        if r['w'][i] < 0.05: continue
        u0, u1 = r['sg'] * HW, r['sg'] * (HW + r['w'][i])
        for uu in np.linspace(u0, u1, 5):
            rd_ = rail_d(float(uu), float(d))
            if rd_ <= 14.0: ov.append((k, float(d), float(uu), rd_))
dmn = {}
for k, d, uu, rd_ in ov: dmn.setdefault(k, []).append(d)
if ov:
    Q('Widened deck footprint over the rail row (rail centre line <= 14 m, RAIL_DESIGN.rowHalf): ' + '; '.join(f"{k} d {min(v):.0f}..{max(v):.0f}" for k, v in dmn.items()))
    clr = []; wire = []
    for k, d, uu, rd_ in ov:
        lv = rail_level(uu, d); ys_ = yS(d); clr.append((ys_ - lv, k, d)); wire.append(ys_ - DECK_DEPTH_ARM - (lv + RAIL_WIRE))
    cm = min(clr); wm = min(wire)
    C(f'S8 road over rail: wedge surface above the top of rail >= {RAIL_OVER} m (Config roadRailBuffer.roadOverRail)', cm[0] >= RAIL_OVER, f'{cm[0]:.2f} m at {cm[1]} d {cm[2]:.0f} (rail level there {rail_level(0, cm[2]):.2f})')
    C(f'S8b deck underside above the messenger wire >= {WIRE_MARGIN} m (ASSUMED margin; underside = surface - {DECK_DEPTH_ARM} m)', wm >= WIRE_MARGIN, f'{wm:.2f} m')
    npier_row = sum(1 for _, p in allp if rail_d(p['u'], p['v']) <= 14 + COLA)
    C('S8c no new column inside the rail row (14 m + column) - the widened deck has no pier over the rail', npier_row == 0, f'{npier_row} columns')
else:
    C('S8 widened deck over the rail', True, 'no footprint over the rail row', tag='PASS')
ncol_v2 = sum(1 for k, r in WED.items() for p in r['piers'] if ARM_VIA2[0] <= p['d'] <= ARM_VIA2[1])
C(f'S8d the arm viaduct {ARM_VIA2[0]}..{ARM_VIA2[1]} (rail crossing d ~463, arm within 30 m of the rail on d 403..523) gets NO new column: the widening there is a cantilever wing / approach slab', ncol_v2 == 0, f'{ncol_v2} new columns on d {ARM_VIA2[0]}..{ARM_VIA2[1]}')
hab = max(a['seatY'] - a['botY'] for R_ in (R3, R4) for a in R_['abut'])
C(f'S9 ramp abutment walls <= {WALL_MAX_ST:.0f} m high (ASSUMED limit, as RE-7 T3)', hab <= WALL_MAX_ST, f'highest {hab:.1f} m (M3 ends {R3["abut"][0]["groundY"]:.1f} / {R3["abut"][1]["groundY"]:.1f} m ground, M4 ends {R4["abut"][0]["groundY"]:.1f} / {R4["abut"][1]["groundY"]:.1f} m ground)')
# S9 wedge deck length within 30 m of the rail (existing d 403..523) - info
inf = [(k, float(d)) for k, r in WED.items() for d in r['ds'] if min(rail_d(r['sg'] * (HW + r['w'][i] / 2), float(d)) for i in [list(r['ds']).index(d)]) <= RAIL_CLEAR]
if inf:
    byk = {}
    for k, d in inf: byk.setdefault(k, []).append(d)
    Q('INFO  wedge deck within 30 m of the rail (the arm itself is there, existing): ' + '; '.join(f"{k} d {min(v):.0f}..{max(v):.0f}" for k, v in byk.items()) + ' - all of it is a cantilever wing or approach slab, no column')
# S10 M3 end vs wedge start, M4 start vs viaduct1 end (info)
Q(f"INFO  M3 last abutment (s {R3['s1']:.1f}, nose d 151) stands {WED['out_viaduct1']['d0'] - 151:.0f} m before the first wedge (d {WED['out_viaduct1']['d0']:.0f}); M4 first abutment is the gore d 275, {275 - 271:.0f} m after the end of viaduct 160..271.")
Q('')
Q('ASSUMED  the M3 exit lane (ring B, u -380 .. -173) and the M4 entry lane (u 75 .. 420) are carried ON the ramp deck (the deck is that lane + shoulders at its end), so they are not an obstacle for the ramp\'s own piers; RE-5 / RE-6 give these lanes as lengths only (ramp axis v -28.45 vs lane centre v -23.925), the plan relation of deck and lane is NOT drawn.')
Q('ASSUMED  every number marked ASSUMED above (pier, girder and wing sizes, span limits, existing deck half width 22.4 m, 1.0 m wire margin, 6 m pier separation, 25 m column limit)')
Q('NOT RUN  structural design: loads, bending / shear, bearings, expansion joints, wing capacity of the existing arm deck, pile / footing design (EMBED 3 m is a placeholder), seismic; construction staging over the live ring; rail pier positions (the rail builder places them at game start, no headless data); gore / nose geometry of the abutments; drainage of the decks (T6 flats: deck drains, RE-9); girder depth of the existing arm deck (1.5 m from STRUCT.deckDepth); Validate.ts; full tsc / npm run build (only RteStructData.ts compiled with tsc --strict); the game; carved ground; trees; ring median U-turn openings.')

# ------------------------------------------------------------------ outputs
def r2(x, n=2): return round(float(x), n)
def ramp_out(R_):
    P = R_['P']; keep = [k for k in range(len(P)) if R_['s0'] - 1e-6 <= R_['S'][k] <= R_['s1'] + 1e-6 and k % 2 == 0 or k == int(np.argmin(np.abs(R_['S'] - R_['s1'])))]
    xs = [world(P[k, 0], P[k, 1]) for k in keep]
    return dict(name=R_['name'], s0=R_['s0'], s1=R_['s1'], s=[r2(R_['S'][k], 1) for k in keep], x=[r2(a[0]) for a in xs], z=[r2(a[1]) for a in xs], deckY=[r2(R_['ys'][k], 3) for k in keep], soffitY=[r2(R_['soff'][k], 3) for k in keep], depth=[r2(R_['depth'][k], 2) for k in keep],
                width=[r2(R_['wdt'][k], 2) for k in keep], groundY=[r2(R_['g'][k], 2) for k in keep], spans=[r2(x_, 1) for x_ in R_['spans']], piers=R_['piers'], abutments=R_['abut'])
def wedge_out(r):
    return dict(key=r['key'], side=r['side'], kind=r['kind'], window=r['window'], approach=STRUCT_APPROACH, d=[r2(x, 1) for x in r['ds']], x=[r2(p[0]) for p in r['pts']], z=[r2(p[1]) for p in r['pts']], deckY=[r2(x, 3) for x in r['y']], width=[r2(x) for x in r['w']], netWidth=[r2(x) for x in r['net']],
                part=r['part'], innerU=HW, uCentre=[r2(x) for x in r['uc']], wingT=r.get('wing_t'), boxDepth=r.get('depth'), spans=[r2(x, 1) for x in r.get('spans', [])], piers=r['piers'], abutD=r['abut_d'] if r['kind'] != 'cantilever wing' else None, wall=r['wall'])
J = dict(frame='world x, z (game frame); u along ring, v toward stem (= d on the stem); world = J + u*t - v*ln', J=[JX, JZ], t=T.tolist(), ln=LN.tolist(), decision=D7, ramps=[ramp_out(R3), ramp_out(R4)], wedges=[wedge_out(r) for r in WED.values()],
         params=dict(gap=GAP, col=[COLA, COLB], top=[TOPA, TOPB], capH=CAPH, capA=CAPA, embed=EMBED, span=[SPAN_MIN, SPAN_T, SPAN_MAX], cantMax=CANT_MAX, armDeckHalf=ARM_DECK_HALF, approach=STRUCT_APPROACH, armDeckDepth=DECK_DEPTH_ARM), checks=[dict(t=t, r=s, n=n) for t, s, n in chk])
json.dump(J, open(f'{OD}/RTE_STRUCT.json', 'w'), indent=1, default=float); open(f'{OD}/RTE_STRUCT.txt', 'w').write('\n'.join(LOG8) + '\n')
ts = ['// GENERATED by tools/rte-struct.py (STEP RE-8). Do not edit: rerun the script (sources docs/rte_site.json, RTE_LEVELS.json, RTE_SLIPS.json).',
      '// RT-E structures as data: ramp bridges M3 / M4 (deck, girder depth, piers, abutments) and the arm viaduct widening wedges (cantilever wing or own wedge on columns). World x, z, levels in m. Config switch NOT wired yet (RE-9). Data only, not imported by the game.',
      'export interface RtePier { s?: number; d?: number; x: number; z: number; yaw: number; u: number; v: number; deckY: number; soffitY: number; capY: number; footY: number; colH: number; clearH: number; foot: number[]; top: number[]; cap: number[]; width: number }',
      'export interface RteAbutment { s: number; x: number; z: number; yaw: number; deckY: number; seatY: number; botY: number; thick: number; width: number; groundY: number }',
      'export interface RteRampStruct { name: string; s0: number; s1: number; s: number[]; x: number[]; z: number[]; deckY: number[]; soffitY: number[]; depth: number[]; width: number[]; groundY: number[]; spans: number[]; piers: RtePier[]; abutments: RteAbutment[] }',
      'export interface RteWedgeStruct { key: string; side: string; kind: string; window: number[]; approach: number; d: number[]; x: number[]; z: number[]; deckY: number[]; width: number[]; netWidth: number[]; part: string[]; innerU: number; uCentre: number[]; wingT: number[] | null; boxDepth: number | null; spans: number[]; piers: RtePier[]; abutD: number[] | null; wall: { d: number; h: number }[] }',
      'export const RTE_STRUCT_PARAMS = ' + json.dumps(J['params'], separators=(',', ':')) + ';',
      'export const RTE_RAMP_STRUCTS: RteRampStruct[] = ' + json.dumps(J['ramps'], separators=(',', ':'), default=float) + ';',
      'export const RTE_WEDGE_STRUCTS: RteWedgeStruct[] = ' + json.dumps(J['wedges'], separators=(',', ':'), default=float) + ';',
      'export const RTE_STRUCT_FRAME = ' + json.dumps(dict(J=J['J'], t=J['t'], ln=J['ln']), separators=(',', ':')) + ';']
open('src/roads/junction/RteStructData.ts', 'w', newline='').write('\r\n'.join(ts) + '\r\n')

fig, axs = plt.subplots(2, 2, figsize=(18, 13), gridspec_kw=dict(height_ratios=[1.5, 1]))
ax = axs[0, 0]; ax.fill_between([-500, 600], -HW, HW, color='#bbb'); ax.fill_betweenx([HW, 700], -HW, HW, color='#bbb'); ax.plot(Rail[:, 0], Rail[:, 1], color='brown', lw=2, label='rail'); ax.add_patch(plt.Circle((0, 0), 1, color='k'))
for R_, c in ((R3, 'tab:red'), (R4, 'tab:blue')):
    P = R_['P']; m = (R_['S'] >= R_['s0']) & (R_['S'] <= R_['s1']); ax.plot(P[m, 0], P[m, 1], color=c, lw=3, label=R_['name'] + ' deck')
    ax.plot([p['u'] for p in R_['piers']], [p['v'] for p in R_['piers']], 's', color=c, ms=7, mec='k')
for r in WED.values():
    for i in range(len(r['ds']) - 1): ax.plot([r['sg'] * HW, r['sg'] * (HW + r['w'][i])], [r['ds'][i], r['ds'][i]], color='orange', lw=1)
    ax.plot([p['u'] for p in r['piers']], [p['v'] for p in r['piers']], 'o', color='orange', ms=8, mec='k')
for lo, hi in (ARM_VIA, ARM_VIA2): ax.add_patch(plt.Rectangle((-HW - 4, lo), 2 * HW + 8, hi - lo, fill=False, ec='m', lw=1.2, ls='--'))
ax.plot(A2S[:, 0], A2S[:, 1], 'g-', lw=1.5, label='A2S'); ax.plot(S2A[:, 0], S2A[:, 1], 'c-', lw=1.5, label='S2A')
ax.set_aspect('equal'); ax.set_xlim(-500, 600); ax.set_ylim(-100, 700); ax.legend(fontsize=8, loc='upper right'); ax.set_title('RE-8 plan: ramp decks, piers (squares), wedge piers (circles), widened viaduct wedges (orange)'); ax.set_xlabel('u (m)'); ax.set_ylabel('v / d (m)'); ax.grid(alpha=.3)
ax = axs[0, 1]
for r in WED.values():
    ax.fill_between(r['ds'], 0, r['w'] * r['sg'] * (1 if r['sg'] > 0 else 1), alpha=.5, label=f"{r['key']} ({r['kind']})")
ax.axvspan(403, 523, color='brown', alpha=.15, label='arm within 30 m of rail'); ax.axvline(463, color='brown', ls=':')
for lo, hi in (ARM_VIA, ARM_VIA2): ax.axvspan(lo, hi, color='m', alpha=.07)
ax.set_title('RE-8 arm viaduct widening wedges (width from the paved edge, m; negative = inbound)'); ax.set_xlabel('d (m)'); ax.legend(fontsize=7); ax.grid(alpha=.3)
for j, R_ in enumerate((R3, R4)):
    ax = axs[1, j]; m = (R_['S'] >= R_['s0']) & (R_['S'] <= R_['s1']); ax.plot(R_['S'][m], R_['ys'][m], 'k-', lw=2, label='deck level'); ax.plot(R_['S'][m], R_['soff'][m], 'r-', lw=1.5, label='girder soffit'); ax.plot(R_['S'][m], R_['g'][m], color='green', label='natural ground')
    for p in R_['piers']: ax.plot([p['s'], p['s']], [p['footY'], p['capY']], color='gray', lw=5)
    for a in R_['abut']: ax.plot([a['s'], a['s']], [a['botY'], a['seatY']], color='k', lw=7)
    ax.set_title(f"{R_['name']} long section ({len(R_['piers'])} piers, longest span {max(R_['spans']):.0f} m)"); ax.set_xlabel('s (m)'); ax.set_ylabel('level (m)'); ax.legend(fontsize=8); ax.grid(alpha=.3)
plt.tight_layout(); plt.savefig(f'{OD}/rte_struct.png', dpi=100); print('written')
