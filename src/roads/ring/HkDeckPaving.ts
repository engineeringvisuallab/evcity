// STEP HK-9c-1: PAVING that joins the four loop ramps to the ring on the node viaduct (pure mesh data like HkRampMesh: positions / colours / indices, absolute world coordinates, no scene).
//   1) AUX STRIP: the 3.65 m auxiliary lane on each side of the ring deck (ring pavement half width 22.1 .. deck half width 25.75) over the whole node viaduct (d -96 .. +146 from the arm axis),
//      asphalt + one solid white edge line at the deck edge. HK-8d-2 made the slab 2.75 m wider than the pavement, this paves it.
//   2) TAIL of every loop: the part of the loop that the ramp mesh does not build (from HM.maxOff = 30 m from the ring axis down to the ring end at 17.3 m): an asphalt ribbon on the deck,
//      narrowing to a point over the last TAPER m so it merges flush into the ring lane (same idea as the AUTO MERGE of the game's merge tails), white edge lines.
// VISUAL ONLY: the deck solid underneath (ring level = deck top, HK-8d-3 N4) carries the cars, so these meshes are never added to the collider. They lie LIFT m above the deck, drawn with a polygon offset.
import type { RoadNetwork } from '../RoadNetwork';
import type { MeshData, Rgb } from './RingBridgeGeometry';
import type { HkRamp } from './HkRamps';
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
