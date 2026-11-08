// ROAD (CONVEX) MIRRORS at junctions: a pole with a big round orange-rimmed mirror, like the ones on real blind corners.
//
//   Every mirror has a painted picture (cheap, instanced). The few mirrors nearest to the camera (Q.mirrorLive) show the REAL scene instead:
//   a small extra render from the mirror, bent like a fish-eye (convex) and flipped like a reflection. See JunctionMirrors.renderLive.
//
//   planJunctionMirrors(roads)   pure placement (no three.js scene): where every mirror stands and which way it faces
//   JunctionMirrors              the 3D layer. Everything is INSTANCED: 2 draw calls for the whole map (poles + mirror faces)
//
// Placement (every engineered junction with 3 or more arms):
//   - T junction / any arm with NO road straight across from it: the classic spot. The mirror stands on the far kerb, opposite that arm, and
//     faces it, so a driver waiting on the side road sees the traffic coming from both sides on the main road.
//   - Crossing where every arm has a road opposite it (4-way, multi): one mirror on every corner, standing just outside the kerb return and
//     facing the middle of the junction.
// A mirror is never put on asphalt (it is pushed outwards onto the shoulder or dropped) and never within a metre of a street light pole.
// Children use ABSOLUTE world coordinates (parent = world.root), like the street lights.
import * as THREE from 'three';
import type { RoadNetwork } from './RoadNetwork';

export interface MirrorSpot {
  /** Foot of the pole (world metres). */
  x: number;
  y: number;
  z: number;
  /** Unit vector (x, z) the mirror faces (towards the traffic that should look into it). */
  nx: number;
  nz: number;
  /** 0 = stands opposite a side road (T junction), 1 = corner mirror of a crossing. */
  kind: 0 | 1;
}

const wrap = (a: number): number => {
  const t = Math.PI * 2;
  return ((a % t) + t) % t;
};
const angDiff = (a: number, b: number): number => {
  const d = Math.abs(wrap(a) - wrap(b));
  return Math.min(d, Math.PI * 2 - d);
};

/** Farthest distance from (cx, cz) along the unit ray (dx, dz) at which it leaves the polygon (x, z pairs); 0 if it never crosses. */
function rayExit(poly: Float32Array, cx: number, cz: number, dx: number, dz: number): number {
  const n = poly.length / 2;
  let best = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = poly[i * 2] - cx;
    const az = poly[i * 2 + 1] - cz;
    const ex = poly[j * 2] - poly[i * 2];
    const ez = poly[j * 2 + 1] - poly[i * 2 + 1];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = (ax * ez - az * ex) / den;
    const u = (ax * dz - az * dx) / den;
    if (t > 0 && u >= 0 && u <= 1 && t > best) best = t;
  }
  return best;
}

/** How far to the side of a ray the mirror may stand (m) when the straight-across spot is taken by asphalt. */
const SIDE_TRIES = [0, 1.5, -1.5, 3, -3];

