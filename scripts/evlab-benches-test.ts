// EVLab Step 11: the benches (layout, no clash with roads / bridges / water / fountains / lamps / trees / car park / cycle rack / the routes of the people, seats, colliders, meshes).
// npx tsx scripts/evlab-benches-test.ts   (the mesh part at the end needs `three`; the rest is pure and runs anywhere)
import { BRIDGES, FOUNTAINS, ISLAND, LAKE, PLAZA, PLAZA_FOUNTAIN, RING, ROAD_RECTS, inLake, lakeDepth, parkTrees, sdRR } from '../src/evlab/EVLabCampus';
import { BENCH, benchFacing, benchObbs, benchPoint, benchSeats, benches, inBenchZone, plazaPoles } from '../src/evlab/EVLabBenches';
import { inParkingZone } from '../src/evlab/EVLabParking';
import { CYCLE_SLOTS, inRackZone } from '../src/evlab/EVLabCycleRack';
import { CYCLISTS, inRouteOf, outRouteOf, walkOf } from '../src/evlab/EVLabCyclistPath';
import { planArrivals, sampleRoute, type Route } from '../src/evlab/EVLabArrivalPath';
import { BLD, BUILDING_Z } from '../src/evlab/EVLabLayout';
import { EVLAB_PLOT, EVLAB_POS } from '../src/evlab/EVLabSite';

let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const B = benches();
const count = (a: string): number => B.filter((b) => b.area === a).length;
console.log(`${B.length} benches: plaza ${count('plaza')}, island ${count('island')}, bank ${count('bank')}`);

// 1 how many, where
ok(B.length >= 50 && B.length <= 120, `${B.length} benches (50 .. 120)`);
ok(count('plaza') >= 14 && count('island') >= 15 && count('bank') >= 15, 'benches on the plaza, along the island quay and on the outer bank');
ok(new Set(B.map((b) => b.id)).size === B.length && B.every((b, i) => b.id === 'B' + i), 'ids are unique and in order');
ok(B.every((b) => Number.isFinite(b.x) && Number.isFinite(b.z) && Number.isFinite(b.yaw)), 'all numbers are finite');
ok(JSON.stringify(benches()) === JSON.stringify(B) && benches() === B, 'the layout is deterministic (cached)');

// 2 no new trees: the park is the same as before (Step 11 does not touch parkTrees)
ok(parkTrees().length > 800, `the park trees are untouched (${parkTrees().length} trees)`);

// the 4 corners (+ margin) of a bench
const corners = (b: (typeof B)[number], m = 0): Array<[number, number]> => {
  const hx = BENCH.len / 2 + m, z0 = BENCH.footZ - BENCH.depth / 2 - m, z1 = BENCH.footZ + BENCH.depth / 2 + m;
  return [[-hx, z0], [hx, z0], [hx, z1], [-hx, z1]].map(([lx, lz]) => benchPoint(b, lx, lz));
};
const inRect = (x: number, z: number, q: readonly [number, number, number, number], m = 0): boolean => x > q[0] - m && x < q[1] + m && z > q[2] - m && z < q[3] + m;

// 3 roads, bridges, promenades, ring road, tower, car park, rack
const bad = (f: (b: (typeof B)[number]) => boolean): string => B.filter(f).map((b) => b.id).join(',');
let s = bad((b) => corners(b, 1).some(([x, z]) => ROAD_RECTS.some((q) => inRect(x, z, q))));
ok(s === '', `no bench on a road / bridge / avenue / promenade (1 m margin) ${s}`);
s = bad((b) => corners(b, 1).some(([x, z]) => inRect(x, z, [-205, -100, 30.5, 46.5]) || inRect(x, z, [100, 205, 30.5, 46.5])));
ok(s === '', `no bench on the west / east promenade up to the park / car park ${s}`);
s = bad((b) => BRIDGES.some((br) => corners(b, 1).some(([x, z]) => { const a = br.axis === 'z' ? z : x, u = br.axis === 'z' ? x : z; return a > br.from && a < br.to && Math.abs(u - br.across) < br.w / 2; })));
ok(s === '', `no bench on a bridge deck ${s}`);
s = bad((b) => corners(b, 0.8).some(([x, z]) => Math.abs(sdRR(x, z, RING)) < RING.halfW));
ok(s === '', `no bench on the ring road (0.8 m margin) ${s}`);
s = bad((b) => corners(b, 0.5).some(([x, z]) => x > -BLD.hx - 3 && x < BLD.hx + 3 && z > -BLD.hz - 3 && z < BLD.hz + 3));
ok(s === '', `no bench inside / touching the podium ${s}`);
s = bad((b) => corners(b, 0.5).some(([x, z]) => inParkingZone(x, z, 3)));
ok(s === '', `no bench in the car park or its entry road ${s}`);
s = bad((b) => corners(b, 0.5).some(([x, z]) => inRackZone(x, z, 2)));
ok(s === '', `no bench on the cycle rack ${s}`);

