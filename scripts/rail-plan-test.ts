// Stage 11B check: station areas are on flat dry ground, every line connects its two stations, curves and grades are railway-like,
// tunnels / bridges / road crossings are listed, every crossing is grade-separated.
// Optional: npx tsx scripts/rail-plan-test.ts out.json  -> dumps the network for a preview picture.
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RailNetwork } from '../src/rail/RailNetwork';
import { LINES, STATIONS, RAIL_DESIGN } from '../src/rail/RailPlan';
import { bn } from '../src/i18n/bn';

let bad = 0;
const fail = (m: string) => { bad++; console.log('FAIL', m); };
let t0 = Date.now();
const gen = new TerrainGenerator(Config.world.seed);
console.log(`terrain+roads ${Date.now() - t0} ms`);
t0 = Date.now();
const rail = new RailNetwork(gen);
console.log(`rail network ${Date.now() - t0} ms, ${rail.lengthKm.toFixed(1)} km of track, ${rail.crossings.length} road crossings`);

console.log('\nstation               kind       x      z   r   ground  spread');
for (const s of rail.stations) {
  console.log(`${s.id.padEnd(20)} ${s.kind.padEnd(9)} ${s.x.toFixed(0).padStart(6)} ${s.z.toFixed(0).padStart(6)} ${String(s.radius).padStart(4)} ${s.y.toFixed(1).padStart(7)} ${s.spread.toFixed(1).padStart(6)}`);
  if (!bn.rail.station[s.id]) fail(`no Bangla name for station ${s.id}`);
  if (s.spread > 32) fail(`${s.id}: station ground is rough (${s.spread.toFixed(1)} m spread)`);
}
for (const p of STATIONS) if (!rail.stationById(p.id)) fail(`station ${p.id} missing`);

console.log('\nline             length  minR   maxGrade  wet%  tunnels  bridges (m)');
for (const e of rail.edges) {
  const tun = e.segments.filter((s) => s.kind === 'tunnel').reduce((a, s) => a + s.s1 - s.s0, 0);
  const brg = e.segments.filter((s) => s.kind === 'bridge').reduce((a, s) => a + s.s1 - s.s0, 0);
  console.log(`${e.id.padEnd(16)} ${(e.length / 1000).toFixed(2).padStart(5)}km ${e.minRadius.toFixed(0).padStart(5)}  ${(e.maxGrade * 100).toFixed(2).padStart(6)}%  ${(e.wetShare * 100).toFixed(1).padStart(4)}  ${tun.toFixed(0).padStart(6)}  ${brg.toFixed(0).padStart(6)}`);
  if (!bn.rail.line[e.id]) fail(`no Bangla name for line ${e.id}`);
  const a = rail.stationById(e.from)!, b = rail.stationById(e.to)!;
  if (Math.hypot(e.xs[0] - a.x, e.zs[0] - a.z) > 5) fail(`${e.id}: does not start at ${e.from}`);
  const n = e.xs.length - 1;
  if (Math.hypot(e.xs[n] - b.x, e.zs[n] - b.z) > 5) fail(`${e.id}: does not end at ${e.to}`);
  if (e.minRadius < RAIL_DESIGN.minRadius * 0.6) fail(`${e.id}: curve too tight (${e.minRadius.toFixed(0)} m)`);
  if (e.maxGrade > RAIL_DESIGN.maxGrade + 1e-4) fail(`${e.id}: grade ${(e.maxGrade * 100).toFixed(2)}% above the limit`);
  if (e.wetShare > 0.12) fail(`${e.id}: ${(e.wetShare * 100).toFixed(0)}% of the line is over water`);
  if (e.length > Math.hypot(a.x - b.x, a.z - b.z) * 1.9) fail(`${e.id}: path is very winding (${(e.length / Math.hypot(a.x - b.x, a.z - b.z)).toFixed(2)}x)`);
}
for (const l of LINES) if (!rail.edges.find((e) => e.id === l.id)) fail(`line ${l.id} missing`);

const by: Record<string, number> = {};
for (const c of rail.crossings) by[c.kind] = (by[c.kind] ?? 0) + 1;
console.log('\nroad crossings by resolution:', by);
const byTier: Record<string, number> = {};
for (const c of rail.crossings) byTier[`tier${c.roadTier}`] = (byTier[`tier${c.roadTier}`] ?? 0) + 1;
console.log('road crossings by road tier:', byTier);
if (!rail.crossings.every((c) => ['road-over-rail', 'rail-over-road', 'rail-tunnel', 'rail-under-bridge'].includes(c.kind))) fail('a crossing is not grade-separated');

console.log(bad ? `\n${bad} FAILURES` : '\nALL OK');
if (process.argv[2]) {
  writeFileSync(process.argv[2], JSON.stringify({
    stations: rail.stations,
    edges: rail.edges.map((e) => ({ id: e.id, pts: Array.from(e.xs, (x, i) => [Math.round(x), Math.round(e.zs[i])]), seg: e.segments })),
    crossings: rail.crossings,
  }));
}
process.exit(bad ? 1 : 0);
