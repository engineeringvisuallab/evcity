// EVLab step 9: the cycle model (headless: no DOM needed). npx tsx scripts/evlab-cycle-test.ts
import * as THREE from 'three';
import { CYCLE, CYCLE_PAINT, Cycle, CycleKit, buildCycle } from '../src/evlab/EVLabCycle';
import { RIDE } from '../src/evlab/EVLabCyclistPose';

let fails = 0;
const ok = (c: boolean, m: string): void => { if (!c) { fails++; console.error('FAIL: ' + m); } };
const near = (a: number, b: number, e: number): boolean => Math.abs(a - b) <= e;

const kit = new CycleKit();
const c = buildCycle(kit, CYCLE_PAINT[1]);
c.root.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(c.root), size = box.getSize(new THREE.Vector3());
console.log('size', size.toArray().map((v) => v.toFixed(3)).join(' x '), 'min', box.min.toArray().map((v) => v.toFixed(3)).join(' '), 'max', box.max.toArray().map((v) => v.toFixed(3)).join(' '));

// proportions of a real adult city bike
ok(size.z > 1.7 && size.z < 1.85, 'length 1.7 .. 1.85 m: ' + size.z.toFixed(2));
ok(size.x > 0.55 && size.x < 0.72, 'handlebar width 0.55 .. 0.72 m: ' + size.x.toFixed(2));
ok(size.y > 0.95 && size.y < 1.1, 'height 0.95 .. 1.1 m: ' + size.y.toFixed(2));
ok(near(box.min.y, 0, 0.003), 'the tyres touch the ground (min y ' + box.min.y.toFixed(4) + ')');
ok(near(box.min.z, -0.53 - 0.335 - 0.0, 0.02) || box.min.z < -0.8, 'rear tyre / carrier at the back');
ok(near(CYCLE.length, size.z, 0.06), 'CYCLE.length matches the model');
ok(near((box.min.x + box.max.x) / 2, 0, 0.02), 'symmetric left / right');
ok(near(CYCLE.axleF[2] - CYCLE.axleR[2], 1.11, 0.001), 'wheelbase 1.11 m');

// cheap: shared geometry, few meshes
let meshes = 0, tris = 0;
c.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { meshes++; tris += (m.geometry.index?.count ?? 0) / 3; } });
ok(meshes <= 16, 'at most 16 meshes: ' + meshes);
ok(tris < 6000, 'low poly: ' + tris + ' triangles');
const c2 = buildCycle(kit, CYCLE_PAINT[2]);
const geos = (x: Cycle): THREE.BufferGeometry[] => { const l: THREE.BufferGeometry[] = []; x.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) l.push(m.geometry); }); return l; };
ok(geos(c).every((g, i) => g === geos(c2)[i]), 'two cycles share all geometry');
const mats = (x: Cycle): THREE.Material[] => { const l: THREE.Material[] = []; x.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) l.push(m.material as THREE.Material); }); return l; };
ok(mats(c)[0] !== mats(c2)[0] && mats(c)[1] === mats(c2)[1], 'own paint, shared metal');
ok(kit.paintMat(CYCLE_PAINT[1]) === mats(c)[0], 'paint material is cached');
for (const g of geos(c)) {
  const p = g.attributes.position.array;
  ok(p.every((v) => Number.isFinite(v)), 'finite vertices');
}

// wheels: centre at the axle, radius 0.335
const wp = new THREE.Vector3();
c.frontWheel.getWorldPosition(wp);
ok(near(wp.y, 0.335, 1e-6) && near(wp.z, CYCLE.axleF[2], 1e-6), 'front wheel at its axle');
c.rearWheel.getWorldPosition(wp);
ok(near(wp.y, 0.335, 1e-6) && near(wp.z, CYCLE.axleR[2], 1e-6), 'rear wheel at its axle');

// steering turns the front end about the head tube: the axis stays put, the front wheel swings sideways
const top = CYCLE.headTop, bot = CYCLE.headBot;
const pointOnAxis = (t: number): THREE.Vector3 => new THREE.Vector3(...bot).lerp(new THREE.Vector3(...top), t);
c.setSteer(0);
c.root.updateMatrixWorld(true);
const wheelDir = (): THREE.Vector3 => new THREE.Vector3(0, 0, 1).applyQuaternion(c.frontWheel.getWorldQuaternion(new THREE.Quaternion()));
const gripNow = (): THREE.Vector3 => { // world position of the left grip point, carried by the front end
  const t = new THREE.Object3D();
  c.steer.children[0].children[0].add(t);
  t.position.set(...CYCLE.grip[0]);
  c.root.updateMatrixWorld(true);
  const p = t.getWorldPosition(new THREE.Vector3());
  t.removeFromParent();
  return p;
};
const f0 = c.frontWheel.getWorldPosition(new THREE.Vector3());
const g0 = gripNow();
ok(near(wheelDir().x, 0, 1e-9), 'straight: the front wheel points ahead');
ok(near(g0.z, CYCLE.grip[0][2], 1e-9) && near(g0.x, CYCLE.grip[0][0], 1e-9), 'straight: the grip is where CYCLE.grip says');
c.setSteer(0.4);
c.root.updateMatrixWorld(true);
const f1 = c.frontWheel.getWorldPosition(new THREE.Vector3());
const d1 = wheelDir();
ok(d1.x > 0.3 && d1.x < 0.42, 'steering 0.4 rad turns the front wheel to the left (+x): ' + d1.x.toFixed(3));
ok(gripNow().z < g0.z - 0.02, 'turning left swings the left grip back');
ok(f1.distanceTo(f0) < 0.03, 'the wheel centre sits almost on the steering axis (small fork offset)');
// distance from the wheel centre to the steering axis is unchanged
const dAxis = (p: THREE.Vector3): number => { const a = pointOnAxis(0), b = pointOnAxis(1); const ab = b.clone().sub(a).normalize(); return p.clone().sub(a).cross(ab).length(); };
ok(near(dAxis(f0), dAxis(f1), 1e-6), 'the wheel stays at the same distance from the steering axis');
// a point on the axis inside the head tube does not move
const probe = new THREE.Mesh();
c.steer.add(probe); // the steer group origin is the head tube bottom
probe.getWorldPosition(wp);
ok(wp.distanceTo(new THREE.Vector3(...bot)) < 1e-6, 'the head tube bottom is the pivot');
ok(near(c.steerAngle, 0.4, 1e-9), 'steerAngle');
c.setSteer(3);
ok(c.steerAngle <= 0.6 + 1e-9, 'steering is limited');
c.setSteer(-3);
ok(c.steerAngle >= -0.6 - 1e-9, 'steering is limited (right)');
c.setSteer(0);
c.steer.remove(probe);

