import * as THREE from 'three';
import { patchWet } from '../weather/WetSurface';
import { Config } from '../core/Config';
import { DIVIDED_SECTIONS } from './RoadSection';

/**
 * Concrete-grey road surfaces, slab joints, and lane markings are drawn in the shader (no textures).
 * Built on MeshLambertMaterial so sun, shadows and fog work.
 * Per-vertex data (see RoadMesh): x = metres across the road, y = metres along it, z = road half width, w = distance to a road end.
 *   - gravel shoulder outside the carriageway, white edge lines
 *   - highways: double yellow median lines + dashed white lane lines
 *   - narrower roads: dashed yellow centre line
 *   - engineered junction pads: lighter concrete with a subtle slab grid and preserved crossing markings
 *   - markings fade near road ends, where junctions are, so lines do not overlap
 *   - CITY STYLE (GRASS 4, Config.city.roadside): local streets and tier 1-3 roads inside a planned city: white lane lines, a kerb, a paved sidewalk of
 *     grey interlocking pavers (basket weave, drawn in the shader) instead of the gravel shoulder, and a yellow-black striped kerb at the median.
 *     Code in vertex info z: half width + 100 = local street, + 4000 = city road of tier 1-3 (see RoadMesh).
 */
const VERT_HEADER = /* glsl */ `
attribute vec4 aRd;
varying vec4 vRd;
varying float vRdDist;
`;
const VERT_BODY = /* glsl */ `
vRd = aRd;
vRdDist = length((modelViewMatrix * vec4(transformed, 1.0)).xyz);
`;
const SIDEWALK = Config.city.roadside.sidewalk.toFixed(3);
// ROADS STEP 1: the divided cross-sections (median half, lane width, median-side shy, lanes per direction) come from Config.city.roadSections.
// The shader finds the section from the road half width, so there are no magic half-width numbers for these roads any more.
const SECTION_GLSL = `vec4 evcSection(float hw) {
${DIVIDED_SECTIONS.map((d) => `  if (abs(hw - ${d.halfWidth.toFixed(3)}) < 0.02) return vec4(${d.medianHalf.toFixed(3)}, ${d.laneW.toFixed(3)}, ${d.shyMedian.toFixed(3)}, ${d.lanesPerDir.toFixed(1)});`).join('\n')}
  return vec4(0.0);
}
`;
const PAVER = Config.city.roadside.paver.toFixed(3);
const FRAG_HEADER = /* glsl */ `
varying vec4 vRd;
varying float vRdDist;
float evcRdHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float evcRdNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(evcRdHash(i), evcRdHash(i + vec2(1.0, 0.0)), f.x), mix(evcRdHash(i + vec2(0.0, 1.0)), evcRdHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float evcLine(float d, float w) { return 1.0 - smoothstep(w, w + 0.06, abs(d)); }
${SECTION_GLSL}
// Grey interlocking pavers (basket weave: pairs of ${PAVER} x ${PAVER}/2 m bricks, orientation alternating per 2x2 block); p in metres. Grout fades with distance (no shimmer).
vec3 evcPavers(vec2 p, float dist) {
  vec2 q = p / (${PAVER} * 0.5);
  vec2 b = floor(q / 2.0);
  vec2 f = fract(q / 2.0) * 2.0;
  float vert = mod(b.x + b.y, 2.0);
  vec2 g = vert > 0.5 ? f.yx : f;          // brick coordinates: 2 units long (g.x), 1 unit wide (g.y)
  float row = floor(g.y);
  float id = evcRdHash(b * 2.0 + vec2(row, vert));
  float ex = min(g.x, 2.0 - g.x);
  float ey = min(fract(g.y), 1.0 - fract(g.y));
  float grout = 1.0 - smoothstep(0.03, 0.10, min(ex, ey * 1.0));
  float near = 1.0 - smoothstep(14.0, 55.0, dist);
  vec3 tile = vec3(0.60, 0.60, 0.58) * (0.90 + 0.2 * id);
  return mix(vec3(0.58), mix(tile, tile * 0.62, grout), near);
}
// City sidewalk colour at distance d (m) outside the asphalt edge: kerb stone, pavers, a thin concrete edging next to the lawn strip.
vec3 evcSidewalk(float d, float u, float s) {
  vec3 col = evcPavers(vec2(u, s), vRdDist);
  float kerbB = 1.0 - smoothstep(0.17, 0.23, d);
  float edgeB = smoothstep(${SIDEWALK} - 0.24, ${SIDEWALK} - 0.18, d);
  col = mix(col, vec3(0.70, 0.69, 0.66), kerbB);
  col = mix(col, vec3(0.56, 0.55, 0.52), edgeB);
  return col;
}
`;
const FRAG_COLOR = /* glsl */ `
{
  float u = vRd.x;
  float s = vRd.y;
  // tier 4 (local streets): ribbon half width + 100, pads 1100 (see RoadMesh); everything else keeps the old coding
  float hwRaw = vRd.z;
  // earthen (kacha) tracks: half width + 2000
  bool isEarth = hwRaw > 1900.0 && hwRaw < 2500.0;
  // city road of tier 1-3 (inside a planned city): half width + 4000
  bool isCityMain = hwRaw > 3900.0 && hwRaw < 4600.0;
  bool isLocalRd = !isEarth && !isCityMain && ((hwRaw > 50.0 && hwRaw < 500.0) || (hwRaw > 1050.0 && hwRaw < 3900.0));
  float hw = isEarth ? hwRaw - 2000.0 : isCityMain ? hwRaw - 4000.0 : ((hwRaw > 50.0 && hwRaw < 500.0) ? hwRaw - 100.0 : hwRaw);
  vec4 sec = evcSection(hw); // x > 0: divided road (median half, lane width, median-side shy, lanes per direction)
  float au = abs(u);
  float n = evcRdNoise(vec2(u * 1.7, s * 0.9)) * 0.6 + evcRdNoise(vec2(u * 6.0, s * 3.5)) * 0.4;
  // ONE asphalt colour for every road type AND the junction pads (and the far-LOD terrain road, see TerrainMaterial): only the wear detail differs.
  vec3 asphaltBase = vec3(0.46, 0.47, 0.48) + n * 0.025;
  vec3 roadSurface = asphaltBase;
  vec3 gravel = vec3(0.42, 0.39, 0.33) + n * 0.05;
  vec3 col = mix(roadSurface, gravel, smoothstep(hw - 0.12, hw + 0.12, au));
  float inRoad = 1.0 - smoothstep(hw - 0.12, hw + 0.12, au);

  float fadeEdge = smoothstep(2.0, 7.0, vRd.w);
  float fadeMid = smoothstep(7.0, 16.0, vRd.w);
  float dash = step(fract(s / 9.0), 0.55);
  if (isEarth) {
    // ---- EARTHEN TRACK: packed brown earth, two darker wheel ruts, a thin grassy / dusty middle, ragged edges ----
    float dn = evcRdNoise(vec2(u * 2.3 + 5.0, s * 0.8)) * 0.5 + evcRdNoise(vec2(u * 9.0, s * 4.0)) * 0.5;
    vec3 earth = vec3(0.43, 0.33, 0.22) * (0.88 + dn * 0.24);
    float rut = 1.0 - smoothstep(0.0, 0.26, abs(au - hw * 0.5));
    earth *= 1.0 - rut * 0.16 * (0.6 + 0.4 * evcRdNoise(vec2(s * 0.5, u * 3.0)));
    float mid = 1.0 - smoothstep(0.0, hw * 0.28, au);
    vec3 grass = vec3(0.30, 0.36, 0.14) * (0.85 + dn * 0.3);
    earth = mix(earth, grass, mid * smoothstep(0.35, 0.65, evcRdNoise(vec2(s * 0.35, 4.0))) * 0.55);
    // dry puddle / pale dust patches
    earth = mix(earth, vec3(0.55, 0.46, 0.34), smoothstep(0.66, 0.7, evcRdNoise(vec2(u * 0.5 + 8.0, s * 0.12))) * 0.35);
    vec3 edgeCol = vec3(0.36, 0.34, 0.18) * (0.85 + dn * 0.3);
    float ragged = hw + (dn - 0.5) * 0.7;
    col = mix(earth, edgeCol, smoothstep(ragged - 0.25, ragged + 0.25, au));
  } else if (sec.x > 0.0) {
    // ---- DIVIDED ROAD (ROADS STEP 1): lanes each side of a median strip (flush concrete for now, the raised median comes in Step 2) ----
    float medH = sec.x;
    float laneW = sec.y;
    float v = (au - (medH + sec.z)) / laneW;
    float lc = abs(fract(v) - 0.5) * laneW;
    float lane = floor(v);
    float laneTone = (evcRdHash(vec2(lane, sign(u) + 3.0)) - 0.5) * 0.018;
    vec3 road = asphaltBase + laneTone;
    float track = 1.0 - smoothstep(0.0, 0.32, abs(lc - 0.85));
    road *= 1.0 - track * 0.075;
    road *= 1.0 - (1.0 - smoothstep(0.0, 0.3, lc)) * 0.035 * (0.5 + evcRdNoise(vec2(s * 0.3, lane)));
    // ROADS CLEANUP: the old sharp-edged "repair patches" and noise iso-line "cracks" drew swirly dark contour lines on the wide roads.
    // Now: very soft, faint tone drift (no hard edge) and a few thin, faint hairline cracks that run mostly ALONG the road.
    float pnD = evcRdNoise(vec2(u * 0.12 + 11.0, s * 0.05));
    road *= 1.0 - smoothstep(0.45, 0.80, pnD) * 0.035;
    float cnD = evcRdNoise(vec2(u * 0.6 + 4.0, s * 0.45));
    road *= 1.0 - (1.0 - smoothstep(0.0, 0.006, abs(cnD - 0.5))) * 0.05 * fadeEdge;
    float outside = smoothstep(hw - 0.12, hw + 0.12, au);
    // outside the asphalt: paved footpath inside a city (tier 4 streets and city roads), gravel shoulder in the country
    vec3 beyond = (isCityMain || isLocalRd) ? evcSidewalk(max(au - hw, 0.0), u, s) : gravel;
    col = mix(road, beyond, outside);
    float med = (1.0 - smoothstep(medH - 0.04, medH + 0.04, au)) * fadeMid;
    vec3 concrete = vec3(0.56, 0.55, 0.52) + n * 0.05;
    concrete *= 0.82 + 0.18 * smoothstep(0.0, 0.25, medH - au);
    col = mix(col, concrete, med);
    float wearD = 0.72 + 0.28 * evcRdNoise(vec2(u * 3.0, s * 1.3));
    // solid yellow line on the median side, solid white line on the kerb side, dashed white lines between the lanes of one direction
    col = mix(col, vec3(0.88, 0.68, 0.08), evcLine(au - (medH + 0.35), 0.09) * inRoad * fadeMid * wearD);
    col = mix(col, vec3(0.86), evcLine(au - (hw - 0.45), 0.1) * inRoad * fadeEdge * wearD);
    float ldashD = step(fract(s / 12.0), 0.25);
    float bi = floor(v + 0.5);
    float onLaneLine = step(1.0, bi) * step(bi, sec.w - 1.0);
    col = mix(col, vec3(0.86), evcLine((v - bi) * laneW, 0.08) * ldashD * onLaneLine * inRoad * fadeMid * wearD);
  } else if (isLocalRd) {
    // ---- LOCAL STREET: concrete carriageway, kerb, and lighter concrete footpath with joints ----
    float walk = smoothstep(hw - 0.12, hw + 0.12, au);
    vec3 asph = asphaltBase;
    float lcl = abs(au - hw * 0.5);
    asph *= 1.0 - (1.0 - smoothstep(0.0, 0.3, abs(lcl - 0.8))) * 0.055;
    float pn3 = evcRdNoise(vec2(u * 0.4 + 3.0, s * 0.09));
    asph *= 1.0 - smoothstep(0.64, 0.655, pn3) * 0.08;
    // CITY STREET: asphalt with white lane lines, a kerb, a ${SIDEWALK} m sidewalk of grey interlocking pavers
    col = mix(asph, evcSidewalk(max(au - hw, 0.0), u, s), walk);
    // white solid edge lines and a dashed white centre line (fade near junctions)
    float wearL = 0.74 + 0.26 * evcRdNoise(vec2(u * 3.0, s * 1.3));
    col = mix(col, vec3(0.88), evcLine(au - (hw - 0.4), 0.075) * inRoad * fadeEdge * wearL);
    col = mix(col, vec3(0.9), evcLine(u, 0.07) * dash * inRoad * fadeMid * wearL);
  } else if (hw > 6.0) {
    // ---- FREEWAY: broad light-grey concrete deck, subtle wheel wear, median and paint ----
    float medW = 0.6;
    float lw = (hw - medW) * 0.5;
    float v = (au - medW) / lw;
    float lc = abs(fract(v) - 0.5) * lw;
    float lane = floor(v);
    float laneTone = (evcRdHash(vec2(lane, sign(u) + 3.0)) - 0.5) * 0.018;
    vec3 road = asphaltBase + laneTone;
    // polished / dark wheel paths and the oily lane centre
    float track = 1.0 - smoothstep(0.0, 0.32, abs(lc - 0.85));
    road *= 1.0 - track * 0.075;
    road *= 1.0 - (1.0 - smoothstep(0.0, 0.3, lc)) * 0.035 * (0.5 + evcRdNoise(vec2(s * 0.3, lane)));
    // repaired patches (darker, sharp edge) and long cracks
    float pn = evcRdNoise(vec2(u * 0.32 + 11.0, s * 0.07));
    road *= 1.0 - smoothstep(0.63, 0.645, pn) * 0.10;
    float cn = evcRdNoise(vec2(u * 1.9 + 4.0, s * 0.35));
    road *= 1.0 - (1.0 - smoothstep(0.0, 0.025, abs(cn - 0.5))) * 0.16;
    col = mix(road, gravel, smoothstep(hw - 0.12, hw + 0.12, au));
    // concrete median strip (fades into asphalt near junctions)
    float med = (1.0 - smoothstep(medW - 0.04, medW + 0.04, au)) * fadeMid;
    vec3 concrete = vec3(0.56, 0.55, 0.52) + n * 0.05;
    concrete *= 0.82 + 0.18 * smoothstep(0.0, 0.25, medW - au);
    col = mix(col, concrete, med);
    // paint, slightly worn
    float wear = 0.72 + 0.28 * evcRdNoise(vec2(u * 3.0, s * 1.3));
    // solid yellow lines along the median, solid white edge lines
    col = mix(col, vec3(0.88, 0.68, 0.08), evcLine(au - (medW + 0.2), 0.09) * inRoad * fadeMid * wear * (isCityMain ? 0.0 : 1.0));
    col = mix(col, vec3(0.86), evcLine(au - (hw - 0.45), 0.1) * inRoad * fadeEdge * wear);
    // dashed white lane line between the two lanes of each carriageway (3 m paint, 9 m gap)
    float ldash = step(fract(s / 12.0), 0.25);
    col = mix(col, vec3(0.86), evcLine(au - (medW + lw), 0.08) * ldash * inRoad * fadeMid * wear);
  } else {
    // ---- ARTERIAL and COLLECTOR: smooth concrete with restrained surface wear and road paint ----
    float lc2 = abs(au - hw * 0.5); // distance to the centre of this carriageway's lane
    vec3 road = asphaltBase;
    float track2 = 1.0 - smoothstep(0.0, 0.3, abs(lc2 - 0.8));
    road *= 1.0 - track2 * 0.065;
    float pn2 = evcRdNoise(vec2(u * 0.4 + 7.0, s * 0.08));
    road *= 1.0 - smoothstep(0.64, 0.655, pn2) * 0.09;
    float cn2 = evcRdNoise(vec2(u * 2.1 + 9.0, s * 0.4));
    road *= 1.0 - (1.0 - smoothstep(0.0, 0.03, abs(cn2 - 0.5))) * 0.15;
    col = mix(road, gravel, smoothstep(hw - 0.12, hw + 0.12, au));
    float wear2 = 0.72 + 0.28 * evcRdNoise(vec2(u * 3.0, s * 1.3));
    // white edge lines
    col = mix(col, vec3(0.86), evcLine(au - (hw - 0.45), 0.08) * inRoad * fadeEdge * wear2);
    if (hw > 5.2) {
      // arterial: double solid yellow centre line
      col = mix(col, vec3(0.88, 0.68, 0.08), evcLine(au - 0.14, 0.07) * inRoad * fadeMid * wear2 * (isCityMain ? 0.0 : 1.0));
    } else {
      // collector / local: dashed yellow centre line
      col = mix(col, vec3(0.9, 0.7, 0.1), evcLine(u, 0.07) * dash * inRoad * fadeMid * wear2);
    }
  }
  if (isCityMain) {
    // CITY ROAD OF TIER 1-3: the gravel shoulder becomes the paved sidewalk, and the median is a yellow-black striped kerb
    if (sec.x <= 0.0) col = mix(col, evcSidewalk(max(au - hw, 0.0), u, s), smoothstep(hw - 0.12, hw + 0.12, au));
    // MEDIAN: plain double solid yellow line (the old black-yellow striped kerb was too harsh on the eyes)
    vec3 medYellow = vec3(0.86, 0.68, 0.10);
    float medLine = max(evcLine(au - 0.16, 0.06), evcLine(au + 0.16, 0.06)) * (sec.x > 0.0 ? 0.0 : 1.0); // divided roads have a real median strip instead
    float medWear = 0.72 + 0.28 * evcRdNoise(vec2(u * 3.0, s * 1.3));
    col = mix(col, medYellow, medLine * inRoad * fadeMid * medWear);
    float kerbM = 0.0;
    // white lane lines on arterials / collectors too (the freeway branch already has its own dashed white lines)
    if (hw <= 6.0 && sec.x <= 0.0) col = mix(col, vec3(0.88), evcLine(au - (hw - 0.4), 0.075) * inRoad * fadeEdge * (1.0 - kerbM));
  }
  // Subtle transverse concrete expansion joints along normal road ribbons.
  // At junction ends fadeMid is zero, so these seams do not clutter intersections.
  float seamPos = fract(s / 8.0);
  float seamDist = min(seamPos, 1.0 - seamPos);
  float slabJoint = 1.0 - smoothstep(0.018, 0.055, seamDist);
  col *= 1.0 - slabJoint * 0.055 * inRoad * fadeMid * (isEarth ? 0.0 : 1.0);

  // Junction pads: same concrete colour as the road surface (no separate dark / light finish)
  bool isJunctionPad = hwRaw >= 900.0 && hwRaw < 1900.0;
  if (isJunctionPad && vRd.z > 0.0) {
    // the roads' wear (wheel paths, patches, cracks) darkens them by ~3 % on average: the flat pad gets the same average
    vec3 junctionConcrete = asphaltBase * 0.97;
    col = mix(junctionConcrete, gravel, smoothstep(hw - 0.12, hw + 0.12, au));
  }

  diffuseColor.rgb = pow(col, vec3(2.2));
  // junction paint quads (zebra bars, stop lines): z < 0 = solid paint, -1 white, -2 yellow
  if (vRd.z < 0.0) {
    vec3 paint = vRd.z < -1.5 ? vec3(0.88, 0.68, 0.08) : vec3(0.86);
    diffuseColor.rgb = pow(paint, vec3(2.2));
  }
}
`;

export class RoadMaterial extends THREE.MeshLambertMaterial {
  constructor() {
    super({ color: 0xffffff, side: THREE.DoubleSide });
    // pull the ribbon slightly towards the camera so it never z-fights with the terrain underneath
    this.polygonOffset = true;
    this.polygonOffsetFactor = -2;
    this.polygonOffsetUnits = -2;
    this.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_HEADER)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_HEADER)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR);
      // RAIN: wet asphalt (darker, shiny, puddles, rain rings)
      patchWet(shader, { darken: 0.4, gloss: 1.0, puddle: 1.0 });
    };
    this.customProgramCacheKey = () => 'evc-road-v16-soft-wear';
  }
}
