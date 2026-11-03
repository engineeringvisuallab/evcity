import * as THREE from 'three';
import type { TerrainGenerator } from '../terrain';
import type { AirplaneManager } from './AirplaneManager';
import { createAirplaneModel, type AirplaneModel } from './AirplaneModel';
import { JetFlight, type JetControls } from './JetFlight';

/** What the jet needs from the game (kept small so the class has no dependency on the Engine). */
export interface PlayerJetDeps {
  root: THREE.Object3D; // world.root: children use ABSOLUTE world coordinates
  container: HTMLElement;
  terrain: TerrainGenerator;
  planes: AirplaneManager;
  input: { isDown(code: string): boolean; wasPressed(code: string): boolean };
  player: {
    active: boolean;
    inVehicle: boolean;
    setInVehicle(on: boolean): void;
    carryTo(world: THREE.Vector3): void;
    teleportTo(world: THREE.Vector3): void;
    getWorldPosition(out: THREE.Vector3): THREE.Vector3;
  };
  /** The orbit camera: the jet turns its yaw so the camera swings round behind the jet. */
  orbit: { yaw: number; elevation: number };
  /** True when the player may climb in right now (on foot, not in free-fly, not in a vehicle). */
  canBoard: () => boolean;
  prompt: (text: string) => void;
  toast: (text: string, ms?: number) => void;
  /** Called when the player gets in / out (the camera distance changes). */
  onRide: (riding: boolean) => void;
}

/** Flight data for the instruments and the tests. */
export interface JetTelemetry {
  speed: number; // m/s
  altAgl: number; // m above the ground
  altAsl: number; // m above the sea
  vspeed: number; // m/s
  heading: number; // compass degrees, 0 = north
  throttle: number;
  afterburner: boolean;
  gear: boolean;
  onGround: boolean;
  stall: boolean;
  pitch: number;
  roll: number;
}

const deg = (r: number): number => (r * 180) / Math.PI;
const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const bnn = (n: number): string => String(Math.round(n)).replace(/\d/g, (d) => BN_DIGITS[+d]);

/**
 * THE PLAYER'S FIGHTER JET. A parked jet stands on the military apron of the sea airport: walk up to it and press F. Keys while flying: Shift / C throttle up / down,
 * Space afterburner, W / S pitch down / up, A / D bank (the jet turns), Q / E rudder (steers on the ground), G landing gear, B wheel brakes, X stabiliser on / off,
 * F get out (only when the jet stands still on the ground). Take off: full throttle, at about 280 km/h pull back (S), pull the gear up (G). Land: gear down, speed below
 * about 400 km/h, level wings, sink rate below 7 m/s - a hard landing destroys the jet (it is brought back to its hardstand). The flight model is a small arcade one
 * (kinematic): speed from the throttle, the nose decides the path, coordinated turns, stall below 56 m/s.
 */
export class PlayerJet {
  readonly model: AirplaneModel;
  riding = false;
  /** The jet stands here when nobody flies it. */
  private parked = true;
  private readonly fl: JetFlight;
  private get st(): JetFlight['st'] { return this.fl.st; }
  private home = { x: 0, y: 0, z: 0, heading: 0 };
  private tmp = new THREE.Vector3();
  private hud: JetHud;
  private audio = new JetAudio();
  private promptOn = false;
  private boardedT = 0;

  constructor(private d: PlayerJetDeps) {
    this.fl = new JetFlight((x, z) => this.ground(x, z), (x, z) => this.isWater(x, z));
    this.model = createAirplaneModel('fighter');
    d.root.add(this.model.group);
    this.hud = new JetHud(d.container);
    const ap = d.planes.airport('sea'), s = ap.stands.mil4 ?? ap.stands.mil3;
    this.home = { x: s.x, y: ap.y, z: s.z, heading: s.heading };
    this.resetToHome();
  }

  private resetToHome(): void {
    const s = this.st;
    s.x = this.home.x; s.y = this.home.y; s.z = this.home.z; s.heading = this.home.heading;
    s.pitch = 0; s.roll = 0; s.speed = 0; s.throttle = 0; s.sink = 0; s.vy = 0; s.gear = true; s.ab = false; s.onGround = true; s.stall = false; s.crashT = 0;
    this.parked = true;
    this.model.group.visible = true;
    this.apply();
  }

