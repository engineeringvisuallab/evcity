// STEP 3 (city plots): the boundary wall, the gate (ROAD SIDE ONLY) and the trees / bushes inside every plot of PlacementsPlots.ts.
// The buildings themselves are drawn by PlacedBuildings (they are rows of BUILDING_PLACEMENTS). POSITION ONLY like the buildings: no collider on the wall yet.
//  - wall: 2.4 m high, 0.45 m thick, built in 3 m pieces that follow the ground (a piece reaches from 0.3 m under the lower end to 2.4 m over the higher end)
//  - gate: a gap of 8 m in the road-side wall, two pillars and a lintel (the hospital has two gates)
//  - trees + bushes: a ring along the inside of the wall, then random trees and bushes (park: dense, empty reserve: sparse, building plot: a few);
//    none on the gate path and none on a building footprint (+ 5 m). Everything is instanced (4 draw calls for all plots).
// Switch: Config.city.plots.enabled (CITY_PLOTS is empty when it is false, then nothing is built).
import * as THREE from 'three';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import type { CityPlot } from './PlacementsPlots';
import type { VacantPlot } from './PlacementsVacant';
import { ALL_CITY_PLOTS, ALL_VACANT_PLOTS, ALL_PLOT_BUILDINGS } from './CityPlotsAll'; // city plots + vacant plots + the plots drawn in Plot.shp (PlacementsShpPlots.ts), merged

type YardPlot = CityPlot | VacantPlot;

export interface PlotYardsDeps {
  root: THREE.Object3D; // world.root: children use ABSOLUTE world coordinates
  terrain: TerrainGenerator;
}

const WALL_H = 2.4;
const WALL_T = 0.45;
const STEP = 3;          // m, length of one wall piece
const GATE_W = 8;        // m, clear width of a gate
const PILLAR = 0.9;      // m, pillar section
const PILLAR_H = 3.4;    // m
const TREE_EDGE = 4;     // m, trees keep this far from the wall
const GATE_PATH = 4;     // m, half width of the free path from a gate into the plot
const PATH_LEN = 60;     // m, length of that free path (inside the plot)
const BUILDING_GAP = 5;  // m, trees keep this far from a building footprint

