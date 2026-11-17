// STEP M1d: the paved bands round the City Mall plot (pure maths, no three, shared by MallManager.buildApron and scripts/mall-bands-check.ts).
//   plot edge --(apron, ash concrete)--> --(walkway, MALL_WALK m)--> the red line (MALL_RED_GAP m from the road pavement + shoulder / rail edge)
// Along the hill side (no road or rail within 80 m) there is no corridor: the red line is the old fixed apron width (MALL_APRON) / the hand-drawn MALL_RED edge.
import { J1_SITE } from '../roads/junction/GroundJ1Geometry';
import { MALL_POLY, MALL_RED, MALL_APRON, MALL_APRON_MAX, MALL_WALK, MALL_RED_GAP } from './MallSite';

export interface MallBands {
  /** The plot outline, resampled every ~3 m (world x, z), and the outward unit normal at each point. */
  pts: Array<[number, number]>; nx: number[]; nz: number[];
  /** Distance (m) from the plot edge to the outer edge of the apron / to the red line (= outer edge of the walkway). wRed - wApron = the walkway width. */
  wApron: number[]; wRed: number[];
  /** True where the red line stopped at a road / rail corridor (false = hill side). */
  hit: boolean[];
}

export const inPoly = (P: ReadonlyArray<readonly [number, number]>, x: number, z: number): boolean => {
  let r = false;
  for (let a = 0, b = P.length - 1; a < P.length; b = a++) { const [xi, zi] = P[a], [xj, zj] = P[b]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) r = !r; }
  return r;
};

/** `T` = the TerrainGenerator (roads.roads, roads.maskAt, rail.edges). */
export function mallBands(T: any): MallBands {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < MALL_POLY.length; i++) { const a = MALL_POLY[i], b = MALL_POLY[(i + 1) % MALL_POLY.length]; const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3)); for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); }
  // obstacles near the plot: road points with (half width + shoulder), rail points with 6 m
  const obs: Array<[number, number, number]> = [];
  const near = (x: number, z: number): boolean => x > -760 && x < -60 && z > -560 && z < 40;
  for (const r of T.roads.roads) for (let i = 0; i < r.xs.length; i++) if (near(r.xs[i], r.zs[i])) obs.push([r.xs[i], r.zs[i], r.halfWidth + r.shoulder]);
  for (const e of T.rail.edges) for (let j = 0; j + 1 < e.xs.length; j++) { const L = Math.hypot(e.xs[j + 1] - e.xs[j], e.zs[j + 1] - e.zs[j]), n = Math.max(1, Math.ceil(L / 4)); for (let k = 0; k <= n; k++) { const x = e.xs[j] + ((e.xs[j + 1] - e.xs[j]) * k) / n, z = e.zs[j] + ((e.zs[j + 1] - e.zs[j]) * k) / n; if (near(x, z)) obs.push([x, z, 6]); } }
  // the J1 junction itself (lane zone s 0..315 of the W and S arms, 4 m pavement beyond the slip kerb: 26 m; the corner kerbs reach 53.8 m from the centre) is not in T.roads.roads
  {
    const Y = (J1_SITE.yawDeg * Math.PI) / 180, W = [-Math.cos(Y), -Math.sin(Y)], S = [-Math.sin(Y), Math.cos(Y)];
    obs.push([J1_SITE.x, J1_SITE.z, 54]);
    for (const d of [W, S]) for (let t = 0; t <= 315; t += 4) { const x = J1_SITE.x + d[0] * t, z = J1_SITE.z + d[1] * t; if (near(x, z)) obs.push([x, z, 26]); }
  }
  const gap = (x: number, z: number): number => { let m = 1e9; for (const o of obs) { const dx = o[0] - x; if (dx > m + o[2] || -dx > m + o[2]) continue; m = Math.min(m, Math.hypot(dx, o[1] - z) - o[2]); } return m; };
  const N = pts.length;
  const nx: number[] = [], nz: number[] = [], wr: number[] = [], hit: boolean[] = [];
  for (let i = 0; i < N; i++) {
    const p = pts[(i + N - 2) % N], q = pts[(i + 2) % N]; let tx = q[0] - p[0], tz = q[1] - p[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    let ex = -tz, ez = tx; if (inPoly(MALL_POLY, pts[i][0] + ex * 1.5, pts[i][1] + ez * 1.5)) { ex = -ex; ez = -ez; }
    nx.push(ex); nz.push(ez);
    let ww = 0, blocked = false, corridor = false;
    while (ww < MALL_APRON_MAX) {
      const x = pts[i][0] + ex * (ww + 0.5), z = pts[i][1] + ez * (ww + 0.5), gp = gap(x, z);
      if (gp < MALL_RED_GAP) { corridor = true; blocked = true; break; }
      if (gp >= 80 && !inPoly(MALL_RED, x, z)) { blocked = true; break; } // far from every road and outside the hand-drawn red area
      ww += 0.5;
    }
    hit.push(corridor);
    wr.push(Math.max(0, corridor ? ww : Math.min(ww, MALL_APRON)));
    void blocked;
  }
  for (let it = 0; it < 6; it++) { const c = wr.slice(); for (let i = 0; i < N; i++) wr[i] = Math.min(c[i], (c[(i + N - 1) % N] + c[i] + c[(i + 1) % N]) / 3); }
  const wa = wr.map((w) => Math.max(0, w - MALL_WALK));
  return { pts, nx, nz, wApron: wa, wRed: wr, hit };
}
