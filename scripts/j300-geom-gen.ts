// J4 GEOMETRY GENERATOR (headless). Writes src/roads/junction/J300Geometry.ts (GENERATED data, nothing imports it yet) and docs/J300_GEOM.json.
// Pure math + the real game terrain (read only). Run: npx tsx scripts/j300-geom-gen.ts      Then: npx tsx scripts/j300-geom-check.ts docs
// FRAME (project convention, Geometry2D.ts): local u = along the ring (towards PI4), v = LEFT of u (the game drives on the left), origin = roundabout centre O.
//   world = O + u (cos yaw, sin yaw) + v (sin yaw, -cos yaw);  world heading = yaw - local heading;  local heading 0 = +u, +PI/2 = +v.
// J3 LEG ANGLES (local, circulation CLOCKWISE seen from above = decreasing angle): R6 90, E-out 29, E-in -29, R4 -90, W-out -151, W-in 151.
import { writeFileSync, readFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { RING_PIS } from '../src/roads/alignment/RingAlignment';
import { buildOpenAlignment } from '../src/roads/alignment/OpenAlignment';
import { poseAt } from '../src/roads/alignment/PiAlignment';
import { crestK, stoppingSight, minRadius } from '../src/interchange/Standards';

const D = Math.PI / 180;
const wrap = (a: number): number => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
type V = { u: number; v: number };
const r2 = (x: number): number => Math.round(x * 100) / 100;

// ------------------------------------------------------------------ frame and inputs (J1-J3)
const A: any = RING_PIS[3], B: any = RING_PIS[4];
const ax = A.x ?? A[0], az = A.z ?? A[1], bx = B.x ?? B[0], bz = B.z ?? B[1];
const LEN = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / LEN, uz = (bz - az) / LEN, YAW = Math.atan2(uz, ux);
const C0 = { x: -1547, z: -2464 }; const s0 = (C0.x - ax) * ux + (C0.z - az) * uz;
const U0 = -125, PT = 35.3;
const O = { x: ax + ux * (s0 + U0), z: az + uz * (s0 + U0) };
const toW = (p: V): { x: number; z: number } => ({ x: O.x + p.u * ux + p.v * uz, z: O.z + p.u * uz - p.v * ux });
const toL = (x: number, z: number): V => ({ u: (x - O.x) * ux + (z - O.z) * uz, v: (x - O.x) * uz - (z - O.z) * ux });
const hW = (hl: number): number => YAW - hl; // local heading -> world heading
const RO = 62, RI = 48, LANE = 3.65, APRON = 2.0, RAMP_V = 30;
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample();
const nat = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };

// ------------------------------------------------------------------ circle
const CIRC = { RI, RO, apron: [RI, RI + APRON], lanes: [0, 1, 2].map((i) => [RI + APRON + i * LANE, RI + APRON + (i + 1) * LANE]), shoulder: [RI + APRON + 3 * LANE, RO], laneCentres: [0, 1, 2].map((i) => RI + APRON + (i + 0.5) * LANE), deckY: PT, crossfall: 0.02, fastestPathR: RI + APRON + 1.5 };

