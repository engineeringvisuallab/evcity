import * as THREE from 'three';
import { Config } from '../core/Config';
import { mulberry32 } from '../world/Seed';

/**
 * Grass tuft model + material. One tuft = 7 blades (single triangles) leaning outward, base at y = 0, ~0.5-0.95 m tall.
 * Vertex colours are only a brightness ramp (dark at the root, bright at the tip); the real colour comes from the
 * per-instance colour (green -> dry, like the terrain shader). Normals point UP so the tufts are lit like the ground
 * under them, from either side. Wind sway + distance fade (tufts shrink to nothing between fadeStart and fadeEnd) are in
 * the vertex shader, so a tile never pops in or out.
 */
function tuft(): THREE.BufferGeometry {
  const rng = mulberry32(4242);
  const pos: number[] = [];
  const col: number[] = [];
  const nor: number[] = [];
  const blades = 7;
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    const r = 0.05 + rng() * 0.22;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const h = 0.5 + rng() * 0.45;
    const lean = 0.08 + rng() * 0.22;
    const w = 0.07 + rng() * 0.04;
    const dx = Math.cos(a), dz = Math.sin(a); // outward
    const tx = -dz, tz = dx; // sideways
    pos.push(cx - tx * w, 0, cz - tz * w, cx + tx * w, 0, cz + tz * w, cx + dx * lean, h, cz + dz * lean);
    col.push(0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 1, 1, 1);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

export class GrassAssets {
  readonly geometry = tuft();
  readonly material: THREE.MeshLambertMaterial;
  private time = { value: 0 };
  private fade = { value: new THREE.Vector2(Config.vegetation.grass.fadeStart, Config.vegetation.grass.fadeEnd) };

  constructor() {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uGrassTime = this.time;
      shader.uniforms.uGrassFade = this.fade;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uGrassTime;\nuniform vec2 uGrassFade;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec4 gip = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float gFade = 1.0 - smoothstep(uGrassFade.x, uGrassFade.y, length(gip.xyz));
            float gph = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 0.7;
            transformed.x += (sin(uGrassTime * 2.1 + gph) * 0.06 + sin(uGrassTime * 0.8 + gph * 0.5) * 0.04) * position.y * 1.3;
            transformed.z += cos(uGrassTime * 1.7 + gph) * 0.04 * position.y;
            transformed *= gFade;
          #endif`,
        );
      // both sides of a blade are lit like the ground (do not flip the normal on back faces)
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);');
    };
    m.customProgramCacheKey = () => 'grass-wind-fade';
    this.material = m;
  }

  update(time: number): void {
    this.time.value = time;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
