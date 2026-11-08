import * as THREE from 'three';

/**
 * WET GROUND. One set of shared uniforms (WeatherSystem writes them every frame) and one shader patch that any
 * MeshLambertMaterial can use (roads, terrain, bridges, ...). The patch works after the normal lighting, so it does not care what
 * the surface colour code does:
 *
 *   wet = 1 : the surface gets darker (wet asphalt, wet soil)
 *   wetQ >= 2: it shines: the sky is mirrored at grazing angles and the sun leaves a glint (like a wet road)
 *   wetQ >= 3: puddles (noise patches on flat ground that mirror the sky) + rain rings that grow in them
 *   beach   : (terrain only) in a sea storm foam and wet sand run up the beach, in and out with the waves
 *
 * The world position is rebuilt from the view-space position (a varying), so no extra vertex data is needed. When nothing is wet
 * (uWet = 0 and no storm) the block is skipped by one uniform branch.
 */
export const WetUniforms = {
  /** 0..1 wetness of the ground. */
  uWet: { value: 0 },
  /** 0 off, 1 darker, 2 shine, 3 puddles + ripples. */
  uWetQ: { value: 0 },
  uRainTime: { value: 0 },
  /** How hard it rains right now (ripple density). */
  uRainAmt: { value: 0 },
  /** Sea storm 0..1 (beach foam). */
  uStormK: { value: 0 },
  /** Brightness of the scene 0..1 (night / overcast): keeps the foam from glowing at night. */
  uWetLight: { value: 1 },
  uWetSky: { value: new THREE.Color(0.6, 0.7, 0.8) },
  uWetSunCol: { value: new THREE.Color(1, 0.9, 0.7) },
  /** Direction to the sun in VIEW space. */
  uWetSunV: { value: new THREE.Vector3(0, 1, 0) },
  /** Floating origin (m): absolute world x / z = local + this. */
  uWetOrigin: { value: new THREE.Vector2() },
};

const HEADER = /* glsl */ `
varying vec3 vEvcVP;
uniform float uWet;
uniform float uWetQ;
uniform float uRainTime;
uniform float uRainAmt;
uniform float uStormK;
uniform float uWetLight;
uniform vec3 uWetSky;
uniform vec3 uWetSunCol;
uniform vec3 uWetSunV;
uniform vec2 uWetOrigin;
float ewH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ewN(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ewH(i), ewH(i + vec2(1.0, 0.0)), f.x), mix(ewH(i + vec2(0.0, 1.0)), ewH(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Rain rings: every cell of a 0.6 m grid gets a ring now and then; more cells are alive when it rains harder.
float ewRipples(vec2 p, float amt) {
  vec2 g = p * 1.7;
  vec2 c = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = ewH(c);
  float live = step(h, amt * 0.85 + 0.05);
  vec2 o = vec2(ewH(c + 3.1), ewH(c + 7.7)) - 0.5;
  float ph = fract(uRainTime * (0.7 + 0.6 * ewH(c + 1.3)) + h * 9.0);
  float r = length(f - o * 0.5);
  return (1.0 - smoothstep(0.0, 0.05, abs(r - ph * 0.42))) * (1.0 - ph) * live;
}
`;

