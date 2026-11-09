import * as THREE from 'three';
import { Config } from '../core/Config';
import type { GrassResult } from '../workers/messages';
import type { GrassAssets } from './GrassAssets';
import { CELLS_DRY, CELLS_LOW, CELLS_MID, CELLS_TALL, CELL_HEIGHT } from './GrassAtlasData';
import { GRASS_STRIDE, GrassType } from './TreeTypes';

const G = Config.vegetation.grass;
/** Height of the tallest point of a grass model at scale 1 (cached): the tufts are scaled so this point reaches the wanted height in metres. */
const tops = new WeakMap<THREE.BufferGeometry, number>();
function topOf(g: THREE.BufferGeometry): number {
  let t = tops.get(g);
  if (t === undefined) {
    g.computeBoundingBox();
    t = Math.max(0.05, g.boundingBox ? g.boundingBox.max.y : 1);
    tops.set(g, t);
  }
  return t;
}
const HALF = Config.world.size / 2;
/** Tiles exist a little beyond the playable area, like the terrain chunk margin rings. */
const LIMIT = HALF + Config.world.chunkSize * Config.world.chunkMargin;

interface Tile {
  key: string;
  tx: number;
  tz: number;
  /** distance ring (index into Config.vegetation.grass.lods) the tile was built for */
  lod: number;
  /** one InstancedMesh per grass / flower type that occurs in the tile (null = none of that type) */
  meshes: (THREE.InstancedMesh | null)[];
}

export interface GrassSource {
  requestGrass(tx: number, tz: number, stride: number): Promise<GrassResult>;
}

/** Ring of a tile `d` metres away. `current` = the ring it has now (hysteresis: a tile changes ring only after passing the border by a margin, no flicker). */
function grassLod(d: number, current?: number): number {
  const L = G.lods;
  for (let i = 0; i < L.length; i++) {
    let limit = L[i].to;
    if (current !== undefined) limit *= current > i ? 1 - G.lodHysteresis : 1 + G.lodHysteresis;
    if (d < limit) return i;
  }
  return L.length - 1;
}

const pickCell = (list: number[], h: number): number => list[Math.min(list.length - 1, Math.floor(h * list.length))];
/** Atlas cell of a card: the class follows the grass type, dry (straw) clusters come in patches (like real meadows) and in the `seed` type. */
function cardCell(type: number, h1: number, h2: number, h3: number, dryPatch: number, cityLawn: boolean, dryAmt: number): { cell: number; dry: boolean } {
  const C = G.cards;
  const dryProb = cityLawn ? 0 : Math.min(1, (dryPatch > C.patchAt ? C.dryPatchShare : C.dryShare) + dryAmt);
  if (h3 < dryProb || (type === GrassType.seed && h3 < 0.6 && !cityLawn)) return { cell: pickCell(CELLS_DRY, h1), dry: true };
  const list = type === GrassType.lawn ? CELLS_LOW : type === GrassType.clump || type === GrassType.tussockWide ? CELLS_MID : CELLS_TALL;
  return { cell: pickCell(list, h2), dry: false };
}

const dummy = new THREE.Object3D();
const color = new THREE.Color();
const GREEN: [number, number, number] = [0.25, 0.42, 0.12];
const DRY: [number, number, number] = [0.46, 0.42, 0.2];
const YELLOW: [number, number, number] = [0.42, 0.5, 0.15];
const STRAW: [number, number, number] = [0.62, 0.55, 0.27];
/** City lawn: a fresher, slightly brighter green than the wild meadow. */
const LAWN: [number, number, number] = [0.22, 0.44, 0.11];

