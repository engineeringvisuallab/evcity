/**
 * Bird shapes as plain data (no three.js here, so the shapes can be tested and previewed headlessly).
 *
 * Every bird faces +Z, has its wings along X and its back towards +Y; the wingspan is 1 (the manager scales each bird to its real size).
 * A bird is built from real parts: a lofted body (chest, belly, neck, round head), a beak with a hooked / long / casqued shape,
 * eyes, a tail fan (forked, rounded or wedge), trailing or tucked legs with toes, and two wings made of an arm strip
 * (coverts + secondaries) plus - for the big soaring species - separate "fingered" primary feathers at the wing tip.
 * Every vertex has its own colour (back / belly / throat / flight feathers ...) and a wing weight `wing` (0 = body, 1 = wing tip)
 * that the vertex shader uses for flapping.
 */

export type RGB = [number, number, number];

export interface BeakSpec {
  len: number;
  /** Height and width at the base. */
  h: number;
  w: number;
  /** How far the tip bends down (hooked beak of parrots / eagles). */
  droop: number;
  /** Extra height on top of the beak (hornbill casque), as a fraction of the beak height. */
  casque?: number;
  color: number;
  tip?: number;
}

export interface TailSpec {
  len: number;
  /** Width of the fan at the tip. */
  width: number;
  /** > 0 = forked (swallow), < 0 = rounded / wedge (parrot, dove). */
  fork: number;
  color: number;
  tip?: number;
}

export interface WingSpec {
  /** Chord (front-to-back width) at the shoulder, at the wrist and at the tip. */
  root: number;
  mid: number;
  tip: number;
  /** How far the arm wing reaches forward of the shoulder, and how far the hand sweeps back. */
  lead: number;
  sweep: number;
  /** Tips raised (dihedral). */
  up: number;
  /** Number of separate primary feathers at the tip (0 = one smooth wing). */
  fingers: number;
  fingerLen: number;
}

export interface LegSpec {
  len: number;
  drop: number;
  color: number;
}

export interface BirdSpec {
  name: string;
  body: number;
  bodyR: number;
  neck: number;
  neckR: number;
  head: number;
  headR: number;
  /** Height of the head centre over the body axis (negative = neck pulled in, head low). */
  headUp: number;
  beak: BeakSpec;
  tail: TailSpec;
  wing: WingSpec;
  legs: LegSpec;
  back: number;
  belly: number;
  /** Upper part of the head. */
  crown: number;
  throat: number;
  neckCol?: number;
  /** Chest colour (defaults to the belly colour). */
  breast?: number;
  wingCol: number;
  flight: number;
  eye: number;
}

export interface BirdData {
  pos: number[];
  col: number[];
  wing: number[];
  index: number[];
}

// ------------------------------------------------------------------ species

