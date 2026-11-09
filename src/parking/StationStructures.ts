// STEP 3 + 4: the PROPER structures of the fuel stations and the electric charge points that stand along the main roads (RoadStationSites.ts, ~every 2 km). The layout is pure
// data in StationLayout.ts (parts, boards, paint, solids); this file turns it into three.js objects:
//   * LAZY: a site is built only when the player is within BUILD_R metres and its meshes + textures are freed again beyond DROP_R (22 sites, ~14 meshes each, never all at once);
//   * every part of a site is MERGED into one mesh per material (a fuel station is ~20 meshes + 3 ground meshes, a charge point ~12 + 4), materials are shared by all sites;
//   * the ground (asphalt, lane / bay paint, the yellow tanker bay, the blue EV bays) is draped over the terrain in the site's own frame (4 meshes);
//   * `solidGroups` holds the cuboid colliders of ALL sites (pure data, in the same shape as the road signs' groups): the Engine feeds them to a SignPhysics, so bodies exist
//     only near the player (floating-origin local coordinates) whether or not the meshes are built;
//   * `update(px, pz, lamp)` (lamp: 0 day .. 1 night, from the day/night system) lights the canopy light strips, the kiosk windows, the price displays and the signs: only
//     EMISSIVE materials are used - there is NO extra light source.
// Children use ABSOLUTE world coordinates (like ParkingLots), added to world.root.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROAD_STATION_SITES, type RoadStationSite } from './RoadStationSites';
import { chargeLayout, fuelLayout, sitePaint, solidsOf, type LRect, type LSeg, type Layout, type MatKey, type SitePaint, type TexKey } from './StationLayout';
import type { SignSolidGroup } from '../signs/SignSolids';

export interface StationDeps {
  root: THREE.Object3D;
  terrain: { heightAt(x: number, z: number): number };
  sites?: ReadonlyArray<RoadStationSite>;
}

/** A site is built when the player is nearer than this (m), and freed again beyond DROP_R. */
export const BUILD_R = 450;
export const DROP_R = 650;

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d') as CanvasRenderingContext2D };
}

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A two-line board (Bangla over English), 512 x 160. */
function signTexture(lines: string[], bg: string, fg: string): THREE.CanvasTexture {
  const { c, g } = canvas(512, 160);
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(6, 6, c.width - 12, c.height - 12);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 52px "Noto Sans Bengali", "Nirmala UI", sans-serif';
  g.fillText(lines[0], c.width / 2, 52);
  g.font = 'bold 40px Arial, sans-serif';
  g.fillText(lines[1], c.width / 2, 108);
  return toTexture(c);
}

