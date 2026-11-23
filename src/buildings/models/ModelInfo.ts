// WHAT A BUILDING MODEL TELLS THE GAME BESIDES ITS LOOKS (pure data, no three.js): the solid parts (collision), the doors and the wudu taps.
// Every number is in the MODEL frame: origin = centre of the footprint at ground level, front (street side) = +Z, y up, metres.
// BuildingKit fills it while the model is built; BuildingPhysics (colliders) and BuildingInteract (doors, wudu) read it.

/** One solid box (centre, half sizes, turn about Y). A wall, a counter, a plinth, a roof slab ... */
export interface SolidBox { x: number; y: number; z: number; hx: number; hy: number; hz: number; yaw: number }

/** One solid upright cylinder (column, trunk, minaret ...): centre, radius, half height. */
export interface SolidCyl { x: number; y: number; z: number; r: number; hh: number }

/**
 * One door in a wall that faces +Z (the front). (x, z) = the middle of the opening on the OUTER face of the wall, y = floor of the room behind it,
 * w / h = opening size, t = wall thickness. The door leaf (BuildingInteract) is hinged at the opening and swings into the room.
 */
export interface DoorSpec {
  x: number; y: number; z: number; w: number; h: number; t: number;
  /** Colour of the door leaf. */
  leaf: number;
  /** The door of a mosque prayer hall (wudu is asked for before it). */
  hall: boolean;
}

/** A row of wudu (ablution) taps: world model positions of the taps and the height of the tap spout. The player washes standing within ~2 m of a tap. */
export interface WuduSpec { taps: { x: number; z: number }[]; y: number }

export interface ModelInfo {
  solids: SolidBox[];
  cyls: SolidCyl[];
  doors: DoorSpec[];
  wudu: WuduSpec[];
}

export const emptyInfo = (): ModelInfo => ({ solids: [], cyls: [], doors: [], wudu: [] });

/** A rectangle in some 2-D plane (a0..a1 along, b0..b1 across). */
export interface Rect2 { a0: number; a1: number; b0: number; b1: number }

/** `base` minus all `cuts`: a list of rectangles that tile what is left (neighbours with the same extent are merged, so a wall with one door gives 3 pieces). */
export function carveRect(base: Rect2, cuts: readonly Rect2[], min = 0.04): Rect2[] {
  const eps = 1e-6;
  const marks = new Set<number>([base.a0, base.a1]);
  for (const c of cuts) {
    if (c.a1 <= base.a0 + eps || c.a0 >= base.a1 - eps || c.b1 <= base.b0 + eps || c.b0 >= base.b1 - eps) continue;
    marks.add(Math.min(base.a1, Math.max(base.a0, c.a0)));
    marks.add(Math.min(base.a1, Math.max(base.a0, c.a1)));
  }
  const xs = [...marks].sort((p, q) => p - q);
  const out: Rect2[] = [];
  let open: Rect2[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const p = xs[i]!, q = xs[i + 1]!;
    if (q - p < 1e-5) continue;
    // free b intervals in this column
    let free: [number, number][] = [[base.b0, base.b1]];
    for (const c of cuts) {
      if (c.a0 >= q - eps || c.a1 <= p + eps) continue;
      const next: [number, number][] = [];
      for (const [f0, f1] of free) {
        if (c.b1 <= f0 + eps || c.b0 >= f1 - eps) { next.push([f0, f1]); continue; }
        if (c.b0 > f0 + eps) next.push([f0, c.b0]);
        if (c.b1 < f1 - eps) next.push([c.b1, f1]);
      }
      free = next;
    }
    const still: Rect2[] = [];
    for (const [f0, f1] of free) {
      const run = open.find((r) => Math.abs(r.b0 - f0) < eps && Math.abs(r.b1 - f1) < eps && Math.abs(r.a1 - p) < eps);
      if (run) { run.a1 = q; still.push(run); open.splice(open.indexOf(run), 1); } else still.push({ a0: p, a1: q, b0: f0, b1: f1 });
    }
    for (const r of open) out.push(r);
    open = still;
  }
  for (const r of open) out.push(r);
  return out.filter((r) => r.a1 - r.a0 >= min && r.b1 - r.b0 >= min);
}
