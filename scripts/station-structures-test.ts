// STEP 3 + 4 test (headless): npx tsx scripts/station-structures-test.ts
// The structures of the road-side fuel stations + charge points (src/parking/StationLayout.ts + StationStructures.ts, sites from RoadStationSites.ts):
//   * everything of a fuel station stays INSIDE its lot rectangle; charge-point structures stay OUTSIDE the stand-still rectangle;
//   * a vehicle (car size, and bus size where it fits) can drive in through the entry lane, pass the islands, reach every pump side, the kiosk front and the tanker unload
//     bay, and drive out through the exit lane; the stand-still area of a charge point and its approach are free of solids (bus bays too, canopy >= 4.0 m);
//   * real Rapier colliders (SignPhysics, floating-origin local, sites far from the origin): a ray through a pump / column / kiosk / pylon / charger post hits, a ray along
//     the drive-through, the lanes and the charge bay does not; bodies exist only near the player;
//   * lazy meshes (built near the player, freed far away), no light sources, night = emissive only, the paint stays inside the site.
import * as THREE from 'three';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { EventBus, type EngineEvents } from '../src/core/EventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { FloatingOrigin } from '../src/world/FloatingOrigin';
import { SignPhysics } from '../src/signs/SignPhysics';
import { ROAD_STATION_SITES, type RoadStationSite } from '../src/parking/RoadStationSites';
import { STATION_LANE, UNLOAD_BAY, chargeLayout, fuelLayout, sitePaint, solidFootprint, solidsOf, type LRect } from '../src/parking/StationLayout';
import { fuelAreaAt } from '../src/vehicles/FuelAreas';

const ctx: unknown = new Proxy(function () {}, { get: (_t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => ctx), set: () => true });
(globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
const { StationStructures } = await import('../src/parking/StationStructures');

let bad = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };
const info = (m: string): void => console.log('     ' + m);
const overlap = (a: LRect, b: LRect): boolean => a[0] < b[1] && a[1] > b[0] && a[2] < b[3] && a[3] > b[2];
const inside = (a: LRect, b: LRect, tol = 0.05): boolean => a[0] >= b[0] - tol && a[1] <= b[1] + tol && a[2] >= b[2] - tol && a[3] <= b[3] + tol;
const lotOf = (s: RoadStationSite): LRect => [-s.hw, s.hw, -s.hd, s.hd];
const toWorld = (s: RoadStationSite, x: number, z: number): { x: number; z: number } => ({ x: s.x + x * Math.cos(s.yaw) + z * Math.sin(s.yaw), z: s.z - x * Math.sin(s.yaw) + z * Math.cos(s.yaw) });
const partRect = (p: { x: number; z: number; w: number; d: number }): LRect => [p.x - p.w / 2, p.x + p.w / 2, p.z - p.d / 2, p.z + p.d / 2];

const fuel = ROAD_STATION_SITES.filter((s) => s.kind === 'fuel'), cps = ROAD_STATION_SITES.filter((s) => s.kind === 'charge');
ok(fuel.length === 11 && cps.length === 11 && fuel.every((s) => s.hw === 16 && s.hd === 13), '11 fuel stations (32 x 26 m) + 11 charge points');

// ---------------------------------------------------------------- fuel stations: structures inside the lot, lanes, paths
function pathExists(s: RoadStationSite, infl: number, goals: [number, number][]): { all: boolean; failed: string[] } {
  const hw = s.hw, hd = s.hd;
  const solids = solidsOf(fuelLayout(s));
  const step = 0.25, x0 = -hw, z0 = -hd, z1 = hd + 3;
  const nx = Math.round((2 * hw) / step) + 1, nz = Math.round((z1 - z0) / step) + 1;
  const free = new Uint8Array(nx * nz);
  const laneOk = (x: number): boolean => Math.abs(Math.abs(x) - STATION_LANE.x) <= STATION_LANE.half - 0.3; // the driveway strip beyond the lot edge
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = x0 + i * step, z = z0 + j * step;
      let ok1 = true;
      if (z > hd) ok1 = laneOk(x);
      else if (Math.abs(x) > hw - 0.9 || z < -hd + 0.9) ok1 = false; // keep clear of the lot edge (a car is ~1 m half width)
      if (ok1) for (const so of solids) if (Math.abs(x - so.cx) < so.hx + infl && Math.abs(z - so.cz) < so.hz + infl) { ok1 = false; break; }
      free[i * nz + j] = ok1 ? 1 : 0;
    }
  }
  const cell = (x: number, z: number): number => Math.round((x - x0) / step) * nz + Math.round((z - z0) / step);
  const seen = new Uint8Array(nx * nz);
  const start = cell(-STATION_LANE.x, hd + 2.5);
  const q: number[] = [];
  if (free[start]) { seen[start] = 1; q.push(start); }
  while (q.length) {
    const c = q.pop() as number, i = Math.floor(c / nz), j = c % nz;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const k = a * nz + b;
      if (free[k] && !seen[k]) { seen[k] = 1; q.push(k); }
    }
  }
  const failed: string[] = [];
  for (const [gx, gz] of goals) if (!seen[cell(gx, gz)]) failed.push(`(${gx.toFixed(1)}, ${gz.toFixed(1)})`);
  return { all: failed.length === 0, failed };
}