/** The big pylon board: Bangla + English, "FUEL + CHARGE", a drop and a bolt, the station number. 288 x 416. */
function pylonTexture(nameBn: string, num: string): THREE.CanvasTexture {
  const { c, g } = canvas(288, 416);
  g.fillStyle = '#0b3d2e';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 8;
  g.strokeRect(8, 8, c.width - 16, c.height - 16);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 44px "Noto Sans Bengali", "Nirmala UI", sans-serif';
  g.fillText('ফুয়েল + চার্জ', c.width / 2, 56);
  // a fuel drop (red) and a bolt (yellow)
  g.fillStyle = '#e53935';
  g.beginPath();
  g.arc(92, 146, 22, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(70, 140);
  g.lineTo(92, 100);
  g.lineTo(114, 140);
  g.closePath();
  g.fill();
  g.fillStyle = '#ffd54f';
  g.beginPath();
  g.moveTo(208, 98);
  g.lineTo(178, 148);
  g.lineTo(196, 148);
  g.lineTo(184, 190);
  g.lineTo(222, 132);
  g.lineTo(203, 132);
  g.closePath();
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = 'bold 66px Arial, sans-serif';
  g.fillText('FUEL', c.width / 2, 232);
  g.font = 'bold 46px Arial, sans-serif';
  g.fillText('+ CHARGE', c.width / 2, 288);
  g.fillRect(24, 322, c.width - 48, 72);
  g.fillStyle = '#0b3d2e';
  g.font = 'bold 40px "Noto Sans Bengali", "Nirmala UI", sans-serif';
  g.fillText(nameBn, c.width / 2, 346);
  g.font = 'bold 28px Arial, sans-serif';
  g.fillText(`STATION ${num}`, c.width / 2, 380);
  return toTexture(c);
}

/** The small price display on every pump (shared). */
function priceTexture(): THREE.CanvasTexture {
  const { c, g } = canvas(128, 64);
  g.fillStyle = '#05210f';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#66ff99';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 34px monospace';
  g.fillText('120.00', c.width / 2, c.height / 2);
  return toTexture(c);
}

interface Lit { m: THREE.MeshStandardMaterial; base: number; gain: number }

interface Built { group: THREE.Group; owned: { dispose(): void }[]; lit: Lit[]; meshes: number; tris: number }
interface SiteState { site: RoadStationSite; layout: Layout; y: number; yaw: number; built: Built | null }

/** Ground draping: height of the terrain at a site-frame point, minus the group's y. */
type GroundY = (x: number, z: number) => number;

/** Draped rectangles + lines of one colour -> one BufferGeometry in the site frame (flat shaded up normals). */
function drape(rects: ReadonlyArray<LRect>, segs: ReadonlyArray<LSeg>, gy: GroundY, lift: number): THREE.BufferGeometry | null {
  const pos: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]): void => void pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  const v = (x: number, z: number): number[] => [x, gy(x, z) + lift, z];
  for (const [x0, x1, z0, z1] of rects) {
    const nx = Math.max(1, Math.ceil((x1 - x0) / 4)), nz = Math.max(1, Math.ceil((z1 - z0) / 4));
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const xa = x0 + ((x1 - x0) * i) / nx, xb = x0 + ((x1 - x0) * (i + 1)) / nx, za = z0 + ((z1 - z0) * j) / nz, zb = z0 + ((z1 - z0) * (j + 1)) / nz;
        quad(v(xa, za), v(xa, zb), v(xb, zb), v(xb, za)); // counter-clockwise seen from above (+y)
      }
    }
  }
  for (const s of segs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const px = (-dz / len) * (s.w / 2), pz = (dx / len) * (s.w / 2);
    const n = Math.max(1, Math.ceil(len / 1.5));
    for (let i = 0; i < n; i++) {
      const xa = s.a[0] + (dx * i) / n, za = s.a[1] + (dz * i) / n, xb = s.a[0] + (dx * (i + 1)) / n, zb = s.a[1] + (dz * (i + 1)) / n;
      quad(v(xa + px, za + pz), v(xa - px, za - pz), v(xb - px, zb - pz), v(xb + px, zb + pz));
    }
  }
  if (pos.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // computeVertexNormals follows the winding; make sure every normal points up
  const nrm = g.getAttribute('normal');
  for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
  return g;
}

export class StationStructures {
  private group = new THREE.Group();
  private shared: { dispose(): void }[] = [];
  private sharedLit: Lit[] = [];
  private states: SiteState[] = [];
  private lastLamp = 0;
  private build!: (s: SiteState) => Built;
  /** Colliders (cuboids in the site frame) of every site; feed them to a SignPhysics. */
  readonly solidGroups: SignSolidGroup[] = [];

