// AUTO CONNECT AT GRADE, A-5 (mesh side). Pure maths (no three.js): the vertex-coloured mesh of ONE pad: asphalt surface, kerb walls, roundabout island, stop / give-way lines, zebra.
// Heights: the pad surface = the pad level f (AutoPadTerrain) + LIFT, and never lower than the real road ribbon in a leg corridor (JunctionAuto LegGeom.prof) + LIFT, so the old ribbon never shows through.
import type { V2, LegGeom } from './JunctionAuto';
import type { AutoPadTerrain } from './JunctionAutoTerrain';

export interface AutoMeshData { positions: number[]; colors: number[]; indices: number[]; stats: { verts: number; tris: number; surfaceTris: number; kerbTris: number; markTris: number; islandTris: number } }

const ASPHALT = [0.16, 0.16, 0.17], KERB = [0.66, 0.66, 0.63], WHITE = [0.92, 0.92, 0.9], GRASS = [0.30, 0.45, 0.22], CONCRETE = [0.55, 0.55, 0.52];
/** The ribbon is lifted 0.08 m (LOD 0, RoadMesh LIFT) or 0.025 m (physics LOD): the pad lies above both. */
export const AUTO_LIFT = 0.09;
const MARK = 0.02, KERB_H = 0.12, ISLAND_H = 0.14, MAXEDGE = 4;

const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
const dot = (a: V2, b: V2): number => a[0] * b[0] + a[1] * b[1];
const cross = (o: V2, a: V2, b: V2): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Ear clipping of a simple polygon (any orientation). Returns triangles as index triples into `pts`. */
export function triangulate(pts: ReadonlyArray<V2>): number[][] {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]; }
  const idx = Array.from({ length: n }, (_, i) => i);
  if (area < 0) idx.reverse();
  const tris: number[][] = [];
  const inTri = (p: V2, a: V2, b: V2, c: V2): boolean => cross(a, b, p) >= -1e-9 && cross(b, c, p) >= -1e-9 && cross(c, a, p) >= -1e-9;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    let bestK = 0, bestC = 1e18;
    for (let k = 0; k < idx.length; k++) {
      const ia = idx[(k + idx.length - 1) % idx.length], ib = idx[k], ic = idx[(k + 1) % idx.length];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      const cr = cross(a, b, c);
      if (Math.abs(cr) < bestC) { bestC = Math.abs(cr); bestK = k; }
      if (cr <= 1e-9) continue; // reflex or flat
      let ok = true;
      for (const j of idx) { if (j === ia || j === ib || j === ic) continue; if (inTri(pts[j], a, b, c)) { ok = false; break; } }
      if (!ok) continue;
      tris.push([ia, ib, ic]);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) { // flat polygon part: drop the flattest vertex
      const k = bestK;
      tris.push([idx[(k + idx.length - 1) % idx.length], idx[k], idx[(k + 1) % idx.length]]);
      idx.splice(k, 1);
    }
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

