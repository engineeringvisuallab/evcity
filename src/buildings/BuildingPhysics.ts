// SOLID, WALK-IN BUILDINGS: every building gets Rapier colliders that follow its real shape (the "solid" parts the model recorded while it was built, see
// models/ModelInfo.ts): wall pieces with the door openings, ceiling / roof slabs, plinth, columns, counters ... A person or a car is stopped by the walls but
// can walk through an open door into the room. (Before: one big box per building = no way in.) The door leaves are BuildingInteract.ts.
// Like SignPhysics / PortPhysics the bodies only exist near the player (5 Hz check) and live in floating-origin LOCAL coordinates; one fixed body per
// building, all colliders in the model frame (origin = footprint centre at floor level, turned by yaw).
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { groundRange, infoFor, WORLD_PLACEMENTS } from './BuildingInfo';

const CHECK_PERIOD = 0.2;
const REMOVE_MARGIN = 64;
/** The footprint is filled with solid ground up to the model's own floor slab (6 cm above the floor level). */
const FLOOR_TOP = 0.06;

export class BuildingPhysics {
  private radius: number[] = [];
  private active = new Map<number, RAPIER.RigidBody>();
  private timer = 1;

  constructor(
    private physics: PhysicsWorld,
    private origin: FloatingOrigin,
    private terrain: TerrainGenerator,
  ) {
    for (const w of WORLD_PLACEMENTS) this.radius.push(Math.hypot(w.p.W, w.p.D) / 2);
  }

  get activeCount(): number {
    return this.active.size;
  }

  get total(): number {
    return WORLD_PLACEMENTS.length;
  }

  /** Every frame with the player's WORLD position (throttled to 5 Hz). */
  update(dt: number, px: number, pz: number): void {
    this.timer += dt;
    if (this.timer < CHECK_PERIOD) return;
    this.timer = 0;
    let made = 0;
    for (let i = 0; i < WORLD_PLACEMENTS.length; i++) {
      const p = WORLD_PLACEMENTS[i]!.p;
      const d = Math.hypot(px - p.x, pz - p.z);
      const reach = PhysicsConfig.activeRadius + this.radius[i]!;
      const has = this.active.has(i);
      if (!has && d <= reach && made < 3) { if (this.create(i)) made++; } // a model that is not built yet costs a few ms: at most 3 per check
      else if (has && d > reach + REMOVE_MARGIN) this.remove(i);
    }
  }

  private create(i: number): boolean {
    const { p, fill } = WORLD_PLACEMENTS[i]!;
    const info = infoFor(p, fill);
    if (!info) return false;
    const R = this.physics.RAPIER;
    const world = this.physics.world;
    const { mn, mx } = groundRange(p, (x, z) => this.terrain.heightAt(x, z));
    const floorY = mx + 0.02;
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed()
        .setTranslation(p.x - this.origin.origin.x, floorY, p.z - this.origin.origin.z)
        .setRotation({ x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) }),
    );
    // ground slab under the whole footprint (from under the lowest ground point up to the model's floor)
    const bottom = mn - 0.5 - floorY;
    world.createCollider(
      R.ColliderDesc.cuboid(p.W / 2, (FLOOR_TOP - bottom) / 2, p.D / 2).setTranslation(0, (FLOOR_TOP + bottom) / 2, 0).setFriction(0.8),
      body,
    );
    for (const s of info.solids) {
      world.createCollider(
        R.ColliderDesc.cuboid(s.hx, s.hy, s.hz).setTranslation(s.x, s.y, s.z).setRotation({ x: 0, y: Math.sin(s.yaw / 2), z: 0, w: Math.cos(s.yaw / 2) }).setFriction(0.6),
        body,
      );
    }
    for (const c of info.cyls) world.createCollider(R.ColliderDesc.cylinder(c.hh, c.r).setTranslation(c.x, c.y, c.z).setFriction(0.6), body);
    this.active.set(i, body);
    return true;
  }

  private remove(i: number): void {
    const body = this.active.get(i);
    if (!body) return;
    this.physics.world.removeRigidBody(body);
    this.active.delete(i);
  }

  dispose(): void {
    for (const i of [...this.active.keys()]) this.remove(i);
  }
}
