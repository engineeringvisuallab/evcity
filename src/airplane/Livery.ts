// AIRCRAFT LIVERIES painted with the canvas 2D API (works in the browser; in a test any canvas implementation can be passed in). Pure drawing code: no three.js.
// The fuselage texture is UV-mapped by the meshes (u = x along the fuselage from the tail 0 to the nose 1, v = angle round the fuselage: 0 / 1 = right (starboard)
// side, .25 = top, .5 = left (port) side, .75 = belly). It is drawn in METRES of the aircraft surface, then the two sides are placed so they read correctly
// (port side mirrored horizontally, starboard side flipped vertically, see drawSides).
//   - EVCity airliner: white, grey belly, windows, doors, EVCity text + leaf logo, green swoosh at the rear, cockpit windows. Tail: blue with the leaf emblem.
//   - EVCity fighter: dark stealth grey with panel lines, green accent, small EVCity marks. Tail: grey with the emblem.
// All sizes are in canvas pixels; textures are 2048 x 1024 (fuselage) and 512 x 512 (fin). The next stage can raise them to 4K without touching the meshes.

export interface Ctx2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  save(): void; restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  translate(x: number, y: number): void; scale(x: number, y: number): void; rotate(a: number): void;
  beginPath(): void; closePath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void;
  bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  fill(): void; stroke(): void; fillRect(x: number, y: number, w: number, h: number): void; strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(t: string, x: number, y: number): void;
  measureText(t: string): { width: number };
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient;
}

export const LIVERY = {
  white: '#f3f5f5', grey: '#b9bec2', blue: '#0e5b8c', navy: '#0a3d66', green: '#2fae4a', lightGreen: '#6fd36a', glass: '#18222d', dark: '#565d64', darkest: '#30353a',
} as const;

/** Fuselage geometry the painter needs (m): length, tail x, circumference of the cylindrical part. */
export const FUSE_LEN = 44.6;
export const FUSE_TAIL_X = -22.3;
const FUSE_CIRC = 2 * Math.PI * 2.05;

type Side = 'stbd' | 'port';

/**
 * Paint both sides of the airliner. `paint(c, side, glyph)` draws in METRES of the aircraft surface: painter x = world x (towards the nose), y = up the side from the
 * centre line. Shapes are drawn as they are (the aircraft is mirror symmetric). `glyph(x, y)` switches to a transform for TEXT and the logo (anything with a handedness)
 * placed at (x, y): a viewer on the starboard side sees the nose on the right, one on the port side sees it on the LEFT, so port glyphs are mirrored in the canvas
 * and read from the nose towards the tail; starboard glyphs read towards the nose. After glyph() draw with y down / x along the reading direction, in metres.
 */
function drawSides(ctx: Ctx2D, W: number, H: number, paint: (c: Ctx2D, side: Side, glyph: (x: number, y: number) => void) => void): void {
  const sx = W / FUSE_LEN, sy = H / FUSE_CIRC, X = (x: number): number => (x - FUSE_TAIL_X) * sx;
  const run = (side: Side, cy: number): void => {
    ctx.save();
    // shapes: x -> (x - tail) * sx; starboard: canvas y grows UP the side (v .. .25 = top), port: canvas y grows DOWN (v .5 .. .75 = belly)
    const up = side === 'stbd' ? sy : -sy;
    ctx.setTransform(sx, 0, 0, up, -FUSE_TAIL_X * sx, cy);
    paint(ctx, side, (x, y) => {
      if (side === 'stbd') ctx.setTransform(sx, 0, 0, -sy, X(x), cy + sy * y);
      else ctx.setTransform(-sx, 0, 0, sy, X(x), cy - sy * y);
    });
    ctx.restore();
  };
  run('stbd', 0);
  run('stbd', H);
  run('port', H / 2);
}

function rrect(c: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  c.lineTo(x + w, y + h - r); c.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  c.lineTo(x + r, y + h); c.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  c.lineTo(x, y + r); c.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  c.closePath();
}

/** The EVCity leaf emblem (two overlapping leaves and a swoosh), centred at (0, 0), about `s` metres wide. Y points UP in the painter's space. */
export function drawLeaf(c: Ctx2D, s: number, colorA: string, colorB: string): void {
  c.save();
  c.scale(s, s);
  c.fillStyle = colorA;
  c.beginPath(); c.moveTo(-0.5, -0.1); c.bezierCurveTo(-0.45, 0.35, 0.05, 0.55, 0.5, 0.45); c.bezierCurveTo(0.45, 0.0, 0.1, -0.3, -0.5, -0.1); c.closePath(); c.fill();
  c.fillStyle = colorB;
  c.beginPath(); c.moveTo(-0.45, -0.28); c.bezierCurveTo(-0.2, -0.1, 0.2, -0.05, 0.45, 0.12); c.bezierCurveTo(0.2, -0.45, -0.2, -0.55, -0.45, -0.28); c.closePath(); c.fill();
  c.restore();
}

