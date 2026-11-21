// ROAD SIGN BOARDS - Step 1: draws the face of ONE board on a 2D canvas (green destination part + dark maxim strip). No three.js: it only needs a CanvasRenderingContext2D,
// so the same code runs in the game (RoadSignLayer makes a CanvasTexture of it) and in a plain browser page for a preview.
import { BOARD_H, GANTRY, SECTION_COLORS, bnDigits, kmText, type BoardContent, type SignArrow } from './RoadSignSpec';

export const SIGN_COLORS = {
  green: '#0b6b3b',
  greenDark: '#085330',
  strip: '#0a2f22',
  white: '#ffffff',
  maxim: '#ffe9a0',
} as const;

const BANGLA_FONT = '"Noto Sans Bengali", "Nirmala UI", "Vrinda", "Shonar Bangla", "Kalpurush", sans-serif';
const LATIN_FONT = '"Segoe UI", Arial, Helvetica, sans-serif';

/** Texture size for a board of width `w` m: about 150 px per metre, the height follows the board shape. */
export function paintSize(w: number): { W: number; H: number } {
  const W = Math.round((Math.min(150, 2048 / w) * w) / 8) * 8; // 150 px per metre, but never wider than 2048 px (the long board of a wide road)
  return { W, H: Math.round((W * BOARD_H) / w / 8) * 8 };
}

function fitText(g: CanvasRenderingContext2D, text: string, maxW: number, size: number, family: string, weight: string): void {
  let s = size;
  g.font = `${weight} ${s}px ${family}`;
  while (g.measureText(text).width > maxW && s > 14) {
    s -= 2;
    g.font = `${weight} ${s}px ${family}`;
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** A white arrow in a box of `s` px centred at (cx, cy). */
function arrow(g: CanvasRenderingContext2D, kind: SignArrow, cx: number, cy: number, s: number): void {
  const turn = kind === 'left' ? -Math.PI / 2 : kind === 'right' ? Math.PI / 2 : kind === 'upleft' ? -Math.PI / 4 : kind === 'upright' ? Math.PI / 4 : 0;
  g.save();
  g.translate(cx, cy);
  g.rotate(turn);
  g.fillStyle = SIGN_COLORS.white;
  g.beginPath();
  const w = s * 0.17, hw = s * 0.42;
  g.moveTo(0, -s / 2);
  g.lineTo(hw, -s * 0.04);
  g.lineTo(w, -s * 0.04);
  g.lineTo(w, s / 2);
  g.lineTo(-w, s / 2);
  g.lineTo(-w, -s * 0.04);
  g.lineTo(-hw, -s * 0.04);
  g.closePath();
  g.fill();
  g.restore();
}

/** Paints the whole board into a canvas of the size paintSize(boardW). */
export function paintBoard(g: CanvasRenderingContext2D, W: number, H: number, c: BoardContent): void {
  const mainH = Math.round((H * GANTRY.mainH) / BOARD_H);
  const pad = Math.round(H * 0.035);
  // the whole board: white rim, green face
  g.fillStyle = SIGN_COLORS.white;
  roundRect(g, 0, 0, W, H, pad * 1.6);
  g.fill();
  g.fillStyle = SIGN_COLORS.green;
  roundRect(g, pad, pad, W - 2 * pad, mainH - pad, pad);
  g.fill();
  // the maxim strip (dark, under the green part)
  g.fillStyle = SIGN_COLORS.strip;
  roundRect(g, pad, mainH + pad * 0.4, W - 2 * pad, H - mainH - pad * 1.4, pad);
  g.fill();

  g.textBaseline = 'middle';
  // destinations: up to 3 rows, each a third of the green part
  const rows = c.rows.slice(0, 3);
  const top = pad * 1.2, rowH = (mainH - pad * 2.4) / 3;
  rows.forEach((r, i) => {
    const cy = top + rowH * (i + 0.5);
    if (i > 0) {
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.fillRect(pad * 2.2, top + rowH * i - 1, W - pad * 4.4, 2);
    }
    arrow(g, r.arrow, pad * 2.2 + rowH * 0.42, cy, rowH * 0.62);
    const x0 = pad * 2.2 + rowH * 0.95;
    const kmW = W * 0.2;
    g.textAlign = 'left';
    g.fillStyle = SIGN_COLORS.white;
    fitText(g, r.bn, W - x0 - kmW - pad * 3, rowH * 0.44, BANGLA_FONT, '700');
    g.fillText(r.bn, x0, cy - rowH * 0.2);
    fitText(g, r.en, W - x0 - kmW - pad * 3, rowH * 0.32, LATIN_FONT, '600');
    g.fillText(r.en, x0, cy + rowH * 0.25);
    g.textAlign = 'right';
    const xr = W - pad * 2.6;
    const t = kmText(r.km);
    fitText(g, bnDigits(t) + ' কিমি', kmW, rowH * 0.4, BANGLA_FONT, '700');
    g.fillText(bnDigits(t) + ' কিমি', xr, cy - rowH * 0.2);
    fitText(g, t + ' km', kmW, rowH * 0.3, LATIN_FONT, '600');
    g.fillText(t + ' km', xr, cy + rowH * 0.25);
  });

  // maxim: Bangla on the first line, English under it, both centred
  const sy = mainH + pad * 0.4, sh = H - mainH - pad * 1.4;
  g.textAlign = 'center';
  g.fillStyle = SIGN_COLORS.maxim;
  fitText(g, c.maximBn, W * 0.9, sh * 0.5, BANGLA_FONT, '600');
  g.fillText(c.maximBn, W / 2, sy + sh * 0.3);
  fitText(g, c.maximEn, W * 0.9, sh * 0.36, LATIN_FONT, '500');
  g.fillText(c.maximEn, W / 2, sy + sh * 0.72);
}

/** The EMPTY long board: white rim, `n` coloured sections side by side (white lines between them), and the empty dark maxim strip along the whole bottom. */
export function paintSections(g: CanvasRenderingContext2D, W: number, H: number, n: number): void {
  const mainH = Math.round((H * GANTRY.mainH) / BOARD_H);
  const pad = Math.round(H * 0.035);
  g.fillStyle = SIGN_COLORS.white;
  roundRect(g, 0, 0, W, H, pad * 1.6);
  g.fill();
  const x0 = pad, x1 = W - pad, sw = (x1 - x0) / n;
  for (let k = 0; k < n; k++) {
    g.fillStyle = SECTION_COLORS[k % SECTION_COLORS.length];
    g.fillRect(x0 + k * sw + (k > 0 ? pad * 0.5 : 0), pad, sw - (k > 0 ? pad * 0.5 : 0) - (k < n - 1 ? pad * 0.5 : 0), mainH - pad);
  }
  g.fillStyle = SIGN_COLORS.strip;
  roundRect(g, pad, mainH + pad * 0.4, W - 2 * pad, H - mainH - pad * 1.4, pad);
  g.fill();
}
