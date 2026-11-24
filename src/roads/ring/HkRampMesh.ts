// STEP HK-9b: MESH of one loop ramp (pure data like RingBridgeGeometry: positions / colours / indices, absolute world coordinates, no scene).
// Per ramp: asphalt top (the collider surface), two solid edge lines, two parapets, a box girder underneath (1.4 m deep, trapezoid), and the support:
//   fill over the ground <= PIER_FILL (the ends): a retaining wall on each side down to the ground (earth embankment)
//   fill over the ground  > PIER_FILL (game rule: ramps higher than 3 m are viaducts): a cap beam + one column every <= PIER_SPAN m down to the ground
// The ramp is cut where its pavement would touch the ring deck (MAX_OFF m from the ring axis): the last part up to the ring lane is the auxiliary lane (HK-9c).
import type { MeshData, Rgb } from './RingBridgeGeometry';
import type { HkRamp } from './HkRamps';

export const HM = {
  depth: 1.4, parapetH: 0.9, parapetT: 0.35, lineW: 0.15, lineGap: 0.6, markLift: 0.03,
  pierFill: 3, pierSpan: 28, colAlong: 1.6, colAcross: 2.2, capAlong: 2.4, capAcross: 7.2, capH: 1.0, embed: 4, wallT: 0.4,
  /** Ring deck half width (NODE_VIADUCT.deckHalf 25.75) + ramp half width 4.2: from here to the ring the ramp is the auxiliary lane (HK-9c). */
  maxOff: 30,
  /** HK-fix1: parapets and retaining walls are left out while the ramp centre is closer than this to a C-D road centre (ramp half 4.2 + C-D half 4.2 + 0.4): there the two pavements overlap / touch (the gore), a wall would stand in the road. */
  parClear: 8.8,
} as const;
const COL = {
  asphalt: [0.23, 0.23, 0.24] as Rgb, mark: [0.95, 0.95, 0.93] as Rgb, concrete: [0.7, 0.7, 0.68] as Rgb, under: [0.52, 0.52, 0.52] as Rgb,
  parapet: [0.66, 0.66, 0.65] as Rgb, pier: [0.7, 0.7, 0.68] as Rgb, wall: [0.62, 0.6, 0.57] as Rgb,
} as const;

class M {
  readonly d: MeshData = { positions: [], colors: [], indices: [] };
  v(x: number, y: number, z: number, c: Rgb): number { const i = this.d.positions.length / 3; this.d.positions.push(x, y, z); this.d.colors.push(c[0], c[1], c[2]); return i; }
  quad(a: number, b: number, c: number, e: number): void { this.d.indices.push(a, b, c, a, c, e); }
  /** Oriented box: centre (x, z), heading h, size along / across, y0 .. y1; four sides + top. */
  box(x: number, z: number, h: number, along: number, across: number, y0: number, y1: number, c: Rgb): void {
    const co = Math.cos(h), si = Math.sin(h), a = along / 2, b = across / 2;
    const P = (la: number, lb: number): [number, number] => [x + la * co - lb * si, z + la * si + lb * co];
    const k = [P(-a, -b), P(a, -b), P(a, b), P(-a, b)];
    for (let i = 0; i < 4; i++) { const p = k[i], q = k[(i + 1) % 4]; this.quad(this.v(p[0], y0, p[1], c), this.v(q[0], y0, q[1], c), this.v(q[0], y1, q[1], c), this.v(p[0], y1, p[1], c)); }
    this.quad(this.v(k[0][0], y1, k[0][1], c), this.v(k[1][0], y1, k[1][1], c), this.v(k[2][0], y1, k[2][1], c), this.v(k[3][0], y1, k[3][1], c));
  }
}

