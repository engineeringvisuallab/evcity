// STEP HK-9c-2 sub-step 1: the 8 pieces (4 C-D roads + 4 slips) as DATA in the local frame of the node (x east along the ring, y north along the arm). NO src change.
// Run: HK=1 npx tsx scripts/hk-ring-run.ts hk-cd-roads   -> docs/HK_CD_ROADS.txt, docs/hk_cd_roads.json
import { readFileSync, writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { hkFrame, hkWorld } from '../src/roads/ring/HkRamps';
import { HK_LOOPS } from '../src/roads/ring/HkRampData';
const out: string[] = []; let fails = 0, warns = 0;
const say = (s: string): void => { out.push(s); console.log(s); };
const chk = (ok: boolean, n: string, d: string, warn = false): void => { if (!ok) { if (warn) warns++; else fails++; } say(`  ${ok ? 'PASS' : warn ? 'WARN' : 'FAIL'}  ${n.padEnd(72)} ${d}`); };
const f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const D = JSON.parse(readFileSync('docs/hk_cd_slips.json', 'utf8'));
const gen = new TerrainGenerator(Config.world.seed); const net: any = gen.roads;
const arm = net.roads.find((r: any) => r.name === 'J1-S'), link = net.roads.find((r: any) => r.name === 'M6-1'), ring = net.roads.find((r: any) => r.name === 'M8');
const f = hkFrame(net)!; if (!f) { say('FAIL frame missing (HK=1 needed)'); process.exit(1); }
const loc = (wx: number, wz: number): [number, number] => [(wx - f.ox) * f.ex + (wz - f.oz) * f.ez, (wx - f.ox) * f.nx + (wz - f.oz) * f.nz];
// axis tables in the local frame: lateral x and level as a function of local y (arm y >= 0, link y <= -25)
type Ax = { y: number[]; x: number[]; l: number[] };
const axisOf = (r: any): Ax => { const a = { y: [] as number[], x: [] as number[], l: [] as number[] }; for (let k = 0; k < r.xs.length; k++) { const [x, y] = loc(r.xs[k], r.zs[k]); a.y.push(y); a.x.push(x); a.l.push(r.ys[k]); } const idx = a.y.map((_, i) => i).sort((p, q) => a.y[p] - a.y[q]); return { y: idx.map((i) => a.y[i]), x: idx.map((i) => a.x[i]), l: idx.map((i) => a.l[i]) }; };
const A = axisOf(arm), L = axisOf(link);
const interp = (t: Ax, y: number, key: 'x' | 'l'): number => { let lo = 0, hi = t.y.length - 1; if (y <= t.y[0]) return t[key][0]; if (y >= t.y[hi]) return t[key][hi]; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t.y[m] <= y) lo = m; else hi = m; } const u = (y - t.y[lo]) / (t.y[hi] - t.y[lo] || 1); return t[key][lo] + (t[key][hi] - t[key][lo]) * u; };
// reference axis (lateral x, level) for any y: arm above 0, link below -25, straight blend between (under the deck)
const refX = (y: number): number => (y >= 0 ? interp(A, y, 'x') : y <= -24.95 ? interp(L, y, 'x') : interp(A, 0, 'x') * (1 + y / 24.95) + interp(L, -24.95, 'x') * (-y / 24.95));
const refL = (y: number): number => (y >= 0 ? interp(A, y, 'l') : y <= -24.95 ? interp(L, y, 'l') : interp(A, 0, 'l') * (1 + y / 24.95) + interp(L, -24.95, 'l') * (-y / 24.95));
// ---------- water check FIRST: natural ground at the node and along the corridors (water > h is wet) ----------
const o = { h: 0, water: NaN, fx: 0, fz: 0 } as any;
const nat = (x: number, y: number): { h: number; wet: boolean; wetG: boolean } => { const [wx, wz] = hkWorld(f, x, y); gen.sampleNatural(wx, wz, o); return { h: o.h, wet: !Number.isNaN(o.water) && o.water > o.h, wetG: !Number.isNaN(o.water) && o.h < o.water + 0.3 }; };
say('HK-9c-2 SUB-STEP 1: the 8 pieces as data (C-D roads + slips), local frame x east / y north, node = end of the J1-S arm. No src change.');
say('WATER CHECK FIRST (sc.water > sc.h on natural ground, 10 m samples) comes with every piece below.');
say(`Axis curvature (lateral x of the arm / link axis in the straight local frame): arm x(+100) ${f2(interp(A, 100, 'x'))}, (+367) ${f2(interp(A, 367, 'x'))}, (+607) ${f2(interp(A, 607, 'x'))}, (+667) ${f2(interp(A, 667, 'x'))}; link x(-76) ${f2(interp(L, -76.4, 'x'))}, (-367) ${f2(interp(L, -367.3, 'x'))}, (-657) ${f2(interp(L, -657.3, 'x'))}`);
// ---------- piece builders ----------
const sm = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
interface P { x: number; y: number }
interface Piece { id: string; dir: string; pts: P[]; lv: number[]; note: string }
const STEP = 4, ringK = 17.3, kerbA = 17.3, kerbL = 11.75, offA = 29.3, offL = 23.2, y1 = D.S + ringK, lead = 60, tN = D.tN, tS = D.tS, startY = 76.4;
const dOff = D.sbend.dOff, Rb = D.sbend.Rb, Lb = D.sbend.Lb;
// lateral offset (from the reference axis, positive east) of the C-D centreline along the whole corridor, for the east C-D (sign +1) / west C-D (sign -1); y from north to south
function cdOffset(sign: 1 | -1, y: number): number {
  // north side: arm kerb lane -> 29.3 over the exit (east, 180 m) / entry (west, 240 m); south side: 23.2 -> link kerb over entry (east, 230 m) / exit (west, 180 m)
  const north = sign === 1 ? { len: tN.exit } : { len: tN.entry }, south = sign === 1 ? { len: tS.entry } : { len: tS.exit };
  const yN0 = y1 + lead, yS0 = -(y1 + lead);
  if (y >= yN0) return sign * (kerbA + (offA - kerbA) * sm(1 - (y - yN0) / north.len));
  if (y <= yS0) return sign * (kerbL + (offL - kerbL) * sm(1 - (yS0 - y) / south.len));
  if (y >= 0) return sign * offA;
  // S-bend between the deck edge and the loop start: two reverse arcs R Rb, length Lb, ends at y = -startY
  const yb1 = -startY, yb0 = -startY + Lb; // y from yb0 (arm offset) to yb1 (link offset)
  if (y >= yb0) return sign * offA;
  if (y <= yb1) return sign * offL;
  const t = (yb0 - y), half = Lb / 2, th = Math.asin(Math.min(1, half / Rb)); void th;
  const a = Math.min(t, Lb - t); const lat = Rb - Math.sqrt(Math.max(0, Rb * Rb - a * a)); // lateral of one arc at longitudinal a from its start
  const shift = t <= half ? lat : dOff - lat;
  return sign * (offA - shift);
}
function cd(id: string, sign: 1 | -1, yA: number, yB: number, dir: string, note: string): Piece {
  const n = Math.max(2, Math.ceil(Math.abs(yA - yB) / STEP)), pts: P[] = [], lv: number[] = [];
  for (let i = 0; i <= n; i++) { const y = yA + (yB - yA) * i / n; pts.push({ x: refX(y) + cdOffset(sign, y), y }); lv.push(refL(y)); }
  return { id, dir, pts, lv, note };
}
const pieces: Piece[] = [];
const P = (id: string): Piece => pieces.find((q) => q.id === id)!;
const last = (id: string): P => P(id).pts[P(id).pts.length - 1], first = (id: string): P => P(id).pts[0];
pieces.push(cd('CD-E-N', 1, 607.3, 0, 'southbound (arm exit -> deck)', 'exit taper 180 m (1:15), lead 60 m, slip NE diverges at y 367.3, NE loop merges at y 76.4'));
pieces.push(cd('CD-E-S', 1, 0, -657.3, 'southbound (deck -> link entry)', 'under the deck, S-bend R 93.7 m, SE loop diverges at y -76.4, SE slip merges at y -367.3, lead 60 m, entry taper 230 m (1:20)'));
pieces.push(cd('CD-W-N', -1, 0, 667.3, 'northbound (deck -> arm entry)', 'NW loop diverges at y 76.4 (merge back), NW slip merges at y 367.3, lead 60 m, entry taper 240 m (1:20)'));
pieces.push(cd('CD-W-S', -1, -607.3, 0, 'northbound (link exit -> deck)', 'exit taper 180 m, SW slip diverges at y -367.3, SW loop merges at y -76.4, S-bend, under the deck'));
// slips: data = x / y from the C-D end to the ring lane (HK-5c); the slip starts on the (curved) axis offset: shift the whole slip by the lateral axis x at its C-D end and fade the shift to 0 over the length so the ring end stays on the ring lane
function slip(id: string, data: P[], mirror: boolean, reverse: boolean, yRef: number, dir: string, note: string): Piece {
  const pts: P[] = data.map((p) => ({ x: mirror ? -p.x : p.x, y: p.y })), dx0 = refX(yRef);
  const nn = pts.length - 1; const cum: number[] = [0]; for (let i = 1; i <= nn; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const sh = pts.map((_, i) => ({ x: pts[i].x + dx0 * (1 - cum[i] / cum[nn]), y: pts[i].y }));
  // level: smoothstep between the arm / link level at the C-D end and the ring level at the ring end
  const rl = ((): number => { const [wx, wz] = hkWorld(f, sh[nn].x, sh[nn].y); let bi = 0, bd = 1e18; for (let k = 0; k < ring.xs.length; k++) { const d = Math.hypot(ring.xs[k] - wx, ring.zs[k] - wz); if (d < bd) { bd = d; bi = k; } } return ring.ys[bi]; })();
  const l0 = refL(sh[0].y); const lv = sh.map((_, i) => l0 + (rl - l0) * sm(cum[i] / cum[nn]));
  let P2 = sh, L2 = lv; if (reverse) { P2 = [...sh].reverse(); L2 = [...lv].reverse(); }
  return { id, dir, pts: P2, lv: L2, note };
}
const sNE: P[] = D.slipNE, sSE: P[] = D.slipSE; // thinned x3 in the json: 87 points about 6 m apart; fine for data
pieces.push(slip('SLIP-NE', sNE, false, false, 367.3, 'arm southbound (E C-D) -> ring eastbound (north lane), left turn', 'V50 R 110 m, about 518 m'));
pieces.push(slip('SLIP-SE', sSE, false, true, -367.3, 'ring westbound (south lane) -> link southbound (E C-D), left turn', 'V50 R 110 m, about 518 m'));
pieces.push(slip('SLIP-NW', sNE, true, true, 367.3, 'ring eastbound (north lane) -> arm northbound (W C-D), left turn', 'mirror of NE, travelled the other way'));
pieces.push(slip('SLIP-SW', sSE, true, false, -367.3, 'link northbound (W C-D) -> ring westbound (south lane), left turn', 'mirror of SE'));
// ---------- per piece report ----------
const brOf = (r: any): { i0: number; i1: number }[] => net.bridges.filter((b: any) => b.roadId === r.id).map((b: any) => ({ i0: b.i0, i1: b.i1 }));
const armBr = brOf(arm), linkBr = brOf(link);
const armSt = armBr.map((b) => ({ a: arm.cum[arm.xs.length - 1] - arm.cum[b.i1], b: arm.cum[arm.xs.length - 1] - arm.cum[b.i0] })).sort((p, q) => p.a - q.a);
const linkSt = linkBr.map((b) => ({ a: link.cum[b.i0] + 24.95, b: link.cum[b.i1] + 24.95 })).sort((p, q) => p.a - q.a);
say('Structures along the real roads, distance from the node ALONG the road (m): arm ' + armSt.map((q) => `${f1(q.a)}..${f1(q.b)}`).join(' | ') + '; link ' + linkSt.map((q) => `${f1(q.a)}..${f1(q.b)}`).join(' | '));
const alongD = (r: any, wx: number, wz: number, isArm: boolean): number => { let bi = 0, bd = 1e18; for (let k = 0; k < r.xs.length; k++) { const d = Math.hypot(r.xs[k] - wx, r.zs[k] - wz); if (d < bd) { bd = d; bi = k; } } return isArm ? r.cum[r.xs.length - 1] - r.cum[bi] : r.cum[bi] + 24.95; };
const inSt = (st: { a: number; b: number }[], d: number): boolean => st.some((q) => d >= q.a && d <= q.b);
const armStruct = { a: 0, b: 0 }, linkStruct = { a: 0, b: 0 };
const rows: any[] = [];
for (const p of pieces) {
  let len = 0; const cum: number[] = [0]; for (let i = 1; i < p.pts.length; i++) { len += Math.hypot(p.pts[i].x - p.pts[i - 1].x, p.pts[i].y - p.pts[i - 1].y); cum.push(len); }
  let wet = 0, wetG = 0, ns = 0, maxFill = -1e9, maxCut = -1e9, hi3 = 0, firstWet = -1, ovA = 0, ovL = 0, maxGr = 0, minR = 1e9, jump = 0;
  const stepS = 10; let nextS = 0;
  for (let i = 0; i < p.pts.length; i++) {
    if (cum[i] >= nextS) { nextS += stepS; const g = nat(p.pts[i].x, p.pts[i].y); ns++; if (g.wet) { wet++; if (firstWet < 0) firstWet = cum[i]; } if (g.wetG) wetG++; const fill = p.lv[i] - g.h; maxFill = Math.max(maxFill, fill); maxCut = Math.max(maxCut, -fill); if (fill > 3 && !g.wetG) hi3 += stepS; const [qx, qz] = hkWorld(f, p.pts[i].x, p.pts[i].y); if (p.pts[i].y > 0 && inSt(armSt, alongD(arm, qx, qz, true))) ovA += stepS; if (p.pts[i].y < -24.95 && inSt(linkSt, alongD(link, qx, qz, false))) ovL += stepS; }
    if (i > 0) { const d = Math.hypot(p.pts[i].x - p.pts[i - 1].x, p.pts[i].y - p.pts[i - 1].y); maxGr = Math.max(maxGr, Math.abs(p.lv[i] - p.lv[i - 1]) / d); if (i > 1) { const a = p.pts[i - 2], b = p.pts[i - 1], c = p.pts[i]; const cr = Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)); const R = cr > 1e-9 ? (Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y) * Math.hypot(c.x - a.x, c.y - a.y)) / (2 * cr) : 1e9; if (R < minR) minR = R; jump = Math.max(jump, Math.abs(p.lv[i] - p.lv[i - 1])); } }
  }
  rows.push({ id: p.id, len, wet, ns, firstWet });
  say(`\n${p.id}  ${p.dir}\n  ${p.note}\n  length ${f1(len)} m, ${p.pts.length} points (~${STEP} m), level ${f2(p.lv[0])} -> ${f2(p.lv[p.lv.length - 1])} m, worst grade ${f2(100 * maxGr)} %, min radius ${minR > 1e8 ? 'straight' : f1(minR) + ' m'}`);
  say(`  ground: WET samples (water>h) ${wet} of ${ns}${firstWet >= 0 ? ` (first at ${f1(firstWet)} m along the piece)` : ''}; game rule (h<water+0.3) ${wetG}; max fill ${f1(maxFill)} m, max cut ${f1(maxCut)} m; dry stretch with fill > 3 m (= viaduct by the game rule) ${hi3} m`);
  say(`  structures: the piece lies beside the arm structure for ${ovA} m, beside the link structure for ${ovL} m (10 m samples, nearest axis point)`);
  chk(maxGr <= 0.05, `${p.id}: grade <= 5 %`, `${f2(100 * maxGr)} %`);
  chk(minR >= 92.5 || p.id.startsWith('CD') && minR >= 300, `${p.id}: radius >= 92.5 m (V50 93.7 m less 4 m sampling error) / tapers >= 300 m`, minR > 1e8 ? 'straight' : `${f1(minR)} m`);
  chk(wet === 0, `${p.id}: no water under the piece (WET = water > h)`, `${wet} of ${ns} samples`, true);
  chk(ovA + ovL === 0, `${p.id}: clear of the arm / link structures`, `${ovA + ovL} m overlap`, true);
}
// ---------- ring bridge under the east slips ----------
{ const lx = (k: number): number => (ring.xs[k] - f.ox) * f.ex + (ring.zs[k] - f.oz) * f.ez; const brs = net.bridges.filter((b: any) => b.roadId === ring.id).map((b: any) => [lx(b.i0), lx(b.i1)]).filter((q: number[]) => Math.min(q[0], q[1]) < 900 && Math.max(q[0], q[1]) > -900);
  say('\nRING STRUCTURES near the node (local x, east +): ' + brs.map((q: number[]) => `${q[0].toFixed(0)}..${q[1].toFixed(0)}`).join(' | '));
  for (const id of ['SLIP-NE', 'SLIP-SE']) { const e = id === 'SLIP-NE' ? last(id) : first(id); const on = brs.some((q: number[]) => e.x >= Math.min(q[0], q[1]) && e.x <= Math.max(q[0], q[1]) && Math.min(q[0], q[1]) > 200); chk(!on, `${id}: ring end (x ${f1(e.x)}) is NOT on the ring river bridge`, on ? 'it is ON the arch bridge x 311..431: needs a twin bridge / widening (later sub-step)' : 'ok', true); } }
