// STEP HK-9c-1: PAVING that joins the four loop ramps to the ring on the node viaduct (pure mesh data like HkRampMesh: positions / colours / indices, absolute world coordinates, no scene).
//   1) AUX STRIP: the 3.65 m auxiliary lane on each side of the ring deck (ring pavement half width 22.1 .. deck half width 25.75) over the whole node viaduct (d -96 .. +146 from the arm axis),
//      asphalt + one solid white edge line at the deck edge. HK-8d-2 made the slab 2.75 m wider than the pavement, this paves it.
//   2) TAIL of every loop: the part of the loop that the ramp mesh does not build (from HM.maxOff = 30 m from the ring axis down to the ring end at 17.3 m): an asphalt ribbon on the deck,
//      narrowing to a point over the last TAPER m so it merges flush into the ring lane (same idea as the AUTO MERGE of the game's merge tails), white edge lines.
// VISUAL ONLY: the deck solid underneath (ring level = deck top, HK-8d-3 N4) carries the cars, so these meshes are never added to the collider. They lie LIFT m above the deck, drawn with a polygon offset.
import type { RoadNetwork } from '../RoadNetwork';
import type { MeshData, Rgb } from './RingBridgeGeometry';
import type { HkRamp, HkFrame } from './HkRamps';
import { hkWorld } from './HkRamps';
import { NODE_VIADUCT } from './NodeViaductData';
import { HM } from './HkRampMesh';

export const HP = { lift: 0.03, stripLift: 0.02, pavementHalf: 22.1, lineW: 0.15, lineInset: 0.45, taper: 14 } as const;
const COL = { asphalt: [0.23, 0.23, 0.24] as Rgb, mark: [0.95, 0.95, 0.93] as Rgb } as const;

class P {
  readonly d: MeshData = { positions: [], colors: [], indices: [] };
  v(x: number, y: number, z: number, c: Rgb): number { const i = this.d.positions.length / 3; this.d.positions.push(x, y, z); this.d.colors.push(c[0], c[1], c[2]); return i; }
  quad(a: number, b: number, c: number, e: number): void { this.d.indices.push(a, b, c, a, c, e); }
}

/** Aux strips of the node deck, both sides, along the ring points that lie on the node viaduct. */
export function buildHkAuxStrip(roads: RoadNetwork): MeshData {
  const m = new P();
  const ring = roads.roads.find((r) => r.name === 'M8');
  if (!ring) return m.d;
  const N = NODE_VIADUCT;
  const kNode = Math.round(N.stationM / ring.step);
  const k0 = Math.ceil((N.stationM + N.deckD0) / ring.step), k1 = Math.floor((N.stationM + N.deckD1) / ring.step);
  void kNode;
  const u0 = HP.pavementHalf, u1 = N.deckHalf;
  for (const side of [1, -1]) {
    let prev: number[] | null = null;
    for (let k = k0; k <= k1; k++) {
      const x = ring.xs[k], z = ring.zs[k], nx = ring.nx[k] * side, nz = ring.nz[k] * side, y = ring.ys[k] + HP.stripLift;
      const li = u1 - HP.lineInset, lo = li - HP.lineW;
      const cur = [
        m.v(x + nx * u0, y, z + nz * u0, COL.asphalt), m.v(x + nx * u1, y, z + nz * u1, COL.asphalt),
        m.v(x + nx * lo, y + 0.005, z + nz * lo, COL.mark), m.v(x + nx * li, y + 0.005, z + nz * li, COL.mark),
      ];
      if (prev) { m.quad(prev[0], prev[1], cur[1], cur[0]); m.quad(prev[2], prev[3], cur[3], cur[2]); }
      prev = cur;
    }
  }
  return m.d;
}


