// STEP CENTRE-ALL (2026-11-26, user: 'sob road centerline updated thake, 3 click korle sob road thake, GIS er sathe export hoy'): EVERY road that is in the game now (all classes 8 / 6 / 4 / 2 / C / L / S / X,
// the rail-corridor roads CRR-* as class R) comes from the finished game roads; a planned centreline (CENTRE_ROADS) or housing street is added ONLY where no built road of the same name exists.
// The set of lines the "Road Central Line" layer (key 3) shows, as plain data (no three.js, no DOM), so the export can write the SAME lines.
// Same three sources as RoadCentreLayer.build(): (1) roads already built in the game (8 / 6 lane, no ':' in the name), (2) planned centrelines (CENTRE_ROADS), (3) housing streets.
// Coordinates are WORLD metres (x east, z south); y = ground / road surface height in metres (no lift).
import type { TerrainGenerator } from '../../terrain/TerrainGenerator';
import { CENTRE_ROADS, CENTRE_JUNCTIONS } from './RoadCentreData';
import { HOUSING_STREETS, HOUSING_JUNCTIONS } from './HousingStreetData';
import { roadClass } from '../JunctionRegistry';

export type CentreSource = 'built' | 'planned' | 'housing';
export interface CentreLine {
  source: CentreSource;
  id: string;
  /** Built roads: '8' '6' '4' '2' 'C' 'L' 'S' (SH- streets) 'X' (other) 'R' (rail-corridor roads CRR-* / RR-HUB). Planned: '6' '4' '2'. Housing: 'A' 'C' 'L'. */
  cls: string;
  /** Built: 'E' earth road, 'P' ramp; planned: '!' / '~' (class-sequence flags). */
  flag: string;
  /** [x, z, y] per point. */
  pts: number[][];
  /** Length along the line (m). */
  lengthM: number;
}
export interface CentreJunctionPt { id: string; x: number; z: number; y: number; source: 'planned' | 'housing'; }
export interface CentreSet { lines: CentreLine[]; junctions: CentreJunctionPt[]; }

const parentName = (n: string): string => n.replace(/\.\d+[a-z]?$/, '');
const lenOf = (pts: number[][]): number => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; };

/** Pure: roads = the game's finished roads (RoadNetwork.roads), heightAt = ground height. */
export function collectCentreSetFrom(roads: ReadonlyArray<any>, heightAt: (x: number, z: number) => number): CentreSet {
  const lines: CentreLine[] = [];
  const builtParents = new Set<string>();
  for (const r of roads) {
    const nm = String(r.name);
    if (nm.includes(':') || r.xs.length < 2) continue;
    const pts: number[][] = [];
    for (let i = 0; i < r.xs.length; i++) pts.push([r.xs[i], r.zs[i], r.ys[i]]);
    const cls = nm.startsWith('CRR-') || nm === 'RR-HUB' ? 'R' : roadClass(nm);
    lines.push({ source: 'built', id: nm, cls, flag: r.earth ? 'E' : r.kind === 'ramp' ? 'P' : '', pts, lengthM: typeof r.length === 'number' ? r.length : lenOf(pts) });
    builtParents.add(parentName(nm));
  }
  for (const r of CENTRE_ROADS) {
    if (builtParents.has(parentName(r.id))) continue;
    const pts = r.pts.map((p) => [p[0], p[1], heightAt(p[0], p[1])]);
    lines.push({ source: 'planned', id: r.id, cls: String(r.cls), flag: r.flag ?? '', pts, lengthM: lenOf(pts) });
  }
  for (const r of HOUSING_STREETS) {
    if (builtParents.has(parentName(r.id))) continue;
    const pts = r.pts.map((p) => [p[0], p[1], heightAt(p[0], p[1])]);
    lines.push({ source: 'housing', id: r.id, cls: r.cls, flag: '', pts, lengthM: lenOf(pts) });
  }
  const junctions: CentreJunctionPt[] = [
    ...CENTRE_JUNCTIONS.map((j) => ({ id: j.id, x: j.x, z: j.z, y: heightAt(j.x, j.z), source: 'planned' as const })),
    ...HOUSING_JUNCTIONS.map((j) => ({ id: j.id, x: j.x, z: j.z, y: heightAt(j.x, j.z), source: 'housing' as const })),
  ];
  return { lines, junctions };
}

export function collectCentreSet(t: TerrainGenerator): CentreSet {
  return collectCentreSetFrom(t.roads.roads as any[], (x, z) => t.heightAt(x, z));
}

/** Colours (0xRRGGBB), width (m) and lift (m above the road, so two classes never z-fight) of each class. */
export const CENTRE_COLOUR: Record<string, number> = { '8': 0x111111, '6': 0x2a6bff, '4': 0xff2a3c, '2': 0x12c24a, A: 0xe000c0, C: 0x00c8e0, L: 0xffd400, S: 0xb0b0b0, X: 0xff7a00, R: 0x9b30ff };
export const CENTRE_WIDTH: Record<string, number> = { '8': 6, '6': 6, '4': 5, '2': 3, A: 4, C: 3, L: 2.5, S: 2.5, X: 3, R: 4 };
export const CENTRE_LIFT: Record<string, number> = { '8': 0, '6': 0.1, '4': 0.2, '2': 0.3, A: 0.3, C: 0.4, L: 0.5, S: 0.6, X: 0.7, R: 0.4 };
