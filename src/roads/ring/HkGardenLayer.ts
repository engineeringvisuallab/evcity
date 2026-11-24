import * as THREE from 'three';
import { Soup } from '../../park/CentralParkLayer';
import { Config } from '../../core/Config';
import { HK_GARDEN, HK_PLAZA, hkBedCentre, hkGardenBenches, hkGardenLamps, hkGardens, type HkGarden } from './HkInfieldData';

/**
 * STEP HK-10c: meshes of the two POND GARDENS in the Hatikamrul west loops (same look as the Central station park: sand / brick paving, grey stone kerbs, dark soil, wooden benches, iron lamps).
 * The layout is in HkInfieldData.ts (hkGardens, zones); the flowers and the trees come from the grass / tree placement. Positions are ABSOLUTE world metres; every vertex sits on the terrain (`groundAt`).
 * No colliders (you walk over the paths and kerbs). Empty with Config.roads.hatikamrul.enabled = false. Hides itself beyond SHOW m.
 */
const SHOW = 330;
const TAU = Math.PI * 2;
const col = (hex: number): THREE.Color => new THREE.Color(hex);
const hash = (a: number, b: number): number => { const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); };
const BRICK = col(0xb0694a), BRICK2 = col(0xa05a3e), SAND = col(0xd8ceb8), SAND2 = col(0xcfc4ac), EDGE = col(0xb7ab92), STONE = col(0xc4c0b6), STONE_D = col(0x8f8b82), SOIL = col(0x3f2c20), WOOD = col(0x7b5230), IRON = col(0x2d3035);

