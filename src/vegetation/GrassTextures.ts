import type * as THREE from 'three';
import { mulberry32 } from '../world/Seed';
import { atlasTexture } from './TreeAssets';

/**
 * PAINTED GRASS ATLAS (2026-11-21, after "the shape is not realistic"): the grass is no longer flat-coloured polygons. Every tuft / clump is a few crossed CARDS that carry a painted picture
 * (made once on a canvas at start-up, no files): dozens of tapered, curved blades each with its own green, a pale midrib, a dark root and a bright tip; big bunch grass fountains with
 * tan / purple-brown seed plumes; a top-down rosette of broad veined leaves; a patch of clover leaves with the pale chevron. Transparent pixels are cut out (alpha test).
 * One strip of 15 square tiles (the last 6 are the wild flowers: marigold, buttercup, lavender, poppy, cornflower, cosmos); tile 0 is solid white (the flowers, stems and everything that has no picture sample it, so they keep their vertex colours).
 */
export const GT = { durba: 15, white: 0, lawn: 1, wild: 2, clump: 3, tussock: 4, tussockWide: 5, tussockSeed: 6, leafy: 7, trefoil: 8, daisy: 9, buttercup: 10, lavender: 11, poppy: 12, cornflower: 13, clover: 14 } as const;
export const GRASS_TILES = 16;
/** 16 x 256 = 4096 px: the atlas stays within 4096 (the limit of many phones). */
export const GRASS_TILE = 256;
const LS = 512; // logical size the painters draw in (scaled to GRASS_TILE)
const K = GRASS_TILE / LS;

type Ctx = CanvasRenderingContext2D;
const hsl = (h: number, s: number, l: number, a = 1): string => `hsla(${h.toFixed(1)}, ${Math.max(0, s).toFixed(1)}%, ${Math.min(96, Math.max(2, l)).toFixed(1)}%, ${a})`;

interface Blade {
  /** root x (logical px inside the tile) */
  x: number;
  /** blade height (px) */
  h: number;
  /** tip offset sideways (px) */
  lean: number;
  /** sideways push of the middle (px): the arch of the blade */
  curve: number;
  /** half width at the root (px) */
  w: number;
  hue: number;
  light: number;
  /** colour saturation (%) and kind: 0 green, 1 dry-tipped (green going to straw), 2 dead straw / brown blade */
  sat: number;
  dry: number;
  /** a glossy blade (smooth, shiny green): a bright streak along it */
  gloss?: boolean;
}

/** One tapered, curved blade: a gradient from a dark root to a bright tip, a darker rim and a pale midrib. */
function drawBlade(c: Ctx, x0: number, base: number, b: Blade): void {
  const bx = x0 + b.x, by = base;
  const tx = bx + b.lean, ty = by - b.h;
  const mx = bx + b.curve, my = by - b.h * 0.58;
  const N = 16;
  const L: [number, number][] = [], R: [number, number][] = [];
  const P = (t: number): [number, number] => [(1 - t) * (1 - t) * bx + 2 * (1 - t) * t * mx + t * t * tx, (1 - t) * (1 - t) * by + 2 * (1 - t) * t * my + t * t * ty];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = P(t), q = P(Math.min(1, t + 0.02)), o = P(Math.max(0, t - 0.02));
    let dx = q[0] - o[0], dy = q[1] - o[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    const hw = b.w * Math.pow(1 - t, 0.85) * (t < 0.06 ? 0.6 + 6 * t : 1) + 0.15;
    L.push([p[0] - dy * hw, p[1] + dx * hw]);
    R.push([p[0] + dy * hw, p[1] - dx * hw]);
  }
  const g = c.createLinearGradient(bx, by, tx, ty);
  if (b.dry === 2) {
    // a dead blade: straw to brown, pale at the tip
    g.addColorStop(0, hsl(b.hue, b.sat * 0.9, b.light * 0.55));
    g.addColorStop(0.5, hsl(b.hue + 2, b.sat, b.light * 0.95));
    g.addColorStop(1, hsl(b.hue + 6, b.sat * 0.8, b.light * 1.2));
  } else {
    g.addColorStop(0, hsl(b.hue - 6, b.sat, b.light * 0.42));
    g.addColorStop(0.3, hsl(b.hue, b.sat, b.light * 0.8));
    g.addColorStop(b.dry === 1 ? 0.6 : 0.75, hsl(b.hue - 3, b.sat * 1.03, b.light * 1.1));
    // a sun-dried tip: the green fades to straw
    g.addColorStop(1, b.dry === 1 ? hsl(44, 34, b.light * 1.35) : hsl(b.hue - 8, b.sat * 1.05, b.light * 1.25));
  }
  c.beginPath();
  c.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i <= N; i++) c.lineTo(L[i][0], L[i][1]);
  for (let i = N; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
  c.closePath();
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = hsl(b.hue, b.sat * 0.8, b.light * 0.36, 0.55);
  c.lineWidth = 0.7;
  c.stroke();
  if (b.w > 2.2) {
    c.beginPath();
    for (let i = 1; i < N - 1; i++) {
      const p = P(i / N);
      if (i === 1) c.moveTo(p[0], p[1]);
      else c.lineTo(p[0], p[1]);
    }
    c.strokeStyle = b.gloss ? hsl(b.hue - 8, 60, 78, 0.5) : hsl(b.hue - 10, b.sat * 0.75, b.light * 1.5, 0.28);
    c.lineWidth = Math.max(0.6, b.w * 0.22);
    c.stroke();
  }
}

