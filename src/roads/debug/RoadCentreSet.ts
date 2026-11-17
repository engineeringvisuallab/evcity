// The set of lines the "Road Central Line" layer (key 3) shows, as plain data (no three.js, no DOM), so the export can write the SAME lines.
// Same three sources as RoadCentreLayer.build(): (1) roads already built in the game (8 / 6 lane, no ':' in the name), (2) planned centrelines (CENTRE_ROADS), (3) housing streets.
// Coordinates are WORLD metres (x east, z south); y = ground / road surface height in metres (no lift).
import type { TerrainGenerator } from '../../terrain/TerrainGenerator';
import { CENTRE_ROADS, CENTRE_JUNCTIONS } from './RoadCentreData';
import { HOUSING_STREETS, HOUSING_JUNCTIONS } from './HousingStreetData';

export type CentreSource = 'built' | 'planned' | 'housing';
export interface CentreLine {
  source: CentreSource;
  id: string;
  /** '8' / '6' (built roads), '6' / '4' / '2' (planned), 'A' / 'C' / 'L' (housing: arterial / collector / local). */
  cls: string;
  flag: string;
  /** [x, z, y] per point. */
  pts: number[][];
}
export interface CentreJunctionPt { id: string; x: number; z: number; y: number; source: 'planned' | 'housing'; }
export interface CentreSet { lines: CentreLine[]; junctions: CentreJunctionPt[]; }

export function collectCentreSet(t: TerrainGenerator): CentreSet {
  const lines: CentreLine[] = [];
  for (const r of t.roads.roads as any[]) {
    if (String(r.name).includes(':') || !(r.lanes === 8 || r.lanes === 6)) continue;
    const pts: number[][] = [];
    for (let i = 0; i < r.xs.length; i++) pts.push([r.xs[i], r.zs[i], r.ys[i]]);
    if (pts.length >= 2) lines.push({ source: 'built', id: String(r.name), cls: String(r.lanes), flag: '', pts });
  }
  for (const r of CENTRE_ROADS) lines.push({ source: 'planned', id: r.id, cls: String(r.cls), flag: r.flag ?? '', pts: r.pts.map((p) => [p[0], p[1], t.heightAt(p[0], p[1])]) });
  for (const r of HOUSING_STREETS) lines.push({ source: 'housing', id: r.id, cls: r.cls, flag: '', pts: r.pts.map((p) => [p[0], p[1], t.heightAt(p[0], p[1])]) });
  const junctions: CentreJunctionPt[] = [
    ...CENTRE_JUNCTIONS.map((j) => ({ id: j.id, x: j.x, z: j.z, y: t.heightAt(j.x, j.z), source: 'planned' as const })),
    ...HOUSING_JUNCTIONS.map((j) => ({ id: j.id, x: j.x, z: j.z, y: t.heightAt(j.x, j.z), source: 'housing' as const })),
  ];
  return { lines, junctions };
}

/** Colours exactly like RoadCentreLayer (0xRRGGBB). */
export const CENTRE_COLOUR: Record<string, number> = { '8': 0x111111, '6': 0x2a6bff, '4': 0xff2a3c, '2': 0x12c24a, A: 0xe000c0, C: 0x00c8e0, L: 0xffd400 };