// ------------------------------------------------------------------ entry / exit solvers (local frame)
interface Leg { id: string; kind: 'arm' | 'ramp'; ang: number; enter: boolean; exit: boolean }
const LEGS: Leg[] = [
  { id: 'R6', kind: 'arm', ang: 90, enter: true, exit: true }, { id: 'E-out', kind: 'ramp', ang: 29, enter: false, exit: true },
  { id: 'E-in', kind: 'ramp', ang: -29, enter: true, exit: false }, { id: 'R4', kind: 'arm', ang: -90, enter: true, exit: true },
  { id: 'W-out', kind: 'ramp', ang: -151, enter: false, exit: true }, { id: 'W-in', kind: 'ramp', ang: 151, enter: true, exit: false },
];
const cross = (hl: number, p0: V, q: V): number => Math.cos(hl) * (q.v - p0.v) - Math.sin(hl) * (q.u - p0.u);
const along = (hl: number, p0: V, q: V): number => Math.cos(hl) * (q.u - p0.u) + Math.sin(hl) * (q.v - p0.v);
const nrm = (h: number): V => ({ u: -Math.sin(h), v: Math.cos(h) }); // left normal
function bisect(f: (x: number) => number, lo: number, hi: number): number { let a = lo, b = hi, fa = f(a); for (let i = 0; i < 60; i++) { const m = (a + b) / 2, fm = f(m); if ((fa < 0) === (fm < 0)) { a = m; fa = fm; } else b = m; } return (a + b) / 2; }
/** Roots of f over phi in [0, 2PI) that satisfy ok(phi). */
function roots(f: (p: number) => number, ok: (p: number) => boolean): number[] { const out: number[] = []; const st = 0.1 * D; for (let p = 0; p < 2 * Math.PI; p += st) { const a = f(p), b = f(p + st); if (Number.isFinite(a) && Number.isFinite(b) && (a < 0) !== (b < 0) && Math.abs(a - b) < 50) { const r = bisect(f, p, p + st); if (ok(r)) out.push(r); } } return out; }
interface PathRes { phi: number; arcStart: V; arcEnd: V; turn: number; R: number; heading0: number; heading1: number; sAlong: number }
/** ENTRY: the path comes along the straight line (point p0, heading hl), turns by an arc of radius R and meets the circle r = ry at angle phi with the entry angle theta to the circulating tangent. */
function solveEntry(p0: V, hl: number, R: number, theta: number, ry: number, nominal: number): PathRes {
  const geo = (phi: number) => { const psiE = phi - Math.PI / 2 - theta; const dl = wrap(psiE - hl); const sg = dl >= 0 ? 1 : -1; const Y = { u: ry * Math.cos(phi), v: ry * Math.sin(phi) }; const nE = nrm(psiE), nL = nrm(hl); const S = { u: Y.u + sg * R * (nE.u - nL.u), v: Y.v + sg * R * (nE.v - nL.v) }; return { psiE, dl, sg, Y, S }; };
  const f = (phi: number): number => { const g = geo(phi); return cross(hl, p0, g.S); };
  const ok = (phi: number): boolean => { const g = geo(phi); return along(hl, p0, g.S) >= 0 && Math.abs(g.dl) < 100 * D; };
  const rs = roots(f, ok); if (!rs.length) throw new Error('no entry solution');
  rs.sort((a, b) => Math.abs(wrap(a - nominal * D)) - Math.abs(wrap(b - nominal * D))); const phi = rs[0]; const g = geo(phi);
  return { phi, arcStart: g.S, arcEnd: g.Y, turn: g.dl, R, heading0: hl, heading1: g.psiE, sAlong: along(hl, p0, g.S) };
}
/** EXIT: leaves the circle r = ry tangentially at angle phi (heading = circulating tangent), turns by an arc of radius R and ends on the straight line (p0, hl). */
function solveExit(p0: V, hl: number, R: number, ry: number, nominal: number): PathRes {
  const geo = (phi: number) => { const psiX = phi - Math.PI / 2; const dl = wrap(hl - psiX); const sg = dl >= 0 ? 1 : -1; const X = { u: ry * Math.cos(phi), v: ry * Math.sin(phi) }; const nX = nrm(psiX), nL = nrm(hl); const E = { u: X.u + sg * R * (nX.u - nL.u), v: X.v + sg * R * (nX.v - nL.v) }; return { psiX, dl, sg, X, E }; };
  const f = (phi: number): number => cross(hl, p0, geo(phi).E);
  const ok = (phi: number): boolean => { const g = geo(phi); return along(hl, p0, g.E) >= 0 && Math.abs(g.dl) < 100 * D; };
  const rs = roots(f, ok); if (!rs.length) throw new Error('no exit solution');
  rs.sort((a, b) => Math.abs(wrap(a - nominal * D)) - Math.abs(wrap(b - nominal * D))); const phi = rs[0]; const g = geo(phi);
  return { phi, arcStart: g.X, arcEnd: g.E, turn: g.dl, R, heading0: g.psiX, heading1: hl, sAlong: along(hl, p0, g.E) };
}
/** Sample a path = straight (from p0 to the arc start / from the arc end onwards) + arc. Returns points {u, v, h, s}. */
function samplePath(kind: 'entry' | 'exit', p0: V, hl: number, res: PathRes, lineLen: number): { u: number; v: number; h: number; s: number }[] {
  const pts: { u: number; v: number; h: number; s: number }[] = []; const sg = res.turn >= 0 ? 1 : -1; const R = res.R; const step = 1.0;
  const arcPts = (P: V, h0: number): void => { const nA = nrm(h0); const c = { u: P.u + sg * R * nA.u, v: P.v + sg * R * nA.v }; const n = Math.max(2, Math.ceil(R * Math.abs(res.turn) / step)); for (let i = 0; i <= n; i++) { const h = h0 + res.turn * i / n; const nh = nrm(h); pts.push({ u: c.u - sg * R * nh.u, v: c.v - sg * R * nh.v, h, s: 0 }); } };
  if (kind === 'entry') {
    const L0 = Math.min(lineLen, res.sAlong); const n = Math.max(1, Math.ceil(L0 / 2)); const a0 = { u: res.arcStart.u - Math.cos(hl) * L0, v: res.arcStart.v - Math.sin(hl) * L0 };
    for (let i = 0; i < n; i++) pts.push({ u: a0.u + Math.cos(hl) * L0 * i / n, v: a0.v + Math.sin(hl) * L0 * i / n, h: hl, s: 0 });
    arcPts(res.arcStart, hl);
  } else {
    arcPts(res.arcStart, res.heading0); const E = res.arcEnd; const n = Math.max(1, Math.ceil(lineLen / 2)); for (let i = 1; i <= n; i++) pts.push({ u: E.u + Math.cos(hl) * lineLen * i / n, v: E.v + Math.sin(hl) * lineLen * i / n, h: hl, s: 0 });
  }
  let s = 0; for (let i = 0; i < pts.length; i++) { if (i > 0) s += Math.hypot(pts[i].u - pts[i - 1].u, pts[i].v - pts[i - 1].v); pts[i].s = s; } return pts;
}
const offsetEdge = (pts: { u: number; v: number; h: number; s: number }[], w: (i: number) => number, side: number): number[][] => pts.map((p, i) => { const n = nrm(p.h); return [r2(p.u + side * n.u * w(i) / 2), r2(p.v + side * n.v * w(i) / 2)]; });