/** Where every junction mirror stands. Deterministic. `avoid` = street light poles (x, z) to keep clear of. */
export function planJunctionMirrors(roads: RoadNetwork, avoid: ReadonlyArray<{ x: number; z: number }> = []): MirrorSpot[] {
  const out: MirrorSpot[] = [];
  const cell = 40;
  const grid = new Map<string, { x: number; z: number }[]>();
  const key = (cx: number, cz: number): string => cx + ',' + cz;
  const add = (x: number, z: number): void => {
    const k = key(Math.floor(x / cell), Math.floor(z / cell));
    const l = grid.get(k);
    if (l) l.push({ x, z });
    else grid.set(k, [{ x, z }]);
  };
  for (const a of avoid) add(a.x, a.z);
  const clear = (x: number, z: number): boolean => {
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    for (let i = cx - 1; i <= cx + 1; i++)
      for (let j = cz - 1; j <= cz + 1; j++) {
        const l = grid.get(key(i, j));
        if (l) for (const p of l) if (Math.hypot(p.x - x, p.z - z) < 1.2) return false;
      }
    return true;
  };

  for (const p of roads.pads) {
    if (p.arms.length < 3) continue;
    const ring = p.gravel.length ? p.gravel : p.outline;
    const thetas = p.arms.map((a) => wrap(a.theta));
    const hasArmAt = (ang: number): boolean => thetas.some((t) => angDiff(t, ang) < 0.5);
    const heightAt = (x: number, z: number): number => p.y + p.a * (x - p.x) + p.b * (z - p.z);

    /** Try to stand a mirror on the ray (dx, dz) from the pad centre, just outside the shoulder; face (fx, fz). */
    const place = (dx: number, dz: number, fx: number, fz: number, kind: 0 | 1): boolean => {
      const reach = rayExit(ring, p.x, p.z, dx, dz);
      if (reach <= 0) return false;
      const sx = -dz; // sideways
      const sz = dx;
      for (const side of SIDE_TRIES) {
        for (let extra = 0.7; extra <= 2.5; extra += 0.9) {
          const px = p.x + dx * (reach + extra) + sx * side;
          const pz = p.z + dz * (reach + extra) + sz * side;
          if (roads.surfaceAt(px, pz) === 1) continue; // asphalt of this or a crossing road
          if (!clear(px, pz)) continue;
          out.push({ x: px, y: heightAt(px, pz), z: pz, nx: fx, nz: fz, kind });
          add(px, pz);
          return true;
        }
      }
      return false;
    };

    let stems = 0;
    for (const t of thetas) {
      if (hasArmAt(t + Math.PI)) continue; // a road runs straight across from this arm: no mirror needed for it
      const dx = Math.cos(t);
      const dz = Math.sin(t);
      // stand opposite the arm (direction -d from the centre), face the arm (+d)
      if (place(-dx, -dz, dx, dz, 0)) stems++;
    }
    if (stems > 0) continue;

    // every arm has an opposite: one mirror on each corner, facing the middle of the junction
    const th = [...thetas].sort((a, b) => a - b);
    for (let k = 0; k < th.length; k++) {
      const a = th[k];
      const b = k + 1 < th.length ? th[k + 1] : th[0] + Math.PI * 2;
      const gap = b - a;
      if (gap < 0.5) continue;
      const ang = a + gap / 2;
      place(Math.cos(ang), Math.sin(ang), -Math.cos(ang), -Math.sin(ang), 1);
    }
  }
  return out;
}

// --------------------------------------------------------------------------------------------------------------------------------------

const MIRROR_R = 0.8; // rim radius (m): a 1.6 m round mirror, readable from 40+ m
const MIRROR_Y = 3.2; // centre height above the foot of the pole (m); the lowest edge stays above 2.3 m
const POLE_TOP = 4.1;
/** Glass radius / rim radius in the painted face (faceTexture: 50 px of 64). The live picture is a little smaller so the rim stays visible. */
const GLASS = 0.76;
/** Live mirror: field of view of the render (deg, both ways) and how far the camera is tilted down (rad). The convex look is made by the disc's UVs. */
const LIVE_FOV = 130;
const LIVE_PITCH = 0.12;

export interface MirrorLiveOptions {
  /** How many mirrors may show the real scene at once (0 = none, only the painted picture). */
  live: number;
  /** Only mirrors within this distance (m) of the camera go live. */
  dist: number;
  /** Size (px) of each live picture (square). */
  size: number;
  /** MSAA samples of the live picture (0 = off). */
  samples: number;
}

/**
 * The glass of a live mirror: a polar disc (centre fan + rings) whose UVs squeeze a wide rectilinear picture into a fish-eye one
 * (equidistant: angle from the axis is proportional to the distance from the centre) and flip it left-right, like a real reflection.
 */
