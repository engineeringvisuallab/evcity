// ROAD SIGNS Step 2 test: npx tsx scripts/signs-distance-test.ts
//   Part A  a small hand-made road network (runs anywhere): checks edges, headings, ring roads, unreachable islands, destination joining.
//   Part B  the real game map: builds the terrain + roads like scripts/road-test.ts (needs the game's node_modules, ~8 s) and prints the road
//           distance from the Central City to every sign destination, next to the straight-line distance.
import { buildPadGraph, dijkstra, RoadDistances, type GraphPad, type GraphRoad } from '../src/signs/RoadDistance';

let fails = 0;
const ok = (c: boolean, msg: string): void => {
  console.log((c ? 'PASS ' : 'FAIL ') + msg);
  if (!c) fails++;
};
const near = (a: number, b: number, tol = 1e-6): boolean => Math.abs(a - b) <= tol;

/** A road along a polyline, points every `step` metres. */
function makeRoad(id: number, pts: [number, number][], step: number, closed = false): GraphRoad {
  const xs: number[] = [];
  const zs: number[] = [];
  const cum: number[] = [];
  let acc = 0;
  for (let k = 0; k + 1 < pts.length + (closed ? 1 : 0); k++) {
    const [ax, az] = pts[k];
    const [bx, bz] = pts[(k + 1) % pts.length];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const f = i / n;
      xs.push(ax + (bx - ax) * f);
      zs.push(az + (bz - az) * f);
      cum.push(acc + len * f);
    }
    acc += len;
  }
  if (!closed) {
    const last = pts[pts.length - 1];
    xs.push(last[0]);
    zs.push(last[1]);
    cum.push(acc);
  }
  return { id, xs, zs, cum, length: acc, closed };
}