/** Ring surface level (= node deck top, HK-8d-3 N4) at a world point near the node: the level of the nearest ring segment, interpolated. */
export function hkDeckLevel(roads: RoadNetwork): (x: number, z: number) => number {
  const ring = roads.roads.find((r) => r.name === 'M8')!;
  const k0 = Math.round(NODE_VIADUCT.stationM / ring.step);
  const a = Math.max(0, k0 - 60), b = Math.min(ring.xs.length - 2, k0 + 60);
  return (x, z) => {
    let best = Infinity, yb = 0;
    for (let k = a; k <= b; k++) {
      const ax = ring.xs[k], az = ring.zs[k], bx = ring.xs[k + 1] - ax, bz = ring.zs[k + 1] - az, l2 = bx * bx + bz * bz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / l2)) : 0;
      const d = Math.hypot(x - ax - bx * t, z - az - bz * t);
      if (d < best) { best = d; yb = ring.ys[k] + (ring.ys[k + 1] - ring.ys[k]) * t; }
    }
    return yb;
  };
}

/** Index range [from .. to] (inclusive, in walking order C-D end -> ring end) of the loop points the ramp mesh does NOT build: from the last kept point to the ring end. */
export function hkTailIndices(rp: HkRamp, ringOff: (x: number, z: number) => number): number[] {
  const n = rp.xs.length, cdEnd = rp.ringEnd === 0 ? n - 1 : 0, step = rp.ringEnd === 0 ? -1 : 1;
  const idx: number[] = [];
  let last = -1;
  for (let i = cdEnd; i >= 0 && i < n; i += step) { if (ringOff(rp.xs[i], rp.zs[i]) <= HM.maxOff) break; last = i; }
  if (last < 0) return idx;
  for (let i = last; i >= 0 && i < n; i += step) idx.push(i);
  return idx;
}

/** Asphalt tail of one loop from the end of its ramp mesh to the ring lane, narrowing over the last HP.taper m. */
export function buildHkTail(rp: HkRamp, ringOff: (x: number, z: number) => number, deckY?: (x: number, z: number) => number): MeshData {
  const m = new P();
  const idx = hkTailIndices(rp, ringOff);
  if (idx.length < 2) return m.d;
  const R = idx.length, W = rp.halfW;
  const total = Math.abs(rp.cum[idx[R - 1]] - rp.cum[idx[0]]);
  let prev: number[] | null = null;
  for (let r = 0; r < R; r++) {
    const a = idx[Math.max(0, r - 1)], b = idx[Math.min(R - 1, r + 1)];
    const dx = rp.xs[b] - rp.xs[a], dz = rp.zs[b] - rp.zs[a], l = Math.hypot(dx, dz) || 1, tx = dx / l, tz = dz / l;
    const i = idx[r], toEnd = total - Math.abs(rp.cum[i] - rp.cum[idx[0]]);
    const w = Math.max(0.05, W * Math.min(1, toEnd / HP.taper)); // narrows to a point at the ring end
    // the loop level meets the ring level only at the very end (HK-9a R4): over the deck the tail follows the deck top, blended in between the ramp mesh end (30 m from the axis) and the deck edge
    let yl = rp.ys[i];
    if (deckY) { const o = ringOff(rp.xs[i], rp.zs[i]), t = Math.max(0, Math.min(1, (HM.maxOff - o) / (HM.maxOff - NODE_VIADUCT.deckHalf))), sm = t * t * (3 - 2 * t); yl = rp.ys[i] + (deckY(rp.xs[i], rp.zs[i]) - rp.ys[i]) * sm; }
    const y = yl + HP.lift;
    const at = (u: number, dy: number, c: Rgb): number => m.v(rp.xs[i] - tz * u, y + dy, rp.zs[i] + tx * u, c);
    const li = Math.max(0.02, w - HM.lineGap * Math.min(1, w / W)), lo = Math.max(0.01, li - HP.lineW);
    const cur = [at(-w, 0, COL.asphalt), at(w, 0, COL.asphalt), at(-li, 0.005, COL.mark), at(-lo, 0.005, COL.mark), at(lo, 0.005, COL.mark), at(li, 0.005, COL.mark)];
    if (prev) { m.quad(prev[0], prev[1], cur[1], cur[0]); m.quad(prev[2], prev[3], cur[3], cur[2]); m.quad(prev[4], prev[5], cur[5], cur[4]); }
    prev = cur;
  }
  return m.d;
}

