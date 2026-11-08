import * as THREE from 'three';

/**
 * WET GROUND. One set of shared uniforms (WeatherSystem writes them every frame) and one shader patch that any
 * MeshLambertMaterial can use (roads, terrain, bridges, ...). The patch works after the normal lighting, so it does not care what
 * the surface colour code does.
 *
 * What real wet ground does (and what this does, with no extra texture and no extra render pass):
 *   wet     : water in the pores: the surface gets DARKER and a little more SATURATED (never grey / pale). Only a faint sheen.
 *   wetQ>=2 : a soft sun glint and a weak sky sheen at grazing angles (asphalt a lot, soil / grass only a little).
 *   wetQ>=3 : PUDDLES. Standing water collects on flat ground (uPuddle = how full they are): the ground under it is darker, the
 *             water has soft shores with a dark wet rim, and it mirrors the sky with a real Fresnel term (little when you look down
 *             into it, a lot at grazing angles). Rain rings run over it: every ring is a small wave that bends the mirrored sky
 *             and the sun glint, so the water sparkles and moves. On dry-ish wet ground each drop leaves a short splash flash.
 *   beach   : (terrain only) in a sea storm foam and wet sand run up the beach, in and out with the waves
 *
 * The world position is rebuilt from the view-space position (a varying), so no extra vertex data is needed. When nothing is wet
 * (uWet = 0 and no storm) the block is skipped by one uniform branch.
 */
export const WetUniforms = {
  /** 0..1 wetness of the ground. */
  uWet: { value: 0 },
  /** 0..1 how full the puddles are. */
  uPuddle: { value: 0 },
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
  /** Sky straight above (what a puddle mirrors when you look steeply into it). */
  uWetZen: { value: new THREE.Color(0.4, 0.5, 0.65) },
  uWetSunCol: { value: new THREE.Color(1, 0.9, 0.7) },
  /** Direction to the sun in VIEW space. */
  uWetSunV: { value: new THREE.Vector3(0, 1, 0) },
  /** Floating origin (m): absolute world x / z = local + this. */
  uWetOrigin: { value: new THREE.Vector2() },
};

