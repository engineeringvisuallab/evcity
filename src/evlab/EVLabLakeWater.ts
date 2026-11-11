// EVLab Step 13: the water of the lake that rings the island (one flat plane, one shader, no vertex work, no extra render pass).
//  - waves: 2 / 4 / 5 travelling sine waves (wavelength 14 m down to 0.9 m) whose slopes tilt the normal. The wave speed follows deep-water physics (w = sqrt(g k)).
//  - fresnel: the angle between eye and surface decides how much sky (and sun glint) the water mirrors and how much of its own green-blue body colour shows.
//  - depth: shallow along the quay and the bank (lighter, more see-through), deeper in the middle of the 50 m wide band.
//  - ripples: rings run out from the quay wall of the island and the outer bank (detail >= 1) and from the sides of the four bridges (detail 2); a thin foam line plays at the quay.
//  - day / night: sky colours and body colour follow `setNight`, the sun / moon glint follows `setSun(hours)`.
// Detail 0 / 1 / 2 = Q.evlabWater (low / medium / high). The same wave table is in JS (`lakeSlope`, for the tests) and in the shader, so they cannot drift apart.
// Building-local coordinates: the plane's vertices ARE building-local (the grounds group is not rotated), so the waves stand still when the floating origin moves.
import * as THREE from 'three';
import { BRIDGES, ISLAND, LAKE, WATER_Y, sdRR } from './EVLabCampus';

/** Travelling waves: wavelength (m), amplitude (m), direction (radians from +x towards +z). Slope amplitude amp * 2 pi / len is about 0.03 for every one. */
export const LAKE_WAVES: ReadonlyArray<{ len: number; amp: number; dir: number }> = [
  { len: 14, amp: 0.07, dir: 0.5 },
  { len: 7, amp: 0.035, dir: -0.6 },
  { len: 3.6, amp: 0.018, dir: 1.3 },
  { len: 1.8, amp: 0.009, dir: -1.9 },
  { len: 0.9, amp: 0.0045, dir: 2.4 },
];
export const LAKE_G = 9.81;
/** How many of the waves run at each detail level. */
export const WAVES_AT = [2, 4, 5] as const;
/** Ripple rings that run out from the quay / bank and from the bridges: wavelength (m), slope amplitude, speed (rad/s), how fast they die out with distance (1/m). */
export const RIPPLE = { len: 3.2, slope: 0.1, speed: 2.0, decay: 0.3, reach: 14 } as const;

const wk = (len: number): number => (2 * Math.PI) / len;
const ww = (len: number): number => Math.sqrt(LAKE_G * wk(len)) * 0.8;

/** Water surface slope (d height / dx, d height / dz) of the waves only (no ripples) at building-local (x, z) and time t, for a detail level. */
export function lakeSlope(x: number, z: number, t: number, detail: 0 | 1 | 2): [number, number] {
  let sx = 0, sz = 0;
  const n = WAVES_AT[detail];
  for (let i = 0; i < n; i++) {
    const w = LAKE_WAVES[i], k = wk(w.len), dx = Math.cos(w.dir), dz = Math.sin(w.dir);
    const c = w.amp * k * Math.cos(k * (dx * x + dz * z) - ww(w.len) * t);
    sx += dx * c; sz += dz * c;
  }
  return [sx, sz];
}

/** Distance from (x, z) to the nearest shore of the lake (the quay of the island or the outer bank), m; negative = not in the lake. */
export function shoreDist(x: number, z: number): number {
  return Math.min(sdRR(x, z, ISLAND), -sdRR(x, z, LAKE));
}

/** Slope strength of a ripple ring `d` metres from its source at time t (the shader uses the same formula), without the slow pulse. */
export function rippleSlope(d: number, t: number): number {
  if (d <= 0) return 0;
  const k = wk(RIPPLE.len);
  return RIPPLE.slope * Math.cos(k * d - RIPPLE.speed * t) * Math.exp(-d * RIPPLE.decay) * Math.min(1, d / 0.8);
}