export function paintAirlinerFuselage(ctx: Ctx2D, W: number, H: number): void {
  ctx.fillStyle = LIVERY.white;
  ctx.fillRect(0, 0, W, H);
  // grey belly: v 0.60 .. 0.90 (soft edges)
  const g = ctx.createLinearGradient(0, 0.56 * H, 0, 0.64 * H);
  g.addColorStop(0, LIVERY.white); g.addColorStop(1, LIVERY.grey);
  ctx.fillStyle = g; ctx.fillRect(0, 0.56 * H, W, 0.08 * H);
  ctx.fillStyle = LIVERY.grey; ctx.fillRect(0, 0.64 * H, W, 0.22 * H);
  const g2 = ctx.createLinearGradient(0, 0.86 * H, 0, 0.94 * H);
  g2.addColorStop(0, LIVERY.grey); g2.addColorStop(1, LIVERY.white);
  ctx.fillStyle = g2; ctx.fillRect(0, 0.86 * H, W, 0.08 * H);

  drawSides(ctx, W, H, (c, side, glyph) => {
    const shape = (): void => { /* the shape transform is the default one set by drawSides; re-apply it after a glyph block */ };
    void shape;
    // rear swoosh: green wedge widening towards the tail, with a blue stripe under it
    c.fillStyle = LIVERY.green;
    c.beginPath(); c.moveTo(-3, -0.35); c.bezierCurveTo(-9, -0.2, -16, 0.2, -22.4, 1.3); c.lineTo(-22.4, 3.2); c.lineTo(-22.4, -1.9); c.bezierCurveTo(-16, -1.1, -9, -0.9, -3, -0.9); c.closePath(); c.fill();
    c.fillStyle = LIVERY.blue;
    c.beginPath(); c.moveTo(-3, -0.9); c.bezierCurveTo(-9, -0.9, -16, -1.1, -22.4, -1.9); c.lineTo(-22.4, -2.6); c.bezierCurveTo(-16, -1.8, -9, -1.5, -3, -1.45); c.closePath(); c.fill();
    // windows: a row above the centre line, none at the doors
    for (let x = 17.6; x > -15.6; x -= 0.52) {
      if ((x < 16.9 && x > 15.2) || (x < -14.0 && x > -15.6) || (x < 1.5 && x > -0.3) || (x < -3.2 && x > -4.6)) continue;
      rrect(c, x - 0.12, 0.5, 0.24, 0.34, 0.08); c.fillStyle = LIVERY.glass; c.fill();
    }
    // doors (thin outlines) and overwing exits
    c.strokeStyle = '#9aa1a6'; c.lineWidth = 0.025;
    for (const [x, w, h] of [[16.05, 1.0, 1.9], [-14.8, 0.9, 1.8], [0.6, 0.55, 0.9], [-3.9, 0.55, 0.9]] as [number, number, number][]) { rrect(c, x - w / 2, -0.75, w, h, 0.12); c.stroke(); }
    // cockpit windows (nose, upper front)
    c.fillStyle = LIVERY.glass;
    for (const [x0, x1] of [[19.4, 19.95], [19.98, 20.5], [20.52, 20.95]] as [number, number][]) { c.beginPath(); c.moveTo(x0, 1.5); c.lineTo(x1, 1.5); c.lineTo(x1 + 0.1, 0.85); c.lineTo(x0 + 0.05, 0.85); c.closePath(); c.fill(); }
    // EVCity text + leaf logo: starboard reads towards the nose, port towards the tail; the block sits between x = 5.4 and 12.4, below the window row
    const x0 = side === 'stbd' ? 6.4 : 12.4;
    glyph(x0, -0.55);
    c.fillStyle = LIVERY.blue; c.font = 'bold 1.5px Arial, Helvetica, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('EV', 0, 0);
    c.fillStyle = LIVERY.green; c.fillText('City', c.measureText('EV').width + 0.05, 0);
    glyph(side === 'stbd' ? 5.2 : 13.6, -0.55);
    c.scale(1, -1); // leaf is drawn with y up
    drawLeaf(c, 1.7, LIVERY.green, LIVERY.blue);
  });
  // windscreen seen from the top (v around .25): a dark band across the nose, u from x = 19.2 to 21 m
  const u0 = (19.2 - FUSE_TAIL_X) / FUSE_LEN * W, u1 = (21.0 - FUSE_TAIL_X) / FUSE_LEN * W;
  ctx.fillStyle = LIVERY.glass; ctx.fillRect(u0, 0.205 * H, u1 - u0, 0.09 * H);
}

