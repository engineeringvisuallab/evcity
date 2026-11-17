// STEP 5.3c: GEOMETRY of the ring's structures (pure data: positions / colours / indices, no scene). Absolute world coordinates (the layer parents to world.root like StreetLights).
// Every structure gets its OWN engineered design (user decision: not all the same, modern):
//   S1  cable-stayed, one axial mast in the median, two cable planes inside the 6 m median (nothing hangs over the traffic lanes)   <- 5.3c-1 (this file)
//   S2  steel network arch  /  S3 extradosed  /  S4 truss-bowstring  /  S5, S6 segmental box-girder viaducts with slender piers   <- next steps
// Until a design exists, the structure gets the plain box girder + parapets + abutments (placeholder, `plainGirder`).
// The road ribbon (RoadMesh) draws the asphalt on top of the deck; the deck body here lies 2 cm below it (no z-fight).
import type { RoadNetwork } from '../RoadNetwork';
import type { BridgeSpec, RoadSpec } from '../RoadTypes';
import { STRUCT } from './RingStructures';
import { Config } from '../../core/Config';
import { ISLAND_LINK_DATA } from '../island/IslandLinkData';

export interface MeshData {
  positions: number[];
  colors: number[];
  indices: number[];
  /** Collision-only triangles (NOT drawn): the deck top face lies under the road ribbon, which draws the asphalt, but a car needs a solid top. */
  collider?: { positions: number[]; indices: number[] };
}
/** Road points (x step) the collision-only deck top runs past each end of a structure. */
export const COLLIDER_EXT = 2;
export type Rgb = readonly [number, number, number];

/** Colours (linear-ish, flat shaded). */
export const COL = {
  deck: [0.74, 0.74, 0.72] as Rgb,
  underside: [0.52, 0.52, 0.52] as Rgb,
  parapet: [0.66, 0.66, 0.65] as Rgb,
  pier: [0.7, 0.7, 0.68] as Rgb,
  mast: [0.88, 0.88, 0.86] as Rgb,
  cable: [0.96, 0.96, 0.98] as Rgb,
  steel: [0.5, 0.58, 0.68] as Rgb,
  hanger: [0.9, 0.9, 0.93] as Rgb,
} as const;

/** The design of structure number k (0-based, in station order). Anything not listed gets the plain girder. */
export const RING_DESIGNS: readonly ('cable-stayed' | 'network-arch' | 'extradosed' | 'bowstring' | 'viaduct' | 'plain' | 'strait-girder')[] = ['cable-stayed', 'network-arch', 'extradosed', 'bowstring', 'viaduct', 'viaduct', ...Array<'plain'>(14).fill('plain'), 'strait-girder'];

/** Cable-stayed design numbers (S1). All lengths in metres. */
export const CS = {
  /** Mast height above the deck. */
  mastH: 34,
  /** Mast section (along the road x across) at the deck and at the top. */
  deckA: 2.6, deckB: 3.4, topA: 1.4, topB: 2.2,
  /** Cable planes: lateral offset on the deck (inside the median, which is 6 m wide) and on the mast. */
  planeU: 2.2, mastU: 1.3,
  /** Position of the mast along the main span (0 = start abutment, 1 = end abutment). */
  mastAt: 0.3,
  /** Cables: first anchor distance from the mast, spacing, count on the long and the short side; first / last attachment height above the deck and the mast. */
  firstAnchor: 8, spacing: 6.2, nLong: 9, nShort: 4, spacingShort: 5.5,
  topAttach: 30, attachStep: 1.8,
  /** Cable thickness (square section). */
  cableT: 0.32,
} as const;

/** Network-arch design numbers (S2): two steel ribs standing in the median (nothing over the traffic lanes), the deck is the tie. */
export const NA = {
  /** Rib rise as a fraction of the span (network arches: about 1/6 to 1/7). */
  rise: 0.16,
  /** Lateral offset of the ribs (inside the 6 m median). */
  ribU: 2.2,
  /** Rib square section, hanger square section. */
  ribT: 0.9, hangerT: 0.2,
  /** Hangers: number of deck nodes per family, and how far along the span (fraction) the arch end of a hanger lies from its deck node. */
  nodes: 11, shift: 0.17,
  /** Cross struts between the two ribs at these span fractions. */
  struts: [0.3, 0.5, 0.7],
} as const;

