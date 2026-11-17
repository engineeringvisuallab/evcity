import * as THREE from 'three';
import type { Vehicle } from '../vehicles';
import type { VehicleManager } from '../vehicles';
import type { CitySite } from '../terrain/TerrainGenerator';
import { EVLAB_LOT, MAIN_STATION_LOT, MALL_LOT, lotToWorld } from '../parking/ParkingSite';
import { UI_FONT } from '../ui/theme';
import { bnDigits } from '../i18n';
import type { Economy } from './Economy';
import { GoldConfig } from './Gold';

const fmt = (n: number): string => bnDigits(Math.floor(n).toLocaleString('en-US'));

/** Key that loads the cargo (at a depot) and cancels the job (twice). */
const JOB_KEY = 'KeyY';
/** The truck must be this close (m) to a depot to load, and to the destination to unload. */
const DEPOT_RADIUS = 45;
const UNLOAD_SPEED = 4; // m/s: the truck must almost stand still to unload
/** On its roof this long (s) = the cargo is ruined. */
const ROLLOVER_SECONDS = 1.5;
const CANCEL_CONFIRM_SECONDS = 3;

export interface Depot {
  name: string;
  x: number;
  z: number;
}

interface Job {
  truck: Vehicle;
  from: Depot;
  to: Depot;
  /** Cargo health, 100 = like new, 0 = destroyed. */
  hp: number;
  /** Seconds the truck has been upside down. */
  roof: number;
  /** Seconds left to confirm a cancel (0 = not asked). */
  cancelAsk: number;
}

interface JobsDeps {
  parent: HTMLElement;
  input: { wasPressed(code: string): boolean };
  economy: Economy;
  vehicles: VehicleManager;
  sites: CitySite[];
}

/**
 * Extra ways to earn Gold (the numbers live in GoldConfig):
 *  - CARGO JOB: drive the cargo truck (N menu) to a depot, press Y to load, drive to the destination depot (an arrow shows the way) and stop there.
 *    Cargo delivered in good condition = bonus (5,000); crashes hurt the cargo, destroyed cargo (or a wrecked / rolled-over truck) = fine (3,000).
 *  - SAFE DRIVING: every `safeInterval` seconds of driving without a fine or accident pays a bonus that grows with every clean round.
 */
export class Jobs {
  readonly depots: Depot[];
  private job: Job | null = null;
  private clean = 0;
  private rounds = 0;
  private readonly panel = document.createElement('div');
  private readonly arrow = document.createElement('div');
  private readonly text = document.createElement('div');
  private readonly bar = document.createElement('div');
  private readonly barFill = document.createElement('div');
  private readonly pos = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();

  constructor(private readonly d: JobsDeps) {
    this.depots = Jobs.makeDepots(d.sites);
    Object.assign(this.panel.style, {
      position: 'fixed', left: '14px', top: '150px', minWidth: '210px', padding: '8px 12px', borderRadius: '10px',
      background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,140,0,0.7)', color: '#fff', font: `600 13px ${UI_FONT}`,
      pointerEvents: 'none', zIndex: '12', display: 'none', gap: '10px', alignItems: 'center',
    } satisfies Partial<CSSStyleDeclaration>);
    Object.assign(this.arrow.style, { font: '700 30px sans-serif', color: '#ffa726', width: '34px', textAlign: 'center', display: 'none' } satisfies Partial<CSSStyleDeclaration>);
    this.arrow.textContent = '↑';
    const col = document.createElement('div');
    Object.assign(this.bar.style, { height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.2)', marginTop: '5px', overflow: 'hidden' } satisfies Partial<CSSStyleDeclaration>);
    Object.assign(this.barFill.style, { height: '100%', width: '100%', background: '#43a047' } satisfies Partial<CSSStyleDeclaration>);
    this.bar.append(this.barFill);
    col.append(this.text, this.bar);
    this.panel.append(this.arrow, col);
    d.parent.append(this.panel);
  }

