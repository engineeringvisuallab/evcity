// Headless check of EVLab Tower: every builder runs (with a fake canvas), the numbers are sane, and you can WALK from the street through the
// portal, the lobby, up the entrance ramp, down the aisle and onto the stage behind the lectern. Run: npm run test:tower
import * as THREE from 'three';

// ---- a canvas that draws nothing (no DOM in node)
const ctxProxy = (): unknown =>
  new Proxy({}, {
    get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 10 }) : () => undefined),
    set: () => true,
  });
(globalThis as unknown as { document: unknown }).document = {
  createElement: (tag: string) => (tag === 'canvas' ? { width: 0, height: 0, getContext: ctxProxy, style: {} } : { style: {} }),
};

const { Kit } = await import('../src/structures');
const { Parts } = await import('../src/evlab/EVLabParts');
const { makeTextures } = await import('../src/evlab/EVLabTextures');
const { buildShell } = await import('../src/evlab/EVLabShell');
const { buildLobby } = await import('../src/evlab/EVLabLobby');
const { buildHall } = await import('../src/evlab/EVLabHall');
const { buildGrounds } = await import('../src/evlab/EVLabGrounds');
const { makeTowerTextures } = await import('../src/evlab/EVLabTowerTextures');
const { buildFacade } = await import('../src/evlab/EVLabFacade');
const { buildCore } = await import('../src/evlab/EVLabCore');
const { makeLevelBuilder } = await import('../src/evlab/EVLabFloors');
const { LiftSystem } = await import('../src/evlab/EVLabLifts');
const { TowerView } = await import('../src/evlab/EVLabTowerView');
const TL = await import('../src/evlab/EVLabTowerLayout');
const L = await import('../src/evlab/EVLabLayout');

let fail = 0;
const ok = (c: boolean, m: string): void => {
  if (!c) {
    fail++;
    console.error('FAIL', m);
  }
};

const kit = new Kit();
const parts = new Parts(kit, makeTextures(kit));
const shell = buildShell(parts);
const lobby = buildLobby(parts);
const hall = buildHall(parts);
const grounds = buildGrounds(parts);
const TT = makeTowerTextures(kit);
const facade = buildFacade(parts, TT);
const all = new THREE.Group();
all.add(shell.group, facade.group, lobby.group, hall.group, grounds.group);

function stats(g: THREE.Object3D): { meshes: number; instanced: number; tris: number } {
  let meshes = 0, instanced = 0, tris = 0;
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry;
    const t = (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
    const n = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
    if ((m as THREE.InstancedMesh).isInstancedMesh) instanced++;
    meshes++;
    tris += t * n;
    const p = geo.getAttribute('position');
    for (let i = 0; i < Math.min(p.count, 50); i++) if (!Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))) ok(false, `non-finite vertex in ${m.name || 'mesh'}`);
  });
  return { meshes, instanced, tris: Math.round(tris) };
}
for (const [name, g] of [['shell', shell.group], ['lobby', lobby.group], ['hall', hall.group], ['grounds', grounds.group], ['facade', facade.group]] as const) {
  const s = stats(g);
  console.log(`${name.padEnd(8)} ${String(s.meshes).padStart(4)} meshes (${s.instanced} instanced)  ${String(s.tris).padStart(8)} triangles`);
}
const box = new THREE.Box3().setFromObject(all);
const farTris = stats(shell.group).tris + stats(facade.group).tris;
console.log(`far view (podium + tower): ${farTris} triangles`);
ok(farTris <= 120000, 'exterior far view must stay under about 120k triangles');
console.log(`tower height ${box.max.y.toFixed(0)} m, footprint ${(box.max.x - box.min.x).toFixed(0)} x ${(box.max.z - box.min.z).toFixed(0)} m`);
ok(box.max.y >= 300, 'the tower must be at least 300 m high');
console.log(`audience: ${hall.audience.peopleCount} people on ${hall.audience.seatCount} seats`);
ok(hall.audience.peopleCount > 1000, 'a crowded hall');

