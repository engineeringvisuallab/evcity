import * as THREE from 'three';
import { Config } from '../core/Config';
import type { GrassResult } from '../workers/messages';
import type { GrassAssets } from './GrassAssets';
import { GRASS_STRIDE } from './TreeTypes';

const G = Config.vegetation.grass;
const HALF = Config.world.size / 2;
/** Tiles exist a little beyond the playable area, like the terrain chunk margin rings. */
const LIMIT = HALF + Config.world.chunkSize * Config.world.chunkMargin;

interface Tile {
  key: string;
  tx: number;
  tz: number;
  mesh: THREE.InstancedMesh;
}

export interface GrassSource {
  requestGrass(tx: number, tz: number): Promise<GrassResult>;
}

const dummy = new THREE.Object3D();
const color = new THREE.Color();
const GREEN: [number, number, number] = [0.25, 0.42, 0.12];
const DRY: [number, number, number] = [0.46, 0.42, 0.2];

/**
 * Grass around the player (STAGE 7). Tiles of `grass.tile` metres within `grass.radius` of the player are requested from
 * the workers, built as one InstancedMesh each and removed again beyond `grass.keep`. Tiles are children of the world root
 * at absolute world positions (like chunks), so the floating origin moves them automatically. No grass is made while the
 * camera is far above the ground (free-fly / helicopter).
 */
export class GrassManager {
  private tiles = new Map<string, Tile>();
  private pending = new Set<string>();
  private wanted = new Set<string>();
  private ready: { key: string; tx: number; tz: number; data: Float32Array }[] = [];
  private timer = 1;
  private disposed = false;

  constructor(
    private root: THREE.Object3D,
    private source: GrassSource,
    private assets: GrassAssets,
  ) {}

  get tileCount(): number {
    return this.tiles.size;
  }
  get tuftCount(): number {
    let n = 0;
    for (const t of this.tiles.values()) n += t.mesh.count;
    return n;
  }

  /** Call every frame. `groundAt` is only asked when the tile list is re-evaluated (5 Hz). */
  update(dt: number, px: number, py: number, pz: number, groundAt: (x: number, z: number) => number): void {
    this.timer += dt;
    if (this.timer >= 0.2) {
      this.timer = 0;
      this.evaluate(px, py, pz, groundAt);
    }
    // at most one tile mesh per frame
    const r = this.ready.shift();
    if (r) {
      this.pending.delete(r.key); // a tile counts as pending until its mesh exists, so it is never requested twice
      if (this.wanted.has(r.key) && !this.tiles.has(r.key)) this.install(r.key, r.tx, r.tz, r.data);
    }
  }

  private evaluate(px: number, py: number, pz: number, groundAt: (x: number, z: number) => number): void {
    this.wanted.clear();
    const high = py - groundAt(px, pz) > G.maxAboveGround;
    if (high) {
      for (const t of [...this.tiles.values()]) this.remove(t);
      for (const r of this.ready) this.pending.delete(r.key);
      this.ready.length = 0;
      return;
    }

    const T = G.tile;
    const i0 = Math.floor((px - G.radius + HALF) / T);
    const i1 = Math.floor((px + G.radius + HALF) / T);
    const j0 = Math.floor((pz - G.radius + HALF) / T);
    const j1 = Math.floor((pz + G.radius + HALF) / T);
    const need: { key: string; tx: number; tz: number; d: number }[] = [];
    for (let tz = j0; tz <= j1; tz++) {
      for (let tx = i0; tx <= i1; tx++) {
        const x0 = tx * T - HALF;
        const z0 = tz * T - HALF;
        if (x0 < -LIMIT || z0 < -LIMIT || x0 + T > LIMIT || z0 + T > LIMIT) continue;
        const d = Math.hypot(Math.max(x0 - px, 0, px - (x0 + T)), Math.max(z0 - pz, 0, pz - (z0 + T)));
        if (d > G.radius) continue;
        const key = `${tx},${tz}`;
        this.wanted.add(key);
        if (!this.tiles.has(key) && !this.pending.has(key)) need.push({ key, tx, tz, d });
      }
    }
    need.sort((a, b) => a.d - b.d);
    for (const n of need) {
      if (this.pending.size >= G.maxInFlight) break;
      this.pending.add(n.key);
      this.source.requestGrass(n.tx, n.tz).then(
        (res) => {
          if (this.disposed) this.pending.delete(n.key);
          else this.ready.push({ key: n.key, tx: n.tx, tz: n.tz, data: res.data });
        },
        () => this.pending.delete(n.key),
      );
    }

    // remove tiles that are clearly out of range (keep > radius = no flicker)
    for (const t of [...this.tiles.values()]) {
      const x0 = t.tx * T - HALF;
      const z0 = t.tz * T - HALF;
      const d = Math.hypot(Math.max(x0 - px, 0, px - (x0 + T)), Math.max(z0 - pz, 0, pz - (z0 + T)));
      if (d > G.keep) this.remove(t);
    }
  }

  private install(key: string, tx: number, tz: number, data: Float32Array): void {
    const count = data.length / GRASS_STRIDE;
    if (count === 0) {
      // keep an empty marker so the tile is not requested again
      const mesh = new THREE.InstancedMesh(this.assets.geometry, this.assets.material, 1);
      mesh.count = 0;
      this.place(mesh, tx, tz);
      this.tiles.set(key, { key, tx, tz, mesh });
      return;
    }
    const mesh = new THREE.InstancedMesh(this.assets.geometry, this.assets.material, count);
    mesh.name = `grass ${key}`;
    for (let i = 0; i < count; i++) {
      const o = i * GRASS_STRIDE;
      dummy.position.set(data[o], data[o + 1], data[o + 2]);
      dummy.rotation.set(0, data[o + 4], 0);
      dummy.scale.setScalar(data[o + 3]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const dry = data[o + 6];
      const t = data[o + 5];
      color.setRGB(
        (GREEN[0] + (DRY[0] - GREEN[0]) * dry) * t,
        (GREEN[1] + (DRY[1] - GREEN[1]) * dry) * t,
        (GREEN[2] + (DRY[2] - GREEN[2]) * dry) * t,
        THREE.SRGBColorSpace,
      );
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.place(mesh, tx, tz);
    this.tiles.set(key, { key, tx, tz, mesh });
  }

  private place(mesh: THREE.InstancedMesh, tx: number, tz: number): void {
    mesh.position.set(tx * G.tile - HALF, 0, tz * G.tile - HALF);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.root.add(mesh);
  }

  private remove(t: Tile): void {
    this.root.remove(t.mesh);
    t.mesh.dispose(); // frees the per-tile instance buffers; the shared geometry / material stay
    this.tiles.delete(t.key);
  }

  dispose(): void {
    this.disposed = true;
    for (const t of [...this.tiles.values()]) this.remove(t);
    this.ready.length = 0;
    this.pending.clear();
  }
}
