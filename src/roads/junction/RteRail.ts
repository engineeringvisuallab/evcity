// 2026-11-23 (user: 'connection road gula er 2 pase railing daw'): W-beam GUARDRAIL on BOTH sides of the ground connection roads of the RT-E interchange:
// the two slips RTE-A2S / RTE-S2A and the four merge tails RTE-TAIL-M3S / M3N / M4G / M4L (roads made by RoadNetwork.layoutRteLanes). The ramp bridges M3 / M4 have concrete
// parapets already (RteMesh), so the rail starts right where the parapet ends (the bridge end of a tail) and the two look like one barrier.
// Pure math, no three.js (like RteMesh): input = the built road splines (xs, zs, ys, cum, halfWidth, shoulder, halfAt) + one callback for the asphalt of other roads.
// Output has the shape of RteMeshData (everything in the 'barrier' part), so RteLayer draws it with the same material and uses the same collision code.
//
// Where a rail stands (per side of a road):
//   - at lateral offset  halfAt(s) + shoulder - 0.35  (the outer edge of the gravel shoulder, same rule as the country guardrail of Roadside.ts), posts every postStep m, beam between posts
//   - NOT where the post would stand on asphalt of ANOTHER road (the side-by-side part of a tail beside the ring / arm: the rail would stand on the main road)
//   - NOT in the AUTO MERGE zone of a tail (the ribbon narrows to a point there: halfAt < 0.98 x halfWidth) and not mergeMargin m before it (the car has to enter the main road there)
//   - slips: NOT slipEndGap m from each end (the open lead-in beside the main road, where the car enters / leaves the slip)
//   - runs of fewer than 3 posts are dropped
import type { RteMeshData } from './RteMesh';

export interface RteRailRoad {
  name: string;
  xs: ArrayLike<number>; zs: ArrayLike<number>; ys: ArrayLike<number>; cum: ArrayLike<number>;
  length: number; halfWidth: number; shoulder: number; halfAt?: ArrayLike<number>;
}
export interface RteRailOptions { postStep: number; height: number; slipEndGap: number; mergeMargin: number }
export interface RteRailStats { roads: number; posts: number; beamMetres: number; perRoad: { name: string; side: number; from: number; to: number; posts: number }[] }

type V3 = [number, number, number];
const POST: ReadonlyArray<number> = [0.42, 0.44, 0.47], BEAM: ReadonlyArray<number> = [0.66, 0.68, 0.7];
const POST_W = 0.12, BEAM_T = 0.07, BEAM_H = 0.32;
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

class Mini {
  positions: number[] = []; colors: number[] = []; indices: number[] = [];
  private vert(p: V3, c: ReadonlyArray<number>): number { this.positions.push(p[0], p[1], p[2]); this.colors.push(c[0], c[1], c[2]); return this.positions.length / 3 - 1; }
  private tri(a: V3, b: V3, c: V3, col: ReadonlyArray<number>, hint: V3): void {
    const n = cross(sub(b, a), sub(c, a));
    if (n[0] * n[0] + n[1] * n[1] + n[2] * n[2] < 1e-12) return;
    if (n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) { const t = b; b = c; c = t; }
    this.indices.push(this.vert(a, col), this.vert(b, col), this.vert(c, col));
  }
  private quad(a: V3, b: V3, c: V3, d: V3, col: ReadonlyArray<number>, hint: V3): void { this.tri(a, b, c, col, hint); this.tri(a, c, d, col, hint); }
  /** closed prism between two cross sections (rectangles); a0..a3 and b0..b3 go around the section in the same order, `ctr` = centre of the prism (faces look away from it) */
  prism(a: V3[], b: V3[], col: ReadonlyArray<number>): void {
    const ctr: V3 = [0, 0, 0];
    for (const p of [...a, ...b]) { ctr[0] += p[0] / 8; ctr[1] += p[1] / 8; ctr[2] += p[2] / 8; }
    const out = (p: V3, q: V3, r: V3, s: V3): void => { const m: V3 = [(p[0] + q[0] + r[0] + s[0]) / 4 - ctr[0], (p[1] + q[1] + r[1] + s[1]) / 4 - ctr[1], (p[2] + q[2] + r[2] + s[2]) / 4 - ctr[2]]; this.quad(p, q, r, s, col, m); };
    for (let k = 0; k < 4; k++) { const n = (k + 1) % 4; out(a[k], a[n], b[n], b[k]); }
    out(a[0], a[1], a[2], a[3]); out(b[0], b[1], b[2], b[3]);
  }
  box(cx: number, cz: number, yaw: number, la: number, lb: number, y0: number, y1: number, col: ReadonlyArray<number>): void {
    const ax = Math.cos(yaw), az = Math.sin(yaw), bx = -az, bz = ax, ha = la / 2, hb = lb / 2;
    const ring = (y: number): V3[] => ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as [number, number][]).map(([sa, sb]): V3 => [cx + ax * ha * sa + bx * hb * sb, y, cz + az * ha * sa + bz * hb * sb]);
    this.prism(ring(y0), ring(y1), col);
  }
}

