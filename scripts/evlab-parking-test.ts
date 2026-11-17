// EVLab Step 7 + R3: the parking lot (layout, slots, no clash with the lake / ring road / bridges / trees, flat ground; Step R3: it stands in the parking strip east of the plot, the entry road ends at the pavement edge of the N arm of J1).
import * as THREE from 'three';
const ctxProxy = (): unknown => new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true });
(globalThis as unknown as { document: unknown }).document = { createElement: (tag: string) => (tag === 'canvas' ? { width: 0, height: 0, getContext: ctxProxy, style: {} } : { style: {} }) };
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { BRIDGES, GATE_Z, LAKE, RING, inLake, parkTrees, sdRR } from '../src/evlab/EVLabCampus';
import { EVLAB_GATE_ROADS, EVLAB_PARKING_STRIP, EVLAB_PLOT, J1_ARM_HALF_PAVEMENT, evlabKeepout, localToWorld } from '../src/evlab/EVLabSite';
import { BAY, BAYS_PER_ROW, CROSS_Z, DRIVE, DRIVE_END, DRIVE_LEN, DRIVE_PTS, LINK, LOT, ROWS, SLOTS, WALK_GAP, driveDist, inParkingZone, kerbRects, paintRects } from '../src/evlab/EVLabParking';

let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const W = (x: number, z: number): [number, number] => localToWorld(x, z); // Step R0d: turned frame

// 1 the layout numbers agree with the campus
ok(LINK.z === GATE_Z, `walkway z (${LINK.z}) = the bridge line GATE_Z (${GATE_Z})`);
const E = BRIDGES.find((b) => b.id === 'E')!;
ok(E.across === LINK.z && E.w / 2 === LINK.halfW, 'the east bridge is on the walkway line and 16 m wide');
ok(LOT.x0 === E.to + 1, `the lot starts 1 m beyond the end of the east bridge deck (x ${LOT.x0})`);
ok(DRIVE.z0 === LOT.z1 && DRIVE.x > LOT.x0 && DRIVE.x < LOT.x1, 'entry road leaves the south edge of the lot, inside its width');
// the arm: J1 (-87, -277), N arm direction (0.609, -0.793); its pavement is 44.2 m wide, the straight part (s < 315) is what the road meets
const [ex, ez0] = W(DRIVE_END[0], DRIVE_END[1]);
const gE = EVLAB_GATE_ROADS.find((g) => g.id === 'E')!;
ok(Math.abs(gE.pts[gE.pts.length - 1][0] - ex) < 1e-6 && Math.abs(gE.pts[gE.pts.length - 1][1] - ez0) < 1e-6 && Math.abs(gE.pts[0][0] - W(DRIVE_PTS[0][0], 0)[0]) < 1e-6, 'the E gate road of the site is the entry road (same end points)');
const armN = [0.609, -0.793], armS = (ex + 87) * armN[0] + (ez0 + 277) * armN[1], armD = Math.abs((ex + 87) * -armN[1] + (ez0 + 277) * armN[0]);
ok(armS > 0 && armS < 315 && armD >= J1_ARM_HALF_PAVEMENT && armD <= J1_ARM_HALF_PAVEMENT + 4, `entry road ends ${armD.toFixed(1)} m from the N arm's centre line (pavement edge ${J1_ARM_HALF_PAVEMENT} m), ${armS.toFixed(0)} m along the arm`);
ok(DRIVE_LEN > 60 && DRIVE_LEN < 110, `entry road is ${DRIVE_LEN.toFixed(0)} m long`);
{
  // it bends smoothly: no turn of more than 15 degrees between two neighbouring pieces
  let worst = 0;
  for (let i = 2; i < DRIVE_PTS.length; i++) {
    const a = Math.atan2(DRIVE_PTS[i - 1][0] - DRIVE_PTS[i - 2][0], DRIVE_PTS[i - 1][1] - DRIVE_PTS[i - 2][1]), b = Math.atan2(DRIVE_PTS[i][0] - DRIVE_PTS[i - 1][0], DRIVE_PTS[i][1] - DRIVE_PTS[i - 1][1]);
    worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))));
  }
  ok(worst < (15 * Math.PI) / 180, `the entry road bends smoothly (worst turn ${((worst * 180) / Math.PI).toFixed(1)} deg)`);
  ok(driveDist(DRIVE.x, DRIVE.z0 + 1) < 1e-6 && driveDist(DRIVE_END[0], DRIVE_END[1]) < 1e-6, 'driveDist is 0 on the centre line');
}

