// J9-b PROBE (headless): terrain height of the real game (roads applied) vs the J300 road surface along the arms, ramps and platform.
// Run: J300=ON|OFF npx tsx scripts/j300-j9b-probe.ts   prints one JSON line.
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { J300_STRUCT_C as C } from '../src/roads/junction/J300StructC';
Config.roads.junctionJ300.enabled = process.env.J300 === 'ON';
const g: any = new TerrainGenerator(Config.world.seed); const sc = g.makeSample();
const H = (x: number, z: number): number => { g.sample(x, z, sc); return sc.h; };
const out: any = { arms: {}, ramps: {} };
for (const A of (C as any).surfArms) {
  const P = A.pts; const rows: number[][] = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)]; const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; const nx = -dz / l, nz = dx / l;
    const res: number[] = [P[i][2]]; for (const o of [0, 8, 14, A.top, A.top + 4, A.top + 10, -A.top - 4, -A.top - 10]) res.push(H(P[i][0] + nx * o, P[i][1] + nz * o));
    rows.push(res);
  }
  out.arms[A.id] = rows;
}
console.log('JSON' + JSON.stringify(out));
// ---- ramps: terrain at the ribbon centre / both edges vs the ramp level
{ const R: any = {};
  for (const Rp of (C as any).surfRamps) { const rows: number[][] = [];
    for (const r of Rp.rows) { const cx = (r[2] + r[4]) / 2, cz = (r[3] + r[5]) / 2; rows.push([r[8], H(cx, cz), H(r[0], r[1]), H(r[6], r[7])]); }
    R[Rp.id] = rows; }
  console.log('RAMPS' + JSON.stringify(R)); }
// ---- platform: terrain at ring r = 0, 30, 55, 62 vs deck 35.3 (just for the record)
{ const D = (C as any).deck; const cs = Math.cos(D.yaw), sn = Math.sin(D.yaw); const res: number[][] = [];
  for (let a = 0; a < 360; a += 45) { const row: number[] = []; for (const r of [0, 30, 55, 61]) { const u = r * Math.cos(a * Math.PI / 180), v = r * Math.sin(a * Math.PI / 180); row.push(H(D.cx + u * cs + v * sn, D.cz + u * sn - v * cs)); } res.push(row); }
  console.log('PLAT' + JSON.stringify(res)); }