const tcore = TL.coreColliders();
const solids = [...shell.solids, ...lobby.solids, ...hall.solids, ...tcore.solids];
for (const s of solids) ok(s[0] < s[1] && s[2] < s[3] && s[4] < s[5] && s.every(Number.isFinite), `bad solid ${s.join(',')}`);
console.log(`${solids.length} colliders + ${lobby.ramps.length + hall.ramps.length} ramps`);

// ---- can you walk it? 2D flood fill with the player's radius, using the floor height of every cell
const CELL = 0.5, R = 0.45;
const ramps = [...lobby.ramps, ...hall.ramps];
const allRamps = [...ramps, ...tcore.ramps];
function floorAt(x: number, z: number): number {
  for (const r of ramps) {
    if (x >= r.x0 && x <= r.x1 && z >= Math.min(r.zA, r.zB) && z <= Math.max(r.zA, r.zB)) return r.yA + ((z - r.zA) / (r.zB - r.zA)) * (r.yB - r.yA);
  }
  const { HALL, DIVIDER, REAR_Y, hallFloorY } = L;
  if (x > HALL.x0 && x < HALL.x1 && z > HALL.z0 && z < DIVIDER.z - 0.5) {
    if (Math.abs(x) < HALL.stageX && z < HALL.stageZ1) return HALL.stageH;
    return z > HALL.slopeZ1 ? REAR_Y : hallFloorY(z);
  }
  if (z >= DIVIDER.z - 0.5 && z <= DIVIDER.z + 0.5 && DIVIDER.openings.some(([a, b]) => x >= a && x <= b)) return REAR_Y;
  return 0;
}
const blocked = (x: number, z: number): boolean => {
  const f = floorAt(x, z);
  return solids.some((s) => x > s[0] - R && x < s[1] + R && z > s[2] - R && z < s[3] + R && s[4] < f + 1.8 && s[5] > f + 0.4);
};
const X0 = -90, X1 = 90, Z0 = -55, Z1 = 75;
const W = Math.round((X1 - X0) / CELL) + 1, D = Math.round((Z1 - Z0) / CELL) + 1;
const idx = (x: number, z: number): number => Math.round((z - Z0) / CELL) * W + Math.round((x - X0) / CELL);
const seen = new Uint8Array(W * D);
const start: [number, number] = [0, 65];
const q: Array<[number, number]> = [start];
seen[idx(...start)] = 1;
while (q.length) {
  const [x, z] = q.pop()!;
  for (const [dx, dz] of [[CELL, 0], [-CELL, 0], [0, CELL], [0, -CELL]] as const) {
    const nx = x + dx, nz = z + dz;
    if (nx < X0 || nx > X1 || nz < Z0 || nz > Z1 || seen[idx(nx, nz)]) continue;
    if (blocked(nx, nz)) continue;
    if (Math.abs(floorAt(nx, nz) - floorAt(x, z)) > 0.3) continue;
    seen[idx(nx, nz)] = 1;
    q.push([nx, nz]);
  }
}
const reach = (x: number, z: number): boolean => seen[idx(x, z)] === 1;
ok(reach(0, 40), 'lobby: reachable from the street through the portal');
ok(reach(-60, 30) && reach(60, 30), 'lobby: both lounges reachable');
ok(reach(0, 10), 'hall: the rear aisle is reachable (entrance ramp)');
ok(reach(-15, -10) && reach(15, -10), 'hall: the aisles lead down to the front');
ok(reach(0, -27), 'hall: the front of the hall is reachable');
ok(reach(0, -34.8), `stage: the spot behind the lectern is reachable (${L.PRESENTER.x}, ${L.PRESENTER.z})`);
ok(reach(65, -30) && reach(-65, -30), 'galleries: reachable from the lobby');
ok(!reach(0, -20), 'seat blocks must block (centre of a row)');

