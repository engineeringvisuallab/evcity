import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import { Config } from '../core/Config';
import type { RoadNetwork } from './RoadNetwork';
import { FS, footPiece, planFootpaths } from './FootpathPlan';
import { yawPitchQuat } from './MedianPlan';

/**
 * ROADS STEP 3: the collider of the raised footpath, so a person (and a car wheel) stands ON the footpath instead of sinking through it to the
 * road height. One fixed cuboid per piece (the strip between the kerb face and the outer edge), top = footpath height at the middle of the piece
 * (the dropped-kerb pieces are lower). Made per 125 m cell, only near the player, like MedianPhysics / BridgePhysics.
 * A car can still drive up the kerb (150 mm), as in real life; the tree pits, poles and the median stop it from going far.
 */
interface Cell { cx: number; cz: number; segs: number[] }
const STRIDE = 8; // x, y, z, len, halfWidth, yaw, pitch, height

export class FootpathPhysics {
  private cells = new Map<number, Cell>();
  private active = new Map<number, RAPIER.RigidBody>();
  private timer = 1;
  readonly pieces: number;

  constructor(private physics: PhysicsWorld, private origin: FloatingOrigin, roads: RoadNetwork) {
    const plan = planFootpaths(roads);
    const S = Config.city.footpath.cell;
    let n = 0;
    for (const run of plan.runs) {
      for (let k = 0; k < run.n - 1; k++) {
        const p = footPiece(run, k);
        if (p.h < 0.01) continue;
        const gx = Math.floor(p.x / S);
        const gz = Math.floor(p.z / S);
        const key = gx * 100003 + gz;
        let c = this.cells.get(key);
        if (!c) { c = { cx: (gx + 0.5) * S, cz: (gz + 0.5) * S, segs: [] }; this.cells.set(key, c); }
        c.segs.push(p.x, p.y, p.z, p.len, run.width / 2, p.yaw, p.pitch, p.h);
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
    const reach = PhysicsConfig.activeRadius + Config.city.footpath.cell * 0.71;
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
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(c.cx - this.origin.origin.x, 0, c.cz - this.origin.origin.z));
    const below = 0.1; // the cuboid reaches this far under the road surface, so there is never a gap
    for (let o = 0; o < c.segs.length; o += STRIDE) {
      const h = c.segs[o + 7];
      const q = yawPitchQuat(c.segs[o + 5], c.segs[o + 6]);
      const desc = R.ColliderDesc.cuboid(c.segs[o + 4], (h + below) / 2, c.segs[o + 3] / 2 + 0.03)
        .setTranslation(c.segs[o] - c.cx, c.segs[o + 1] + (h - below) / 2, c.segs[o + 2] - c.cz)
        .setRotation(q)
        .setFriction(0.8);
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
void FS;