// 4 water, lake bed, quay
s = bad((b) => corners(b, 0.3).some(([x, z]) => inLake(x, z, -0.5) || lakeDepth(x, z) > 0));
ok(s === '', `no bench in the water or on the sloping bank ${s}`);
const island = B.filter((b) => b.area === 'island');
ok(island.every((b) => { const d = sdRR(b.x, b.z, ISLAND); return d < -1.5 && d > -3; }), 'island benches stand 1.5 .. 3 m inside the quay wall');
const bank = B.filter((b) => b.area === 'bank');
ok(bank.every((b) => { const d = sdRR(b.x, b.z, LAKE); return d > 3 && d < 4; }), 'bank benches stand 3 .. 4 m outside the lake edge');

// 5 fountains, lamps, flag poles, trees
s = bad((b) => FOUNTAINS.some((f) => { const R = f.y > -0.5 ? (f.x === PLAZA_FOUNTAIN.x && f.z === PLAZA_FOUNTAIN.z ? PLAZA_FOUNTAIN.r + 0.4 : 5.4) : 3.8; return Math.hypot(b.x - f.x, b.z - f.z) < R + 2.4; }));
ok(s === '', `benches keep 2.4 m off every fountain basin ${s}`);
const poles = plazaPoles();
ok(poles.length === 18, `${poles.length} plaza lamps (14) and flag poles (4) known`);
s = bad((b) => poles.some(([x, z]) => Math.hypot(b.x - x, b.z - z) < BENCH.lampGap));
ok(s === '', `benches keep ${BENCH.lampGap} m off every plaza lamp and flag pole ${s}`);
const trees = parkTrees();
ok(trees.every((t) => !inBenchZone(t.x, t.z, BENCH.treeGap - 0.01)), 'no tree trunk inside any bench + 0.9 m margin');

// 6 on the flat plot, plaza benches on the plaza
const world = (b: (typeof B)[number]): [number, number] => [EVLAB_POS.x + b.x, BUILDING_Z + b.z];
ok(B.every((b) => { const [wx, wz] = world(b); return wx > EVLAB_PLOT.x0 + 10 && wx < EVLAB_PLOT.x1 - 10 && wz > EVLAB_PLOT.z0 + 10 && wz < EVLAB_PLOT.z1 - 30; }), 'every bench is on the flat plot (10 m in from the fence, 30 m from the highway side)');
ok(B.filter((b) => b.area === 'plaza').every((b) => corners(b, 0).every(([x, z]) => x > PLAZA.x0 && x < PLAZA.x1 && z > PLAZA.z0 && z < PLAZA.z1)), 'plaza benches stand on the plaza stone');
ok(B.every((b) => b.y === (b.area === 'plaza' ? 0.05 : 0)), 'plaza benches stand on the stone (0.05 m up), the others on the lawn');

// 7 they look the right way
const fountain = B.slice(0, 8);
ok(fountain.every((b) => { const [fx, fz] = benchFacing(b); const dx = PLAZA_FOUNTAIN.x - b.x, dz = PLAZA_FOUNTAIN.z - b.z, l = Math.hypot(dx, dz); return (fx * dx + fz * dz) / l > 0.999; }), 'the 8 benches round the big fountain look at it');
ok(fountain.every((b) => Math.abs(Math.hypot(b.x - PLAZA_FOUNTAIN.x, b.z - PLAZA_FOUNTAIN.z) - 21) < 0.01), 'the ring is 21 m from the fountain (its drops reach 17.7 m)');
ok(fountain.every((b) => Math.abs(b.x) > 7) , 'the ring leaves a gap in front of the portal');
ok(island.every((b) => { const [fx, fz] = benchFacing(b); return sdRR(b.x + fx * 6, b.z + fz * 6, ISLAND) > sdRR(b.x, b.z, ISLAND) + 4; }), 'island benches look out over the lake');
ok(bank.every((b) => { const [fx, fz] = benchFacing(b); return sdRR(b.x + fx * 6, b.z + fz * 6, LAKE) < sdRR(b.x, b.z, LAKE) - 4; }), 'bank benches look at the lake');

// 8 the benches do not touch each other
let minD = 1e9;
for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) minD = Math.min(minD, Math.hypot(B[i].x - B[j].x, B[i].z - B[j].z));
ok(minD > BENCH.len + 0.5, `benches are at least ${minD.toFixed(1)} m apart`);

// 9 seats (for Step 12)
const seats = benchSeats();
ok(seats.length === B.length * BENCH.seats, `${seats.length} seats (${BENCH.seats} per bench)`);
ok(seats.every((st) => Math.abs(st.y - (B[st.bench].y + BENCH.seatH)) < 1e-9 && Math.abs(st.yaw - B[st.bench].yaw) < 1e-9), 'seat height = seat top, people look the way the bench faces');
ok(seats.every((st) => { const b = B[st.bench]; return Math.hypot(st.x - b.x, st.z - b.z) <= BENCH.seatPitch + 1e-6; }), 'seats are on their bench');
const b0 = B[0], s0 = seats.filter((st) => st.bench === 0);
ok(Math.abs(Math.hypot(s0[0].x - s0[1].x, s0[0].z - s0[1].z) - BENCH.seatPitch) < 1e-6 && Math.abs(Math.hypot(s0[0].x - s0[2].x, s0[0].z - s0[2].z) - 2 * BENCH.seatPitch) < 1e-6, `seats are ${BENCH.seatPitch} m apart`);
ok(Math.abs(s0[1].x - b0.x) < 1e-9 && Math.abs(s0[1].z - b0.z) < 1e-9, 'the middle seat is the middle of the bench');
ok((BENCH.seats - 1) * BENCH.seatPitch + 0.5 <= BENCH.len, 'three people fit along the bench');

