// EVLab interiors: the furniture models (see EVLabFurniture for the kit). Sizes are real-world metres. Every model faces +z (the side where the person sits / stands).
// Models are built once; the lobby, hall and the two wings place them with Furnish.place(name, x, y, z, yaw).
import { Composite, type Furnish } from './EVLabFurniture';

// ---- palette (hex)
const STEEL = 0x9aa3ae, DARK = 0x23272e, BLACK = 0x14161b, WHITE = 0xe9ebee, GREY = 0xc9cdd3, GOLD = 0xd4af37;
const OAK = 0xc49a6c, WALNUT = 0x6b4630, MARBLE = 0xece6d8, MARBLE_D = 0x2b2a30;
const SCREEN = 0x7fb7ff, GREEN = 0x58f0a0, AMBER = 0xffc04a, RED = 0xff5a4a, WARM = 0xffd9a0;

/** Small deterministic random numbers (same plants / books every time). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// ------------------------------------------------------------------ chairs
/** Office chair: 5-star base on castors, gas lift with cover, contoured seat, curved mesh back with headrest and lumbar support, T-shaped arm rests. 1.1 m high. */
export function officeChair(fabric: number): Composite {
  const c = new Composite(), MESH = 0x2b3038;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, sx = Math.sin(a), cz = Math.cos(a);
    c.box(sx * 0.15, 0.1, cz * 0.15, 0.055, 0.03, 0.32, DARK, { yaw: a, tilt: 0.06 });
    c.cyl(sx * 0.29, 0.07, cz * 0.29, 0.012, 0.012, 0.05, STEEL, 6);
    c.sphere(sx * 0.29, 0.035, cz * 0.29, 0.03, 0.03, 0.03, BLACK, 6);
  }
  c.cyl(0, 0.12, 0, 0.05, 0.065, 0.06, DARK, 10);
  c.cyl(0, 0.3, 0, 0.032, 0.032, 0.34, STEEL, 8);
  c.cyl(0, 0.35, 0, 0.05, 0.04, 0.2, BLACK, 10);
  c.box(0, 0.45, 0, 0.3, 0.035, 0.24, DARK);
  c.box(0, 0.5, 0.01, 0.46, 0.06, 0.44, fabric);
  c.sphere(0, 0.505, 0.0, 0.245, 0.045, 0.235, fabric, 10);
  c.box(0, 0.52, 0.225, 0.44, 0.045, 0.06, fabric, { tilt: 0.35 });
  c.box(-0.2, 0.53, -0.02, 0.07, 0.045, 0.38, fabric); c.box(0.2, 0.53, -0.02, 0.07, 0.045, 0.38, fabric);
  c.box(0, 0.58, -0.2, 0.05, 0.18, 0.04, DARK, { tilt: -0.1 });
  c.box(0, 0.68, -0.235, 0.34, 0.12, 0.06, fabric, { tilt: -0.1 });
  for (const sx of [-1, 1]) {
    c.box(sx * 0.17, 0.87, -0.26, 0.17, 0.52, 0.03, MESH, { tilt: -0.14, yaw: sx * -0.25 });
    c.box(sx * 0.24, 0.87, -0.255, 0.025, 0.54, 0.05, DARK, { tilt: -0.14, yaw: sx * -0.25 });
  }
  c.box(0, 1.14, -0.3, 0.3, 0.12, 0.07, fabric, { tilt: -0.16 });
  c.box(0, 1.0, -0.3, 0.03, 0.2, 0.03, DARK, { tilt: -0.14 });
  for (const s of [-1, 1]) {
    c.box(s * 0.26, 0.6, -0.04, 0.035, 0.22, 0.035, DARK);
    c.box(s * 0.26, 0.715, 0.0, 0.07, 0.035, 0.27, BLACK);
    c.box(s * 0.255, 0.54, -0.04, 0.05, 0.03, 0.05, DARK);
  }
  return c;
}

/** Lab stool: round seat, gas lift, 5-star base and a foot ring (8 segments). 0.7 m high. */
export function labStool(): Composite {
  const c = new Composite();
  c.cyl(0, 0.62, 0, 0.19, 0.19, 0.06, BLACK, 16);
  c.cyl(0, 0.585, 0, 0.17, 0.17, 0.02, 0x3a3f47, 16);
  c.cyl(0, 0.33, 0, 0.03, 0.03, 0.52, STEEL, 8);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    c.box(Math.sin(a) * 0.15, 0.06, Math.cos(a) * 0.15, 0.045, 0.03, 0.3, DARK, { yaw: a });
    c.cyl(Math.sin(a) * 0.29, 0.03, Math.cos(a) * 0.29, 0.03, 0.03, 0.05, BLACK, 8);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.box(Math.sin(a) * 0.2, 0.28, Math.cos(a) * 0.2, 0.03, 0.025, 0.16, STEEL, { yaw: a + Math.PI / 2 });
  }
  return c;
}

/** Meeting-room chair: splayed steel legs with a cross rail, contoured upholstered seat, curved upholstered back. */
export function meetingChair(fabric: number): Composite {
  const c = new Composite();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.cyl(sx * 0.215, 0.22, sz * 0.2, 0.015, 0.012, 0.45, STEEL, 8, 'y', { tilt: sz * -0.05, roll: sx * 0.05 });
  for (const sx of [-1, 1]) c.box(sx * 0.215, 0.3, 0, 0.02, 0.02, 0.4, STEEL);
  c.box(0, 0.425, 0, 0.42, 0.03, 0.4, DARK);
  c.box(0, 0.455, 0.01, 0.44, 0.045, 0.42, fabric);
  c.sphere(0, 0.46, 0.01, 0.235, 0.035, 0.225, fabric, 8);
  for (const sx of [-1, 1]) {
    c.box(sx * 0.14, 0.72, -0.215, 0.17, 0.4, 0.045, fabric, { tilt: -0.1, yaw: sx * -0.22 });
    c.box(sx * 0.205, 0.55, -0.205, 0.025, 0.28, 0.03, STEEL, { tilt: -0.08 });
  }
  c.box(0, 0.93, -0.235, 0.34, 0.03, 0.04, STEEL, { tilt: -0.1 });
  return c;
}

// ------------------------------------------------------------------ desks
/** Workstation desk 1.7 x 0.8 m: oak top, white panel leg, drawer pedestal, modesty panel; monitor, keyboard, mouse, lamp, mug, notebook. The user sits at +z. */
export function workDesk(): { body: Composite; glow: Composite } {
  const c = new Composite(), g = new Composite();
  c.box(0, 0.745, 0, 1.7, 0.04, 0.8, OAK);
  c.box(0, 0.722, 0.4, 1.7, 0.012, 0.012, WALNUT);
  c.box(-0.82, 0.36, 0, 0.04, 0.72, 0.74, WHITE); // panel leg
  c.box(0.8, 0.36, 0, 0.04, 0.72, 0.74, WHITE);
  c.box(0, 0.55, -0.36, 1.58, 0.36, 0.02, WHITE); // modesty panel
  c.box(0.56, 0.31, -0.02, 0.42, 0.6, 0.7, 0xdfe2e6); // pedestal
  for (let i = 0; i < 3; i++) {
    c.box(0.56, 0.1 + i * 0.2, 0.335, 0.38, 0.18, 0.012, 0xf1f2f4);
    c.box(0.56, 0.16 + i * 0.2, 0.347, 0.14, 0.014, 0.014, STEEL);
  }
  // monitor
  c.box(0, 0.768, -0.28, 0.26, 0.012, 0.19, DARK);
  c.box(0, 0.87, -0.31, 0.04, 0.21, 0.03, DARK);
  c.box(0, 1.07, -0.3, 0.64, 0.38, 0.03, BLACK);
  g.box(0, 1.07, -0.283, 0.6, 0.34, 0.004, SCREEN);
  // keyboard, mouse, notebook, mug, lamp
  c.box(0, 0.77, 0.0, 0.44, 0.02, 0.15, 0x20242b);
  c.box(0, 0.782, 0.0, 0.4, 0.006, 0.11, 0x3b414c);
  c.box(0.3, 0.772, 0.0, 0.06, 0.026, 0.105, 0x1a1c20);
  c.box(-0.45, 0.768, 0.05, 0.21, 0.012, 0.29, 0x2d4a7a);
  c.box(-0.45, 0.777, 0.05, 0.19, 0.004, 0.27, 0xf4f1e6);
  c.cyl(0.62, 0.805, -0.22, 0.04, 0.035, 0.085, 0xf3f3f3, 10);
  c.cyl(-0.7, 0.768, -0.3, 0.07, 0.08, 0.02, DARK, 12);
  c.box(-0.7, 0.9, -0.3, 0.015, 0.28, 0.015, DARK, { tilt: 0.25 });
  c.box(-0.7, 1.04, -0.23, 0.06, 0.035, 0.12, DARK, { tilt: 0.3 });
  g.box(-0.7, 1.017, -0.22, 0.05, 0.005, 0.1, WARM, { tilt: 0.3 });
  return { body: c, glow: g };
}

