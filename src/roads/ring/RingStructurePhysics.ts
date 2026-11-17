// STEP 5.3c-6: Rapier colliders of the ring structures: deck, parapets, abutments, piers, pylon / arch / truss and cables are SOLID (before this a car
// drove through them: the terrain heightfield is carved under a deck, and the deck itself had no collider). One fixed trimesh body per structure, only
// near the player (5 Hz check, like SignPhysics); local floating-origin coordinates (PhysicsWorld shifts the bodies on origin:shift).
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../../physics/PhysicsWorld';
import { PhysicsConfig } from '../../physics/PhysicsConfig';
import type { FloatingOrigin } from '../../world/FloatingOrigin';
import type { RingSolid } from './RingStructureLayer';

export class RingStructurePhysics {
  private active = new Map<number, RAPIER.RigidBody>();
  private timer = 1;

  constructor(
    private physics: PhysicsWorld,
    private origin: FloatingOrigin,
    private solids: readonly RingSolid[],
  ) {}

  get activeCount(): number {
    return this.active.size;
  }

  /** Call every frame with the player's WORLD position (throttled to 5 Hz). */
  update(dt: number, px: number, pz: number): void {
    this.timer += dt;
    if (this.timer < 0.2) return;
    this.timer = 0;
    for (let id = 0; id < this.solids.length; id++) {
      const s = this.solids[id];
      const d = Math.hypot(px - s.cx, pz - s.cz);
      const reach = PhysicsConfig.activeRadius + s.radius;
      const has = this.active.has(id);
      if (!has && d <= reach) this.create(id, s);
      else if (has && d > reach + 64) this.remove(id);
    }
  }

  private create(id: number, s: RingSolid): void {
    const R = this.physics.RAPIER;
    const world = this.physics.world;
    const ox = this.origin.origin.x, oz = this.origin.origin.z;
    const v = new Float32Array(s.positions.length);
    for (let i = 0; i < v.length; i += 3) { v[i] = s.positions[i] - ox; v[i + 1] = s.positions[i + 1]; v[i + 2] = s.positions[i + 2] - oz; }
    const body = world.createRigidBody(R.RigidBodyDesc.fixed());
    world.createCollider(R.ColliderDesc.trimesh(v, s.indices, R.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(0.9), body);
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
