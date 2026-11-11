import * as THREE from 'three';
import { Parts } from './EVLabParts';
import type { TowerTextures } from './EVLabTowerTextures';
import { CORE, CORE_TOP, ROOF_Y, SETBACKS, T, levelY, ringOf, ringPoints } from './EVLabTowerLayout';

export const SPIRE_TOP_Y = 442;

export interface FacadeBuild {
  group: THREE.Group;
  setNight(k: number): void;
  update(t: number): void;
  /** Triangle count (for the budget test). */
  tris: number;
}

/**
 * The outside of the tall tower: a curtain wall loft (one band per floor, 8 sides with chamfered corners), champagne slab ledges and corner
 * trims (instanced), three sky-garden set-backs, a glowing crown and the spire. One tiled texture, ~1.1k triangles for the glass, ~15k in all.
 */
export function buildFacade(P: Parts, TT: TowerTextures): FacadeBuild {
  const { k } = P;
  const g = new THREE.Group();
  g.name = 'EVLabFacade';
  const glass = k.own(new THREE.MeshPhongMaterial({ map: TT.curtain, emissiveMap: TT.curtainGlow, emissive: 0xffffff, emissiveIntensity: 0.1, specular: 0x9fc6d8, shininess: 70 }));
  const metal = k.own(new THREE.MeshLambertMaterial({ color: 0xcdb27a, emissive: 0xffd58a, emissiveIntensity: 0.22 }));
  const crown = k.own(new THREE.MeshLambertMaterial({ color: 0xfff4d6, emissive: 0xffe9b0, emissiveIntensity: 1.2 }));
  const marble = P.lit(P.t.marbleCream, 0xffffff, 0.16);
  const leaf = P.lit(null, 0x2f8a46, 0.3);
  let tris = 0;

  // ---------------------------------------------------------------- glass loft: bands of 8 quads
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const band = (n: number, y0: number, y1: number, vFrac: number): void => {
    const pts = ringPoints(ringOf(n));
    const row = (n - 1) % 16;
    const vb = 1 - (row + 1) / 16;
    let u = (n * 0.37) % 1;
    for (let i = 0; i < 8; i++) {
      const a = pts[i], b = pts[(i + 1) % 8];
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      const nx = dz / len, nz = -dx / len;
      const base = pos.length / 3;
      const u1 = u + len / 24;
      const v1 = vb + vFrac / 16;
      pos.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y1, a[1]);
      for (let j = 0; j < 4; j++) nor.push(nx, 0, nz);
      uv.push(u, vb, u1, vb, u1, v1, u, v1);
      idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
      u = u1;
    }
  };
  for (let n = 1; n <= T.top; n++) band(n, levelY(n), levelY(n) + T.floorH, 1);
  band(T.top, ROOF_Y, ROOF_Y + 2.8, 2.8 / T.floorH); // the roof-garden balustrade
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  lg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  lg.setIndex(idx);
  const loft = new THREE.Mesh(k.own(lg), glass);
  loft.name = 'curtainWall';
  g.add(loft);
  tris += idx.length / 3;

  // ---------------------------------------------------------------- instanced slab ledges and corner trims
  const ledgeGeo = k.own(new THREE.BoxGeometry(1, 0.5, 0.45));
  const trimGeo = k.own(new THREE.BoxGeometry(0.45, T.floorH, 0.45));
  const levels = T.roof;
  const ledges = new THREE.InstancedMesh(ledgeGeo, metal, levels * 8);
  const trims = new THREE.InstancedMesh(trimGeo, metal, T.top * 8);
  const o = new THREE.Object3D();
  let li = 0, ti = 0;
  for (let n = 1; n <= levels; n++) {
    const r = ringOf(Math.min(n, T.top));
    const pts = ringPoints(r);
    const y = levelY(n);
    for (let i = 0; i < 8; i++) {
      const a = pts[i], b = pts[(i + 1) % 8];
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      const nx = dz / len, nz = -dx / len;
      o.position.set((a[0] + b[0]) / 2 + nx * 0.18, y - 0.05, (a[1] + b[1]) / 2 + nz * 0.18);
      o.rotation.set(0, Math.atan2(-dz, dx), 0);
      o.scale.set(len + 0.3, 1, 1);
      o.updateMatrix();
      ledges.setMatrixAt(li++, o.matrix);
      if (n <= T.top) {
        o.position.set(a[0] + nx * 0.1, y + T.floorH / 2, a[1] + nz * 0.1);
        o.rotation.set(0, 0, 0);
        o.scale.set(1, 1, 1);
        o.updateMatrix();
        trims.setMatrixAt(ti++, o.matrix);
      }
    }
  }
  ledges.count = li; trims.count = ti;
  ledges.frustumCulled = trims.frustumCulled = false;
  g.add(ledges, trims);
  tris += (li + ti) * 12;

  // ---------------------------------------------------------------- sky-garden set-backs: a marble terrace ring with shrubs and a glass-gold rail
  const shrubGeo = k.own(new THREE.SphereGeometry(0.9, 8, 6));
  const shrubs = new THREE.InstancedMesh(shrubGeo, leaf, SETBACKS.length * 60);
  let si = 0;
  for (const sb of SETBACKS) {
    const outer = ringPoints(ringOf(sb - 1)), inner = ringPoints(ringOf(sb));
    const y = levelY(sb) + 0.02;
    const p: number[] = [], ix: number[] = [], uu: number[] = [];
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      const b = p.length / 3;
      p.push(outer[i][0], y, outer[i][1], outer[j][0], y, outer[j][1], inner[j][0], y, inner[j][1], inner[i][0], y, inner[i][1]);
      uu.push(0, 0, 1, 0, 1, 1, 0, 1);
      ix.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    tg.setAttribute('uv', new THREE.Float32BufferAttribute(uu, 2));
    tg.setIndex(ix);
    tg.computeVertexNormals();
    g.add(new THREE.Mesh(k.own(tg), marble));
    tris += 16;
    // shrubs on the strip (midway between the two rings)
    for (let s = 0; s < 60; s++) {
      const f = (s + 0.5) / 60 * 8, i = Math.floor(f) % 8, t = f - Math.floor(f);
      const a = outer[i], b = outer[(i + 1) % 8], c = inner[i], d = inner[(i + 1) % 8];
      const px = (a[0] + (b[0] - a[0]) * t) * 0.5 + (c[0] + (d[0] - c[0]) * t) * 0.5;
      const pz = (a[1] + (b[1] - a[1]) * t) * 0.5 + (c[1] + (d[1] - c[1]) * t) * 0.5;
      o.position.set(px, y + 0.5, pz);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 0.7 + (s % 3) * 0.15, 1);
      o.updateMatrix();
      shrubs.setMatrixAt(si++, o.matrix);
    }
  }
  shrubs.count = si;
  shrubs.frustumCulled = false;
  g.add(shrubs);
  tris += si * 96;

  // ---------------------------------------------------------------- crown: four glowing masts joined by a frame, the core penthouse with its lantern, the spire
  const r68 = ringOf(T.top);
  const mastY0 = ROOF_Y + 2.8, mastH = 22;
  const mx = r68.hx - 2.5, mz = r68.hz - 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    P.cyl(g, 0.25, 0.4, mastH, T.cx + sx * mx, mastY0 + mastH / 2, T.cz + sz * mz, crown, 8);
    tris += 16;
  }
  const fy = mastY0 + mastH;
  P.tbox(g, T.cx - mx, T.cx + mx, T.cz - mz - 0.2, T.cz - mz + 0.2, fy - 0.2, fy + 0.2, crown);
  P.tbox(g, T.cx - mx, T.cx + mx, T.cz + mz - 0.2, T.cz + mz + 0.2, fy - 0.2, fy + 0.2, crown);
  P.tbox(g, T.cx - mx - 0.2, T.cx - mx + 0.2, T.cz - mz, T.cz + mz, fy - 0.2, fy + 0.2, crown);
  P.tbox(g, T.cx + mx - 0.2, T.cx + mx + 0.2, T.cz - mz, T.cz + mz, fy - 0.2, fy + 0.2, crown);
  const conc = P.lit(TT.concrete, 0xffffff, 0.25);
  P.tbox(g, CORE.x0, CORE.x1, CORE.z0, CORE.z1, ROOF_Y, CORE_TOP + 0.4, conc, 8, 4);
  const lantern = P.tbox(g, T.cx - 6, T.cx + 6, T.cz - 4, T.cz + 4, CORE_TOP + 0.4, CORE_TOP + 9, crown);
  lantern.name = 'lantern';
  P.tbox(g, T.cx - 7, T.cx + 7, T.cz - 5, T.cz + 5, CORE_TOP + 9, CORE_TOP + 10, P.gold());
  const spireY0 = CORE_TOP + 10, spireH = SPIRE_TOP_Y - spireY0;
  P.cyl(g, 0.15, 1.6, spireH, T.cx, spireY0 + spireH / 2, T.cz, P.gold(), 12);
  const beacon = k.sphere(g, 0.9, T.cx, SPIRE_TOP_Y + 0.6, T.cz, P.glow(0xff2a2a, 2.2, 0x880000));
  tris += 200;

  // the logo, huge, on the south face (seen from the highway)
  const logo = k.own(new THREE.MeshBasicMaterial({ map: P.t.logo, toneMapped: false }));
  const ly = levelY(34), rz = ringOf(34);
  P.vplane(g, 'z', T.cz + rz.hz + 0.35, -22, 22, ly, ly + 11, 1, logo, 44, 11);
  tris += 2;

  return {
    group: g,
    tris: Math.round(tris),
    setNight: (nk) => {
      glass.emissiveIntensity = 0.08 + 1.0 * nk;
      metal.emissiveIntensity = 0.2 + 0.8 * nk;
    },
    update: (tt) => { beacon.visible = Math.sin(tt * 2.2) > -0.2; },
  };
}