  constructor(private d: StationDeps) {
    this.group.name = 'StationStructures';
    const sites = d.sites ?? ROAD_STATION_SITES;
    const ownShared = <T extends { dispose(): void }>(o: T): T => {
      this.shared.push(o);
      return o;
    };
    const stdMat = (color: number, rough = 0.8, metal = 0.1): THREE.MeshStandardMaterial => ownShared(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
    /** an emissive material that follows the day / night lamp value: emissiveIntensity = base + gain * lamp */
    const glowMat = (list: Lit[], own: (o: { dispose(): void }) => void, color: number, emissive: number, base: number, gain: number, map?: THREE.Texture): THREE.MeshStandardMaterial => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, emissive, emissiveIntensity: base });
      own(m);
      if (map) {
        m.map = map;
        m.emissiveMap = map;
      }
      list.push({ m, base, gain });
      return m;
    };
    const sGlow = (color: number, emissive: number, base: number, gain: number, map?: THREE.Texture): THREE.MeshStandardMaterial => glowMat(this.sharedLit, (o) => this.shared.push(o), color, emissive, base, gain, map);

    const priceTex = ownShared(priceTexture());
    const shopTex = ownShared(signTexture(['দোকান', 'SHOP  •  24 HOURS'], '#37474f', '#ffffff'));
    const unloadTex = ownShared(signTexture(['ট্যাংকার আনলোড', 'TANKER UNLOAD'], '#b71c1c', '#ffffff'));

    const M: Record<MatKey, THREE.Material> = {
      kerb: stdMat(0xb9b6ad), roof: stdMat(0xe8e8e2), fascia: stdMat(0x1f6f43), col: stdMat(0x6e757c, 0.5, 0.5), pump: stdMat(0xc62828), pumpTop: stdMat(0x263238),
      charger: stdMat(0x1565c0), screen: sGlow(0xffffff, 0xffffff, 0.35, 0.9, priceTex), yellow: stdMat(0xe0b020), white: stdMat(0xf2f2f2), dark: stdMat(0x1b1f22, 0.9, 0),
      building: stdMat(0xd9cfc0), glass: sGlow(0x4a7a90, 0xffd88a, 0, 0.95), door: stdMat(0x37474f), light: sGlow(0xdddddd, 0xfff4d0, 0, 2.2), iron: stdMat(0x555b60, 0.6, 0.6),
      solar: stdMat(0x14284b, 0.3, 0.6), silver: stdMat(0xb0b6bb, 0.4, 0.7), cab: stdMat(0x5d7a6a), cabW: stdMat(0xeceff1),
    };
    const sharedTex: Record<'shop' | 'unload', THREE.Material> = { shop: sGlow(0xffffff, 0xffffff, 0.12, 0.9, shopTex), unload: sGlow(0xffffff, 0xffffff, 0.12, 0.9, unloadTex) };
    const SHADOW: ReadonlySet<MatKey> = new Set<MatKey>(['roof', 'fascia', 'building', 'solar']);
    // ground: asphalt dark, paint white / yellow / blue (a little apart in depth so the paint never z-fights the asphalt)
    const groundMat = (color: number, offset: number): THREE.MeshStandardMaterial => {
      const m = stdMat(color, 0.95, 0);
      m.polygonOffset = true;
      m.polygonOffsetFactor = offset;
      m.polygonOffsetUnits = offset;
      return m;
    };
    const G = { asphalt: groundMat(0x2d3033, -2), white: groundMat(0xf1f1ea, -4), yellow: groundMat(0xe8b923, -5), blue: groundMat(0x1e88e5, -5) };

    const unitBox = ownShared(new THREE.BoxGeometry(1, 1, 1));
    const unitCyl = ownShared(new THREE.CylinderGeometry(0.5, 0.5, 1, 12));
    const unitPlane = ownShared(new THREE.PlaneGeometry(1, 1));
    const q = new THREE.Quaternion(), e = new THREE.Euler(), mtx = new THREE.Matrix4(), pos = new THREE.Vector3(), scl = new THREE.Vector3();

    this.build = (st: SiteState): Built => {
      const l = st.site;
      const own: { dispose(): void }[] = [];
      const lit: Lit[] = [];
      const g = new THREE.Group();
      g.name = l.id;
      g.position.set(l.x, st.y, l.z);
      g.rotation.y = st.yaw;
      const rx = Math.sin(st.yaw), rz = Math.cos(st.yaw);
      let meshes = 0, tris = 0;
      const addMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, cast: boolean, receive: boolean): void => {
        own.push(geo);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = `${l.id}:${name}`;
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
        g.add(mesh);
        meshes++;
        tris += (geo.getIndex()?.count ?? geo.getAttribute('position').count) / 3;
      };

      // ---- structures: merge one geometry per material (parts) and per board texture (planes)
      const buckets = new Map<string, THREE.BufferGeometry[]>();
      const put = (key: string, geo: THREE.BufferGeometry): void => {
        const a = buckets.get(key);
        if (a) a.push(geo);
        else buckets.set(key, [geo]);
      };
      for (const p of st.layout.parts) {
        const geo = (p.cyl ? unitCyl : unitBox).clone();
        e.set(p.rx ?? 0, 0, 0);
        q.setFromEuler(e);
        geo.applyMatrix4(mtx.compose(pos.set(p.x, p.y, p.z), q, scl.set(p.w, p.h, p.cyl ? p.w : p.d)));
        put(p.m, geo);
      }
      const siteMats = new Map<string, THREE.Material>();
      const boardMaterial = (t: TexKey): THREE.Material => {
        if (t === 'shop' || t === 'unload') return sharedTex[t];
        const num = (l.id.split('-')[1] ?? l.id).replace(/^0+/, '');
        const name = l.nameBn.replace(/\s*\(.*\)$/, '');
        const tex = t === 'pylon' ? pylonTexture(name, num) : signTexture([name, `${l.id.toUpperCase()}  EV CHARGE`], '#0d47a1', '#ffffff');
        own.push(tex);
        return glowMat(lit, (o) => own.push(o), 0xffffff, 0xffffff, 0.12, 0.9, tex);
      };
      for (const p of st.layout.planes) {
        const geo = unitPlane.clone();
        e.set(0, p.ry, 0);
        q.setFromEuler(e);
        geo.applyMatrix4(mtx.compose(pos.set(p.x, p.y, p.z), q, scl.set(p.w, p.h, 1)));
        const key = `tex:${p.t}`;
        put(key, geo);
        if (!siteMats.has(key)) siteMats.set(key, boardMaterial(p.t));
      }
      for (const [key, geos] of buckets) {
        const merged = mergeGeometries(geos);
        for (const gg of geos) gg.dispose();
        if (!merged) continue;
        const isTex = key.startsWith('tex:');
        addMesh(merged, isTex ? (siteMats.get(key) as THREE.Material) : M[key as MatKey], key, !isTex && SHADOW.has(key as MatKey), !isTex);
      }

      // ---- ground: asphalt + paint draped over the terrain (site frame -> world for the height lookup)
      const gy: GroundY = (x, z) => d.terrain.heightAt(l.x + x * rz + z * rx, l.z - x * rx + z * rz) - st.y;
      const paint: SitePaint = sitePaint(l.kind === 'fuel', { hw: l.hw, hd: l.hd }, l.gap);
      const layers: [string, ReadonlyArray<LRect>, ReadonlyArray<LSeg>, THREE.Material, number][] = [
        ['asphalt', paint.asphalt, [], G.asphalt, 0.06],
        ['white', paint.white, paint.whiteLines, G.white, 0.085],
        ['yellow', paint.yellow, paint.yellowLines, G.yellow, 0.09],
        ['blue', paint.blue, paint.blueLines, G.blue, 0.09],
      ];
      for (const [name, rects, segs, mat, lift] of layers) {
        const geo = drape(rects, segs, gy, lift);
        if (geo) addMesh(geo, mat, name, false, true);
      }
      this.group.add(g);
      return { group: g, owned: own, lit, meshes, tris };
    };

    for (const s of sites) {
      const f = { hw: s.hw, hd: s.hd };
      const layout = s.kind === 'fuel' ? fuelLayout(f) : chargeLayout(f);
      const y = d.terrain.heightAt(s.x, s.z) + 0.1;
      const solids = solidsOf(layout);
      let radius = 0;
      for (const so of solids) radius = Math.max(radius, Math.hypot(Math.abs(so.cx) + so.hx, Math.abs(so.cz) + so.hz));
      this.solidGroups.push({ x: s.x, y, z: s.z, yaw: s.yaw, radius, solids });
      this.states.push({ site: s, layout, y, yaw: s.yaw, built: null });
    }
    d.root.add(this.group);
    this.applyLamp(0);
  }

  private applyLamp(k: number): void {
    for (const s of this.sharedLit) s.m.emissiveIntensity = s.base + s.gain * k;
    for (const st of this.states) if (st.built) for (const s of st.built.lit) s.m.emissiveIntensity = s.base + s.gain * k;
  }

  private drop(st: SiteState): void {
    if (!st.built) return;
    this.group.remove(st.built.group);
    for (const o of st.built.owned) o.dispose();
    st.built = null;
  }

  /**
   * Once per rendered frame: builds ONE site that came within BUILD_R of the player, frees the ones beyond DROP_R, and sets the night lights (lamp: 0 day .. 1 night).
   * Only emissive materials change; there are no light sources.
   */
  update(px: number, pz: number, lamp: number): void {
    let built = false;
    for (const st of this.states) {
      const dist = Math.hypot(st.site.x - px, st.site.z - pz);
      if (st.built) {
        if (dist > DROP_R) this.drop(st);
      } else if (!built && dist < BUILD_R) {
        st.built = this.build(st);
        built = true;
        this.applyLamp(this.lastLamp);
      }
    }
    const k = Math.min(1, Math.max(0, lamp));
    if (Math.abs(k - this.lastLamp) < 0.01) return;
    this.lastLamp = k;
    this.applyLamp(k);
  }

  /** Builds every site at once (tests, screenshots). */
  buildAll(): void {
    for (const st of this.states) if (!st.built) st.built = this.build(st);
    this.applyLamp(this.lastLamp);
  }

  /** Counts of what is built right now (test / debug overlay). */
  get stats(): { sites: number; built: number; meshes: number; triangles: number } {
    let meshes = 0, triangles = 0, built = 0;
    for (const st of this.states) if (st.built) { built++; meshes += st.built.meshes; triangles += st.built.tris; }
    return { sites: this.states.length, built, meshes, triangles };
  }

  /** The emissive materials of the built sites (for the test). */
  get litMaterials(): readonly THREE.MeshStandardMaterial[] {
    const out = this.sharedLit.map((s) => s.m);
    for (const st of this.states) if (st.built) for (const s of st.built.lit) out.push(s.m);
    return out;
  }

  dispose(): void {
    this.d.root.remove(this.group);
    for (const st of this.states) this.drop(st);
    for (const o of this.shared) o.dispose();
  }
}