const HEADER = /* glsl */ `
varying vec3 vEvcVP;
uniform float uWet;
uniform float uPuddle;
uniform float uWetQ;
uniform float uRainTime;
uniform float uRainAmt;
uniform float uStormK;
uniform float uWetLight;
uniform vec3 uWetSky;
uniform vec3 uWetZen;
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
// One drop hits a cell of the grid now and then (more cells are alive when it rains harder). Result: x = height of the little wave
// (a ring that spreads out and dies away, with a weaker ring behind it), yz = its slope (world x / z), w = the splash flash at the
// moment of impact. A ring never leaves its cell, so the grid cannot be seen.
vec4 ewDrop(vec2 p, float amt, float scale, float seed) {
  vec2 g = p * scale + seed * 17.0;
  vec2 c = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = ewH(c);
  float live = step(h, amt * 0.9 + 0.04);
  vec2 o = (vec2(ewH(c + 3.1), ewH(c + 7.7)) - 0.5) * 0.4;
  float rate = 0.8 + 0.6 * ewH(c + 1.3);
  float ph = fract(uRainTime * rate + h * 9.0);
  vec2 d = f - o;
  float r = length(d) + 1e-4;
  float R = 0.04 + ph * 0.34;
  float w = 0.03 + 0.03 * ph;
  float x = (r - R) / w;
  float life = (1.0 - ph) * (1.0 - ph) * live;
  float e1 = exp(-x * x);
  float e2 = exp(-(x + 2.6) * (x + 2.6)) * 0.55;
  float cs = cos(x * 2.2);
  float hgt = (e1 + e2) * cs * life;
  float dh = (e1 * (-2.0 * x * cs - 2.2 * sin(x * 2.2)) + e2 * (-2.0 * (x + 2.6) * cos((x + 2.6) * 2.2) - 2.2 * sin((x + 2.6) * 2.2))) * life;
  vec2 grad = (dh / w) * (d / r) / scale;
  // the splash itself: a bright burst for the first ~12 % of the ring's life, with a few spikes (a crown)
  float ang = atan(d.y, d.x);
  float burst = (1.0 - smoothstep(0.0, 0.05 + 0.5 * ph, r)) * (1.0 - ph / 0.12) * step(ph, 0.12) * (0.6 + 0.4 * sin(ang * 7.0 + h * 40.0)) * live;
  return vec4(hgt, grad, burst);
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
  float ewFlat = smoothstep(0.86, 0.985, abs(ewNw.y));
  vec2 ewA = ewW.xz + uWetOrigin;
  vec3 ewV = normalize(-vEvcVP);
  float ndv = clamp(dot(normal, ewV), 0.0, 1.0);

  // ---- 1. wet ground: darker AND more saturated (water in the pores), never pale ----
  float wetK = uWet * ewAbove * ${f(o.darken)};
  float lumA = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
  vec3 ewC = outgoingLight * (1.0 - wetK);
  ewC = mix(vec3(lumA * (1.0 - wetK)), ewC, 1.0 + 0.6 * uWet * ewAbove);

  float ewPud = 0.0;
  float ewRim = 0.0;
  vec4 ewR1 = vec4(0.0);
  vec4 ewR2 = vec4(0.0);
  if (uWetQ > 2.5 && uWet > 0.3 && ewDist < 70.0) {
    // ---- 2. puddles: low spots of the noise field, flat ground only; fuller puddles are wider ----
    float pn = ewN(ewA * 0.045) * 0.55 + ewN(ewA * 0.17 + 11.0) * 0.3 + ewN(ewA * 0.62 + 5.0) * 0.15;
    float lvl = 0.8 - 0.4 * uPuddle;
    float depth = smoothstep(lvl, lvl + 0.09, pn);
    float shore = smoothstep(lvl - 0.07, lvl, pn) * (1.0 - depth);
    float gate = ewFlat * ewAbove * smoothstep(0.1, 0.45, uPuddle) * ${f(o.puddle)} * (1.0 - smoothstep(45.0, 70.0, ewDist));
    ewPud = depth * gate;
    ewRim = shore * gate;
  }
  // the rim of a puddle is the wettest ground: darker still
  ewC *= 1.0 - 0.28 * ewRim;

  if (ewPud > 0.001) {
    // ---- 3. the water: dark (the ground seen through it), tinted a little blue-green, mirroring the sky ----
    vec3 ewUnder = ewC * mix(0.78, 0.5, ewPud) * vec3(0.9, 1.0, 1.06);
    // rain rings bend the surface: a big ring wave and a small one, only close to the camera
    vec3 gv = vec3(0.0);
    float ringFade = 1.0 - smoothstep(16.0, 46.0, ewDist);
    float splash = 0.0;
    if (uRainAmt > 0.03 && ringFade > 0.0) {
      ewR1 = ewDrop(ewA, uRainAmt, 1.7, 0.0);
      ewR2 = ewDrop(ewA, uRainAmt, 3.9, 1.0);
      gv = vec3(ewR1.y + 0.6 * ewR2.y, 0.0, ewR1.z + 0.6 * ewR2.z) * 0.9 * ringFade;
      splash = (ewR1.w + 0.6 * ewR2.w) * ringFade;
    }
    vec3 gvv = (viewMatrix * vec4(gv, 0.0)).xyz;
    vec3 ewNp = normalize(normal + gvv);
    float ndp = clamp(dot(ewNp, ewV), 0.0, 1.0);
    // Fresnel of water (F0 0.02): you see the ground when you look down into it, the sky at grazing angles
    float fr = 0.02 + 0.98 * pow(1.0 - ndp, 5.0);
    fr = clamp(fr * 1.15 + 0.035, 0.0, 0.92);
    vec3 rW = reflect(-ewV, ewNp);
    vec3 rWw = rW * mat3(viewMatrix);
    vec3 mir = mix(uWetSky, uWetZen, smoothstep(0.0, 0.85, rWw.y)) * (0.7 + 0.3 * uWetLight);
    float sg = pow(max(dot(rW, uWetSunV), 0.0), 220.0) * 3.0 + pow(max(dot(rW, uWetSunV), 0.0), 36.0) * 0.25;
    vec3 water = mix(ewUnder, mir, fr * (0.35 + 0.65 * smoothstep(0.0, 0.5, ewPud))) + uWetSunCol * sg * (0.4 + 0.6 * ewPud);
    // the splash flash and the crests of the rings catch the light
    water += vec3(0.7, 0.76, 0.82) * (0.1 + 0.4 * uWetLight) * (splash + 0.9 * max(ewR1.x + 0.5 * ewR2.x, 0.0) * ringFade * 0.35);
    ewC = mix(ewC, water, ewPud);
  } else if (uWetQ > 2.5 && uWetQ < 3.5 && uRainAmt > 0.03 && uWet > 0.5 && ewFlat > 0.5 && ewAbove > 0.5 && ewDist < 22.0) {
    // wet ground between the puddles: every drop leaves a short, small splash flash
    vec4 sp = ewDrop(ewA, uRainAmt * 0.8, 2.6, 2.0);
    ewC += vec3(0.62, 0.68, 0.74) * (0.1 + 0.35 * uWetLight) * sp.w * (1.0 - smoothstep(10.0, 22.0, ewDist)) * ewFlat * smoothstep(0.5, 0.9, uWet);
  }

  // ---- 4. sheen on wet ground outside the puddles: weak sky sheen at grazing angles + a soft sun glint ----
  if (uWetQ > 1.5) {
    float fr0 = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
    float gloss = ${f(o.gloss)} * uWet * ewAbove * (0.3 + 0.7 * ewFlat) * (1.0 - ewPud);
    vec3 ewR = reflect(-ewV, normal);
    float sg2 = pow(max(dot(ewR, uWetSunV), 0.0), 60.0);
    ewC = mix(ewC, uWetSky * (0.55 + 0.45 * uWetLight), clamp(fr0 * gloss * 0.8, 0.0, 0.22)) + uWetSunCol * sg2 * gloss * 0.5;
  }
  outgoingLight = ewC;
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