  private apply(): void {
    const s = this.st;
    this.model.place(s.x, s.y, s.z, s.heading, s.pitch, s.roll);
    this.model.setGear(s.gear);
  }

  private ground(x: number, z: number): number {
    return Math.max(0.2, this.d.terrain.heightAt(x, z)); // the sea counts as a flat surface at 0.2 m (touching it = a crash, see touchdown)
  }
  private isWater(x: number, z: number): boolean {
    return this.d.terrain.heightAt(x, z) < 0.3;
  }

  telemetry(): JetTelemetry {
    const s = this.st, g = this.ground(s.x, s.z);
    return {
      speed: s.speed, altAgl: Math.max(0, s.y - g), altAsl: s.y, vspeed: s.vy, heading: (deg(s.heading) + 90 + 360) % 360, throttle: s.throttle,
      afterburner: s.ab, gear: s.gear, onGround: s.onGround, stall: s.stall, pitch: s.pitch, roll: s.roll,
    };
  }

  /** Once per frame, before the other vehicle keys. Returns true when F belongs to the jet (or the player is flying it). */
  handleKeys(): boolean {
    const inp = this.d.input;
    if (this.riding) {
      if (inp.wasPressed('KeyG') && !this.st.onGround) { this.st.gear = !this.st.gear; this.d.toast(this.st.gear ? 'ল্যান্ডিং গিয়ার নামানো' : 'ল্যান্ডিং গিয়ার তোলা', 1200); }
      if (inp.wasPressed('KeyX')) { this.st.assist = !this.st.assist; this.d.toast(this.st.assist ? 'স্থিতিশীলকারী চালু' : 'স্থিতিশীলকারী বন্ধ', 1200); }
      if (inp.wasPressed('KeyF')) this.tryExit();
      return true;
    }
    if (this.d.canBoard() && this.near() && inp.wasPressed('KeyF')) {
      this.board();
      return true;
    }
    return false;
  }

  private near(): boolean {
    if (!this.parked || this.st.crashT > 0) return false;
    this.d.player.getWorldPosition(this.tmp);
    return Math.hypot(this.tmp.x - this.st.x, this.tmp.z - this.st.z) < 11 && Math.abs(this.tmp.y - this.st.y) < 6;
  }

  private board(): void {
    this.riding = true;
    this.parked = false;
    this.boardedT = 0;
    this.d.player.setInVehicle(true);
    this.d.onRide(true);
    this.d.orbit.elevation = 0.2;
    this.hud.show();
    this.audio.start();
    this.d.prompt('');
    this.promptOn = false;
    this.d.toast('ফাইটার জেটে উঠলেন: Shift থ্রটল বাড়ান, ১৪০ কিমি/ঘণ্টার পর S টেনে উড়ুন', 4200);
  }

  private tryExit(): void {
    const s = this.st;
    if (!s.onGround || s.speed > 3) { this.d.toast('শুধু মাটিতে থেমে গেলে নামা যায়', 1800); return; }
    // step out on the left side of the jet
    const px = Math.sin(s.heading) * 4.5, pz = -Math.cos(s.heading) * 4.5;
    this.tmp.set(s.x + px, this.ground(s.x + px, s.z + pz) + 1.2, s.z + pz);
    this.riding = false;
    this.parked = true;
    s.throttle = 0; s.ab = false;
    this.d.player.setInVehicle(false);
    this.d.player.teleportTo(this.tmp);
    this.d.onRide(false);
    this.hud.hide();
    this.audio.stop();
  }

