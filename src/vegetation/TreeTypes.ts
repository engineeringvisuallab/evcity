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
  /** Bamboo clump (bash jhar, palm atlas): one clump of ~26 arching culms, 10-14 m. Made into groves by the placement. */
  bamboo: 17,
  /** JUNGLE UNDERGROWTH (lata-pata, forest atlas, no colliders): fern (arching fronds), shrub (dense bush), lata (creeper-covered mound with hanging vines). */
  fern: 18,
  shrub: 19,
  lata: 20,
  /** JUNGLE FLOOR DEADWOOD: an old dry dead tree lying on the ground (deadLog, ~7 m long at scale 1) and a patch of dry fallen leaves (leafLitter, ~2.6 m wide). No colliders (a car drives over, a person walks over). */
  deadLog: 21,
  leafLitter: 22,
  /** GUM (eucalyptus, Australian-style): tall, pale, crooked trunk, a few bare limbs, a thin open crown of long narrow hanging leaves (sky shows through). */
  gum: 23,
  /** Second gum shape (more upright, taller, narrower crown) so the gums are not all the same. (Use `isGum(kind)` to test for a gum; the vine kinds come after it.) */
  gum2: 24,
  /**
   * JUNGLE VINES (2026-11-21, reference photo of a real rain forest): `liana` = a curtain of thin woody vines hanging from the canopy (8-12 m) to the ground, with a few small leaves, plus one
   * thick diagonal vine; `tangle` = a bunch of slim, leaning young stems and a long diagonal limb crossing them, with sparse leaves. No colliders. They come AFTER gum2, so every
   * "gum" test must use `isGum(kind)` (not `kind >= TreeKind.gum`).
   */
  liana: 25,
  tangle: 26,
} as const;
export const TREE_KIND_COUNT = 27;

/** The two gum (eucalyptus) kinds. */
export const isGum = (kind: number): boolean => kind === TreeKind.gum || kind === TreeKind.gum2;

/** Kinds drawn with the palm atlas (palms, banana, flowering krishnachura, bamboo); every other kind uses the forest-tree atlas. */
export const usesPalmAtlas = (kind: number): boolean => (kind >= TreeKind.coconut && kind <= TreeKind.krishnachura) || kind === TreeKind.bamboo;

/**
 * Trunk of each kind at scale 1: radius `r` (m) and collider height `h` (m, only the part a person / car can touch), and `climb` = how high
 * (m above the foot) a person can climb before the branches / crown start (0 = cannot be climbed, e.g. the banana clump).
 * One table for the trunk colliders (TreePhysics), the slope sink of the placement (TreePlacement) and climbing (Player).
 */
export const TREE_TRUNK: Record<number, { r: number; h: number; climb: number }> = {
  [TreeKind.broadleaf]: { r: 0.42, h: 3.4, climb: 8 },
  [TreeKind.pine]: { r: 0.55, h: 5, climb: 9 },
  [TreeKind.palm]: { r: 0.28, h: 5, climb: 8 },
  [TreeKind.oak]: { r: 0.5, h: 3, climb: 7 },
  [TreeKind.vase]: { r: 0.4, h: 3, climb: 8 },
  [TreeKind.slender]: { r: 0.26, h: 4, climb: 8 },
  [TreeKind.sal]: { r: 0.5, h: 5, climb: 12 },
  [TreeKind.segun]: { r: 0.45, h: 5, climb: 10 },
  [TreeKind.koroi]: { r: 0.7, h: 4, climb: 7 },
  [TreeKind.bot]: { r: 1.2, h: 4, climb: 8 },
  [TreeKind.shimul]: { r: 1.0, h: 5, climb: 14 },
  [TreeKind.coconut]: { r: 0.2, h: 5, climb: 14 },
  [TreeKind.datePalm]: { r: 0.28, h: 4, climb: 9 },
  [TreeKind.palmyra]: { r: 0.28, h: 5, climb: 18 },
  [TreeKind.banana]: { r: 0.3, h: 3, climb: 0 },
  [TreeKind.krishnachura]: { r: 0.36, h: 4, climb: 8 },
  [TreeKind.debdaru]: { r: 0.22, h: 5, climb: 8 },
  /** A bamboo clump is a solid mass of culms about 2.4 m wide at the foot: one round collider, not climbable (the culms are thin and bend). */
  [TreeKind.bamboo]: { r: 1.0, h: 5, climb: 0 },
  /** Undergrowth: r 0.03 is under `passRadius`, so a person or car walks straight through (no collider). */
  [TreeKind.fern]: { r: 0.03, h: 1, climb: 0 },
  [TreeKind.shrub]: { r: 0.03, h: 1, climb: 0 },
  [TreeKind.lata]: { r: 0.03, h: 1, climb: 0 },
  /** Deadwood on the ground: lies flat, so no collider (r under passRadius) and nothing to climb. */
  [TreeKind.deadLog]: { r: 0.03, h: 0.6, climb: 0 },
  [TreeKind.leafLitter]: { r: 0.03, h: 0.1, climb: 0 },
  [TreeKind.gum]: { r: 0.55, h: 5, climb: 12 },
  [TreeKind.gum2]: { r: 0.5, h: 5, climb: 14 },
  /** Jungle vines: thin, no collider (r under `passRadius`), nothing to climb. */
  [TreeKind.liana]: { r: 0.03, h: 1, climb: 0 },
  [TreeKind.tangle]: { r: 0.03, h: 1, climb: 0 },
};

/**
 * Horizontal scale of a tree whose placement scale (= height scale) is `s`. Normal trees are scaled evenly. A bamboo clump above scale 1.2 (the tall
 * jungle bamboo, 3-5x taller) gets thicker only slowly, so it stays a tall slim clump instead of a 40 m wide monster.
 */
export const treeWidth = (kind: number, s: number): number => (kind === TreeKind.bamboo && s > 1.2 ? 1.2 * Math.pow(s / 1.2, 0.4) : s);

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
  // 2026-11-21 (reference photos): a big bunch grass with bristly seed plumes standing out of it, a ground-cover rosette of broad leaves, a patch of clover-like trefoil leaves
  durba: 15, // JUNGLE durba: fine, smooth, glossy bright green single blades
  tussockSeed: 12, // tall bunch grass with 14-20 tan / purple-brown seed plumes on thin stems
  leafy: 13, // low rosette of 5-7 broad oval leaves (plantain / dock type), each folded along its midrib
  trefoil: 14, // low patch of clover-like three-leaflet leaves on thin stems
} as const;
export const GRASS_TYPE_COUNT = 16;
/** The big grass bunches (they are sized by `grass.clump`, not by `grass.tuft`). */
export const isGrassClump = (t: number): boolean => t === GrassType.tussock || t === GrassType.tussockWide || t === GrassType.tussockSeed;
/** The coloured wild flowers (daisy .. clover). */
export const isGrassFlower = (t: number): boolean => t >= GrassType.daisy && t <= GrassType.clover;
/** Low broad-leaf ground cover (sized by `grass.leafy`). */
export const isGrassLeafy = (t: number): boolean => t === GrassType.leafy || t === GrassType.trefoil;

/** One Float32Array per tree kind (index = TreeKind). Empty kinds have length 0. */
export type TreeChunkData = Float32Array[];