/** STEP HK-9c-3 (sub-step 4): the 25 m UNDER-DECK CONNECTOR between the arm end (local y 0, half 22.1, 8 lanes) and the link start (local y ~ -25, half 16.0, 6 lanes).
 *  Visual asphalt only (no collider): the ground under it is within ~0.4 m of the road level, the deck (|y| <= 25.75) hides it. Pavement edge steps 22.1 -> 16.0 linearly (the closed outer lane, 1:4.1),
 *  level goes linearly from the arm end level to the link start level. White edge lines inset like the aux strip. Lane lines / hatching: HK-9d. */
export function buildHkConnector(roads: RoadNetwork, f: HkFrame, ground?: (x: number, z: number) => number): MeshData {
  const m = new P();
  const arm = roads.roads.find((r) => r.name === 'J1-S'), link = roads.roads.find((r) => r.name === 'M6-1');
  if (!arm || !link) return m.d;
  const nearest = (r: { xs: ArrayLike<number>; zs: ArrayLike<number> }): number => { let bi = 0, bd = Infinity; for (let k = 0; k < r.xs.length; k++) { const d = Math.hypot(r.xs[k] - f.ox, r.zs[k] - f.oz); if (d < bd) { bd = d; bi = k; } } return bi; };
  const ka = nearest(arm), kl = nearest(link);
  const yA = arm.ys[ka], yL = link.ys[kl];
  const locY = (x: number, z: number): number => (x - f.ox) * f.nx + (z - f.oz) * f.nz; // local y (north)
  const y1 = locY(link.xs[kl], link.zs[kl]); // negative, ~ -25
  if (!(y1 < -5 && y1 > -60)) return m.d;
  const hA = Math.max(arm.halfWidth, HP.pavementHalf), hL = link.halfWidth;
  const n = Math.max(2, Math.ceil(-y1 / 2.5));
  let prev: number[] | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n, ly = y1 * t, h = hA + (hL - hA) * t, lvl = yA + (yL - yA) * t;
    const [cx, cz] = hkWorld(f, 0, ly);
    const gnd = ground ? ground(cx, cz) : -Infinity;
    const y = Math.max(lvl, gnd + 0.02) + HP.lift; // never below the ground (no z-fight / sunk strip)
    const li = h - HP.lineInset, lo = li - HP.lineW;
    const at = (u: number, dy: number, c: Rgb): number => { const [wx, wz] = hkWorld(f, u, ly); return m.v(wx, y + dy, wz, c); };
    const cur = [at(-h, 0, COL.asphalt), at(h, 0, COL.asphalt), at(-li, 0.005, COL.mark), at(-lo, 0.005, COL.mark), at(lo, 0.005, COL.mark), at(li, 0.005, COL.mark)];
    if (prev) { m.quad(prev[0], prev[1], cur[1], cur[0]); m.quad(prev[2], prev[3], cur[3], cur[2]); m.quad(prev[4], prev[5], cur[5], cur[4]); }
    prev = cur;
  }
  return m.d;
}

/** STEP HK-9d-1: LANE-DROP MARKINGS on the J1-S arm next to the node (docs/HK_LANES.txt). Visual only (no collider), drawn over the arm asphalt with the paving material.
 *  SOUTHBOUND (east side): the outer lane (u 15.45 .. 19.10 from the arm axis) is closed by a taper y +260 .. +30; a solid white diagonal line runs from the lane edge (19.10) to the lane inner edge (15.45); y +30 .. 0 the closed lane is hatched (white 45 deg stripes between two solid lines).
 *  NORTHBOUND (west side): the 4th lane is GAINED: its diagonal line runs from u -15.45 at y +25.75 (deck edge) to u -19.10 at y +116. All numbers come from HK_LANES.txt; the arm is NOT changed (its own lane dashes stay). */
export const HM9D = { laneInner: 15.45, laneOuter: 19.10, dropY0: 260, dropY1: 30, gainY0: 25.75, gainY1: 116, hatchPitch: 4, hatchW: 0.45, lineW: 0.2, mark: 0.006 } as const;

