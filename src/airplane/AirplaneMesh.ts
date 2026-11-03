// AIRLINER mesh (no three.js): a realistic twin-engine narrow-body passenger jet (A321 class: 44.5 m long, 35.8 m wing span), built from lofted cross-sections:
// round fuselage with a drooped nose and an up-swept tail cone, swept tapered wings with a real airfoil section, dihedral and sharklets, turbofan nacelles with
// a fan face and exhaust cone, vertical fin and tailplane, retractable landing gear with wheels, navigation lights.
// Local frame: nose towards +X, +Y up, +Z = right wing (looking forward). Origin = on the ground under the middle of the fuselage (the wheels touch y = 0).
// Pieces (so the renderer can give each its own material): `fuselage` (UV-mapped: the livery texture, see Livery.ts, with a vertex-colour fallback), `fin` (UV-mapped
// tail texture), `body` (wings, engines, stabilisers: vertex colours), `gear` (hidden in flight), `lights` (emissive).
import { srgb } from '../army/ArmyPlan';
import { Geo, airfoilOutline, concatGeo, lerp, mix, type GeoArrays, type V3 } from './Loft';

export const PLANE_COLORS = {
  hull: srgb(0xf3f5f5),
  belly: srgb(0xb9bec2),
  stripe: srgb(0x2fae4a), // EVCity green
  blue: srgb(0x0e5b8c), // EVCity blue
  tail: srgb(0x0e5b8c),
  wingTop: srgb(0xe4e7e9),
  wingBottom: srgb(0xb4babe),
  engine: srgb(0xdfe2e3),
  engineIn: srgb(0x23262a),
  engineCore: srgb(0x6a6f73),
  glass: srgb(0x1a232d),
  tyre: srgb(0x1b1b1c),
  hub: srgb(0xa8acb0),
  strut: srgb(0xb8bcc0),
  lightRed: srgb(0xff2a2a),
  lightGreen: srgb(0x20ff60),
  lightWhite: srgb(0xfff4d6),
} as const;

export const PLANE_DIMS = {
  length: 44.6,
  span: 35.8,
  /** Height of the fuselage underside above the ground (gear down). */
  belly: 1.8,
  tailHeight: 12.4,
  /** x of the nose tip and the tail tip. */
  noseX: 22.3,
  tailX: -22.3,
} as const;

export interface PlaneMeshData {
  body: GeoArrays;
  fuselage: GeoArrays;
  fin: GeoArrays;
  gear: GeoArrays;
  lights: GeoArrays;
}

const C = PLANE_COLORS;

/** Fuselage stations: x, horizontal radius, vertical radius, centre height. */
const FUSE: [number, number, number, number][] = [
  [22.3, 0.06, 0.06, 3.15],
  [21.8, 0.5, 0.55, 3.3],
  [20.8, 1.05, 1.15, 3.5],
  [19.2, 1.55, 1.68, 3.7],
  [17.2, 1.88, 2.0, 3.85],
  [14, 2.0, 2.1, 3.9],
  [-10, 2.0, 2.1, 3.9],
  [-13.5, 1.95, 2.05, 4.0],
  [-16.5, 1.7, 1.8, 4.35],
  [-19.2, 1.2, 1.3, 4.8],
  [-21.2, 0.7, 0.75, 5.1],
  [-22.3, 0.12, 0.12, 5.3],
];
const FUSE_SEGS = 36;

/** Interpolated fuselage section at x (smooth enough: linear between the stations, rings are dense). */
function fuseAt(x: number): { rx: number; ry: number; cy: number } {
  for (let i = 0; i + 1 < FUSE.length; i++) {
    const a = FUSE[i], b = FUSE[i + 1];
    if (x <= a[0] && x >= b[0]) { const t = (a[0] - x) / (a[0] - b[0] || 1); return { rx: lerp(a[1], b[1], t), ry: lerp(a[2], b[2], t), cy: lerp(a[3], b[3], t) }; }
  }
  return { rx: 0.1, ry: 0.1, cy: 3.9 };
}