interface TuftLook {
  n: number;
  /** tallest blade as a share of the tile height */
  H: number;
  /** root spread (share of the tile width) */
  spread: number;
  /** tip offset: max sideways lean (px) at the outer blades */
  lean: number;
  /** arch of the middle (px) */
  curve: number;
  wMin: number;
  wMax: number;
  /** >1: many short blades, a few tall ones */
  hPow: number;
  /** true = a fountain: the middle blades stand up, the outer ones arch outwards and are shorter */
  fountain: boolean;
  hue: number;
  light: number;
  /** JUNGLE DURBA: fresh, glossy, saturated green blades, no dead ones */
  fresh?: boolean;
  /** > 0: the tuft is this many small GROUPS of 2-3 thin blades of nearly the same length (jungle durba), not one dense bunch */
  groups?: number;
}

/** A tuft / clump picture: blades sorted from the back (darker, shorter) to the front, a dark ambient-occlusion shade at the root. */
function paintTuft(c: Ctx, tile: number, seed: number, T: TuftLook): number[] {
  const r = mulberry32(seed);
  const x0 = tile * LS;
  const base = LS * 0.985;
  const cx = LS / 2;
  const blades: Blade[] = [];
  if (T.groups) {
    // JUNGLE DURBA (2026-11-23): thin, long blades of nearly the same length, 2-3 of them together (one plant), the plants side by side; each plant a little lighter or deeper green
    for (let g = 0; g < T.groups; g++) {
      const gx = cx + ((g + 0.5) / T.groups - 0.5) * LS * T.spread + (r() - 0.5) * LS * 0.05;
      const gl = T.light * (0.78 + 0.5 * r()); // light .. deep
      const gh = T.hue + (r() - 0.5) * 14;
      const nb = 2 + (r() < 0.55 ? 1 : 0);
      const gH = LS * T.H * (0.86 + 0.14 * r());
      const out = (g / (T.groups - 1) - 0.5) * 2; // plants at the edges lean outwards
      for (let k = 0; k < nb; k++) {
        const s = (k - (nb - 1) / 2) * 0.5 + (r() - 0.5) * 0.2;
        blades.push({
          x: gx + s * 8, h: gH * (0.9 + 0.1 * r()), lean: out * T.lean * 0.5 + s * T.lean * 0.7 + (r() - 0.5) * 8, curve: s * T.curve + out * T.curve * 0.3 + (r() - 0.5) * 6,
          w: T.wMin + (T.wMax - T.wMin) * r(), hue: gh + (r() - 0.5) * 8, light: gl * (0.92 + 0.16 * r()), sat: 50 + 14 * r(), dry: 0, gloss: true,
        });
      }
    }
  }
  for (let i = 0; i < (T.groups ? 0 : T.n); i++) {
    const side = (r() + r() + r() - 1.5) / 1.5; // -1..1, centred
    const f = Math.abs(side);
    const hr = Math.pow(r(), T.hPow);
    let h = LS * T.H * (0.4 + 0.6 * hr);
    let lean = (r() - 0.5) * T.lean * 0.5;
    let curve = (r() - 0.5) * T.curve;
    if (T.fountain) {
      h *= 1 - 0.45 * f;
      lean = Math.sign(side || 1) * (0.25 + 0.75 * f) * T.lean * (0.5 + 0.5 * r());
      curve = Math.sign(side || 1) * T.curve * (0.2 + 0.8 * f) * (0.4 + 0.6 * r());
      if (f < 0.25) { lean *= 0.35; curve *= 0.35; }
    }
    // REAL COLOURS (2026-11-23): each blade has its own saturation (dull, not lime), a wider hue range (olive .. blue-green), ~1 in 7 blades dead (straw / brown), ~1 in 4 sun-dried at the tip
    const kr = r();
    const dead = !T.fresh && kr < 0.14;
    blades.push({
      x: cx + side * LS * T.spread * 0.5, h: dead ? h * (0.7 + 0.3 * r()) : h, lean, curve, w: T.wMin + (T.wMax - T.wMin) * r(),
      hue: dead ? 36 + 14 * r() : T.hue + (r() - 0.5) * 36, light: dead ? 38 + 16 * r() : T.light * (0.7 + 0.5 * r()),
      sat: dead ? 26 + 16 * r() : T.fresh ? 46 + 18 * r() : 30 + 22 * r(), dry: dead ? 2 : !T.fresh && kr < 0.4 ? 1 : 0, gloss: T.fresh,
    });
  }
  // a skirt of short blades round the root: the tuft is full at the bottom, no gap to the ground
  const skirt = T.groups ? 0 : Math.round(T.n * 0.45);
  for (let i = 0; i < skirt; i++) {
    const side = (r() + r() - 1) * 1.15;
    const dead = !T.fresh && r() < 0.1;
    blades.push({
      gloss: T.fresh, x: cx + side * LS * T.spread * 0.55, h: LS * T.H * (0.16 + 0.26 * r()), lean: side * T.lean * 0.3 + (r() - 0.5) * 20, curve: (r() - 0.5) * T.curve * 0.5,
      w: T.wMin + (T.wMax - T.wMin) * r() * 0.8, hue: dead ? 38 + 10 * r() : T.hue + (r() - 0.5) * 30, light: dead ? 36 + 12 * r() : T.light * (0.6 + 0.4 * r()), sat: dead ? 28 : T.fresh ? 44 + 16 * r() : 28 + 20 * r(), dry: dead ? 2 : 0,
    });
  }
  blades.sort((a, b) => a.h - b.h);
  const tops: number[] = [];
  blades.forEach((b, i) => {
    b.light *= 0.74 + 0.34 * (i / blades.length); // the back blades are in shade
    drawBlade(c, x0, base, b);
    if (i > blades.length * 0.8) tops.push(b.x + b.lean * 0.4);
  });
  // ambient occlusion at the root: darker, fading out towards ~38 % of the height
  c.save();
  c.globalCompositeOperation = 'source-atop';
  const ao = c.createLinearGradient(0, base, 0, base - LS * 0.4);
  ao.addColorStop(0, 'rgba(14,16,4,0.7)');
  ao.addColorStop(1, 'rgba(6,20,2,0)');
  c.fillStyle = ao;
  c.fillRect(x0, 0, LS, LS);
  c.restore();
  return tops;
}