export const BIRD_SPECS: Record<string, BirdSpec> = {
  // House crow: black with a grey neck and breast, fingered wings, wedge tail.
  crow: {
    name: 'crow', body: 0.27, bodyR: 0.072, neck: 0.05, neckR: 0.046, head: 0.11, headR: 0.042, headUp: 0.012,
    beak: { len: 0.1, h: 0.04, w: 0.032, droop: 0.008, color: 0x1b1b1d, tip: 0x0e0e0f },
    tail: { len: 0.2, width: 0.15, fork: -0.12, color: 0x16181b },
    wing: { root: 0.21, mid: 0.2, tip: 0.04, lead: 0.03, sweep: 0.1, up: 0.035, fingers: 6, fingerLen: 0.2 },
    legs: { len: 0.05, drop: 0.03, color: 0x1a1a1a },
    back: 0x1f2227, belly: 0x6b6d72, crown: 0x17191c, throat: 0x1d1f23, neckCol: 0x84868b, breast: 0x77797e,
    wingCol: 0x24282e, flight: 0x14161a, eye: 0x0a0a0a,
  },
  // Great egret: all white, long yellow bill, legs trailing behind the tail.
  egret: {
    name: 'egret', body: 0.24, bodyR: 0.048, neck: 0.16, neckR: 0.02, head: 0.11, headR: 0.02, headUp: -0.012,
    beak: { len: 0.16, h: 0.018, w: 0.014, droop: 0, color: 0xe6b82a, tip: 0xb89420 },
    tail: { len: 0.07, width: 0.06, fork: -0.1, color: 0xf6f6f1 },
    wing: { root: 0.2, mid: 0.23, tip: 0.05, lead: 0.035, sweep: 0.07, up: 0.04, fingers: 5, fingerLen: 0.14 },
    legs: { len: 0.4, drop: 0.02, color: 0x2a2a28 },
    back: 0xf8f8f3, belly: 0xf1f1ea, crown: 0xf8f8f3, throat: 0xf3f3ee, wingCol: 0xf7f7f2, flight: 0xe9e9e1, eye: 0xd8c040,
  },
  // Barn swallow: steel-blue back, rusty throat, cream belly, deeply forked tail, scythe wings.
  swallow: {
    name: 'swallow', body: 0.27, bodyR: 0.05, neck: 0.015, neckR: 0.042, head: 0.1, headR: 0.04, headUp: 0.008,
    beak: { len: 0.045, h: 0.026, w: 0.036, droop: 0, color: 0x1a1a1a },
    tail: { len: 0.34, width: 0.13, fork: 0.62, color: 0x1c2848, tip: 0x1c2848 },
    wing: { root: 0.14, mid: 0.12, tip: 0.035, lead: 0.01, sweep: 0.26, up: 0.01, fingers: 0, fingerLen: 0 },
    legs: { len: 0.03, drop: 0.015, color: 0x222222 },
    back: 0x1b2a55, belly: 0xe7c7a2, crown: 0x1b2a55, throat: 0xb4502f, breast: 0xd9ae86,
    wingCol: 0x1d2b56, flight: 0x131b38, eye: 0x0a0a0a,
  },
  // Rock pigeon / dove: blue-grey, glossy green-purple neck, rounded wings, rounded tail with a dark band.
  dove: {
    name: 'dove', body: 0.32, bodyR: 0.088, neck: 0.03, neckR: 0.052, head: 0.1, headR: 0.04, headUp: 0.01,
    beak: { len: 0.05, h: 0.022, w: 0.02, droop: 0.004, color: 0xd8cdc0, tip: 0x6e6860 },
    tail: { len: 0.21, width: 0.15, fork: -0.05, color: 0x7c7e86, tip: 0x34363c },
    wing: { root: 0.22, mid: 0.22, tip: 0.07, lead: 0.03, sweep: 0.11, up: 0.03, fingers: 5, fingerLen: 0.14 },
    legs: { len: 0.045, drop: 0.03, color: 0xc4505c },
    back: 0x8b8e96, belly: 0xa2a5ac, crown: 0x8b8e96, throat: 0x6f8f86, neckCol: 0x5f8780, breast: 0x9aa0ab,
    wingCol: 0x9a9da5, flight: 0x585a62, eye: 0xd8782a,
  },
  // Brahminy kite (cheel): chestnut with a white head and breast, black wing tips, rounded tail.
  kite: {
    name: 'kite', body: 0.25, bodyR: 0.06, neck: 0.035, neckR: 0.046, head: 0.085, headR: 0.036, headUp: 0.004,
    beak: { len: 0.05, h: 0.034, w: 0.024, droop: 0.016, color: 0xa7a58f, tip: 0x3a3a36 },
    tail: { len: 0.27, width: 0.17, fork: -0.1, color: 0x7b4a2d },
    wing: { root: 0.21, mid: 0.2, tip: 0.05, lead: 0.03, sweep: 0.1, up: 0.05, fingers: 7, fingerLen: 0.17 },
    legs: { len: 0.05, drop: 0.03, color: 0xb0a470 },
    back: 0x7a3d20, belly: 0x7d4125, crown: 0xf0ece1, throat: 0xf3efe4, neckCol: 0xf0ece1, breast: 0xf2eee3,
    wingCol: 0x82462a, flight: 0x17130f, eye: 0x2a1a10,
  },
  // White-bellied sea eagle: white head, belly and wedge tail; grey back; huge fingered wings with black flight feathers.
  eagle: {
    name: 'eagle', body: 0.3, bodyR: 0.066, neck: 0.03, neckR: 0.05, head: 0.08, headR: 0.034, headUp: 0.004,
    beak: { len: 0.065, h: 0.042, w: 0.03, droop: 0.022, color: 0x8d9094, tip: 0x2c2c2c },
    tail: { len: 0.2, width: 0.12, fork: -0.32, color: 0xf2f2ec },
    wing: { root: 0.23, mid: 0.27, tip: 0.06, lead: 0.04, sweep: 0.08, up: 0.045, fingers: 7, fingerLen: 0.21 },
    legs: { len: 0.05, drop: 0.035, color: 0xd8c460 },
    back: 0x5d636b, belly: 0xf3f3ee, crown: 0xf4f4ef, throat: 0xf4f4ef, neckCol: 0xf4f4ef, breast: 0xf4f4ef,
    wingCol: 0x69707a, flight: 0x1b1d21, eye: 0x1a120a,
  },
  // White-throated kingfisher: electric blue back, chestnut head and belly, white throat, big dagger-like red bill.
  kingfisher: {
    name: 'kingfisher', body: 0.3, bodyR: 0.1, neck: 0.02, neckR: 0.08, head: 0.2, headR: 0.078, headUp: 0.015,
    beak: { len: 0.2, h: 0.056, w: 0.048, droop: 0.004, color: 0xc8302a, tip: 0xa82620 },
    tail: { len: 0.15, width: 0.12, fork: 0.0, color: 0x2a73d4 },
    wing: { root: 0.2, mid: 0.2, tip: 0.1, lead: 0.02, sweep: 0.1, up: 0.012, fingers: 0, fingerLen: 0 },
    legs: { len: 0.04, drop: 0.03, color: 0xc8302a },
    back: 0x2b78e0, belly: 0x7d3d24, crown: 0x7a3b22, throat: 0xf5f2ea, neckCol: 0x7a3b22, breast: 0xf4f1e9,
    wingCol: 0x2d7ae0, flight: 0x1c3f8c, eye: 0x120c08,
  },
  // Rose-ringed parakeet: green, red hooked bill, very long tapered tail, pointed wings.
  parrot: {
    name: 'parrot', body: 0.3, bodyR: 0.074, neck: 0.02, neckR: 0.06, head: 0.12, headR: 0.054, headUp: 0.01,
    beak: { len: 0.07, h: 0.075, w: 0.052, droop: 0.034, color: 0xd42a2a, tip: 0x5a1a14 },
    tail: { len: 0.58, width: 0.07, fork: -0.55, color: 0x56b04a, tip: 0xa9cf5a },
    wing: { root: 0.15, mid: 0.13, tip: 0.04, lead: 0.015, sweep: 0.26, up: 0.015, fingers: 0, fingerLen: 0 },
    legs: { len: 0.04, drop: 0.03, color: 0x9a8f86 },
    back: 0x63bf49, belly: 0x86cb56, crown: 0x72c14c, throat: 0x6dbd4c, neckCol: 0x7cc752,
    wingCol: 0x5ab146, flight: 0x2f7f3a, eye: 0xf2e6c0,
  },
  // Grey heron: slate grey, white head and neck, black flight feathers, arched wings, long trailing legs, dagger bill.
  heron: {
    name: 'heron', body: 0.2, bodyR: 0.05, neck: 0.2, neckR: 0.02, head: 0.11, headR: 0.02, headUp: -0.02,
    beak: { len: 0.17, h: 0.018, w: 0.015, droop: 0, color: 0xd6a32c, tip: 0xa87c1e },
    tail: { len: 0.06, width: 0.05, fork: -0.1, color: 0x9aa4ae },
    wing: { root: 0.2, mid: 0.23, tip: 0.1, lead: 0.04, sweep: 0.06, up: 0.085, fingers: 6, fingerLen: 0.15 },
    legs: { len: 0.44, drop: 0.025, color: 0x6e5c3a },
    back: 0x7f8b97, belly: 0xc8cdd2, crown: 0xe6e9ec, throat: 0xdfe3e6, neckCol: 0xd8dcdf, breast: 0xcfd4d8,
    wingCol: 0x8793a0, flight: 0x1d2025, eye: 0xe6c840,
  },
  // Oriental pied hornbill: black and white, huge yellow bill with a casque, long white-tipped tail, fingered wings.
  hornbill: {
    name: 'hornbill', body: 0.28, bodyR: 0.085, neck: 0.04, neckR: 0.052, head: 0.11, headR: 0.046, headUp: 0.012,
    beak: { len: 0.2, h: 0.08, w: 0.044, droop: 0.026, casque: 0.55, color: 0xe9c24a, tip: 0x3a2a1a },
    tail: { len: 0.3, width: 0.14, fork: -0.08, color: 0x16171b, tip: 0xf2efe6 },
    wing: { root: 0.22, mid: 0.22, tip: 0.07, lead: 0.04, sweep: 0.12, up: 0.03, fingers: 6, fingerLen: 0.17 },
    legs: { len: 0.05, drop: 0.03, color: 0x3a3a3a },
    back: 0x15161a, belly: 0xf1eee5, crown: 0x15161a, throat: 0x17181c, neckCol: 0x17181c, breast: 0x1a1b1f,
    wingCol: 0x17181c, flight: 0xe9e5db, eye: 0xa83a28,
  },
};