// the layout is the same for every fuel station / every charge-point size, so the lot checks run once per size; the per-site checks follow below
const fl = fuelLayout({ hw: 16, hd: 13 });
{
  const s = fuel[0], lot = lotOf(s);
  let out = 0;
  for (const p of fl.parts) if (!inside(partRect(p), lot)) out++;
  for (const p of fl.planes) if (!inside(partRect({ x: p.x, z: p.z, w: p.ry === Math.PI / 2 ? 0.02 : p.w, d: p.ry === Math.PI / 2 ? p.w : 0.02 }), lot)) out++;
  ok(out === 0, `fuel station: all ${fl.parts.length} parts + ${fl.planes.length} boards inside the 32 x 26 m lot (${out} outside)`);
  const solids = solidsOf(fl), hd = s.hd;
  const laneBlocked = solids.some((so) => [-STATION_LANE.x, STATION_LANE.x].some((cx) => Math.abs(so.cx - cx) < so.hx + STATION_LANE.half - 0.3 && so.cz + so.hz > 4));
  const corridor = solids.some((so) => Math.abs(so.cz) < so.hz + 2.2);
  ok(!laneBlocked && !corridor, 'fuel station: entry lane, exit lane and the island corridor carry no solid');
  const bays: [number, number][] = [];
  for (const iz of [-3, 3]) for (const sd of [-1, 1]) for (const px of [-1.8, 1.8]) bays.push([px, iz + sd * 2.0]);
  const unload: [number, number] = [(UNLOAD_BAY.x0 + UNLOAD_BAY.x1) / 2, (UNLOAD_BAY.z0 + UNLOAD_BAY.z1) / 2];
  const car = pathExists(s, 1.2, [[STATION_LANE.x, hd + 2.5], [0, 0], unload, ...bays]);
  ok(car.all, `fuel station: a car drives in, passes the corridor, reaches all 8 pump sides + the unload bay and the exit${car.failed.length ? ' - blocked: ' + car.failed.join(' ') : ''}`);
  const bus = pathExists(s, 1.5, [[STATION_LANE.x, hd + 2.5], [0, 0], unload]);
  ok(bus.all, `fuel station: a bus-size vehicle (1.5 m clearance) also drives through and reaches the unload bay${bus.failed.length ? ' - blocked: ' + bus.failed.join(' ') : ''}`);
  const post = fl.parts.find((p) => p.m === 'yellow' && p.solid && Math.abs(p.x - UNLOAD_BAY.postX) < 1e-6);
  const bay: LRect = [UNLOAD_BAY.x0, UNLOAD_BAY.x1, UNLOAD_BAY.z0, UNLOAD_BAY.z1];
  ok(inside(bay, lot) && !!post, 'fuel station: tanker unload bay + coupling post inside the lot');
  const paint = sitePaint(true, s, s.gap);
  ok(paint.yellow.length === 4 && paint.yellow.every((r) => inside(r, lot, 0.01)) && paint.white.every((r) => inside(r, lot, 0.01)), 'fuel station: yellow unload bay outline + lane paint inside the lot');
  ok(paint.asphalt.length === 3 && paint.asphalt.slice(1).every((r) => r[2] === hd && Math.abs(r[3] - hd - s.gap - 0.5) < 1e-9), 'fuel station: two paved driveway strips from the lot edge to the road shoulder');
}
for (const s of fuel) {
  const w = toWorld(s, (UNLOAD_BAY.x0 + UNLOAD_BAY.x1) / 2, (UNLOAD_BAY.z0 + UNLOAD_BAY.z1) / 2);
  const e = toWorld(s, -STATION_LANE.x, s.hd - 1);
  ok(fuelAreaAt(w.x, w.z)?.id === s.id && fuelAreaAt(e.x, e.z)?.id === s.id, `${s.id}: fuelAreaAt finds the unload bay and the entry lane (logic unchanged)`);
}

