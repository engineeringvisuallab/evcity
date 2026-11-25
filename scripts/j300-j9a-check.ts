// J9-a CHECK (headless): the old R6-9 / R4-9 stub removal. Run: npx tsx scripts/j300-j9a-check.ts docs   Writes docs/J300_J9A.txt.
// Builds the real road network twice in two child runs (switch OFF and ON) and compares. PASS / FAIL on every line, NOT RUN is printed.
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { J300_ARMS } from '../src/roads/junction/J300Geometry';
import { ROAD_STATION_SITES } from '../src/parking/RoadStationSites';

const mode = process.argv[2];
if (mode === 'ON' || mode === 'OFF') {
  Config.roads.junctionJ300.enabled = mode === 'ON';
  const g: any = new TerrainGenerator(Config.world.seed);
  const roads = (g.roads.roads as any[]).map((r: any) => ({ name: r.name, n: r.xs.length, x0: r.xs[0], z0: r.zs[0], y0: r.ys[0], x1: r.xs[r.xs.length - 1], z1: r.zs[r.xs.length - 1], y1: r.ys[r.xs.length - 1] }));
  console.log('JSON' + JSON.stringify(roads)); process.exit(0);
}
const dir = process.argv[2] ?? 'docs'; const out: string[] = []; const P = (s = ''): void => { out.push(s); console.log(s); }; let fails = 0;
const CHK = (t: string, ok: boolean, n = ''): void => { if (!ok) fails++; P(`${ok ? 'PASS' : 'FAIL'}  ${t}  ${n}`); };
const run = (m: string): any[] => { const o = execFileSync('npx', ['tsx', 'scripts/j300-j9a-check.ts', m], { encoding: 'utf8', maxBuffer: 1 << 28 }); const l = o.split('\n').find((q) => q.startsWith('JSON')); return JSON.parse((l ?? 'JSON[]').slice(4)); };
P('J9-a CHECK (headless, real road network, switch OFF vs ON)');
const off = run('OFF'), on = run('ON'); const byOff = new Map(off.map((r) => [r.name, r])); const byOn = new Map(on.map((r) => [r.name, r]));
CHK('switch OFF: R6-9 and R4-9 exist (shipped state unchanged)', byOff.has('R6-9') && byOff.has('R4-9'), `${off.length} roads`);
CHK('switch ON: old R6-9 is gone', !byOn.has('R6-9'));
const r4 = byOn.get('R4-9'), r4o = byOff.get('R4-9');
CHK('switch ON: R4-9 still exists but is shorter', !!r4 && r4o && r4.n < r4o.n, `${r4o?.n} -> ${r4?.n} samples`);
const J = J300_ARMS.R4.end; const dEnd = r4 ? Math.hypot(r4.x1 - J.x, r4.z1 - J.z) : 1e9;
CHK('R4-9 now ends within 6 m of the R4 arm end (the join)', dEnd <= 6, `${dEnd.toFixed(2)} m`);
CHK('R4-9 level at the join within 0.1 m of the R4 arm end level (no step at the join)', !!r4 && Math.abs(r4.y1 - (J300_ARMS.R4 as any).yEnd) <= 0.1, `road ${r4?.y1?.toFixed(2)} vs arm ${(J300_ARMS.R4 as any).yEnd}`);
CHK('R4-9 far end unchanged', !!r4 && !!r4o && Math.hypot(r4.x0 - r4o.x0, r4.z0 - r4o.z0) < 0.01);
const others = off.filter((r) => r.name !== 'R6-9' && r.name !== 'R4-9' && r.name !== 'R4-4'/* J10: R4-4 is cut at the R6 arm edge on purpose */); const same = others.every((r) => { const q = byOn.get(r.name); return q && q.n === r.n && Math.hypot(q.x0 - r.x0, q.z0 - r.z0) < 0.01; });
CHK('every other road is identical (same name, samples, start)', same && on.length === off.length - 1, `${others.length} roads compared`);
// charge / fuel sites and signs that sat on the removed stretch
const gone = (s: any): boolean => (s.road === 'R6-9') || (s.road === 'R4-9' && s.x < -1396 && s.z > -2124);
const lost = (ROAD_STATION_SITES as any[]).filter(gone); P(`INFO  road station sites that belonged to a removed stretch: ${lost.length ? lost.map((s) => `${s.id} (${s.x}, ${s.z})`).join(', ') : 'none'}  (J9-d decides: move or hide; NOT changed here)`);
P('NOT RUN: terrain carve (J9-b), ring through the box + rail piers (J9-c), minimap / collision (J9-d), in-game look, traffic graph (J10: R6 / R4 arms are not drivable by AI yet).');
P(''); P(`${fails} FAIL`); writeFileSync(`${dir}/J300_J9A.txt`, out.join('\n') + '\n');
