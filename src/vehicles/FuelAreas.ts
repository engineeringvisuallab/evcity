import { CHARGE_LOTS, FUEL_LOTS, MAIN_STATION_LOT, worldToLot, type FuelLot } from '../parking/ParkingSite';
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
 * Where an electric vehicle charges: every small station and every CHARGE POINT (CHARGE_LOTS in ParkingSite.ts, docs/CHARGING_POINTS.md), all paid.
 * The old FREE EV Lab depot (the whole EVLAB fleet lot) was removed in Step 2: CP-01 now stands in the lot instead.
 */
export function chargeAreaAt(x: number, z: number): (Station & { free: boolean }) | null {
  const st = fuelAreaAt(x, z);
  if (st) return { ...st, free: false };
  const { s, n } = worldToLot(x, z);
  for (const l of CHARGE_LOTS) if (s >= l.s0 && s <= l.s1 && n >= l.n0 && n <= l.n1) return { id: l.id, nameBn: l.nameBn, free: false };
  return null;
}

// ---------------------------------------------------------------- mine -> main station delivery
/** MINE LOAD area: the open vehicle bay of the Mine Fuel Load Terminal (InfraSites 'mineload', level pad centred at (-3050, -550) inside 'eng-mining'), world metres.
 * Step 2: moved here from (-3300, -400) (steep hill, fenced in); reached through the east gate of the mining fence (ENGINEERING_GATES). */
export const MINE_LOAD = { id: 'mine-load', nameBn: 'খনি লোড এরিয়া', x0: -3056, x1: -3024, z0: -564, z1: -536 } as const;

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
  tanker: 6, // the fuel tanker: loads at the MAIN STATION (not at the mine), see TANKER_CAP
};
/** Seconds to load / unload a FULL vehicle. */
export const LOAD_SECONDS = 8;
export const UNLOAD_SECONDS = 6;
/** Bonus (Gold) for delivering `BONUS_CARGO` m3 to the main station; less cargo = proportionally less. */
export const DELIVERY_BONUS = 10000;
export const BONUS_CARGO = 4;

// ---------------------------------------------------------------- Step 2: main station -> small stations (the FUEL TANKER)
/** The FUEL TANKER (vehicle 'tanker', 200 km/h) loads fuel at the MAIN STATION and brings it to a small station. Its tank holds this many m3. */
export const TANKER_CAP = CARGO_CAP.tanker as number;
/** Seconds to load a full tanker at the main station. Unloading at a small station uses UNLOAD_SECONDS. */
export const MAIN_LOAD_SECONDS = 10;
/** Bonus (Gold) for emptying a FULL tanker at a small station (less fuel = proportionally less). */
export const STATION_BONUS = 5000;
/** The same small station pays again only after this many seconds (so the main station and its neighbour station-1 cannot be farmed back and forth). */
export const STATION_COOLDOWN = 120;
/** Fine (Gold) when the player's tanker is wrecked or catches fire (once per tanker). */
export const TANKER_FINE = 3000;
/** The big fire when a loaded tanker bursts: blast radius (m) = BASE + PER_M3 x fuel on board, and its power. */
export const TANKER_BLAST = { baseRadius: 10, perM3: 4, power: 150 } as const;
