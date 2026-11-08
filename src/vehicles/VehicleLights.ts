// VEHICLE LIGHTS: headlights and tail lights that switch on at night (every vehicle: the player's, AI traffic, buses, bikes, tractors ...).
//
// Cheap on purpose (the game must also run on phones): NO real three.js lights are added (a real SpotLight per car would recompile every
// shader and make every material slower). Instead each vehicle carries 3 tiny children, and ALL of them share the same materials / textures:
//   beam   : a long soft cone of light lying on the road in front of the car (additive plane, drawn only at night, only near the player)
//   tail   : a short red pool behind the car
//   glow   : 4 (or 2) additive glow points = the headlamps and the tail lamps (brighter tail lamps while braking)
// A vehicle's lights are on when it is night AND somebody drives it (player, AI traffic, police / farm autopilot) AND it is not wrecked.
import * as THREE from 'three';
import { Q } from '../core/Quality';
import { groundY, type VehicleId, type VehicleSpec } from './VehicleSpec';

/** Night level shared by all vehicles: Engine writes `environment.lampOn` here every frame (0 = day, 1 = night). */
export const NightLamps = { on: 0 };

interface LampDef {
  /** Half distance between the two headlamps (m). 0 = ONE lamp in the middle (bikes, rickshaw, auto). */
  x: number;
  /** Headlamp height above the road (m) and tail lamp height. */
  h: number;
  tailH: number;
  /** Beam: far end width and length (m). */
  beamW: number;
  beamL: number;
}

const DEF: Record<VehicleId, LampDef> = {
  sedan: { x: 0.62, h: 0.66, tailH: 0.82, beamW: 12, beamL: 34 },
  jeep: { x: 0.66, h: 0.86, tailH: 0.95, beamW: 12, beamL: 34 },
  hypercar: { x: 0.66, h: 0.5, tailH: 0.62, beamW: 12, beamL: 36 },
  evhypar: { x: 0.68, h: 0.55, tailH: 0.7, beamW: 12, beamL: 36 },
  suprim: { x: 0.66, h: 0.52, tailH: 0.66, beamW: 12, beamL: 36 },
  pickup: { x: 0.68, h: 0.9, tailH: 1.0, beamW: 12, beamL: 36 },
  evbike: { x: 0, h: 0.85, tailH: 0.78, beamW: 7, beamL: 26 },
  rickshaw: { x: 0, h: 0.85, tailH: 0.7, beamW: 6, beamL: 18 },
  auto: { x: 0, h: 0.85, tailH: 0.8, beamW: 8, beamL: 24 },
  bus: { x: 0.85, h: 0.85, tailH: 1.1, beamW: 15, beamL: 40 },
  truck: { x: 0.85, h: 1.0, tailH: 1.1, beamW: 15, beamL: 40 },
  tank: { x: 0.9, h: 1.1, tailH: 1.1, beamW: 12, beamL: 30 },
  tractor: { x: 0.7, h: 1.15, tailH: 1.1, beamW: 12, beamL: 30 },
  combine: { x: 1.0, h: 1.7, tailH: 1.5, beamW: 14, beamL: 34 },
};

/** Distance (m) up to which the little glow points are drawn (headlamps of far cars stay visible at night). */
const GLOW_DIST = 380;

const HEAD = new THREE.Color(1.0, 0.95, 0.8);
const TAIL_DIM = new THREE.Color(0.6, 0.05, 0.03);
const TAIL_BRAKE = new THREE.Color(1.0, 0.1, 0.06);

interface Shared {
  beamGeo: THREE.PlaneGeometry;
  beamMat: THREE.MeshBasicMaterial;
  tailMat: THREE.MeshBasicMaterial;
  glowMat: THREE.PointsMaterial;
  beamTex: THREE.CanvasTexture;
  glowTex: THREE.CanvasTexture;
}
let shared: Shared | null = null;

