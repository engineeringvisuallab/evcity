// STEP MAP-2 viewer: "Road Central Line" debug layer. Draws the planned centrelines (docs/map_all_roads_v2.json) as flat coloured ribbons
// lying 1.5 m above the terrain, with a pole and a name label per road, so the user can drive / fly round and say which line is wrong.
// NOT a road: no physics, no AI, no traffic. Hidden by default; key 3 toggles it. fog: false on every material (like RailDebug), else the game's fog hides far lines. Parent = world.root, absolute world coordinates.
import * as THREE from 'three';
import type { RoadNetwork } from '../RoadNetwork';
import { CENTRE_ROADS, CENTRE_JUNCTIONS } from './RoadCentreData';
import { HOUSING_STREETS, HOUSING_JUNCTIONS } from './HousingStreetData';

const COLOUR: Record<string, number> = { '8': 0x111111, '6': 0x2a6bff, '4': 0xff2a3c, '2': 0x12c24a };
const HCOL: Record<string, number> = { A: 0xe000c0, C: 0x00c8e0, L: 0xffd400 }; // housing streets: arterial magenta, collector cyan, local yellow (R4 red / R2 green / R6 blue stay)
const HWIDTH: Record<string, number> = { A: 4, C: 3, L: 2.5 };
const HPOLE: Record<string, number> = { A: 26, C: 20, L: 14 };
const WIDTH = 6; // m
const CRR_HEX = 0x9b30ff; // rail-corridor roads CRR-* and RR-HUB: purple (R4 red, R2 green, R6 blue, 8-lane black stay)
const LIFT = 1.5; // m above the ground / road surface

function label(text: string, hex: number, small = false): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = small ? 128 : 256;
  c.height = small ? 32 : 64;
  const g = c.getContext('2d')!;
  if (small) g.scale(0.5, 0.5);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#' + hex.toString(16).padStart(6, '0');
  g.lineWidth = 6;
  g.strokeRect(3, 3, 250, 58);
  g.fillStyle = '#111';
  g.font = 'bold 38px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false }));
  if (small) s.scale.set(34, 8.5, 1); else s.scale.set(80, 20, 1);
  s.renderOrder = 10;
  return s;
}

export class RoadCentreLayer {
  readonly group = new THREE.Group();
  private built = false;
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];

  constructor(private readonly parent: THREE.Object3D, private readonly roads: RoadNetwork, private readonly heightAt: (x: number, z: number) => number) {
    this.group.name = 'RoadCentreLayer';
    this.group.visible = false;
    parent.add(this.group);
  }

  get visible(): boolean {
    return this.group.visible;
  }

  /** Built lazily on the first toggle, so a game that never uses it pays nothing. */
  toggle(): void {
    if (!this.built) this.build();
    this.group.visible = !this.group.visible;
  }

  private ribbon(xs: ArrayLike<number>, ys: ArrayLike<number>, zs: ArrayLike<number>, hex: number, name: string, lineW: number): void {
    const n = xs.length;
    if (n < 2) return;
    const pos = new Float32Array(n * 6);
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = Math.max(i - 1, 0);
      const b = Math.min(i + 1, n - 1);
      const dx = xs[b] - xs[a];
      const dz = zs[b] - zs[a];
      const l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * (lineW / 2);
      const nz = (dx / l) * (lineW / 2);
      pos.set([xs[i] + nx, ys[i], zs[i] + nz, xs[i] - nx, ys[i], zs[i] - nz], i * 6);
      if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const mesh = new THREE.Mesh(g, m);
    mesh.name = name;
    mesh.frustumCulled = false;
    this.geos.push(g);
    this.mats.push(m);
    this.group.add(mesh);
  }

  private pole(x: number, y: number, z: number, hex: number, text: string, h: number, small = false): void {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([x, y, z, x, y + h, z], 3));
    const m = new THREE.LineBasicMaterial({ color: hex, fog: false });
    this.geos.push(g);
    this.mats.push(m);
    this.group.add(new THREE.Line(g, m));
    const s = label(text, hex, small);
    s.position.set(x, y + h + (small ? 5 : 10), z);
    this.group.add(s);
  }

  private build(): void {
    this.built = true;
    // 1. roads that are already in the game: drawn on their real finished surface (8-lane black, R6 blue)
    for (const r of this.roads.roads as any[]) {
      if (String(r.name).includes(':') || !(r.lanes === 8 || r.lanes === 6)) continue;
      const hex = COLOUR[String(r.lanes)];
      const ys = Array.from(r.ys as ArrayLike<number>, (v) => v + LIFT);
      this.ribbon(r.xs, ys, r.zs, hex, r.name, WIDTH);
      const m = r.xs.length >> 1;
      this.pole(r.xs[m], ys[m], r.zs[m], hex, r.name, 40);
    }
    // 1b. the rail-corridor roads CRR-* and the hub ring RR-HUB (4 lanes, so section 1 skips them): purple ribbon on the real finished surface + name label (user 2026-11-20: key 3 did not show them)
    let kc = 0;
    for (const r of this.roads.roads as any[]) {
      const nm = String(r.name);
      if (!(nm.startsWith('CRR-') || nm === 'RR-HUB')) continue;
      const ys = Array.from(r.ys as ArrayLike<number>, (v) => v + LIFT + 0.4);
      this.ribbon(r.xs, ys, r.zs, CRR_HEX, nm, 4);
      const m = r.xs.length >> 1;
      this.pole(r.xs[m], ys[m], r.zs[m], CRR_HEX, nm, 30 + (kc++ % 3) * 8);
    }
    // 2. planned lines (proposals): draped on the natural ground
    CENTRE_ROADS.forEach((r, k) => {
      const hex = COLOUR[String(r.cls)];
      const xs = r.pts.map((p) => p[0]);
      const zs = r.pts.map((p) => p[1]);
      const ys = r.pts.map((p) => this.heightAt(p[0], p[1]) + LIFT);
      this.ribbon(xs, ys, zs, hex, 'centre-' + r.id, r.cls === 2 ? 3 : r.cls === 4 ? 5 : WIDTH);
      const m = r.pts.length >> 1;
      this.pole(xs[m], ys[m], zs[m], hex, r.flag ? r.id + ' ' + r.flag : r.id, 35 + (k % 3) * 8); // flag: ! = no bigger road within 100 m, ~ = stops short of it (class-sequence rule)
    });
    // 3. junction placeholders J-xx
    for (const j of CENTRE_JUNCTIONS) this.pole(j.x, this.heightAt(j.x, j.z) + LIFT, j.z, 0xffb000, j.id, 20);
    // 4. housing streets (STEP C, plan view only): arterial / collector / local in their own colours, small name label, white J-xx poles
    HOUSING_STREETS.forEach((r, k) => {
      const hex = HCOL[r.cls];
      const xs = r.pts.map((p) => p[0]);
      const zs = r.pts.map((p) => p[1]);
      const ys = r.pts.map((p) => this.heightAt(p[0], p[1]) + LIFT + 0.3);
      this.ribbon(xs, ys, zs, hex, 'housing-' + r.id, HWIDTH[r.cls]);
      const m = r.pts.length >> 1;
      this.pole(xs[m], ys[m], zs[m], hex, r.id, HPOLE[r.cls] + (k % 3) * 4, true);
    });
    for (const j of HOUSING_JUNCTIONS) this.pole(j.x, this.heightAt(j.x, j.z) + LIFT, j.z, 0xffffff, j.id, 9, true);
  }

  dispose(): void {
    this.parent.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