/** Extradosed design numbers (S3): one low pylon in the median at mid-span, shallow-angle cable fans (two planes) to both sides. */
export const EX = {
  /** Pylon height above the deck; section (along x across) at the deck and at the top. */
  pylonH: 7.5, deckA: 2.6, deckB: 3.2, topA: 1.3, topB: 2.0,
  /** Cable planes: lateral offset on the deck and on the pylon (inside the 6 m median). */
  planeU: 2.2, pylonU: 1.2,
  /** Cables per side: first anchor distance from the pylon, spacing, count; first attachment below the pylon top, step down. */
  firstAnchor: 4.5, spacing: 3.4, n: 4, topDrop: 0.7, attachStep: 0.9,
  cableT: 0.3,
} as const;

/** Truss-bowstring design numbers (S4): two steel trusses in the median (parabolic top chord, verticals + Warren diagonals), the deck is the bottom chord. */
export const BS = {
  /** Rise of the top chord as a fraction of the span. */
  rise: 0.14,
  /** Truss plane offset (inside the 6 m median). */
  trussU: 2.2,
  /** Top chord section, web member section. */
  chordT: 0.8, webT: 0.3,
  /** Number of panels along the span. */
  panels: 14,
  /** Cross struts between the two chords at these span fractions. */
  struts: [0.15, 0.3, 0.5, 0.7, 0.85],
} as const;

/** Segmental box-girder viaduct numbers (S5, S6): slender twin-column piers (one column under each carriageway) with a cross-beam cap, evenly spaced. */
export const VI = {
  /** Target span between piers: short viaduct / long viaduct (main span longer than `longAbove`). */
  spanShort: 36, spanLong: 48, longAbove: 200,
  /** Column offset from the road axis, section at the foot (along x across) and at the top. */
  colU: 12, footA: 2.2, footB: 2.4, topA: 1.6, topB: 2.0,
  /** Cross-beam cap: height under the deck, length along the road, half length across. */
  capH: 1.6, capA: 2.8, capHalf: 15.5,
  /** The column goes this far below the lowest natural ground of the road points around it. */
  embed: 6,
} as const;

class Mesher {
  readonly d: MeshData = { positions: [], colors: [], indices: [], collider: { positions: [], indices: [] } };
  vert(x: number, y: number, z: number, c: Rgb): number {
    const n = this.d.positions.length / 3;
    this.d.positions.push(x, y, z);
    this.d.colors.push(c[0], c[1], c[2]);
    return n;
  }
  quad(a: number, b: number, c: number, e: number): void {
    this.d.indices.push(a, b, c, a, c, e);
  }
}

interface Frame {
  x: number; y: number; z: number;
  /** Unit tangent (x, z) and unit left normal (x, z). */
  tx: number; tz: number; nx: number; nz: number;
}

/** Interpolated frame of the road at the arc length `s` (metres from the road's first point). */
function frameAt(r: RoadSpec, s: number): Frame {
  const n = r.xs.length;
  let i = 0;
  // binary search on cum
  let lo = 0, hi = n - 1;
  while (lo < hi - 1) {
    const m = (lo + hi) >> 1;
    if (r.cum[m] <= s) lo = m; else hi = m;
  }
  i = lo;
  const j = Math.min(n - 1, i + 1);
  const seg = Math.max(1e-6, r.cum[j] - r.cum[i]);
  const t = Math.min(1, Math.max(0, (s - r.cum[i]) / seg));
  const dx = r.xs[j] - r.xs[i], dz = r.zs[j] - r.zs[i];
  const l = Math.hypot(dx, dz) || 1;
  const nxm = r.nx[i] + (r.nx[j] - r.nx[i]) * t, nzm = r.nz[i] + (r.nz[j] - r.nz[i]) * t;
  const nl = Math.hypot(nxm, nzm) || 1;
  return { x: r.xs[i] + dx * t, y: r.ys[i] + (r.ys[j] - r.ys[i]) * t, z: r.zs[i] + dz * t, tx: dx / l, tz: dz / l, nx: nxm / nl, nz: nzm / nl };
}

/** Frame at road point k (exact). */
const frameAtPoint = (r: RoadSpec, k: number): Frame => frameAt(r, r.cum[k]);

