// STEP 1.2  Road class table (handoff sections 3.1 and 3.10) as data.
export type RoadClassId =
  | 'M8' | 'M6' | 'M4' | 'A-D' | 'A-U' | 'C' | 'L' | 'S' | 'R' | 'EX' | 'I' | 'E' | 'RB' | 'HP' | 'HS' | 'HG' | 'HT' | 'T' | 'CW';

export interface RoadClass {
  id: RoadClassId;
  name: string;
  /** Lanes per direction, [min, max]. One-way or single-lane classes use [1, 1] and `oneWay`. */
  lanesPerDir: [number, number];
  oneWay?: boolean;
  /** Design speed range (km/h). */
  speed: [number, number];
  access: string;
  median: string;
}

export const ROAD_CLASSES: readonly RoadClass[] = [
  { id: 'M8', name: 'Motorway 8 lane', lanesPerDir: [4, 4], speed: [100, 120], access: 'fully controlled, interchanges only', median: 'yes, 6 m' },
  { id: 'M6', name: 'Motorway 6 lane', lanesPerDir: [3, 3], speed: [100, 120], access: 'fully controlled', median: 'yes, 6 m' },
  { id: 'M4', name: 'Motorway 4 lane', lanesPerDir: [2, 2], speed: [100, 100], access: 'fully controlled', median: 'yes, 4 m' },
  { id: 'A-D', name: 'Arterial divided', lanesPerDir: [2, 3], speed: [70, 80], access: 'signals / interchanges', median: 'yes' },
  { id: 'A-U', name: 'Arterial undivided', lanesPerDir: [1, 1], speed: [60, 60], access: 'at-grade', median: 'painted' },
  { id: 'C', name: 'Collector', lanesPerDir: [1, 1], speed: [50, 50], access: 'at-grade', median: 'no' },
  { id: 'L', name: 'Local street', lanesPerDir: [1, 1], speed: [30, 40], access: 'at-grade', median: 'no' },
  { id: 'S', name: 'Service / frontage', lanesPerDir: [1, 1], speed: [30, 40], access: 'to adjacent land', median: 'no' },
  { id: 'R', name: 'Ramp', lanesPerDir: [1, 2], oneWay: true, speed: [30, 80], access: 'one-way', median: 'no' },
  { id: 'EX', name: 'Expressway', lanesPerDir: [2, 2], speed: [80, 100], access: 'mostly controlled', median: 'yes, 3-6 m' },
  { id: 'I', name: 'Industrial / heavy vehicle', lanesPerDir: [1, 2], speed: [50, 60], access: 'at-grade, wide radii', median: 'optional' },
  { id: 'E', name: 'Earth / village track', lanesPerDir: [1, 1], oneWay: true, speed: [20, 25], access: 'free', median: 'no' },
  { id: 'RB', name: 'Roundabout', lanesPerDir: [1, 2], oneWay: true, speed: [30, 30], access: 'yield', median: 'splitter islands' },
  { id: 'HP', name: 'Hill primary', lanesPerDir: [1, 1], speed: [40, 60], access: 'at-grade, few', median: 'no' },
  { id: 'HS', name: 'Hill secondary', lanesPerDir: [1, 1], speed: [30, 40], access: 'at-grade', median: 'no' },
  { id: 'HG', name: 'Ghat road', lanesPerDir: [1, 1], speed: [20, 30], access: 'at-grade', median: 'no' },
  { id: 'HT', name: 'Hill / mountain track', lanesPerDir: [1, 1], oneWay: true, speed: [15, 25], access: 'free', median: 'no' },
  { id: 'T', name: 'Tunnel road', lanesPerDir: [1, 2], speed: [40, 80], access: 'controlled', median: 'wall / barrier' },
  { id: 'CW', name: 'Causeway / dam crest', lanesPerDir: [1, 1], speed: [40, 50], access: 'at-grade', median: 'no' },
];
export const roadClass = (id: RoadClassId): RoadClass => ROAD_CLASSES.find((c) => c.id === id)!;
