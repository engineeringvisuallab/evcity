// STEP HK-FIX5 check: the bridged stretches of the HK-CD / HK-SLIP roads get a deck solid (HkBridgeDecks.ts).
// Run: HK=1 npx tsx scripts/hk-ring-run.ts hk-bridge-deck-check      (HK=0: proves that the switch OFF builds nothing)
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { buildHkBridgeDecks, HKB } from '../src/roads/ring/HkBridgeDecks';

let fails = 0;
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(64)} ${detail}`); };
const gen = new TerrainGenerator(Config.world.seed);
const net = gen.roads;
const on = !!Config.roads.hatikamrul.enabled;
const d = buildHkBridgeDecks(net);
if (!on) { check(d.bridges === 0 && d.solid.indices.length === 0, 'switch OFF: no deck', `${d.bridges}`); process.exit(fails ? 1 : 0); }
const hkIds = new Set(net.roads.filter((r) => r.name.startsWith('HK-')).map((r) => r.id));
const hkBridges = net.bridges.filter((b) => hkIds.has(b.roadId));
check(d.bridges === hkBridges.length && d.bridges > 0, 'B1 one deck per HK bridge', `${d.bridges} decks / ${hkBridges.length} bridges`);
let fin = true; for (const v of d.solid.positions) if (!Number.isFinite(v)) fin = false;
check(fin && d.solid.indices.length > 0, 'B2 solid is finite and not empty', `${d.solid.indices.length / 3} triangles`);
// B3 every bridge centre point has a collision top face at level - topGap (vertical ray, Moller-Trumbore on the soup)
const P = d.solid.positions, I = d.solid.indices;
const hitY = (x: number, z: number, y0: number): number | null => {
  let best: number | null = null;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const x1 = P[b] - P[a], z1 = P[b + 2] - P[a + 2], x2 = P[c] - P[a], z2 = P[c + 2] - P[a + 2];
    const den = x1 * z2 - x2 * z1; if (Math.abs(den) < 1e-9) continue;
    const u = ((x - P[a]) * z2 - (z - P[a + 2]) * x2) / den, v = ((P[a + 2] - z) * x1 - (P[a] - x) * z1) / -den * -1;
    const vv = (x1 * (z - P[a + 2]) - z1 * (x - P[a])) / den;
    if (u < 0 || vv < 0 || u + vv > 1) continue;
    const y = P[a + 1] + u * (P[b + 1] - P[a + 1]) + vv * (P[c + 1] - P[a + 1]);
    if (y <= y0 + 0.01 && (best === null || y > best)) best = y; void v;
  }
  return best;
};
let miss = 0, n = 0, worst = 0;
for (const b of hkBridges) {
  const r = net.roads.find((q) => q.id === b.roadId)!;
  for (let k = b.i0 + 1; k < b.i1; k += 3) {
    n++; const y = hitY(r.xs[k], r.zs[k], r.ys[k] + 1);
    if (y === null) miss++; else worst = Math.max(worst, Math.abs(y - (r.ys[k] - HKB.topGap)));
  }
}
check(miss === 0 && worst < 0.05, 'B3 ray down onto every 3rd centre point hits the top face', `${n} rays, ${miss} miss, worst dy ${worst.toFixed(3)} m`);
console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
