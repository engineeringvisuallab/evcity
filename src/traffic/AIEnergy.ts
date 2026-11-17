// STEP 2A - ENERGY OF AI TRAFFIC as PURE NUMBERS (no three.js, no Rapier, no DOM), like Energy.ts does for the player.
// Every AI vehicle that has an entry in ENERGY (Energy.ts) carries an AiEnergy: a level 0..1 that falls with the distance driven (same consumptionFactor as the player:
// speed, damage, coasting), a personal "go to a station" threshold (15..35 %, default 25 %), and the answer to "does it need a station now?".
// The route / queue code (Step 2B, 2C) only asks: aiNeed(), siteAccepts(), canReach(). Nothing here touches Vehicle / TrafficManager (that is Step 2D).
import { ENERGY, consumptionFactor, rangeKm, type EnergyKind } from '../vehicles/Energy';
import type { VehicleId } from '../vehicles/VehicleSpec';
import type { RoadStationSite } from '../parking/RoadStationSites';

/** Policy numbers (one place). Levels are fractions of a full tank / battery. */
export const AI_ENERGY = {
  /** Personal threshold range: the driver starts looking for a station below this level (the middle, 0.25, is the default). */
  thresholdMin: 0.15,
  thresholdMax: 0.35,
  /** Below this the driver takes ANY matching station / charge point (emergency), even a full one: waits in the driveway. */
  emergency: 0.1,
  /** At 0 the vehicle is out of energy: it pulls over on the shoulder and is removed after a while. */
  empty: 0,
  /** Level a freshly spawned AI vehicle starts with (random in this range, so they do not all reach a station together). */
  spawnMin: 0.3,
  spawnMax: 1,
  /** Charge point that is a bus bay: wider than a normal one (RoadStationSites: hw 6, hd 1.75). */
  busBayHw: 5.5,
} as const;

export type AiNeed = 'none' | 'normal' | 'emergency' | 'empty';

export interface AiEnergy {
  kind: EnergyKind;
  /** Distance (km) on a full tank / battery in normal condition (from ENERGY). */
  baseKm: number;
  /** 0..1. */
  level: number;
  /** This driver's own "I need a station" level (0.15..0.35). */
  threshold: number;
}

/** A random number 0 <= r < 1 (Math.random in the game, a seeded generator in tests). */
export type Rnd = () => number;

/** An AI energy state for this vehicle, or null if the vehicle never runs out (no ENERGY entry: truck, tractor, combine, pickup, suprim ...). */
export function makeAiEnergy(id: VehicleId, rnd: Rnd): AiEnergy | null {
  const spec = ENERGY[id];
  if (!spec) return null;
  const level = AI_ENERGY.spawnMin + rnd() * (AI_ENERGY.spawnMax - AI_ENERGY.spawnMin);
  const threshold = AI_ENERGY.thresholdMin + rnd() * (AI_ENERGY.thresholdMax - AI_ENERGY.thresholdMin);
  return { kind: spec.kind, baseKm: spec.baseKm, level, threshold };
}

/** Uses up energy for `distM` metres driven at `kmh` (the same consumption model as the player). Returns the new level. */
export function drainAi(e: AiEnergy, distM: number, kmh: number, hpFrac: number, throttle: number): number {
  if (e.level <= 0 || distM <= 0) return e.level;
  const f = consumptionFactor(kmh, hpFrac, throttle);
  e.level = Math.max(0, e.level - (distM / (e.baseKm * 1000)) * f);
  return e.level;
}

/** Does this vehicle need a station now? none: no. normal: below its own threshold (look for the next matching site). emergency: below 10 %. empty: 0. */
export function aiNeed(e: AiEnergy): AiNeed {
  if (e.level <= AI_ENERGY.empty) return 'empty';
  if (e.level < AI_ENERGY.emergency) return 'emergency';
  if (e.level < e.threshold) return 'normal';
  return 'none';
}

/** Estimated distance (m) the vehicle can still drive at normal speed in its current condition. */
export function rangeLeftM(e: AiEnergy, hpFrac: number): number {
  return rangeKm({ kind: e.kind, baseKm: e.baseKm }, e.level, hpFrac) * 1000;
}

/** Can it get to a site `distM` metres away and still have `reserve` (default 3 %) of the tank / battery left? (Used to skip a site it could not reach.) */
export function canReach(e: AiEnergy, distM: number, hpFrac: number, reserve = 0.03): boolean {
  const spend = (distM / (e.baseKm * 1000)) * consumptionFactor(60, hpFrac, 1);
  return e.level - spend >= reserve;
}

/** Is this site a bus bay (a wide charge point)? */
export function isBusBay(site: Pick<RoadStationSite, 'kind' | 'hw'>): boolean {
  return site.kind === 'charge' && site.hw >= AI_ENERGY.busBayHw;
}

/**
 * Which sites suit this vehicle:
 *   - fuel vehicle (petrol / diesel / CNG): fuel stations only
 *   - electric bus: a bus bay only
 *   - any other electric vehicle: a normal charge point, or a fuel station (it also has chargers)
 * (The tanker is fuel and uses fuel stations like any other fuel vehicle; it has its own unload logic elsewhere.)
 */
export function siteAccepts(id: VehicleId, site: Pick<RoadStationSite, 'kind' | 'hw'>): boolean {
  const spec = ENERGY[id];
  if (!spec) return false;
  if (spec.kind === 'fuel') return site.kind === 'fuel';
  if (id === 'bus') return isBusBay(site);
  return site.kind === 'fuel' || !isBusBay(site);
}

/** Refills the vehicle (Step 2C calls this when the serve time is over). */
export function refillAi(e: AiEnergy): void {
  e.level = 1;
}