/** The fuselage between x = xa (front) and x = xb (back); the whole fuselage = nose..tail. Sections end in a flat cap, so a section is a closed barrel (the factory builds it in five). */
function fuselageRange(xa: number, xb: number): GeoArrays {
  const g = new Geo();
  const xs: number[] = [];
  const stations = [xa, ...FUSE.map((f) => f[0]).filter((x) => x < xa && x > xb), xb];
  for (let i = 0; i + 1 < stations.length; i++) {
    const a = stations[i], b = stations[i + 1], n = Math.max(1, Math.round(Math.abs(a - b) / 1.2));
    for (let k = 0; k < n; k++) xs.push(lerp(a, b, k / n));
  }
  xs.push(xb);
  const rings: V3[][] = xs.map((x) => {
    const s = fuseAt(x), ring: V3[] = [];
    for (let j = 0; j < FUSE_SEGS; j++) {
      const a = (j / FUSE_SEGS) * Math.PI * 2;
      ring.push([x, s.cy + s.ry * Math.sin(a), s.rx * Math.cos(a)]);
    }
    return ring;
  });
  const x0 = PLANE_DIMS.tailX, x1 = PLANE_DIMS.noseX;
  g.loft(
    rings,
    (r, j) => {
      const x = xs[r], sa = Math.sin((j / FUSE_SEGS) * Math.PI * 2);
      let c = sa < -0.35 ? mix(C.hull, C.belly, Math.min(1, (-sa - 0.35) / 0.25)) : C.hull; // grey belly
      if (Math.abs(sa) < 0.07 && x > -16 && x < 18) c = C.stripe; // cheat line
      if (x < -17.5 && sa > 0.3) c = C.stripe; // tail swoosh
      return c;
    },
    (r, j) => [(xs[r] - x0) / (x1 - x0), j / FUSE_SEGS],
    { start: true, end: true },
  );
  return g.build();
}
const fuselage = (): GeoArrays => fuselageRange(PLANE_DIMS.noseX, PLANE_DIMS.tailX);

/** A swept tapered wing panel (one side) through airfoil sections: LE x at the root, chord, thickness, dihedral... returns rings. */
function wingRings(side: 1 | -1, o: { zRoot: number; zTip: number; xLE: number; sweep: number; cRoot: number; cTip: number; yRoot: number; dy: number; tRoot: number; tTip: number; camber: number; sections: number }): V3[][] {
  const out: V3[][] = [];
  const outline = airfoilOutline(10, 1, 0); // shape only (x); thickness is scaled per section below
  for (let k = 0; k <= o.sections; k++) {
    const t = k / o.sections, chord = lerp(o.cRoot, o.cTip, t), xle = o.xLE - o.sweep * t, y0 = o.yRoot + o.dy * t, z = side * lerp(o.zRoot, o.zTip, t);
    const thick = lerp(o.tRoot, o.tTip, t);
    out.push(airfoilOutline(10, thick, o.camber).map(([xc, yc]) => [xle - xc * chord, y0 + yc * chord, z] as V3));
  }
  void outline;
  return out;
}

type Side = 1 | -1;
const SIDES: Side[] = [1, -1];

