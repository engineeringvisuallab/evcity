// REAL 3D: builds the geometry of the game world straight from the game DATA, for any place on the map, whether or not it is loaded on screen.
// Uses the very same pure mesh builders that make the terrain, water, road ribbon, railway and port you see in the game (buildChunkMeshData),
// plus medians, raised footpaths and building blocks built from the road / building plans. Pure maths: no three.js, no DOM (runs in node too).
//
// Result: a list of MeshPart (positions in metres, centred on the export centre; x east, y up, z south = right-handed like glTF),
// ready for GltfWriter (.glb) or the OBJ writer.
import { Config } from '../core/Config';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { buildChunkMeshData, buildIndices } from '../terrain/TerrainMeshData';
import { buildRoadMesh } from '../roads/RoadMesh';
import { CHUNKS_PER_SIDE, chunkOriginX, chunkOriginZ, worldToChunkCoord } from '../world/WorldGrid';
import { BUILDING_PLACEMENTS } from '../buildings/Placements';
import { FILL_PLACEMENTS } from '../buildings/PlacementsFill';
import { medianHalfAt, planMedians } from '../roads/MedianPlan';
import { footPiece, planFootpaths } from '../roads/FootpathPlan';

export interface MeshPart {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  /** Per-vertex RGB 0..1 (optional). */
  colors?: Float32Array;
  /** Used when there are no vertex colours. */
  baseColor?: [number, number, number];
  /** < 1 = see-through (water). */
  alpha?: number;
  indices: Uint32Array;
}

export type RealQuality = 'high' | 'medium' | 'low';
export interface RealLayers {
  terrain: boolean;
  water: boolean;
  roads: boolean;
  rail: boolean;
  port: boolean;
  medians: boolean;
  footpaths: boolean;
  buildings: boolean;
}
export const ALL_REAL_LAYERS: RealLayers = { terrain: true, water: true, roads: true, rail: true, port: true, medians: true, footpaths: true, buildings: true };

export interface RealModelOptions {
  /** Export centre in WORLD metres (x east, z south). */
  centerX: number;
  centerZ: number;
  /** Half size of the square area in metres (whole 500 m chunks are exported, so the real area is a little larger). >= 5000 = the whole map. */
  radius: number;
  quality: RealQuality;
  layers: RealLayers;
  /** Floors of a building model id (the model registry needs three.js, so the game hands it in). Unknown = 2. */
  buildingFloors?: (id: string) => number | undefined;
}

export interface RealModelResult {
  parts: MeshPart[];
  stats: { chunks: number; vertices: number; triangles: number; areaKm2: number };
}

const LOD_OF: Record<RealQuality, number> = { high: 0, medium: 1, low: 2 };
export const MAX_REAL_VERTS = 4_000_000;
const FLOOR_H = 3.0;
const S = Config.world.chunkSize;

type V = [number, number, number];

/** Collects geometry of one kind (terrain, roads ...) from many chunks / boxes into one MeshPart. */
class Acc {
  private segs: { pos: Float32Array; nor: Float32Array; col: Float32Array | null; idx: Uint32Array }[] = [];
  private sp: number[] = [];
  private sn: number[] = [];
  private sc: number[] = [];
  private si: number[] = [];
  vcount = 0;
  tris = 0;
  constructor(readonly name: string, readonly withColors: boolean, readonly alpha?: number, readonly baseColor?: V) {}

  addArrays(pos: Float32Array, nor: Float32Array, col: Float32Array | null, idx: Uint32Array): void {
    this.segs.push({ pos, nor, col, idx: this.offset(idx, this.vcount) });
    this.vcount += pos.length / 3;
    this.tris += idx.length / 3;
  }

  private offset(idx: Uint32Array, by: number): Uint32Array {
    if (by === 0) return idx;
    const o = new Uint32Array(idx.length);
    for (let i = 0; i < idx.length; i++) o[i] = idx[i] + by;
    return o;
  }

  /** One flat face (4 corners, any order of rotation); the normal is made to point away from `inside`. */
  quad(a: V, b: V, c: V, d: V, col: V, inside: V): void {
    let n = cross(sub(b, a), sub(c, a));
    const mid: V = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
    if (dot(n, sub(mid, inside)) < 0) {
      [b, d] = [d, b];
      n = [-n[0], -n[1], -n[2]];
    }
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    const base = this.vcount + this.sp.length / 3;
    for (const p of [a, b, c, d]) {
      this.sp.push(p[0], p[1], p[2]);
      this.sn.push(n[0], n[1], n[2]);
      this.sc.push(col[0], col[1], col[2]);
    }
    this.si.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.tris += 2;
  }

