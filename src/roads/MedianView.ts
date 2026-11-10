import * as THREE from 'three';
import { Config } from '../core/Config';
import { Q } from '../core/Quality';
import type { RoadNetwork } from './RoadNetwork';
import { MS, medianHalfAt, planMedians } from './MedianPlan';
import { frameAt, type UTurnOpening } from './UTurns';

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
const KERB_TOP: [number, number, number] = [0.68, 0.67, 0.64];
const KERB_FACE: [number, number, number] = [0.52, 0.51, 0.49];
const SOIL: [number, number, number] = [0.17, 0.085, 0.035]; // brown earth (mati)
// grass + flower colours (linear, like the rest of this file)
const BLADE_ROOT: [number, number, number] = [0.02, 0.07, 0.01];
const BLADE_TIP: [number, number, number] = [0.13, 0.34, 0.03];
const FLOWERS: [number, number, number][] = [[0.9, 0.6, 0.02], [0.9, 0.15, 0.35], [0.7, 0.02, 0.02], [0.9, 0.25, 0.02], [0.3, 0.08, 0.55]]; // yellow, pink, red, orange, purple (no white)
const GB = 4; // grass buckets per square side (250 / 4 = 62.5 m)

interface GrassBucket { mesh: THREE.Mesh; x: number; z: number }
interface Square { cx: number; cz: number; segs: { run: number; k: number }[]; uts: UTurnOpening[]; mesh: THREE.Mesh | null; patch: THREE.Mesh | null; grass: GrassBucket[]; built: boolean }

/** sRGB paint colour -> the linear colour the road shader ends up with (it does pow(col, 2.2)). */
const lin = (r: number, g: number, b: number): [number, number, number] => [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)];
const PATCH_ASPHALT = lin(0.465, 0.475, 0.485);
const PATCH_YELLOW = lin(0.88, 0.68, 0.08);

