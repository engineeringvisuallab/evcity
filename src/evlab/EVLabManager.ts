// EVLab Tower inside the open world (west of the F4 road, on the big level EVLab plot).
//  - a 150 x 100 m podium with the Presentation Hall and a grand lobby on the ground floor, and a 440 m glass tower (89 levels, plates 1.6 x wider) above the lobby with a central core: two stairs, two glass lifts (EVLabFacade / Core / Lifts / Floors)
//  - the campus on the plot (EVLabGrounds): lake ring with 4 bridges and fountains, island with ring road, plaza, flags; park trees are game trees (EVLabParkTrees)
//  - Rapier colliders for every wall, column, stage, seat row, ramp, the roof and the tower; the three entrance ramps lead up to the hall
//  - the hall is only drawn / animated when the player is near; the tower is drawn from far away
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { Kit } from '../structures';
import { type Mood } from './EVLabAudience';
import { buildGrounds, type GroundsBuild } from './EVLabGrounds';
import { buildHall, type HallBuild, type ScreenSlide } from './EVLabHall';
import { BLD, BUILDING_Z, HALL, PRESENTER, rampPose, type Ramp, type Solid } from './EVLabLayout';
import { buildLobby, type LobbyBuild } from './EVLabLobby';
import { buildWings, type WingsBuild } from './EVLabWings';
import { Parts } from './EVLabParts';
import { buildShell, type ShellBuild } from './EVLabShell';
import { makeTextures } from './EVLabTextures';
import { buildFacade, type FacadeBuild } from './EVLabFacade';
import { LiftUI } from './EVLabLiftUI';
import { TowerView } from './EVLabTowerView';
import { makeTowerTextures } from './EVLabTowerTextures';
import { CAB, LIFTS, T, blockToWorld, coreColliders, levelSolids, type Obb } from './EVLabTowerLayout';
import { outriggerSolids } from './EVLabStructure';
import { BLOCK_PIVOT } from './EVLabLayout';
import type { LiftHost } from './EVLabLifts';
import { EVLabArrivals } from './EVLabArrivals';

export interface EVLabDeps {
  root: THREE.Object3D; // world.root: children use ABSOLUTE world coordinates
  physics: PhysicsWorld;
  origin: FloatingOrigin;
  terrain: TerrainGenerator;
  /** World position of the player (the capsule centre). */
  playerWorld: (out: THREE.Vector3) => THREE.Vector3;
  /** Put the player somewhere (capsule centre, world coordinates). */
  teleport: (world: THREE.Vector3) => void;
  /** Turn the player and the camera to face south (towards the audience / the plaza). */
  faceSouth: () => void;
  /** The canvas that owns the mouse (the lift panel gives the mouse back to it when it closes). */
  lockTarget?: HTMLElement;
}

const SHOW_DIST = 4200; // the tower is drawn this far (it is 440 m high)
const INTERIOR_DIST = 320; // hall + lobby are drawn / animated this near

/** 0 (day) .. 1 (night), smooth at dusk and dawn. */
function nightOf(h: number): number {
  if (h <= 5 || h >= 20) return 1;
  if (h < 7) return (7 - h) / 2;
  if (h > 17.5) return (h - 17.5) / 2.5;
  return 0;
}

export class EVLabManager {
  readonly group = new THREE.Group();
  /** True while the player stands on the Presentation Hall stage (set by enterStage / leaveStage). */
  onStage = false;
  private kit = new Kit();
  private shell: ShellBuild;
  private facade: FacadeBuild;
  private tower: TowerView;
  private ui: LiftUI | null = null;
  private landing = new Map<string, RAPIER.Collider>();
  private cabBodies: RAPIER.RigidBody[] = [];
  private cabDoors: RAPIER.Collider[] = [];
  private local = new THREE.Vector3();
  private lobby: LobbyBuild;
  private wings: WingsBuild;
  private hall: HallBuild;
  private grounds: GroundsBuild;
  /** Step 8: the people who come to the presentation by car (cars + drivers, drawn only). */
  private arrivals = new EVLabArrivals();
  private interior = new THREE.Group();
  private body: RAPIER.RigidBody;
  private p = new THREE.Vector3();
  private q = new THREE.Vector3();
  private lastT = 0;
  private night = -1;

