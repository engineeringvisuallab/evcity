// AUTO CONNECT AT GRADE, PART A-3 / A-4 (user 2026-11-22: "game a ki amon logic add kora jabe jeta junction guala te road er connection auto nice shape kore connect kore dibe").
// Pure maths (no three.js, no DOM). It builds the geometry of a priority T and of a roundabout AROUND the roads as they are in the game:
//   - NO road line is moved, NO road height is changed (R10). The pad is an extra shape on top; only the last metres of each ribbon get trimmed later (A-5, not in this file).
//   - kerb fillets: exact circles, tangent to the real kerb lines (centreline +- halfWidth) of two legs (T) or to a leg kerb and the ring kerb (roundabout).
//   - pad level = the roads' own levels: the pad is the plane through the three trim-end centre points of the T (least squares plane for a roundabout). The steps are PRINTED, never hidden.
//   - every check returns numbers; a FAIL says what is needed (bridge, re-grade, median-aware version) and nothing is forced.
// The registry (JunctionRegistry.ts) gives the junction list; this file reads it and the roads. It writes nothing.
import type { RoadSpec } from './RoadTypes';
import type { JNode, JLeg, JClass } from './JunctionRegistry';

export type V2 = [number, number];

/** Constants. Kerb radii and sizes are those of 21.48 (centre_junction_geom.json); the rest are my choices (printed by the script). */
export const AUTO = {
  /** Priority T kerb radius (m) by (major class, minor class). */
  kerbArterialMinorC: 15, // major R4 / R6 / 8-lane, minor R2 / C
  kerbArterialMinorL: 10,
  kerbMinorMinor: 12, // R2 / C x R2 / C (and city streets, corridor roads)
  kerbLocalOnMinor: 10, // L on R2 / C
  kerbLocalLocal: 8,
  kerbFloor: 6,
  /** Roundabout: [ICD, circulating width, entry R, exit R] for 1-lane and 2-lane (21.48). */
  rb1: { icd: 30, circW: 5.5, entryR: 15, exitR: 20 },
  rb2: { icd: 50, circW: 9, entryR: 20, exitR: 30 },
  /** Limits (my choice). */
  maxCrossFall: 0.03, // pad plane tilt across the through road (1 : 33)
  maxPadGrade: 0.06, // pad plane tilt along the main direction
  maxStep: 0.15, // plane vs a road centre point at the trim end (m), a roundabout least-squares residual
  maxCut: 3, // cut / fill across the pad (m), the 21.48 roundabout limit
  maxStraightDev: 0.5, // road centreline vs its straight leg axis inside the pad reach (m)
  bridgeReach: 120, // a bridge point within this distance of the junction (m)
  minNeighbour: 105, // another junction closer than this (m)
  stopLineBeyondKerb: 1.5, // stop line distance behind the through-road kerb (m)
  zebraWidth: 3,
  zebraGapBeyondTrim: 2,
};

export interface Ground { h: number; water: boolean }
export type GroundFn = (x: number, z: number) => Ground;

export interface LegGeom {
  roadId: number;
  name: string;
  cls: JClass;
  /** Unit direction leaving the junction along the leg axis, and its left normal (n = (uz, -ux)). */
  u: V2;
  n: V2;
  heading: number;
  halfW: number;
  /** Foot of the perpendicular from the junction point on the leg axis (axis reference point Q, s = 0). */
  q: V2;
  /** Distance (m) of the straight axis from the junction point. */
  axisOffset: number;
  /** Pad end along the leg (m from Q): the ribbon of this road is trimmed back to here. */
  trim: number;
  /** Max sideways deviation (m) of the real centreline from the straight axis over 0..trim + 10. */
  straightDev: number;
  /** Length (m) of the road beyond the junction (what is left after the trim must be >= 10 m). */
  avail: number;
  /** Centre point and surface height of the road at the trim end. */
  endXZ: V2;
  endY: number;
  /** Road surface height at the junction point itself (m), and the gap to the pad plane at the trim end (m). */
  yAtJ: number;
  stepToPlane: number;
  /** Grade of the leg inside the trim length (m/m): (end height - height at Q) / trim. */
  gradeInTrim: number;
  /** Real road surface height every metre along the leg: prof[k] = height at k m from Q, k = 0..trim + 2 (A-5: the pad mesh never lies below the old ribbon). */
  prof: number[];
}

