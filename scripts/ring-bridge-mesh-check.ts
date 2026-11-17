// STEP 5.3c-1 check: the geometry of the ring structures (S1 cable-stayed + plain girders): finite numbers, valid indices, S1 mast / cables inside the span, mast is higher than the deck.
// Run: npx tsx scripts/ring-bridge-mesh-check.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { buildStructure, ringStructures, CS, NA, EX, BS } from '../src/roads/ring/RingBridgeGeometry';

let fails = 0;
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(60)} ${detail}`); };
const gen = new TerrainGenerator(Config.world.seed);
const net = gen.roads;
const st = ringStructures(net);
console.log(`structures: ${st.length}`);
st.forEach((b, k) => {
  const d = buildStructure(net, b, k);
  const nv = d.positions.length / 3;
  const finite = d.positions.every(Number.isFinite) && d.colors.every(Number.isFinite);
  const okIdx = d.indices.every((i) => i >= 0 && i < nv);
  let ymin = Infinity, ymax = -Infinity;
  for (let i = 1; i < d.positions.length; i += 3) { ymin = Math.min(ymin, d.positions[i]); ymax = Math.max(ymax, d.positions[i]); }
  const r = net.roads[b.roadId];
  const deckY = Math.max(...Array.from({ length: b.i1 - b.i0 + 1 }, (_, q) => r.ys[b.i0 + q]));
  if (k >= 4) {
    const colsBottomOk = ymin < Math.min(...Array.from({ length: b.i1 - b.i0 + 1 }, (_, q) => r.hNat[b.i0 + q]));
    check(colsBottomOk && ymax - deckY < 1.3, `S${k + 1} piers reach below the ground, nothing above the parapet`, `lowest ${ymin.toFixed(1)}, top ${(ymax - deckY).toFixed(1)} m over highest deck point`);
  }
  check(finite && okIdx && d.indices.length % 3 === 0, `S${k + 1} mesh valid`, `${nv} verts, ${d.indices.length / 3} tris`);
  if (k === 0) check(ymax >= deckY + CS.mastH - 8, 'S1 mast rises above the deck', `top ${(ymax - deckY).toFixed(1)} m over highest deck point`);
  if (k === 1) check(ymax - deckY >= 0.8 * NA.rise * 40 && ymax - deckY < 12, 'S2 arch rises over the deck', `top ${(ymax - deckY).toFixed(1)} m over highest deck point`);
  if (k === 2) check(ymax - deckY >= EX.pylonH - 1 && ymax - deckY < EX.pylonH + 2, 'S3 pylon height over the deck', `top ${(ymax - deckY).toFixed(1)} m over highest deck point`);
  if (k === 3) check(ymax - deckY >= 0.8 * BS.rise * 56 && ymax - deckY < 14, 'S4 top chord rises over the deck', `top ${(ymax - deckY).toFixed(1)} m over highest deck point`);
});
console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