  /** Depots: the parking-lot areas next to the mall (loading yard), plus the centre of every city site, so jobs can be 800 m .. several km long. */
  static makeDepots(sites: CitySite[]): Depot[] {
    const c = (r: { s0: number; s1: number; n0: number; n1: number }): { x: number; z: number } => lotToWorld((r.s0 + r.s1) / 2, (r.n0 + r.n1) / 2);
    const list: Depot[] = [
      { name: 'সিটি মল ডিপো', ...c(MALL_LOT) },
      { name: 'মেইন স্টেশন ডিপো', ...c(MAIN_STATION_LOT) },
      { name: 'ইভল্যাব ডিপো', ...c(EVLAB_LOT) },
    ];
    sites.forEach((s, i) => {
      if (i === 0) return; // site 0 is the home city (the lots above)
      list.push({ name: `শহর ${bnDigits(String(i + 1))} ডিপো`, x: s.x, z: s.z });
    });
    return list;
  }

  /** True while a cargo job is running. */
  get busy(): boolean {
    return this.job !== null;
  }

  dispose(): void {
    this.panel.remove();
  }

  /** The player was fined (red light, accident, cargo): the safe-driving round starts again. */
  notifyFine(): void {
    this.clean = 0;
    this.rounds = 0;
  }

  /** Any vehicle crashed (Engine.onVehicleCrash): the cargo of the job truck takes damage. */
  onCrash(v: Vehicle, dv: number): void {
    const j = this.job;
    if (!j || v !== j.truck) return;
    const dmg = Math.max(0, dv - GoldConfig.cargoMinDv) * GoldConfig.cargoDmgPerDv;
    if (dmg <= 0) return;
    j.hp = Math.max(0, j.hp - dmg);
    if (j.hp <= 0) this.destroyed('মালামাল নষ্ট');
  }

  update(dt: number): void {
    const drv = this.d.vehicles.driver;
    this.updateSafeDriving(dt, drv);
    const j = this.job;
    if (j) {
      this.updateJob(j, dt, drv);
      return;
    }
    // no job: offer one when the cargo truck stands in a depot
    if (drv && drv.spec.id === 'truck' && drv.state !== 'wrecked') {
      const depot = this.depotAt(drv);
      if (depot) {
        this.show(`📦 ${depot.name}`, 'Y চাপুন: মালামাল তুলুন', 0, null, 100);
        if (this.d.input.wasPressed(JOB_KEY)) this.start(drv, depot);
        return;
      }
    }
    this.panel.style.display = 'none';
  }

  private depotAt(v: Vehicle): Depot | null {
    v.physWorld(this.pos);
    for (const dp of this.depots) if (Math.hypot(dp.x - this.pos.x, dp.z - this.pos.z) < DEPOT_RADIUS) return dp;
    return null;
  }

  private start(truck: Vehicle, from: Depot): void {
    // the destination: a random depot at least `cargoMinDist` m away (the farthest one when none is that far)
    const far = this.depots.filter((q) => q !== from && Math.hypot(q.x - from.x, q.z - from.z) >= GoldConfig.cargoMinDist);
    const pool = far.length ? far : [...this.depots].filter((q) => q !== from).sort((a, b) => Math.hypot(b.x - from.x, b.z - from.z) - Math.hypot(a.x - from.x, a.z - from.z)).slice(0, 1);
    const to = pool[Math.floor(Math.random() * pool.length)];
    if (!to) return;
    this.job = { truck, from, to, hp: 100, roof: 0, cancelAsk: 0 };
    this.d.economy.say(`📦 মালামাল লোড হয়েছে → ${to.name}`, 'income');
  }

