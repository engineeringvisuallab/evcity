import * as THREE from 'three';
import { Config } from '../core/Config';
import type { SkyUniforms } from '../water';

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
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float t = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(t, 0.55));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.18);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * Sky dome, sun (directional light with near-only shadows), hemisphere ambient light and distance fog.
 * Everything here lives in floating-origin LOCAL space and follows the camera.
 * STAGE 10 HOOK: day/night and weather change sunDir, colours and fog density here.
 */
export class Environment {
  readonly sunDir = new THREE.Vector3(0.55, 0.62, 0.45).normalize();
  readonly skyUniforms: SkyUniforms;
  private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh;
  private center = new THREE.Vector3();
  private right = new THREE.Vector3();
  private upv = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const horizon = new THREE.Color(0xbcd4ea);
    const zenith = new THREE.Color(0x3d78c4);

    scene.background = horizon;
    scene.fog = new THREE.FogExp2(horizon, Config.environment.fogDensity);

    const hemi = new THREE.HemisphereLight(0xbcd6ff, 0x6b5d45, 1.15);
    scene.add(hemi);

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
    scene.add(this.sun, this.sun.target);

    this.skyUniforms = {
      uHorizon: { value: horizon },
      uZenith: { value: zenith },
      uSunDir: { value: this.sunDir },
      uSunColor: { value: new THREE.Color(1.0, 0.85, 0.6) },
    };
    const sky = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: { ...this.skyUniforms },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), sky);
    this.sky.scale.setScalar(9000);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    scene.add(this.sky);
  }

  /** Call every frame after the camera moved. */
  update(camera: THREE.Object3D): void {
    const c = camera.position;
    this.sky.position.copy(c);

    // Shadow box follows the camera, snapped to shadow-map texels in light space (no shimmering).
    const texel = (2 * Config.environment.shadowExtent) / Config.environment.shadowMapSize;
    this.right.set(0, 1, 0).cross(this.sunDir).normalize();
    this.upv.copy(this.sunDir).cross(this.right);
    const a = Math.round(c.dot(this.right) / texel) * texel;
    const b = Math.round(c.dot(this.upv) / texel) * texel;
    const d = c.dot(this.sunDir);
    this.center.set(0, 0, 0).addScaledVector(this.right, a).addScaledVector(this.upv, b).addScaledVector(this.sunDir, d);
    this.sun.target.position.copy(this.center);
    this.sun.position.copy(this.center).addScaledVector(this.sunDir, 1200);
    this.sun.target.updateMatrixWorld();
  }
}