/** Seed plumes of the savanna bunch grass: thin stems with a bristly tan / purple-brown plume on each. */
function paintPlumes(c: Ctx, tile: number, seed: number, count: number): void {
  const r = mulberry32(seed);
  const x0 = tile * LS;
  const base = LS * 0.985;
  for (let i = 0; i < count; i++) {
    const bx = x0 + LS / 2 + (r() - 0.5) * LS * 0.16;
    const lean = (r() - 0.5) * LS * 0.5;
    const hgt = LS * (0.56 + 0.2 * r()); // the plume must fit inside the tile (it sticks out ~0.16 above the stem tip)
    const tx = bx + lean, ty = base - hgt;
    const mx = bx + lean * 0.2 + (r() - 0.5) * 30, my = base - hgt * 0.55;
    const purple = r() < 0.3;
    c.beginPath();
    c.moveTo(bx, base);
    c.quadraticCurveTo(mx, my, tx, ty);
    c.strokeStyle = hsl(purple ? 330 : 52, 22, purple ? 34 : 48, 0.95);
    c.lineWidth = 1.5;
    c.stroke();
    const dx = tx - mx, dy = ty - my;
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l, uy = dy / l;
    const len = LS * (0.11 + 0.06 * r());
    // soft body of the plume
    const g = c.createLinearGradient(tx, ty, tx + ux * len, ty + uy * len);
    g.addColorStop(0, hsl(purple ? 335 : 40, purple ? 22 : 38, purple ? 40 : 58, 0.0));
    g.addColorStop(0.15, hsl(purple ? 335 : 40, purple ? 22 : 38, purple ? 40 : 58, 0.85));
    g.addColorStop(1, hsl(purple ? 340 : 36, purple ? 24 : 40, purple ? 55 : 72, 0.8));
    c.save();
    c.translate(tx, ty);
    c.rotate(Math.atan2(uy, ux));
    c.beginPath();
    c.ellipse(len * 0.5, 0, len * 0.55, 4.2, 0, 0, Math.PI * 2);
    c.fillStyle = g;
    c.fill();
    // bristles
    for (let k = 0; k < 26; k++) {
      const t = r();
      const px = len * t, off = (r() - 0.5) * 5;
      const bl = 7 + 8 * (1 - t);
      const a = (r() - 0.5) * 1.5;
      c.beginPath();
      c.moveTo(px, off);
      c.lineTo(px + Math.cos(a) * bl, off + Math.sin(a) * bl);
      c.strokeStyle = hsl(purple ? 338 : 38, purple ? 20 : 40, purple ? 52 : 66, 0.8);
      c.lineWidth = 0.8;
      c.stroke();
    }
    c.restore();
  }
}

