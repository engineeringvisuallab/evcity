/** Tree kinds and the layout of the placement data that travels from the chunk worker to the main thread. */
export const TreeKind = {
  broadleaf: 0,
  pine: 1,
  palm: 2,
} as const;
export const TREE_KIND_COUNT = 3;

/** Floats per tree: x, y, z (chunk-local, metres), scale, yaw (rad), tint (colour multiplier ~0.8..1.15). */
export const TREE_STRIDE = 6;

/** Rock kinds. Same data layout as trees (TREE_STRIDE floats per rock). */
export const RockKind = {
  round: 0,
  slab: 1,
} as const;
export const ROCK_KIND_COUNT = 2;

/** Floats per grass tuft: x, y, z (tile-local, metres), scale, yaw (rad), tint (~0.85..1.15), dry (0 green .. 1 dry). */
export const GRASS_STRIDE = 7;

/** One Float32Array per tree kind (index = TreeKind). Empty kinds have length 0. */
export type TreeChunkData = Float32Array[];