// ---------------------------------------------------------------- charge points
for (const c of [cps.find((s) => s.hw === 4)!, cps.find((s) => s.hw === 6)!]) {
  const lay = chargeLayout(c), rect = lotOf(c), bus = c.hw >= 6;
  const solids = solidsOf(lay);
  const hit = solids.filter((so) => overlap(solidFootprint(so), rect));
  const road = solids.filter((so) => so.cz + so.hz > c.hd - 0.01);
  ok(hit.length === 0 && road.length === 0, `charge point ${bus ? '12 x 3.5 m bus bay' : '8 x 4 m'}: stand-still rectangle + road side free of solids (${solids.length} solids, ${hit.length} inside)`);
  const slab = lay.parts.find((p) => p.m === 'solar');
  const low = slab ? slab.y - Math.sin(slab.rx ?? 0) * (c.hd - slab.z) - 0.06 : 0;
  ok(low >= 4.0, `charge point ${bus ? '(bus bay)' : ''}: solar canopy clears a bus (lowest underside over the bay ${low.toFixed(2)} m)`);
  const paint = sitePaint(false, c, c.gap);
  ok(paint.blue.length === 1 && paint.blueLines.length >= 3 && paint.white.length === 4, `charge point ${bus ? '(bus bay)' : ''}: blue EV strip, bolt logo, white bay outline`);
}

// ---------------------------------------------------------------- meshes, lazy build, lights, night
const gen = new TerrainGenerator(Config.world.seed);
const root = new THREE.Group();
const st = new StationStructures({ root, terrain: gen });
ok(st.stats.sites === 22 && st.stats.built === 0, '22 sites known, nothing built at the start (lazy)');
st.update(0, 0, 0);
ok(st.stats.built === 0, 'in the city: no site within build range');
const s0 = fuel[0];
st.update(s0.x, s0.z + 60, 0);
ok(st.stats.built === 1, `walking up to ${s0.id}: it is built (${st.stats.meshes} meshes)`);
const perFuel = st.stats.meshes;
st.update(s0.x + 3000, s0.z + 3000, 0);
ok(st.stats.built === 0 && st.stats.meshes === 0, 'far away: it is freed again');
st.buildAll();
let meshes = 0, tris = 0, lights = 0, finite = true;
root.traverse((o) => {
  if ((o as THREE.Light).isLight) lights++;
  const m = o as THREE.Mesh;
  if (!m.isMesh) return;
  meshes++;
  tris += (m.geometry.getIndex()?.count ?? m.geometry.getAttribute('position').count) / 3;
  const a = m.geometry.getAttribute('position');
  for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) finite = false;
});
const perCp = (root.getObjectByName(cps[0].id) as THREE.Group).children.length;
console.log(`  one fuel station ${perFuel} meshes, one charge point ${perCp} meshes; all 22 built: ${meshes} meshes, ${Math.round(tris)} triangles, ${lights} lights (in the game only the sites within ${450} m exist)`);
ok(finite && meshes === st.stats.meshes, 'all vertices finite, the mesh count matches the stats');
ok(perFuel <= 30 && perCp <= 20, `a single site is light (fuel ${perFuel}, charge ${perCp} meshes)`);
ok(lights === 0, 'no extra light sources (emissive only)');
const lit = st.litMaterials;
st.update(1e6, 1e6, 0);
const day = st.litMaterials.map((m) => m.emissiveIntensity);
st.update(1e6, 1e6, 1);
const night = st.litMaterials.map((m) => m.emissiveIntensity);
ok(lit.length >= 8 && night.every((v, i) => v > day[i]), `night: ${lit.length} emissive materials (canopy light, windows, screens, signs) brighter than by day`);

