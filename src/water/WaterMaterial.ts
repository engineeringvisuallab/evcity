import * as THREE from 'three';

const VERT = /* glsl */ `
attribute float aDepth;
attribute vec2 aFlow;
varying float vDepth;
varying vec2 vFlow;
varying vec3 vWPos;
varying vec3 vNrm;
#include <fog_pars_vertex>
void main() {
  vDepth = aDepth;
  vFlow = aFlow;
  vNrm = normal;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec2 uOrigin;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uHorizon;
uniform vec3 uZenith;
varying float vDepth;
varying vec2 vFlow;
varying vec3 vWPos;
varying vec3 vNrm;
#include <fog_pars_fragment>

float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 ap = vWPos.xz + uOrigin;            // absolute world position -> stable ripples when the origin moves
  vec3 n0 = normalize(vNrm);
  float speed = length(vFlow);

  // Ripples scroll with the flow (rivers) or slowly with the wind (lakes, sea).
  vec2 drift = vFlow * uTime * 0.9 + vec2(0.6, 0.3) * uTime * 0.35;
  float e = 0.3;
  vec2 p1 = ap * 0.16 - drift;
  float a0 = wNoise(p1);
  vec2 g1 = vec2(wNoise(p1 + vec2(e, 0.0)) - a0, wNoise(p1 + vec2(0.0, e)) - a0) / e;
  vec2 p2 = ap * 0.55 - drift * 1.7 + 17.0;
  float b0 = wNoise(p2);
  vec2 g2 = vec2(wNoise(p2 + vec2(e, 0.0)) - b0, wNoise(p2 + vec2(0.0, e)) - b0) / e;
  float rip = 0.22 + clamp(speed * 0.07, 0.0, 0.45);
  vec2 g = (g1 * 0.5 + g2 * 0.25) * rip;
  vec3 N = normalize(vec3(n0.x - g.x, n0.y, n0.z - g.y));

  vec3 V = normalize(cameraPosition - vWPos);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.55));
  float s = max(dot(R, uSunDir), 0.0);
  sky += uSunColor * (pow(s, 350.0) * 3.0 + pow(s, 28.0) * 0.25);

  float dd = max(vDepth, 0.0);
  vec3 shallow = vec3(0.04, 0.22, 0.24);
  vec3 deep = vec3(0.004, 0.03, 0.08);
  vec3 body = mix(shallow, deep, 1.0 - exp(-dd * 0.2));
  vec3 col = mix(body, sky, fres * 0.9 + 0.06);

  // Foam: along the shore, on steep water (waterfalls, cascades) and on fast water
  float fn = wNoise(ap * 1.3 - drift * 2.5) * 0.6 + wNoise(ap * 3.1 + drift) * 0.4;
  float steep = 1.0 - n0.y;
  float shore = (1.0 - smoothstep(0.0, 0.8, dd)) * smoothstep(0.35, 0.8, fn);
  float fall = smoothstep(0.12, 0.45, steep) * smoothstep(0.25, 0.65, fn + 0.25);
  float fast = smoothstep(2.5, 6.0, speed) * smoothstep(0.55, 0.85, fn) * 0.6;
  float foam = clamp(shore * 0.8 + fall + fast, 0.0, 1.0);
  col = mix(col, vec3(0.85, 0.9, 0.95), foam);

  float alpha = mix(0.45, 0.95, 1.0 - exp(-dd * 0.5));
  alpha = max(alpha, foam * 0.95);
  alpha *= smoothstep(-0.05, 0.3, vDepth);

  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** Uniforms shared with the sky so water reflects the same sky colours and sun. */
export interface SkyUniforms {
  uHorizon: { value: THREE.Color };
  uZenith: { value: THREE.Color };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
}

/** One water material for rivers, lakes and sea: animated ripples, fresnel sky reflection, sun glint, foam, depth colour. */
export class WaterMaterial {
  readonly material: THREE.ShaderMaterial;
  private uTime = { value: 0 };
  private uOrigin = { value: new THREE.Vector2() };

  constructor(sky: SkyUniforms) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: this.uTime,
          uOrigin: this.uOrigin,
          uSunDir: sky.uSunDir,
          uSunColor: sky.uSunColor,
          uHorizon: sky.uHorizon,
          uZenith: sky.uZenith,
        },
      ]),
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    // UniformsUtils.merge clones values; re-bind our shared uniform objects so updates reach the shader.
    const u = this.material.uniforms;
    u.uTime = this.uTime;
    u.uOrigin = this.uOrigin;
    u.uSunDir = sky.uSunDir;
    u.uSunColor = sky.uSunColor;
    u.uHorizon = sky.uHorizon;
    u.uZenith = sky.uZenith;
  }

  update(time: number, originX: number, originZ: number): void {
    this.uTime.value = time;
    this.uOrigin.value.set(originX, originZ);
  }

  dispose(): void {
    this.material.dispose();
  }
}
