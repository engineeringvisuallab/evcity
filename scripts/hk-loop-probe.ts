import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { hkFrame, hkRamps } from '../src/roads/ring/HkRamps';
import { HK_LOOPS } from '../src/roads/ring/HkRampData';
import { HK_INFIELD_PONDS, HK_INFIELD_LAWNS } from '../src/roads/ring/HkInfieldData';
const gen = new TerrainGenerator(Config.world.seed);
const s = { h: 0, water: NaN, fx: 0, fz: 0 };
const centres = [...HK_INFIELD_PONDS.map(p => ({ id: p.id, x: p.x, z: p.z })), ...HK_INFIELD_LAWNS.map(p => ({ id: p.id, x: p.x, z: p.z }))];
const f = hkFrame(gen.roads)!; const ramps = hkRamps(f);
console.log(Object.keys(ramps), HK_LOOPS.length);
for (const c of centres) {
  let out = c.id + ':';
  for (const r of [0, 20, 40, 55, 65, 75, 85]) { let mn = 1e9, mx = -1e9; for (let a = 0; a < 16; a++) { const x = c.x + Math.cos(a * Math.PI / 8) * r, z = c.z + Math.sin(a * Math.PI / 8) * r; gen.sample(x, z, s); mn = Math.min(mn, s.h); mx = Math.max(mx, s.h); } out += ` r${r}[${mn.toFixed(1)}..${mx.toFixed(1)}]`; }
  console.log(out);
}
