// ROAD SIGNS - Step 1: draws the face of a direction board on a 2D canvas (Bangla + English, arrow, km).
// No three.js in here: RoadSignLayer turns the canvas into a texture. Pixel scale: BOARD_PX_PER_M pixels = 1 metre of board.
import { kmBn, kmEn, type SignArrow, type SignColor, type SignRow } from './SignFormat';

export const BOARD_W_PX = 1024;
/** Height of one row and of the margin above and below the rows (px). */
export const ROW_H_PX = 200;
export const MARGIN_PX = 30;
/** Board width in metres (the board height follows from the number of rows). */
export const BOARD_W_M = 3.2;
export const BOARD_PX_PER_M = BOARD_W_PX / BOARD_W_M;

const BN_FONT = '"Noto Sans Bengali", "Nirmala UI", "Vrinda", "Shonar Bangla", "Kalpurush", sans-serif';
const EN_FONT = '"Segoe UI", Arial, Helvetica, sans-serif';
const BG: Record<SignColor, string> = { green: '#0a6a3c', blue: '#0b4f9e' };

export function boardHeightPx(rows: number): number {
  return rows * ROW_H_PX + MARGIN_PX * 2;
}
export function boardHeightM(rows: number): number {
  return boardHeightPx(rows) / BOARD_PX_PER_M;
}

/** Arrow polygon pointing UP, unit box (-0.5..0.5). */
const ARROW_UP: ReadonlyArray<readonly [number, number]> = [
  [-0.16, 0.5], [-0.16, -0.02], [-0.42, -0.02], [0, -0.5], [0.42, -0.02], [0.16, -0.02], [0.16, 0.5],
];

function drawArrow(g: CanvasRenderingContext2D, kind: SignArrow, cx: number, cy: number, size: number): void {
  g.save();
  g.translate(cx, cy);
  if (kind === 'left') g.rotate(-Math.PI / 2);
  else if (kind === 'right') g.rotate(Math.PI / 2);
  g.beginPath();
  ARROW_UP.forEach(([x, y], i) => (i === 0 ? g.moveTo(x * size, y * size) : g.lineTo(x * size, y * size)));
  g.closePath();
  g.fillStyle = '#ffffff';
  g.fill();
  g.restore();
}

/** One line of text, shrunk until it fits `maxW`. Returns nothing; the text is left-, centre- or right-aligned at x as asked. */
function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, family: string, weight: string, align: CanvasTextAlign): void {
  let s = size;
  g.font = `${weight} ${s}px ${family}`;
  while (g.measureText(text).width > maxW && s > 20) {
    s -= 2;
    g.font = `${weight} ${s}px ${family}`;
  }
  g.textAlign = align;
  g.fillText(text, x, y);
}

/** The board face. Returns null when there is no DOM (headless tests). */
export function drawSignCanvas(rows: readonly SignRow[], color: SignColor): HTMLCanvasElement | null {
  if (typeof document === 'undefined' || rows.length === 0) return null;
  const W = BOARD_W_PX;
  const H = boardHeightPx(rows.length);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return null;

  // background + white border
  g.fillStyle = BG[color];
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 10;
  g.lineJoin = 'round';
  g.strokeRect(14, 14, W - 28, H - 28);

  const hasArrow = rows.some((r) => r.arrow);
  const hasKm = rows.some((r) => r.km !== undefined);
  const left = 50;
  const right = W - 50;
  const kmW = hasKm ? 250 : 0;
  const textX = left + (hasArrow ? 170 : 0);
  const nameW = right - kmW - textX - (hasKm ? 20 : 0);

  g.fillStyle = '#ffffff';
  g.textBaseline = 'middle';
  rows.forEach((row, i) => {
    const top = MARGIN_PX + i * ROW_H_PX;
    const mid = top + ROW_H_PX / 2;
    if (i > 0) {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(left, top - 1, right - left, 2);
    }
    g.fillStyle = '#ffffff';
    if (row.arrow) drawArrow(g, row.arrow, left + 60, mid, 110);
    // Bangla on top, English under it
    fitText(g, row.bn, textX, mid - 38, nameW, 70, BN_FONT, '700', 'left');
    fitText(g, row.en, textX, mid + 44, nameW, 56, EN_FONT, '700', 'left');
    if (row.km !== undefined) {
      fitText(g, kmEn(row.km), right, mid - 36, kmW, 62, EN_FONT, '700', 'right');
      fitText(g, kmBn(row.km), right, mid + 40, kmW, 54, BN_FONT, '600', 'right');
    }
  });
  return c;
}