// ---------------------------------------------------------------- Part A
{
  console.log('--- Part A: mini network ---');
  const roads: GraphRoad[] = [
    makeRoad(0, [[0, 0], [3000, 0]], 100), // east-west
    makeRoad(1, [[1000, -1000], [1000, 1000]], 100), // north-south, crosses road 0 at (1000, 0)
    makeRoad(2, [[10000, 0], [11000, 0], [11000, 1000], [10000, 1000]], 100, true), // a ring of 4 km, far away from the others, 4 pads
    makeRoad(3, [[5000, 5000], [5500, 5000]], 100), // an island road that is not connected to anything
  ];
  const arms = (...ids: number[]) => ids.map((roadId) => ({ roadId }));
  const pads: GraphPad[] = [
    { x: 1000, z: 0, arms: arms(0, 0, 1, 1) }, // 0 crossing
    { x: 3000, z: 0, arms: arms(0) }, // 1 east end
    { x: 1000, z: 1000, arms: arms(1) }, // 2 south end
    { x: 0, z: 0, arms: arms(0) }, // 3 west end (the "map centre")
    { x: 1000, z: -1000, arms: arms(1) }, // 4 north end
    { x: 10000, z: 0, arms: arms(2) }, // 5 ring A (s = 0)
    { x: 11000, z: 0, arms: arms(2) }, // 6 ring B (s = 1000)
    { x: 11000, z: 1000, arms: arms(2) }, // 7 ring C (s = 2000)
    { x: 10000, z: 1000, arms: arms(2) }, // 8 ring D (s = 3000)
    { x: 5000, z: 5000, arms: arms(3) }, // 9 island
    { x: 5500, z: 5000, arms: arms(3) }, // 10 island
  ];

  const g = buildPadGraph(roads, pads);
  const d3 = dijkstra(g, 3);
  ok(near(d3[0], 1000), `west end -> crossing = 1000 m (${d3[0]})`);
  ok(near(d3[1], 3000), `west end -> east end = 3000 m (${d3[1]})`);
  ok(near(d3[2], 2000), `west end -> south end = 2000 m (${d3[2]})`);
  ok(near(d3[4], 2000), `west end -> north end = 2000 m (${d3[4]})`);
  ok(d3[5] === Infinity && d3[9] === Infinity, 'separate networks are unreachable (Infinity)');

  // heading of the edge leaving a pad: atan2(dz, dx)
  const out = (from: number, to: number) => g.adj[from].find((e) => e.to === to)!;
  ok(near(out(3, 0).heading, 0, 1e-3), 'west end leaves towards +x: heading 0');
  ok(near(Math.abs(out(0, 3).heading), Math.PI, 1e-3), 'crossing leaves towards the west end: heading pi');
  ok(near(out(0, 2).heading, Math.PI / 2, 1e-3), 'crossing leaves towards +z (south): heading pi/2');
  ok(near(out(0, 4).heading, -Math.PI / 2, 1e-3), 'crossing leaves towards -z (north): heading -pi/2');
  ok(out(3, 0).dir === 1 && out(0, 3).dir === -1, 'edge directions +1 / -1');

  // ring: the wrap edge D -> A is 1000 m, not 3000 m
  const dA = dijkstra(g, 5);
  ok(near(dA[6], 1000), 'ring A -> B = 1000 m');
  ok(near(dA[7], 2000), 'ring A -> C = 2000 m');
  ok(near(dA[8], 1000), `ring A -> D = 1000 m through the closing stretch (${dA[8]})`);

  // destinations are joined to the nearest POINT OF A ROAD of the main network (the part that touches the map centre)
  const dests = [
    { x: 3010, z: 0 }, // 0: next to the east end of road 0
    { x: 1000, z: 1050 }, // 1: next to the south end of road 1
    { x: 5010, z: 5000 }, // 2: next to the island road: must NOT join the island
    { x: 2000, z: 300 }, // 3: beside the MIDDLE of the stretch between the crossing (s=1000) and the east end (s=3000)
  ];
  const rd = new RoadDistances(roads, pads, dests, { x: 0, z: 0 });
  ok(rd.joins[0]?.roadId === 0 && near(rd.destGap[0], 10), 'destination 0 joins road 0 at its east end (gap 10 m)');
  ok(rd.joins[1]?.roadId === 1 && near(rd.destGap[1], 50), 'destination 1 joins road 1 at its south end (gap 50 m)');
  ok(near(rd.distance(0, 3), 3010), `west end -> destination 0 = 3010 m (${rd.distance(0, 3)})`);
  ok(near(rd.distance(1, 3), 2050), `west end -> destination 1 = 2050 m (${rd.distance(1, 3)})`);
  ok(near(rd.distance(1, 4), 2050), `north end -> destination 1 = 2050 m (${rd.distance(1, 4)})`);
  ok(rd.inMain[9] === 0 && rd.inMain[0] === 1, 'island is not part of the main network');
  ok(rd.joins[2] !== null && rd.joins[2]!.roadId !== 3, 'island destination is NOT joined to the island road');
  ok(Number.isFinite(rd.distance(2, 3)), 'island destination is reachable from the centre');
  ok(rd.distance(0, 9) === Infinity, 'from the island pad nothing is reachable');
  // a place beside the middle of a stretch: reachable from BOTH ends of that stretch
  ok(near(rd.distance(3, 1), 1300), `east end -> destination 3 = 1000 + 300 gap = 1300 m (${rd.distance(3, 1)})`);
  ok(near(rd.distance(3, 0), 1300), `crossing -> destination 3 = 1000 + 300 gap = 1300 m (${rd.distance(3, 0)})`);
  ok(near(rd.distance(3, 3), 2300), `west end -> destination 3 = 2000 + 300 gap = 2300 m (${rd.distance(3, 3)})`);
  ok(near(rd.distance(3, 2), 2300), `south end -> destination 3 = 1000 + 1000 + 300 = 2300 m (${rd.distance(3, 2)})`);

  // ring road: a place on the CLOSING stretch (between the last junction D and the first junction A) is reachable over the wrap
  const rd2 = new RoadDistances(roads, pads, [{ x: 9800, z: 500 }], { x: 10000, z: 0 });
  ok(rd2.joins[0]?.roadId === 2 && near(rd2.destGap[0], 200), 'ring destination joins the ring (gap 200 m)');
  ok(near(rd2.distance(0, 5), 700), `ring A -> destination = 500 + 200 gap = 700 m (${rd2.distance(0, 5)})`);
  ok(near(rd2.distance(0, 8), 700), `ring D -> destination = 500 + 200 gap = 700 m (${rd2.distance(0, 8)})`);
  ok(near(rd2.distance(0, 6), 1700), `ring B -> destination = 1000 (to A) + 500 + 200 = 1700 m (${rd2.distance(0, 6)})`);
  ok(near(rd2.distance(0, 7), 1700), `ring C -> destination = 1000 (to D) + 500 + 200 = 1700 m (${rd2.distance(0, 7)})`);
}

