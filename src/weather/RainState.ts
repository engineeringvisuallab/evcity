// RAIN LOGIC (pure maths: no three.js, no DOM, so a headless test can run it).
//
//   - AUTO mode: it rains on one game day out of every 2..5 (random: 2, 2, 3, 4, 5, 5). On a rain day the shower starts at a random
//     time of the day and is SHORT: it fades in over 20 s, rains at full strength for 60 s and fades out over 20 s (100 s in all,
//     see RAIN_FADE_IN / RAIN_HOLD / RAIN_FADE_OUT). Its strength is random (a steady rain ... a heavy downpour) and wobbles a little.
//   - ALWAYS mode: it rains all the time at the level the player picked (light / medium / storm). OFF mode: never.
//   - Everything is smooth: clouds come ~50 s BEFORE the first drop, the ground gets wet slowly and dries slowly, the sea state
//     (big waves) builds up slowly and stays rough for a while after the rain has stopped.
//   - Thunder: when it rains hard, lightning flashes at random times and the thunder arrives 0.3 .. 4 s later.

export type RainMode = 'off' | 'auto' | 'always';
/** How many game days pass between two rain days (picked at random from this list; 2 and 5 are the most common). */
export const RAIN_DAY_CHOICES: readonly number[] = [2, 2, 3, 4, 5, 5];
/** Strength of "always on" rain: light, medium, storm. */
export const ALWAYS_LEVELS: readonly number[] = [0.3, 0.62, 1];
/** A shower (AUTO mode): seconds of fading in, of full rain and of fading out. */
export const RAIN_FADE_IN = 20;
export const RAIN_HOLD = 60;
export const RAIN_FADE_OUT = 20;

export interface RainEvent {
  /** Seconds on the rain clock. */
  start: number;
  end: number;
  /** 0.2 .. 1 */
  peak: number;
}

/** What the renderer can afford (picked from the graphics quality; see RAIN_PROFILES). */
export interface RainProfile {
  /** Streaks close to the camera / far away (instances at full strength). */
  near: number;
  far: number;
  /** Ground wetness: 1 = darker only, 2 = + sky / sun shine, 3 = + puddles and ripples. */
  wetQ: number;
  /** Splash droplets that jump up where the rain hits the ground near the camera (0 = none). */
  splash: number;
  /** Rain rings on the sea / lakes. */
  waterRipples: boolean;
  /** Storm foam running up the beach. */
  beach: boolean;
  /** Lightning flashes light up the sky. */
  lightning: boolean;
}

