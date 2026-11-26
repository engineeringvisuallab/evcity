import type { StoreyCtx } from './BuildingKit';
import { basin, bedside, plant } from './Furniture';
import { WALL, bathroom, frame, type Frame } from './HouseInterior';
import {
  ceilingLight, crashCart, curtain, doctorDesk, examCouch, hospitalBed, ivStand, labBench, medCabinet, noticeBoard, officeChair, operatingTable, patientMonitor,
  receptionDesk, sideChair, surgicalLamp, trolley, wallCross, waterCooler, waitingRow, weighScale, wheelchair,
} from './MedFurniture';

/**
 * HOSPITAL INTERIOR (Kit.storeys `furnish` callbacks). The hospital has three separate walk-in blocks, each with its own stair:
 *  TOWER (8 storeys) : 0 main hall (registration desks, waiting chairs) + 4 outpatient (OPD) consulting rooms,
 *                      1 operating floor (2 operating theatres + recovery bay + scrub sinks), 2 intensive care (monitored beds + nurse station),
 *                      3-7 patient wards (beds, bedside tables, drips, curtains, bathrooms, nurse station).
 *  RIGHT WING (5)    : 0 emergency (triage desk, waiting, wheelchairs, 4 casualty bays with monitors and a crash cart), 1-4 patient wards.
 *  LEFT WING (5)     : 0 laboratory + pharmacy, 1-4 patient wards.
 * Everything is computed from the inside of the room and from the stair flight (flight 0 on the LEFT wall), like the clinic.
 */
function lights(c: StoreyCtx, lv: number, f: Frame): void {
  const top = c.levelY[lv]! + c.clearH[lv]!;
  const nx = Math.max(2, Math.round((f.hi - f.lo) / 5));
  for (let i = 0; i < nx; i++) {
    const x = f.lo + ((f.hi - f.lo) * (i + 0.5)) / nx;
    for (const z of [(c.z0 + f.zmid) / 2, (f.zmid + c.z1) / 2 - 1.2, c.z1 - 2.2]) ceilingLight(c.k, x, top, z);
  }
}

/** Beds in a row on the back wall: heads at the wall, bedside table + drip stand, curtain between neighbours, optional monitor. `reserve` = width kept free on the hi side. */
function bedRow(c: StoreyCtx, f: Frame, lv: number, reserve: number, monitor: boolean): void {
  const { k, z0 } = c;
  const y = f.y;
  const room = f.hi - reserve - f.lo;
  const n = Math.max(2, Math.floor(room / 2.4));
  const step = room / n;
  const colors = [0x3f78b0, 0x4f9a78, 0x7a8fb8, 0xa8645a, 0x3f78b0];
  for (let i = 0; i < n; i++) {
    const bx = f.lo + step * (i + 0.5);
    hospitalBed(k, bx, y, z0 + 1.2, 0, colors[(i + lv) % colors.length]);
    bedside(k, bx + 0.85, y, z0 + 0.35, 0);
    if (monitor) patientMonitor(k, bx - 0.8, y, z0 + 0.5, 0);
    else ivStand(k, bx - 0.75, y, z0 + 0.7);
    if (i > 0) curtain(k, f.lo + step * i, y, z0 + 1.5, 90, 2.2, 2.4);
  }
}

/** Nurse station in the middle of the front hall + a few supporting pieces. */
function nurseHall(c: StoreyCtx, f: Frame, withChairs: boolean): void {
  const { k, x0, z1 } = c;
  const y = f.y;
  const cx = (f.lo + f.hi) / 2;
  const dz = f.zmid + (z1 - f.zmid) * 0.55;
  receptionDesk(k, cx, y, dz, 0, 4.2);
  officeChair(k, cx - 1.0, y, dz - 0.95, 0);
  officeChair(k, cx + 1.0, y, dz - 0.95, 0);
  medCabinet(k, f.lo + 5.5, y, f.zmid + 0.3, 0);
  medCabinet(k, f.hi - 7.0, y, f.zmid + 0.3, 0);
  trolley(k, cx + 3.6, y, dz);
  wheelchair(k, f.hi - 1.0, y, z1 - 1.0, 180);
  if (withChairs) waitingRow(k, x0 + 0.4, y, z1 - 3.0, 90, 4);
  plant(k, f.hi - 0.4, y, z1 - 2.2);
  noticeBoard(k, x0 + 0.06, y + 1.2, z1 - 6.5, 90);
}

/** A patient ward floor (also used for ICU with `icu`). */
function wardFloor(c: StoreyCtx, lv: number, icu: boolean): void {
  const f = frame(c, lv);
  const { k, z0 } = c;
  k.interiorWall('x', f.zmid, f.lo, f.hi, f.y, f.hh, [{ c: f.lo + 2.0, w: 1.2 }, { c: (f.lo + f.hi) / 2, w: 1.2 }, { c: f.hi - 3.5, w: 1.2 }], WALL);
  bathroom(c, f);
  bedRow(c, f, lv, 1.75 + 0.6, icu);
  wallCross(k, f.lo + 1.0, f.y + 2.3, z0 + 0.05, 0, 0.6);
  nurseHall(c, f, true);
  if (icu) { crashCart(k, f.lo + 1.2, f.y, f.zmid + 1.0, 0); ivStand(k, f.lo + 2.2, f.y, f.zmid + 1.0); }
  lights(c, lv, f);
}

