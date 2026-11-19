import type { TerrainSample } from './Lakes';
import { WORLD_ZONES, FACILITIES, getWorldZoneAt } from '../city/WorldZones';
import { ENGINEERING_AREAS } from '../city/EngineeringZones';

/**
 * FLAT RESIDENTIAL, STEP 2 + 3: the flat / gentle residential zones (6 in step 2, 4 more in step 3) get ONE flat level inside the zone and a smooth blend back to the natural
 * ground outside it (user choice "upay C, part A"). The hilly residential zones and the villages are NOT in this table (later step).
 *
 *   h = nat - w * smoothClamp(nat - level, CAP)
 *
 *   - level: the flat ground height (m) of the zone = median natural height of its flat / gentle cells (Step 2a table).
 *   - smoothClamp: cut / fill is at most CAP (8 m); where the natural ground is more than ~6 m away from the level (a hill inside the zone)
 *     the hill stays a hill (it is only moved by at most CAP), so no mountain is cut away.
 *   - w: 1 inside the zone, falls to 0 over `blend` metres outside it (smoothstep). The zone is its power-diagram cell of WorldZones.ts
 *     (convex: a few half-planes, no zone lookup) minus the engineering areas and facilities (they keep their own pads).
 *   - the ground fades to natural towards rivers, lakes and the sea (BANK_FADE), so wet ground and its banks are never touched and nothing floods.
 *
 * It is a pure function of (x, z, natural height): analytic, no table lookup, no loop over the map. It runs in TerrainGenerator.sample()
 * AFTER the natural ground and BEFORE the road earthworks (roads / rail were planned on natural ground and keep their own heights).
 */

export interface FlatZoneDef {
  id: string;
  /** Flat ground height (m above sea). */
  level: number;
  /** Width (m) of the blend outside the zone border. */
  blend: number;
  /** Sea fade width (m of height above sea): the ground fades out between 0.6 m and 0.6 + seaFade m above sea level. Default SEA_FADE. */
  seaFade?: number;
}

/** Max cut / fill (m) of the flattening. */
export const FLAT_CAP = 8;
/** Inside |nat - level| <= FLAT_FULL the ground is exactly flat; between FLAT_FULL and the cap it eases off. */
const FLAT_FULL = 6;
/** The flat ground fades out towards a river / lake: 0 at the water edge, 1 at BANK_FADE m from it (smoothstep), so banks keep their shape and nothing floods. */
const BANK_FADE = 90;
/** How far (m) beyond a lake's own shore the lake query looks. */
export const BANK_REACH = BANK_FADE + 20;
/** Sea: the ground fades out between 0.6 m and 3.6 m above sea level. */
const SEA_FADE = 3;

export const FLAT_ZONES: readonly FlatZoneDef[] = [
  { id: 'nw-town', level: 19.2, blend: 200 },
  { id: 'south-suburb', level: 33.2, blend: 200 },
  { id: 'north-homes', level: 20.3, blend: 200 },
  { id: 'east-suburb', level: 30.2, blend: 200 },
  { id: 'east-homes', level: 31.9, blend: 200 },
  { id: 'sw-homes', level: 14.8, blend: 200 },
  // STEP 3 / task 3: four more zones. level = median natural height of the gentle (slope < 8 %) dry cells that the six zones above do NOT already
  // shift (neighbour blend), so the old zones' blend does not pull the new level. Zones listed after the first six: flatShift runs on the ground
  // the earlier zones already moved. NOT in the table on purpose: north-labour (80 % of it is more than 8 m from any level, median 68 m high)
  // and the 4 hill villages (76-95 % steep): a flat level with an 8 m cap would do nothing there.
  { id: 'se-dense', level: 30.3, blend: 320 },
  { id: 'west-homes', level: 29.0, blend: 320 },
  { id: 'west-suburb', level: 16.4, blend: 320 },
  { id: 'sw-newtown', level: 19.3, blend: 320, seaFade: 30 },
];

/** STEP 3, building plots: a plot (footprint rectangle) gets a flat pad; it blends to the ground over PLOT_BLEND m outside the plot. */
export const PLOT_BLEND = 80;
/** Plot pad cut / fill: flat exactly where |ground - level| <= PLOT_FULL, eases to PLOT_CAP (a hill under the plot stays a hill). */
export const PLOT_FULL = 1.5;
export const PLOT_CAP = 2;
/** The plot pad fades to the natural ground towards water: 0 at the edge, 1 at PLOT_BANK_FADE m. */
const PLOT_BANK_FADE = 25;