/** Mesh of one ramp. ringOff(x, z) = distance of a point from the ring axis; ground(x, z) = terrain height (optional: without it the ramp stands on columns 12 m long). */
export function buildHkRampMesh(rp: HkRamp, ringOff: (x: number, z: number) => number, ground?: (x: number, z: number) => number, cdDist?: (x: number, z: number) => number): MeshData {
  const m = new M();
  const n = rp.xs.length, W = rp.halfW, D = HM.depth;
  // kept points: from the C-D end toward the ring end until the pavement would touch the ring deck
  const cdEnd = rp.ringEnd === 0 ? n - 1 : 0, step = rp.ringEnd === 0 ? -1 : 1;
  const keep: number[] = [];
  for (let i = cdEnd; i >= 0 && i < n; i += step) { if (ringOff(rp.xs[i], rp.zs[i]) <= HM.maxOff) break; keep.push(i); }
  if (keep.length < 2) return m.d;
  const R = keep.length;
  const tx: number[] = [], tz: number[] = [];
  for (let r = 0; r < R; r++) { const a = keep[Math.max(0, r - 1)], b = keep[Math.min(R - 1, r + 1)]; const dx = rp.xs[b] - rp.xs[a], dz = rp.zs[b] - rp.zs[a], l = Math.hypot(dx, dz) || 1; tx.push(dx / l); tz.push(dz / l); }
  const px = (r: number, u: number): number => rp.xs[keep[r]] - tz[r] * u; // normal = (-tz, tx)
  const pz = (r: number, u: number): number => rp.zs[keep[r]] + tx[r] * u;
  const yy = (r: number): number => rp.ys[keep[r]];
  const gy = (x: number, z: number, fb: number): number => (ground ? ground(x, z) : fb);
  // HK-fix1: sections whose parapets / walls are drawn (clear of the C-D road)
  const hasPar: boolean[] = [];
  for (let r = 0; r < R; r++) hasPar.push(!cdDist || cdDist(rp.xs[keep[r]], rp.zs[keep[r]]) >= HM.parClear);
  const sec: { top: number[]; lineL: number[]; lineR: number[]; sideL: number[]; sideR: number[]; bot: number[]; parL: number[][]; parR: number[][] }[] = [];
  for (let r = 0; r < R; r++) {
    const y = yy(r);
    const at = (u: number, dy: number, c: Rgb): number => m.v(px(r, u), y + dy, pz(r, u), c);
    const li = W - HM.lineGap, lo = li - HM.lineW, wi = W - HM.parapetT;
    const par = (s: number): number[] => [at(s * wi, 0, COL.parapet), at(s * W, 0, COL.parapet), at(s * W, HM.parapetH, COL.parapet), at(s * wi, HM.parapetH, COL.parapet)];
    sec.push({
      top: [at(-W, 0, COL.asphalt), at(W, 0, COL.asphalt)],
      lineL: [at(-li, HM.markLift, COL.mark), at(-lo, HM.markLift, COL.mark)], lineR: [at(lo, HM.markLift, COL.mark), at(li, HM.markLift, COL.mark)],
      sideL: [at(-W, -0.02, COL.concrete), at(-W, -0.7, COL.concrete)], sideR: [at(W, -0.02, COL.concrete), at(W, -0.7, COL.concrete)],
      bot: [at(-0.6 * W, -D, COL.under), at(0.6 * W, -D, COL.under), at(-W, -0.7, COL.concrete), at(W, -0.7, COL.concrete)],
      parL: [par(-1)], parR: [par(1)],
    });
  }
  for (let r = 0; r + 1 < R; r++) {
    const a = sec[r], b = sec[r + 1];
    m.quad(a.top[0], a.top[1], b.top[1], b.top[0]); // asphalt
    m.quad(a.lineL[0], a.lineL[1], b.lineL[1], b.lineL[0]); m.quad(a.lineR[0], a.lineR[1], b.lineR[1], b.lineR[0]);
    m.quad(a.sideL[0], a.sideL[1], b.sideL[1], b.sideL[0]); m.quad(a.sideR[0], a.sideR[1], b.sideR[1], b.sideR[0]);
    m.quad(a.bot[2], a.bot[0], b.bot[0], b.bot[2]); m.quad(a.bot[0], a.bot[1], b.bot[1], b.bot[0]); m.quad(a.bot[1], a.bot[3], b.bot[3], b.bot[1]); // soffit: left slope, flat, right slope
    if (hasPar[r] && hasPar[r + 1]) for (const [pa, pb] of [[a.parL[0], b.parL[0]], [a.parR[0], b.parR[0]]]) for (let q = 0; q < 4; q++) m.quad(pa[q], pa[(q + 1) % 4], pb[(q + 1) % 4], pb[q]);
    else if (hasPar[r] !== hasPar[r + 1]) { const c = hasPar[r] ? a : b; for (const pq of [c.parL[0], c.parR[0]]) m.quad(pq[0], pq[1], pq[2], pq[3]); } // end cap of a parapet that stops here
  }
  // end caps of the girder (so it is closed at both ends)
  for (const r of [0, R - 1]) { const s = sec[r]; m.quad(s.sideL[0], s.sideR[0], s.sideR[1], s.sideL[1]); m.quad(s.sideL[1], s.sideR[1], s.bot[3], s.bot[2]); m.quad(s.bot[2], s.bot[0], s.bot[1], s.bot[3]); }
  // support: wall (low fill) or cap + column (high fill)
  const fillAt = (r: number): number => yy(r) - gy(rp.xs[keep[r]], rp.zs[keep[r]], yy(r) - 12);
  for (let r = 0; r + 1 < R; r++) {
    if ((fillAt(r) + fillAt(r + 1)) / 2 > HM.pierFill || !hasPar[r] || !hasPar[r + 1]) continue;
    for (const s of [-1, 1]) {
      const bot = (q: number): number => Math.min(yy(q) - 0.7, gy(px(q, s * W), pz(q, s * W), yy(q) - 12) - 0.3);
      m.quad(m.v(px(r, s * W), yy(r) - 0.02, pz(r, s * W), COL.wall), m.v(px(r + 1, s * W), yy(r + 1) - 0.02, pz(r + 1, s * W), COL.wall), m.v(px(r + 1, s * W), bot(r + 1), pz(r + 1, s * W), COL.wall), m.v(px(r, s * W), bot(r), pz(r, s * W), COL.wall));
    }
  }
  let next = HM.pierSpan / 2; const cum0 = rp.cum[keep[0]];
  for (let r = 0; r < R; r++) {
    const c = Math.abs(rp.cum[keep[r]] - cum0);
    if (c < next) continue;
    next += HM.pierSpan;
    if (fillAt(r) <= HM.pierFill) continue;
    const x = rp.xs[keep[r]], z = rp.zs[keep[r]], h = Math.atan2(tz[r], tx[r]), y = yy(r);
    const foot = gy(x, z, y - 12) - HM.embed;
    m.box(x, z, h, HM.colAlong, HM.colAcross, foot, y - D - HM.capH, COL.pier);
    m.box(x, z, h, HM.capAlong, HM.capAcross, y - D - HM.capH, y - D, COL.pier);
  }
  void HM.wallT;
  return m.d;
}
