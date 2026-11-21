// PLOTS viewer: key 5 shows / hides the border lines of every city plot (docs/city_plots_tiled.json -> PlotData.ts).
// Green line = plot you can build on, grey line = tiny leftover piece, blue line = access road parcel (land for a new road, not a plot). Lines are drawn 0.8 m above the ground. NOT a game object: no physics, no AI.
// Built on the first key press, so a game that never uses it pays nothing. fog: false (like RoadCentreLayer) so far plots are visible too.
import * as THREE from 'three';
import { PLOTS } from './PlotData';

const LIFT = 0.8; // m above the terrain
const STEP = 12; // m: a long border edge is cut into pieces this long so the line follows the hills

export class PlotLayer {
  readonly group = new THREE.Group();
  private built = false;
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];

  constructor(private readonly parent: THREE.Object3D, private readonly heightAt: (x: number, z: number) => number) {
    this.group.name = 'PlotLayer';
    this.group.visible = false;
    parent.add(this.group);
  }

  get visible(): boolean {
    return this.group.visible;
  }

  toggle(): void {
    if (!this.built) this.build();
    this.group.visible = !this.group.visible;
  }

  private build(): void {
    this.built = true;
    const good: number[] = [];
    const tiny: number[] = [];
    const road: number[] = [];
    for (const row of PLOTS) {
      const out = row[0] === 2 ? road : row[0] ? tiny : good;
      const n = (row.length - 2) >> 1;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const x0 = row[2 + i * 2], z0 = row[3 + i * 2], x1 = row[2 + j * 2], z1 = row[3 + j * 2];
        const k = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / STEP));
        for (let s = 0; s < k; s++) {
          const ax = x0 + ((x1 - x0) * s) / k, az = z0 + ((z1 - z0) * s) / k;
          const bx = x0 + ((x1 - x0) * (s + 1)) / k, bz = z0 + ((z1 - z0) * (s + 1)) / k;
          out.push(ax, this.heightAt(ax, az) + LIFT, az, bx, this.heightAt(bx, bz) + LIFT, bz);
        }
      }
    }
    this.add(good, 0x14c85a);
    this.add(tiny, 0x9a9a9a);
    this.add(road, 0x2a8cff);
  }

  private add(pos: number[], hex: number): void {
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.LineBasicMaterial({ color: hex, fog: false, depthTest: true });
    const l = new THREE.LineSegments(g, m);
    l.frustumCulled = false;
    this.geos.push(g);
    this.mats.push(m);
    this.group.add(l);
  }

  dispose(): void {
    this.parent.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
