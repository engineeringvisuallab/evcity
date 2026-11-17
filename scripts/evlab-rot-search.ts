// EVLab R0b/R0c: where can a BIGGER plot go, optionally turned parallel to the J1 arms (yaw)? Headless, changes nothing.
// Local frame: x' = along the E arm (cos yaw, sin yaw), z' = along the S arm (-sin yaw, cos yaw); the 40 m car park strip is on the +x' side.
// WEDGE=NW PW=360 PD=300 YAW=37.5 npx tsx scripts/evlab-rot-search.ts      (YAW=0: axis-aligned, like evlab-front-search2.ts)
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const g = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };
const J1 = { x: -87, z: -277 }, J1YAW = (37.5 * Math.PI) / 180;
const dirs: Record<string, [number, number]> = { 'J1-N': [Math.sin(J1YAW), -Math.cos(J1YAW)], 'J1-E': [Math.cos(J1YAW), Math.sin(J1YAW)], 'J1-S': [-Math.sin(J1YAW), Math.cos(J1YAW)], 'J1-W': [-Math.cos(J1YAW), -Math.sin(J1YAW)] };
const arms: Record<string, Array<[number, number]>> = {};
for (const k of Object.keys(dirs)) { arms[k] = []; for (let s = 0; s < 315; s += 5) arms[k].push([J1.x + dirs[k][0] * s, J1.z + dirs[k][1] * s]); }
for (const a of J1_ARM_DATA) for (const p of a.pts) arms[a.name].push([p[0], p[1]]);
const rail: Array<[number, number]> = [];
for (const e of gen.rail.edges) for (let j = 0; j + 1 < e.xs.length; j++) { const L = Math.hypot(e.xs[j + 1] - e.xs[j], e.zs[j + 1] - e.zs[j]), n = Math.max(1, Math.ceil(L / 10)); for (let k = 0; k <= n; k++) rail.push([e.xs[j] + ((e.xs[j + 1] - e.xs[j]) * k) / n, e.zs[j] + ((e.zs[j + 1] - e.zs[j]) * k) / n]); }
const all = Object.values(arms).flat();
const W = +(process.env.PW ?? 300), D = +(process.env.PD ?? 240), STRIP = 40, YAW = (+(process.env.YAW ?? 37.5) * Math.PI) / 180;
const c = Math.cos(YAW), s = Math.sin(YAW);
// world -> plot-local (rotate by -YAW about the plot centre cx, cz)
const toL = (cx: number, cz: number, x: number, z: number): [number, number] => { const dx = x - cx, dz = z - cz; return [dx * c + dz * s, -dx * s + dz * c]; };
const toW = (cx: number, cz: number, lx: number, lz: number): [number, number] => [cx + lx * c - lz * s, cz + lx * s + lz * c];
const dRectL = (cx: number, cz: number, x0: number, x1: number, z0: number, z1: number, pts: Array<[number, number]>): number => { let m = 1e9; for (const [px, pz] of pts) { const [x, z] = toL(cx, cz, px, pz); m = Math.min(m, Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1))); } return m; };
const best: any[] = [];
const STEP = +(process.env.STEP ?? 20);
for (let cx = -800; cx <= 400; cx += STEP) for (let cz = -1000; cz <= -250; cz += STEP) {
  const hx = W / 2, hz = D / 2;
  const dm = dRectL(cx, cz, -hx, hx, -hz, hz, all); if (dm < 60) continue;
  if (dRectL(cx, cz, hx, hx + STRIP, -hz + 105, -hz + 245 > hz ? hz : -hz + 245, all) < 30) continue;
  const dJ = (() => { const [jx, jz] = toL(cx, cz, J1.x, J1.z); return Math.hypot(Math.max(-hx - jx, 0, jx - hx), Math.max(-hz - jz, 0, jz - hz)); })(); if (dJ < 110) continue;
  if (dRectL(cx, cz, -hx, hx + STRIP, -hz, hz, rail) < 50) continue;
  if (process.env.WEDGE === 'NW') { const dN = dRectL(cx, cz, -hx, hx + STRIP, -hz, hz, arms['J1-N']), dW = dRectL(cx, cz, -hx, hx, -hz, hz, arms['J1-W']); if (dN > 160 || dW > 160) continue; }
  const hs: number[] = [];
  for (let lx = -hx; lx <= hx + STRIP; lx += 12) for (let lz = -hz; lz <= hz; lz += 12) { const [wx, wz] = toW(cx, cz, lx, lz); hs.push(g(wx, wz)); }
  const mean = hs.reduce((a, b) => a + b, 0) / hs.length; let cut = 0, fill = 0; for (const h of hs) { if (h > mean) cut += (h - mean) * 144; else fill += (mean - h) * 144; }
  best.push({ cx, cz, cut, fill, relief: Math.max(...hs) - Math.min(...hs), dm, dJ });
}
best.sort((a, b) => a.cut + a.fill - (b.cut + b.fill));
console.log(`plot ${W}x${D} (+${STRIP} strip), yaw ${((YAW * 180) / Math.PI).toFixed(1)} deg: ${best.length} clear placements`);
for (const r of best.slice(0, 3)) console.log(`  centre (${r.cx}, ${r.cz}) cut ${(r.cut / 1e6).toFixed(2)} fill ${(r.fill / 1e6).toFixed(2)} Mm3, relief ${r.relief.toFixed(0)} m, arm gap ${r.dm.toFixed(0)}, J1 gap ${r.dJ.toFixed(0)}`);
