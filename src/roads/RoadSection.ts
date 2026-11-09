// ROADS STEP 1: the road CROSS-SECTION, in one place. No three.js, no DOM: the numbers can be tested headless
// (scripts/road-section-check.ts). All the numbers come from Config.city.roadSections.
//
// Meaning of the numbers (metres, measured from the road centreline):
//   halfWidth  = centreline -> kerb face. For a DIVIDED road this INCLUDES the median (so the ribbon, the terrain cut, the junction pads,
//                the bridges and the buildings keep working with one number, as before).
//   medianHalf = centreline -> the outer face of the median kerb (0 = no median).
//   lane k (k = 0 is the kerb lane, the one traffic drives in) has its centre at laneCentre(r, k).
import { Config } from '../core/Config';

export type SectionId = 'highway' | 'arterial' | 'avenue';

export interface DividedSection {
  id: SectionId;
  lanesPerDir: number;
  laneW: number;
  shyMedian: number;
  shyOuter: number;
  /** Clear planting width between the two median kerbs, kerb width of each, and half of the whole median (clear + 2 kerbs). */
  medianClear: number;
  medianKerb: number;
  medianHalf: number;
  /** Centreline -> kerb face (asphalt + median). */
  halfWidth: number;
  designKmh: number;
}

/** What a road needs to know about its cross-section (RoadSpec has all of these). */
export interface SectionFields {
  halfWidth: number;
  lanes: number;
  medianHalf: number;
  laneW: number;
  shyOuter: number;
}

function build(id: SectionId): DividedSection {
  const c = Config.city.roadSections[id];
  const medianHalf = (c.medianClear + 2 * c.medianKerb) / 2;
  return {
    id,
    lanesPerDir: c.lanesPerDir,
    laneW: c.laneW,
    shyMedian: c.shyMedian,
    shyOuter: c.shyOuter,
    medianClear: c.medianClear,
    medianKerb: c.medianKerb,
    medianHalf,
    halfWidth: medianHalf + c.shyMedian + c.lanesPerDir * c.laneW + c.shyOuter,
    designKmh: c.designKmh,
  };
}

export const DIVIDED_SECTIONS: readonly DividedSection[] = [build('highway'), build('arterial'), build('avenue')];

/**
 * Which divided section a road gets, or null (undivided: collector, local, earth, roundabout).
 * highway = every highway; arterial = every arterial; avenue = a city street that had 4 or more lanes (downtown).
 */
export function sectionFor(kind: string, tier: number, oldLanes: number, earth: boolean | undefined): DividedSection | null {
  if (earth) return null;
  if (kind === 'highway') return DIVIDED_SECTIONS[0];
  if (kind === 'arterial') return DIVIDED_SECTIONS[1];
  if (kind === 'local' && tier === 4 && oldLanes >= 4) return DIVIDED_SECTIONS[2];
  return null;
}

export function isDivided(r: { medianHalf: number }): boolean {
  return r.medianHalf > 0;
}

/** Number of lanes in one direction. */
export function lanesPerDir(r: { lanes: number }): number {
  return Math.max(1, Math.round(Math.max(2, r.lanes) / 2));
}

/** Width of one lane. Undivided roads keep the old rule (the whole half width is shared by the lanes of one direction). */
export function laneWidth(r: SectionFields): number {
  return isDivided(r) ? r.laneW : r.halfWidth / lanesPerDir(r);
}

/** Centre of lane k (0 = kerb lane) from the centreline. Undivided roads keep the old formula for lane 0: halfWidth x (1 - 1 / lanes). */
export function laneCentre(r: SectionFields, k = 0): number {
  if (!isDivided(r)) return r.halfWidth * (1 - 1 / Math.max(2, r.lanes)) - k * laneWidth(r);
  return r.halfWidth - r.shyOuter - r.laneW * (k + 0.5);
}

/** Sideways step to the next lane towards the median (the overtaking shift). */
export function passShift(r: SectionFields): number {
  return isDivided(r) ? r.laneW : (2 * r.halfWidth) / Math.max(2, r.lanes);
}

/** Width of the carriageway of ONE direction (kerb to median kerb, or kerb to centreline when undivided). */
export function carriagewayWidth(r: SectionFields): number {
  return r.halfWidth - r.medianHalf;
}

/** Traffic of the two directions is physically separated (a median): no oncoming car in the passing lane. */
export function isDual(r: SectionFields & { kind: string }): boolean {
  return isDivided(r) || (r.kind === 'highway' && r.lanes >= 4);
}
