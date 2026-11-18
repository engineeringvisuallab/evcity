// STEP B7-6 PRE-CHECK (water first, R8): natural ground wet under the fitted centreline of all L candidates, BEFORE any export. Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/b7-l-water-pre.ts
import { readFileSync } from 'fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample();
const FX = JSON.parse(readFileSync('docs/fit_chain/centre_fixed.json', 'utf8'));
const ids = Array.from({ length: 31 }, (_, i) => 'L-' + (i + 1));
for (const id of ids) {
  const l = FX.lines.find((q: any) => q.id === id); if (!l) { console.log(id, 'missing'); continue; }
  let len = 0, wet = 0, n = 0, minH = 1e9;
  for (let i = 1; i < l.pts.length; i++) {
    const a = l.pts[i - 1], b = l.pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]); len += d;
    const k = Math.max(1, Math.ceil(d / 5));
    for (let q = 0; q < k; q++) { const x = a[0] + (b[0] - a[0]) * q / k, z = a[1] + (b[1] - a[1]) * q / k; gen.sample(x, z, sc); n++; minH = Math.min(minH, sc.h); if (!Number.isNaN(sc.water) && sc.water > sc.h) wet++; }
  }
  console.log(`${id.padEnd(6)} len ${len.toFixed(0).padStart(5)} m  samples ${String(n).padStart(4)}  wet ${wet}  min natural ground ${minH.toFixed(2)} m`);
}
