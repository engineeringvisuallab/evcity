import * as THREE from 'three';
import { Q } from '../core/Quality';
import type { Environment } from '../environment';
import type { WaterMaterial } from '../water/WaterMaterial';
import { RAIN_PROFILES, RainState, type RainMode, type RainProfile } from './RainState';
import { RainStreaks } from './RainStreaks';
import { RainSplash } from './RainSplash';
import { RainAudio } from './RainAudio';
import { WetUniforms } from './WetSurface';

export interface WeatherDeps {
  scene: THREE.Scene;
  environment: Environment;
  water: WaterMaterial;
  /** Game day length in seconds (day + night), for the "rain every 2..5 days" schedule. */
  dayLen: number;
  /** Terrain height at a WORLD x / z (for the splash droplets). Without it there are no splash droplets. */
  groundAt?: (x: number, z: number) => number;
}

/** What the player chose in the settings menu. */
export interface WeatherOptions {
  /** 0 off, 1 auto (random), 2 always. */
  mode: number;
  /** 0 light, 1 medium, 2 storm (always mode). */
  level: number;
  /** 0 = automatic (from the device class), 1 low, 2 medium, 3 high. */
  quality: number;
}

const MODES: RainMode[] = ['off', 'auto', 'always'];
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * REAL RAIN: owns the rain logic (RainState), the falling streaks, the wet-ground uniforms, the sea storm and the sound, and feeds the
 * sky (Environment.setWeather) and the water (WaterMaterial.setStorm). The Engine calls update() once per frame.
 *
 * Quality (a profile of RAIN_PROFILES): low = few streaks + darker ground only (almost free), medium = + splash droplets, wet sheen,
 * rain rings on water, beach foam, lightning, high = + puddles (they fill while it rains) with rain rings and a far rain curtain.
 */
export class WeatherSystem {
  readonly state: RainState;
  /** True while people (and the player) should hold umbrellas. */
  umbrellaWanted = false;
  private streaks = new RainStreaks();
  private splash = new RainSplash();
  private ground = new THREE.Vector3();
  private audio = new RainAudio();
  private profile: RainProfile = RAIN_PROFILES[1];
  private profileIndex = -1;
  private quality = 0;
  /** What the player chose in the menu (the real mode is 'off' on a weak PC, see rainAllowed). */
  private wantedMode: RainMode = 'auto';
  private tmpQ = new THREE.Quaternion();
  private sky = new THREE.Color();

  constructor(private d: WeatherDeps) {
    this.state = new RainState(Math.random, d.dayLen);
    d.scene.add(this.streaks.group, this.splash.mesh);
  }

  /** Apply the menu settings. */
  configure(o: WeatherOptions): void {
    this.wantedMode = MODES[Math.max(0, Math.min(2, Math.round(o.mode)))];
    this.state.alwaysLevel = Math.max(0, Math.min(2, Math.round(o.level)));
    this.quality = Math.max(0, Math.min(3, Math.round(o.quality)));
    this.pickProfile();
  }

  /**
   * Rain is for PCs with good graphics: with the rain graphics on "auto" a device of the LOW class (weak PC, phone) gets no rain at
   * all (no clouds, no wet ground, no umbrellas). Whoever picks low / medium / high rain graphics by hand gets rain on any device.
   */
  get rainAllowed(): boolean {
    return this.quality > 0 || Q.tier !== 'low';
  }

  /** 0 low, 1 medium, 2 high: the player's choice, or the graphics class of the device. */
  get qualityIndex(): number {
    if (this.quality > 0) return this.quality - 1;
    return Q.tier === 'low' ? 0 : Q.tier === 'medium' ? 1 : 2;
  }

  private pickProfile(): void {
    const i = this.qualityIndex;
    if (i === this.profileIndex) return;
    this.profileIndex = i;
    this.profile = RAIN_PROFILES[i];
    this.streaks.setCounts(this.profile.near, this.profile.far);
    this.splash.build(this.profile.splash);
  }

  setMuted(m: boolean): void {
    this.audio.setMuted(m);
  }

