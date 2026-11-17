import type { VehicleId } from './VehicleSpec';

/**
 * ENERGY: every road vehicle the player drives has a fuel tank (petrol / diesel / CNG) or a battery (electric).
 * A full tank / battery drives `baseKm` kilometres in NORMAL condition (about 60 km/h, undamaged). Condition changes it:
 *   - speed:   faster than 60 km/h costs much more (air drag), slower is a little cheaper
 *   - damage:  a damaged vehicle (low hp) wastes energy
 *   - coasting (no throttle) costs little
 * AI traffic uses energy too (step 2, Config.traffic.energy): a low AI car drives into a fuel station / charge point along its highway (traffic/StationStops.ts) and fills up.
 * Refuelling: fuel areas (FuelAreas.ts). Charging: electric vehicles at charge points (see docs/CHARGING_POINTS.md).
 */
export type EnergyKind = 'fuel' | 'electric';

export interface EnergySpec {
  kind: EnergyKind;
  /** Distance (km) on a full tank / battery in normal condition: 10 / 15 / 20. */
  baseKm: number;
}

/** Vehicles without an entry (suprim, tractor, combine, pickup: their own systems) never run out. */
export const ENERGY: Partial<Record<VehicleId, EnergySpec>> = {
  rickshaw: { kind: 'electric', baseKm: 10 },
  evhypar: { kind: 'electric', baseKm: 15 },
  bus: { kind: 'electric', baseKm: 20 },
  evbike: { kind: 'electric', baseKm: 15 },
  sedan: { kind: 'fuel', baseKm: 15 },
  jeep: { kind: 'fuel', baseKm: 15 },
  hypercar: { kind: 'fuel', baseKm: 10 },
  auto: { kind: 'fuel', baseKm: 15 },
  tank: { kind: 'fuel', baseKm: 10 },
  tanker: { kind: 'fuel', baseKm: 15 },
};

/** Speed (km/h) at which `baseKm` is reached. */
export const REF_KMH = 60;

/** Damage: 1 at full hp, 1.8 at 0 hp. */
export function damageFactor(hpFrac: number): number {
  return 1 + 0.8 * (1 - Math.min(1, Math.max(0, hpFrac)));
}

/** How many times the normal energy per km the vehicle uses right now. */
export function consumptionFactor(kmh: number, hpFrac: number, throttle: number): number {
  const k = kmh / REF_KMH;
  const speed = Math.min(4, 0.75 + 0.25 * k * k);
  const load = throttle > 0.05 ? 1 : 0.35; // coasting / braking costs little
  return speed * load * damageFactor(hpFrac);
}

/** Estimated remaining distance (km) at normal speed in the vehicle's current condition. */
export function rangeKm(spec: EnergySpec, level: number, hpFrac: number): number {
  return (level * spec.baseKm) / damageFactor(hpFrac);
}
