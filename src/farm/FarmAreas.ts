// AGRICULTURE AREAS (step 1: the places are chosen; the field layout inside them comes in the next step).
// The game keeps ALL crop fields together in a few big areas, different field types side by side, and nothing else is built there.
// Chosen with the real terrain + roads + buildings (scripts: 32 m grid): flattest farmland, least road / building / water inside, 200..260 m radius.
// x / z are world metres, y = median ground height of the circle (info only).
export interface FarmArea {
  id: string;
  name: string;
  cx: number;
  cz: number;
  /** Radius of the area (m). */
  r: number;
  /** Median ground height (m) inside the circle. */
  y: number;
}

export const FARM_AREAS: readonly FarmArea[] = [
  { id: 'west', name: 'West Farm', cx: -2808, cz: -504, r: 260, y: 21.4 },
  { id: 'southwest', name: 'South-West Farm', cx: -3720, cz: 2392, r: 250, y: 25.0 },
  { id: 'north', name: 'North Farm', cx: 1704, cz: -2744, r: 250, y: 32.8 },
  { id: 'east', name: 'East Farm', cx: 2200, cz: -2010, r: 260, y: 35.0 },
  { id: 'northeast', name: 'North-East Farm', cx: 3240, cz: -1130, r: 250, y: 23.1 },
  { id: 'eastlake', name: 'East-Lake Farm', cx: 2440, cz: -1336, r: 200, y: 26.4 },
];

/** The area that contains world point (x, z) (+ margin m), or undefined. */
export function farmAreaAt(x: number, z: number, margin = 0): FarmArea | undefined {
  for (const a of FARM_AREAS) if (Math.hypot(x - a.cx, z - a.cz) <= a.r + margin) return a;
  return undefined;
}