/** A box: centre line from (x, y0, z) up to y1, section `a` along the tangent and `b` across, rotated with the frame. Tapered when a1 / b1 differ. */
function prism(m: Mesher, f: Frame, y0: number, y1: number, a0: number, b0: number, a1: number, b1: number, c: Rgb): void {
  const corner = (y: number, a: number, b: number, sa: number, sb: number): number =>
    m.vert(f.x + f.tx * a * 0.5 * sa + f.nx * b * 0.5 * sb, y, f.z + f.tz * a * 0.5 * sa + f.nz * b * 0.5 * sb, c);
  const lo = [corner(y0, a0, b0, -1, -1), corner(y0, a0, b0, 1, -1), corner(y0, a0, b0, 1, 1), corner(y0, a0, b0, -1, 1)];
  const hi = [corner(y1, a1, b1, -1, -1), corner(y1, a1, b1, 1, -1), corner(y1, a1, b1, 1, 1), corner(y1, a1, b1, -1, 1)];
  for (let q = 0; q < 4; q++) m.quad(lo[q], lo[(q + 1) % 4], hi[(q + 1) % 4], hi[q]);
  m.quad(hi[0], hi[1], hi[2], hi[3]);
  m.quad(lo[3], lo[2], lo[1], lo[0]);
}

/** A thin square-section cable between two points. */
function cable(m: Mesher, ax: number, ay: number, az: number, bx: number, by: number, bz: number, t: number, c: Rgb): void {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const l = Math.hypot(dx, dy, dz) || 1;
  // a vector not parallel to the cable
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(dy / l) > 0.95) { ux = 1; uy = 0; }
  // p = d x u, q = d x p (both unit)
  let px = (dy * uz - dz * uy) / l, py = (dz * ux - dx * uz) / l, pz = (dx * uy - dy * ux) / l;
  const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
  let qx = (dy * pz - dz * py) / l, qy = (dz * px - dx * pz) / l, qz = (dx * py - dy * px) / l;
  const ql = Math.hypot(qx, qy, qz) || 1; qx /= ql; qy /= ql; qz /= ql;
  const h = t / 2;
  const ring = (x: number, y: number, z: number): number[] => [
    m.vert(x + (px + qx) * h, y + (py + qy) * h, z + (pz + qz) * h, c),
    m.vert(x + (-px + qx) * h, y + (-py + qy) * h, z + (-pz + qz) * h, c),
    m.vert(x + (-px - qx) * h, y + (-py - qy) * h, z + (-pz - qz) * h, c),
    m.vert(x + (px - qx) * h, y + (py - qy) * h, z + (pz - qz) * h, c),
  ];
  const A = ring(ax, ay, az), B = ring(bx, by, bz);
  for (let q = 0; q < 4; q++) m.quad(A[q], A[(q + 1) % 4], B[(q + 1) % 4], B[q]);
}

/**
 * The deck body of a structure: a box girder (trapezoid section, depth STRUCT.deckDepth) lofted along road points i0..i1, parapets on both edges,
 * and two abutment walls at the ends of the main span (the approach slabs rest on the embankment). Shared by every design.
 */