// ------------------------------------------------------------------ leg templates (J3 section 3 + section 6)
const THETA = 30 * D;
const TEMPLATE: Record<string, { widthApp: number; widthEntry: number; flare: number; Re: number; Rx: number; t?: number; laneW: number }> = {
  R6: { widthApp: 7.0, widthEntry: 10.5, flare: 20, Re: 50, Rx: 60, t: 2.0, laneW: 3.5 },
  R4: { widthApp: 7.3, widthEntry: 10.9, flare: 25, Re: 50, Rx: 60, t: 2.0, laneW: 3.65 },
  'E-in': { widthApp: 7.0, widthEntry: 8.5, flare: 20, Re: 45, Rx: 60, laneW: 3.5 }, 'W-in': { widthApp: 7.0, widthEntry: 8.5, flare: 20, Re: 45, Rx: 60, laneW: 3.5 },
  'E-out': { widthApp: 7.0, widthEntry: 7.0, flare: 0, Re: 45, Rx: 60, laneW: 3.5 }, 'W-out': { widthApp: 7.0, widthEntry: 7.0, flare: 0, Re: 45, Rx: 60, laneW: 3.5 },
};
const lines = (id: string): { inn?: { p0: V; hl: number }; out?: { p0: V; hl: number } } => {
  const T = TEMPLATE[id]; const dc = (T.t ?? 0) + T.widthApp / 2;
  switch (id) {
    case 'R6': return { inn: { p0: { u: dc, v: 200 }, hl: -Math.PI / 2 }, out: { p0: { u: -dc, v: 0 }, hl: Math.PI / 2 } };
    case 'R4': return { inn: { p0: { u: -dc, v: -200 }, hl: Math.PI / 2 }, out: { p0: { u: dc, v: 0 }, hl: -Math.PI / 2 } };
    case 'E-in': return { inn: { p0: { u: 200, v: -RAMP_V }, hl: Math.PI } };
    case 'W-in': return { inn: { p0: { u: -200, v: RAMP_V }, hl: 0 } };
    case 'E-out': return { out: { p0: { u: 0, v: RAMP_V }, hl: 0 } };
    default: return { out: { p0: { u: 0, v: -RAMP_V }, hl: Math.PI } }; // W-out
  }
};
const legsOut: any[] = [];
for (const L of LEGS) {
  const T = TEMPLATE[L.id]; const ln = lines(L.id); const rec: any = { id: L.id, kind: L.kind, ang: L.ang, enter: L.enter, exit: L.exit, template: T };
  let farIn = 0, farOut = 0;
  if (ln.inn) { const r = solveEntry(ln.inn.p0, ln.inn.hl, T.Re, THETA, RO, L.ang); const pts = samplePath('entry', ln.inn.p0, ln.inn.hl, r, 120); const sY = pts[pts.length - 1].s; const w = (i: number): number => { const d = sY - pts[i].s; return d >= T.flare ? T.widthApp : T.widthApp + (T.widthEntry - T.widthApp) * (1 - d / T.flare); };
    const tang = r.phi - Math.PI / 2; farIn = Math.max(Math.abs(r.arcStart.u), Math.abs(r.arcStart.v));
    rec.entry = { phiDeg: r2(r.phi / D), arcR: T.Re, arcTurnDeg: r2(r.turn / D), arcLen: r2(T.Re * Math.abs(r.turn)), entryAngleDeg: r2(wrap(tang - r.heading1) / D), arcStart: [r2(r.arcStart.u), r2(r.arcStart.v)], yield: [r2(r.arcEnd.u), r2(r.arcEnd.v)], lineHeadingDeg: r2(ln.inn.hl / D), centre: pts.map((p) => [r2(p.u), r2(p.v), r2(p.h / D), r2(p.s)]), widthApp: T.widthApp, widthEntry: T.widthEntry, flare: T.flare, left: offsetEdge(pts, w, 1), right: offsetEdge(pts, w, -1), width: pts.map((_, i) => r2(w(i))) }; }
  if (ln.out) { const r = solveExit(ln.out.p0, ln.out.hl, T.Rx, RO, L.ang); const pts = samplePath('exit', ln.out.p0, ln.out.hl, r, 120); const w = (): number => T.widthApp; farOut = Math.max(Math.abs(r.arcEnd.u), Math.abs(r.arcEnd.v));
    rec.exit = { phiDeg: r2(r.phi / D), arcR: T.Rx, arcTurnDeg: r2(r.turn / D), arcLen: r2(T.Rx * Math.abs(r.turn)), leave: [r2(r.arcStart.u), r2(r.arcStart.v)], arcEnd: [r2(r.arcEnd.u), r2(r.arcEnd.v)], lineHeadingDeg: r2(ln.out.hl / D), centre: pts.map((p) => [r2(p.u), r2(p.v), r2(p.h / D), r2(p.s)]), width: T.widthApp, left: offsetEdge(pts, w, 1), right: offsetEdge(pts, w, -1) }; }
  rec.junctionReach = r2(Math.max(farIn, farOut)); legsOut.push(rec);
}

