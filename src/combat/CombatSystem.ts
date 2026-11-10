import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { OrbitCamera } from '../camera/OrbitCamera';
import type { Player } from '../characters';
import { Config } from '../core/Config';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { InputManager } from '../input/InputManager';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { PeopleManager } from '../people';
import type { VehicleManager } from '../vehicles';
import type { HUD } from '../ui/HUD';
import { Ammo } from './Ammo';
import { CombatEffects } from './CombatEffects';
import type { CombatHooks } from './CombatHooks';
import { GunAudio } from './GunAudio';
import { GUN_NAME_EN, gunIconSvg } from './GunIcons';
import { Wanted } from './Wanted';
import { WEAPON_ORDER, weaponSpec, type WeaponId } from './Weapons';

const dName = (id: WeaponId): string => GUN_NAME_EN[id] ?? id;

export interface CombatDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  input: InputManager;
  physics: PhysicsWorld;
  origin: FloatingOrigin;
  player: Player;
  orbit: OrbitCamera;
  people: PeopleManager;
  /** Bullets hurt vehicles and kill the people in them. */
  vehicles?: VehicleManager;
  onShot?: (x: number, z: number) => void;
  hud: HUD;
  /** World position of the body of whoever the player controls (the car when driving). */
  controlledWorld: (out: THREE.Vector3) => THREE.Vector3;
  controlledBody?: () => RAPIER.RigidBody | null;
}

/**
 * GTA-style shooting. Left mouse = fire, right mouse = aim (camera comes closer, better accuracy), Q = next weapon,
 * R = reload. Every gun has a magazine and spare bullets; an empty magazine reloads by itself.
 * Bullets are hit-scan: a ray from the camera crosshair; the first thing it meets - terrain / car (Rapier) or a person
 * (cylinder test) - is hit. People and wildlife use lightweight ray hit volumes; the player can NEVER die.
 */
export class CombatSystem {
  readonly wanted = new Wanted();
  readonly effects: CombatEffects;
  readonly audio = new GunAudio();
  /** Magazine state and reload timer; spare ammunition is unlimited in this game mode. */
  readonly ammo = new Ammo();
  /** What PeopleManager uses. */
  readonly hooks: CombatHooks;

  private weaponIdx = 0;
  private cooldown = 0;
  private drawn = 0; // seconds the gun stays in the hand
  private dir = new THREE.Vector3();
  private cam = new THREE.Vector3();
  private focus = new THREE.Vector3();
  private start = new THREE.Vector3();
  private muzzle = new THREE.Vector3();
  private end = new THREE.Vector3();
  private d2 = new THREE.Vector3();
  private tmpW = new THREE.Vector3();
  private shownWeapon: WeaponId | null = null;
  private weaponButton = document.createElement('button');
  private weaponPanel = document.createElement('div');
  private ammoKey = '';
  kills = 0;

  constructor(private d: CombatDeps) {
    this.effects = new CombatEffects(d.scene);
    this.createWeaponPicker(document.body);
    this.hooks = {
      wanted: this.wanted,
      effects: this.effects,
      audio: this.audio,
      playerWorld: (out) => d.controlledWorld(out),
      playerHit: (dmg) => this.onPlayerHit(dmg),
      blocked: (a, b) => this.blocked(a, b),
    };
  }

  get weapon(): WeaponId {
    return WEAPON_ORDER[this.weaponIdx];
  }

  setMuted(m: boolean): void {
    this.audio.setMuted(m);
  }

  /** Floating origin moved. */
  shift(dx: number, dz: number): void {
    this.effects.shift(dx, dz);
  }

