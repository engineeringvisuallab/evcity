// STEP 5.1: the ring as ONE game road. Pure data (no three.js, no RoadNetwork): the closed alignment (Step 2) sampled every ~8 m,
// the finished height of every sample (Step 3 grade line) and the M8 cross-section (Step 4.1) in the field names of RoadSpec.
// RoadNetwork.layoutRing() feeds this to addRoad(); scripts/ring-facade-check.ts tests the result.
import { buildAlignment, sampleAlignment } from '../alignment/PiAlignment';
import { RING_PIS, RING_DESIGN_SPEED } from '../alignment/RingAlignment';
import { SECTION_M8, type Section } from '../standards/SectionTable';
import { makeRingProfile } from './RingProfile';

/** The cross-section in RoadSpec words (metres from the centreline). halfWidth = centreline -> pavement edge, INCLUDING the median, like every divided road. */
export interface RingSectionFields {
  halfWidth: number;
  medianHalf: number;
  /** Paved inner shoulder between the median and the first lane. */
  shyMedian: number;
  laneW: number;
  lanesPerDir: number;
  /** Paved outer shoulder (breakdown lane) between the kerb-side lane and the pavement edge. */
  shyOuter: number;
  /** Width outside the pavement edge that belongs to the road (guardrail offset); the verge, ditch and clear zone are Step 5.2. */
  shoulder: number;
}

export function sectionFields(sec: Section): RingSectionFields {
  const w = (kind: string): number => sec.elements.find((e) => e.kind === kind)?.width ?? 0;
  const lanes = sec.elements.find((e) => e.kind === 'lanes');
  const lanesPerDir = sec.lanesPerDir;
  return {
    halfWidth: sec.pavementEdge,
    medianHalf: w('median'),
    shyMedian: w('shoulder-in'),
    laneW: lanes ? lanes.width / lanesPerDir : 0,
    lanesPerDir,
    shyOuter: w('shoulder-out'),
    shoulder: w('barrier'),
  };
}

export interface RingPlan {
  /** Centreline points (x, z), closed loop: the last point is NOT the first; the closing segment runs from the last to the first. */
  pts: number[][];
  /** Finished surface height (m) of every point. */
  ys: number[];
  /** Station (m along the alignment, from the alignment start) of every point. */
  stations: number[];
  /** Alignment length = length of the closed loop (m). */
  length: number;
  /** Real distance between neighbouring points (m), about `step`. */
  step: number;
  section: RingSectionFields;
  designKmh: number;
}

export function planRing(step = 8): RingPlan {
  const al = buildAlignment([...RING_PIS]);
  const { ds, samples } = sampleAlignment(al, step);
  const prof = makeRingProfile(al.length);
  return {
    pts: samples.map((p) => [p.x, p.z]),
    ys: samples.map((p) => prof.yAt(p.s)),
    stations: samples.map((p) => p.s),
    length: al.length,
    step: ds,
    section: sectionFields(SECTION_M8),
    designKmh: RING_DESIGN_SPEED,
  };
}
