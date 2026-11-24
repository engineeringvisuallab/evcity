// STEP HK-9d-2: (a) GORE MARKINGS of the 4 C-D roads (hatching in the narrow nose, chevrons in the wider part) and (b) the CRASH CUSHION + BARRIER at the closed lane of the J1-S arm (local y +30 .. 0).
// Pure mesh data (positions / colours / indices, absolute world coordinates, no scene) like HkDeckPaving.ts. The gore paint is VISUAL ONLY (no collider); the cushion + barrier mesh is also the collider (same triangles).
// GORE (engineer reading, the user may correct): the C-D road HK-CD-* leaves / joins its main road (arm J1-S or link M6-1) at a shallow angle. The paved gore is the wedge between the white lane edge line of the main road
// (arm 19.175 m, link 13.575 m from its axis, from SHADER_ROW_M8 / M6) and the left edge line of the C-D road (3.75 m inside its centre, the road shader draws it at halfWidth - 0.45). It starts at the nose (lines 0 m apart)
// and is painted only while it lies on asphalt (C-D pavement edge on the main road pavement edge: arm C-D centre <= 26.3 m, link <= 20.2 m); beyond that a 3 m unpaved verge opens (NOT painted).
// Inside the wedge, 0.2 m from both lines: narrow part (inner width 0.4 .. 1.0 m) = 45 deg HATCHING stripes; wider part (inner width >= 1.0 m) = CHEVRONS (V, 45 deg legs) whose apex points to the narrow tip of the wedge
// (upstream at a diverge, downstream at a merge): the V follows the wedge. GM.apexToTip = false flips it.
import type { RoadNetwork } from '../RoadNetwork';
import type { MeshData, Rgb } from './RingBridgeGeometry';
import type { HkFrame } from './HkRamps';
import { HM9D, HP } from './HkDeckPaving';
import { SHADER_ROW_M6, SHADER_ROW_M8 } from '../section/ShaderSection';

export const GM = {
  edgeC: 3.75, edgeHalf: 0.08, margin: 0.2, chevW: 0.35, chevPitch: 4.0, chevMinW: 1.0, hatchMinW: 0.4, hatchPitch: 2.5, hatchW: 0.4, mark: 0.006, pavedSlack: 0.05, rampHalf: 4.2, apexToTip: true,
} as const;
/** Crash cushion (6.0 m, nose 0.6 -> tail 1.0 m wide, 0.9 m high) + concrete barrier (0.6 m wide, VERTICAL faces, 0.81 m high: with a sloped face the probe ball rode over it, a vertical face stops it) on the centre of the closed east lane of the arm. ESTIMATE sizes, not a product data sheet. */
export const CB = { y0: HM9D.dropY1, cushionLen: 6.0, noseW: 0.6, tailW: 1.0, cushionH: 0.9, barrierBase: 0.6, barrierTop: 0.6, barrierH: 0.81, yEnd: 0, step: 6.0 } as const;

const WHITE: Rgb = [0.95, 0.95, 0.93], CONCRETE: Rgb = [0.68, 0.68, 0.66], YELLOW: Rgb = [0.92, 0.74, 0.08], NOSE: Rgb = [0.1, 0.1, 0.1];

class B {
  readonly d: MeshData = { positions: [], colors: [], indices: [] };
  v(x: number, y: number, z: number, c: Rgb): number { const i = this.d.positions.length / 3; this.d.positions.push(x, y, z); this.d.colors.push(c[0], c[1], c[2]); return i; }
  quad(a: number, b: number, c: number, e: number): void { this.d.indices.push(a, b, c, a, c, e); }
  /** Paint quad: wound so that its normal points up (lighting like the road). */
  upQuad(a: number, b: number, c: number, e: number): void {
    const p = this.d.positions, ux = p[b * 3] - p[a * 3], uz = p[b * 3 + 2] - p[a * 3 + 2], vx = p[c * 3] - p[a * 3], vz = p[c * 3 + 2] - p[a * 3 + 2];
    if (uz * vx - ux * vz > 0) this.quad(a, b, c, e); else this.quad(a, e, c, b);
  }
}