/** Low partition screen between desk rows (fabric panel on two feet), 1.7 m long. */
export function partition(fabric: number): Composite {
  const c = new Composite();
  c.box(0, 1.05, 0, 1.7, 0.7, 0.05, fabric);
  c.box(0, 1.41, 0, 1.72, 0.03, 0.06, STEEL);
  c.box(0, 0.69, 0, 1.72, 0.03, 0.06, STEEL);
  for (const s of [-1, 1]) c.box(s * 0.8, 0.35, 0, 0.04, 0.04, 0.5, STEEL);
  return c;
}

/** Meeting table: 4.4 x 1.5 m, thick top, two pedestal bases, cable boxes with ports in the top. */
export function meetingTable(w = 4.4, d = 1.5): Composite {
  const c = new Composite();
  c.box(0, 0.74, 0, w, 0.05, d, WALNUT);
  c.box(0, 0.715, 0, w - 0.1, 0.012, d - 0.1, 0x4c3020);
  for (const s of [-1, 1]) {
    c.box(s * (w / 2 - 0.7), 0.37, 0, 0.12, 0.7, d * 0.7, DARK);
    c.box(s * (w / 2 - 0.7), 0.03, 0, 0.12, 0.04, d * 0.9, STEEL);
  }
  for (const x of [-w / 4, w / 4]) c.box(x, 0.767, 0, 0.2, 0.012, 0.14, STEEL);
  return c;
}

/** Whiteboard on a wall: aluminium frame, board, marker tray with markers and an eraser. */
export function whiteboard(w = 3.6, h = 1.2): Composite {
  const c = new Composite();
  c.box(0, 0, 0, w + 0.08, h + 0.08, 0.04, STEEL);
  c.box(0, 0, 0.012, w, h, 0.03, 0xf6f7f9);
  c.box(0, -h / 2 - 0.05, 0.05, w * 0.6, 0.025, 0.07, STEEL);
  [0xd23a3a, 0x2b59c3, 0x1a1a1a, 0x2e8b4a].forEach((col, i) => c.cyl(-0.3 + i * 0.12, -h / 2 - 0.03, 0.06, 0.012, 0.012, 0.13, col, 6, 'x'));
  c.box(0.5, -h / 2 - 0.035, 0.06, 0.1, 0.03, 0.05, 0x3a3f47);
  return c;
}

// ------------------------------------------------------------------ storage
/** Steel 4-drawer filing cabinet 0.46 x 1.32 x 0.62 m. */
export function filingCabinet(color = 0x3a4048): Composite {
  const c = new Composite();
  c.box(0, 0.66, 0, 0.46, 1.32, 0.62, color);
  for (let i = 0; i < 4; i++) {
    c.box(0, 0.17 + i * 0.32, 0.312, 0.42, 0.29, 0.012, 0x4a515a);
    c.box(0, 0.27 + i * 0.32, 0.325, 0.14, 0.02, 0.02, STEEL);
    c.box(0.17, 0.23 + i * 0.32, 0.322, 0.025, 0.025, 0.008, GOLD);
  }
  c.box(0, 0.015, 0.0, 0.5, 0.03, 0.66, DARK);
  return c;
}

/** Bookshelf 1.2 x 2.0 x 0.35 m with 5 shelves of books of different sizes and colours. */
export function bookshelf(seed = 3): Composite {
  const c = new Composite(), r = rng(seed);
  const cols = [0x8b2d2d, 0x2d4f8b, 0x2f6b43, 0xc9a13a, 0x4a3a2c, 0x6b3f7a, 0xd8d2c4, 0x233a4f];
  c.box(0, 1.0, -0.16, 1.2, 2.0, 0.02, WALNUT);
  for (const s of [-1, 1]) c.box(s * 0.59, 1.0, 0, 0.02, 2.0, 0.35, WALNUT);
  for (let i = 0; i <= 5; i++) c.box(0, 0.03 + i * 0.39, 0, 1.18, 0.03, 0.35, WALNUT);
  for (let i = 0; i < 5; i++) {
    let x = -0.55;
    const y0 = 0.045 + i * 0.39;
    while (x < 0.52) {
      const w = 0.025 + r() * 0.04, h = 0.22 + r() * 0.12;
      if (r() < 0.08) { x += 0.12; continue; }
      c.box(x + w / 2, y0 + h / 2, 0.0, w, h, 0.22 + r() * 0.06, cols[Math.floor(r() * cols.length)], { roll: (r() < 0.04 ? 0.15 : 0) });
      x += w + 0.002;
    }
  }
  return c;
}

// ------------------------------------------------------------------ soft furniture
/** Sofa / armchair: wooden frame on gold feet, seat and back cushions, rolled arms, two scatter cushions. `w` = width (m). */
export function sofa(fabric: number, accent: number, w = 2.0): Composite {
  const c = new Composite();
  const n = Math.max(1, Math.round((w - 0.3) / 0.62)), cw = (w - 0.36) / n;
  c.box(0, 0.26, 0, w, 0.16, 0.92, 0x3b2a1c);
  c.box(0, 0.62, -0.41, w, 0.64, 0.1, fabric);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.18 + cw * (i + 0.5);
    c.box(x, 0.39, 0.07, cw - 0.02, 0.16, 0.74, fabric);
    c.box(x, 0.7, -0.27, cw - 0.02, 0.42, 0.2, fabric, { tilt: -0.2 });
  }
  for (const s of [-1, 1]) {
    c.box(s * (w / 2 - 0.09), 0.46, 0, 0.18, 0.4, 0.92, fabric);
    c.cyl(s * (w / 2 - 0.09), 0.68, 0, 0.1, 0.1, 0.92, fabric, 10, 'z');
    for (const sz of [-1, 1]) c.cyl(s * (w / 2 - 0.12), 0.09, sz * 0.38, 0.03, 0.022, 0.18, GOLD, 8);
  }
  if (w > 1.3) for (const s of [-1, 1]) c.box(s * (w / 2 - 0.42), 0.62, -0.05, 0.38, 0.38, 0.12, accent, { tilt: -0.35, yaw: s * 0.2 });
  return c;
}

/** Coffee table: smoked glass top in a gold frame, lower shelf with a book and a vase. */
export function coffeeTable(w = 1.2, d = 0.7): Composite {
  const c = new Composite();
  c.box(0, 0.42, 0, w, 0.025, d, 0x20262c);
  c.box(0, 0.4, 0, w + 0.03, 0.02, d + 0.03, GOLD);
  c.box(0, 0.16, 0, w - 0.1, 0.02, d - 0.1, 0x2b2a30);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.cyl(sx * (w / 2 - 0.04), 0.21, sz * (d / 2 - 0.04), 0.018, 0.018, 0.42, GOLD, 8);
  c.box(-0.2, 0.445, 0.05, 0.28, 0.025, 0.2, 0x8b2d2d);
  c.box(-0.2, 0.47, 0.05, 0.26, 0.02, 0.18, 0xe8e2d0);
  c.cyl(0.25, 0.53, -0.05, 0.05, 0.035, 0.2, 0x2f6b8a, 10);
  c.sphere(0.25, 0.68, -0.05, 0.06, 0.06, 0.06, 0x3e9b4f, 6);
  return c;
}

/** Side table with a table lamp. */
export function sideTable(): { body: Composite; glow: Composite } {
  const c = new Composite(), g = new Composite();
  c.cyl(0, 0.55, 0, 0.26, 0.26, 0.03, MARBLE, 20);
  c.cyl(0, 0.27, 0, 0.03, 0.03, 0.54, GOLD, 8);
  c.cyl(0, 0.015, 0, 0.2, 0.2, 0.03, GOLD, 16);
  c.cyl(0, 0.62, 0, 0.06, 0.07, 0.1, GOLD, 10);
  c.cyl(0, 0.82, 0, 0.1, 0.17, 0.3, 0xf2e8d0, 14);
  g.cyl(0, 0.82, 0, 0.085, 0.15, 0.27, WARM, 14);
  return { body: c, glow: g };
}