/** Top-down picture of a rosette of broad, veined leaves (plantain / dock), seen from above; the card is a shallow cone. */
function paintLeafy(c: Ctx, tile: number, seed: number): void {
  const r = mulberry32(seed);
  const x0 = tile * LS;
  const cx = x0 + LS / 2, cy = LS / 2;
  const n = 8;
  const order = Array.from({ length: n }, (_, i) => i).sort(() => r() - 0.5);
  order.forEach((i, k) => {
    const ang = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.4;
    const len = LS * (0.38 + 0.09 * r());
    const wid = len * (0.36 + 0.08 * r());
    const hue = 96 + (r() - 0.5) * 22;
    const light = 19 + 7 * r() + k * 1.2;
    c.save();
    c.translate(cx, cy);
    c.rotate(ang);
    c.beginPath();
    c.moveTo(len * 0.02, 0);
    c.bezierCurveTo(len * 0.12, -wid * 0.85, len * 0.5, -wid * 1.05, len * 0.72, -wid * 0.55);
    c.bezierCurveTo(len * 0.86, -wid * 0.26, len * 0.96, -wid * 0.06, len, 0);
    c.bezierCurveTo(len * 0.96, wid * 0.06, len * 0.86, wid * 0.26, len * 0.72, wid * 0.55);
    c.bezierCurveTo(len * 0.5, wid * 1.05, len * 0.12, wid * 0.85, len * 0.02, 0);
    c.closePath();
    const g = c.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, hsl(hue, 52, light * 0.6));
    g.addColorStop(0.5, hsl(hue, 55, light));
    g.addColorStop(1, hsl(hue - 6, 55, light * 1.25));
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = hsl(hue, 45, light * 0.45, 0.85);
    c.lineWidth = 1.6;
    c.stroke();
    // light on one half of the leaf (it is folded along the rib)
    c.save();
    c.clip();
    c.fillStyle = hsl(hue - 8, 60, light * 1.6, 0.2);
    c.fillRect(0, -wid * 1.2, len, wid * 1.2);
    // veins: pale midrib and curving lateral veins
    c.strokeStyle = hsl(hue - 14, 42, light * 1.9, 0.6);
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(len * 0.93, 0);
    c.stroke();
    c.lineWidth = 1.1;
    c.strokeStyle = hsl(hue - 14, 42, light * 1.8, 0.38);
    for (let v = 1; v <= 6; v++) {
      const t = 0.1 + v * 0.13;
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(len * t, 0);
        c.quadraticCurveTo(len * (t + 0.1), s * wid * 0.32, len * (t + 0.2), s * wid * (0.82 - t * 0.55));
        c.stroke();
      }
    }
    c.restore();
    c.restore();
  });
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, LS * 0.14);
  g.addColorStop(0, 'rgba(8,24,4,0.75)');
  g.addColorStop(1, 'rgba(8,24,4,0)');
  c.fillStyle = g;
  c.fillRect(x0, 0, LS, LS);
}

/** Top-down picture of a patch of clover: many three-leaflet leaves with the pale chevron, overlapping. */
function paintTrefoil(c: Ctx, tile: number, seed: number): void {
  const r = mulberry32(seed);
  const x0 = tile * LS;
  const cx = x0 + LS / 2, cy = LS / 2;
  const leaves: { x: number; y: number; rot: number; s: number; l: number }[] = [];
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2, d = LS * 0.36 * Math.sqrt(r());
    leaves.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, rot: r() * Math.PI * 2, s: LS * (0.07 + 0.035 * r()), l: 26 + 10 * r() });
  }
  leaves.sort((a, b) => a.y - b.y);
  for (const lf of leaves) {
    for (let k = 0; k < 3; k++) {
      const a = lf.rot + k * 2.0944;
      const px = lf.x + Math.cos(a) * lf.s * 0.62, py = lf.y + Math.sin(a) * lf.s * 0.62;
      c.save();
      c.translate(px, py);
      c.rotate(a);
      c.beginPath();
      c.moveTo(-lf.s * 0.62, 0);
      c.bezierCurveTo(-lf.s * 0.4, -lf.s * 0.85, lf.s * 0.7, -lf.s * 0.8, lf.s * 0.82, -lf.s * 0.05);
      c.lineTo(lf.s * 0.74, 0);
      c.lineTo(lf.s * 0.82, lf.s * 0.05);
      c.bezierCurveTo(lf.s * 0.7, lf.s * 0.8, -lf.s * 0.4, lf.s * 0.85, -lf.s * 0.62, 0);
      c.closePath();
      const g = c.createRadialGradient(0, 0, 0, 0, 0, lf.s);
      g.addColorStop(0, hsl(104, 50, lf.l * 1.15));
      g.addColorStop(1, hsl(100, 52, lf.l * 0.8));
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = hsl(100, 45, lf.l * 0.45, 0.8);
      c.lineWidth = 1.2;
      c.stroke();
      // the pale chevron of a clover leaflet
      c.beginPath();
      c.moveTo(-lf.s * 0.3, -lf.s * 0.42);
      c.quadraticCurveTo(lf.s * 0.15, -lf.s * 0.1, lf.s * 0.1, 0);
      c.quadraticCurveTo(lf.s * 0.15, lf.s * 0.1, -lf.s * 0.3, lf.s * 0.42);
      c.strokeStyle = hsl(88, 38, 66, 0.55);
      c.lineWidth = 2.1;
      c.stroke();
      c.restore();
    }
  }
}


