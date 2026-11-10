import * as THREE from 'three';
import { Config } from '../core/Config';
import { Q } from '../core/Quality';
import type { RoadNetwork } from './RoadNetwork';
import { MS, medianHalfAt, planMedians, type Crossing } from './MedianPlan';
import { frameAt, type UTurnOpening } from './UTurns';
import { getSurfaceMaterial } from '../buildings/models/BuildingTextures';

/**
 * ROADS STEP 2: the visible median: a raised kerb on each side (150 mm) with a soil strip between, as a companion mesh on top of the road ribbon.
 * Built lazily per 250 m square when the player comes near, and dropped again when far, so the 50 km of divided road cost nothing far away.
 *
 * Profile across the road (u = metres to the left of the centreline, h = height above the road surface), 8 points, 7 strips:
 *   (+mh,-sink) (+mh,kH) (+mh-kW,kH) (+mh-kW,kH-drop) | soil | (-mh+kW,kH-drop) (-mh+kW,kH) (-mh,kH) (-mh,-sink)
 * The rounded nose at each end narrows mh (MedianPlan.medianHalfAt).
 *
 * ROADS STEP 4: every U-turn opening (a gap between two runs) also gets a flat asphalt patch that hides the old pale concrete strip and the solid yellow
 * lines of the shader across the gap, and a BROKEN yellow line on each side of it (patch = its own mesh with polygonOffset, so it never z-fights the ribbon).
 */
const SQUARE = 250;
const SINK = 0.06;
const KERB_TOP: [number, number, number] = [0.74, 0.73, 0.70]; // x the concrete photo
const KERB_FACE: [number, number, number] = [0.62, 0.61, 0.59];
const SOIL: [number, number, number] = [0.24, 0.125, 0.055]; // brown earth (mati) x the earth photo (the photo is ~0.7 as bright)
const SOIL_TEX_M = 1.5; // the earth photo repeats every 1.5 m
const TEX_M = 2; // the concrete photo repeats every 2 m on the kerb walls and tops

interface Square { cx: number; cz: number; segs: { run: number; k: number }[]; uts: UTurnOpening[]; xs: Crossing[]; mesh: THREE.Mesh | null; patch: THREE.Mesh | null; built: boolean }

/** sRGB paint colour -> the linear colour the road shader ends up with (it does pow(col, 2.2)). */
const lin = (r: number, g: number, b: number): [number, number, number] => [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)];
const PATCH_ASPHALT = lin(0.465, 0.475, 0.485);
const PATCH_YELLOW = lin(0.88, 0.68, 0.08);
const PATCH_WHITE = lin(0.93, 0.93, 0.9);

export class MedianView {
  readonly group = new THREE.Group();
  private squares: Square[] = [];
  /** REAL SOIL: the earth photo of the building kit (shared texture) for the median soil strip. */
  private mat = (() => { const m = (getSurfaceMaterial('earth') as THREE.MeshLambertMaterial).clone(); m.side = THREE.DoubleSide; return m; })();
  /** The real concrete photo of the building kit (shared texture), for the kerb walls and tops; DoubleSide because the strips are one-sided quads. */
  private concrete = (() => { const m = (getSurfaceMaterial('concrete') as THREE.MeshLambertMaterial).clone(); m.side = THREE.DoubleSide; return m; })();
  private patchMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  private plan;
  private roads: RoadNetwork;
  private timer = 9;
  /** Debug HUD / measurements. */
  drawnTriangles = 0;
  builtSquares = 0;