export const BIRD_NAMES = Object.keys(BIRD_SPECS);

// ------------------------------------------------------------------ helpers

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a || 1));
  return t * t * (3 - 2 * t);
};
const catmull = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);

/** sRGB hex -> linear RGB (what the shader wants as a vertex colour). */
function lin(hex: number): RGB {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const dark = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

class Builder {
  pos: number[] = [];
  col: number[] = [];
  wing: number[] = [];
  index: number[] = [];
  v(x: number, y: number, z: number, c: RGB, w = 0): number {
    this.pos.push(x, y, z);
    this.col.push(c[0], c[1], c[2]);
    this.wing.push(w);
    return this.wing.length - 1;
  }
  tri(a: number, b: number, c: number): void {
    this.index.push(a, b, c);
  }
  quad(a: number, b: number, c: number, d: number): void {
    this.index.push(a, b, c, a, c, d);
  }
}

// ------------------------------------------------------------------ parts

const SEG = 10;

interface Station {
  z: number;
  r: number;
  y: number;
}

function buildBody(m: Builder, s: BirdSpec): void {
  const h = s.body / 2;
  const nz = h + s.neck;
  const hz = nz + s.head;
  const st: Station[] = [
    { z: -h, r: s.bodyR * 0.38, y: 0 },
    { z: -h * 0.55, r: s.bodyR * 0.82, y: 0 },
    { z: 0, r: s.bodyR, y: -s.bodyR * 0.04 },
    { z: h * 0.6, r: s.bodyR * 0.97, y: s.headUp * 0.02 },
    { z: h, r: s.bodyR * 0.8, y: s.headUp * 0.06 },
  ];
  if (s.neck > 0.001) {
    st.push({ z: h + s.neck * 0.5, r: s.neckR * 1.15, y: s.headUp * 0.4 });
    st.push({ z: nz, r: s.neckR, y: s.headUp * 0.8 });
  }
  st.push({ z: nz + s.head * 0.22, r: s.headR * 0.97, y: s.headUp });
  st.push({ z: nz + s.head * 0.62, r: s.headR, y: s.headUp });
  st.push({ z: hz, r: s.headR * 0.5, y: s.headUp - s.headR * 0.2 });

  // smooth rings: Catmull-Rom through the stations, 3 rings per segment
  const rings: Station[] = [];
  const n = st.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = st[Math.max(0, i - 1)];
    const p1 = st[i];
    const p2 = st[i + 1];
    const p3 = st[Math.min(n - 1, i + 2)];
    for (let k = 0; k < 3; k++) {
      const t = k / 3;
      rings.push({ z: lerp(p1.z, p2.z, t), r: Math.max(0.002, catmull(p0.r, p1.r, p2.r, p3.r, t)), y: catmull(p0.y, p1.y, p2.y, p3.y, t) });
    }
  }
  rings.push(st[n - 1]);

  const back = lin(s.back);
  const belly = lin(s.belly);
  const breast = lin(s.breast ?? s.belly);
  const crown = lin(s.crown);
  const throat = lin(s.throat);
  const neckTop = lin(s.neckCol ?? s.crown);
  const neckBot = lin(s.neckCol ?? s.throat);

  const first = m.pos.length / 3;
  for (const ring of rings) {
    const headF = smooth(nz - s.neck * 0.15 - 0.005, nz + s.head * 0.3 + 0.005, ring.z);
    const neckF = smooth(h * 0.7, h + 0.004, ring.z);
    const breastF = smooth(h * 0.05, h * 0.9, ring.z);
    const topBody = back;
    const botBody = mix(belly, breast, breastF);
    const top = mix(mix(topBody, neckTop, neckF), crown, headF);
    const bot = mix(mix(botBody, neckBot, neckF), throat, headF);
    const isHead = ring.z > nz;
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const sy = Math.sin(a);
      const c = mix(bot, top, smooth(-0.35, 0.3, sy));
      const wx = isHead ? 0.96 : 0.9;
      m.v(Math.cos(a) * ring.r * wx, ring.y + sy * ring.r, ring.z, c);
    }
  }
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < SEG; i++) {
      const a = first + r * SEG + i;
      const b = first + r * SEG + ((i + 1) % SEG);
      m.quad(a, b, b + SEG, a + SEG);
    }
  }
  // rear cap (hidden under the tail) and front cap (behind the beak)
  const rearC = m.v(0, 0, -h - 0.015, mix(back, belly, 0.5));
  for (let i = 0; i < SEG; i++) m.tri(first + i, rearC, first + ((i + 1) % SEG));
  const last = rings[rings.length - 1];
  const frontC = m.v(0, last.y, last.z + 0.004, crown);
  const lf = first + (rings.length - 1) * SEG;
  for (let i = 0; i < SEG; i++) m.tri(lf + i, lf + ((i + 1) % SEG), frontC);
}