/** Soft cone: row 0 is the car end (narrow, dim just in front of the bumper), the last row is the far end (wide, faded out). Grey = strength. */
function makeBeamTexture(): THREE.CanvasTexture {
  const W = 64;
  const H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const sm = (a: number, b: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const hw = 0.14 + 0.86 * Math.pow(t, 0.75); // half width of the cone at this distance (0..1 of the plane width / 2)
    const along = sm(0, 0.07, t) * Math.pow(1 - t, 1.5);
    for (let x = 0; x < W; x++) {
      const u = (x / (W - 1)) * 2 - 1;
      const edge = Math.pow(Math.max(0, 1 - Math.abs(u) / hw), 1.25);
      const v = Math.round(255 * Math.min(1, along * edge * 1.9));
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.7)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function getShared(): Shared {
  if (shared) return shared;
  const beamGeo = new THREE.PlaneGeometry(1, 1);
  beamGeo.rotateX(-Math.PI / 2); // lies on the ground; uv.v = 1 (image row 0 = near the car) is the -z edge
  const beamTex = makeBeamTexture();
  const glowTex = makeGlowTexture();
  const common = {
    map: beamTex,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  } as const;
  const beamMat = new THREE.MeshBasicMaterial({ ...common, color: new THREE.Color(1.0, 0.93, 0.74) });
  const tailMat = new THREE.MeshBasicMaterial({ ...common, color: new THREE.Color(1.0, 0.12, 0.06) });
  const glowMat = new THREE.PointsMaterial({
    map: glowTex,
    size: 1.0,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  shared = { beamGeo, beamMat, tailMat, glowMat, beamTex, glowTex };
  return shared;
}

export class VehicleLights {
  private readonly beam: THREE.Mesh;
  private readonly tail: THREE.Mesh;
  private readonly glow: THREE.Points;
  private readonly glowGeo = new THREE.BufferGeometry();
  private readonly colors: Float32Array;
  private readonly tailFirst: number;
  private brakeOn = false;

  constructor(private readonly root: THREE.Object3D, spec: VehicleSpec) {
    const S = getShared();
    const D = DEF[spec.id] ?? DEF.sedan;
    const gy = groundY(spec);
    const zf = spec.half.z - 0.05;
    const zb = -spec.half.z + 0.05;
    const xs = D.x > 0 ? [-D.x, D.x] : [0];

    // glow points: headlamps first, then tail lamps
    const n = xs.length * 2;
    const pos = new Float32Array(n * 3);
    this.colors = new Float32Array(n * 3);
    let k = 0;
    for (const x of xs) {
      pos.set([x, gy + D.h, zf + 0.12], k * 3);
      this.colors.set([HEAD.r, HEAD.g, HEAD.b], k * 3);
      k++;
    }
    this.tailFirst = k;
    for (const x of xs) {
      pos.set([x, gy + D.tailH, zb - 0.08], k * 3);
      this.colors.set([TAIL_DIM.r, TAIL_DIM.g, TAIL_DIM.b], k * 3);
      k++;
    }
    this.glowGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.glowGeo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.glowGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, gy + 1, 0), Math.max(spec.half.z, 2) + 2);
    this.glow = new THREE.Points(this.glowGeo, S.glowMat);
    this.glow.renderOrder = 6;

    this.beam = new THREE.Mesh(S.beamGeo, S.beamMat);
    this.beam.scale.set(D.beamW, 1, D.beamL);
    this.beam.position.set(0, gy + 0.05, zf + D.beamL / 2 - 0.3);
    this.beam.renderOrder = 4;
    this.beam.frustumCulled = false;

    this.tail = new THREE.Mesh(S.beamGeo, S.tailMat);
    this.tail.scale.set(D.beamW * 0.32, 1, 6);
    this.tail.rotation.y = Math.PI; // the cone fades away BEHIND the car
    this.tail.position.set(0, gy + 0.05, zb - 3 + 0.2);
    this.tail.renderOrder = 4;
    this.tail.frustumCulled = false;

    for (const o of [this.beam, this.tail, this.glow]) {
      o.castShadow = false;
      o.receiveShadow = false;
      o.visible = false;
      root.add(o);
    }
  }

  /** Once per frame. lit = somebody drives it and it is not wrecked; dist = distance to the player (m). */
  update(lit: boolean, braking: boolean, dist: number): void {
    const on = NightLamps.on;
    const S = shared!;
    // shared materials: written by every vehicle with the same numbers (cheaper than a global hook, and always in step)
    S.beamMat.opacity = on * 0.9;
    S.tailMat.opacity = on * 0.55;
    S.glowMat.opacity = on;
    if (!lit || on < 0.02) {
      this.beam.visible = this.tail.visible = this.glow.visible = false;
      return;
    }
    const fx = Q.lightFxDist;
    this.glow.visible = dist < GLOW_DIST;
    this.beam.visible = dist < fx;
    this.tail.visible = dist < fx * 0.7;
    if (braking !== this.brakeOn) {
      this.brakeOn = braking;
      const c = braking ? TAIL_BRAKE : TAIL_DIM;
      for (let i = this.tailFirst; i < this.colors.length / 3; i++) this.colors.set([c.r, c.g, c.b], i * 3);
      (this.glowGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  dispose(): void {
    for (const o of [this.beam, this.tail, this.glow]) this.root.remove(o);
    this.glowGeo.dispose(); // the materials, textures and the beam plane are shared by all vehicles and stay
  }
}
