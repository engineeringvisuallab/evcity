import * as THREE from 'three';
import { Parts } from './EVLabParts';
import { CLOCK_H, CLOCK_W, DIAL, DIGITAL, clockQuads } from './EVLabClockPlan';
import { DEFAULT_COUNTRY, clockTime, countryOf, digital, handAngles, type ClockTime } from './EVLabClockZones';

// EVLab Step RT6: the real-time clock on the 4 faces of the tower (analog dial + digital line). ONE canvas texture is shared by all 4 faces, ONE mesh
// (4 faces x 4 levels = 16 quads, 32 triangles, one draw call). The texture is redrawn only when the second changes (1 x per second, not per frame),
// and at once when the country is changed in Settings. Real time (Date.now) in the zone of the country; it does not use the game's DayNight.

export interface ClockBuild {
  group: THREE.Group;
  /** Call every frame with Date.now(); it draws only when the second changed. */
  tick(nowMs: number): void;
  /** Country code from Settings (an unknown code = the default country). */
  setCountry(code: string): void;
  setNight(k: number): void;
  readonly country: string;
  tris: number;
}

const TEX_W = 1024;

function drawStatic(c: CanvasRenderingContext2D, pm: number): void {
  const cx = DIAL.cx * pm, cy = DIAL.cy * pm, R = DIAL.r * pm;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  // gold rim, cream face
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fillStyle = '#c9a14a'; c.fill();
  c.beginPath(); c.arc(cx, cy, R * 0.93, 0, Math.PI * 2); c.fillStyle = '#f7f1e0'; c.fill();
  c.beginPath(); c.arc(cx, cy, R * 0.93, 0, Math.PI * 2); c.strokeStyle = '#06222e'; c.lineWidth = R * 0.025; c.stroke();
  // 60 ticks (hour ticks longer and thicker)
  c.strokeStyle = '#17252e';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, hour = i % 5 === 0;
    const r0 = R * (hour ? 0.78 : 0.85), r1 = R * 0.9;
    c.lineWidth = R * (hour ? 0.035 : 0.014);
    c.beginPath();
    c.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0);
    c.lineTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
    c.stroke();
  }
  // numerals
  c.fillStyle = '#17252e';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `bold ${Math.round(R * 0.2)}px "Arial Black", Arial, Helvetica, sans-serif`;
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2, r = R * 0.64;
    c.fillText(String(i), cx + Math.sin(a) * r, cy - Math.cos(a) * r);
  }
}

function drawHands(c: CanvasRenderingContext2D, pm: number, t: ClockTime): void {
  const cx = DIAL.cx * pm, cy = DIAL.cy * pm, R = DIAL.r * pm;
  const a = handAngles(t);
  const hand = (ang: number, len: number, back: number, w: number, color: string): void => {
    c.strokeStyle = color;
    c.lineWidth = w;
    c.beginPath();
    c.moveTo(cx - Math.sin(ang) * back, cy + Math.cos(ang) * back);
    c.lineTo(cx + Math.sin(ang) * len, cy - Math.cos(ang) * len);
    c.stroke();
  };
  hand(a.hour, R * 0.5, R * 0.08, R * 0.07, '#17252e');
  hand(a.minute, R * 0.74, R * 0.1, R * 0.045, '#17252e');
  hand(a.second, R * 0.82, R * 0.16, R * 0.018, '#d6362b');
  c.beginPath(); c.arc(cx, cy, R * 0.05, 0, Math.PI * 2); c.fillStyle = '#c9a14a'; c.fill();
}

function drawDigital(c: CanvasRenderingContext2D, pm: number, t: ClockTime): void {
  const capPx = DIGITAL.cap * pm;
  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.font = `bold ${Math.round(capPx / 0.72)}px "Arial Black", Arial, Helvetica, sans-serif`;
  c.lineJoin = 'round';
  c.lineWidth = Math.max(2, capPx * 0.08);
  c.strokeStyle = '#06222e';
  c.fillStyle = '#ffd36b';
  const text = digital(t), y = (DIGITAL.top + DIGITAL.cap) * pm;
  c.strokeText(text, CLOCK_W / 2 * pm, y);
  c.fillText(text, CLOCK_W / 2 * pm, y);
  c.restore();
}

export function buildTowerClock(P: Parts, startCountry: string = DEFAULT_COUNTRY): ClockBuild {
  const { k } = P;
  const g = new THREE.Group();
  g.name = 'EVLabTowerClock';
  const h = Math.round((TEX_W * CLOCK_H) / CLOCK_W), pm = TEX_W / CLOCK_W;
  let zone = countryOf(startCountry).zone, code = countryOf(startCountry).code;
  let lastSec = -1;

  // the dial, ticks and numerals never change: drawn once into a separate canvas, copied each second
  const still = document.createElement('canvas');
  still.width = TEX_W;
  still.height = h;
  drawStatic(still.getContext('2d') as CanvasRenderingContext2D, pm);

  const paint = (c: CanvasRenderingContext2D, ms: number): void => {
    const t = clockTime(zone, ms);
    c.clearRect(0, 0, TEX_W, h);
    c.drawImage(still, 0, 0);
    drawHands(c, pm, t);
    drawDigital(c, pm, t);
  };
  const map = k.texture(TEX_W, h, (c) => paint(c, Date.now()));
  const mat = k.own(new THREE.MeshBasicMaterial({ map, alphaTest: 0.4, toneMapped: false, side: THREE.FrontSide }));

  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const q of clockQuads()) {
    const base = pos.length / 3;
    for (let j = 0; j < 4; j++) { pos.push(q.p[j][0], q.p[j][1], q.p[j][2]); uv.push(q.uv[j][0], q.uv[j][1]); }
    idx.push(base, base + 3, base + 2, base, base + 2, base + 1); // the winding of the glass loft (outward)
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(k.own(geo), mat);
  mesh.name = 'clock';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  g.add(mesh);

  const redraw = (ms: number): void => {
    const c = (map.image as HTMLCanvasElement).getContext('2d');
    if (!c) return;
    paint(c, ms);
    map.needsUpdate = true;
  };
  return {
    group: g,
    tris: idx.length / 3,
    get country(): string { return code; },
    tick: (ms) => {
      const sec = Math.floor(ms / 1000);
      if (sec === lastSec) return;
      lastSec = sec;
      redraw(ms);
    },
    setCountry: (cc) => {
      const co = countryOf(cc);
      if (co.code === code && co.zone === zone) return;
      code = co.code;
      zone = co.zone;
      lastSec = -1; // the next tick draws at once
    },
    setNight: (nk) => { mat.color.setScalar(0.88 + 0.12 * nk); },
  };
}
