import type { HumanRig } from './HumanBody';

/**
 * Secondary motion that makes the swinging limbs of the skinned body read as a real walk (all no-ops on the old rigid
 * body, which has no spine / head / foot bones):
 *  - pelvis rotates with the legs, shoulders counter-rotate with the arms, the head stays steady
 *  - the feet roll heel -> toe so they stay flat on the ground while the leg swings
 *  - the hips rise and fall with the stance leg (feet no longer float at the end of each stride)
 *  - at rest: slow breathing, a little weight shift and a gentle head look-around
 * Angles use the same convention as the limb code: rotation.x > 0 swings the limb backwards.
 */

const HIP_HEIGHT = 0.9;

function ease(o: { rotation: { x: number; y: number; z: number } }, axis: 'x' | 'y' | 'z', target: number, k: number): void {
  o.rotation[axis] += (target - o.rotation[axis]) * k;
}

/** Call every frame while walking / running, AFTER the leg / arm angles were eased (`k` = same blend factor). */
export function gait(rig: HumanRig, phase: number, amp: number, run: boolean, k: number): void {
  if (!rig.chest || !rig.head || !rig.hips) return;
  const s = Math.sin(phase);
  const twist = 0.07 * (amp / 0.55);
  ease(rig.pivot, 'y', -s * twist, k); // pelvis: the leg that swings forward carries its hip forward
  ease(rig.chest, 'y', s * twist * 2, k); // shoulders counter-rotate (net shoulder turn is +twist)
  ease(rig.head, 'y', -s * twist * 0.8, k); // the head keeps looking ahead
  ease(rig.chest, 'x', run ? 0.16 : 0.04, k); // lean forward when running
  ease(rig.head, 'x', run ? -0.12 : -0.02, k);
  ease(rig.head, 'z', 0, k);
  ease(rig.pivot, 'z', Math.cos(phase) * 0.02 * (amp / 0.55), k); // small side-to-side hip sway
  ease(rig.chest, 'z', -Math.cos(phase) * 0.015 * (amp / 0.55), k);

  // feet: heel strike with the toe up, push off with the toe down; the shin angle is always compensated
  if (rig.footL && rig.footR) {
    ease(rig.footL, 'x', -0.55 * rig.legL.rotation.x - rig.shinL.rotation.x, k);
    ease(rig.footR, 'x', -0.55 * rig.legR.rotation.x - rig.shinR.rotation.x, k);
  }

  // hips follow the stance leg (left leg carries the weight while cos(phase) > 0, see kneeFlex in HumanBody)
  const stance = Math.cos(phase) > 0 ? rig.legL : rig.legR;
  const y = HIP_HEIGHT * Math.cos(stance.rotation.x);
  rig.pivot.position.y += (y - rig.pivot.position.y) * Math.min(1, k * 1.5);
}

/** Call every frame when NOT walking (idle, in the air, swimming): eases everything back and adds the breathing. */
export function relax(rig: HumanRig, t: number, k: number, breathe = true): void {
  if (!rig.chest || !rig.head || !rig.hips) return;
  const b = breathe ? Math.sin(t * 1.7) : 0;
  ease(rig.pivot, 'y', 0, k);
  ease(rig.pivot, 'z', breathe ? Math.sin(t * 0.37) * 0.012 : 0, k); // slow weight shift
  ease(rig.chest, 'y', 0, k);
  ease(rig.chest, 'z', 0, k);
  ease(rig.head, 'z', 0, k);
  ease(rig.chest, 'x', 0.012 * b, k);
  ease(rig.head, 'x', breathe ? Math.sin(t * 0.5) * 0.03 : 0, k);
  ease(rig.head, 'y', breathe ? Math.sin(t * 0.23) * 0.12 * Math.max(0, Math.sin(t * 0.11)) : 0, k); // now and then glances sideways
  if (rig.footL && rig.footR) {
    ease(rig.footL, 'x', -rig.shinL.rotation.x - 0.55 * rig.legL.rotation.x, k);
    ease(rig.footR, 'x', -rig.shinR.rotation.x - 0.55 * rig.legR.rotation.x, k);
  }
  rig.pivot.position.y += (HIP_HEIGHT - rig.pivot.position.y) * Math.min(1, k * 1.5);
}

/** Snap the secondary motion back to the rest pose (call when a person sits down, so no walking twist stays on the seat). */
export function resetPose(rig: HumanRig): void {
  rig.pivot.rotation.y = 0;
  rig.pivot.rotation.z = 0;
  for (const b of [rig.chest, rig.head]) b?.rotation.set(0, 0, 0);
}

/** Natural blinking (every 2-6 s, sometimes twice in a row). Call every frame for people close to the camera. */
export function blink(rig: HumanRig, dt: number): void {
  const lids = rig.eyelids;
  if (!lids) return;
  const u = lids[0].userData as { t?: number; next?: number };
  if (u.t === -2) return; // eyes shut (dead)
  if (u.next === undefined) {
    u.next = 1 + Math.random() * 4;
    u.t = -1;
  }
  let c = 0;
  if ((u.t as number) < 0) {
    u.next -= dt;
    if (u.next <= 0) u.t = 0;
  } else {
    u.t = (u.t as number) + dt;
    const dur = 0.17;
    if ((u.t as number) >= dur) {
      u.t = -1;
      u.next = Math.random() < 0.15 ? 0.12 : 2 + Math.random() * 4;
    } else c = Math.sin(((u.t as number) / dur) * Math.PI);
  }
  const s = Math.max(0.02, c);
  for (const l of lids) l.scale.y = s;
}

/** Eyes shut for good (dead) or normal again. */
export function closeEyes(rig: HumanRig, closed: boolean): void {
  const lids = rig.eyelids;
  if (!lids) return;
  (lids[0].userData as { t?: number }).t = closed ? -2 : -1;
  for (const l of lids) l.scale.y = closed ? 1 : 0.02;
}