function body(o: WetOpts): string {
  const f = (n: number): string => n.toFixed(3);
  return /* glsl */ `
if (uWet > 0.003 || uStormK > 0.02) {
  vec3 ewW = cameraPosition + vEvcVP * mat3(viewMatrix);
  float ewDist = length(vEvcVP);
  float ewAbove = smoothstep(-0.25, 0.2, ewW.y);
  vec3 ewNw = normalize(cross(dFdx(ewW), dFdy(ewW)));
  float ewFlat = smoothstep(0.80, 0.97, abs(ewNw.y));
  vec2 ewA = ewW.xz + uWetOrigin;
  float ewWet = uWet * ewAbove * ${f(o.darken)};
  float ewPud = 0.0;
  if (uWetQ > 2.5 && uWet > 0.3) {
    float pn = ewN(ewA * 0.045) * 0.6 + ewN(ewA * 0.17 + 11.0) * 0.3 + ewN(ewA * 0.7) * 0.1;
    float lvl = 0.74 - 0.4 * uWet;
    ewPud = smoothstep(lvl, lvl + 0.06, pn) * ewFlat * smoothstep(0.35, 0.8, uWet) * ewAbove * ${f(o.puddle)};
  }
  outgoingLight *= 1.0 - ewWet - 0.2 * ewPud;
  if (uWetQ > 1.5) {
    vec3 ewV = normalize(-vEvcVP);
    float ndv = clamp(dot(normal, ewV), 0.0, 1.0);
    float fr = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
    float gloss = ${f(o.gloss)} * uWet * ewAbove * (0.35 + 0.65 * ewFlat);
    fr = mix(fr * gloss, 0.14 + 0.86 * fr, ewPud);
    vec3 ewR = reflect(-ewV, normal);
    float sg = pow(max(dot(ewR, uWetSunV), 0.0), 70.0);
    outgoingLight = mix(outgoingLight, uWetSky, clamp(fr, 0.0, 0.85)) + uWetSunCol * sg * gloss * 0.7;
  }
  if (uWetQ > 2.5 && uRainAmt > 0.03) {
    float rp = ewRipples(ewA, uRainAmt) * (1.0 - smoothstep(14.0, 40.0, ewDist)) * ewFlat * ewAbove;
    outgoingLight += vec3(0.55, 0.6, 0.66) * (0.12 + 0.3 * uWetLight) * rp * (0.3 + 0.7 * ewPud) * smoothstep(0.1, 0.6, uWet);
  }
  ${
    o.beach
      ? /* glsl */ `
  if (uWetQ > 1.5 && uStormK > 0.02) {
    // sea storm: waves wash foam and water up the beach (in and out), the sand stays dark and wet
    float hh = ewW.y;
    float sw = 0.5 + 0.5 * sin(uRainTime * 0.55 + ewA.x * 0.013 + ewA.y * 0.011);
    float reach = 0.25 + uStormK * (0.5 + 1.9 * sw);
    float band = smoothstep(-0.15, 0.0, hh) * (1.0 - smoothstep(reach * 0.55, reach, hh));
    float fn = ewN(ewA * 0.9 + vec2(uRainTime * 0.2, 0.0)) * 0.6 + ewN(ewA * 2.7) * 0.4;
    float line = (1.0 - smoothstep(0.0, 0.14, abs(hh - reach * 0.82))) * smoothstep(0.32, 0.7, fn);
    float foam = clamp(band * smoothstep(0.45, 0.8, fn) * 0.55 + line, 0.0, 1.0) * smoothstep(0.02, 0.2, uStormK) * smoothstep(-0.15, 0.0, hh);
    outgoingLight *= 1.0 - 0.38 * band * uStormK;
    outgoingLight = mix(outgoingLight, vec3(0.88, 0.92, 0.95) * mix(0.16, 1.0, uWetLight), foam);
  }`
      : ''
  }
}
`;
}

export interface WetOpts {
  /** How much darker the wet surface gets (0.4 asphalt .. 0.2 grass). */
  darken: number;
  /** Shine strength (1 asphalt, 0.5 soil / grass). */
  gloss: number;
  /** Puddle strength (1 roads, 0.6 ground). */
  puddle: number;
  /** Terrain only: storm foam / wet sand on the beach. */
  beach?: boolean;
}

interface PatchableShader {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
}

/** Call at the END of a Lambert material's onBeforeCompile (after its own replacements). Remember to change customProgramCacheKey. */
export function patchWet(shader: PatchableShader, o: WetOpts): void {
  Object.assign(shader.uniforms, WetUniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vEvcVP;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvEvcVP = mvPosition.xyz;');
  const hook = shader.fragmentShader.includes('#include <opaque_fragment>') ? '#include <opaque_fragment>' : '#include <output_fragment>';
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + HEADER).replace(hook, body(o) + '\n' + hook);
}