function deck(m: Mesher, roads: RoadNetwork, r: RoadSpec, b: BridgeSpec): void {
  void roads;
  const W = b.deckHalfWidth;
  const D = STRUCT.deckDepth;
  const sec: [number, number][] = [[-W, -0.02], [W, -0.02], [W, -0.9], [0.55 * W, -D], [-0.55 * W, -D], [-W, -0.9]]; // (u, dy) top-left ... around
  const rows: number[][] = [];
  for (let k = b.i0; k <= b.i1; k++) {
    const f = frameAtPoint(r, k);
    const ids: number[] = [];
    for (let q = 0; q < sec.length; q++) {
      const [u, dy] = sec[q];
      ids.push(m.vert(f.x + f.nx * u, f.y + dy, f.z + f.nz * u, q >= 2 && q <= 4 ? COL.underside : COL.deck));
    }
    rows.push(ids);
  }
  // collision-only top face (the render mesh has none, the road ribbon covers it): 2 triangles per road step over the full deck width.
  // It runs COLLIDER_EXT road points PAST both ends, level with the road: the terrain collider there is carved / dips below the road, so without the
  // extension a car drops into the dip and hits the deck edge (sideways jolt). Top is 5 mm under the road surface.
  const col = m.d.collider!;
  const kA = Math.max(0, b.i0 - COLLIDER_EXT), kB = Math.min(r.xs.length - 1, b.i1 + COLLIDER_EXT);
  for (let k = kA; k <= kB; k++) {
    const f = frameAtPoint(r, k);
    const n0 = col.positions.length / 3;
    col.positions.push(f.x - f.nx * W, f.y - 0.005, f.z - f.nz * W, f.x + f.nx * W, f.y - 0.005, f.z + f.nz * W);
    if (k > kA) col.indices.push(n0 - 2, n0 + 1, n0 - 1, n0 - 2, n0, n0 + 1);
  }
  for (let k = 0; k + 1 < rows.length; k++) for (let q = 1; q < sec.length; q++) m.quad(rows[k][q], rows[k][(q + 1) % sec.length], rows[k + 1][(q + 1) % sec.length], rows[k + 1][q]);
  // parapets: 1.1 m high, 0.5 m thick, both edges
  for (const side of [-1, 1]) {
    const pr: number[][] = [];
    for (let k = b.i0; k <= b.i1; k++) {
      const f = frameAtPoint(r, k);
      const uo = side * W, ui = side * (W - 0.5);
      pr.push([
        m.vert(f.x + f.nx * ui, f.y, f.z + f.nz * ui, COL.parapet),
        m.vert(f.x + f.nx * uo, f.y, f.z + f.nz * uo, COL.parapet),
        m.vert(f.x + f.nx * uo, f.y + 1.1, f.z + f.nz * uo, COL.parapet),
        m.vert(f.x + f.nx * ui, f.y + 1.1, f.z + f.nz * ui, COL.parapet),
      ]);
    }
    for (let k = 0; k + 1 < pr.length; k++) for (let q = 0; q < 4; q++) m.quad(pr[k][q], pr[k][(q + 1) % 4], pr[k + 1][(q + 1) % 4], pr[k + 1][q]);
  }
  // abutments at the ends of the main span
  const ap = Math.ceil(STRUCT.approach / r.step);
  for (const k of [b.i0 + ap, b.i1 - ap]) {
    const f = frameAtPoint(r, k);
    const top = f.y - D;
    const bottom = Math.min(top - 1, r.hNat[k] - 2);
    prism(m, f, bottom, top, 3.2, 2 * W - 0.6, 3.2, 2 * W - 0.6, COL.pier);
  }
}

/** Placeholder for a structure whose own design is not built yet: the plain girder with abutments. */
export function plainGirder(roads: RoadNetwork, b: BridgeSpec): MeshData {
  const m = new Mesher();
  deck(m, roads, roads.roads[b.roadId], b);
  return m.d;
}

/** S1: cable-stayed, one axial mast in the median, two cable planes (fan) in the median. */
export function cableStayed(roads: RoadNetwork, b: BridgeSpec): MeshData {
  const r = roads.roads[b.roadId];
  const m = new Mesher();
  deck(m, roads, r, b);
  const ap = Math.ceil(STRUCT.approach / r.step);
  const s0 = r.cum[b.i0 + ap], s1 = r.cum[b.i1 - ap];
  const sm = s0 + (s1 - s0) * CS.mastAt; // the mast stands here
  const fm = frameAt(r, sm);
  const deckY = fm.y;
  const bed = Math.min(...[b.i0 + ap, b.i1 - ap].map((k) => r.hNat[k]));
  // pier under the deck (wider across than the mast, it carries it down to the river bed) ...
  const kNear = Math.round((sm - r.cum[0]) / r.step);
  const groundY = Math.min(r.hNat[Math.min(r.xs.length - 1, Math.max(0, kNear))], bed) - 2;
  prism(m, fm, groundY, deckY - STRUCT.deckDepth, 3.8, 11, 3.0, 6, COL.pier);
  // ... and the mast above the deck (tapering)
  prism(m, fm, deckY - STRUCT.deckDepth, deckY + CS.mastH, CS.deckA, CS.deckB, CS.topA, CS.topB, COL.mast);
  // cables: fan from the mast to the deck, long side (towards the end abutment) and short side
  const attach = (q: number): number => deckY + CS.topAttach - CS.attachStep * q;
  for (const side of [-1, 1]) {
    for (let q = 0; q < CS.nLong; q++) {
      const s = sm + CS.firstAnchor + CS.spacing * q;
      if (s > s1) break;
      const fa = frameAt(r, s);
      const my = attach(q);
      cable(m, fm.x + fm.nx * CS.mastU * side, my, fm.z + fm.nz * CS.mastU * side, fa.x + fa.nx * CS.planeU * side, fa.y + 0.15, fa.z + fa.nz * CS.planeU * side, CS.cableT, COL.cable);
    }
    for (let q = 0; q < CS.nShort; q++) {
      const s = sm - (CS.firstAnchor - 2 + CS.spacingShort * q);
      if (s < s0) break;
      const fa = frameAt(r, s);
      const my = attach(q);
      cable(m, fm.x + fm.nx * CS.mastU * side, my, fm.z + fm.nz * CS.mastU * side, fa.x + fa.nx * CS.planeU * side, fa.y + 0.15, fa.z + fa.nz * CS.planeU * side, CS.cableT, COL.cable);
    }
  }
  return m.d;
}