  /** Every frame. `canShoot` = active gameplay, ready player and not swimming; shooting may use a vehicle's body/position. */
  update(dt: number, canShootIn: boolean): void {
    let canShoot = canShootIn;
    const { input, hud, player, orbit } = this.d;
    this.wanted.update(dt);
    this.effects.update(dt);
    hud.setWanted(this.wanted.stars);

    // weapon wheel: B or a click takes the highlighted gun (a click only reaches here while the mouse is captured); nothing fires while it is open
    const wheelWasOpen = this.weaponPanel.style.display === 'flex';
    if (wheelWasOpen && input.wasPressed('Mouse0')) this.equipWeapon(WEAPON_ORDER[this.wheelSel]);
    else if (input.wasPressed('KeyB')) {
      if (wheelWasOpen) this.equipWeapon(WEAPON_ORDER[this.wheelSel]);
      else this.toggleWeaponPicker();
    }
    if (wheelWasOpen) canShoot = false;
    const aiming = canShoot && input.isDown('Mouse2');
    const wantFire = canShoot && (input.isDown('Mouse0') || input.wasPressed('Mouse0'));
    if (canShoot && !player.inVehicle && input.wasPressed('KeyQ')) {
      this.weaponIdx = (this.weaponIdx + 1) % WEAPON_ORDER.length;
      this.drawn = Config.combat.drawSeconds;
      this.ammo.cancelReload(); // switching the gun interrupts the reload
    }
    if (canShoot && input.wasPressed('KeyR') && this.ammo.startReload(this.weapon)) {
      this.drawn = Config.combat.drawSeconds;
      this.audio.reload();
    }
    if (this.ammo.update(dt)) this.audio.reloadDone();
    if (aiming || wantFire) this.drawn = Config.combat.drawSeconds;
    else this.drawn = Math.max(0, this.drawn - dt);
    const out = canShoot && this.drawn > 0;

    // camera comes closer while aiming
    const target = aiming ? Config.combat.aimCameraScale : 1;
    orbit.aimFactor += (target - orbit.aimFactor) * (1 - Math.exp(-10 * dt));

    // gun in the hand + body faces the crosshair
    const id = out ? this.weapon : null;
    const onFoot = !player.inVehicle;
    player.model.setGun(onFoot ? id : null);
    if (out && onFoot) {
      // the gun follows the camera's pitch; the reload animation follows the ammo timer
      this.d.camera.getWorldDirection(this.dir);
      player.model.setAimPitch(Math.asin(Math.max(-1, Math.min(1, this.dir.y))));
      player.model.setReload(this.ammo.isReloading() ? this.ammo.reloadProgress() : -1);
    } else {
      player.model.setReload(-1);
    }
    if (out && onFoot) {
      const yaw = orbit.yaw;
      player.setAim(true, Math.atan2(-Math.sin(yaw), -Math.cos(yaw)));
    } else if (this.shownWeapon !== null) {
      player.setAim(false);
    }
    if (id !== this.shownWeapon) {
      this.shownWeapon = id;
      hud.setWeapon(id);
    }
    hud.setAimMode(out);
    this.syncAmmoHud(out);

    this.cooldown -= dt;
    if (!canShoot || !out) return;
    const spec = weaponSpec(this.weapon);
    const trigger = spec.auto ? input.isDown('Mouse0') : input.wasPressed('Mouse0');
    if (trigger && this.cooldown <= 0) {
      if (this.ammo.isReloading()) return;
      if (!this.ammo.canFire(this.weapon)) {
        // empty magazine: reload if there are spare bullets, else only a dry click
        if (!this.ammo.startReload(this.weapon)) this.audio.dry();
        else this.audio.reload();
        this.cooldown = 0.3;
        return;
      }
      this.cooldown = spec.interval;
      this.ammo.consume(this.weapon);
      this.fire(aiming);
      if (this.ammo.mag(this.weapon) === 0 && this.ammo.startReload(this.weapon)) this.audio.reload();
    }
  }

  /** Magazine / spare bullets / reload progress on the weapon chip (only redraws when something changed). */
  private syncAmmoHud(visible: boolean): void {
    if (!visible) return;
    const w = this.weapon;
    const prog = this.ammo.isReloading(w) ? Math.round(this.ammo.reloadProgress() * 20) : -1;
    const key = `${w}:${this.ammo.mag(w)}:${this.ammo.reserve(w)}:${prog}`;
    if (key === this.ammoKey) return;
    this.ammoKey = key;
    this.d.hud.setAmmo(this.ammo.mag(w), this.ammo.reserve(w), prog < 0 ? -1 : prog / 20);
  }

  /**
   * WEAPON WHEEL (B): the guns sit on a circle in the middle of the screen, over the game. The mouse wheel turns the highlight round the circle (down = next, up = previous), hovering a gun highlights it too.
   * B or a click takes the highlighted gun in the hand and closes the wheel; Esc closes it without changing anything.
   * Every gun shows its English name and a silhouette icon; the centre shows the highlighted gun bigger with its ammo.
   */
  private wheelItems: { id: WeaponId; el: HTMLButtonElement; ammo: HTMLDivElement }[] = [];
  private wheelInfo = document.createElement('div');
  /** Index (in WEAPON_ORDER) of the highlighted gun. */
  private wheelSel = 0;
  private wheelAcc = 0;

