import * as THREE from 'three';
import { Config } from '../core/Config';
import type { SkyUniforms } from '../water';
import { DayNight } from './DayNight';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;   // always at the far plane
}
`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uGlow;
uniform float uNight;
varying vec3 vDir;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec3 d = normalize(vDir);
  float t = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(t, 0.55));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * uGlow);

  if (uNight > 0.001 && d.y > 0.0) {
    // stars: one random star per cell of a 3D grid on the sky, twinkling slowly; fade out towards the horizon
    vec3 p = d * 260.0;
    vec3 ip = floor(p);
    float h = hash31(ip);
    float star = step(0.9935, h);
    vec3 f = fract(p) - 0.5;
    star *= smoothstep(0.5, 0.0, length(f));
    float size = 0.5 + 0.5 * hash31(ip + 7.7);
    col += vec3(0.85, 0.9, 1.0) * star * size * 1.6 * uNight * smoothstep(0.02, 0.25, d.y);
    // moon: opposite the sun
    vec3 m = -uSunDir;
    float md = max(dot(d, m), 0.0);
    col += vec3(0.82, 0.88, 1.0) * (smoothstep(0.99955, 0.99975, md) * 1.3 + pow(md, 60.0) * 0.1) * uNight;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * Sky dome, sun (directional light with near-only shadows), hemisphere ambient light and distance fog.
 * Everything here lives in floating-origin LOCAL space and follows the camera.
 * DAY / NIGHT: DayNight.ts holds the clock and the whole look of every moment of the day; update() applies it here
 * (sun / moon direction and colour, sky colours, stars, ambient light, fog). The night mode can be switched off (toggleNight()).
 */
export class Environment {
  /** Direction towards the sun (updated every frame; the water and the sky shader share this vector). */
  readonly sunDir = new THREE.Vector3(0.55, 0.62, 0.45).normalize();
  readonly skyUniforms: SkyUniforms;
  readonly dayNight = new DayNight();
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private fog: THREE.FogExp2;
  private horizon = new THREE.Color(0xbcd4ea);
  private center = new THREE.Vector3();
  private right = new THREE.Vector3();
  private upv = new THREE.Vector3();
  private lightDir = new THREE.Vector3(0.55, 0.62, 0.45).normalize();

  constructor(scene: THREE.Scene) {
    const horizon = this.horizon;
    const zenith = new THREE.Color(0x3d78c4);

    scene.background = horizon;
    this.fog = new THREE.FogExp2(horizon, Config.environment.fogDensity);
    scene.fog = this.fog;

    this.hemi = new THREE.HemisphereLight(0xbcd6ff, 0x6b5d45, 1.15);
    scene.add(this.hemi);

    const E = Config.environment;
    this.sun = new THREE.DirectionalLight(0xfff0d8, 3.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(E.shadowMapSize, E.shadowMapSize);
    const cam = this.sun.shadow.camera;
    cam.left = -E.shadowExtent;
    cam.right = E.shadowExtent;
    cam.top = E.shadowExtent;
    cam.bottom = -E.shadowExtent;
    cam.near = 10;
    cam.far = 2800;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 1.0;
    this.sun.shadow.radius = 2.5;
    scene.add(this.sun, this.sun.target);

    this.skyUniforms = {
      uHorizon: { value: horizon },
      uZenith: { value: zenith },
      uSunDir: { value: this.sunDir },
      uSunColor: { value: new THREE.Color(1.0, 0.85, 0.6) },
    };
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: { ...this.skyUniforms, uGlow: { value: 0.18 }, uNight: { value: 0 } },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.skyMat);
    this.sky.scale.setScalar(9000);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    scene.add(this.sky);

    this.applyState(); // the very first frame already shows the right time of day
  }

  /** 0 = day .. 1 = full night: how much the stars show (the street lamps use `lampOn`). */
  get night(): number {
    return this.dayNight.state.night;
  }

  /** 0 = lamps off .. 1 = lamps fully on. */
  get lampOn(): number {
    return this.dayNight.state.lampOn;
  }

  /** Night mode on / off (returns the new setting). */
  toggleNight(): boolean {
    return this.dayNight.toggle();
  }

  /** Copy the day/night state into the sky, the lights and the fog. */
  private applyState(): void {
    const s = this.dayNight.state;
    this.horizon.copy(s.horizon); // shared with scene.background and the water shader
    (this.skyUniforms.uZenith.value as THREE.Color).copy(s.zenith);
    (this.skyUniforms.uSunColor.value as THREE.Color).copy(s.sunColor);
    this.sunDir.copy(s.sunDir);
    this.skyMat.uniforms.uGlow.value = s.glow;
    this.skyMat.uniforms.uNight.value = s.night;
    this.fog.color.copy(s.horizon);
    this.hemi.color.copy(s.hemiSky);
    this.hemi.groundColor.copy(s.hemiGround);
    this.hemi.intensity = s.hemiIntensity;
    this.sun.color.copy(s.lightColor);
    this.sun.intensity = s.lightIntensity;
    this.lightDir.copy(s.lightDir);
  }

  /** Call every frame after the camera moved. */
  update(camera: THREE.Object3D, dt = 0): void {
    this.dayNight.update(dt);
    this.applyState();
    const c = camera.position;
    this.sky.position.copy(c);

    // Shadow box follows the camera, snapped to shadow-map texels in light space (no shimmering).
    const texel = (2 * Config.environment.shadowExtent) / Config.environment.shadowMapSize;
    this.right.set(0, 1, 0).cross(this.lightDir).normalize();
    this.upv.copy(this.lightDir).cross(this.right);
    const a = Math.round(c.dot(this.right) / texel) * texel;
    const b = Math.round(c.dot(this.upv) / texel) * texel;
    const d = c.dot(this.lightDir);
    this.center.set(0, 0, 0).addScaledVector(this.right, a).addScaledVector(this.upv, b).addScaledVector(this.lightDir, d);
    this.sun.target.position.copy(this.center);
    this.sun.position.copy(this.center).addScaledVector(this.lightDir, 1200);
    this.sun.target.updateMatrixWorld();
  }
}