type Road = RoadNetwork['roads'][number];
/** A road axis sorted by local y (north), east-pointing normal at every point. */
interface Axis { xs: number[]; zs: number[]; ys: number[]; ly: number[]; nx: number[]; nz: number[] }
function axisOf(r: Road, f: HkFrame): Axis {
  const idx: number[] = [];
  const locY = (x: number, z: number): number => (x - f.ox) * f.nx + (z - f.oz) * f.nz;
  for (let k = 0; k < r.xs.length; k++) { const y = locY(r.xs[k], r.zs[k]); if (y > -900 && y < 900) idx.push(k); }
  idx.sort((a, b) => locY(r.xs[a], r.zs[a]) - locY(r.xs[b], r.zs[b]));
  const a: Axis = { xs: [], zs: [], ys: [], ly: [], nx: [], nz: [] };
  idx.forEach((k, i) => {
    const p = idx[Math.max(0, i - 1)], q = idx[Math.min(idx.length - 1, i + 1)];
    let tx = r.xs[q] - r.xs[p], tz = r.zs[q] - r.zs[p]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    let px = -tz, pz = tx; if (px * f.ex + pz * f.ez < 0) { px = -px; pz = -pz; }
    a.xs.push(r.xs[k]); a.zs.push(r.zs[k]); a.ys.push(r.ys[k]); a.ly.push(locY(r.xs[k], r.zs[k])); a.nx.push(px); a.nz.push(pz);
  });
  return a;
}
/** Axis point at local y: world x / z, surface level, east normal. */
function atY(a: Axis, y: number): { x: number; z: number; lvl: number; nx: number; nz: number } {
  let i = 0; while (i < a.ly.length - 2 && a.ly[i + 1] < y) i++;
  const d = a.ly[i + 1] - a.ly[i], t = d === 0 ? 0 : Math.max(0, Math.min(1, (y - a.ly[i]) / d)), m = (p: number[]): number => p[i] + (p[i + 1] - p[i]) * t;
  return { x: m(a.xs), z: m(a.zs), lvl: m(a.ys), nx: m(a.nx), nz: m(a.nz) };
}
/** Outward offset c of a C-D road from the main axis as a function of the local y of its foot point on the axis (side = +1 east, -1 west). Returns sorted samples. */
function cdProfile(a: Axis, r: Road, side: number): { y: number[]; c: number[] } {
  const rows: number[][] = [];
  for (let k = 0; k < r.xs.length; k++) {
    let best = Infinity, yf = 0, lat = 0;
    for (let i = 0; i < a.xs.length - 1; i++) {
      const bx = a.xs[i + 1] - a.xs[i], bz = a.zs[i + 1] - a.zs[i], l2 = bx * bx + bz * bz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((r.xs[k] - a.xs[i]) * bx + (r.zs[k] - a.zs[i]) * bz) / l2)) : 0;
      const fx = a.xs[i] + bx * t, fz = a.zs[i] + bz * t, d = Math.hypot(r.xs[k] - fx, r.zs[k] - fz);
      if (d < best) { best = d; yf = a.ly[i] + (a.ly[i + 1] - a.ly[i]) * t; lat = (r.xs[k] - fx) * (a.nx[i] + a.nx[i + 1]) / 2 + (r.zs[k] - fz) * (a.nz[i] + a.nz[i + 1]) / 2; }
    }
    rows.push([yf, lat * side]);
  }
  rows.sort((p, q) => p[0] - q[0]);
  return { y: rows.map((p) => p[0]), c: rows.map((p) => p[1]) };
}
const lerpAt = (p: { y: number[]; c: number[] }, y: number): number => {
  if (y < p.y[0] || y > p.y[p.y.length - 1]) return NaN;
  let i = 0; while (i < p.y.length - 2 && p.y[i + 1] < y) i++;
  const d = p.y[i + 1] - p.y[i]; return p.c[i] + (p.c[i + 1] - p.c[i]) * (d === 0 ? 0 : (y - p.y[i]) / d);
};

