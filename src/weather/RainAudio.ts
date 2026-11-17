/**
 * Procedural rain sound (Web Audio, no files): a soft low "body" of rain, a bright hiss on top (the drops), and thunder claps.
 * It is created the first time it rains, follows the rain strength, gets muffled when the player is sheltered (inside a building,
 * under water) and obeys the game's mute switch.
 */
export class RainAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bodyGain: GainNode | null = null;
  private hissGain: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private muted = false;

  setMuted(m: boolean): void {
    this.muted = m;
    if (m && this.master && this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  /** @param intensity 0..1  @param shelter 0..1 (1 = indoors or under water: dull and quiet) */
  update(intensity: number, shelter: number): void {
    if (typeof AudioContext === 'undefined') return;
    if (!this.ctx) {
      if (intensity < 0.03 || this.muted) return; // build on the first rain (a user gesture has happened by then)
      this.build();
    }
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    const i = Math.min(1, intensity);
    const out = this.muted ? 0 : Math.pow(i, 0.8) * (1 - 0.7 * shelter) * 0.55;
    this.master.gain.setTargetAtTime(out, now, 0.4);
    this.bodyGain?.gain.setTargetAtTime(0.5 + 0.5 * i, now, 0.4);
    this.hissGain?.gain.setTargetAtTime((0.25 + 0.75 * i) * (1 - 0.8 * shelter), now, 0.4);
    this.lowpass?.frequency.setTargetAtTime(7000 - 5200 * shelter, now, 0.3);
  }

  /** One thunder clap (power 0..1). */
  thunder(power: number, shelter: number): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || !this.noiseBuf) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, now);
    lp.frequency.exponentialRampToValueAtTime(70, now + 3.5);
    const g = ctx.createGain();
    const peak = (0.35 + 0.6 * power) * (1 - 0.5 * shelter);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.06);
    // a crack, then a long rumble that rolls (a few humps)
    g.gain.exponentialRampToValueAtTime(peak * 0.35, now + 0.5);
    g.gain.exponentialRampToValueAtTime(peak * 0.6, now + 0.9);
    g.gain.exponentialRampToValueAtTime(peak * 0.15, now + 2.0);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 4.2);
    src.connect(lp);
    lp.connect(g);
    g.connect(ctx.destination);
    src.start(now);
    src.stop(now + 4.4);
    src.onended = () => {
      src.disconnect();
      lp.disconnect();
      g.disconnect();
    };
  }

  private build(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.97 * b0 + 0.03 * w; // a little pink: soft
      d[i] = w * 0.6 + b0 * 6;
    }
    this.noiseBuf = buf;

    const master = ctx.createGain();
    master.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    master.connect(lp);
    lp.connect(ctx.destination);
    this.master = master;
    this.lowpass = lp;

    const mk = (type: BiquadFilterType, freq: number, q: number): { gain: GainNode } => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = 0.9 + Math.random() * 0.2;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(0, Math.random() * 2);
      return { gain: g };
    };
    this.bodyGain = mk('lowpass', 1100, 0.5).gain;
    this.hissGain = mk('bandpass', 5200, 0.7).gain;
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }
}
