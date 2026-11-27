// Headless City Mall test (STEP R1: ONE 10-floor glass building over the WHOLE outline (~109,500 m2 per floor), 100 m round atrium in the middle with a glass dome, 2 entrances on the road sides
// (east, north, west, south), 8 shops per floor in two rings (C3), one stair + one lift on each of two sides (west, east) of the atrium, a 12 m column grid on every floor with per-floor colliders, shops furnished with fixtures (C4), no products yet (C5)).
// Needs the packages installed (three, @dimforge/rapier3d-compat): npm run test:mall   (= npx tsx scripts/mall-test.ts)
import * as THREE from 'three';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { MALL_ATRIUM_R, MALL_PLOT, MALL_POLY, MALL_BUILDING, MALL_BUILDING_LOCAL, MALL_DOORS, MALL_POS, mallToLocal } from '../src/mall/MallSite';
import { TreePlacer } from '../src/vegetation/TreePlacement';
import { CityPlan } from '../src/city/CityPlan';
import { EventBus, type EngineEvents } from '../src/core/EventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { LiftSystem } from '../src/mall/MallLift';
import { createLiftBodies, liftHost } from '../src/mall/MallLiftPhysics';
import { FH, LANE_A_C, LANE_B_C, LIFTS, coreFootprints, inCabin, inDoorway, levelY } from '../src/mall/MallCores';
import { createStaticColliders, FloorColliders, floorsAround } from '../src/mall/MallColliders';
import { floorLayout } from '../src/mall/MallLayout';

// tiny canvas stub so MallBuilder can run without a browser
const ctxStub: any = new Proxy({ canvas: { width: 1024, height: 256 } }, { get: (t: any, k) => (k in t ? t[k] : () => ({ width: 10 })), set: () => true });
(globalThis as any).location = { href: 'http://localhost/' };
(globalThis as any).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub }) };
const { buildMall } = await import('../src/mall/MallBuilder');
const { loadCatalog } = await import('../src/mall/MallCatalog');

let fails = 0;
const pending = (m: string) => console.log('PENDING ' + m); // checks that belong to a LATER relocation step (M2 building, M3 spawn / parking / door); not counted as failures
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const gen = new TerrainGenerator(Config.world.seed);
const m = gen.mall;
console.log('mall at', m.x, m.z, 'yaw', m.yaw, 'floorY', m.floorY.toFixed(2));