function buildBeak(m: Builder, s: BirdSpec): void {
  const b = s.beak;
  const nz = s.body / 2 + s.neck;
  const hz = nz + s.head;
  const y0 = s.headUp - s.headR * 0.2;
  const z0 = hz - 0.004;
  const hw0 = Math.min(b.w / 2, s.headR * 0.55);
  const hh0 = Math.min(b.h / 2, s.headR * 0.8 + (b.casque ? b.h * 0.2 : 0));
  const base = lin(b.color);
  const tip = lin(b.tip ?? b.color);
  const T = 5;
  const SIDES = 6;
  const first = m.pos.length / 3;
  for (let k = 0; k < T; k++) {
    const t = k / T;
    const taper = Math.pow(1 - t, 0.72);
    const hw = hw0 * taper;
    const hh = hh0 * taper;
    const cz = z0 + b.len * t;
    const cy = y0 - b.droop * Math.pow(t, 2.2);
    const c = mix(base, tip, smooth(0.7, 1, t));
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2;
      const sy = Math.sin(a);
      const up = sy > 0 ? 1 + (b.casque ?? 0) * (1 - Math.pow(t, 1.4)) : 1;
      m.v(Math.cos(a) * hw, cy + sy * hh * up, cz, sy < 0 ? dark(c, 0.88) : c);
    }
  }
  for (let k = 0; k < T - 1; k++) {
    for (let i = 0; i < SIDES; i++) {
      const a = first + k * SIDES + i;
      const c = first + k * SIDES + ((i + 1) % SIDES);
      m.quad(a, c, c + SIDES, a + SIDES);
    }
  }
  const tipV = m.v(0, y0 - b.droop, z0 + b.len, tip);
  const lf = first + (T - 1) * SIDES;
  for (let i = 0; i < SIDES; i++) m.tri(lf + i, lf + ((i + 1) % SIDES), tipV);
}