function operatingFloor(c: StoreyCtx, lv: number): void {
  const f = frame(c, lv);
  const { k, z0, z1 } = c;
  const { y, hh, lo, hi, zmid } = f;
  const mid = (lo + hi) / 2;
  const o1 = (lo + mid) / 2, o2 = (mid + hi) / 2;
  k.interiorWall('x', zmid, lo, hi, y, hh, [{ c: o1, w: 1.4 }, { c: o2, w: 1.4 }], WALL);
  k.interiorWall('z', mid, z0, zmid, y, hh, [], WALL);
  for (const o of [o1, o2]) {
    operatingTable(k, o, y, z0 + 2.7, 0);
    surgicalLamp(k, o - 0.5, y, z0 + 2.7, hh);
    patientMonitor(k, o + 1.3, y, z0 + 1.2, 0);
    crashCart(k, o - 1.6, y, z0 + 0.6, 0);
    trolley(k, o + 1.0, y, z0 + 3.5);
    trolley(k, o - 1.2, y, z0 + 3.6);
    basin(k, o - 2.5, y, z0 + 0.4, 0);
    wallCross(k, o, y + 2.3, z0 + 0.05, 0, 0.5);
    // scrub sinks on the hall side of the partition
    basin(k, o - 1.5, y, zmid + 0.4, 0);
    basin(k, o + 1.5, y, zmid + 0.4, 0);
  }
  // recovery bay along the front wall (heads at the wall) + nurse desk
  const n = Math.max(3, Math.floor((hi - lo - 4) / 2.6));
  for (let i = 0; i < n; i++) {
    const bx = lo + 1.6 + i * ((hi - lo - 3.2) / n);
    hospitalBed(k, bx, y, z1 - 1.2, 180, 0x4f9a78);
    patientMonitor(k, bx + 0.85, y, z1 - 0.5, 180);
    if (i > 0) curtain(k, bx - 1.2, y, z1 - 1.8, 90, 2.2, 2.4);
  }
  receptionDesk(k, mid, y, zmid + 3.2, 0, 3.6);
  officeChair(k, mid, y, zmid + 2.3, 0);
  lights(c, lv, f);
}

function opdFloor(c: StoreyCtx): void {
  const f = frame(c, 0);
  const { k, x0, x1, z0, z1 } = c;
  const { y, hh, lo, hi, zmid } = f;
  const n = 4, rw = (hi - lo) / n;
  const doors = Array.from({ length: n }, (_, i) => ({ c: lo + rw * (i + 0.5), w: 1.1 }));
  k.interiorWall('x', zmid, lo, hi, y, hh, doors, WALL);
  for (let i = 1; i < n; i++) k.interiorWall('z', lo + rw * i, z0, zmid, y, hh, [], WALL);
  for (let i = 0; i < n; i++) {
    const rc = lo + rw * (i + 0.5);
    doctorDesk(k, rc - 0.7, y, z0 + 1.1, 0);
    officeChair(k, rc - 0.7, y, z0 + 0.4, 0);
    sideChair(k, rc - 1.1, y, z0 + 2.2, 180);
    sideChair(k, rc - 0.3, y, z0 + 2.2, 180);
    examCouch(k, rc + rw / 2 - 0.9, y, z0 + 1.3, 0);
    medCabinet(k, rc + 0.5, y, z0 + 0.3, 0);
  }
  // main hall: registration desks facing the entrance, waiting chairs, water, scale, plants, signs
  receptionDesk(k, lo + 4.5, y, zmid + 2.4, 0, 3.2);
  receptionDesk(k, hi - 4.5, y, zmid + 2.4, 0, 3.2);
  officeChair(k, lo + 4.5, y, zmid + 1.5, 0);
  officeChair(k, hi - 4.5, y, zmid + 1.5, 0);
  for (const sx of [-1, 1]) {
    waitingRow(k, (lo + hi) / 2 + sx * 7.5, y, z1 - 3.0, 180, 5);
    waitingRow(k, (lo + hi) / 2 + sx * 7.5, y, z1 - 4.2, 0, 5);
  }
  waterCooler(k, x1 - 0.3, y, z1 - 0.35, 270);
  weighScale(k, x1 - 0.5, y, z1 - 1.3, 270);
  plant(k, x0 + 0.4, y, z1 - 0.4);
  plant(k, x1 - 0.4, y, zmid + 0.5);
  noticeBoard(k, x0 + 0.06, y + 1.2, z1 - 3.0, 90);
  wallCross(k, (lo + hi) / 2, y + 2.4, zmid + 0.1, 0, 0.9);
  lights(c, 0, f);
}