/** Floor lamp (standard lamp with a fabric shade). 1.65 m. */
export function floorLamp(): { body: Composite; glow: Composite } {
  const c = new Composite(), g = new Composite();
  c.cyl(0, 0.015, 0, 0.17, 0.17, 0.03, GOLD, 16);
  c.cyl(0, 0.8, 0, 0.018, 0.018, 1.6, GOLD, 8);
  c.cyl(0, 1.5, 0, 0.14, 0.24, 0.3, 0xf2e8d0, 16);
  g.cyl(0, 1.5, 0, 0.125, 0.22, 0.27, WARM, 16);
  return { body: c, glow: g };
}

/** Rug: border, field and an inner line (2.6 x 1.8 m default), 1.5 cm thick. */
export function rug(w: number, d: number, field: number, border: number): Composite {
  const c = new Composite();
  c.box(0, 0.008, 0, w, 0.016, d, border);
  c.box(0, 0.011, 0, w - 0.26, 0.016, d - 0.26, field);
  c.box(0, 0.014, 0, w - 0.46, 0.016, d - 0.46, border);
  c.box(0, 0.017, 0, w - 0.52, 0.016, d - 0.52, field);
  return c;
}

// ------------------------------------------------------------------ plants
/** Ficus in a round pot: trunk, branches and 40 flattened leaf clusters in three greens. h = about 2.2 m. */
export function ficus(seed: number, pot = 0x1f1f25): Composite {
  const c = new Composite(), r = rng(seed);
  c.cyl(0, 0.28, 0, 0.36, 0.27, 0.56, pot, 16);
  c.cyl(0, 0.56, 0, 0.385, 0.385, 0.05, GOLD, 16);
  c.cyl(0, 0.575, 0, 0.33, 0.33, 0.03, 0x3a2a1e, 14);
  c.cyl(0, 1.15, 0, 0.035, 0.055, 1.1, 0x6b4a2f, 7);
  const greens = [0x2f8a46, 0x3b9a4f, 0x23703a, 0x4aa85a];
  for (let b = 0; b < 6; b++) {
    const a = (b / 6) * Math.PI * 2 + r(), len = 0.45 + r() * 0.3, y = 1.2 + r() * 0.5;
    c.cyl(Math.sin(a) * len * 0.4, y + len * 0.25, Math.cos(a) * len * 0.4, 0.012, 0.02, len, 0x6b4a2f, 5, 'y', { roll: Math.cos(a) * 0.9, tilt: -Math.sin(a) * 0.9 });
  }
  for (let i = 0; i < 44; i++) {
    const a = r() * Math.PI * 2, e = r() * 1.2 - 0.1, rad = 0.35 + r() * 0.3;
    c.sphere(Math.sin(a) * Math.cos(e) * rad, 1.8 + Math.sin(e) * 0.55, Math.cos(a) * Math.cos(e) * rad, 0.2 + r() * 0.1, 0.07, 0.15 + r() * 0.08, greens[Math.floor(r() * 4)], 6, { yaw: r() * 3, tilt: (r() - 0.5) * 0.8 });
  }
  return c;
}

/** Areca palm in a planter: 9 arching fronds, each a rachis with leaflet pairs. h = about 2.4 m. */
export function palmPlant(seed: number, pot = 0x1f1f25): Composite {
  const c = new Composite(), r = rng(seed);
  c.box(0, 0.3, 0, 0.62, 0.6, 0.62, pot);
  c.box(0, 0.61, 0, 0.66, 0.04, 0.66, GOLD);
  c.box(0, 0.6, 0, 0.55, 0.03, 0.55, 0x3a2a1e);
  for (let f = 0; f < 9; f++) {
    const a = (f / 9) * Math.PI * 2 + r() * 0.4, lean = 0.55 + r() * 0.5, len = 1.4 + r() * 0.5;
    const dx = Math.sin(a), dz = Math.cos(a);
    for (let s = 0; s < 9; s++) {
      const t = (s + 0.5) / 9, h = 0.65 + Math.sin(t * lean * 2.0) * len * 0.55 * (1 - t * 0.3) + t * 0.1, out = t * len * Math.sin(lean) * 1.0;
      const px = dx * out, pz = dz * out;
      c.box(px, h, pz, 0.018, 0.018, len / 9 * 1.4, 0x5a7a3a, { yaw: a, tilt: -(0.3 + t * 0.9) });
      for (const side of [-1, 1]) c.box(px + dz * side * 0.1, h - t * 0.06, pz - dx * side * 0.1, 0.04, 0.008, 0.28 * (1 - t * 0.45), r() < 0.5 ? 0x2f8a46 : 0x3b9a4f, { yaw: a + side * 1.0, tilt: -t * 0.5 });
    }
  }
  return c;
}

/** Snake plant in a pot: 14 stiff upright blades with light edges. */
export function snakePlant(seed: number): Composite {
  const c = new Composite(), r = rng(seed);
  c.cyl(0, 0.22, 0, 0.26, 0.2, 0.44, 0xcfc9bb, 16);
  c.cyl(0, 0.44, 0, 0.26, 0.26, 0.03, 0x3a2a1e, 14);
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.14, h = 0.5 + r() * 0.55;
    c.box(Math.sin(a) * d, 0.44 + h / 2, Math.cos(a) * d, 0.07, h, 0.018, i % 3 ? 0x2d6a3c : 0x4f8a45, { yaw: a, tilt: (r() - 0.5) * 0.3, roll: (r() - 0.5) * 0.25 });
  }
  return c;
}

// ------------------------------------------------------------------ office fittings
/** Reception counter: marble top on a fluted dark front, raised ledge, wooden work desk behind with two monitors (backs to the visitor), phone, bell, brochure stand. Faces +z. */
export function receptionDesk(w = 12): { body: Composite; glow: Composite } {
  const c = new Composite(), g = new Composite();
  c.box(0, 0.52, 0.62, w, 1.04, 0.5, MARBLE_D);
  const n = Math.floor(w / 0.22);
  for (let i = 0; i < n; i++) c.cyl(-w / 2 + 0.11 + i * ((w - 0.22) / Math.max(1, n - 1)), 0.52, 0.89, 0.07, 0.07, 1.0, 0x38363d, 8);
  c.box(0, 1.07, 0.62, w + 0.1, 0.05, 0.6, MARBLE);
  c.box(0, 1.1, 0.88, w + 0.1, 0.012, 0.03, GOLD);
  c.box(0, 0.05, 0.92, w, 0.1, 0.06, GOLD);
  g.box(0, 0.16, 0.925, w - 0.3, 0.035, 0.012, WARM);
  c.box(0, 0.74, -0.35, w - 0.8, 0.05, 0.95, WALNUT);
  c.box(0, 0.37, -0.35, w - 0.9, 0.7, 0.02, WALNUT);
  for (const s of [-1, 1]) c.box(s * (w / 2 - 0.5), 0.37, -0.35, 0.04, 0.72, 0.9, WALNUT);
  for (const x of [-w / 4, w / 4]) {
    c.box(x, 0.77, -0.5, 0.26, 0.012, 0.19, DARK);
    c.box(x, 0.88, -0.45, 0.04, 0.2, 0.03, DARK);
    c.box(x, 1.08, -0.45, 0.64, 0.38, 0.03, BLACK);
    g.box(x, 1.08, -0.467, 0.6, 0.34, 0.004, SCREEN, { yaw: Math.PI });
    c.box(x, 0.77, -0.1, 0.44, 0.02, 0.15, 0x20242b);
    c.box(x + 0.5, 0.78, -0.1, 0.16, 0.05, 0.2, DARK);
  }
  c.cyl(1.4, 1.11, 0.62, 0.05, 0.06, 0.04, GOLD, 12);
  c.sphere(1.4, 1.14, 0.62, 0.035, 0.02, 0.035, GOLD, 8);
  c.box(-1.8, 1.2, 0.7, 0.26, 0.28, 0.06, 0xf2f2f2, { tilt: -0.15 });
  for (let i = 0; i < 3; i++) c.box(-1.8, 1.18 + i * 0.07, 0.72, 0.2, 0.05, 0.015, [0xd9a441, 0x2f6bb0, 0x3b9a4f][i]);
  return { body: c, glow: g };
}

