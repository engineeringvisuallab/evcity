// Headless TREE CLIMBING test (real Rapier): npx tsx scripts/tree-climb-test.ts
// A flat world with one sal tree and one banana clump: walk into the sal trunk + Space = grab, W climbs, A/D go round, Space jumps off, C lets go,
// the banana cannot be climbed, a felled tree is not found.
import * as THREE from 'three';
import { EventBus, type EngineEvents } from '../src/core/EventBus';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { FloatingOrigin } from '../src/world/FloatingOrigin';
import { TreePhysics } from '../src/vegetation/TreePhysics';
import { Player } from '../src/characters/Player';
import { TREE_KIND_COUNT, TREE_STRIDE, TREE_TRUNK, TreeKind } from '../src/vegetation/TreeTypes';
import { Config } from '../src/core/Config';
import { chunkKey, chunkOriginX, chunkOriginZ } from '../src/world/WorldGrid';

let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fails++;
};

const GROUND = 12; // flat ground height (m) so a wrong "y = 0" assumption shows up
const bus = new EventBus<EngineEvents>();
const physics = await PhysicsWorld.create(bus);
const R = physics.RAPIER;
const root = new THREE.Group();
const origin = new FloatingOrigin(root, bus);
const treePhysics = new TreePhysics(physics, origin, bus);

// flat ground
const gb = physics.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, GROUND - 1, 0));
physics.world.createCollider(R.ColliderDesc.cuboid(5000, 1, 5000), gb);

const cx = 10, cz = 10;
const ox = chunkOriginX(cx), oz = chunkOriginZ(cz);
const treeX = ox + 250, treeZ = oz + 250;
const trees = Array.from({ length: TREE_KIND_COUNT }, () => new Float32Array(0));
const SC = 1;
trees[TreeKind.sal] = new Float32Array([250, GROUND - 0.35, 250, SC, 0, 1]);
trees[TreeKind.banana] = new Float32Array([270, GROUND - 0.35, 250, 1, 0, 1]);
bus.emit('chunk:loaded', { key: chunkKey(cx, cz), cx, cz, lod: 0, vertsPerSide: 128, heights: new Float32Array(0), trees });
for (let i = 0; i < 5; i++) treePhysics.update(0.25, treeX - 3, treeZ);

// --- findClimbable ---
const f1 = treePhysics.findClimbable(treeX - 1.1, treeZ, 0.8);
ok(!!f1 && f1.kind === TreeKind.sal, 'sal trunk found 0.6 m from its surface');
ok(!!f1 && Math.abs(f1.top - TREE_TRUNK[TreeKind.sal].climb * SC) < 1e-6, `climbable height ${f1?.top} m`);
ok(treePhysics.findClimbable(treeX - 4, treeZ, 0.8) === null, 'nothing within reach 4 m away');
ok(treePhysics.findClimbable(treeX + 19.2, treeZ, 0.8) === null, 'banana clump cannot be climbed');

// --- the player ---
const keys = new Set<string>();
const input = { isDown: (c: string) => keys.has(c) };
const terrain = {
  makeSample: () => ({ h: GROUND, water: NaN, fx: 0, fz: 0 }),
  sample: (_x: number, _z: number, o: { h: number; water: number; fx: number; fz: number }) => { o.h = GROUND; o.water = NaN; o.fx = 0; o.fz = 0; },
  heightAt: () => GROUND,
};
let hint = 0;
const player = new Player(
  {
    physics,
    terrain: terrain as never,
    terrainPhysics: { hasColliderAt: () => true } as never,
    origin,
    scene: new THREE.Scene(),
    bus,
    input,
    getCameraYaw: () => 0, // camera looks to -z: W = -z, D = +x
    findTree: (x, z, r) => treePhysics.findClimbable(x, z, r),
    hint: () => hint++,
  },
  new THREE.Vector3(treeX, GROUND + Config.player.height / 2 + 0.05, treeZ + 3),
);
const dt = 1 / 60;
const step = (n: number, held: string[] = []) => {
  keys.clear();
  for (const k of held) keys.add(k);
  for (let i = 0; i < n; i++) {
    player.fixedUpdate(dt);
    physics.step();
    player.afterStep();
    treePhysics.update(dt, player.getWorldPosition(new THREE.Vector3()).x, player.getWorldPosition(new THREE.Vector3()).z);
  }
};
const pos = () => { const t = player.body.translation(); return { x: t.x + origin.origin.x, y: t.y - Config.player.height / 2, z: t.z + origin.origin.z }; };