  constructor(private d: EVLabDeps) {
    const site = d.terrain.evlab;
    const parts = new Parts(this.kit, makeTextures(this.kit));
    this.shell = buildShell(parts);
    this.lobby = buildLobby(parts);
    this.wings = buildWings(parts);
    this.hall = buildHall(parts);
    this.grounds = buildGrounds(parts, (lx, lz) => d.terrain.heightAt(site.x + lx, BUILDING_Z + lz) - site.floorY);
    const TT = makeTowerTextures(this.kit);
    this.facade = buildFacade(parts, TT);
    this.group.name = 'EVLabTower';
    this.group.position.set(site.x, site.floorY, BUILDING_Z);
    // colliders first: the lift cars switch their door blockers while they are built
    const tc = coreColliders();
    const solids: Solid[] = [...this.shell.solids, ...this.lobby.solids, ...this.wings.solids, ...this.hall.solids, ...tc.solids, ...this.grounds.solids]; // + the bridge decks and railings
    const obbs: Obb[] = [];
    const ramps: Ramp[] = [...this.lobby.ramps, ...this.hall.ramps, ...tc.ramps];
    for (let n = 1; n <= T.roof; n++) { const lc = levelSolids(n); solids.push(...lc.solids, ...outriggerSolids(n)); obbs.push(...lc.obbs); }
    this.body = this.createColliders(solids, ramps, obbs);
    this.createLiftColliders(tc.landing);
    if (typeof document !== 'undefined' && document.body) this.ui = new LiftUI(d.lockTarget);
    this.tower = new TowerView(parts, TT, this.liftHost(), { teleportLocal: (x, y, z) => this.teleportLocal(x, y, z) }, this.ui);
    this.interior.add(this.lobby.group, this.wings.group, this.hall.group, this.tower.group);
    this.group.add(this.shell.group, this.facade.group, this.grounds.group, this.interior, this.arrivals.group);
    d.root.add(this.group);
  }

  /** World position of the spot in front of the portal: the mission pin and where you come back to after the presentation. */
  get entrance(): { x: number; z: number } {
    return { x: this.d.terrain.evlab.x, z: BUILDING_Z + BLD.hz + 22 };
  }

  /** Minimap marker position. */
  get position(): { x: number; z: number } {
    return { x: this.d.terrain.evlab.x, z: BUILDING_Z };
  }