// 10 colliders
const ob = benchObbs();
ok(ob.length === B.length && ob.every((o) => o.hx === BENCH.len / 2 && o.hz === BENCH.depth / 2 && o.y0 === 0 && o.y1 === BENCH.backH), 'one turned box per bench (1.8 x 0.52 m, 0.9 m high)');
ok(ob.every((o, i) => o.yaw === B[i].yaw && inBenchZone(o.cx, o.cz, 0.01)), 'the boxes are turned like their bench and sit on it');
ok(!inBenchZone(0, 92) && !inBenchZone(0, 40) && inBenchZone(B[0].x, B[0].z), 'inBenchZone: not on the fountain, not in the lobby, yes on a bench');

// 11 the people who walk / ride do not run through a bench
const sampleAll = (r: Route): Array<[number, number]> => { const o: Array<[number, number]> = []; for (let d = 0; d <= r.len; d += 0.4) { const a = sampleRoute(r, d); o.push([a.x, a.z]); } return o; };
const routes: Route[] = [];
for (const c of CYCLISTS) { const slot = CYCLE_SLOTS.find((q) => q.id === c.slot)!; routes.push(inRouteOf(slot), outRouteOf(slot), walkOf(slot)); }
for (const a of planArrivals(() => 0.5)) routes.push(a.walk);
let hits = 0, pts = 0;
for (const r of routes) for (const [x, z] of sampleAll(r)) { pts++; if (inBenchZone(x, z, 1.0)) hits++; }
ok(hits === 0, `cyclists and car drivers pass at least 1 m from every bench (${routes.length} routes, ${pts} points checked, ${hits} too close)`);

// 12 the meshes (needs `three`: the same stand-ins as the other mesh tests)
{
  const ctxProxy = (): unknown => new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true });
  (globalThis as unknown as { document: unknown }).document = { createElement: (tag: string) => (tag === 'canvas' ? { width: 0, height: 0, getContext: ctxProxy, style: {} } : { style: {} }) };
  let THREE: typeof import('three') | null = null;
  try { THREE = await import('three'); } catch { console.log('SKIP mesh checks: `three` is not installed here'); }
  if (THREE) {
    const { Kit } = await import('../src/structures');
    const { Parts } = await import('../src/evlab/EVLabParts');
    const { makeTextures } = await import('../src/evlab/EVLabTextures');
    const { buildBenches, benchGeometries } = await import('../src/evlab/EVLabBenchMesh');
    const kit = new Kit();
    const parts = new Parts(kit, makeTextures(kit));
    const bb = buildBenches(parts);
    const meshes: Array<import('three').InstancedMesh> = [];
    bb.group.traverse((o) => { if ((o as import('three').InstancedMesh).isInstancedMesh) meshes.push(o as import('three').InstancedMesh); });
    ok(meshes.length === 2 && meshes.every((m) => m.count === B.length), `2 InstancedMeshes (wood, steel) with ${B.length} benches: 2 draw calls`);
    ok(bb.obbs.length === B.length && bb.count === B.length, 'the build returns one collider per bench');
    ok(meshes.every((m) => !m.castShadow), 'small prop: no shadow cast (PERFORMANCE_RULES 2.2)');
    const g = benchGeometries();
    const box = new THREE.Box3();
    for (const p of [...g.wood, ...g.steel]) { p.computeBoundingBox(); box.union(p.boundingBox!); }
    const size = box.getSize(new THREE.Vector3());
    ok(Math.abs(size.x - BENCH.len) < 0.01, `bench length ${size.x.toFixed(2)} m`);
    ok(Math.abs(box.max.y - BENCH.backH) < 0.06 && box.min.y >= -0.06 && box.min.y <= 0, `height ${box.max.y.toFixed(2)} m, feet ${box.min.y.toFixed(2)} m (just below the ground)`);
    ok(box.min.z > -BENCH.depth / 2 - 0.05 && box.max.z < BENCH.depth / 2 + 0.05, `depth ${size.z.toFixed(2)} m`);
    const seatTop = Math.max(...g.wood.slice(0, 3).map((p) => p.boundingBox!.max.y));
    ok(Math.abs(seatTop - BENCH.seatH) < 1e-6, `seat top at ${seatTop.toFixed(2)} m`);
    let tris = 0;
    for (const p of [...g.wood, ...g.steel]) tris += (p.index ? p.index.count : p.getAttribute('position').count) / 3;
    ok(tris < 400, `a bench is ${tris} triangles (low poly, instanced ${B.length} times)`);
  }
}

console.log(fails ? 'FAILED ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);
