import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Config } from '../core/Config';
import { TREE_KIND_COUNT, TreeKind } from './TreeTypes';

/**
 * Tree models (built from code, no files) + the shared tree material.
 * Every model is ONE merged geometry with vertex colours, base at y = 0, so a whole forest is a handful of draw calls.
 * Two detail levels per kind: 0 = near (LOD0 chunks), 1 = far (LOD1 chunks). Flat-shaded low-poly look.
 */

const BARK = 0x6b4a2f;
const BARK_PALM = 0x8a6d4b;

type Part = { geo: THREE.BufferGeometry; color: number };

/** Positions the part (scale, rotate, translate), makes it flat shaded and colours every vertex. */
function part(geo: THREE.BufferGeometry, color: number, opts: { x?: number; y?: number; z?: number; sx?: number; sy?: number; sz?: number; rx?: number; ry?: number; rz?: number } = {}): Part {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  if (opts.sx !== undefined || opts.sy !== undefined || opts.sz !== undefined) g.scale(opts.sx ?? 1, opts.sy ?? 1, opts.sz ?? 1);
  if (opts.rx) g.rotateX(opts.rx);
  if (opts.ry) g.rotateY(opts.ry);
  if (opts.rz) g.rotateZ(opts.rz);
  g.translate(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
  g.computeVertexNormals();
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return { geo: g, color };
}

const merge = (parts: Part[]): THREE.BufferGeometry => {
  const geo = mergeGeometries(parts.map((p) => p.geo), false)!;
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  for (const p of parts) p.geo.dispose();
  return geo;
};

const trunk = (rTop: number, rBot: number, h: number, seg: number, color = BARK, o: { x?: number; z?: number; rz?: number } = {}) =>
  part(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, true), color, { y: h / 2, ...o });

function broadleaf(detail: number): THREE.BufferGeometry {
  if (detail === 0) {
    return merge([
      trunk(0.28, 0.42, 3.4, 6),
      part(new THREE.IcosahedronGeometry(2.7, 0), 0x3f7d2c, { y: 5.4, sy: 0.85 }),
      part(new THREE.IcosahedronGeometry(1.9, 0), 0x4c8c35, { x: 1.3, y: 4.3, z: 0.7 }),
      part(new THREE.IcosahedronGeometry(1.7, 0), 0x377527, { x: -1.2, y: 4.9, z: -0.9, ry: 0.6 }),
    ]);
  }
  return merge([trunk(0.3, 0.4, 3.4, 4), part(new THREE.IcosahedronGeometry(3.1, 0), 0x3f7d2c, { y: 5.2, sy: 0.9 })]);
}

function pine(detail: number): THREE.BufferGeometry {
  const cone = (r: number, h: number, base: number, seg: number, color: number) => part(new THREE.ConeGeometry(r, h, seg, 1, true), color, { y: base + h / 2 });
  if (detail === 0) {
    return merge([
      trunk(0.2, 0.35, 3, 6),
      cone(2.6, 4.2, 2.2, 7, 0x2d5a2a),
      cone(2.0, 3.8, 4.2, 7, 0x2f6230),
      cone(1.3, 3.4, 6.4, 7, 0x356b34),
    ]);
  }
  return merge([trunk(0.25, 0.35, 3, 3), cone(2.4, 9.5, 2.5, 6, 0x2f6230)]);
}

function palm(detail: number): THREE.BufferGeometry {
  const crown = (r: number, h: number, y: number, seg: number, color: number, ry = 0) => part(new THREE.ConeGeometry(r, h, seg, 1, true), color, { y: y + h / 2, ry });
  if (detail === 0) {
    return merge([
      trunk(0.15, 0.28, 8.6, 5, BARK_PALM, { rz: 0 }),
      crown(3.2, 1.5, 8.2, 8, 0x4f8f3a),
      crown(2.4, 1.2, 8.6, 8, 0x5e9e43, 0.4),
    ]);
  }
  return merge([trunk(0.18, 0.28, 8.6, 3, BARK_PALM), crown(3.0, 1.6, 8.3, 6, 0x4f8f3a)]);
}

/** Geometries (shared by all chunks, never disposed per chunk) + one material with wind sway. */
export class TreeAssets {
  /** [kind][detail] */
  readonly geometries: THREE.BufferGeometry[][] = [];
  readonly material: THREE.MeshLambertMaterial;
  private time = { value: 0 };

  constructor() {
    const makers: Record<number, (d: number) => THREE.BufferGeometry> = {
      [TreeKind.broadleaf]: broadleaf,
      [TreeKind.pine]: pine,
      [TreeKind.palm]: palm,
    };
    for (let k = 0; k < TREE_KIND_COUNT; k++) this.geometries.push([makers[k](0), makers[k](1)]);

    // Crowns are open cones / one-sided blobs: draw both faces.
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const wind = Config.vegetation.windStrength;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTreeTime = this.time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTreeTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float ph = instanceMatrix[3].x * 0.071 + instanceMatrix[3].z * 0.053;
          #else
            float ph = 0.0;
          #endif
          float bend = max(position.y, 0.0) * ${wind.toFixed(4)};
          float gust = 1.0 + 0.5 * sin(uTreeTime * 0.37 + ph * 1.7);
          transformed.x += sin(uTreeTime * 1.4 + ph) * bend * gust;
          transformed.z += cos(uTreeTime * 1.1 + ph * 1.3) * bend * 0.7;`,
        );
    };
    m.customProgramCacheKey = () => 'tree-wind';
    this.material = m;
  }

  update(time: number): void {
    this.time.value = time;
  }

  dispose(): void {
    for (const pair of this.geometries) for (const g of pair) g.dispose();
    this.material.dispose();
  }
}