// ---------------------------------------------------------------------------------------------------------------------
// WILD FLOWERS: every tile = a low tuft of grass with 5-8 flowers on curved stems (pairs of leaves on the stems, a few buds).
// ---------------------------------------------------------------------------------------------------------------------

type FlowerKind = 'marigold' | 'buttercup' | 'lavender' | 'poppy' | 'cornflower' | 'cosmos';

/** One petal pointing along +x from the origin: a bezier outline with a gradient from the base colour to the tip colour, a darker rim and fine veins. */
function petal(c: Ctx, len: number, wid: number, base: string, tip: string, rim: string, roundness = 0.5, notch = 0, veins = true): void {
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(len * 0.15, -wid * 0.9, len * (0.55 + roundness * 0.3), -wid * (0.7 + roundness * 0.5), len * 0.96, -wid * 0.28);
  if (notch > 0) {
    c.quadraticCurveTo(len * (1.02 - notch), -wid * 0.1, len * (1 - notch * 1.4), 0);
    c.quadraticCurveTo(len * (1.02 - notch), wid * 0.1, len * 0.96, wid * 0.28);
  } else {
    c.quadraticCurveTo(len * 1.04, 0, len * 0.96, wid * 0.28);
  }
  c.bezierCurveTo(len * (0.55 + roundness * 0.3), wid * (0.7 + roundness * 0.5), len * 0.15, wid * 0.9, 0, 0);
  c.closePath();
  const g = c.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, base);
  g.addColorStop(1, tip);
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = rim;
  c.lineWidth = 0.8;
  c.stroke();
  if (veins) {
    c.strokeStyle = 'rgba(255,255,255,0.16)';
    c.lineWidth = 0.7;
    for (const o of [-0.3, 0, 0.3]) {
      c.beginPath();
      c.moveTo(len * 0.08, 0);
      c.lineTo(len * 0.88, wid * o * 0.7);
      c.stroke();
    }
  }
}