const polyHas = (P: ReadonlyArray<readonly [number, number]>, x: number, z: number) => { let r = false; for (let a = 0, b = P.length - 1; a < P.length; b = a++) { const [xi, zi] = P[a], [xj, zj] = P[b]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) r = !r; } return r; };
const inPoly = (x: number, z: number) => polyHas(MALL_POLY, x, z);
const dseg = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => { const abx = bx - ax, abz = bz - az, l2 = abx * abx + abz * abz; const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / l2)) : 0; return Math.hypot(px - (ax + abx * t), pz - (az + abz * t)); };
const polyArea = (P: ReadonlyArray<readonly [number, number]>) => Math.abs(P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
/** distance from a point to the nearest main road EDGE (centreline minus half width + shoulder) or to the rail centreline - 6 m */
const roadClear = (x: number, z: number) => {
  let best = 1e9;
  for (const r of gen.roads.roads) { if (r.tier > 2) continue; for (let i = 0; i + 1 < r.xs.length; i++) best = Math.min(best, dseg(x, z, r.xs[i], r.zs[i], r.xs[i + 1], r.zs[i + 1]) - (r.halfWidth + r.shoulder)); }
  for (const e of gen.rail.edges) for (let i = 0; i + 1 < e.xs.length; i++) best = Math.min(best, dseg(x, z, e.xs[i], e.zs[i], e.xs[i + 1], e.zs[i + 1]) - 6);
  return best;
};

// 1. flat pad under the whole plot polygon
let mn = 1e9, mx = -1e9, cnt = 0;
for (let x = MALL_PLOT.x0; x <= MALL_PLOT.x1; x += 2) for (let z = MALL_PLOT.z0; z <= MALL_PLOT.z1; z += 2) { if (!inPoly(x, z)) continue; cnt++; const h = gen.heightAt(x, z); mn = Math.min(mn, h); mx = Math.max(mx, h); }
ok(mx - mn < 0.07, `terrain under the whole mall plot (${cnt} samples, bent wedge) is flat (range ${(mx - mn).toFixed(4)} m; < 7 cm: the road mask leaves a few cm at some plot edges)`);
ok(Math.abs(mx - (m.floorY - 0.03)) < 0.07 && mn > m.floorY - 0.03 - 0.07, 'pad is 3 cm below the floor tiles (+- 7 cm)');

// 2. the building outline: inside the plot, NOT a rectangle, hugs the roads, never on a road
let outV = 0, minApron = 1e9;
for (const [x, z] of MALL_BUILDING) { if (!inPoly(x, z)) outV++; }
for (let i = 0; i < MALL_BUILDING.length; i++) { const A = MALL_BUILDING[i], B = MALL_BUILDING[(i + 1) % MALL_BUILDING.length]; for (let t = 0; t <= 1; t += 0.05) { const x = A[0] + (B[0] - A[0]) * t, z = A[1] + (B[1] - A[1]) * t; if (!inPoly(x, z)) outV++; else { let d = 1e9; for (let a = 0, b = MALL_POLY.length - 1; a < MALL_POLY.length; b = a++) d = Math.min(d, dseg(x, z, MALL_POLY[a][0], MALL_POLY[a][1], MALL_POLY[b][0], MALL_POLY[b][1])); minApron = Math.min(minApron, d); } } }
ok(outV === 0, `the whole building outline lies inside the plot (apron >= ${minApron.toFixed(1)} m)`);
let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
for (const [x, z] of MALL_BUILDING) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z); }
const fill = polyArea(MALL_BUILDING) / ((bx1 - bx0) * (bz1 - bz0));
const axisAligned = MALL_BUILDING.length <= 4 && MALL_BUILDING.every((p, i) => { const q = MALL_BUILDING[(i + 1) % MALL_BUILDING.length]; return Math.abs(p[0] - q[0]) < 0.01 || Math.abs(p[1] - q[1]) < 0.01; });
ok(MALL_BUILDING.length >= 8 && !axisAligned && fill < 0.9, `the building is not a rectangle: ${MALL_BUILDING.length} corners, fills ${(fill * 100).toFixed(0)}% of its bounding box`);
let hug = 0, tot = 0, minRoad = 1e9;
for (let i = 0; i < MALL_BUILDING.length; i++) { const A = MALL_BUILDING[i], B = MALL_BUILDING[(i + 1) % MALL_BUILDING.length]; const L = Math.hypot(B[0] - A[0], B[1] - A[1]); for (let d = 0; d < L; d += 2) { const x = A[0] + ((B[0] - A[0]) * d) / L, z = A[1] + ((B[1] - A[1]) * d) / L; const c = roadClear(x, z); tot++; minRoad = Math.min(minRoad, c); if (c < 14) hug++; } }
pending(`outline hugs the roads (${(100 * hug / tot).toFixed(0)}%): obsolete, the plot now keeps 15 m from the roads and the wall is inset 12 m more`);
ok(minRoad >= 15, `the glass wall keeps >= 15 m from every road edge and from the rail (closest ${minRoad.toFixed(1)} m)`);
// the 100 m atrium lies inside the outline with room to spare; both doors face a road
{
  let atrOut = 0, atrMin = 1e9;
  for (let i = 0; i < 96; i++) {
    const t = (i / 96) * Math.PI * 2, lx = Math.cos(t) * MALL_ATRIUM_R, lz = Math.sin(t) * MALL_ATRIUM_R;
    const c = Math.cos(MALL_POS.yaw), sn = Math.sin(MALL_POS.yaw), wx = MALL_POS.x + lx * c + lz * sn, wz = MALL_POS.z - lx * sn + lz * c;
    if (!polyHas(MALL_BUILDING, wx, wz)) atrOut++;
    else { let d = 1e9; for (let a = 0, b = MALL_BUILDING.length - 1; a < MALL_BUILDING.length; b = a++) d = Math.min(d, dseg(wx, wz, MALL_BUILDING[a][0], MALL_BUILDING[a][1], MALL_BUILDING[b][0], MALL_BUILDING[b][1])); atrMin = Math.min(atrMin, d); }
  }
  ok(atrOut === 0 && atrMin > 50, `the 100 m atrium (r = ${MALL_ATRIUM_R}) lies inside the glass outline with ${atrMin.toFixed(0)} m to spare`);
  ok(polyArea(MALL_BUILDING) > 100000 && polyArea(MALL_BUILDING) - Math.PI * MALL_ATRIUM_R ** 2 > 99000, `floor area ${polyArea(MALL_BUILDING).toFixed(0)} m2 per floor, ${(polyArea(MALL_BUILDING) - Math.PI * MALL_ATRIUM_R ** 2).toFixed(0)} m2 without the atrium`);
  const J = mallToLocal(-87, -277), E = MALL_DOORS.find((d) => d.id === 'E')!, N = MALL_DOORS.find((d) => d.id === 'N')!; // J1: the W arm runs along local z = J.z, the S arm along local x = J.x
  ok(MALL_DOORS.length === 4 && MALL_DOORS.map((d) => d.id).join('') === 'ENWS' && E.side === 1 && N.side === -1, 'exactly 4 entrances: east, north, west, south (east first)');
  ok(J.x - E.lx > 40 && J.x - E.lx < 110 && N.lz - J.z > 40 && N.lz - J.z < 110, `both doors face a road: the east door is ${(J.x - E.lx).toFixed(0)} m from the J1 S arm axis, the north door ${(N.lz - J.z).toFixed(0)} m from the J1 W arm axis`);
  ok(Math.abs(E.lz) < 1e-6 && Math.abs(N.lx) < 1e-6 && MALL_DOORS.every((d) => Math.abs(d.lz) < 1e-6 || Math.abs(d.lx) < 1e-6), 'all 4 doors stand on an axis through the atrium centre (z = 0 east / west, x = 0 north / south)');
}
ok(m.inside(MALL_POS.x, MALL_POS.z) && !m.inside(0, 0) && !m.inside(MALL_BUILDING[0][0] - 8, MALL_BUILDING[0][1]), 'MallSite.inside follows the bent outline (centre in, spawn out)');