export function waterCooler(): Composite {
  const c = new Composite();
  c.box(0, 0.5, 0, 0.34, 1.0, 0.34, WHITE);
  c.box(0, 0.78, 0.175, 0.2, 0.1, 0.02, 0x20262c);
  c.cyl(-0.05, 0.9, 0.19, 0.014, 0.014, 0.04, 0x2b59c3, 6, 'z');
  c.cyl(0.05, 0.9, 0.19, 0.014, 0.014, 0.04, 0xd23a3a, 6, 'z');
  c.cyl(0, 1.2, 0, 0.14, 0.14, 0.38, 0x86c5e4, 14);
  c.cyl(0, 1.41, 0, 0.05, 0.12, 0.04, 0x86c5e4, 14);
  c.box(0, 0.7, 0.16, 0.12, 0.012, 0.1, STEEL);
  return c;
}

/** Floor-standing office printer / copier. */
export function copier(): { body: Composite; glow: Composite } {
  const c = new Composite(), g = new Composite();
  c.box(0, 0.38, 0, 0.9, 0.76, 0.7, WHITE);
  c.box(0, 0.8, -0.02, 0.9, 0.08, 0.68, GREY);
  c.box(0, 0.86, -0.18, 0.84, 0.03, 0.4, 0x2b2f36);
  c.box(0, 0.5, 0.352, 0.7, 0.04, 0.01, DARK);
  c.box(0, 0.62, 0.35, 0.5, 0.18, 0.012, DARK);
  g.box(0.12, 0.84, 0.3, 0.2, 0.1, 0.01, SCREEN, { tilt: -0.5 });
  g.box(-0.3, 0.78, 0.352, 0.03, 0.012, 0.004, GREEN);
  c.cyl(-0.32, 0.03, 0.3, 0.03, 0.03, 0.06, BLACK, 8);
  c.cyl(0.32, 0.03, 0.3, 0.03, 0.03, 0.06, BLACK, 8);
  return { body: c, glow: g };
}

/** Coffee machine on a pantry counter. */
export function pantryCounter(): { body: Composite; glow: Composite } {
  const c = new Composite(), g = new Composite();
  c.box(0, 0.45, 0, 2.2, 0.9, 0.62, 0xe4e6e9);
  c.box(0, 0.92, 0, 2.24, 0.04, 0.66, 0x3a3f47);
  for (const x of [-0.55, 0.55]) { c.box(x, 0.45, 0.315, 1.0, 0.8, 0.012, 0xf4f5f7); c.box(x + 0.4, 0.55, 0.325, 0.02, 0.16, 0.016, STEEL); }
  c.box(-0.7, 1.12, 0, 0.36, 0.36, 0.3, DARK);
  c.box(-0.7, 1.28, 0.0, 0.34, 0.04, 0.28, STEEL);
  g.box(-0.7, 1.15, 0.155, 0.12, 0.05, 0.005, GREEN);
  c.cyl(-0.7, 1.02, 0.08, 0.04, 0.035, 0.09, 0xf3f3f3, 8);
  c.cyl(0.4, 1.0, 0.0, 0.18, 0.18, 0.16, STEEL, 14);
  c.cyl(0.4, 1.1, 0.0, 0.12, 0.12, 0.04, BLACK, 12);
  c.sphere(0.9, 1.0, 0.0, 0.1, 0.07, 0.1, 0xd0402a, 7);
  c.sphere(1.0, 1.0, 0.1, 0.09, 0.06, 0.09, 0xe8b030, 7);
  return { body: c, glow: g };
}

export function wallClock(): { body: Composite; glow: Composite } {
  const c = new Composite(), g = new Composite();
  c.cyl(0, 0, 0, 0.3, 0.3, 0.05, DARK, 24, 'z');
  c.cyl(0, 0, 0.026, 0.27, 0.27, 0.008, 0xf6f6f2, 24, 'z');
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.box(Math.sin(a) * 0.23, Math.cos(a) * 0.23, 0.032, 0.015, 0.04, 0.006, BLACK, { roll: -a }); }
  c.box(0, 0.07, 0.036, 0.016, 0.16, 0.006, BLACK);
  c.box(0.07, 0.0, 0.037, 0.12, 0.012, 0.006, BLACK);
  g.box(0.0, -0.1, 0.034, 0.006, 0.006, 0.002, RED);
  return { body: c, glow: g };
}

export function trashBin(): Composite {
  const c = new Composite();
  c.cyl(0, 0.2, 0, 0.17, 0.14, 0.4, 0x454b54, 14);
  c.cyl(0, 0.41, 0, 0.175, 0.175, 0.02, STEEL, 14);
  return c;
}

export function fireExtinguisher(): Composite {
  const c = new Composite();
  c.cyl(0, 0.3, 0, 0.065, 0.065, 0.44, 0xc82828, 10);
  c.sphere(0, 0.53, 0, 0.065, 0.05, 0.065, 0xc82828, 8);
  c.box(0, 0.6, 0.02, 0.025, 0.04, 0.05, DARK);
  c.cyl(0.05, 0.5, 0.04, 0.008, 0.008, 0.18, BLACK, 5, 'z');
  c.box(0, 0.35, 0.067, 0.07, 0.12, 0.004, 0xf4f4f4);
  return c;
}

export function firstAid(): Composite {
  const c = new Composite();
  c.box(0, 0, 0, 0.36, 0.3, 0.11, 0x2f9a4a);
  c.box(0, 0, 0.056, 0.04, 0.18, 0.004, WHITE);
  c.box(0, 0, 0.056, 0.18, 0.04, 0.004, WHITE);
  return c;
}

// ------------------------------------------------------------------ lab
/** One 3.3 m bay of a lab bench: steel frame, epoxy worktop, drawers + cupboard below, reagent shelf above with a bench power supply, multimeter and function generator;
 *  on the bench an oscilloscope, a breadboard with wires, a soldering station and a task lamp. Faces +z (the worker stands at +z). */