// ------------------------------------------------------------------ crossings (pedestrian, J3 section 6: 2 lanes at the crossing, refuge >= 2.4 m on the arms)
const crossings: any[] = [];
for (const rec of legsOut) {
  const arm = rec.kind === 'arm'; const dir = rec.id === 'R6' ? 1 : -1;
  if (arm) {
    const rIn = Math.abs(rec.entry.arcStart[1]), rOut = Math.abs(rec.exit.arcEnd[1]); const rc = Math.max(77, Math.max(rIn, rOut) + 6); const t = rec.template.t; const wd = rec.template.widthApp;
    crossings.push({ leg: rec.id, centre: [0, r2(dir * rc)], headingDeg: 0, length: r2(2 * t + 2 * wd), stages: 2, stageWidth: wd, refuge: 2 * t, fromCircleEdge: r2(rc - RO) });
  } else {
    const e = rec.entry ?? rec.exit; const sgn = Math.sign((rec.entry ? rec.entry.arcStart[0] : rec.exit.arcEnd[0]) || 1); const uu = rec.entry ? Math.abs(rec.entry.arcStart[0]) : Math.abs(rec.exit.arcEnd[0]);
    const vv = rec.id.startsWith('E-out') || rec.id === 'W-in' ? RAMP_V : -RAMP_V; void e;
    crossings.push({ leg: rec.id, centre: [r2(sgn * (uu + 6)), vv], headingDeg: 90, length: rec.template.widthApp, stages: 1, stageWidth: rec.template.widthApp, refuge: 0, fromCircleEdge: r2(uu + 6 - Math.sqrt(RO * RO - RAMP_V * RAMP_V)) });
  }
}
// island polygons (arms): inner edges of the entry and the exit carriageway from the crossing to the circle
const islands: any[] = [];
for (const rec of legsOut.filter((l) => l.kind === 'arm')) {
  const dir = rec.id === 'R6' ? 1 : -1; const cw = crossings.find((c) => c.leg === rec.id); const rc = Math.abs(cw.centre[1]);
  const innerIn = (rec.id === 'R6' ? rec.entry.right : rec.entry.left); const innerOut = (rec.id === 'R6' ? rec.exit.left : rec.exit.right);
  const sel = (e: number[][]): number[][] => e.filter((p) => dir * p[1] <= rc + 0.01 && dir * p[1] >= RO - 4);
  // entry runs crossing -> circle, exit runs circle -> crossing: no reverse, else the polygon is a bow-tie
  const a = sel(innerIn), b = sel(innerOut); islands.push({ leg: rec.id, polygon: [...a, ...b], halfWidthAtCrossing: rec.template.t, widthAtCrossing: 2 * rec.template.t });
}

