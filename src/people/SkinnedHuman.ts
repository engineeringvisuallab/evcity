import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Appearance } from './PersonModel';
import type { HumanRig } from './HumanBody';
import {
  ARM, BONE, J, LEG, NECK, TORSO, armW, at, legW, neckW, propsOf, skinArrays, skirtW, slice, solid, torsoW, tubeData,
  type BodyType, type Ring, type V3, type Weights,
} from './SkinMath';

/**
 * A realistic person as ONE continuous skinned mesh on a 17-bone skeleton (bone names follow Mixamo, so a scanned GLB
 * character can replace it later without touching the animation code).
 *
 * Why: the old body was ~16 rigid pieces, so elbows / knees / shoulders showed gaps and the motion looked robotic.
 * Here every vertex is weighted to 1-4 bones, so the joints bend smoothly like skin.
 *
 * The geometry (position / normal / skin weights / groups) is built once per body type and shared by every person;
 * each person only owns a skeleton and picks its colours through the material list (skin, shirt, pants, shoes,
 * dark, eye white, lips). Hair, beard and hats are small static meshes on the head bone.
 */

/** Head-wear / hair geometry from HumanBody (in the old pivot-relative space, hips at y = 0). */
export interface HeadParts {
  hair: THREE.BufferGeometry;
  hairBeard: THREE.BufferGeometry;
  cap: THREE.BufferGeometry;
  helmet: THREE.BufferGeometry;
  topi: THREE.BufferGeometry;
}

type Outfit = NonNullable<Appearance['outfit']>;

// material slots (index into the material array and the geometry groups)
const SKIN = 0;
const SHIRT = 1;
const PANTS = 2;
const SHOES = 3;
const DARK = 4;
const WHITE = 5;
const LIPS = 6;
const SLOTS = 7;

const SEG_BODY = 18;
const SEG_LIMB = 12;

interface Base {
  geometry: THREE.BufferGeometry;
  /** Reflective vest bands (not skinned, parented to the chest bone, chest-bone space). */
  stripes: THREE.BufferGeometry;
}

const bases = new Map<string, Base>();
const getBase = (type: BodyType, lod: 0 | 1, outfit: Outfit): Base => {
  const key = `${type}:${lod}:${outfit}`;
  let b = bases.get(key);
  if (!b) {
    b = buildBase(type, lod, outfit);
    bases.set(key, b);
  }
  return b;
};
let lidGeo: THREE.BufferGeometry | null = null;
let headCache: { hair: THREE.BufferGeometry; hairBeard: THREE.BufferGeometry; cap: THREE.BufferGeometry; helmet: THREE.BufferGeometry; topi: THREE.BufferGeometry } | null = null;

const ell = (r: V3, p: V3, ws = 14, hs = 10): THREE.BufferGeometry => {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.deleteAttribute('uv');
  g.scale(r[0], r[1], r[2]);
  g.translate(p[0], p[1], p[2]);
  return g;
};

function tubeGeo(rings: Ring[], seg: number, caps = true): THREE.BufferGeometry {
  const d = tubeData(rings, seg, caps);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
  g.setIndex(d.idx);
  g.computeVertexNormals();
  return g;
}

