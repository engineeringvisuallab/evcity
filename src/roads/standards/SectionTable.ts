// STEP 1.3  Cross-section tables, distances from the centreline, ONE side. M8 is the handoff table 3.5.
// M6 and M4 use the same element pattern with fewer lanes (and 4 m median for M4): PROPOSAL, confirm in CP1.3.
// Arterial, collector and local tables come in Step 7 (the handoff gives no numbers for them yet).
import { DESIGN } from './Criteria';

export type SectionKind = 'median' | 'shoulder-in' | 'lanes' | 'shoulder-out' | 'barrier' | 'ditch' | 'clear-zone' | 'row-strip';
export interface SectionElement { name: string; kind: SectionKind; from: number; to: number; width: number; note: string }
export interface Section { id: string; lanesPerDir: number; elements: SectionElement[]; pavementEdge: number; rowHalf: number }

/** Element widths that differ between classes (defaults = the M8 handoff table 3.5, V100, lane 3.65 m). */
interface BuildOpts { laneW?: number; shoulderIn?: number; shoulderOut?: number }
function build(id: string, lanesPerDir: number, medianTotal: number, o: BuildOpts = {}): Section {
  const laneW = o.laneW ?? DESIGN.laneWidth;
  const spec: Array<[string, SectionKind, number, string]> = [
    ['median (half of ' + medianTotal + ' m)', 'median', medianTotal / 2, 'kerb or concrete barrier + planting or paved'],
    ['inner paved shoulder', 'shoulder-in', o.shoulderIn ?? 1.5, ''],
    [lanesPerDir + ' travel lanes x ' + laneW + ' m', 'lanes', lanesPerDir * laneW, ''],
    ['outer paved shoulder (breakdown)', 'shoulder-out', o.shoulderOut ?? 3.0, ''],
    ['guardrail / barrier offset', 'barrier', 0.6, ''],
    ['verge + drainage ditch', 'ditch', 1.5, 'ditch 1.5 m wide, 0.5 m deep'],
    ['clear zone', 'clear-zone', 7.8, 'no trees, no poles; side slope 1:4 flat, 1:3 max, 1:2 only with barrier'],
    ['right-of-way strip', 'row-strip', 8.0, 'fence, planting, service road if used'],
  ];
  let at = 0;
  const elements = spec.map(([name, kind, width, note]) => {
    const e = { name, kind, from: at, to: at + width, width, note };
    at += width;
    return e;
  });
  const pave = elements.find((e) => e.kind === 'shoulder-out')!.to;
  return { id, lanesPerDir, elements, pavementEdge: pave, rowHalf: at };
}

export const SECTION_M8 = build('M8', 4, 6);
/** STEP 17.1g-a (user: the 6-lane road looked as wide as the 8-lane one): M6 is a V80 road, so it gets a slimmer section than the V100 M8: lane 3.5 m (V80), median 4 m, inner shoulder 1.0 m, outer shoulder 2.5 m. Pavement edge 16.0 m (was 18.45), whole paved width 32.0 m (M8 44.2 m). */
export const SECTION_M6 = build('M6', 3, 4, { laneW: 3.5, shoulderIn: 1.0, shoulderOut: 2.5 });
export const SECTION_M4 = build('M4', 2, 4);