  private createWeaponPicker(parent: HTMLElement): void {
    this.weaponButton.type = 'button';
    this.weaponButton.textContent = '🔫 সরঞ্জাম  [B]';
    Object.assign(this.weaponButton.style, {
      position: 'fixed', right: '14px', top: '176px', zIndex: '60', padding: '10px 13px',
      borderRadius: '10px', border: '1px solid rgba(255,255,255,.35)', background: 'rgba(12,24,34,.9)',
      color: '#fff', font: '700 14px sans-serif', cursor: 'pointer', pointerEvents: 'auto',
      // no on-screen label any more: the B key (and the touch TOOLS button) open the wheel
      display: 'none',
    });
    this.weaponButton.addEventListener('click', () => this.toggleWeaponPicker());
    Object.assign(this.weaponPanel.style, {
      position: 'fixed', inset: '0', zIndex: '100', display: 'none', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(circle at 50% 50%, rgba(2,8,14,.25) 0%, rgba(2,8,14,.62) 100%)', pointerEvents: 'auto',
      fontFamily: 'sans-serif', userSelect: 'none',
    });
    const wheel = document.createElement('div');
    wheel.style.position = 'relative';
    wheel.dataset.wheel = '1';
    const ring = document.createElement('div');
    Object.assign(ring.style, { position: 'absolute', inset: '9%', borderRadius: '50%', border: '2px solid rgba(255,255,255,.22)',
      background: 'radial-gradient(circle, rgba(18,36,48,.88) 0%, rgba(8,21,30,.82) 62%, rgba(8,21,30,.35) 100%)', boxShadow: '0 12px 50px rgba(0,0,0,.55)' });
    wheel.appendChild(ring);
    // centre: the highlighted gun (icon, name, ammo)
    Object.assign(this.wheelInfo.style, { position: 'absolute', left: '50%', top: '50%', width: '34%', transform: 'translate(-50%,-50%)',
      textAlign: 'center', color: '#fff', pointerEvents: 'none', lineHeight: '1.35' });
    wheel.appendChild(this.wheelInfo);
    const n = WEAPON_ORDER.length;
    WEAPON_ORDER.forEach((id, i) => {
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2; // the first gun at the top, then clockwise
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.w = id;
      Object.assign(b.style, { position: 'absolute', left: `${50 + 41 * Math.cos(ang)}%`, top: `${50 + 41 * Math.sin(ang)}%`,
        transform: 'translate(-50%,-50%)', width: '23%', padding: '.45em .3em .4em', borderRadius: '1.6em',
        border: '2px solid rgba(255,255,255,.28)', background: '#203846', color: '#fff', font: '700 1em sans-serif',
        cursor: 'pointer', transition: 'transform .08s, background .08s, border-color .08s', lineHeight: '1.2' });
      const icon = document.createElement('div');
      icon.style.cssText = 'height:2.5em;width:88%;margin:0 auto .15em;pointer-events:none';
      icon.innerHTML = gunIconSvg(id);
      const name = document.createElement('div');
      name.textContent = dName(id);
      name.style.cssText = 'font-size:1em;font-weight:800;white-space:nowrap;pointer-events:none';
      const am = document.createElement('div');
      am.style.cssText = 'font-size:.82em;font-weight:600;opacity:.75;pointer-events:none';
      b.append(icon, name, am);
      b.addEventListener('mouseenter', () => { this.wheelSel = i; this.refreshWheel(); });
      b.addEventListener('click', (e) => { e.stopPropagation(); this.equipWeapon(id); });
      this.wheelItems.push({ id, el: b, ammo: am });
      wheel.appendChild(b);
    });
    this.weaponPanel.appendChild(wheel);
    this.weaponPanel.addEventListener('click', () => { this.closeWheel(); });
    window.addEventListener('keydown', (e) => {
      if (this.weaponPanel.style.display !== 'flex') return;
      if (e.key === 'Escape') this.closeWheel();
    });
    // mouse wheel turns the highlight round the circle (captured first, so the camera never zooms while the wheel is open)
    window.addEventListener('wheel', (e) => {
      if (this.weaponPanel.style.display !== 'flex') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 100 : 1;
      this.wheelAcc += e.deltaY * unit;
      if (Math.abs(this.wheelAcc) < 40) return; // trackpads send many tiny steps
      const step = this.wheelAcc > 0 ? 1 : -1;
      this.wheelAcc = 0;
      this.wheelSel = (this.wheelSel + step + n) % n;
      this.refreshWheel();
    }, { capture: true, passive: false });
    parent.append(this.weaponButton, this.weaponPanel);
  }