export interface GoreInfo { id: string; main: string; kind: 'diverge' | 'merge'; yTip: number; yWide: number; length: number; wMax: number; nChevron: number; nHatch: number; edgeMain: number; mainHalf: number }
export interface GoreSet { mesh: MeshData; zones: GoreInfo[] }

const GORES = [
  { id: 'CD-E-N', road: 'HK-CD-E-N', main: 'J1-S', side: 1 }, { id: 'CD-W-N', road: 'HK-CD-W-N', main: 'J1-S', side: -1 },
  { id: 'CD-E-S', road: 'HK-CD-E-S', main: 'M6-1', side: 1 }, { id: 'CD-W-S', road: 'HK-CD-W-S', main: 'M6-1', side: -1 },
] as const;

/** Hatching + chevrons in the paved gore wedge of every C-D road. */
export function buildHkGoreMarks(roads: RoadNetwork, f: HkFrame): GoreSet {
  const m = new B(), zones: GoreInfo[] = [];
  const lift = HP.lift + GM.mark;
  for (const g of GORES) {
    const main = roads.roads.find((r) => r.name === g.main), cd = roads.roads.find((r) => r.name === g.road);
    if (!main || !cd) continue;
    const row = g.main === 'J1-S' ? SHADER_ROW_M8 : SHADER_ROW_M6;
    const ax = axisOf(main, f), pr = cdProfile(ax, cd, g.side);
    const uA = row.whiteAt + row.lineHalf, half = row.halfWidth, cLim = half + GM.rampHalf + GM.pavedSlack;
    const wAt = (y: number): number => lerpAt(pr, y) - GM.edgeC - GM.edgeHalf - uA; // wedge width between the two line faces
    const uC = (y: number): number => lerpAt(pr, y) - GM.edgeC - GM.edgeHalf;
    // the paved wedge: width > 0 and C-D pavement edge not beyond the main pavement edge
    let yLo = Infinity, yHi = -Infinity;
    for (let y = pr.y[0]; y <= pr.y[pr.y.length - 1]; y += 0.25) { const c = lerpAt(pr, y); if (c - GM.edgeC - GM.edgeHalf - uA > 0 && c <= cLim) { yLo = Math.min(yLo, y); yHi = Math.max(yHi, y); } }
    if (!(yHi - yLo > 5)) continue;
    const wLo = wAt(yLo + 0.3), wHi = wAt(yHi - 0.3), tipLow = wLo < wHi; // tip = the narrow end
    const yTip = tipLow ? yLo : yHi, yWide = tipLow ? yHi : yLo, dirW = tipLow ? 1 : -1, len = yHi - yLo;
    const win = (y: number): number => wAt(y) - 2 * GM.margin;
    const P = (y: number, u: number): number => { const p = atY(ax, y); return m.v(p.x + p.nx * g.side * u, p.lvl + lift, p.z + p.nz * g.side * u, WHITE); };
    const stripe = (y0: number, u0: number, y1: number, u1: number): void => {
      const dy = y1 - y0, du = u1 - u0, l = Math.hypot(dy, du) || 1, py = (-du / l) * GM.chevW / 2, pu = (dy / l) * GM.chevW / 2;
      m.upQuad(P(y0 + py, u0 + pu), P(y0 - py, u0 - pu), P(y1 - py, u1 - pu), P(y1 + py, u1 + pu));
    };
    const tOf = (y: number): number => Math.abs(y - yTip);
    let tHatch = NaN, tChev = NaN;
    for (let t = 0; t <= len; t += 0.1) { const w = win(yTip + dirW * t); if (Number.isNaN(tHatch) && w >= GM.hatchMinW) tHatch = t; if (w >= GM.chevMinW) { tChev = t; break; } }
    let nH = 0, nC = 0;
    if (!Number.isNaN(tHatch) && !Number.isNaN(tChev)) {
      for (let t = tHatch; t < tChev - 0.5; t += GM.hatchPitch) { // 45 deg hatching across the wedge: stripe leans downstream by its own width
        const y0 = yTip + dirW * t, sh = Math.max(0.3, win(y0)), y1 = y0 + dirW * sh;
        if (tOf(y1) > len - 0.3) break;
        const uIn = uA + GM.margin; // corners: main-road line side at y0, C-D line side at y1
        m.upQuad(P(y0, uIn), P(y0 + dirW * GM.hatchW, uIn), P(y1 + dirW * GM.hatchW, uC(y1) - GM.margin), P(y1, uC(y1) - GM.margin)); nH++;
      }
    }
    if (!Number.isNaN(tChev)) {
      for (let t = tChev; t < len; t += GM.chevPitch) {
        const ya = yTip + dirW * t, wi = win(ya), L = Math.max(0.6, win(ya + dirW * wi / 2) / 2), yb = ya + dirW * L;
        if (tOf(yb) > len - 0.2) break;
        const uMid = uA + GM.margin + wi / 2, uIn = uA + GM.margin, uOut = uC(yb) - GM.margin;
        if (GM.apexToTip) { stripe(ya, uMid, yb, uIn); stripe(ya, uMid, yb, uOut); } else { stripe(yb, uMid, ya, uIn); stripe(yb, uMid, ya, uOut); }
        nC++;
      }
    }
    zones.push({ id: g.id, main: g.main, kind: tipLow === cdTravelUp(cd, f) ? 'diverge' : 'merge', yTip, yWide, length: len, wMax: Math.max(wLo, wHi), nChevron: nC, nHatch: nH, edgeMain: row.whiteAt, mainHalf: half });
  }
  return { mesh: m.d, zones };
}
/** True when the road is built in the direction of increasing local y (north). The C-D roads are stored in travel direction. */
function cdTravelUp(cd: Road, f: HkFrame): boolean {
  const y = (k: number): number => (cd.xs[k] - f.ox) * f.nx + (cd.zs[k] - f.oz) * f.nz;
  return y(cd.xs.length - 1) > y(0);
}

