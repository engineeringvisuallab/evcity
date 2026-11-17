// EVLab Step RT7: the 5 m walking path from the W arm of J1 to the west bridge landing (EVLabSite.EVLAB_WALK_PATH). Headless (no three).
//   npx tsx scripts/evlab-walkpath-test.ts
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { EVLAB_WALK_PATH, EVLAB_GATE_ROADS, EVLAB_PLOT, WALK_ARM_EDGE, WALK_WIDTH, WALK_Z, evlabKeepout, localToWorld, worldToLocal } from '../src/evlab/EVLabSite';
import { GATE_Z } from '../src/evlab/EVLabCampus';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
import { MALL_POLY } from '../src/mall/MallSite';
const gen = new TerrainGenerator(Config.world.seed);
const e = gen.evlab;
let fails = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const W = EVLAB_WALK_PATH, L = W.local;

// the W arm axis (local metres): first two points of J1ArmData, extended back into the lane zone
const arm = J1_ARM_DATA.find((a) => a.name === 'J1-W')!;
const a0 = worldToLocal(arm.pts[0][0], arm.pts[0][1]), a1 = worldToLocal(arm.pts[1][0], arm.pts[1][1]);
const adx = a1[0] - a0[0], adz = a1[1] - a0[1], al = Math.hypot(adx, adz);
const perp = (x: number, z: number): number => Math.abs((x - a0[0]) * adz - (z - a0[1]) * adx) / al; // distance to the axis line

ok(W.width === 5 && WALK_WIDTH === 5, 'path is 5 m wide');
ok(L.every((p) => Math.abs(p[1] - WALK_Z) < 1e-9) && L.every((p, i) => i === 0 || p[0] > L[i - 1][0]), 'straight along local x (the turned frame), from the arm to the campus');
ok(Math.abs(L[L.length - 1][0] - -156) < 1e-9, 'ends at the west bridge landing (local x -156)');
ok(Math.abs(perp(L[0][0], L[0][1]) - WALK_ARM_EDGE) < 0.05, `starts at the arm verge edge: ${perp(L[0][0], L[0][1]).toFixed(2)} m from the W arm centre line (24.2)`);
ok(L[0][0] > a0[0], 'starts on the campus side of the W arm axis');
ok(W.length > 55 && W.length < 70, `length ${W.length.toFixed(1)} m (fence -> arm edge about 38 m, + inside the plot 24 m)`);
{
  const gw = EVLAB_GATE_ROADS.find((g) => g.id === 'W')!;
  const gap = GATE_Z - gw.halfWidth - (WALK_Z + WALK_WIDTH / 2);
  ok(gap >= 0.4 && gap <= 1, `kerb gap to the west gate road ${gap.toFixed(2)} m (no overlap)`);
}
{
  // not on the plot's inner buildings: the path only crosses the west fence line, never goes further in than the bridge landing
  ok(L.every((p) => p[0] <= -156 + 1e-9) && -156 > EVLAB_PLOT.x0, 'path stays outside the lake / island (west of the bridge landing)');
  const inPoly = (x: number, z: number) => { let n = false; for (let i = 0, j = MALL_POLY.length - 1; i < MALL_POLY.length; j = i++) { const [xi, zi] = MALL_POLY[i], [xj, zj] = MALL_POLY[j]; if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) n = !n; } return n; };
  ok(!W.pts.some(([x, z]) => inPoly(x, z)), 'no point of the path is inside the City Mall polygon');
}
ok(W.pts.every(([x, z]) => e.contains(x, z)), 'EVLabSite.contains() is true on the whole path (no trees / rocks on it)');
ok(W.pts.every(([x, z]) => evlabKeepout(x, z)), 'evlabKeepout() is true on the whole path (no local street on it)');
ok(e.contains(...(localToWorld(L[0][0] - 3.5, WALK_Z) as [number, number])), 'contains() also 3.5 m beside the path end (tree-free margin)');

// ground: natural height relative to the floor, along the path; the arm end uses the J1 pad level (the arm is built to the road level)
{
  const sc = { h: 0, water: NaN, fx: 0, fz: 0 }; const g = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };
  const hs: number[] = L.map(([x, z]) => { const [wx, wz] = localToWorld(x, z); return g(wx, wz); });
  let maxS = 0; for (let i = 1; i < hs.length; i++) maxS = Math.max(maxS, Math.abs(hs[i] - hs[i - 1]) / (Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1])));
  console.log('natural ground along the path (m):', hs.map((h) => h.toFixed(1)).join(' '), '; floor', e.floorY.toFixed(2));
  ok(hs.every((h) => Number.isFinite(h)), 'ground height known along the whole path');
  console.log(`  natural slope max ${(maxS * 100).toFixed(1)} % (information: the game ribbon follows the carved terrain, not the natural one)`);
}
console.log(fails ? `\n${fails} FAIL` : '\nALL OK');
process.exit(fails ? 1 : 0);