// ---------------------------------------------------------------- real colliders (Rapier), floating-origin local, sites far from the origin
const bus = new EventBus<EngineEvents>();
const physics = await PhysicsWorld.create(bus);
const origin = new FloatingOrigin(new THREE.Group(), bus as never);
origin.origin.set(120, 0, -300);
const sp = new SignPhysics(physics, origin, st.solidGroups);
ok(sp.total === 22 && st.solidGroups.every((g) => g.solids.length >= 4), `22 collider groups (${st.solidGroups.reduce((a, g) => a + g.solids.length, 0)} cuboids)`);
const R = physics.RAPIER;
const ray = (s: RoadStationSite, gi: number, ax: number, ay: number, az: number, bx: number, bz: number): number => {
  const g = st.solidGroups[gi];
  const wa = toWorld(s, ax, az), wb = toWorld(s, bx, bz);
  const dx = wb.x - wa.x, dz = wb.z - wa.z, L = Math.hypot(dx, dz);
  const h = physics.world.castRay(new R.Ray({ x: wa.x - origin.origin.x, y: g.y + ay, z: wa.z - origin.origin.z }, { x: dx / L, y: 0, z: dz / L }), L, true);
  return h ? h.timeOfImpact : -1;
};
sp.update(1, s0.x, s0.z);
physics.world.step();
ok(sp.activeCount >= 1 && sp.activeCount < sp.total, `near ${s0.id}: ${sp.activeCount} of ${sp.total} groups have bodies`);
for (const s of [fuel[0], fuel[3], fuel[7]]) { // three different road directions
  const gi = ROAD_STATION_SITES.indexOf(s), hd = s.hd;
  sp.update(1, s.x, s.z);
  physics.world.step();
  ok(ray(s, gi, -12, 1, 0, 12, 0) < 0, `${s.id}: ray along the island corridor (z = 0) is free`);
  ok(ray(s, gi, -STATION_LANE.x, 1, hd + 3, -STATION_LANE.x, -2) < 0 && ray(s, gi, STATION_LANE.x, 1, -2, STATION_LANE.x, hd + 3) < 0, `${s.id}: entry lane and exit lane are free`);
  const tp = ray(s, gi, -8, 1, 3, 8, 3);
  ok(tp > 3.5 && tp < 4.2, `${s.id}: a ray along the pump line hits the first column (after ${tp.toFixed(2)} m)`);
  const pump = ray(s, gi, -2.9, 1, 3, 2.9, 3);
  ok(pump > 0.2 && pump < 1.0, `${s.id}: the pump is solid (hit after ${pump.toFixed(2)} m)`);
  const tk = ray(s, gi, 9.5, 1.7, 0, 9.5, -12);
  ok(tk > 7 && tk < 9, `${s.id}: the kiosk is solid (hit after ${tk.toFixed(2)} m)`);
  const ty = ray(s, gi, 0, 1, hd + 3, 0, 0);
  ok(ty > 3 && ty < 5.5, `${s.id}: the pylon is solid (hit after ${ty.toFixed(2)} m)`);
  const tu = ray(s, gi, -12.7, 1, -5.2, -16, -5.2);
  ok(tu > 1.8 && tu < 2.9, `${s.id}: the tanker coupling post is solid, the bay in front of it is free (hit after ${tu.toFixed(2)} m)`);
  ok(ray(s, gi, -12.7, 1, -1.5, -12.7, -9.0) < 0, `${s.id}: nothing inside the tanker unload bay`);
}
for (const c of [cps[0], cps[2], cps[5], cps[8]]) {
  const gi = ROAD_STATION_SITES.indexOf(c), hd = c.hd, hw = c.hw;
  sp.update(1, c.x, c.z);
  physics.world.step();
  ok(ray(c, gi, -hw + 0.1, 1, 0, hw - 0.1, 0) < 0 && ray(c, gi, 0, 1, hd + 4, 0, -hd + 0.05) < 0, `${c.id}: the stand-still bay (along it and from the road side into it) is free`);
  const post = chargeLayout(c).parts.find((p) => p.m === 'charger') as { x: number; z: number };
  const th = ray(c, gi, post.x, 1, hd + 2, post.x, -hd - 2);
  ok(th > 0 && th < hd * 2 + 5, `${c.id}: the charger post is solid (hit after ${th.toFixed(2)} m)`);
}
sp.update(1, -9000, -9000);
ok(sp.activeCount === 0, 'far away from every site: no bodies (colliders only near the player)');
sp.dispose();
st.dispose();
console.log(bad === 0 ? 'ALL PASS' : `${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