// crank: the pedals turn about the bracket and stay level
c.setPedal(0);
c.root.updateMatrixWorld(true);
const pw = (i: number): THREE.Vector3 => c.pedals[i].getWorldPosition(new THREE.Vector3());
const L0 = pw(0), R0 = pw(1);
ok(near(L0.y, CYCLE.bb[1] + CYCLE.crankLen, 1e-6) && near(R0.y, CYCLE.bb[1] - CYCLE.crankLen, 1e-6), 'left pedal up, right pedal down at angle 0');
ok(L0.distanceTo(new THREE.Vector3(...CYCLE.pedal[0])) < 1e-6 && R0.distanceTo(new THREE.Vector3(...CYCLE.pedal[1])) < 1e-6, 'CYCLE.pedal = the real pedal positions');
ok(R0.y > 0.1, 'the lowest pedal clears the ground (' + R0.y.toFixed(2) + ')');
c.setPedal(Math.PI / 2);
c.root.updateMatrixWorld(true);
const R1 = pw(1);
ok(near(Math.hypot(R1.y - CYCLE.bb[1], R1.z - CYCLE.bb[2]), CYCLE.crankLen, 1e-6), 'the pedal circles the bracket at the crank length');
const pq = c.pedals[1].getWorldQuaternion(new THREE.Quaternion());
ok(pq.angleTo(new THREE.Quaternion()) < 1e-6, 'pedals stay level while the crank turns');
for (let a = 0; a < 6.3; a += 0.3) { c.setPedal(a); c.root.updateMatrixWorld(true); const y = pw(1).y, y2 = pw(0).y; ok(y > 0.1 && y2 < 0.5 + 0.2, 'pedals never touch the ground (a=' + a.toFixed(1) + ')'); }

// rolling: 2*pi*R metres = one wheel turn, ~2.6 crank turns per 2.6 wheel turns -> crank turns slower than the wheel by the gear ratio
const c3 = buildCycle(kit);
c3.roll(2 * Math.PI * CYCLE.wheelR);
ok(near(c3.frontWheel.rotation.x, 2 * Math.PI, 1e-9) && near(c3.rearWheel.rotation.x, 2 * Math.PI, 1e-9), 'one wheel turn per circumference');
ok(near(c3.pedalAngle, 2 * Math.PI / 2.6, 1e-9), 'crank turns slower than the wheel');

// placing
c3.place(10, 0.5, -3, Math.PI / 2);
c3.root.updateMatrixWorld(true);
const fw = c3.frontWheel.getWorldPosition(new THREE.Vector3());
ok(near(fw.x, 10 + CYCLE.axleF[2], 1e-6) && near(fw.z, -3, 1e-6) && near(fw.y, 0.5 + 0.335, 1e-6), 'heading PI/2 = nose to +x');

// rider reference points are on the cycle
ok(CYCLE.saddle[1] > 0.9 && CYCLE.saddle[1] < 1.1, 'saddle height');
ok(CYCLE.grip.every((g) => g[1] > 0.9 && g[1] < 1.0), 'grip height');
ok(CYCLE.grip[0][0] > 0 && CYCLE.grip[1][0] < 0, 'left grip is +x');
const dist = Math.hypot(CYCLE.saddle[1] - CYCLE.grip[0][1], CYCLE.saddle[2] - CYCLE.grip[0][2]);
ok(dist > 0.45 && dist < 0.7, 'saddle to grip reach is a rider-size distance: ' + dist.toFixed(2));

c.dispose();
ok(c.root.parent === null, 'dispose detaches');
kit.dispose();

// Step 10: the rider's pose maths (EVLabCyclistPose, no three.js) keeps its own copy of the saddle / pedal / grip numbers: they must match the model
ok(near(RIDE.saddle.y, CYCLE.saddle[1], 1e-9) && near(RIDE.saddle.z, CYCLE.saddle[2], 1e-9), 'RIDE.saddle = CYCLE.saddle');
ok(near(RIDE.bb.y, CYCLE.bb[1], 1e-9) && near(RIDE.bb.z, CYCLE.bb[2], 1e-9) && near(RIDE.crankLen, CYCLE.crankLen, 1e-9), 'RIDE.bb / crank = CYCLE');
ok(near(RIDE.pedalX, CYCLE.pedal[0][0], 1e-9), 'RIDE.pedalX = CYCLE.pedal');
ok(near(RIDE.grip.x, CYCLE.grip[0][0], 1e-9) && near(RIDE.grip.y, CYCLE.grip[0][1], 1e-9) && near(RIDE.grip.z, CYCLE.grip[0][2], 1e-9), 'RIDE.grip = CYCLE.grip');

if (fails) { console.error(fails + ' FAIL'); process.exit(1); }
console.log('evlab cycle: all ok');
