import { EVLAB_LOT, FUEL_LOTS, MAIN_STATION_LOT, worldToLot, type FuelLot } from '../parking/ParkingSite';
import type { VehicleId } from './VehicleSpec';

/** Seconds to fill an empty fuel tank / charge an empty battery (the vehicle must stand still inside a station). */
export const FILL_SECONDS = 12;
export const CHARGE_SECONDS = 25;
/** Gold price of a FULL tank / a FULL battery at a station (paid while it fills; a part-full tank costs less). */
export const FUEL_PRICE_FULL = 400;
export const CHARGE_PRICE_FULL = 250;
/** A vehicle counts as standing still below this speed (m/s). */
export const STAND_STILL = 1.5;

export interface Station { id: string; nameBn: string }

/** The small station (see FUEL_LOTS in ParkingSite.ts) this world position is inside, or null. Every station gives fuel AND charge. */
export function fuelAreaAt(x: number, z: number): Station | null {
  const { s, n } = worldToLot(x, z);
  for (const l of FUEL_LOTS) if (s >= l.s0 && s <= l.s1 && n >= l.n0 && n <= l.n1) return l;
  return null;
}

/**
 * Where an electric vehicle charges: every small station (paid), plus - until real charge points are built (docs/CHARGING_POINTS.md) -
 * the EVLAB fleet lot as a FREE depot (remove that line when the charge points exist).
 */
export function chargeAreaAt(x: number, z: number): (Station & { free: boolean }) | null {
  const st = fuelAreaAt(x, z);
  if (st) return { ...st, free: false };
  const { s, n } = worldToLot(x, z);
  if (s >= EVLAB_LOT.s0 && s <= EVLAB_LOT.s1 && n >= EVLAB_LOT.n0 && n <= EVLAB_LOT.n1) return { id: 'evlab-depot', nameBn: 'ইভি ল্যাব চার্জ ডিপো', free: true };
  return null;
}

// ---------------------------------------------------------------- mine -> main station delivery
/** MINE LOAD area: inside the engineering area 'eng-mining' (x -3600..-3000, z -650..-150), world metres. Land only: no structure yet. Move it if the spot is not drivable. */
export const MINE_LOAD = { id: 'mine-load', nameBn: 'খনি লোড এরিয়া', x0: -3320, x1: -3280, z0: -420, z1: -380 } as const;

export function mineLoadAt(x: number, z: number): boolean {
  return x >= MINE_LOAD.x0 && x <= MINE_LOAD.x1 && z >= MINE_LOAD.z0 && z <= MINE_LOAD.z1;
}

/** The MAIN STATION unload area (see MAIN_STATION_LOT in ParkingSite.ts). */
export function mainStationAt(x: number, z: number): boolean {
  const { s, n } = worldToLot(x, z);
  const l: FuelLot = MAIN_STATION_LOT;
  return s >= l.s0 && s <= l.s1 && n >= l.n0 && n <= l.n1;
}

/** Fuel (m3) each vehicle can carry from the mine. Vehicles without an entry cannot carry fuel. */
export const CARGO_CAP: Partial<Record<VehicleId, number>> = {
  rickshaw: 0.5,
  auto: 1,
  sedan: 1,
  jeep: 2,
  pickup: 4,
  bus: 4,
};
/** Seconds to load / unload a FULL vehicle. */
export const LOAD_SECONDS = 8;
export const UNLOAD_SECONDS = 6;
/** Bonus (Gold) for delivering `BONUS_CARGO` m3 to the main station; less cargo = proportionally less. */
export const DELIVERY_BONUS = 10000;
export const BONUS_CARGO = 4;
