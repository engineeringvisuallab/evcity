// ROAD NUMBERS - draws the road number plates (see RoadNumberPlan.ts for the standard and the placement rules).
//   A small POOL of plates (MAX_LABELS) is shared by the roads that are near the camera: one plate per road, sliding along the road with the camera.
//   Step 3: every plate is its own strip of STRIP_ROWS rows whose corners are moved every frame, so it bends with the road and keeps off pads / bridge ends.
//   Children use ABSOLUTE world coordinates (parent = world.root, which the floating origin moves), like RoadSignLayer / StreetLights.
//   Cheap on purpose: the near roads are chosen 8 times a second; only the <= 10 plates in use are placed every frame; textures are cached by text + colour.
import * as THREE from 'three';
import { Q } from '../core/Quality';
import {
  buildRoadIndex, HIDE_RADIUS_M, MAX_HEIGHT_GAP_M, MAX_LABELS, nearestOnRoad, newLabelState, placeLabel, pointAt, SHOW_RADIUS_M, STRIP_FLOATS, STRIP_ROWS,
  stripVertices, styleOf,
  type BridgeLike, type Camera2D, type LabelState, type NumberRoad, type PadLike, type RoadIndexEntry,
} from './RoadNumberPlan';

const TEX_W = 256;
const TEX_H = 192;
/** Textures kept at once; the ones no plate shows are thrown away beyond this. */
const TEX_KEEP = 48;
const EN_FONT = '"Segoe UI", Arial, Helvetica, sans-serif';

interface Slot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  /** The plate's own geometry: STRIP_ROWS + 1 rows of (left, right) corners; only the positions change. */
  geo: THREE.BufferGeometry;
  pos: Float32Array;
  state: LabelState;
  entry: RoadIndexEntry | null;
  key: string;
}

/** The face of one plate: rounded plate in the class colour, thin white inner line, the road code in white. Null when there is no DOM (headless). */
function drawPlate(text: string, color: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext('2d');
  if (!g) return null;
  const rr = (x: number, y: number, w: number, h: number, r: number): void => {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };
  g.clearRect(0, 0, TEX_W, TEX_H);
  rr(2, 2, TEX_W - 4, TEX_H - 4, 30);
  g.fillStyle = color;
  g.fill();
  rr(12, 12, TEX_W - 24, TEX_H - 24, 22);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 6;
  g.stroke();
  let size = 120;
  g.font = `800 ${size}px ${EN_FONT}`;
  while (g.measureText(text).width > TEX_W - 56 && size > 28) {
    size -= 4;
    g.font = `800 ${size}px ${EN_FONT}`;
  }
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, TEX_W / 2, TEX_H / 2 + size * 0.04);
  return c;
}

export class RoadNumberView {
  readonly group = new THREE.Group();
  private index: RoadIndexEntry[];
  private pool: Slot[] = [];
  private active = new Map<number, Slot>();
  private texCache = new Map<string, THREE.CanvasTexture>();
  private timer = 1;
  private nightK = 1;
  private on = true;

  constructor(private root: THREE.Object3D, roads: readonly NumberRoad[], pads: readonly PadLike[] = [], bridges: readonly BridgeLike[] = []) {
    this.group.name = 'road-numbers';
    root.add(this.group);
    this.index = buildRoadIndex(roads, pads, bridges);

    // the same uv and triangles for every plate: row k at v = k / STRIP_ROWS, left corner u = 0, right corner u = 1
    const uv = new Float32Array((STRIP_ROWS + 1) * 4);
    const idx: number[] = [];
    for (let k = 0; k <= STRIP_ROWS; k++) {
      uv.set([0, k / STRIP_ROWS, 1, k / STRIP_ROWS], k * 4);
      if (k < STRIP_ROWS) idx.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2);
    }

