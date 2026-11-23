import * as THREE from 'three';
import { windGust } from './WindGust';
import { Config } from '../core/Config';
import { mulberry32 } from '../world/Seed';
import { GRASS_TYPE_COUNT, GrassType, isGrassClump, isGrassFlower } from './TreeTypes';
import { GRASS_TILES, GT, makeGrassAtlas } from './GrassTextures';

/**
 * REALISTIC GRASS + WILDFLOWERS. Ten tuft models (TreeTypes.GrassType), all in ONE shared material:
 *   0 lawn   - short, fine, very dense blades            1 wild  - tall, slim, bent blades (the "meadow" look)
 *   2 clump  - broad-leaf bunch                            3 seed  - tall straw-coloured grass with feathery seed heads
 *   4 daisy  5 buttercup  6 lavender  7 poppy  8 cornflower  9 clover  - a grass tuft with real flower heads growing out of it
 *   10 tussock  11 tussockWide - big grass CLUMPS: 60..110 blades from one root, tall and upright in the middle, arching outwards at the edge
 * Every blade is a curved ribbon (base -> middle -> pointed tip) with its own height, lean, droop, width and tint, a dark root and a
 * bright tip, and normals that bend a little to the sides so a blade is shaded round, not flat. Flower heads are built from petals
 * (not a coloured dot): daisy = 12 white petals around a yellow eye, buttercup = 5 round yellow petals, poppy = a red cup with a
 * dark centre, cornflower = 9 pointed blue petals, lavender = a purple spike of tiny florets, clover = a white pom-pom + trefoil leaves.
 *
 * 2026-11-21 (reference photos of real ground cover and a red-soil savanna): 12 tussockSeed = a big bunch grass with 14-20 bristly seed plumes standing out of it; 13 leafy = a low rosette of
 * broad oval leaves folded along a pale midrib (plantain / dock); 14 trefoil = a patch of clover-like three-leaflet leaves. Blades now also vary one by one (lighter / darker, a few sun-lit yellow-green).
 *
 * The real green / dry colour of the meadow still comes from the per-instance colour; vertices flagged `aFlower` ignore it
 * (flowers keep their own colour). Wind sway + distance fade are in the vertex shader, sun-through-the-blades in the fragment shader.
 */

type RNG = () => number;
type RGB = [number, number, number];
/** The solid white texel of the painted atlas (tile 0): everything without a picture (flowers, stems, the flower tufts' blades) samples it and keeps its vertex colours. */
const WHITE_UV: readonly [number, number] = [0.5 / GRASS_TILES, 0.5];