export interface Fillet {
  /** Legs (indices in legs[]) the arc joins; b = -1 for a ring arc. */
  a: number;
  b: number;
  kind: 'corner' | 'entry' | 'exit';
  c: V2;
  r: number;
  /** Tangent points (on leg a kerb, on leg b kerb or the ring) and the arc sweep (deg). */
  t1: V2;
  t2: V2;
  sweepDeg: number;
  /** Corner angle between the legs (deg), corners only. */
  phi?: number;
}

export interface Marking { kind: 'stop' | 'zebra'; leg: number; p0: V2; p1: V2; /** zebra: band depth (m) along the leg */ depth?: number }

export interface PadCheck { name: string; ok: boolean | null; text: string }

export interface PadResult {
  id: string;
  type: 'T' | 'roundabout';
  x: number;
  z: number;
  legs: LegGeom[];
  fillets: Fillet[];
  /** Closed outline of the pad (counter-clockwise in the data order), metres, plan x / z. */
  outline: V2[];
  area: number;
  /** Pad plane: y = y0 + gx * (x - x) + gz * (z - z). */
  plane: { y0: number; gx: number; gz: number };
  ring?: { icd: number; circW: number; islandR: number; outerR: number; lanes: 1 | 2 };
  kerbR?: number;
  markings: Marking[];
  checks: PadCheck[];
  /** true = every check PASS (null checks are INFO and do not count). */
  pass: boolean;
  cut: number;
  fill: number;
  waterSamples: number;
}

// ---------------------------------------------------------------- small vector helpers
const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: V2, b: V2): V2 => [a[0] + b[0], a[1] + b[1]];
const mul = (a: V2, k: number): V2 => [a[0] * k, a[1] * k];
const dot = (a: V2, b: V2): number => a[0] * b[0] + a[1] * b[1];
const len = (a: V2): number => Math.hypot(a[0], a[1]);
const unit = (a: V2): V2 => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const leftN = (u: V2): V2 => [u[1], -u[0]];
const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

/** Walk along a road from a base position (fractional point index) in direction dir (+1 / -1): point at distance d (m). */
function walk(r: RoadSpec, pos: number, dir: 1 | -1, d: number): { x: number; z: number; y: number; bridge: number } {
  const n = r.xs.length;
  let i = Math.floor(pos);
  let f = pos - i;
  // position as a point between i and i+1
  let x = r.xs[Math.min(n - 1, i)] * (1 - f) + r.xs[Math.min(n - 1, i + 1)] * f;
  let z = r.zs[Math.min(n - 1, i)] * (1 - f) + r.zs[Math.min(n - 1, i + 1)] * f;
  let y = r.ys[Math.min(n - 1, i)] * (1 - f) + r.ys[Math.min(n - 1, i + 1)] * f;
  let bridge = r.bridgeOf[Math.min(n - 1, Math.round(pos))];
  // next vertex in the walking direction
  let k = dir === 1 ? i + 1 : f > 0 ? i : i - 1;
  let left = d;
  while (left > 0 && k >= 0 && k < n) {
    const sx = r.xs[k] - x, sz = r.zs[k] - z;
    const L = Math.hypot(sx, sz);
    if (L >= left) {
      const t = left / (L || 1);
      const y2 = y + (r.ys[k] - y) * t;
      x += sx * t; z += sz * t; y = y2; left = 0;
      bridge = Math.max(bridge, r.bridgeOf[k]);
      break;
    }
    x = r.xs[k]; z = r.zs[k]; y = r.ys[k]; left -= L;
    bridge = Math.max(bridge, r.bridgeOf[k]);
    k += dir;
  }
  if (left > 0) return { x, z, y, bridge: bridge === undefined ? -1 : bridge };
  return { x, z, y, bridge };
}
/** Fractional point index of the road point nearest to p. */
function nearestPos(r: RoadSpec, px: number, pz: number): number {
  let best = 1e18, pos = 0;
  const n = r.xs.length;
  for (let i = 0; i < n - 1; i++) {
    const ax = r.xs[i], az = r.zs[i], dx = r.xs[i + 1] - ax, dz = r.zs[i + 1] - az;
    const L = dx * dx + dz * dz;
    const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L));
    const d = Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
    if (d < best) { best = d; pos = i + t; }
  }
  return pos;
}

// ---------------------------------------------------------------- legs
interface RawLeg { jl: JLeg; r: RoadSpec; pos: number; dir: 1 | -1; base: V2 }