function buildEyes(m: Builder, s: BirdSpec): void {
  const nz = s.body / 2 + s.neck;
  const cz = nz + s.head * 0.48;
  const cy = s.headUp + s.headR * 0.22;
  const es = Math.max(0.0055, s.headR * 0.26);
  const c = lin(s.eye);
  const ring = dark(c, 0.55);
  for (const sg of [1, -1]) {
    const x = sg * s.headR * 0.985;
    // an eye ring (bigger, darker) with the eye on top
    const r0 = m.v(x, cy + es * 1.35, cz, ring);
    const r1 = m.v(x, cy, cz + es * 1.35, ring);
    const r2 = m.v(x, cy - es * 1.35, cz, ring);
    const r3 = m.v(x, cy, cz - es * 1.35, ring);
    m.quad(r0, r1, r2, r3);
    const x2 = sg * s.headR * 0.995;
    const e0 = m.v(x2, cy + es, cz, c);
    const e1 = m.v(x2, cy, cz + es, c);
    const e2 = m.v(x2, cy - es, cz, c);
    const e3 = m.v(x2, cy, cz - es, c);
    m.quad(e0, e1, e2, e3);
  }
}

function buildTail(m: Builder, s: BirdSpec): void {
  const t = s.tail;
  const h = s.body / 2;
  const z0 = -h + 0.005;
  const base = lin(t.color);
  const tip = lin(t.tip ?? t.color);
  const M = 6;
  const rows = [0, 0.5, 1];
  const grid: number[][] = [];
  for (let j = 0; j <= M; j++) {
    const u = (j / M) * 2 - 1;
    const au = Math.abs(u);
    const lenF = 1 - t.fork * (1 - Math.pow(au, 1.4));
    const col: number[] = [];
    for (const r of rows) {
      const x = lerp(u * s.bodyR * 0.3, u * t.width * 0.5, r);
      const z = z0 - t.len * lenF * r;
      const y = -0.004 - t.len * 0.06 * r * r;
      col.push(m.v(x, y, z, mix(base, tip, smooth(0.45, 1, r))));
    }
    grid.push(col);
  }
  for (let j = 0; j < M; j++) for (let r = 0; r < 2; r++) m.quad(grid[j][r], grid[j + 1][r], grid[j + 1][r + 1], grid[j][r + 1]);
}