/** A flower head seen at an angle: `squash` flattens it (a head seen from the side), `rot` turns it. */
function flowerHead(c: Ctx, kind: FlowerKind, x: number, y: number, size: number, rot: number, squash: number, r: () => number): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(1, squash);
  const jit = (): number => (r() - 0.5) * 0.14;
  const light = r() < 0.3; // paler / deeper variants
  if (kind === 'marigold') {
    for (let layer = 0; layer < 2; layer++) {
      const n = layer ? 13 : 16;
      for (let i = 0; i < n; i++) {
        c.save();
        c.rotate((i / n) * Math.PI * 2 + layer * 0.2 + jit());
        const L = size * (layer ? 0.75 : 1) * (0.9 + 0.2 * r());
        petal(c, L, size * 0.17, layer ? (light ? 'hsl(32,95%,48%)' : 'hsl(24,95%,40%)') : (light ? 'hsl(36,95%,50%)' : 'hsl(26,95%,42%)'), light ? 'hsl(46,100%,62%)' : 'hsl(38,100%,56%)', 'hsla(20,80%,30%,0.6)', 0.2, 0.06);
        c.restore();
      }
    }
    const g = c.createRadialGradient(0, 0, 0, 0, 0, size * 0.28);
    g.addColorStop(0, 'hsl(18,70%,20%)');
    g.addColorStop(0.7, 'hsl(24,80%,30%)');
    g.addColorStop(1, 'hsl(30,85%,38%)');
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, size * 0.28, 0, Math.PI * 2); c.fill();
  } else if (kind === 'buttercup') {
    for (let i = 0; i < 5; i++) {
      c.save();
      c.rotate((i / 5) * Math.PI * 2 + jit() + 0.3);
      petal(c, size * 0.95, size * 0.5, 'hsl(48,100%,50%)', 'hsl(52,100%,62%)', 'hsla(44,90%,36%,0.7)', 1, 0, false);
      c.restore();
    }
    c.fillStyle = 'hsla(54,100%,80%,0.35)';
    c.beginPath(); c.arc(0, 0, size * 0.55, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'hsl(44,95%,36%)';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.beginPath(); c.arc(Math.cos(a) * size * 0.2, Math.sin(a) * size * 0.2, size * 0.045, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = 'hsl(70,50%,40%)';
    c.beginPath(); c.arc(0, 0, size * 0.1, 0, Math.PI * 2); c.fill();
  } else if (kind === 'poppy') {
    for (let i = 0; i < 4; i++) {
      c.save();
      c.rotate((i / 4) * Math.PI * 2 + jit() + 0.4);
      petal(c, size, size * 0.62, 'hsl(358,80%,30%)', light ? 'hsl(8,90%,56%)' : 'hsl(2,88%,48%)', 'hsla(356,70%,25%,0.6)', 1, 0, false);
      // crinkles
      c.strokeStyle = 'rgba(80,0,0,0.22)';
      c.lineWidth = 0.9;
      for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(size * 0.2, 0); c.quadraticCurveTo(size * 0.6, (k - 2) * size * 0.14 + (r() - 0.5) * 4, size * 0.94, (k - 2) * size * 0.22); c.stroke(); }
      // dark blotch at the base of the petal
      const g = c.createRadialGradient(size * 0.14, 0, 0, size * 0.14, 0, size * 0.3);
      g.addColorStop(0, 'rgba(10,0,0,0.85)');
      g.addColorStop(1, 'rgba(10,0,0,0)');
      c.fillStyle = g;
      c.fillRect(-size * 0.3, -size * 0.5, size, size);
      c.restore();
    }
    c.fillStyle = 'hsl(80,25%,28%)';
    c.beginPath(); c.arc(0, 0, size * 0.13, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(10,10,10,0.9)';
    c.lineWidth = 1;
    for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * size * 0.13, Math.sin(a) * size * 0.13); c.lineTo(Math.cos(a) * size * 0.26, Math.sin(a) * size * 0.26); c.stroke(); }
  } else if (kind === 'cornflower') {
    for (let layer = 0; layer < 2; layer++) {
      const n = layer ? 10 : 13;
      for (let i = 0; i < n; i++) {
        c.save();
        c.rotate((i / n) * Math.PI * 2 + layer * 0.25 + jit());
        const L = size * (layer ? 0.66 : 1) * (0.9 + 0.2 * r());
        petal(c, L, size * 0.15, layer ? 'hsl(226,70%,38%)' : 'hsl(228,72%,44%)', light ? 'hsl(222,90%,68%)' : 'hsl(224,88%,58%)', 'hsla(230,60%,25%,0.5)', 0.3, 0.14, false);
        c.restore();
      }
    }
    c.fillStyle = 'hsl(280,45%,24%)';
    c.beginPath(); c.arc(0, 0, size * 0.2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'hsl(290,55%,55%)';
    c.lineWidth = 1;
    for (let i = 0; i < 14; i++) { const a = r() * Math.PI * 2, d = size * 0.17 * r(); c.beginPath(); c.moveTo(Math.cos(a) * d, Math.sin(a) * d); c.lineTo(Math.cos(a) * (d + size * 0.1), Math.sin(a) * (d + size * 0.1)); c.stroke(); }
  } else {
    // cosmos
    for (let i = 0; i < 8; i++) {
      c.save();
      c.rotate((i / 8) * Math.PI * 2 + jit());
      petal(c, size, size * 0.4, light ? 'hsl(330,70%,58%)' : 'hsl(326,78%,36%)', light ? 'hsl(336,90%,84%)' : 'hsl(330,88%,62%)', 'hsla(325,70%,28%,0.5)', 0.9, 0.1, true);
      c.restore();
    }
    const g = c.createRadialGradient(0, 0, 0, 0, 0, size * 0.22);
    g.addColorStop(0, 'hsl(44,100%,52%)');
    g.addColorStop(1, 'hsl(36,95%,40%)');
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, size * 0.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'hsla(40,100%,25%,0.7)';
    for (let i = 0; i < 12; i++) { const a = r() * Math.PI * 2, d = size * 0.15 * Math.sqrt(r()); c.beginPath(); c.arc(Math.cos(a) * d, Math.sin(a) * d, 1.3, 0, Math.PI * 2); c.fill(); }
  }
  c.restore();
}