// ---------- joins ----------
const dist = (a: P, b: P): number => Math.hypot(a.x - b.x, a.y - b.y);
say('\nJOINS (data):');
chk(dist(last('CD-E-N'), first('CD-E-S')) < 0.05, 'E-N end meets E-S start (y 0)', `${f2(dist(last('CD-E-N'), first('CD-E-S')))} m`);
chk(dist(last('CD-W-S'), first('CD-W-N')) < 0.05, 'W-S end meets W-N start (y 0)', `${f2(dist(last('CD-W-S'), first('CD-W-N')))} m`);
const segD = (s: P, c: Piece): number => { let m = 1e9; for (let i = 0; i + 1 < c.pts.length; i++) { const a = c.pts[i], b = c.pts[i + 1], bx = b.x - a.x, by = b.y - a.y, l2 = bx * bx + by * by, t = l2 > 0 ? Math.max(0, Math.min(1, ((s.x - a.x) * bx + (s.y - a.y) * by) / l2)) : 0; m = Math.min(m, Math.hypot(s.x - a.x - bx * t, s.y - a.y - by * t)); } return m; };
const onCd = segD;
chk(onCd(first('SLIP-NE'), P('CD-E-N')) < 0.5, 'SLIP-NE diverges from the E C-D (y 367.3)', `${f2(onCd(first('SLIP-NE'), P('CD-E-N')))} m off the C-D line`);
chk(onCd(last('SLIP-SE'), P('CD-E-S')) < 0.5, 'SLIP-SE merges into the E C-D (y -367.3)', `${f2(onCd(last('SLIP-SE'), P('CD-E-S')))} m`);
chk(onCd(last('SLIP-NW'), P('CD-W-N')) < 0.5, 'SLIP-NW merges into the W C-D (y 367.3)', `${f2(onCd(last('SLIP-NW'), P('CD-W-N')))} m`);
chk(onCd(first('SLIP-SW'), P('CD-W-S')) < 0.5, 'SLIP-SW diverges from the W C-D (y -367.3)', `${f2(onCd(first('SLIP-SW'), P('CD-W-S')))} m`);
for (const [id, y, x] of [['NE loop C-D end', 76.4, 29.3], ['SE loop C-D start', -76.4, 23.2]] as const) { const c = P(y > 0 ? 'CD-E-N' : 'CD-E-S'); const m = segD({ x: x + refX(y), y }, c); chk(m < 0.5, `${id} lies on the E C-D line`, `${f2(m)} m`); }
for (const [id, y, x] of [['NW loop C-D end', 76.4, -29.3], ['SW loop C-D start', -76.4, -23.2]] as const) { const c = P(y > 0 ? 'CD-W-N' : 'CD-W-S'); const m = segD({ x: x + refX(y), y }, c); chk(m < 0.5, `${id} lies on the W C-D line`, `${f2(m)} m`); }
// ring end of the slips
for (const id of ['SLIP-NE', 'SLIP-SE', 'SLIP-NW', 'SLIP-SW']) { const e = id === 'SLIP-SE' || id === 'SLIP-NW' ? first(id) : last(id); const e2 = id === 'SLIP-SE' || id === 'SLIP-NW' ? last(id) : first(id); void e2; chk(Math.abs(Math.abs(e.y) - 17.3) < 0.6, `${id}: ring end in the ring lane (|y| 17.3)`, `y ${f2(e.y)}, x ${f1(e.x)}`); }
{ const LP: Record<string, number[][]> = {}; for (const l of HK_LOOPS) LP[l.id] = l.pts as unknown as number[][]; say('  loop ids in data: ' + Object.keys(LP).join(', '));
  const gap = (sp: Piece, lp: number[][]): number => { let m = 1e9; for (let i = 0; i < sp.pts.length; i++) { const al = Math.min(i, sp.pts.length - 1 - i) * 4; if (al < 45) continue; for (let j = 0; j < lp.length; j++) { const lj = Math.min(j, lp.length - 1 - j) * 4; if (lj < 45) continue; m = Math.min(m, Math.hypot(sp.pts[i].x - lp[j][0], sp.pts[i].y - lp[j][1])); } } return m; };
  for (const [sid, lid] of [['SLIP-NE', 'NE'], ['SLIP-SE', 'SE'], ['SLIP-NW', 'NW'], ['SLIP-SW', 'SW']] as const) { const key = Object.keys(LP).find((k) => k.includes(lid)); if (!key) { chk(false, `${sid}: loop ${lid} found in HkRampData`, 'missing'); continue; } const g = gap(P(sid), LP[key]); chk(g >= 14, `${sid}: clears loop ${lid} by >= 14 m (slip shifted onto the CURVED arm axis)`, `${f1(g)} m`); } }