function buildLegs(m: Builder, s: BirdSpec): void {
  const c = lin(s.legs.color);
  const lw = 0.006;
  for (const sg of [1, -1]) {
    const x = sg * s.bodyR * 0.3;
    const y0 = -s.bodyR * 0.75;
    const z0 = -s.body * 0.35;
    const y1 = y0 - s.legs.drop;
    const z1 = z0 - s.legs.len;
    const a0 = m.v(x - lw, y0, z0, c);
    const a1 = m.v(x + lw, y0, z0, c);
    const a2 = m.v(x + lw * 0.6, y1, z1, c);
    const a3 = m.v(x - lw * 0.6, y1, z1, c);
    m.quad(a0, a1, a2, a3);
    const b0 = m.v(x, y0 - lw, z0, c);
    const b1 = m.v(x, y0 + lw, z0, c);
    const b2 = m.v(x, y1 + lw * 0.6, z1, c);
    const b3 = m.v(x, y1 - lw * 0.6, z1, c);
    m.quad(b0, b1, b2, b3);
    // toes (three small blades pointing back)
    const tl = Math.min(0.05, 0.02 + s.legs.len * 0.12);
    const e = m.v(x, y1, z1, c);
    for (const d of [-1, 0, 1]) {
      const t0 = m.v(x + d * tl * 0.55 - lw, y1, z1 - tl, c);
      const t1 = m.v(x + d * tl * 0.55 + lw, y1, z1 - tl, c);
      m.tri(e, t0, t1);
    }
  }
}