/** S2: steel network arch. Two parabolic ribs in the median, crossing inclined hangers (network), cross struts between the ribs. */
export function networkArch(roads: RoadNetwork, b: BridgeSpec): MeshData {
  const r = roads.roads[b.roadId];
  const m = new Mesher();
  deck(m, roads, r, b);
  const ap = Math.ceil(STRUCT.approach / r.step);
  const s0 = r.cum[b.i0 + ap], s1 = r.cum[b.i1 - ap];
  const L = s1 - s0;
  const f = L * NA.rise;
  const at = (t: number) => frameAt(r, s0 + L * t);
  const archY = (t: number, fr: Frame): number => fr.y + 4 * f * t * (1 - t);
  for (const side of [-1, 1]) {
    // rib: polyline of straight square-section pieces
    const N = 20;
    for (let q = 0; q < N; q++) {
      const ta = q / N, tb = (q + 1) / N;
      const fa = at(ta), fb = at(tb);
      cable(m, fa.x + fa.nx * NA.ribU * side, archY(ta, fa), fa.z + fa.nz * NA.ribU * side, fb.x + fb.nx * NA.ribU * side, archY(tb, fb), fb.z + fb.nz * NA.ribU * side, NA.ribT, COL.steel);
    }
    // hangers: two families, deck node j -> arch point at t_j +- shift
    for (let j = 1; j <= NA.nodes; j++) {
      const td = j / (NA.nodes + 1);
      const fd = at(td);
      for (const dir of [-1, 1]) {
        const ta = td + dir * NA.shift;
        if (ta < 0.04 || ta > 0.96) continue;
        const fa = at(ta);
        cable(m, fd.x + fd.nx * NA.ribU * side, fd.y + 0.15, fd.z + fd.nz * NA.ribU * side, fa.x + fa.nx * NA.ribU * side, archY(ta, fa), fa.z + fa.nz * NA.ribU * side, NA.hangerT, COL.hanger);
      }
    }
  }
  // cross struts between the two ribs
  for (const t of NA.struts) {
    const fr = at(t);
    const y = archY(t, fr);
    prism(m, fr, y - 0.3, y + 0.3, 0.6, 2 * NA.ribU, 0.6, 2 * NA.ribU, COL.steel);
  }
  return m.d;
}

/** S3: extradosed. One low pylon at mid-span in the median, shallow cable fans in two planes. The pylon stands on the deck (no pier in the river). */
export function extradosed(roads: RoadNetwork, b: BridgeSpec): MeshData {
  const r = roads.roads[b.roadId];
  const m = new Mesher();
  deck(m, roads, r, b);
  const ap = Math.ceil(STRUCT.approach / r.step);
  const s0 = r.cum[b.i0 + ap], s1 = r.cum[b.i1 - ap];
  const sm = (s0 + s1) / 2;
  const fm = frameAt(r, sm);
  const deckY = fm.y;
  prism(m, fm, deckY - 0.6, deckY + EX.pylonH, EX.deckA, EX.deckB, EX.topA, EX.topB, COL.mast);
  for (const side of [-1, 1]) {
    for (const dir of [-1, 1]) {
      for (let q = 0; q < EX.n; q++) {
        const s = sm + dir * (EX.firstAnchor + EX.spacing * q);
        if (s < s0 + 0.5 || s > s1 - 0.5) break;
        const fa = frameAt(r, s);
        const my = deckY + EX.pylonH - EX.topDrop - EX.attachStep * q;
        cable(m, fm.x + fm.nx * EX.pylonU * side, my, fm.z + fm.nz * EX.pylonU * side, fa.x + fa.nx * EX.planeU * side, fa.y + 0.15, fa.z + fa.nz * EX.planeU * side, EX.cableT, COL.cable);
      }
    }
  }
  return m.d;
}