// ---- every ramp collider: the TOP face of the tilted cuboid must pass through both ends of the ramp
for (const r of allRamps) {
  const p = L.rampPose(r);
  const q = new THREE.Quaternion(p.qx, 0, 0, p.qw);
  const end = (sign: number): THREE.Vector3 => new THREE.Vector3(0, p.hy, sign * p.hz).applyQuaternion(q).add(new THREE.Vector3(p.cx, p.cy, p.cz));
  const e1 = end(-1), e2 = end(1);
  const lo = r.zA <= r.zB ? [r.zA, r.yA, r.zB, r.yB] : [r.zB, r.yB, r.zA, r.yA];
  ok(Math.abs(e1.z - lo[0]) < 0.35 && Math.abs(e1.y - lo[1]) < 0.05, `ramp (z ${r.zA} -> ${r.zB}): low end is at (${e1.z.toFixed(2)}, ${e1.y.toFixed(2)})`);
  ok(Math.abs(e2.z - lo[2]) < 0.35 && Math.abs(e2.y - lo[3]) < 0.05, `ramp (z ${r.zA} -> ${r.zB}): high end is at (${e2.z.toFixed(2)}, ${e2.y.toFixed(2)})`);
}

// ---- hall data
ok(L.HALL.x1 - L.HALL.x0 >= 100 && L.HALL.z1 - L.HALL.z0 >= 60, 'the hall is big (100 x 60 m or more)');
ok(L.BLD.hx * 2 === 150 && L.BLD.hz * 2 === 100, 'footprint 150 x 100 m');
// ======================================================= v1.3 tower: the core, the stairs, the lifts, the floors
const PR = 0.4; // player radius with a margin
type Box = readonly [number, number, number, number, number, number];
const hitBox = (b: Box, x: number, z: number, fy: number): boolean => x > b[0] - PR && x < b[1] + PR && z > b[2] - PR && z < b[3] + PR && b[4] < fy + 1.8 && b[5] > fy + 0.35;
const hitObb = (o: { cx: number; cz: number; hx: number; hz: number; yaw: number; y0: number; y1: number }, x: number, z: number, fy: number): boolean => {
  const dx = x - o.cx, dz = z - o.cz, c = Math.cos(o.yaw), sn = Math.sin(o.yaw);
  const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
  return Math.abs(lx) < o.hx + PR && Math.abs(lz) < o.hz + PR && o.y0 < fy + 1.8 && o.y1 > fy + 0.35;
};
const podiumSolids = [...shell.solids, ...lobby.solids];
// per-level solids (slab, furniture) + obbs
const lv = new Map<number, ReturnType<typeof TL.levelSolids>>();
for (let n = 1; n <= TL.T.roof; n++) lv.set(n, TL.levelSolids(n));
for (const [n, c] of lv) for (const b of c.solids) ok(b[0] < b[1] && b[2] < b[3] && b[4] < b[5] && b.every(Number.isFinite), `level ${n}: bad solid ${b.join(',')}`);
for (const b of tcore.solids) ok(b[0] < b[1] && b[2] < b[3] && b[4] < b[5] && b.every(Number.isFinite), `core: bad solid ${b.join(',')}`);
console.log(`tower: ${tcore.solids.length} core solids, ${tcore.ramps.length} stair ramps, ${[...lv.values()].reduce((a, c) => a + c.solids.length + c.obbs.length, 0)} level colliders`);
ok(TL.levelY(TL.T.roof) > 300, 'roof garden above 300 m');
ok(FLOORS_OK(), 'floor directory complete');
function FLOORS_OK(): boolean { return TL.FLOORS.length === TL.T.roof + 1 && TL.FLOORS.every((f, i) => f.level === i && f.name.length > 0); }

// ---- a point is blocked at floor height fy (core + podium + the level's own solids)
const blockedAt = (x: number, z: number, fy: number, n: number): boolean => {
  if (tcore.solids.some((b) => hitBox(b, x, z, fy))) return true;
  if (n === 0 && podiumSolids.some((b) => hitBox(b, x, z, fy))) return true;
  if (n >= 1 && podiumSolids.some((b) => b[4] >= 17 && hitBox(b, x, z, fy))) return true;
  const c = lv.get(n);
  return !!c && (c.solids.some((b) => hitBox(b, x, z, fy)) || c.obbs.some((o) => hitObb(o, x, z, fy)));
};
/** Walk a polyline at a constant step; heights come from `fy(t)`. Returns the first blocked point or null. */
function walk(path: Array<[number, number, number]>, n: number, step = 0.2): string | null {
  for (let i = 0; i + 1 < path.length; i++) {
    const [x0, z0, y0] = path[i], [x1, z1, y1] = path[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0), cnt = Math.max(1, Math.ceil(len / step));
    for (let j = 0; j <= cnt; j++) {
      const f = j / cnt, x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f, y = y0 + (y1 - y0) * f;
      if (blockedAt(x, z, y, n)) return `blocked at (${x.toFixed(2)}, ${z.toFixed(2)}) y ${y.toFixed(2)}`;
    }
  }
  return null;
}

