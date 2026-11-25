// J9-c: the R6 arm of the 300 ft junction passes under the station viaduct of rail edge ring-north (HANDOFF_JUNCTION_300FT.md section 23, J7-B).
// RailNetwork.placePiers does not know the J300 arm (it is not a game road), so when the J300 switch is ON it asks this rule: a viaduct pier must keep the walled R6 corridor free.
// Same formula as scripts/j300-struct-b-gen.ts (gap = smallest distance of the pier rectangle corners to the R6 centre line, negative when the centre is inside). No three.js, safe for headless scripts.
import { J300_STRUCT_B } from './J300StructB';

interface Rect { hl: number; ha: number }
const B = J300_STRUCT_B as unknown as {
  armPoly: number[][];
  wall: { needFaceCol: number; needFaceCap: number };
  rail: { pierCol: Rect; pierCap: Rect };
};
/** R6 centre line near the rail crossing: x, z (m). */
const LINE: number[][] = B.armPoly.map((p) => [p[0], p[1]]);
/** Corridor limits copied from J7-B: column face >= wall toe + 1.0 m working gap, cap >= road half width + pierRoadGap. */
export const J300_PIER_NEED = { col: B.wall.needFaceCol, cap: B.wall.needFaceCap } as const;
const COL: Rect = B.rail.pierCol;
const CAP: Rect = B.rail.pierCap;

function distToLine(px: number, pz: number): number {
  let best = 1e9;
  for (let i = 0; i < LINE.length - 1; i++) {
    const ax = LINE[i][0], az = LINE[i][1], dx = LINE[i + 1][0] - ax, dz = LINE[i + 1][1] - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
    const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}

/** Gap (m) between a pier rectangle (centre cx, cz; long side along the rail direction dx, dz; the cap is wider across) and the R6 centre line. */
export function j300PierGap(cx: number, cz: number, dx: number, dz: number, which: 'col' | 'cap'): number {
  const r = which === 'col' ? COL : CAP;
  const nx = -dz, nz = dx;
  let m = 1e9;
  for (const a of [-1, 1]) for (const b of [-1, 1]) m = Math.min(m, distToLine(cx + a * r.hl * dx + b * r.ha * nx, cz + a * r.hl * dz + b * r.ha * nz));
  const cd = distToLine(cx, cz);
  return cd < m ? -cd : m;
}

/** True when a viaduct pier at (cx, cz), rail direction (dx, dz), keeps the R6 corridor free (column AND cap). Far from the arm it is always true. */
export function j300PierOk(cx: number, cz: number, dx: number, dz: number): boolean {
  if (distToLine(cx, cz) > 60) return true;
  return j300PierGap(cx, cz, dx, dz, 'col') >= J300_PIER_NEED.col && j300PierGap(cx, cz, dx, dz, 'cap') >= J300_PIER_NEED.cap;
}

/**
 * Stations whose level is pinned while the J300 switch is ON. Reason (J9-c finding): nw-town stands on a viaduct because of the streets under it, among them the old R6-9.
 * With the J300 switch ON R6-9 is not a road any more, so the station would drop to the ground (19.40 m) and the rail of three lines would change. The OFF level is pinned instead.
 * scripts/j300-j9c-check.ts runs the rail with the switch OFF and ON and compares every edge, segment and station; it fails if this value is out of date.
 */
export const J300_RAIL_PIN: Readonly<Record<string, number>> = { 'nw-town': 35.25579457903309 };

/**
 * The generic pier search (1.5 m steps from the even targets) puts the two moved piers at s 51.0 and 97.5: 46.5 m between them is over the 46 m concrete limit, so the game would make a steel span.
 * J7-B (section 23) found the better pair on a 0.5 m search: s 51.77 and 96.77 (middle span 45 m, concrete). When the J300 switch is ON the supports of that edge are set to the table:
 * the supports between the two kept neighbours (s 30 and 120) are replaced by the added piers. Nothing is changed when a neighbour is missing (then the layout is not the one of J7-B).
 */
export function j300SnapSupports(edgeId: string, supports: number[]): boolean {
  const T = (J300_STRUCT_B as unknown as { crossing: { edge: string }; piers: { keptNeighbours: number[]; added: { s: number }[] } });
  if (edgeId !== T.crossing.edge) return false;
  const [a, b] = T.piers.keptNeighbours;
  const ia = supports.findIndex((s) => Math.abs(s - a) < 0.01);
  const ib = supports.findIndex((s) => Math.abs(s - b) < 0.01);
  if (ia < 0 || ib < 0 || ib <= ia) return false;
  supports.splice(ia + 1, ib - ia - 1, ...T.piers.added.map((p) => p.s));
  return true;
}
