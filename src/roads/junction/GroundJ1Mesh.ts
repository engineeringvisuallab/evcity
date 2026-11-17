// STEP J1-e1: mesh data of the ground-level J1 (pure math, no three.js): asphalt of every element, raised islands with kerb walls, lane lines, stop lines, zebra bars.
// Heights come from J1Terrain.levelAt (the same function that carves the terrain), so the mesh lies flat on the ground it made.
import { buildJ1Geometry, type J1Element, type J1Geometry, type V2 } from './GroundJ1Geometry';
import type { J1Terrain } from './GroundJ1Terrain';

export interface J1MeshData { positions: number[]; colors: number[]; indices: number[]; stats: { tris: number; verts: number; islandTris: number; markTris: number } }

const ASPHALT = [0.16, 0.16, 0.17], ASPHALT2 = [0.19, 0.19, 0.20];
const CONCRETE = [0.55, 0.55, 0.52], KERB = [0.66, 0.66, 0.63], WHITE = [0.92, 0.92, 0.9], YELLOW = [0.9, 0.72, 0.12];
const LIFT = 0.02, MARK = 0.045, ISLAND_H = 0.14, MAXEDGE = 8;

export function buildJ1Mesh(t: J1Terrain, geo: J1Geometry = buildJ1Geometry()): J1MeshData {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const st = { tris: 0, verts: 0, islandTris: 0, markTris: 0 };
  const vert = (p: V2, lift: number, col: ReadonlyArray<number>): number => {
    const [x, z] = t.toWorld(p[0], p[1]);
    positions.push(x, t.levelAt(x, z) + lift, z); colors.push(col[0], col[1], col[2]);
    return st.verts++;
  };
  const tri = (a: number, b: number, c: number, kind: 'main' | 'island' | 'mark' = 'main'): void => {
    // wind so that the face looks up (+y)
    const ax = positions[a * 3], az = positions[a * 3 + 2], bx = positions[b * 3], bz = positions[b * 3 + 2], cx = positions[c * 3], cz = positions[c * 3 + 2];
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (ny >= 0) indices.push(a, b, c); else indices.push(a, c, b);
    st.tris++; if (kind === 'island') st.islandTris++; if (kind === 'mark') st.markTris++;
  };
  const len = (a: V2, b: V2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const lerp2 = (a: V2, b: V2, k: number): V2 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

  /** Fill a convex cell with triangles no longer than MAXEDGE, flat colour, lifted by `lift`. */
  const fill = (poly: ReadonlyArray<V2>, lift: number, col: ReadonlyArray<number>, kind: 'main' | 'island' | 'mark' = 'main'): void => {
    if (poly.length === 4) {
      const [p0, p1, p2, p3] = poly;
      const nu = Math.max(1, Math.ceil(Math.max(len(p0, p1), len(p3, p2)) / MAXEDGE)), nv = Math.max(1, Math.ceil(Math.max(len(p0, p3), len(p1, p2)) / MAXEDGE));
      const g: number[][] = [];
      for (let j = 0; j <= nv; j++) { const row: number[] = []; for (let i = 0; i <= nu; i++) { const a = lerp2(p0, p1, i / nu), b = lerp2(p3, p2, i / nu); row.push(vert(lerp2(a, b, j / nv), lift, col)); } g.push(row); }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { tri(g[j][i], g[j][i + 1], g[j + 1][i + 1], kind); tri(g[j][i], g[j + 1][i + 1], g[j + 1][i], kind); }
      return;
    }
    if (poly.length === 3) {
      const [a, b, c] = poly;
      if (Math.max(len(a, b), len(b, c), len(c, a)) <= MAXEDGE) { tri(vert(a, lift, col), vert(b, lift, col), vert(c, lift, col), kind); return; }
      const ab = lerp2(a, b, 0.5), bc = lerp2(b, c, 0.5), ca = lerp2(c, a, 0.5);
      fill([a, ab, ca], lift, col, kind); fill([ab, b, bc], lift, col, kind); fill([ca, bc, c], lift, col, kind); fill([ab, bc, ca], lift, col, kind);
      return;
    }
    // other convex polygons: fan from the centroid
    const c: V2 = [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
    for (let i = 0; i < poly.length; i++) fill([c, poly[i], poly[(i + 1) % poly.length]], lift, col, kind);
  };

  /** A flat strip of `w` metres along the segment a -> b (a lane line piece). */
  const line = (a: V2, b: V2, w: number, col: ReadonlyArray<number>): void => {
    const l = len(a, b); if (l < 1e-3) return;
    const nx = -(b[1] - a[1]) / l * (w / 2), ny = (b[0] - a[0]) / l * (w / 2);
    fill([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], MARK, col, 'mark');
  };
  const dashed = (a: V2, b: V2, w: number, col: ReadonlyArray<number>, on = 3, period = 9): void => {
    const l = len(a, b); if (l < 0.5) return;
    for (let s = 0; s < l; s += period) { const e = Math.min(l, s + on); line(lerp2(a, b, s / l), lerp2(a, b, e / l), w, col); }
  };

  const isIsland = (e: J1Element): boolean => e.kind === 'island' || e.kind === 'corner-island';
  for (const e of geo.elements) {
    if (isIsland(e)) {
      for (const c of e.cells) fill(c, ISLAND_H, CONCRETE, 'island');
      // kerb walls on the boundary edges (edges that belong to exactly one cell)
      const cnt = new Map<string, { a: V2; b: V2; n: number }>();
      const key = (p: V2): string => p[0].toFixed(3) + ',' + p[1].toFixed(3);
      for (const c of e.cells) for (let i = 0; i < c.length; i++) {
        const a = c[i], b = c[(i + 1) % c.length], k1 = key(a), k2 = key(b), k = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
        const f = cnt.get(k); if (f) f.n++; else cnt.set(k, { a, b, n: 1 });
      }
      for (const { a, b, n } of cnt.values()) {
        if (n !== 1 || len(a, b) < 1e-3) continue;
        const m = Math.max(1, Math.ceil(len(a, b) / MAXEDGE));
        for (let i = 0; i < m; i++) {
          const p = lerp2(a, b, i / m), q = lerp2(a, b, (i + 1) / m);
          const v0 = vert(p, 0, KERB), v1 = vert(q, 0, KERB), v2 = vert(q, ISLAND_H, KERB), v3 = vert(p, ISLAND_H, KERB);
          tri(v0, v1, v2, 'island'); tri(v0, v2, v3, 'island');
        }
      }
      continue;
    }
    const col = e.kind === 'box' ? ASPHALT : e.kind === 'pocket' || e.kind.startsWith('slip') ? ASPHALT2 : ASPHALT;
    for (const c of e.cells) fill(c, LIFT, col);
    // lane lines along the OUTER edge (vertex 1 -> 2) of every strip cell
    if (e.kind === 'through-in' || e.kind === 'through-out' || e.kind === 'pocket') {
      const last = /T4|O4$/.test(e.id);
      for (const c of e.cells) { if (c.length !== 4) continue; if (last) line(c[1], c[2], 0.18, WHITE); else dashed(c[1], c[2], 0.15, WHITE); }
    }
  }
  for (const l of geo.stopLines) line(l.a, l.b, l.width, WHITE);
  for (const b of geo.bars) fill(b.poly, MARK, b.kind === 'zebra-slip' ? WHITE : WHITE, 'mark');
  void YELLOW;
  return { positions, colors, indices, stats: st };
}
