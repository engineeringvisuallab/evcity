import * as THREE from 'three';
import type { Vehicle, VehicleManager } from '../vehicles';
import type { VehicleId } from '../vehicles/VehicleSpec';
import { ENGINEERING_AREAS } from '../city/EngineeringZones';
import { UI_FONT } from '../ui/theme';
import { bn, bnDigits } from '../i18n';
import type { Economy } from './Economy';
import type { Depot } from './Jobs';
import { GoldConfig } from './Gold';

/** Y in a passenger vehicle = take a passenger (press twice to cancel). O in any vehicle = start a race (press again to give up). */
const RIDE_KEY = 'KeyY';
const RACE_KEY = 'KeyO';
const STOP_RADIUS = 30; // m
const RIDE_STOP_SPEED = 4; // m/s: stand (almost) still to take / drop the passenger
const RACE_RADIUS = 45;
const CANCEL_CONFIRM_SECONDS = 3;

/** Vehicles that can carry passengers. */
const TAXI: ReadonlySet<VehicleId> = new Set<VehicleId>(['rickshaw', 'auto', 'sedan', 'jeep', 'hypercar', 'evhypar', 'bus', 'evbike']);

interface Spot {
  x: number;
  z: number;
}

interface Ride {
  car: Vehicle;
  stage: 'pickup' | 'drop';
  pickup: Spot;
  drop: Spot;
  /** Straight distance pickup -> drop (m). */
  km: number;
  bumped: boolean;
  /** Seconds since the passenger got in. */
  t: number;
  cancelAsk: number;
}

interface Race {
  to: Depot;
  limit: number;
  left: number;
  dist: number;
}

interface FieldLike {
  field: { id: number; w: number; d: number };
}

interface ExtrasDeps {
  parent: HTMLElement;
  input: { wasPressed(code: string): boolean };
  economy: Economy;
  vehicles: VehicleManager;
  depots: () => Depot[];
  stops: () => Spot[];
  fieldAt: (x: number, z: number) => FieldLike | null;
  /** True while the cargo job is running (a race or a ride cannot start then). */
  cargoBusy: () => boolean;
}

/**
 * More Gold (numbers in GoldConfig):
 *  - PASSENGER FARE: Y in a car / auto / rickshaw / bus. A passenger waits at a bus stop; take him to another stop. Fare grows with the distance, shrinks after a crash, fast = tip.
 *  - RACE: O in any vehicle. A far depot, a time limit; the faster you arrive, the more you win. No fine for losing.
 *  - FARM WORK: drive a tractor or a combine over a crop field; every worked 1,000 m2 pays.
 *  - PLANT INCOME: every engineering area earns Gold while you are away; walk or drive into it to collect.
 */
export class Extras {
  private ride: Ride | null = null;
  private race: Race | null = null;
  private readonly panel = document.createElement('div');
  private readonly text = document.createElement('div');
  private readonly arrow = document.createElement('div');
  private readonly pos = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  // farm
  private readonly worked = new Map<number, number>();
  private readonly rest = new Map<number, number>();
  private pending = 0;
  private lastX = NaN;
  private lastZ = NaN;
  // plants
  private clock = 0;
  private readonly plantLast = new Map<string, number>();

  constructor(private readonly d: ExtrasDeps) {
    Object.assign(this.panel.style, {
      position: 'fixed', left: '14px', top: '225px', minWidth: '210px', padding: '8px 12px', borderRadius: '10px',
      background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(66,165,245,0.7)', color: '#fff', font: `600 13px ${UI_FONT}`,
      pointerEvents: 'none', zIndex: '12', display: 'none', gap: '10px', alignItems: 'center',
    } satisfies Partial<CSSStyleDeclaration>);
    Object.assign(this.arrow.style, { font: '700 30px sans-serif', color: '#64b5f6', width: '34px', textAlign: 'center' } satisfies Partial<CSSStyleDeclaration>);
    this.arrow.textContent = '↑';
    this.panel.append(this.arrow, this.text);
    d.parent.append(this.panel);
  }

  dispose(): void {
    this.panel.remove();
  }

  /** Any vehicle crashed: a ride with a passenger counts the bump. */
  onCrash(v: Vehicle, dv: number): void {
    const r = this.ride;
    if (r && r.stage === 'drop' && v === r.car && dv > GoldConfig.cargoMinDv) r.bumped = true;
  }

  update(dt: number, playerWorld: THREE.Vector3): void {
    this.clock += dt;
    const drv = this.d.vehicles.driver;
    this.updatePlants(playerWorld);
    this.updateFarm(drv);
    this.updateRace(dt, drv);
    this.updateRide(dt, drv);
    if (!this.race && !this.ride) this.panel.style.display = 'none';
  }