  /** Take a gun in the hand (click on the wheel / B on the highlighted gun). */
  private equipWeapon(id: WeaponId): void {
    this.weaponIdx = WEAPON_ORDER.indexOf(id);
    this.drawn = Config.combat.drawSeconds;
    this.ammo.cancelReload();
    this.ammoKey = '';
    this.shownWeapon = null;
    this.closeWheel();
  }

  private closeWheel(): void {
    this.weaponPanel.style.display = 'none';
    this.wheelAcc = 0;
  }

  /** Ammo, the highlighted gun (green), the gun in the hand (light border), the centre. */
  private refreshWheel(): void {
    const cur = this.weapon;
    const sel = WEAPON_ORDER[this.wheelSel];
    for (const { id, el, ammo } of this.wheelItems) {
      const active = id === sel;
      const inHand = id === cur;
      ammo.textContent = `${this.ammo.mag(id)} / ${this.ammo.reserve(id)}`;
      el.style.background = active ? '#1f7a4d' : inHand ? '#27495a' : '#203846';
      el.style.borderColor = active ? '#7dffb5' : inHand ? 'rgba(125,255,181,.55)' : 'rgba(255,255,255,.28)';
      el.style.transform = active ? 'translate(-50%,-50%) scale(1.08)' : 'translate(-50%,-50%)';
      el.style.zIndex = active ? '2' : '1';
    }
    this.wheelInfo.textContent = '';
    const ic = document.createElement('div');
    ic.style.cssText = 'height:3.6em;width:80%;margin:0 auto .2em;opacity:.95';
    ic.innerHTML = gunIconSvg(sel);
    const t = document.createElement('div');
    t.textContent = dName(sel);
    t.style.cssText = 'font-size:1.45em;font-weight:800';
    const a = document.createElement('div');
    a.textContent = `গুলি ${this.ammo.mag(sel)} / ${this.ammo.reserve(sel)}`;
    a.style.cssText = 'font-size:1em;opacity:.85';
    const h = document.createElement('div');
    h.textContent = sel === cur ? 'হাতে আছে · B / ক্লিক · Esc বন্ধ' : 'B / ক্লিক = হাতে নিন · Esc বন্ধ';
    h.style.cssText = 'font-size:.85em;opacity:.6;margin-top:4px';
    this.wheelInfo.append(ic, t, a, h);
  }

  private toggleWeaponPicker(): void {
    if (this.weaponPanel.style.display === 'flex') {
      this.closeWheel();
      return;
    }
    const wheel = this.weaponPanel.querySelector('[data-wheel]') as HTMLElement;
    const s = Math.round(Math.max(300, Math.min(660, window.innerWidth * 0.94, window.innerHeight * 0.92)));
    wheel.style.width = `${s}px`;
    wheel.style.height = `${s}px`;
    wheel.style.fontSize = `${Math.max(8, s / 46)}px`; // the buttons size themselves in em
    this.wheelSel = this.weaponIdx; // starts on the gun in the hand
    this.wheelAcc = 0;
    this.refreshWheel();
    this.weaponPanel.style.display = 'flex';
  }

