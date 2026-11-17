// INTERCHANGE FOUNDATION: the checks. They run on every build, so a bad pattern / parameter shows up as an Issue (and in the headless test), not as a car in the air.
//   radius      the bend is tight enough for the design speed: R >= V^2 / (127 * (e + f)), e = 0.06 (superelevation), f = 0.15 (side friction)
//   grade       a ramp never climbs / falls more steeply than rampMaxGrade
//   gap         two ramps (away from their own ends) stay minGap m apart
//   clearance   where two roads / ramps cross in plan, one is at least clearance + deckThickness above the other
//   join        the ramp meets its road tangentially, in the lane of the right travel direction (left-hand traffic), at the kerb lane offset

import { crossings, headings, minPathDistance, minRadius, type P2 } from './Geometry2D';
import type { InterchangeParams, Issue, LevelPlan, Ramp, RoadSection } from './InterchangeTypes';
import { yOf } from './Levels';

const E_PLUS_F = 0.21;
const MIN_CLEARANCE = 4.6; // m, road over road
const CD_ZONE = 120; // m: a ramp that leaves / joins a C-D road runs beside it for this long (diverge / merge)
const JOIN_ZONE = 45; // m at both ends of a ramp that are exempt from the gap check (the ramp is next to its own road / pad there)

export const minRadiusFor = (kmh: number): number => (kmh * kmh) / (127 * E_PLUS_F);

const wrapPi = (a: number): number => {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
};

/** Heading the traffic has on the kerb lane of a road at the (u, v) position of a join (left-hand traffic). */
function laneHeading(road: 'main' | 'cross', u: number, v: number): number {
  if (road === 'main') return v > 0 ? 0 : Math.PI;
  return u < 0 ? Math.PI / 2 : -Math.PI / 2;
}