export function paintAirlinerFin(ctx: Ctx2D, W: number, H: number): void {
  // u: 0 trailing edge .. 1 leading edge (towards the nose); v: 0 root .. 1 tip, and the canvas y = v * H: canvas y grows UP the fin (no flip), so the leaf is drawn upright.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b4a78'); g.addColorStop(1, '#0a3a62');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save();
  // green sweep through the lower part (root side), light blue band above it
  ctx.fillStyle = LIVERY.green;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 0.18 * H); ctx.bezierCurveTo(0.6 * W, 0.12 * H, 0.3 * W, 0.3 * H, 0, 0.55 * H); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1f7fb0';
  ctx.beginPath(); ctx.moveTo(0, 0.55 * H); ctx.bezierCurveTo(0.3 * W, 0.3 * H, 0.6 * W, 0.12 * H, W, 0.18 * H); ctx.lineTo(W, 0.27 * H); ctx.bezierCurveTo(0.6 * W, 0.2 * H, 0.3 * W, 0.4 * H, 0, 0.66 * H); ctx.closePath(); ctx.fill();
  // emblem (upper middle)
  ctx.translate(0.5 * W, 0.6 * H);
  drawLeaf(ctx, 0.46 * W, '#ffffff', LIVERY.lightGreen);
  ctx.restore();
}

export function paintFighterFuselage(ctx: Ctx2D, W: number, H: number): void {
  ctx.fillStyle = LIVERY.dark;
  ctx.fillRect(0, 0, W, H);
  // belly a little darker
  ctx.fillStyle = LIVERY.darkest; ctx.globalAlpha = 0.55; ctx.fillRect(0, 0.6 * H, W, 0.3 * H); ctx.globalAlpha = 1;
  // panel lines (stealth skin): thin dark lines along and across
  ctx.strokeStyle = '#2a2f34'; ctx.lineWidth = Math.max(1, W / 1024);
  for (let i = 1; i < 14; i++) { ctx.beginPath(); ctx.moveTo((i / 14) * W, 0); ctx.lineTo((i / 14) * W, H); ctx.stroke(); }
  for (const v of [0.1, 0.18, 0.32, 0.4, 0.6, 0.68, 0.82, 0.9]) { ctx.beginPath(); ctx.moveTo(0, v * H); ctx.lineTo(W, v * H); ctx.stroke(); }
  // panel shade patches (a lighter and a darker grey, like worn coating)
  ctx.globalAlpha = 0.22;
  for (let i = 0; i < 36; i++) { const x = ((i * 137) % 100) / 100 * W, y = ((i * 71) % 100) / 100 * H; ctx.fillStyle = i % 2 ? '#7a828a' : '#262a2e'; ctx.fillRect(x, y, W / 18, H / 14); }
  ctx.globalAlpha = 1;
  // green accent stripe behind the canopy and small leaf marks on both sides
  const FL = 15.7, fx = (x: number): number => ((x + 7.8) / FL) * W;
  ctx.fillStyle = LIVERY.green;
  for (const v of [0.02, 0.48]) ctx.fillRect(fx(-1.6), (v - 0.012) * H, fx(1.4) - fx(-1.6), 0.024 * H);
  for (const v of [0.0, 0.5]) { ctx.save(); ctx.translate(fx(2.7), v * H); ctx.scale(W / FL * 0.9, H / 5.0 * 0.9); drawLeaf(ctx, 1, LIVERY.green, '#ffffff'); ctx.restore(); }
}

export function paintFighterFin(ctx: Ctx2D, W: number, H: number): void {
  ctx.fillStyle = '#4a5157'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#2d3236'; ctx.lineWidth = 2;
  for (const f of [0.33, 0.66]) { ctx.beginPath(); ctx.moveTo(f * W, 0); ctx.lineTo(f * W, H); ctx.stroke(); }
  ctx.save(); ctx.translate(0.5 * W, 0.55 * H); drawLeaf(ctx, 0.42 * W, LIVERY.green, '#ffffff'); ctx.restore();
  ctx.fillStyle = '#e8ecee'; ctx.font = `bold ${Math.round(0.13 * H)}px Arial, Helvetica, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.save(); ctx.translate(0.5 * W, 0.25 * H); ctx.scale(1, -1); ctx.fillText('EVCity', 0, 0); ctx.restore();
}
