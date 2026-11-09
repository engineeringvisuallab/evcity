// Headless test of the skinned human (real three.js, no GPU): npx tsx scripts/human-test.ts
// Checks: 17 bones + 7 material groups, every bone stays finite while walking / running / idle, the two-hand aim pose
// (gun points along the camera pitch, the left hand reaches the foregrip), recoil settles, the reload moves the left hand,
// eyelids blink and close, both LODs bind to the same skeleton.
import * as THREE from 'three';
import { buildHuman, type HumanRig } from '../src/people/HumanBody';
import { AimController, gripPoints } from '../src/people/HumanAim';
import { blink, closeEyes, gait, relax } from '../src/people/HumanMotion';
import { makeGun } from '../src/combat/GunModel';
import { randomAppearance } from '../src/people/PersonModel';

let fail = 0;
const ok = (cond: boolean, msg: string): void => {
  if (!cond) fail++;
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`);
};

const look = randomAppearance(() => 0.42);
const mats: THREE.Material[] = [];
const rig: HumanRig = buildHuman(look, (c) => {
  const m = new THREE.MeshLambertMaterial({ color: c });
  mats.push(m);
  return m;
});
const root = new THREE.Group();
root.add(rig.pivot);
root.updateMatrixWorld(true);

const mesh = rig.pivot.children.find((c) => (c as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh;
ok(!!mesh, 'a SkinnedMesh is part of the rig');
ok(mesh.skeleton.bones.length === 17, `17 bones (${mesh.skeleton.bones.length})`);
ok(Array.isArray(mesh.material) && mesh.material.length === 7, 'seven materials (skin, shirt, pants, shoes, dark, eye white, lips)');
const tris = (mesh.geometry.index?.count ?? 0) / 3;
ok(tris > 3000 && tris < 8000, `LOD0 ${tris} triangles`);
rig.setLod?.(1);
const tris1 = (mesh.geometry.index?.count ?? 0) / 3;
ok(tris1 < tris * 0.6 && tris1 > 500, `LOD1 ${tris1} triangles (cheaper, same skeleton)`);
ok((mesh.geometry.groups?.length ?? 0) === 7, 'LOD1 keeps the 7 material groups');
rig.setLod?.(0);

const finite = (): boolean => mesh.skeleton.bones.every((b) => [b.position, b.quaternion].every((v) => Object.values(v.toJSON?.() ?? v).every((n) => typeof n !== 'number' || Number.isFinite(n))) && Number.isFinite(b.quaternion.w));

// ---- walking / running / idle never produce NaN ----
let phase = 0;
for (let i = 0; i < 240; i++) {
  phase += 0.1;
  const amp = i < 120 ? 0.55 : 0.95;
  rig.legL.rotation.x = Math.sin(phase) * amp;
  rig.legR.rotation.x = -Math.sin(phase) * amp;
  gait(rig, phase, amp, i >= 120, 0.3);
}
ok(finite(), 'bones stay finite after walking and running');
for (let i = 0; i < 120; i++) relax(rig, i * 0.016, 0.3, true);
ok(finite() && Math.abs(rig.pivot.position.y - 0.9) < 0.05, 'idle brings the hips back to 0.9 m');

// ---- aim pose ----
const id = 'ak47' as const;
const gun = makeGun(id);
gun.position.set(0, -0.05, 0);
rig.handR!.add(gun);
const aimer = new AimController();
aimer.setGun(id, gun);
const pitch = 0.3;
for (let i = 0; i < 90; i++) aimer.update(rig, 1 / 60, true, pitch);
root.updateMatrixWorld(true);
const down = new THREE.Vector3(0, -1, 0).transformDirection(gun.matrixWorld); // barrel direction
const want = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
const err = Math.acos(Math.min(1, down.dot(want)));
ok(err < 0.12, `the gun points along the aim (error ${(err * 57.3).toFixed(1)} deg, pitch ${(pitch * 57.3).toFixed(0)} deg)`);
const sup = new THREE.Vector3();
const mag = new THREE.Vector3();
gripPoints(id, sup, mag);
const supW = gun.localToWorld(sup.clone());
const palmL = rig.handL!.localToWorld(new THREE.Vector3(0, -0.07, 0));
const reachErr = palmL.distanceTo(supW);
ok(reachErr < 0.12, `the left hand is on the foregrip (${(reachErr * 100).toFixed(1)} cm away)`);
ok(finite(), 'bones finite in the aim pose');

// recoil: kicks the barrel up, then settles
aimer.kick(1);
aimer.update(rig, 1 / 60, true, pitch);
root.updateMatrixWorld(true);
const kicked = new THREE.Vector3(0, -1, 0).transformDirection(gun.matrixWorld).y;
for (let i = 0; i < 120; i++) aimer.update(rig, 1 / 60, true, pitch);
root.updateMatrixWorld(true);
const settled = new THREE.Vector3(0, -1, 0).transformDirection(gun.matrixWorld).y;
ok(kicked > settled + 0.01 && Math.abs(settled - Math.sin(pitch)) < 0.05, `recoil kicks up (${kicked.toFixed(3)}) then settles (${settled.toFixed(3)} ~ ${Math.sin(pitch).toFixed(3)})`);

// reload: the left hand leaves the foregrip
aimer.setReload(0.3);
for (let i = 0; i < 40; i++) aimer.update(rig, 1 / 60, true, pitch);
root.updateMatrixWorld(true);
const palmR = rig.handL!.localToWorld(new THREE.Vector3(0, -0.07, 0));
const supR = gun.localToWorld(sup.clone());
ok(palmR.distanceTo(supR) > 0.12, `during the reload the left hand is away from the foregrip (${(palmR.distanceTo(supR) * 100).toFixed(0)} cm)`);
aimer.setReload(-1);

// aim off: everything returns to the normal animation
for (let i = 0; i < 240; i++) aimer.update(rig, 1 / 60, false, 0);
ok(!aimer.active && rig.handR!.quaternion.w > 0.999 && Math.abs(rig.armL.rotation.y) < 1e-6 && Math.abs(rig.armL.rotation.z) < 1e-6, 'aim off: hands and arm twist are back to normal');

// ---- eyelids ----
let closed = 0;
for (let i = 0; i < 600; i++) {
  blink(rig, 1 / 60);
  if (rig.eyelids![0].scale.y > 0.5) closed++;
}
ok(closed > 0 && closed < 100, `blinks now and then (${closed} of 600 frames with closed eyes)`);
closeEyes(rig, true);
ok(rig.eyelids!.every((l) => l.scale.y === 1), 'dead: eyes stay shut');

// ---- outfits: panjabi and lungi build, bind and animate without NaN ----
for (const outfit of ['panjabi', 'lungi'] as const) {
  const r2 = buildHuman({ ...look, outfit }, (c) => new THREE.MeshLambertMaterial({ color: c }));
  const root2 = new THREE.Group();
  root2.add(r2.pivot);
  root2.updateMatrixWorld(true);
  const m2 = r2.pivot.children.find((c) => (c as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh;
  for (let i = 0; i < 60; i++) {
    r2.legL.rotation.x = Math.sin(i * 0.2) * 0.6;
    r2.legR.rotation.x = -Math.sin(i * 0.2) * 0.6;
    gait(r2, i * 0.2, 0.6, false, 0.3);
  }
  root2.updateMatrixWorld(true);
  const mm = m2.geometry.index!.count / 3;
  ok(m2.skeleton.bones.length === 17 && mm > tris && (m2.geometry.groups?.length ?? 0) === 7, `${outfit}: skinned, ${mm} triangles, 7 material groups`);
  r2.dispose?.();
}

// ---- gun swap: the new gun is mounted exactly once, at the lowest point ----
const swapAimer = new AimController();
swapAimer.setGun(id, gun);
for (let i = 0; i < 60; i++) swapAimer.update(rig, 1 / 60, true, 0);
let mounted = 0;
swapAimer.startSwap(() => mounted++);
for (let i = 0; i < 60; i++) swapAimer.update(rig, 1 / 60, true, 0);
ok(mounted === 1, `gun swap: the new gun is mounted once (${mounted})`);
swapAimer.startSwap(() => mounted++);
for (let i = 0; i < 240; i++) swapAimer.update(rig, 1 / 60, false, 0); // aim ends before the lowest point
ok(mounted === 2, 'gun swap: finishes even if the aim pose ends in between');

rig.dispose?.();
for (const m of mats) m.dispose();
if (fail) {
  console.error(`${fail} check(s) failed`);
  process.exit(1);
}
console.log('human-test OK');
