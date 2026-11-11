// EVLab Tower step 1.1b: the rest of the structure (pure data, no three.js). Building-local frame as in EVLabLayout (x east, z south, y up).
//  1. PODIUM: every tower column of level 1 continues down to the ground through the lobby. Columns that would stand in a hall ramp
//     are carried by a deep TRANSFER GIRDER hidden in the podium roof zone (y 16.3 .. 19) and land on the neighbouring columns.
//  2. HALL ROOF: column-free 70.5 m span (z) -> steel Warren trusses every 9 m (box chords), bottom chord just below the hall ceiling.
//  3. MECHANICAL FLOORS (21, 41, 60, 70): outrigger trusses from the core blocks to the end columns (z = tower centre line) + a belt truss round the facade.
// Sizing is a preliminary engineering estimate (see EVLAB_STRUCTURE_ASSESSMENT.md), good enough to draw believable members, not a design.
import { BLD, DIVIDER, HALL, type Solid } from './EVLabLayout';
import { COL_CAP, CORES, STRUCT, T, ceilY, colLoad, columnsOf, levelY, ringOf, type Col, type ColKind } from './EVLabTowerLayout';

const up05 = (v: number): number => Math.ceil(v * 20 - 1e-9) / 20;
const same = (a: number, b: number): boolean => Math.abs(a - b) < 0.05;

// ---------------------------------------------------------------- 1. podium columns + transfer girders
export const PODIUM = {
  /** Underside of the lobby ceiling and the podium roof (= level 1 floor). */
  ceil: BLD.H, top: levelY(1),
  /** Transfer girders: bottom face, width. They are as deep as the podium roof zone allows (the slab is part of the girder). */
  girderBottom: 16.3, girderW: 1.4,
  /** Clear margin kept round the hall ramps. */
  margin: 0.8,
} as const;

/** The hall ramps climb from the lobby: x ranges of the openings, z from DIVIDER.z to RAMP.z1 (27). A column inside that box would stand in a ramp. */
const RAMP_Z1 = 27;
const inRamp = (c: Col): boolean =>
  DIVIDER.openings.some(([a, b]) => c.x + c.s / 2 > a - PODIUM.margin && c.x - c.s / 2 < b + PODIUM.margin) && c.z - c.s / 2 < RAMP_Z1 + PODIUM.margin;
/** Tower columns of level 1 that cannot go straight to the ground (they would stand in a hall ramp): they are transferred. */
export const isTransferred = (c: Col): boolean => inRamp(c);

export interface Girder { x0: number; x1: number; z: number; load: number; carries: Col; supports: [Col, Col] }
export interface PodiumCol { x: number; z: number; s: number; kind: ColKind; /** factored axial load at the foot (kN) */ load: number }
export interface Podium { cols: PodiumCol[]; girders: Girder[] }

/** Load of one more floor (the podium roof slab itself) on a column of that kind. */
const roofExtra = (kind: ColKind): number => STRUCT.qu * STRUCT.bay * (kind === 'interior' ? ringOf(1).hz : ringOf(1).hz / 2);
/** Load that a level-1 column delivers to its foot (its own tributary load of all floors above + the podium roof slab). */
const ownLoad = (c: Col): number => colLoad(1, c.kind) + roofExtra(c.kind);

let podiumCache: Podium | null = null;
export function podium(): Podium {
  if (podiumCache) return podiumCache;
  const all = columnsOf(1);
  const keep = all.filter((c) => !isTransferred(c));
  const girders: Girder[] = [];
  const extra = new Map<Col, number>();
  for (const c of all.filter(isTransferred)) {
    const line = keep.filter((k) => same(k.z, c.z));
    const l = line.filter((k) => k.x < c.x).sort((a, b) => b.x - a.x)[0], r = line.filter((k) => k.x > c.x).sort((a, b) => a.x - b.x)[0];
    if (!l || !r) continue; // never happens with this plan (the test checks it)
    const P = ownLoad(c), t = (r.x - c.x) / (r.x - l.x); // the girder is loaded by the column at c: the reactions follow the lever rule
    girders.push({ x0: l.x, x1: r.x, z: c.z, load: P, carries: c, supports: [l, r] });
    extra.set(l, (extra.get(l) ?? 0) + P * t);
    extra.set(r, (extra.get(r) ?? 0) + P * (1 - t));
  }
  const cols = keep.map((c): PodiumCol => {
    const load = ownLoad(c) + (extra.get(c) ?? 0);
    const need = Math.sqrt(load / COL_CAP);
    return { x: c.x, z: c.z, s: Math.max(c.s, Math.min(STRUCT.maxSide, up05(need))), kind: c.kind, load };
  });
  // the end columns of the centre line exist twice in the frame (perimeter + interior at the same spot): one column, the bigger section
  const merged: PodiumCol[] = [];
  for (const c of cols) {
    const i = merged.findIndex((m) => same(m.x, c.x) && same(m.z, c.z));
    if (i < 0) merged.push(c);
    else if (c.s > merged[i].s) merged[i] = c;
  }
  podiumCache = { cols: merged, girders };
  return podiumCache;
}
/** Does the (unclamped) section need more than the biggest allowed column? (reported by the test) */
export const podiumNeed = (load: number): number => Math.sqrt(load / COL_CAP);