/** point of a road at arc length s: position, level, unit tangent, left normal */
function sampler(r: RteRailRoad): (s: number, out: { x: number; z: number; y: number; tx: number; tz: number; h: number }) => void {
  let i = 0;
  return (s, out) => {
    const n = r.xs.length;
    if (i > 0 && r.cum[i] > s) i = 0;
    while (i < n - 2 && r.cum[i + 1] < s) i++;
    const span = r.cum[i + 1] - r.cum[i], t = span > 1e-9 ? Math.min(1, Math.max(0, (s - r.cum[i]) / span)) : 0;
    out.x = r.xs[i] + (r.xs[i + 1] - r.xs[i]) * t; out.z = r.zs[i] + (r.zs[i + 1] - r.zs[i]) * t; out.y = r.ys[i] + (r.ys[i + 1] - r.ys[i]) * t;
    const dx = r.xs[i + 1] - r.xs[i], dz = r.zs[i + 1] - r.zs[i], l = Math.hypot(dx, dz) || 1;
    out.tx = dx / l; out.tz = dz / l;
    out.h = r.halfAt ? r.halfAt[i] + (r.halfAt[i + 1] - r.halfAt[i]) * t : r.halfWidth;
  };
}

export const isRteRailRoad = (name: string): boolean => name === 'RTE-A2S' || name === 'RTE-S2A' || name.startsWith('RTE-A2S-') || name.startsWith('RTE-S2A-') || name.startsWith('RTE-TAIL-');

/**
 * Rails for every RT-E ground connection road in `roads`.
 * @param onOtherAsphalt true when (x, z) is asphalt of any road (a post there is dropped); pass `(x, z) => net.surfaceAt(x, z) === 1`
 */
export function buildRteRails(roads: readonly RteRailRoad[], opt: RteRailOptions, onOtherAsphalt: (x: number, z: number) => boolean): RteMeshData & { railStats: RteRailStats } {
  const B = new Mini(), st: RteRailStats = { roads: 0, posts: 0, beamMetres: 0, perRoad: [] };
  const q = { x: 0, z: 0, y: 0, tx: 0, tz: 0, h: 0 };
  for (const r of roads) {
    if (!isRteRailRoad(r.name) || r.xs.length < 3) continue;
    st.roads++;
    const isTail = r.name.startsWith('RTE-TAIL-'), at = sampler(r);
    // the allowed part of the road along s: tails = the full-width part minus the margin before the merge zone; slips = away from both open ends
    let s0 = 0, s1 = r.length;
    if (isTail && r.halfAt) {
      const full = (i: number): boolean => r.halfAt![i] >= 0.98 * r.halfWidth;
      let a = 0, b = r.xs.length - 1;
      while (a < b && !full(a)) a++;                       // narrowing at the START (tail begins on the main road)
      while (b > a && !full(b)) b--;                       // narrowing at the END
      if (a > 0) s0 = r.cum[a] + opt.mergeMargin;
      if (b < r.xs.length - 1) s1 = r.cum[b] - opt.mergeMargin;
    } else if (!isTail) { s0 = opt.slipEndGap; s1 = r.length - opt.slipEndGap; }
    if (s1 - s0 < 3 * opt.postStep) continue;
    const n = Math.floor((s1 - s0) / opt.postStep);
    for (const side of [1, -1]) {                           // +1 = left of the travel direction (normal = (tz, -tx) for a car facing +tangent: left is (-tz, tx) in x / z with z up the screen; the sign only picks a side)
      const P: { x: number; z: number; y: number; yaw: number; ok: boolean }[] = [];
      for (let k = 0; k <= n; k++) {
        const s = s0 + k * opt.postStep;
        at(s, q);
        const off = q.h + r.shoulder - 0.35, nx = -q.tz * side, nz = q.tx * side;
        const px = q.x + nx * off, pz = q.z + nz * off;
        P.push({ x: px, z: pz, y: q.y - 0.05, yaw: Math.atan2(q.tz, q.tx), ok: !onOtherAsphalt(px, pz) });
      }
      // runs of valid posts; drop runs shorter than 3
      for (let k = 0; k < P.length; k++) {
        if (!P[k].ok) continue;
        let j = k; while (j < P.length && P[j].ok) j++;
        if (j - k >= 3) {
          for (let m = k; m < j; m++) {
            const p = P[m];
            B.box(p.x, p.z, p.yaw, POST_W, POST_W, p.y, p.y + opt.height, POST);
            st.posts++;
            if (m + 1 < j) {
              const b = P[m + 1], dx = b.x - p.x, dz = b.z - p.z, l = Math.hypot(dx, dz);
              if (l < 0.2) continue;
              const ux = dx / l, uz = dz / l, nx = -uz, nz = ux, ht = BEAM_T / 2, y0a = p.y + opt.height - BEAM_H, y0b = b.y + opt.height - BEAM_H;
              const sec = (x: number, z: number, y0: number): V3[] => [[x + nx * ht, y0, z + nz * ht], [x - nx * ht, y0, z - nz * ht], [x - nx * ht, y0 + BEAM_H, z - nz * ht], [x + nx * ht, y0 + BEAM_H, z + nz * ht]];
              B.prism(sec(p.x, p.z, y0a), sec(b.x, b.z, y0b), BEAM);
              st.beamMetres += l;
            }
          }
          st.perRoad.push({ name: r.name, side, from: s0 + k * opt.postStep, to: s0 + (j - 1) * opt.postStep, posts: j - k });
        }
        k = j;
      }
    }
  }
  const tris = B.indices.length / 3;
  return {
    positions: B.positions, colors: B.colors, indices: B.indices,
    parts: { deck: [0, 0], concrete: [0, 0], barrier: [0, tris], mark: [0, 0], lamp: [0, 0] },
    stats: { tris, verts: B.positions.length / 3, deckTris: 0, concreteTris: 0, barrierTris: tris, markTris: 0, lampTris: 0, skipped: 0 },
    railStats: st,
  };
}
