// City Mall (10 floors, 50 m glass building that fills the whole outline, 100 m round atrium in the middle, glass dome on top) inside the open world.
//  - the building (MallBuilder) stands at MALL_POS on a flat pad (terrain.mall), always there when the game starts
//  - Rapier colliders: the always-on ones (glass wall, floors, roof, stair / lift cores) + the per-floor ones (columns, atrium rail) which only exist for the floor(s) the player is on (STEP R1)
//  - shopping: walk in, look at a product (crosshair) -> left click or O opens its page on the live shop in a NEW TAB
import * as THREE from 'three';
import type { Camera } from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { UI_FONT } from '../ui/theme';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import type { InputManager } from '../input/InputManager';
import { buildMall, MALL, type MallBuild, type PickInfo } from './MallBuilder';
import { mallBands } from './MallBands';
import { MALL_POLY } from './MallSite';
import type { Catalog } from './MallCatalog';
import { MallInteraction } from './MallInteraction';
import { MallLiftControl } from './MallLiftControl';
import { createStaticColliders, FloorColliders, floorsAround } from './MallColliders';
import { Q } from '../core/Quality';

export interface MallDeps {
  root: THREE.Object3D;          // world.root: children use ABSOLUTE world coordinates
  physics: PhysicsWorld;
  origin: FloatingOrigin;
  terrain: TerrainGenerator;
  camera: Camera;
  input: InputManager;
  dom: HTMLElement;              // the canvas
  container: HTMLElement;
  catalog: Catalog;
  /** World position of the player on foot (the capsule centre). */
  playerWorld: (out: THREE.Vector3) => THREE.Vector3;
  /** Is the player walking (not driving / flying / sailing)? Shopping is only for walkers. */
  onFoot: () => boolean;
  /** Put the player at a world position (the lift carries him: Player.teleportTo). */
  teleport: (world: THREE.Vector3) => void;
}

const CSS = `
.evmall-tip{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);display:none;z-index:50;
  background:rgba(15,23,42,.92);border:2px solid #22d3ee;border-radius:14px;padding:10px 20px;text-align:center;color:#fff;
  font-family:${UI_FONT};pointer-events:auto;cursor:pointer;max-width:80vw}
.evmall-tip b{display:block;font-size:18px}
.evmall-tip i{display:block;color:#22d3ee;font-style:normal;font-size:21px;font-weight:700}
.evmall-tip small{display:block;opacity:.85;font-size:12px;margin-top:2px}
.evmall-banner{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:50;display:flex;gap:10px;align-items:center;
  background:rgba(15,23,42,.88);border:2px solid #22d3ee;border-radius:16px;padding:10px 18px;color:#fff;font-family:${UI_FONT};
  font-size:15px;pointer-events:none;transition:opacity 1.2s;box-shadow:0 4px 18px rgba(0,0,0,.35)}
.evmall-banner b{color:#22d3ee}
@media (max-width:700px){.evmall-banner{top:176px;max-width:90vw;font-size:13px;padding:8px 12px}.evmall-help{bottom:150px;max-width:60vw}}
.evmall-help{position:fixed;left:12px;bottom:12px;z-index:50;display:none;background:rgba(15,23,42,.72);color:#fff;border-radius:10px;
  padding:6px 10px;font:12px ${UI_FONT};pointer-events:none}
`;

export class MallManager {
  readonly build: MallBuild;
  readonly group: THREE.Group;
  /** True while the player stands inside the building (guns are put away, shopping is on). */
  inside = false;
  private body: RAPIER.RigidBody;
  private inter: MallInteraction;
  private tip = document.createElement('div');
  private help = document.createElement('div');
  private banner: HTMLElement | null = document.createElement('div');
  private bannerTimer = 0;
  private near = false;
  private p = new THREE.Vector3();
  private q = new THREE.Vector3();
  private plaza: THREE.Mesh;
  private apron: THREE.Group;
  private lifts: MallLiftControl;
  private floorCols: FloorColliders;
  private lastWant: readonly number[] | null = null;