// 3. blend to natural ground is gentle and does not touch the roads
let maxSlope = 0; const mk = new Float32Array(2);
for (let x = MALL_PLOT.x0 - 30; x <= MALL_PLOT.x1 + 30; x += 1) for (let z = MALL_PLOT.z0 - 30; z <= MALL_PLOT.z1 + 30; z += 1) {
  if (gen.roads.surfaceAt(x, z) !== 0 || gen.roads.surfaceAt(x + 1, z + 1) !== 0) continue;
  if (!m.near(x, z)) continue; // only the pad skirt (the natural hills further out are steep by themselves)
  gen.roads.maskAt(x, z, 1, mk); if (mk[1] > 0.001) continue; gen.roads.maskAt(x + 1, z + 1, 1, mk); if (mk[1] > 0.001) continue; // road cuts / embankments are steep by design (J1 W arm)
  const h = gen.heightAt(x, z);
  maxSlope = Math.max(maxSlope, Math.abs(gen.heightAt(x + 1, z) - h), Math.abs(gen.heightAt(x, z + 1) - h));
}
ok(maxSlope < 0.8, `no cliff around the pad skirt (cut into the hill up to ~13 m over the 40 m skirt) (max ${maxSlope.toFixed(3)} m per m)`);
let roadHits = 0;
for (let x = MALL_PLOT.x0 - 2; x <= MALL_PLOT.x1 + 2; x += 2) for (let z = MALL_PLOT.z0 - 2; z <= MALL_PLOT.z1 + 2; z += 2) if (inPoly(x, z) && gen.roads.surfaceAt(x, z) !== 0) roadHits++;
ok(roadHits === 0, `no road surface on the mall plot (${roadHits} hits)`);
let roadPts = 0;
for (const r of gen.roads.roads) for (let i = 0; i < r.xs.length; i++) if (m.near(r.xs[i], r.zs[i]) && Math.abs(gen.heightAt(r.xs[i], r.zs[i]) - r.ys[i]) > 0.02) roadPts++;
ok(roadPts === 0, 'roads keep their own height where they meet the pad skirt');
pending('mall is close to the spawn point (' + Math.hypot(m.x, m.z).toFixed(0) + ' m): M3 moves spawn / start lot');
{ const J = { x: -87, z: -277 }; const ang = (Math.atan2(m.z - J.z, m.x - J.x) * 180) / Math.PI; ok(m.x < J.x && m.onPlot(m.x, m.z) && MALL_POLY.every(([x, z]) => Math.hypot(x - J.x, z - J.z) >= 150), `the mall stands WEST of J1 (centre ${Math.hypot(m.x - J.x, m.z - J.z).toFixed(0)} m from J1, no plot corner within 150 m of J1)`); }

