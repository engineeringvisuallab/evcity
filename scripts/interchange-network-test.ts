// Step 2b: interchanges inside the real RoadNetwork. Run: npx tsx scripts/interchange-network-test.ts   (builds the world 3 times, ~30 s)
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { RoadGraph } from '../src/traffic/RoadGraph';

let fails = 0;
const ok = (c: boolean, msg: string): void => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!c) fails++;
};
const sig = (g: TerrainGenerator): string => {
  const R = g.roads;
  let h = 0;
  for (const r of R.roads) for (let i = 0; i < r.xs.length; i += 7) h = (h * 31 + Math.round(r.xs[i] * 10) + Math.round(r.ys[i] * 10) * 3) % 1_000_000_007;
  return `${R.roads.length}/${R.segmentCount}/${R.pads.length}/${h}`;
};

// 1. flag OFF (the default): nothing changes
ok(Config.roads.interchange.enabled === false && Config.roads.interchange.list.length === 0, 'default: flag off, list empty');
const base = new TerrainGenerator(Config.world.seed);
const baseSig = sig(base);
ok(base.roads.interchanges.length === 0 && base.roads.roads.every((r) => r.kind !== 'ramp'), 'flag off: no ramp road, no interchange model');

// 2. flag ON: a cloverleaf in the middle of the longest highway
const hw = base.roads.roads.filter((r) => r.kind === 'highway' && !r.earth).sort((a, b) => b.length - a.length)[0];
const k = Math.floor(hw.xs.length / 2);
const yaw = Math.atan2(hw.zs[k + 1] - hw.zs[k - 1], hw.xs[k + 1] - hw.xs[k - 1]);
Config.roads.interchange.enabled = true;
Config.roads.interchange.list.push({ id: 'T1', pattern: 'cloverleaf', x: hw.xs[k], z: hw.zs[k], yaw, main: 'highway', cross: 'avenue' });
const a = new TerrainGenerator(Config.world.seed);
const ramps = a.roads.roads.filter((r) => r.kind === 'ramp');
ok(a.roads.interchanges.length === 1, 'flag on: 1 interchange model');
ok(ramps.length === 8 && a.roads.roads.length === base.roads.roads.length + 8, `flag on: 8 ramp roads added (${ramps.length}); the old roads are untouched`);
const old = base.roads.roads.every((r, i) => {
  const q = a.roads.roads[i];
  return q.kind === r.kind && q.xs.length === r.xs.length && q.ys.every((y, j) => y === r.ys[j]);
});
ok(old, 'every old road has exactly the same points and heights');
const model = a.roads.interchanges[0];
const exact = ramps.every((r, i) => r.ys.every((y, j) => Math.abs(y - model.ramps[i].ys[j]) < 1e-9));
ok(exact, 'ramp surface heights are exactly the level plan (no smoothing)');
ok(ramps.every((r) => r.hNat.every((h) => Number.isFinite(h)) && r.length > 80 && r.name.startsWith('T1:')), 'ramps: finite ground heights, names T1:...');
ok(a.roads.segmentCount > base.roads.segmentCount + 8 * 15, `segments grew (${base.roads.segmentCount} -> ${a.roads.segmentCount})`);
ok(a.roads.pads.length === base.roads.pads.length, 'junction pads unchanged (ramps are added after the pads)');


// 2c. STEP 3D-A: the high stretches of the ramps are bridges (dry viaducts), the rest is an embankment
{
  const nb0 = base.roads.bridges.length;
  const rampIds = new Set(ramps.map((r) => r.id));
  const mine = a.roads.bridges.filter((b) => rampIds.has(b.roadId));
  console.log(`      ${mine.length} ramp bridges, ${model.ramps.map((r) => r.elevated.length).join(',')} elevated ranges per ramp`);
  ok(a.roads.bridges.length === nb0 + mine.length && base.roads.bridges.every((b, i) => a.roads.bridges[i].roadId === b.roadId && a.roads.bridges[i].i0 === b.i0), 'old bridges untouched, new bridges come after them');
  ok(mine.length >= 4, `cloverleaf: ${mine.length} ramp bridges (the loops stand high)`);
  const sane = mine.every((b) => {
    const r = a.roads.roads[b.roadId];
    let all = true;
    for (let k = b.i0; k <= b.i1; k++) if (r.bridgeOf[k] !== b.id) all = false;
    return all && b.i1 - b.i0 >= 4 && b.spanM >= 8 && b.lengthM > b.spanM && b.deckHalfWidth > r.halfWidth && b.clearanceM >= 0 && Number.isFinite(b.centerX) && b.maxSpanM === 25;
  });
  ok(sane, 'every ramp bridge: bridgeOf set on all its points, span / length / deck width / clearance sane');
  const highOutside = ramps.every((r) => r.ys.every((y, i) => y - r.hNat[i] <= 3.3 || r.bridgeOf[i] >= 0));
  ok(highOutside, 'no ramp point higher than ~3 m over the ground is left as an earth embankment (all of them are on a bridge)');
  ok(a.roads.stats.bridges === a.roads.bridges.length, 'stats.bridges counts them');
  // the ground under the deck is LEFT ALONE: the terrain at the middle of every ramp bridge stays well below the slab (no earth dam), the deck itself is at the ramp height
  let worstGap = Infinity;
  let deckOff = 0;
  for (const b of mine) {
    const r = a.roads.roads[b.roadId];
    for (let k = b.i0 + 3; k <= b.i1 - 3; k++) {
      worstGap = Math.min(worstGap, r.ys[k] - a.heightAt(r.xs[k], r.zs[k]));
      deckOff = Math.max(deckOff, Math.abs(r.ys[k] - model.ramps[ramps.indexOf(r)].ys[k]));
    }
  }
  ok(worstGap > 2.0, `ground under every ramp bridge deck stays >= 2 m below the slab (worst ${worstGap.toFixed(2)} m): no earth dam`);
  ok(deckOff < 1e-9, 'deck height = level plan height');
}

// 3. the AI does not spawn on ramps yet
const gb = new RoadGraph(base.roads);
const ga = new RoadGraph(a.roads);
ok(Math.abs(ga.totalLength - gb.totalLength) < 1e-6, 'RoadGraph: spawn length unchanged (no AI on ramps yet)');
let onRamp = 0;
for (let i = 0; i < 3000; i++) if (a.roads.roads[ga.randomSpot(() => Math.random()).roadId].kind === 'ramp') onRamp++;
ok(onRamp === 0, 'RoadGraph.randomSpot never picks a ramp (3000 tries)');

// 4. deterministic (main thread == worker)
const b = new TerrainGenerator(Config.world.seed);
ok(sig(a) === sig(b), 'deterministic: two builds give the same network');

// 5. a wrong entry (unknown pattern) is skipped with a warning, the good one still builds, the world still builds
Config.roads.interchange.list.unshift({ id: 'BAD', pattern: 'no-such-pattern', x: hw.xs[k] + 900, z: hw.zs[k], yaw, main: 'highway', cross: 'avenue' });
const warnOrig = console.warn;
let warned = '';
console.warn = (m: unknown): void => {
  warned += String(m);
};
const c = new TerrainGenerator(Config.world.seed);
console.warn = warnOrig;
ok(warned.includes('[interchange BAD] skipped'), 'unknown pattern: warning, no crash');
ok(c.roads.interchanges.length === 1 && c.roads.roads.filter((r) => r.kind === 'ramp').length === 8, 'unknown pattern: the good interchange (T1) is still built');

console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAILED`);
console.log('baseline', baseSig);
process.exit(fails === 0 ? 0 : 1);