/** Sun (day) or moon (night) direction in the world for a clock hour: rises in the east at 6, is in the south at 12, sets in the west at 18. `power` = 0..1 how strong its glint is. */
export function sunFromHours(h: number): { dir: [number, number, number]; power: number } {
  const hh = ((h % 24) + 24) % 24;
  const a = (Math.PI * (hh - 6)) / 12;
  const e = Math.sin(a);
  if (hh > 6 && hh < 18 && e > 0.04) {
    const ce = Math.cos(Math.asin(Math.min(1, e)));
    const d: [number, number, number] = [Math.cos(a) * ce, e, Math.sin(a) * ce];
    return { dir: d, power: Math.min(1, e * 3.5) };
  }
  const m = Math.hypot(0.3, 0.6, -0.5);
  return { dir: [0.3 / m, 0.6 / m, -0.5 / m], power: 0.18 }; // a dim moon glint
}

const waveGlsl = (): string => LAKE_WAVES.map((w, i) => {
  const k = wk(w.len);
  return `  if (n > ${i}) sl += vec2(${Math.cos(w.dir).toFixed(5)}, ${Math.sin(w.dir).toFixed(5)}) * ${(w.amp * k).toFixed(5)} * cos(${k.toFixed(5)} * dot(vec2(${Math.cos(w.dir).toFixed(5)}, ${Math.sin(w.dir).toFixed(5)}), p) - ${ww(w.len).toFixed(5)} * t);`;
}).join('\n');

