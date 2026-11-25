// J9-d: the ground footprint of the 300 ft junction mesh. Pure math, no three.js.
// Used as a VEGETATION mask (grass, trees, rocks keep off it) through RoadNetwork.vegMaskAt, and for the minimap shapes.
// The footprint is RASTERISED FROM THE MESH ITSELF (buildJ300Mesh: surface, concrete, slope and furniture triangles seen from above) with a margin, so it always matches what is drawn
// (the flares of the arm legs and the ramp aprons are wider than the arm / ramp data lines). A 2 m grid over the bounding box is built once, lazily, only when a probe lands in the bounding box.
// Switch OFF: never built, nothing changes.
import { J300_STRUCT_C } from './J300StructC';
import { buildJ300Mesh } from './J300SolidMesh';

/** Margin (m) around the mesh triangles, around the platform circle, and the raster cell size (m). */
export const J300_FP = { margin: 3, platformMargin: 6, cell: 2 } as const;

interface C {
  deck: { cx: number; cz: number; ro: number };
  surfArms: { id: string; top: number; pts: number[][] }[];
  surfRamps: { id: string; rows: number[][] }[];
}
const D = J300_STRUCT_C as unknown as C;

let raster: Uint8Array | null = null;
let gx0 = 0, gz0 = 0, gw = 0, gh = 0;
let bounds = [Infinity, Infinity, -Infinity, -Infinity]; // x0, z0, x1, z1 of the mesh + margin

/** Distance from (px, pz) to the triangle (inside = 0). */
function distTri(px: number, pz: number, ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number {
  const d1 = (bx - ax) * (pz - az) - (bz - az) * (px - ax);
  const d2 = (cx - bx) * (pz - bz) - (cz - bz) * (px - bx);
  const d3 = (ax - cx) * (pz - cz) - (az - cz) * (px - cx);
  if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return 0;
  const seg = (x1: number, z1: number, x2: number, z2: number): number => {
    const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((px - x1) * dx + (pz - z1) * dz) / l2)) : 0;
    return Math.hypot(px - x1 - dx * t, pz - z1 - dz * t);
  };
  return Math.min(seg(ax, az, bx, bz), seg(bx, bz, cx, cz), seg(cx, cz, ax, az));
}

function build(): void {
  const m = buildJ300Mesh();
  const pos = m.positions, idx = m.indices;
  const M = J300_FP.margin, C = J300_FP.cell;
  for (let i = 0; i < pos.length; i += 3) {
    bounds = [Math.min(bounds[0], pos[i] - M), Math.min(bounds[1], pos[i + 2] - M), Math.max(bounds[2], pos[i] + M), Math.max(bounds[3], pos[i + 2] + M)];
  }
  gx0 = Math.floor(bounds[0] / C) * C; gz0 = Math.floor(bounds[1] / C) * C;
  gw = Math.ceil((bounds[2] - gx0) / C) + 1; gh = Math.ceil((bounds[3] - gz0) / C) + 1;
  raster = new Uint8Array(gw * gh);
  const reach = M + C * 0.72;
  for (let t = 0; t * 3 + 2 < idx.length; t++) {
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const ax = pos[a], az = pos[a + 2], bx = pos[b], bz = pos[b + 2], cx = pos[c], cz = pos[c + 2];
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - reach - gx0) / C)), i1 = Math.min(gw - 1, Math.floor((Math.max(ax, bx, cx) + reach - gx0) / C));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - reach - gz0) / C)), j1 = Math.min(gh - 1, Math.floor((Math.max(az, bz, cz) + reach - gz0) / C));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (raster[j * gw + i]) continue;
      if (distTri(gx0 + (i + 0.5) * C, gz0 + (j + 0.5) * C, ax, az, bx, bz, cx, cz) <= reach) raster[j * gw + i] = 1;
    }
  }
}

/** True when (x, z) is on the ground of the 300 ft junction: the mesh seen from above (platform, arms, ramps, walls, slopes, poles) + 3 m, and the platform circle + 6 m. */
export function j300InFootprint(x: number, z: number): boolean {
  const dx = x - D.deck.cx, dz = z - D.deck.cz;
  const rr = D.deck.ro + J300_FP.platformMargin;
  if (dx * dx + dz * dz <= rr * rr) return true;
  if (!raster) build();
  if (x < bounds[0] || x > bounds[2] || z < bounds[1] || z > bounds[3]) return false;
  const i = Math.floor((x - gx0) / J300_FP.cell), j = Math.floor((z - gz0) / J300_FP.cell);
  return i >= 0 && j >= 0 && i < gw && j < gh && raster![j * gw + i] === 1;
}

/** Number of 2 m cells in the footprint raster (for the check script). */
export function j300FootprintCells(): number {
  if (!raster) build();
  let n = 0;
  for (let i = 0; i < raster!.length; i++) n += raster![i];
  return n;
}

/** Polylines for the minimap: roundabout (cx, cz, r), arm centre lines with their paved half width, ramp centre lines with the ramp half width. */
export function j300MapShapes(): { circle: { x: number; z: number; r: number }; lines: { pts: number[][]; half: number }[] } {
  const lines: { pts: number[][]; half: number }[] = [];
  for (const a of D.surfArms) lines.push({ pts: a.pts.map((p) => [p[0], p[1]]), half: a.top });
  for (const r of D.surfRamps) {
    const pts = r.rows.map((q) => [(q[0] + q[6]) / 2, (q[1] + q[7]) / 2]);
    const q0 = r.rows[Math.floor(r.rows.length / 2)];
    lines.push({ pts, half: Math.hypot(q0[6] - q0[0], q0[7] - q0[1]) / 2 });
  }
  return { circle: { x: D.deck.cx, z: D.deck.cz, r: D.deck.ro }, lines };
}
