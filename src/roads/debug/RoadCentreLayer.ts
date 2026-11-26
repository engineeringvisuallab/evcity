// STEP MAP-2 viewer: "Road Central Line" debug layer. Draws the planned centrelines (docs/map_all_roads_v2.json) as flat coloured ribbons
// lying 1.5 m above the terrain, with a pole and a name label per road, so the user can drive / fly round and say which line is wrong.
// NOT a road: no physics, no AI, no traffic. Hidden by default; key 3 toggles it. fog: false on every material (like RailDebug), else the game's fog hides far lines. Parent = world.root, absolute world coordinates.
import * as THREE from 'three';
import type { RoadNetwork } from '../RoadNetwork';
import { HOUSING_JUNCTIONS } from './HousingStreetData';
import { CENTRE_COLOUR, CENTRE_LIFT, CENTRE_WIDTH, collectCentreSetFrom } from './RoadCentreSet';

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
  /** Poles + name labels (+ junction labels): shown only when the setting 'road names' is ON. */
  private readonly names = new THREE.Group();
  private built = false;
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];

  constructor(private readonly parent: THREE.Object3D, private readonly roads: RoadNetwork, private readonly heightAt: (x: number, z: number) => number) {
    this.group.name = 'RoadCentreLayer';
    this.group.visible = false;
    this.group.add(this.names);
    parent.add(this.group);
  }

  get visible(): boolean {
    return this.group.visible;
  }

  /** Settings > road names (HudSettings.roadNumbers): the pole + name of every road and the junction labels. */
  setNames(on: boolean): void {
    this.names.visible = on;
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
    this.names.add(new THREE.Line(g, m));
    const s = label(text, hex, small);
    s.position.set(x, y + h + (small ? 5 : 10), z);
    this.names.add(s);
  }

  private build(): void {
    this.built = true;
    // ONE source with the GIS export (RoadCentreSet): every finished game road, all classes; a planned / housing line only where no built road of that name exists
    const set = collectCentreSetFrom(this.roads.roads as any[], this.heightAt);
    set.lines.forEach((l, k) => {
      const hex = CENTRE_COLOUR[l.cls] ?? 0xff7a00;
      const lift = LIFT + (CENTRE_LIFT[l.cls] ?? 0.5) + (l.source === 'built' ? 0 : 0.3);
      const xs = l.pts.map((p) => p[0]);
      const zs = l.pts.map((p) => p[1]);
      const ys = l.pts.map((p) => p[2] + lift);
      this.ribbon(xs, ys, zs, hex, (l.source === 'built' ? 'road-' : l.source + '-') + l.id, CENTRE_WIDTH[l.cls] ?? 3);
      const m = l.pts.length >> 1;
      const km = (Math.round(l.lengthM / 100) / 10).toFixed(1);
      const text = l.source === 'built' ? l.id + ' · ' + km + ' km' : l.id + ' (plan)' + (l.flag ? ' ' + l.flag : '');
      const big = l.cls === '8' || l.cls === '6' || l.cls === '4';
      this.pole(xs[m], ys[m], zs[m], hex, text, (big ? 40 : 28) + (k % 3) * 8, !big);
    });
    // REAL junctions JNxxx (from the finished roads, RoadNetwork.junctionRegistry). Colour: ring-T red, interchange tap orange, arterial yellow, roundabout blue, priority T green.
    const JCOL: Record<string, number> = { 'ring-T': 0xff1030, tap: 0xff7a00, arterial: 0xffd000, roundabout: 0x00b8ff, T: 0x3ddc54, continuation: 0xaaaaaa };
    for (const j of this.roads.junctionRegistry().nodes) {
      if (j.type === 'continuation') continue;
      const names = [...new Set(j.legs.map((l) => l.name))].join('+');
      this.pole(j.x, j.y + LIFT, j.z, JCOL[j.type] ?? 0xffb000, `${j.id} ${j.type} ${names}${j.flags.length ? ' [' + j.flags.join(' ') + ']' : ''}`, 20);
    }
    for (const j of HOUSING_JUNCTIONS) this.pole(j.x, this.heightAt(j.x, j.z) + LIFT, j.z, 0xffffff, j.id, 9, true);
  }

  dispose(): void {
    this.parent.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
