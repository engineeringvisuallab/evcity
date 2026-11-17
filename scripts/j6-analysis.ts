// J6 junction analysis on the real world. Demand below is an ASSUMPTION (peak hour, veh/h): edit it. Run: npx tsx scripts/j6-analysis.ts
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { analyzeJunction, formatReport } from '../src/interchange/Analysis';
const g: any = new TerrainGenerator(Config.world.seed);
const R = g.roads; const pad = R.pads.find((p: any) => p.id === 6); const hw = R.roads[5]; const s4 = R.roads[24];
const ground = (x: number, z: number): number => (g.heightAt ? g.heightAt(x, z) : g.getHeight(x, z));
const k0 = hw.xs.reduce((b: number, _: number, i: number) => (Math.hypot(hw.xs[i] - pad.x, hw.zs[i] - pad.z) < Math.hypot(hw.xs[b] - pad.x, hw.zs[b] - pad.z) ? i : b), 0);
const yaw = Math.atan2(hw.zs[k0 + 1] - hw.zs[k0 - 1], hw.xs[k0 + 1] - hw.xs[k0 - 1]);
const cy = Math.cos(yaw), sy = Math.sin(yaw);
const U0 = Number(process.env.J6_U ?? -68);
const cx = pad.x + U0 * cy, cz = pad.z + U0 * sy;
const W = (u: number, v: number) => ({ x: cx + u * cy + v * sy, z: cz + u * sy - v * cy });
const nearestY = (r: any, x: number, z: number): number => { let b = 0, bd = 1e18; for (let i = 0; i < r.xs.length; i++) { const d = (r.xs[i] - x) ** 2 + (r.zs[i] - z) ** 2; if (d < bd) { bd = d; b = i; } } return r.ys[b]; };
const mainY = (u: number): number => { const w = W(u, 0); return nearestY(hw, w.x, w.z); };
// Cross-road corridor by ARC distance. South leg (v<0) = the real S4 (with its river bridge). North leg (v>0): J6_NORTH=straight goes straight into the hill, J6_NORTH=west (default) bends west along the low ground toward S5.
const NORTH = process.env.J6_NORTH ?? 'west';
const polyUV: Array<[number, number]> = NORTH === 'straight' ? [[0, 0], [0, 400]] : [[0, 0], [0, 40], [-25, 70], [-70, 85], [-150, 85], [-230, 80], [-330, 100]];
function alongPoly(a: number): { x: number; z: number } { let s = 0; for (let i = 1; i < polyUV.length; i++) { const l = Math.hypot(polyUV[i][0] - polyUV[i - 1][0], polyUV[i][1] - polyUV[i - 1][1]); if (s + l >= a || i === polyUV.length - 1) { const t = Math.min(1, (a - s) / l); return W(polyUV[i - 1][0] + t * (polyUV[i][0] - polyUV[i - 1][0]), polyUV[i - 1][1] + t * (polyUV[i][1] - polyUV[i - 1][1])); } s += l; } return W(0, 0); }
let s4i = 0; { let bd = 1e18; for (let i = 0; i < s4.xs.length; i++) { const d = (s4.xs[i] - cx) ** 2 + (s4.zs[i] - cz) ** 2; if (d < bd) { bd = d; s4i = i; } } }
function s4At(a: number): { x: number; z: number; y: number } { let i = s4i, s = 0; while (i > 0 && s < a) { s += Math.hypot(s4.xs[i] - s4.xs[i - 1], s4.zs[i] - s4.zs[i - 1]); i--; } return { x: s4.xs[i], z: s4.zs[i], y: s4.ys[i] }; }
const crossY = (v: number): number => (v < 0 ? s4At(-v).y : ground(alongPoly(v).x, alongPoly(v).z));
const crossGround = (v: number): number => { const p = v < 0 ? s4At(-v) : alongPoly(v); return ground(p.x, p.z); };
const sec = (r: any, lanes: number) => ({ roadId: r.id, halfWidth: r.halfWidth, kerbLane: r.medianHalf > 0 ? r.medianHalf + r.laneW * (lanes - 0.5) : r.halfWidth - r.laneW / 2, laneW: r.laneW, lanesPerDir: lanes, designKmh: r.speedKmh });
const jx = R.pads.filter((p: any) => p !== pad).map((p: any) => Math.hypot(p.x - cx, p.z - cz));
const mainDem = { thru: Number(process.env.J6_MAIN ?? 1800), left: 150, right: 100 };
const crossDem = { thru: Number(process.env.J6_CROSS ?? 250), left: 120, right: 80 };
const a = analyzeJunction({
  id: 'J6', main: sec(hw, 3), cross: sec(s4, 1), mainShoulder: hw.shoulder ?? 1.5, crossShoulder: s4.shoulder ?? 1, mainMaxGrade: hw.maxGrade ?? 0.08,
  demand: { approaches: [mainDem, crossDem, mainDem, crossDem] },
  site: { x: cx, z: cz, y: mainY(0), yaw, ground, mainY, crossY, crossGround, nearestJunctionM: Math.min(...jx) },
});
console.log(formatReport(a, (process.env.LANG_OUT as 'en' | 'bn') ?? 'en'));
