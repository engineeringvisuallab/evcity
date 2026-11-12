// J6 survey: pad id 6 position, arms, road classes, lanes, terrain, nearby water/bridges. Run: npx tsx scripts/j6-survey.ts
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';

const g = new TerrainGenerator(Config.world.seed);
const R = g.roads;
const pad = R.pads.find((p) => p.id === 6);
if (!pad) { console.log('pad 6 not found; ids:', R.pads.map((p) => p.id).join(',')); process.exit(1); }
console.log('J6 pad', { x: pad.x, z: pad.z, y: pad.y, a: pad.a, b: pad.b, rCore: pad.rCore });
const near = R.roads.filter((r) => { for (let i = 0; i < r.xs.length; i++) if (Math.hypot(r.xs[i] - pad.x, r.zs[i] - pad.z) < 260) return true; return false; });
for (const r of near) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < r.xs.length; i++) { const d = Math.hypot(r.xs[i] - pad.x, r.zs[i] - pad.z); if (d < bd) { bd = d; best = i; } }
  console.log(`road ${r.id} kind=${r.kind} name=${r.name} halfW=${r.halfWidth} nearestIdx=${best} dist=${bd.toFixed(1)} ys=${r.ys[best].toFixed(2)} pts=${r.xs.length}`);
}
const br = R.bridges.filter((b) => Math.hypot(b.centerX - pad.x, (b as any).centerZ - pad.z) < 400);
console.log('bridges within 400 m:', br.map((b) => ({ id: b.id, roadId: b.roadId, span: b.spanM, len: b.lengthM, clr: b.clearanceM })));