export function labBench(): { body: Composite; glow: Composite } {
  const c = new Composite(), g = new Composite();
  const L = 3.3;
  c.box(0, 0.92, 0, L, 0.04, 0.85, 0x5d6670);
  c.box(0, 0.945, 0.43, L, 0.012, 0.02, STEEL);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.box(sx * (L / 2 - 0.05), 0.45, sz * 0.38, 0.05, 0.9, 0.05, STEEL);
  c.box(0, 0.15, -0.38, L - 0.1, 0.04, 0.05, STEEL);
  // under-bench: 3 drawer stacks + a cupboard
  for (const [x, w] of [[-1.1, 0.5], [-0.55, 0.5], [0.0, 0.5]] as const) {
    c.box(x, 0.45, 0.0, w, 0.72, 0.7, 0x3b4048);
    for (let i = 0; i < 3; i++) { c.box(x, 0.18 + i * 0.22, 0.352, w - 0.04, 0.2, 0.01, 0x4a515a); c.box(x, 0.25 + i * 0.22, 0.362, 0.18, 0.014, 0.014, STEEL); }
  }
  c.box(0.95, 0.45, 0.0, 1.2, 0.72, 0.7, 0x3b4048);
  for (const s of [-1, 1]) { c.box(0.95 + s * 0.3, 0.45, 0.352, 0.56, 0.68, 0.01, 0x4a515a); c.box(0.95 + s * 0.04, 0.45, 0.362, 0.014, 0.16, 0.014, STEEL); }
  // shelf unit at the back
  for (const s of [-1, 1]) c.box(s * (L / 2 - 0.04), 1.5, -0.34, 0.04, 1.1, 0.1, STEEL);
  c.box(0, 1.3, -0.36, L - 0.08, 0.025, 0.28, 0x7b838d);
  c.box(0, 1.78, -0.36, L - 0.08, 0.025, 0.28, 0x7b838d);
  c.box(0, 1.54, -0.4, L - 0.08, 0.5, 0.02, 0x8a929c);
  g.box(0, 1.28, -0.28, L - 0.2, 0.02, 0.03, WARM);
  // instruments on the shelf: bench PSU, multimeter, function generator
  for (const [x, w, colr] of [[-1.1, 0.4, GREEN], [-0.45, 0.32, AMBER], [0.3, 0.42, SCREEN]] as const) {
    c.box(x, 1.4, -0.34, w, 0.15, 0.3, 0x2b3037);
    c.box(x, 1.4, -0.19, w - 0.02, 0.145, 0.01, 0x4a515a);
    g.box(x - w * 0.18, 1.42, -0.183, w * 0.4, 0.05, 0.004, colr);
    for (let k = 0; k < 3; k++) c.cyl(x + w * 0.12 + k * w * 0.1, 1.37, -0.18, 0.016, 0.016, 0.02, k ? 0xc83a3a : BLACK, 8, 'z');
  }
  // oscilloscope
  c.box(-0.9, 1.07, -0.1, 0.42, 0.24, 0.32, 0x2b3037);
  c.box(-0.9, 1.07, 0.065, 0.42, 0.24, 0.015, 0x3b4048);
  g.box(-0.97, 1.09, 0.075, 0.26, 0.17, 0.004, 0x1b8a5a);
  for (let k = 0; k < 4; k++) c.cyl(-0.78, 1.14 - k * 0.05, 0.078, 0.016, 0.016, 0.02, GREY, 8, 'z');
  // breadboard + wires + soldering station + lamp
  c.box(0.1, 0.945, 0.12, 0.34, 0.015, 0.2, WHITE);
  for (let i = 0; i < 6; i++) c.box(0.0 + i * 0.045, 0.96, 0.12 + (i % 2) * 0.03, 0.02, 0.012, 0.03, [0xd23a3a, 0x2b59c3, 0xffd23a, 0x2e8b4a, 0x1a1a1a, 0xffffff][i]);
  c.box(0.6, 0.97, -0.1, 0.18, 0.06, 0.18, 0x3a3f47);
  g.box(0.6, 0.995, -0.01, 0.06, 0.02, 0.004, RED);
  c.cyl(0.6, 1.0, 0.04, 0.008, 0.008, 0.14, STEEL, 5, 'z');
  c.cyl(1.2, 0.95, 0.0, 0.07, 0.08, 0.02, DARK, 12);
  c.box(1.2, 1.17, 0.0, 0.015, 0.44, 0.015, DARK, { tilt: 0.1 });
  c.box(1.2, 1.4, 0.07, 0.06, 0.03, 0.2, DARK, { tilt: 0.2 });
  g.box(1.2, 1.385, 0.075, 0.05, 0.005, 0.18, WARM, { tilt: 0.2 });
  c.box(1.4, 0.975, 0.15, 0.3, 0.012, 0.22, 0x20242b); // laptop base
  c.box(1.4, 1.1, 0.04, 0.3, 0.2, 0.01, BLACK, { tilt: -0.2 });
  g.box(1.4, 1.1, 0.045, 0.27, 0.17, 0.004, SCREEN, { tilt: -0.2 });
  return { body: c, glow: g };
}

/** 19-inch equipment rack (0.8 x 2.2 x 0.9 m): frame, side panels, 14 units (switches, servers, power distribution) with LEDs, vented door frame and a top fan unit. */
export function rackCabinet(seed: number): { body: Composite; glow: Composite } {
  const c = new Composite(), g = new Composite(), r = rng(seed);
  for (const sx of [-1, 1]) {
    c.box(sx * 0.395, 1.1, 0, 0.02, 2.2, 0.9, 0x23272e);
    for (const sz of [-1, 1]) c.box(sx * 0.3, 1.1, sz * 0.43, 0.04, 2.1, 0.04, STEEL);
  }
  c.box(0, 2.19, 0, 0.8, 0.02, 0.9, 0x23272e);
  c.box(0, 0.06, 0, 0.8, 0.12, 0.9, 0x1b1e23);
  c.box(0, 1.1, -0.44, 0.8, 2.2, 0.02, 0x23272e);
  c.cyl(0, 2.21, 0, 0.12, 0.12, 0.03, BLACK, 14);
  let y = 0.2;
  for (let i = 0; i < 14; i++) {
    const hU = r() < 0.4 ? 2 : 1, h = hU * 0.0445 - 0.004, kind = Math.floor(r() * 3);
    c.box(0, y + h / 2, 0.4, 0.48, h, 0.02, kind === 0 ? 0x30353c : kind === 1 ? 0x464d56 : 0x20242a);
    for (const s of [-1, 1]) c.box(s * 0.255, y + h / 2, 0.4, 0.03, h, 0.02, STEEL);
    c.box(0, y + h / 2, 0.0, 0.46, h - 0.004, 0.7, 0x2b3037);
    for (let v = 0; v < 6; v++) c.box(-0.18 + v * 0.016, y + h * 0.7, 0.412, 0.008, h * 0.35, 0.004, 0x0e1014);
    const leds = 3 + Math.floor(r() * 5);
    for (let l = 0; l < leds; l++) g.box(0.06 + l * 0.028, y + h * 0.5, 0.412, 0.012, 0.012, 0.004, r() < 0.6 ? GREEN : r() < 0.5 ? AMBER : 0x4aa8ff);
    y += hU * 0.0445 + 0.008;
    if (y > 1.9) break;
  }
  for (let i = 0; i < 5; i++) c.cyl(-0.3 + i * 0.03, 0.3, 0.46, 0.012, 0.012, 0.5, [0x1a1a1a, 0x2b59c3, 0xd23a3a, 0xffd23a, 0x1a1a1a][i], 5, 'y', { tilt: 0.05 });
  return { body: c, glow: g };
}

/** Motor test rig frame: T-slot table on 4 legs with a yellow guard, a control cabinet on the side and a status lamp tower. The motor and flywheel are a separate rotating mesh. */
export function motorRigBase(): { body: Composite; glow: Composite } {
  const c = new Composite(), g = new Composite();
  c.box(0, 0.42, 0, 5.6, 0.1, 2.8, 0x3b4048);
  for (let i = 0; i < 9; i++) c.box(0, 0.472, -1.2 + i * 0.3, 5.5, 0.006, 0.025, 0x1a1c20);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.box(sx * 2.6, 0.2, sz * 1.25, 0.2, 0.4, 0.2, 0x2b3037);
  for (const sx of [-1, 1]) c.box(sx * 1.8, 0.62, 0, 0.5, 0.3, 0.9, 0x23272e);
  // safety guard: posts + rails (yellow / black)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.box(sx * 2.7, 0.9, sz * 1.35, 0.06, 0.8, 0.06, 0xf0c020);
  for (const sy of [0.7, 1.2]) {
    c.box(0, sy, 1.35, 5.46, 0.05, 0.05, 0xf0c020);
    c.box(0, sy, -1.35, 5.46, 0.05, 0.05, 0xf0c020);
    for (const sx of [-1, 1]) c.box(sx * 2.7, sy, 0, 0.05, 0.05, 2.7, 0xf0c020);
  }
  // control cabinet + lamp tower
  c.box(-3.5, 1.0, 0.0, 0.7, 2.0, 0.9, 0x2b3037);
  c.box(-3.14, 1.0, 0.0, 0.02, 1.9, 0.82, 0x3b4048);
  g.box(-3.13, 1.5, -0.2, 0.01, 0.3, 0.38, SCREEN);
  for (let i = 0; i < 3; i++) c.cyl(-3.13, 1.1 - i * 0.12, 0.25, 0.03, 0.03, 0.03, [0xc82828, 0xe8b030, 0x2f9a4a][i], 8, 'x');
  c.cyl(3.5, 1.0, 1.0, 0.03, 0.03, 2.0, STEEL, 6);
  for (let i = 0; i < 3; i++) g.cyl(3.5, 2.0 + i * 0.12, 1.0, 0.07, 0.07, 0.1, [RED, AMBER, GREEN][i], 10);
  return { body: c, glow: g };
}

/** The spinning part of a motor test rig: finned motor housing, shaft, gold flywheel with 6 spokes and a rim. Turns about y at x/z = 0. */
export function motorRotor(): Composite {
  const c = new Composite();
  c.cyl(0, 0.35, 0, 0.5, 0.5, 0.7, 0x3a3f47, 20);
  for (let i = 0; i < 7; i++) c.cyl(0, 0.1 + i * 0.1, 0, 0.53, 0.53, 0.035, 0x4a515a, 20);
  c.cyl(0, 0.78, 0, 0.12, 0.12, 0.1, STEEL, 10);
  c.cyl(0, 1.2, 0, 0.07, 0.07, 0.8, STEEL, 8);
  c.cyl(0, 1.7, 0, 0.12, 0.12, 0.12, STEEL, 10);
  c.cyl(0, 1.7, 0, 1.1, 1.1, 0.07, GOLD, 40); // flywheel disc
  c.cyl(0, 1.76, 0, 1.1, 1.1, 0.04, 0xb8962b, 40);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    c.box(Math.sin(a) * 0.55, 1.78, Math.cos(a) * 0.55, 0.12, 0.05, 0.85, 0x3a3f47, { yaw: a });
  }
  c.box(0.95, 1.8, 0, 0.18, 0.18, 0.1, 0xc82828); // balance weight (you see the spin)
  return c;
}

