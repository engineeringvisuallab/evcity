// STEP 9.2 J1: LANE LEVEL of the stack. Pure math, same local frame as StackGeometry.
//   lane model   a ramp has 2 lanes (3.65) + 0.55 shoulders = 8.4 m; a carriageway of M8 has 4 lanes = 14.6 m (half 7.3)
//   gore nose    exit: first point where the ramp pavement and the pavement of its own carriageway no longer overlap; the run before it must give decel lane + taper (EXIT_NEED)
//                entry: last such point before the ramp joins; the run after it must give accel lane + entry taper (ENTRY_NEED)
//   lane balance exit of a 2-lane ramp needs 4 + 2 - 1 = 5 lanes upstream (one aux lane, the overlapped near lane of the ramp); a 2-lane entry leaves 5 lanes downstream, one is dropped over the lane-drop taper
import { DESIGN } from '../../roads/standards/Criteria';
import { laneBalance, laneDropTaper } from '../../roads/standards/Checks';
import { ENTRY_NEED, EXIT_NEED, LANE_OFF, cOff, type StackRamp } from './StackGeometry';

export const LANES = { ramp: 2, laneW: 3.65, rampShoulder: 0.55, rampHalf: 4.2, through: 4, roadHalf: 7.3 } as const;

export interface Nose { ramp: string; kind: 'exit' | 'entry'; s: number; u: number; v: number; carriageway: string; have: number; need: number; ok: boolean }

/** Distance between a ramp point and the centreline of the carriageway it belongs to, minus both half pavements: < 0 = the two pavements overlap (aux lane). */
function gapTo(road: 'A' | 'B', sgn: 1 | -1, p: { u: number; v: number }): number {
  const t = road === 'A' ? p.u : p.v;
  const c = cOff(t) * sgn;
  const d = road === 'A' ? Math.abs(p.v - c) : Math.abs(p.u + c);
  return d - (LANES.roadHalf + LANES.rampHalf);
}
/** Which carriageway (sign) of `road` a ramp point sits beside: the nearer one. */
function sideOf(road: 'A' | 'B', p: { u: number; v: number }): 1 | -1 {
  const t = road === 'A' ? p.u : p.v;
  const lat = road === 'A' ? p.v : -p.u;
  return Math.abs(lat - cOff(t)) <= Math.abs(lat + cOff(t)) ? 1 : -1;
}

export function gores(ramps: readonly StackRamp[]): Nose[] {
  const out: Nose[] = [];
  for (const r of ramps) {
    const n = r.pts.length;
    const sgnE = sideOf(r.source, r.pts[0]);
    let i = 0;
    while (i < n - 1 && gapTo(r.source, sgnE, r.pts[i]) < 0) i++;
    out.push({ ramp: r.id, kind: 'exit', s: r.cum[i], u: r.pts[i].u, v: r.pts[i].v, carriageway: `${r.source}${sgnE > 0 ? '+' : '-'}`, have: r.cum[i], need: EXIT_NEED, ok: r.cum[i] >= EXIT_NEED });
    const sgnN = sideOf(r.target, r.pts[n - 1]);
    let j = n - 1;
    while (j > 0 && gapTo(r.target, sgnN, r.pts[j]) < 0) j--;
    const have = r.length - r.cum[j];
    out.push({ ramp: r.id, kind: 'entry', s: r.cum[j], u: r.pts[j].u, v: r.pts[j].v, carriageway: `${r.target}${sgnN > 0 ? '+' : '-'}`, have, need: ENTRY_NEED, ok: have >= ENTRY_NEED });
  }
  return out;
}

export interface LaneAudit { upstreamNeed: number; upstreamHave: number; downstreamLanes: number; dropNeed: number; dropHave: number; ok: boolean }
/** Lane balance of the stack: every carriageway has the aux lane for its exits, and room to drop the extra lane after its entries (beyond the nose, up to the end of the model, L). */
export function laneAudit(ramps: readonly StackRamp[], L = 900): LaneAudit {
  const upstreamNeed = laneBalance(LANES.through, LANES.ramp);
  const upstreamHave = LANES.through + 1; // the overlapped near lane of the ramp
  const downstreamLanes = LANES.through + LANES.ramp - 1;
  const dropNeed = laneDropTaper(DESIGN.ringSpeed);
  let dropHave = Infinity;
  for (const r of ramps) {
    const e = r.pts[r.pts.length - 1];
    dropHave = Math.min(dropHave, L - (r.target === 'A' ? Math.abs(e.u) : Math.abs(e.v)));
  }
  return { upstreamNeed, upstreamHave, downstreamLanes, dropNeed, dropHave, ok: upstreamHave >= upstreamNeed && dropHave >= dropNeed };
}
export { LANE_OFF };
