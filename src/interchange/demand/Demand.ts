// DEMAND (T03): peak-hour volumes (veh/h) of a junction, in the type Analysis.ts expects. Pure module (no three, no game state).
// Priority per movement: (c) user override > (a) measured AI traffic counts (if a provider is given and has data) > (b) road-class default.
import type { Demand, Movement } from '../Analysis';

export type DemandKind = 'highway' | 'arterial' | 'collector' | 'local';

export interface DemandOverride {
  /** approach index 0..3 in circulation order, veh/h */
  approach: number;
  thru?: number;
  left?: number;
  right?: number;
}

/** Road-class defaults (assumption, veh/h per approach). highway / collector = the numbers the J6 analysis was run with; arterial / local are in between / below. */
export const DEFAULT_DEMAND_BY_KIND: Record<DemandKind, Movement> = {
  highway: { thru: 1800, left: 150, right: 100 },
  arterial: { thru: 700, left: 180, right: 120 },
  collector: { thru: 250, left: 120, right: 80 },
  local: { thru: 80, left: 40, right: 30 },
};

/** Measured peak-hour counts of one approach (e.g. from the AI traffic), or null when nothing was counted. */
export type CountProvider = (approach: number) => Partial<Movement> | null;

export interface DemandInput {
  /** The 4 approaches in circulation order ([0] main forward, [1] next leg, [2] main backward, [3] other cross leg) and the class of the road on each. */
  kinds: [DemandKind, DemandKind, DemandKind, DemandKind];
  counts?: CountProvider;
  overrides?: DemandOverride[];
}

const KEYS: (keyof Movement)[] = ['thru', 'left', 'right'];
const clean = (v: number | undefined): number | undefined => (v !== undefined && Number.isFinite(v) && v >= 0 ? v : undefined);

/** Where each number came from (for the analysis panel, T10). */
export type DemandSource = 'override' | 'count' | 'default';
export interface DemandResult {
  demand: Demand;
  sources: DemandSource[][];
}

export function resolveDemand(input: DemandInput): DemandResult {
  const approaches: Movement[] = [];
  const sources: DemandSource[][] = [];
  for (let i = 0; i < 4; i++) {
    const def = DEFAULT_DEMAND_BY_KIND[input.kinds[i]];
    const cnt = input.counts?.(i) ?? null;
    const ovs = (input.overrides ?? []).filter((o) => o.approach === i);
    const m: Movement = { thru: 0, left: 0, right: 0 };
    const src: DemandSource[] = [];
    for (const k of KEYS) {
      let v: number = def[k];
      let s: DemandSource = 'default';
      const c = clean(cnt?.[k]);
      if (c !== undefined) {
        v = c;
        s = 'count';
      }
      for (const o of ovs) {
        const ov = clean(o[k]);
        if (ov !== undefined) {
          v = ov;
          s = 'override';
        }
      }
      m[k] = v;
      src.push(s);
    }
    approaches.push(m);
    sources.push(src);
  }
  return { demand: { approaches }, sources };
}

/** Convenience: the demand of a junction of a main road `main` crossing a road `cross`. */
export function demandFor(main: DemandKind, cross: DemandKind, overrides?: DemandOverride[], counts?: CountProvider): Demand {
  return resolveDemand({ kinds: [main, cross, main, cross], overrides, counts }).demand;
}