export interface PlotInput { x: number; z: number; yaw: number; W: number; D: number }
export interface PlotPad { x: number; z: number; yaw: number; W: number; D: number; level: number; c: number; s: number; hw: number; hd: number; reach2: number }

/** STEP 3: LINEAR water fade (0 at the edge, 1 at `len` m): its steepest slope is 1 / len, a smoothstep's is 1.5 / len, so the flattening adds less steepness near water. */
const linearFade = (d: number, len: number): number => (d <= 0 ? 0 : d >= len ? 1 : d / len);

const smoothstep = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/** Cut / fill actually applied for a natural offset d (m): d up to FLAT_FULL, then it eases to +-FLAT_CAP. */
export function flatShift(d: number): number {
  const a = d < 0 ? -d : d;
  if (a <= FLAT_FULL) return d;
  const r = FLAT_FULL + (FLAT_CAP - FLAT_FULL) * Math.tanh((a - FLAT_FULL) / (FLAT_CAP - FLAT_FULL));
  return d < 0 ? -r : r;
}

/** Cut / fill actually applied by a plot pad for an offset d (m). */
export function plotShift(d: number): number {
  const a = d < 0 ? -d : d;
  if (a <= PLOT_FULL) return d;
  const r = PLOT_FULL + (PLOT_CAP - PLOT_FULL) * Math.tanh((a - PLOT_FULL) / (PLOT_CAP - PLOT_FULL));
  return d < 0 ? -r : r;
}

interface Rect { x0: number; z0: number; x1: number; z1: number }

class FlatZone {
  readonly level: number;
  readonly blend: number;
  readonly seaFade: number;
  /** Half-planes of the zone cell: inside when c - (nx * x + nz * z) >= 0 (normalised, so the value is the distance in metres). */
  private nx: number[] = [];
  private nz: number[] = [];
  private c: number[] = [];
  /** Areas that keep their own ground (engineering areas, facilities) near this zone. */
  private keep: Rect[] = [];
  /** Corners of the zone cell (convex polygon, in order): the exact distance to the zone outside it. */
  private px: number[] = [];
  private pz: number[] = [];
  private bx0 = 0;
  private bz0 = 0;
  private bx1 = 0;
  private bz1 = 0;

