// STEP HK-10b check: striped lawns in the two EAST loops (HK-SE, HK-NE): game's own city lawn (CityGreen field + mown tufts) + a light / dark ring marker in the tuft's 6th float.
// Run: HK=1 npx tsx scripts/hk-ring-run.ts hk-lawn-check     (HK=0: switch OFF, nothing of the lawns may exist)
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { CityPlan } from '../src/city/CityPlan';
import { getCityGreen, buildCityMask } from '../src/city/CityGreen';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { GrassPlacer } from '../src/vegetation/GrassPlacement';
import { GRASS_STRIDE } from '../src/vegetation/TreeTypes';
import { hkFrame, hkWorld } from '../src/roads/ring/HkRamps';
import { HK_INFIELD_LAWNS, HK_INFIELD_PONDS, hkGardens, HK_LAWN_FADE, HK_LAWN_STRIPE_W, hkLawnAt, hkLawnStripe, hkLawnTouches } from '../src/roads/ring/HkInfieldData';
import { worldToChunkCoord } from '../src/world/WorldGrid';

let fails = 0;
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(72)} ${detail}`); };
const f2 = (v: number): string => v.toFixed(2);
const gen = new TerrainGenerator(Config.world.seed);
const plan = new CityPlan(gen.sites);
const green = getCityGreen(gen);
const G = Config.vegetation.grass;
const HALF = Config.world.size / 2;

if (!Config.roads.hatikamrul.enabled) {
  const L = HK_INFIELD_LAWNS[0];
  check(hkLawnAt(L.x, L.z) === 0 && hkLawnStripe(L.x, L.z) === 0 && !hkLawnTouches(L.x - 5, L.z - 5, L.x + 5, L.z + 5), 'L0 switch OFF: no lawn field, no stripe, no chunk touch', '');
  check(green.at(L.x, L.z) < 1 || gen.sites.some((s) => Math.hypot(s.x - L.x, s.z - L.z) < 1), 'L0b switch OFF: CityGreen at the lawn centre is the old value', `${f2(green.at(L.x, L.z))}`);
  console.log(`RESULT ${fails} FAIL`); process.exit(fails ? 1 : 0);
}
const f = hkFrame(gen.roads)!;
check(HK_INFIELD_LAWNS.length === 4, 'L1 four lawns (HK-SE, HK-NE, HK-NW, HK-SW; HK-10d)', `${HK_INFIELD_LAWNS.length}`);
let worstW = 0;
for (const L of HK_INFIELD_LAWNS) { const [wx, wz] = hkWorld(f, L.lx, L.ly); worstW = Math.max(worstW, Math.hypot(wx - L.x, wz - L.z)); }
check(worstW <= 0.1, 'L1b lawn world x / z = its local design point on the real frame', `worst ${f2(worstW)} m`);

// field + stripes
const L0 = HK_INFIELD_LAWNS[0];
check(hkLawnAt(L0.x, L0.z) === 1 && green.at(L0.x, L0.z) === 1, 'L2 lawn centre = 1 in the lawn field AND in CityGreen', '');
check(hkLawnAt(L0.x + L0.r + HK_LAWN_FADE + 0.5, L0.z) === 0, 'L2b 0 beyond the fade', '');
let mono = true, prev = 2;
for (let d = L0.r - 1; d <= L0.r + HK_LAWN_FADE + 1; d += 0.25) { const v = hkLawnAt(L0.x + d, L0.z); if (v > prev + 1e-9) mono = false; prev = v; }
check(mono, 'L2c the fade falls monotonically from 1 to 0', '');
let stripeOk = true; const seen = new Set<number>();
const gr0 = hkGardens().find((q) => Math.hypot(q.x - L0.x, q.z - L0.z) < 1)!.gr; // HK-10d: stripes only outside the garden disc
for (let k = 0; k * HK_LAWN_STRIPE_W < L0.r - gr0 - HK_LAWN_STRIPE_W; k++) { const d = L0.r - (k + 0.5) * HK_LAWN_STRIPE_W; const s = hkLawnStripe(L0.x + d, L0.z); seen.add(s); if (s !== (k % 2 === 0 ? 1 : -1)) stripeOk = false; }
check(stripeOk && seen.has(1) && seen.has(-1), 'L3 rings alternate light / dark every stripe width, outermost ring light', `${Math.ceil((L0.r - gr0) / HK_LAWN_STRIPE_W)} rings outside the garden`);
check(hkLawnStripe(L0.x + gr0 - 1, L0.z) === 0, 'L3c no stripe inside the garden disc (HK-10d)', '');
check(hkLawnStripe(L0.x + L0.r + 1, L0.z) === 0, 'L3b no stripe outside the disc', '');

// clearance to the loop pavement, other roads, ponds
for (const L of HK_INFIELD_LAWNS) {
  let nearLoop = Infinity, inside = 0, nearOther = Infinity; const ids = new Set<string>();
  for (const r of gen.roads.roads) for (let i = 0; i < r.xs.length; i++) {
    const d = Math.hypot(r.xs[i] - L.x, r.zs[i] - L.z);
    if (/HK|hk/.test(r.name ?? '') || /HK|hk/.test(String(r.id))) nearLoop = Math.min(nearLoop, d - L.r); else nearOther = Math.min(nearOther, d - L.r);
    if (d < L.r) { inside++; ids.add(`${r.id}`); }
  }
  console.log(`  info  ${L.id}: road centreline points inside the disc ${inside} (roads ${[...ids].slice(0, 8).join(', ') || '-'}); nearest HK road ${f2(nearLoop)} m, other road ${f2(nearOther)} m outside the edge`);
  check(inside === 0, `L4 ${L.id} no road centreline runs through the lawn disc`, `${inside} points`);
  for (const p of HK_INFIELD_PONDS) if (!L.loop.endsWith('W')) check(Math.hypot(p.x - L.x, p.z - L.z) > L.r + p.R + 10, `L4b ${L.id} does not overlap pond ${p.id}`, ''); // HK-10d: a west lawn holds its own pond on purpose
  // ground: water and slope inside
  const s = { h: 0, water: NaN, fx: 0, fz: 0 }; let wet = 0, hMin = Infinity, hMax = -Infinity;
  for (let dz = -L.r; dz <= L.r; dz += 2) for (let dx = -L.r; dx <= L.r; dx += 2) { if (Math.hypot(dx, dz) > L.r || (L.loop.endsWith('W') && Math.hypot(dx, dz) < 50)) continue; gen.sample(L.x + dx, L.z + dz, s); // HK-10d: west lawns: the pond + bank (inside 50 m) is water on purpose
 if (!Number.isNaN(s.water) && s.h < s.water + 0.3) wet++; hMin = Math.min(hMin, s.h); hMax = Math.max(hMax, s.h); }
  console.log(`  info  ${L.id}: ground ${f2(hMin)} .. ${f2(hMax)} m, wet samples ${wet}`);
  check(wet === 0, `L4c ${L.id} no water inside the lawn disc`, `${wet} wet samples`);
}

// grass tufts of the tiles over each lawn
const trees = new TreePlacer(gen, plan, Config.world.seed);
const grass = new GrassPlacer(gen, plan, Config.world.seed, trees);
const mask = new Float32Array(2);
for (const L of HK_INFIELD_LAWNS) {
  const tx0 = Math.floor((L.x - L.r - 20 + HALF) / G.tile), tx1 = Math.floor((L.x + L.r + 20 + HALF) / G.tile);
  const tz0 = Math.floor((L.z - L.r - 20 + HALF) / G.tile), tz1 = Math.floor((L.z + L.r + 20 + HALF) / G.tile);
  let light = 0, dark = 0, plain = 0, outsideMarked = 0, onRoad = 0, wrongFlag = 0, lawnOnly = 0;
  for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
    const d = grass.place(tx, tz); const ox = tx * G.tile - HALF, oz = tz * G.tile - HALF;
    for (let o = 0; o + GRASS_STRIDE <= d.length; o += GRASS_STRIDE) {
      const x = ox + d[o], z = oz + d[o + 2]; const m = d[o + 5]; const flag = d[o + 7];
      const inDisc = Math.hypot(x - L.x, z - L.z) <= L.r && !hkGardens().some((q) => Math.hypot(x - q.x, z - q.z) < q.gr + 1.5); // HK-10d: the garden discs (flower tufts, no stripes) are not counted here
      const marked = m > 1.5;
      if (marked && !inDisc && !HK_INFIELD_LAWNS.some((q) => Math.hypot(x - q.x, z - q.z) <= q.r)) outsideMarked++; // HK-10d: another lawn's disc is not 'outside'
      if (inDisc) { gen.roads.maskAt(x, z, 1, mask); if (mask[1] > 0.01) onRoad++; if (flag < 1.5 || flag > 2.5) wrongFlag++; else lawnOnly++; if (m > 2) light++; else if (m > 1.5) dark++; else plain++; }
    }
  }
  console.log(`  info  ${L.id}: tufts in the disc: light ${light}, dark ${dark}, unmarked ${plain}`);
  const stripeRoom = L.r - (hkGardens().find((q) => Math.hypot(q.x - L.x, q.z - L.z) < 1)?.gr ?? 0) >= 12; // HK-10d: a narrow lawn ring (NW) holds one stripe only
  if (stripeRoom) check(light > 200 && dark > 200, `L5 ${L.id} both light and dark ring tufts exist`, `${light} / ${dark}`);
  if (stripeRoom) check(Math.abs(light - dark) < 0.45 * (light + dark), `L5b ${L.id} light / dark share is balanced (rings of equal width)`, `${f2(light / Math.max(1, dark))}`);
  check(outsideMarked === 0, `L5c ${L.id} no ring marker outside the disc`, `${outsideMarked}`);
  check(onRoad === 0, `L5d ${L.id} no tuft on a road ribbon inside the disc`, `${onRoad}`);
  check(wrongFlag === 0, `L5e ${L.id} every disc tuft is a mown city-lawn tuft (flag 2)`, `${wrongFlag} others of ${lawnOnly + wrongFlag}`);
  check(plain === 0, `L5f ${L.id} no unmarked tuft in the disc (every tuft is on a ring)`, `${plain}`);
  // chunk mask for the terrain shader
  const { cx, cz } = worldToChunkCoord(L.x, L.z); const n = 8; const vn = n + 1; const total = vn * vn + 4 * vn;
  const cm = buildCityMask(gen, cx, cz, n, total);
  check(cm !== null && cm.some((v) => v >= Config.terrain.cityGreen.amount - 1e-6), `L6 ${L.id} terrain chunk mask reaches the full city amount inside the lawn`, cm ? `max ${f2(Math.max(...cm))} of amount ${Config.terrain.cityGreen.amount}` : 'null');
}
console.log(`RESULT ${fails} FAIL`); process.exit(fails ? 1 : 0);
