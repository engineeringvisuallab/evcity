import * as THREE from 'three';
import { Config } from '../core/Config';
import { ATLAS_COLS, ATLAS_ROWS } from './GrassAtlasData';

/**
 * GRASS CARDS: a grass cluster is a few crossed vertical quads (2-3 quads = 4-6 triangles) that show one cluster cut out of the
 * grass atlas (public/assets/grass-atlas.webp). One shared geometry per quad count, one shared material, one atlas texture.
 * The cell of every instance comes from the per-instance attribute `aCell`; the colour tint from the instance colour.
 * Terrain geometry is never touched: a card only stands on it.
 */

/** Crossed vertical quads, 1 m wide and 1 m tall at scale 1, root in the middle of the bottom edge. Normals point UP so the grass is lit like the ground. */
export function buildCardGeometry(quads: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let q = 0; q < quads; q++) {
    const a = (q / quads) * Math.PI;
    const dx = Math.cos(a) * 0.5;
    const dz = Math.sin(a) * 0.5;
    const o = pos.length / 3;
    pos.push(-dx, 0, -dz, dx, 0, dz, dx, 1, dz, -dx, 1, -dz);
    for (let k = 0; k < 4; k++) nrm.push(0, 1, 0);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

let atlas: THREE.Texture | null = null;
/** The one atlas texture (loaded once, reused by every card material). */
export function grassAtlas(): THREE.Texture {
  if (atlas) return atlas;
  atlas = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/grass-atlas.webp`);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.anisotropy = 8;
  return atlas;
}

export interface CardUniforms {
  time: { value: number };
  wind: { value: number };
  fade: { value: THREE.Vector2 };
}

/**
 * Lambert material with the atlas: alpha-tested (no sorting, no blending cost), wind sway by height, size fade at the far edge,
 * a darker root (`rootDark`) so the cluster sits in the ground. The instance colour multiplies the texture (dark green / straw tint).
 */
export function makeCardMaterial(u: CardUniforms): THREE.MeshLambertMaterial {
  const C = Config.vegetation.grass.cards;
  const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGrassTime = u.time;
    shader.uniforms.uGrassWind = u.wind;
    shader.uniforms.uGrassFade = u.fade;
    shader.uniforms.uAtlas = { value: grassAtlas() };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uGrassTime;\nuniform float uGrassWind;\nuniform vec2 uGrassFade;\nattribute float aCell;\nvarying vec2 vCardUv;\nvarying float vCardY;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float col = mod(aCell, ${ATLAS_COLS}.0);
          float row = floor(aCell / ${ATLAS_COLS}.0);
          vCardUv = vec2((col + uv.x) / ${ATLAS_COLS}.0, 1.0 - (row + 1.0 - uv.y) / ${ATLAS_ROWS}.0);
          vCardY = uv.y;
        }
        #ifdef USE_INSTANCING
          vec4 gip = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float gFade = 1.0 - smoothstep(uGrassFade.x, uGrassFade.y, length(gip.xyz));
          float gph = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 0.7;
          float gust = sin(uGrassTime * 0.9 + instanceMatrix[3].x * 0.045 + instanceMatrix[3].z * 0.03) * 0.5 + 0.5;
          transformed.x += (sin(uGrassTime * 2.1 + gph) * 0.05 + gust * 0.08) * position.y * position.y * uGrassWind;
          transformed.z += (cos(uGrassTime * 1.7 + gph) * 0.04 + gust * 0.03) * position.y * position.y * uGrassWind;
          transformed *= gFade;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uAtlas;\nvarying vec2 vCardUv;\nvarying float vCardY;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec4 gt = texture2D(uAtlas, vCardUv, -0.6); // negative mip bias: keeps the blades sharp
          if (gt.a < ${C.alphaCut.toFixed(2)}) discard;
          float gRoot = mix(${C.rootDark.toFixed(2)}, 1.0, smoothstep(0.0, 0.55, vCardY));
          diffuseColor.rgb *= gt.rgb * gRoot;
        }`,
      )
      // both sides lit like the ground
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);');
  };
  m.customProgramCacheKey = () => 'grass-card-v1';
  return m;
}
