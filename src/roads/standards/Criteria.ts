// STEP 1.1  Project design criteria (pure, no three.js). One place for every design number of the new road work.
// The kinematic formulas and the friction table stay in src/interchange/Standards.ts (CRITERIA); this file adds the road-level numbers
// and re-exports the same CRITERIA object so the whole project uses ONE criteria set (rule D2).
import { CRITERIA, frictionAt, minRadius, stoppingSight, speedChangeLength } from '../../interchange/Standards';
export { CRITERIA, frictionAt, minRadius, stoppingSight, speedChangeLength };

export const DESIGN = {
  /** Driving side (D1): Bangladesh drives on the LEFT. */
  driveSide: 'left' as 'left' | 'right',
  laneWidth: 3.65,
  /** Normal crown / cross fall of a carriageway and of a shoulder (m/m). */
  crown: 0.02,
  shoulderSlope: 0.04,
  /** Comfort rate of lateral acceleration change for spirals (m/s3), range 0.5-0.8. */
  comfortC: 0.6,
  /** A motorway curve must use R >= radiusMargin x the minimum radius of its speed. */
  radiusMargin: 1.5,
  /** Ring road design speed (km/h) and the speed used for the first M8. */
  ringSpeed: 100,
  /** Heading-rate kink limit (degrees between two neighbouring samples, second difference, see Checks.smoothness). */
  kinkMaxDeg: 0.1,
  /** Closed-loop tolerance at the join (proposal, confirm in CP2.2). */
  closure: { position: 0.01, headingDeg: 0.01, curvature: 1e-6 },
  /** Lane sizing, section 3.13: design-hour factor and directional split. */
  K: 0.1,
  D: 0.6,
  /** Capacity per lane (pcu/h/lane) by class family. */
  capacity: { motorway: 1800, expressway: 1600, arterialDivided: 950, arterialUndivided: 800, collector: 600, local: 300 },
  /** Max grades (m/m), section 3.3. */
  maxGrade: { motorway: 0.04, motorwayDesirable: 0.03, arterial: 0.06, collector: 0.08, local: 0.1, ramp: 0.05, earth: 0.12, minDrainage: 0.003 },
  /** Vertical curve sight heights (m): eye and object. */
  eyeHeight: 1.08,
  objectHeight: 0.6,
  /** Taper slopes (1:n) for exit and entry lanes. */
  exitTaper: 25,
  entryTaper: 50,
  /** Terrain limits (m), section 3.7 and decision D4. */
  maxCut: 12,
  maxFill: 7,
  cutSlope: 2, // 1:2
  fillSlope: 3, // 1:3
  bridgeClearance: 5.5,
  railClearance: 6.5,
} as const;