function rawLeg(jl: JLeg, roads: Map<number, RoadSpec>, p: V2): RawLeg | null {
  const r = roads.get(jl.roadId);
  if (!r) return null;
  const n = r.xs.length;
  if (jl.end === 0) return { jl, r, pos: 0, dir: 1, base: [r.xs[0], r.zs[0]] };
  if (jl.end === 1) return { jl, r, pos: n - 1, dir: -1, base: [r.xs[n - 1], r.zs[n - 1]] };
  const pos = nearestPos(r, p[0], p[1]);
  const i = Math.min(n - 2, Math.floor(pos));
  const fx = r.xs[i + 1] - r.xs[i], fz = r.zs[i + 1] - r.zs[i];
  const hFwd = deg(Math.atan2(fz, fx));
  let diff = Math.abs(((jl.heading - hFwd + 540) % 360) - 180);
  const forward = diff < 90;
  const b = walk(r, pos, 1, 0);
  return { jl, r, pos, dir: forward ? 1 : -1, base: [b.x, b.z] };
}

function buildLeg(rl: RawLeg, p: V2): LegGeom {
  const { r, pos, dir } = rl;
  const a = walk(r, pos, dir, 6), b = walk(r, pos, dir, 36);
  const u = unit([b.x - a.x, b.z - a.z]);
  const n = leftN(u);
  const q = sub([a.x, a.z], mul(u, dot(sub([a.x, a.z], p), u)));
  const total = dir === 1 ? r.cum[r.cum.length - 1] - r.cum[Math.min(r.cum.length - 1, Math.floor(pos))] : r.cum[Math.max(0, Math.ceil(pos))];
  return {
    roadId: r.id, name: r.name, cls: rl.jl.cls, u, n, heading: deg(Math.atan2(u[1], u[0])), halfW: r.halfWidth, q,
    axisOffset: len(sub(q, p)), trim: 0, straightDev: 0, avail: total, endXZ: [0, 0], endY: 0, yAtJ: 0, stepToPlane: 0, gradeInTrim: 0, prof: [],
  };
}
/** Road height at the leg station s (m from Q), by walking the real road. */
function legWalk(rl: RawLeg, lg: LegGeom, s: number): { x: number; z: number; y: number; bridge: number } {
  const sb = dot(sub(rl.base, lg.q), lg.u);
  return walk(rl.r, rl.pos, rl.dir, Math.max(0, s - sb));
}

// ---------------------------------------------------------------- shared helpers
function lineIntersect(p1: V2, d1: V2, p2: V2, d2: V2): V2 | null {
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den;
  return add(p1, mul(d1, t));
}
function arcPts(c: V2, r: number, a0: number, a1: number, step = 4): V2[] {
  // a0 -> a1 along the SHORT way
  let d = a1 - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const nSeg = Math.max(2, Math.ceil(Math.abs(d) * r / step));
  const out: V2[] = [];
  for (let k = 0; k <= nSeg; k++) { const a = a0 + (d * k) / nSeg; out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
  return out;
}
const angleOf = (c: V2, p: V2): number => Math.atan2(p[1] - c[1], p[0] - c[0]);
function polyArea(pts: V2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; s += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]; }
  return Math.abs(s) / 2;
}
function pointInPoly(pts: V2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
/** Least squares plane y = y0 + gx (x - cx) + gz (z - cz) through the points (3 points: exact). */
function fitPlane(pts: { x: number; z: number; y: number }[], cx: number, cz: number): { y0: number; gx: number; gz: number } {
  const n = pts.length;
  // normal equations for [1, dx, dz]
  let sxx = 0, sxz = 0, szz = 0, sx = 0, sz = 0, sy = 0, sxy = 0, szy = 0;
  for (const p of pts) { const dx = p.x - cx, dz = p.z - cz; sx += dx; sz += dz; sy += p.y; sxx += dx * dx; sxz += dx * dz; szz += dz * dz; sxy += dx * p.y; szy += dz * p.y; }
  const A = [[n, sx, sz], [sx, sxx, sxz], [sz, sxz, szz]];
  const B = [sy, sxy, szy];
  const det = (m: number[][]): number => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A);
  if (Math.abs(D) < 1e-9) return { y0: sy / n, gx: 0, gz: 0 };
  const rep = (col: number): number[][] => A.map((row, i) => row.map((v, j) => (j === col ? B[i] : v)));
  return { y0: det(rep(0)) / D, gx: det(rep(1)) / D, gz: det(rep(2)) / D };
}
const planeY = (pl: { y0: number; gx: number; gz: number }, cx: number, cz: number, x: number, z: number): number => pl.y0 + pl.gx * (x - cx) + pl.gz * (z - cz);

