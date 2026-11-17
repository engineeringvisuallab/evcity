// STEP 5.1 check (CP5.1): the ring comes out of the RoadNetwork facade (roads, bridges, pads, surfaceAt, stats). Run: npx tsx scripts/ring-facade-check.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { planRing } from '../src/roads/ring/RingRoad';

let fails = 0;
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(62)} ${detail}`); };
const t0 = Date.now();
Config.roads.junctionJ1Arms.enabled = false; Config.roads.islandLink.enabled = false; // this check tests the ring alone; the J1 arms end on the ring (J1-e2, scripts/j1-arms-game-check.ts)
const net = new TerrainGenerator(Config.world.seed).roads;
console.log(`RoadNetwork built in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const plan = planRing(Config.roads.ring.step);
const ring = net.roads.find((r) => r.name === 'M8');

check(net.roads.length === 1 && !!ring, 'roads: exactly one road, M8', `${net.roads.length} road(s)`);
if (!ring) { console.log('\nNO RING, stop'); process.exit(1); }
check(ring.closed && ring.kind === 'highway' && ring.tier === 1, 'M8 is a closed tier-1 highway', `closed ${ring.closed}, ${ring.kind}, tier ${ring.tier}`);
check(ring.lanes === 8 && ring.halfWidth === 22.1 && ring.medianHalf === 3 && ring.laneW === 3.65 && ring.shyOuter === 3, 'M8 has the Step 4.1 section (8 lanes, 22.1 m, median 3, lane 3.65, shoulder 3)', `lanes ${ring.lanes}, halfWidth ${ring.halfWidth}, median ${ring.medianHalf}, laneW ${ring.laneW}, shyOuter ${ring.shyOuter}`);
check(ring.xs.length === plan.pts.length, 'every planned point is in the road', `${ring.xs.length} points`);
let worstY = 0, worstXZ = 0;
for (let i = 0; i < ring.xs.length; i++) { worstY = Math.max(worstY, Math.abs(ring.ys[i] - plan.ys[i])); worstXZ = Math.max(worstXZ, Math.hypot(ring.xs[i] - plan.pts[i][0], ring.zs[i] - plan.pts[i][1])); }
check(worstY < 1e-9 && worstXZ < 1e-9, 'surface heights and positions are exactly the design', `dy ${worstY.toExponential(1)}, dxz ${worstXZ.toExponential(1)}`);
check(Math.abs(ring.length - plan.length) < 1, 'road length equals the alignment length', `${ring.length.toFixed(1)} vs ${plan.length.toFixed(1)} m`);
const st = net.stats;
check(st.roads === 1 && Math.abs(st.highwayKm - plan.length / 1000) < 0.001 && st.localKm === 0, 'stats: 1 road, highwayKm = ring length', `${st.highwayKm.toFixed(3)} km`);
check(net.bridges.length === 6 && net.pads.length === 0, 'bridges and pads: 6 structures of the ring (Step 5.3b, scripts/ring-structures-check.ts), no pads yet', `${net.bridges.length} bridges, ${net.pads.length} pads`);

// surfaceAt on the ring at a quarter of the points: centreline, lane, outer shoulder = asphalt (1); just outside = gravel (2) or ground (0); far away = 0
let bad = 0; const tried: string[] = [];
for (let i = 0; i < ring.xs.length; i += Math.floor(ring.xs.length / 40)) {
  const at = (u: number) => net.surfaceAt(ring.xs[i] + ring.nx[i] * u, ring.zs[i] + ring.nz[i] * u);
  const a = at(0), b = at(17.275), c = at(-6.325), d = at(21.5), e = at(60);
  if (a !== 1 || b !== 1 || c !== 1 || d !== 1 || e !== 0) { bad++; if (tried.length < 3) tried.push(`pt ${i}: ${a}${b}${c}${d}${e}`); }
}
check(bad === 0, 'surfaceAt: asphalt on the whole carriageway, natural ground 60 m away', bad ? tried.join('; ') : '40 places x 5 offsets');
console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASS');
process.exit(fails ? 1 : 0);
