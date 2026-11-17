// STEP 21.5  Cross-sections of the classes of the key-3 network (R6, R4, R2, C, L). PURE DATA, no three.js, nothing imports it yet (the game build 21.6 will).
// Distances from the centreline, ONE side (drive side LEFT), metres. R6 is the M6 section that is already built (SECTION_M6, V80). All other numbers are MY choices from the handoff
// class table (section 7) and 3.4 / 3.5; the user may change them, they are all here. Two variants where the road runs both in open country and inside a zone:
//   OPEN = no kerb, paved + earth shoulder, open ditch, clear zone (outside housing / commercial zones)
//   ZONE = kerb, footpath (light block), verge with the drain (gully / kerb inlet), no ditch (inside housing / commercial zones, decided by zone use in 21.6, R8)
import { SECTION_M6 } from './SectionTable';

export type ClassKind = 'median' | 'shoulder-in' | 'lanes' | 'shoulder-out' | 'earth-shoulder' | 'kerb' | 'footpath' | 'verge-drain' | 'barrier' | 'ditch' | 'clear-zone' | 'row-strip';
export interface ClassElement { name: string; kind: ClassKind; width: number; note?: string }
export interface ClassSection {
  id: string;            // R6, R4-OPEN, R4-ZONE, R2-OPEN, R2-ZONE, C-ZONE, L-ZONE
  cls: 'R6' | 'R4' | 'R2' | 'C' | 'L';
  variant: 'OPEN' | 'ZONE';
  roadClass: string;     // handoff class it follows
  speed: number;         // design speed km/h (21.3 choice)
  lanesPerDir: number;
  laneW: number;
  median: number;        // total median width, 0 = none
  elements: ClassElement[];   // outward from the centreline (median half first when there is a median)
  pavementEdge: number;  // from the centreline to the outer edge of the paved shoulder / kerb face
  formationHalf: number; // to the outer edge of the ditch / back of the verge = width the earthwork has to carry
  rowHalf: number;       // right-of-way half width
  pavement: number;      // pavement structure thickness (m), the excavation below the finished surface
  crossFall: number;     // m/m, each carriageway falls away from the centre / median
  drain: { kind: 'open ditch' | 'kerb + gully'; ditchW?: number; ditchD?: number; minGrade: number; outletMax: number; gullyEvery?: number; liningAbove?: number };
}

const el = (name: string, kind: ClassKind, width: number, note = ''): ClassElement => ({ name, kind, width, note });
const total = (e: ClassElement[]): number => e.reduce((a, q) => a + q.width, 0);
const upTo = (e: ClassElement[], kind: ClassKind): number => { let a = 0; for (const q of e) { a += q.width; if (q.kind === kind) return a; } return a; };
function make(p: Omit<ClassSection, 'pavementEdge' | 'formationHalf' | 'rowHalf'> & { edgeKind: ClassKind; formKind: ClassKind }): ClassSection {
  const { edgeKind, formKind, ...rest } = p; return { ...rest, pavementEdge: upTo(p.elements, edgeKind), formationHalf: upTo(p.elements, formKind), rowHalf: total(p.elements) };
}

/** R6 = the built M6 section (V80): lane 3.5, median 4.0, shoulders 1.0 / 2.5, barrier, ditch, clear zone, ROW strip. No footpath (motorway class; walkers use the parallel service road). */
export const CLASS_R6: ClassSection = {
  id: 'R6', cls: 'R6', variant: 'OPEN', roadClass: 'M6 (V80)', speed: 80, lanesPerDir: 3, laneW: 3.5, median: 4.0,
  elements: SECTION_M6.elements.map((q) => ({ name: q.name, kind: q.kind as ClassKind, width: q.width, note: q.note })),
  pavementEdge: SECTION_M6.pavementEdge, formationHalf: SECTION_M6.elements.filter((q) => q.kind !== 'clear-zone' && q.kind !== 'row-strip').reduce((a, q) => a + q.width, 0), rowHalf: SECTION_M6.rowHalf,
  pavement: 0.70, crossFall: 0.02, drain: { kind: 'open ditch', ditchW: 1.5, ditchD: 0.5, minGrade: 0.003, outletMax: 150, liningAbove: 0.04 },
};