// 4. no trees on the plot
const plan = new CityPlan(gen.sites);
const trees = new TreePlacer(gen, plan, Config.world.seed);
let onPlot = 0, total = 0;
const CSZ = Config.world.chunkSize;
for (let cx = Math.floor(MALL_PLOT.x0 / CSZ) - 1; cx <= Math.floor(MALL_PLOT.x1 / CSZ) + 1; cx++) for (let cz = Math.floor(MALL_PLOT.z0 / CSZ) - 1; cz <= Math.floor(MALL_PLOT.z1 / CSZ) + 1; cz++) {
  const d = trees.place(cx, cz);
  const ox = cx * Config.world.chunkSize, oz = cz * Config.world.chunkSize;
  for (const arr of d) {
    for (let i = 0; i + 2 < arr.length; i += 6) { total++; if (m.contains(arr[i] + ox, arr[i + 2] + oz)) onPlot++; }
  }
}
console.log('trees checked:', total);
ok(onPlot === 0, 'no tree stands on the mall plot');

// 5. mall build: ONE building, empty floors (C3 brings the shops)
const cat = await loadCatalog();
const mall = buildMall(cat, { fixtureCap: 300 });
const LAY = floorLayout();
ok(mall.floors.length === 10, '10 floors (floor groups 0..9)');
ok(mall.shops.length === 80 && [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].every((f) => mall.shops.filter((z) => z.floor === f).length === 8), `10 floors x 8 shops = ${mall.shops.length} shops (viewPos on its own floor)`);
ok(mall.shops.every((z) => Math.abs(z.viewPos.y - z.floor * 5) < 1e-6 && Math.hypot(z.viewPos.x, z.viewPos.z) > 66), 'every shop viewing spot stands on its own floor, outside the atrium promenade');
pending(`no products yet (${mall.items.length}): C5 brings the products`);
ok(mall.ramps.length === 36 && mall.rampRails.length === 72, `stairs: 2 sides x 9 flights x 2 lanes = 36 walking ramps, 72 sloped rails (${mall.ramps.length} / ${mall.rampRails.length})`);
{ const FOOTS = coreFootprints(); const inCore = (q: { minX: number; maxX: number; minZ: number; maxZ: number }) => FOOTS.some(([a, b, c, d]) => q.maxX > a - 3 && q.minX < b + 3 && q.maxZ > c - 3 && q.minZ < d + 3);
  ok(mall.solids.every(inCore), `always-on solids (${mall.solids.length}) are only the stair / lift cores (no walls inside the building)`); }