  /**
   * Once per frame, BEFORE the world / environment update.
   * @param time game clock (seconds)
   * @param shelter 0..1: the player is indoors / in a train (rain is dull and far away)
   */
  update(dt: number, time: number, camera: THREE.PerspectiveCamera, originX: number, originZ: number, pxHeight: number, shelter: number): void {
    const s = this.state;
    s.mode = this.rainAllowed ? this.wantedMode : 'off';
    this.pickProfile();
    s.update(dt);
    const P = this.profile;
    const env = this.d.environment;
    const dn = env.dayNight.state;
    const light = Math.min(1, 0.14 + 0.86 * smooth(-0.12, 0.35, dn.sunY)) * (1 - 0.3 * s.cloud);

    // ---- sky: clouds, fog, lightning ----
    env.setWeather(s.cloud, s.intensity, P.lightning ? s.lightning : 0);

    // ---- sea: storm waves, rain rings ----
    this.d.water.setStorm(s.storm, s.intensity, P.waterRipples);

    // ---- ground ----
    const W = WetUniforms;
    W.uWet.value = s.wet;
    W.uPuddle.value = s.puddle;
    W.uWetQ.value = s.wet > 0.003 || s.storm > 0.02 ? P.wetQ : 0;
    W.uRainTime.value = time;
    W.uRainAmt.value = s.intensity;
    W.uStormK.value = P.beach ? s.storm : 0;
    W.uWetLight.value = light;
    W.uWetOrigin.value.set(originX, originZ);
    this.sky.copy(this.d.environment.skyUniforms.uHorizon.value as THREE.Color);
    (W.uWetSky.value as THREE.Color).copy(this.sky).lerp(this.d.environment.skyUniforms.uZenith.value as THREE.Color, 0.25);
    (W.uWetZen.value as THREE.Color).copy(this.d.environment.skyUniforms.uZenith.value as THREE.Color);
    (W.uWetSunCol.value as THREE.Color).copy(this.d.environment.skyUniforms.uSunColor.value as THREE.Color).multiplyScalar(0.8 * (1 - s.cloud));
    camera.getWorldQuaternion(this.tmpQ).invert();
    (W.uWetSunV.value as THREE.Vector3).copy(env.sunDir).applyQuaternion(this.tmpQ).normalize();

    // ---- the falling rain (fades out indoors and under water) ----
    const under = env.underwaterAmount;
    const open = (1 - 0.92 * shelter) * (1 - under);
    this.streaks.update(dt, time, camera, pxHeight, s.intensity, s.wind, s.windDir, open, light, this.sky);
    this.splash.update(time, camera, pxHeight, s.intensity * open, this.sampleGround(camera, originX, originZ, s.intensity * open), light, this.sky);

    // ---- sound ----
    this.audio.update(s.intensity, Math.max(shelter, under));
    for (let n = 0; n < 3; n++) {
      const p = s.popThunder();
      if (p === null) break;
      this.audio.thunder(p, Math.max(shelter, under));
    }

    // ---- umbrellas (a little hysteresis, so they do not flicker at the edge) ----
    if (!this.umbrellaWanted && s.intensity > 0.14) this.umbrellaWanted = true;
    else if (this.umbrellaWanted && s.intensity < 0.07) this.umbrellaWanted = false;
  }

  /** A small tilted plane of the ground around the camera (x: height, y / z: slope), or null (no ground info, sea, no rain). */
  private sampleGround(camera: THREE.PerspectiveCamera, ox: number, oz: number, amt: number): THREE.Vector3 | null {
    const f = this.d.groundAt;
    if (!f || amt < 0.05 || this.profile.splash <= 0) return null;
    const x = camera.position.x + ox;
    const z = camera.position.z + oz;
    const h0 = f(x, z);
    if (!(h0 > 2)) return null; // NaN, or at / under the sea level: no droplets there
    const e = 6;
    return this.ground.set(h0, (f(x + e, z) - h0) / e, (f(x, z + e) - h0) / e);
  }

  /** 0..1 how hard it rains right now (what the people use to open their umbrellas). */
  get intensity(): number {
    return this.state.intensity;
  }

  dispose(): void {
    this.d.scene.remove(this.streaks.group, this.splash.mesh);
    this.streaks.dispose();
    this.splash.dispose();
    this.audio.dispose();
  }
}
