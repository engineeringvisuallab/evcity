// MILITARY FIGHTER mesh (no three.js): a stealth multirole fighter (F-35 class: 15.7 m long, 10.7 m wing span), built from lofted sections: a chined, blended
// fuselage, a bubble canopy, side intakes, trapezoid wings with a thin airfoil, tailplanes, TWO canted fins and a round afterburner nozzle, landing gear.
// Same local frame and pieces as the airliner (src/airplane/AirplaneMesh.ts): nose towards +X, +Y up, +Z = right wing, origin on the ground under the middle of the
// fuselage. Pieces: fuselage (UV-mapped, camo + panel lines texture), fin (UV-mapped tail texture, used by both fins), body, gear, lights.
import { srgb } from '../army/ArmyPlan';
import { Geo, airfoilOutline, lerp, mix, type V3 } from './Loft';
import type { PlaneMeshData } from './AirplaneMesh';

export const FIGHTER_COLORS = {
  hull: srgb(0x565d64),
  hullLight: srgb(0x6a7279),
  dark: srgb(0x30353a),
  nose: srgb(0x3b4146),
  glass: srgb(0x3a2e1c),
  frame: srgb(0x23272b),
  intake: srgb(0x111314),
  nozzle: srgb(0x3b3f42),
  nozzleHot: srgb(0x6b5a4a),
  green: srgb(0x2fae4a),
  tyre: srgb(0x1b1b1c),
  hub: srgb(0x9a9ea2),
  strut: srgb(0xb8bcc0),
  lightRed: srgb(0xff2a2a),
  lightGreen: srgb(0x20ff60),
  lightWhite: srgb(0xfff4d6),
} as const;

export const FIGHTER_DIMS = { length: 15.7, span: 10.7, belly: 0.75, height: 4.5, noseX: 7.9, tailX: -7.8 } as const;

const C = FIGHTER_COLORS;

/** Fuselage stations: x, half width, half height, centre height. */
const FUSE: [number, number, number, number][] = [
  [7.9, 0.04, 0.04, 1.85],
  [7.3, 0.28, 0.26, 1.9],
  [6.2, 0.7, 0.5, 2.0],
  [4.6, 1.05, 0.72, 2.1],
  [2.2, 1.38, 0.82, 2.15],
  [-1.5, 1.52, 0.86, 2.15],
  [-4.6, 1.38, 0.82, 2.15],
  [-6.6, 1.05, 0.78, 2.2],
  [-7.5, 0.82, 0.78, 2.2],
];
const SEGS = 28;
const sp = (v: number, e: number): number => Math.sign(v) * Math.pow(Math.abs(v), 2 / e); // superellipse exponent e (3 = squarer, chined)

function fuseAt(x: number): { rx: number; ry: number; cy: number } {
  for (let i = 0; i + 1 < FUSE.length; i++) {
    const a = FUSE[i], b = FUSE[i + 1];
    if (x <= a[0] && x >= b[0]) { const t = (a[0] - x) / (a[0] - b[0] || 1); return { rx: lerp(a[1], b[1], t), ry: lerp(a[2], b[2], t), cy: lerp(a[3], b[3], t) }; }
  }
  return { rx: 0.1, ry: 0.1, cy: 2.1 };
}