/** One main wing (low wing, 25 degrees sweep, dihedral 4.5 degrees) with its flap-track fairings and sharklet. */
function wingPart(side: Side): GeoArrays {
  const g = new Geo();
  const rings = wingRings(side, { zRoot: 1.6, zTip: 17.2, xLE: 4.2, sweep: 8.4, cRoot: 8.6, cTip: 1.9, yRoot: 2.3, dy: 1.3, tRoot: 0.13, tTip: 0.085, camber: 0.012, sections: 9 });
  g.loft(rings, (_r, j) => (j <= 9 ? C.wingTop : C.wingBottom), undefined, { start: false, end: true });
  for (const z of [5.0, 9.0, 12.5]) {
    const t = (z - 1.6) / (17.2 - 1.6), xle = 4.2 - 8.4 * t, chord = lerp(8.6, 1.9, t), y = 2.3 + 1.3 * t;
    g.cylinder('x', xle - chord * 0.72, y - 0.25, side * z, 0.17, chord * 0.5, C.wingBottom, 8);
  }
  const tipX = 4.2 - 8.4, wl: V3[][] = [];
  for (let k = 0; k <= 3; k++) {
    const t = k / 3, chord = lerp(1.9, 0.9, t), xle = tipX - 0.4 * t - 0.9 * t * t, y = 3.6 + 2.4 * t, z = side * (17.2 + 0.25 * t);
    wl.push(airfoilOutline(8, 0.07, 0).map(([xc, yc]) => [xle - xc * chord, y, z + side * yc * chord] as V3));
  }
  g.loft(wl, () => C.stripe, undefined, { start: false, end: true });
  return g.build();
}

/** One tailplane half. */
function stabPart(side: Side): GeoArrays {
  const g = new Geo();
  const rings = wingRings(side, { zRoot: 1.0, zTip: 6.4, xLE: -16.4, sweep: 3.8, cRoot: 4.4, cTip: 1.5, yRoot: 4.9, dy: 0.45, tRoot: 0.1, tTip: 0.08, camber: 0, sections: 4 });
  g.loft(rings, (_r, j) => (j <= 9 ? C.wingTop : C.wingBottom), undefined, { start: false, end: true });
  return g.build();
}

/** The vertical fin (own mesh with the tail texture: u = chord LE->TE, v = height) and the dorsal fillet / APU exhaust. */
function finPart(): { fin: GeoArrays; apu: GeoArrays } {
  const fin = new Geo(), apu = new Geo();
  const rings: V3[][] = [];
  const y0 = 5.1, H = 7.1, xle0 = -12.9, sweep = 5.6, c0 = 7.4, c1 = 2.6;
  const outline = airfoilOutline(9, 0.1, 0);
  for (let k = 0; k <= 6; k++) {
    const t = k / 6, chord = lerp(c0, c1, t), xle = xle0 - sweep * t, y = y0 + H * t;
    rings.push(outline.map(([xc, yc]) => [xle - xc * chord, y, yc * chord] as V3));
  }
  fin.loft(rings, () => C.tail, (r, j) => [1 - outline[j % outline.length][0], r / 6], { start: false, end: true });
  apu.cylinder('x', -21.0, 5.5, 0, 0.28, 1.2, C.engineCore, 8);
  return { fin: fin.build(), apu: apu.build() };
}

/** One turbofan: nacelle (cowl), dark fan face + spinner, exhaust cone, pylon. Hung under the wing at z = +-6.0. */
function enginePart(side: Side): GeoArrays {
  const g = new Geo();
  const z = side * 6.0, y = 1.5, cow: V3[][] = [];
  const st: [number, number][] = [[2.65, 1.0], [2.45, 1.07], [1.8, 1.1], [0.4, 1.08], [-1.0, 1.0], [-1.9, 0.86], [-2.15, 0.78]];
  const ringAt = (x: number, r: number, n: number): V3[] => { const ring: V3[] = []; for (let j = 0; j < n; j++) { const a = (j / n) * Math.PI * 2; ring.push([x, y + r * Math.sin(a), z + r * Math.cos(a)]); } return ring; };
  for (const [x, r] of st) cow.push(ringAt(x, r, 20));
  g.loft(cow, (r, j) => (r === 6 ? C.engineCore : j > 10 ? mix(C.engine, C.wingBottom, 0.5) : C.engine), undefined, { start: false, end: false });
  g.loft([ringAt(2.35, 0.92, 20), ringAt(2.3, 0.1, 20)], () => C.engineIn, undefined, { start: true, end: true });
  g.loft([ringAt(2.3, 0.28, 12), ringAt(2.75, 0.02, 12)], () => C.hub, undefined, { start: true, end: true });
  g.loft([ringAt(-1.9, 0.6, 14), ringAt(-2.6, 0.42, 14), ringAt(-3.3, 0.05, 14)], () => C.engineCore, undefined, { start: false, end: true });
  g.box(-0.3, y + 0.8, z, 3.2, 0.7, 0.22, C.wingBottom);
  return g.build();
}

