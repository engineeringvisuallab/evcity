// CHECK of src/buildings/PlacementsResidential.ts (own code, not the generator's): model ids known, overlaps, road ribbon, rail, water, keep-outs, ground range.
// Run: npx tsx scripts/residential-check.ts
import { readFileSync } from 'node:fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { RESIDENTIAL_PLACEMENTS } from '../src/buildings/PlacementsResidential';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';
import { getEngineeringAreaAt } from '../src/city/EngineeringZones';
const gen: any = new TerrainGenerator(Config.world.seed);
const s = gen.makeSample();
let fails = 0; const chk = (ok: boolean, t: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${t}`); };
const src = ['registry', 'fillRegistry'].map((f) => readFileSync(`src/buildings/models/${f}.ts`, 'utf8')).join('\n');
const unknown = new Set(RESIDENTIAL_PLACEMENTS.map((p) => p.id).filter((id) => !src.includes(`id: '${id}'`)));
chk(unknown.size === 0, `every model id exists in registry / fillRegistry (unknown: ${[...unknown].join(',') || 'none'})`);
const corners = (r: { x: number; z: number; yaw: number; W: number; D: number }, m = 0): [number, number][] => { const c = Math.cos(r.yaw), sn = Math.sin(r.yaw), hx = r.W / 2 + m, hz = r.D / 2 + m; return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [r.x + c * hx * i + sn * hz * j, r.z - sn * hx * i + c * hz * j] as [number, number]); };
const sat = (a: any, b: any, m: number): boolean => { const A = corners(a, m / 2), B = corners(b, m / 2); for (const q of [a, b]) { const c = Math.cos(q.yaw), sn = Math.sin(q.yaw); for (const ax of [[c, -sn], [sn, c]]) { let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; for (const p of A) { const v = p[0] * ax[0] + p[1] * ax[1]; a0 = Math.min(a0, v); a1 = Math.max(a1, v); } for (const p of B) { const v = p[0] * ax[0] + p[1] * ax[1]; b0 = Math.min(b0, v); b1 = Math.max(b1, v); } if (a1 < b0 || b1 < a0) return false; } } return true; };
const all = [...BUILDING_PLACEMENTS, ...FILL_PLACEMENTS, ...RESIDENTIAL_PLACEMENTS];
const G = new Map<string, number[]>(); const C = 64;
all.forEach((b, i) => { const R = Math.hypot(b.W, b.D) / 2; for (let a = Math.floor((b.x - R) / C); a <= Math.floor((b.x + R) / C); a++) for (let k = Math.floor((b.z - R) / C); k <= Math.floor((b.z + R) / C); k++) { const key = `${a},${k}`; const l = G.get(key); if (l) l.push(i); else G.set(key, [i]); } });
let ov = 0; const base = BUILDING_PLACEMENTS.length + FILL_PLACEMENTS.length;
for (let i = base; i < all.length; i++) { const b = all[i]; const seen = new Set<number>(); const R = Math.hypot(b.W, b.D) / 2; for (let a = Math.floor((b.x - R) / C); a <= Math.floor((b.x + R) / C); a++) for (let k = Math.floor((b.z - R) / C); k <= Math.floor((b.z + R) / C); k++) for (const j of G.get(`${a},${k}`) ?? []) { if (j === i || seen.has(j)) continue; seen.add(j); if (j < i && j >= base || j < base) if (sat(b, all[j], 0)) ov++; } }
chk(ov === 0, `no footprint overlaps another building (overlaps ${ov})`);
let road = 0, surf = 0, rail = 0, wet = 0, fence = 0, steep = 0, worst = 0;
const roadPts: { x: number; z: number; e: number }[] = []; for (const r of gen.roads.roads) { if (r.earth) continue; for (let i = 0; i < r.xs.length; i++) roadPts.push({ x: r.xs[i], z: r.zs[i], e: r.halfWidth + Math.max(r.shoulder, 3) }); }
const rg = new Map<string, typeof roadPts>(); for (const p of roadPts) { const k = `${Math.floor(p.x / 100)},${Math.floor(p.z / 100)}`; const l = rg.get(k); if (l) l.push(p); else rg.set(k, [p]); }
for (const b of RESIDENTIAL_PLACEMENTS) {
  const c = Math.cos(b.yaw), sn = Math.sin(b.yaw); let mn = 1e9, mx = -1e9, bad = false;
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) { const lx = (i / 3 - 1) * b.W / 2, lz = (j / 3 - 1) * b.D / 2; const x = b.x + lx * c + lz * sn, z = b.z - lx * sn + lz * c; if (gen.roads.surfaceAt(x, z) !== 0) surf++; if (gen.railForm.inCorridor(x, z, 10)) rail++; if (getEngineeringAreaAt(x, z)) fence++; gen.sample(x, z, s); if (s.water === s.water && s.h < s.water + 0.3) wet++; mn = Math.min(mn, s.h); mx = Math.max(mx, s.h); }
  if (mx - mn > 2.5 + 1e-6) steep++; worst = Math.max(worst, mx - mn);
  // ribbon gap: centre sample distance minus ribbon, sampled on the footprint edge
  for (let a = Math.floor((b.x - 60) / 100); a <= Math.floor((b.x + 60) / 100) && !bad; a++) for (let k = Math.floor((b.z - 60) / 100); k <= Math.floor((b.z + 60) / 100) && !bad; k++) for (const p of rg.get(`${a},${k}`) ?? []) { const dx = p.x - b.x, dz = p.z - b.z; const lx = dx * c - dz * sn, lz = dx * sn + dz * c; const d = Math.hypot(Math.max(Math.abs(lx) - b.W / 2, 0), Math.max(Math.abs(lz) - b.D / 2, 0)); if (d - p.e < 1.0) { road++; bad = true; break; } }
}
chk(road === 0, `footprint keeps >= 1.0 m from every road ribbon + footpath (touching: ${road})`);
chk(surf === 0, `no footprint sample on a road surface / junction pad (${surf})`);
chk(rail === 0, `rail corridor + 10 m clear (${rail})`);
chk(wet === 0, `no footprint sample wet (${wet})`);
chk(fence === 0, `no footprint sample inside a fenced engineering area (${fence})`);
chk(steep === 0, `ground range under every footprint <= 2.5 m (worst ${worst.toFixed(2)} m, over ${steep})`);
console.log(`\nTOTAL ${RESIDENTIAL_PLACEMENTS.length} buildings, ${fails} FAIL`);
