// Light structures for the SMALL STATIONS (FUEL_LOTS) and the CHARGE POINTS (CHARGE_LOTS): pump + charger posts on a kerbed island, a small roof and a
// Bangla + English sign (stations), or two charger posts and a tiny roof (charge points). Kept light on purpose: shared materials / geometries, ~20 meshes per
// station, no colliders (posts are thin; the vehicle logic only needs the lot rectangles), no per-frame work.
// Same lot frame as ParkingSite.ts. Children use ABSOLUTE world coordinates (like ParkingLots), added to world.root.
import * as THREE from 'three';
import { CHARGE_LOTS, FUEL_LOTS, lotToWorld, type FuelLot } from './ParkingSite';

export interface StationDeps {
  root: THREE.Object3D;
  terrain: { heightAt(x: number, z: number): number };
}

const UX = 0.33303786, UZ = -0.94291345;
/** local +x of a station group = along F4 (s); local +z = towards decreasing n (the road, for a start-side lot). */
const YAW = Math.atan2(-UZ, UX);

function signTexture(lines: string[], bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(6, 6, c.width - 12, c.height - 12);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 52px "Noto Sans Bengali", "Nirmala UI", sans-serif';
  g.fillText(lines[0], c.width / 2, 52);
  g.font = 'bold 40px Arial, sans-serif';
  g.fillText(lines[1], c.width / 2, 108);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class StationStructures {
  private group = new THREE.Group();
  private owned: { dispose(): void }[] = [];

  constructor(private d: StationDeps) {
    this.group.name = 'StationStructures';
    const std = (color: number, rough = 0.8, metal = 0.1): THREE.MeshStandardMaterial => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
      this.owned.push(m);
      return m;
    };
    const M = {
      kerb: std(0xb9b6ad), roof: std(0xe8e8e2), roofEdge: std(0x1f6f43), col: std(0x6e757c, 0.5, 0.5),
      pump: std(0xc62828), pumpTop: std(0x263238), charger: std(0x1565c0), screen: new THREE.MeshBasicMaterial({ color: 0x66ff99 }),
      yellow: std(0xe0b020), white: std(0xf2f2f2),
    };
    this.owned.push(M.screen);
    const G = {
      box: new THREE.BoxGeometry(1, 1, 1),
      post: new THREE.BoxGeometry(0.7, 1.7, 0.45),
      col: new THREE.CylinderGeometry(0.12, 0.12, 4.2, 8),
    };
    this.owned.push(G.box, G.post, G.col);

    const mesh = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, shadow = false): THREE.Mesh => {
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, z);
      o.scale.set(sx, sy, sz);
      o.castShadow = shadow;
      o.receiveShadow = true;
      parent.add(o);
      return o;
    };
    /** a pump post (fuel) or a charger post (electric): body, dark top, a small screen on the road-facing side */
    const post = (parent: THREE.Object3D, x: number, z: number, electric: boolean): void => {
      mesh(parent, G.post, electric ? M.charger : M.pump, x, 0.15 + 0.85, z);
      mesh(parent, G.box, M.pumpTop, x, 2.0, z, 0.78, 0.18, 0.5);
      mesh(parent, G.box, M.screen, x, 1.45, z + 0.24, 0.4, 0.22, 0.03);
      if (electric) mesh(parent, G.box, M.yellow, x + 0.42, 1.1, z, 0.08, 0.5, 0.08); // cable holder
    };

    const place = (l: FuelLot, build: (g: THREE.Group, road: number) => void): void => {
      const cs = (l.s0 + l.s1) / 2, cn = (l.n0 + l.n1) / 2;
      const w = lotToWorld(cs, cn);
      const g = new THREE.Group();
      g.position.set(w.x, d.terrain.heightAt(w.x, w.z) + 0.1, w.z);
      g.rotation.y = YAW;
      // local +z points to decreasing n: the road is at +z for a start-side lot (n > 0), at -z for a mall-side lot
      build(g, cn > 0 ? 1 : -1);
      this.group.add(g);
    };

    // ---- small stations: island with 2 pumps + 2 chargers, roof on 4 columns, a sign on a post at the road edge
    for (const l of FUEL_LOTS) {
      const sc = l.s1 - l.s0;
      place(l, (g, r) => {
        const half = Math.min(9, sc / 2 - 3);
        mesh(g, G.box, M.kerb, 0, 0.1, 0, half * 2, 0.2, 1.6, false); // island
        for (const x of [-half * 0.7, -half * 0.25]) post(g, x, 0, false);
        for (const x of [half * 0.25, half * 0.7]) post(g, x, 0, true);
        // small roof: a thin slab + green edge, on four columns (kept inside the lot)
        mesh(g, G.box, M.roof, 0, 4.35, 0, half * 2 + 1, 0.2, 5.2, true);
        mesh(g, G.box, M.roofEdge, 0, 4.2, 0, half * 2 + 1.1, 0.12, 5.3);
        for (const x of [-half, half]) for (const z of [-2, 2]) mesh(g, G.col, M.col, x, 2.2, z);
        // sign: Bangla + English, double-sided board on two posts near the road edge, facing the road
        const sx = -sc / 2 + 4, sz = r * ((l.n1 - l.n0) / 2 - 1.5);
        const tex = signTexture([l.nameBn, `${l.id.toUpperCase().replace('-', ' ')}  FUEL + CHARGE`], '#0b3d2e', '#ffffff');
        this.owned.push(tex);
        const face = new THREE.MeshBasicMaterial({ map: tex });
        this.owned.push(face);
        for (const side of [1, -1]) {
          const p = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.56), face);
          this.owned.push(p.geometry);
          p.position.set(sx, 5.2, sz + side * 0.07);
          p.rotation.y = side > 0 ? 0 : Math.PI;
          g.add(p);
        }
        mesh(g, G.box, M.col, sx, 5.2, sz, 5.1, 1.66, 0.1);
        for (const dx of [-2.2, 2.2]) mesh(g, G.col, M.col, sx + dx, 2.1, sz);
      });
    }

    // ---- charge points: two charger posts on a small island with a tiny roof, and a sign board
    for (const l of CHARGE_LOTS) {
      const sc = l.s1 - l.s0;
      place(l, (g) => {
        const half = sc / 2 - 1;
        mesh(g, G.box, M.kerb, 0, 0.1, 0, half * 2 + 0.6, 0.2, 1.2, false);
        const n = sc > 8 ? 3 : 2;
        for (let i = 0; i < n; i++) post(g, -half + (2 * half * i) / (n - 1), 0, true);
        mesh(g, G.box, M.roof, 0, 3.4, 0, half * 2 + 1, 0.15, 3, true);
        for (const x of [-half - 0.2, half + 0.2]) mesh(g, G.col, M.col, x, 1.7, 0, 1, 0.8, 1);
        const tex = signTexture(['চার্জ পয়েন্ট', l.id.toUpperCase().replace('-', ' ') + '  EV CHARGE'], '#0d47a1', '#ffffff');
        this.owned.push(tex);
        const face = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
        this.owned.push(face);
        const p = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1), face);
        this.owned.push(p.geometry);
        p.position.set(0, 3.9, 0);
        g.add(p);
      });
    }
    d.root.add(this.group);
  }

  dispose(): void {
    this.d.root.remove(this.group);
    for (const o of this.owned) o.dispose();
  }
}