/** Smooth 2D value noise in 0..1 (integer-lattice hash, smoothstep blend): decides where the flower patches are. Deterministic, no state. */
function vnoise(x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const h = (a: number, b: number): number => {
    const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/**
 * Grass around the player (STAGE 7). Tiles of `grass.tile` metres within `grass.radius` of the player are requested from
 * the workers, built as one InstancedMesh each and removed again beyond `grass.keep`. Tiles are children of the world root
 * at absolute world positions (like chunks), so the floating origin moves them automatically. No grass is made while the
 * camera is far above the ground (free-fly / helicopter).
 */
export class GrassManager {
  private tiles = new Map<string, Tile>();
  /** tiles asked from the workers (key -> ring asked for); a tile counts as pending until its mesh exists, so it is never requested twice */
  private pending = new Map<string, number>();
  /** tiles in range (key -> the ring they should have now) */
  private wanted = new Map<string, number>();
  private ready: { key: string; tx: number; tz: number; lod: number; data: Float32Array }[] = [];
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
  /** Number of InstancedMeshes in the scene (one per grass / flower type per tile). */
  get meshCount(): number {
    let n = 0;
    for (const t of this.tiles.values()) for (const m of t.meshes) if (m) n++;
    return n;
  }
  get tuftCount(): number {
    let n = 0;
    for (const t of this.tiles.values()) for (const m of t.meshes) if (m) n += m.count;
    return n;
  }

  /** Call every frame. `groundAt` is only asked when the tile list is re-evaluated (5 Hz). */
  update(dt: number, px: number, py: number, pz: number, groundAt: (x: number, z: number) => number): void {
    this.timer += dt;
    if (this.timer >= 0.2) {
      this.timer = 0;
      this.evaluate(px, py, pz, groundAt);
    }
    // tile meshes are built within a small time budget per frame (at least one), so a long meadow fills in fast when driving
    const t0 = performance.now();
    do {
      const r = this.ready.shift();
      if (!r) break;
      this.pending.delete(r.key); // a tile counts as pending until its mesh exists, so it is never requested twice
      // a tile whose ring changed while the worker was busy is dropped (it is asked again with the right ring)
      if (this.wanted.get(r.key) === r.lod && this.tiles.get(r.key)?.lod !== r.lod) this.install(r.key, r.tx, r.tz, r.lod, r.data);
    } while (this.ready.length > 0 && performance.now() - t0 < 4);
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
    const need: { key: string; tx: number; tz: number; d: number; lod: number }[] = [];
    for (let tz = j0; tz <= j1; tz++) {
      for (let tx = i0; tx <= i1; tx++) {
        const x0 = tx * T - HALF;
        const z0 = tz * T - HALF;
        if (x0 < -LIMIT || z0 < -LIMIT || x0 + T > LIMIT || z0 + T > LIMIT) continue;
        const d = Math.hypot(Math.max(x0 - px, 0, px - (x0 + T)), Math.max(z0 - pz, 0, pz - (z0 + T)));
        if (d > G.radius) continue;
        const key = `${tx},${tz}`;
        const have = this.tiles.get(key);
        const lod = grassLod(d, have?.lod);
        this.wanted.set(key, lod);
        if (have?.lod !== lod && !this.pending.has(key)) need.push({ key, tx, tz, d, lod });
      }
    }
    need.sort((a, b) => a.d - b.d);
    for (const n of need) {
      if (this.pending.size >= G.maxInFlight) break;
      this.pending.set(n.key, n.lod);
      this.source.requestGrass(n.tx, n.tz, G.lods[n.lod].stride).then(
        (res) => {
          if (this.disposed) this.pending.delete(n.key);
          else this.ready.push({ key: n.key, tx: n.tx, tz: n.tz, lod: n.lod, data: res.data });
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

  private install(key: string, tx: number, tz: number, lod: number, data: Float32Array): void {
    const count = data.length / GRASS_STRIDE;
    const ring = G.lods[lod];
    const geoms = this.assets.lodGeometries[lod];
    const old = this.tiles.get(key); // the same tile in another ring: swapped in the same frame, so there is never a gap
    if (count === 0) {
      // keep an empty marker so the tile is not requested again
      if (old) this.remove(old);
      this.tiles.set(key, { key, tx, tz, lod, meshes: [] });
      return;
    }
    const ox = tx * G.tile - HALF;
    const oz = tz * G.tile - HALF;
    // 1. choose the type of every tuft (grass kinds by a hash, wildflowers inside meadow patches)
    const types = new Uint8Array(count);
    const counts = new Array<number>(geoms.length).fill(0);
    for (let i = 0; i < count; i++) {
      const o = i * GRASS_STRIDE;
      const wx = ox + data[o];
      const wz = oz + data[o + 2];
      const hh = Math.sin(data[o] * 12.9898 + data[o + 2] * 78.233) * 43758.5453;
      const h1 = hh - Math.floor(hh);
      const h2 = hh * 7.31 - Math.floor(hh * 7.31);
      const h3 = hh * 31.7 - Math.floor(hh * 31.7);
      const dry = data[o + 6];
      const flag = data[o + 7];
      let type: number;
      if (flag > 0.5 && flag < 1.5 || flag > 2.5) {
        // a big grass clump (tussock): two shapes, mixed by the hash (flag 3 = tall clump at a tree base / fence in the city)
        type = h1 < 0.55 ? GrassType.tussock : GrassType.tussockWide;
        types[i] = type;
        counts[type]++;
        continue;
      }
      if (flag > 1.5) {
        // CITY LAWN tuft (flag 2): short fine lawn, a few broad-leaf tufts, and small white / pink flowers (daisy, clover, buttercup) in the near ring
        if (lod === 0 && h2 < G.city.flowerShare) type = h3 < 0.5 ? GrassType.daisy : h3 < 0.8 ? GrassType.clover : GrassType.buttercup;
        else type = h1 < 0.82 ? GrassType.lawn : h1 < 0.94 ? GrassType.clump : GrassType.wild;
        types[i] = type;
        counts[type]++;
        continue;
      }
      // flower patches (value noise, ~25 m) with one dominant species per patch (another noise, ~60 m); never on dry high ground
      const patch = vnoise(wx / 22, wz / 22);
      const inPatch = patch > 0.64;
      const flowerChance = (inPatch ? G.flowerInPatch * Math.min(1, (patch - 0.64) / 0.12 + 0.35) : G.flowerScatter) * (1 - dry);
      if (lod === 0 && h2 < flowerChance) {
        const sp = vnoise(wx / 55 + 40, wz / 55 - 17);
        const dominant = sp < 0.2 ? GrassType.daisy : sp < 0.38 ? GrassType.buttercup : sp < 0.52 ? GrassType.lavender : sp < 0.68 ? GrassType.poppy : sp < 0.84 ? GrassType.cornflower : GrassType.clover;
        // 70 % the dominant species of the patch, 30 % a random other flower so the meadow is mixed, not a single colour
        type = h3 < 0.7 ? dominant : GrassType.daisy + Math.floor(((h3 - 0.7) / 0.3) * 6) % 6;
      } else {
        type = h1 < 0.32 ? GrassType.wild : h1 < 0.62 ? GrassType.lawn : h1 < 0.88 ? GrassType.clump : GrassType.seed;
        if (dry > 0.5 && type === GrassType.lawn) type = GrassType.wild;
      }
      types[i] = type;
      counts[type]++;
    }
    // 2. one InstancedMesh per type
    const meshes: (THREE.InstancedMesh | null)[] = [];
    const next = new Array<number>(geoms.length).fill(0);
    const cellArr: (Float32Array | undefined)[] = new Array(geoms.length);
    for (let t = 0; t < geoms.length; t++) {
      if (counts[t] === 0) {
        meshes.push(null);
        continue;
      }
      let mesh: THREE.InstancedMesh;
      if (geoms[t].userData.card) {
        // card cluster: own copy of the tiny shared card geometry (4-6 triangles) that carries this tile's per-instance atlas cells
        const g = geoms[t].clone();
        g.userData.owned = true;
        const cells = new Float32Array(counts[t]);
        g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 1));
        cellArr[t] = cells;
        mesh = new THREE.InstancedMesh(g, this.assets.cardMaterial, counts[t]);
      } else {
        mesh = new THREE.InstancedMesh(geoms[t], this.assets.material, counts[t]);
      }
      mesh.name = `grass ${key} type${t}`;
      meshes.push(mesh);
    }
    for (let i = 0; i < count; i++) {
      const o = i * GRASS_STRIDE;
      const type = types[i];
      const mesh = meshes[type] as THREE.InstancedMesh;
      const slot = next[type]++;
      const hh = Math.sin(data[o] * 12.9898 + data[o + 2] * 78.233) * 43758.5453;
      const h2 = hh * 7.31 - Math.floor(hh * 7.31);
      const sc = data[o + 3];
      dummy.position.set(data[o], data[o + 1], data[o + 2]);
      dummy.rotation.set(0, data[o + 4], 0);
      // SIZE (metres, not model scale): a tuft's tallest blade is 4-20 cm (blades of 1-20 cm in a tuft), a big clump 25-50 cm at the most.
      const top = topOf(geoms[type]);
      const card = !!geoms[type].userData.card;
      let cell = 0;
      let cellDry = false;
      if (card) {
        const hq = Math.sin(data[o] * 5.1234 + data[o + 2] * 9.4321) * 43758.5453;
        const h3 = hq - Math.floor(hq);
        const hr = Math.sin(data[o] * 3.7 + data[o + 2] * 1.9) * 43758.5453;
        const h1 = hr - Math.floor(hr);
        const dp = vnoise((ox + data[o]) / G.cards.patchScale + 11, (oz + data[o + 2]) / G.cards.patchScale - 5);
        ({ cell, dry: cellDry } = cardCell(type, h1, h2, h3, dp, data[o + 7] > 1.5 && data[o + 7] < 2.5, data[o + 6]));
        (cellArr[type] as Float32Array)[slot] = cell;
      }
      const wide = type === GrassType.lawn ? 1.1 : type === GrassType.wild ? 0.95 : 1;
      const lawnTuft = data[o + 7] > 1.5 && data[o + 7] < 2.5;
      const hMul = lawnTuft ? G.city.height : 1; // mown city lawn: even shorter
      if (card) {
        // CARD: cluster height in metres (small, dense grass), card width = height / cluster aspect (the cluster is as wide as its cell)
        const hf = CELL_HEIGHT[cell];
        let hm: number;
        let wm: number;
        if (type >= GrassType.tussock) {
          const rel = Math.min(1, sc / 1.2);
          hm = G.cards.clumpHeight * (0.55 + 0.45 * rel) * (0.8 + 0.2 * h2);
          wm = ring.clumpSize;
        } else {
          const rel = Math.min(1, sc / 1.5);
          const v = G.tuft.min + (1 - G.tuft.min) * (0.5 * rel + 0.5 * h2 ** 1.2);
          hm = G.tuft.maxHeight * v * hMul * G.cards.heightMul;
          wm = ring.size;
        }
        const s1 = hm / hf;
        dummy.scale.set(s1 * wm, s1, s1 * wm);
      } else if (type >= GrassType.tussock) {
        // clump: the larger its placement scale (0.75..1.45 x edge / base factors), the taller it is, never above clump.maxHeight
        const rel = Math.min(1, sc / 1.2);
        const ys = (G.clump.maxHeight * (0.55 + 0.45 * rel) * (0.8 + 0.2 * h2)) / top;
        const cw = ys * ring.clumpSize * G.clump.width;
        dummy.scale.set(cw, ys, cw);
      } else {
        // tuft: height from the placement scale (small at the rim of a patch) and the hash; the far rings make a tuft a bit wider (fewer tufts)
        const rel = Math.min(1, sc / 1.5);
        const v = G.tuft.min + (1 - G.tuft.min) * (0.5 * rel + 0.5 * h2 ** 1.2);
        const ys = (G.tuft.maxHeight * v * hMul) / top;
        const w = ys * wide * ring.size * G.widthScale;
        dummy.scale.set(w, ys, w);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(slot, dummy.matrix);
      const dry = data[o + 6];
      const t = data[o + 5] * (0.9 + h2 * 0.2); // brightness varies tuft to tuft
      if (card) {
        // the instance colour multiplies the atlas texture: dark green for green clusters, a neutral warm tint for straw ones
        const tint = cellDry ? G.cards.dryTint : G.cards.greenTint;
        const k = t * G.cards.brightness * (0.92 + 0.16 * h2);
        color.setRGB(tint[0] * k, tint[1] * k * (cellDry ? 1 : 0.94 + 0.12 * h2), tint[2] * k, THREE.SRGBColorSpace);
        mesh.setColorAt(slot, color);
        continue;
      }
      // COLOUR VARIATION: every tuft is fresh green, yellow-green or straw (shares: Config grass.look). A hash of the tuft's position picks the class;
      // brighter tufts lean yellow-green like sun-lit, drier grass. The city lawn has no straw.
      const cityLawn = data[o + 7] > 1.5;
      const hc = Math.sin(data[o] * 39.3468 + data[o + 2] * 17.1313 + 5.7) * 43758.5453;
      const pick = hc - Math.floor(hc);
      const straw = cityLawn ? 0 : pick < G.look.strawShare ? 0.55 + 0.3 * h2 : 0;
      const yellowCls = pick > 1 - G.look.yellowShare ? 0.45 + 0.35 * h2 : 0;
      const u = Math.min(1, Math.max(0, Math.max((t - 0.85) / 0.3 * 0.55, yellowCls)));
      const base: [number, number, number] = cityLawn ? LAWN : GREEN;
      color.setRGB(
        (base[0] + (YELLOW[0] - base[0]) * u + (STRAW[0] - base[0]) * straw + (DRY[0] - base[0]) * dry) * t,
        (base[1] + (YELLOW[1] - base[1]) * u + (STRAW[1] - base[1]) * straw + (DRY[1] - base[1]) * dry) * t,
        (base[2] + (YELLOW[2] - base[2]) * u + (STRAW[2] - base[2]) * straw + (DRY[2] - base[2]) * dry) * t,
        THREE.SRGBColorSpace,
      );
      mesh.setColorAt(slot, color);
    }
    if (old) this.remove(old);
    for (const mesh of meshes) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.place(mesh, tx, tz);
    }
    this.tiles.set(key, { key, tx, tz, lod, meshes });
  }

  private place(mesh: THREE.InstancedMesh, tx: number, tz: number): void {
    mesh.position.set(tx * G.tile - HALF, 0, tz * G.tile - HALF);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.root.add(mesh);
  }

  private remove(t: Tile): void {
    for (const m of t.meshes) {
      if (!m) continue;
      this.root.remove(m);
      m.dispose(); // frees the per-tile instance buffers; the shared geometries / material stay
      if (m.geometry.userData.owned) m.geometry.dispose(); // the per-tile card geometry copy
    }
    this.tiles.delete(t.key);
  }

  dispose(): void {
    this.disposed = true;
    for (const t of [...this.tiles.values()]) this.remove(t);
    this.ready.length = 0;
    this.pending.clear();
  }
}