export class HkGardenLayer {
  readonly group = new THREE.Group();
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];

  constructor(root: THREE.Object3D, private groundAt: (x: number, z: number) => number) {
    this.group.name = 'hk-pond-gardens';
    if (Config.roads.hatikamrul.enabled) {
      const paving = new Soup(), stone = new Soup(), soil = new Soup(), furniture = new Soup(), glow = new Soup();
      for (const G of hkGardens()) {
        this.promenade(paving, G);
        this.arms(paving, G);
        this.borderSoil(soil, G);
        if (G.plaza) this.plaza(paving, stone, soil, G);
        else this.kerbRing(stone, G, G.shore, 0.3, 0.12); // pond edge kerb
        this.kerbRing(stone, G, G.shore + HK_GARDEN.prom + HK_GARDEN.border, 0.3, 0.14); // flower border outer kerb
        this.beds(stone, soil, G);
      }
      this.benches(furniture);
      this.lamps(furniture, glow);
      const lit = (s: Soup, offset: number): THREE.Mesh => {
        const g = s.geometry();
        const m = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: offset !== 0, polygonOffsetFactor: offset, polygonOffsetUnits: offset });
        this.geos.push(g); this.mats.push(m);
        const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; return mesh;
      };
      this.group.add(lit(paving, -2), lit(stone, 0), lit(soil, -1), lit(furniture, 0));
      const g = glow.geometry(); const m = new THREE.MeshBasicMaterial({ vertexColors: true });
      this.geos.push(g); this.mats.push(m); this.group.add(new THREE.Mesh(g, m));
    }
    root.add(this.group);
  }

  /** Called every frame with the camera's ABSOLUTE position. */
  update(x: number, z: number): void {
    let vis = false;
    if (this.group.children.length > 0) for (const G of hkGardens()) { const dx = x - G.x, dz = z - G.z; if (dx * dx + dz * dz < (SHOW + G.gr) * (SHOW + G.gr)) vis = true; }
    this.group.visible = vis;
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }

  private y(x: number, z: number, lift: number): number { return this.groundAt(x, z) + lift; }

  /** A band between two radii over an angle span round the garden centre, in ~0.5 m steps. */
  private ring(s: Soup, G: HkGarden, r0: number, r1: number, lift: number, colourAt: (r: number, i: number, j: number) => THREE.Color, dr = 0.5): void {
    const nr = Math.max(1, Math.round((r1 - r0) / dr));
    const na = Math.max(8, Math.ceil((TAU * (r0 + r1) * 0.5) / 1.2));
    for (let j = 0; j < nr; j++) {
      const ra = r0 + ((r1 - r0) * j) / nr, rb = r0 + ((r1 - r0) * (j + 1)) / nr;
      for (let i = 0; i < na; i++) {
        const aa = (i / na) * TAU, ab = ((i + 1) / na) * TAU;
        const c = colourAt((ra + rb) / 2, i, j);
        const k = 0.97 + 0.06 * hash(i + G.index * 31, j + r0);
        const pt = (r: number, a: number): number => { const x = G.x + Math.cos(a) * r, z = G.z + Math.sin(a) * r; return s.vert(x, this.y(x, z, lift), z, c, k); };
        s.quad(pt(ra, aa), pt(ra, ab), pt(rb, ab), pt(rb, aa));
      }
    }
  }

  private promenade(s: Soup, G: HkGarden): void {
    const r0 = G.shore, r1 = G.shore + HK_GARDEN.prom;
    this.ring(s, G, r0, r1, 0.07, (r, i) => (r < r0 + 0.4 || r > r1 - 0.4 ? EDGE : i % 2 ? SAND : SAND2));
  }

  /** HK-10d: the PLAZA of an east loop: round flower bed (soil + stone kerb) in the middle, then paving in alternating brick / sand rings out to the promenade, a stone kerb at the plaza edge. */
  private plaza(paving: Soup, stone: Soup, soil: Soup, G: HkGarden): void {
    const core = HK_PLAZA.core;
    this.ring(soil, G, 0.2, core - 0.35, 0.06, () => SOIL, 0.8);
    this.kerbRing(stone, G, core - 0.35, 0.7, 0.22);
    this.ring(paving, G, core + 0.35, G.shore, 0.07, (r, i) => {
      const band = Math.floor((r - core) / 1.5);
      if (r > G.shore - 0.6) return EDGE;
      return band % 4 === 0 ? BRICK : band % 4 === 2 ? BRICK2 : i % 2 ? SAND : SAND2;
    });
    this.kerbRing(stone, G, G.shore, 0.3, 0.12);
  }

  /** The 4 diagonal paths from the promenade to the garden edge. */
  private arms(s: Soup, G: HkGarden): void {
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * (Math.PI / 2), dx = Math.cos(a), dz = Math.sin(a), tx = -dz, tz = dx;
      const r0 = G.shore + HK_GARDEN.prom - 0.3, r1 = G.gr - 0.2, n = Math.round(r1 - r0), w = HK_GARDEN.armHalf;
      const cols = [-w, -w + 0.25, 0, w - 0.25, w];
      for (let i = 0; i < n; i++) {
        const ra = r0 + ((r1 - r0) * i) / n, rb = r0 + ((r1 - r0) * (i + 1)) / n;
        for (let c = 0; c < 4; c++) {
          const colr = c === 0 || c === 3 ? EDGE : (i + c) % 2 ? SAND : SAND2;
          const pt = (r: number, u: number): number => { const x = G.x + dx * r + tx * u, z = G.z + dz * r + tz * u; return s.vert(x, this.y(x, z, 0.07), z, colr, 0.97 + 0.06 * hash(i + k * 17, c)); };
          s.quad(pt(ra, cols[c]), pt(ra, cols[c + 1]), pt(rb, cols[c + 1]), pt(rb, cols[c]));
        }
      }
    }
  }

  private borderSoil(soil: Soup, G: HkGarden): void {
    this.ring(soil, G, G.shore + HK_GARDEN.prom, G.shore + HK_GARDEN.prom + HK_GARDEN.border, 0.05, () => SOIL, 0.8);
  }

  /** A low stone strip (top + outer wall) in a circle of radius r (the strip lies r .. r + w). */
  private kerbRing(stone: Soup, G: HkGarden, r: number, w: number, top: number): void {
    const N = Math.max(60, Math.ceil((TAU * r) / 1.2));
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * TAU, a1 = ((i + 1) / N) * TAU;
      const p = (rr: number, a: number, up: number): number => { const x = G.x + Math.cos(a) * rr, z = G.z + Math.sin(a) * rr; return stone.vert(x, this.groundAt(x, z) + up, z, up > 0 ? STONE : STONE_D); };
      stone.quad(p(r, a0, top), p(r, a1, top), p(r + w, a1, top), p(r + w, a0, top));
      stone.quad(p(r + w, a0, top), p(r + w, a1, top), p(r + w, a1, -0.1), p(r + w, a0, -0.1));
    }
  }

  /** The 4 oval beds: kerb (top + both walls) and the soil (same construction as the Central park beds). */
  private beds(stone: Soup, soil: Soup, G: HkGarden): void {
    const N = 48;
    for (let k = 0; k < 4; k++) {
      const b = hkBedCentre(G, k), tx = -b.ez, tz = b.ex;
      const pt = (t: number, sc: number): [number, number] => { const a = HK_GARDEN.bedA * Math.cos(t) * sc, c = HK_GARDEN.bedB * Math.sin(t) * sc; return [b.cx + b.ex * a + tx * c, b.cz + b.ez * a + tz * c]; };
      const top = 0.2;
      const c0 = soil.vert(b.cx, this.y(b.cx, b.cz, 0.06), b.cz, SOIL);
      const inner: number[] = [], outer: number[] = [];
      for (let i = 0; i < N; i++) {
        const [x, z] = pt((i / N) * TAU, 0.5); inner.push(soil.vert(x, this.y(x, z, 0.06), z, SOIL));
        const [X, Z] = pt((i / N) * TAU, 1); outer.push(soil.vert(X, this.y(X, Z, 0.06), Z, SOIL, 0.9));
      }
      for (let i = 0; i < N; i++) { const j = (i + 1) % N; soil.tri(c0, inner[j], inner[i]); soil.quad(inner[i], inner[j], outer[j], outer[i]); }
      for (let i = 0; i < N; i++) {
        const j = i + 1;
        const [x0, z0] = pt((i / N) * TAU, 1), [x1, z1] = pt((j / N) * TAU, 1), [X0, Z0] = pt((i / N) * TAU, HK_GARDEN.kerb), [X1, Z1] = pt((j / N) * TAU, HK_GARDEN.kerb);
        const g = (x: number, z: number): number => this.groundAt(x, z);
        const a = stone.vert(x0, g(x0, z0) + top, z0, STONE), bb = stone.vert(x1, g(x1, z1) + top, z1, STONE), c = stone.vert(X1, g(X1, Z1) + top, Z1, STONE), d = stone.vert(X0, g(X0, Z0) + top, Z0, STONE);
        stone.quad(a, bb, c, d);
        const e = stone.vert(X0, g(X0, Z0) - 0.1, Z0, STONE_D), f2 = stone.vert(X1, g(X1, Z1) - 0.1, Z1, STONE_D);
        stone.quad(d, c, f2, e);
        const h = stone.vert(x0, g(x0, z0) + 0.06, z0, STONE_D), i2 = stone.vert(x1, g(x1, z1) + 0.06, z1, STONE_D);
        stone.quad(h, i2, bb, a);
      }
    }
  }

  private benches(s: Soup): void {
    for (const b of hkGardenBenches()) {
      const y = this.groundAt(b.x, b.z);
      const c = Math.cos(b.yaw), sn = Math.sin(b.yaw); // (c, sn) points away from the pond
      const yaw = Math.atan2(-c, -sn); // box local +z = towards the pond
      s.box(b.x, y + 0.46, b.z, 0.9, 0.035, 0.24, yaw, WOOD);
      s.box(b.x + c * 0.22, y + 0.78, b.z + sn * 0.22, 0.9, 0.2, 0.025, yaw, WOOD);
      for (const sx of [-0.8, 0.8]) s.box(b.x - sn * sx, y + 0.22, b.z + c * sx, 0.04, 0.22, 0.22, yaw, IRON);
    }
  }

  private lamps(s: Soup, glow: Soup): void {
    for (const l of hkGardenLamps()) {
      const y = this.groundAt(l.x, l.z);
      s.box(l.x, y + 0.2, l.z, 0.2, 0.2, 0.2, 0, IRON);
      s.box(l.x, y + 1.9, l.z, 0.055, 1.7, 0.055, 0, IRON);
      s.box(l.x, y + 3.75, l.z, 0.24, 0.05, 0.24, 0, IRON);
      glow.box(l.x, y + 3.5, l.z, 0.17, 0.2, 0.17, 0, col(0xffedb8));
    }
  }
}