/** Required flange area (m2) of a transfer girder: M = P L / 4, lever arm = depth - 0.3 m, phi 0.9, S460 steel. */
export function girderFlange(g: Girder): number {
  const L = g.x1 - g.x0, D = PODIUM.top - PODIUM.girderBottom;
  return ((g.load * L) / 4 / (D - 0.3)) / (0.9 * 460e3);
}
/** The walk-collision boxes of the podium columns (ground to the roof). */
export function podiumSolids(): Solid[] {
  return podium().cols.map((c): Solid => [c.x - c.s / 2, c.x + c.s / 2, c.z - c.s / 2, c.z + c.s / 2, 0, PODIUM.top]);
}

// ---------------------------------------------------------------- 2. Presentation Hall roof trusses
const zA = HALL.z0, zB = DIVIDER.z - 0.5;
export const HALL_TRUSS = (() => {
  const span = zB - zA, spacing = 9, n = Math.floor((HALL.x1 - HALL.x0 - 2) / spacing) + 1;
  const xs = Array.from({ length: n + (n % 2 ? 0 : 0) }, (_, i) => (i - (n - 1) / 2) * spacing);
  const yBot = 16.3, yTop = 18.65, depth = yTop - yBot, panels = 20;
  const qRoof = 10; // factored roof load kN/m2 (slab, roof garden / plant, snow-like live)
  const w = qRoof * spacing; // kN per m of one truss
  const M = (w * span * span) / 8, V = (w * span) / 2;
  const chordF = M / depth;
  const fy = 355e3; // kPa: S355
  const chordA = chordF / (0.9 * fy);
  const chord = up05(chordA / (4 * 0.03)); // box section, 30 mm walls
  const panelL = span / panels, diagF = V / Math.sin(Math.atan2(depth, panelL / 2));
  const diag = Math.max(0.25, up05(diagF / (0.9 * fy) / (4 * 0.02)));
  return { xs, zA, zB, span, spacing, yBot, yTop, depth, panels, qRoof, w, M, V, chordF, chordA, chord, diagF, diag, ratio: span / depth };
})();

// ---------------------------------------------------------------- 3. mechanical floors: outriggers + belt truss
export const MECH_LEVELS: readonly number[] = [21, 41, 60, 70];
export const isMech = (n: number): boolean => MECH_LEVELS.includes(n);

export interface OutPanel { x0: number; x1: number; open: boolean }
export interface Outrigger { side: -1 | 1; z: number; panels: OutPanel[]; chord: number; diag: number; y0: number; y1: number }
/** The outrigger trusses of a mechanical level: from the outer face of each core block to the last interior column, on the centre line. */
export function outriggersOf(n: number): Outrigger[] {
  if (!isMech(n)) return [];
  const y0 = levelY(n), y1 = ceilY(n), cz = T.cz;
  const line = columnsOf(n).filter((c) => c.kind === 'interior' && same(c.z, cz));
  const out: Outrigger[] = [];
  for (const side of [-1, 1] as const) {
    const face = side < 0 ? CORES[0].x0 : CORES[1].x1;
    const cs = line.filter((c) => c.x * side > Math.abs(face) - 0.5).map((c) => c.x).sort((a, b) => (a - b) * side);
    const xs = [face, ...cs];
    const panels: OutPanel[] = [];
    for (let i = 0; i + 1 < xs.length; i++) panels.push({ x0: Math.min(xs[i], xs[i + 1]), x1: Math.max(xs[i], xs[i + 1]), open: false });
    // the panel nearest the middle of the truss is left open: a 9 m wide doorway so that both halves of the floor stay connected
    const mid = (xs[0] + xs[xs.length - 1]) / 2;
    let best = -1, bd = 1e9;
    panels.forEach((p, i) => { const d = Math.abs((p.x0 + p.x1) / 2 - mid); if (p.x1 - p.x0 > 3 && d < bd) { bd = d; best = i; } });
    if (best >= 0) panels[best].open = true;
    const chord = Math.max(0.5, up05(colSideInterior(n) * 0.6));
    out.push({ side, z: cz, panels, chord, diag: Math.max(0.35, up05(chord * 0.6)), y0, y1 });
  }
  return out;
}
const colSideInterior = (n: number): number => columnsOf(n).find((c) => c.kind === 'interior')?.s ?? 0.8;
/** Walk-collision boxes of a mechanical level's outriggers: every closed panel is a wall of members (the open panel is the doorway). */
export function outriggerSolids(n: number): Solid[] {
  const out: Solid[] = [];
  for (const o of outriggersOf(n)) for (const p of o.panels) if (!p.open) out.push([p.x0, p.x1, o.z - o.chord / 2, o.z + o.chord / 2, o.y0, o.y1]);
  return out;
}

/** Belt truss: the perimeter columns of a mechanical level, in order round the facade (the plane of the truss is the line between neighbours). */
export function beltOf(n: number): Array<{ a: Col; b: Col }> {
  if (!isMech(n)) return [];
  const p = columnsOf(n).filter((c) => c.kind === 'perimeter');
  return p.map((a, i) => ({ a, b: p[(i + 1) % p.length] }));
}
export const beltSection = (n: number): { chord: number; diag: number } => {
  const s = Math.max(0.4, up05(colSideInterior(n) * 0.4));
  return { chord: s, diag: Math.max(0.3, up05(s * 0.7)) };
};
