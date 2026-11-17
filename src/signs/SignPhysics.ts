// ROAD SIGNS - Step 6: Rapier colliders for the solid parts of the boards (gantry posts and bases, side-sign posts and boards), so a car or a person
// is stopped by them instead of driving through. Like PortPhysics / TreePhysics the bodies only exist near the player (5 Hz check) and live in
// floating-origin LOCAL coordinates; there are no colliders far away.
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { SignSolidGroup } from './SignSolids';

export class SignPhysics {
  private active = new Map<number, RAPIER.RigidBody>();
  private timer = 1;

  /** `groups` is RoadSignLayer.solidGroups (it is filled once while the boards are built, before the first update). */
  constructor(
    private physics: PhysicsWorld,
    private origin: FloatingOrigin,
    private groups: readonly SignSolidGroup[],
  ) {}

  get activeCount(): number {
    return this.active.size;
  }

  get total(): number {
    return this.groups.length;
  }

  /** Call every frame with the player's WORLD position (throttled to 5 Hz). */
  update(dt: number, px: number, pz: number): void {
    this.timer += dt;
    if (this.timer < 0.2) return;
    this.timer = 0;
    for (let id = 0; id < this.groups.length; id++) {
      const g = this.groups[id];
      const d = Math.hypot(px - g.x, pz - g.z);
      const reach = PhysicsConfig.activeRadius + g.radius;
      const has = this.active.has(id);
      if (!has && d <= reach) this.create(id, g);
      else if (has && d > reach + 64) this.remove(id);
    }
  }

  private create(id: number, g: SignSolidGroup): void {
    const R = this.physics.RAPIER;
    const world = this.physics.world;
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed()
        .setTranslation(g.x - this.origin.origin.x, g.y, g.z - this.origin.origin.z)
        .setRotation({ x: 0, y: Math.sin(g.yaw / 2), z: 0, w: Math.cos(g.yaw / 2) }),
    );
    for (const s of g.solids) {
      const desc = s.k === 0 ? R.ColliderDesc.cuboid(s.hx, s.hy, s.hz) : R.ColliderDesc.cylinder(s.hy, s.hx);
      world.createCollider(desc.setTranslation(s.cx, s.cy, s.cz).setFriction(0.9), body);
    }
    this.active.set(id, body);
  }

  private remove(id: number): void {
    const body = this.active.get(id);
    if (!body) return;
    this.physics.world.removeRigidBody(body);
    this.active.delete(id);
  }

  dispose(): void {
    for (const id of [...this.active.keys()]) this.remove(id);
  }
}
