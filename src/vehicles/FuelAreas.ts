import { EVLAB_LOT, FUEL_LOTS, worldToLot, type FuelLot } from '../parking/ParkingSite';

/** Seconds to fill an empty fuel tank (the vehicle must stand still inside a fuel area). */
export const FILL_SECONDS = 12;
/** Seconds to charge an empty battery. */
export const CHARGE_SECONDS = 25;
/** A vehicle counts as standing still below this speed (m/s). */
export const STAND_STILL = 1.5;

/** The fuel area (see FUEL_LOTS in ParkingSite.ts) this world position is inside, or null. */
export function fuelAreaAt(x: number, z: number): FuelLot | null {
  const { s, n } = worldToLot(x, z);
  for (const l of FUEL_LOTS) if (s >= l.s0 && s <= l.s1 && n >= l.n0 && n <= l.n1) return l;
  return null;
}

/**
 * CHARGE POINTS for electric vehicles: NOT built yet. The planned points are listed in docs/CHARGING_POINTS.md.
 * Until they exist, the EVLAB fleet lot (where the electric fleet is parked) works as the one depot where an electric vehicle charges.
 * When real charge points are built, add their rectangles (lot frame) to CHARGE_LOTS and remove the EVLAB depot line in chargeAreaAt.
 */
export const CHARGE_LOTS: ReadonlyArray<FuelLot> = [];

export function chargeAreaAt(x: number, z: number): { id: string; nameBn: string } | null {
  const { s, n } = worldToLot(x, z);
  for (const l of CHARGE_LOTS) if (s >= l.s0 && s <= l.s1 && n >= l.n0 && n <= l.n1) return l;
  if (s >= EVLAB_LOT.s0 && s <= EVLAB_LOT.s1 && n >= EVLAB_LOT.n0 && n <= EVLAB_LOT.n1) return { id: 'evlab-depot', nameBn: 'ইভি ল্যাব চার্জ ডিপো' };
  return null;
}
