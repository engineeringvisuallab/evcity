// STEP J1-e2a (headless): where can the EVLab plot (480 x 440 m, level) go now that J1 and its four arms take its old place?
// Obstacles: J1 + arm centre lines (N, W, E from docs/*_align.json, S = straight axis 3000 m), all roads (ring), railway (>= 60 m, fixed), stations, airport, seaport, library, mall, agro, infra, engineering areas, water.
// Run: npx tsx scripts/evlab-move-search.ts
import { readFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { AIRPORT, SEAPORT } from '../src/city/WorldZones';
import { ENGINEERING_AREAS } from '../src/city/EngineeringZones';
import { INFRA_PLACEMENTS } from '../src/engineering/InfraSites';
import { LIBRARY_PLOT } from '../src/library/LibrarySite';
import { MALL_PLOT } from '../src/mall/MallSite';
import { AGRO_POS, AGRO_PAD } from '../src/agro/AgroSite';
import { STATIONS } from '../src/rail/RailPlan';
import { EVLAB_POS } from '../src/evlab/EVLabSite';

const W = +(process.env.PW ?? 480), H = +(process.env.PH ?? 440), M = 40; const WEDGE = process.env.WEDGE ?? '';                 // plot size, margin around it (fence, parking)
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
type R = { x0: number; z0: number; x1: number; z1: number };
const rects: Array<[string, R]> = [['airport', AIRPORT], ['seaport', SEAPORT], ['library', LIBRARY_PLOT], ['mall', MALL_PLOT], ['agro', { x0: AGRO_POS.x + AGRO_PAD.x0, x1: AGRO_POS.x + AGRO_PAD.x1, z0: AGRO_POS.z + AGRO_PAD.z0, z1: AGRO_POS.z + AGRO_PAD.z1 }]];
for (const p of INFRA_PLACEMENTS) { const r = Math.hypot(Math.max(Math.abs(p.rect.x0), Math.abs(p.rect.x1)), Math.max(Math.abs(p.rect.z0), Math.abs(p.rect.z1))) + p.blend; rects.push([p.id, { x0: p.x - r, x1: p.x + r, z0: p.z - r, z1: p.z + r }]); }
for (const a of ENGINEERING_AREAS) rects.push([a.id, a]);
const hit = (a: R, b: R, m: number): boolean => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;
// lines to keep away from
const lines: Array<[string, number, number]> = [];
const addLine = (id: string, pts: Array<[number, number]>): void => { for (let i = 0; i + 1 < pts.length; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 25)); for (let k = 0; k <= n; k++) lines.push([id, ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]); } };
const J = Config.roads.junctionJ1, y = (J.yawDeg * Math.PI) / 180;
for (const [id, f] of [['N', 'j1c4b_align'], ['W', 'j1c5b_align'], ['E', 'j1c7b_align']] as const) { const d = JSON.parse(readFileSync(`docs/${f}.json`, 'utf8')); addLine('arm-' + id, [[J.x, J.z], [d.start.x, d.start.z], ...d.pis.map((p: { x: number; z: number }) => [p.x, p.z] as [number, number]), [d.end.x, d.end.z]]); }
addLine('arm-S', [[J.x, J.z], [J.x - 3000 * Math.sin(y), J.z + 3000 * Math.cos(y)]]);
for (const r of gen.roads.roads) { const p: Array<[number, number]> = []; for (let i = 0; i < r.xs.length; i += 3) p.push([r.xs[i], r.zs[i]]); addLine('road', p); }
for (const e of gen.rail.edges) { const p: Array<[number, number]> = []; for (let i = 0; i < e.xs.length; i += 3) p.push([e.xs[i], e.zs[i]]); addLine('rail', p); }
const near = (x0: number, z0: number, x1: number, z1: number, clear: Record<string, number>): string | null => {
  for (const [id, x, z] of lines) { const c = clear[id.startsWith('arm') ? 'arm' : id] ?? 60; const dx = Math.max(x0 - x, x - x1, 0), dz = Math.max(z0 - z, z - z1, 0); if (Math.hypot(dx, dz) < c) return id; }
  return null;
};
const CLEAR = { arm: 110, road: 90, rail: 70 };
const cand: Array<{ x: number; z: number; relief: number; sd: number; d: number }> = [];
const rej: Record<string, number> = {};
const why = (k: string): void => { rej[k] = (rej[k] ?? 0) + 1; };
for (let cx = -2600; cx <= 2600; cx += 40) for (let cz = -2600; cz <= 2600; cz += 40) {
  if (WEDGE) { const a = Math.atan2(cz - J.z, cx - J.x) * 180 / Math.PI; const lo = WEDGE === 'N' ? -142.5 : 37.5, hi = WEDGE === 'N' ? -52.5 : 127.5; const inW = WEDGE === 'W' ? (a > 127.5 || a < -142.5) : (a > lo && a < hi); if (!inW || Math.hypot(cx - J.x, cz - J.z) > +(process.env.MAXD ?? 2200)) continue; }
  const R0: R = { x0: cx - W / 2 - M, x1: cx + W / 2 + M, z0: cz - H / 2 - M, z1: cz + H / 2 + M };
  const IGN = (process.env.IGNORE ?? '').split(','); const hit1 = rects.find(([id, r]) => !IGN.includes(id) && hit(R0, r, 30)); if (hit1) { why('zone:' + hit1[0]); continue; }
  if (STATIONS.some((s) => Math.hypot(Math.max(R0.x0 - s.x, s.x - R0.x1, 0), Math.max(R0.z0 - s.z, s.z - R0.z1, 0)) < s.radius + 30)) { why('station'); continue; }
  const n1 = near(R0.x0, R0.z0, R0.x1, R0.z1, CLEAR); if (n1) { why(n1.startsWith('arm') ? 'arm' : n1); continue; }
  const hs: number[] = []; let wet = false;
  for (let x = cx - W / 2; x <= cx + W / 2 && !wet; x += 20) for (let z = cz - H / 2; z <= cz + H / 2; z += 20) { gen.sampleNatural(x, z, sc); if (!Number.isNaN(sc.water) && sc.h < sc.water + 0.5) { wet = true; break; } hs.push(sc.h); }
  if (wet) { why('wet'); continue; }
  hs.sort((a, b) => a - b); const relief = hs[Math.floor(hs.length * 0.95)] - hs[Math.floor(hs.length * 0.05)];
  cand.push({ x: cx, z: cz, relief, sd: Math.sqrt(hs.reduce((s, v) => s + (v - hs[hs.length >> 1]) ** 2, 0) / hs.length), d: Math.hypot(cx - EVLAB_POS.x, cz - EVLAB_POS.z) });
}
if (process.env.NEAR) { const J1c = Config.roads.junctionJ1; const nn = cand.filter((c) => Math.hypot(c.x - J1c.x, c.z - J1c.z) < +process.env.NEAR!).sort((a, b) => a.relief - b.relief).slice(0, 6); for (const c of nn) console.log(`NEAR centre (${c.x}, ${c.z}) relief ${c.relief.toFixed(1)} m, ${Math.hypot(c.x - J1c.x, c.z - J1c.z).toFixed(0)} m from J1`); }
console.log('rejected by:', JSON.stringify(rej), ' passed:', cand.length);
cand.sort((a, b) => a.relief + a.d / 150 - (b.relief + b.d / 150));
for (const c of cand.slice(0, 12)) console.log(`centre (${c.x}, ${c.z})  plot x ${c.x - W / 2}..${c.x + W / 2} z ${c.z - H / 2}..${c.z + H / 2}  relief ${c.relief.toFixed(1)} m  sd ${c.sd.toFixed(1)}  ${c.d.toFixed(0)} m from the old site  ${Math.hypot(c.x - J.x, c.z - J.z).toFixed(0)} m from J1`);
