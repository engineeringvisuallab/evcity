/**
 * RESIDENTIAL LEVEL (RL2): the residential (abasik) areas where C / L / R2 / R4 roads and homes are laid out. Same circles as scripts/residential-place.ts (HANDOFF_RESIDENTIAL.md section 2).
 * `areaWeight` = 1 inside a circle, falls to 0 over TAPER m outside it. Used by RoadNetwork.reprofileResidential (road follows the smoothed ground, flat terrace beside the road).
 */
export const RESIDENTIAL_AREAS: readonly { id: string; x: number; z: number; r: number }[] = [
  { id: 'se-dense', x: 1150, z: 1150, r: 600 }, { id: 'west-homes', x: -1550, z: 0, r: 620 }, { id: 'sw-homes', x: -1150, z: 1150, r: 600 },
  { id: 'east-homes', x: 1550, z: 60, r: 600 }, { id: 'south-suburb', x: 450, z: 2250, r: 550 }, { id: 'sw-newtown', x: -1900, z: 1750, r: 650 },
  { id: 'west-suburb', x: -2450, z: 500, r: 500 }, { id: 'RA-N', x: 1030, z: -2365, r: 520 }, { id: 'RA-SW', x: -3150, z: 1500, r: 520 },
];
const TAPER = 120;
export function areaWeight(x: number, z: number): number {
  let best = 0;
  for (const a of RESIDENTIAL_AREAS) {
    const d = Math.hypot(x - a.x, z - a.z) - a.r;
    const w = d <= 0 ? 1 : d >= TAPER ? 0 : 1 - (d / TAPER) * (d / TAPER) * (3 - 2 * (d / TAPER));
    if (w > best) best = w;
  }
  return best;
}