  // ------------------------------------------------------------------ colliders
  private createColliders(solids: readonly Solid[], ramps: readonly Ramp[], obbs: readonly Obb[] = []): RAPIER.RigidBody {
    const R = this.d.physics.RAPIER;
    const world = this.d.physics.world;
    const site = this.d.terrain.evlab;
    const o = this.d.origin.origin;
    const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(site.x - o.x, site.floorY, BUILDING_Z - o.z));
    const box = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, friction = 0.4): void => {
      world.createCollider(
        R.ColliderDesc.cuboid((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).setFriction(friction),
        body,
      );
    };
    for (const s of solids) box(s[0], s[1], s[2], s[3], s[4], s[5]);
    // the ground-floor slab (its top face is the floor: walking is perfectly smooth)
    box(-BLD.hx - 1, BLD.hx + 1, -BLD.hz - 1, BLD.hz + 1, -1, 0, 1);
    // boxes turned about y (the chamfered corners of the tower's glass wall)
    for (const b of obbs) {
      world.createCollider(
        R.ColliderDesc.cuboid(b.hx, (b.y1 - b.y0) / 2, b.hz).setTranslation(b.cx, (b.y0 + b.y1) / 2, b.cz).setRotation({ x: 0, y: Math.sin(b.yaw / 2), z: 0, w: Math.cos(b.yaw / 2) }).setFriction(0.1),
        body,
      );
    }
    // sloped walking surfaces: a thin cuboid tilted about x (the raked hall floor, the entrance ramps)
    for (const r of ramps) {
      const p = rampPose(r);
      world.createCollider(
        R.ColliderDesc.cuboid(p.hx, p.hy, p.hz).setTranslation(p.cx, p.cy, p.cz).setRotation({ x: p.qx, y: p.qy, z: p.qz, w: p.qw }).setFriction(1),
        body,
      );
    }
    return body;
  }

  // ------------------------------------------------------------------ the lifts: door blockers on the landings, a moving cabin body per lift
  private createLiftColliders(landing: ReadonlyArray<{ lift: number; level: number; box: Solid }>): void {
    const R = this.d.physics.RAPIER;
    const world = this.d.physics.world;
    for (const l of landing) {
      const b = l.box;
      const c = world.createCollider(
        R.ColliderDesc.cuboid((b[1] - b[0]) / 2, (b[5] - b[4]) / 2, (b[3] - b[2]) / 2).setTranslation((b[0] + b[1]) / 2, (b[4] + b[5]) / 2, (b[2] + b[3]) / 2),
        this.body,
      );
      this.landing.set(`${l.lift}:${l.level}`, c);
    }
    const site = this.d.terrain.evlab;
    const o = this.d.origin.origin;
    for (const l of LIFTS) {
      // the cabin is described in its block's design frame; the body origin is the design point (cx, 0), the body is turned with the block
      const [wx, wz] = blockToWorld(l.id, l.cx, 0);
      const yaw = BLOCK_PIVOT[l.id].yaw;
      const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(site.x - o.x + wx, site.floorY, BUILDING_Z - o.z + wz).setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }));
      const box = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, friction = 0.1): RAPIER.Collider =>
        world.createCollider(R.ColliderDesc.cuboid((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).setFriction(friction), body);
      const hx = CAB.hx;
      box(-hx, hx, CAB.z0, CAB.z1, -CAB.floorT, 0, 1);
      box(-hx, -hx + 0.06, CAB.z0, CAB.z1, 0, CAB.h);
      box(hx - 0.06, hx, CAB.z0, CAB.z1, 0, CAB.h);
      box(-hx, hx, CAB.z0, CAB.z0 + 0.06, 0, CAB.h);
      box(-hx, -0.8, CAB.z1 - 0.1, CAB.z1, 0, CAB.h);
      box(0.8, hx, CAB.z1 - 0.1, CAB.z1, 0, CAB.h);
      box(-hx, hx, CAB.z0, CAB.z1, CAB.h, CAB.h + 0.2);
      this.cabDoors[l.id] = box(-0.8, 0.8, CAB.z1 - 0.1, CAB.z1 - 0.04, 0, CAB.doorH);
      this.cabBodies[l.id] = body;
    }
  }

  private liftHost(): LiftHost {
    const site = this.d.terrain.evlab;
    return {
      landingBlock: (lift, level, blocked) => this.landing.get(`${lift}:${level}`)?.setEnabled(blocked),
      cabinPose: (lift, y) => {
        const o = this.d.origin.origin;
        const [wx, wz] = blockToWorld(lift, LIFTS[lift].cx, 0);
        this.cabBodies[lift]?.setNextKinematicTranslation({ x: site.x - o.x + wx, y: site.floorY + y, z: BUILDING_Z - o.z + wz });
      },
      cabinDoorBlock: (lift, blocked) => this.cabDoors[lift]?.setEnabled(blocked),
    };
  }

  /** Put the player at a building-local position (capsule centre). */
  private teleportLocal(x: number, y: number, z: number): void {
    const site = this.d.terrain.evlab;
    this.q.set(site.x + x, site.floorY + y, BUILDING_Z + z);
    this.d.teleport(this.q);
  }

  // ------------------------------------------------------------------ the stage (used by the Presentation Hall mission)
  /** Put the player behind the lectern, facing the audience. */
  enterStage(): void {
    const site = this.d.terrain.evlab;
    this.q.set(site.x + PRESENTER.x, site.floorY + HALL.stageH + 1.1, BUILDING_Z + PRESENTER.z);
    this.d.teleport(this.q);
    this.d.faceSouth();
    this.onStage = true;
    this.hall.audience.setPresent(true);
    this.arrivals.start();
  }

  /** Back to the front of the portal. */
  leaveStage(): void {
    const e = this.entrance;
    this.q.set(e.x, this.d.terrain.evlab.floorY + 1.1, e.z);
    this.d.teleport(this.q);
    this.d.faceSouth();
    this.onStage = false;
    this.hall.showSlide(null, '');
    this.hall.audience.setMood('idle');
    this.hall.audience.setPresent(false);
    this.arrivals.dismiss();
  }

  /** Step 6: the presentation mission is over: the audience gets up and leaves through the doors (the player stays where he is). */
  endPresentation(): void {
    this.onStage = false;
    this.hall.showSlide(null, '');
    this.hall.audience.setMood('idle');
    this.hall.audience.dismiss();
    this.arrivals.dismiss();
  }

  showSlide(slide: ScreenSlide | null, topic: string): void {
    this.hall.showSlide(slide, topic);
  }

  setMood(m: Mood): void {
    this.hall.audience.setMood(m);
  }

  // ------------------------------------------------------------------ per frame
  update(t: number, hours: number): void {
    const dt = Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    const site = this.d.terrain.evlab;
    this.d.playerWorld(this.p);
    const dist = Math.hypot(this.p.x - site.x, this.p.z - BUILDING_Z);
    this.group.visible = dist < SHOW_DIST;
    if (!this.group.visible) return;
    const near = dist < INTERIOR_DIST || this.onStage;
    this.interior.visible = near;
    const nk = Math.round(nightOf(hours) * 20) / 20;
    if (nk !== this.night) {
      this.night = nk;
      this.shell.setNight(nk);
      this.facade.setNight(nk);
      this.grounds.setNight(nk);
    }
    this.arrivals.update(dt);
    this.shell.update(t);
    this.facade.update(t);
    if (dist < 700) this.grounds.update(t);
    if (near) {
      this.lobby.update(t);
      this.wings.update(t);
      this.hall.update(dt, t);
      this.local.set(this.p.x - site.x, this.p.y - site.floorY, this.p.z - BUILDING_Z);
      this.tower.update(dt, this.onStage ? null : this.local);
    } else this.ui?.prompt('');
  }

  dispose(): void {
    this.arrivals.dispose();
    this.tower.dispose();
    this.ui?.dispose();
    for (const b of this.cabBodies) this.d.physics.world.removeRigidBody(b);
    this.d.physics.world.removeRigidBody(this.body);
    this.d.root.remove(this.group);
    this.kit.dispose();
  }
}
