// EVLab Step RT5: the big lettering "Engineering Visual Lab EVLab" on the 4 faces of the tall tower (pure numbers, no three.js, no canvas).
// The letters are a transparent texture on a thin strip of quads that follows the real glass wall (one quad per level and face, pushed out
// OFFSET m), so the lettering sits on the facade although the facade leans in a little with height. Building-local frame (x east, z south, y up);
// the building group is turned by the yaw of EVLabSite, so the 4 faces turn with the campus (no hand-made world offsets here).
import { T, levelY, ringOf, ringPoints } from './EVLabTowerLayout';

/** Which levels carry the lettering: the lowest wide part of the tower, above the podium roof and below the first sky-garden set-back (level 15). */
export const LETTER_BAND = { n0: 3, n1: 13 } as const;
/** Bottom and top (y, m) of the band, and its height. */
export const BAND_Y0 = levelY(LETTER_BAND.n0);
export const BAND_Y1 = levelY(LETTER_BAND.n1) + T.floorH;
export const BAND_H = BAND_Y1 - BAND_Y0;
/** The strip stands this far in front of the glass. The slab ledges and corner trims stick out 0.18 + 0.225 = 0.405 m, so the letters clear them. */
export const LETTER_OFFSET = 0.55;
export const LEDGE_OUT = 0.405;

export type FaceName = 'S' | 'N' | 'E' | 'W';
/** Index of the straight (not chamfered) segment of ringPoints: 0 = north, 2 = east, 4 = south, 6 = west. */
export const FACE_SEG: Readonly<Record<FaceName, number>> = { N: 0, E: 2, S: 4, W: 6 };
export const FACES: readonly FaceName[] = ['S', 'E', 'N', 'W'];
/** The text layout used on a face: the east / west faces are narrower (3 lines), the north / south faces are wider (2 lines). */
export const FACE_LAYOUT: Readonly<Record<FaceName, 'side' | 'wide'>> = { S: 'wide', N: 'wide', E: 'side', W: 'side' };

export interface LetterLine {
  text: string;
  /** Cap height of the letters (m). */
  cap: number;
  /** Horizontal squeeze (< 1 = condensed letters, taller than wide). */
  squeeze: number;
  /** The brand line (EVLab): a warmer gold. */
  accent?: boolean;
}
export interface LetterLayout {
  /** World width (m) that the texture covers (centred on the face). */
  W: number;
  lines: readonly LetterLine[];
  /** Gap (m) between line i and line i + 1. */
  gaps: readonly number[];
}

export const LAYOUTS: Readonly<Record<'side' | 'wide', LetterLayout>> = {
  side: {
    W: 54,
    lines: [
      { text: 'ENGINEERING', cap: 7.5, squeeze: 0.62 },
      { text: 'VISUAL LAB', cap: 7.5, squeeze: 0.62 },
      { text: 'EVLab', cap: 13, squeeze: 0.62, accent: true },
    ],
    gaps: [3, 4],
  },
  wide: {
    W: 96,
    lines: [
      { text: 'ENGINEERING VISUAL LAB', cap: 6.5, squeeze: 0.62 },
      { text: 'EVLab', cap: 16, squeeze: 0.8, accent: true },
    ],
    gaps: [4],
  },
};

/** Rough width (m) of a line: bold sans capitals are about 0.97 x cap height wide per character (a space counts as a character), times the squeeze. */
export const lineWidthEst = (l: LetterLine): number => l.text.length * 0.97 * l.cap * l.squeeze;
/** Height (m) of the whole text block. */
export const blockHeight = (L: LetterLayout): number => L.lines.reduce((s, l) => s + l.cap, 0) + L.gaps.reduce((s, g) => s + g, 0);
/** Where the lines stand: distance (m) from the TOP of the band down to the top of the capitals of each line (the block is centred in the band). */
export function lineTops(L: LetterLayout): number[] {
  const out: number[] = [];
  let y = (BAND_H - blockHeight(L)) / 2;
  L.lines.forEach((l, i) => { out.push(y); y += l.cap + (L.gaps[i] ?? 0); });
  return out;
}

/**
 * Along-the-face coordinate (m, increasing to the RIGHT of a person who stands in front of the face and looks at it) of the point (x, z).
 * S: right = +x. N: right = -x. E: right = -z. W: right = +z (z measured from the centre of the plate ring `cz`).
 */
export function alongOf(face: FaceName, x: number, z: number, ringCz: number): number {
  switch (face) {
    case 'S': return x - T.cx;
    case 'N': return -(x - T.cx);
    case 'E': return -(z - ringCz);
    default: return z - ringCz;
  }
}

export interface LetterQuad {
  face: FaceName;
  level: number;
  /** 4 corners: a(y0), b(y0), b(y1), a(y1), each [x, y, z] (building-local), pushed out by LETTER_OFFSET. */
  p: Array<[number, number, number]>;
  /** Texture coordinates of the 4 corners (u along the face, v up the band). */
  uv: Array<[number, number]>;
  /** Outward normal (x, z). */
  n: [number, number];
}

/**
 * The quads of a strip on the real glass wall: one per level n0..n1 and face, pushed out `offset` m. u runs along the face (centred, `widthOf(face)` m
 * = one texture width), v runs 0..1 from y0 of level n0 up to the top of level n1. Used by the lettering (RT5) and the clock (RT6).
 */
export function bandQuads(n0: number, n1: number, widthOf: (f: FaceName) => number, offset: number = LETTER_OFFSET): LetterQuad[] {
  const out: LetterQuad[] = [];
  const by0 = levelY(n0), bh = levelY(n1) + T.floorH - by0;
  for (let n = n0; n <= n1; n++) {
    const r = ringOf(n), pts = ringPoints(r);
    const y0 = levelY(n), y1 = y0 + T.floorH;
    const v0 = (y0 - by0) / bh, v1 = (y1 - by0) / bh;
    for (const face of FACES) {
      const i = FACE_SEG[face];
      const a = pts[i], b = pts[(i + 1) % 8];
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      const nx = dz / len, nz = -dx / len; // the same outward normal as the glass loft in EVLabFacade
      const W = widthOf(face);
      const ua = 0.5 + alongOf(face, a[0], a[1], r.cz) / W;
      const ub = 0.5 + alongOf(face, b[0], b[1], r.cz) / W;
      out.push({
        face, level: n,
        p: [[a[0] + nx * offset, y0, a[1] + nz * offset], [b[0] + nx * offset, y0, b[1] + nz * offset], [b[0] + nx * offset, y1, b[1] + nz * offset], [a[0] + nx * offset, y1, a[1] + nz * offset]],
        uv: [[ua, v0], [ub, v0], [ub, v1], [ua, v1]],
        n: [nx, nz],
      });
    }
  }
  return out;
}

/** All quads of the lettering: one per level (n0..n1) and face. */
export const letterQuads = (): LetterQuad[] => bandQuads(LETTER_BAND.n0, LETTER_BAND.n1, (f) => LAYOUTS[FACE_LAYOUT[f]].W);

/** Length (m) of the straight part of a face at level n. */
export function faceLength(face: FaceName, n: number): number {
  const pts = ringPoints(ringOf(n)), i = FACE_SEG[face];
  const a = pts[i], b = pts[(i + 1) % 8];
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}