  constructor(private d: MallDeps) {
    const site = d.terrain.mall;
    this.build = buildMall(d.catalog, { fixtureCap: Q.mallFixtures });
    this.group = this.build.group;
    this.group.position.set(site.x, site.floorY, site.z);
    this.group.rotation.y = site.yaw;
    d.root.add(this.group);

    // paved plaza: the whole level plot (it follows the road edges), the building stands on it
    const shape = new THREE.Shape(MALL_POLY.map(([x, z]) => new THREE.Vector2(x, -z)));
    this.plaza = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshStandardMaterial({ color: 0xb4bcc6, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    this.plaza.rotation.x = -Math.PI / 2;
    this.plaza.position.y = site.floorY - 0.015;
    d.root.add(this.plaza);
    this.apron = this.buildApron(site.floorY);
    d.root.add(this.apron);

    this.body = this.createColliders();
    this.floorCols = new FloorColliders(d.physics.RAPIER, d.physics.world, this.body, this.build);
    this.lifts = new MallLiftControl({
      RAPIER: d.physics.RAPIER, world: d.physics.world, body: this.body, frame: { x: site.x, z: site.z, floorY: site.floorY, yaw: site.yaw },
      origin: d.origin, lockTarget: d.dom, teleport: d.teleport, views: this.build.cores.lifts,
    });

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.tip.className = 'evmall-tip';
    this.tip.addEventListener('click', (e) => { e.stopPropagation(); this.inter.click(); });
    d.container.appendChild(this.tip);
    this.help.className = 'evmall-help';
    this.help.innerHTML = 'পণ্যের দিকে ক্রসহেয়ার রাখুন · <b>বাম ক্লিক / O</b> = অর্ডার পেজ (নতুন ট্যাবে) · জোনের নাম ওপরে ঝুলছে · বন্দুক এখানে বন্ধ · <b>G</b> = লিফট ডাকুন / ফ্লোর বাছুন';
    d.container.appendChild(this.help);

    this.inter = new MallInteraction(d.camera, d.dom, this.build.pickables, (p) => this.onHover(p), (p) => this.onPick(p));
    this.inter.blockers = this.build.blockers;
    this.inter.maxDist = 20; // the camera is ~6 m behind the player; `accept` below keeps picks within reach of the player
    this.inter.accept = (hit) => {
      this.d.playerWorld(this.p);
      this.q.copy(hit.point);
      this.d.origin.toWorld(this.q, this.q);
      return Math.hypot(this.q.x - this.p.x, this.q.z - this.p.z) <= 9 && Math.abs(this.q.y - this.p.y) <= 5; // same floor only
    };

    // start-of-game hint (the mall is right there, in front of the spawn point)
    const b = this.banner!;
    b.className = 'evmall-banner';
    b.innerHTML = '<span style="font-size:22px">🛍️</span><span><b>City Mall</b> সামনেই — ১০ তলা কাচের মল, মাঝখানে ১০০ মি. আট্রিয়াম! পূর্ব ও পশ্চিম দুই পাশে লিফট ও সিঁড়ি, রাস্তার দিকে দুটো দরজা</span>';
    d.container.appendChild(b);
    this.bannerTimer = 14;
  }

  /** Fixed Rapier body in floating-origin local coordinates (PhysicsWorld shifts it when the origin moves). */
  /**
   * Ash-concrete apron + 5 m walkway (STEP M1d). MallBands (pure maths) gives, along the plot outline, the width of the apron and the distance to the user's red line
   * (the road / rail corridor edge): plot edge -> apron (ash concrete) -> walkway (the last MALL_WALK m, light paving) -> red line. Visual strips draped on the terrain
   * (no collider: walking on the terrain collider), the walkway 2 cm above the apron.
   */
  private buildApron(floorY: number): THREE.Group {
    const B = mallBands(this.d.terrain);
    const N = B.pts.length, R = 6;
    const strip = (w0: number[], w1: number[], color: number, lift: number): THREE.Mesh => {
      const pos: number[] = [], idx: number[] = [];
      for (let i = 0; i < N; i++) for (let j = 0; j <= R; j++) {
        const o = w0[i] + ((w1[i] - w0[i]) * j) / R, x = B.pts[i][0] + B.nx[i] * o, z = B.pts[i][1] + B.nz[i] * o;
        pos.push(x, o < 0.01 ? floorY - 0.015 : this.d.terrain.heightAt(x, z) + lift, z);
      }
      for (let i = 0; i < N; i++) { const i2 = (i + 1) % N; for (let j = 0; j < R; j++) { const a = i * (R + 1) + j, b = i2 * (R + 1) + j, c = i2 * (R + 1) + j + 1, e = i * (R + 1) + j + 1; idx.push(a, b, c, a, c, e); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 - lift * 50, polygonOffsetUnits: -2 - lift * 50 }));
      m.frustumCulled = false;
      return m;
    };
    const grp = new THREE.Group();
    grp.name = 'MallApron';
    grp.add(strip(B.pts.map(() => 0), B.wApron, 0xb4bcc6, 0.03)); // the apron (ash concrete, as before)
    grp.add(strip(B.wApron, B.wRed, 0xdcd6c8, 0.05)); // the 5 m walkway along the red line (light stone paving)
    return grp;
  }

  private createColliders(): RAPIER.RigidBody {
    const R = this.d.physics.RAPIER;
    const world = this.d.physics.world;
    const site = this.d.terrain.mall;
    const o = this.d.origin.origin;
    const body = world.createRigidBody(
      R.RigidBodyDesc.fixed()
        .setTranslation(site.x - o.x, site.floorY, site.z - o.z)
        .setRotation({ x: 0, y: Math.sin(site.yaw / 2), z: 0, w: Math.cos(site.yaw / 2) }),
    );
    // glass wall, ground floor, 9 floor slabs, closed roof, stair / lift cores, billboards (the per-floor columns + atrium rail come with FloorColliders, see update())
    createStaticColliders(R, world, body, this.build);
    return body;
  }

  /** A click on a pickable: a lift button runs its action, everything else opens its page in a new tab. */
  private onPick(p: PickInfo): void {
    if (p.action) this.lifts.act(p.action);
    else MallInteraction.openInNewTab(p);
  }

  private onHover(p: PickInfo | null): void {
    if (!p) { this.tip.style.display = 'none'; return; }
    this.tip.style.display = 'block';
    this.tip.innerHTML = p.url
      ? `<b>${p.title}</b><i>${p.sub}</i><small>বাম ক্লিক বা O চাপুন → অর্ডার পেজ নতুন ট্যাবে খুলবে</small>`
      : `<b>${p.title}</b><small>${p.sub}</small>`;
  }

  /** Minimap marker position. */
  get position(): { x: number; z: number } {
    const s = this.d.terrain.mall;
    return { x: s.x, z: s.z };
  }

  /** Once per rendered frame. */
  update(dt: number): void {
    const site = this.d.terrain.mall;
    this.d.playerWorld(this.p);
    const dist = Math.hypot(this.p.x - site.x, this.p.z - site.z);
    const walking = this.d.onFoot();
    const was = this.inside;
    this.inside = walking && site.inside(this.p.x, this.p.z, -0.2) && this.p.y > site.floorY - 2 && this.p.y < site.floorY + MALL.H;

    // the whole building is cheap to keep, but its animation only runs when it can be seen
    this.group.visible = this.plaza.visible = this.apron.visible = dist < 900;
    const nearOutside = !this.inside && site.inside(this.p.x, this.p.z, 40); // within 40 m of the glass wall (the doorways, the walkway)
    this.near = this.inside || nearOutside || dist < 200;
    // ~680 columns + lights on every floor: show only the floor the player is on (+- 1) when inside, the ground floor (seen through the glass) when close, nothing when far.
    // A floor is built the first time it is shown (ensureFloor), its colliders exist only while the player is on it (FloorColliders)
    const feet = this.p.y - site.floorY;
    const pf = Math.max(0, Math.min(MALL.floors - 1, Math.floor(feet / MALL.FH)));
    this.build.floors.forEach((fg, i) => {
      fg.visible = this.inside ? Math.abs(i - pf) <= 1 : i === 0 && nearOutside;
      if (fg.visible) this.build.ensureFloor(i);
      this.build.fixtureGroups[i].visible = this.inside ? i === pf : nearOutside && i === 0; // the shop fixtures are drawn only on the floor the player stands on (seen through the glass: the ground floor)
    });
    for (let i = 0; i < MALL.floors; i++) { // a floor stays built within 2 floors of the player (less hiccup on the stairs); further away its meshes + canvas textures are thrown away
      const keep = this.inside ? Math.abs(i - pf) <= 2 : nearOutside && i === 0;
      if (!keep) this.build.releaseFloor(i);
    }
    const want = floorsAround(feet, MALL.FH, MALL.floors, this.inside, nearOutside);
    if (want !== this.lastWant) { this.lastWant = want; this.floorCols.set(want); }
    if (this.near) this.build.update(dt);
    this.lifts.update(dt, this.near, walking, this.p, this.d.input.wasPressed('KeyG'));
    this.build.roof.visible = true;

    if (this.inside !== was) this.help.style.display = this.inside ? 'block' : 'none';
    if (this.inside && this.banner) this.bannerTimer = Math.min(this.bannerTimer, 0.01);

    if (this.banner) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.banner.style.opacity = '0';
        const b = this.banner;
        this.banner = null;
        window.setTimeout(() => b.remove(), 1500);
      }
    }

    // shopping: only inside the building and only on foot
    if (this.inside) {
      this.inter.update();
      if (this.inter.hovered && !this.lifts.uiOpen && (this.d.input.wasPressed('Mouse0') || this.d.input.wasPressed('KeyO'))) this.inter.click();
    } else if (this.inter.hovered) {
      this.inter.clear();
    }
  }

  dispose(): void {
    const world = this.d.physics.world;
    this.lifts.dispose();
    this.floorCols.dispose();
    world.removeRigidBody(this.body);
    this.d.root.remove(this.group);
    this.d.root.remove(this.plaza);
    this.d.root.remove(this.apron);
    this.apron.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
    this.plaza.geometry.dispose();
    (this.plaza.material as THREE.Material).dispose();
    this.build.dispose();
    this.tip.remove();
    this.help.remove();
    this.banner?.remove();
  }
}
