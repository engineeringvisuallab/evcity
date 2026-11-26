import type { StoreyCtx } from './BuildingKit';
import { bathroom, frame, WALL } from './HouseInterior';
import { shopFloor } from './ShopInterior';
import { basin, bed, bedside, chair, coffeeTable, counter, diningTable, fridge, plant, shopCounter, sofa, toilet, tvUnit, wardrobe, type Facing } from './Furniture';

/**
 * APARTMENT BLOCK (apt-slim-9): ground floor = entrance lobby (reception counter, waiting sofa, plants, a back room with a bathroom),
 * every floor above = ONE flat: front = living room (sofa, coffee table, TV, plant); back = kitchen + dining on the left, a bedroom with an en-suite
 * bathroom on the right (bed, bedside table, wardrobe). Same stair rules as HouseInterior: nothing on a landing exit or in front of the foot of a flight.
 */
function lobbyFloor(c: StoreyCtx): void {
  const { k, z0, z1 } = c;
  const f = frame(c, 0);
  const { y, lo, hi, zmid } = f;
  k.interiorWall('x', zmid, lo, hi, y, f.hh, [{ c: lo + 1.95, w: 1.2 }], WALL);
  bathroom(c, f);
  shopCounter(k, lo + 2.5, y, zmid + 1.8, 0, 2.4);
  const lz = (zmid + z1) / 2;
  sofa(k, hi - 0.5, y, lz, 270);
  coffeeTable(k, hi - 2.05, y, lz, 0);
  plant(k, hi - 0.4, y, z1 - 0.4);
  plant(k, lo + 0.4, y, z1 - 0.4);
  counter(k, lo + 2.5, y, z0 + 0.32, 0, 3.0);
}

export function flatFloor(c: StoreyCtx, lv: number): void {
  const { k, z0, z1 } = c;
  const f = frame(c, lv);
  const { y, hh, lo, hi, zmid } = f;
  // The layout is drawn for a landing on the LEFT (lo side). Where the arriving flight stands on the right wall, everything is mirrored about the
  // free span, so the landing exit never leads into the bathroom or the bedroom and the flights still alternate.
  const landLeft = !!c.flights[lv - 1]?.left;
  const M = (x: number): number => (landLeft ? x : lo + hi - x);
  const MF = (a: Facing): Facing => (landLeft ? a : a === 90 ? 270 : a === 270 ? 90 : a);
  const wallX = (fixed: number, a0: number, a1: number, gaps: { c: number; w: number }[]): void => {
    const p = M(a0), q = M(a1);
    k.interiorWall('x', fixed, Math.min(p, q), Math.max(p, q), y, hh, gaps.map((g) => ({ c: M(g.c), w: g.w })), WALL);
  };
  const xb = hi - 1.75; // en-suite bathroom wall
  const xs = lo + 4.5; // wall between the kitchen and the bedroom
  const zb = z0 + 1.95;
  // partition between front and back with a doorway to the kitchen and one to the bedroom
  wallX(zmid, lo, hi, [{ c: lo + 1.95, w: 1.0 }, { c: xb - 1.2, w: 1.0 }]);
  k.interiorWall('z', M(xs), z0, zmid, y, hh, [], WALL);
  // en-suite bathroom in the far corner of the bedroom
  k.interiorWall('z', M(xb), z0, zb, y, hh, [], WALL);
  wallX(zb, xb, hi, [{ c: (xb + hi) / 2, w: 0.9 }]);
  toilet(k, M(hi - 1.2), y, z0 + 0.32, 0);
  basin(k, M(hi - 0.22), y, zb - 0.7, MF(270));
  // kitchen + dining (back, next to the landing)
  const cx0 = lo + 0.9;
  const cw = Math.min(xs - 1.2 - cx0, 3.0);
  counter(k, M(cx0 + cw / 2), y, z0 + 0.32, 0, cw);
  const tz = (z0 + zmid) / 2 + 0.5;
  diningTable(k, M(lo + 2.3), y, tz, 0);
  chair(k, M(lo + 1.9), y, tz + 0.75, 180);
  chair(k, M(lo + 2.7), y, tz + 0.75, 180);
  chair(k, M(lo + 1.9), y, tz - 0.75, 0);
  chair(k, M(lo + 2.7), y, tz - 0.75, 0);
  fridge(k, M(xs - 0.45), y, z0 + 0.4, 0);
  // bedroom
  const bx = xs + 1.15;
  bed(k, M(bx), y, z0 + 1.15, 0, 0x4f78a8);
  bedside(k, M(bx + 1.25), y, z0 + 0.4, 0);
  wardrobe(k, M(xs + 0.4), y, z0 + 3.7, MF(90));
  // living room (front)
  const lz = (zmid + z1) / 2;
  sofa(k, M(hi - 0.5), y, lz, MF(270));
  coffeeTable(k, M(hi - 2.05), y, lz, 0);
  tvUnit(k, M(lo + 0.25), y, lz, MF(90));
  plant(k, M(lo + 0.4), y, z1 - 0.4);
}

export function furnishApartment(c: StoreyCtx): void {
  const f0 = c.flights[0];
  if (!f0 || !f0.left) return;
  for (let lv = 0; lv < c.floors; lv++) {
    if (lv === 0) lobbyFloor(c);
    else flatFloor(c, lv);
  }
}

/** apt-slim-14: shops on the ground floor (like the shop house), one flat on every floor above. */
export function furnishApartmentShops(c: StoreyCtx): void {
  const f0 = c.flights[0];
  if (!f0 || !f0.left) return;
  for (let lv = 0; lv < c.floors; lv++) {
    if (lv === 0) shopFloor(c);
    else flatFloor(c, lv);
  }
}
