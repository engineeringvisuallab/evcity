import * as THREE from 'three';

/**
 * Procedural terrain shading (no texture files needed).
 * Built on MeshLambertMaterial so the sun, shadows and fog from three.js keep working;
 * the colour is injected in the fragment shader from HEIGHT and SLOPE:
 *   grass (flat) -> dry grass (high) -> rock (steep / alpine) -> snow (peaks)
 *   sand near sea level, wet dark seabed below it.
 * Detail noise is TRIPLANAR (sampled on 3 planes, blended by the normal) so steep cliffs do not stretch.
 * Real textures can later replace the noise by sampling with the same triplanar weights.
 *
 * Materials: one shared material per LOD, plus short-lived "fading" materials for new chunks
 * (dithered fade-in so chunks do not pop).
 */

const VERT_HEADER = /* glsl */ `
varying vec3 vWPos;
varying vec3 vWNrm;
attribute vec2 aRoad;
varying vec2 vRoad;
`;

const VERT_BODY = /* glsl */ `
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWNrm = normalize(mat3(modelMatrix) * normal);
vRoad = aRoad;
`;

const FRAG_HEADER = /* glsl */ `
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec2 vRoad;
uniform vec2 uOrigin;
uniform float uDebugLod;
uniform float uLod;
uniform float uFade;

float evcHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float evcNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = evcHash(i);
  float b = evcHash(i + vec2(1.0, 0.0));
  float c = evcHash(i + vec2(0.0, 1.0));
  float d = evcHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// Triplanar noise: sample on YZ, ZX and XY planes and blend by normal.
float evcTriNoise(vec3 p, vec3 n, float s) {
  vec3 w = pow(abs(n), vec3(4.0));
  w /= (w.x + w.y + w.z);
  return evcNoise(p.yz * s) * w.x + evcNoise(p.zx * s) * w.y + evcNoise(p.xy * s) * w.z;
}
float evcBayer4(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int idx = x + y * 4;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[idx] + 0.5) / 16.0;
}
`;

const FRAG_FADE = /* glsl */ `
if (uFade < 0.999) {
  if (evcBayer4(gl_FragCoord.xy) >= uFade) discard;
}
`;

const FRAG_COLOR = /* glsl */ `
{
  vec3 nrm = normalize(vWNrm);
  float h = vWPos.y;
  vec2 ap = vWPos.xz + uOrigin;           // absolute world x,z (stable when the floating origin moves)
  vec3 p3 = vec3(ap.x, h, ap.y);
  float nLow = evcNoise(ap * 0.004);
  float nMid = evcNoise(ap * 0.03);
  float nHi  = evcTriNoise(p3, nrm, 0.35);
  float nTri = evcTriNoise(p3, nrm, 0.08);
  float slope = 1.0 - nrm.y;

  vec3 grass = mix(vec3(0.20, 0.36, 0.10), vec3(0.34, 0.50, 0.16), nMid * 0.6 + nHi * 0.4);
  vec3 dry   = mix(vec3(0.46, 0.42, 0.20), vec3(0.38, 0.36, 0.18), nMid);
  vec3 rock  = mix(vec3(0.34, 0.32, 0.30), vec3(0.55, 0.51, 0.46), nTri * 0.6 + nHi * 0.4);
  vec3 sand  = mix(vec3(0.72, 0.65, 0.45), vec3(0.80, 0.74, 0.55), nHi);
  vec3 snow  = vec3(0.93, 0.95, 0.98);
  vec3 wet   = vec3(0.30, 0.27, 0.19);

  vec3 col = mix(grass, dry, smoothstep(120.0, 300.0, h + (nLow - 0.5) * 80.0));
  float rockAmt = smoothstep(0.10, 0.26, slope + (nTri - 0.5) * 0.10);
  rockAmt = max(rockAmt, smoothstep(250.0, 420.0, h + (nLow - 0.5) * 120.0) * 0.7);
  col = mix(col, rock, rockAmt);

  float sandAmt = 1.0 - smoothstep(1.5, 7.0 + nMid * 3.0, h);
  col = mix(col, sand, sandAmt * (1.0 - rockAmt * 0.6));
  col = mix(col, wet, clamp(0.5 - h * 0.25, 0.0, 1.0));

  float snowAmt = smoothstep(340.0, 400.0, h + (nLow - 0.5) * 60.0) * (1.0 - smoothstep(0.30, 0.55, slope));
  col = mix(col, snow, snowAmt);

  // STAGE 6: concrete road surface and gravel shoulder. Far LODs use this colour; LOD0/1 also get detailed ribbons.
  col = mix(col, vec3(0.43, 0.40, 0.34), vRoad.y * 0.9);
  col = mix(col, vec3(0.45, 0.46, 0.47) + nHi * 0.025, vRoad.x);

  col = pow(col, vec3(2.2));              // authored in sRGB-ish values, shader works in linear
  diffuseColor.rgb = col;

  if (uDebugLod > 0.5) {
    vec3 lc = uLod < 0.5 ? vec3(0.1, 0.8, 0.1) : uLod < 1.5 ? vec3(0.9, 0.8, 0.1) : uLod < 2.5 ? vec3(0.95, 0.4, 0.05) : vec3(0.4, 0.2, 0.9);
    diffuseColor.rgb = mix(diffuseColor.rgb, lc, 0.7);
  }
}
`;

export class TerrainMaterials {
  /** Absolute world x,z of the floating origin (updated on origin:shift). */
  private uOrigin = { value: new THREE.Vector2() };
  private uDebugLod = { value: 0 };
  private wireframe = false;
  private shared: THREE.MeshLambertMaterial[] = [];
  private all = new Set<THREE.MeshLambertMaterial>();

  constructor(lodCount: number) {
    for (let lod = 0; lod < lodCount; lod++) this.shared.push(this.make(lod, { value: 1 }));
  }

  getShared(lod: number): THREE.MeshLambertMaterial {
    return this.shared[lod];
  }

  /** A material with its own fade uniform (0 = invisible, 1 = fully drawn). Dispose with `disposeFading`. */
  createFading(lod: number): { material: THREE.MeshLambertMaterial; fade: { value: number } } {
    const fade = { value: 0 };
    return { material: this.make(lod, fade), fade };
  }

  disposeFading(m: THREE.Material): void {
    this.all.delete(m as THREE.MeshLambertMaterial);
    m.dispose();
  }

  setOrigin(x: number, z: number): void {
    this.uOrigin.value.set(x, z);
  }

  setWireframe(on: boolean): void {
    this.wireframe = on;
    for (const m of this.all) m.wireframe = on;
  }

  setLodColors(on: boolean): void {
    this.uDebugLod.value = on ? 1 : 0;
  }

  get isWireframe(): boolean {
    return this.wireframe;
  }
  get isLodColors(): boolean {
    return this.uDebugLod.value > 0.5;
  }

  dispose(): void {
    for (const m of this.all) m.dispose();
    this.all.clear();
  }

  private make(lod: number, uFade: { value: number }): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff, wireframe: this.wireframe });
    const uLod = { value: lod };
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uOrigin = this.uOrigin;
      shader.uniforms.uDebugLod = this.uDebugLod;
      shader.uniforms.uLod = uLod;
      shader.uniforms.uFade = uFade;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_HEADER)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_HEADER)
        .replace('void main() {', 'void main() {\n' + FRAG_FADE)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR);
    };
    m.customProgramCacheKey = () => 'evc-terrain-v4-road-concrete';
    this.all.add(m);
    return m;
  }
}
