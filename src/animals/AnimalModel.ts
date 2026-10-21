import * as THREE from 'three';

/**
 * Procedural, rigged-by-hand animals (no external assets): deer (stag with antlers), tiger (striped) and lion (male with a mane).
 * Every animal faces +Z. Legs are two-part (hip pivot + knee pivot) so the manager can animate walk / trot / gallop,
 * the neck pivots to graze / eat, the tail swings. Geometry and materials are shared between animals of one species.
 */
export type Species = 'deer' | 'tiger' | 'lion';

export interface Rig {
  group: THREE.Group;
  body: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  tail: THREE.Group;
  /** Hip pivots: 0 front-left, 1 front-right, 2 back-left, 3 back-right. */
  legs: THREE.Group[];
  knees: THREE.Group[];
  /** Standing height of the hip pivots above the ground (m). */
  hipY: number;
  /** Body length (m), used for stride length and the bite distance. */
  length: number;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d') as CanvasRenderingContext2D);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Fur noise on a base colour: thousands of short, slightly lighter / darker strokes. */
function fur(c: CanvasRenderingContext2D, w: number, h: number, base: string, r: () => number, amount = 1800): void {
  c.fillStyle = base;
  c.fillRect(0, 0, w, h);
  for (let i = 0; i < amount; i++) {
    c.strokeStyle = r() > 0.5 ? 'rgba(255,240,200,0.10)' : 'rgba(40,20,0,0.10)';
    c.lineWidth = 1;
    const x = r() * w, y = r() * h;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + (r() - 0.5) * 4, y + 3 + r() * 5);
    c.stroke();
  }
}