// clearance of the C-D under the deck: underside of the deck at the node 27.24 - 1.4 (box girder) vs the C-D level at y 0 and -25
const under = 27.24 - 1.4; chk(under - Math.max(refL(0), refL(-25)) >= 4.9, 'headroom under the node deck over the C-D (>= 4.9 m)', `${f2(under - Math.max(refL(0), refL(-25)))} m (deck underside ${f2(under)}, road ${f2(refL(0))} / ${f2(refL(-25))})`);
say('\nGROUND ROAD UNDER THE DECK (the 25 m patch, data): arm end y 0 (half 22.1, level ' + f2(refL(0)) + ') -> link start y -24.95 (half 16.0, level ' + f2(refL(-24.95)) + '). Today the ground road has NO asphalt between y 0 and -24.95 (headless: nearest road 12.4 m away at y -12.5, only a flat pad at 19.68 m). Needs a connector piece (game layer, later sub-step): 8 lane -> 6 lane pavement step inside y 0 .. -25 as in HK_LANES.txt.');
say('\nNOT RUN: tsc, npm run build, any other check script, game look; src NOT changed; no mesh, no RoadSpec, no terrain carve in this sub-step. Chunk-worker Config: nothing runtime added.');
say(`RESULT ${fails} FAIL, ${warns} WARN`);
writeFileSync('docs/HK_CD_ROADS.txt', out.join('\n') + '\n');
writeFileSync('docs/hk_cd_roads.json', JSON.stringify({ frame: 'local x east / y north, node = end of the J1-S arm', pieces: pieces.map((p) => ({ id: p.id, dir: p.dir, pts: p.pts.map((q, i) => [+q.x.toFixed(2), +q.y.toFixed(2), +p.lv[i].toFixed(2)]) })) }));
