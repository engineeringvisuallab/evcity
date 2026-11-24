// STEP HK-FIX5: deck slab + parapets (visual) and a solid deck (collider) for the BRIDGED stretches of the HK-CD-* / HK-SLIP-* roads.
// Why: RoadNetwork.bridgeRamp marks a high / water stretch as a bridge and leaves the ground under it alone, but this project has no BridgeBuilder / BridgePhysics:
// only the ring, the J1 arms and the island link get structures (ringStructures()). So these stretches had a road ribbon only: nothing to stand or drive on.
// Pure mesh data (no three). Level: the collision top face lies SLAB_TOP_GAP under the road level (the road ribbon is drawn on top of it).
import type { RoadNetwork } from '../RoadNetwork';
import { Config } from '../../core/Config';

export interface HkBridgeDeckData {
  /** Visual: underside, sides, parapets (the road ribbon is the top). */
  visual: { positions: number[]; colors: number[]; indices: number[] };
  /** Collider: the same triangles + the top face (invisible, under the ribbon). */
  solid: { positions: number[]; indices: number[] };
  /** Number of HK bridge stretches built, and their total length (m). */
  bridges: number;
  lengthM: number;
}

export const HKB = {
  girder: 1.4, // slab thickness (m), same as the HK ramp girder
  parH: 0.9, // parapet height (m)
  parT: 0.35, // parapet thickness (m)
  topGap: 0.005, // collision top face under the road level (m)
  grey: [0.62, 0.62, 0.6] as [number, number, number],
  dark: [0.5, 0.5, 0.49] as [number, number, number],
};

export function buildHkBridgeDecks(roads: RoadNetwork): HkBridgeDeckData {
  const out: HkBridgeDeckData = { visual: { positions: [], colors: [], indices: [] }, solid: { positions: [], indices: [] }, bridges: 0, lengthM: 0 };
  if (!Config.roads.hatikamrul.enabled) return out;
  const V = out.visual, S = out.solid;
  // add a quad (a, b, c, d in order) to the visual mesh and / or the solid
  const quad = (a: number[], b: number[], c: number[], d: number[], col: [number, number, number], vis: boolean, sol: boolean): void => {
    if (vis) {
      const o = V.positions.length / 3;
      for (const p of [a, b, c, d]) { V.positions.push(p[0], p[1], p[2]); V.colors.push(col[0], col[1], col[2]); }
      V.indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    if (sol) {
      const o = S.positions.length / 3;
      for (const p of [a, b, c, d]) S.positions.push(p[0], p[1], p[2]);
      S.indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
  };
  const hkIds = new Set<number>();
  for (const r of roads.roads) if (r.name.startsWith('HK-')) hkIds.add(r.id);
  for (const b of roads.bridges) {
    if (!hkIds.has(b.roadId)) continue;
    const r = roads.roads.find((q) => q.id === b.roadId)!;
    const hw = b.deckHalfWidth;
    const n = r.xs.length;
    const i0 = Math.max(0, b.i0), i1 = Math.min(n - 1, b.i1);
    if (i1 - i0 < 1) continue;
    out.bridges++;
    out.lengthM += (i1 - i0) * r.step;
    // cross sections: left / right edge at the deck top (y0) for each centreline point
    const sec: { l: number[]; r: number[]; nx: number; nz: number; y: number }[] = [];
    for (let k = i0; k <= i1; k++) {
      const a = Math.max(0, k - 1), c = Math.min(n - 1, k + 1);
      let tx = r.xs[c] - r.xs[a], tz = r.zs[c] - r.zs[a];
      const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
      const nx = -tz, nz = tx; // left normal
      const y = r.ys[k];
      sec.push({ l: [r.xs[k] + nx * hw, y, r.zs[k] + nz * hw], r: [r.xs[k] - nx * hw, y, r.zs[k] - nz * hw], nx, nz, y });
    }
    const dn = (p: number[], d: number): number[] => [p[0], p[1] - d, p[2]];
    const up = (p: number[], d: number): number[] => [p[0], p[1] + d, p[2]];
    const inn = (p: number[], nx: number, nz: number, d: number): number[] => [p[0] + nx * d, p[1], p[2] + nz * d];
    for (let k = 0; k + 1 < sec.length; k++) {
      const A = sec[k], B = sec[k + 1];
      // collision top face (under the road level; not drawn)
      quad(dn(A.l, HKB.topGap), dn(B.l, HKB.topGap), dn(B.r, HKB.topGap), dn(A.r, HKB.topGap), HKB.grey, false, true);
      // underside, left side, right side of the slab
      quad(dn(A.r, HKB.girder), dn(B.r, HKB.girder), dn(B.l, HKB.girder), dn(A.l, HKB.girder), HKB.dark, true, true);
      quad(dn(A.l, HKB.girder), dn(B.l, HKB.girder), B.l, A.l, HKB.grey, true, true);
      quad(A.r, B.r, dn(B.r, HKB.girder), dn(A.r, HKB.girder), HKB.grey, true, true);
      // parapets, both edges: outer face, top, inner face
      for (const side of [1, -1]) {
        const e = (S2: typeof A): number[] => (side > 0 ? S2.l : S2.r);
        const ia = inn(e(A), -side * A.nx, -side * A.nz, HKB.parT), ib = inn(e(B), -side * B.nx, -side * B.nz, HKB.parT);
        quad(e(A), e(B), up(e(B), HKB.parH), up(e(A), HKB.parH), HKB.grey, true, true); // outer
        quad(up(e(A), HKB.parH), up(e(B), HKB.parH), up(ib, HKB.parH), up(ia, HKB.parH), HKB.grey, true, true); // top
        quad(up(ia, HKB.parH), up(ib, HKB.parH), ib, ia, HKB.grey, true, true); // inner
      }
    }
    // end caps of the slab (so the parapet / girder is closed at both ends)
    for (const [s, flip] of [[sec[0], false], [sec[sec.length - 1], true]] as const) {
      const a = flip ? s.r : s.l, c = flip ? s.l : s.r;
      quad(a, c, dn(c, HKB.girder), dn(a, HKB.girder), HKB.dark, true, false);
    }
  }
  return out;
}
