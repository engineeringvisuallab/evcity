import * as THREE from 'three';
import { BED_FLOWERS, PARK, bedFrame, parkBenches, parkLamps } from './CentralPark';

/**
 * CENTRAL STATION PARK meshes (2026-11-22): the paving of the plaza, the 8 radial paths and the promenade, the stone kerbs and soil of the 8 oval flower beds and the ring border, the
 * round fountain, benches and lamps. The layout is in CentralPark.ts (the grass / flowers and the trees come from the grass and tree placement, not from here).
 * Positions are ABSOLUTE world metres (the root is moved by the floating origin); every vertex sits on the terrain (sampled with `groundAt`). No colliders (you walk over the paths,
 * through the kerbs; the fountain basin has none either). The layer hides itself beyond `SHOW` m.
 */
const SHOW = 330;
const TAU = Math.PI * 2;

/** Merged triangle soup with vertex colours. */
class Soup {
  p: number[] = [];
  c: number[] = [];
  i: number[] = [];
  vert(x: number, y: number, z: number, col: THREE.Color, k = 1): number {
    this.p.push(x, y, z);
    this.c.push(col.r * k, col.g * k, col.b * k);
    return this.p.length / 3 - 1;
  }
  tri(a: number, b: number, c: number): void { this.i.push(a, b, c); }
  /** Quad a-b-c-d: the face points up when a->b runs along +z and a->d along +x (ring / path / kerb strips are built that way). */
  quad(a: number, b: number, c: number, d: number): void { this.i.push(a, b, c, a, c, d); }
  /** Box centred at (cx, cy, cz), half sizes, turned by yaw about Y. */
  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw: number, col: THREE.Color): void {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const at = (lx: number, ly: number, lz: number): [number, number, number] => [cx + lx * cs + lz * sn, cy + ly, cz - lx * sn + lz * cs];
    const f = (pts: [number, number, number][], k: number): void => {
      const ids = pts.map((q) => this.vert(q[0], q[1], q[2], col, k));
      this.tri(ids[0], ids[1], ids[2]);
      this.tri(ids[0], ids[2], ids[3]);
    };
    const X = hx, Y = hy, Z = hz;
    f([at(-X, Y, -Z), at(-X, Y, Z), at(X, Y, Z), at(X, Y, -Z)], 1); // top
    f([at(-X, -Y, -Z), at(X, -Y, -Z), at(X, -Y, Z), at(-X, -Y, Z)], 0.5); // bottom
    f([at(X, -Y, -Z), at(X, Y, -Z), at(X, Y, Z), at(X, -Y, Z)], 0.85);
    f([at(-X, -Y, Z), at(-X, Y, Z), at(-X, Y, -Z), at(-X, -Y, -Z)], 0.85);
    f([at(-X, -Y, Z), at(X, -Y, Z), at(X, Y, Z), at(-X, Y, Z)], 0.75);
    f([at(X, -Y, -Z), at(-X, -Y, -Z), at(-X, Y, -Z), at(X, Y, -Z)], 0.75);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeVertexNormals();
    return g;
  }
}