// ------------------------------------------------------------------ arms (world alignments), vertical profiles
const K_CREST = crestK(60), SAG_S = stoppingSight(60), K_SAG = (SAG_S * SAG_S) / (120 + 3.5 * SAG_S);
const dirW = (hl: number): { x: number; z: number } => ({ x: Math.cos(hW(hl)), z: Math.sin(hW(hl)) });
const D0 = (id: string): number => { const rec = legsOut.find((l) => l.id === id); const cw = crossings.find((c) => c.leg === id); return Math.max(150, Math.abs(cw.centre[1]) + 70); void rec; };
function sampleAl(al: any, ds: number): any[] { const n = Math.ceil(al.length / ds); const out: any[] = []; for (let i = 0; i <= n; i++) { const s = Math.min(al.length, i * al.length / n); out.push(poseAt(al, s)); } return out; }
const oldRoad = (name: string): { xs: number[]; zs: number[]; ys: number[] } => (gen.roads.roads as any[]).filter((r: any) => r.name === name)[0];
function oldY(name: string, x: number, z: number): number { const r = oldRoad(name); let b = 1e9, y = 0; for (let i = 0; i < r.xs.length; i++) { const d = Math.hypot(r.xs[i] - x, r.zs[i] - z); if (d < b) { b = d; y = r.ys[i]; } } return y; }
const nearOld = (name: string, x: number, z: number): boolean => { const r = oldRoad(name); for (let i = 0; i < r.xs.length; i++) if (Math.hypot(r.xs[i] - x, r.zs[i] - z) <= 15) return true; return false; };
function lineInt(p: { x: number; z: number }, d: { x: number; z: number }, q: { x: number; z: number }, e: { x: number; z: number }): { s: number; t: number } { const det = d.x * -e.z - d.z * -e.x; const rx = q.x - p.x, rz = q.z - p.z; return { s: (rx * -e.z - rz * -e.x) / det, t: (d.x * rz - d.z * rx) / det }; }
const armOut: any = {};

// ---- R6: axis from O along +v, one PI where it meets the straight far part of old R6-9, ends at the old R6-9 start (free end)
{ const D6 = D0('R6'); const dA = dirW(Math.PI / 2); const start = { x: O.x + dA.x * D6, z: O.z + dA.z * D6 };
  const oldFar = { x: -2000, z: -2983 }, oldNext = { x: -2000 + (-2000 - -2007.43), z: -2983 + (-2983 - -2985.84) }; /* Option A (J10 section 30): end = R6-7 END, heading of R6-7 at its end (20.9 deg) */ const dOld = { x: oldNext.x - oldFar.x, z: oldNext.z - oldFar.z }; const lo = Math.hypot(dOld.x, dOld.z); dOld.x /= lo; dOld.z /= lo;
  const it = lineInt({ x: O.x, z: O.z }, dA, oldFar, dOld); const PI = { x: O.x + dA.x * it.s, z: O.z + dA.z * it.s };
  let R = 220, Ls = 40; let al: any = null; for (const Rt of [220, 200, 180, 160, 150, 140, 130, 120]) { try { const a = buildOpenAlignment(start, [{ x: PI.x, z: PI.z, R: Rt, Ls }], oldFar); const sg = a.straights as number[]; if (sg[sg.length - 1] >= 10 && a.endGap <= 0.5 && a.endHeadingGapDeg <= 0.1) { al = a; R = Rt; break; } } catch { /* next R */ } } if (!al) throw new Error('no R6 radius fits the R6-7 end (Option A)');
  armOut.R6 = { al, D0: D6, piDist: it.s, R, Ls, join: 'R6-7 end (Option A, J10 section 30)', oldName: 'R6-7' }; }