/** Small seeded random generator (the same trees every run). */
function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class PlotYards {
  private holder = new THREE.Group();
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private meshes: THREE.InstancedMesh[] = [];

  constructor(private d: PlotYardsDeps) {
    this.holder.name = 'city-plot-yards';
    d.root.add(this.holder);
    const plots: readonly YardPlot[] = [...ALL_CITY_PLOTS, ...ALL_VACANT_PLOTS];   // ALL_VACANT_PLOTS: the empty plots of the plot map (Config.city.plots.vacant)
    if (plots.length === 0) { console.info('[city-plots] OFF or no plots (Config.city.plots.enabled / vacant)'); return; }

    const wall: THREE.Matrix4[] = [];
    const gate: THREE.Matrix4[] = [];
    const trunk: THREE.Matrix4[] = [];
    const crown: THREE.Matrix4[] = [];
    const crownCol: THREE.Color[] = [];
    const bush: THREE.Matrix4[] = [];
    const bushCol: THREE.Color[] = [];
    for (const plot of plots) {
      this.buildWallAndGates(plot, wall, gate);
      this.buildPlants(plot, trunk, crown, crownCol, bush, bushCol);
    }

    const box = new THREE.BoxGeometry(1, 1, 1);
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 1, 5).translate(0, 0.5, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1, 0);
    const bushGeo = new THREE.IcosahedronGeometry(1, 0);
    this.geos.push(box, trunkGeo, crownGeo, bushGeo);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xcfc8b8 });
    const gateMat = new THREE.MeshLambertMaterial({ color: 0x6b6258 });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a30 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff }); // tinted per instance
    this.mats.push(wallMat, gateMat, trunkMat, leafMat);

    this.addMesh(box, wallMat, wall, null);
    this.addMesh(box, gateMat, gate, null);
    this.addMesh(trunkGeo, trunkMat, trunk, null);
    this.addMesh(crownGeo, leafMat, crown, crownCol);
    this.addMesh(bushGeo, leafMat, bush, bushCol);
    console.info(`[city-plots] ${ALL_CITY_PLOTS.length} plots + ${ALL_VACANT_PLOTS.length} vacant plots, ${ALL_PLOT_BUILDINGS.length} buildings, ${wall.length} wall pieces, ${gate.length} gate parts, ${crown.length} trees, ${bush.length} bushes`);
  }

  private addMesh(geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], cols: THREE.Color[] | null): void {
    if (mats.length === 0) return;
    const m = new THREE.InstancedMesh(geo, mat, mats.length);
    for (let i = 0; i < mats.length; i++) {
      m.setMatrixAt(i, mats[i]!);
      if (cols) m.setColorAt(i, cols[i]!);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false;
    this.holder.add(m);
    this.meshes.push(m);
  }

  private static readonly UP = new THREE.Vector3(0, 1, 0);

  /** A box with its footprint axis along a -> b, from `base` up to `top` (world y), `thick` wide. */
  private static piece(out: THREE.Matrix4[], ax: number, az: number, bx: number, bz: number, base: number, top: number, thick: number): void {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return;
    const q = new THREE.Quaternion().setFromAxisAngle(PlotYards.UP, Math.atan2(-dz, dx));
    out.push(new THREE.Matrix4().compose(
      new THREE.Vector3((ax + bx) / 2, (base + top) / 2, (az + bz) / 2), q, new THREE.Vector3(len, top - base, thick)));
  }

  private buildWallAndGates(plot: YardPlot, wall: THREE.Matrix4[], gate: THREE.Matrix4[]): void {
    const h = (x: number, z: number): number => this.d.terrain.heightAt(x, z);
    const q = plot.poly;
    // gate positions as a distance along the road-side edge (corner 0 -> corner 1)
    const e0x = q[1]![0] - q[0]![0], e0z = q[1]![1] - q[0]![1];
    const e0 = Math.hypot(e0x, e0z);
    const tx = e0x / e0, tz = e0z / e0;
    const gateS = plot.gates.map((g) => (g[0] - q[0]![0]) * tx + (g[1] - q[0]![1]) * tz);
    for (let i = 0; i < 4; i++) {
      const a = q[i]!, b = q[(i + 1) % 4]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(len / STEP));
      for (let k = 0; k < n; k++) {
        const s0 = (k / n) * len, s1 = ((k + 1) / n) * len;
        if (i === 0) {
          const mid = (s0 + s1) / 2;
          if (gateS.some((g) => Math.abs(mid - g) < GATE_W / 2)) continue; // the gate gap
        }
        const ax = a[0] + (b[0] - a[0]) * (s0 / len), az = a[1] + (b[1] - a[1]) * (s0 / len);
        const bx = a[0] + (b[0] - a[0]) * (s1 / len), bz = a[1] + (b[1] - a[1]) * (s1 / len);
        const ha = h(ax, az), hb = h(bx, bz);
        PlotYards.piece(wall, ax, az, bx, bz, Math.min(ha, hb) - 0.3, Math.max(ha, hb) + WALL_H, WALL_T);
      }
    }
    // pillars + lintel of every gate
    for (const sg of gateS) {
      const px = (s: number): number => q[0]![0] + tx * s;
      const pz = (s: number): number => q[0]![1] + tz * s;
      const sA = sg - GATE_W / 2, sB = sg + GATE_W / 2;
      const hA = h(px(sA), pz(sA)), hB = h(px(sB), pz(sB));
      for (const [s, hh] of [[sA, hA], [sB, hB]] as [number, number][]) {
        gate.push(new THREE.Matrix4().compose(
          new THREE.Vector3(px(s), hh + PILLAR_H / 2 - 0.15, pz(s)),
          new THREE.Quaternion().setFromAxisAngle(PlotYards.UP, Math.atan2(-tz, tx)),
          new THREE.Vector3(PILLAR, PILLAR_H + 0.3, PILLAR)));
      }
      PlotYards.piece(gate, px(sA), pz(sA), px(sB), pz(sB), Math.max(hA, hB) + PILLAR_H - 0.5, Math.max(hA, hB) + PILLAR_H, 0.6);
    }
  }

  private buildPlants(plot: YardPlot, trunk: THREE.Matrix4[], crown: THREE.Matrix4[], crownCol: THREE.Color[], bush: THREE.Matrix4[], bushCol: THREE.Color[]): void {
    const h = (x: number, z: number): number => this.d.terrain.heightAt(x, z);
    const q = plot.poly;
    const F = Math.hypot(q[1]![0] - q[0]![0], q[1]![1] - q[0]![1]);
    const Dp = Math.hypot(q[3]![0] - q[0]![0], q[3]![1] - q[0]![1]);
    const tx = (q[1]![0] - q[0]![0]) / F, tz = (q[1]![1] - q[0]![1]) / F;
    // (u, v) -> world: bilinear over the 4 corners (for a rectangle the same as q0 + t u + n v; a drawn plot can be a 4-corner shape that is not a rectangle)
    const bil = q[2]![0] - q[1]![0] - q[3]![0] + q[0]![0], bilz = q[2]![1] - q[1]![1] - q[3]![1] + q[0]![1];
    const at = (u: number, v: number): [number, number] => {
      const s = u / F, w = v / Dp;
      return [q[0]![0] + (q[1]![0] - q[0]![0]) * s + (q[3]![0] - q[0]![0]) * w + bil * s * w, q[0]![1] + (q[1]![1] - q[0]![1]) * s + (q[3]![1] - q[0]![1]) * w + bilz * s * w];
    };
    // trees keep TREE_EDGE from every side (needed when the plot is not a rectangle; for a rectangle it is the same as the u / v test)
    const wind = ((q[1]![0] - q[0]![0]) * (q[2]![1] - q[0]![1]) - (q[1]![1] - q[0]![1]) * (q[2]![0] - q[0]![0])) >= 0 ? 1 : -1;
    const awayFromWall = (x: number, z: number): boolean => {
      for (let i = 0; i < 4; i++) {
        const a = q[i]!, b = q[(i + 1) % 4]!;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (wind * ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0])) / len < TREE_EDGE - 1e-6) return false;
      }
      return true;
    };
    // gate positions in plot coordinates (u along the road, v = 0 on the road side)
    const gu = plot.gates.map((g) => (g[0] - q[0]![0]) * tx + (g[1] - q[0]![1]) * tz);
    // buildings of this plot (footprints)
    const bs = ALL_PLOT_BUILDINGS.filter((b) => Math.hypot(b.x - plot.c[0], b.z - plot.c[1]) < F + Dp);
    const onBuilding = (x: number, z: number): boolean => {
      for (const b of bs) {
        const dx = x - b.x, dz = z - b.z, c = Math.cos(b.yaw), s = Math.sin(b.yaw);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) <= b.W / 2 + BUILDING_GAP && Math.abs(lz) <= b.D / 2 + BUILDING_GAP) return true;
      }
      return false;
    };
    const onPath = (u: number, v: number): boolean => v < PATH_LEN && gu.some((g) => Math.abs(u - g) < GATE_PATH);
    const ok = (u: number, v: number): boolean => {
      if (u < TREE_EDGE || u > F - TREE_EDGE || v < TREE_EDGE || v > Dp - TREE_EDGE) return false;
      if (onPath(u, v)) return false;
      const [x, z] = at(u, v);
      return awayFromWall(x, z) && !onBuilding(x, z);
    };
    const r = rng(Math.round(Math.abs(plot.c[0] * 31 + plot.c[1] * 17)) + 7);
    const park = plot.kind === 'park', empty = plot.kind === 'empty', vac = plot.kind === 'vacant';
    const addTree = (u: number, v: number): void => {
      const [x, z] = at(u, v);
      const g = h(x, z);
      // vacant plot: a mix of REAL small trees (young, 2.5-4 m tall, thin trunk) and some big ones (7-10 m, thick trunk)
      const big = vac && r() < 0.3;
      const th = vac ? (big ? 4.5 + r() * 2 : 1.3 + r() * 1.2) : 2.2 + r() * 1.6;
      const cr = vac ? (big ? 3.2 + r() * 1.4 : 0.9 + r() * 0.8) : 1.8 + r() * 1.6;
      const tk = vac ? (big ? 1.7 : 0.7) : 1;
      trunk.push(new THREE.Matrix4().compose(new THREE.Vector3(x, g - 0.1, z), new THREE.Quaternion(), new THREE.Vector3(tk, th + 0.1, tk)));
      crown.push(new THREE.Matrix4().compose(new THREE.Vector3(x, g + th + cr * 0.7, z), new THREE.Quaternion(), new THREE.Vector3(cr, cr * 1.15, cr)));
      crownCol.push(new THREE.Color().setHSL(0.27 + r() * 0.08, 0.45 + r() * 0.2, 0.22 + r() * 0.1));
    };
    const addBush = (u: number, v: number): void => {
      const [x, z] = at(u, v);
      const g = h(x, z);
      const s = 0.8 + r() * 0.9;
      bush.push(new THREE.Matrix4().compose(new THREE.Vector3(x, g + s * 0.35, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.7, s)));
      bushCol.push(new THREE.Color().setHSL(0.22 + r() * 0.12, 0.4 + r() * 0.25, 0.2 + r() * 0.12));
    };
    // ring of trees just inside the wall (spacing about 12 m)
    const ring = (off: number): void => {
      const pts: [number, number][] = [];
      for (let u = off; u <= F - off; u += 12) { pts.push([u, off]); pts.push([u, Dp - off]); }
      for (let v = off + 12; v <= Dp - off - 12; v += 12) { pts.push([off, v]); pts.push([F - off, v]); }
      for (const [u, v] of pts) if (ok(u, v)) addTree(u + (r() - 0.5) * 3, v + (r() - 0.5) * 3);
    };
    if (!vac) ring(TREE_EDGE + 1);   // vacant plots are small (20 x 30 m): random trees only, no ring
    // random trees and bushes (lata-pata): park dense, empty reserve medium, building plot a few
    const nTrees = vac ? Math.max(3, Math.round(plot.ha * 90)) : Math.round(plot.ha * (park ? 55 : empty ? 38 : 14));
    const nBush = vac ? Math.max(4, Math.round(plot.ha * 170)) : Math.round(plot.ha * (park ? 110 : empty ? 90 : 45));
    for (let i = 0, tries = 0; i < nTrees && tries < nTrees * 8; tries++) {
      const u = r() * F, v = r() * Dp;
      if (ok(u, v)) { addTree(u, v); i++; }
    }
    for (let i = 0, tries = 0; i < nBush && tries < nBush * 8; tries++) {
      const u = r() * F, v = r() * Dp;
      if (ok(u, v)) { addBush(u, v); i++; }
    }
  }

  dispose(): void {
    for (const m of this.meshes) {
      this.holder.remove(m);
      m.dispose();
    }
    this.d.root.remove(this.holder);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.meshes = [];
    this.geos = [];
    this.mats = [];
  }
}