  // ------------------------------------------------------------------ plant income
  private updatePlants(p: THREE.Vector3): void {
    for (const a of ENGINEERING_AREAS) {
      if (p.x < a.x0 || p.x > a.x1 || p.z < a.z0 || p.z > a.z1) continue;
      const since = this.clock - (this.plantLast.get(a.id) ?? 0);
      const minutes = Math.min(GoldConfig.plantMaxMinutes, since / 60);
      const pay = Math.floor(minutes * GoldConfig.plantPerMinute);
      if (pay < GoldConfig.plantMinPay) continue;
      this.plantLast.set(a.id, this.clock);
      const name = (bn.worldZones.names as Record<string, string>)[a.id] ?? a.id;
      this.d.economy.bonus(pay, `🏭 ${name}`);
    }
  }

  // ------------------------------------------------------------------ farm work
  private updateFarm(drv: Vehicle | null): void {
    const id = drv?.spec.id;
    if (!drv || drv.state === 'wrecked' || (id !== 'tractor' && id !== 'combine')) {
      this.lastX = NaN;
      this.pending = 0;
      return;
    }
    drv.physWorld(this.pos);
    const x = this.pos.x;
    const z = this.pos.z;
    const info = this.d.fieldAt(x, z);
    const moved = Number.isNaN(this.lastX) ? 0 : Math.hypot(x - this.lastX, z - this.lastZ);
    this.lastX = x;
    this.lastZ = z;
    if (!info || moved <= 0 || moved > 20 || Math.abs(drv.forwardSpeed) < 0.5) return;
    const f = info.field;
    if (this.clock < (this.rest.get(f.id) ?? 0)) return;
    const comb = id === 'combine';
    const area = moved * (comb ? GoldConfig.farmCombineSwath : GoldConfig.farmSwath);
    const cap = f.w * f.d * GoldConfig.farmCoverFrac;
    const done = this.worked.get(f.id) ?? 0;
    const add = Math.min(area, cap - done);
    this.worked.set(f.id, done + add);
    this.pending += add;
    const full = done + add >= cap;
    if (this.pending >= GoldConfig.farmChunk || full) {
      const pay = Math.round(this.pending * GoldConfig.farmPerM2 * (comb ? GoldConfig.farmCombineMul : 1));
      this.pending = 0;
      if (pay > 0) this.d.economy.bonus(pay, comb ? '🌾 ফসল কাটা' : '🚜 জমি চাষ');
    }
    if (full) {
      this.worked.delete(f.id);
      this.rest.set(f.id, this.clock + GoldConfig.farmRestSeconds);
      this.d.economy.say('🌾 জমির কাজ শেষ', 'income');
    }
  }