  constructor(parent: THREE.Object3D, roads: RoadNetwork) {
    this.plan = planMedians(roads);
    this.roads = roads;
    const HALF = Config.world.size / 2;
    const map = new Map<string, Square>();
    const squareOf = (x: number, z: number): Square => {
      const cx = Math.floor((x + HALF) / SQUARE);
      const cz = Math.floor((z + HALF) / SQUARE);
      const key = cx + ',' + cz;
      let sq = map.get(key);
      if (!sq) { sq = { cx: cx * SQUARE - HALF + SQUARE / 2, cz: cz * SQUARE - HALF + SQUARE / 2, segs: [], uts: [], xs: [], mesh: null, patch: null, built: false }; map.set(key, sq); }
      return sq;
    };
    this.plan.runs.forEach((run, ri) => {
      for (let k = 0; k < run.n - 1; k++) {
        const mx = (run.p[k * MS] + run.p[(k + 1) * MS]) / 2;
        const mz = (run.p[k * MS + 2] + run.p[(k + 1) * MS + 2]) / 2;
        squareOf(mx, mz).segs.push({ run: ri, k });
      }
    });
    for (const o of this.plan.uturns.openings) squareOf(o.x, o.z).uts.push(o);
    for (const c of this.plan.crossings) squareOf(c.x, c.z).xs.push(c);
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
      if (on && !sq.built && built < 2) { sq.mesh = sq.segs.length > 0 ? this.build(sq) : null; sq.patch = sq.uts.length + sq.xs.length > 0 ? this.buildPatch(sq) : null; sq.built = true; built++; }
      if (sq.built) {
        if (sq.mesh) { sq.mesh.visible = on; if (on) tris += (sq.mesh.geometry.getIndex()?.count ?? 0) / 3; }
        if (sq.patch) { sq.patch.visible = on; if (on) tris += (sq.patch.geometry.getIndex()?.count ?? 0) / 3; }
        if (d > draw + SQUARE * 0.71 + 250) { this.drop(sq); continue; }
        count++;
      }
    }
    this.drawnTriangles = tris;
    this.builtSquares = count;
  }

  private drop(sq: Square): void {
    if (sq.mesh) { this.group.remove(sq.mesh); sq.mesh.geometry.dispose(); sq.mesh = null; }
    if (sq.patch) { this.group.remove(sq.patch); sq.patch.geometry.dispose(); sq.patch = null; }
    sq.built = false;
  }

  /** ROADS STEP 4: asphalt patch + broken yellow lines of every U-turn opening of the square (flat quads lifted `uturn.lift` m over the road). */
  private buildPatch(sq: Square): THREE.Mesh {
    const U = Config.city.uturn;
    const nose = Config.city.median.noseLen;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const quad = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number, c: [number, number, number]): void => {
      const v = pos.length / 3;
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
      for (let i = 0; i < 4; i++) col.push(c[0], c[1], c[2]);
      idx.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
    };
    for (const o of sq.uts) {
      const r = this.roads.roads[o.roadId];
      const s0 = o.a - nose;
      const s1 = o.b + nose;
      const pw = o.medianHalf + U.patchBeyond;
      const lift = U.lift;
      const A = { x: 0, y: 0, z: 0, nx: 0, nz: 0, tx: 0, tz: 0 };
      const B = { x: 0, y: 0, z: 0, nx: 0, nz: 0, tx: 0, tz: 0 };
      // asphalt patch: strips of 2 m
      const n = Math.max(1, Math.ceil((s1 - s0) / 2));
      for (let i = 0; i < n; i++) {
        frameAt(r, s0 + ((s1 - s0) * i) / n, A);
        frameAt(r, s0 + ((s1 - s0) * (i + 1)) / n, B);
        quad(A.x + A.nx * pw, A.y + lift, A.z + A.nz * pw, A.x - A.nx * pw, A.y + lift, A.z - A.nz * pw, B.x + B.nx * pw, B.y + lift, B.z + B.nz * pw, B.x - B.nx * pw, B.y + lift, B.z - B.nz * pw, PATCH_ASPHALT);
      }
      // broken yellow line (dash / gap = uturn.dash) on each side, where the shader's solid line was (medianHalf + 0.35 from the centreline)
      const lw = 0.09;
      for (const side of [-1, 1]) {
        const u0 = side * (o.medianHalf + 0.35) - lw;
        const u1 = side * (o.medianHalf + 0.35) + lw;
        for (let sd = s0 + U.dash * 0.5; sd < s1 - U.dash * 0.5; sd += U.dash * 2) {
          frameAt(r, sd, A);
          frameAt(r, Math.min(s1, sd + U.dash), B);
          quad(A.x + A.nx * u0, A.y + lift * 1.4, A.z + A.nz * u0, A.x + A.nx * u1, A.y + lift * 1.4, A.z + A.nz * u1, B.x + B.nx * u0, B.y + lift * 1.4, B.z + B.nz * u0, B.x + B.nx * u1, B.y + lift * 1.4, B.z + B.nz * u1, PATCH_YELLOW);
        }
      }
    }
    // PEDESTRIAN CROSSINGS: asphalt over the median opening (hides the shader's pale strip + yellow lines there) and the white zebra bars across the whole road
    const CR = Config.city.median.crossing;
    for (const c of sq.xs) {
      const r = this.roads.roads[c.roadId];
      const A = { x: 0, y: 0, z: 0, nx: 0, nz: 0, tx: 0, tz: 0 };
      const B = { x: 0, y: 0, z: 0, nx: 0, nz: 0, tx: 0, tz: 0 };
      const lift = U.lift;
      const mh = Math.max(r.medianHalf, 0);
      const pw = mh + U.patchBeyond;
      const n = Math.max(1, Math.ceil((c.b - c.a) / 2));
      for (let i = 0; i < n; i++) {
        frameAt(r, c.a + ((c.b - c.a) * i) / n, A);
        frameAt(r, c.a + ((c.b - c.a) * (i + 1)) / n, B);
        quad(A.x + A.nx * pw, A.y + lift, A.z + A.nz * pw, A.x - A.nx * pw, A.y + lift, A.z - A.nz * pw, B.x + B.nx * pw, B.y + lift, B.z + B.nz * pw, B.x - B.nx * pw, B.y + lift, B.z - B.nz * pw, PATCH_ASPHALT);
      }
      const s0 = c.s - CR.zebraLen / 2;
      const s1 = c.s + CR.zebraLen / 2;
      frameAt(r, s0, A);
      frameAt(r, s1, B);
      const reach = r.halfWidth - 0.45; // stop at the kerb
      for (let u = -reach + CR.barW / 2; u <= reach - CR.barW / 2 + 1e-6; u += CR.barStep) {
        const u0 = u - CR.barW / 2;
        const u1 = u + CR.barW / 2;
        quad(A.x + A.nx * u0, A.y + lift * 1.4, A.z + A.nz * u0, A.x + A.nx * u1, A.y + lift * 1.4, A.z + A.nz * u1, B.x + B.nx * u0, B.y + lift * 1.4, B.z + B.nz * u0, B.x + B.nx * u1, B.y + lift * 1.4, B.z + B.nz * u1, PATCH_WHITE);
      }
    }
    const geo = new THREE.BufferGeometry();
    const nor = new Float32Array(pos.length);
    for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.patchMat);
    mesh.name = `uturn ${Math.round(sq.cx)},${Math.round(sq.cz)}`;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  private build(sq: Square): THREE.Mesh {
    const NV = 28; // 7 strips x 4 vertices per segment
    const pos = new Float32Array(sq.segs.length * NV * 3);
    const nor = new Float32Array(sq.segs.length * NV * 3);
    const col = new Float32Array(sq.segs.length * NV * 3);
    const uv = new Float32Array(sq.segs.length * NV * 2);
    const kerbIdx: number[] = []; // concrete walls + tops (material 0)
    const soilIdx: number[] = []; // soil (material 1)
    let v = 0;
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
          // concrete texture coordinates: along the road (metres / TEX_M) and up the wall (vertical faces) or across the top
          const along = (sg.k + (e < 2 ? 0 : 1)) * Config.city.median.step;
          const tm = st.c === SOIL ? SOIL_TEX_M : TEX_M;
          uv[v * 2] = along / tm;
          uv[v * 2 + 1] = (st.ny === 0 ? ring2.h[pi] : ring2.u[pi]) / tm;
          v++;
        }
        const ix = st.c === SOIL ? soilIdx : kerbIdx;
        ix.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
      }
    }
    void prof;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, v * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, v * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv.subarray(0, v * 2), 2));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array([...kerbIdx, ...soilIdx]), 1));
    geo.addGroup(0, kerbIdx.length, 0);
    geo.addGroup(kerbIdx.length, soilIdx.length, 1);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, [this.concrete, this.mat]);
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
    this.patchMat.dispose();
    this.concrete.dispose();
  }
}