// profile: crest at the deck edge, grade down, (R4: sag, grade up 4 %) , end level = old road level at the join
// J9-a: env J300_R4_YEND = level the built old R4-9 has at the join when the switch is ON (measured by j300-j9a-check); the R4 arm must meet THAT level.
function profileOf(id: string, R: any): void {
  const al = R.al; const D = R.D0; const sTot = al.length; const samples = sampleAl(al, 5);
  // distance from circle edge: zone (RO .. D0 straight) + alignment
  const sig0 = D - RO; // station of the alignment start measured from the circle edge
  const endPose = poseAt(al, sTot); const yEnd = (id === 'R4' && process.env.J300_R4_YEND) ? Number(process.env.J300_R4_YEND) : oldY(R.oldName, endPose.x, endPose.z); const sigE = sig0 + sTot;
  const Lc = 40; const vp: { s: number; y: number; L: number }[] = [{ s: Lc / 2, y: PT, L: Lc }];
  if (id === 'R6') { const g = (PT - yEnd) / (sigE - Lc / 2);
    // J10 Option A1 (user: a1): dip under the rail viaduct so that the clearance is >= 5.5 m. Crossing station from J7-B (docs/J300_STRUCT_B.json, crossing.sArm), dip below the straight grade line, sag curve L 120 m.
    let sX = 291.7; try { sX = JSON.parse(readFileSync('docs/J300_STRUCT_B.json', 'utf8')).crossing.sArm; } catch { /* default */ }
    const dip = Number(process.env.J300_R6_DIP ?? 0.9); const yLin = PT - g * (sX - Lc / 2);
    vp.push({ s: sX, y: yLin - dip, L: 120 }); vp.push({ s: sigE, y: yEnd, L: 0 }); R.grade = g; R.dip = { sX, dip, L: 120 }; }
  else { // J4-R4 (decision R4 = (c)): sag at the deck edge (K_SAG), ONE grade up to the old road level at the join
    let g = (yEnd - PT) / (sigE - 20); let L0 = Math.max(40, K_SAG * g * 100); for (let it = 0; it < 6; it++) { g = (yEnd - PT) / (sigE - L0 / 2); L0 = Math.max(40, K_SAG * g * 100); }
    // J10 Option A (user: Suru koro): END CREST on the arm side only. The last Lc m before the join are a half parabola that ends with the grade of the real R4-9 (0 %), so there is no grade break at the join (the road side is not touched).
    const Lc = Number(process.env.J300_R4_ENDCREST ?? 80); g = (yEnd - PT) / (sigE - L0 / 2 - Lc / 2); L0 = Math.max(40, K_SAG * g * 100); for (let it = 0; it < 6; it++) { g = (yEnd - PT) / (sigE - L0 / 2 - Lc / 2); L0 = Math.max(40, K_SAG * g * 100); }
    const yV = PT + g * (sigE - L0 / 2); vp.length = 0; vp.push({ s: L0 / 2, y: PT, L: L0 }); vp.push({ s: sigE, y: r2(yV), L: 0 }); R.grade = g; R.gradeUp = null; R.sag = null; R.sagDeck = { L: L0, K: K_SAG, A: g * 100 }; R.endCrest = { Lc, A: g * 100, K: Lc / (g * 100), endGrade: 0 }; }
  const yAt = (s: number): number => { // piecewise tangent lines with parabolic blends at each VPI that has L > 0
    const slope = (i: number): number => (vp[i + 1].y - vp[i].y) / (vp[i + 1].s - vp[i].s); let y: number | null = null;
    if (s <= 0) return PT;
    for (let i = 1; i < vp.length - 1 && y === null; i++) { const L = vp[i].L; if (L > 0 && s >= vp[i].s - L / 2 && s <= vp[i].s + L / 2) { const g0 = slope(i - 1), g1 = slope(i); const x = s - (vp[i].s - L / 2); const yb = vp[i].y - g0 * L / 2; y = yb + g0 * x + (g1 - g0) * x * x / (2 * L); } }
    if (y === null) { const first = vp[0]; if (s <= first.s + first.L / 2) { const g1 = slope(0); const x = s - (first.s - first.L / 2); y = first.y + 0 * x + (g1 - 0) * x * x / (2 * first.L); } }
    if (y === null) { let i = 0; while (i < vp.length - 2 && s > vp[i + 1].s) i++; y = vp[i].y + slope(i) * (s - vp[i].s); }
    if (R.endCrest && s > sigE - R.endCrest.Lc) { const Lc2 = R.endCrest.Lc, sa = sigE - Lc2, x = s - sa; const ya = vp[0].y + slope(0) * (sa - vp[0].s); y = ya + slope(0) * (x - x * x / (2 * Lc2)); }
    return y; };
  const rows: any[] = []; const nat0 = (x: number, z: number): number => nat(x, z);
  // zone (straight along the axis from the circle edge to D) first
  const dA = dirW(id === 'R6' ? Math.PI / 2 : -Math.PI / 2);
  for (let r = RO; r < D; r += 5) { const x = O.x + dA.x * r, z = O.z + dA.z * r; rows.push({ s: r2(r - RO), x: r2(x), z: r2(z), h: r2(Math.atan2(dA.z, dA.x) / D), k: 0, y: r2(yAt(r - RO)), nat: r2(nat0(x, z)) }); }
  for (const p of samples) rows.push({ s: r2(sig0 + p.s), x: r2(p.x), z: r2(p.z), h: r2(p.h / D), k: Math.round(p.k * 1e6) / 1e6, y: r2(yAt(sig0 + p.s)), nat: r2(nat0(p.x, p.z)), ...(R.oldName === 'R4-9' && nearOld('R4-9', p.x, p.z) ? { ex: 1 } : {}) });
  R.profile = { vpi: vp, rows, sigE, yEnd, sig0 };
}
// ---- R4: axis from O along -v, two PIs onto the third straight of old R4-9 (past the hill: old cut there is below 12 m), searched for the least earthwork.
function searchR4(): void { const D4 = D0('R4'); const dA = dirW(-Math.PI / 2); const start = { x: O.x + dA.x * D4, z: O.z + dA.z * D4 };
  // J4-R4 (user delegated, section 20): the arm leaves the circle along -v, turns in an S and JOINS the OLD R4-9 line (own hill cut, already in the game) before the saddle. Old line = the real game road R4-9.
  const old = oldRoad('R4-9'); const nOld = old.xs.length;
  let best: any = null; const tried: any[] = []; const oldDist = (x: number, z: number): number => { let b = 1e9; for (let i = 0; i < nOld; i++) { const d = Math.hypot(old.xs[i] - x, old.zs[i] - z); if (d < b) b = d; } return b; };
  for (let k = 3; k < nOld - 3; k++) { const dO = Math.hypot(old.xs[k] - O.x, old.zs[k] - O.z); if (dO < 250 || dO > 700) continue; if ((k % 2) !== 0) continue; if (k !== Number(process.env.J300_R4_JOIN ?? 322)) continue; /* J9-a: the built join is old R4-9 index 322, keep it */
    const end = { x: old.xs[k], z: old.zs[k] }; const dir0 = { x: old.xs[k - 3] - old.xs[k + 3], z: old.zs[k - 3] - old.zs[k + 3] }; const ld = Math.hypot(dir0.x, dir0.z); const dir = { x: dir0.x / ld, z: dir0.z / ld }; // travel direction: from the circle outwards = towards the end index of the old road list? sign fixed below
    for (const sgn of [1, -1]) for (let t2 = 20; t2 <= 220; t2 += 10) for (let a1 = D4 + 20; a1 <= 520; a1 += 10) for (const R of [85, 100, 120, 150, 200]) {
      const Ls = 30; const PI1 = { x: O.x + dA.x * a1, z: O.z + dA.z * a1 }; const PI2 = { x: end.x - sgn * dir.x * t2, z: end.z - sgn * dir.z * t2 };
      let al: any; try { al = buildOpenAlignment(start, [{ ...PI1, R, Ls }, { ...PI2, R, Ls }], end); } catch { continue; }
      const sg = al.straights as number[]; if (!(sg[0] >= 14 && sg[1] >= 14 && sg[2] >= 10)) continue; if (al.endGap > 0.5 || al.endHeadingGapDeg > 0.1) continue;
      const tmp: any = { al, D0: D4, oldName: 'R4-9' }; try { profileOf('R4', tmp); } catch { continue; } if (!(tmp.grade > 0 && tmp.grade <= 0.06)) continue; const rows = tmp.profile.rows as any[];
      let maxCut = 0, vol = 0; for (const q of rows) { const d = q.y - q.nat; if (d < 0) { if (oldDist(q.x, q.z) > 15) { maxCut = Math.max(maxCut, -d); vol += -d * 3; } } else vol += d * 2; }
      const score = 1000 * Math.max(0, maxCut - 12) + vol + al.length * 0.5 + (200 - R) * 2; tried.push({ k, sgn, a1, t2, R, len: al.length, maxCut, score });
      if (!best || score < best.score) best = { score, al, a1, t2, R, Ls, end, k, maxCut }; break; } }
  if (!best) throw new Error('no R4 join found');
  tried.sort((p, q) => p.score - q.score); console.log('R4 search best 5:', JSON.stringify(tried.slice(0, 5)), 'of', tried.length);
  armOut.R4 = { al: best.al, D0: D4, R: best.R, Ls: best.Ls, a1: best.a1, t2: best.t2, tE: 0, join: `old R4-9 at (${r2(best.end.x)}, ${r2(best.end.z)}) (index ${best.k}), J4-R4`, oldName: 'R4-9', end: best.end }; }