function buildWing(m: Builder, s: BirdSpec, sg: number): void {
  const W = s.wing;
  const x0 = s.bodyR * 0.5;
  const half = 0.5;
  const TW = 0.46; // the wrist, as a fraction of the span
  const X = (t: number) => x0 + (half - x0) * t;
  const wt = (x: number) => clamp01((x - x0) / (half - x0));
  const zs = s.body * 0.18;
  const zle = (t: number) => zs + W.lead * Math.sin(Math.min(t / TW, 1) * Math.PI / 2) - W.sweep * Math.pow(Math.max(0, (t - TW) / (1 - TW)), 1.35);
  const fingered = W.fingers > 0;
  const chord = (t: number) => {
    if (t <= TW) return lerp(W.root, W.mid, t / TW);
    const u = (t - TW) / (1 - TW);
    return fingered ? lerp(W.mid * 0.55, W.tip, Math.pow(u, 0.8)) : lerp(W.mid, W.tip, Math.pow(u, 0.9));
  };
  const yd = (t: number) => W.up * Math.pow(t, 1.6) + s.bodyR * 0.28 * (1 - Math.min(1, t * 4));
  const wingC = lin(s.wingCol);
  const flightC = lin(s.flight);
  const rows = [0, 0.5, 1];

  const strip = (ts: number[]) => {
    const grid = ts.map((t) =>
      rows.map((r, ri) => {
        const x = X(t);
        const z = zle(t) - chord(t) * r;
        const y = yd(t) + 0.008 - 0.012 * r;
        const c = ri === 0 ? wingC : ri === 1 ? mix(wingC, flightC, 0.35) : mix(wingC, flightC, fingered && t > TW ? 0.3 : 1);
        return m.v(sg * x, y, z, c, wt(x));
      }),
    );
    for (let i = 0; i < ts.length - 1; i++) for (let ri = 0; ri < 2; ri++) m.quad(grid[i][ri], grid[i + 1][ri], grid[i + 1][ri + 1], grid[i][ri + 1]);
  };

  if (!fingered) {
    const ts: number[] = [];
    for (let i = 0; i <= 10; i++) ts.push(i / 10);
    strip(ts);
    return;
  }
  // arm wing + a thin leading band out to the tip
  strip([0, 0.12, 0.24, 0.36, TW]);
  strip([TW, 0.6, 0.74, 0.88, 1]);
  // primaries
  const F = W.fingers;
  const xw = X(TW);
  for (let j = 0; j < F; j++) {
    const u = F > 1 ? j / (F - 1) : 0;
    const tr = TW + (0.8 - TW) * u;
    const xr = X(tr);
    const zr = zle(tr) - chord(tr) * 0.85;
    const tipX = xw + (half - xw) * (0.18 + 0.82 * Math.pow(u, 0.85)) * 0.985;
    const tipZ = zr - W.fingerLen * (0.62 + 0.38 * Math.pow(1 - u, 0.7));
    let dx = tipX - xr;
    let dz = tipZ - zr;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;
    const px = -dz;
    const pz = dx;
    const wr = Math.max(0.006, ((X(0.8) - xw) / Math.max(1, F - 1)) * 0.65);
    const wtip = wr * 0.62;
    const yr = yd(tr) - 0.004;
    const yt = yd(clamp01((tipX - x0) / (half - x0))) - 0.006;
    const k = j % 2 ? 0.93 : 1;
    const cRoot = dark(mix(wingC, flightC, 0.6), k);
    const cMid = dark(flightC, k);
    const cTip = dark(flightC, 0.72 * k);
    const mx = (xr + tipX) / 2;
    const mz = (zr + tipZ) / 2;
    const my = (yr + yt) / 2;
    const r0 = m.v(sg * (xr - px * wr), yr, zr - pz * wr, cRoot, wt(xr - px * wr));
    const r1 = m.v(sg * (xr + px * wr), yr, zr + pz * wr, cRoot, wt(xr + px * wr));
    const m0 = m.v(sg * (mx - px * wr * 1.05), my, mz - pz * wr * 1.05, cMid, wt(mx - px * wr * 1.05));
    const m1 = m.v(sg * (mx + px * wr * 1.05), my, mz + pz * wr * 1.05, cMid, wt(mx + px * wr * 1.05));
    const t0 = m.v(sg * (tipX - px * wtip), yt, tipZ - pz * wtip, cTip, wt(tipX - px * wtip));
    const t1 = m.v(sg * (tipX + px * wtip), yt, tipZ + pz * wtip, cTip, wt(tipX + px * wtip));
    const tp = m.v(sg * (tipX + dx * wtip * 1.7), yt, tipZ + dz * wtip * 1.7, cTip, wt(tipX));
    m.quad(r0, r1, m1, m0);
    m.quad(m0, m1, t1, t0);
    m.tri(t0, t1, tp);
  }
}

// ------------------------------------------------------------------ public

export function buildBirdData(name: string): BirdData {
  const s = BIRD_SPECS[name] ?? BIRD_SPECS.crow;
  const m = new Builder();
  buildBody(m, s);
  buildBeak(m, s);
  buildEyes(m, s);
  buildTail(m, s);
  buildLegs(m, s);
  buildWing(m, s, 1);
  buildWing(m, s, -1);
  return { pos: m.pos, col: m.col, wing: m.wing, index: m.index };
}
