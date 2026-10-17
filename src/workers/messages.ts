import type { RoadMeshData } from '../roads/RoadMesh';
import type { WaterMeshData } from '../terrain/TerrainMeshData';
import type { TreeChunkData } from '../vegetation/TreeTypes';

/** Messages between the main thread and chunk.worker.ts. */

export interface ChunkRequest {
  type: 'generate';
  key: string;
  cx: number;
  cz: number;
  lod: number;
  seed: number;
  vertsPerSide: number;
  skirtDepth: number;
}

export interface ChunkResult {
  type: 'generated';
  key: string;
  cx: number;
  cz: number;
  lod: number;
  vertsPerSide: number;
  /** (n+1)^2 heights, row-major [z][x]. Kept for physics heightfields. */
  heights: Float32Array;
  /** Chunk-local vertex positions incl. skirts. */
  positions: Float32Array;
  normals: Float32Array;
  minHeight: number;
  maxHeight: number;
  /** Rivers / lakes / sea surface of this chunk, or null. */
  water: WaterMeshData | null;
  /** STAGE 6: per-vertex road coverage for the terrain shader (null = no road here). */
  roadMask: Float32Array | null;
  /** STAGE 6: asphalt ribbon for LOD0/1 (null = none). */
  road: RoadMeshData | null;
  /** STAGE 7: tree placement per tree kind (chunk-local), or null for chunks too far away to have trees. */
  trees: TreeChunkData | null;
  /** STAGE 7: rock placement per rock kind (same layout as trees), or null for far chunks. */
  rocks: TreeChunkData | null;
}

/** STAGE 7: ask for the grass of one tile (tx, tz = tile index on the world grid of Config.vegetation.grass.tile). */
export interface GrassRequest {
  type: 'grass';
  tx: number;
  tz: number;
  seed: number;
}

export interface GrassResult {
  type: 'grass';
  tx: number;
  tz: number;
  /** GRASS_STRIDE floats per tuft, tile-local. */
  data: Float32Array;
}