const runsOf = (f: number) => mall.shopLayouts[f].reduce((n, L) => n + L.runs.length, 0);
ok(mall.floorSolids.every((l, f) => l.length === LAY.cols.length + 8 + runsOf(f)) && LAY.cols.length > 600, `every floor has ${LAY.cols.length} column colliders (12 m grid) + 8 shop board posts + ${runsOf(0)}..${runsOf(8)} fixture runs, listed per floor (floorSolids)`);
ok(mall.floorSolids[0].filter((q) => q.maxY - q.minY > 4).every((q) => q.minY === 0 && Math.abs(q.maxY - 4.6) < 1e-6) && mall.floorSolids[7].filter((q) => q.maxY - q.minY > 4).every((q) => q.minY === 35 && Math.abs(q.maxY - 39.6) < 1e-6) && mall.floorSolids[7].filter((q) => q.maxY - q.minY < 4).length === 8 + runsOf(7), 'columns of floor f stand from the floor (f x 5 m) to the underside of the slab above (4.6 m high); the 8 shop board posts (2.4 m) and the fixture runs are lower');
ok(mall.floorSolids[0].every((q) => Math.abs((q.minX + q.maxX) / 2) > 5.4 && Math.abs((q.minZ + q.maxZ) / 2) > 5.4), 'no column on the two entrance aisles (|x| < 5.4 north door, |z| < 5.4 east door)');
ok(mall.floorSolids[0].every((q) => Math.hypot((q.minX + q.maxX) / 2, (q.minZ + q.maxZ) / 2) >= MALL_ATRIUM_R + 3), 'no column inside the atrium (+ 3 m walkway)');
ok(mall.obbs.length >= MALL_BUILDING.length, `glass curtain wall: ${mall.obbs.length} wall pieces round ${MALL_BUILDING.length} corners`);
ok(mall.obbs.filter((o) => o.y0 === 0 && Math.abs(o.y1 - 50) < 1e-6).length >= MALL_BUILDING.length && mall.obbs.filter((o) => Math.abs(o.y0 - 3.6) < 1e-6 && Math.abs(o.y1 - 50) < 1e-6).length === 4, 'the wall is 50 m high all round (no podium), with a doorway lintel (3.6 m up) at each of the 4 entrances');
ok(mall.obbs.every((o) => Math.abs(o.y1 - o.y0) > 40), 'all always-on turned colliders are wall pieces (the atrium rails are per floor)');
ok(mall.floorObbs[0].length === 0 && [1, 2, 3, 4, 5, 6, 7, 8, 9].every((f) => mall.floorObbs[f].length === 64 && mall.floorObbs[f].every((o) => Math.abs(Math.hypot(o.cx, o.cz) - (MALL_ATRIUM_R + 0.3)) < 1e-6 && Math.abs(o.y0 - f * 5) < 1e-6)), 'atrium balustrade: 64 collider pieces (r = 50.3 m) on each of floors 1..9, none on the ground floor');
ok(mall.meshSolids.length >= 11, `${mall.meshSolids.length} floor / roof pieces (ground floor + 9 upper slabs + roof + stair skirts)`);
mall.ensureFloor(3); mall.ensureFloor(3);
{ const pick0 = mall.pickables.length, kids = mall.floors[3].children.length;
  ok(mall.floors[3].children.length >= 4 && mall.floors[2].children.every((c) => !(c as any).isInstancedMesh), 'ensureFloor builds a floor once, only that floor (columns, ceiling lights, atrium rail, shops)');
  ok(mall.floors[3].children.filter((c) => (c as any).userData?.pick?.url).length === 8 && mall.floors[3].children.some((c) => c.name === 'ShopPatches3') && mall.floors[3].children.some((c) => c.name === 'DeptSign3'), 'floor 3 has 8 "view all" boards (pickable, with a link), 1 merged patch mesh, 1 department sign');
  ok(mall.fixtureGroups[3].children.length >= 8 && mall.fixtureGroups[3].children.every((m) => (m as any).isInstancedMesh) && mall.fixtureGroups[3].children.length <= 16, `floor 3 fixtures: ${mall.fixtureGroups[3].children.length} instanced meshes (an opaque one + a glass one per shop), none on the other floors (${mall.fixtureGroups[2].children.length})`);
  mall.releaseFloor(3); mall.releaseFloor(3);
  ok(mall.fixtureGroups[3].children.length === 0, 'releaseFloor removes the fixture meshes too');
  ok(mall.floors[3].children.length < kids && mall.floors[3].children.every((c) => !(c as any).isInstancedMesh) && mall.pickables.length === pick0 - 8, 'releaseFloor throws away what ensureFloor built (meshes, 8 boards from the pickables), once');
  mall.ensureFloor(3);
  ok(mall.floors[3].children.length === kids && mall.pickables.length === pick0, 'a released floor builds again the same'); }
ok(floorsAround(12, 5, 10, true, true).join() === '2' && floorsAround(4.5, 5, 10, true, true).join() === '0,1' && floorsAround(0, 5, 10, false, true).join() === '0' && floorsAround(0, 5, 10, false, false).length === 0, 'floorsAround: the floor the feet are on (+ the next one within 1 m of it), ground floor when just outside, nothing when far');

const bus = new EventBus<EngineEvents>();
const physics = await PhysicsWorld.create(bus);
const R = physics.RAPIER, W = physics.world;
const body = W.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, 0, 0));
createStaticColliders(R, W, body, mall); // the SAME function the game uses (MallManager)
const fc = new FloorColliders(R, W, body, mall); // the per-floor columns / atrium rail: only the floors a test needs
W.createCollider(R.ColliderDesc.cuboid(260, 0.5, 260).setTranslation(0, -0.5, 0).setFriction(1), body); // the paved plaza / ground around the mall
W.step();

