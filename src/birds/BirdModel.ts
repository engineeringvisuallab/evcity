import * as THREE from 'three';
import { buildBirdData } from './BirdShapes';

/**
 * One bird model by species name ('crow', 'egret', 'swallow', 'dove', 'kite', 'eagle', 'kingfisher', 'parrot', 'heron', 'hornbill').
 * Faces +Z, wings along X, wingspan 1 (scaled per instance). The shapes are in BirdShapes.ts (body, head, beak, eyes, tail, legs, feathered wings).
 * Attributes: `color` = per-vertex plumage colour, `aWing` = how far along the wing a vertex is (0 = body, 1 = wing tip):
 * the vertex shader flaps it, so every bird of a species is ONE instanced draw call.
 */
export function createBirdGeometry(name = 'crow'): THREE.BufferGeometry {
  const d = buildBirdData(name);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(d.wing, 1));
  g.setIndex(d.index);
  g.computeVertexNormals();
  return g;
}

/**
 * Lambert material (sun + fog like everything else) using the plumage vertex colours (the per-bird instance colour only tints them a little),
 * with the flapping injected into the vertex shader.
 */
export function createBirdMaterial(uTime: { value: number }): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWing;\nattribute vec4 aBird;\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // aBird = (phase, flap rate rad/s, flap amplitude, glide). glide 0 = flaps all the time, 1 = mostly soars with a few flapping bursts.
        float burst = mix(1.0, smoothstep(-0.3, 0.4, sin(uTime * 0.35 + aBird.x * 3.0)), aBird.w);
        float amp = mix(0.06, aBird.z, burst);
        // the wing tip lags behind the shoulder, like a real downstroke
        float fl = sin(uTime * aBird.y + aBird.x - aWing * aWing * 0.8);
        float lift = fl * amp * aWing;
        transformed.y += lift - fl * amp * 0.05 * (1.0 - aWing);
        // a raised or lowered wing is shorter when seen from above
        transformed.x -= sign(transformed.x) * lift * lift * 1.2;
        transformed.z += fl * aWing * aWing * amp * 0.2;`,
      );
  };
  return m;
}