/** A spike of lavender florets on a stem: whorls of small purple flowers, thicker below, a tight bud at the tip, grey-green calyx. */
function lavenderSpike(c: Ctx, x0: number, y0: number, x1: number, y1: number, len: number, r: () => number): void {
  const dx = x1 - x0, dy = y1 - y0;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  const deep = r() < 0.5;
  const whorls = 11;
  for (let k = 0; k < whorls; k++) {
    const t = k / (whorls - 1);
    const px = x1 + ux * len * (t - 0.0) * 1, py = y1 + uy * len * t;
    const w = (1 - t * 0.55) * 10;
    for (let q = 0; q < 6; q++) {
      const a = (q / 6) * Math.PI * 2 + k * 0.9;
      const ox = Math.cos(a) * w * 0.9, oy = Math.sin(a) * w * 0.55;
      const fl = (a % 6.28) / 6.28;
      c.fillStyle = hsl(deep ? 262 : 270, deep ? 55 : 45, (deep ? 36 : 52) + fl * 14 + (1 - t) * 6, 0.97);
      c.beginPath();
      c.ellipse(px + ox - uy * 0, py + oy, 4.4, 6.2 - t * 1.6, uy * 0.4, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = hsl(255, 40, 24, 0.5);
      c.lineWidth = 0.6;
      c.stroke();
    }
    c.fillStyle = hsl(150, 15, 52, 0.85);
    c.beginPath(); c.ellipse(px, py, w * 0.55, 3, 0, 0, Math.PI * 2); c.fill();
  }
}

/** A lanceolate leaf attached at (x, y), pointing at `ang`. */
function stemLeaf(c: Ctx, x: number, y: number, ang: number, len: number, hue: number, light: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(len * 0.25, -len * 0.2, len * 0.7, -len * 0.16, len, 0);
  c.bezierCurveTo(len * 0.7, len * 0.14, len * 0.25, len * 0.16, 0, 0);
  const g = c.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, hsl(hue, 50, light * 0.7));
  g.addColorStop(1, hsl(hue - 6, 55, light * 1.2));
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = hsl(hue - 14, 40, light * 1.7, 0.45);
  c.lineWidth = 0.9;
  c.beginPath(); c.moveTo(0, 0); c.lineTo(len * 0.92, 0); c.stroke();
  c.restore();
}

/** One flower tile: grass blades low down, then 5-8 flowers on curved stems (tall ones behind), each with leaves and some buds. */
function paintFlowerTuft(c: Ctx, tile: number, seed: number, kind: FlowerKind): void {
  const r = mulberry32(seed);
  const x0 = tile * LS;
  paintTuft(c, tile, seed + 1, { n: 60, H: 0.46, spread: 0.55, lean: 100, curve: 80, wMin: 2.2, wMax: 4.4, hPow: 1, fountain: true, hue: 96, light: 30 });
  const base = LS * 0.985;
  const count = kind === 'buttercup' ? 8 : kind === 'poppy' ? 5 : kind === 'lavender' ? 6 : 6;
  const size = kind === 'buttercup' ? 22 : kind === 'poppy' ? 38 : kind === 'cornflower' ? 27 : kind === 'cosmos' ? 36 : 30;
  const stems: { bx: number; hx: number; hy: number }[] = [];
  for (let i = 0; i < count; i++) {
    const f = (i + 0.5) / count;
    stems.push({ bx: x0 + LS * (0.5 + (r() - 0.5) * 0.3), hx: x0 + LS * (kind === 'lavender' ? 0.28 + 0.44 * f : 0.1 + 0.8 * f) + (r() - 0.5) * 30, hy: LS * (kind === 'lavender' ? 0.3 + 0.3 * r() : 0.14 + 0.36 * r()) + size * 0.9 });
  }
  stems.sort((a, b) => a.hy - b.hy); // tallest first = furthest back
  for (const st of stems) {
    const mx = st.bx + (st.hx - st.bx) * 0.25 + (r() - 0.5) * 24, my = base - (base - st.hy) * 0.55;
    c.beginPath();
    c.moveTo(st.bx, base);
    c.quadraticCurveTo(mx, my, st.hx, st.hy);
    const g = c.createLinearGradient(0, base, 0, st.hy);
    g.addColorStop(0, hsl(100, 45, 20));
    g.addColorStop(1, hsl(92, 50, 34));
    c.strokeStyle = g;
    c.lineWidth = kind === 'lavender' ? 2.4 : 2.8;
    c.stroke();
    // leaves along the stem
    for (let k = 0; k < 2; k++) {
      const t = 0.25 + 0.3 * k + 0.1 * r();
      const px = (1 - t) * (1 - t) * st.bx + 2 * (1 - t) * t * mx + t * t * st.hx;
      const py = (1 - t) * (1 - t) * base + 2 * (1 - t) * t * my + t * t * st.hy;
      stemLeaf(c, px, py, (k % 2 ? -0.5 : Math.PI + 0.5) + (r() - 0.5) * 0.4 - 0.5 * (k % 2 ? 0 : 1) + 0.2, 34 + 22 * r(), 100, 30);
    }
    if (kind === 'lavender') {
      lavenderSpike(c, st.bx, base, st.hx, st.hy, LS * 0.3, r);
    } else if (r() < 0.18) {
      // a bud: a small closed head tinted with the flower's colour
      c.fillStyle = hsl(100, 45, 30);
      c.beginPath(); c.ellipse(st.hx, st.hy, size * 0.28, size * 0.38, 0.3, 0, Math.PI * 2); c.fill();
      c.fillStyle = kind === 'poppy' ? 'hsl(2,85%,45%)' : kind === 'cornflower' ? 'hsl(226,75%,50%)' : kind === 'cosmos' ? 'hsl(330,80%,55%)' : kind === 'marigold' ? 'hsl(30,95%,48%)' : 'hsl(50,100%,52%)';
      c.beginPath(); c.ellipse(st.hx, st.hy - size * 0.12, size * 0.2, size * 0.18, 0.3, 0, Math.PI * 2); c.fill();
    } else {
      flowerHead(c, kind, st.hx, st.hy, size * (0.85 + 0.3 * r()), (r() - 0.5) * 0.8, 0.55 + 0.4 * r(), r);
    }
  }
}

