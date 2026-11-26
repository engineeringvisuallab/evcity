// CITY MALL, STEP R1: the column grid + ceiling-light positions of every storey (pure numbers, NO three.js, so MallBuilder and the headless tests share ONE truth).
// Local frame of the mall (origin = the atrium centre). The grid is 12 m, columns stand at (12k + 6, 12m + 6) so that NO column stands on the two entrance aisles
// (|x| < 5.5 from the north door, |z| < 5.5 from the east door). Columns are 1 x 1 m. None inside the atrium (+ a 3 m walkway), none within 2.5 m of the glass wall, none
// near the stair / lift cores. Ceiling lights: a 6 m strip in the middle of every grid cell (at (12k, 12m)), same exclusions.
import { MALL_ATRIUM_R, MALL_BUILDING_LOCAL } from './MallSite';
import { coreFootprints } from './MallCores';

export const GRID = 12;
export type P2 = readonly [number, number];

export function insidePoly(P: ReadonlyArray<P2>, x: number, z: number): boolean {
  let r = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) r = !r; }
  return r;
}
export function edgeDist(P: ReadonlyArray<P2>, x: number, z: number): number {
  let d = 1e9;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const ax = P[j][0], az = P[j][1], ex = P[i][0] - ax, ez = P[i][1] - az, l2 = ex * ex + ez * ez;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)) : 0;
    d = Math.min(d, Math.hypot(x - (ax + ex * t), z - (az + ez * t)));
  }
  return d;
}

export interface FloorLayout { cols: [number, number][]; lights: [number, number][] }

export function floorLayout(P: ReadonlyArray<P2> = MALL_BUILDING_LOCAL, atriumR: number = MALL_ATRIUM_R, grid: number = GRID): FloorLayout {
  const FOOT = coreFootprints();
  const hitsCore = (x: number, z: number, hw: number, hd: number): boolean => FOOT.some(([a, b, c, d]) => x + hw > a && x - hw < b && z + hd > c && z - hd < d);
  const cols: [number, number][] = [], lights: [number, number][] = [];
  for (let k = -20; k <= 20; k++) for (let m = -20; m <= 20; m++) {
    const cx = grid * k + grid / 2, cz = grid * m + grid / 2;
    if (insidePoly(P, cx, cz) && edgeDist(P, cx, cz) >= 2.5 && Math.hypot(cx, cz) >= atriumR + 3 && !hitsCore(cx, cz, 3.5, 3.5)) cols.push([cx, cz]);
    const lx = grid * k, lz = grid * m;
    if (insidePoly(P, lx, lz) && edgeDist(P, lx, lz) >= 3 && Math.hypot(lx, lz) >= atriumR + 3.5 && !hitsCore(lx, lz, 3.5, 0.5)) lights.push([lx, lz]);
  }
  return { cols, lights };
}