// ---------------------------------------------------------------- Part B
async function realMap(): Promise<void> {
  console.log('\n--- Part B: real map ---');
  let TerrainGenerator: typeof import('../src/terrain/TerrainGenerator').TerrainGenerator;
  let Config: typeof import('../src/core/Config').Config;
  let DESTINATIONS: typeof import('../src/signs/SignDestinations').DESTINATIONS;
  try {
    ({ TerrainGenerator } = await import('../src/terrain/TerrainGenerator'));
    ({ Config } = await import('../src/core/Config'));
    ({ DESTINATIONS } = await import('../src/signs/SignDestinations'));
  } catch (e) {
    console.log('SKIPPED (needs the game node_modules):', (e as Error).message.split('\n')[0]);
    return;
  }
  const t0 = performance.now();
  const g = new TerrainGenerator(Config.world.seed);
  const net = g.roads;
  const rd = new RoadDistances(net.roads, net.pads, DESTINATIONS, { x: 0, z: 0 });
  console.log(`roads ${net.roads.length}, pads ${net.pads.length}, graph edges ${rd.graph.edgeCount}, in main network ${rd.inMain.reduce((a, b) => a + b, 0)} pads, built in ${(performance.now() - t0).toFixed(0)} ms`);
  ok(new Set(DESTINATIONS.map((d) => d.id)).size === DESTINATIONS.length, `${DESTINATIONS.length} destinations with unique ids`);
  const centre = rd.nearestPad(0, 0, true);
  console.log(`\nfrom the Central City junction (pad ${centre}):`);
  console.log('destination'.padEnd(28) + 'rank  road km  straight km  ratio  road point gap (m)');
  for (let i = 0; i < DESTINATIONS.length; i++) {
    const d = DESTINATIONS[i];
    const road = rd.distance(i, centre);
    const straight = Math.hypot(d.x, d.z);
    const ratio = straight > 1 ? road / straight : 1;
    const line = `${d.en.padEnd(28)}${String(d.rank).padEnd(6)}${(road / 1000).toFixed(1).padStart(7)}  ${(straight / 1000).toFixed(1).padStart(11)}  ${ratio.toFixed(2).padStart(5)}  ${rd.destGap[i].toFixed(0)} (road ${rd.joins[i]?.roadId ?? '-'})`;
    console.log(line);
    ok(Number.isFinite(road), `${d.en}: reachable by road`);
    if (Number.isFinite(road) && straight > 500) {
      if (ratio < 0.999) ok(false, `${d.en}: road is SHORTER than the straight line (${ratio.toFixed(2)})`);
      else if (ratio > 3) console.log(`WARN  ${d.en}: road is ${ratio.toFixed(1)}x the straight line, check the joined pad`);
    }
    if (rd.destGap[i] > 600) console.log(`WARN  ${d.en}: the nearest road is ${rd.destGap[i].toFixed(0)} m away from the place`);
  }
}

realMap()
  .catch((e) => {
    console.log('Part B error:', e);
    fails++;
  })
  .finally(() => {
    console.log(fails ? `\nFAILED ${fails}` : '\nALL PASS');
    process.exit(fails ? 1 : 0);
  });