/** Landing gear (nose leg + two main legs with wheel pairs), hidden in flight. */
function gearPart(): GeoArrays {
  const gear = new Geo();
  const wheel = (x: number, z: number, r: number, w: number): void => {
    gear.cylinder('z', x, r, z, r, w, C.tyre, 14);
    gear.cylinder('z', x, r, z, r * 0.55, w + 0.04, C.hub, 10);
  };
  gear.box(15.4, 0.5, 0, 0.22, 1.35, 0.22, C.strut);
  for (const dz of [-0.28, 0.28]) wheel(15.4, dz, 0.38, 0.22);
  gear.box(15.55, 1.1, 0, 0.1, 0.1, 0.6, C.strut);
  for (const side of SIDES) {
    const z = side * 3.0;
    gear.box(-1.0, 0.6, z, 0.3, 1.6, 0.3, C.strut);
    gear.box(-1.0, 1.9, z - side * 0.25, 0.14, 1.1, 0.14, C.strut);
    for (const dz of [-0.36, 0.36]) wheel(-1.0, z + dz, 0.55, 0.3);
    gear.box(-1.0, 0.55, z, 1.6, 0.14, 0.12, C.strut);
  }
  return gear.build();
}

/** Navigation lights (red port tip, green starboard tip), anti-collision beacons and the white tail light. */
function lightsPart(): GeoArrays {
  const lights = new Geo();
  const tipX = 4.2 - 8.4;
  for (const side of SIDES) lights.box(tipX - 1.0, 3.55, side * 17.45, 0.28, 0.2, 0.28, side > 0 ? C.lightGreen : C.lightRed);
  lights.box(0.5, 1.7, 0, 0.3, 0.2, 0.3, C.lightRed);
  lights.box(1.0, 5.95, 0, 0.3, 0.2, 0.3, C.lightRed);
  lights.box(-21.0, 5.5, 0, 0.3, 0.3, 0.3, C.lightWhite);
  return lights.build();
}

export function buildPlaneMesh(): PlaneMeshData {
  const fp = finPart();
  const body = concatGeo([wingPart(1), wingPart(-1), stabPart(1), stabPart(-1), fp.apu, enginePart(1), enginePart(-1)]);
  return { fuselage: fuselage(), body, fin: fp.fin, gear: gearPart(), lights: lightsPart() };
}

/**
 * The airliner in the pieces the factory assembles it from (same geometry as buildPlaneMesh, so a finished plane in the factory is the plane in the game):
 * five fuselage barrels (nose first), the two wings, the fin, the two tailplane halves, the two engines, the landing gear and the lights.
 */
export interface PlaneParts {
  barrels: GeoArrays[];
  barrelX: [number, number][];
  wing: [GeoArrays, GeoArrays];
  fin: GeoArrays;
  stab: [GeoArrays, GeoArrays];
  engine: [GeoArrays, GeoArrays];
  gear: GeoArrays;
  lights: GeoArrays;
}
export function buildPlaneParts(): PlaneParts {
  const cuts = [PLANE_DIMS.noseX, 12, 2, -8, -16, PLANE_DIMS.tailX];
  const barrelX: [number, number][] = [];
  const barrels: GeoArrays[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) { barrels.push(fuselageRange(cuts[i], cuts[i + 1])); barrelX.push([cuts[i], cuts[i + 1]]); }
  return { barrels, barrelX, wing: [wingPart(1), wingPart(-1)], fin: finPart().fin, stab: [stabPart(1), stabPart(-1)], engine: [enginePart(1), enginePart(-1)], gear: gearPart(), lights: lightsPart() };
}

export type { GeoArrays };