function emergencyFloor(c: StoreyCtx): void {
  const f = frame(c, 0);
  const { k, x0, x1, z1 } = c;
  const { y, hh, lo, hi, zmid } = f;
  k.interiorWall('x', zmid, lo, hi, y, hh, [{ c: lo + 2.5, w: 1.6 }, { c: (lo + hi) / 2, w: 1.6 }, { c: hi - 3.0, w: 1.6 }], WALL);
  // casualty bays: bed + monitor + drip + crash cart, curtains between
  const n = 4, step = (hi - lo - 1.0) / n;
  for (let i = 0; i < n; i++) {
    const bx = lo + 0.5 + step * (i + 0.5);
    hospitalBed(k, bx, y, c.z0 + 1.2, 0, 0xa8645a);
    patientMonitor(k, bx - 0.8, y, c.z0 + 0.5, 0);
    ivStand(k, bx + 0.8, y, c.z0 + 0.7);
    if (i % 2 === 1) crashCart(k, bx + step / 2 - 0.4, y, c.z0 + 0.5, 0);
    if (i > 0) curtain(k, lo + 0.5 + step * i, y, c.z0 + 1.5, 90, 2.2, 2.4);
  }
  wallCross(k, (lo + hi) / 2, y + 2.4, c.z0 + 0.05, 0, 0.8);
  // front: triage desk, waiting, wheelchairs, stretchers
  receptionDesk(k, hi - 4.0, y, zmid + 3.0, 0, 3.2);
  officeChair(k, hi - 4.0, y, zmid + 2.1, 0);
  waitingRow(k, x0 + 0.4, y, z1 - 3.0, 90, 5);
  waitingRow(k, lo + 4.0, y, z1 - 0.4, 180, 5);
  for (let i = 0; i < 3; i++) wheelchair(k, hi - 1.0 - i * 0.7, y, z1 - 1.0, 180);
  hospitalBed(k, lo + 7.5, y, zmid + 2.0, 90, 0xa8645a); // stretcher waiting in the hall
  waterCooler(k, x1 - 0.3, y, z1 - 2.5, 270);
  plant(k, x1 - 0.4, y, z1 - 0.4);
  lights(c, 0, f);
}

function labPharmacyFloor(c: StoreyCtx): void {
  const f = frame(c, 0);
  const { k, x0, x1, z0, z1 } = c;
  const { y, hh, lo, hi, zmid } = f;
  const mid = (lo + hi) / 2;
  const rl = (lo + mid) / 2, rp = (mid + hi) / 2;
  k.interiorWall('x', zmid, lo, hi, y, hh, [{ c: rl, w: 1.2 }, { c: rp, w: 1.2 }], WALL);
  k.interiorWall('z', mid, z0, zmid, y, hh, [], WALL);
  // laboratory: benches along the back wall and an island, a sample fridge corner
  labBench(k, rl - 2.2, y, z0 + 0.5, 0, 3.0);
  labBench(k, rl + 1.6, y, z0 + 0.5, 0, 3.0);
  labBench(k, rl, y, z0 + 3.0, 0, 4.0);
  officeChair(k, rl - 0.6, y, z0 + 3.9, 0);
  officeChair(k, rl + 0.6, y, z0 + 3.9, 0);
  medCabinet(k, lo + 0.9, y, zmid - 0.3, 180);
  // pharmacy: counter with the customer side to the hall, medicine cabinets along the back wall
  receptionDesk(k, rp, y, zmid - 1.6, 0, 3.4);
  for (let i = 0; i < 4; i++) medCabinet(k, mid + 1.4 + i * 1.5, y, z0 + 0.3, 0);
  // front hall: waiting + sample collection desk
  receptionDesk(k, lo + 4.0, y, zmid + 2.2, 0, 3.0);
  officeChair(k, lo + 4.0, y, zmid + 1.3, 0);
  waitingRow(k, x1 - 0.4, y, z1 - 4.0, 270, 5);
  waitingRow(k, (lo + hi) / 2, y, z1 - 0.4, 180, 5);
  waterCooler(k, x0 + 0.3, y, z1 - 0.35, 90);
  plant(k, x1 - 0.4, y, z1 - 0.4);
  noticeBoard(k, x1 - 0.06, y + 1.2, z1 - 8.0, 270);
  wallCross(k, (lo + hi) / 2, y + 2.4, zmid + 0.1, 0, 0.8);
  lights(c, 0, f);
}

export function furnishHospitalTower(c: StoreyCtx): void {
  const f0 = c.flights[0];
  if (!f0 || !f0.left) return;
  for (let lv = 0; lv < c.floors; lv++) {
    if (lv === 0) opdFloor(c);
    else if (lv === 1) operatingFloor(c, lv);
    else wardFloor(c, lv, lv === 2);
  }
}

/** Both wings: the right one (x > 0, next to the ambulance bay) is the emergency block, the left one holds the laboratory and pharmacy. */
export function furnishHospitalWing(c: StoreyCtx): void {
  const f0 = c.flights[0];
  if (!f0 || !f0.left) return;
  for (let lv = 0; lv < c.floors; lv++) {
    if (lv === 0) { if (c.x0 > 0) emergencyFloor(c); else labPharmacyFloor(c); }
    else wardFloor(c, lv, false);
  }
}
