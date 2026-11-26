import type { StoreyCtx } from './BuildingKit';
import { basin, bed, bedside, chair, coffeeTable, counter, diningTable, fridge, plant, sofa, toilet, tvUnit, wardrobe } from './Furniture';

/**
 * ROOM LAYOUTS used as the `furnish` callback of Kit.storeys (brick house, town house, shop house flats). Everything is computed from the inside of the room
 * and from the stair flights (flight 0 on the LEFT wall), so it follows the model if its size changes.
 *
 *  partition : a wall at the front end of the stair flights splits the storey into FRONT and BACK (doorway in it).
 *  dayFloor  : FRONT = living room (sofa, coffee table, TV, plant); BACK = kitchen + dining (counter, fridge, table, 4 chairs) + a small bathroom (toilet, basin).
 *  nightFloor: FRONT = bedroom (bed, bedside table, wardrobe); BACK = second bedroom (bed, wardrobe).
 *  Furniture never stands on the way from a stair landing to the room, nor in front of the foot of the next flight.
 */
export const WALL = 0xefe8d8;

export interface Frame { y: number; hh: number; lo: number; hi: number; zmid: number }

/** The free part of storey `lv`: floor level, clear height, x range without the stair columns, and the z of the partition. */
export function frame(c: StoreyCtx, lv: number): Frame {
  const y = c.levelY[lv]!;
  const hh = c.clearH[lv]!;
  let lo = c.x0, hi = c.x1, zmid = c.z0;
  for (const s of [c.flights[lv - 1], c.flights[lv]]) {
    if (!s) continue;
    if (s.left) lo = Math.max(lo, s.xb);
    else hi = Math.min(hi, s.xa);
    zmid = Math.max(zmid, s.zf1);
  }
  return { y, hh, lo, hi, zmid };
}

/** The partition between the front and the back part of a storey, with a doorway. */
export function partition(c: StoreyCtx, f: Frame): void {
  c.k.interiorWall('x', f.zmid, f.lo, f.hi, f.y, f.hh, [{ c: f.lo + 1.95, w: 1.0 }], WALL);
}

/** Small bathroom in the back corner on the `hi` side: toilet + basin, door to the front. */
export function bathroom(c: StoreyCtx, f: Frame): void {
  const { k, z0 } = c;
  const xb = f.hi - 1.75; // left wall of the bathroom
  const zb = z0 + 1.95; // front wall of the bathroom
  k.interiorWall('z', xb, z0, zb, f.y, f.hh, [], WALL);
  k.interiorWall('x', zb, xb, f.hi, f.y, f.hh, [{ c: (xb + f.hi) / 2, w: 0.9 }], WALL);
  toilet(k, f.hi - 0.95, f.y, z0 + 0.32, 0);
  basin(k, f.hi - 0.22, f.y, zb - 0.7, 270);
}

/** Living room in front, kitchen + dining + bathroom behind. */
export function dayFloor(c: StoreyCtx, lv: number): void {
  const { k, x0, z0, z1 } = c;
  const f = frame(c, lv);
  const { y, lo, hi, zmid } = f;
  partition(c, f);
  bathroom(c, f);
  const xb = hi - 1.75;
  const cx0 = lo + 0.9;
  const cw = Math.min(xb - 0.8 - cx0, 3.6);
  counter(k, cx0 + cw / 2, y, z0 + 0.32, 0, cw);
  fridge(k, Math.min(xb - 0.45, cx0 + cw + 0.45), y, z0 + 0.4, 0);
  const tz = (z0 + zmid) / 2 + 0.5;
  const tx = lo + 3.35;
  diningTable(k, tx, y, tz, 0);
  chair(k, tx - 0.4, y, tz + 0.75, 180);
  chair(k, tx + 0.4, y, tz + 0.75, 180);
  chair(k, tx - 0.4, y, tz - 0.75, 0);
  chair(k, tx + 0.4, y, tz - 0.75, 0);
  const lz = (zmid + z1) / 2;
  sofa(k, hi - 0.5, y, lz, 270);
  coffeeTable(k, hi - 2.05, y, lz, 0);
  // TV on the left wall: not in front of the foot of a flight that stands on the left wall, and the plant only if the corner is still free
  const footLeft = !!c.flights[lv]?.left;
  let tvz = Math.max(lz, footLeft ? zmid + 2.25 : -Infinity);
  const plantOk = tvz <= z1 - 1.35;
  if (!plantOk) tvz = Math.min(tvz, z1 - 0.95);
  tvUnit(k, x0 + 0.25, y, tvz, 90);
  if (plantOk) plant(k, x0 + 0.4, y, z1 - 0.4);
}

/** Two bedrooms. The landing of the arriving flight is on the hole side, the beds go to the other side. */
export function nightFloor(c: StoreyCtx, lv: number): void {
  const { k, x0, x1, z0, z1 } = c;
  const f = frame(c, lv);
  const { y, lo, hi, zmid } = f;
  partition(c, f);
  const holeLeft = c.flights[lv - 1]!.left;
  // front bedroom: bed under the partition on the hole side (the foot of the next flight stays free)
  const bx = holeLeft ? x0 + 0.95 : x1 - 0.95;
  bed(k, bx, y, zmid + 1.2, 0, 0x4f78a8);
  bedside(k, holeLeft ? bx + 1.1 : bx - 1.1, y, zmid + 0.4, 0);
  const frontRoom = z1 - (zmid + 2.2) >= 1.4; // a shallow front room has no space for the wardrobe next to the bed: it goes behind the partition
  if (frontRoom) wardrobe(k, holeLeft ? x0 + 0.28 : x1 - 0.28, y, Math.min(zmid + 3.2, z1 - 0.65), holeLeft ? 90 : 270);
  else wardrobe(k, hi - 1.0, y, zmid - 0.34, 180);
  // back bedroom: bed in the far end from the landing, wardrobe beside the far wall
  const kx = holeLeft ? hi - 0.95 : lo + 0.95;
  bed(k, kx, y, z0 + 1.05, 0, 0xa85a4f);
  wardrobe(k, holeLeft ? hi - 0.28 : lo + 0.28, y, z0 + 3.4, holeLeft ? 270 : 90);
}

/** Brick house and town house: day floor on the ground, two bedrooms on every floor above. */
export function furnishBrickHouse(c: StoreyCtx): void {
  const f0 = c.flights[0];
  if (!f0 || !f0.left) return;
  for (let lv = 0; lv < c.floors; lv++) {
    if (lv === 0) dayFloor(c, lv);
    else nightFloor(c, lv);
  }
}