  finish(): MeshPart | null {
    if (this.sp.length) {
      // the quads were numbered from vcount at push time, so their indices are already global: keep them as they are
      const n = this.sp.length / 3;
      this.segs.push({ pos: Float32Array.from(this.sp), nor: Float32Array.from(this.sn), col: Float32Array.from(this.sc), idx: Uint32Array.from(this.si) });
      this.vcount += n;
      this.sp = []; this.sn = []; this.sc = []; this.si = [];
    }
    if (!this.segs.length) return null;
    const nv = this.segs.reduce((s, g) => s + g.pos.length / 3, 0);
    const ni = this.segs.reduce((s, g) => s + g.idx.length, 0);
    const positions = new Float32Array(nv * 3);
    const normals = new Float32Array(nv * 3);
    const colors = this.withColors ? new Float32Array(nv * 3) : undefined;
    const indices = new Uint32Array(ni);
    let vo = 0;
    let io = 0;
    for (const g of this.segs) {
      positions.set(g.pos, vo * 3);
      normals.set(g.nor, vo * 3);
      if (colors) {
        if (g.col) colors.set(g.col, vo * 3);
        else for (let i = 0; i < g.pos.length / 3; i++) { colors[(vo + i) * 3] = 0.5; colors[(vo + i) * 3 + 1] = 0.5; colors[(vo + i) * 3 + 2] = 0.5; }
      }
      indices.set(g.idx, io);
      vo += g.pos.length / 3;
      io += g.idx.length;
    }
    return { name: this.name, positions, normals, colors, baseColor: this.baseColor, alpha: this.alpha, indices };
  }
}

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp3 = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const GRASS: V = [0.33, 0.5, 0.22];
const GRASS_CITY: V = [0.4, 0.56, 0.28];
const ROCK: V = [0.46, 0.43, 0.4];
const SEABED: V = [0.58, 0.53, 0.4];
const ASPHALT: V = [0.17, 0.17, 0.18];

/** Terrain colour from slope, height, city greenness and whether the vertex lies under water. Approximate: the game's own terrain shader is not used. */
function terrainColor(ny: number, h: number, green: number, wet: boolean, out: V): void {
  if (wet) { out[0] = SEABED[0]; out[1] = SEABED[1]; out[2] = SEABED[2]; return; }
  const base = lerp3(GRASS, GRASS_CITY, green);
  const rockiness = Math.max(smooth(0.18, 0.5, 1 - ny), smooth(110, 220, h) * 0.7);
  const c = lerp3(base, ROCK, rockiness);
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
}