// 2 inside the flat parking strip, away from the lake, the island and the ring road
const [wx0, wz0] = W(LOT.x0, LOT.z0), [wx1, wz1] = W(LOT.x1, LOT.z1);
ok(LOT.x0 >= EVLAB_PARKING_STRIP.x0 && LOT.x1 <= EVLAB_PARKING_STRIP.x1 && LOT.z0 >= EVLAB_PLOT.z0 && LOT.z1 <= EVLAB_PLOT.z1, `lot is on the parking strip (building-local; world x ${wx0.toFixed(0)}..${wx1.toFixed(0)}, z ${wz0.toFixed(0)}..${wz1.toFixed(0)})`);
let minLake = 1e9, minRing = 1e9, wet = 0;
for (let x = LOT.x0; x <= LOT.x1; x += 1) for (let z = LOT.z0; z <= LOT.z1; z += 1) {
  minLake = Math.min(minLake, sdRR(x, z, LAKE)); // > 0 = outside the lake's outer edge
  minRing = Math.min(minRing, Math.abs(sdRR(x, z, RING)) - RING.halfW);
  if (inLake(x, z, -2)) wet++;
}
ok(wet === 0 && minLake > 5, `lot is clear of the lake (nearest lake edge ${minLake.toFixed(1)} m away)`);
ok(minRing > 20, `lot is far from the ring road (${minRing.toFixed(1)} m)`);

// 3 the bays
const eps = 1e-6;
ok(ROWS.length === 4, 'four rows of bays');
ok(SLOTS.length >= 90, `${SLOTS.length} bays (>= 90)`);
const ids = new Set(SLOTS.map((s) => s.id));
ok(ids.size === SLOTS.length, 'every bay has its own id');
let inside = true, overlap = 0;
for (const s of SLOTS) {
  if (s.x - s.d / 2 < LOT.x0 - eps || s.x + s.d / 2 > LOT.x1 + eps || s.z - s.w / 2 < LOT.bayZ0 - eps || s.z + s.w / 2 > LOT.bayZ1 + eps) inside = false;
}
for (let i = 0; i < SLOTS.length; i++) for (let j = i + 1; j < SLOTS.length; j++) {
  const a = SLOTS[i], b = SLOTS[j];
  if (Math.abs(a.x - b.x) < a.d - eps && Math.abs(a.z - b.z) < a.w - eps) overlap++;
}
ok(inside, 'every bay is inside the lot');
ok(overlap === 0, `no two bays overlap (${overlap})`);
ok(BAY.w >= 2.5 && BAY.d >= 4.5 && BAY.aisle >= 6, 'bays are 2.5 x 4.5 m or bigger, aisles 6 m or wider');
// aisles stay free: no bay centre inside an aisle, and the cross aisle is clear of bays
const aisleOk = SLOTS.every((s) => s.z + s.w / 2 <= CROSS_Z - 1);
ok(aisleOk, 'the cross aisle (south end) has no bays');
// the walkway from the promenade is not blocked
const blocked = SLOTS.filter((s) => s.row === 'A' && s.z + s.w / 2 > LINK.z - LINK.halfW && s.z - s.w / 2 < LINK.z + LINK.halfW);
ok(blocked.length === 0, 'no bay blocks the promenade walkway (row A gap)');
ok(WALK_GAP[0] < LINK.z - LINK.halfW && WALK_GAP[1] > LINK.z + LINK.halfW, 'the gap is as wide as the promenade');
// nose-in: yaw points to the aisle
const faceOk = SLOTS.every((s) => { const r = ROWS.find((q) => q.id === s.row)!; return Math.sign(Math.sin(s.yaw)) === r.face; });
ok(faceOk, 'each bay faces its aisle (nose-in)');
ok(BAYS_PER_ROW >= 24, `${BAYS_PER_ROW} bays per row`);

// 4 paint / kerb geometry stays on the lot
const onLot = (r: number[]): boolean => r[0] >= LOT.x0 - eps && r[1] <= LOT.x1 + eps && r[2] >= LOT.z0 - eps && r[3] <= LOT.z1 + eps;
ok(paintRects().every(onLot) && kerbRects().every(onLot), `paint (${paintRects().length}) and kerb (${kerbRects().length}) rectangles are all on the lot`);
// the kerb leaves the entry road and the walkway open
const gap = (cx: number, cz: number): boolean => kerbRects().some((r) => cx >= r[0] && cx <= r[1] && cz >= r[2] && cz <= r[3]);
ok(!gap(DRIVE.x, LOT.z1 - 0.1) && !gap(LOT.x0 + 0.1, LINK.z), 'kerb is open at the entry road and at the walkway');

// 5 no park tree on the lot / entry road
const bad = parkTrees().filter((t) => inParkingZone(t.x, t.z, 3));
ok(bad.length === 0, `no park tree on or within 3 m of the lot / entry road (${bad.length})`);
ok(parkTrees().length > 100, `the rest of the park is still there (${parkTrees().length} trees)`);

