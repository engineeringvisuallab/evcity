import type { VehicleId } from '../vehicles/VehicleSpec';

/**
 * GOLD = the game currency. Every number of the economy lives here, so the balance can be tuned in one place.
 */
export const GoldConfig = {
  /** Gold the player owns at the start of every game. */
  startBalance: 10000,
  /** true = the purse is kept in the browser between reloads; false = every new game starts with `startBalance`. */
  persist: false,

  // ---- FINES ----
  /** Fine for crossing the stop line of a RED traffic light (the player's vehicle). */
  signalFine: 10,
  /** Seconds before the same junction can fine the player again (one crossing = one fine). */
  signalCooldown: 8,
  /**
   * Traffic accident: base fine. The player's vehicle crashes into another vehicle and / or runs people over.
   *   fine = accidentBase x (sum of the multipliers of the vehicle types that were hit; 1 when only people were hit) + accidentKillExtra x people killed
   */
  accidentBase: 500,
  /** Extra fine for every person the player's vehicle killed in the same accident. */
  accidentKillExtra: 500,
  /** Multiplier of the base fine by the TYPE of the vehicle that was hit (a bus or a hypercar costs more than a bike). */
  vehicleMultiplier: {
    evbike: 0.8,
    rickshaw: 0.7,
    auto: 0.9,
    sedan: 1.0,
    jeep: 1.2,
    bus: 1.6,
    hypercar: 2.0,
    evhypar: 2.0,
    suprim: 2.5,
    tank: 2.5,
    tractor: 1.3,
    pickup: 1.2,
    tanker: 1.8,
    combine: 2.0,
    truck: 1.8,
  } as Record<VehicleId, number>,
  /** A crash counts as an accident with a vehicle from this speed change (m/s, ~18 km/h); gentler bumps cost nothing. */
  accidentMinDv: 5,
  /** The player's vehicle must have been moving at least this fast (m/s) before the crash (a parked car that gets hit is not the player's fault). */
  accidentMinSpeed: 3,
  /** Hits within this many seconds of each other belong to ONE accident (one fine, one message). */
  accidentWindow: 1.6,

  // ---- INCOME ----
  /** Reward for killing a criminal (an armed attacker). */
  criminalReward: 200,
  /** Extra Gold per WANTED star the player has at the moment the criminal dies (0 stars = 200, 5 stars = 700). */
  criminalStarBonus: 100,
  /** Bonus when the player's vehicle rams a rickshaw (once per accident, however many rickshaws were hit). */
  rickshawHitBonus: 500,

  // ---- CARGO JOB (Jobs.ts): drive the cargo truck from one depot to another ----
  /** Bonus for delivering the cargo in good condition (full bonus from `cargoGoodHp` % health up, proportional below). */
  cargoBonus: 5000,
  cargoGoodHp: 70,
  /** Fine when the cargo is destroyed (crashes, roll-over, truck wrecked). */
  cargoFine: 3000,
  /** Fine for cancelling a job after the cargo was loaded. */
  cargoCancelFine: 1000,
  /** A crash only hurts the cargo above this speed change (m/s); every m/s above costs `cargoDmgPerDv` % of the cargo. */
  cargoMinDv: 4,
  cargoDmgPerDv: 3,
  /** The destination depot is at least this far (m) from the loading depot (the truck is built for 150-200 km/h). */
  cargoMinDist: 800,

  // ---- SAFE DRIVING BONUS (Jobs.ts) ----
  /** Seconds of driving without a fine / accident for one bonus; the bonus grows with every clean round: safeBase x round (max safeMaxRounds). */
  safeInterval: 180,
  safeBase: 100,
  safeMaxRounds: 10,

  // ---- PASSENGER FARE (Extras.ts, key Y in a passenger vehicle): bus stop -> bus stop ----
  /** Fare = rideBase + ridePerKm x km of the ride; x rideBumpFactor when the car was hit during the ride; + rideFastTip (share) when fast enough. */
  rideBase: 150,
  ridePerKm: 600,
  rideBumpFactor: 0.7,
  rideFastTip: 0.25,
  /** Average speed (m/s) and spare seconds that count as 'fast' for the tip. */
  rideFastSpeed: 16,
  rideFastSpare: 30,

  // ---- RACE / TIME TRIAL (Extras.ts, key O in any vehicle): reach a far depot in time ----
  /** Reward = raceBase x metres + raceTimeBonus x (share of the time that was left). Time limit = metres / raceAvgSpeed + raceSpare. */
  raceBase: 0.8,
  raceTimeBonus: 1500,
  raceAvgSpeed: 25,
  raceSpare: 25,
  raceMinDist: 1000,

  // ---- FARM WORK (Extras.ts): drive a tractor / combine over a crop field ----
  /** Gold per m2 worked (tractor), and the working width (m). The combine pays farmCombineMul times more and works a wider swath. */
  farmPerM2: 0.25,
  farmSwath: 3,
  farmCombineSwath: 6,
  farmCombineMul: 2,
  /** One payment for every this many m2 worked; a field is paid once for at most farmCoverFrac of its area, then rests for farmRestSeconds. */
  farmChunk: 1000,
  farmCoverFrac: 0.9,
  farmRestSeconds: 600,

  // ---- PLANT INCOME (Extras.ts): every engineering plant earns while you are away; walk or drive in to collect ----
  /** Gold per minute of every plant area, and the most minutes that can pile up. */
  plantPerMinute: 20,
  plantMaxMinutes: 60,
  /** Nothing is paid below this amount (so the pop-up does not appear at every step across the border). */
  plantMinPay: 100,

  // ---- Traffic light timing is in src/traffic/TrafficSignals.ts ----
} as const;

const KEY = 'evcity.gold.v2';

export type GoldListener = (balance: number, delta: number, reason: string) => void;

/** The player's Gold purse. */
export class Gold {
  private _balance: number = GoldConfig.startBalance;
  private listeners: GoldListener[] = [];

  constructor() {
    if (!GoldConfig.persist) return;
    try {
      const v = window.localStorage.getItem(KEY);
      if (v !== null && Number.isFinite(Number(v))) this._balance = Math.max(0, Math.floor(Number(v)));
    } catch {
      /* storage blocked: keep the default */
    }
  }

  get balance(): number {
    return this._balance;
  }

  onChange(fn: GoldListener): void {
    this.listeners.push(fn);
  }

  /** Income. */
  earn(amount: number, reason: string): void {
    if (amount <= 0) return;
    this.set(this._balance + amount, amount, reason);
  }

  /** Fine / payment. The purse never goes below 0; returns the Gold really taken. */
  charge(amount: number, reason: string): number {
    const taken = Math.min(this._balance, Math.max(0, Math.floor(amount)));
    if (taken > 0) this.set(this._balance - taken, -taken, reason);
    return taken;
  }

  private set(v: number, delta: number, reason: string): void {
    this._balance = Math.floor(v);
    if (GoldConfig.persist) {
      try {
        window.localStorage.setItem(KEY, String(this._balance));
      } catch {
        /* ignore */
      }
    }
    for (const l of this.listeners) l(this._balance, delta, reason);
  }
}

/** The accident fine for the given hits (pure function, used by the Economy and by the test). */
export function accidentFine(vehicleKinds: VehicleId[], killed: number): number {
  const mult = vehicleKinds.length ? vehicleKinds.reduce((a, k) => a + (GoldConfig.vehicleMultiplier[k] ?? 1), 0) : 1;
  return Math.round(GoldConfig.accidentBase * mult) + GoldConfig.accidentKillExtra * Math.max(0, killed);
}