/** S4: truss-bowstring. Two steel trusses in the median: parabolic top chord, a vertical at every panel point, diagonals alternating (Warren). */
export function bowstring(roads: RoadNetwork, b: BridgeSpec): MeshData {
  const r = roads.roads[b.roadId];
  const m = new Mesher();
  deck(m, roads, r, b);
  const ap = Math.ceil(STRUCT.approach / r.step);
  const s0 = r.cum[b.i0 + ap], s1 = r.cum[b.i1 - ap];
  const L = s1 - s0;
  const f = L * BS.rise;
  const at = (t: number): Frame => frameAt(r, s0 + L * t);
  const archY = (t: number, fr: Frame): number => fr.y + 4 * f * t * (1 - t);
  const P = BS.panels;
  for (const side of [-1, 1]) {
    const u = BS.trussU * side;
    const top = (t: number): [number, number, number] => { const fr = at(t); return [fr.x + fr.nx * u, archY(t, fr), fr.z + fr.nz * u]; };
    const bot = (t: number): [number, number, number] => { const fr = at(t); return [fr.x + fr.nx * u, fr.y + 0.15, fr.z + fr.nz * u]; };
    for (let q = 0; q < P; q++) {
      const a = top(q / P), c = top((q + 1) / P);
      cable(m, a[0], a[1], a[2], c[0], c[1], c[2], BS.chordT, COL.steel);
      // diagonal: alternates direction panel by panel
      const d0 = q % 2 === 0 ? bot(q / P) : bot((q + 1) / P);
      const d1 = q % 2 === 0 ? top((q + 1) / P) : top(q / P);
      cable(m, d0[0], d0[1], d0[2], d1[0], d1[1], d1[2], BS.webT, COL.hanger);
    }
    for (let q = 1; q < P; q++) {
      const a = bot(q / P), c = top(q / P);
      cable(m, a[0], a[1], a[2], c[0], c[1], c[2], BS.webT, COL.hanger);
    }
  }
  for (const t of BS.struts) {
    const fr = at(t);
    const y = archY(t, fr);
    prism(m, fr, y - 0.3, y + 0.3, 0.6, 2 * BS.trussU, 0.6, 2 * BS.trussU, COL.steel);
  }
  return m.d;
}

/** S5 / S6: segmental box-girder viaduct = the shared deck on slender twin-column piers with cross-beam caps. */
export function viaduct(roads: RoadNetwork, b: BridgeSpec): MeshData {
  const r = roads.roads[b.roadId];
  const m = new Mesher();
  deck(m, roads, r, b);
  const ap = Math.ceil(STRUCT.approach / r.step);
  const s0 = r.cum[b.i0 + ap], s1 = r.cum[b.i1 - ap];
  const L = s1 - s0;
  const n = Math.max(1, Math.round(L / (L > VI.longAbove ? VI.spanLong : VI.spanShort)));
  for (let i = 1; i < n; i++) {
    const s = s0 + (L * i) / n;
    const f = frameAt(r, s);
    const k = Math.round(s / r.step);
    let low = Infinity;
    for (let q = k - 1; q <= k + 1; q++) low = Math.min(low, r.hNat[Math.min(r.xs.length - 1, Math.max(0, q))]);
    const foot = low - VI.embed;
    const under = f.y - STRUCT.deckDepth;
    for (const side of [-1, 1]) {
      const fc: Frame = { ...f, x: f.x + f.nx * VI.colU * side, z: f.z + f.nz * VI.colU * side };
      prism(m, fc, foot, under - VI.capH, VI.footA, VI.footB, VI.topA, VI.topB, COL.pier);
    }
    prism(m, f, under - VI.capH, under, VI.capA, 2 * VI.capHalf, VI.capA, 2 * VI.capHalf, COL.pier);
  }
  return m.d;
}


// ---------------------------------------------------------------------------------------------------------------------------------------------
// STEP 17.1g-b: the island link STRAIT STRUCTURE M6-1 as a plain box girder on piers (like the J1 arm structures, but with real piers and a deck that
// follows SECTION_M6: 32.0 m between the parapets). The world-unique design of section 18 replaces it later (same registration, same collider).
// ---------------------------------------------------------------------------------------------------------------------------------------------
export const IB = {
  /** Largest span between abutment / piers (m); the span count is the smallest that keeps every span <= spanMax, all spans equal. */
  spanMax: 52,
  /** Girder depth (m) between the first and the last pier; on the approach slabs it is STRUCT.deckDepth, the haunch is linear from the abutment to the first pier. */
  depthMax: 3.0,
  /** Two columns per pier line: offset from the axis, section at the foot (along x across) and at the top; cross-beam under the soffit: height, length along the road, half length across. */
  colU: 7.6, footA: 2.4, footB: 3.2, topA: 1.8, topB: 2.8,
  capH: 1.4, capA: 3.0, capHalf: 9.3,
  /** Pile cap under each column: plan size (m); its bottom is this far below the lowest sea floor around the pier, its top is at that sea floor. */
  ftEmbed: 3.0, ftSize: 5.0,
  /** Safety-shape parapet (outer face vertical, inner face sloped): width at the base and at the top, height. */
  parapetBase: 0.9, parapetTop: 0.4, parapetH: 1.1,
} as const;

