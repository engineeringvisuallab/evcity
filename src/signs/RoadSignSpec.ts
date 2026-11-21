// ROAD SIGN BOARDS (HANDOFF_ROAD_DESIGN.md section 23) - Step 1: the SIZES of an overhead sign gantry and the TEXT of a board. Pure numbers and plain data (no three.js, no canvas),
// so scripts/gen-road-signs.ts, scripts/road-signs-test.ts, RoadSignLayer (3D) and RoadSignPaint (canvas) all read the same numbers.
//
// A gantry stands ACROSS the road: two round steel pipe posts (one each side of the road, outside the shoulder), a truss beam between them, and one board hanging over EACH
// carriageway, facing the traffic that comes towards it. Every board is a rectangle: the big green part (destinations, arrows, distances in Bangla and English) and under it a
// narrow dark strip for a maxim (nitibakya, Bangla + English).
//
// Local frame of a gantry (the same as SignSolids.gantrySolids): origin on the road CENTRELINE at the road SURFACE height, +X = the driver's right (for travel in the
// direction of growing s), +Z = towards the driver who comes along growing s (so the face of board A looks along +Z), +Y up. World placement: a group at (x, y, z) turned by `yaw`
// about Y (three.js rotation.y): local +X -> (cos yaw, -sin yaw) and local +Z -> (sin yaw, cos yaw) in (x, z).

/** Sizes in metres. */
export const GANTRY = {
  /** Lower edge of the boards above the road surface (a truck is 4.5 m high; 5.5 m is the usual motorway clearance). */
  clearance: 5.5,
  /** The big green part of a board (destinations) and the maxim strip under it. mainH 2.0 -> 3.2 on 2026-11-21 (user: the boards must be 1 - 1.5 m higher): the whole board is 3.7 m high. */
  mainH: 3.2,
  stripH: 0.5,
  /** Thickness of the board (the steel box between its two faces); it hangs in the plane of the beam, under the lower chord. */
  boardDepth: 0.18,
  /** Round steel pipe: post radius, chord radius of the truss, concrete base (square, height). */
  postR: 0.3,
  chordR: 0.14,
  baseSize: 1.3,
  baseHeight: 0.9,
  /** Distance from the outer edge of the shoulder to the axis of a post. */
  postGap: 2.0,
  /** The post goes this far below the ground at its foot (no gap shows on a slope). */
  postBelow: 0.8,
  /** Truss: chords above the top of the boards (lower chord, upper chord), panel length. */
  chordLow: 0.25,
  chordHigh: 0.95,
  panel: 3.0,
} as const;

/** Height of the whole board (m). */
export const BOARD_H = GANTRY.mainH + GANTRY.stripH;
/** Top of the board above the road surface (m). */
export const BOARD_TOP = GANTRY.clearance + BOARD_H;
/** Top of the posts above the road surface (m). */
export const POST_TOP = BOARD_TOP + GANTRY.chordHigh + 0.15;

/** Show / paint distances (m, at Q.signRadiusMul = 1): the lettering of a board is drawn (a canvas texture) inside `paint` and thrown away outside `unpaint`. */
export const SIGN_FIELD = { paint: 170, unpaint: 240 } as const;

/** How many coloured sections the ONE board across the whole road is divided into (user 2026-11-21: 'full road a 1ta signboard hobe, color diye vag thakbe'): 8-lane 4, 6-lane 3, 4-lane 2, 2-lane 2.
 *  One place to change if the user wants other numbers. */
export function sectionsForLanes(lanes: number): number {
  return lanes >= 8 ? 4 : lanes >= 6 ? 3 : 2;
}

/** Background colour of each section, in turn (the same on both faces): green, blue, brown, teal. */
export const SECTION_COLORS: readonly string[] = ['#0b6b3b', '#0b4f9c', '#7a4a14', '#0a6a6a'];

/** Where a driver goes for a row. Step 1 only draws 'up' (straight on); left / right come with the junction boards. */
export type SignArrow = 'up' | 'left' | 'right' | 'upleft' | 'upright';

export interface SignRow {
  arrow: SignArrow;
  bn: string;
  en: string;
  /** Distance in km (shown with 1 decimal, Bangla digits + 'কিমি' and Latin digits + 'km'). */
  km: number;
}

export interface BoardContent {
  rows: SignRow[];
  maximBn: string;
  maximEn: string;
}

/** The numbers of a gantry (frame: +X = driver's right). */
export interface GantryLayout {
  /** Lateral distance of each post axis from the centreline (m); posts at -edge and +edge. */
  edge: number;
  /** Width (m) of the ONE board: from post to post (a small gap at each post). */
  boardW: number;
  /** Number of coloured sections across the board. */
  sections: number;
}

/** Numbers of a gantry for a road: halfWidth (centreline to kerb, the median included), shoulder (m), lanes. */
export function gantryLayout(halfWidth: number, shoulder: number, lanes: number): GantryLayout {
  const edge = halfWidth + shoulder + GANTRY.postGap;
  return { edge, boardW: Math.floor((2 * edge - 2 * GANTRY.postR - 0.4) * 10) / 10, sections: sectionsForLanes(lanes) };
}

/** A face with no lettering yet (the destinations and the maxims come in later steps). */
export const EMPTY_BOARD: BoardContent = { rows: [], maximBn: '', maximEn: '' };

/** Maxims for the strip under the destinations (Bangla / English). Step 1 uses them in turn; the user can add or change any of them. */
export const MAXIMS: ReadonlyArray<readonly [string, string]> = [
  ['ধীরে চলুন, নিরাপদে পৌঁছান', 'Drive slow, arrive safe'],
  ['সিটবেল্ট বাঁধুন, জীবন বাঁচান', 'Buckle up, save a life'],
  ['ক্লান্ত হলে একটু বিশ্রাম নিন', 'Feeling tired? Take a break'],
  ['লেন মেনে চলুন, দুর্ঘটনা এড়ান', 'Keep your lane, avoid accidents'],
  ['দেরি হলেও নিরাপদে পৌঁছান', 'Better late than never'],
  ['গতি নয়, সতর্কতাই জীবন বাঁচায়', 'Caution, not speed, saves lives'],
];

/** Bangla digits for a number text. */
export const bnDigits = (s: string): string => s.replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);

/** '12.4' for 12.44 km; under 1 km still in km (0.8). */
export const kmText = (km: number): string => (Math.round(km * 10) / 10).toFixed(1);