export function validate(ramps: readonly Ramp[], main: RoadSection, cross: RoadSection, P: InterchangeParams, L: LevelPlan): Issue[] {
  const issues: Issue[] = [];
  const push = (level: Issue['level'], code: string, message: string): void => {
    issues.push({ level, code, message });
  };
  const need = P.clearance + P.deckThickness - 0.01;
  if (P.clearance < MIN_CLEARANCE) push('error', 'clearance-min', `clearance ${P.clearance} m is below the minimum ${MIN_CLEARANCE} m between the lower road and the deck`);
  if (L.rise < P.clearance + P.deckThickness - 0.01) push('error', 'clearance-min', 'the level plan is lower than clearance + deck thickness');

  const cdRamp = ramps.find((q) => q.id.endsWith('-cd'));
  const cdOff = cdRamp ? Math.abs(cdRamp.local[Math.floor(cdRamp.local.length / 2)].v) : null;
  for (const r of ramps) {
    // radius
    const R = minRadius(r.local);
    const Rneed = minRadiusFor(r.designKmh);
    if (R < Rneed * 0.8) push('error', 'radius', `${r.id}: radius ${R.toFixed(0)} m is far below ${Rneed.toFixed(0)} m needed for ${r.designKmh} km/h`);
    else if (R < Rneed * 0.97) push('warn', 'radius', `${r.id}: radius ${R.toFixed(0)} m is a little below ${Rneed.toFixed(0)} m needed for ${r.designKmh} km/h`);
    // grade
    let gmax = 0;
    for (let i = 1; i < r.ys.length; i++) gmax = Math.max(gmax, Math.abs(r.ys[i] - r.ys[i - 1]) / Math.max(0.01, r.cum[i] - r.cum[i - 1]));
    if (gmax > P.rampMaxGrade * 1.001) push('error', 'grade', `${r.id}: grade ${(gmax * 100).toFixed(1)} % is above ${(P.rampMaxGrade * 100).toFixed(1)} %`);
    // joins
    const h = headings(r.local);
    for (const [name, j, idx] of [['from', r.from, 0] as const, ['to', r.to, r.local.length - 1] as const]) {
      if (j.kind === 'terminal') continue;
      const want = laneHeading(j.road, j.u, j.v);
      const sec = j.road === 'main' ? main : cross;
      const off = j.road === 'main' ? Math.abs(j.v) : Math.abs(j.u);
      const dh = Math.abs(wrapPi(h[idx] - want));
      if (dh > (7 * Math.PI) / 180) push('error', 'join-heading', `${r.id}: ${name} joins the ${j.road} road ${((dh * 180) / Math.PI).toFixed(0)} deg off the lane direction (wrong side / wrong direction?)`);
      // with collector-distributor roads the slips / loops join the C-D lane (the middle of the '-cd' ramp), not the main kerb lane
      const onCd = j.road === 'main' && cdOff !== null && Math.abs(off - cdOff) <= 0.5;
      if (!onCd && Math.abs(off - sec.kerbLane) > 0.5) push('error', 'join-lane', `${r.id}: ${name} is ${off.toFixed(1)} m from the ${j.road} centreline, the kerb lane is at ${sec.kerbLane.toFixed(1)} m`);
    }
  }

  // gap between ramps
  for (let a = 0; a < ramps.length; a++) {
    for (let b = a + 1; b < ramps.length; b++) {
      const A = ramps[a];
      const B = ramps[b];
      // a ramp that leaves / joins a C-D road runs close beside it near its own ends: that stretch is the diverge / merge, not a gap
      const cdPair = A.id.endsWith('-cd') !== B.id.endsWith('-cd');
      const zA = A.id.endsWith('-cd') ? 0 : cdPair ? CD_ZONE : JOIN_ZONE;
      const zB = B.id.endsWith('-cd') ? 0 : cdPair ? CD_ZONE : JOIN_ZONE;
      const near = (X: Ramp, Y: Ramp, i: number): boolean => Math.min(Math.hypot(X.local[i].u - Y.local[0].u, X.local[i].v - Y.local[0].v), Math.hypot(X.local[i].u - Y.local[Y.local.length - 1].u, X.local[i].v - Y.local[Y.local.length - 1].v)) < CD_ZONE;
      const d = minPathDistance(
        A.local,
        B.local,
        (i) => A.cum[i] < Math.max(JOIN_ZONE, zA) || A.length - A.cum[i] < Math.max(JOIN_ZONE, zA) || (cdPair && A.id.endsWith('-cd') && near(A, B, i)),
        (j) => B.cum[j] < Math.max(JOIN_ZONE, zB) || B.length - B.cum[j] < Math.max(JOIN_ZONE, zB) || (cdPair && B.id.endsWith('-cd') && near(B, A, j)),
      );
      if (d < P.minGap) push('error', 'gap', `${A.id} and ${B.id} come within ${d.toFixed(1)} m of each other (minimum ${P.minGap} m)`);
    }
  }

  // plan crossings: ramp x ramp and ramp x the two road centrelines
  const EXT = 700;

  const mainLine: P2[] = [{ u: -EXT, v: 0 }, { u: EXT, v: 0 }];
  const crossLine: P2[] = [{ u: 0, v: -EXT }, { u: 0, v: EXT }];
  const heightAt = (r: Ramp, f: number): number => {
    const i = Math.max(0, Math.min(r.ys.length - 2, Math.floor(f)));
    return r.ys[i] + (r.ys[i + 1] - r.ys[i]) * (f - i);
  };
  for (const r of ramps) {
    for (const [side, line] of [['main', mainLine] as const, ['cross', crossLine] as const]) {
      for (const c of crossings(r.local, line)) {
        const yr = heightAt(r, c.ia);
        const yl = yOf(L, side, side === 'main' ? c.u : c.v);
        if (Math.abs(yr - yl) < need) push('error', 'clearance', `${r.id} crosses the ${side} road at (${c.u.toFixed(0)}, ${c.v.toFixed(0)}) only ${Math.abs(yr - yl).toFixed(1)} m above / below it`);
      }
    }
  }
  for (let a = 0; a < ramps.length; a++) {
    for (let b = a + 1; b < ramps.length; b++) {
      for (const c of crossings(ramps[a].local, ramps[b].local)) {
        const atEnd = (r: Ramp, f: number): boolean => r.cum[Math.max(0, Math.min(r.cum.length - 1, Math.round(f)))] < JOIN_ZONE || r.length - r.cum[Math.max(0, Math.min(r.cum.length - 1, Math.round(f)))] < JOIN_ZONE;
        if (atEnd(ramps[a], c.ia) || atEnd(ramps[b], c.ib)) continue; // a ramp that starts / ends on the other one is a junction, not a crossing
        const dy = Math.abs(heightAt(ramps[a], c.ia) - heightAt(ramps[b], c.ib));
        if (dy < need) push('error', 'clearance', `${ramps[a].id} crosses ${ramps[b].id} at (${c.u.toFixed(0)}, ${c.v.toFixed(0)}) only ${dy.toFixed(1)} m apart in height`);
      }
    }
  }
  return issues;
}