export function buildAutoPadMesh(padNo: number, terr: AutoPadTerrain): AutoMeshData {
  const pad = terr.padAt(padNo);
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const st = { verts: 0, tris: 0, surfaceTris: 0, kerbTris: 0, markTris: 0, islandTris: 0 };

  /** Real road height + lift if (x, z) is inside the corridor of a leg (road ribbon lies there), else null. */
  const corridorY = (x: number, z: number, extra: number): number | null => {
    let y: number | null = null;
    for (const l of pad.legs) {
      const d: V2 = sub([x, z], l.q);
      const s = dot(d, l.u), lat = dot(d, l.n);
      if (s < 0 || s > l.prof.length - 1 || Math.abs(lat) > l.halfW + 1.5) continue;
      const k = Math.floor(s), f = s - k;
      const yr = l.prof[k] + (l.prof[Math.min(l.prof.length - 1, k + 1)] - l.prof[k]) * f;
      if (y === null || yr > y) y = yr;
    }
    return y === null ? null : y + extra;
  };
  /** Surface height of the pad at (x, z). */
  const surfY = (x: number, z: number): number => {
    const f = terr.levelOf(padNo, x, z) + AUTO_LIFT;
    const c = corridorY(x, z, AUTO_LIFT);
    return c !== null && c > f ? c : f;
  };
  const vert = (x: number, z: number, y: number, col: ReadonlyArray<number>): number => { positions.push(x, y, z); colors.push(col[0], col[1], col[2]); return st.verts++; };
  const tri = (a: number, b: number, c: number, kind: 'surface' | 'kerb' | 'mark' | 'island'): void => {
    const ax = positions[a * 3], az = positions[a * 3 + 2], bx = positions[b * 3], bz = positions[b * 3 + 2], cx = positions[c * 3], cz = positions[c * 3 + 2];
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (kind === 'kerb') indices.push(a, b, c); // walls are double sided in the material, any winding
    else if (ny >= 0) indices.push(a, b, c); else indices.push(a, c, b);
    st.tris++;
    if (kind === 'surface') st.surfaceTris++; else if (kind === 'kerb') st.kerbTris++; else if (kind === 'mark') st.markTris++; else st.islandTris++;
  };

  // ---- 1. surface: ear clip the outline, then split every triangle uniformly until no edge is longer than MAXEDGE
  const outline = pad.outline.filter((p, i, a) => { const q = a[(i + a.length - 1) % a.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6; });
  const base = triangulate(outline);
  let longest = 0;
  for (const t of base) for (let e = 0; e < 3; e++) { const a = outline[t[e]], b = outline[t[(e + 1) % 3]]; longest = Math.max(longest, Math.hypot(a[0] - b[0], a[1] - b[1])); }
  const levels = Math.max(0, Math.ceil(Math.log2(longest / MAXEDGE)));
  const emit = (a: V2, b: V2, c: V2, lv: number): void => {
    if (lv === 0) { tri(vert(a[0], a[1], surfY(a[0], a[1]), ASPHALT), vert(b[0], b[1], surfY(b[0], b[1]), ASPHALT), vert(c[0], c[1], surfY(c[0], c[1]), ASPHALT), 'surface'); return; }
    const ab: V2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], bc: V2 = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2], ca: V2 = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
    emit(a, ab, ca, lv - 1); emit(ab, b, bc, lv - 1); emit(ca, bc, c, lv - 1); emit(ab, bc, ca, lv - 1);
  };
  for (const t of base) emit(outline[t[0]], outline[t[1]], outline[t[2]], levels);

  // ---- 2. kerb walls on every outline edge that is not a leg end (a leg end = both points on the trim line of one leg)
  const isEnd = (a: V2, b: V2): boolean => pad.legs.some((l: LegGeom) => Math.abs(dot(sub(a, l.q), l.u) - l.trim) < 0.02 && Math.abs(dot(sub(b, l.q), l.u) - l.trim) < 0.02);
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    if (isEnd(a, b)) continue;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const m = Math.max(1, Math.ceil(L / 2));
    for (let k = 0; k < m; k++) {
      const p: V2 = [a[0] + ((b[0] - a[0]) * k) / m, a[1] + ((b[1] - a[1]) * k) / m], q: V2 = [a[0] + ((b[0] - a[0]) * (k + 1)) / m, a[1] + ((b[1] - a[1]) * (k + 1)) / m];
      const yp = surfY(p[0], p[1]), yq = surfY(q[0], q[1]);
      const v0 = vert(p[0], p[1], yp, KERB), v1 = vert(q[0], q[1], yq, KERB), v2 = vert(q[0], q[1], yq + KERB_H, KERB), v3 = vert(p[0], p[1], yp + KERB_H, KERB);
      tri(v0, v1, v2, 'kerb'); tri(v0, v2, v3, 'kerb');
    }
  }

  // ---- 3. roundabout island: raised disc + kerb ring
  if (pad.ring) {
    const R = pad.ring.islandR, N = 48;
    const yc = surfY(pad.x, pad.z) + ISLAND_H;
    const c0 = vert(pad.x, pad.z, yc, GRASS);
    const ring: number[] = [], wall0: number[] = [], wall1: number[] = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * 2 * Math.PI, x = pad.x + R * Math.cos(a), z = pad.z + R * Math.sin(a);
      ring.push(vert(x, z, yc, CONCRETE));
      wall0.push(vert(x, z, surfY(x, z), KERB));
      wall1.push(vert(x, z, yc, KERB));
    }
    for (let k = 0; k < N; k++) {
      const k2 = (k + 1) % N;
      tri(c0, ring[k], ring[k2], 'island');
      tri(wall0[k], wall0[k2], wall1[k2], 'kerb'); tri(wall0[k], wall1[k2], wall1[k], 'kerb');
    }
  }

  // ---- 4. markings: a strip of width w along a -> b, lying on the pad (or on the ribbon beyond the trim end)
  const strip = (a: V2, b: V2, w: number): void => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-3) return;
    const nx = (-(b[1] - a[1]) / L) * (w / 2), nz = ((b[0] - a[0]) / L) * (w / 2);
    const m = Math.max(1, Math.ceil(L / 2));
    for (let k = 0; k < m; k++) {
      const p: V2 = [a[0] + ((b[0] - a[0]) * k) / m, a[1] + ((b[1] - a[1]) * k) / m], q: V2 = [a[0] + ((b[0] - a[0]) * (k + 1)) / m, a[1] + ((b[1] - a[1]) * (k + 1)) / m];
      const y = (x: number, z: number): number => surfY(x, z) + MARK;
      const v0 = vert(p[0] + nx, p[1] + nz, y(p[0] + nx, p[1] + nz), WHITE), v1 = vert(q[0] + nx, q[1] + nz, y(q[0] + nx, q[1] + nz), WHITE);
      const v2 = vert(q[0] - nx, q[1] - nz, y(q[0] - nx, q[1] - nz), WHITE), v3 = vert(p[0] - nx, p[1] - nz, y(p[0] - nx, p[1] - nz), WHITE);
      tri(v0, v1, v2, 'mark'); tri(v0, v2, v3, 'mark');
    }
  };
  for (const m of pad.markings) {
    const leg = pad.legs[m.leg];
    if (m.kind === 'stop') {
      // a T has a solid stop line, a roundabout entry a give-way line of dashes (same data, dashes on a ring)
      const dash = !!pad.ring;
      if (!dash) { strip(add2(m.p0, leg.u, 0.15), add2(m.p1, leg.u, 0.15), 0.3); continue; }
      const L = Math.hypot(m.p1[0] - m.p0[0], m.p1[1] - m.p0[1]);
      for (let s = 0; s < L; s += 1.0) { const e = Math.min(L, s + 0.5); strip(lerp(m.p0, m.p1, s / L), lerp(m.p0, m.p1, e / L), 0.4); }
    } else {
      const d = m.depth ?? 3, nBars = Math.max(1, Math.floor(Math.hypot(m.p1[0] - m.p0[0], m.p1[1] - m.p0[1]) / 1.0));
      for (let k = 0; k < nBars; k++) {
        const t = (k + 0.5) / nBars;
        const c = lerp(m.p0, m.p1, t);
        strip(c, add2(c, leg.u, d), 0.5);
      }
    }
  }
  return { positions, colors, indices, stats: st };
}
function add2(p: V2, u: V2, k: number): V2 { return [p[0] + u[0] * k, p[1] + u[1] * k]; }
function lerp(a: V2, b: V2, t: number): V2 { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
