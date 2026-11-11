// ROAD NUMBERS - draws the road number plates (see RoadNumberPlan.ts for the standard and the placement rules).
//   A small POOL of plates (MAX_LABELS) is shared by the roads that are near the camera: one plate per road, sliding along the road with the camera.
//   Step 3: every plate is its own strip of STRIP_ROWS rows whose corners are moved every frame, so it bends with the road and keeps off pads / bridge ends.
//   Children use ABSOLUTE world coordinates (parent = world.root, which the floating origin moves), like RoadSignLayer / StreetLights.
//   Cheap on purpose: the near roads are chosen 8 times a second; only the <= 10 plates in use are placed every frame; textures are cached by text + colour.
import * as THREE from 'three';
import { Q } from '../core/Quality';
import {
  buildRoadIndex, chooseJunctions, chooseRoads, fitToPads, heightOk, hideRadius, JUNCTION_COLOR, junctionCode, junctionCorners, junctionDir, lowestY, MAX_LABELS_AIR,
  nearestOnRoad, newLabelState, padPlaneY, placeLabel, STRIP_FLOATS, STRIP_ROWS, stripVertices, styleOf,
  type BridgeLike, type Camera2D, type LabelState, type NumberRoad, type PadLike, type RoadIndexEntry,
} from './RoadNumberPlan';

const TEX_W = 256;
const TEX_H = 192;
/** Textures kept at once; the ones no plate shows are thrown away beyond this. */
const TEX_KEEP = 96;
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