export function buildRealModel(gen: TerrainGenerator, o: RealModelOptions): RealModelResult {
  const lod = LOD_OF[o.quality];
  const n = Config.lod.vertsPerSide[lod];
  const R = Math.max(20, o.radius);
  const c0 = worldToChunkCoord(o.centerX - R, o.centerZ - R);
  const c1 = worldToChunkCoord(o.centerX + R, o.centerZ + R);
  const cx0 = Math.max(0, Math.min(CHUNKS_PER_SIDE - 1, c0.cx));
  const cz0 = Math.max(0, Math.min(CHUNKS_PER_SIDE - 1, c0.cz));
  const cx1 = Math.max(0, Math.min(CHUNKS_PER_SIDE - 1, c1.cx));
  const cz1 = Math.max(0, Math.min(CHUNKS_PER_SIDE - 1, c1.cz));
  const nChunks = (cx1 - cx0 + 1) * (cz1 - cz0 + 1);
  const perChunk = (n + 1) * (n + 1);
  if (nChunks * perChunk > MAX_REAL_VERTS) {
    throw new Error(`এলাকা খুব বড় (${nChunks} চাঙ্ক): ব্যাসার্ধ কমান বা মান "কম" বাছুন`);
  }
  // exported area (whole chunks), world metres
  const ax0 = chunkOriginX(cx0);
  const az0 = chunkOriginZ(cz0);
  const ax1 = chunkOriginX(cx1) + S;
  const az1 = chunkOriginZ(cz1) + S;
  const X = o.centerX;
  const Z = o.centerZ;
  const inside = (x: number, z: number): boolean => x >= ax0 && x <= ax1 && z >= az0 && z <= az1;

  const L = o.layers;
  const terrain = new Acc('terrain', true);
  const water = new Acc('water', false, 0.72, [0.1, 0.36, 0.55]);
  const roads = new Acc('roads', true);
  const rail = new Acc('railway', true);
  const port = new Acc('port', true);
  const median = new Acc('road_medians', true);
  const foot = new Acc('footpaths', true);
  const blocks = new Acc('buildings', true);
  const rgb: V = [0, 0, 0];

  const shiftPos = (src: Float32Array, ox: number, oz: number, count = src.length / 3): Float32Array => {
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      out[i * 3] = src[i * 3] + ox - X;
      out[i * 3 + 1] = src[i * 3 + 1];
      out[i * 3 + 2] = src[i * 3 + 2] + oz - Z;
    }
    return out;
  };
  const to32 = (a: ArrayLike<number>, count = a.length): Uint32Array => {
    const out = new Uint32Array(count);
    for (let i = 0; i < count; i++) out[i] = a[i];
    return out;
  };

  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const d = buildChunkMeshData(gen, cx, cz, n, 0, lod);
      const ox = chunkOriginX(cx);
      const oz = chunkOriginZ(cz);
      const nv = perChunk;
      if (L.terrain) {
        const pos = shiftPos(d.positions, ox, oz, nv);
        const nor = d.normals.slice(0, nv * 3);
        const col = new Float32Array(nv * 3);
        for (let i = 0; i < nv; i++) {
          const wet = !!d.water && d.water.depth[i] > 0;
          terrainColor(d.normals[i * 3 + 1], d.positions[i * 3 + 1], d.cityMask ? d.cityMask[i] : 0, wet, rgb);
          col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2];
        }
        let idx: Uint32Array;
        if (d.holeIndices) {
          const keep: number[] = [];
          for (let t = 0; t < d.holeIndices.length; t += 3) {
            const a = d.holeIndices[t], b = d.holeIndices[t + 1], c = d.holeIndices[t + 2];
            if (a < nv && b < nv && c < nv) keep.push(a, b, c);
          }
          idx = Uint32Array.from(keep);
        } else idx = to32(buildIndices(n), n * n * 6); // the first n*n*2 triangles are the ground; the rest are skirts
        terrain.addArrays(pos, nor, col, idx);
      }
      if (L.water && d.water) {
        const w = d.water;
        const keep: number[] = [];
        for (let t = 0; t < w.indices.length; t += 3) {
          const a = w.indices[t], b = w.indices[t + 1], c = w.indices[t + 2];
          if (w.depth[a] > 0 || w.depth[b] > 0 || w.depth[c] > 0) keep.push(a, b, c);
        }
        if (keep.length) water.addArrays(shiftPos(w.positions, ox, oz, nv), w.normals.slice(0, nv * 3), null, Uint32Array.from(keep));
      }
      if (L.roads) {
        // LOD2 has no ribbon of its own: build the LOD1 ribbon and lift it so the coarser terrain does not cover it
        const rm = d.road ?? (lod >= 2 ? buildRoadMesh(gen.roads, cx, cz, 1) : null);
        if (rm) {
          const pos = shiftPos(rm.positions, ox, oz);
          if (!d.road) for (let i = 1; i < pos.length; i += 3) pos[i] += 0.5;
          const col = new Float32Array(pos.length);
          for (let i = 0; i < pos.length; i += 3) { col[i] = ASPHALT[0]; col[i + 1] = ASPHALT[1]; col[i + 2] = ASPHALT[2]; }
          roads.addArrays(pos, rm.normals, col, to32(rm.indices));
        }
      }
      if (L.rail && d.rail) rail.addArrays(shiftPos(d.rail.positions, ox, oz), d.rail.normals, d.rail.colors, to32(d.rail.indices));
      if (L.port && d.port) port.addArrays(shiftPos(d.port.positions, ox, oz), d.port.normals, d.port.colors, to32(d.port.indices));
    }
  }

  // ---- medians and raised footpaths: prisms between consecutive samples of the road plans ----
  if (L.medians) {
    const top: V = [0.4, 0.47, 0.31];
    const side: V = [0.66, 0.65, 0.62];
    for (const run of planMedians(gen.roads).runs) {
      for (let k = 0; k + 1 < run.n; k++) {
        const a = k * 8;
        const b = a + 8;
        if (!inside(run.p[a], run.p[a + 2]) && !inside(run.p[b], run.p[b + 2])) continue;
        const ha = medianHalfAt(run, k);
        const hb = medianHalfAt(run, k + 1);
        const pt = (o: number, hw: number, sgn: number, up: number): V => [run.p[o] + run.p[o + 3] * hw * sgn - X, run.p[o + 1] + up, run.p[o + 2] + run.p[o + 4] * hw * sgn - Z];
        const h = run.kerbH;
        const LA = pt(a, ha, 1, 0), RA = pt(a, ha, -1, 0), LB = pt(b, hb, 1, 0), RB = pt(b, hb, -1, 0);
        const LAt = pt(a, ha, 1, h), RAt = pt(a, ha, -1, h), LBt = pt(b, hb, 1, h), RBt = pt(b, hb, -1, h);
        const ctr: V = [(LA[0] + RB[0]) / 2, LA[1] + h / 2, (LA[2] + RB[2]) / 2];
        median.quad(LAt, LBt, RBt, RAt, top, ctr);
        median.quad(LA, LB, LBt, LAt, side, ctr);
        median.quad(RA, RB, RBt, RAt, side, ctr);
      }
    }
  }
  if (L.footpaths) {
    const top: V = [0.7, 0.69, 0.66];
    const side: V = [0.58, 0.57, 0.55];
    for (const run of planFootpaths(gen.roads).runs) {
      for (let k = 0; k + 1 < run.n; k++) {
        const a = k * 8;
        const b = a + 8;
        if (!inside(run.p[a], run.p[a + 2]) && !inside(run.p[b], run.p[b + 2])) continue;
        const h = footPiece(run, k).h;
        const pt = (o: number, off: number, up: number): V => {
          const nl = Math.hypot(run.p[o + 3], run.p[o + 4]) || 1;
          return [run.p[o] + (run.p[o + 3] / nl) * run.side * off - X, run.p[o + 1] + up, run.p[o + 2] + (run.p[o + 4] / nl) * run.side * off - Z];
        };
        const o0 = run.hw, o1 = run.hw + run.width;
        const IA = pt(a, o0, 0), OA = pt(a, o1, 0), IB = pt(b, o0, 0), OB = pt(b, o1, 0);
        const IAt = pt(a, o0, h), OAt = pt(a, o1, h), IBt = pt(b, o0, h), OBt = pt(b, o1, h);
        const ctr: V = [(IA[0] + OB[0]) / 2, IA[1] + h / 2, (IA[2] + OB[2]) / 2];
        foot.quad(IAt, IBt, OBt, OAt, top, ctr);
        foot.quad(IA, IB, IBt, IAt, side, ctr);
        foot.quad(OA, OB, OBt, OAt, side, ctr);
      }
    }
  }

  // ---- buildings: one block per placement (footprint box incl. yard, height = floors x 3 m) ----
  if (L.buildings) {
    const wall: V = [0.8, 0.76, 0.7];
    const roof: V = [0.42, 0.42, 0.45];
    for (const p of [...BUILDING_PLACEMENTS, ...FILL_PLACEMENTS]) {
      if (!inside(p.x, p.z)) continue;
      const c = Math.cos(p.yaw);
      const sn = Math.sin(p.yaw);
      const cs = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) => {
        const lx = (a * p.W) / 2;
        const lz = (b * p.D) / 2;
        return [p.x + lx * c + lz * sn, p.z - lx * sn + lz * c];
      });
      let minY = Infinity, maxY = -Infinity;
      for (const [x, z] of cs) { const h = gen.heightAt(x, z); minY = Math.min(minY, h); maxY = Math.max(maxY, h); }
      const topY = maxY + 0.02 + Math.max(1, o.buildingFloors?.(p.id) ?? 2) * FLOOR_H;
      const lo = cs.map(([x, z]): V => [x - X, minY, z - Z]);
      const hi = cs.map(([x, z]): V => [x - X, topY, z - Z]);
      const ctr: V = [p.x - X, (minY + topY) / 2, p.z - Z];
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; blocks.quad(lo[i], lo[j], hi[j], hi[i], wall, ctr); }
      blocks.quad(hi[0], hi[1], hi[2], hi[3], roof, ctr);
    }
  }

  const parts: MeshPart[] = [];
  let vertices = 0;
  let triangles = 0;
  for (const acc of [terrain, water, roads, rail, port, median, foot, blocks]) {
    const part = acc.finish();
    if (!part) continue;
    parts.push(part);
    vertices += part.positions.length / 3;
    triangles += part.indices.length / 3;
  }
  return { parts, stats: { chunks: nChunks, vertices, triangles, areaKm2: ((ax1 - ax0) * (az1 - az0)) / 1e6 } };
}
