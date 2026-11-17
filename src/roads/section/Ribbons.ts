// STEP 4.3  Ribbons of every cross-section element along an alignment (pure, no three.js).
// A ribbon is the strip between two neighbouring offset lines of the cross-section, on one side of the centreline.
// Heights here are RELATIVE to the centreline grade (the vertical profile of Step 3 is added later). The pivot of the rotation is the MEDIAN EDGE.
// Superelevation (4.2): the OUTER carriageway of every curve rotates from the normal crown (adverse, e = -2 %) to +2 %; the inner one keeps its 2 % fall to the curve centre.
import type { Alignment, Sample } from '../alignment/PiAlignment';
import type { Section } from '../standards/SectionTable';

export type RunoutMode = 'inspiral' | 'straights';
export interface TiltParams {
  /** Normal cross fall of the lanes (m/m), 0.02. */
  crown: number;
  /** Full tilt of a rotated carriageway (m/m), 0.02. */
  eFull: number;
  /** Runoff (0 -> eFull) and runout (-crown -> 0) lengths (m). */
  Lr: number;
  Lt: number;
  /** inspiral: runout + runoff both inside the spiral (starts at TS). straights: runout on the tangent before TS, runoff from TS. */
  mode: RunoutMode;
}
export const DEFAULT_TILT: TiltParams = { crown: 0.02, eFull: 0.02, Lr: 45, Lt: 45, mode: 'inspiral' };

const mod = (a: number, m: number): number => ((a % m) + m) % m;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.min(1, Math.max(0, t));

export interface TiltState {
  /** Superelevation of the OUTER carriageway at station s (m/m, + = falls towards the curve centre). -crown on straights. */
  eOuter: number;
  /** Turn sign of the curve whose tilt zone contains s: +1 clockwise on the map, -1 anticlockwise, 0 on a normal straight. */
  turn: number;
  /** Index of that curve (-1 on a normal straight). */
  pi: number;
}

/** Tilt of the outer carriageway at station s (the profile is linear in each ramp). */
export function tiltAt(al: Alignment, s: number, p: TiltParams = DEFAULT_TILT): TiltState {
  const len = al.length;
  const shift = p.mode === 'straights' ? p.Lt : 0;
  for (const r of al.rows) {
    const a0 = r.ts - shift;
    const span = mod(r.st + shift - a0, len);
    const u = mod(s - a0, len);
    if (u > span) continue;
    const turn = r.delta >= 0 ? 1 : -1;
    const w = Math.min(u, span - u); // distance from the nearest end of the zone (symmetric)
    let e: number;
    if (w <= p.Lt) e = lerp(-p.crown, 0, w / p.Lt);
    else if (w <= p.Lt + p.Lr) e = lerp(0, p.eFull, (w - p.Lt) / p.Lr);
    else e = p.eFull;
    return { eOuter: e, turn, pi: r.index };
  }
  return { eOuter: -p.crown, turn: 0, pi: -1 };
}

/** Fall AWAY from the median (m/m, + = down) of the lanes on side sigma (+1 = left normal side, -1 = the other), at one station. */
export function laneFall(t: TiltState, sigma: number, crown: number): number {
  if (t.turn === 0) return crown;
  const inner = sigma === t.turn; // the centre of curvature lies on the +normal side when the turn is clockwise
  return inner ? crown : -t.eOuter; // outer: falls away from the median when e = -crown, towards it when e > 0
}

export interface RibbonSet {
  /** Offsets of the ribbon edges (m from the centreline), same for every station. */
  offsets: number[];
  /** Name of the ribbon between offsets[j] and offsets[j+1]. */
  names: string[];
  stations: number[];
  /** pos[side][station][offsetIndex] = [x, y(relative height), z]. side 0 = sigma +1, side 1 = sigma -1. */
  pos: Array<Array<Float64Array>>;
  /** Lane fall (away from the median, m/m) per side and station. */
  fall: Float64Array[];
}

/** Heights (relative to the median edge) at the section offsets, for one side, given the lane fall g. */
function heightsFor(sec: Section, offsets: number[], g: number): number[] {
  const h: number[] = [0];
  const slopeOf = (kind: string, d0: number, d1: number): number => {
    switch (kind) {
      case 'median': return 0;
      case 'shoulder-in': case 'shoulder-out': return g + 0.02; // shoulder 2 % steeper than the lane (4 % in the normal section)
      case 'lanes': return g;
      case 'barrier': return 0;
      case 'ditch': return d0 < (22.7 + 24.2) / 2 - 1e-9 ? 0.5 / (0.5 * 1.5) : -0.5 / (0.5 * 1.5); // V ditch, 0.5 m deep
      case 'clear-zone': return 0.25; // 1:4 down and away
      default: return 0 * (d1 - d0);
    }
  };
  for (let j = 0; j + 1 < offsets.length; j++) {
    const d0 = offsets[j], d1 = offsets[j + 1];
    const mid = (d0 + d1) / 2;
    const el = sec.elements.find((e) => mid > e.from && mid < e.to)!;
    h.push(h[j] - slopeOf(el.kind, d0, d1) * (d1 - d0));
  }
  return h;
}

/** Build all ribbons for the stations in `samples`. The ditch is split in two so it has a bottom (V shape). */
export function buildRibbons(al: Alignment, samples: Sample[], sec: Section, p: TiltParams = DEFAULT_TILT): RibbonSet {
  const offsets: number[] = [];
  const names: string[] = [];
  for (const e of sec.elements) {
    if (offsets.length === 0) offsets.push(e.from);
    if (e.kind === 'ditch') { offsets.push((e.from + e.to) / 2, e.to); names.push(e.name + ' (outer slope)', e.name + ' (inner slope)'); }
    else { offsets.push(e.to); names.push(e.name); }
  }
  // a ditch of 1.5 m: slopes down from the pavement side, up to the field side
  const pos: Array<Array<Float64Array>> = [[], []];
  const fall = [new Float64Array(samples.length), new Float64Array(samples.length)];
  const stations: number[] = [];
  samples.forEach((sm, i) => {
    stations.push(sm.s);
    const t = tiltAt(al, sm.s, p);
    const nx = -Math.sin(sm.h), nz = Math.cos(sm.h);
    [1, -1].forEach((sigma, side) => {
      const g = laneFall(t, sigma, p.crown);
      fall[side][i] = g;
      const hh = heightsFor(sec, offsets, g);
      const a = new Float64Array(offsets.length * 3);
      offsets.forEach((d, j) => { a[3 * j] = sm.x + sigma * d * nx; a[3 * j + 1] = hh[j]; a[3 * j + 2] = sm.z + sigma * d * nz; });
      pos[side].push(a);
    });
  });
  return { offsets, names, stations, pos, fall };
}