// a real walker: same character controller settings as Player.ts
const P = Config.player, HALFH = P.height / 2;
const walker = W.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0, 0));
const col = W.createCollider(R.ColliderDesc.capsule(HALFH - P.radius, P.radius), walker);
const cc = W.createCharacterController(0.02);
cc.setUp({ x: 0, y: 1, z: 0 }); cc.setSlideEnabled(true); cc.enableAutostep(P.stepHeight, 0.2, false); cc.enableSnapToGround(0.5);
cc.setMaxSlopeClimbAngle((P.maxSlopeDeg * Math.PI) / 180); cc.setMinSlopeSlideAngle(((P.maxSlopeDeg + 5) * Math.PI) / 180);
const pos = { x: 0, y: 0, z: 0 };
const put = (x: number, floorY: number, z: number) => { pos.x = x; pos.z = z; pos.y = floorY + HALFH + 0.05; walker.setNextKinematicTranslation(pos); W.step(); };
const walk = (tx: number, tz: number, steps = 4000, speed = 0.07) => {
  for (let i = 0; i < steps; i++) {
    const dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz);
    if (d < 0.1) break;
    const k = Math.min(speed, d) / d;
    cc.computeColliderMovement(col, { x: dx * k, y: -0.1, z: dz * k });
    const mv = cc.computedMovement();
    pos.x += mv.x; pos.y += mv.y; pos.z += mv.z;
    walker.setNextKinematicTranslation(pos); W.step();
  }
};
const feet = () => pos.y - HALFH;

const DE = MALL_DOORS.find((d) => d.id === 'E')!, DN = MALL_DOORS.find((d) => d.id === 'N')!, DW = MALL_DOORS.find((d) => d.id === 'W')!, DS = MALL_DOORS.find((d) => d.id === 'S')!;
// 6. the glass wall is solid all the way round (except the 4 doorways): from 3 m outside, a ray at eye height hits it within ~3 m
let leaks = 0, tested = 0;
for (let i = 0; i < MALL_BUILDING_LOCAL.length; i++) {
  const A = MALL_BUILDING_LOCAL[i], B = MALL_BUILDING_LOCAL[(i + 1) % MALL_BUILDING_LOCAL.length];
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L;
  let nx = -uz, nz = ux; if (nx * (A[0] + B[0]) + nz * (A[1] + B[1]) < 0) { nx = -nx; nz = -nz; }
  for (const f of [0.15, 0.5, 0.85]) {
    const px = A[0] + (B[0] - A[0]) * f, pz = A[1] + (B[1] - A[1]) * f;
    if (MALL_DOORS.some((d) => Math.hypot(px - d.lx, pz - d.lz) < 7)) continue;
    tested++;
    const hit = W.castRay(new R.Ray({ x: px + nx * 3, y: 1.5, z: pz + nz * 3 }, { x: -nx, y: 0, z: -nz }), 10, true);
    if (!hit || hit.timeOfImpact > 3.5) leaks++;
  }
}
ok(leaks === 0 && tested > 30, `no gap in the glass wall (${tested} rays from outside, ${leaks} got through)`);
for (const [x, z] of [[-100, 0], [100, 0], [0, 0], [0, 100]] as [number, number][]) {
  const hh = W.castRay(new R.Ray({ x, y: 60, z }, { x: 0, y: -1, z: 0 }), 70, true);
  ok(!!hh && Math.abs(60 - hh.timeOfImpact - 50) < 0.15, `the roof is at y = 50 above (${x}, ${z})${x === 0 && z === 0 ? ' = SOLID over the atrium too (glass dome closes it: no rain, nothing falls in)' : ''}`);
}
for (let f = 1; f <= 9; f++) {
  const h = W.castRay(new R.Ray({ x: 80, y: f * 5 + 2, z: -30 }, { x: 0, y: -1, z: 0 }), 10, true);
  ok(!!h && Math.abs(f * 5 + 2 - h.timeOfImpact - f * 5) < 0.15, `floor ${f}: walkable slab top at y = ${f * 5}`);
}
{ const atr = W.castRay(new R.Ray({ x: 3, y: 49, z: 0 }, { x: 0, y: -1, z: 0 }), 60, true);
  ok(!!atr && Math.abs(49 - atr.timeOfImpact) < 0.15, 'the atrium is open from the top floor down to the ground (a ray falls to y = 0)'); }

