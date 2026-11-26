import type { StoreyCtx } from './BuildingKit';
import { basin, bedside, plant, toilet } from './Furniture';
import { WALL, bathroom, frame } from './HouseInterior';
import { ceilingLight, curtain, doctorDesk, examCouch, hospitalBed, ivStand, medCabinet, noticeBoard, officeChair, receptionDesk, sideChair, trolley, wallCross, waterCooler, waitingRow, weighScale } from './MedFurniture';

/**
 * CLINIC INTERIOR (Kit.storeys `furnish` callback), computed from the inside of the room so it follows the model if its size changes.
 *  ground floor: FRONT = reception desk, waiting chairs, water dispenser, health scale, plants, notice board.
 *                BACK  = three rooms behind a partition with doorways: doctor's consulting room, treatment room (couch, drip stand, trolley, basin),
 *                        pharmacy (counter + medicine cabinets) with a small toilet.
 *  first floor : BACK  = ward with hospital beds, bedside tables, drip stands, privacy curtains, a bathroom.  FRONT = nurse station + waiting chairs.
 *  Every storey gets pale ceiling light panels. Nothing stands in front of the door or at the foot of the stair flight.
 */
function lights(c: StoreyCtx, lv: number, xs: readonly number[], zs: readonly number[]): void {
  const top = c.levelY[lv]! + c.clearH[lv]!;
  for (const x of xs) for (const z of zs) ceilingLight(c.k, x, top, z);
}

function groundFloor(c: StoreyCtx): void {
  const { k, x0, x1, z0, z1 } = c;
  const f = frame(c, 0);
  const { y, hh, lo, hi, zmid } = f;
  const W = hi - lo;
  const rw = W / 3;
  const r1 = lo + rw / 2, r2 = lo + rw * 1.5, r3 = lo + rw * 2.5;
  // partition between the front hall and the three rooms, a doorway into every room, walls between the rooms
  k.interiorWall('x', zmid, lo, hi, y, hh, [{ c: r1, w: 1.0 }, { c: r2, w: 1.0 }, { c: r3, w: 1.0 }], WALL);
  k.interiorWall('z', lo + rw, z0, zmid, y, hh, [], WALL);
  k.interiorWall('z', lo + 2 * rw, z0, zmid, y, hh, [], WALL);
  // --- consulting room
  doctorDesk(k, r1, y, z0 + 1.15, 0);
  officeChair(k, r1, y, z0 + 0.45, 0);
  sideChair(k, r1 - 0.45, y, z0 + 2.2, 180);
  sideChair(k, r1 + 0.45, y, z0 + 2.2, 180);
  medCabinet(k, r1 + rw / 2 - 0.9, y, z0 + 0.3, 0);
  plant(k, lo + 0.35, y, zmid - 0.4);
  // --- treatment room
  examCouch(k, r2 - 0.9, y, z0 + 1.2, 0);
  ivStand(k, r2 - 0.1, y, z0 + 0.5);
  trolley(k, r2 + 0.5, y, z0 + 1.2);
  medCabinet(k, r2 + rw / 2 - 0.9, y, z0 + 0.3, 0);
  basin(k, lo + 2 * rw - 0.3, y, z0 + 2.3, 270);
  // --- pharmacy + toilet cubicle in the back right corner
  const tx = hi - 1.6, tz = z0 + 1.9;
  k.interiorWall('z', tx, z0, tz, y, hh, [], WALL);
  k.interiorWall('x', tz, tx, hi, y, hh, [{ c: tx + 0.8, w: 0.85 }], WALL);
  toilet(k, hi - 0.85, y, z0 + 0.35, 0);
  basin(k, hi - 0.25, y, tz - 0.7, 270);
  receptionDesk(k, lo + 2 * rw + 1.35, y, zmid - 1.2, 0, 2.0);
  medCabinet(k, lo + 2 * rw + 0.75, y, z0 + 0.3, 0);
  // --- front hall
  const dx = c.doorX[0] ?? (x0 + x1) / 2;
  receptionDesk(k, hi - 3.2, y, z1 - 3.1, 0, 3.0);
  officeChair(k, hi - 3.9, y, z1 - 4.0, 0);
  waitingRow(k, x0 + 0.4, y, z1 - 2.4, 90, 4);
  waitingRow(k, dx - 3.6, y, z1 - 0.4, 180, 4);
  waterCooler(k, x1 - 0.3, y, z1 - 0.35, 270);
  weighScale(k, x1 - 0.5, y, z1 - 1.3, 270);
  plant(k, x0 + 0.4, y, z1 - 0.4);
  plant(k, dx + 2.8, y, z1 - 0.4);
  noticeBoard(k, x0 + 0.06, y + 1.2, z1 - 2.4, 90);
  wallCross(k, (lo + hi) / 2, y + 2.2, zmid + 0.1, 0, 0.7);
  lights(c, 0, [lo + 2, (lo + hi) / 2, hi - 2], [(z0 + zmid) / 2, (zmid + z1) / 2]);
}

function ward(c: StoreyCtx): void {
  const { k, x0, x1, z0, z1 } = c;
  const f = frame(c, 1);
  const { y, hh, lo, hi, zmid } = f;
  k.interiorWall('x', zmid, lo, hi, y, hh, [{ c: lo + 2.0, w: 1.1 }, { c: hi - 3.5, w: 1.1 }], WALL);
  bathroom(c, f);
  // ward: beds with their heads on the back wall, bedside table + drip stand beside each, privacy curtain between the beds
  const room = hi - 1.75 - 0.6 - lo;
  const n = Math.max(2, Math.floor(room / 2.4));
  const step = room / n;
  const blankets = [0x3f78b0, 0x4f9a78, 0x7a8fb8, 0x3f78b0];
  for (let i = 0; i < n; i++) {
    const bx = lo + step * (i + 0.5);
    hospitalBed(k, bx, y, z0 + 1.2, 0, blankets[i % blankets.length]);
    bedside(k, bx + 0.85, y, z0 + 0.35, 0);
    ivStand(k, bx - 0.75, y, z0 + 0.7);
    if (i > 0) curtain(k, lo + step * i, y, z0 + 1.5, 90, 2.2, 2.3);
  }
  wallCross(k, lo + 1.0, y + 2.2, z0 + 0.05, 0, 0.6);
  // front: nurse station + waiting chairs + medicine cabinet
  const dx = c.doorX[0] ?? (x0 + x1) / 2;
  receptionDesk(k, hi - 3.2, y, z1 - 3.0, 0, 2.8);
  officeChair(k, hi - 3.2, y, z1 - 3.9, 0);
  waitingRow(k, x0 + 0.4, y, z1 - 2.4, 90, 4);
  medCabinet(k, dx - 1.0, y, z1 - 0.3, 180);
  plant(k, x1 - 0.4, y, z1 - 0.4);
  lights(c, 1, [lo + 2, (lo + hi) / 2, hi - 3], [(z0 + zmid) / 2, (zmid + z1) / 2]);
}

export function furnishClinic(c: StoreyCtx): void {
  const f0 = c.flights[0];
  if (!f0 || !f0.left) return;
  groundFloor(c);
  if (c.floors > 1) ward(c);
}
