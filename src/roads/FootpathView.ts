import * as THREE from 'three';
import { Config } from '../core/Config';
import { Q } from '../core/Quality';
import type { RoadNetwork } from './RoadNetwork';
import { FS, planFootpaths, rampFactor } from './FootpathPlan';

/**
 * ROADS STEP 3: the visible raised footpath (kerb stone, walking surface with 2 % cross-fall, dropped kerb at both ends of every run) and the
 * gully grates, as a companion mesh on top of the road ribbon. Built lazily per 250 m square when the player comes near, dropped when far.
 *
 * Profile (u = metres from the centreline towards the outside, h = height above the road surface), 6 points, 5 strips:
 *   (hw,-sink) (hw,H) (hw+kerbW,H) (hw+kerbW,H-0.01) (hw+W, H-0.01+fall x walk) (hw+W,-sink)
 * Every h except -sink is multiplied by the dropped-kerb factor of the ring (0 at the end of a run, 1 one step in).
 */
const SQUARE = 250;
const SINK = 0.06;
const KERB: [number, number, number] = [0.6, 0.6, 0.58];
const KERB_FACE: [number, number, number] = [0.46, 0.46, 0.45];
const WALK: [number, number, number] = [0.52, 0.51, 0.49];
const EDGE: [number, number, number] = [0.4, 0.4, 0.39];

interface Square { cx: number; cz: number; segs: { run: number; k: number }[]; gullies: number[]; mesh: THREE.Mesh | null; grates: THREE.InstancedMesh | null }

export class FootpathView {
  readonly group = new THREE.Group();
  private squares: Square[] = [];
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private grateMat = new THREE.MeshLambertMaterial({ color: 0x2b2b2d });
  private grateGeo: THREE.BufferGeometry;
  private plan;
  private timer = 9;
  drawnTriangles = 0;
  builtSquares = 0;

  constructor(parent: THREE.Object3D, roads: RoadNetwork) {
    this.plan = planFootpaths(roads);
    const G = Config.city.footpath.gullySize;
    this.grateGeo = new THREE.BoxGeometry(G[1], 0.025, G[0]); // x across the road, z along it
    const HALF = Config.world.size / 2;
    const map = new Map<string, Square>();
    const get = (x: number, z: number): Square => {
      const cx = Math.floor((x + HALF) / SQUARE);
      const cz = Math.floor((z + HALF) / SQUARE);
      const key = cx + ',' + cz;
      let sq = map.get(key);
      if (!sq) { sq = { cx: cx * SQUARE - HALF + SQUARE / 2, cz: cz * SQUARE - HALF + SQUARE / 2, segs: [], gullies: [], mesh: null, grates: null }; map.set(key, sq); }
      return sq;
    };
    this.plan.runs.forEach((run, ri) => {
      for (let k = 0; k < run.n - 1; k++) get((run.p[k * FS] + run.p[(k + 1) * FS]) / 2, (run.p[k * FS + 2] + run.p[(k + 1) * FS + 2]) / 2).segs.push({ run: ri, k });
    });
    const g = this.plan.gullies;
    for (let i = 0; i < g.length; i += 4) get(g[i], g[i + 2]).gullies.push(g[i], g[i + 1], g[i + 2], g[i + 3]);
    this.squares = [...map.values()];
    parent.add(this.group);
  }

  /** 2 Hz: build the squares near the player (at most 2 per tick), hide / drop the others. Player position in WORLD metres. */
  update(dt: number, px: number, pz: number): void {
    this.timer += dt;
    if (this.timer < 0.5) return;
    this.timer = 0;
    const draw = Config.city.roadside.drawRadius * Q.roadsideMul * Config.city.footpath.drawRange;
    let built = 0;
    let tris = 0;
    let count = 0;
    for (const sq of this.squares) {
      const d = Math.hypot(sq.cx - px, sq.cz - pz);
      const on = d < draw + SQUARE * 0.71;
      if (on && !sq.mesh && !sq.grates && built < 2) { this.build(sq); built++; }
      if (sq.mesh || sq.grates) {
        if (sq.mesh) { sq.mesh.visible = on; if (on) tris += (sq.mesh.geometry.getIndex()?.count ?? 0) / 3; }
        if (sq.grates) sq.grates.visible = on;
        if (d > draw + SQUARE * 0.71 + 250) { this.drop(sq); continue; }
        count++;
      }
    }
    this.drawnTriangles = tris;
    this.builtSquares = count;
  }