function tigerTexture(): THREE.CanvasTexture {
  const r = rng(11);
  return canvasTexture(256, 256, (c) => {
    fur(c, 256, 256, '#d9822b', r);
    // stripes run in rings around the body (v is the body axis): wavy, tapering dark wedges from the back down the flanks
    for (let y = 6; y < 256; y += 9 + r() * 9) {
      for (let x = 0; x < 256; x += 1) {
        const back = 0.5 + 0.5 * Math.cos((x / 256) * Math.PI * 2); // 1 on the back, 0 on the belly
        const len = back > 0.15 ? Math.pow(back, 0.6) * (0.5 + r() * 0.25) : 0;
        if (len <= 0) continue;
        c.fillStyle = 'rgba(25,14,8,0.92)';
        const th = 2.2 + 3 * len;
        c.fillRect(x, y + Math.sin(x * 0.2 + y) * 1.6, 1.2, th * (0.5 + len));
      }
    }
    // pale belly band
    const g = c.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(255,245,225,0.0)');
    g.addColorStop(0.42, 'rgba(255,245,225,0.0)');
    g.addColorStop(0.5, 'rgba(255,245,225,0.85)');
    g.addColorStop(0.58, 'rgba(255,245,225,0.0)');
    g.addColorStop(1, 'rgba(255,245,225,0.0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  });
}

function deerTexture(): THREE.CanvasTexture {
  const r = rng(23);
  return canvasTexture(256, 256, (c) => {
    fur(c, 256, 256, '#a8703a', r);
    for (let i = 0; i < 160; i++) {
      c.fillStyle = 'rgba(255,248,230,0.85)';
      c.beginPath();
      c.arc(r() * 256, 20 + r() * 216, 1.6 + r() * 2.2, 0, Math.PI * 2);
      c.fill();
    }
    const g = c.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0.4, 'rgba(250,240,220,0)');
    g.addColorStop(0.5, 'rgba(250,240,220,0.9)');
    g.addColorStop(0.6, 'rgba(250,240,220,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  });
}

function lionTexture(): THREE.CanvasTexture {
  const r = rng(37);
  return canvasTexture(256, 256, (c) => {
    fur(c, 256, 256, '#c79a5c', r, 2600);
    const g = c.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0.4, 'rgba(240,220,180,0)');
    g.addColorStop(0.5, 'rgba(240,220,180,0.8)');
    g.addColorStop(0.6, 'rgba(240,220,180,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  });
}

interface Shared {
  fur: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  light: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  eye: THREE.MeshStandardMaterial;
}
const shared = new Map<Species, Shared>();
const sphere = new THREE.SphereGeometry(1, 16, 12);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 8);
const cone = new THREE.ConeGeometry(1, 1, 8);

function mats(sp: Species): Shared {
  let m = shared.get(sp);
  if (m) return m;
  const std = (color: number, rough = 0.9) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  if (sp === 'tiger') {
    m = { fur: new THREE.MeshStandardMaterial({ map: tigerTexture(), roughness: 0.95 }), dark: std(0x1a1008), light: std(0xf3e8d2), accent: std(0xd9822b), eye: std(0xe8c24a, 0.3) };
  } else if (sp === 'lion') {
    m = { fur: new THREE.MeshStandardMaterial({ map: lionTexture(), roughness: 0.95 }), dark: std(0x4a2f17), light: std(0xe8d6b0), accent: std(0x5b3a1c), eye: std(0xc89a2a, 0.3) };
  } else {
    m = { fur: new THREE.MeshStandardMaterial({ map: deerTexture(), roughness: 0.95 }), dark: std(0x2a1a10), light: std(0xf3eadb), accent: std(0xd6c7a1), eye: std(0x1a1008, 0.3) };
  }
  shared.set(sp, m);
  return m;
}

function ell(parent: THREE.Object3D, mat: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(sphere, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function rod(parent: THREE.Object3D, mat: THREE.Material, r0: number, len: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(cyl, mat);
  m.scale.set(r0, len, r0);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

interface Dim {
  bodyL: number; bodyH: number; bodyW: number;
  upper: number; lower: number; legR: number;
  neckL: number; headS: number;
}
const DIM: Record<Species, Dim> = {
  deer: { bodyL: 1.35, bodyH: 0.52, bodyW: 0.36, upper: 0.52, lower: 0.56, legR: 0.045, neckL: 0.62, headS: 0.16 },
  tiger: { bodyL: 1.75, bodyH: 0.62, bodyW: 0.5, upper: 0.36, lower: 0.36, legR: 0.1, neckL: 0.3, headS: 0.27 },
  lion: { bodyL: 1.65, bodyH: 0.64, bodyW: 0.5, upper: 0.4, lower: 0.38, legR: 0.105, neckL: 0.32, headS: 0.27 },
};

export function buildAnimal(sp: Species, variant = 0): Rig {
  const d = DIM[sp];
  const M = mats(sp);
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const hipY = d.upper + d.lower + 0.02;
  const body = new THREE.Group();
  body.position.y = hipY + d.bodyH * 0.35;
  group.add(body);

  // torso: two overlapping ellipsoids (chest + haunch) so it narrows at the waist
  const chest = ell(body, M.fur, d.bodyW / 2 * 1.08, d.bodyH / 2 * 1.1, d.bodyL * 0.36, 0, 0.02, d.bodyL * 0.2);
  const haunch = ell(body, M.fur, d.bodyW / 2, d.bodyH / 2, d.bodyL * 0.34, 0, 0, -d.bodyL * 0.2);
  const waist = ell(body, M.fur, d.bodyW / 2 * 0.9, d.bodyH / 2 * 0.95, d.bodyL * 0.3, 0, 0, 0);
  for (const m of [chest, haunch, waist]) { m.castShadow = true; }
  ell(body, M.light, d.bodyW / 2 * 0.8, d.bodyH / 2 * 0.5, d.bodyL * 0.42, 0, -d.bodyH * 0.28, 0); // pale underside

  // neck + head (pivot at the shoulders)
  const neck = new THREE.Group();
  neck.position.set(0, d.bodyH * 0.18, d.bodyL * 0.38);
  body.add(neck);
  const up = sp === 'deer' ? 0.85 : 0.35; // deer lift the head high, cats carry it level
  const nk = rod(neck, M.fur, d.bodyW * (sp === 'deer' ? 0.2 : 0.34), d.neckL, 0, d.neckL * 0.5 * up, d.neckL * 0.3);
  nk.rotation.x = sp === 'deer' ? 0.55 : 1.15;
  nk.position.set(0, d.neckL * 0.38 * up, d.neckL * 0.28);
  const head = new THREE.Group();
  head.position.set(0, d.neckL * 0.76 * up, d.neckL * 0.62);
  neck.add(head);
  const hs = d.headS;
  if (sp === 'deer') {
    ell(head, M.fur, hs * 0.5, hs * 0.55, hs * 0.95, 0, 0, hs * 0.2);
    ell(head, M.fur, hs * 0.34, hs * 0.36, hs * 0.7, 0, -hs * 0.18, hs * 0.85); // long muzzle
    ell(head, M.dark, hs * 0.16, hs * 0.14, hs * 0.14, 0, -hs * 0.12, hs * 1.5); // nose
  } else {
    ell(head, M.fur, hs * 0.95, hs * 0.85, hs * 1.0, 0, 0, hs * 0.15);
    ell(head, M.light, hs * 0.55, hs * 0.42, hs * 0.55, 0, -hs * 0.3, hs * 0.85); // muzzle
    ell(head, M.dark, hs * 0.2, hs * 0.14, hs * 0.14, 0, -hs * 0.08, hs * 1.28); // nose
  }
  // eyes
  for (const s of [-1, 1]) {
    ell(head, M.eye, hs * 0.1, hs * 0.1, hs * 0.07, s * hs * (sp === 'deer' ? 0.42 : 0.5), hs * 0.18, hs * (sp === 'deer' ? 0.55 : 0.65));
    const ear = new THREE.Mesh(cone, sp === 'deer' ? M.fur : M.fur);
    ear.scale.set(hs * (sp === 'deer' ? 0.28 : 0.3), hs * (sp === 'deer' ? 0.75 : 0.4), hs * 0.12);
    ear.position.set(s * hs * (sp === 'deer' ? 0.55 : 0.7), hs * (sp === 'deer' ? 0.62 : 0.75), -hs * 0.1);
    ear.rotation.z = -s * (sp === 'deer' ? 0.85 : 0.2);
    head.add(ear);
  }
  if (sp === 'deer' && variant % 3 !== 0) {
    // stag antlers: a main beam with three tines, swept back
    for (const s of [-1, 1]) {
      const beam = new THREE.Group();
      beam.position.set(s * hs * 0.28, hs * 0.5, -hs * 0.1);
      beam.rotation.set(-0.45, 0, -s * 0.35);
      head.add(beam);
      rod(beam, M.accent, 0.014, 0.5, 0, 0.25, 0);
      for (let i = 0; i < 3; i++) {
        const tine = rod(beam, M.accent, 0.011, 0.22 - i * 0.03, s * 0.05, 0.17 + i * 0.12, 0.05);
        tine.rotation.set(0.9, 0, -s * 0.55);
      }
    }
  }
  if (sp === 'lion') {
    // the male lion's mane: a dark, shaggy ball around the neck and the back of the head
    ell(neck, M.dark, hs * 1.55, hs * 1.5, hs * 1.25, 0, d.neckL * 0.45, d.neckL * 0.15);
    ell(neck, M.accent, hs * 1.2, hs * 1.15, hs * 1.1, 0, d.neckL * 0.45 - hs * 0.2, d.neckL * 0.18);
    neck.add(head); // keep the head in front of the mane
  }

  // tail
  const tail = new THREE.Group();
  tail.position.set(0, d.bodyH * 0.12, -d.bodyL * 0.46);
  body.add(tail);
  if (sp === 'deer') {
    const t = ell(tail, M.light, 0.055, 0.04, 0.1, 0, 0.02, -0.06);
    t.rotation.x = -0.3;
  } else {
    const t = rod(tail, M.fur, 0.045, d.bodyL * 0.62, 0, -d.bodyL * 0.1, -d.bodyL * 0.2);
    t.rotation.x = Math.PI / 2 - 0.6;
    ell(tail, sp === 'lion' ? M.dark : M.dark, 0.06, 0.06, 0.09, 0, -d.bodyL * 0.28, -d.bodyL * 0.36); // tail tuft / black tip
  }

  // legs
  const legs: THREE.Group[] = [];
  const knees: THREE.Group[] = [];
  const hz = [d.bodyL * 0.3, d.bodyL * 0.3, -d.bodyL * 0.3, -d.bodyL * 0.3];
  const hx = [-1, 1, -1, 1];
  for (let i = 0; i < 4; i++) {
    const hip = new THREE.Group();
    hip.position.set(hx[i] * d.bodyW * 0.3, hipY, hz[i]);
    group.add(hip);
    const front = i < 2;
    rod(hip, M.fur, d.legR * (front ? 1.25 : 1.4), d.upper, 0, -d.upper / 2, 0);
    const knee = new THREE.Group();
    knee.position.y = -d.upper;
    hip.add(knee);
    rod(knee, M.fur, d.legR, d.lower, 0, -d.lower / 2, 0);
    if (sp === 'deer') ell(knee, M.dark, d.legR * 1.1, d.legR * 1.5, d.legR * 1.4, 0, -d.lower, d.legR * 0.3); // hoof
    else ell(knee, M.fur, d.legR * 1.5, d.legR * 1.0, d.legR * 2.0, 0, -d.lower + d.legR * 0.4, d.legR * 0.8); // paw
    legs.push(hip);
    knees.push(knee);
  }
  group.traverse((o) => { o.matrixAutoUpdate = true; });
  return { group, body, neck, head, tail, legs, knees, hipY, length: d.bodyL };
}

/** Fish: one slim body, a tail fin at -Z that the shader wags; vertex colours = darker back, pale belly. */
export function buildFishGeometry(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(0.5, 12, 8);
  body.scale(0.36, 0.55, 1.0); // width, height, length (units: body length = 1)
  const tail = new THREE.ConeGeometry(0.34, 0.42, 4);
  tail.rotateX(-Math.PI / 2); // cone tip along -Z... then flatten sideways so it is a vertical fin
  tail.rotateZ(Math.PI / 2);
  tail.scale(1, 1, 1);
  tail.translate(0, 0, -0.62);
  const dorsal = new THREE.ConeGeometry(0.16, 0.34, 3);
  dorsal.rotateX(Math.PI / 2);
  dorsal.scale(0.2, 1, 1);
  dorsal.translate(0, 0.3, 0.02);
  const parts = [body, tail, dorsal];
  let n = 0;
  for (const p of parts) n += p.getAttribute('position').count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const index: number[] = [];
  let o = 0;
  for (const p of parts) {
    const pp = p.getAttribute('position'), pn = p.getAttribute('normal');
    const idx = p.getIndex();
    for (let i = 0; i < pp.count; i++) {
      pos.set([pp.getX(i), pp.getY(i), pp.getZ(i)], (o + i) * 3);
      nor.set([pn.getX(i), pn.getY(i), pn.getZ(i)], (o + i) * 3);
      const k = THREE.MathUtils.clamp(0.5 + pp.getY(i) * 1.6, 0.35, 1);
      col.set([k, k, k], (o + i) * 3);
    }
    if (idx) for (let i = 0; i < idx.count; i++) index.push(idx.getX(i) + o);
    else for (let i = 0; i < pp.count; i++) index.push(o + i);
    o += pp.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(index);
  return g;
}

export function buildFishMaterial(uTime: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.25, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 1.3;
        float tailAmt = smoothstep(0.1, -0.6, position.z);
        transformed.x += sin(uTime * 9.0 + ph + position.z * 5.0) * 0.14 * tailAmt;`,
      );
  };
  return m;
}
