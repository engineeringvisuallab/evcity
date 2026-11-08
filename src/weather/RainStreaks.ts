import * as THREE from 'three';

/**
 * FALLING RAIN as thin streaks, drawn by the GPU only: every streak is one instance of a tiny quad (4 vertices) and its position is
 * computed in the vertex shader from a random seed and the clock, wrapped in a box around the camera (so the rain is everywhere
 * around you and never needs a CPU update). Two layers: NEAR (small box, many thin bright streaks) and FAR (big box, few long faint
 * streaks, which gives the grey "curtain" in the distance). The streaks are depth tested, so buildings and trees hide them.
 *
 * Cost: 2 draw calls, at most a few thousand tiny quads. The number of instances follows the rain strength and the quality.
 */
const VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uFall;     // world velocity of the drops (m/s)
uniform vec3 uRel;      // velocity of the drops relative to the camera: the streaks lean when you drive fast
uniform vec3 uBox;
uniform float uLen;
uniform float uWidth;
uniform float uPx;      // world size of one pixel per metre of distance
uniform float uAlpha;
varying float vA;
varying float vX;
varying float vY;
void main() {
  vec3 hb = uBox * vec3(0.5, 0.35, 0.5);
  // big drops fall faster than small ones (0.85 .. 1.15 x), like real rain
  float spd = 0.85 + 0.3 * fract(aSeed.w * 7.31 + aSeed.x * 3.7);
  vec3 p = aSeed.xyz * uBox + uFall * spd * uTime;
  vec3 rel = mod(p - uCam + hb, uBox) - hb;      // wrapped around the camera
  vec3 P = uCam + rel;
  vec3 d = normalize(uRel);
  vec3 toP = P - cameraPosition;
  float dist = length(toP);
  vec3 v = toP / max(dist, 0.001);
  vec3 side = cross(d, v);
  float sl = length(side);
  side = sl > 0.0001 ? side / sl : vec3(1.0, 0.0, 0.0);
  // a few percent of the drops are big and fat, most are small and thin
  float big = step(0.93, fract(aSeed.w * 13.7 + aSeed.y * 5.1));
  float len = uLen * (0.7 + 0.6 * aSeed.w) * spd * (1.0 + 0.35 * big);
  float pxw = dist * uPx;
  float w0 = uWidth * (0.7 + 0.5 * aSeed.z) * (1.0 + 1.3 * big);
  float w = max(w0, pxw * 1.7);
  vec3 pos = P + d * (position.y * len) + side * (position.x * w);
  float fr = length(rel.xz) / (0.5 * uBox.x);
  float fy = abs(rel.y - 0.15 * uBox.y) / (0.5 * uBox.y);
  float fade = (1.0 - smoothstep(0.55, 1.0, fr)) * (1.0 - smoothstep(0.7, 1.0, fy));
  vA = uAlpha * fade * smoothstep(0.7, 2.8, dist) * (0.45 + 0.55 * aSeed.w) * clamp(sqrt(w0 / w) * 1.6, 0.0, 1.0) * (1.0 + 0.5 * big);
  vX = position.x;
  vY = position.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}
`;

// A real drop in the air is a streak (it moves during the exposure): it fades in thin and faint at the tail, is brightest and
// fattest just behind the head (the water bead itself) and ends in a round tip. The core of the streak is brighter than its rim.
const FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
varying float vX;
varying float vY;
void main() {
  float wy = mix(0.55, 1.0, smoothstep(0.0, 0.7, vY));
  float ax = abs(vX) * 2.0 / wy;
  float e = 1.0 - smoothstep(0.35, 1.0, ax);
  float core = 1.0 - smoothstep(0.0, 0.8, ax);
  float tail = smoothstep(0.0, 0.5, vY);
  float tip = 1.0 - smoothstep(0.93, 1.0, vY);
  float bead = smoothstep(0.72, 0.9, vY);
  float a = vA * e * (0.6 + 0.4 * core) * (0.4 + 0.6 * tail) * tip * (1.0 + 0.7 * bead);
  gl_FragColor = vec4(uColor * (1.0 + 0.35 * bead), clamp(a, 0.0, 0.9));
}
`;

export interface StreakLayerSpec {
  max: number;
  box: THREE.Vector3;
  len: number;
  width: number;
  alpha: number;
}

const NEAR: Omit<StreakLayerSpec, 'max'> = { box: new THREE.Vector3(26, 18, 26), len: 0.9, width: 0.009, alpha: 0.85 };
const FAR: Omit<StreakLayerSpec, 'max'> = { box: new THREE.Vector3(90, 50, 90), len: 2.6, width: 0.03, alpha: 0.4 };

class Layer {
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.ShaderMaterial;
  private geo: THREE.InstancedBufferGeometry;
  private max = 0;
  private u: Record<string, { value: unknown }>;

