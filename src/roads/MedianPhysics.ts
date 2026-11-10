import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import { Config } from '../core/Config';
import type { RoadNetwork } from './RoadNetwork';
import { MS, medianPiece, planMedians, yawPitchQuat } from './MedianPlan';

/**
 * ROADS STEP 2: the invisible barrier of the median. A 150 mm kerb alone does not stop a car (wheel radius 0.33 m), so every median piece
 * gets a fixed cuboid `Config.city.median.colliderH` m high (decision D4). Colliders are made per cell (125 m) only near the player,
 * like BridgePhysics. Bodies live in floating-origin local coordinates; PhysicsWorld shifts them when the origin moves.
 */
interface Cell { cx: number; cz: number; segs: number[] }
const STRIDE = 8; // x, y, z, len, hw, yaw, pitch, kerbH

export class MedianPhysics {
  private cells = new Map<number, Cell>();
  private active = new Map<number, RAPIER.RigidBody>();
  private timer = 1;
  readonly pieces: number;

  constructor(private physics: PhysicsWorld, private origin: FloatingOrigin, roads: RoadNetwork) {
    const plan = planMedians(roads);
    const S = Config.city.median.cell;
    let n = 0;
    for (const run of plan.runs) {
      for (let k = 0; k < run.n - 1; k++) {
        const p = medianPiece(run, k);
        if (p.hw < 0.05) continue;
        const gx = Math.floor(p.x / S);
        const gz = Math.floor(p.z / S);
        const key = gx * 100003 + gz;
        let c = this.cells.get(key);
        if (!c) { c = { cx: (gx + 0.5) * S, cz: (gz + 0.5) * S, segs: [] }; this.cells.set(key, c); }
        c.segs.push(p.x, p.y, p.z, p.len, p.hw, p.yaw, p.pitch, run.kerbH);
        n++;
      }
    }
    this.pieces = n;
  }

  get activeCount(): number {
    return this.active.size;
  }

  /** Call every frame with the player's WORLD position (throttled to 5 Hz). */
  update(dt: number, px: number, pz: number): void {
    this.timer += dt;
    if (this.timer < 0.2) return;
    this.timer = 0;
    const reach = PhysicsConfig.activeRadius + Config.city.median.cell * 0.71;
    for (const [key, c] of this.cells) {
      const d = Math.hypot(px - c.cx, pz - c.cz);
      const has = this.active.has(key);
      if (!has && d <= reach) this.create(key, c);
      else if (has && d > reach + 64) this.remove(key);
    }
  }

  private create(key: number, c: Cell): void {
    const R = this.physics.RAPIER;
    const world = this.physics.world;
    const H = Config.city.median.colliderH;
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(c.cx - this.origin.origin.x, 0, c.cz - this.origin.origin.z));
    for (let o = 0; o < c.segs.length; o += STRIDE) {
      const q = yawPitchQuat(c.segs[o + 5], c.segs[o + 6]);
      const desc = R.ColliderDesc.cuboid(c.segs[o + 4], H / 2, c.segs[o + 3] / 2 + 0.05)
        .setTranslation(c.segs[o] - c.cx, c.segs[o + 1] + H / 2, c.segs[o + 2] - c.cz)
        .setRotation(q)
        .setFriction(0.0) // CRASH FEEL: a car that touches the median slides along it and bounces off a little; it does not stick to it
        .setRestitution(0.2);
      world.createCollider(desc, body);
    }
    this.active.set(key, body);
  }

  private remove(key: number): void {
    const body = this.active.get(key);
    if (!body) return;
    this.physics.world.removeRigidBody(body);
    this.active.delete(key);
  }

  dispose(): void {
    for (const k of [...this.active.keys()]) this.remove(k);
  }
}
void MS;
