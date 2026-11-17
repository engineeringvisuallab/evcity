// EVLab RT0: 90 deg anticlockwise rotation + 5 m from the roads. Headless (no three), changes nothing.
// Footprint = lake outer edge + 5 m walking path + west margin + car park (local x -155..195, z -90..155). New yaw = 37.5 - 90 = -52.5 deg.
//   npx tsx scripts/evlab-rt0-rotate.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
import { EVLAB_ORIGIN } from '../src/evlab/EVLabSite';
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const g = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };
const J1 = { x: -87, z: -277 }, Y0 = (37.5 * Math.PI) / 180, HALFP = 22.1;
const dir = { N: [Math.sin(Y0), -Math.cos(Y0)], E: [Math.cos(Y0), Math.sin(Y0)], S: [-Math.sin(Y0), Math.cos(Y0)], W: [-Math.cos(Y0), -Math.sin(Y0)] } as Record<string, [number, number]>;
const arms: Record<string, Array<[number, number]>> = { N: [], E: [], S: [], W: [] };
for (const k of Object.keys(dir)) for (let s = 0; s < 315; s += 5) arms[k].push([J1.x + dir[k][0] * s, J1.z + dir[k][1] * s]);
for (const a of J1_ARM_DATA) { const k = a.name.replace('J1-', ''); for (const p of a.pts) arms[k].push([p[0], p[1]]); }
const rail: Array<[number, number]> = [];
for (const e of gen.rail.edges) for (let j = 0; j + 1 < e.xs.length; j++) { const L = Math.hypot(e.xs[j + 1] - e.xs[j], e.zs[j + 1] - e.zs[j]), n = Math.max(1, Math.ceil(L / 10)); for (let k = 0; k <= n; k++) rail.push([e.xs[j] + ((e.xs[j + 1] - e.xs[j]) * k) / n, e.zs[j] + ((e.zs[j + 1] - e.zs[j]) * k) / n]); }
const FP = { x0: -155, x1: 195, z0: -90, z1: 155 };
const lakeOuter = { x0: -150, x1: 150, z0: -85, z1: 150 };
function frame(yaw: number, ox: number, oz: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { toL: (x: number, z: number): [number, number] => { const dx = x - ox, dz = z - oz; return [c * dx + s * dz, -s * dx + c * dz]; }, toW: (lx: number, lz: number): [number, number] => [ox + c * lx - s * lz, oz + s * lx + c * lz] };
}
const dRect = (f: ReturnType<typeof frame>, r: typeof FP, pts: Array<[number, number]>): number => { let m = 1e9; for (const [px, pz] of pts) { const [x, z] = f.toL(px, pz); m = Math.min(m, Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1))); } return m; };
function stats(yaw: number, ox: number, oz: number) {
  const f = frame(yaw, ox, oz);
  const hs: number[] = []; let hiX = 0, hiZ = 0, hiN = 0;
  for (let lx = FP.x0; lx <= FP.x1; lx += 12) for (let lz = FP.z0; lz <= FP.z1; lz += 12) { const [wx, wz] = f.toW(lx, lz); const h = g(wx, wz); hs.push(h); }
  const mean = hs.reduce((a, b) => a + b, 0) / hs.length; let cut = 0, fill = 0, top = -1e9, topL: [number, number] = [0, 0], i = 0;
  for (let lx = FP.x0; lx <= FP.x1; lx += 12) for (let lz = FP.z0; lz <= FP.z1; lz += 12) { const h = hs[i++]; if (h > mean) cut += (h - mean) * 144; else fill += (mean - h) * 144; if (h > top) { top = h; topL = [lx, lz]; } }
  const gap = (k: string) => dRect(f, lakeOuter, arms[k]) - HALFP - 5; // free metres beyond the 5 m walking path (0 = exactly 5 m from the pavement edge)
  const jx = f.toL(J1.x, J1.z), dJ = Math.hypot(Math.max(FP.x0 - jx[0], 0, jx[0] - FP.x1), Math.max(FP.z0 - jx[1], 0, jx[1] - FP.z1));
  return { cut, fill, relief: Math.max(...hs) - Math.min(...hs), highest: topL, gN: gap('N'), gW: gap('W'), gE: gap('E'), gS: gap('S'), dJ, dRail: dRect(f, FP, rail), inside: [dRect(f, FP, arms.N), dRect(f, FP, arms.W)] };
}
const fmt = (r: ReturnType<typeof stats>) => `cut ${(r.cut / 1e6).toFixed(2)} Mm3, relief ${r.relief.toFixed(0)} m, hill at local (${r.highest.map((v) => v.toFixed(0)).join(', ')}), lake->arm pavement edge: N ${(r.gN + 5).toFixed(0)} W ${(r.gW + 5).toFixed(0)} E ${(r.gE + 5).toFixed(0)} S ${(r.gS + 5).toFixed(0)} m, J1 ${r.dJ.toFixed(0)} m, rail ${r.dRail.toFixed(0)} m`;
const YA = Y0, YB = Y0 - Math.PI / 2;
console.log('A) now (yaw 37.5, origin as in code):', fmt(stats(YA, EVLAB_ORIGIN.x, EVLAB_ORIGIN.z)));
console.log('B) rotated in place (yaw -52.5, same origin):', fmt(stats(YB, EVLAB_ORIGIN.x, EVLAB_ORIGIN.z)));
// C) rotated + moved: scan origins; keep J1 >= 110, rail >= 50, lake outer never closer than 5 m (walking path) to an arm pavement edge, and report the best
//    placements for: one road at exactly ~5 m (N arm, or W arm, or both as close as J1 allows)
type R = ReturnType<typeof stats> & { ox: number; oz: number };
const all: R[] = [];
for (let ox = -700; ox <= 200; ox += 20) for (let oz = -900; oz <= -300; oz += 20) {
  const f = frame(YB, ox, oz);
  if (dRect(f, FP, [[J1.x, J1.z]]) < 110) continue;
  if (dRect(f, FP, rail) < 50) continue;
  const gN = dRect(f, lakeOuter, arms.N) - HALFP - 5, gW = dRect(f, lakeOuter, arms.W) - HALFP - 5;
  if (gN < -0.5 || gW < -0.5 || dRect(f, lakeOuter, arms.E) - HALFP - 5 < -0.5 || dRect(f, lakeOuter, arms.S) - HALFP - 5 < -0.5) continue;
  all.push({ ...stats(YB, ox, oz), ox, oz });
}
console.log(`C) rotated + moved, ${all.length} placements OK (J1 >= 110, rail >= 50, lake >= 5 m from every arm edge)`);
const pick = (name: string, key: (r: R) => number, n = 2) => { console.log(name); for (const r of all.slice().sort((a, b) => key(a) - key(b)).slice(0, n)) console.log(`   origin (${r.ox}, ${r.oz}): ${fmt(r)}`); };
pick(' C1) closest to BOTH roads (N gap + W gap smallest):', (r) => r.gN + r.gW);
pick(' C2) N arm at ~5 m, W arm as close as possible:', (r) => (r.gN < 8 ? r.gW : 1e9));
pick(' C3) W arm at ~5 m, N arm as close as possible:', (r) => (r.gW < 8 ? r.gN : 1e9));
pick(' C4) least cut (reference):', (r) => r.cut + r.fill);
