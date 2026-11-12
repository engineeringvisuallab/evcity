// EVLab Tower: procedural canvas textures for the podium, lobby and hall (no image files). All tiles are seamless.
import * as THREE from 'three';
import { mulberry32, type Kit } from '../structures';

export interface EVLabTextures {
  stone: THREE.CanvasTexture;
  marbleCream: THREE.CanvasTexture;
  marbleDark: THREE.CanvasTexture;
  wood: THREE.CanvasTexture;
  carpet: THREE.CanvasTexture;
  ceiling: THREE.CanvasTexture;
  logo: THREE.CanvasTexture;
  /** Curtain-wall glass of the podium (one tile = 5 m x 8.5 m) and its warm-window glow map. */
  podium: THREE.CanvasTexture;
  podiumGlow: THREE.CanvasTexture;
  /** Three paintings for the lobby walls. */
  art: THREE.CanvasTexture[];
}

const repeat = (t: THREE.CanvasTexture): THREE.CanvasTexture => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };

export function makeTextures(k: Kit): EVLabTextures {
  const noise = (c: CanvasRenderingContext2D, w: number, h: number, seed: number, n: number, a: number, light: boolean): void => {
    const r = mulberry32(seed);
    for (let i = 0; i < n; i++) { c.fillStyle = `rgba(${light ? 255 : 0},${light ? 255 : 0},${light ? 255 : 0},${(r() * a).toFixed(3)})`; c.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
  };
  const stone = repeat(k.texture(256, 256, (c, w, h) => {
    c.fillStyle = '#b9b2a4'; c.fillRect(0, 0, w, h);
    noise(c, w, h, 11, 1800, 0.18, false); noise(c, w, h, 12, 1200, 0.2, true);
    c.strokeStyle = 'rgba(70,64,54,0.5)'; c.lineWidth = 2; c.strokeRect(0, 0, w, h); c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
  }));
  const marble = (base: string, vein: string, seed: number): THREE.CanvasTexture => repeat(k.texture(256, 256, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    const r = mulberry32(seed);
    c.strokeStyle = vein; c.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) { let x = r() * w, y = r() * h; c.beginPath(); c.moveTo(x, y); for (let s = 0; s < 8; s++) { x += (r() - 0.35) * 40; y += (r() - 0.5) * 40; c.lineTo(((x % w) + w) % w, ((y % h) + h) % h); } c.stroke(); }
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 2; c.strokeRect(0, 0, w, h);
  }));
  const marbleCream = marble('#ece3cf', 'rgba(150,130,100,0.35)', 21);
  const marbleDark = marble('#34343a', 'rgba(210,190,140,0.3)', 22);
  const wood = repeat(k.texture(256, 256, (c, w, h) => {
    const r = mulberry32(31);
    for (let y = 0; y < h; y += 32) { const L = 92 + r() * 22; c.fillStyle = `rgb(${L + 40},${L},${L - 40})`; c.fillRect(0, y, w, 32); c.fillStyle = 'rgba(40,20,5,0.35)'; c.fillRect(0, y, w, 2); }
    noise(c, w, h, 32, 900, 0.18, false);
  }));
  // (was a red carpet: now a polished light-grey marble with soft grey veins, so the offices, wings, ramps and hall floors are stone)
  const carpet = marble('#dcdde0', 'rgba(105,112,126,0.38)', 23);
  const ceiling = repeat(k.texture(128, 128, (c, w, h) => {
    c.fillStyle = '#e9e6df'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 2; c.strokeRect(0, 0, w, h); noise(c, w, h, 51, 300, 0.08, false);
  }));
  const logo = k.texture(512, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#15233a'); g.addColorStop(1, '#0a1220'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#d4af37'; c.lineWidth = 4; c.strokeRect(5, 5, w - 10, h - 10);
    c.fillStyle = '#f3d77a'; c.font = 'bold 74px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('EVLAB', w / 2, h / 2 + 4);
  });
  const podium = repeat(k.texture(128, 218, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a5a74'); g.addColorStop(1, '#16394c'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(8, 8, w * 0.4, h - 16);
    c.fillStyle = '#c9b27a'; c.fillRect(0, 0, w, 5); c.fillRect(0, 0, 4, h);
  }));
  const podiumGlow = repeat(k.texture(128, 218, (c, w, h) => {
    c.fillStyle = '#7a5a2a'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd89a'; c.fillRect(12, 12, w - 24, h - 40);
  }));
  const painting = (seed: number, a: string, b: string, cc: string): THREE.CanvasTexture => k.texture(256, 256, (c, w, h) => {
    const r = mulberry32(seed); c.fillStyle = a; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) { c.fillStyle = [b, cc, '#f3e9d2'][i % 3]; c.globalAlpha = 0.5 + r() * 0.4; c.fillRect(r() * w * 0.7, r() * h * 0.7, 40 + r() * 110, 30 + r() * 100); }
    c.globalAlpha = 1;
  });
  const art = [painting(61, '#1f3a5c', '#d4af37', '#c4512d'), painting(62, '#2f4f3a', '#e8d9a8', '#7a1f2b'), painting(63, '#3a2a4a', '#4aa8e8', '#f0b04a')];
  return { stone, marbleCream, marbleDark, wood, carpet, ceiling, logo, podium, podiumGlow, art };
}
