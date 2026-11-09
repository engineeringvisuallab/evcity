/** Tree kinds and the layout of the placement data that travels from the chunk worker to the main thread. */
export const TreeKind = {
  broadleaf: 0,
  pine: 1,
  palm: 2,
  /** More broadleaf shapes (same physics family): wide spreading oak, upright vase, slender young tree. */
  oak: 3,
  vase: 4,
  slender: 5,
  /** Big forest trees (25-30 m when full grown, scale 1 = a mature tree): sal, segun (teak), koroi (rain tree), bot (banyan), shimul (silk cotton). */
  sal: 6,
  segun: 7,
  koroi: 8,
  bot: 9,
  shimul: 10,
  /** Palms and banana (own texture atlas): coconut (narikel), date palm (khejur), palmyra (tal), banana (kola clump). */
  coconut: 11,
  datePalm: 12,
  palmyra: 13,
  banana: 14,
  /** City / roadside trees: krishnachura (flamboyant, flowering, own atlas) and debdaru (ashoka, slim column). */
  krishnachura: 15,
  debdaru: 16,
} as const;
export const TREE_KIND_COUNT = 17;

/** Kinds drawn with the palm atlas (palms, banana, flowering krishnachura); every other kind uses the forest-tree atlas. */
export const usesPalmAtlas = (kind: number): boolean => kind >= TreeKind.coconut && kind <= TreeKind.krishnachura;

/**
 * Trunk of each kind at scale 1: radius `r` (m) and collider height `h` (m, only the part a person / car can touch), and `climb` = how high
 * (m above the foot) a person can climb before the branches / crown start (0 = cannot be climbed, e.g. the banana clump).
 * One table for the trunk colliders (TreePhysics), the slope sink of the placement (TreePlacement) and climbing (Player).
 */
export const TREE_TRUNK: Record<number, { r: number; h: number; climb: number }> = {
  [TreeKind.broadleaf]: { r: 0.42, h: 3.4, climb: 5 },
  [TreeKind.pine]: { r: 0.35, h: 3, climb: 6 },
  [TreeKind.palm]: { r: 0.28, h: 5, climb: 8 },
  [TreeKind.oak]: { r: 0.55, h: 3, climb: 4 },
  [TreeKind.vase]: { r: 0.42, h: 3, climb: 3.5 },
  [TreeKind.slender]: { r: 0.28, h: 4, climb: 6 },
  [TreeKind.sal]: { r: 0.5, h: 5, climb: 12 },
  [TreeKind.segun]: { r: 0.45, h: 5, climb: 10 },
  [TreeKind.koroi]: { r: 0.7, h: 4, climb: 7 },
  [TreeKind.bot]: { r: 1.2, h: 4, climb: 8 },
  [TreeKind.shimul]: { r: 1.0, h: 5, climb: 14 },
  [TreeKind.coconut]: { r: 0.2, h: 5, climb: 14 },
  [TreeKind.datePalm]: { r: 0.28, h: 4, climb: 9 },
  [TreeKind.palmyra]: { r: 0.28, h: 5, climb: 18 },
  [TreeKind.banana]: { r: 0.3, h: 3, climb: 0 },
  [TreeKind.krishnachura]: { r: 0.36, h: 3.5, climb: 6 },
  [TreeKind.debdaru]: { r: 0.22, h: 5, climb: 6 },
};

/** Stable id of a tree inside its chunk (the same at every LOD): kind + chunk-local position rounded to 0.5 m. */
export const treeKey = (kind: number, x: number, z: number): string => `${kind}:${Math.round(x * 2)}:${Math.round(z * 2)}`;

/** Floats per tree: x, y, z (chunk-local, metres), scale, yaw (rad), tint (colour multiplier ~0.8..1.15). */
export const TREE_STRIDE = 6;

/** Rock kinds. Same data layout as trees (TREE_STRIDE floats per rock). */
export const RockKind = {
  round: 0,
  slab: 1,
} as const;
export const ROCK_KIND_COUNT = 2;

/** Floats per grass tuft / clump: x, y, z (tile-local, metres), scale, yaw (rad), tint (~0.85..1.15), dry (0 green .. 1 dry), clump (0 = small tuft, 1 = big grass clump). */
export const GRASS_STRIDE = 8;

/**
 * Grass / flower tuft types (the main thread picks one per tuft from a hash + meadow patches; the workers do not care).
 * 0..3 = pure grass, 4..9 = a grass tuft with flowers growing out of it.
 */
export const GrassType = {
  lawn: 0, // short, fine, dense
  wild: 1, // tall, slim, bent blades
  clump: 2, // broad-leaf bunch
  seed: 3, // tall straw-coloured grass with seed heads
  daisy: 4,
  buttercup: 5,
  lavender: 6,
  poppy: 7,
  cornflower: 8,
  clover: 9,
  // GRASS CLUMPS (tussocks): 60..110 blades growing out of one root like a fountain, tall in the middle, arching outwards at the edge
  tussock: 10, // upright, dense
  tussockWide: 11, // wider, more arching, a few straw-coloured blades
} as const;
export const GRASS_TYPE_COUNT = 12;

/** One Float32Array per tree kind (index = TreeKind). Empty kinds have length 0. */
export type TreeChunkData = Float32Array[];