  constructor(def: FlatZoneDef) {
    this.level = def.level;
    this.blend = def.blend;
    this.seaFade = def.seaFade ?? SEA_FADE;
    const me = WORLD_ZONES.find((z) => z.id === def.id);
    if (!me) throw new Error(`ResidentialFlat: unknown zone ${def.id}`);
    // power diagram: p is in zone i when |p-si|^2 - wi^2 is the smallest. Against j that is a half-plane. Clip a big square by all of them
    // and keep only the planes that really make an edge of the cell.
    type V = { x: number; z: number; lab: number };
    let poly: V[] = [{ x: -9000, z: -9000, lab: -1 }, { x: 9000, z: -9000, lab: -1 }, { x: 9000, z: 9000, lab: -1 }, { x: -9000, z: 9000, lab: -1 }];
    const planes: { nx: number; nz: number; c: number }[] = [];
    for (const o of WORLD_ZONES) {
      if (o === me) continue;
      const ax = o.x - me.x, az = o.z - me.z;
      const len = Math.hypot(ax, az);
      const nx = ax / len, nz = az / len;
      const c = (o.x * o.x + o.z * o.z - o.w * o.w - (me.x * me.x + me.z * me.z) + me.w * me.w) / (2 * len);
      const k = planes.length;
      planes.push({ nx, nz, c });
      const sd = (v: V): number => c - (nx * v.x + nz * v.z);
      const out: V[] = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const sa = sd(a), sb = sd(b);
        if (sa >= 0) {
          out.push(sb >= 0 ? a : { x: a.x, z: a.z, lab: a.lab });
          if (sb < 0) {
            const t = sa / (sa - sb);
            out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, lab: k });
          }
        } else if (sb >= 0) {
          const t = sa / (sa - sb);
          out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, lab: a.lab });
        }
      }
      poly = out;
    }
    const used = new Set<number>();
    for (const v of poly) if (v.lab >= 0) used.add(v.lab);
    for (const k of used) { this.nx.push(planes[k].nx); this.nz.push(planes[k].nz); this.c.push(planes[k].c); }
    for (const v of poly) { this.px.push(v.x); this.pz.push(v.z); }
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const v of poly) { x0 = Math.min(x0, v.x); z0 = Math.min(z0, v.z); x1 = Math.max(x1, v.x); z1 = Math.max(z1, v.z); }
    const m = this.blend + 2;
    this.bx0 = x0 - m; this.bz0 = z0 - m; this.bx1 = x1 + m; this.bz1 = z1 + m;
    const near = (r: Rect): boolean => r.x1 > this.bx0 - m && r.x0 < this.bx1 + m && r.z1 > this.bz0 - m && r.z0 < this.bz1 + m;
    for (const e of ENGINEERING_AREAS) if (near(e)) this.keep.push({ x0: e.x0, z0: e.z0, x1: e.x1, z1: e.z1 });
    for (const f of FACILITIES) if (near(f)) this.keep.push({ x0: f.x0, z0: f.z0, x1: f.x1, z1: f.z1 });
  }

  /** Weight 0..1 of the flat ground at (x, z): 1 inside the zone, 0 beyond the blend. */
  weight(x: number, z: number): number {
    if (x < this.bx0 || x > this.bx1 || z < this.bz0 || z > this.bz1) return 0;
    let s = Infinity; // > 0 inside the cell: the smallest distance to a border half-plane
    for (let i = 0; i < this.c.length; i++) {
      const d = this.c[i] - (this.nx[i] * x + this.nz[i] * z);
      if (d < s) s = d;
    }
    let out = 0; // distance (m) from the flat ground: 0 inside the zone
    if (s < 0) out = this.distToCell(x, z); // outside the cell: the exact distance to its border
    for (let i = 0; i < this.keep.length; i++) {
      const r = this.keep[i];
      const dx = Math.max(r.x0 - x, x - r.x1), dz = Math.max(r.z0 - z, z - r.z1);
      if (dx < 0 && dz < 0) { const d = -Math.max(dx, dz); if (d > out) out = d; } // inside a keep-out rectangle: the way out of it
      else { /* outside the rectangle: nothing to flatten away */ }
    }
    if (out <= 0) return 1;
    if (out >= this.blend) return 0;
    return 1 - smoothstep(0, this.blend, out);
  }

  /** Exact distance from a point outside the (convex) cell to its border. */
  private distToCell(x: number, z: number): number {
    let best = Infinity;
    const n = this.px.length;
    for (let i = 0; i < n; i++) {
      const ax = this.px[i], az = this.pz[i], bx = this.px[(i + 1) % n], bz = this.pz[(i + 1) % n];
      const ex = bx - ax, ez = bz - az;
      const l2 = ex * ex + ez * ez;
      let t = l2 > 0 ? ((x - ax) * ex + (z - az) * ez) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d2 = (x - ax - ex * t) ** 2 + (z - az - ez * t) ** 2;
      if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  }
}

export class ResidentialFlat {
  private readonly zones: FlatZone[] = FLAT_ZONES.map((d) => new FlatZone(d));
  private readonly wq = { d: Infinity, level: 0 };
  /** Set false to get the natural ground back (checks compare before / after). */
  enabled = true;
  /** STEP 3: set false to switch the building plot pads off (checks compare before / after). */
  plotsEnabled = true;
  private plots: PlotPad[] = [];

  /** `waterEdge(x, z, out)`: lowers out.d to the distance (m) to the nearest river / lake edge (negative inside) and sets out.level (query only). */
  constructor(private readonly waterEdge: (x: number, z: number, out: { d: number; level: number }) => void) {}

