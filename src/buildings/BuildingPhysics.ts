// SOLID BUILDINGS: one fixed Rapier box per building (hand placed + city fill), so a person or a car is stopped by the walls instead of walking /
// driving through. Like SignPhysics / PortPhysics the bodies only exist near the player (5 Hz check) and live in floating-origin LOCAL coordinates.
// The box is the footprint (W x D from Placements, turned by yaw) shrunk by INSET on every side, from under the lowest ground point up to the roof
// (floors x FLOOR_H + ROOF_EXTRA). It is a plain block: no door openings, no interior.
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { FILL_MODEL_BY_ID } from './models/fillRegistry';
import { FLOOR_H } from './models/BuildingKit';
import { BUILDING_PLACEMENTS, type BuildingPlacement } from './Placements';
import { DRAWN_FILL_PLACEMENTS } from './PlacementsResidential';

/** The yard / boundary wall is part of W x D: the solid block is this much (m) smaller on every side. */
const INSET = 1.0;
const ROOF_EXTRA = 2.5;
const MIN_HEIGHT = 3.5;
const CHECK_PERIOD = 0.2;
const REMOVE_MARGIN = 64;

export class BuildingPhysics {
  private all: BuildingPlacement[] = [];
  private radius: number[] = [];
  private active = new Map<number, RAPIER.RigidBody>();
  private timer = 1;

  constructor(
    private physics: PhysicsWorld,
    private origin: FloatingOrigin,
    private terrain: TerrainGenerator,
  ) {
    for (const p of [...BUILDING_PLACEMENTS, ...DRAWN_FILL_PLACEMENTS]) {
      if (!FILL_MODEL_BY_ID[p.id]) continue;
      this.all.push(p);
      this.radius.push(Math.hypot(p.W, p.D) / 2);
    }
  }

  get activeCount(): number {
    return this.active.size;
  }

  get total(): number {
    return this.all.length;
  }

  /** Every frame with the player's WORLD position (throttled to 5 Hz). */
  update(dt: number, px: number, pz: number): void {
    this.timer += dt;
    if (this.timer < CHECK_PERIOD) return;
    this.timer = 0;
    for (let i = 0; i < this.all.length; i++) {
      const p = this.all[i];
      const d = Math.hypot(px - p.x, pz - p.z);
      const reach = PhysicsConfig.activeRadius + this.radius[i];
      const has = this.active.has(i);
      if (!has && d <= reach) this.create(i, p);
      else if (has && d > reach + REMOVE_MARGIN) this.remove(i);
    }
  }

  private create(i: number, p: BuildingPlacement): void {
    const R = this.physics.RAPIER;
    const world = this.physics.world;
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    let mn = 1e9, mx = -1e9;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const lx = (a / 2) * (p.W / 2), lz = (b / 2) * (p.D / 2);
      const h = this.terrain.heightAt(p.x + lx * c + lz * s, p.z - lx * s + lz * c);
      mn = Math.min(mn, h); mx = Math.max(mx, h);
    }
    const floors = FILL_MODEL_BY_ID[p.id]!.floors;
    const top = mx + Math.max(MIN_HEIGHT, floors * FLOOR_H + ROOF_EXTRA);
    const bottom = mn - 0.5;
    const hx = Math.max(0.5, p.W / 2 - INSET), hz = Math.max(0.5, p.D / 2 - INSET);
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed()
        .setTranslation(p.x - this.origin.origin.x, (top + bottom) / 2, p.z - this.origin.origin.z)
        .setRotation({ x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) }),
    );
    world.createCollider(R.ColliderDesc.cuboid(hx, (top - bottom) / 2, hz).setFriction(0.6), body);
    this.active.set(i, body);
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
