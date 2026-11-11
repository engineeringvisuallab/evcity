import * as THREE from 'three';
import { mulberry32, type Kit } from '../structures';

// EVLab Tower v1.3: the surface textures of the tall tower (curtain wall, concrete core, floor numbers). Drawn on canvases, <= 1024.

export interface TowerTextures {
  /** 16 bays x 16 floors per tile (24 m x 67.2 m): reflective glass, champagne mullions and a slab spandrel every floor. */
  curtain: THREE.CanvasTexture;
  /** The same layout, warm office lights in random bays (emissive). */
  curtainGlow: THREE.CanvasTexture;
  concrete: THREE.CanvasTexture;
  /** Atlas of the floor numbers: 8 columns x 9 rows, cell index = level (0 = "G"), 70 = "A", 71 = "B". */
  digits: THREE.CanvasTexture;
}
export const DIGIT_COLS = 8, DIGIT_ROWS = 9;

const rep = (t: THREE.CanvasTexture): THREE.CanvasTexture => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
};

export function makeTowerTextures(k: Kit): TowerTextures {
  const rnd = mulberry32(61309);
  const CELL = 64, N = 16;
  const layout = (c: CanvasRenderingContext2D, w: number, h: number, glow: boolean): void => {
    const r = mulberry32(glow ? 4242 : 9);
    c.fillStyle = glow ? '#000' : '#1d4a5c';
    c.fillRect(0, 0, w, h);
    for (let row = 0; row < N; row++) {
      // texture y runs down: row 0 is the TOP of the image; one level = one row (v increases upwards in three.js, the canvas is flipped by the texture)
      const y0 = row * CELL;
      const tilt = 0.5 + 0.5 * Math.sin(row * 0.7);
      for (let col = 0; col < N; col++) {
        const x0 = col * CELL;
        const glassH = CELL * 0.74;
        if (!glow) {
          const g = c.createLinearGradient(0, y0, 0, y0 + glassH);
          const sky = 0.5 + 0.35 * r();
          g.addColorStop(0, `rgb(${Math.round(120 + 70 * sky)},${Math.round(180 + 50 * sky)},${Math.round(205 + 40 * sky)})`);
          g.addColorStop(1, `rgb(${Math.round(24 + 20 * tilt)},${Math.round(84 + 30 * tilt)},${Math.round(104 + 30 * tilt)})`);
          c.fillStyle = g;
          c.fillRect(x0, y0, CELL, glassH);
          if (r() < 0.22) { c.fillStyle = 'rgba(255,255,255,0.13)'; c.fillRect(x0, y0, CELL, glassH); }
          // slab spandrel: champagne metal with a bright top line
          c.fillStyle = '#7d6a45';
          c.fillRect(x0, y0 + glassH, CELL, CELL - glassH);
          c.fillStyle = '#e8d5a0';
          c.fillRect(x0, y0 + glassH, CELL, 3);
          c.fillStyle = '#a58b54';
          c.fillRect(x0, y0 + CELL - 3, CELL, 3);
          // mullion
          c.fillStyle = '#c9b27a';
          c.fillRect(x0, y0, 3, glassH);
        } else if (r() < 0.34) {
          const warm = 0.7 + 0.3 * r();
          c.fillStyle = `rgb(${Math.round(255 * warm)},${Math.round(200 * warm)},${Math.round(120 * warm)})`;
          c.fillRect(x0 + 4, y0 + 3, CELL - 7, glassH - 5);
        }
      }
    }
  };
  const curtain = rep(k.texture(1024, 1024, (c, w, h) => layout(c, w, h, false)));
  const curtainGlow = rep(k.texture(1024, 1024, (c, w, h) => layout(c, w, h, true)));
  const concrete = rep(
    k.texture(256, 256, (c, w, h) => {
      c.fillStyle = '#9a9a96';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        c.fillStyle = `rgba(${rnd() < 0.5 ? '70,70,68' : '210,210,205'},${0.04 + rnd() * 0.06})`;
        c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 6, 1 + rnd() * 6);
      }
      c.strokeStyle = 'rgba(40,40,40,0.35)';
      c.lineWidth = 2;
      c.strokeRect(0, 0, w, h);
    }),
  );
  const digits = k.texture(1024, 1024, (c, w, h) => {
    c.fillStyle = '#10151c';
    c.fillRect(0, 0, w, h);
    const cw = w / DIGIT_COLS, ch = h / DIGIT_ROWS;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let i = 0; i < DIGIT_COLS * DIGIT_ROWS; i++) {
      const x = (i % DIGIT_COLS) * cw, y = Math.floor(i / DIGIT_COLS) * ch;
      c.fillStyle = '#e8c96b';
      c.font = `bold ${Math.round(ch * 0.78)}px sans-serif`;
      c.fillText(i === 0 ? 'G' : i === 70 ? 'A' : i === 71 ? 'B' : String(i), x + cw / 2, y + ch / 2);
    }
  });
  return { curtain, curtainGlow, concrete, digits };
}
