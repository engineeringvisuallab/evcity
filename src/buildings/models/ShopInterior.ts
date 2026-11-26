import type { StoreyCtx } from './BuildingKit';
import { bathroom, dayFloor, frame, nightFloor, partition } from './HouseInterior';
import { crates, shelf, shopCounter } from './Furniture';

/**
 * SHOP HOUSE (shop-house-3 / -4): ground floor = shop (sales floor in front with shelves along the partition and the left wall and a sales counter,
 * store room + bathroom behind), first floor above = a flat's day floor (living room, kitchen, bathroom), every floor above that = two bedrooms.
 * The shop floor is taller than the others (3.6 m), which Kit.storeys handles with `heights`.
 */
export function shopFloor(c: StoreyCtx): void {
  const { k, x0, z0, z1 } = c;
  const f = frame(c, 0);
  const { y, lo, hi, zmid } = f;
  partition(c, f);
  bathroom(c, f);
  const sx0 = lo + 1.95 + 0.5 + 0.3, sx1 = hi - 0.4;
  const n = Math.floor((sx1 - sx0) / 2.0);
  const off = (sx1 - sx0 - n * 2.0) / 2;
  for (let i = 0; i < n; i++) shelf(k, sx0 + off + 1.0 + 2.0 * i, y, zmid + 0.3, 0, 2.0);
  shopCounter(k, hi - 1.8, y, zmid + 1.8, 0, 2.4);
  const sz0 = zmid + 1.5, sz1 = z1 - 0.5;
  const wl = Math.min(1.6, sz1 - sz0);
  if (wl >= 0.8) shelf(k, x0 + 0.25, y, sz0 + wl / 2, 90, wl);
  const xb = hi - 1.75;
  crates(k, lo + 1.0, y, z0 + 0.4);
  if (lo + 3.0 + 1.0 < xb) crates(k, lo + 3.0, y, z0 + 0.4);
}

export function furnishShopHouse(c: StoreyCtx): void {
  const f0 = c.flights[0];
  if (!f0 || !f0.left) return;
  for (let lv = 0; lv < c.floors; lv++) {
    if (lv === 0) shopFloor(c);
    else if (lv === 1) dayFloor(c, lv);
    else nightFloor(c, lv);
  }
}
