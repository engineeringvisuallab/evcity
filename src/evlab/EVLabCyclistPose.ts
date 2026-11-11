// EVLab Step 10: how a cyclist sits on the cycle of Step 9 (pure maths, no three.js): hips on the saddle, hands on the grips, feet on the pedals.
// Planar two-link IK in the y-z plane (the legs and arms only swing about x, like PersonModel.setSeated). Lengths are for a person of scale 1 (1.8 m).
// The saddle, pedal and grip numbers are copies of CYCLE in EVLabCycle (that file needs three.js; scripts/evlab-cycle-test.ts checks that they match).

export const RIDE = {
  saddle: { y: 1.0, z: -0.27 },
  bb: { y: 0.29, z: -0.06 },
  crankLen: 0.17,
  pedalX: 0.11,
  grip: { x: 0.3, y: 0.9475, z: 0.2875 },
} as const;

/** Body measures (person scale 1): thigh, shin, upper arm, forearm + hand; shoulder height above the hips; hips above the saddle top; ankle above the sole; ball of the foot ahead of the ankle. */
export const BODY = { thigh: 0.46, shin: 0.36, arm: 0.29, fore: 0.31, shoulderY: 0.55, hipUp: 0.05, soleUp: 0.08, ballFwd: 0.07 } as const;
/** Torso lean (rad, + = forward) of an upright city rider. */
export const LEAN = 0.7;

/** Riders are a little taller than the crowd: the saddle is high (1.0 m) and the legs must reach the pedals at the bottom of the stroke. */
export const RIDER_MIN_SCALE = 1.02;

export interface TwoLink { /** Angle of link 1 from straight down towards forward (rad). */ a1: number; /** Bend between the links (rad, 0 = straight). */ bend: number; /** Distance the target is out of reach (m, 0 = reached). */ miss: number }

/**
 * Two links of length a and b from a joint to the target (f ahead, u up, metres). `midFront`: the middle joint (knee) is in front of / above the line
 * joint -> target (a leg); false: behind / below it (an arm: the elbow drops).
 */
export function twoLink(f: number, u: number, a: number, b: number, midFront: boolean): TwoLink {
  const d0 = Math.hypot(f, u);
  const d = Math.max(Math.abs(a - b) + 1e-3, Math.min(a + b - 1e-3, d0));
  const phi = Math.atan2(f, -u);
  const al = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const g = Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - d * d) / (2 * a * b))));
  return { a1: midFront ? phi + al : phi - al, bend: Math.PI - g, miss: Math.max(0, d0 - (a + b - 1e-3)) };
}

/** Pedal centre (y, z) in cycle coordinates for a crank angle (0 = left pedal up, the right one down; the left pedal is at +x). */
export function pedalAt(crank: number, left: boolean): { y: number; z: number } {
  const a = left ? crank : crank + Math.PI;
  return { y: RIDE.bb.y + RIDE.crankLen * Math.cos(a), z: RIDE.bb.z + RIDE.crankLen * Math.sin(a) };
}

/** Where the hip joints sit in cycle coordinates (the person's origin). */
export function hipAt(scale: number): { y: number; z: number } {
  return { y: RIDE.saddle.y + BODY.hipUp * scale, z: RIDE.saddle.z - 0.02 };
}

/** Angles in the PersonModel.setSeatedLimbs convention (SeatPose: thigh / arm from straight down, negative = forward; knee + = shin back; elbow negative = forearm forward). Index 0 = the side at x < 0, 1 = x > 0. */
export interface RiderPose { lean: number; thigh: [number, number]; knee: [number, number]; arm: [number, number]; elbow: [number, number]; /** Largest distance a foot (legMiss) / a hand (armMiss) stays short of its target (m); miss = the larger one. */ legMiss: number; armMiss: number; miss: number }

export function riderPose(scale: number, crank: number): RiderPose {
  const s = scale, hip = hipAt(s);
  const thigh: [number, number] = [0, 0], knee: [number, number] = [0, 0], arm: [number, number] = [0, 0], elbow: [number, number] = [0, 0];
  let legMiss = 0, armMiss = 0;
  // legs: the side at x > 0 is the cycle's left side (left pedal at crank angle `crank`)
  for (let i = 0; i < 2; i++) {
    const p = pedalAt(crank, i === 1);
    const ankleY = p.y + 0.011 + BODY.soleUp * s, ankleZ = p.z - BODY.ballFwd * s;
    const r = twoLink((ankleZ - hip.z) / s, (ankleY - hip.y) / s, BODY.thigh, BODY.shin, true);
    thigh[i] = -r.a1; knee[i] = r.bend; legMiss = Math.max(legMiss, r.miss * s);
  }
  // arms: from the shoulders (the torso is tipped forward by LEAN about the hips) to the grips
  const shY = hip.y + BODY.shoulderY * s * Math.cos(LEAN), shZ = hip.z + BODY.shoulderY * s * Math.sin(LEAN);
  for (let i = 0; i < 2; i++) {
    const r = twoLink((RIDE.grip.z - shZ) / s, (RIDE.grip.y - shY) / s, BODY.arm, BODY.fore, false);
    arm[i] = -r.a1; elbow[i] = -r.bend; armMiss = Math.max(armMiss, r.miss * s);
  }
  return { lean: LEAN, thigh, knee, arm, elbow, legMiss, armMiss, miss: Math.max(legMiss, armMiss) };
}