  /** Every frame, after the planes moved and BEFORE the camera. */
  update(dt: number): void {
    dt = Math.min(dt, 0.05);
    const s = this.st;
    if (!this.riding) {
      // the parked jet: a hint when the player stands next to it
      const hint = this.d.canBoard() && this.near();
      if (hint) { this.d.prompt('F চাপুন: ফাইটার জেটে উঠুন'); this.promptOn = true; } else if (this.promptOn) { this.d.prompt(''); this.promptOn = false; }
      return;
    }
    this.boardedT += dt;
    if (s.crashT > 0) {
      s.crashT -= dt;
      if (s.crashT <= 0) this.afterCrash();
      this.d.player.carryTo(this.tmp.set(s.x, s.y + 3, s.z));
      return;
    }
    this.control(dt);
    this.apply();
    this.d.player.carryTo(this.tmp.set(s.x, s.y + 3, s.z));
    // the camera swings round behind the jet (gently: the mouse can still look around)
    const behind = Math.atan2(-Math.cos(s.heading), -Math.sin(s.heading));
    const diff = Math.atan2(Math.sin(behind - this.d.orbit.yaw), Math.cos(behind - this.d.orbit.yaw));
    this.d.orbit.yaw += diff * (1 - Math.exp(-1.1 * dt));
    const t = this.telemetry();
    this.hud.update(t, dt);
    this.audio.update(t.throttle, t.afterburner, t.speed);
  }

  private control(dt: number): void {
    const inp = this.d.input, k = (c: string): boolean => inp.isDown(c);
    const c: JetControls = {
      throttleUp: k('ShiftLeft') || k('ShiftRight'), throttleDown: k('KeyC'), afterburner: k('Space'), brake: k('KeyB'),
      pitch: (k('KeyS') ? 1 : 0) - (k('KeyW') ? 1 : 0), roll: (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0), yaw: (k('KeyE') ? 1 : 0) - (k('KeyQ') ? 1 : 0),
    };
    const ev = this.fl.step(dt, c);
    if (ev?.type === 'landed') this.d.toast('নিরাপদে নামলেন', 1400);
    else if (ev?.type === 'crash') {
      this.model.group.visible = false;
      this.d.toast(ev.reason === 'water' ? 'সাগরে পড়ে জেট ধ্বংস' : ev.reason === 'gear' ? 'গিয়ার ছাড়া নামার চেষ্টা: জেট ধ্বংস' : 'শক্ত ল্যান্ডিং: জেট ধ্বংস', 3200);
    }
  }

  private afterCrash(): void {
    // the pilot is rescued: put back on foot at the hardstand, the jet is back on its stand
    this.riding = false;
    this.d.player.setInVehicle(false);
    this.resetToHome();
    this.tmp.set(this.home.x + Math.sin(this.home.heading) * 4.5, this.home.y + 1.4, this.home.z - Math.cos(this.home.heading) * 4.5);
    this.d.player.teleportTo(this.tmp);
    this.d.onRide(false);
    this.hud.hide();
    this.audio.stop();
  }

  setMuted(m: boolean): void {
    this.audio.setMuted(m);
  }

  dispose(): void {
    this.audio.dispose();
    this.hud.dispose();
    this.d.root.remove(this.model.group);
    this.model.dispose();
  }
}

/* ------------------------------------------------------------------ instruments (all Bangla, only real flight data) */

class JetHud {
  private root = document.createElement('div');
  private horizon = document.createElement('canvas');
  private panel = document.createElement('div');
  private ctx: CanvasRenderingContext2D;
  private t = 0;
  private dpr = Math.min(window.devicePixelRatio || 1, 2);

  constructor(private parent: HTMLElement) {
    Object.assign(this.root.style, { position: 'fixed', left: '50%', bottom: '14px', transform: 'translateX(-50%)', display: 'none', gap: '10px', alignItems: 'stretch', pointerEvents: 'none', zIndex: '11' });
    this.horizon.width = 150 * this.dpr; this.horizon.height = 150 * this.dpr;
    Object.assign(this.horizon.style, { width: '150px', height: '150px', borderRadius: '50%', background: 'rgba(0,0,0,0.55)' });
    Object.assign(this.panel.style, { color: '#e8f0ff', font: '500 13px/1.55 system-ui, sans-serif', background: 'rgba(0,0,0,0.6)', padding: '8px 12px', borderRadius: '8px', minWidth: '270px' });
    this.root.append(this.horizon, this.panel);
    this.ctx = this.horizon.getContext('2d')!;
    parent.appendChild(this.root);
  }
  show(): void { this.root.style.display = 'flex'; }
  hide(): void { this.root.style.display = 'none'; }