// ------------------------------------------------------------------ hall
/** Hall seat (0.7 m pitch): padded cushion with a rounded front, curved padded back, wooden back trim, armrest on the +x side, steel standard with a foot plate. Faces +z. */
export function hallSeat(fabric = 0x1f3a5c): Composite {
  const c = new Composite();
  c.box(0, 0.42, 0.02, 0.56, 0.1, 0.5, fabric);
  c.box(0, 0.4, 0.27, 0.56, 0.07, 0.06, fabric);
  c.box(0, 0.84, -0.24, 0.55, 0.66, 0.1, fabric, { tilt: -0.1 });
  c.box(0, 0.8, -0.31, 0.5, 0.58, 0.02, WALNUT, { tilt: -0.1 });
  c.box(0.31, 0.62, 0.0, 0.06, 0.04, 0.48, WALNUT);
  c.box(0.31, 0.3, -0.04, 0.03, 0.6, 0.12, STEEL);
  c.box(0.31, 0.01, -0.04, 0.08, 0.02, 0.34, STEEL);
  return c;
}
/** The extra left armrest + standard of the first seat of a block. */
export function hallSeatEdge(): Composite {
  const c = new Composite();
  c.box(-0.31, 0.62, 0.0, 0.06, 0.04, 0.48, WALNUT);
  c.box(-0.31, 0.3, -0.04, 0.03, 0.6, 0.12, STEEL);
  c.box(-0.31, 0.01, -0.04, 0.08, 0.02, 0.34, STEEL);
  return c;
}

/** Lectern: wooden desk with a sloped top, front logo panel, gooseneck microphone, reading lamp, a laptop and a water glass. Faces +z (the audience). */
export function lectern(): { body: Composite; glow: Composite } {
  const c = new Composite(), g = new Composite();
  c.box(0, 0.5, 0, 1.3, 1.0, 0.7, 0x4a2f1c);
  c.box(0, 1.03, 0.02, 1.4, 0.05, 0.8, 0x5a3a24, { tilt: 0.1 });
  c.box(0, 1.1, -0.32, 1.4, 0.06, 0.06, 0x5a3a24);
  c.box(0, 0.5, 0.36, 1.0, 0.62, 0.012, GOLD);
  c.box(0, 0.5, 0.37, 0.9, 0.52, 0.006, 0x4a2f1c);
  c.cyl(0.4, 1.3, 0.1, 0.007, 0.007, 0.5, BLACK, 6, 'y', { tilt: -0.12 });
  c.sphere(0.4, 1.56, 0.04, 0.02, 0.02, 0.035, BLACK, 6);
  c.cyl(-0.45, 1.28, -0.2, 0.008, 0.008, 0.4, BLACK, 6, 'y', { tilt: 0.2 });
  g.box(-0.45, 1.46, -0.12, 0.08, 0.02, 0.1, WARM);
  c.box(0, 1.1, 0.0, 0.34, 0.015, 0.24, 0x20242b, { tilt: 0.1 });
  c.box(0, 1.22, -0.12, 0.34, 0.22, 0.01, BLACK, { tilt: -0.2 });
  c.cyl(0.55, 1.1, -0.2, 0.035, 0.03, 0.09, 0xd8e8f0, 10);
  return { body: c, glow: g };
}

/** Wing chair for the stage (wood arms, tall back, gold feet). */
export function stageChair(): Composite {
  return sofa(0x2a3a5a, 0x2a3a5a, 0.95);
}

/** Line-array speaker stack: 6 black cabinets hanging in an arc, with grilles. Faces +z. */
export function speakerArray(): Composite {
  const c = new Composite();
  for (let i = 0; i < 6; i++) {
    c.box(0, -i * 0.3, 0, 0.5, 0.28, 0.4, 0x1a1c20, { tilt: i * 0.04 });
    c.box(0, -i * 0.3, 0.2, 0.44, 0.22, 0.01, 0x30353c, { tilt: i * 0.04 });
  }
  c.box(0, 0.2, 0, 0.44, 0.08, 0.3, STEEL);
  return c;
}

/** Stage spot light on a bar. Faces +z. */
export function spotLight(): { body: Composite; glow: Composite } {
  const c = new Composite(), g = new Composite();
  c.cyl(0, 0, 0, 0.12, 0.17, 0.34, BLACK, 10, 'z', { tilt: 0.5 });
  c.box(0, 0.18, -0.05, 0.04, 0.2, 0.04, STEEL);
  g.cyl(0, -0.0815, 0.149, 0.14, 0.14, 0.01, 0xfff0cc, 10, 'z', { tilt: 0.5 });
  return { body: c, glow: g };
}

// ------------------------------------------------------------------ step 2: models for the lobby bars, boardroom, executive suites, library, conference centre
/** High-back executive chair in leather: channel-quilted back, wide cushion, walnut-capped arms, chrome star base (0.7 m wide, 1.25 m high). Faces +z. */
export function execChair(): Composite {
  const c = new Composite(), L = 0x2a1a14, L2 = 0x35231a;
  c.cyl(0, 0.07, 0, 0.09, 0.07, 0.05, STEEL, 10);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; c.box(Math.sin(a) * 0.17, 0.07, Math.cos(a) * 0.17, 0.055, 0.03, 0.34, STEEL, { yaw: a, tilt: 0.05 }); c.sphere(Math.sin(a) * 0.32, 0.035, Math.cos(a) * 0.32, 0.03, 0.03, 0.03, BLACK, 6); }
  c.cyl(0, 0.27, 0, 0.04, 0.04, 0.38, STEEL, 8);
  c.box(0, 0.47, 0, 0.3, 0.03, 0.3, DARK);
  c.box(0, 0.52, 0.01, 0.58, 0.1, 0.56, L);
  c.sphere(0, 0.57, 0.0, 0.3, 0.05, 0.29, L2, 10);
  c.box(0, 0.54, 0.29, 0.56, 0.07, 0.06, L, { tilt: 0.3 });
  for (let i = 0; i < 4; i++) c.box(0, 0.7 + i * 0.17, -0.27 - i * 0.012, 0.52, 0.15, 0.1, i % 2 ? L : L2, { tilt: -0.1 });
  for (const sx of [-1, 1]) c.box(sx * 0.29, 0.92, -0.22, 0.07, 0.7, 0.14, L, { tilt: -0.1, roll: sx * 0.08 });
  c.box(0, 1.28, -0.34, 0.5, 0.14, 0.12, L2, { tilt: -0.14 });
  for (const sx of [-1, 1]) { c.box(sx * 0.34, 0.68, 0.0, 0.07, 0.04, 0.4, WALNUT); c.box(sx * 0.33, 0.6, -0.05, 0.04, 0.2, 0.05, STEEL); c.box(sx * 0.31, 0.545, -0.05, 0.05, 0.05, 0.1, STEEL); c.box(sx * 0.345, 0.7, 0.0, 0.085, 0.025, 0.36, L2); }
  return c;
}

/** Executive desk 2.4 x 1.0: walnut top, side pedestals, leather blotter, monitor, desk lamp. Work side (the chair) at +z. */
export function execDesk(): { body: Composite; glow: Composite } {
  const c = new Composite(), g = new Composite();
  c.box(0, 0.74, 0, 2.4, 0.06, 1.0, WALNUT);
  for (const sg of [-1, 1]) { c.box(sg * 1.0, 0.36, 0, 0.36, 0.7, 0.9, WALNUT); for (let i = 0; i < 3; i++) { c.box(sg * 1.0, 0.14 + i * 0.22, 0.455, 0.3, 0.17, 0.01, 0x7d553a); c.box(sg * 1.0, 0.14 + i * 0.22, 0.465, 0.1, 0.02, 0.01, GOLD); } }
  c.box(0, 0.4, -0.38, 1.6, 0.6, 0.04, WALNUT);
  c.box(0, 0.775, 0.1, 0.7, 0.005, 0.4, 0x2a1a14);
  c.box(0, 0.98, -0.2, 0.62, 0.36, 0.03, BLACK); c.box(0, 0.8, -0.2, 0.05, 0.1, 0.05, STEEL); c.box(0, 0.78, -0.2, 0.26, 0.02, 0.16, STEEL);
  g.box(0, 0.98, -0.18, 0.58, 0.32, 0.005, SCREEN);
  c.cyl(0.85, 0.78, -0.2, 0.08, 0.1, 0.02, GOLD, 10); c.cyl(0.85, 0.95, -0.2, 0.012, 0.012, 0.34, GOLD, 6); c.cyl(0.85, 1.13, -0.12, 0.1, 0.05, 0.1, 0x1f5a3a, 10, 'y', { tilt: 0.3 });
  return { body: c, glow: g };
}