function buildBase(type: BodyType, lod: 0 | 1, outfit: Outfit): Base {
  const P = propsOf(type);
  // lod 1 = far version: same parts and materials, fewer segments (about 40% of the triangles)
  const segB = lod ? 10 : SEG_BODY;
  const segL = lod ? 7 : SEG_LIMB;
  const E = (r: V3, p: V3, ws = 14, hs = 10): THREE.BufferGeometry => ell(r, p, lod ? Math.max(5, Math.round(ws * 0.5)) : ws, lod ? Math.max(3, Math.round(hs * 0.5)) : hs);
  const lists: THREE.BufferGeometry[][] = Array.from({ length: SLOTS }, () => []);

  /** Skin the geometry with `fn` and put it in material slot `slot`. */
  const add = (g: THREE.BufferGeometry, slot: number, fn: (x: number, y: number, z: number) => Weights): void => {
    const pos = g.getAttribute('position').array;
    const s = skinArrays(pos, fn);
    g.setAttribute('skinIndex', new THREE.BufferAttribute(s.index, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(s.weight, 4));
    lists[slot].push(g);
  };
  const body = { sx: P.torsoX, sz: P.torsoZ };

  // ---- torso: trousers round the hips, shirt over the chest (the shirt hangs over the waistband), belt, neck ----
  add(tubeGeo(slice(TORSO, 0.84, 1.0, body), segB), PANTS, (_x, y) => torsoW(y));
  add(tubeGeo(slice(TORSO, 0.985, 1.56, { ...body, grow: 0.008 }), segB), SHIRT, (_x, y) => torsoW(y));
  add(tubeGeo(slice(TORSO, 0.955, 0.995, { ...body, grow: 0.007 }), segB, false), DARK, (_x, y) => torsoW(y));
  add(tubeGeo(slice(NECK, 1.5, 1.63), lod ? 7 : 12), SKIN, (_x, y) => neckW(y));

  // ---- long garments: panjabi (shirt colour, to the knees, loose) or lungi (trouser colour, wrapped to mid-calf, bare calves) ----
  if (outfit !== 'shirt') {
    const top = at(TORSO, 1.06);
    const topRing: Ring = { y: 1.06, rx: top[0] * P.torsoX + 0.006, rz: top[1] * P.torsoZ + 0.006, cx: 0, cz: top[2] };
    const mk = (y: number, rx: number, rz: number): Ring => ({ y, rx: rx * P.torsoX, rz: rz * P.torsoZ, cx: 0, cz: 0 });
    if (outfit === 'panjabi') {
      const rings = [mk(0.55, 0.21, 0.16), mk(0.7, 0.2, 0.15), mk(0.85, 0.188, 0.132), mk(0.985, 0.168, 0.116), topRing];
      add(tubeGeo(rings, segB), SHIRT, (x, y) => skirtW(x, y, 0.55, 0.55));
    } else {
      const rings = [mk(0.31, 0.15, 0.11), mk(0.55, 0.165, 0.115), mk(0.75, 0.172, 0.12), mk(0.9, 0.185, 0.128), mk(0.99, 0.165, 0.115), topRing];
      add(tubeGeo(rings, segB), PANTS, (x, y) => skirtW(x, y, 0.31, 0.85));
    }
  }

  // ---- arms and legs ----
  const shoulderX = 0.285 * P.shoulder;
  const hipX = 0.095 * P.legX;
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? -1 : 1;
    const ax = sx * shoulderX;
    const lx = sx * hipX;
    const hand = side === 'L' ? BONE.handL : BONE.handR;
    const foot = side === 'L' ? BONE.footL : BONE.footR;
    const arm = { sx: P.armX, sz: P.armZ, cx: ax };

    // short sleeve (shirt) over the upper arm, bare forearm
    add(tubeGeo(slice(ARM, 1.215, 1.49, { ...arm, grow: 0.004 }), segL), SHIRT, (_x, y) => armW(side, y));
    add(tubeGeo(slice(ARM, 0.89, 1.225, arm), segL), SKIN, (_x, y) => armW(side, y));
    // deltoid cap that closes the gap between the neck slope and the arm
    add(E([0.082, 0.055, 0.072], [sx * 0.235 * P.shoulder, 1.455, 0], 12, 8), SHIRT, () => [
      [BONE.chest, 0.6], [side === 'L' ? BONE.armL : BONE.armR, 0.4], [BONE.chest, 0], [BONE.chest, 0],
    ]);
    // hand: palm, fingers, thumb on the inner side
    add(E([0.033, 0.045, 0.017], [ax, 0.835, 0.002], 10, 8), SKIN, () => solid(hand));
    add(E([0.029, 0.045, 0.013], [ax, 0.775, 0.004], 10, 8), SKIN, () => solid(hand));
    add(E([0.011, 0.032, 0.012], [ax - sx * 0.034, 0.82, 0.016], 8, 6), SKIN, () => solid(hand));

    // trousers: one tube hip -> ankle
    if (outfit === 'lungi') {
      add(tubeGeo(slice(LEG, 0.09, 0.32, { sx: P.legX, sz: P.legZ, cx: lx }), segB), SKIN, (_x, y) => legW(side, y)); // bare calves
      add(tubeGeo(slice(LEG, 0.31, 0.93, { sx: P.legX, sz: P.legZ, cx: lx }), segB), PANTS, (_x, y) => legW(side, y)); // (hidden under the lungi)
    } else {
      add(tubeGeo(slice(LEG, 0.09, 0.93, { sx: P.legX, sz: P.legZ, cx: lx }), segB), PANTS, (_x, y) => legW(side, y));
    }
    // shoe + ankle shaft
    add(E([0.05 * P.legX, 0.042, 0.125], [lx, 0.047, 0.05], 14, 9), SHOES, () => solid(foot));
    add(E([0.044 * P.legX, 0.045, 0.048], [lx, 0.105, -0.005], 10, 7), SHOES, () => solid(foot));
  }

  // ---- head: cranium + jaw, nose, ears, eyes, brows, mouth ----
  const hx = P.headX;
  const hz = P.headZ;
  const headW = (): Weights => solid(BONE.head);
  const hs = (r: V3, p: V3, a = 10, b = 8): THREE.BufferGeometry => E([r[0] * hx, r[1], r[2] * hz], [p[0] * hx, p[1], p[2] * hz], a, b);
  add(hs([0.098, 0.125, 0.11], [0, 1.66, 0], 18, 14), SKIN, headW);
  add(hs([0.078, 0.075, 0.085], [0, 1.605, 0.022], 14, 10), SKIN, headW);
  add(hs([0.017, 0.022, 0.02], [0, 1.652, 0.106]), SKIN, headW);
  for (const sx of [-1, 1]) {
    add(hs([0.014, 0.028, 0.02], [sx * 0.099, 1.665, -0.004]), SKIN, headW);
    add(hs([0.0125, 0.0095, 0.007], [sx * 0.037, 1.675, 0.1], 8, 6), WHITE, headW);
    add(hs([0.0065, 0.0065, 0.004], [sx * 0.037, 1.675, 0.105], 6, 5), DARK, headW);
  }
  add(hs([0.022, 0.004, 0.006], [0, 1.612, 0.1], 8, 5), DARK, headW);
  add(hs([0.024, 0.007, 0.008], [0, 1.6, 0.099], 8, 5), LIPS, headW);

  // merge each material slot, then all slots with one group per slot (group i uses material i)
  const merged = lists.map((l) => mergeGeometries(l, false));
  const geometry = mergeGeometries(merged, true);

  // ---- reflective vest bands (static, follow the chest bone) ----
  const chestY = J.chest;
  const bandAt = (y: number): THREE.BufferGeometry => tubeGeo(slice(TORSO, y - 0.0275, y + 0.0275, { ...body, grow: 0.016 }), segB, false);
  const front = at(TORSO, 1.3);
  const strapZ = (front[2] + front[1]) * P.torsoZ + 0.016;
  const straps = [-1, 1].map((sx) => {
    const g = new THREE.BoxGeometry(0.026, 0.31, 0.012);
    g.deleteAttribute('uv');
    g.translate(sx * 0.087 * P.torsoX, 1.305, strapZ);
    return g;
  });
  const stripes = mergeGeometries([bandAt(1.1), bandAt(1.3), ...straps], false);
  stripes.translate(0, -chestY, 0);

  return { geometry, stripes };
}