  update(t: JetTelemetry, dt: number): void {
    this.t += dt;
    if (this.t < 0.06) return;
    this.t = 0;
    const c = this.ctx, S = 150 * this.dpr, r = S / 2;
    c.save();
    c.clearRect(0, 0, S, S);
    c.translate(r, r);
    c.beginPath(); c.arc(0, 0, r - 2, 0, Math.PI * 2); c.clip();
    c.rotate(-t.roll);
    const py = t.pitch * (r / 0.9);
    c.fillStyle = '#4c86c8'; c.fillRect(-S, -S + py, 2 * S, S);
    c.fillStyle = '#7a5a3a'; c.fillRect(-S, py, 2 * S, S);
    c.strokeStyle = '#fff'; c.lineWidth = 2 * this.dpr; c.beginPath(); c.moveTo(-S, py); c.lineTo(S, py); c.stroke();
    c.restore();
    c.save(); c.translate(r, r); c.strokeStyle = '#ffd24a'; c.lineWidth = 3 * this.dpr;
    c.beginPath(); c.moveTo(-r * 0.5, 0); c.lineTo(-r * 0.15, 0); c.lineTo(-r * 0.15, 6 * this.dpr); c.moveTo(r * 0.5, 0); c.lineTo(r * 0.15, 0); c.lineTo(r * 0.15, 6 * this.dpr); c.stroke();
    c.restore();
    const kmh = t.speed * 3.6;
    const warn = t.stall ? '⚠ স্টল' : !t.gear && t.altAgl < 150 && !t.onGround ? '⚠ গিয়ার নামান (G)' : t.altAgl < 60 && t.vspeed < -25 ? '⚠ PULL UP' : '';
    this.panel.innerHTML =
      `গতি <b>${bnn(kmh)}</b> কিমি/ঘণ্টা &nbsp; উচ্চতা <b>${bnn(t.altAgl)}</b> মি (সমুদ্রতল ${bnn(t.altAsl)})<br>` +
      `ওঠা/নামা <b>${bnn(t.vspeed)}</b> মি/সে &nbsp; দিক <b>${bnn(t.heading)}°</b><br>` +
      `থ্রটল <b>${bnn(t.throttle * 100)}%</b>${t.afterburner ? ' 🔥' : ''} &nbsp; গিয়ার <b>${t.gear ? 'নামানো' : 'তোলা'}</b> &nbsp; ${t.onGround ? 'মাটিতে' : 'আকাশে'}` +
      (warn ? `<br><span style="color:#ff6a5a;font-weight:700">${warn}</span>` : '');
  }
  dispose(): void { this.parent.removeChild(this.root); }
}

/* ------------------------------------------------------------------ engine sound (WebAudio: filtered noise + a low rumble) */

class JetAudio {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private filt: BiquadFilterNode | null = null;
  private osc: OscillatorNode | null = null;
  private muted = false;

  start(): void {
    if (this.ctx || typeof AudioContext === 'undefined') return;
    try {
      const ctx = new AudioContext();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 400;
      const gain = ctx.createGain(); gain.gain.value = 0;
      const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 60;
      const og = ctx.createGain(); og.gain.value = 0.08;
      src.connect(filt); filt.connect(gain); osc.connect(og); og.connect(gain); gain.connect(ctx.destination);
      src.start(); osc.start();
      this.ctx = ctx; this.gain = gain; this.filt = filt; this.osc = osc;
    } catch { /* no audio */ }
  }
  update(throttle: number, ab: boolean, speed: number): void {
    if (!this.ctx || !this.gain || !this.filt || !this.osc) return;
    const t = this.ctx.currentTime;
    this.gain.gain.setTargetAtTime(this.muted ? 0 : 0.05 + 0.3 * throttle + (ab ? 0.15 : 0) + Math.min(0.1, speed / 3000), t, 0.1);
    this.filt.frequency.setTargetAtTime(350 + 1900 * throttle + (ab ? 900 : 0) + speed * 3, t, 0.15);
    this.osc.frequency.setTargetAtTime(55 + 90 * throttle, t, 0.2);
  }
  setMuted(m: boolean): void { this.muted = m; }
  stop(): void {
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    const c = this.ctx;
    this.ctx = null; this.gain = null; this.filt = null; this.osc = null;
    if (c) window.setTimeout(() => void c.close(), 400);
  }
  dispose(): void { this.stop(); }
}
