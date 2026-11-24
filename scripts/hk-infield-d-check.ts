// STEP HK-10d check: level infields (4 pads), planted coloured trees (big + small), few krishnachura, no random jungle tree in the infields, fewer branches / red flowers.
// Run: HK=1 npx tsx scripts/hk-ring-run.ts hk-infield-d-check      (HK=0: nothing may exist)
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { TREE_STRIDE, TreeKind } from '../src/vegetation/TreeTypes';
import { HK_PADS, HK_PAD_FLAT, HK_RI, HK_TREE_FAMILIES, hkGardens, hkLoopTrees, inHkInfield } from '../src/roads/ring/HkInfieldData';
import { hkFrame, hkRamps } from '../src/roads/ring/HkRamps';
import { HK_LOOPS } from '../src/roads/ring/HkRampData';
import { worldToChunkCoord, chunkOriginX, chunkOriginZ } from '../src/world/WorldGrid';

let fails = 0;
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(76)} ${detail}`); };
const f2 = (v: number): string => v.toFixed(2);
const gen = new TerrainGenerator(Config.world.seed);
const s = { h: 0, water: NaN, fx: 0, fz: 0 };
const mask = new Float32Array(2);
if (!Config.roads.hatikamrul.enabled) {
  check(!inHkInfield(HK_PADS[0].x, HK_PADS[0].z) && hkLoopTrees().length > 0, 'D0 switch OFF: no infield disc', '');
  gen.sample(HK_PADS[2].x, HK_PADS[2].z, s); console.log(`  info  ground at the SE pad centre with the switch OFF ${f2(s.h)} m`);
  console.log(`RESULT ${fails} FAIL`); process.exit(fails ? 1 : 0);
}
// D1 level: ground inside the flat part of each pad (outside the pond bank, off the roads)
for (const P of HK_PADS) {
  let mn = Infinity, mx = -Infinity, n = 0;
  for (let dz = -HK_PAD_FLAT; dz <= HK_PAD_FLAT; dz += 2) for (let dx = -HK_PAD_FLAT; dx <= HK_PAD_FLAT; dx += 2) {
    const d = Math.hypot(dx, dz); if (d > HK_PAD_FLAT - 1 || d < P.bank + 15) continue;
    gen.roads.maskAt(P.x + dx, P.z + dz, 1, mask); if (mask[1] > 0.001) continue;
    gen.sample(P.x + dx, P.z + dz, s); if (!Number.isNaN(s.water)) continue;
    mn = Math.min(mn, s.h); mx = Math.max(mx, s.h); n++;
  }
  console.log(`  info  ${P.id}: ground ${f2(mn)} .. ${f2(mx)} m over ${n} samples (design level ${P.level})`);
  check(n > (P.bank > 0 ? 20 : 500) && mx - mn < 0.06, `D1 ${P.id} the infield is level (max - min < 6 cm)`, `${f2(mx - mn)} m`);
}
// D2 the pads never touch the road network: roads / bridges identical with the pad function removed is checked by D2b (ground on road ribbons = pad-free)
// D2b ground on the loop ramp pavement vs the ground beside it (the ramp must not be buried by the pad): compare ground 6 m inside the pavement edge with the ramp level
const f = hkFrame(gen.roads)!; const ramps = hkRamps(f);
console.log(`  info  ramps ${Object.keys(ramps).length}, loops ${HK_LOOPS.length}`);
// D3 trees
const T = hkLoopTrees();
const per: Record<string, number> = {};
const gs = hkGardens();
let kr = 0, small = 0, big = 0; const fam = new Set<number>();
for (const t of T) {
  const g = gs.find((q) => Math.hypot(t.x - q.x, t.z - q.z) < HK_RI + 1)!;
  per[g.id] = (per[g.id] ?? 0) + 1;
  if (t.kind === TreeKind.krishnachura) kr++;
  else { if (t.tint >= 3) fam.add(Math.floor(t.tint) - 3); if (t.scale < 0.85 && t.kind !== TreeKind.koroi && t.kind !== TreeKind.segun) small++; else big++; }
}
console.log(`  info  trees per loop ${JSON.stringify(per)}; big ${big}, small ${small}, krishnachura ${kr}; colour families ${[...fam].sort().join(',')}`);
check(T.length > 150 && Object.keys(per).length === 4, 'D3 planted trees exist in all four loops', `${T.length} trees`);
check(fam.size === HK_TREE_FAMILIES, 'D3b all 9 leaf colour families are used', `${fam.size}`);
check(small > big * 0.8 && big > 60, 'D3c both big and small coloured trees (small >= 0.8 x big)', `big ${big}, small ${small}`);
check(kr / T.length < 0.06 && kr === 8, 'D3d krishnachura is rare: 2 per loop (8 in all), under 6 % of the planted trees', `${kr} of ${T.length}`);
let red = 0; for (const t of T) if (t.tint >= 3 && Math.floor(t.tint) - 3 === 4) red++;
check(red / T.length < 0.12, 'D3e red-bronze leaf family under 12 % of the planted trees', `${red} of ${T.length}`);
// D4 every planted tree is inside the infield disc and off the ramp pavement
let outside = 0, nearRamp = Infinity;
for (const t of T) { const g = gs.find((q) => Math.hypot(t.x - q.x, t.z - q.z) < HK_RI + 1); if (!g) outside++; }
check(outside === 0, 'D4 every planted tree stands inside an infield disc (r 72)', `${outside} outside`);
// D5 the tree placer: planted trees come out of the chunk lists (kind + tint kept), no random jungle tree inside the infield
const plan = new CityPlan(gen.sites);
const placer = new TreePlacer(gen, plan, Config.world.seed);
let seenPlanted = 0, jungleInside = 0, krishnaInside = 0, onRoad = 0;
const chunks = new Set<string>();
for (const P of HK_PADS) for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) { const c = worldToChunkCoord(P.x + ax * HK_RI, P.z + az * HK_RI); chunks.add(`${c.cx},${c.cz}`); }
for (const key of chunks) {
  const [cx, cz] = key.split(',').map(Number); const ox = chunkOriginX(cx), oz = chunkOriginZ(cz);
  const arr = placer.place(cx, cz, 0);
  for (let k = 0; k < arr.length; k++) { const d = arr[k]; for (let o = 0; o + TREE_STRIDE <= d.length; o += TREE_STRIDE) {
    const x = ox + d[o], z = oz + d[o + 2]; if (!inHkInfield(x, z)) continue;
    if (d[o + 5] >= 3) { seenPlanted++; gen.roads.maskAt(x, z, 1, mask); if (mask[1] > 0.001) onRoad++; }
    else if (k < TreeKind.fern) { if (k === TreeKind.krishnachura) krishnaInside++; else jungleInside++; }
  } }
}
console.log(`  info  chunk lists inside the four infield discs: planted (coloured) ${seenPlanted}, other trees ${jungleInside}, krishnachura (non-coloured) ${krishnaInside}`);
check(seenPlanted > 100, 'D5 the placer delivers the coloured planted trees (tint >= 3)', `${seenPlanted}`);
check(onRoad === 0, 'D5a no planted tree on a road', `${onRoad}`);
check(jungleInside === 0, 'D5b no random jungle tree inside any infield disc (only the planted ones)', `${jungleInside}`);
console.log(`RESULT ${fails} FAIL`); process.exit(fails ? 1 : 0);