export class MedianView {
  readonly group = new THREE.Group();
  private squares: Square[] = [];
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
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
      if (!sq) { sq = { cx: cx * SQUARE - HALF + SQUARE / 2, cz: cz * SQUARE - HALF + SQUARE / 2, segs: [], uts: [], mesh: null, patch: null, grass: [], built: false }; map.set(key, sq); }
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
    this.squares = [...map.values()];
    parent.add(this.group);
  }

  /** 2 Hz: build the squares near the player (at most 2 per tick), hide / drop the others. Player position in WORLD metres. */
  update(dt: number, px: number, pz: number): void {
    this.timer += dt;
    if (this.timer < 0.5) return;
    this.timer = 0;
    const draw = Config.city.roadside.drawRadius * Q.roadsideMul * Config.city.median.drawRange;
    const gRange = Config.city.median.grass.range + (SQUARE / GB) * 0.71; // bucket centre distance
    let built = 0;
    let tris = 0;
    let count = 0;
    for (const sq of this.squares) {
      const d = Math.hypot(sq.cx - px, sq.cz - pz);
      const on = d < draw + SQUARE * 0.71;
      if (on && !sq.built && built < 2) { sq.mesh = sq.segs.length > 0 ? this.build(sq) : null; sq.patch = sq.uts.length > 0 ? this.buildPatch(sq) : null; sq.grass = sq.segs.length > 0 && Config.city.median.grass.enabled ? this.buildGrass(sq) : []; sq.built = true; built++; }
      if (sq.built) {
        if (sq.mesh) { sq.mesh.visible = on; if (on) tris += (sq.mesh.geometry.getIndex()?.count ?? 0) / 3; }
        if (sq.patch) { sq.patch.visible = on; if (on) tris += (sq.patch.geometry.getIndex()?.count ?? 0) / 3; }
        for (const g of sq.grass) { g.mesh.visible = on && Math.hypot(g.x - px, g.z - pz) < gRange; if (g.mesh.visible) tris += (g.mesh.geometry.getIndex()?.count ?? 0) / 3; }
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
    for (const g of sq.grass) { this.group.remove(g.mesh); g.mesh.geometry.dispose(); }
    sq.grass = [];
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

  /**
   * Grass + flowers on the median soil of the square: tufts of `blades` thin triangles (2 per blade: a bent blade) scattered over the soil, a share of them with a
   * small coloured flower on a tall stem. Deterministic per piece. One merged mesh per bucket (a 62 m block of the square), so a bucket far from the player is just hidden.
   */
  private buildGrass(sq: Square): GrassBucket[] {
    const G = Config.city.median.grass;
    const per = Math.max(1, Math.round(G.perSeg * Q.grassMul));
    const bs = SQUARE / GB;
    const x0 = sq.cx - SQUARE / 2;
    const z0 = sq.cz - SQUARE / 2;
    const bk: { pos: number[]; col: number[]; idx: number[] }[] = [];
    for (let i = 0; i < GB * GB; i++) bk.push({ pos: [], col: [], idx: [] });
    const drop = Config.city.median.soilDrop;
    for (const sg of sq.segs) {
      const run = this.plan.runs[sg.run];
      const a = sg.k * MS;
      const b = (sg.k + 1) * MS;
      const mx = (run.p[a] + run.p[b]) / 2;
      const mz = (run.p[a + 2] + run.p[b + 2]) / 2;
      const bx = Math.min(GB - 1, Math.max(0, Math.floor((mx - x0) / bs)));
      const bz = Math.min(GB - 1, Math.max(0, Math.floor((mz - z0) / bs)));
      const B = bk[bz * GB + bx];
      let seed = (Math.imul(sg.run + 1, 73856093) ^ Math.imul(sg.k + 1, 19349663)) >>> 0;
      const rnd = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const mh = Math.min(medianHalfAt(run, sg.k), medianHalfAt(run, sg.k + 1));
      const uw = mh - Math.min(run.kerbW, mh * 0.5) - 0.08; // keep inside the soil
      if (uw < 0.15) continue;
      for (let t = 0; t < per; t++) {
        const f = rnd();
        const u = (rnd() * 2 - 1) * uw;
        const x = run.p[a] + (run.p[b] - run.p[a]) * f + (run.p[a + 3] + (run.p[b + 3] - run.p[a + 3]) * f) * u;
        const y = run.p[a + 1] + (run.p[b + 1] - run.p[a + 1]) * f + run.kerbH - drop - 0.02;
        const z = run.p[a + 2] + (run.p[b + 2] - run.p[a + 2]) * f + (run.p[a + 4] + (run.p[b + 4] - run.p[a + 4]) * f) * u;
        const sz = 0.7 + rnd() * 0.6;
        const flower = rnd() < G.flowerShare;
        const fc = FLOWERS[Math.floor(rnd() * FLOWERS.length)];
        const n = G.blades;
        for (let i = 0; i < n; i++) {
          const yaw = rnd() * Math.PI * 2;
          const h = (G.height[0] + (G.height[1] - G.height[0]) * rnd()) * sz * (flower && i === 0 ? 1.25 : 1);
          const lean = (0.06 + rnd() * 0.12) * sz;
          const w = (0.022 + rnd() * 0.018) * sz;
          const dx = Math.cos(yaw);
          const dz = Math.sin(yaw);
          const sx = -dz;
          const szv = dx;
          const ox = x + (rnd() - 0.5) * 0.12;
          const oz = z + (rnd() - 0.5) * 0.12;
          const v = B.pos.length / 3;
          // base left, base right, middle left / right (bent), tip
          B.pos.push(ox - sx * w, y, oz - szv * w, ox + sx * w, y, oz + szv * w);
          B.pos.push(ox + dx * lean * 0.3 - sx * w * 0.6, y + h * 0.55, oz + dz * lean * 0.3 - szv * w * 0.6, ox + dx * lean * 0.3 + sx * w * 0.6, y + h * 0.55, oz + dz * lean * 0.3 + szv * w * 0.6);
          B.pos.push(ox + dx * lean, y + h, oz + dz * lean);
          const shade = 0.8 + rnd() * 0.4;
          B.col.push(BLADE_ROOT[0], BLADE_ROOT[1], BLADE_ROOT[2], BLADE_ROOT[0], BLADE_ROOT[1], BLADE_ROOT[2]);
          const mc = (k: number): number[] => [(BLADE_ROOT[k] + BLADE_TIP[k]) * 0.5 * shade];
          B.col.push(mc(0)[0], mc(1)[0], mc(2)[0], mc(0)[0], mc(1)[0], mc(2)[0]);
          B.col.push(BLADE_TIP[0] * shade, BLADE_TIP[1] * shade, BLADE_TIP[2] * shade);
          B.idx.push(v, v + 1, v + 3, v + 3, v + 1, v + 2, v + 2, v + 3, v + 4);
          if (flower && i === 0) {
            // a small flower on top of the tall stem: two crossed diamonds
            const px = ox + dx * lean;
            const pz = oz + dz * lean;
            const py = y + h;
            const r = 0.05 * sz;
            const fv = B.pos.length / 3;
            B.pos.push(px - dx * r, py, pz - dz * r, px + dx * r, py, pz + dz * r, px, py + r * 1.3, pz, px, py - r * 0.4, pz);
            B.pos.push(px - sx * r, py, pz - szv * r, px + sx * r, py, pz + szv * r);
            for (let k = 0; k < 6; k++) B.col.push(fc[0], fc[1], fc[2]);
            B.idx.push(fv, fv + 1, fv + 2, fv, fv + 1, fv + 3, fv + 4, fv + 5, fv + 2, fv + 4, fv + 5, fv + 3);
          }
        }
      }
    }
    const out: GrassBucket[] = [];
    bk.forEach((B, i) => {
      if (B.pos.length === 0) return;
      const geo = new THREE.BufferGeometry();
      const nor = new Float32Array(B.pos.length);
      for (let k = 1; k < nor.length; k += 3) nor[k] = 1; // soft light from above, no dark backs
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(B.pos), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(B.col), 3));
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(B.idx), 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.grassMat);
      mesh.name = `median grass ${Math.round(sq.cx)},${Math.round(sq.cz)} #${i}`;
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.group.add(mesh);
      out.push({ mesh, x: x0 + ((i % GB) + 0.5) * bs, z: z0 + (Math.floor(i / GB) + 0.5) * bs });
    });
    return out;
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
    this.patchMat.dispose();
    this.grassMat.dispose();
  }
}