  private updateJob(j: Job, dt: number, drv: Vehicle | null): void {
    // the truck was destroyed (shot, burnt, blown up)
    if (j.truck.state === 'wrecked') {
      this.destroyed('ট্রাক ধ্বংস, মালামাল নষ্ট');
      return;
    }
    // roll-over
    j.roof = j.truck.upY < 0.2 ? j.roof + dt : 0;
    if (j.roof > ROLLOVER_SECONDS) {
      this.destroyed('ট্রাক উল্টে মালামাল নষ্ট');
      return;
    }
    // cancel: press Y twice
    if (j.cancelAsk > 0) j.cancelAsk = Math.max(0, j.cancelAsk - dt);
    if (this.d.input.wasPressed(JOB_KEY)) {
      if (j.cancelAsk > 0) {
        this.d.economy.fine(GoldConfig.cargoCancelFine, 'চাকরি বাতিল');
        this.job = null;
        this.panel.style.display = 'none';
        return;
      }
      j.cancelAsk = CANCEL_CONFIRM_SECONDS;
    }
    j.truck.physWorld(this.pos);
    const dx = j.to.x - this.pos.x;
    const dz = j.to.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const inTruck = drv === j.truck;
    // arrived: stop in the depot and the cargo is unloaded
    if (inTruck && dist < DEPOT_RADIUS && Math.abs(j.truck.forwardSpeed) < UNLOAD_SPEED) {
      this.delivered(j);
      return;
    }
    let rel = 0;
    if (inTruck) {
      j.truck.forwardVector(this.fwd);
      const l = Math.hypot(this.fwd.x, this.fwd.z) || 1;
      const fx = this.fwd.x / l;
      const fz = this.fwd.z / l;
      rel = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz);
    }
    const head = j.cancelAsk > 0 ? '⚠️ আবার Y চাপলে চাকরি বাতিল (জরিমানা ' + fmt(GoldConfig.cargoCancelFine) + ')' : inTruck ? `গন্তব্য: ${j.to.name}` : '🚚 ট্রাকে ফিরে যান';
    const km = dist >= 1000 ? `${bnDigits((dist / 1000).toFixed(1))} কিমি` : `${bnDigits(String(Math.round(dist)))} মি`;
    this.show(head, `দূরত্ব ${km} · মালামাল ${bnDigits(String(Math.round(j.hp)))}%`, rel, inTruck ? rel : null, j.hp);
  }

  private delivered(j: Job): void {
    const full = GoldConfig.cargoGoodHp;
    const pay = Math.round(GoldConfig.cargoBonus * Math.min(1, j.hp / full));
    this.job = null;
    this.panel.style.display = 'none';
    this.d.economy.bonus(pay, 'মালামাল পৌঁছেছে');
  }

  private destroyed(reason: string): void {
    this.job = null;
    this.panel.style.display = 'none';
    this.d.economy.fine(GoldConfig.cargoFine, reason);
  }

  private updateSafeDriving(dt: number, drv: Vehicle | null): void {
    if (!drv || drv.state === 'wrecked' || Math.abs(drv.forwardSpeed) < 3) return;
    this.clean += dt;
    if (this.clean < GoldConfig.safeInterval) return;
    this.clean = 0;
    this.rounds = Math.min(GoldConfig.safeMaxRounds, this.rounds + 1);
    this.d.economy.bonus(GoldConfig.safeBase * this.rounds, 'নিরাপদ ড্রাইভিং');
  }

  private show(title: string, sub: string, _rel: number, arrow: number | null, hp: number): void {
    this.panel.style.display = 'flex';
    this.text.innerHTML = `<div style="font-weight:700">${title}</div><div style="font-weight:500;opacity:.9">${sub}</div>`;
    if (arrow === null) this.arrow.style.display = 'none';
    else {
      this.arrow.style.display = 'block';
      this.arrow.style.transform = `rotate(${arrow}rad)`;
    }
    this.barFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    this.barFill.style.background = hp > 60 ? '#43a047' : hp > 30 ? '#fbc02d' : '#e53935';
  }
}