/** Bar counter of width w (4.1 half-width for 8 m): marble top, panelled front, brass foot rail, stools, back bar with shelves and bottles. Customers at +z. */
export function barCounter(w: number): { body: Composite; glow: Composite } {
  const c = new Composite(), g = new Composite(), r = rng(7);
  c.box(0, 0.5, 0, w, 1.0, 0.7, WALNUT);
  c.box(0, 1.03, 0.05, w + 0.1, 0.06, 0.9, MARBLE_D);
  c.box(0, 0.12, 0.38, w - 0.1, 0.05, 0.08, GOLD);
  for (let x = -w / 2 + 0.6; x < w / 2 - 0.3; x += 0.9) { c.box(x, 0.55, 0.355, 0.8, 0.7, 0.02, 0x7d553a); c.cyl(x, 0.31, 0.45, 0.02, 0.02, 0.62, GOLD, 6); }
  for (let x = -w / 2 + 0.5; x < w / 2 - 0.2; x += 0.9) { c.cyl(x, 0.62, 0.95, 0.19, 0.19, 0.05, 0x1f1f25, 12); c.cyl(x, 0.3, 0.95, 0.03, 0.03, 0.6, STEEL, 6); c.cyl(x, 0.02, 0.95, 0.2, 0.2, 0.04, STEEL, 12); }
  const bz = -1.0;
  c.box(0, 1.1, bz, w, 2.2, 0.35, 0x2b1c14);
  for (const y of [1.0, 1.45, 1.9]) {
    c.box(0, y, bz + 0.25, w - 0.2, 0.04, 0.3, OAK);
    g.box(0, y - 0.04, bz + 0.3, w - 0.3, 0.02, 0.04, WARM);
    for (let x = -w / 2 + 0.3; x < w / 2 - 0.3; x += 0.16 + r() * 0.1) c.cyl(x, y + 0.14, bz + 0.25, 0.04, 0.04, 0.24 + r() * 0.1, [0x1f6a3a, 0x7a3a1a, 0xb8b2a0, 0x2a3f6a][(r() * 4) | 0], 8);
  }
  return { body: c, glow: g };
}

/** Boardroom table 14 x 6.4: walnut slab on two trestles, gold inlay, 24 chairs round it, a centre planter. Chairs on the long sides face the table. */
export function boardTable(): Composite {
  const c = new Composite();
  c.box(0, 0.76, 0, 14, 0.09, 6.4 - 2.4, WALNUT);
  c.box(0, 0.78, 0, 13.6, 0.01, 0.06, GOLD);
  for (const sx of [-1, 1]) c.box(sx * 5, 0.36, 0, 0.5, 0.72, 2.6, 0x4a2f1f);
  c.cyl(0, 0.9, 0, 0.35, 0.28, 0.25, 0xd8d2c4, 12); c.sphere(0, 1.2, 0, 0.45, 0.4, 0.45, 0x2f8a46, 8);
  const ch = execChair();
  for (let i = 0; i < 9; i++) { const x = -5.6 + i * 1.4; c.merge(ch, x, 0, -1.8, 0, 1); c.merge(ch, x, 0, 1.8, Math.PI, 1); }
  c.merge(ch, -7.5, 0, 0, Math.PI / 2, 1); c.merge(ch, 7.5, 0, 0, -Math.PI / 2, 1);
  return c;
}

/** Workshop / meeting set 4.4 x 2.2: table for six with chairs (three a side). */
export function meetSet(): Composite {
  const c = new Composite(), ch = meetingChair(0x2a3a5a);
  c.box(0, 0.74, 0, 3.2, 0.06, 1.0, OAK); for (const sx of [-1, 1]) c.box(sx * 1.4, 0.36, 0, 0.08, 0.72, 0.9, STEEL);
  for (let i = 0; i < 3; i++) { const x = -1.1 + i * 1.1; c.merge(ch, x, 0, -0.85, 0, 1); c.merge(ch, x, 0, 0.85, Math.PI, 1); }
  return c;
}

/** Double-sided library stack 1.2 x 0.7, 2.0 m high: oak frame, four shelves per side filled with runs of books (a run = one block, to keep it light). */
export function libStack(): Composite {
  const c = new Composite(), r = rng(31);
  c.box(0, 1.0, 0, 1.2, 2.0, 0.04, OAK);
  for (const sx of [-1, 1]) c.box(sx * 0.6, 1.0, 0, 0.04, 2.0, 0.7, OAK);
  c.box(0, 2.0, 0, 1.24, 0.04, 0.74, OAK);
  const cols = [0x6a4a2a, 0x23364f, 0x2f5a3a, 0x8a6a2a, 0x4a3a5a, 0xcfc6b0];
  for (const sz of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const y = 0.1 + k * 0.5;
      c.box(0, y, sz * 0.17, 1.12, 0.03, 0.3, OAK);
      let x = -0.54;
      for (let j = 0; j < 4; j++) { const w = 0.2 + r() * 0.12, h = 0.28 + r() * 0.12; c.box(x + w / 2, y + 0.015 + h / 2, sz * 0.17, w, h, 0.22, cols[(r() * 6) | 0]); x += w + 0.02; }
    }
  }
  return c;
}

/** Reading table 3.6 x 1.0 with two green-shade lamps and four chairs, a chair on each side of each lamp. */
export function readTableSet(): { body: Composite; glow: Composite } {
  const c = new Composite(), g = new Composite(), ch = meetingChair(0x2a3a5a);
  c.box(0, 0.74, 0, 3.6, 0.06, 1.0, OAK); for (const sx of [-1, 1]) c.box(sx * 1.6, 0.36, 0, 0.08, 0.72, 0.9, 0x4a2f1f);
  for (const sx of [-0.9, 0.9]) { c.cyl(sx, 0.78, 0, 0.1, 0.1, 0.02, GOLD, 10); c.cyl(sx, 0.95, 0, 0.012, 0.012, 0.34, GOLD, 6); c.cyl(sx, 1.15, 0, 0.14, 0.08, 0.14, 0x1f5a3a, 10); g.cyl(sx, 1.07, 0, 0.1, 0.1, 0.01, WARM, 10); }
  for (const sx of [-0.9, 0.9]) { c.merge(ch, sx, 0, -0.78, 0, 1); c.merge(ch, sx, 0, 0.78, Math.PI, 1); }
  return { body: c, glow: g };
}

/** Theatre row: eight padded seats on one frame, 4.3 m long, 0.9 m high. Faces +z. */
export function chairRowModel(): Composite {
  const c = new Composite();
  for (let i = 0; i < 8; i++) { const x = -1.88 + i * 0.54; c.box(x, 0.45, 0, 0.5, 0.1, 0.46, 0x1f3a5c); c.box(x, 0.7, -0.2, 0.5, 0.5, 0.08, 0x1f3a5c, { tilt: -0.08 }); }
  for (let i = 0; i <= 8; i++) c.box(-2.15 + 0.08 + i * 0.54, 0.25, 0, 0.04, 0.5, 0.4, STEEL);
  c.box(0, 0.43, 0.02, 4.3, 0.03, 0.04, GOLD);
  return c;
}

/** Round dining table (r 0.75) on a pedestal with four chairs round it. */
export function roundTableSet(): Composite {
  const c = new Composite(), ch = meetingChair(0x2a3a5a);
  c.cyl(0, 0.74, 0, 0.75, 0.75, 0.04, OAK, 20); c.cyl(0, 0.38, 0, 0.06, 0.06, 0.7, STEEL, 8); c.cyl(0, 0.02, 0, 0.35, 0.35, 0.04, STEEL, 14);
  c.cyl(0, 0.78, 0, 0.3, 0.3, 0.005, 0xf4f1e6, 14); c.cyl(0, 0.84, 0, 0.03, 0.03, 0.12, 0xb8d8e8, 8);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; c.merge(ch, Math.sin(a) * 1.1, 0, Math.cos(a) * 1.1, a + Math.PI, 1); }
  return c;
}