// ---------------------------------------------------------------- the engine
export interface AutoInput {
  node: JNode;
  roads: RoadSpec[];
  /** Other junction points (for the neighbour clearance). */
  others: { id: string; x: number; z: number }[];
  ground?: GroundFn;
}

function kerbRadius(major: JClass, minor: JClass): number {
  const big = (c: JClass): boolean => c === '4' || c === '6' || c === '8';
  const mid = (c: JClass): boolean => c === '2' || c === 'C' || c === 'S' || c === 'X';
  if (big(major)) return minor === 'L' ? AUTO.kerbArterialMinorL : AUTO.kerbArterialMinorC;
  if (mid(major) && mid(minor)) return AUTO.kerbMinorMinor;
  if (mid(major) && minor === 'L') return AUTO.kerbLocalOnMinor;
  return AUTO.kerbLocalLocal;
}

export function buildAutoJunction(inp: AutoInput): PadResult {
  const { node } = inp;
  const p: V2 = [node.x, node.z];
  const roadMap = new Map<number, RoadSpec>();
  for (const r of inp.roads) roadMap.set(r.id, r);
  const raws: RawLeg[] = [];
  for (const jl of node.legs) { const rl = rawLeg(jl, roadMap, p); if (rl) raws.push(rl); }
  // order by heading (increasing atan2 angle)
  const legsAll = raws.map((rl) => ({ rl, lg: buildLeg(rl, p) }));
  legsAll.sort((a, b) => a.lg.heading - b.lg.heading);
  const legs = legsAll.map((x) => x.lg);
  const raw = legsAll.map((x) => x.rl);
  const checks: PadCheck[] = [];
  const chk = (name: string, ok: boolean | null, text: string): void => { checks.push({ name, ok, text }); };

  const isRb = node.type === 'roundabout' || legs.length >= 4;
  const result: PadResult = { id: node.id, type: isRb ? 'roundabout' : 'T', x: p[0], z: p[1], legs, fillets: [], outline: [], area: 0, plane: { y0: node.y, gx: 0, gz: 0 }, markings: [], checks, pass: false, cut: 0, fill: 0, waterSamples: 0 };

  // divided roads (median) are not handled by this version
  const divided = legs.filter((l) => roadMap.get(l.roadId)!.medianHalf > 0);
  chk('A0 no median on a leg', divided.length === 0, divided.length ? `leg(s) ${divided.map((l) => l.name).join(', ')} have a median: needs the median-aware version (not in this pilot)` : 'no leg has a median');
  if (divided.length || legs.length < 3) { result.pass = false; return result; }

  if (!isRb) buildT(result, raw, chk);
  else buildRoundabout(result, raw, p, chk);
  if (!result.outline.length) { result.pass = false; return result; }
  result.area = polyArea(result.outline);

  // ---- plane + trim-end heights
  const ends = legs.map((lg, i) => { const w = legWalk(raw[i], lg, lg.trim); lg.endXZ = [w.x, w.z]; lg.endY = w.y; const w0 = legWalk(raw[i], lg, 0); lg.yAtJ = w0.y; lg.gradeInTrim = (w.y - w0.y) / Math.max(1, lg.trim); lg.prof = []; for (let k = 0; k <= Math.ceil(lg.trim) + 2; k++) lg.prof.push(legWalk(raw[i], lg, k).y); return { x: lg.endXZ[0], z: lg.endXZ[1], y: w.y }; });
  // use the CENTRE point of the leg at the trim end on the straight axis (kerb lines were built on it); heights come from the real road
  const pl = fitPlane(ends, p[0], p[1]);
  result.plane = pl;
  let maxStep = 0;
  legs.forEach((lg) => { lg.stepToPlane = lg.endY - planeY(pl, p[0], p[1], lg.endXZ[0], lg.endXZ[1]); maxStep = Math.max(maxStep, Math.abs(lg.stepToPlane)); });
  const tilt = Math.hypot(pl.gx, pl.gz);
  // cross fall = tilt component across the through road (T) / the whole tilt (roundabout)
  let across = tilt;
  if (!isRb) {
    const th = through(legs);
    if (th) across = Math.abs(pl.gx * th.nvec[0] + pl.gz * th.nvec[1]);
  }
  chk('A4 pad level = road levels', maxStep <= AUTO.maxStep, `plane through the road ends: biggest step to a road end ${maxStep.toFixed(3)} m (limit ${AUTO.maxStep} m), pad height ${pl.y0.toFixed(2)} m at the junction point`);
  chk('A4 pad tilt', across <= AUTO.maxCrossFall && tilt <= AUTO.maxPadGrade, `tilt ${(tilt * 100).toFixed(2)} %${isRb ? '' : `, across the through road ${(across * 100).toFixed(2)} % (limit ${AUTO.maxCrossFall * 100} %)`}`);
  const maxGradeLeg = Math.max(...legs.map((l) => Math.abs(l.gradeInTrim)));
  chk('A4 road grade inside the trim', legs.every((l) => Math.abs(l.gradeInTrim) <= roadMap.get(l.roadId)!.maxGrade), `biggest leg grade inside the trim ${(maxGradeLeg * 100).toFixed(2)} %`);

  // ---- ground and water
  if (inp.ground) {
    const xs = result.outline.map((q) => q[0]), zs = result.outline.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    let cut = 0, fill = 0, water = 0;
    for (let x = x0; x <= x1; x += 3) for (let z = z0; z <= z1; z += 3) {
      if (!pointInPoly(result.outline, x, z)) continue;
      const g = inp.ground(x, z);
      if (g.water) water++;
      const d = planeY(pl, p[0], p[1], x, z) - g.h; // > 0 = fill, < 0 = cut
      if (d > fill) fill = d;
      if (-d > cut) cut = -d;
    }
    result.cut = cut; result.fill = fill; result.waterSamples = water;
    chk('A4 ground (cut / fill)', Math.max(cut, fill) <= AUTO.maxCut, `inside the pad: biggest fill ${fill.toFixed(2)} m, biggest cut ${cut.toFixed(2)} m (limit ${AUTO.maxCut} m) - NATURAL ground, the roads' own cut / fill is not counted`);
    chk('A4 water', water === 0, water ? `${water} water sample(s) inside the pad` : 'no water inside the pad');
  } else chk('A4 ground', null, 'no ground function given: NOT RUN');

  // ---- bridges, neighbours
  let bridgeHit = '';
  raw.forEach((rl, i) => { for (let d = 0; d <= AUTO.bridgeReach; d += 6) { const w = legWalk(rl, legs[i], d); if (w.bridge >= 0) { bridgeHit = `${legs[i].name} bridge ${w.bridge} at ${d} m`; return; } } });
  chk('A4 no bridge near', !bridgeHit, bridgeHit ? `FAIL: ${bridgeHit} (a bridge needs its own design)` : `no bridge within ${AUTO.bridgeReach} m on any leg`);
  let near = 1e18, nearId = '';
  for (const o of inp.others) { if (o.id === node.id) continue; const d = Math.hypot(o.x - p[0], o.z - p[1]); if (d < near) { near = d; nearId = o.id; } }
  chk('A3 neighbour junction', near >= AUTO.minNeighbour, `nearest other junction ${nearId} ${near.toFixed(0)} m (limit ${AUTO.minNeighbour} m)`);
  // reach of each leg
  const tightest = legs.reduce((m, l) => Math.min(m, l.avail - l.trim), 1e18);
  chk('A3 road length left after the trim', tightest >= 10, `shortest road left after the trim ${tightest.toFixed(0)} m (need 10 m)`);
  const sd = Math.max(...legs.map((l) => l.straightDev));
  chk('A3 legs are straight', sd <= AUTO.maxStraightDev, `biggest sideways deviation of a real road line from its straight leg axis inside the pad reach ${sd.toFixed(2)} m (limit ${AUTO.maxStraightDev} m); axis offsets from the junction point ${legs.map((l) => l.axisOffset.toFixed(2)).join(' / ')} m`);
  result.pass = checks.every((c) => c.ok !== false);
  return result;
}