export function buildFighterMesh(): PlaneMeshData {
  const fuse = new Geo(), body = new Geo(), fin = new Geo(), gear = new Geo(), lights = new Geo();
  const x0 = FIGHTER_DIMS.tailX, x1 = FIGHTER_DIMS.noseX;

  // ---- fuselage (UV mapped: u along x, v round: 0 = right side, .25 top, .5 left, .75 belly)
  const xs: number[] = [];
  for (let i = 0; i + 1 < FUSE.length; i++) { const a = FUSE[i][0], b = FUSE[i + 1][0], n = Math.max(1, Math.round(Math.abs(a - b) / 0.7)); for (let k = 0; k < n; k++) xs.push(lerp(a, b, k / n)); }
  xs.push(FUSE[FUSE.length - 1][0]);
  const rings: V3[][] = xs.map((x) => {
    const s = fuseAt(x), ring: V3[] = [];
    for (let j = 0; j < SEGS; j++) { const a = (j / SEGS) * Math.PI * 2; ring.push([x, s.cy + s.ry * sp(Math.sin(a), 3), s.rx * sp(Math.cos(a), 3)]); }
    return ring;
  });
  fuse.loft(rings, (r, j) => (xs[r] > 6 ? C.nose : Math.sin((j / SEGS) * Math.PI * 2) < -0.3 ? C.hull : C.hullLight), (r, j) => [(xs[r] - x0) / (x1 - x0), j / SEGS], { start: false, end: true });

  // ---- bubble canopy (dark amber glass on a frame) on top of the fuselage
  {
    const st: [number, number, number, number][] = [[5.6, 0.05, 0.05, 2.45], [4.9, 0.38, 0.3, 2.6], [3.4, 0.52, 0.5, 2.78], [1.8, 0.46, 0.42, 2.74], [0.7, 0.3, 0.2, 2.62], [0.2, 0.05, 0.05, 2.5]];
    const c: V3[][] = st.map(([x, rx, ry, cy]) => { const ring: V3[] = []; for (let j = 0; j < 14; j++) { const a = (j / 14) * Math.PI * 2; ring.push([x, cy + ry * Math.sin(a), rx * Math.cos(a)]); } return ring; });
    body.loft(c, (r, j) => (j > 6 || r === 0 || r === st.length - 1 ? C.frame : C.glass), undefined, { start: true, end: true });
  }
  // ---- side air intakes (dark mouths under the shoulders)
  for (const side of [1, -1] as const) body.box(3.1, 1.5, side * 1.22, 1.5, 0.7, 0.6, C.intake);

  // ---- wings: trapezoid, thin airfoil, slight anhedral
  const panel = (side: 1 | -1, zRoot: number, zTip: number, xLE: number, sweep: number, cRoot: number, cTip: number, yRoot: number, dy: number, tRoot: number, tTip: number, n: number): V3[][] => {
    const out: V3[][] = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n, chord = lerp(cRoot, cTip, t), xle = xLE - sweep * t, y0 = yRoot + dy * t, z = side * lerp(zRoot, zTip, t);
      out.push(airfoilOutline(8, lerp(tRoot, tTip, t), 0).map(([xc, yc]) => [xle - xc * chord, y0 + yc * chord, z] as V3));
    }
    return out;
  };
  for (const side of [1, -1] as const) {
    body.loft(panel(side, 1.2, 5.35, 1.0, 3.4, 5.6, 1.5, 1.95, -0.25, 0.07, 0.04, 5), (_r, j) => (j <= 8 ? C.hullLight : C.hull), undefined, { start: false, end: true });
    body.loft(panel(side, 0.9, 2.9, -4.2, 1.5, 3.2, 1.3, 2.2, -0.15, 0.06, 0.04, 3), (_r, j) => (j <= 8 ? C.hullLight : C.hull), undefined, { start: false, end: true }); // tailplane
    lights.box(-3.1, 1.7, side * 5.4, 0.2, 0.16, 0.2, side > 0 ? C.lightGreen : C.lightRed); // wing-tip nav lights
  }

  // ---- two canted fins (outwards 22 degrees): own mesh, with the tail texture (u = chord LE->TE, v = height)
  {
    const outline = airfoilOutline(8, 0.08, 0);
    for (const side of [1, -1] as const) {
      const r: V3[][] = [], cant = (22 * Math.PI) / 180;
      for (let k = 0; k <= 5; k++) {
        const t = k / 5, chord = lerp(3.6, 1.5, t), xle = -2.9 - 1.9 * t, h = 2.6 * t;
        const y = 2.9 + h * Math.cos(cant), z = side * (0.8 + h * Math.sin(cant));
        r.push(outline.map(([xc, yc]) => [xle - xc * chord, y, z + yc * chord] as V3));
      }
      fin.loft(r, () => C.hullLight, (rr, j) => [1 - outline[j % outline.length][0], rr / 5], { start: false, end: true });
    }
  }

  // ---- afterburner nozzle: a ring of petals (a short dark cylinder with a lighter hot inner ring)
  {
    const n: V3[][] = [];
    for (const [x, r] of [[-7.4, 0.8], [-8.0, 0.74], [-8.2, 0.7]] as [number, number][]) { const ring: V3[] = []; for (let j = 0; j < 16; j++) { const a = (j / 16) * Math.PI * 2; ring.push([x, 2.2 + r * Math.sin(a), r * Math.cos(a)]); } n.push(ring); }
    body.loft(n, () => C.nozzle, undefined, { start: false, end: false });
    const h: V3[][] = [];
    for (const [x, r] of [[-8.18, 0.62], [-7.7, 0.5]] as [number, number][]) { const ring: V3[] = []; for (let j = 0; j < 16; j++) { const a = (j / 16) * Math.PI * 2; ring.push([x, 2.2 + r * Math.sin(a), r * Math.cos(a)]); } h.push(ring); }
    body.loft(h, () => C.nozzleHot, undefined, { start: true, end: true });
  }

  // ---- landing gear (hidden in flight): nose leg + two main legs
  const wheel = (x: number, z: number, r: number, w: number): void => {
    gear.cylinder('z', x, r, z, r, w, C.tyre, 12);
    gear.cylinder('z', x, r, z, r * 0.55, w + 0.03, C.hub, 8);
  };
  gear.box(4.4, 0.3, 0, 0.14, 1.0, 0.14, C.strut);
  wheel(4.4, 0, 0.3, 0.16);
  for (const side of [1, -1] as const) { gear.box(-1.4, 0.35, side * 1.45, 0.18, 1.2, 0.18, C.strut); wheel(-1.4, side * 1.45, 0.4, 0.2); }
  lights.box(-7.6, 3.2, 0, 0.2, 0.2, 0.2, C.lightWhite);

  void mix;
  return { fuselage: fuse.build(), body: body.build(), fin: fin.build(), gear: gear.build(), lights: lights.build() };
}