/** World point on the J1-S arm at local y, u m east of its axis (u < 0 west), with the road surface level and the unit vector along the arm to the north (for the check script). */
export function hkArmAt(roads: RoadNetwork, f: HkFrame, y: number, u = 0): { x: number; y: number; z: number; tx: number; tz: number } | null {
  const arm = roads.roads.find((r) => r.name === 'J1-S');
  if (!arm) return null;
  const ax = axisOf(arm, f), p = atY(ax, y), q = atY(ax, y + 1);
  const tl = Math.hypot(q.x - p.x, q.z - p.z) || 1;
  return { x: p.x + p.nx * u, y: p.lvl, z: p.z + p.nz * u, tx: (q.x - p.x) / tl, tz: (q.z - p.z) / tl };
}

export interface CrashSet { mesh: MeshData; info: { yNose: number; yTail: number; yEnd: number; u: number; triangles: number } }

/** Crash cushion at the start of the closed east lane (nose y +30, pointing at the southbound traffic) and the concrete barrier that continues it down to y 0, centred on the lane. Visual mesh = collider.
 *  Every face has its own 4 vertices (flat shading) and is wound OUTWARD (normal away from the prism centre): Rapier triangle meshes only push from the front side (HK-9d-2: with mixed winding a ball ran into the barrier). */