function headParts(hp: HeadParts): NonNullable<typeof headCache> {
  if (headCache) return headCache;
  // the old geometry is hips-relative (hips at y = 0); a child of the head bone needs head-bone space
  const dy = J.hips - J.head;
  const conv = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    const c = g.clone();
    c.translate(0, dy, 0);
    return c;
  };
  headCache = { hair: conv(hp.hair), hairBeard: conv(hp.hairBeard), cap: conv(hp.cap), helmet: conv(hp.helmet), topi: conv(hp.topi) };
  return headCache;
}

const toHex = (r: number, g: number, b: number): number => (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);

/** Build one skinned person. `mat(colour)` supplies (shared or owned) materials, like the old rigid builder. */
export function buildSkinnedBody(look: Appearance, mat: (colour: number) => THREE.Material, hp: HeadParts): HumanRig {
  const type: BodyType = look.bodyType ?? 'average';
  const P = propsOf(type);
  const outfit: Outfit = look.outfit ?? 'shirt';
  const base = getBase(type, 0, outfit);
  const heads = headParts(hp);

  // ---- skeleton (rest pose, hips joint at y = 0.9 like the old rig) ----
  const pivot = new THREE.Group();
  pivot.position.y = J.hips;
  const bones: THREE.Bone[] = [];
  const mk = (index: number, name: string, parent: THREE.Object3D, x: number, y: number): THREE.Bone => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, 0);
    parent.add(b);
    bones[index] = b;
    return b;
  };
  const hips = mk(BONE.hips, 'mixamorigHips', pivot, 0, 0);
  const spine = mk(BONE.spine, 'mixamorigSpine', hips, 0, J.spine - J.hips);
  const chest = mk(BONE.chest, 'mixamorigSpine2', spine, 0, J.chest - J.spine);
  const neck = mk(BONE.neck, 'mixamorigNeck', chest, 0, J.neck - J.chest);
  const head = mk(BONE.head, 'mixamorigHead', neck, 0, J.head - J.neck);
  const shoulderX = 0.285 * P.shoulder;
  const hipX = 0.095 * P.legX;
  const limbs = {} as Record<'L' | 'R', { arm: THREE.Bone; fore: THREE.Bone; hand: THREE.Bone; leg: THREE.Bone; shin: THREE.Bone; foot: THREE.Bone }>;
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? -1 : 1;
    const n = side === 'L' ? 'Left' : 'Right';
    const arm = mk(side === 'L' ? BONE.armL : BONE.armR, `mixamorig${n}Arm`, chest, sx * shoulderX, J.shoulder - J.chest);
    const fore = mk(side === 'L' ? BONE.foreL : BONE.foreR, `mixamorig${n}ForeArm`, arm, 0, J.elbow - J.shoulder);
    const hand = mk(side === 'L' ? BONE.handL : BONE.handR, `mixamorig${n}Hand`, fore, 0, J.wrist - J.elbow);
    const leg = mk(side === 'L' ? BONE.legL : BONE.legR, `mixamorig${n}UpLeg`, hips, sx * hipX, 0);
    const shin = mk(side === 'L' ? BONE.shinL : BONE.shinR, `mixamorig${n}Leg`, leg, 0, J.knee - J.hips);
    const foot = mk(side === 'L' ? BONE.footL : BONE.footR, `mixamorig${n}Foot`, shin, 0, J.ankle - J.knee);
    limbs[side] = { arm, fore, hand, leg, shin, foot };
  }

  // ---- the skinned mesh: sits at y = -0.9 under the pivot, so its vertices are in "feet at 0" coordinates ----
  pivot.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const lip = toHex(((look.skin >> 16) & 255) * 0.8, ((look.skin >> 8) & 255) * 0.6, (look.skin & 255) * 0.58);
  const mats: THREE.Material[] = [mat(look.skin), mat(look.shirt), mat(look.pants), mat(look.shoes), mat(0x1c1612), mat(0xeeeae2), mat(lip)];
  const mesh = new THREE.SkinnedMesh(base.geometry, mats);
  mesh.position.y = -J.hips;
  mesh.castShadow = true;
  pivot.add(mesh);
  mesh.bind(skeleton);
  // the first-frame bounding sphere is taken in the rest pose: widen it so swinging arms / legs never get culled
  mesh.computeBoundingSphere();
  if (mesh.boundingSphere) mesh.boundingSphere.radius *= 1.3;

  // ---- static extras ----
  const solidMesh = (geo: THREE.BufferGeometry, colour: number, parent: THREE.Object3D): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat(colour));
    parent.add(m);
    return m;
  };
  const addHead = (geo: THREE.BufferGeometry, colour: number): void => {
    solidMesh(geo, colour, head).scale.set(P.headX, 1, P.headZ);
  };
  addHead(look.beard ? heads.hairBeard : heads.hair, look.hair);
  if (look.headwear === 'cap') addHead(heads.cap, look.headwearColor);
  else if (look.headwear === 'helmet') addHead(heads.helmet, look.headwearColor);
  else if (look.headwear === 'topi') addHead(heads.topi, look.headwearColor);
  if (look.vest) solidMesh(base.stripes, 0xe5e4d7, chest);

  // ---- eyelids: a skin-coloured shell over each eye; scale.y = 0.02 (open, hidden) .. 1 (closed), see HumanMotion.blink ----
  if (!lidGeo) {
    lidGeo = new THREE.SphereGeometry(1, 10, 7);
    lidGeo.deleteAttribute('uv');
    lidGeo.scale(0.0138, 0.0108, 0.0094);
    lidGeo.translate(0, -0.0108, 0); // the group origin is the top of the eye
  }
  const eyelids: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(sx * 0.037 * P.headX, 1.675 + 0.0108 - J.head, 0.1 * P.headZ);
    g.scale.y = 0.02;
    head.add(g);
    g.add(new THREE.Mesh(lidGeo, mat(look.skin)));
    eyelids.push(g);
  }

  let lod: 0 | 1 = 0;
  const setLod = (level: 0 | 1): void => {
    if (level === lod) return;
    lod = level;
    mesh.geometry = getBase(type, level, outfit).geometry;
  };
  const dispose = (): void => skeleton.dispose();

  return {
    pivot,
    legL: limbs.L.leg, legR: limbs.R.leg, shinL: limbs.L.shin, shinR: limbs.R.shin,
    armL: limbs.L.arm, armR: limbs.R.arm, foreL: limbs.L.fore, foreR: limbs.R.fore,
    hips, spine, chest, neck, head,
    handL: limbs.L.hand, handR: limbs.R.hand, footL: limbs.L.foot, footR: limbs.R.foot,
    eyelids, setLod, dispose,
  };
}