step(60); // settle on the ground
ok(player.grounded && !player.climbing, 'standing on the ground');
const standY = pos().y;
// camera yaw 0: W walks towards -z, the sal is at z - 3
for (let n = 0; n < 300 && Math.hypot(pos().x - treeX, pos().z - treeZ) > TREE_TRUNK[TreeKind.sal].r + Config.player.radius + 0.12; n++) step(1, ['KeyW']);
let p = pos();
ok(Math.hypot(p.x - treeX, p.z - treeZ) < TREE_TRUNK[TreeKind.sal].r + Config.player.radius + 0.4, `walked up to the trunk (${Math.hypot(p.x - treeX, p.z - treeZ).toFixed(2)} m from its axis)`);
ok(hint >= 1, 'hint toast shown once near a climbable trunk');
ok(!player.climbing, 'walking into the trunk does not grab it');
// Space while pushing W: grab
step(2, ['KeyW', 'Space']);
ok(player.climbing, 'W + Space at the trunk grabs the tree');
step(1);
// climb up for 3 s
step(180, ['KeyW']);
p = pos();
ok(p.y - GROUND > 3 && p.y - GROUND < TREE_TRUNK[TreeKind.sal].climb + 0.2, `climbed ${(p.y - GROUND).toFixed(2)} m`);
ok(player.state === 'climb', 'state is climb');
const rAxis = Math.hypot(p.x - treeX, p.z - treeZ);
ok(Math.abs(rAxis - (TREE_TRUNK[TreeKind.sal].r + Config.player.radius + 0.06)) < 0.05, `body stays on the trunk surface (${rAxis.toFixed(2)} m from the axis)`);
// round the trunk
const a0 = Math.atan2(p.x - treeX, p.z - treeZ);
step(60, ['KeyD']);
const q = pos();
const a1 = Math.atan2(q.x - treeX, q.z - treeZ);
ok(Math.abs(Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0))) > 0.5, 'D walks round the trunk');
ok(Math.abs(q.y - p.y) < 0.05, 'and keeps its height');
// to the very top: never above the limit
step(600, ['KeyW']);
p = pos();
ok(p.y - GROUND <= TREE_TRUNK[TreeKind.sal].climb * SC + 1e-6, `stops at the top (${(p.y - GROUND).toFixed(2)} m)`);
// let go with C: falls to the ground
step(1, ['KeyC']);
ok(!player.climbing, 'C lets go');
step(240);
p = pos();
ok(player.grounded && Math.abs(p.y - standY) < 0.3, 'falls back to the ground');
// grab again, then Space jumps off, away from the trunk
step(30); // wait out the re-grab pause
// after the fall the player stands east of the trunk: A walks towards it (-x)
step(2, ['KeyA', 'Space']);
ok(player.climbing, 'grabbed again');
step(60, ['KeyW']);
step(1);
step(1, ['Space']);
ok(!player.climbing, 'Space jumps off');
const j0 = pos();
step(30);
const j1 = pos();
ok(Math.hypot(j1.x - treeX, j1.z - treeZ) > Math.hypot(j0.x - treeX, j0.z - treeZ) + 0.5, 'and is pushed away from the trunk');
// felled tree: its collider data has radius 0 -> not found any more
treePhysics.removeTree(chunkKey(cx, cz), TreeKind.sal, 250, 250);
ok(treePhysics.findClimbable(treeX - 1.1, treeZ, 0.8) === null, 'a felled tree cannot be climbed');
// teleport / vehicle drops the climb
step(300);
step(150, ['KeyW']);
console.log(fails === 0 ? 'ALL OK' : `${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