class Builder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  fl: number[] = [];
  uv: number[] = [];
  idx: number[] = [];

  /** A vertex that is NOT shared: pushed together with its own index (flowers, stems: 3 vertices per triangle). */
  vert(p: ArrayLike<number>, n: THREE.Vector3, c: RGB, flower: number): void {
    this.shared(p, n, c, flower);
    this.idx.push(this.pos.length / 3 - 1);
  }

  /** A vertex that triangles share through `face` (grass blades: 5 vertices for 3 triangles, smooth normals, fewer vertices). Returns its index. */
  shared(p: ArrayLike<number>, n: THREE.Vector3, c: RGB, flower: number, uv: readonly [number, number] = WHITE_UV): number {
    this.uv.push(uv[0], uv[1]);
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n.x, n.y, n.z);
    this.col.push(c[0], c[1], c[2]);
    this.fl.push(flower);
    return this.pos.length / 3 - 1;
  }

  face(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  tri(a: ArrayLike<number>, b: ArrayLike<number>, c: ArrayLike<number>, n: THREE.Vector3, ca: RGB, cb: RGB = ca, cc: RGB = ca, flower = 0): void {
    this.vert(a, n, ca, flower);
    this.vert(b, n, cb, flower);
    this.vert(c, n, cc, flower);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aFlower', new THREE.Float32BufferAttribute(this.fl, 1));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const FLAT_NORMAL = new THREE.Vector3(0, 1, 0);

/** A card model of the painted grass: which tile, its height / width (model units = the same size as the old blade models, so GrassManager's sizes still fit), cards per LOD ring [near, mid, far], arch of the top. */
interface CardSpec {
  tile: number;
  h: number;
  w: number;
  n: [number, number, number];
  bend: number;
  /** 1 = a wild flower: the card ignores the green instance tint and keeps its own painted colours */
  flower?: number;
}
const CARDS: Record<number, CardSpec> = {
  [GrassType.lawn]: { tile: GT.lawn, h: 0.36, w: 0.62, n: [3, 2, 2], bend: 0.05 },
  [GrassType.durba]: { tile: GT.durba, h: 0.55, w: 0.62, n: [3, 2, 2], bend: 0.05 },
  [GrassType.wild]: { tile: GT.wild, h: 1.0, w: 1.3, n: [3, 2, 2], bend: 0.08 },
  [GrassType.clump]: { tile: GT.clump, h: 0.62, w: 0.8, n: [3, 2, 2], bend: 0.07 },
  [GrassType.seed]: { tile: GT.wild, h: 1.15, w: 1.2, n: [3, 2, 2], bend: 0.08 },
  [GrassType.tussock]: { tile: GT.tussock, h: 0.72, w: 0.95, n: [4, 3, 2], bend: 0.05 },
  [GrassType.tussockWide]: { tile: GT.tussockWide, h: 0.86, w: 1.3, n: [4, 3, 2], bend: 0.06 },
  [GrassType.tussockSeed]: { tile: GT.tussockSeed, h: 1.45, w: 1.35, n: [4, 3, 3], bend: 0.04 },
  [GrassType.daisy]: { tile: GT.daisy, h: 0.75, w: 0.8, n: [3, 3, 3], bend: 0.05, flower: 1 },
  [GrassType.buttercup]: { tile: GT.buttercup, h: 0.7, w: 0.8, n: [3, 3, 3], bend: 0.05, flower: 1 },
  [GrassType.lavender]: { tile: GT.lavender, h: 0.9, w: 0.8, n: [3, 3, 3], bend: 0.04, flower: 1 },
  [GrassType.poppy]: { tile: GT.poppy, h: 0.72, w: 0.8, n: [3, 3, 3], bend: 0.05, flower: 1 },
  [GrassType.cornflower]: { tile: GT.cornflower, h: 0.72, w: 0.8, n: [3, 3, 3], bend: 0.05, flower: 1 },
  [GrassType.clover]: { tile: GT.clover, h: 0.8, w: 0.85, n: [3, 3, 3], bend: 0.05, flower: 1 },
};

/** A tuft / clump: `n` crossed cards (3 = 60 degrees apart, 4 = 45 degrees) with a gentle arch, each wearing the painted picture; 4 triangles per card. Every LOD ring has the same height. */
function cardTuft(b: Builder, r: RNG, s: CardSpec, density: number): void {
  const n = s.n[density >= 0.9 ? 0 : density >= 0.5 ? 1 : 2];
  const u0 = (s.tile + 0.012) / GRASS_TILES, u1 = (s.tile + 0.988) / GRASS_TILES;
  const a0 = r() * Math.PI;
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * Math.PI + (r() - 0.5) * 0.3;
    const dx = Math.cos(a), dz = Math.sin(a);
    const bend = (r() - 0.5) * 2 * s.bend * s.h;
    const w = s.w * (0.9 + 0.2 * r());
    const ox = (r() - 0.5) * 0.05 * s.w, oz = (r() - 0.5) * 0.05 * s.w;
    const rows = [0, 0.5, 1].map((t) => {
      const off = bend * t * t;
      const y = s.h * t - 0.012 * s.h;
      const c = 0.72 + 0.28 * t;
      const v = 0.004 + 0.992 * (1 - t);
      const mk = (side: number): number => b.shared([dx * side * w * 0.5 - dz * off + ox, y, dz * side * w * 0.5 + dx * off + oz], FLAT_NORMAL, [c, c, c], s.flower ?? 0, [side < 0 ? u0 : u1, v]);
      return [mk(-1), mk(1)];
    });
    for (let i = 0; i < 2; i++) {
      b.face(rows[i][0], rows[i][1], rows[i + 1][0]);
      b.face(rows[i][1], rows[i + 1][1], rows[i + 1][0]);
    }
  }
}

/** REAL 3D GRASS (2026-11-23): no pictures. A tuft = a few small PLANTS, each plant = 2-3 single blades (3 triangles each: a wide base, a narrow middle, a pointed tip) of nearly the same height,
 * leaning a little and drooping at the tip. Every plant has its own light or deep green; the blade is dark at the root and bright at the tip (vertex colours, the per-instance tint still adjusts them). */
function bladeTuft(b: Builder, r: RNG, h: number, spread: number, density: number): void {
  const plants = density >= 0.9 ? 4 : density >= 0.4 ? 3 : 2;
  const a0 = r() * Math.PI * 2;
  for (let p = 0; p < plants; p++) {
    const pa = a0 + (p / plants) * Math.PI * 2 + (r() - 0.5) * 0.8;
    const pr = spread * (0.35 + 0.65 * r());
    const px = Math.cos(pa) * pr, pz = Math.sin(pa) * pr;
    // every plant has its own colour: mostly deep / mid green, some olive, some dry straw, a few dead brown ("mora")
    const cr = r();
    const base: RGB = cr < 0.3 ? [0.08, 0.26, 0.05] : cr < 0.58 ? [0.13, 0.36, 0.06] : cr < 0.74 ? [0.22, 0.34, 0.07] : cr < 0.86 ? [0.3, 0.4, 0.09] : cr < 0.94 ? [0.5, 0.42, 0.17] : [0.38, 0.27, 0.13];
    const shade = 0.85 + 0.3 * r();
    const nb = density >= 0.9 ? 2 + (r() < 0.55 ? 1 : 0) : 2;
    const ph = h * (0.88 + 0.12 * r());
    for (let k = 0; k < nb; k++) {
      const az = r() * Math.PI * 2;
      const sx = Math.cos(az), sz = Math.sin(az); // across the blade
      const lean = (0.1 + 0.16 * r()) * ph;
      const la = pa + (r() - 0.5) * 1.6; // lean direction: outwards, a little random
      const lx = Math.cos(la), lz = Math.sin(la);
      const bh = ph * (0.94 + 0.06 * r());
      const bw = 0.036 * (0.9 + 0.3 * r());
      const ox = px + (r() - 0.5) * 0.03, oz = pz + (r() - 0.5) * 0.03;
      const col = (t: number): RGB => { const f = shade * (0.5 + 0.5 * t); return [base[0] * f, base[1] * f, base[2] * f]; };
      const vtx = (t: number, wid: number, side: number): number => {
        const off = lean * t * t;
        return b.shared([ox + lx * off + sx * side * wid * 0.5, bh * t, oz + lz * off + sz * side * wid * 0.5], FLAT_NORMAL, col(t), 0);
      };
      const bl = vtx(0, bw, -1), br = vtx(0, bw, 1);
      const ml = vtx(0.5, bw * 0.7, -1), mr = vtx(0.5, bw * 0.7, 1);
      const tip = vtx(1, 0, 0);
      b.face(bl, br, ml);
      b.face(br, mr, ml);
      b.face(ml, mr, tip);
    }
  }
}

/** `density` < 1 = a cheaper model for the far LOD rings (fewer cards, no extra layer). Same size in every ring. */
function make(type: number, density = 1): THREE.BufferGeometry {
  const r = mulberry32(4242 + type * 7919);
  const b = new Builder();
  const card = CARDS[type];
  if (card && card.flower) cardTuft(b, r, card, density);
  else if (card) bladeTuft(b, r, Math.min(card.h * 0.85, 0.9), card.w * 0.28, density);
  else bladeTuft(b, r, 0.45, 0.2, density); // leafy / trefoil: the same green blades
  return b.build();
}

export class GrassAssets {
  /** [LOD ring][GrassType]. Ring 0 has all twelve models, the far rings the four grass kinds + the two clumps (no flowers, fewer blades). */
  readonly lodGeometries: THREE.BufferGeometry[][] = [];
  /** index = GrassType (ring 0) */
  readonly geometries: THREE.BufferGeometry[];
  readonly material: THREE.MeshLambertMaterial;
  /** The painted atlas (null without a canvas, e.g. in tests: the cards then show their vertex colours only). */
  private readonly atlas: THREE.DataTexture | null = makeGrassAtlas();
  /** Same shader for the extra (dense) tufts, but with its own, much shorter fade distance (Config grass.denseFade). */
  readonly extraMaterial: THREE.MeshLambertMaterial;
  private time = { value: 0 };
  /** Shader wind = the quality setting (windBase) times the world wind gust (0 in calm air), written in update(). */
  private wind = { value: 0 };
  private windBase = Config.vegetation.grass.look.wind;
  private fade = { value: new THREE.Vector2(Config.vegetation.grass.fadeStart, Config.vegetation.grass.fadeEnd) };
  private extraFade = { value: new THREE.Vector2(Config.vegetation.grass.denseFade[0], Config.vegetation.grass.denseFade[1]) };

  constructor() {
    Config.vegetation.grass.lods.forEach((lod, i) => {
      const list: THREE.BufferGeometry[] = [];
      for (let t = 0; t < GRASS_TYPE_COUNT; t++) {
        const clump = isGrassClump(t);
        // flowers exist in ring 0 only (the manager never asks for them in the far rings): share the ring 0 model, no extra geometry
        if (i > 0 && isGrassFlower(t)) list.push(this.lodGeometries[0][t]);
        else list.push(make(t, clump ? lod.clumpDensity : lod.density));
      }
      this.lodGeometries.push(list);
    });
    this.geometries = this.lodGeometries[0];
    this.material = this.makeMaterial(this.fade, '');
    this.extraMaterial = this.makeMaterial(this.extraFade, '-x');
  }

  /** Wind sway + distance fade in the vertex shader; the sun shining THROUGH the blades (translucency) in the fragment shader. */
  private makeMaterial(fade: { value: THREE.Vector2 }, key: string): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: this.atlas, alphaTest: this.atlas ? 0.42 : 0, alphaToCoverage: !!this.atlas });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uGrassTime = this.time;
      shader.uniforms.uGrassWind = this.wind;
      shader.uniforms.uGrassFade = fade;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uGrassTime;\nuniform float uGrassWind;\nuniform vec2 uGrassFade;\nattribute float aFlower;\nvarying float vFlower;')
        // flower parts keep their own colour: undo the per-instance green / dry tint for them
        .replace(
          '#include <color_vertex>',
          `#include <color_vertex>
          vFlower = aFlower;
          #if defined( USE_COLOR ) && defined( USE_INSTANCING_COLOR )
            vColor.rgb = mix(vColor.rgb, color.rgb, aFlower);
          #endif`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec4 gip = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float gFade = 1.0 - smoothstep(uGrassFade.x, uGrassFade.y, length(gip.xyz));
            float gph = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 0.7;
            transformed *= gFade;
          #endif`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFlower;')
        // both sides of a blade are lit like the ground (do not flip the normal on back faces)
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);')
        // REALISM: when the camera looks toward the sun, the light glows through the blades / petals (bright, yellow-green rim)
        .replace(
          '#include <opaque_fragment>',
          `#if NUM_DIR_LIGHTS > 0
            {
              vec3 gView = normalize(-vViewPosition);
              float gBack = pow(clamp(dot(-gView, directionalLights[0].direction), 0.0, 1.0), 3.0);
              float gTip = clamp(dot(vColor.rgb, vec3(0.333)) * 1.1, 0.0, 1.0);
              outgoingLight += diffuseColor.rgb * directionalLights[0].color * gBack * gTip * mix(0.3, 0.25, vFlower) * vec3(1.0, 1.08, 0.7);
            }
          #endif
          #include <opaque_fragment>`,
        );
    };
    m.customProgramCacheKey = () => 'grass-fade-v10' + key;
    return m;
  }

  update(time: number): void {
    this.time.value = time;
    this.wind.value = this.windBase * windGust.uniform.value;
  }

  /** Wind strength multiplier (quality presets / settings): 0 = still air, 1 = full sway. */
  setWind(w: number): void {
    this.windBase = w;
  }

  dispose(): void {
    for (const g of new Set(this.lodGeometries.flat())) g.dispose();
    this.material.dispose();
    this.extraMaterial.dispose();
    this.atlas?.dispose();
  }
}