function glassGeometry(radius: number, rings = 10, segs = 40): THREE.BufferGeometry {
  const half = (LIVE_FOV / 2) * (Math.PI / 180);
  const tMax = Math.tan(half);
  const pos: number[] = [0, 0, 0];
  const uv: number[] = [0.5, 0.5];
  const idx: number[] = [];
  for (let r = 1; r <= rings; r++) {
    const rho = r / rings;
    const img = Math.tan(rho * half) / tMax; // 0..1 across the rendered square
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      pos.push(c * rho * radius, sn * rho * radius, 0);
      uv.push(0.5 - 0.5 * img * c, 0.5 + 0.5 * img * sn); // camera right = mirror -X, so u runs backwards: the reflection flip
    }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + s, 1 + ((s + 1) % segs));
  for (let r = 1; r < rings; r++) {
    const base = 1 + (r - 1) * segs;
    const next = 1 + r * segs;
    for (let s = 0; s < segs; s++) {
      const a = base + s;
      const b = base + ((s + 1) % segs);
      const cc = next + s;
      const d = next + ((s + 1) % segs);
      idx.push(a, cc, d, a, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

interface LiveView {
  rt: THREE.WebGLRenderTarget;
  mat: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh;
  /** Index into `spots` this view shows now (-1 = free). */
  spot: number;
  /** The first picture of the current spot is drawn already. */
  ready: boolean;
}

/** The face: an orange rim with white stripes and a convex "reflection" (sky above, road below, curved horizon). */
function faceTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const m = S / 2;
  // rim
  g.fillStyle = '#ff6a00';
  g.beginPath();
  g.arc(m, m, m, 0, Math.PI * 2);
  g.fill();
  // white stripes on the rim
  g.strokeStyle = '#ffffff';
  g.lineWidth = 9;
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2;
    g.beginPath();
    g.arc(m, m, m - 6, a0, a0 + 0.38);
    g.stroke();
  }
  // glass
  const r = m - 14;
  g.save();
  g.beginPath();
  g.arc(m, m, r, 0, Math.PI * 2);
  g.clip();
  const sky = g.createLinearGradient(0, m - r, 0, m + r);
  sky.addColorStop(0, '#d6e8fa');
  sky.addColorStop(0.5, '#9fc0e6');
  sky.addColorStop(0.5, '#6f7378');
  sky.addColorStop(1, '#3d4044');
  g.fillStyle = sky;
  g.fillRect(0, 0, S, S);
  // bent horizon + a bent road line, like a fish-eye view
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(m, m + 6, r * 0.95, r * 0.5, 0, Math.PI, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(240,220,120,0.7)';
  g.beginPath();
  g.moveTo(m, m + r);
  g.quadraticCurveTo(m + 6, m + 14, m - r * 0.7, m + 2);
  g.stroke();
  // convex highlight
  const hl = g.createRadialGradient(m - r * 0.35, m - r * 0.4, 2, m - r * 0.35, m - r * 0.4, r * 0.8);
  hl.addColorStop(0, 'rgba(255,255,255,0.65)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.fillRect(0, 0, S, S);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const DAY = new THREE.Color(1, 1, 1);
const NIGHT = new THREE.Color(0.3, 0.33, 0.45);

export class JunctionMirrors {
  readonly group = new THREE.Group();
  readonly spots: MirrorSpot[];
  private poles: THREE.InstancedMesh;
  private faces: THREE.InstancedMesh;
  private faceMat: THREE.MeshBasicMaterial;
  private poleMat = new THREE.MeshLambertMaterial({ color: 0x6a6f75 });
  private tex: THREE.CanvasTexture;
  private geos: THREE.BufferGeometry[] = [];
  // live (real scene) mirrors
  private live: LiveView[] = [];
  private liveCam: THREE.PerspectiveCamera | null = null;
  private liveDist: number;
  private tick = 0;
  private rr = 0;
  private tmpP = new THREE.Vector3();
  private tmpD = new THREE.Vector3();

  constructor(parent: THREE.Object3D, roads: RoadNetwork, avoid: ReadonlyArray<{ x: number; z: number }> = [], opts: MirrorLiveOptions = { live: 0, dist: 40, size: 256, samples: 0 }) {
    this.spots = planJunctionMirrors(roads, avoid);
    this.liveDist = opts.dist;
    const n = this.spots.length;

    // instance frame: +Z = the way the mirror faces, +Y up, +X = Y x Z. The pole stands a little behind the mirror (z = -0.14).
    const parts: THREE.BufferGeometry[] = [];
    const pole = new THREE.CylinderGeometry(0.06, 0.08, POLE_TOP + 1.2, 10);
    pole.translate(0, (POLE_TOP - 1.2) / 2, -0.14);
    parts.push(pole);
    const bracket = new THREE.BoxGeometry(0.1, 0.1, 0.16);
    bracket.translate(0, MIRROR_Y, -0.08);
    parts.push(bracket);
    const dish = new THREE.CylinderGeometry(MIRROR_R + 0.03, MIRROR_R + 0.03, 0.1, 20);
    dish.rotateX(Math.PI / 2);
    dish.translate(0, MIRROR_Y, -0.05);
    parts.push(dish);
    const poleGeo = mergeGeometries(parts);
    for (const q of parts) q.dispose();
    this.geos.push(poleGeo);

    const faceGeo = new THREE.CircleGeometry(MIRROR_R + 0.03, 24);
    faceGeo.translate(0, MIRROR_Y, 0.004);
    this.geos.push(faceGeo);

    this.tex = faceTexture();
    this.faceMat = new THREE.MeshBasicMaterial({ map: this.tex, color: DAY.clone() });

    this.poles = new THREE.InstancedMesh(poleGeo, this.poleMat, Math.max(1, n));
    this.faces = new THREE.InstancedMesh(faceGeo, this.faceMat, Math.max(1, n));
    this.poles.count = this.faces.count = n;

    const m = new THREE.Matrix4();
    const X = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    const Z = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const s = this.spots[i];
      Z.set(s.nx, 0, s.nz);
      X.crossVectors(Y, Z);
      m.makeBasis(X, Y, Z).setPosition(s.x, s.y, s.z);
      this.poles.setMatrixAt(i, m);
      this.faces.setMatrixAt(i, m);
    }
    this.poles.instanceMatrix.needsUpdate = true;
    this.faces.instanceMatrix.needsUpdate = true;
    for (const o of [this.poles, this.faces]) {
      o.frustumCulled = false; // spread over the whole map
      o.castShadow = false;
      o.receiveShadow = false;
    }
    this.group.add(this.poles, this.faces);

    if (opts.live > 0 && n > 0) {
      this.liveCam = new THREE.PerspectiveCamera(LIVE_FOV, 1, 0.3, 700);
      const glass = glassGeometry((MIRROR_R + 0.03) * GLASS);
      this.geos.push(glass);
      for (let i = 0; i < opts.live; i++) {
        const rt = new THREE.WebGLRenderTarget(opts.size, opts.size, {
          samples: opts.samples,
          depthBuffer: true,
          generateMipmaps: false,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
        });
        const mat = new THREE.MeshBasicMaterial({ map: rt.texture, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        const mesh = new THREE.Mesh(glass, mat);
        mesh.visible = false;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        this.group.add(mesh);
        this.live.push({ rt, mat, mesh, spot: -1, ready: false });
      }
    }
    parent.add(this.group);
  }

  /**
   * Call once per frame BEFORE the main render. The few mirrors nearest to the camera (in front of it, and seen from the front) show the real
   * scene: each frame ONE of them is rendered from the mirror (130 degrees, tilted a little down) into its own small picture, so with 2 live
   * mirrors each refreshes every 2nd frame. The sun shadow map is not redrawn for these passes. The others keep the painted picture.
   */
  renderLive(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    const cam = this.liveCam;
    const parent = this.group.parent;
    if (!cam || !parent || this.live.length === 0) return;

    // 1) every 12th frame: choose which spots go live (nearest first, keep the ones that are still good)
    if (this.tick++ % 12 === 0) {
      parent.updateWorldMatrix(true, false);
      camera.getWorldPosition(this.tmpP);
      parent.worldToLocal(this.tmpP);
      camera.getWorldDirection(this.tmpD);
      const cx = this.tmpP.x;
      const cy = this.tmpP.y;
      const cz = this.tmpP.z;
      const fx = this.tmpD.x;
      const fy = this.tmpD.y;
      const fz = this.tmpD.z;
      const lim = this.liveDist * this.liveDist;
      const cand: { i: number; d: number }[] = [];
      for (let i = 0; i < this.spots.length; i++) {
        const s = this.spots[i];
        const dx = s.x - cx;
        const dz = s.z - cz;
        const dy = s.y + MIRROR_Y - cy;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > lim || d2 < 1) continue;
        const d = Math.sqrt(d2);
        if (-(dx * s.nx + dz * s.nz) / d < 0.25) continue; // the camera is not in front of the mirror
        if ((dx * fx + dy * fy + dz * fz) / d < 0.35) continue; // the mirror is not (nearly) in front of the camera
        cand.push({ i, d });
      }
      cand.sort((a, b) => a.d - b.d);
      const want = cand.slice(0, this.live.length).map((c) => c.i);
      for (const v of this.live) {
        if (v.spot >= 0 && !want.includes(v.spot)) {
          v.spot = -1;
          v.ready = false;
          v.mesh.visible = false;
        }
      }
      for (const i of want) {
        if (this.live.some((v) => v.spot === i)) continue;
        const v = this.live.find((w) => w.spot < 0);
        if (!v) break;
        const s = this.spots[i];
        v.spot = i;
        v.ready = false;
        v.mesh.position.set(s.x + s.nx * 0.02, s.y + MIRROR_Y, s.z + s.nz * 0.02);
        v.mesh.rotation.set(0, Math.atan2(s.nx, s.nz), 0);
      }
    }

    // 2) draw ONE live mirror this frame: a new one first, else round robin
    const n = this.live.length;
    let pick: LiveView | null = this.live.find((v) => v.spot >= 0 && !v.ready) ?? null;
    if (!pick) {
      for (let k = 0; k < n; k++) {
        const v = this.live[(this.rr + k) % n];
        if (v.spot >= 0) {
          pick = v;
          this.rr = (this.rr + k + 1) % n;
          break;
        }
      }
    }
    if (!pick) return;

    const s = this.spots[pick.spot];
    const cp = Math.cos(LIVE_PITCH);
    const sp = Math.sin(LIVE_PITCH);
    this.tmpP.set(s.x + s.nx * 0.3, s.y + MIRROR_Y, s.z + s.nz * 0.3); // a little in front of the glass
    parent.localToWorld(this.tmpP);
    cam.position.copy(this.tmpP);
    cam.updateMatrixWorld(true);
    cam.lookAt(this.tmpP.x + s.nx * cp, this.tmpP.y - sp, this.tmpP.z + s.nz * cp);
    cam.updateMatrixWorld(true);

    const shown = this.live.map((v) => v.mesh.visible);
    for (const v of this.live) v.mesh.visible = false; // no mirror inside a mirror (and no texture read while it is written)
    const sm = renderer.shadowMap;
    const au = sm.autoUpdate;
    const nu = sm.needsUpdate;
    sm.autoUpdate = false;
    sm.needsUpdate = false;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(pick.rt);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev);
    sm.autoUpdate = au;
    sm.needsUpdate = nu;
    this.live.forEach((v, k) => (v.mesh.visible = shown[k]));
    pick.ready = true;
    pick.mesh.visible = true;
  }

  /** Once per rendered frame. on = 0 (day) .. 1 (night): the mirror is a dull dark disc at night. */
  update(on: number): void {
    this.faceMat.color.copy(DAY).lerp(NIGHT, on);
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.poles.dispose();
    this.faces.dispose();
    for (const v of this.live) {
      v.rt.dispose();
      v.mat.dispose();
    }
    for (const g of this.geos) g.dispose();
    this.poleMat.dispose();
    this.faceMat.dispose();
    this.tex.dispose();
  }
}

/** Merge position / normal / uv / index of several indexed geometries into one (no BufferGeometryUtils import, which would pull the examples bundle). */
function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vCount = 0;
  let iCount = 0;
  for (const g of list) {
    vCount += g.getAttribute('position').count;
    iCount += g.getIndex()!.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    pos.set(p.array as Float32Array, vo * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, vo * 3);
    uv.set(g.getAttribute('uv').array as Float32Array, vo * 2);
    const ix = g.getIndex()!.array;
    for (let k = 0; k < ix.length; k++) idx[io + k] = ix[k] + vo;
    vo += p.count;
    io += ix.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
