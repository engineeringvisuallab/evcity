import * as THREE from 'three';
import { Config } from '../core/Config';
import { Q } from '../core/Quality';
import type { RoadNetwork } from './RoadNetwork';
import { MS, medianHalfAt, planMedians } from './MedianPlan';

/**
 * ROADS STEP 2: the visible median: a raised kerb on each side (150 mm) with a soil strip between, as a companion mesh on top of the road ribbon.
 * Built lazily per 250 m square when the player comes near, and dropped again when far, so the 50 km of divided road cost nothing far away.
 *
 * Profile across the road (u = metres to the left of the centreline, h = height above the road surface), 8 points, 7 strips:
 *   (+mh,-sink) (+mh,kH) (+mh-kW,kH) (+mh-kW,kH-drop) | soil | (-mh+kW,kH-drop) (-mh+kW,kH) (-mh,kH) (-mh,-sink)
 * The rounded nose at each end narrows mh (MedianPlan.medianHalfAt).
 */
const SQUARE = 250;
const SINK = 0.06;
const KERB_TOP: [number, number, number] = [0.68, 0.67, 0.64];
const KERB_FACE: [number, number, number] = [0.52, 0.51, 0.49];
const SOIL: [number, number, number] = [0.26, 0.34, 0.14];

interface Square { cx: number; cz: number; segs: { run: number; k: number }[]; mesh: THREE.Mesh | null }

export class MedianView {
  readonly group = new THREE.Group();
  private squares: Square[] = [];
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private plan;
  private timer = 9;
  /** Debug HUD / measurements. */
  drawnTriangles = 0;
  builtSquares = 0;

  constructor(parent: THREE.Object3D, roads: RoadNetwork) {
    this.plan = planMedians(roads);
    const HALF = Config.world.size / 2;
    const map = new Map<string, Square>();
    this.plan.runs.forEach((run, ri) => {
      for (let k = 0; k < run.n - 1; k++) {
        const mx = (run.p[k * MS] + run.p[(k + 1) * MS]) / 2;
        const mz = (run.p[k * MS + 2] + run.p[(k + 1) * MS + 2]) / 2;
        const cx = Math.floor((mx + HALF) / SQUARE);
        const cz = Math.floor((mz + HALF) / SQUARE);
        const key = cx + ',' + cz;
        let sq = map.get(key);
        if (!sq) { sq = { cx: cx * SQUARE - HALF + SQUARE / 2, cz: cz * SQUARE - HALF + SQUARE / 2, segs: [], mesh: null }; map.set(key, sq); }
        sq.segs.push({ run: ri, k });
      }
    });
    this.squares = [...map.values()];
    parent.add(this.group);
  }

  /** 2 Hz: build the squares near the player (at most 2 per tick), hide / drop the others. Player position in WORLD metres. */
  update(dt: number, px: number, pz: number): void {
    this.timer += dt;
    if (this.timer < 0.5) return;
    this.timer = 0;
    const draw = Config.city.roadside.drawRadius * Q.roadsideMul * Config.city.median.drawRange;
    let built = 0;
    let tris = 0;
    let count = 0;
    for (const sq of this.squares) {
      const d = Math.hypot(sq.cx - px, sq.cz - pz);
      const on = d < draw + SQUARE * 0.71;
      if (on && !sq.mesh && built < 2) { sq.mesh = this.build(sq); built++; }
      if (sq.mesh) {
        sq.mesh.visible = on;
        if (on) tris += (sq.mesh.geometry.getIndex()?.count ?? 0) / 3;
        if (d > draw + SQUARE * 0.71 + 250) { this.drop(sq); continue; }
        count++;
      }
    }
    this.drawnTriangles = tris;
    this.builtSquares = count;
  }

  private drop(sq: Square): void {
    if (!sq.mesh) return;
    this.group.remove(sq.mesh);
    sq.mesh.geometry.dispose();
    sq.mesh = null;
  }

  private build(sq: Square): THREE.Mesh {
    const NV = 28; // 7 strips x 4 vertices per segment
    const pos = new Float32Array(sq.segs.length * NV * 3);
    const nor = new Float32Array(sq.segs.length * NV * 3);
    const col = new Float32Array(sq.segs.length * NV * 3);
    const idx = new Uint32Array(sq.segs.length * 7 * 6);
    let v = 0;
    let q = 0;
    const prof = new Float64Array(16); // 8 points: u, h
    for (const sg of sq.segs) {
      const run = this.plan.runs[sg.run];
      const kH = run.kerbH;
      const drop = Config.city.median.soilDrop;
      const ring = (k: number): { u: number[]; h: number[] } => {
        const mh = medianHalfAt(run, k);
        const kw = Math.min(run.kerbW, mh * 0.5);
        const u = [mh, mh, mh - kw, mh - kw, -mh + kw, -mh + kw, -mh, -mh];
        const h = [-SINK, kH, kH, kH - drop, kH - drop, kH, kH, -SINK];
        return { u, h };
      };
      const A = ring(sg.k);
      const B = ring(sg.k + 1);
      const a = sg.k * MS;
      const b = (sg.k + 1) * MS;
      // strip j joins profile point j and j+1; its normal across the road (+1 = left, -1 = right) and up
      const strips: { nu: number; ny: number; c: [number, number, number] }[] = [
        { nu: 1, ny: 0, c: KERB_FACE }, // left outer face
        { nu: 0, ny: 1, c: KERB_TOP }, // left kerb top
        { nu: -1, ny: 0, c: KERB_FACE }, // left inner face
        { nu: 0, ny: 1, c: SOIL }, // soil
        { nu: 1, ny: 0, c: KERB_FACE }, // right inner face
        { nu: 0, ny: 1, c: KERB_TOP }, // right kerb top
        { nu: -1, ny: 0, c: KERB_FACE }, // right outer face
      ];
      const jitter = 0.92 + 0.16 * (((Math.sin(run.p[a] * 12.9898 + run.p[a + 2] * 78.233) * 43758.5453) % 1 + 1) % 1);
      for (let j = 0; j < 7; j++) {
        const st = strips[j];
        const base = v;
        for (let e = 0; e < 4; e++) {
          const ring2 = e < 2 ? A : B; // e: 0 = A j, 1 = A j+1, 2 = B j, 3 = B j+1
          const pi = (e & 1) === 0 ? j : j + 1;
          const o = e < 2 ? a : b;
          const u = ring2.u[pi];
          pos[v * 3] = run.p[o] + run.p[o + 3] * u;
          pos[v * 3 + 1] = run.p[o + 1] + ring2.h[pi];
          pos[v * 3 + 2] = run.p[o + 2] + run.p[o + 4] * u;
          nor[v * 3] = run.p[o + 3] * st.nu;
          nor[v * 3 + 1] = st.ny;
          nor[v * 3 + 2] = run.p[o + 4] * st.nu;
          const f = st.c === SOIL ? jitter : 1;
          col[v * 3] = st.c[0] * f; col[v * 3 + 1] = st.c[1] * f; col[v * 3 + 2] = st.c[2] * f;
          v++;
        }
        idx[q++] = base; idx[q++] = base + 1; idx[q++] = base + 2;
        idx[q++] = base + 2; idx[q++] = base + 1; idx[q++] = base + 3;
      }
    }
    void prof;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, v * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, v * 3), 3));
    geo.setIndex(new THREE.BufferAttribute(idx.subarray(0, q), 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.name = `median ${Math.round(sq.cx)},${Math.round(sq.cz)}`;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  dispose(): void {
    for (const sq of this.squares) this.drop(sq);
    this.group.parent?.remove(this.group);
    this.mat.dispose();
  }
}
