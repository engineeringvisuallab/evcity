import * as THREE from 'three';

/**
 * RAIN SPLASH DROPLETS. Where a drop hits the ground it breaks into a few tiny droplets that jump up a hand's width and fall back
 * (a ballistic arc: v0 up, gravity 9.8 m/s2). Like the falling streaks this is drawn by the GPU only: every droplet is one instance
 * of a camera-facing quad, its position comes from a random seed and the clock in the vertex shader, wrapped in a box around the
 * camera. There is no CPU work per droplet.
 *
 * The only thing the GPU does not know is the height of the ground. WeatherSystem samples the terrain at three points near the
 * camera once per frame and passes a small tilted plane (height + slope in x and z); within ~14 m that is close enough that the
 * droplets sit on the ground. Roads and flat ground are fine; on very bumpy ground a droplet can float a few centimetres.
 *
 * Cost: 1 draw call, a few hundred tiny quads (medium) to ~1200 (high); none on the low quality profile.
 */
const VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uGround;   // x: ground height under the camera, y / z: slope in x / z (m per m)
uniform float uBox;
uniform float uPx;
uniform float uAlpha;
varying float vA;
varying vec2 vUv;
float h11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
void main() {
  // every droplet is alive for 0.42 s out of a 1.2 s cycle, then it jumps somewhere else
  float rate = 0.7 + 0.25 * aSeed.w;
  float cyc = uTime * rate + aSeed.z * 31.0;
  float k = floor(cyc);
  float ph = fract(cyc) * (1.0 / 0.35);          // 0..1 while alive, > 1 while resting
  float life = step(ph, 1.0);
  float a = ph * 0.42;                           // seconds since the impact
  float s1 = h11(aSeed.x * 91.7 + k * 7.13);
  float s2 = h11(aSeed.y * 57.3 + k * 3.71);
  float s3 = h11(aSeed.x * 13.1 + aSeed.y * 29.9 + k * 1.37);
  float s4 = h11(aSeed.y * 71.9 + k * 5.59);
  vec2 p0 = vec2(s1, s2) * uBox;                 // world-fixed impact point (wrapped around the camera below)
  vec2 rel = mod(p0 - uCam.xz + 0.5 * uBox, uBox) - 0.5 * uBox;
  float ang = s3 * 6.2831853;
  float sp = 0.25 + 0.7 * s4;                    // sideways speed (m/s)
  float v0 = 1.2 + 1.5 * s4;                     // upward speed (m/s)
  vec2 xz = uCam.xz + rel + vec2(cos(ang), sin(ang)) * sp * a;
  float gy = uGround.x + uGround.y * (xz.x - uCam.x) + uGround.z * (xz.y - uCam.z) + 0.02;
  float y = gy + max(0.0, v0 * a - 4.9 * a * a);
  vec3 P = vec3(xz.x, y, xz.y);
  float dist = length(P - cameraPosition);
  float size0 = 0.012 + 0.014 * s3;
  float size = max(size0, dist * uPx * 1.2);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 pos = P + right * (position.x * size) + up * (position.y * size * 1.5);
  float edge = 1.0 - smoothstep(0.55, 1.0, length(rel) / (0.5 * uBox));
  float fadeLife = sin(3.14159 * clamp(ph, 0.0, 1.0));
  vA = uAlpha * life * edge * fadeLife * min(1.0, size0 / size) * smoothstep(0.6, 2.0, dist);
  vUv = position.xy * 2.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float disc = 1.0 - smoothstep(0.55, 1.0, r);
  float shine = 1.0 + 0.8 * smoothstep(0.5, 0.0, length(vUv - vec2(-0.3, 0.35)));   // a small highlight on the water bead
  gl_FragColor = vec4(uColor * shine, clamp(vA * disc, 0.0, 0.85));
}
`;

export class RainSplash {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private geo: THREE.InstancedBufferGeometry;
  private max = 0;
  private u: Record<string, { value: unknown }>;
  private color = new THREE.Color();
  private white = new THREE.Color(1, 1, 1);

  constructor() {
    this.u = {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uGround: { value: new THREE.Vector3() },
      uBox: { value: 14 },
      uPx: { value: 0.001 },
      uAlpha: { value: 0.6 },
      uColor: { value: new THREE.Color(0.85, 0.9, 0.95) },
    };
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.u, transparent: true, depthWrite: false, fog: false });
    this.geo = new THREE.InstancedBufferGeometry();
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.visible = false;
  }

  /** (Re)build the instances: `max` droplets (0 = none). */
  build(max: number): void {
    if (max === this.max) return;
    this.max = max;
    this.geo.dispose();
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    const seed = new Float32Array(Math.max(1, max) * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = 0;
    this.geo = g;
    this.mesh.geometry = g;
  }

  /**
   * @param intensity 0..1 rain strength (already faded indoors / under water)  @param ground x = height under the camera, y / z = slopes,
   * or null when the ground is unknown / under the sea (no droplets)  @param light 0..1 scene brightness  @param horizon sky colour at the horizon
   */
  update(time: number, camera: THREE.PerspectiveCamera, pxHeight: number, intensity: number, ground: THREE.Vector3 | null, light: number, horizon: THREE.Color): void {
    const n = ground && this.max > 0 ? Math.round(this.max * Math.pow(Math.min(1, Math.max(0, intensity)), 1.1)) : 0;
    this.mesh.visible = n > 0 && intensity > 0.05;
    if (!this.mesh.visible || !ground) return;
    this.geo.instanceCount = n;
    const u = this.u;
    (u.uTime as { value: number }).value = time;
    (u.uCam.value as THREE.Vector3).copy(camera.position);
    (u.uGround.value as THREE.Vector3).copy(ground);
    (u.uPx as { value: number }).value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5)) / Math.max(1, pxHeight);
    (u.uAlpha as { value: number }).value = 0.35 + 0.4 * Math.min(1, intensity);
    this.color.copy(horizon).lerp(this.white, 0.5).multiplyScalar(0.3 + 0.7 * light);
    (u.uColor.value as THREE.Color).copy(this.color);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