// 7. doors: in through the east doorway (z = 0) and the north doorway (x = 0), the wall beside the door stops a walker
fc.set([0]);
put(DE.lx + 6, 0, 0); walk(DE.lx - 20, 0, 1000);
ok(pos.x < DE.lx - 19 && Math.abs(feet()) < 0.2, 'a walker gets in through the east doorway (10 m)');
put(0, 0, DN.lz - 6); walk(0, DN.lz + 20, 1000);
ok(pos.z > DN.lz + 19 && Math.abs(feet()) < 0.2, 'a walker gets in through the north doorway (10 m)');
let xe20 = 1e9;
for (let i = 0; i < MALL_BUILDING_LOCAL.length; i++) { const A = MALL_BUILDING_LOCAL[i], B = MALL_BUILDING_LOCAL[(i + 1) % MALL_BUILDING_LOCAL.length]; if ((A[1] > 20) === (B[1] > 20)) continue; const x = A[0] + ((20 - A[1]) / (B[1] - A[1])) * (B[0] - A[0]); if (x > 0 && x < xe20) xe20 = x; }
put(xe20 - 3, 0, 20); walk(xe20 + 10, 20, 400);
ok(pos.x < xe20 - 0.1 && pos.x > xe20 - 4, `the glass wall beside the east doorway stops a walker (wall at x = ${xe20.toFixed(1)}, stopped at ${pos.x.toFixed(2)})`);
put(DW.lx - 6, 0, 0); walk(DW.lx + 20, 0, 1000);
ok(pos.x > DW.lx + 19 && Math.abs(feet()) < 0.2, 'a walker gets in through the west doorway (10 m)');
put(0, 0, DS.lz + 6); walk(0, DS.lz - 20, 1000);
ok(pos.z < DS.lz - 19 && Math.abs(feet()) < 0.2, 'a walker gets in through the south doorway (10 m)');

// 8. a walker crosses the whole building along z = 0 (over the ground floor under the atrium, between the stair and the lift)
put(DE.lx - 10, 0, 0); walk(DW.lx - 8, 0, 8000);
ok(pos.x < DW.lx - 7 && Math.abs(feet()) < 0.2, `a walker crosses the whole ground floor from the east door out through the west door (x = ${pos.x.toFixed(1)})`);
// 9. columns are solid (floor 0 colliders are on)
{ const c = LAY.cols[Math.floor(LAY.cols.length / 2)];
  put(c[0] - 3, 0, c[1]); walk(c[0] + 3, c[1], 400);
  ok(pos.x < c[0] - 0.5, `a column of the ground floor stops a walker (column at ${c[0]}, ${c[1]}; stopped at x = ${pos.x.toFixed(2)})`); }
{ const r = mall.shopLayouts[0][0].runs[0]; // a run of fixtures of the first ground-floor shop is solid: a walker coming from the aisle side stops at it
  put(r.cx, 0, r.cz + r.hz + 3); walk(r.cx, r.cz, 500);
  ok(pos.z > r.cz + r.hz - 0.01, `a fixture run is solid (run at ${r.cx.toFixed(1)}, ${r.cz}; the walker stopped at z = ${pos.z.toFixed(2)}, the run edge is ${(r.cz + r.hz).toFixed(2)})`); }