function through(legs: LegGeom[]): { a: number; b: number; minor: number; nvec: V2 } | null {
  // two legs about 180 deg apart (< 25 deg off) = the through road
  let best: { a: number; b: number; err: number } | null = null;
  for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) {
    const c = dot(legs[i].u, legs[j].u);
    const err = Math.abs(deg(Math.acos(Math.max(-1, Math.min(1, c)))) - 180);
    if (!best || err < best.err) best = { a: i, b: j, err };
  }
  if (!best || best.err > 25 || legs.length !== 3) return null;
  const minor = [0, 1, 2].find((k) => k !== best!.a && k !== best!.b)!;
  const dirv = unit(sub(legs[best.a].u, legs[best.b].u)); // along the through road
  return { a: best.a, b: best.b, minor, nvec: leftN(dirv) };
}

// ---------------------------------------------------------------- T junction
function buildT(res: PadResult, raw: RawLeg[], chk: (n: string, ok: boolean | null, t: string) => void): void {
  const legs = res.legs;
  const th = through(legs);
  if (!th) { chk('A3 T shape', false, 'three legs but no two of them run through (within 25 deg of a straight line): a Y junction, not a T (separate handling)'); return; }
  const { a, b, minor } = th;
  const R0 = kerbRadius(legs[a].cls, legs[minor].cls);
  res.kerbR = R0;
  // kerb lines: for leg i side sg (+1 = +n, -1 = -n): point Q + sg * hw * n, direction u
  const kerbPt = (i: number, sg: number): V2 => add(legs[i].q, mul(legs[i].n, sg * legs[i].halfW));
  const fillets: Fillet[] = [];
  // the corners: between the minor leg and each through leg. Which side of the minor faces which through leg:
  const corner = (i: number, j: number): { f: Fillet; si: number; sj: number } | null => {
    const phi = deg(Math.acos(Math.max(-1, Math.min(1, dot(legs[i].u, legs[j].u)))));
    // the side of leg i that faces leg j: sign of (u_j . n_i)
    const sg_i = dot(legs[j].u, legs[i].n) > 0 ? 1 : -1;
    const sg_j = dot(legs[i].u, legs[j].n) > 0 ? 1 : -1;
    const A = kerbPt(i, sg_i), B = kerbPt(j, sg_j);
    const X = lineIntersect(A, legs[i].u, B, legs[j].u);
    if (!X) return null;
    // skewed corner: acute R * 90 / phi, obtuse R * phi / 90 (21.48), floor 6 m
    const R = Math.max(AUTO.kerbFloor, phi < 90 ? (R0 * 90) / phi : (R0 * phi) / 90);
    const tl = R / Math.tan(rad(phi) / 2);
    const t1 = add(X, mul(legs[i].u, tl)), t2 = add(X, mul(legs[j].u, tl));
    const bis = unit(add(legs[i].u, legs[j].u));
    const c = add(X, mul(bis, R / Math.sin(rad(phi) / 2)));
    const sweep = 180 - phi;
    return { f: { a: i, b: j, kind: 'corner', c, r: R, t1, t2, sweepDeg: sweep, phi }, si: dot(sub(t1, legs[i].q), legs[i].u), sj: dot(sub(t2, legs[j].q), legs[j].u) };
  };
  const c1 = corner(minor, a), c2 = corner(minor, b);
  if (!c1 || !c2) { chk('A3 T shape', false, 'kerb lines do not meet'); return; }
  fillets.push(c1.f, c2.f);
  // trims: the minor leg needs the bigger of its two tangent distances; the through legs their own tangent distance (+ 1 m margin so the arc does not touch the ribbon cut)
  legs[minor].trim = Math.ceil(Math.max(c1.si, c2.si)) + 1;
  legs[a].trim = Math.ceil(c1.sj) + 1;
  legs[b].trim = Math.ceil(c2.sj) + 1;
  // outline: ring around the pad in a fixed order. Walk: minor kerb-end (side 1) -> arc to through leg a -> through leg a end -> across -> back (straight kerb on the far side, no fillet) -> through leg b end -> arc -> minor.
  const sideOf = (i: number, j: number): number => (dot(legs[j].u, legs[i].n) > 0 ? 1 : -1);
  const sMin1 = sideOf(minor, a), sMin2 = sideOf(minor, b);
  const sA = sideOf(a, minor), sB = sideOf(b, minor);
  const pt = (i: number, sg: number, s: number): V2 => add(add(legs[i].q, mul(legs[i].u, s)), mul(legs[i].n, sg * legs[i].halfW));
  const out: V2[] = [];
  out.push(pt(minor, sMin1, legs[minor].trim));
  out.push(...arcPts(c1.f.c, c1.f.r, angleOf(c1.f.c, c1.f.t1), angleOf(c1.f.c, c1.f.t2)));
  out.push(pt(a, sA, legs[a].trim));
  out.push(pt(a, -sA, legs[a].trim));
  out.push(pt(b, -sB, legs[b].trim));
  out.push(pt(b, sB, legs[b].trim));
  out.push(...arcPts(c2.f.c, c2.f.r, angleOf(c2.f.c, c2.f.t2), angleOf(c2.f.c, c2.f.t1)));
  out.push(pt(minor, sMin2, legs[minor].trim));
  res.outline = out;
  res.fillets = fillets;

  // straightness: real centreline vs straight axis over 0..trim + 10
  legs.forEach((lg, i) => {
    let dev = 0;
    for (let s = 0; s <= lg.trim + 10; s += 3) { const w = legWalk(raw[i], lg, s); const off = Math.abs(dot(sub([w.x, w.z], lg.q), lg.n)); if (off > dev) dev = off; }
    lg.straightDev = dev;
  });
  chk('A3 T angle', true, `angle between the minor leg and the through road ${c1.f.phi!.toFixed(1)} / ${c2.f.phi!.toFixed(1)} deg, kerb radius ${c1.f.r.toFixed(1)} / ${c2.f.r.toFixed(1)} m (base ${R0} m for major ${legs[a].cls} x minor ${legs[minor].cls})`);
  chk('A3 corner angle', Math.min(c1.f.phi!, c2.f.phi!) >= 60, `smallest corner angle ${Math.min(c1.f.phi!, c2.f.phi!).toFixed(1)} deg (a T under 60 deg goes on the fix list)`);

  // markings on the minor leg: stop line behind the through kerb, zebra beyond the flare
  const m = legs[minor];
  const dTrim = m.trim;
  // distance along the minor axis to the near kerb of the through road (the side of the through road that faces the minor leg)
  const kx = lineIntersect(m.q, m.u, kerbPt(a, sA), legs[a].u);
  const sX = kx ? dot(sub(kx, m.q), m.u) : 0;
  const sStop = sX + AUTO.stopLineBeyondKerb;
  const inSide = -1; // vehicles keep LEFT (D1): the inbound half is the -n side of the outward axis
  const stop0 = add(m.q, add(mul(m.u, sStop), mul(m.n, 0))), stop1 = add(m.q, add(mul(m.u, sStop), mul(m.n, inSide * m.halfW)));
  res.markings.push({ kind: 'stop', leg: minor, p0: stop0, p1: stop1 });
  const zs0 = dTrim + AUTO.zebraGapBeyondTrim;
  res.markings.push({ kind: 'zebra', leg: minor, p0: add(m.q, add(mul(m.u, zs0), mul(m.n, m.halfW))), p1: add(m.q, add(mul(m.u, zs0), mul(m.n, -m.halfW))), depth: AUTO.zebraWidth });
  chk('A5 stop line / zebra', true, `stop line ${sStop.toFixed(1)} m from the junction axis (through kerb at ${sX.toFixed(1)} m + ${AUTO.stopLineBeyondKerb}); zebra ${AUTO.zebraWidth} m deep at ${zs0.toFixed(0)}..${(zs0 + AUTO.zebraWidth).toFixed(0)} m (beyond the flare, constant width)`);
}