  private fire(aiming: boolean): void {
    const { camera, physics, player, people, origin, hud, orbit } = this.d;
    const C = Config.combat;
    const spec = weaponSpec(this.weapon);
    const R = physics.RAPIER;

    // ray start: where the crosshair line passes the player (so people behind the player are never hit)
    camera.getWorldDirection(this.dir);
    this.cam.copy(camera.position);
    if (!player.inVehicle) {
      player.getFocus(this.focus);
      player.getMuzzle(this.muzzle, spec.gunLength);
    } else {
      const controlled = this.d.controlledWorld(this.tmpW);
      this.focus.copy(controlled);
      this.focus.y += 1.0;
      this.d.origin.toLocal(this.focus, this.focus);
      this.muzzle.copy(this.focus);
      this.muzzle.y += 0.1;
    }
    const along = Math.max(0, this.d2.copy(this.focus).sub(this.cam).dot(this.dir));
    this.start.copy(this.cam).addScaledVector(this.dir, along);
    void orbit;

    let anyHit = false;
    let anyKill = false;
    const spread = spec.spread * (aiming ? C.aimAccuracy : 1) * (player.horizSpeed > 1 ? 1.5 : 1);
    for (let i = 0; i < spec.pellets; i++) {
      // random direction inside the cone
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      const up = Math.abs(this.dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(this.dir, up).normalize();
      const up2 = new THREE.Vector3().crossVectors(right, this.dir);
      const d = new THREE.Vector3().copy(this.dir).addScaledVector(right, Math.cos(a) * r).addScaledVector(up2, Math.sin(a) * r).normalize();

      // world (terrain, cars, ...)
      const ray = new R.Ray(this.start, d);
      // the shooter's own vehicle / body never blocks the shot
      const ownBody = this.d.controlledBody?.() ?? player.body;
      const wh = physics.world.castRay(ray, spec.range, true, undefined, undefined, undefined, ownBody);
      const physicsT = wh ? wh.timeOfImpact : spec.range;
      const blockT = physicsT;
      const vm = this.d.vehicles;
      const hv = wh && vm ? vm.byCollider(wh.collider.handle) : null;
      // people sitting in vehicles: riders of open vehicles anywhere, others only through the glass of the vehicle that was hit
      const occ = vm ? vm.rayOccupant(this.start.x, this.start.y, this.start.z, d.x, d.y, d.z, physicsT + (hv ? 7 : 0), hv) : null;
      const ph = people.rayHit(this.start.x, this.start.y, this.start.z, d.x, d.y, d.z, blockT);
      const walkT = ph ? ph.t : Infinity;
      const useOcc = !!occ && occ.t <= walkT;
      const targetT = useOcc ? occ!.t : ph ? ph.t : blockT;
      this.end.copy(this.start).addScaledVector(d, targetT);
      this.effects.tracer(this.muzzle, this.end);
      if (useOcc && occ) {
        anyHit = true;
        this.effects.hitPuff(this.end);
        vm!.shootOccupant(occ.vehicle, occ.person, spec.damage, occ.head);
        if (occ.person.dead) {
          anyKill = true;
          this.kills++;
        }
      } else if (ph) {
        anyHit = true;
        this.effects.hitPuff(this.end);
        const died = people.damage(ph.person, spec.damage, ph.head, true);
        if (died) {
          anyKill = true;
          this.kills++;
          // an armed person drops ammo of his gun
          const lootGun = ph.person.weapon;
          if (lootGun && this.ammo.addReserve(lootGun, weaponSpec(lootGun).magazine * C.lootMagazines) > 0) this.audio.pickup();
        }
      } else if (wh) {
        this.effects.impact(this.end, hv ? 0xffd27a : undefined);
        if (hv) hv.shot(spec.damage, true);
      }
    }
    this.effects.muzzleFlash(this.muzzle);
    if (!player.inVehicle) player.model.kick(spec.pellets > 1 ? 1.6 : Math.min(1.3, 0.5 + spec.damage / 50));
    this.audio.shot(this.weapon, 0);
    // the shot is a crime in the eyes of everybody close by: they run / armed people shoot back
    people.alarmAt(this.tmpW.set(this.start.x + origin.origin.x, this.start.y, this.start.z + origin.origin.z));
    this.d.onShot?.(this.start.x + origin.origin.x, this.start.z + origin.origin.z);
    if (anyHit) hud.hitMarker(anyKill);
  }

  private onPlayerHit(damage: number): void {
    // The player is immortal: only the screen flashes and a thud is heard.
    this.d.hud.flashDamage(Math.min(0.55, damage / 22));
    this.audio.thud();
  }

  /** True if something solid is between two world points (cars and terrain; the player's own body is ignored). */
  private blocked(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const { physics, origin, player } = this.d;
    const o = origin.origin;
    this.d2.set(b.x - a.x, b.y + 0.3 - a.y, b.z - a.z);
    const len = this.d2.length();
    if (len < 2) return false;
    this.d2.divideScalar(len);
    const ray = new physics.RAPIER.Ray({ x: a.x - o.x, y: a.y, z: a.z - o.z }, this.d2);
    const hit = physics.world.castRay(ray, len, true, undefined, undefined, undefined, player.body);
    // the last 2.5 m are the player's own car / body
    return !!hit && hit.timeOfImpact < len - 2.5;
  }

  dispose(): void {
    this.effects.dispose();
  }
}