fc.set([]);
ok(mall.surfaceAt(-20, 10, 1) === 0 && mall.surfaceAt(20, -10, 1) === 0, 'viewer surfaceAt: ground floor is flat');
ok(mall.surfaceAt(80, -30, 12) === 10 && mall.surfaceAt(3, 0, 12) === 0, 'viewer surfaceAt: floor 2 = 10 m, the atrium hole = 0');
// 10. upper floors: a walker on floor 3 cannot walk into the atrium (balustrade), a walker on floor 9 crosses its floor
fc.set([3]); put(80, 15, 0); walk(0, 0, 3000);
ok(Math.hypot(pos.x, pos.z) > MALL_ATRIUM_R - 0.1 && Math.abs(feet() - 15) < 0.3, `balustrade stops a walker at the atrium edge (r = ${Math.hypot(pos.x, pos.z).toFixed(2)}, feet y = ${feet().toFixed(2)})`);
fc.set([9]); put(80, 45, -24); walk(130, -24, 2500);
ok(Math.hypot(pos.x - 130, pos.z + 24) < 0.6 && Math.abs(feet() - 45) < 0.3, 'a walker crosses floor 9 (top floor) between the columns');
fc.set([]);
// 11. STEP C2 / R1: stairs. A walker climbs both stairs (west + east) from the ground floor to floor 9, flight by flight (character controller like the Player). R1: the stairs stand D m further out
const D = MALL_ATRIUM_R - 10;
for (const side of [1, -1]) {
  put(side * (11 + D), 0, LANE_A_C);
  let top = 0;
  for (let f = 0; f < 9; f++) {
    walk(side * (17.2 + D), LANE_A_C); walk(side * (19.4 + D), LANE_A_C); walk(side * (19.4 + D), LANE_B_C); walk(side * (13.4 + D), LANE_B_C); walk(side * (11 + D), LANE_A_C);
    if (Math.abs(feet() - (f + 1) * FH) < 0.35) top = f + 1; else break;
  }
  ok(top === 9, `${side > 0 ? 'east' : 'west'} stair: a walker climbs from the ground floor to floor ${top} of 9 (feet y = ${feet().toFixed(2)})`);
}
// the rail round the stair well on floor 3 keeps a walker out of the hole
put(11.5 + D, 15, 13.3); walk(16 + D, 13.3, 600);
ok(Math.abs(feet() - 15) < 0.5, `the rail stops a walker at the stair well on floor 3 (feet y = ${feet().toFixed(2)})`);

// 12. STEP C2: lifts. Pure logic first: 0 -> 9 at 8 m/s
{
  const dummy = { landingBlock() {}, cabinPose() {}, cabinDoorBlock() {} };
  const ls = new LiftSystem(dummy); const c = ls.cars[0]; c.request(9);
  let t = 0, vmax = 0;
  while (!(c.state === 'open' && c.level === 9) && t < 60) { ls.update(1 / 60, () => false); vmax = Math.max(vmax, Math.abs(c.v)); t += 1 / 60; }
  ok(c.level === 9 && c.y === 45 && vmax <= 8.001 && vmax > 7.9, `lift 0 -> 9: arrives (y = ${c.y}), top speed ${vmax.toFixed(2)} m/s, ${t.toFixed(1)} s`);
}
// then with the real colliders: walk into the east lift on the ground floor, ride to floor 5 (the player is carried like in the game), walk out
{
  const frame = { x: 0, z: 0, floorY: 0, yaw: 0 }, zero = { x: 0, z: 0 };
  const lb = createLiftBodies(R, W, body, frame, zero);
  const lsys = new LiftSystem(liftHost(lb, frame, () => zero));
  W.step();
  const car = lsys.cars[1], L = LIFTS[1], dt = 1 / 60;
  put(L.xc, 0, -6); walk(L.xc, -11.4, 800);
  ok(Math.abs(pos.z + 11.4) < 0.3 && Math.abs(pos.x - L.xc) < 0.3, `a walker enters the open lift at the ground floor (z = ${pos.z.toFixed(2)})`);
  car.request(5);
  let t = 0, carried = false;
  while (!(car.state === 'open' && car.level === 5) && t < 60) {
    lsys.update(dt, (c) => c.id === 1 && c.state !== 'moving' && inDoorway(L, pos.x, pos.z, feet(), levelY(c.level)));
    if (inCabin(L, pos.x, pos.z, feet(), car.y) && !car.walkable) { pos.y = car.y + HALFH + 0.03; walker.setNextKinematicTranslation(pos); carried = true; }
    W.step(); t += dt;
  }
  ok(car.level === 5 && carried && Math.abs(feet() - 25) < 0.3, `the lift rides to floor 5 in ${t.toFixed(1)} s and carries the walker (feet y = ${feet().toFixed(2)})`);
  walk(L.xc, -6.5, 800);
  ok(pos.z > -8.5 && Math.abs(feet() - 25) < 0.35, `the walker steps out on floor 5 (z = ${pos.z.toFixed(2)}, feet y = ${feet().toFixed(2)})`);
  const door = W.castRay(new R.Ray({ x: L.xc, y: 1, z: -8 }, { x: 0, y: 0, z: -1 }), 6, true);
  ok(!!door && door.timeOfImpact < 2.7, 'with the car away, the ground-floor door is shut (a ray from the lobby hits it)');
}
console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