/** The whole atlas (a strip of GRASS_TILES square tiles) as a mip-mapped texture; null where there is no canvas (tests, servers). */
export function makeGrassAtlas(): THREE.DataTexture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = GRASS_TILE * GRASS_TILES;
  cv.height = GRASS_TILE;
  const c = cv.getContext('2d', { willReadFrequently: true });
  if (!c) return null;
  paintGrassAtlas(c);
  return atlasTexture(c, cv.width, GRASS_TILE, GRASS_TILES, 1);
}

/** Paints every tile onto `c` (a canvas GRASS_TILE * GRASS_TILES wide, GRASS_TILE high). Exported so the pictures can be looked at in a plain browser page. */
export function paintGrassAtlas(c: Ctx): void {
  c.save();
  c.scale(K, K);
  // tile 0: solid white (everything without a picture samples it)
  c.fillStyle = '#fff';
  c.fillRect(GT.white * LS, 0, LS, LS);
  const clip = (tile: number): void => {
    c.restore();
    c.save();
    c.scale(K, K);
    c.beginPath();
    c.rect(tile * LS, 0, LS, LS);
    c.clip();
  };
  clip(GT.lawn);
  paintTuft(c, GT.lawn, 101, { n: 95, H: 0.88, spread: 0.62, lean: 55, curve: 38, wMin: 2.0, wMax: 4.2, hPow: 1.1, fountain: false, hue: 96, light: 30 });
  clip(GT.wild);
  paintTuft(c, GT.wild, 202, { n: 60, H: 0.96, spread: 0.55, lean: 150, curve: 120, wMin: 2.4, wMax: 5, hPow: 0.9, fountain: false, hue: 92, light: 31 });
  clip(GT.clump);
  paintTuft(c, GT.clump, 303, { n: 22, H: 0.82, spread: 0.45, lean: 130, curve: 90, wMin: 7, wMax: 13, hPow: 0.8, fountain: true, hue: 100, light: 30 });
  clip(GT.tussock);
  paintTuft(c, GT.tussock, 404, { n: 120, H: 0.94, spread: 0.3, lean: 150, curve: 130, wMin: 2.8, wMax: 5.5, hPow: 0.7, fountain: true, hue: 94, light: 30 });
  clip(GT.tussockWide);
  paintTuft(c, GT.tussockWide, 505, { n: 140, H: 0.88, spread: 0.46, lean: 230, curve: 190, wMin: 2.6, wMax: 5.2, hPow: 0.8, fountain: true, hue: 90, light: 31 });
  clip(GT.tussockSeed);
  paintTuft(c, GT.tussockSeed, 606, { n: 110, H: 0.7, spread: 0.34, lean: 170, curve: 150, wMin: 2.8, wMax: 5.4, hPow: 0.75, fountain: true, hue: 92, light: 30 });
  paintPlumes(c, GT.tussockSeed, 607, 17);
  clip(GT.leafy);
  paintLeafy(c, GT.leafy, 707);
  clip(GT.trefoil);
  paintTrefoil(c, GT.trefoil, 808);
  clip(GT.durba);
  // JUNGLE DURBA: fine, smooth, glossy bright-green blades, creeping low, no dead ones
  paintTuft(c, GT.durba, 1515, { n: 0, groups: 9, H: 0.9, spread: 0.8, lean: 44, curve: 30, wMin: 1.5, wMax: 2.6, hPow: 1, fountain: false, hue: 108, light: 35, fresh: true });
  const kinds: [number, FlowerKind][] = [[GT.daisy, 'marigold'], [GT.buttercup, 'buttercup'], [GT.lavender, 'lavender'], [GT.poppy, 'poppy'], [GT.cornflower, 'cornflower'], [GT.clover, 'cosmos']];
  kinds.forEach(([t, k], i) => {
    clip(t);
    paintFlowerTuft(c, t, 900 + i * 37, k);
  });
  c.restore();
}
