// CITY MALL, STEP C2: the Rapier side of the lifts (no DOM, no three.js), shared by MallManager and scripts/mall-test.ts so both use ONE truth.
//  - landing blockers: one door-sized box per lift and floor, attached to the mall's fixed body, enabled = the door is shut
//  - cabins: one kinematic body per lift (floor, walls, roof + the sliding cabin door), moved with setNextKinematicTranslation
// The mall block stands in the world at (frame.x, frame.floorY, frame.z) turned by frame.yaw; physics coordinates = world - origin (floating origin).
import type RAPIER from '@dimforge/rapier3d-compat';
import { LIFTS, cabinParts, cabinXZ, liftLanding, type Box } from './MallCores';
import type { LiftHost } from './MallLift';

export interface LiftFrame { x: number; z: number; floorY: number; yaw: number }
export interface LiftBodies {
  landing: Map<string, RAPIER.Collider>;
  cabBodies: RAPIER.RigidBody[];
  cabDoors: RAPIER.Collider[];
  /** World x / z of each cabin centre. */
  base: [number, number][];
}

const quat = (yaw: number) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });

export function createLiftBodies(R: typeof RAPIER, W: RAPIER.World, fixed: RAPIER.RigidBody, f: LiftFrame, o: { x: number; z: number }): LiftBodies {
  const cs = Math.cos(f.yaw), sn = Math.sin(f.yaw);
  const landing = new Map<string, RAPIER.Collider>();
  const cabBodies: RAPIER.RigidBody[] = [], cabDoors: RAPIER.Collider[] = [], base: [number, number][] = [];
  const cuboid = (b: Box, body: RAPIER.RigidBody, friction: number): RAPIER.Collider =>
    W.createCollider(
      R.ColliderDesc.cuboid((b.maxX - b.minX) / 2, (b.maxY - b.minY) / 2, (b.maxZ - b.minZ) / 2)
        .setTranslation((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2).setFriction(friction),
      body,
    );
  for (const L of LIFTS) {
    for (const { level, box } of liftLanding(L)) landing.set(`${L.id}:${level}`, cuboid(box, fixed, 0.1));
    const [cx, cz] = cabinXZ(L);
    const wx = f.x + cx * cs + cz * sn, wz = f.z - cx * sn + cz * cs;
    base[L.id] = [wx, wz];
    const body = W.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(wx - o.x, f.floorY, wz - o.z).setRotation(quat(f.yaw)));
    for (const p of cabinParts()) {
      const c = cuboid(p.box, body, p.friction ?? 0.1);
      if (p.door) cabDoors[L.id] = c;
    }
    cabBodies[L.id] = body;
  }
  return { landing, cabBodies, cabDoors, base };
}

/** The LiftHost the lift cars drive. `origin` is read every call (the floating origin moves). */
export function liftHost(b: LiftBodies, f: LiftFrame, origin: () => { x: number; z: number }): LiftHost {
  return {
    landingBlock: (lift, level, blocked) => b.landing.get(`${lift}:${level}`)?.setEnabled(blocked),
    cabinPose: (lift, y) => {
      const o = origin(), p = b.base[lift];
      b.cabBodies[lift]?.setNextKinematicTranslation({ x: p[0] - o.x, y: f.floorY + y, z: p[1] - o.z });
    },
    cabinDoorBlock: (lift, blocked) => b.cabDoors[lift]?.setEnabled(blocked),
  };
}
