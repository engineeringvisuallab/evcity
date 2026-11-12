// DEMAND (T03): peak-hour volumes for a junction. Stub. Type = the one Analysis.ts expects.
import type { Demand } from '../Analysis';

export interface DemandOverride {
  /** approach index 0..3 in circulation order, veh/h */
  approach: number;
  thru?: number;
  left?: number;
  right?: number;
}
/** Road-class defaults (assumption, veh/h per approach): highway 1800/150/100, collector 250/120/80. */
export const DEFAULT_DEMAND_BY_KIND: Record<string, { thru: number; left: number; right: number }> = {
  highway: { thru: 1800, left: 150, right: 100 },
  collector: { thru: 250, left: 120, right: 80 },
};
/** T03: AI traffic counts if available, else road-class defaults, then user overrides. */
export function demandFor(_junctionId: string, _overrides?: DemandOverride[]): Demand {
  throw new Error('T03 not implemented: see docs/j6/04_TASKS_BN.md');
}
