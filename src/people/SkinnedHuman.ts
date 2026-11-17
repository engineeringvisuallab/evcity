import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Appearance } from './PersonModel';
import type { HumanRig } from './HumanBody';
import { BONE, HEAD_LIFT, HIP_X, J, SHOULDER_X, propsOf, type BodyType } from './SkinMath';
import { SLOTS, buildParts, buildStripes, type Outfit, type Part } from './BodyParts';

/**
 * A realistic person as ONE continuous skinned mesh on a 17-bone skeleton (bone names follow Mixamo, so a scanned GLB
 * character can replace it later without touching the animation code).
 *
 * Why: the old body was ~16 rigid pieces, so elbows / knees / shoulders showed gaps and the motion looked robotic.
 * Here every vertex is weighted to 1-4 bones, so the joints bend smoothly like skin.
 *
 * The parts themselves (shapes, weights) are plain arrays from BodyParts.ts. The geometry (position / normal / skin
 * weights / one material group per slot) is built once per body type + LOD + outfit and shared by every person;
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

function plainGeo(pos: Float32Array, idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function partGeo(p: Part): THREE.BufferGeometry {
  const g = plainGeo(p.pos, p.idx);
  g.setAttribute('skinIndex', new THREE.BufferAttribute(p.skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(p.skinWeight, 4));
  return g;
}

function buildBase(type: BodyType, lod: 0 | 1, outfit: Outfit): Base {
  const lists: THREE.BufferGeometry[][] = Array.from({ length: SLOTS }, () => []);
  for (const p of buildParts(type, lod, outfit)) lists[p.slot].push(partGeo(p));
  // merge each material slot, then all slots with one group per slot (group i uses material i)
  const merged = lists.map((l) => mergeGeometries(l, false));
  const geometry = mergeGeometries(merged, true);
  const stripes = mergeGeometries(buildStripes(type).map((t) => plainGeo(t.pos, t.idx)), false);
  return { geometry, stripes };
}

function headParts(hp: HeadParts): NonNullable<typeof headCache> {
  if (headCache) return headCache;
  // the old geometry is hips-relative (hips at y = 0); a child of the head bone needs head-bone space
  const dy = J.hips - J.head + HEAD_LIFT;
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
  const shoulderX = SHOULDER_X * P.shoulder;
  const hipX = HIP_X * P.legX;
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

  // ---- eyelids: a skin-coloured shell over each eye; scale.y = 0.3 (resting) .. 1 (closed), see HumanMotion.blink ----
  if (!lidGeo) {
    lidGeo = new THREE.SphereGeometry(1, 10, 7);
    lidGeo.deleteAttribute('uv');
    lidGeo.scale(0.0125, 0.0095, 0.0075);
    lidGeo.translate(0, -0.0095, 0); // the group origin is the top of the eye
  }
  const eyelids: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(sx * 0.033 * P.headX, 1.675 + HEAD_LIFT + 0.0095 - J.head, 0.09 * P.headZ);
    g.scale.y = 0.3; // rest: the upper lid covers the top of the eye (blink goes up to 1)
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