profileOf('R6', armOut.R6); searchR4(); profileOf('R4', armOut.R4);

// ------------------------------------------------------------------ output
const alOut = (id: string): any => { const R = armOut[id]; const al = R.al; return { id, d0: R.D0, join: R.join, oldName: R.oldName, radius: R.R, spiralLs: R.Ls, pis: al.pis.map((p: any) => ({ x: r2(p.x), z: r2(p.z), R: p.R, Ls: p.Ls })), length: r2(al.length), start: al.start, end: { x: r2(al.end.x), z: r2(al.end.z), h: r2(al.end.h / D) }, endGap: r2(al.endGap), endHeadingGapDeg: r2(al.endHeadingGapDeg), straights: al.straights.map(r2), grade: R.grade, gradeUp: R.gradeUp ?? null, sag: R.sag ?? null, vpi: R.profile.vpi, endCrest: R.endCrest ?? null, dip: R.dip ?? null, rows: R.profile.rows, sigE: r2(R.profile.sigE), yEnd: r2(R.profile.yEnd) }; };
const DATA = { generated: '2026-11-24', frame: { ox: r2(O.x), oz: r2(O.z), yaw: Math.round(YAW * 1e6) / 1e6, yawDeg: r2(YAW / D), u0: U0, deckY: PT, ringC: C0 }, circle: CIRC, legs: legsOut, crossings, islands, arms: { R6: alOut('R6'), R4: alOut('R4') }, constants: { K_CREST: r2(K_CREST), K_SAG: r2(K_SAG), rampV: RAMP_V, theta: 30, minRadius50: r2(minRadius(50)), minRadius60: r2(minRadius(60)) } };
writeFileSync('docs/J300_GEOM.json', JSON.stringify(DATA));
const ts = `// GENERATED by scripts/j300-geom-gen.ts (STEP J4). Do not edit: rerun the script. Sources: J1-B (docs/J300_TYPEB.json), J2, J3 (docs/J300_CALC.json), the game terrain and old road levels.
// J300 junction GEOMETRY DATA (Type B, B2, Option A, centre u0 = -125). PURE DATA, not imported by the game yet (J9 hooks it up). Config switch NOT wired.
// FRAME: local u along the ring, v = LEFT of u (left-hand traffic), origin = roundabout centre; world = O + u (cos yaw, sin yaw) + v (sin yaw, -cos yaw), world heading = yaw - local heading.
// Local paths are [u, v, headingDeg, station]; arm alignments are WORLD points (x east, z south). Levels in m.
export const J300_FRAME = ${JSON.stringify(DATA.frame)} as const;
export const J300_CIRCLE = ${JSON.stringify(DATA.circle)} as const;
export const J300_LEGS = ${JSON.stringify(DATA.legs)} as const;
export const J300_CROSSINGS = ${JSON.stringify(DATA.crossings)} as const;
export const J300_ISLANDS = ${JSON.stringify(DATA.islands)} as const;
export const J300_ARMS = ${JSON.stringify(DATA.arms)} as const;
export const J300_CONSTANTS = ${JSON.stringify(DATA.constants)} as const;
`;
writeFileSync('src/roads/junction/J300Geometry.ts', ts);
console.log('J300Geometry.ts written', ts.length, 'bytes');
for (const l of legsOut) console.log(l.id, l.entry ? `entry phi ${l.entry.phiDeg} angle ${l.entry.entryAngleDeg} turn ${l.entry.arcTurnDeg} arcStart ${l.entry.arcStart}` : '', l.exit ? `exit phi ${l.exit.phiDeg} turn ${l.exit.arcTurnDeg} end ${l.exit.arcEnd}` : '');
for (const id of ['R6', 'R4']) { const a = DATA.arms[id as 'R6']; console.log(id, 'len', a.length, 'straights', a.straights, 'grade', a.grade, 'endGap', a.endGap, a.endHeadingGapDeg, 'yEnd', a.yEnd, 'R', a.radius, a.pis.length, 'PIs'); }