/** A junction number plate (Step 5): 4 corners (bottom-left, bottom-right, top-left, top-right of the text) on the pad plane. */
interface JSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  geo: THREE.BufferGeometry;
  pos: Float32Array;
  pad: PadLike | null;
  dir: number;
  /** true = the corners are not written yet. */
  fresh: boolean;
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
  /** Step 5: the junction number plates (one per junction pad near the camera). */
  private junctions: PadLike[];
  private jPool: JSlot[] = [];
  private jActive = new Map<number, JSlot>();
  private texCache = new Map<string, THREE.CanvasTexture>();
  private timer = 1;
  private lowY = 0;
  private nightK = 1;
  private on = true;

  constructor(private root: THREE.Object3D, roads: readonly NumberRoad[], pads: readonly PadLike[] = [], bridges: readonly BridgeLike[] = []) {
    this.group.name = 'road-numbers';
    root.add(this.group);
    this.index = buildRoadIndex(roads, pads, bridges);
    this.lowY = lowestY(this.index);
    this.junctions = pads.filter((p) => p.y !== undefined);

    // the same uv and triangles for every plate: row k at v = k / STRIP_ROWS, left corner u = 0, right corner u = 1
    const uv = new Float32Array((STRIP_ROWS + 1) * 4);
    const idx: number[] = [];
    for (let k = 0; k <= STRIP_ROWS; k++) {
      uv.set([0, k / STRIP_ROWS, 1, k / STRIP_ROWS], k * 4);
      if (k < STRIP_ROWS) idx.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2);
    }

    for (let i = 0; i < MAX_LABELS_AIR; i++) {
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

    // junction plates: one quad each (2 triangles); corner order 0 bottom-left, 1 bottom-right, 2 top-left, 3 top-right of the text
    const juv = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    for (let i = 0; i < MAX_LABELS_AIR; i++) {
      const mat = new THREE.MeshBasicMaterial({ alphaTest: 0.4, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
      const pos = new Float32Array(12);
      const geo = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(pos, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', attr);
      geo.setAttribute('uv', new THREE.BufferAttribute(juv, 2));
      geo.setIndex([0, 1, 2, 1, 3, 2]);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'junction-number';
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
      this.jPool.push({ mesh, mat, geo, pos, pad: null, dir: 1, fresh: true, key: '' });
    }
  }

  /** Plates in use right now / roads that can get one (for the console and the debug panel). */
  get stats(): { shown: number; roads: number; junctions: number; textures: number } {
    return { shown: this.active.size, roads: this.index.filter((e) => e.labelOk).length, junctions: this.jActive.size, textures: this.texCache.size };
  }

  /** The switch for the settings menu (Step 2). Off = nothing is drawn and nothing is searched. */
  setEnabled(on: boolean): void {
    this.on = on;
    if (!on) {
      for (const id of [...this.active.keys()]) this.release(id);
      for (const id of [...this.jActive.keys()]) this.releaseJ(id);
    }
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
    for (const s of this.jPool) s.mat.color.setScalar(k);
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
      // Step 4: a high camera keeps the labels of the roads far below it (the radius grows with the height); only a road high ABOVE the camera is dropped
      if (!e || !pose || pose.d > hideRadius(-pose.gapY) || !heightOk(pose.gapY)) {
        this.release(id);
        continue;
      }
      const st = styleOf(e.road);
      stripVertices(e.road, pose.s, s.state.side, s.state.dir, st.across, st.along, s.pos);
      if (e.inPad) fitToPads(e.padList, s.pos); // a short link: the plate lies on the junction pad plane
      (s.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    // junction numbers: lie flat on the pad plane in the middle of the pad; the text turns round when the camera looks clearly against it
    for (const [id, s] of this.jActive) {
      const pad = s.pad;
      const gapY = pad ? padPlaneY(pad, pad.x, pad.z) - cam.y : NaN;
      if (!pad || !Number.isFinite(gapY) || Math.hypot(pad.x - cam.x, pad.z - cam.z) > hideRadius(-gapY) || !heightOk(gapY)) {
        this.releaseJ(id);
        continue;
      }
      const nd = junctionDir(s.dir, cam.fz);
      if (nd !== s.dir || s.fresh) {
        s.fresh = false;
        s.dir = nd;
        junctionCorners(pad, s.dir, s.pos);
        (s.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      }
    }
  }

  /** Picks the roads that get a plate: the nearest ones (the radius and the number of plates grow with the camera height), as many as there are free plates. */
  private choose(cam: Camera2D): void {
    const { cand, limit } = chooseRoads(this.index, cam, (id) => this.active.has(id), this.lowY);
    // the camera came down: give back the farthest plates beyond the limit
    while (this.active.size > limit) {
      let far = -1;
      let fd = -1;
      for (const [id, s] of this.active) {
        const d = s.entry ? nearestOnRoad(s.entry.road, cam.x, cam.z, s.state.hint).d : Infinity;
        if (d > fd) {
          fd = d;
          far = id;
        }
      }
      if (far < 0) break;
      this.release(far);
    }
    // a few new plates per call: the canvas of a new code is drawn once, so a rise to a high view does not hitch
    let made = 0;
    for (const c of cand) {
      if (this.active.size >= limit || made >= 6) break;
      this.acquire(c.e);
      made++;
    }
    this.chooseJunctionPlates(cam);
  }

  /** Step 5: the junction plates near the camera (same radius / height rules as the road plates). */
  private chooseJunctionPlates(cam: Camera2D): void {
    const { cand, limit } = chooseJunctions(this.junctions, cam, (id) => this.jActive.has(id));
    while (this.jActive.size > limit) {
      let far = -1;
      let fd = -1;
      for (const [id, s] of this.jActive) {
        const d = s.pad ? Math.hypot(s.pad.x - cam.x, s.pad.z - cam.z) : Infinity;
        if (d > fd) {
          fd = d;
          far = id;
        }
      }
      if (far < 0) break;
      this.releaseJ(far);
    }
    let made = 0;
    for (const c of cand) {
      if (this.jActive.size >= limit || made >= 6) break;
      if (this.acquireJ(c.pad)) made++;
    }
  }

  private texture(text: string, color: string): { tex: THREE.CanvasTexture; key: string } | null {
    const key = `${text}|${color}`;
    let tex = this.texCache.get(key);
    if (!tex) {
      const canvas = drawPlate(text, color);
      if (!canvas) return null; // no DOM: nothing to draw
      tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, Q.maxAniso);
      this.texCache.set(key, tex);
      this.trimCache();
    }
    return { tex, key };
  }

  private acquireJ(pad: PadLike): boolean {
    const slot = this.jPool.find((s) => s.pad === null);
    if (!slot) return false;
    const t = this.texture(junctionCode(pad), JUNCTION_COLOR);
    if (!t) return false;
    slot.pad = pad;
    slot.key = t.key;
    slot.dir = 1;
    slot.fresh = true; // the corners are written in the next update
    slot.mat.map = t.tex;
    slot.mat.color.setScalar(this.nightK);
    slot.mat.needsUpdate = true;
    slot.mesh.visible = true;
    this.jActive.set(pad.id ?? 0, slot);
    return true;
  }

  private releaseJ(id: number): void {
    const s = this.jActive.get(id);
    if (!s) return;
    s.mesh.visible = false;
    s.pad = null;
    s.key = '';
    this.jActive.delete(id);
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
    const used = new Set([...this.pool, ...this.jPool].map((s) => s.key));
    for (const [k, t] of this.texCache) {
      if (this.texCache.size <= TEX_KEEP) break;
      if (used.has(k)) continue;
      t.dispose();
      this.texCache.delete(k);
    }
  }

  dispose(): void {
    this.root.remove(this.group);
    for (const s of [...this.pool, ...this.jPool]) {
      s.mat.dispose();
      s.geo.dispose();
    }
    for (const t of this.texCache.values()) t.dispose();
    this.texCache.clear();
    this.active.clear();
    this.jActive.clear();
    this.pool.length = 0;
    this.jPool.length = 0;
  }
}