// ---- stairs: every storey of both stairs, door to landing, flights, mid landing
let stairFails = 0;
for (const s of TL.STAIRS) {
  const [a0, a1] = TL.flightX(s, 1), [b0, b1] = TL.flightX(s, 2);
  const ax = (a0 + a1) / 2, bx = (b0 + b1) / 2, zN = TL.ST.zN + 1.0, zS = TL.ST.flightZ1, zM = TL.ST.flightZ0;
  for (let i = 0; i + 1 < TL.STOPS.length; i++) {
    const y0 = TL.STOPS[i], y1 = TL.STOPS[i + 1], hm = (y0 + y1) / 2;
    const lvl = Math.max(0, TL.levelAtY(y0 + 0.3));
    const nLevel = y0 < TL.T.y1 - 0.5 ? 0 : lvl;
    const r = walk([[ax, 39, y0], [ax, zS, y0], [ax, zM, hm], [ax, zN, hm], [bx, zN, hm], [bx, zM, hm], [bx, zS, y1], [bx, 39, y1]], nLevel);
    if (r) { stairFails++; if (stairFails < 6) console.error(`FAIL ${s.name} storey ${i} (y ${y0.toFixed(1)} -> ${y1.toFixed(1)}): ${r}`); }
  }
  // the doors at every level
  for (let n = 0; n <= TL.T.roof; n++) {
    const y = TL.levelY(n);
    const r = walk([[s.doorX, 43.2, y], [s.doorX, 39.5, y], [ax, 39.5, y]], n);
    if (r) { stairFails++; if (stairFails < 6) console.error(`FAIL ${s.name} door at level ${n}: ${r}`); }
  }
}
ok(stairFails === 0, `${stairFails} stair walk failures`);
// ramp / landing heights match
for (const s of TL.STAIRS) {
  const rs = tcore.ramps.filter((r) => { const [a0, a1] = TL.flightX(s, 1), [b0, b1] = TL.flightX(s, 2); return (r.x0 === a0 && r.x1 === a1) || (r.x0 === b0 && r.x1 === b1); });
  ok(rs.length === (TL.STOPS.length - 1) * 2, `${s.name}: ${rs.length} flights`);
  for (const r of rs) { const sl = Math.abs(Math.atan2(Math.abs(r.yB - r.yA), Math.abs(r.zB - r.zA))) * 180 / Math.PI; ok(sl < 35, `${s.name}: flight too steep (${sl.toFixed(1)} deg)`); }
}

// ---- the glass lift doors: a gap wide enough, on every level; the blockers cover the doorway
for (const l of TL.LIFTS) {
  ok(2 * l.doorHalf >= 1.4, `${l.name}: doorway wide enough`);
  for (const n of [0, 1, 2, 30, TL.T.top, TL.T.roof]) {
    const y = TL.levelY(n);
    ok(walk([[l.cx, 43.2, y], [l.cx, 40.0, y], [l.cx, 38.6, y]], n) === null, `${l.name}: you can walk from the landing into the cabin at level ${n}`);
    ok(walk([[l.cx + (l.id === 0 ? -3.2 : 3.2), 43.2, y], [l.cx + (l.id === 0 ? -3.2 : 3.2), 40.0, y]], n) !== null, `${l.name}: the shaft wall beside the door blocks (level ${n})`);
  }
}
ok(tcore.landing.length === 2 * (TL.T.roof + 1), 'a door blocker for every lift on every level');

