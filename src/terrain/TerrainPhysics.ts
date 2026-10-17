import type RAPIER from '@dimforge/rapier3d-compat';
import { Config } from '../core/Config';
import type { Bus } from '../core/EventBus';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { PhysicsConfig } from '../physics/PhysicsConfig';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import { chunkKey, chunkOriginX, chunkOriginZ, distanceToChunk, worldToChunkCoord } from '../world/WorldGrid';

interface ChunkInfo {
  cx: number;
  cz: number;
  n: number;
  heights: Float32Array;
}

/**
 * Rapier heightfield colliders for terrain. Only chunks within `activeRadius` (300 m) of the player
 * have a collider; they are removed again when the player moves away.
 * Body positions are floating-origin LOCAL coordinates (PhysicsWorld shifts them on origin:shift).
 */
export class TerrainPhysics {
  private chunks = new Map<string, ChunkInfo>();
  private active = new Map<string, RAPIER.RigidBody>();
  private timer = 1;

  constructor(
    private physics: PhysicsWorld,
    private origin: FloatingOrigin,
    bus: Bus,
  ) {
    bus.on('chunk:loaded', (e) => {
      this.chunks.set(e.key, { cx: e.cx, cz: e.cz, n: e.vertsPerSide, heights: e.heights });
      this.remove(e.key); // LOD may have changed -> rebuild from the new heights on next sync
      this.timer = 1;
    });
    bus.on('chunk:unloaded', (e) => {
      this.chunks.delete(e.key);
      this.remove(e.key);
    });
  }

  /** True if the ground collider under world position (x, z) exists (the player waits for this before falling). */
  hasColliderAt(x: number, z: number): boolean {
    const { cx, cz } = worldToChunkCoord(x, z);
    return this.active.has(chunkKey(cx, cz));
  }

  get activeCount(): number {
    return this.active.size;
  }

  /** Call every frame with the player's WORLD position. Work is throttled to 5 Hz. */
  update(dt: number, px: number, pz: number): void {
    this.timer += dt;
    if (this.timer < 0.2) return;
    this.timer = 0;

    const r = PhysicsConfig.activeRadius;
    for (const [key, info] of this.chunks) {
      const d = distanceToChunk(px, pz, info.cx, info.cz);
      const has = this.active.has(key);
      if (!has && d <= r) this.create(key, info);
      else if (has && d > r + 64) this.remove(key); // hysteresis
    }
  }

  private create(key: string, info: ChunkInfo): void {
    const R = this.physics.RAPIER;
    const n = info.n;
    const S = Config.world.chunkSize;
    const vn = n + 1;

    // Rapier stores heightfields column-major: index = row + col * (nrows + 1), rows run along z, columns along x.
    const colMajor = new Float32Array(vn * vn);
    for (let iz = 0; iz < vn; iz++) {
      for (let ix = 0; ix < vn; ix++) colMajor[iz + ix * vn] = info.heights[iz * vn + ix];
    }

    const cxw = chunkOriginX(info.cx) + S / 2;
    const czw = chunkOriginZ(info.cz) + S / 2;
    const body = this.physics.world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation(cxw - this.origin.origin.x, 0, czw - this.origin.origin.z),
    );
    this.physics.world.createCollider(R.ColliderDesc.heightfield(n, n, colMajor, { x: S, y: 1, z: S }), body);
    this.active.set(key, body);
  }

  private remove(key: string): void {
    const body = this.active.get(key);
    if (!body) return;
    this.physics.world.removeRigidBody(body);
    this.active.delete(key);
  }
}