export const CLASS_R4_OPEN: ClassSection = make({
  id: 'R4-OPEN', cls: 'R4', variant: 'OPEN', roadClass: 'A-D divided arterial, rural (V60)', speed: 60, lanesPerDir: 2, laneW: 3.5, median: 4.0, pavement: 0.60, crossFall: 0.02,
  elements: [el('median (half of 4.0 m)', 'median', 2.0, 'kerbed island: 0.5 m kerb strip + 1.5 m soil with the game grass and flowers'), el('inner paved shoulder', 'shoulder-in', 0.5), el('2 travel lanes x 3.5 m', 'lanes', 7.0), el('outer paved shoulder', 'shoulder-out', 2.0, '1.5 m clear + 0.5 m edge'),
    el('open ditch', 'ditch', 1.5, 'ditch 1.5 m wide, 0.5 m deep'), el('clear zone (V60)', 'clear-zone', 4.5, 'no trees, no poles; side slope 1:4 flat, 1:3 max'), el('right-of-way strip', 'row-strip', 3.0, 'fence')],
  edgeKind: 'shoulder-out', formKind: 'ditch', drain: { kind: 'open ditch', ditchW: 1.5, ditchD: 0.5, minGrade: 0.003, outletMax: 120, liningAbove: 0.04 },
});
export const CLASS_R4_ZONE: ClassSection = make({
  id: 'R4-ZONE', cls: 'R4', variant: 'ZONE', roadClass: 'A-D divided arterial, urban (V60)', speed: 60, lanesPerDir: 2, laneW: 3.5, median: 4.0, pavement: 0.60, crossFall: 0.02,
  elements: [el('median (half of 4.0 m)', 'median', 2.0, 'kerbed island, soil + grass + flowers'), el('inner shy', 'shoulder-in', 0.5), el('2 travel lanes x 3.5 m', 'lanes', 7.0), el('outer kerb + shy', 'kerb', 0.5),
    el('footpath (light block)', 'footpath', 2.5, 'walk / cycle'), el('verge + drain strip', 'verge-drain', 1.5, 'kerb inlets, trees, poles'), el('right-of-way margin', 'row-strip', 0.5)],
  edgeKind: 'kerb', formKind: 'verge-drain', drain: { kind: 'kerb + gully', minGrade: 0.003, outletMax: 120, gullyEvery: 25 },
});
export const CLASS_R2_OPEN: ClassSection = make({
  id: 'R2-OPEN', cls: 'R2', variant: 'OPEN', roadClass: 'rural paved road / sub-arterial (V40)', speed: 40, lanesPerDir: 1, laneW: 3.5, median: 0, pavement: 0.45, crossFall: 0.02,
  elements: [el('1 travel lane x 3.5 m', 'lanes', 3.5, 'crown on the centreline'), el('paved shoulder', 'shoulder-out', 1.0), el('earth shoulder', 'earth-shoulder', 0.5, 'slope 4 %'), el('open ditch', 'ditch', 1.2, 'ditch 1.2 m wide, 0.4 m deep'),
    el('clear zone (V40)', 'clear-zone', 3.0, 'side slope 1:3'), el('right-of-way strip', 'row-strip', 2.0)],
  edgeKind: 'shoulder-out', formKind: 'ditch', drain: { kind: 'open ditch', ditchW: 1.2, ditchD: 0.4, minGrade: 0.003, outletMax: 100, liningAbove: 0.05 },
});
export const CLASS_R2_ZONE: ClassSection = make({
  id: 'R2-ZONE', cls: 'R2', variant: 'ZONE', roadClass: 'sub-arterial / collector, kerbed (V40)', speed: 40, lanesPerDir: 1, laneW: 3.5, median: 0, pavement: 0.45, crossFall: 0.02,
  elements: [el('1 travel lane x 3.5 m', 'lanes', 3.5, 'crown on the centreline'), el('kerb + shy', 'kerb', 0.5), el('footpath (light block)', 'footpath', 2.0), el('verge + drain strip', 'verge-drain', 1.0, 'kerb inlets, trees'), el('right-of-way margin', 'row-strip', 0.5)],
  edgeKind: 'kerb', formKind: 'verge-drain', drain: { kind: 'kerb + gully', minGrade: 0.003, outletMax: 100, gullyEvery: 25 },
});
export const CLASS_C_ZONE: ClassSection = make({
  id: 'C-ZONE', cls: 'C', variant: 'ZONE', roadClass: 'C collector street (V40)', speed: 40, lanesPerDir: 1, laneW: 3.3, median: 0, pavement: 0.40, crossFall: 0.02,
  elements: [el('1 travel lane x 3.3 m', 'lanes', 3.3, 'crown on the centreline; a 2.0 m parking bay is added where the zone asks for one (21.6)'), el('kerb + gutter', 'kerb', 0.3), el('footpath (light block)', 'footpath', 1.8), el('verge + drain strip', 'verge-drain', 1.0), el('right-of-way margin', 'row-strip', 0.3)],
  edgeKind: 'kerb', formKind: 'verge-drain', drain: { kind: 'kerb + gully', minGrade: 0.003, outletMax: 80, gullyEvery: 25 },
});
export const CLASS_L_ZONE: ClassSection = make({
  id: 'L-ZONE', cls: 'L', variant: 'ZONE', roadClass: 'L local street (V30)', speed: 30, lanesPerDir: 1, laneW: 2.75, median: 0, pavement: 0.35, crossFall: 0.02,
  elements: [el('1 travel lane x 2.75 m', 'lanes', 2.75, 'no lane line; crown on the centreline'), el('kerb + gutter', 'kerb', 0.2), el('footpath (light block)', 'footpath', 1.5), el('verge + drain strip', 'verge-drain', 0.6), el('right-of-way margin', 'row-strip', 0.2)],
  edgeKind: 'kerb', formKind: 'verge-drain', drain: { kind: 'kerb + gully', minGrade: 0.003, outletMax: 60, gullyEvery: 20 },
});

export const CLASS_SECTIONS: readonly ClassSection[] = [CLASS_R6, CLASS_R4_OPEN, CLASS_R4_ZONE, CLASS_R2_OPEN, CLASS_R2_ZONE, CLASS_C_ZONE, CLASS_L_ZONE];
/** Section used for the earthwork volumes of 21.5 (the variant that covers most of the length of the class); the zone variant is chosen by zone use in 21.6. */
export const SECTION_FOR_VOLUME: Record<string, ClassSection> = { '6': CLASS_R6, '4': CLASS_R4_OPEN, '2': CLASS_R2_OPEN, C: CLASS_C_ZONE, L: CLASS_L_ZONE };