/** Park / lobby bench 2.4 x 0.6: wooden slats on cast-steel ends. Faces +z. */
export function parkBench(): Composite {
  const c = new Composite();
  for (let i = 0; i < 4; i++) c.box(0, 0.44, -0.2 + i * 0.1, 2.4, 0.03, 0.08, OAK);
  for (let i = 0; i < 3; i++) c.box(0, 0.62 + i * 0.1, -0.26, 2.4, 0.07, 0.03, OAK, { tilt: -0.15 });
  for (const sx of [-1, 1]) { c.box(sx * 1.1, 0.22, 0, 0.06, 0.44, 0.5, DARK); c.box(sx * 1.2, 0.58, 0, 0.05, 0.05, 0.5, DARK); }
  return c;
}

/** Observation telescope on a pedestal: brass tube on a yoke. Looks towards +z. */
export function telescopeModel(): Composite {
  const c = new Composite();
  c.cyl(0, 0.5, 0, 0.12, 0.2, 1.0, DARK, 10); c.cyl(0, 1.02, 0, 0.18, 0.18, 0.04, GOLD, 10);
  c.box(0, 1.18, 0, 0.3, 0.2, 0.06, DARK);
  c.cyl(0, 1.3, 0.1, 0.07, 0.1, 0.8, GOLD, 12, 'z', { tilt: -0.25 });
  c.cyl(0, 1.38, 0.5, 0.11, 0.11, 0.06, STEEL, 12, 'z', { tilt: -0.25 });
  return c;
}

/** Light server / switchgear rack 0.82 x 0.92 x 2.2 (about 130 triangles), for floors with hundreds of them. Faces +z. */
export function rackLite(seed: number): { body: Composite; glow: Composite } {
  const c = new Composite(), g = new Composite(), r = rng(seed);
  c.box(0, 1.1, 0, 0.8, 2.2, 0.9, 0x1c1f25);
  c.box(0, 1.1, 0.455, 0.7, 2.0, 0.01, 0x2d323b);
  c.box(0, 2.18, 0, 0.82, 0.04, 0.92, STEEL);
  for (let i = 0; i < 3; i++) g.box(-0.25 + i * 0.25, 0.6 + r() * 1.2, 0.462, 0.04, 0.03, 0.004, [GREEN, AMBER, SCREEN][i]);
  g.box(0, 1.9, 0.462, 0.5, 0.02, 0.004, [GREEN, SCREEN][seed & 1]);
  return { body: c, glow: g };
}

/** Light open-plan pod 3.4 x 2.3: four workstations back to back (desk with panel legs, monitor, drawer pedestal, chair), a screen between the rows. About 600 triangles. */
export function deskPod(): { body: Composite; glow: Composite } {
  const c = new Composite(), g = new Composite();
  const fab = [0x23364f, 0x4a5058];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 0.85, z = sz * 0.42;
    c.box(x, 0.745, z, 1.6, 0.04, 0.8, OAK);
    c.box(x - sx * 0.7, 0.36, z, 0.04, 0.72, 0.74, WHITE); c.box(x + sx * 0.7, 0.36, z, 0.04, 0.72, 0.74, WHITE);
    c.box(x + sx * 0.4, 0.3, z, 0.4, 0.6, 0.6, 0xdfe2e6);
    const mz = z - sz * 0.3; c.box(x, 1.05, mz, 0.6, 0.34, 0.03, BLACK); c.box(x, 0.9, mz, 0.05, 0.3, 0.05, DARK);
    g.box(x, 1.05, mz + sz * 0.02, 0.56, 0.3, 0.004, SCREEN);
    const cz = z + sz * 0.78, fb = fab[(sx + 1) >> 1], bk = -sz; // bk: the back of the chair is on the side away from the desk
    c.box(x, 0.46, cz, 0.48, 0.07, 0.48, fb); c.sphere(x, 0.48, cz, 0.26, 0.05, 0.25, fb, 8);
    for (const q of [-1, 1]) c.box(x + q * 0.13, 0.85, cz + sz * 0.23, 0.2, 0.5, 0.05, 0x2b3038, { tilt: sz * 0.12, yaw: q * 0.22 });
    c.box(x, 1.12, cz + sz * 0.27, 0.28, 0.1, 0.06, fb, { tilt: sz * 0.14 });
    for (const q of [-1, 1]) { c.box(x + q * 0.26, 0.62, cz, 0.03, 0.2, 0.03, DARK); c.box(x + q * 0.26, 0.72, cz, 0.06, 0.03, 0.22, BLACK); }
    void bk;
    c.cyl(x, 0.24, cz, 0.035, 0.035, 0.4, STEEL, 6);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; c.box(x + Math.sin(a) * 0.14, 0.06, cz + Math.cos(a) * 0.14, 0.045, 0.03, 0.3, DARK, { yaw: a }); }
  }
  c.box(0, 1.05, 0, 3.3, 0.7, 0.05, 0x4a6a8a);
  return { body: c, glow: g };
}

type Made = Composite | { body: Composite; glow: Composite };
const MODELS: Record<string, () => Made> = {
  chairBlue: () => officeChair(0x23364f), chairGrey: () => officeChair(0x4a5058), chairRed: () => officeChair(0x3a4048),
  stool: labStool, meetChair: () => meetingChair(0x2a3a5a),
  desk: workDesk, partition: () => partition(0x4a6a8a), partition2: () => partition(0x8a6a4a),
  meetTable: () => meetingTable(), whiteboard: () => whiteboard(),
  cabinet: () => filingCabinet(), bookshelf: () => bookshelf(5), bookshelf2: () => bookshelf(11),
  sofaLeather: () => sofa(0x5e3320, 0xd4af37, 2.6), sofaVelvet: () => sofa(0x1f3a5c, 0xd4af37, 2.6),
  armLeather: () => sofa(0x5e3320, 0xd4af37, 0.95), armVelvet: () => sofa(0x1f3a5c, 0xd4af37, 0.95),
  coffeeTable: () => coffeeTable(), sideTable, floorLamp,
  rugBlue: () => rug(6.2, 4.4, 0x2c4670, 0xd4af37), rugRed: () => rug(6.2, 4.4, 0xb9aa8c, 0xd4af37),
  ficus1: () => ficus(1), ficus2: () => ficus(2), ficus3: () => ficus(3, 0xd8d2c4),
  palm1: () => palmPlant(4), palm2: () => palmPlant(9, 0xd8d2c4), snake1: () => snakePlant(6), snake2: () => snakePlant(8),
  reception: () => receptionDesk(12), reception8: () => receptionDesk(8),
  cooler: waterCooler, copier, pantry: pantryCounter, clock: wallClock, bin: trashBin, extinguisher: fireExtinguisher, firstAid,
  labBench, rack0: () => rackCabinet(20), rack1: () => rackCabinet(21), rack2: () => rackCabinet(22), rack3: () => rackCabinet(23), motorRig: motorRigBase,
  bar8: () => barCounter(8.2), bar10: () => barCounter(10.2), boardTable, execDesk, execChair, meetSet44: meetSet, libStackL: libStack, readTable: readTableSet, chairRow: chairRowModel,
  rackL0: () => rackLite(40), rackL1: () => rackLite(41), rackL2: () => rackLite(42), rackL3: () => rackLite(43),
  deskPod,
  roundTable: roundTableSet, parkBench, telescope: telescopeModel,
  hallSeat: () => hallSeat(), hallSeatEdge: () => hallSeatEdge(), lectern, stageChair, speaker: speakerArray, spot: spotLight,
};

/** Names of every model (for the test). */
export const MODEL_NAMES: readonly string[] = Object.keys(MODELS);

/** Define the models called `names` in `F` (each builder defines only what it places, so no geometry is built twice). */
export function defineFurniture(F: Furnish, names: readonly string[]): void {
  for (const n of names) {
    if (F.has(n)) continue;
    const make = MODELS[n];
    if (!make) throw new Error('EVLab furniture: no model called ' + n);
    const m = make();
    if (m instanceof Composite) F.define(n, m); else F.define(n, m.body, m.glow);
  }
}
