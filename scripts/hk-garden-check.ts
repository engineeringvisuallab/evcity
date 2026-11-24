// STEP HK-10c check: the pond gardens (bigger ponds, promenade, flower border, 4 paths, 4 beds, trees, benches, lamps) in the two WEST loops.
// Run: HK=1 npx tsx scripts/hk-ring-run.ts hk-garden-check     (HK=0: nothing may exist)
import * as THREE from 'three';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { CityPlan } from '../src/city/CityPlan';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { GrassPlacer } from '../src/vegetation/GrassPlacement';
import { GRASS_STRIDE } from '../src/vegetation/TreeTypes';
import { HK_LOOPS } from '../src/roads/ring/HkRampData';
import { hkFrame, hkWorld } from '../src/roads/ring/HkRamps';
import { HK_GARDEN, HK_INFIELD_PONDS, hkGardenBenches, hkGardenLamps, hkGardenTrees, hkGardenZone, hkGardens, hkLawnAt, hkLawnStripe, inHkGarden } from '../src/roads/ring/HkInfieldData';
import { HkGardenLayer } from '../src/roads/ring/HkGardenLayer';

let fails = 0;
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(74)} ${detail}`); };
const f2 = (v: number): string => v.toFixed(2);
const gen = new TerrainGenerator(Config.world.seed);
const s = { h: 0, water: NaN, fx: 0, fz: 0 };

if (!Config.roads.hatikamrul.enabled) {
  const G = hkGardens()[0];
  check(hkGardenZone(G.x + G.shore + 1, G.z) === 0 && !inHkGarden(G.x, G.z), 'G0 switch OFF: no garden zone, no garden disc', '');
  const layer = new HkGardenLayer(new THREE.Group(), () => 0);
  check(layer.group.children.length === 0, 'G0b switch OFF: the layer is empty', '');
  console.log(`RESULT ${fails} FAIL`); process.exit(fails ? 1 : 0);
}
const f = hkFrame(gen.roads)!;
const G = hkGardens();
check(G.length === 2 && G.every((g, i) => g.pond === HK_INFIELD_PONDS[i].id), 'G1 two gardens, one per pond', G.map((g) => `${g.id} shore ${f2(g.shore)} edge ${f2(g.gr)}`).join(' | '));
let worstW = 0; for (const p of HK_INFIELD_PONDS) { const [wx, wz] = hkWorld(f, p.lx, p.ly); worstW = Math.max(worstW, Math.hypot(wx - p.x, wz - p.z)); }
check(worstW <= 0.1, 'G1b pond world x / z = its local design point', `worst ${f2(worstW)} m`);

for (const g of G) {
  const p = HK_INFIELD_PONDS[g.index];
  // clearance of the garden disc to the HK loop pavement and to every other road
  const L = HK_LOOPS.find((q) => q.id === p.loop)!;
  let nearLoop = Infinity; for (const [x, y] of L.pts) nearLoop = Math.min(nearLoop, Math.hypot(x - p.lx, y - p.ly));
  check(nearLoop - 4.2 - g.gr >= 4, `G2 ${g.id} garden edge is 4+ m from the loop pavement edge`, `${f2(nearLoop - 4.2 - g.gr)} m`);
  let nearRoad = Infinity, nid = '';
  for (const r of gen.roads.roads) { if (/^HK/.test(r.name ?? '')) continue; for (let i = 0; i < r.xs.length; i++) { const d = Math.hypot(r.xs[i] - g.x, r.zs[i] - g.z); if (d < nearRoad) { nearRoad = d; nid = r.name ?? String(r.id); } } }
  check(nearRoad - g.gr >= 6, `G2b ${g.id} garden edge is 6+ m from any road centreline (nearest ${nid})`, `${f2(nearRoad - g.gr)} m`);
  // zone areas by a 0.5 m scan
  const cnt: Record<number, number> = {}; const fl = new Set<number>();
  for (let dz = -g.gr; dz <= g.gr; dz += 0.5) for (let dx = -g.gr; dx <= g.gr; dx += 0.5) { const z = hkGardenZone(g.x + dx, g.z + dz); const k = z & 15; cnt[k] = (cnt[k] ?? 0) + 1; if (k === 4 || k === 3) fl.add(z >> 4); }
  const a = (k: number): number => Math.round((cnt[k] ?? 0) * 0.25);
  console.log(`  info  ${g.id}: lawn ${a(1)} m2, paved ${a(2)} m2, beds ${a(3)} m2, flower border ${a(4)} m2, flower kinds ${[...fl].sort().join(',')}`);
  check(a(4) > 800 && a(3) > 100 && a(2) > 300 && fl.size === 6, `G3 ${g.id} border + beds + paving exist, all 6 flowers used`, `${fl.size} flowers`);
  // the pond: water inside, none in the garden annulus; ground in the annulus
  let wetOut = 0, hMin = Infinity, hMax = -Infinity;
  for (let dz = -g.gr; dz <= g.gr; dz += 1) for (let dx = -g.gr; dx <= g.gr; dx += 1) { const d = Math.hypot(dx, dz); if (d < g.shore + 0.5 || d > g.gr) continue; gen.sample(g.x + dx, g.z + dz, s); if (!Number.isNaN(s.water) && s.h < s.water + 0.1) wetOut++; hMin = Math.min(hMin, s.h); hMax = Math.max(hMax, s.h); }
  console.log(`  info  ${g.id}: ground in the garden ring ${f2(hMin)} .. ${f2(hMax)} m (pond level ${p.level})`);
  check(wetOut === 0, `G4 ${g.id} no water in the garden ring (outside the shore)`, `${wetOut} wet samples`);
  check(hMin > p.level - 0.2, `G4b ${g.id} the ring ground is not below the pond level`, `min ${f2(hMin)} vs level ${p.level}`);
  check(hkLawnAt(g.x + g.gr - 1, g.z) === 1 && hkLawnStripe(g.x + g.gr - 1, g.z) === 0, `G5 ${g.id} lawn field = 1 in the garden, no stripe marker`, '');
}
// furniture and trees on the right ground
const zk = (x: number, z: number): number => hkGardenZone(x, z) & 15;
check(hkGardenBenches().length === 16 && hkGardenBenches().every((b) => zk(b.x, b.z) === 2), 'G6 16 benches, all on the paved promenade', `${hkGardenBenches().filter((b) => zk(b.x, b.z) === 2).length} on paving`);
check(hkGardenLamps().length === 24 && hkGardenLamps().every((l) => zk(l.x, l.z) === 2), 'G6b 24 lamps, all on the paved promenade', `${hkGardenLamps().filter((l) => zk(l.x, l.z) === 2).length} on paving`);
const tr = hkGardenTrees();
check(tr.length === 16 && tr.every((t) => zk(t.x, t.z) === 1), 'G6c 16 shade trees, all on the lawn ring (not on path / bed / border)', `${tr.filter((t) => zk(t.x, t.z) === 1).length} on lawn`);
check(tr.every((t) => { gen.sample(t.x, t.z, s); return Number.isNaN(s.water) || s.h >= s.water + 0.3; }), 'G6d no shade tree stands in water', '');

// grass placer: flowers
const plan = new CityPlan(gen.sites);
const trees = new TreePlacer(gen, plan, Config.world.seed);
const grass = new GrassPlacer(gen, plan, Config.world.seed, trees);
const Gt = Config.vegetation.grass; const HALF = Config.world.size / 2;
for (const g of G) {
  const tx0 = Math.floor((g.x - g.gr + HALF) / Gt.tile), tx1 = Math.floor((g.x + g.gr + HALF) / Gt.tile), tz0 = Math.floor((g.z - g.gr + HALF) / Gt.tile), tz1 = Math.floor((g.z + g.gr + HALF) / Gt.tile);
  let flowers = 0, badZone = 0, inPond = 0, lawnTufts = 0, onPaved = 0; const kinds = new Set<number>();
  for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
    const d = grass.place(tx, tz); const ox = tx * Gt.tile - HALF, oz = tz * Gt.tile - HALF;
    for (let o = 0; o + GRASS_STRIDE <= d.length; o += GRASS_STRIDE) {
      const x = ox + d[o], z = oz + d[o + 2], flag = d[o + 7];
      if (Math.hypot(x - g.x, z - g.z) > g.gr + 1) continue;
      gen.sample(x, z, s); if (!Number.isNaN(s.water) && s.h < s.water + 0.1) inPond++;
      const k = zk(x, z);
      if (flag > 8.5) { flowers++; kinds.add(Math.round(flag - 9)); if (k !== 3 && k !== 4) badZone++; }
      else if (flag > 1.5 && flag < 2.5) { lawnTufts++; if (k >= 2) onPaved++; }
    }
  }
  console.log(`  info  ${g.id}: flower tufts ${flowers} (kinds ${[...kinds].sort().join(',')}), lawn tufts ${lawnTufts}`);
  check(flowers > 6000 && kinds.size === 6, `G7 ${g.id} the flowers are planted (border + beds), all 6 kinds`, `${flowers} tufts`);
  check(badZone === 0, `G7b ${g.id} every flower tuft is in a border / bed zone`, `${badZone} stray`);
  check(onPaved === 0 && inPond === 0, `G7c ${g.id} no lawn tuft on paving / kerb / path, none in the water`, `paved ${onPaved}, pond ${inPond}`);
}
// mesh
const layer = new HkGardenLayer(new THREE.Group(), (x, z) => { gen.sample(x, z, s); return s.h; });
let tris = 0, bad = 0, far = 0;
layer.group.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; const pos = m.geometry.getAttribute('position'); tris += (m.geometry.index?.count ?? 0) / 3; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); if (!Number.isFinite(x + y + z)) bad++; if (!G.some((g) => Math.hypot(x - g.x, z - g.z) <= g.gr + 1.5)) far++; } });
check(layer.group.children.length === 5 && tris > 5000 && bad === 0 && far === 0, 'G8 mesh layer: 5 meshes, finite vertices, all inside the gardens', `${tris} triangles, ${bad} bad, ${far} outside`);
console.log(`RESULT ${fails} FAIL`); process.exit(fails ? 1 : 0);