/** 0 = low (old PC / phone: almost free), 1 = medium, 2 = high. */
export const RAIN_PROFILES: readonly RainProfile[] = [
  { near: 450, far: 0, wetQ: 1, splash: 0, waterRipples: false, beach: false, lightning: false },
  { near: 1800, far: 800, wetQ: 2, splash: 500, waterRipples: true, beach: true, lightning: true },
  { near: 3600, far: 2400, wetQ: 3, splash: 1200, waterRipples: true, beach: true, lightning: true },
];

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class RainState {
  mode: RainMode = 'auto';
  /** 0 light, 1 medium, 2 storm: the strength in 'always' mode. */
  alwaysLevel = 1;

  /** 0..1: how hard it rains right now (smooth). */
  intensity = 0;
  /** 0..1: how overcast the sky is (comes before the rain, stays after it). */
  cloud = 0;
  /** 0..1: sea storm (big waves). Builds up slowly, calms down slowly. */
  storm = 0;
  /** 0..1: how wet the ground is (wets in ~15 s of rain, dries in ~3.5 minutes). */
  wet = 0;
  /** 0..1: water standing on flat ground (puddles). It FILLS while it rains (about 40 s of steady rain) and slowly dries / soaks away (~4 minutes). */
  puddle = 0;
  /** 0..1 wind strength and its direction (radians, 0 = +X). */
  wind = 0.1;
  windDir = 0.7;
  /** 0..1: brightness of the lightning flash right now. */
  lightning = 0;

  time = 0;
  event: RainEvent | null = null;
  /** Game days left until the next rain day. */
  daysLeft = 0;

  private day = 0;
  private nextBolt = 12;
  private boltT = 9;
  private boltPower = 0;
  private thunder: { at: number; power: number }[] = [];
  private target = 0;

  /**
   * @param rng random numbers 0..1 (Math.random in the game; a seeded one in tests)
   * @param dayLen length of one game day in seconds (a full day + night cycle, see Config.environment.dayNight)
   * @param firstRainSoon true: the first shower comes within the first minutes of playing (so it is seen early)
   */
  constructor(private rng: () => number = Math.random, readonly dayLen = 660, firstRainSoon = true) {
    this.daysLeft = this.pickDays();
    if (firstRainSoon) this.event = this.makeEvent(60 + this.rng() * 240);
  }

  private pickDays(): number {
    return RAIN_DAY_CHOICES[Math.floor(this.rng() * RAIN_DAY_CHOICES.length) % RAIN_DAY_CHOICES.length];
  }

  private makeEvent(start: number): RainEvent {
    // a short shower: always RAIN_FADE_IN + RAIN_HOLD + RAIN_FADE_OUT seconds, strength 0.45 .. 1 (a steady rain ... a downpour)
    const peak = 0.45 + 0.55 * Math.pow(this.rng(), 0.85);
    return { start, end: start + RAIN_FADE_IN + RAIN_HOLD + RAIN_FADE_OUT, peak };
  }

  /** The slow wobble of the strength while it rains (0..1). */
  private wobble(): number {
    const t = this.time;
    return 0.5 + 0.5 * Math.sin(t * 0.21) * Math.sin(t * 0.093 + 1.7);
  }

  update(dt: number): void {
    if (dt <= 0) return;
    if (dt > 1) dt = 1; // a hitch / background tab must not skip the whole shower
    this.time += dt;

    // ---- the rain days: every 2..5 game days one shower at a random time of the day ----
    const day = Math.floor(this.time / this.dayLen);
    while (this.day < day) {
      this.day++;
      this.daysLeft--;
      const busy = this.event && this.event.end + 70 > this.time;
      if (this.daysLeft <= 0 && !busy) {
        this.event = this.makeEvent(this.day * this.dayLen + (0.04 + 0.6 * this.rng()) * this.dayLen);
        this.daysLeft = this.pickDays();
      }
    }
    if (this.event && this.daysLeft <= 0) this.daysLeft = this.pickDays(); // the first (early) shower also restarts the count

    // ---- what the weather wants right now ----
    const n = this.wobble();
    let target = 0;
    let pre = 0;
    if (this.mode === 'always') {
      target = ALWAYS_LEVELS[Math.max(0, Math.min(2, this.alwaysLevel))] * (0.92 + 0.08 * n);
      pre = target;
    } else if (this.mode === 'auto' && this.event) {
      const e = this.event;
      const t = this.time;
      const up = smooth(e.start, e.start + RAIN_FADE_IN, t);
      const down = 1 - smooth(e.end - RAIN_FADE_OUT, e.end, t);
      target = e.peak * (0.8 + 0.2 * n) * up * down;
      pre = smooth(e.start - 25, e.start + 5, t) * (1 - smooth(e.end, e.end + 40, t)) * (0.45 + 0.5 * e.peak);
    }
    this.target = target;

    // ---- smooth followers ----
    const ease = (cur: number, to: number, tauUp: number, tauDown: number): number => {
      const tau = to > cur ? tauUp : tauDown;
      return cur + (to - cur) * (1 - Math.exp(-dt / tau));
    };
    this.intensity = ease(this.intensity, target, 2.5, this.mode === 'off' ? 1.5 : 3);
    if (this.intensity < 0.002) this.intensity = 0;
    this.cloud = ease(this.cloud, Math.min(1, Math.max(this.intensity * 1.25, pre)), 8, 22);
    if (this.cloud < 0.002) this.cloud = 0;
    this.storm = ease(this.storm, Math.pow(Math.min(1, this.intensity * 1.1), 0.85), 14, 50);
    if (this.storm < 0.002) this.storm = 0;
    // the ground
    if (this.intensity > 0.04) this.wet += (1 - this.wet) * (1 - Math.exp((-dt * this.intensity) / 9));
    else this.wet = Math.max(0, this.wet - dt / 200);
    // standing water: the ground is wet first, then the puddles fill up; when the rain stops they shrink slowly
    if (this.intensity > 0.1 && this.wet > 0.4) this.puddle = Math.min(1, this.puddle + (dt * Math.pow(this.intensity, 1.2)) / 40);
    else if (this.intensity < 0.1) this.puddle = Math.max(0, this.puddle - dt / 240);
    this.wind = Math.min(1, 0.1 + 0.9 * this.storm + 0.07 * n);
    this.windDir = 0.7 + 0.8 * Math.sin(this.time * 0.004);

    // ---- lightning + thunder ----
    if (this.intensity > 0.55 && this.storm > 0.35) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 9 + this.rng() * 30 * (1.5 - this.intensity);
        this.boltT = 0;
        this.boltPower = 0.55 + 0.45 * this.rng();
        this.thunder.push({ at: this.time + 0.3 + this.rng() * 3.7, power: this.boltPower });
      }
    }
    this.boltT += dt;
    const pulse = (t: number, s: number, d: number): number => (t > s && t < s + d ? 1 - (t - s) / d : 0);
    this.lightning = this.boltPower * Math.max(pulse(this.boltT, 0, 0.14), 0.65 * pulse(this.boltT, 0.22, 0.3));
  }

  /** The next thunder clap that has arrived (its loudness 0..1), or null. Call until it returns null. */
  popThunder(): number | null {
    if (this.thunder.length && this.time >= this.thunder[0].at) return this.thunder.shift()!.power;
    return null;
  }

  /** True while any rain falls (or is about to). */
  get raining(): boolean {
    return this.intensity > 0.02;
  }

  get targetIntensity(): number {
    return this.target;
  }

  /** Human words for the strength: 0 drizzle, 1 rain, 2 heavy rain. */
  get kind(): 0 | 1 | 2 {
    return this.intensity < 0.3 ? 0 : this.intensity < 0.65 ? 1 : 2;
  }
}
