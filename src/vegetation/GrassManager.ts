import * as THREE from 'three';
import { Config } from '../core/Config';
import type { GrassResult } from '../workers/messages';
import type { GrassAssets } from './GrassAssets';
import { GRASS_STRIDE, GRASS_TYPE_COUNT, GrassType, isGrassClump, isGrassFlower, isGrassLeafy } from './TreeTypes';

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

/** A tile being built over several frames (see GrassManager.stepJob). */
interface InstallJob {
  key: string;
  tx: number;
  tz: number;
  lod: number;
  data: Float32Array;
  count: number;
  geoms: THREE.BufferGeometry[];
  ring: (typeof G.lods)[number];
  ox: number;
  oz: number;
  /** 0 = choosing the models, 1 = writing the matrices and colours */
  phase: 0 | 1;
  i: number;
  types: Uint8Array;
  counts: number[];
  meshes: (THREE.InstancedMesh | null)[];
  next: number[];
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

/** Type index offset of the extra (dense) tufts: they get their own InstancedMesh per model, with the short-fade material. */
const EXTRA = GRASS_TYPE_COUNT;
/** One of the six coloured wild flowers (marigold, buttercup, lavender, poppy, cornflower, cosmos) from a hash 0..1: every kind equally often. */
const FLOWER_KINDS = [GrassType.daisy, GrassType.buttercup, GrassType.lavender, GrassType.poppy, GrassType.cornflower, GrassType.clover];
const flowerOf = (h: number): number => FLOWER_KINDS[Math.min(5, Math.floor(h * 6))];
const dummy = new THREE.Object3D();
const color = new THREE.Color();
type Pal = ReadonlyArray<readonly [number, number, number, number]>; // r, g, b, share
const GRASS_PALETTE: Pal = [
  // 2026-11-23 (user): the grass is DEEP GREEN; ~13 % of the tufts are dead (mora) grass, brown-straw
  [0.07, 0.24, 0.06, 0.22], // deep green
  [0.05, 0.2, 0.05, 0.2], // darker deep green
  [0.06, 0.26, 0.09, 0.14], // deep green, a little blue
  [0.09, 0.26, 0.06, 0.12], // deep green, a little olive
  [0.12, 0.3, 0.07, 0.08], // fresh deep green
  [0.2, 0.26, 0.07, 0.07], // dark olive
  [0.5, 0.22, 0.04, 0.07], // dead brown
  [0.44, 0.27, 0.06, 0.06], // dead straw-brown
];
const LAWN_PALETTE: Pal = [
  [0.07, 0.25, 0.06, 0.36],
  [0.05, 0.2, 0.05, 0.26],
  [0.06, 0.26, 0.09, 0.18],
  [0.1, 0.28, 0.06, 0.14],
  [0.44, 0.27, 0.06, 0.06], // a few dead tufts
];
const JUNGLE_PALETTE: Pal = [
  [0.07, 0.26, 0.06, 0.3],
  [0.05, 0.2, 0.05, 0.24],
  [0.06, 0.27, 0.1, 0.18],
  [0.1, 0.28, 0.06, 0.12],
  [0.5, 0.22, 0.04, 0.08], // dead brown
  [0.44, 0.27, 0.06, 0.08], // dead straw-brown
];
/** City lawn: a fresher, slightly brighter green than the wild meadow. */

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
  /** Last camera position seen by evaluate() (5 Hz) and the speed (m/s) from it: fast travel makes no new grass tiles. */
  private lastX = NaN;
  private lastZ = NaN;
  private speed = 0;
  private disposed = false;
  /** The tile whose meshes are being built right now (spread over several frames: a dense tile has ~10x more instances). */
  private job: InstallJob | null = null;

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
    // tile meshes are built within a small time budget per frame; one dense tile takes several frames, so there is no single long hitch
    const t0 = performance.now();
    const until = t0 + (this.ready.length > 2 ? 4 : 2); // small build budget per frame (was 9 / 5 ms)
    while (performance.now() < until) {
      if (!this.job) {
        const r = this.ready.shift();
        if (!r) break;
        // a tile whose ring changed while the worker was busy is dropped (it is asked again with the right ring)
        if (this.wanted.get(r.key) === r.lod && this.tiles.get(r.key)?.lod !== r.lod) {
          this.job = this.startJob(r.key, r.tx, r.tz, r.lod, r.data);
          if (this.job === null) this.pending.delete(r.key);
        } else this.pending.delete(r.key);
        continue;
      }
      if (this.stepJob(this.job, until)) {
        const j = this.job;
        this.job = null;
        this.pending.delete(j.key); // a tile counts as pending until its mesh exists, so it is never requested twice
        this.finishJob(j);
      }
    }
  }

  private evaluate(px: number, py: number, pz: number, groundAt: (x: number, z: number) => number): void {
    this.wanted.clear();
    this.speed = Number.isNaN(this.lastX) ? 0 : Math.hypot(px - this.lastX, pz - this.lastZ) / 0.2;
    this.lastX = px;
    this.lastZ = pz;
    const high = py - groundAt(px, pz) > G.maxAboveGround;
    if (high) {
      for (const t of [...this.tiles.values()]) this.remove(t);
      for (const r of this.ready) this.pending.delete(r.key);
      this.ready.length = 0;
      this.dropJob();
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
    const fast = this.speed > G.maxSpeed; // fast travel: no new tiles (they would be left behind at once), the CPU / GPU rests
    for (const n of need) {
      if (fast || this.pending.size >= G.maxInFlight) break;
      this.pending.set(n.key, n.lod);
      this.source.requestGrass(n.tx, n.tz, G.lods[n.lod].stride).then(
        (res) => {
          if (this.disposed) this.pending.delete(n.key);
          else this.ready.push({ key: n.key, tx: n.tx, tz: n.tz, lod: n.lod, data: res.data });
        },
        () => this.pending.delete(n.key),
      );
    }

    // remove tiles that are clearly out of range (keep > radius = no flicker); the extra (dense) tufts of a tile are only drawn while it is near
    for (const t of [...this.tiles.values()]) {
      const x0 = t.tx * T - HALF;
      const z0 = t.tz * T - HALF;
      const d = Math.hypot(Math.max(x0 - px, 0, px - (x0 + T)), Math.max(z0 - pz, 0, pz - (z0 + T)));
      if (d > G.keep) {
        this.remove(t);
        continue;
      }
      const show = d < G.denseFade[1] + 2;
      for (const m of t.meshes) if (m && m.userData.extra && m.visible !== show) m.visible = show;
    }
  }

  /** Forget the tile being built (its meshes are freed). */
  private dropJob(): void {
    const j = this.job;
    if (!j) return;
    this.pending.delete(j.key);
    for (const m of j.meshes) m?.dispose();
    this.job = null;
  }

  /** Start building a tile: nothing heavy happens here (an empty tile is installed at once and returns null). */
  private startJob(key: string, tx: number, tz: number, lod: number, data: Float32Array): InstallJob | null {
    const count = data.length / GRASS_STRIDE;
    if (count === 0) {
      // keep an empty marker so the tile is not requested again
      const old = this.tiles.get(key);
      if (old) this.remove(old);
      this.tiles.set(key, { key, tx, tz, lod, meshes: [] });
      return null;
    }
    const geoms = this.assets.lodGeometries[lod];
    return {
      key, tx, tz, lod, data, count, geoms, ring: G.lods[lod],
      ox: tx * G.tile - HALF, oz: tz * G.tile - HALF,
      phase: 0, i: 0,
      types: new Uint8Array(count), counts: new Array<number>(geoms.length * 2).fill(0),
      meshes: [], next: new Array<number>(geoms.length * 2).fill(0),
    };
  }

  /** Which grass / flower model a tuft uses (grass kinds by a hash, wildflowers inside meadow patches). */
  private typeOf(data: Float32Array, o: number, ox: number, oz: number, lod: number): number {
    const wx = ox + data[o];
    const wz = oz + data[o + 2];
    const hh = Math.sin(data[o] * 12.9898 + data[o + 2] * 78.233) * 43758.5453;
    const h1 = hh - Math.floor(hh);
    const h2 = hh * 7.31 - Math.floor(hh * 7.31);
    const h3 = hh * 31.7 - Math.floor(hh * 31.7);
    const dry = data[o + 6];
    const flag = data[o + 7];
    const type0 = this.pick(wx, wz, lod, h1, h2, h3, dry, flag);
    if (!G.broadLeaf && !(flag > 5.5 && flag < 6.5) && isGrassLeafy(type0 >= EXTRA ? type0 - EXTRA : type0)) return GrassType.lawn + (type0 >= EXTRA ? EXTRA : 0); // no broad-leaf ground cover (leafy / clover patches): fine single grass instead
    if (G.whiteFlowers) return type0;
    // NO WHITE GRASS: daisy (white petals), clover (white pom-pom) and the pale seed-head grass become plain green grass (keeping the EXTRA offset)
    const extra = type0 >= EXTRA ? EXTRA : 0;
    const base = type0 - extra;
    if (base === GrassType.seed) return GrassType.wild + extra;
    return type0;
  }

  /** Real choice of the model; typeOf() wraps it and removes the white kinds (Config grass.whiteFlowers = false). */
  private pick(wx: number, wz: number, lod: number, h1: number, h2: number, h3: number, dry: number, flag: number): number {
    let type: number;
    if (flag > 7.5 && flag < 8.5) {
      // CENTRAL PARK LAWN (flag 8): the fine city lawn, a little wild grass, no flowers (the beds have them)
      return h1 < 0.9 ? GrassType.lawn : GrassType.wild;
    }
    if (flag > 8.5) {
      // CENTRAL PARK bed / border (flag 9 + flower index): mostly that flower (near ring), the rest short green so the bed has no gaps; far rings = green only
      if (lod === 0 && h2 < 0.84) return GrassType.daisy + Math.round(flag - 9);
      return h1 < 0.7 ? GrassType.lawn : GrassType.wild;
    }
    if (flag > 6.5) {
      // JUNGLE grass CLUMP (flag 7): the two shady tussock shapes (no seed plumes: those belong to the open savanna)
      return GrassType.durba; // 2026-11-23: no broad tussock leaves in the jungle (user): thin long durba, taller (G.jungle.tall)
    }
    if (flag > 5.5) {
      // JUNGLE FLOOR grass (flag 6): a few wild flowers (never white), in small patches (~14 m) and only a few elsewhere; the rest is a rich mix of the plain grass kinds + broad-leaf seedlings (leafy) and a little trefoil
      if (lod === 0 && h2 < (vnoise(wx / 14 + 7, wz / 14 - 3) > 0.62 ? 0.26 : 0.05)) return flowerOf(h3);
      // 2026-11-23: the jungle floor is mostly fresh glossy DURBA (single fine blades), here and there a triple-leaf (clover) and a single broad leaf, a few small bunches
      return h1 < 0.85 ? GrassType.durba : h1 < 0.95 ? GrassType.trefoil : GrassType.leafy;
    }
    if (flag > 4.5) {
      // MEDIAN grass (flag 5): the game's grass kinds, and a share of the game's wild flowers (never white ones) in the near ring
      if (lod === 0 && h2 < Config.city.median.grass.flowerShare) return flowerOf(h3);
      return h1 < 0.25 ? GrassType.wild : h1 < 0.88 ? GrassType.lawn : GrassType.clump;
    }
    if (flag > 3.5) {
      // DENSE extra single grass (flag 4): plain grass kinds only, never a flower and never a clump
      type = h1 < 0.16 ? GrassType.wild : h1 < 0.78 ? GrassType.lawn : h1 < 0.84 ? GrassType.clump : h1 < 0.94 ? GrassType.leafy : GrassType.trefoil;
      if (dry > 0.5 && (type === GrassType.lawn || isGrassLeafy(type))) type = GrassType.wild;
      return type + EXTRA;
    }
    if (flag > 0.5 && flag < 1.5) {
      // a big grass clump of the open land (flag 1): upright tussock, wide arching tussock, and the tall savanna bunch with seed plumes (reference photo), mixed by the hash
      return h1 < 0.35 ? GrassType.tussock : h1 < 0.62 ? GrassType.tussockWide : GrassType.tussockSeed;
    }
    if (flag > 2.5 && flag < 3.5) {
      // flag 3 = tall clump at a tree base / fence in the city
      return h1 < 0.55 ? GrassType.tussock : GrassType.tussockWide;
    }
    if (flag > 1.5) {
      // CITY LAWN tuft (flag 2): short fine lawn, a few broad-leaf tufts, and small white / pink flowers (daisy, clover, buttercup) in the near ring
      if (lod === 0 && h2 < G.city.flowerShare) return flowerOf(h3);
      return h1 < 0.74 ? GrassType.lawn : h1 < 0.84 ? GrassType.clump : h1 < 0.89 ? GrassType.leafy : h1 < 0.96 ? GrassType.trefoil : GrassType.wild; // lawn weeds: a little broad-leaf and clover
    }
    // flower patches (value noise, ~25 m) with one dominant species per patch (another noise, ~60 m); never on dry high ground
    const patch = vnoise(wx / 22, wz / 22);
    const inPatch = patch > 0.64;
    const flowerChance = (inPatch ? G.flowerInPatch * Math.min(1, (patch - 0.64) / 0.12 + 0.35) : G.flowerScatter) * (1 - dry);
    if (lod === 0 && h2 < flowerChance) {
      const sp = vnoise(wx / 55 + 40, wz / 55 - 17);
      const dominant = sp < 0.2 ? GrassType.daisy : sp < 0.38 ? GrassType.buttercup : sp < 0.52 ? GrassType.lavender : sp < 0.68 ? GrassType.poppy : sp < 0.84 ? GrassType.cornflower : GrassType.clover;
      // 70 % the dominant species of the patch, 30 % a random other flower so the meadow is mixed, not a single colour
      return h3 < 0.7 ? dominant : GrassType.daisy + Math.floor(((h3 - 0.7) / 0.3) * 6) % 6;
    }
    // open meadow / tree-base grass: blades with broad-leaf ground cover (leafy) and clover (trefoil) growing between them, like a real forest floor
    type = h1 < 0.16 ? GrassType.wild : h1 < 0.68 ? GrassType.lawn : h1 < 0.76 ? GrassType.clump : h1 < 0.88 ? GrassType.leafy : h1 < 0.95 ? GrassType.trefoil : GrassType.seed;
    if (dry > 0.5 && (type === GrassType.lawn || isGrassLeafy(type))) type = GrassType.wild;
    return type;
  }

  /** Write the matrix and colour of one tuft / clump. */
  private fillOne(j: InstallJob, i: number): void {
    const { data, geoms, ring } = j;
    const o = i * GRASS_STRIDE;
    const slot0 = j.types[i];
    const type = slot0 >= EXTRA ? slot0 - EXTRA : slot0; // the model
    const mesh = j.meshes[slot0] as THREE.InstancedMesh;
    const slot = j.next[slot0]++;
    const hh = Math.sin(data[o] * 12.9898 + data[o + 2] * 78.233) * 43758.5453;
    const h2 = hh * 7.31 - Math.floor(hh * 7.31);
    const sc = data[o + 3];
    const flag = data[o + 7];
    dummy.position.set(data[o], data[o + 1], data[o + 2]);
    dummy.rotation.set(0, data[o + 4], 0);
    // SIZE (metres, not model scale): a meadow tuft's tallest blade is up to tuft.maxHeight (0.6 m), a flower up to tuft.flowerMaxHeight (0.4 m),
    // a big clump up to clump.maxHeight (1 m); the mown city lawn keeps its old 0.2 m x city.height.
    const top = topOf(geoms[type]);
    const wide = type === GrassType.lawn || type === GrassType.durba ? 1.1 : type === GrassType.wild ? 0.95 : type === GrassType.leafy ? 0.55 : type === GrassType.trefoil ? 0.9 : 1;
    const lawnTuft = (flag > 1.5 && flag < 2.5) || (flag > 7.5 && flag < 8.5);
    if (isGrassClump(type)) {
      // clump: the larger its placement scale (0.75..1.45 x edge / base factors), the taller it is, never above clump.maxHeight (the seed-plume bunch is `clump.seedTall` x taller)
      const rel = Math.min(1, sc / 1.2);
      const ys = (G.clump.maxHeight * (type === GrassType.tussockSeed ? G.clump.seedTall : 1) * (0.55 + 0.45 * rel) * (0.8 + 0.2 * h2)) / top;
      const cw = ys * ring.clumpSize * G.clump.width;
      dummy.scale.set(cw, ys, cw);
    } else {
      // tuft: height from the placement scale (small at the rim of a patch) and the hash; the far rings make a tuft a bit wider (fewer tufts)
      const rel = Math.min(1, sc / 1.5);
      const v = G.tuft.min + (1 - G.tuft.min) * (0.5 * rel + 0.5 * h2 ** 1.2);
      const isFlower = isGrassFlower(type);
      const maxH = lawnTuft ? G.tuft.lawnMaxHeight * G.city.height : isFlower ? G.tuft.flowerMaxHeight : type === GrassType.trefoil ? G.leafy.trefoilHeight : type === GrassType.leafy ? G.leafy.maxHeight : G.tuft.maxHeight;
      const ys = (maxH * v) / top;
      const w = ys * wide * ring.size * (lawnTuft ? G.tuft.lawnWidthScale : G.widthScale);
      dummy.scale.set(w, ys, w);
    }
    if (flag > 7.5 && flag < 8.5) dummy.scale.y *= G.parkLawnTall; // park lawn: 2x taller blades
    if (flag > 8.5 && isGrassFlower(type)) dummy.scale.y *= 1.35; // park beds: fuller, taller flowers
    if (flag > 4.5 && flag < 5.5 && isGrassFlower(type)) dummy.scale.y *= 2; // road median (centre strip) flowers: 2x taller (user, 2026-11-23)
    if (flag > 5.5 && flag < 6.5) {
      // JUNGLE FLOOR (2026-11-21): short grass, flowers standing a little above it, clumps lower than before (the broad-leaf ground cover keeps its own size)
      const isFl = isGrassFlower(type);
      dummy.scale.y *= isFl ? G.jungle.tallFlower : isGrassClump(type) ? G.jungle.tallClump : isGrassLeafy(type) ? 1 : G.jungle.tall;
    }
    dummy.updateMatrix();
    mesh.setMatrixAt(slot, dummy.matrix);
    // COLOUR VARIATION: every tuft is fresh green, yellow-green or straw (shares: Config grass.look). A hash of the tuft's position picks the class;
    // brighter tufts lean yellow-green like sun-lit, drier grass. The city lawn has no straw.
    const cityLawn = (flag > 1.5 && flag < 3.5) || (flag > 7.5 && flag < 8.5);
    const hc = Math.sin(data[o] * 39.3468 + data[o + 2] * 17.1313 + 5.7) * 43758.5453;
    const pick = hc - Math.floor(hc);
    const jungleFloor = flag > 5.5 && flag < 6.5;
    // REAL GRASS COLOURS (2026-11-21): every tuft picks its own colour from a palette (position hash, never changes): fresh green, yellow-green, olive,
    // blue-green, deep green, light lime, a few golden-dry. The city lawn stays in the green family, the shady jungle floor is lighter.
    const pal = cityLawn ? LAWN_PALETTE : jungleFloor ? JUNGLE_PALETTE : GRASS_PALETTE;
    let acc = 0;
    let ci = pal.length - 1;
    for (let q = 0; q < pal.length; q++) {
      acc += pal[q][3];
      if (pick < acc) {
        ci = q;
        break;
      }
    }
    const hb = Math.sin(data[o] * 7.7 + data[o + 2] * 3.1 + 1.3) * 43758.5453;
    const bright = (0.7 + 0.36 * (hb - Math.floor(hb))) * (isGrassLeafy(type) ? 1.12 : 1); // broad leaves are a little fresher / lighter than the blades round them
    if (type === GrassType.durba) {
      // JUNGLE DURBA: stays fresh green (a little lighter or deeper from tuft to tuft), never yellow / dry
      const k = 0.78 + 0.26 * (hb - Math.floor(hb)); // deep green, a little lighter or deeper from tuft to tuft
      color.setRGB(0.9 * k, 1.1 * k, 0.96 * k);
      mesh.setColorAt(slot, color);
      return;
    }
    const pc = pal[ci];
    // PAINTED GRASS (2026-11-21): the cards already carry real greens, so the tuft colour is only a TINT around 1 (the palette colour relative to the fresh green, softened): fresh green = no change,
    // yellow-green = warmer, olive / golden-dry = browner, deep green = darker. The flower tufts' own blades are tinted dark green in GrassAssets (they have no picture).
    const tn = (v: number, ref: number, cap: number): number => Math.min(cap, Math.pow(Math.max(v, 0.001) / ref, 0.8));
    const dry = Math.max(0, Math.min(1, (pc[0] - 0.3) / 0.16)); // golden-dry / straw tufts: less green, so they read yellow-brown, not lime
    color.setRGB(tn(pc[0], 0.12, 1.45 - 0.3 * dry) * bright, tn(pc[1], 0.36, 1.25) * (1 - 0.1 * dry) * bright, Math.min(1.1, tn(pc[2], 0.08, 1.5)) * (1 - 0.1 * dry) * bright);
    mesh.setColorAt(slot, color);
  }

  /** Do some of the work of a tile until `until` (performance.now ms); true when the tile is complete. */
  private stepJob(j: InstallJob, until: number): boolean {
    const CHUNK = 1024;
    if (j.phase === 0) {
      // 1. choose the model of every tuft
      while (j.i < j.count) {
        const end = Math.min(j.count, j.i + CHUNK);
        for (; j.i < end; j.i++) {
          const type = this.typeOf(j.data, j.i * GRASS_STRIDE, j.ox, j.oz, j.lod);
          j.types[j.i] = type;
          j.counts[type]++;
        }
        if (performance.now() >= until) return false;
      }
      // 2. one InstancedMesh per model that occurs
      for (let t = 0; t < j.geoms.length * 2; t++) {
        if (j.counts[t] === 0) {
          j.meshes.push(null);
          continue;
        }
        const extra = t >= EXTRA;
        const mesh = new THREE.InstancedMesh(j.geoms[extra ? t - EXTRA : t], extra ? this.assets.extraMaterial : this.assets.material, j.counts[t]);
        mesh.name = `grass ${j.key} type${t}`;
        mesh.userData.extra = extra;
        j.meshes.push(mesh);
      }
      j.phase = 1;
      j.i = 0;
    }
    while (j.i < j.count) {
      const end = Math.min(j.count, j.i + CHUNK);
      for (; j.i < end; j.i++) this.fillOne(j, j.i);
      if (performance.now() >= until) return j.i >= j.count;
    }
    return true;
  }

  /** Put the finished tile into the scene (the same tile in another ring is swapped in the same frame, so there is never a gap). */
  private finishJob(j: InstallJob): void {
    if (this.wanted.get(j.key) !== j.lod) {
      for (const m of j.meshes) m?.dispose(); // went out of range / changed ring while it was being built
      return;
    }
    const old = this.tiles.get(j.key);
    if (old) this.remove(old);
    for (const mesh of j.meshes) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.place(mesh, j.tx, j.tz);
    }
    this.tiles.set(j.key, { key: j.key, tx: j.tx, tz: j.tz, lod: j.lod, meshes: j.meshes });
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
    }
    this.tiles.delete(t.key);
  }

  dispose(): void {
    this.disposed = true;
    this.dropJob();
    for (const t of [...this.tiles.values()]) this.remove(t);
    this.ready.length = 0;
    this.pending.clear();
  }
}