export function buildHkLaneMarks(roads: RoadNetwork, f: HkFrame): MeshData {
  const m = new P();
  const arm = roads.roads.find((r) => r.name === 'J1-S');
  if (!arm) return m.d;
  const locY = (x: number, z: number): number => (x - f.ox) * f.nx + (z - f.oz) * f.nz;
  const ks: number[] = [];
  for (let k = 0; k < arm.xs.length; k++) { const y = locY(arm.xs[k], arm.zs[k]); if (y >= -1 && y <= HM9D.dropY0 + 10) ks.push(k); }
  if (ks.length < 3) return m.d;
  ks.sort((a, b) => locY(arm.xs[a], arm.zs[a]) - locY(arm.xs[b], arm.zs[b]));
  // arm frame at index position i of ks: point, east-pointing normal, local y
  const at = (i: number): { x: number; z: number; y: number; px: number; pz: number; ly: number } => {
    const a = ks[Math.max(0, i - 1)], b = ks[Math.min(ks.length - 1, i + 1)], k = ks[i];
    let tx = arm.xs[b] - arm.xs[a], tz = arm.zs[b] - arm.zs[a]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    let px = -tz, pz = tx; if (px * f.ex + pz * f.ez < 0) { px = -px; pz = -pz; }
    return { x: arm.xs[k], z: arm.zs[k], y: arm.ys[k], px, pz, ly: locY(arm.xs[k], arm.zs[k]) };
  };
  const W = HM9D.lineW, mk = HM9D.mark + HP.lift;
  const line = (uOf: (ly: number) => number | null, east: boolean): void => {
    let prev: number[] | null = null;
    for (let i = 0; i < ks.length; i++) {
      const p = at(i), u = uOf(p.ly);
      if (u === null) { prev = null; continue; }
      const sg = east ? 1 : -1;
      const cur = [m.v(p.x + p.px * sg * (u - W / 2), p.y + mk, p.z + p.pz * sg * (u - W / 2), COL.mark), m.v(p.x + p.px * sg * (u + W / 2), p.y + mk, p.z + p.pz * sg * (u + W / 2), COL.mark)];
      if (prev) m.quad(prev[0], prev[1], cur[1], cur[0]);
      prev = cur;
    }
  };
  const uDrop = (ly: number): number | null => ly < 0 || ly > HM9D.dropY0 ? null : ly <= HM9D.dropY1 ? HM9D.laneInner : HM9D.laneOuter - (HM9D.laneOuter - HM9D.laneInner) * Math.min(1, (HM9D.dropY0 - ly) / (HM9D.dropY0 - HM9D.dropY1));
  const uGain = (ly: number): number | null => ly < HM9D.gainY0 || ly > HM9D.gainY1 ? null : HM9D.laneInner + (HM9D.laneOuter - HM9D.laneInner) * (ly - HM9D.gainY0) / (HM9D.gainY1 - HM9D.gainY0);
  line(uDrop, true);
  line(uGain, false);
  // hatching of the closed lane y 0 .. dropY1 (east): 45 deg stripes, one quad each, laid on the arm level
  for (let ly = 0; ly < HM9D.dropY1 - 0.01; ly += HM9D.hatchPitch) {
    const lo = ly, hi = Math.min(HM9D.dropY1, ly + HM9D.hatchW), shift = HM9D.laneOuter - HM9D.laneInner; // stripe slants by the lane width (45 deg)
    const pts: [number, number][] = [[HM9D.laneInner, lo], [HM9D.laneInner, hi], [HM9D.laneOuter, Math.min(HM9D.dropY1, hi + shift)], [HM9D.laneOuter, Math.min(HM9D.dropY1, lo + shift)]];
    if (pts[2][1] - pts[3][1] < 1e-6 && pts[3][1] >= HM9D.dropY1) continue; // clipped away at the end of the hatched area
    const ids = pts.map(([u, y]) => {
      // find the arm index segment of local y, interpolate
      let i = 0; while (i < ks.length - 2 && at(i + 1).ly < y) i++;
      const a = at(i), b = at(i + 1), t = b.ly === a.ly ? 0 : Math.max(0, Math.min(1, (y - a.ly) / (b.ly - a.ly)));
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, px = a.px + (b.px - a.px) * t, pz = a.pz + (b.pz - a.pz) * t, lv = a.y + (b.y - a.y) * t;
      return m.v(x + px * u, lv + mk, z + pz * u, COL.mark);
    });
    m.quad(ids[0], ids[1], ids[2], ids[3]);
  }
  return m.d;
}