const VERT = /* glsl */ `
varying vec3 vLocal;
varying vec3 vW;
#include <fog_pars_vertex>
void main() {
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform float uDetail;
uniform float uSunPower;
uniform vec3 uSun;
uniform vec4 uIsl;
uniform vec4 uLake;
uniform vec2 uR;
uniform vec4 uBr[4];
varying vec3 vLocal;
varying vec3 vW;
#include <fog_pars_fragment>

float sdRR(vec2 p, vec4 s, float r) {
  vec2 q = abs(p - s.xy) - s.zw;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float shoreD(vec2 p) { return min(sdRR(p, uIsl, uR.x), -sdRR(p, uLake, uR.y)); }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }

void main() {
  vec2 p = vLocal.xz;
  float t = uTime;
  int n = uDetail < 0.5 ? 2 : (uDetail < 1.5 ? 4 : 5);
  vec2 sl = vec2(0.0);
${waveGlsl()}

  float shore = shoreD(p);
  float foam = 0.0;
  if (uDetail > 0.5) {
    // rings running out from the quay / the bank, pulsing slowly so they do not look like a fixed pattern
    float e = 0.6;
    vec2 g = vec2(shoreD(p + vec2(e, 0.0)) - shoreD(p - vec2(e, 0.0)), shoreD(p + vec2(0.0, e)) - shoreD(p - vec2(0.0, e)));
    g = g / (length(g) + 1e-4);
    float k = ${wk(RIPPLE.len).toFixed(5)};
    float env = exp(-shore * ${RIPPLE.decay.toFixed(3)}) * min(1.0, shore / 0.8) * (0.65 + 0.35 * sin(t * 0.45 + shore * 0.15));
    sl += g * ${RIPPLE.slope.toFixed(3)} * cos(k * shore - ${RIPPLE.speed.toFixed(3)} * t) * env;
    float dq = sdRR(p, uIsl, uR.x);
    foam = (1.0 - smoothstep(0.1, 0.9, dq)) * (0.45 + 0.55 * sin(t * 1.6 + dot(p, vec2(0.9, 0.7)))) * 0.3;
  }
  if (uDetail > 1.5) {
    float k = ${wk(RIPPLE.len).toFixed(5)};
    for (int i = 0; i < 4; i++) {
      vec2 c = uBr[i].xy, h = uBr[i].zw;
      vec2 q = p - clamp(p, c - h, c + h);
      float db = length(q);
      if (db > 0.01 && db < ${RIPPLE.reach.toFixed(1)}) {
        vec2 g = q / db;
        float env = exp(-db * ${RIPPLE.decay.toFixed(3)}) * min(1.0, db / 0.8) * (0.6 + 0.4 * sin(t * 0.5 + db * 0.2 + float(i)));
        sl += g * ${(RIPPLE.slope * 0.8).toFixed(3)} * cos(k * db - ${RIPPLE.speed.toFixed(3)} * t + float(i) * 1.7) * env;
        foam += (1.0 - smoothstep(0.1, 0.7, db)) * (0.4 + 0.6 * sin(t * 1.9 + dot(p, vec2(0.8, 0.6)) + float(i))) * 0.22;
      }
    }
  }

  vec3 N = normalize(vec3(-sl.x, 1.0, -sl.y));
  vec3 V = normalize(cameraPosition - vW);
  float cosI = max(dot(N, V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosI, 5.0);
  F = clamp(F * 1.15 + 0.03, 0.0, 1.0);

  // what the water mirrors: a sky gradient (day / night) and the glint of the sun (or the moon)
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 hor = mix(lin(vec3(0.72, 0.84, 0.95)), lin(vec3(0.05, 0.08, 0.14)), uNight);
  vec3 zen = mix(lin(vec3(0.28, 0.50, 0.82)), lin(vec3(0.01, 0.02, 0.06)), uNight);
  vec3 sky = mix(hor, zen, pow(clamp(R.y, 0.0, 1.0), 0.55));
  float sd = max(dot(R, normalize(uSun)), 0.0);
  vec3 glint = vec3(1.0, 0.95, 0.82) * (pow(sd, 700.0) * 6.0 + pow(sd, 60.0) * 0.35) * uSunPower;

  // the body of the water: lighter and clearer in the shallows along the shore, deeper and darker in the middle
  float dep = smoothstep(0.0, 9.0, shore);
  vec3 body = mix(lin(vec3(0.30, 0.72, 0.68)), lin(vec3(0.12, 0.44, 0.56)), dep);
  body *= mix(1.0, 0.22, uNight);
  body = mix(body, body * vec3(0.7, 0.85, 1.2), uNight);

  vec3 col = mix(body, sky, F) + glint + vec3(0.95) * foam * (1.0 - uNight * 0.6);
  float a = clamp(mix(0.6, 0.9, dep) + F * 0.35 + foam * 0.5, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export interface LakeWater {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  /** 0 (day) .. 1 (night). */
  setNight(n: number): void;
  /** Clock hour: moves the sun / moon glint. */
  setSun(hours: number): void;
  /** 0 / 1 / 2 = Q.evlabWater. */
  setDetail(d: number): void;
  update(t: number): void;
  dispose(): void;
}

/** The lake plane at the water level, covering the lake rectangle (the terrain hides it everywhere except in the carved bed). */
export function buildLakeWater(): LakeWater {
  const w = LAKE.hx * 2, d = LAKE.hz * 2;
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  geo.translate(LAKE.cx, WATER_Y, LAKE.cz); // vertices are building-local
  const br = BRIDGES.map((b) => (b.axis === 'z' ? new THREE.Vector4(b.across, (b.from + b.to) / 2, b.w / 2, (b.to - b.from) / 2) : new THREE.Vector4((b.from + b.to) / 2, b.across, (b.to - b.from) / 2, b.w / 2)));
  const sun = sunFromHours(12);
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]);
  Object.assign(uniforms, {
    uTime: { value: 0 }, uNight: { value: 0 }, uDetail: { value: 1 }, uSunPower: { value: sun.power },
    uSun: { value: new THREE.Vector3(...sun.dir) },
    uIsl: { value: new THREE.Vector4(ISLAND.cx, ISLAND.cz, ISLAND.hx - ISLAND.r, ISLAND.hz - ISLAND.r) },
    uLake: { value: new THREE.Vector4(LAKE.cx, LAKE.cz, LAKE.hx - LAKE.r, LAKE.hz - LAKE.r) },
    uR: { value: new THREE.Vector2(ISLAND.r, LAKE.r) },
    uBr: { value: br },
  });
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, fog: true });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'EVLabLake';
  mesh.frustumCulled = false;
  const u = material.uniforms;
  return {
    mesh, material,
    setNight: (n) => { u.uNight.value = n; },
    setSun: (h) => { const s = sunFromHours(h); (u.uSun.value as THREE.Vector3).set(...s.dir); u.uSunPower.value = s.power; },
    setDetail: (dd) => { u.uDetail.value = Math.max(0, Math.min(2, Math.round(dd))); },
    update: (t) => { u.uTime.value = t; },
    dispose: () => { geo.dispose(); material.dispose(); },
  };
}