  private drop(sq: Square): void {
    if (sq.mesh) { this.group.remove(sq.mesh); sq.mesh.geometry.dispose(); sq.mesh = null; }
    if (sq.grates) { this.group.remove(sq.grates); sq.grates.dispose(); sq.grates = null; }
  }

  private build(sq: Square): void {
    const F = Config.city.footpath;
    const NV = 20; // 5 strips x 4 vertices per segment
    const nSeg = sq.segs.length;
    const pos = new Float32Array(nSeg * NV * 3);
    const nor = new Float32Array(nSeg * NV * 3);
    const col = new Float32Array(nSeg * NV * 3);
    const idx = new Uint32Array(nSeg * 5 * 6);
    let v = 0;
    let q = 0;
    for (const sg of sq.segs) {
      const run = this.plan.runs[sg.run];
      const sd = run.side;
      const kw = F.kerbW;
      const W = run.width;
      const ring = (k: number): { u: number[]; h: number[] } => {
        const f = rampFactor(run, k);
        const H = F.height * f;
        const lip = 0.01 * f;
        const u = [run.hw, run.hw, run.hw + kw, run.hw + kw, run.hw + W, run.hw + W];
        const h = [-SINK, H, H, H - lip, H - lip + F.fall * (W - kw) * f, -SINK];
        return { u, h };
      };
      const A = ring(sg.k);
      const B = ring(sg.k + 1);
      const a = sg.k * FS;
      const b = (sg.k + 1) * FS;
      // normals: nu = across the road, +1 = outwards (away from the road)
      const strips: { nu: number; ny: number; c: [number, number, number] }[] = [
        { nu: -1, ny: 0, c: KERB_FACE }, // kerb face (towards the road)
        { nu: 0, ny: 1, c: KERB }, // kerb top
        { nu: -1, ny: 0, c: KERB_FACE }, // lip
        { nu: 0, ny: 1, c: WALK }, // walking surface
        { nu: 1, ny: 0, c: EDGE }, // outer edge
      ];
      // slabs: every other piece a little lighter, so the 3 m pieces read as paving slabs
      const slab = (sg.k & 1) === 0 ? 1.04 : 0.96;
      for (let j = 0; j < 5; j++) {
        const st = strips[j];
        const base = v;
        for (let e = 0; e < 4; e++) {
          const rg = e < 2 ? A : B;
          const pi = (e & 1) === 0 ? j : j + 1;
          const o = e < 2 ? a : b;
          const u = sd * rg.u[pi];
          pos[v * 3] = run.p[o] + run.p[o + 3] * u;
          pos[v * 3 + 1] = run.p[o + 1] + rg.h[pi];
          pos[v * 3 + 2] = run.p[o + 2] + run.p[o + 4] * u;
          nor[v * 3] = run.p[o + 3] * sd * st.nu;
          nor[v * 3 + 1] = st.ny;
          nor[v * 3 + 2] = run.p[o + 4] * sd * st.nu;
          const f = st.c === WALK ? slab : 1;
          col[v * 3] = st.c[0] * f; col[v * 3 + 1] = st.c[1] * f; col[v * 3 + 2] = st.c[2] * f;
          v++;
        }
        idx[q++] = base; idx[q++] = base + 1; idx[q++] = base + 2;
        idx[q++] = base + 2; idx[q++] = base + 1; idx[q++] = base + 3;
      }
    }
    if (nSeg > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, v * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, v * 3), 3));
      geo.setIndex(new THREE.BufferAttribute(idx.subarray(0, q), 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.mat);
      mesh.name = `footpath ${Math.round(sq.cx)},${Math.round(sq.cz)}`;
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      sq.mesh = mesh;
    }
    const ng = sq.gullies.length / 4;
    if (ng > 0) {
      const im = new THREE.InstancedMesh(this.grateGeo, this.grateMat, ng);
      const d = new THREE.Object3D();
      for (let i = 0; i < ng; i++) {
        d.position.set(sq.gullies[i * 4], sq.gullies[i * 4 + 1] + 0.02, sq.gullies[i * 4 + 2]);
        d.rotation.set(0, sq.gullies[i * 4 + 3], 0);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.name = `gully grates ${Math.round(sq.cx)},${Math.round(sq.cz)}`;
      im.matrixAutoUpdate = false;
      im.castShadow = false;
      im.receiveShadow = false;
      this.group.add(im);
      sq.grates = im;
    }
  }

  dispose(): void {
    for (const sq of this.squares) this.drop(sq);
    this.group.parent?.remove(this.group);
    this.mat.dispose();
    this.grateMat.dispose();
    this.grateGeo.dispose();
  }
}
