import type { StoreyCtx } from './BuildingKit';
import { basin, bed, bedside, chair, coffeeTable, counter, diningTable, fridge, plant, sofa, toilet, tvUnit, wardrobe } from './Furniture';

/**
 * ROOM LAYOUT of the brick house (house-brick-2 / -3), used as the `furnish` callback of Kit.storeys. Everything is computed from the inside of the room
 * and from the stair flights (flight 0 on the LEFT wall), so it follows the model if its size changes.
 *
 *  Ground floor: a partition at the front end of the stair splits FRONT = living room (sofa, coffee table, TV, plant) from BACK = kitchen + dining
 *                (counter, fridge, table, 4 chairs) + a small bathroom in the back right corner (toilet, basin).
 *  Upper floors: the same partition; FRONT = bedroom (bed, bedside table, wardrobe), BACK = second bedroom (bed, wardrobe).
 *  Furniture never stands on the way from a stair landing to the room, nor in front of the foot of the next flight.
 */
const WALL = 0xefe8d8;

export function furnishBrickHouse(c: StoreyCtx): void {
  const { k, x0, x1, z0, z1 } = c;
  const f0 = c.flights[0];
  if (!f0 || !f0.left) return;
  const zmid = f0.zf1; // front end of the stair flights: splits the room into back and front
  for (let lv = 0; lv < c.floors; lv++) {
    const y = c.levelY[lv]!;
    const hh = c.clearH[lv]!;
    // stair columns standing in this storey: the hole of the flight that arrives here and the foot of the flight that leaves
    let lo = x0, hi = x1;
    for (const s of [c.flights[lv - 1], c.flights[lv]]) {
      if (!s) continue;
      if (s.left) lo = Math.max(lo, s.xb);
      else hi = Math.min(hi, s.xa);
    }
    const gx = lo + 1.95; // doorway in the partition
    k.interiorWall('x', zmid, lo, hi, y, hh, [{ c: gx, w: 1.0 }], WALL);
    if (lv === 0) {
      // ----- ground floor
      const xb = hi - 1.75; // left wall of the bathroom
      const zb = z0 + 1.95; // front wall of the bathroom
      k.interiorWall('z', xb, z0, zb, y, hh, [], WALL);
      k.interiorWall('x', zb, xb, hi, y, hh, [{ c: (xb + hi) / 2, w: 0.9 }], WALL);
      toilet(k, hi - 0.95, y, z0 + 0.32, 0);
      basin(k, hi - 0.22, y, zb - 0.7, 270);
      const cx0 = lo + 0.9, cx1 = xb - 0.8;
      counter(k, (cx0 + cx1) / 2, y, z0 + 0.32, 0, cx1 - cx0);
      fridge(k, xb - 0.45, y, z0 + 0.4, 0);
      const tz = (z0 + zmid) / 2 + 0.5;
      diningTable(k, 0.4, y, tz, 0);
      chair(k, 0.0, y, tz + 0.75, 180);
      chair(k, 0.8, y, tz + 0.75, 180);
      chair(k, 0.0, y, tz - 0.75, 0);
      chair(k, 0.8, y, tz - 0.75, 0);
      const lz = (zmid + z1) / 2;
      sofa(k, hi - 0.5, y, lz, 270);
      coffeeTable(k, hi - 2.05, y, lz, 0);
      tvUnit(k, x0 + 0.25, y, lz, 90);
      plant(k, x0 + 0.4, y, z1 - 0.4);
    } else {
      // ----- upper floors: the landing of the arriving flight is on the hole side, beds go to the other side
      const hole = c.flights[lv - 1]!;
      const holeLeft = hole.left;
      // front bedroom: bed under the partition on the hole side (the foot of the next flight stays free)
      const bx = holeLeft ? x0 + 0.95 : x1 - 0.95;
      bed(k, bx, y, zmid + 1.2, 0, 0x4f78a8);
      bedside(k, holeLeft ? bx + 1.1 : bx - 1.1, y, zmid + 0.4, 0);
      wardrobe(k, holeLeft ? x0 + 0.28 : x1 - 0.28, y, z1 - 1.3, holeLeft ? 90 : 270);
      // back bedroom: bed in the far end from the landing, wardrobe beside the far wall
      const kx = holeLeft ? hi - 0.95 : lo + 0.95;
      bed(k, kx, y, z0 + 1.05, 0, 0xa85a4f);
      wardrobe(k, holeLeft ? hi - 0.28 : lo + 0.28, y, z0 + 3.4, holeLeft ? 270 : 90);
    }
  }
}