// ---- the lift cars: timing, speed, doors, blockers
{
  const state = new Map<string, boolean>();
  const poses = [0, 0];
  const cabDoor = [true, true];
  const host = {
    landingBlock: (lift: number, level: number, b: boolean) => { state.set(`${lift}:${level}`, b); },
    cabinPose: (lift: number, y: number) => { poses[lift] = y; },
    cabinDoorBlock: (lift: number, b: boolean) => { cabDoor[lift] = b; },
  };
  const sys = new LiftSystem(host);
  ok(state.get('0:0') === false && state.get('0:5') === true, 'lift 1 starts open at the ground, closed everywhere else');
  const car = sys.call(TL.T.top);
  ok(car.id === 0 || car.id === 1, 'a car answers the call');
  let t = 0, vmax = 0, prevY = 0, prevV = 0, amax = 0, closedMoving = true;
  const dt = 1 / 60;
  let guard = 0;
  while (guard++ < 60 * 200) {
    sys.update(dt, () => false);
    t += dt;
    vmax = Math.max(vmax, Math.abs(car.v));
    amax = Math.max(amax, Math.abs(car.v - prevV) / dt);
    prevV = car.v;
    if (car.state === 'moving' && (car.door > 0 || !cabDoor[car.id])) closedMoving = false;
    if (car.state === 'moving' && [...state.entries()].some(([k, b]) => k.startsWith(`${car.id}:`) && !b)) closedMoving = false;
    prevY = car.y;
    if (car.level === TL.T.top && car.state === 'open') break;
  }
  void prevY;
  console.log(`lift: ground -> level ${TL.T.top} in ${t.toFixed(1)} s, top speed ${vmax.toFixed(2)} m/s, max acceleration ${amax.toFixed(2)} m/s^2`);
  ok(car.level === TL.T.top && car.state === 'open', `the lift reaches level ${TL.T.top} with open doors`);
  ok(Math.abs(car.y - TL.levelY(TL.T.top)) < 0.001, 'the cabin stops exactly at the floor height');
  ok(vmax <= 6.01 && vmax > 5.5, `the cruise speed is about 6 m/s (${vmax.toFixed(2)})`);
  ok(amax < 2.2, `smooth acceleration (${amax.toFixed(2)} m/s^2)`);
  ok(t > 45 && t < 95, `a sensible trip time (${t.toFixed(1)} s)`);
  ok(closedMoving, 'doors and landing blockers are closed while moving');
  ok(state.get(`${car.id}:${TL.T.top}`) === false && state.get(`${car.id}:0`) === true && cabDoor[car.id] === false, 'at the top: only the top-level doorway is open');
  // never closes on somebody standing in the doorway
  const c2 = sys.cars[1 - car.id];
  c2.request(10); 
  for (let i = 0; i < 600; i++) sys.update(dt, () => true);
  ok(c2.state === 'open' && c2.level === 0, 'a car with someone in the doorway stays open');
  for (let i = 0; i < 60 * 40; i++) sys.update(dt, () => false);
  ok(c2.level === 10 && c2.state === 'open', 'after the doorway is free the car goes (level 10)');
}

// ---- riding: the player in the cabin is carried, nothing falls
{
  const state = new Map<string, boolean>();
  const host = { landingBlock: (l: number, n: number, b: boolean) => { state.set(`${l}:${n}`, b); }, cabinPose: () => undefined, cabinDoorBlock: () => undefined };
  const pl = new THREE.Vector3(TL.LIFTS[0].cx, 0.9 + 0.03, 39);
  const io = { teleportLocal: (x: number, y: number, z: number) => pl.set(x, y, z) };
  const view = new TowerView(parts, TT, host, io, null);
  view.lifts.cars[0].request(40);
  let guard = 0, maxGap = 0;
  while (guard++ < 60 * 120) {
    const before = pl.y;
    view.update(1 / 60, pl);
    void before;
    const car = view.lifts.cars[0];
    if (view.riding === 0 && !car.walkable) maxGap = Math.max(maxGap, Math.abs(pl.y - 0.9 - 0.03 - car.y));
    if (car.level === 40 && car.state === 'open') break;
  }
  ok(view.lifts.cars[0].level === 40, 'the ridden car arrives at level 40');
  ok(maxGap < 0.1, `the rider stays on the cabin floor (max gap ${maxGap.toFixed(3)} m)`);
  ok(Math.abs(pl.y - 0.9 - TL.levelY(40)) < 0.2, `the rider ends at the level-40 floor (y ${pl.y.toFixed(2)})`);
  ok(view.level === 40 || view.level === 39 || view.level === 41, 'the view follows the rider\'s level');
  // landing call at a level
  pl.set(0, TL.levelY(12) + 0.93, 44);
  view.update(1 / 60, pl);
  ok(view.landingLevel(pl) === 12, 'at a landing the call button works');
  view.dispose();
}