  constructor(private spec: Omit<StreakLayerSpec, 'max'>) {
    this.u = {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uFall: { value: new THREE.Vector3(0, -11, 0) },
      uRel: { value: new THREE.Vector3(0, -11, 0) },
      uBox: { value: spec.box },
      uLen: { value: spec.len },
      uWidth: { value: spec.width },
      uPx: { value: 0.001 },
      uAlpha: { value: spec.alpha },
      uColor: { value: new THREE.Color(0.8, 0.86, 0.92) },
    };
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.u, transparent: true, depthWrite: false, fog: false });
    this.geo = new THREE.InstancedBufferGeometry();
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
  }

  /** (Re)build the instances: `max` streaks. */
  build(max: number): void {
    if (max === this.max) return;
    this.max = max;
    this.geo.dispose();
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0], 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    const seed = new Float32Array(max * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = 0;
    this.geo = g;
    this.mesh.geometry = g;
  }

  get capacity(): number {
    return this.max;
  }

  set(count: number, time: number, cam: THREE.Vector3, fall: THREE.Vector3, rel: THREE.Vector3, px: number, alpha: number, color: THREE.Color, lenK: number): void {
    const n = Math.min(this.max, Math.round(count));
    this.mesh.visible = n > 0 && alpha > 0.002;
    if (!this.mesh.visible) return;
    this.geo.instanceCount = n;
    const u = this.u;
    (u.uTime as { value: number }).value = time;
    (u.uCam.value as THREE.Vector3).copy(cam);
    (u.uFall.value as THREE.Vector3).copy(fall);
    (u.uRel.value as THREE.Vector3).copy(rel);
    (u.uPx as { value: number }).value = px;
    (u.uAlpha as { value: number }).value = this.spec.alpha * alpha;
    (u.uLen as { value: number }).value = this.spec.len * lenK;
    (u.uColor.value as THREE.Color).copy(color);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

export class RainStreaks {
  readonly group = new THREE.Group();
  private near = new Layer(NEAR);
  private far = new Layer(FAR);
  private fall = new THREE.Vector3();
  private rel = new THREE.Vector3();
  private camVel = new THREE.Vector3();
  private lastCam = new THREE.Vector3();
  private haveLast = false;
  private color = new THREE.Color();
  private white = new THREE.Color(1, 1, 1);

  constructor() {
    this.group.add(this.near.mesh, this.far.mesh);
    this.group.visible = false;
  }

  /** Quality: how many streaks at full rain (near layer / far layer). */
  setCounts(near: number, far: number): void {
    this.near.build(near);
    this.far.build(far);
  }

  /**
   * @param intensity 0..1 rain strength  @param wind 0..1  @param windDir radians  @param amount 0..1 (shelter / under water: fades the rain out)
   * @param light 0..1 scene brightness  @param horizon colour of the sky at the horizon (the rain is lit by it)
   */
  update(dt: number, time: number, camera: THREE.PerspectiveCamera, pxHeight: number, intensity: number, wind: number, windDir: number, amount: number, light: number, horizon: THREE.Color): void {
    const i = Math.min(1, Math.max(0, intensity)) * amount;
    this.group.visible = i > 0.01;
    if (!this.group.visible) {
      this.haveLast = false;
      return;
    }
    const cam = camera.position;
    if (this.haveLast && dt > 0) {
      this.camVel.copy(cam).sub(this.lastCam).multiplyScalar(1 / dt);
      if (this.camVel.lengthSq() > 40 * 40) this.camVel.setLength(0); // a floating-origin jump / teleport is not a speed
      this.camVel.clampLength(0, 30);
    } else this.camVel.set(0, 0, 0);
    this.lastCam.copy(cam);
    this.haveLast = true;

    const speed = 10 + 4 * i;
    const wx = Math.cos(windDir) * wind * 6;
    const wz = Math.sin(windDir) * wind * 6;
    this.fall.set(wx, -speed, wz);
    this.rel.copy(this.fall).sub(this.camVel);
    const px = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5)) / Math.max(1, pxHeight);
    // the rain is a light grey-blue, lit like the sky; darker at night
    this.color.copy(horizon).lerp(this.white, 0.55).multiplyScalar(0.35 + 0.65 * light);
    const k = Math.pow(i, 0.75);
    const a = 0.55 + 0.45 * i;
    this.near.set(this.near.capacity * k, time, cam, this.fall, this.rel, px, a, this.color, 0.8 + 0.5 * i);
    this.far.set(this.far.capacity * k, time, cam, this.fall, this.rel, px, a, this.color, 0.8 + 0.5 * i);
  }

  dispose(): void {
    this.near.dispose();
    this.far.dispose();
  }
}