const col = (hex: number): THREE.Color => new THREE.Color(hex);
const hash = (a: number, b: number): number => {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

const SAND = col(0xd8ceb8);
const SAND2 = col(0xcfc4ac);
const BRICK = col(0xa65a3b);
const EDGE = col(0xb7ab92);
const STONE = col(0xc4c0b6);
const STONE_D = col(0x8f8b82);
const SOIL = col(0x3f2c20);
const WOOD = col(0x7b5230);
const IRON = col(0x2d3035);

export class CentralParkLayer {
  readonly group = new THREE.Group();
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];

  constructor(root: THREE.Object3D, private groundAt: (x: number, z: number) => number) {
    this.group.name = 'central-park';
    const paving = new Soup();
    const stone = new Soup();
    const soil = new Soup();
    const furniture = new Soup();
    const glow = new Soup();
    this.plaza(paving);
    this.radials(paving);
    this.promenade(paving);
    this.beds(stone, soil);
    this.border(stone, soil);
    this.fountainBasin(stone);
    this.benches(furniture);
    this.lamps(furniture, glow);

    const lit = (s: Soup, offset: number): THREE.Mesh => {
      const g = s.geometry();
      const m = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: offset !== 0, polygonOffsetFactor: offset, polygonOffsetUnits: offset });
      this.geos.push(g);
      this.mats.push(m);
      const mesh = new THREE.Mesh(g, m);
      mesh.receiveShadow = true;
      return mesh;
    };
    this.group.add(lit(paving, -2), lit(stone, 0), lit(soil, -1), lit(furniture, 0));
    {
      const g = glow.geometry();
      const m = new THREE.MeshBasicMaterial({ vertexColors: true });
      this.geos.push(g);
      this.mats.push(m);
      this.group.add(new THREE.Mesh(g, m));
    }
    this.fountainCentre();
    root.add(this.group);
  }

  /** Called every frame with the camera's ABSOLUTE position. */
  update(x: number, z: number): void {
    const dx = x - PARK.x, dz = z - PARK.z;
    this.group.visible = dx * dx + dz * dz < (SHOW + PARK.R) * (SHOW + PARK.R);
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !this.geos.includes(mesh.geometry)) {
        mesh.geometry.dispose();
        const m = mesh.material as THREE.Material;
        m.dispose();
      }
    });
  }

  private y(x: number, z: number, lift: number): number {
    return this.groundAt(x, z) + lift;
  }

  /** A band between two radii over an angle span, in 1 m steps; colour per radial band from `bands`. */
  private ring(s: Soup, r0: number, r1: number, a0: number, a1: number, lift: number, colourAt: (r: number, a: number, i: number, j: number) => THREE.Color, dr = 1): void {
    const nr = Math.max(1, Math.round((r1 - r0) / dr));
    const na = Math.max(1, Math.ceil(((a1 - a0) * (r0 + r1) * 0.5) / 1.2));
    for (let j = 0; j < nr; j++) {
      const ra = r0 + ((r1 - r0) * j) / nr, rb = r0 + ((r1 - r0) * (j + 1)) / nr;
      for (let i = 0; i < na; i++) {
        const aa = a0 + ((a1 - a0) * i) / na, ab = a0 + ((a1 - a0) * (i + 1)) / na;
        const c = colourAt((ra + rb) / 2, (aa + ab) / 2, i, j);
        const k = 0.97 + 0.06 * hash(i + a0 * 31, j + r0);
        const pt = (r: number, a: number): number => {
          const x = PARK.x + Math.cos(a) * r, z = PARK.z + Math.sin(a) * r;
          return s.vert(x, this.y(x, z, lift), z, c, k);
        };
        const v00 = pt(ra, aa), v10 = pt(rb, aa), v11 = pt(rb, ab), v01 = pt(ra, ab);
        s.quad(v00, v01, v11, v10);
      }
    }
  }

  private plaza(s: Soup): void {
    this.ring(s, PARK.basinR - 0.2, PARK.plazaR, 0, TAU, 0.07, (r) => (r < 9 || (r > 10.2 && r < 13.8) ? SAND : BRICK), 0.6);
  }

  private radials(s: Soup): void {
    for (let k = 0; k < 8; k++) {
      const a = k * (Math.PI / 4);
      const dx = Math.cos(a), dz = Math.sin(a), tx = -dz, tz = dx;
      const r0 = PARK.plazaR, r1 = PARK.promIn;
      const n = Math.round(r1 - r0);
      const w = PARK.radialHalf;
      const cols = [-w, -w + 0.25, 0, w - 0.25, w];
      for (let i = 0; i < n; i++) {
        const ra = r0 + ((r1 - r0) * i) / n, rb = r0 + ((r1 - r0) * (i + 1)) / n;
        for (let c = 0; c < 4; c++) {
          const colr = c === 0 || c === 3 ? EDGE : (i + c) % 2 ? SAND : SAND2;
          const pt = (r: number, u: number): number => {
            const x = PARK.x + dx * r + tx * u, z = PARK.z + dz * r + tz * u;
            return s.vert(x, this.y(x, z, 0.07), z, colr, 0.97 + 0.06 * hash(i + k * 17, c));
          };
          s.quad(pt(ra, cols[c]), pt(ra, cols[c + 1]), pt(rb, cols[c + 1]), pt(rb, cols[c]));
        }
      }
    }
  }

  private promenade(s: Soup): void {
    this.ring(s, PARK.promIn, PARK.promOut, 0, TAU, 0.07, (r, _a, i) => (r < PARK.promIn + 0.4 || r > PARK.promOut - 0.4 ? EDGE : i % 2 ? SAND : SAND2), 0.4);
  }

  /** Oval beds: kerb (top + both walls) and the soil. */
  private beds(stone: Soup, soil: Soup): void {
    const N = 72;
    for (let k = 0; k < BED_FLOWERS.length; k++) {
      const f = bedFrame(k);
      const pt = (t: number, sc: number): [number, number] => {
        const a = PARK.bedA * Math.cos(t) * sc, b = PARK.bedB * Math.sin(t) * sc;
        return [f.cx + f.ex * a + f.tx * b, f.cz + f.ez * a + f.tz * b];
      };
      const kr = PARK.kerb;
      const top = 0.2;
      // soil: a fan
      const c0 = soil.vert(f.cx, this.y(f.cx, f.cz, 0.06), f.cz, SOIL);
      for (const sc of [0.5, 1]) {
        const ids: number[] = [];
        for (let i = 0; i < N; i++) { const [x, z] = pt((i / N) * TAU, sc); ids.push(soil.vert(x, this.y(x, z, 0.06), z, SOIL, sc < 1 ? 1 : 0.9)); }
        if (sc === 0.5) for (let i = 0; i < N; i++) soil.tri(c0, ids[(i + 1) % N], ids[i]);
        else {
          // ring between 0.5 and 1: connect with the previous ring (rebuild it, same points)
          const inner: number[] = [];
          for (let i = 0; i < N; i++) { const [x, z] = pt((i / N) * TAU, 0.5); inner.push(soil.vert(x, this.y(x, z, 0.06), z, SOIL)); }
          for (let i = 0; i < N; i++) { const j = (i + 1) % N; soil.quad(inner[i], inner[j], ids[j], ids[i]); }
        }
      }
      // kerb: inner edge (scale 1) .. outer edge (scale kerb)
      for (let i = 0; i < N; i++) {
        const j = i + 1;
        const [x0, z0] = pt((i / N) * TAU, 1), [x1, z1] = pt((j / N) * TAU, 1);
        const [X0, Z0] = pt((i / N) * TAU, kr), [X1, Z1] = pt((j / N) * TAU, kr);
        const g = (x: number, z: number): number => this.groundAt(x, z);
        const a = stone.vert(x0, g(x0, z0) + top, z0, STONE), b = stone.vert(x1, g(x1, z1) + top, z1, STONE);
        const c = stone.vert(X1, g(X1, Z1) + top, Z1, STONE), d = stone.vert(X0, g(X0, Z0) + top, Z0, STONE);
        stone.quad(a, b, c, d); // top
        const e = stone.vert(X0, g(X0, Z0) - 0.1, Z0, STONE_D), f2 = stone.vert(X1, g(X1, Z1) - 0.1, Z1, STONE_D);
        stone.quad(d, c, f2, e); // outer wall
        const h = stone.vert(x0, g(x0, z0) + 0.06, z0, STONE_D), i2 = stone.vert(x1, g(x1, z1) + 0.06, z1, STONE_D);
        stone.quad(h, i2, b, a); // inner wall
      }
    }
  }

  /** Soil under the ring border and its low stone edge. */
  private border(stone: Soup, soil: Soup): void {
    this.ring(soil, PARK.promOut, PARK.borderOut, 0, TAU, 0.05, () => SOIL, 0.6);
    const N = 220;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * TAU, a1 = ((i + 1) / N) * TAU;
      const p = (r: number, a: number, up: number): number => {
        const x = PARK.x + Math.cos(a) * r, z = PARK.z + Math.sin(a) * r;
        return stone.vert(x, this.groundAt(x, z) + up, z, up > 0 ? STONE : STONE_D);
      };
      const r0 = PARK.borderOut, r1 = PARK.borderOut + 0.3;
      stone.quad(p(r0, a0, 0.14), p(r0, a1, 0.14), p(r1, a1, 0.14), p(r1, a0, 0.14));
      stone.quad(p(r1, a0, 0.14), p(r1, a1, 0.14), p(r1, a1, -0.1), p(r1, a0, -0.1));
    }
  }

  /** The round basin: top, outer and inner walls (the water and the pedestal are separate meshes). */
  private fountainBasin(s: Soup): void {
    const N = 64;
    const yTop = this.groundAt(PARK.x, PARK.z) + 0.8;
    const rO = PARK.basinR, rI = PARK.basinR - 0.8;
    const p = (r: number, a: number, y: number, c: THREE.Color): number => s.vert(PARK.x + Math.cos(a) * r, y, PARK.z + Math.sin(a) * r, c);
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * TAU, a1 = ((i + 1) / N) * TAU;
      const xo = PARK.x + Math.cos(a0) * rO, zo = PARK.z + Math.sin(a0) * rO;
      const yb = this.groundAt(xo, zo) - 0.4;
      s.quad(p(rI, a0, yTop, STONE), p(rI, a1, yTop, STONE), p(rO, a1, yTop, STONE), p(rO, a0, yTop, STONE)); // rim
      s.quad(p(rO, a0, yTop, STONE_D), p(rO, a1, yTop, STONE_D), p(rO, a1, yb, STONE_D), p(rO, a0, yb, STONE_D)); // outside
      s.quad(p(rI, a1, yTop, STONE_D), p(rI, a0, yTop, STONE_D), p(rI, a0, yTop - 0.35, STONE_D), p(rI, a1, yTop - 0.35, STONE_D)); // inside above the water
    }
  }

  /** Water, the tiered pedestal and the water jets. */
  private fountainCentre(): void {
    const y0 = this.groundAt(PARK.x, PARK.z);
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(PARK.basinR - 0.8, 48),
      new THREE.MeshPhongMaterial({ color: 0x3b8fb8, shininess: 90, transparent: true, opacity: 0.88, specular: 0x9ecfe8 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(PARK.x, y0 + 0.45, PARK.z);
    const stoneM = new THREE.MeshLambertMaterial({ color: 0xc9c5bb });
    const tier = (r0: number, r1: number, h: number, y: number): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, 28), stoneM);
      m.position.set(PARK.x, y0 + y + h / 2, PARK.z);
      return m;
    };
    const jetM = new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.55 });
    this.group.add(water, tier(1.7, 1.5, 0.9, 0.3), tier(1.2, 0.5, 0.5, 1.2), tier(0.5, 0.35, 1.2, 1.7));
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 0.6, 0.45, 28), stoneM);
    bowl.position.set(PARK.x, y0 + 2.9, PARK.z);
    const jetC = new THREE.Mesh(new THREE.ConeGeometry(0.16, 3.4, 8), jetM);
    jetC.position.set(PARK.x, y0 + 4.9, PARK.z);
    this.group.add(bowl, jetC);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const jet = new THREE.Mesh(new THREE.ConeGeometry(0.09, 2.2, 6), jetM);
      const lean = 0.7; // the top leans outward, the jet falls into the basin
      jet.position.set(PARK.x + Math.cos(a) * 2.7, y0 + 3.5, PARK.z + Math.sin(a) * 2.7);
      jet.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
      this.group.add(jet);
    }
    // jets fall back into the basin: a splash ring
    const splash = new THREE.Mesh(new THREE.RingGeometry(3.7, 4.2, 48), new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    splash.rotation.x = -Math.PI / 2;
    splash.position.set(PARK.x, y0 + 0.47, PARK.z);
    this.group.add(splash);
    this.mats.push(stoneM, jetM, water.material as THREE.Material, splash.material as THREE.Material);
    this.geos.push(water.geometry, bowl.geometry, jetC.geometry, splash.geometry);
  }

  private benches(s: Soup): void {
    for (const b of parkBenches()) {
      const y = this.groundAt(b.x, b.z);
      const c = Math.cos(b.yaw), sn = Math.sin(b.yaw); // b.yaw = polar angle of the bench: (c, sn) points away from the fountain
      const yaw = Math.atan2(-c, -sn); // box local +z = towards the fountain, local x = along the promenade
      s.box(b.x, y + 0.46, b.z, 0.9, 0.035, 0.24, yaw, WOOD); // seat
      s.box(b.x + c * 0.22, y + 0.78, b.z + sn * 0.22, 0.9, 0.2, 0.025, yaw, WOOD); // back, on the promenade side
      for (const sx of [-0.8, 0.8]) s.box(b.x - sn * sx, y + 0.22, b.z + c * sx, 0.04, 0.22, 0.22, yaw, IRON); // legs
    }
  }

  private lamps(s: Soup, glow: Soup): void {
    for (const l of parkLamps()) {
      const y = this.groundAt(l.x, l.z);
      s.box(l.x, y + 0.2, l.z, 0.2, 0.2, 0.2, 0, IRON); // base
      s.box(l.x, y + 1.9, l.z, 0.055, 1.7, 0.055, 0, IRON); // post
      s.box(l.x, y + 3.75, l.z, 0.24, 0.05, 0.24, 0, IRON); // cap
      glow.box(l.x, y + 3.5, l.z, 0.17, 0.2, 0.17, 0, col(0xffedb8)); // lantern
    }
  }
}