// ---------------------------------------------------------------- roundabout
function buildRoundabout(res: PadResult, raw: RawLeg[], p: V2, chk: (n: string, ok: boolean | null, t: string) => void): void {
  const legs = res.legs;
  const two = legs.some((l) => l.cls === '4' || l.cls === '6');
  const P = two ? AUTO.rb2 : AUTO.rb1;
  const Ro = P.icd / 2;
  res.ring = { icd: P.icd, circW: P.circW, islandR: Ro - P.circW, outerR: Ro, lanes: two ? 2 : 1 };
  let fillets: Fillet[] = [];
  let k = 1;
  let ring: { leg: number; side: 'entry' | 'exit'; ang: number; kerbS: number; f: Fillet }[] = [];
  let okAll = true;
  let shrunk = 1;
  for (; k >= 0.5; k -= 0.05) {
  fillets = []; ring = []; okAll = true;
  // per leg: entry fillet on the -n side (traffic keeps left, joins clockwise on the plan), exit fillet on the +n side
  legs.forEach((lg, i) => {
    for (const side of ['entry', 'exit'] as const) {
      const sg = side === 'entry' ? -1 : 1;
      const r = Math.max(side === 'entry' ? 10 : 12, (side === 'entry' ? P.entryR : P.exitR) * k);
      const d = add(sub(lg.q, p), mul(lg.n, sg * (lg.halfW + r)));
      const du = dot(d, lg.u);
      const disc = du * du - dot(d, d) + (Ro + r) * (Ro + r);
      if (disc < 0) { okAll = false; chk('A3 fillet', false, `${lg.name}: the ${side} fillet R ${r} does not reach the ring (road wider than the ring)`); return; }
      const s = -du + Math.sqrt(disc);
      const cc = add(p, add(d, mul(lg.u, s)));
      const t1 = add(add(lg.q, mul(lg.u, s)), mul(lg.n, sg * lg.halfW));
      const t2 = add(p, mul(sub(cc, p), Ro / (Ro + r)));
      const f: Fillet = { a: i, b: -1, kind: side, c: cc, r, t1, t2, sweepDeg: 0 };
      f.sweepDeg = Math.abs(deg(((angleOf(cc, t2) - angleOf(cc, t1) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI));
      ring.push({ leg: i, side, ang: angleOf(p, t2), kerbS: s, f });
      fillets.push(f);
    }
  });
  if (!okAll) break;
  // free ring kerb between neighbouring legs must be at least 8 deg of arc, else shrink both radii (floors: entry 10 m, exit 12 m)
  let minArc = 360;
  for (let i = 0; i < legs.length; i++) {
    const en = ring.find((q) => q.leg === i && q.side === 'entry')!;
    const nx = ring.find((q) => q.leg === (i + 1) % legs.length && q.side === 'exit')!;
    let d = angleOf(p, nx.f.t2) - angleOf(p, en.f.t2);
    while (d < 0) d += 2 * Math.PI;
    minArc = Math.min(minArc, deg(d));
  }
  shrunk = k;
  if (minArc >= 8) break;
  }
  if (!okAll) return;
  legs.forEach((lg, i) => { lg.trim = Math.ceil(Math.max(...ring.filter((q) => q.leg === i).map((q) => q.kerbS))) + 1; });
  // outline in increasing angle order of the legs; for each leg: [ring point of the exit side] -> fillet -> kerb out to the trim -> across -> kerb back -> fillet -> [ring point of the entry side] -> ring arc to the next leg
  const out: V2[] = [];
  const kerbAt = (i: number, sg: number, s: number): V2 => add(add(legs[i].q, mul(legs[i].u, s)), mul(legs[i].n, sg * legs[i].halfW));
  let minRingArc = 360;
  for (let i = 0; i < legs.length; i++) {
    const ex = ring.find((q) => q.leg === i && q.side === 'exit')!, en = ring.find((q) => q.leg === i && q.side === 'entry')!;
    // exit fillet: from the ring point back out to the kerb
    out.push(...arcPts(ex.f.c, ex.f.r, angleOf(ex.f.c, ex.f.t2), angleOf(ex.f.c, ex.f.t1)));
    out.push(kerbAt(i, 1, legs[i].trim), kerbAt(i, -1, legs[i].trim));
    out.push(...arcPts(en.f.c, en.f.r, angleOf(en.f.c, en.f.t1), angleOf(en.f.c, en.f.t2)));
    const nx = ring.find((q) => q.leg === (i + 1) % legs.length && q.side === 'exit')!;
    // ring kerb arc from this entry ring point to the next leg's exit ring point, increasing angle
    let d = angleOf(p, nx.f.t2) - angleOf(p, en.f.t2);
    while (d < 0) d += 2 * Math.PI;
    while (d >= 2 * Math.PI) d -= 2 * Math.PI;
    minRingArc = Math.min(minRingArc, deg(d));
    out.push(...arcPts(p, Ro, angleOf(p, en.f.t2), angleOf(p, en.f.t2) + d).slice(1, -1));
  }
  res.outline = out;
  res.fillets = fillets;
  legs.forEach((lg, i) => {
    let dev = 0;
    for (let s = 0; s <= lg.trim + 10; s += 3) { const w = legWalk(raw[i], lg, s); const off = Math.abs(dot(sub([w.x, w.z], lg.q), lg.n)); if (off > dev) dev = off; }
    lg.straightDev = dev;
  });
  let minAng = 360;
  for (let i = 0; i < legs.length; i++) { let d = legs[(i + 1) % legs.length].heading - legs[i].heading; while (d <= 0) d += 360; minAng = Math.min(minAng, d); }
  chk('A3 roundabout size', true, `${two ? '2' : '1'}-lane ring: ICD ${P.icd} m, circulating ${P.circW} m, central island R ${(Ro - P.circW).toFixed(1)} m, entry R ${Math.max(10, P.entryR * shrunk).toFixed(1)} m, exit R ${Math.max(12, P.exitR * shrunk).toFixed(1)} m (21.48 constants ${P.entryR} / ${P.exitR}${shrunk < 1 ? `, scaled by ${shrunk.toFixed(2)} so the ring kerb between two legs is at least 8 deg` : ''})`);
  chk('A3 ring kerb between legs', minRingArc >= 8 - 0.01, `shortest free ring kerb between two legs ${minRingArc.toFixed(1)} deg of arc (need >= 8 deg, else the fillets nearly touch); smallest angle between legs ${minAng.toFixed(1)} deg`);
}