  // ------------------------------------------------------------------ race
  private updateRace(dt: number, drv: Vehicle | null): void {
    const r = this.race;
    const press = this.d.input.wasPressed(RACE_KEY);
    if (!r) {
      if (press && drv && drv.state !== 'wrecked' && !this.ride && !this.d.cargoBusy()) this.startRace(drv);
      return;
    }
    if (press) {
      this.race = null;
      this.d.economy.say('🏁 রেস ছেড়ে দিলেন', 'fine');
      return;
    }
    if (!drv) return; // on foot: the clock keeps running, but the arrow is hidden
    r.left -= dt;
    drv.physWorld(this.pos);
    const dx = r.to.x - this.pos.x;
    const dz = r.to.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < RACE_RADIUS) {
      const pay = Math.round(r.dist * GoldConfig.raceBase + GoldConfig.raceTimeBonus * Math.max(0, r.left / r.limit));
      this.race = null;
      this.d.economy.bonus(pay, '🏁 রেস জিতলেন');
      return;
    }
    if (r.left <= 0) {
      this.race = null;
      this.d.economy.say('🏁 সময় শেষ, রেস হারলেন', 'fine');
      return;
    }
    this.show('🏁 রেস: ' + r.to.name, `সময় ${bnDigits(String(Math.ceil(r.left)))} সে · ${this.km(dist)}`, this.rel(drv, dx, dz));
  }

  private startRace(drv: Vehicle): void {
    drv.physWorld(this.pos);
    const all = this.d.depots();
    const far = all.filter((q) => Math.hypot(q.x - this.pos.x, q.z - this.pos.z) >= GoldConfig.raceMinDist);
    const pool = far.length ? far : [...all].sort((a, b) => Math.hypot(b.x - this.pos.x, b.z - this.pos.z) - Math.hypot(a.x - this.pos.x, a.z - this.pos.z)).slice(0, 1);
    const to = pool[Math.floor(Math.random() * pool.length)];
    if (!to) return;
    const dist = Math.hypot(to.x - this.pos.x, to.z - this.pos.z);
    const limit = dist / GoldConfig.raceAvgSpeed + GoldConfig.raceSpare;
    this.race = { to, limit, left: limit, dist };
    this.d.economy.say(`🏁 রেস শুরু → ${to.name}`, 'income');
  }

  // ------------------------------------------------------------------ passenger fare
  private updateRide(dt: number, drv: Vehicle | null): void {
    const r = this.ride;
    const press = this.d.input.wasPressed(RIDE_KEY);
    if (!r) {
      if (press && drv && TAXI.has(drv.spec.id) && drv.state !== 'wrecked' && !this.race && !this.d.cargoBusy()) this.startRide(drv);
      return;
    }
    if (r.car.state === 'wrecked') {
      this.ride = null;
      this.d.economy.say('🚕 গাড়ি নষ্ট, যাত্রী নেমে গেলেন', 'fine');
      return;
    }
    if (r.stage === 'drop') r.t += dt;
    if (r.cancelAsk > 0) r.cancelAsk = Math.max(0, r.cancelAsk - dt);
    if (press) {
      if (r.cancelAsk > 0) {
        this.ride = null;
        this.d.economy.say('🚕 যাত্রী ফিরিয়ে দিলেন', 'fine');
        return;
      }
      r.cancelAsk = CANCEL_CONFIRM_SECONDS;
    }
    const inCar = drv === r.car;
    const target = r.stage === 'pickup' ? r.pickup : r.drop;
    r.car.physWorld(this.pos);
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (inCar && dist < STOP_RADIUS && Math.abs(r.car.forwardSpeed) < RIDE_STOP_SPEED) {
      if (r.stage === 'pickup') {
        r.stage = 'drop';
        r.t = 0;
        this.d.economy.say('🚕 যাত্রী উঠেছেন', 'income');
      } else {
        this.finishRide(r);
        return;
      }
    }
    const head = r.cancelAsk > 0 ? '⚠️ আবার Y চাপলে যাত্রী নামবে' : !inCar ? '🚕 গাড়িতে ফিরে যান' : r.stage === 'pickup' ? '🚕 যাত্রী তুলুন (বাস স্টপ)' : '🚕 যাত্রীকে নামান (বাস স্টপ)';
    this.show(head, `দূরত্ব ${this.km(dist)}`, inCar ? this.rel(r.car, dx, dz) : null);
  }

  private startRide(car: Vehicle): void {
    const stops = this.d.stops();
    if (stops.length < 2) return;
    car.physWorld(this.pos);
    const near = stops.filter((s) => {
      const q = Math.hypot(s.x - this.pos.x, s.z - this.pos.z);
      return q > 100 && q < 900;
    });
    const pool = near.length ? near : [...stops].sort((a, b) => Math.hypot(a.x - this.pos.x, a.z - this.pos.z) - Math.hypot(b.x - this.pos.x, b.z - this.pos.z)).slice(0, 5);
    const pickup = pool[Math.floor(Math.random() * pool.length)];
    const far = stops.filter((s) => {
      const q = Math.hypot(s.x - pickup.x, s.z - pickup.z);
      return q > 600 && q < 3000;
    });
    const drops = far.length ? far : [...stops].sort((a, b) => Math.hypot(b.x - pickup.x, b.z - pickup.z) - Math.hypot(a.x - pickup.x, a.z - pickup.z)).slice(0, 5);
    const drop = drops[Math.floor(Math.random() * drops.length)];
    if (!drop || drop === pickup) return;
    const km = Math.hypot(drop.x - pickup.x, drop.z - pickup.z) / 1000;
    this.ride = { car, stage: 'pickup', pickup: { x: pickup.x, z: pickup.z }, drop: { x: drop.x, z: drop.z }, km, bumped: false, t: 0, cancelAsk: 0 };
    this.d.economy.say('🚕 যাত্রী ডাকছে: বাস স্টপে যান', 'income');
  }

  private finishRide(r: Ride): void {
    let fare = GoldConfig.rideBase + GoldConfig.ridePerKm * r.km;
    let note = '';
    if (r.bumped) {
      fare *= GoldConfig.rideBumpFactor;
      note = ' (ঝাঁকুনি)';
    } else if (r.t <= (r.km * 1000) / GoldConfig.rideFastSpeed + GoldConfig.rideFastSpare) {
      fare *= 1 + GoldConfig.rideFastTip;
      note = ' (টিপ)';
    }
    this.ride = null;
    this.d.economy.bonus(Math.round(fare), `🚕 ভাড়া${note}`);
  }

  // ------------------------------------------------------------------ helpers
  private km(m: number): string {
    return m >= 1000 ? `${bnDigits((m / 1000).toFixed(1))} কিমি` : `${bnDigits(String(Math.round(m)))} মি`;
  }

  /** Angle (rad, clockwise) from the nose of the vehicle to the target (dx, dz). */
  private rel(v: Vehicle, dx: number, dz: number): number {
    v.forwardVector(this.fwd);
    const l = Math.hypot(this.fwd.x, this.fwd.z) || 1;
    const fx = this.fwd.x / l;
    const fz = this.fwd.z / l;
    return Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz);
  }

  private show(title: string, sub: string, arrow: number | null): void {
    this.panel.style.display = 'flex';
    this.text.innerHTML = `<div style="font-weight:700">${title}</div><div style="font-weight:500;opacity:.9">${sub}</div>`;
    if (arrow === null) this.arrow.style.display = 'none';
    else {
      this.arrow.style.display = 'block';
      this.arrow.style.transform = `rotate(${arrow}rad)`;
    }
  }
}