// 6 terrain: flat under the lot and the whole entry road (the strip + the E gate road are one level pad), no main road on it, keep-out for local streets
const gen = new TerrainGenerator(Config.world.seed);
const e = gen.evlab;
let mn = 1e9, mx = -1e9;
for (let x = LOT.x0; x <= LOT.x1; x += 2) for (let z = LOT.z0; z <= LOT.z1; z += 2) { const [wx, wz] = W(x, z); const h = gen.heightAt(wx, wz); mn = Math.min(mn, h); mx = Math.max(mx, h); }
ok(mx - mn < 0.001, `ground under the lot is flat (range ${(mx - mn).toFixed(4)} m)`);
// near the arm the natural ground is shaped by the arm's own embankment (it is 1 .. 2 m off the pad at the pavement edge): Step R6 blends the two; the road is level with the lot
// while it is more than 55 m from the arm's centre line
const armDist = (wx: number, wz: number): number => Math.abs((wx + 87) * 0.793 + (wz + 277) * 0.609);
let dmn = 1e9, dmx = -1e9, dWorst = 0, onRoad = 0, dEnd = 0;
for (let i = 0; i < DRIVE_PTS.length; i++) {
  const a = DRIVE_PTS[Math.max(0, i - 1)], b = DRIVE_PTS[Math.min(DRIVE_PTS.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
  for (const o of [-DRIVE.halfW, 0, DRIVE.halfW]) {
    const [wx, wz] = W(DRIVE_PTS[i][0] + nx * o, DRIVE_PTS[i][1] + nz * o);
    const h = gen.heightAt(wx, wz) - (e.floorY - 0.03);
    if (armDist(wx, wz) > 55) { dmn = Math.min(dmn, h); dmx = Math.max(dmx, h); dWorst = Math.max(dWorst, Math.abs(h)); } else dEnd = Math.max(dEnd, Math.abs(h));
    if (i < DRIVE_PTS.length - 3 && gen.roads.surfaceAt(wx, wz) !== 0) onRoad++;
  }
}
ok(dmx - dmn < 0.05 && dWorst < 0.05, `ground under the entry road is level with the lot while > 55 m from the arm (range ${(dmx - dmn).toFixed(3)} m, worst ${dWorst.toFixed(3)} m)`);
ok(dEnd < 2.5, `in the last stretch the ground is at most ${dEnd.toFixed(2)} m off the pad (arm embankment; Step R6 blends it)`);
ok(onRoad === 0, `no main road / rail on the lot or its entry road before the arm (${onRoad} hits)`);
ok(evlabKeepout(ex, ez0 - 10) && evlabKeepout(...W(LOT.x0 + 5, 40)), 'local streets are kept out of the lot and the entry road');
ok(e.contains(ex, ez0) && e.contains(...W(DRIVE.x, DRIVE.z0 + 20)), 'no grass / trees / rocks on the entry road strip');

// 7 the meshes build, and the entry road follows the ground
{
  const { Kit } = await import('../src/structures');
  const { Parts } = await import('../src/evlab/EVLabParts');
  const { makeTextures } = await import('../src/evlab/EVLabTextures');
  const { buildParkingLot } = await import('../src/evlab/EVLabParkingLot');
  const kit = new Kit();
  const parts = new Parts(kit, makeTextures(kit));
  const ground = (x: number, z: number): number => { const [wx, wz] = W(x, z); return gen.heightAt(wx, wz) - e.floorY; };
  const lot = buildParkingLot(parts, new THREE.MeshBasicMaterial(), ground);
  let meshes = 0, tris = 0;
  lot.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { meshes++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3; } });
  ok(meshes <= 12, `lot is a handful of meshes (${meshes}, ${tris} triangles): asphalt, paint, 6 kerbs, entry road`);
  const road = lot.group.children[lot.group.children.length - 1] as THREE.Mesh;
  const p = road.geometry.getAttribute('position');
  const y0 = p.getY(0), yEnd = p.getY(p.count - 1);
  ok(Math.abs(y0 - 0.05) < 0.01, `entry road starts at the lot level (y ${y0.toFixed(3)})`);
  ok(Math.abs(yEnd - (ground(DRIVE_END[0], DRIVE_END[1]) + 0.08)) < 0.01, `entry road ends on the ground at the arm (y ${yEnd.toFixed(2)})`);
  ok(lot.lamps.length >= 4 && lot.lamps.every(([x, z]) => x >= LOT.x0 && x <= LOT.x1 && z >= LOT.z0 && z <= LOT.z1), `${lot.lamps.length} lamp posts, all on the lot`);
}

console.log(fails ? 'FAILED ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);