// ---- every level builds, within a triangle budget; core pieces too
{
  const build = makeLevelBuilder(parts, TT);
  const core = buildCore(parts, TT);
  let worst = 0, total = 0;
  for (let n = 1; n <= TL.T.roof; n++) {
    const v = build(n);
    const piece = core.levelPieces(n);
    const tr = stats(v.group).tris + stats(piece).tris;
    worst = Math.max(worst, tr); total += tr;
  }
  const podiumCore = stats(core.group).tris;
  console.log(`levels: worst ${worst} triangles per level (floor + core), core+podium stairs ${podiumCore}, 5 levels around the player ${Math.round(worst * 5.5)}`);
  ok(worst < 40000, 'a level stays under 40k triangles');
  ok(podiumCore < 120000, 'the permanent core stays light');
  void total;
}

// ---- walk each sample floor: from the lift lobby to the wings, the core corridor, and nothing leaks through the glass wall
for (const n of [1, 2, 15, 33, 45, 55, 85, 86, TL.T.top, TL.T.roof]) {
  const y = TL.levelY(n), ring = TL.ringOf(n), c = lv.get(n)!;
  void c;
  const C2 = 0.5, X0 = -85, X1 = 85, Z0 = 10, Z1 = 62;
  const Wc = Math.round((X1 - X0) / C2) + 1, Dc = Math.round((Z1 - Z0) / C2) + 1;
  const id = (x: number, z: number): number => Math.round((z - Z0) / C2) * Wc + Math.round((x - X0) / C2);
  const seen2 = new Uint8Array(Wc * Dc);
  const st: Array<[number, number]> = [[0, 43.2]];
  seen2[id(0, 43.2)] = 1;
  let leak = 0, cells = 0, free = 0;
  while (st.length) {
    const [x, z] = st.pop()!;
    cells++;
    if (!TL.inRing(ring, x, z, 0.2)) leak++;
    for (const [dx, dz] of [[C2, 0], [-C2, 0], [0, C2], [0, -C2]] as const) {
      const nx = x + dx, nz = z + dz;
      if (nx < X0 || nx > X1 || nz < Z0 || nz > Z1 || seen2[id(nx, nz)]) continue;
      if (blockedAt(nx, nz, y, n)) continue;
      seen2[id(nx, nz)] = 1;
      st.push([nx, nz]);
    }
  }
  for (let x = X0; x <= X1; x += C2) for (let z = Z0; z <= Z1; z += C2) if (TL.inRing(ring, x, z, 0.8) && !tcore.solids.some((b) => hitBox(b, x, z, y)) && !blockedAt(x, z, y, n)) free++;
  const r = (x: number, z: number): boolean => seen2[id(x, z)] === 1;
  ok(leak === 0, `level ${n}: ${leak} reachable cells outside the glass wall`);
  ok(r(0, 43.2) && r(0, 35) && r(0, 30), `level ${n}: the lift lobby and the core corridor are reachable`);
  ok(cells > free * 0.8, `level ${n}: most of the floor is reachable (${cells} of ${free} cells)`);
  if (n !== TL.T.roof && n !== TL.T.top) ok(r(-(ring.hx - 6), 35) || r(-(ring.hx - 5), 28) || r(ring.hx - 6, 35) || r(ring.hx - 5, 28), `level ${n}: the wings are reachable`);
}

shell.setNight(1); shell.update(1); facade.setNight(1); facade.update(1); lobby.update(1); hall.update(0.1, 1); grounds.setNight(1); grounds.update(1);
hall.audience.setMood('ovation');
for (let i = 0; i < 40; i++) hall.update(0.05, 2 + i * 0.05);
hall.showSlide({ icon: 'X', title: 'T', bullets: ['a', 'b'] }, 'Topic');
hall.showSlide(null, '');
kit.dispose();
console.log(fail ? `${fail} FAILED` : 'EVLab Tower: all ok');
process.exit(fail ? 1 : 0);
