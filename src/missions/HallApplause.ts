// PRESENTATION HALL: applause made with WebAudio (no sound files). Nothing happens if the browser has no audio.

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ctx;
  } catch {
    return null;
  }
}

/** `seconds` of clapping: many short filtered noise bursts, loudest in the middle. `level` 0..1. */
export function applause(seconds: number, level: number): void {
  const c = audio();
  if (!c || !noise) return;
  const t0 = c.currentTime + 0.02;
  const claps = Math.round(seconds * 55 * (0.4 + level));
  for (let i = 0; i < claps; i++) {
    const at = t0 + Math.random() * seconds;
    const x = (at - t0) / seconds;
    const env = Math.sin(Math.PI * Math.min(1, x * 1.15)) ** 0.7;
    const src = c.createBufferSource();
    src.buffer = noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900 + Math.random() * 2600;
    f.Q.value = 0.9;
    const g = c.createGain();
    const peak = 0.05 * level * env * (0.5 + Math.random());
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05 + Math.random() * 0.04);
    src.connect(f);
    f.connect(g);
    g.connect(c.destination);
    src.start(at, Math.random() * 0.8, 0.12);
  }
}