export interface StraitLayout {
  /** Road arc length (m, from the road's first point) of the two abutments (the two ends of the structure) and of the pier lines between them. */
  s0: number; s1: number; piers: number[]; spans: number;
  /** Girder depth (m) at road arc length s. */
  depthAtS(s: number): number;
}

/** True when structure `b` is the strait structure of the island link M6-1. */
export const isStraitStructure = (roads: RoadNetwork, b: BridgeSpec): boolean => roads.roads[b.roadId]?.name === ISLAND_LINK_DATA.name;

/** Abutments (at the two ends of the structure), equal spans <= IB.spanMax, pier lines and the girder depth line of the strait structure. */
export function straitLayout(r: RoadSpec, b: BridgeSpec): StraitLayout {
  // The embankment ends exactly at the two ends of the structure (ground = road - 1.8 m there, then the natural ground falls away, 17.1g-b ground check), so the ABUTMENTS stand at the ends
  // i0 / i1 (not 16 m inside as on the ring structures: there the first 16 m would hang 8 m over the ground at the mainland end).
  const s0 = r.cum[b.i0], s1 = r.cum[b.i1];
  const spans = Math.max(1, Math.ceil((s1 - s0) / IB.spanMax - 1e-9));
  const piers: number[] = [];
  for (let i = 1; i < spans; i++) piers.push(s0 + ((s1 - s0) * i) / spans);
  const first = piers.length ? piers[0] : s0, last = piers.length ? piers[piers.length - 1] : s1;
  const depthAtS = (s: number): number => {
    if (s <= s0 || s >= s1) return STRUCT.deckDepth;
    if (s < first) return STRUCT.deckDepth + ((IB.depthMax - STRUCT.deckDepth) * (s - s0)) / Math.max(1e-6, first - s0);
    if (s > last) return STRUCT.deckDepth + ((IB.depthMax - STRUCT.deckDepth) * (s1 - s)) / Math.max(1e-6, s1 - last);
    return IB.depthMax;
  };
  return { s0, s1, piers, spans, depthAtS };
}