export function buildHkCrashBarrier(roads: RoadNetwork, f: HkFrame): CrashSet {
  const m = new B();
  const arm = roads.roads.find((r) => r.name === 'J1-S');
  const empty: CrashSet = { mesh: m.d, info: { yNose: CB.y0, yTail: CB.y0 - CB.cushionLen, yEnd: CB.yEnd, u: 0, triangles: 0 } };
  if (!arm) return empty;
  const ax = axisOf(arm, f), uc = (HM9D.laneInner + HM9D.laneOuter) / 2;
  type V3 = [number, number, number];
  const wp = (y: number, du: number, h: number): V3 => { const p = atY(ax, y); return [p.x + p.nx * (uc + du), p.lvl + h, p.z + p.nz * (uc + du)]; };
  /** One flat face a-b-c-d, wound so that its normal points away from `cen`. */
  const face = (a: V3, b: V3, c: V3, d: V3, cen: V3, col: Rgb): void => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const fx = (a[0] + b[0] + c[0] + d[0]) / 4 - cen[0], fy = (a[1] + b[1] + c[1] + d[1]) / 4 - cen[1], fz = (a[2] + b[2] + c[2] + d[2]) / 4 - cen[2];
    const q = nx * fx + ny * fy + nz * fz >= 0 ? [a, b, c, d] : [a, d, c, b];
    const id = q.map((p) => m.v(p[0], p[1], p[2], col));
    m.quad(id[0], id[1], id[2], id[3]);
  };
  const centre = (ps: V3[]): V3 => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length, ps.reduce((s, p) => s + p[2], 0) / ps.length];
  /** Prism along the sections ys (north -> south): bottom width wb, top width wt, height h. Sides / top / bottom per segment, end caps coloured capN (north) / capS (south). */
  const prism = (ys: number[], wb: (y: number) => number, wt: (y: number) => number, h: number, c: Rgb, capN: Rgb, capS: Rgb): void => {
    const side: Rgb = [c[0] * 0.82, c[1] * 0.82, c[2] * 0.82];
    const sec = (y: number): V3[] => [wp(y, -wb(y) / 2, 0), wp(y, wb(y) / 2, 0), wp(y, wt(y) / 2, h), wp(y, -wt(y) / 2, h)]; // BL BR TR TL
    for (let i = 0; i < ys.length - 1; i++) {
      const A = sec(ys[i]), Bq = sec(ys[i + 1]), cen = centre([...A, ...Bq]);
      face(A[1], Bq[1], Bq[2], A[2], cen, side); // east side
      face(A[3], Bq[3], Bq[0], A[0], cen, side); // west side
      face(A[0], Bq[0], Bq[1], A[1], cen, side); // bottom
      face(A[3], A[2], Bq[2], Bq[3], cen, c); // top
    }
    const all: V3[] = []; for (const y of ys) all.push(...sec(y));
    const cen = centre(all), N = sec(ys[0]), S = sec(ys[ys.length - 1]);
    face(N[0], N[1], N[2], N[3], cen, capN);
    face(S[0], S[1], S[2], S[3], cen, capS);
  };
  const yTail = CB.y0 - CB.cushionLen;
  // cushion: y 30 -> 24, width 0.6 -> 1.0 (box section), nose face dark
  const cw = (y: number): number => CB.noseW + (CB.tailW - CB.noseW) * (CB.y0 - y) / CB.cushionLen;
  prism([CB.y0, yTail], cw, cw, CB.cushionH, YELLOW, NOSE, YELLOW);
  // barrier: y 24 -> 0 in 6 m sections (the arm axis bends a little), trapezoid section
  const ys: number[] = []; for (let y = yTail; y > CB.yEnd + 0.01; y -= CB.step) ys.push(y); ys.push(CB.yEnd);
  prism(ys, () => CB.barrierBase, () => CB.barrierTop, CB.barrierH, CONCRETE, CONCRETE, CONCRETE);
  return { mesh: m.d, info: { yNose: CB.y0, yTail, yEnd: CB.yEnd, u: uc, triangles: m.d.indices.length / 3 } };
}
