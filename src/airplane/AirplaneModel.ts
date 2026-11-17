// AIRCRAFT models: three.js wrapper (the only file of the airplane module, with the manager, that imports three). The group's origin is on the ground under the
// middle of the fuselage, nose towards local +X. Use `place()` each frame with the state from AirplaneLogic (position, heading, pitch, roll, gear).
// Materials: the fuselage and the fin(s) carry the painted livery (src/airplane/Livery.ts, canvas textures shared by all planes of a kind); wings, engines and
// stabilisers use vertex colours; the lights (wing-tip navigation lights, beacons) are emissive and the beacons blink. Without a canvas (a test, a worker) the
// models fall back to vertex colours only.
import * as THREE from 'three';
import { buildPlaneMesh, type PlaneMeshData } from './AirplaneMesh';
import { buildFighterMesh } from './FighterMesh';
import { paintAirlinerFin, paintAirlinerFuselage, paintFighterFin, paintFighterFuselage, type Ctx2D } from './Livery';
import type { GeoArrays } from './Loft';

export interface AirplaneModel {
  group: THREE.Group;
  setGear(down: boolean): void;
  /** x, y, z in world metres (y = height of the wheels' ground level); heading (rad): travel direction = (cos h, sin h) in the (x, z) plane (h = -PI/2 is NORTH);
   *  pitch + = nose up, roll + = right wing down. */
  place(x: number, y: number, z: number, heading: number, pitch: number, roll: number): void;
  dispose(): void;
}

/** 'airliner' (the passenger jet) or 'fighter' (a military jet). */
export type AirplaneKind = 'airliner' | 'fighter';

function toGeometry(a: GeoArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(a.colors, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(a.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(a.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------ shared textures (one per kind, reference counted) */

type Paint = (ctx: Ctx2D, w: number, h: number) => void;
const texCache = new Map<string, { tex: THREE.Texture; users: number }>();
const TEX_SIZE = { fuselage: [2048, 1024], fin: [512, 512] } as const;

/** A canvas texture from a painter, or null when there is no DOM canvas (tests / workers). Textures are shared and freed when the last plane is disposed. */
function acquireTexture(key: string, w: number, h: number, paint: Paint): THREE.Texture | null {
  const hit = texCache.get(key);
  if (hit) { hit.users++; return hit.tex; }
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  paint(ctx as unknown as Ctx2D, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false; // the painters use canvas y = v * height
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping; // v wraps round the fuselage
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  texCache.set(key, { tex, users: 1 });
  return tex;
}
function releaseTexture(key: string): void {
  const hit = texCache.get(key);
  if (!hit) return;
  if (--hit.users <= 0) { hit.tex.dispose(); texCache.delete(key); }
}

const KIND = {
  airliner: { build: buildPlaneMesh, fuse: paintAirlinerFuselage, fin: paintAirlinerFin, rough: 0.34, metal: 0.18, bodyRough: 0.42, bodyMetal: 0.3 },
  fighter: { build: buildFighterMesh, fuse: paintFighterFuselage, fin: paintFighterFin, rough: 0.5, metal: 0.4, bodyRough: 0.5, bodyMetal: 0.45 },
} as const;

export function createAirplaneModel(kind: AirplaneKind = 'airliner'): AirplaneModel {
  const K = KIND[kind];
  const data: PlaneMeshData = K.build();
  const geos = [toGeometry(data.fuselage), toGeometry(data.fin), toGeometry(data.body), toGeometry(data.gear), toGeometry(data.lights)];
  const [fuseGeo, finGeo, bodyGeo, gearGeo, lightGeo] = geos;
  const fuseKey = `${kind}-fuselage`, finKey = `${kind}-fin`;
  const fuseTex = acquireTexture(fuseKey, TEX_SIZE.fuselage[0], TEX_SIZE.fuselage[1], K.fuse);
  const finTex = acquireTexture(finKey, TEX_SIZE.fin[0], TEX_SIZE.fin[1], K.fin);
  const fuseMat = new THREE.MeshStandardMaterial(fuseTex ? { map: fuseTex, roughness: K.rough, metalness: K.metal } : { vertexColors: true, roughness: K.rough, metalness: K.metal });
  const finMat = new THREE.MeshStandardMaterial(finTex ? { map: finTex, roughness: K.rough, metalness: K.metal } : { vertexColors: true, roughness: K.rough, metalness: K.metal });
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: K.bodyRough, metalness: K.bodyMetal });
  const gearMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.2 });
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, shadow = true): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.name = `${kind}-${name}`;
    m.castShadow = shadow;
    return m;
  };
  const fuse = mk(fuseGeo, fuseMat, 'fuselage'), fin = mk(finGeo, finMat, 'fin'), body = mk(bodyGeo, bodyMat, 'body');
  const gear = mk(gearGeo, gearMat, 'gear'), lights = mk(lightGeo, lightMat, 'lights', false);
  const group = new THREE.Group();
  group.name = kind === 'fighter' ? 'fighter' : 'airplane';
  group.add(fuse, fin, body, gear, lights);
  group.rotation.order = 'YZX'; // yaw, then pitch (about the wing axis), then roll (about the fuselage axis)
  let phase = Math.random() * 3; // the beacons / strobes of two planes do not blink together
  return {
    group,
    setGear(down: boolean): void { gear.visible = down; },
    place(x, y, z, heading, pitch, roll): void {
      group.position.set(x, y, z);
      // three.js rotation.y = +a turns local +X towards -Z; our heading convention: (cos h, sin h) in the (x, z) plane, so rotation.y = -h
      group.rotation.set(roll, -heading, pitch);
      phase += 0.016;
      lights.visible = Math.sin(phase * 7) > -0.3; // anti-collision light blink (about every 0.9 s)
    },
    dispose(): void {
      for (const g of geos) g.dispose();
      for (const m of [fuseMat, finMat, bodyMat, gearMat, lightMat]) m.dispose();
      releaseTexture(fuseKey);
      releaseTexture(finKey);
    },
  };
}