/** Plain box girder (depth from straitLayout), safety-shape parapets, abutments and one pier line (2 columns + cross-beam + 2 pile caps) per layout pier. */
export function straitGirder(roads: RoadNetwork, b: BridgeSpec): MeshData {
  void roads;
  const r = roads.roads[b.roadId];
  const L = straitLayout(r, b);
  const m = new Mesher();
  const W = b.deckHalfWidth;
  const rows: number[][] = [];
  for (let k = b.i0; k <= b.i1; k++) {
    const f = frameAtPoint(r, k);
    const D = L.depthAtS(r.cum[k]);
    const sec: [number, number][] = [[-W, -0.02], [W, -0.02], [W, -0.9], [0.55 * W, -D], [-0.55 * W, -D], [-W, -0.9]];
    rows.push(sec.map(([u, dy], q) => m.vert(f.x + f.nx * u, f.y + dy, f.z + f.nz * u, q >= 2 && q <= 4 ? COL.underside : COL.deck)));
  }
  // collision-only deck top (same rule as deck(): level with the road, runs COLLIDER_EXT points past both ends)
  const col = m.d.collider!;
  const kA = Math.max(0, b.i0 - COLLIDER_EXT), kB = Math.min(r.xs.length - 1, b.i1 + COLLIDER_EXT);
  for (let k = kA; k <= kB; k++) {
    const f = frameAtPoint(r, k);
    const n0 = col.positions.length / 3;
    col.positions.push(f.x - f.nx * W, f.y - 0.005, f.z - f.nz * W, f.x + f.nx * W, f.y - 0.005, f.z + f.nz * W);
    if (k > kA) col.indices.push(n0 - 2, n0 + 1, n0 - 1, n0 - 2, n0, n0 + 1);
  }
  for (let k = 0; k + 1 < rows.length; k++) for (let q = 1; q < 6; q++) m.quad(rows[k][q], rows[k][(q + 1) % 6], rows[k + 1][(q + 1) % 6], rows[k + 1][q]);
  // parapets: base on the road level, outer face vertical, inner face sloped
  for (const side of [-1, 1]) {
    const pr: number[][] = [];
    for (let k = b.i0; k <= b.i1; k++) {
      const f = frameAtPoint(r, k);
      const uo = side * W, ub = side * (W - IB.parapetBase), ut = side * (W - IB.parapetTop);
      pr.push([
        m.vert(f.x + f.nx * ub, f.y, f.z + f.nz * ub, COL.parapet),
        m.vert(f.x + f.nx * uo, f.y, f.z + f.nz * uo, COL.parapet),
        m.vert(f.x + f.nx * uo, f.y + IB.parapetH, f.z + f.nz * uo, COL.parapet),
        m.vert(f.x + f.nx * ut, f.y + IB.parapetH, f.z + f.nz * ut, COL.parapet),
      ]);
    }
    for (let k = 0; k + 1 < pr.length; k++) for (let q = 0; q < 4; q++) m.quad(pr[k][q], pr[k][(q + 1) % 4], pr[k + 1][(q + 1) % 4], pr[k + 1][q]);
  }
  // abutments at the ends of the main span
  for (const s of [L.s0, L.s1]) {
    const f = frameAt(r, s);
    const k = Math.round(s / r.step);
    const top = f.y - STRUCT.deckDepth;
    prism(m, f, Math.min(top - 1, r.hNat[k] - 2), top, 3.2, 2 * W - 0.6, 3.2, 2 * W - 0.6, COL.pier);
  }
  // pier lines: columns from the sea floor to the cross-beam, pile caps below the sea floor
  for (const s of L.piers) {
    const f = frameAt(r, s);
    const k = Math.round(s / r.step);
    let low = Infinity;
    for (let q = k - 1; q <= k + 1; q++) low = Math.min(low, r.hNat[Math.min(r.xs.length - 1, Math.max(0, q))]);
    const under = f.y - L.depthAtS(s);
    for (const side of [-1, 1]) {
      const fc: Frame = { ...f, x: f.x + f.nx * IB.colU * side, z: f.z + f.nz * IB.colU * side };
      prism(m, fc, low - IB.ftEmbed, low, IB.ftSize, IB.ftSize, IB.ftSize, IB.ftSize, COL.pier);
      prism(m, fc, low, under - IB.capH, IB.footA, IB.footB, IB.topA, IB.topB, COL.pier);
    }
    prism(m, f, under - IB.capH, under, IB.capA, 2 * IB.capHalf, IB.capA, 2 * IB.capHalf, COL.pier);
  }
  return m.d;
}

/** Geometry of structure number `k` (0-based, station order) of the ring. */
export function buildStructure(roads: RoadNetwork, b: BridgeSpec, k: number): MeshData {
  if (isStraitStructure(roads, b)) return straitGirder(roads, b); // 17.1g-b: chosen by the road name (M6-1), so the order of the list does not matter
  const design = RING_DESIGNS[k] ?? 'plain';
  if (design === 'cable-stayed') return cableStayed(roads, b);
  if (design === 'network-arch') return networkArch(roads, b);
  if (design === 'extradosed') return extradosed(roads, b);
  if (design === 'bowstring') return bowstring(roads, b);
  if (design === 'viaduct') return viaduct(roads, b);
  return plainGirder(roads, b);
}

/** The structures of the ring in station order, then the structures of the four J1 arms (J1-e2, J1-N, J1-E, J1-S, J1-W, each in station order): the index is the design number (RING_DESIGNS, 'plain' after the ring). */
export function ringStructures(roads: RoadNetwork): BridgeSpec[] {
  const ring = roads.roads.find((r) => r.name === 'M8');
  const out: BridgeSpec[] = ring ? roads.bridges.filter((b) => b.roadId === ring.id).sort((a, c) => a.i0 - c.i0) : [];
  for (const name of ['J1-N', 'J1-E', 'J1-S', 'J1-W']) {
    const arm = roads.roads.find((r) => r.name === name);
    if (arm) out.push(...roads.bridges.filter((b) => b.roadId === arm.id).sort((a, c) => a.i0 - c.i0));
  }
  // STEP 17.1g-b: the island link strait structure M6-1 comes LAST (index 20 = design number 21, RING_DESIGNS[20] = 'strait-girder'), after the arms
  const link = roads.roads.find((r) => r.name === ISLAND_LINK_DATA.name);
  if (link && Config.roads.islandLink.bridgeDeck) out.push(...roads.bridges.filter((b) => b.roadId === link.id).sort((a, c) => a.i0 - c.i0));
  return out;
}
