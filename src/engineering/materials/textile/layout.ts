/**
 * Textile & garments factory layout, metres. Local frame: x east, y up, z south, origin = site centre.
 * The material travels like a real RMG group: bale store -> spinning -> weaving -> dyeing & finishing (north row, west to east),
 * then fabric goes by road to the garments factory and the finished-goods store (south row). The dyeing waste water goes to the
 * effluent treatment plant (ETP, south-east) and leaves as clean water at the east edge. Gate on the SOUTH side (nearest road is south).
 *  z = -100 .. -33  north row: cotton store, spinning mill, weaving shed, dyeing & finishing house
 *  z = -33 .. -10   boiler house, water plant, mid road (z = -14)
 *  z =    2 ..  52  south row: garments factory, finished-goods store + loading dock, ETP
 *  z =   62         spine road;  z = 77..91 administration;  z = 100 gate
 */
import type { Rect } from '../../core/Site';

export const SITE: Rect = { minX: -150, maxX: 150, minZ: -100, maxZ: 100 };
export const PAD: Rect = { minX: -155, maxX: 155, minZ: -105, maxZ: 105 };

export const L = {
  gate: { x: -110, z: 100 },
  roadZ: 62,
  midRoadZ: -14,
  admin: { x: -70, z: 84, w: 30, d: 14, h: 7 },
  /** raw cotton bale store (open to the south) */
  cotton: { x: -122, z: -62, w: 32, d: 30, h: 8 },
  /** spinning mill: blowroom (z -72), cards (z -64), drawing / roving (z -55), ring frames (z -44) */
  spin: { x: -62, z: -55, w: 68, d: 44, h: 9 },
  weave: { x: 30, z: -55, w: 80, d: 44, h: 8 },
  dye: { x: 105, z: -62, w: 56, d: 30, h: 10 },
  boiler: { x: 86, z: -26, w: 14, d: 10, h: 7 },
  chimney: { x: 99, z: -26, r: 1.1, h: 32 },
  water: { x: 52, z: -26 },
  garments: { x: -45, z: 25, w: 100, d: 40, h: 8.5 },
  store: { x: 35, z: 25, w: 40, d: 40, h: 8 },
  /** effluent treatment plant */
  etp: { x0: 74, x1: 148, z0: 3, z1: 52 },
  substation: { x: 130, z: 84 },
  fire: { x: 92, z: 82 },
} as const;