  /**
   * STEP 3: building plots of the 6 flat zones. `ground(x, z)` = the ground with the zone flattening but WITHOUT plot pads and roads. The pad level is the
   * MEDIAN of 5 x 5 points over the plot (same footprint formula as PlacedBuildings: world = p + lx * (c, -s) + lz * (s, c)). Plots outside the 6 zones are ignored.
   * Runs once (constructor of TerrainGenerator); apply() only reads the small table.
   */
  buildPlots(list: readonly PlotInput[], ground: (x: number, z: number) => number): void {
    const ids = new Set(FLAT_ZONES.map((d) => d.id));
    this.plots = []; // ground() below must not see half built pads
    const built: PlotPad[] = [];
    for (const p of list) {
      if (!ids.has(getWorldZoneAt(p.x, p.z).id)) continue;
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw), hw = p.W / 2, hd = p.D / 2;
      const hs: number[] = [];
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const lx = (i / 2) * hw, lz = (j / 2) * hd;
        hs.push(ground(p.x + lx * c + lz * s, p.z - lx * s + lz * c));
      }
      hs.sort((a, b) => a - b);
      const reach = Math.hypot(hw, hd) + PLOT_BLEND + 1;
      built.push({ x: p.x, z: p.z, yaw: p.yaw, W: p.W, D: p.D, level: hs[12], c, s, hw, hd, reach2: reach * reach });
    }
    this.plots = built;
  }

  /** The plot pads that were built (checks, tools). */
  get plotPads(): readonly PlotPad[] { return this.plots; }

  /** Flattens out.h (natural ground, rivers and lakes already in). */
  apply(x: number, z: number, out: TerrainSample): void {
    if (!this.enabled) return;
    const nat = out.h;
    // STEP 3: where two flat zones meet their blends overlap. Every zone pulls the NATURAL ground towards its own level; if the weights add up
    // to more than 1 the shifts are averaged (weight-normalised), so cut / fill stays <= FLAT_CAP and the ground eases from one level to the
    // other. With a weight sum <= 1 (one zone, or no overlap) this is exactly the plain shift of before.
    let shift = 0;
    let wsum = 0;
    let waterFade = 1;
    let queried = false;
    for (let i = 0; i < this.zones.length; i++) {
      const zn = this.zones[i];
      const w = zn.weight(x, z);
      if (w <= 0) continue;
      if (!queried) {
        queried = true;
        this.wq.d = Infinity;
        this.waterEdge(x, z, this.wq);
        waterFade = linearFade(this.wq.d, BANK_FADE);
      }
      // the sea fade is per zone (a zone whose land reaches the beach can ask for a wider one, see FlatZoneDef.seaFade)
      shift += w * flatShift(nat - zn.level) * smoothstep(0.6, 0.6 + zn.seaFade, nat);
      wsum += w;
    }
    // normalise by the zone weights only (NOT by the water fade), then fade the whole shift towards water: the fade must scale the final shift
    out.h = nat - waterFade * (wsum > 1 ? shift / wsum : shift);
    if (this.plotsEnabled && this.plots.length > 0) this.applyPlots(x, z, out, nat);
  }

  /** RESIDENTIAL LEVEL (2026-11-19): the biggest flat-zone weight (0..1) at (x, z). 1 = the ground is fully the flat zone ground (roads of the area are laid on it), 0 = natural ground. */
  weightAt(x: number, z: number): number {
    if (!this.enabled) return 0;
    let m = 0;
    for (let i = 0; i < this.zones.length; i++) { const w = this.zones[i].weight(x, z); if (w > m) m = w; }
    return m;
  }

  /** Plot pads (STEP 3): same water fade idea as the zones, shorter (PLOT_BANK_FADE). */
  private applyPlots(x: number, z: number, out: TerrainSample, nat: number): void {
    let fade = -1;
    for (let i = 0; i < this.plots.length; i++) {
      const p = this.plots[i];
      const dx = x - p.x, dz = z - p.z;
      if (dx * dx + dz * dz > p.reach2) continue;
      const lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c;
      const ex = Math.abs(lx) - p.hw, ez = Math.abs(lz) - p.hd;
      const outside = Math.hypot(ex > 0 ? ex : 0, ez > 0 ? ez : 0);
      if (outside >= PLOT_BLEND) continue;
      let w = 1 - smoothstep(0, PLOT_BLEND, outside);
      if (fade < 0) {
        this.wq.d = Infinity;
        this.waterEdge(x, z, this.wq);
        fade = linearFade(this.wq.d, PLOT_BANK_FADE) * smoothstep(0.6, 0.6 + SEA_FADE, nat);
      }
      w *= fade;
      if (w <= 0) continue;
      out.h -= w * plotShift(out.h - p.level);
    }
  }
}