    for (let i = 0; i < MAX_LABELS; i++) {
      // polygonOffset: the plate never z-fights the road, even from far away
      const mat = new THREE.MeshBasicMaterial({ alphaTest: 0.4, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      const pos = new Float32Array(STRIP_FLOATS);
      const geo = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(pos, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', attr);
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'road-number';
      mesh.matrixAutoUpdate = false; // the corners are already in world coordinates: the matrix stays the identity
      mesh.frustumCulled = false; // the bounding sphere is not kept up to date (10 plates at most)
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({ mesh, mat, geo, pos, state: newLabelState(), entry: null, key: '' });
    }
  }

  /** Plates in use right now / roads that can get one (for the console and the debug panel). */
  get stats(): { shown: number; roads: number; textures: number } {
    return { shown: this.active.size, roads: this.index.filter((e) => e.labelOk).length, textures: this.texCache.size };
  }

  /** The switch for the settings menu (Step 2). Off = nothing is drawn and nothing is searched. */
  setEnabled(on: boolean): void {
    this.on = on;
    if (!on) for (const id of [...this.active.keys()]) this.release(id);
    this.group.visible = on;
  }

  get enabled(): boolean {
    return this.on;
  }

  /** lampOn = 0 (day) .. 1 (night): the plates are a little darker at night (they are paint, not lamps). */
  setLamp(lampOn: number): void {
    const k = 1 - 0.45 * Math.min(1, Math.max(0, lampOn));
    if (Math.abs(k - this.nightK) < 0.004) return;
    this.nightK = k;
    for (const s of this.pool) s.mat.color.setScalar(k);
  }

  /** Once per rendered frame. cam = the camera in ABSOLUTE world coordinates (x, y, z) and its horizontal look direction. */
  update(dt: number, cam: Camera2D): void {
    if (!this.on) return;
    this.timer += dt;
    if (this.timer >= 0.125) {
      this.timer = 0;
      this.choose(cam);
    }
    for (const [id, s] of this.active) {
      const e = s.entry;
      const pose = e ? placeLabel(e.road, s.state, cam, dt, e.blocked) : null;
      if (!e || !pose || pose.d > HIDE_RADIUS_M || Math.abs(pose.gapY) > MAX_HEIGHT_GAP_M) {
        this.release(id);
        continue;
      }
      const st = styleOf(e.road);
      stripVertices(e.road, pose.s, s.state.side, s.state.dir, st.across, st.along, s.pos);
      (s.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  /** Picks the roads that get a plate: the nearest ones within SHOW_RADIUS_M, as many as there are free plates. */
  private choose(cam: Camera2D): void {
    const cand: { e: RoadIndexEntry; d: number }[] = [];
    const R = SHOW_RADIUS_M;
    for (const e of this.index) {
      if (cam.x < e.minX - R || cam.x > e.maxX + R || cam.z < e.minZ - R || cam.z > e.maxZ + R) continue;
      if (!e.labelOk || this.active.has(e.road.id)) continue;
      const n = nearestOnRoad(e.road, cam.x, cam.z);
      if (n.d > R) continue;
      if (Math.abs(pointAt(e.road, n.s).y - cam.y) > MAX_HEIGHT_GAP_M) continue;
      cand.push({ e, d: n.d });
    }
    if (cand.length === 0) return;
    cand.sort((a, b) => a.d - b.d);
    for (const c of cand) {
      if (this.active.size >= MAX_LABELS) break;
      this.acquire(c.e);
    }
  }

  private acquire(entry: RoadIndexEntry): void {
    const road = entry.road;
    const slot = this.pool.find((s) => s.entry === null);
    if (!slot) return;
    const st = styleOf(road);
    const key = `${road.name}|${st.color}`;
    let tex = this.texCache.get(key);
    if (!tex) {
      const canvas = drawPlate(road.name, st.color);
      if (!canvas) return; // no DOM: nothing to draw
      tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, Q.maxAniso);
      this.texCache.set(key, tex);
      this.trimCache();
    }
    slot.entry = entry;
    slot.mesh.matrixWorldNeedsUpdate = true;
    slot.key = key;
    slot.state = newLabelState();
    slot.mat.map = tex;
    slot.mat.color.setScalar(this.nightK);
    slot.mat.needsUpdate = true;
    slot.mesh.visible = true;
    this.active.set(road.id, slot);
  }

  private release(id: number): void {
    const s = this.active.get(id);
    if (!s) return;
    s.mesh.visible = false;
    s.entry = null;
    s.key = '';
    this.active.delete(id);
  }

  /** Keeps at most TEX_KEEP textures: frees the oldest ones that no plate shows. */
  private trimCache(): void {
    if (this.texCache.size <= TEX_KEEP) return;
    const used = new Set(this.pool.map((s) => s.key));
    for (const [k, t] of this.texCache) {
      if (this.texCache.size <= TEX_KEEP) break;
      if (used.has(k)) continue;
      t.dispose();
      this.texCache.delete(k);
    }
  }

  dispose(): void {
    this.root.remove(this.group);
    for (const s of this.pool) {
      s.mat.dispose();
      s.geo.dispose();
    }
    for (const t of this.texCache.values()) t.dispose();
    this.texCache.clear();
    this.active.clear();
    this.pool.length = 0;
  }
}
