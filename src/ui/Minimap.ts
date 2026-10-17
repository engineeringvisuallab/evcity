import { Config } from '../core/Config';
import type { CitySite } from '../terrain';
import { ZONE_COLOR, type CityPlan } from '../city/CityPlan';
import { AIRPORT, SEAPORT, WORLD_ZONE_COLOR, rasterizeWorldZones } from '../city/WorldZones';
import type { RailNetwork } from '../rail';
import { bn } from '../i18n';
import type { MinimapRequest, MinimapResult } from '../workers/minimap.worker';
import { UI_FONT } from './theme';

export type MapMarkerKind = 'foot' | 'car' | 'heli';

export interface MapMarker {
  x: number;
  z: number;
  /** Degrees clockwise from north. */
  heading: number;
  kind: MapMarkerKind;
  color?: string;
}

export interface MapState {
  /** The thing you are controlling: on foot, in a car, or in the helicopter. */
  me: MapMarker;
  /** Camera view direction in degrees (shows the view cone when on foot). */
  viewHeading: number | null;
  /** Everything else (parked vehicles, helicopters). */
  others: MapMarker[];
}

const BASE_SIZE = 1024;
const ZOOM_SPANS = [2400, 6000, 10600]; // metres across: close / medium / whole world

/**
 * The site map: always on screen (top-right), north is up, centred on you.
 * The terrain picture is painted once in a Web Worker. The N key cycles close / medium / whole world.
 * Shows rivers, lakes, sea, the city zones, you (with view cone) and the parked vehicles.
 */
export class Minimap {
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement | null = null;
  private zoom = 1;
  private px = 220;
  private dpr = Math.min(window.devicePixelRatio || 1, 2);
  private worker: Worker;
  private t = 0;
  /** STAGE 11A: the whole-map zones (residential, industrial, airport, seaport ...) as one small picture, 100 m per pixel. */
  private zoneLayer: HTMLCanvasElement;

  constructor(
    parent: HTMLElement,
    seed: number,
    private sites: CitySite[],
    private plan: CityPlan,
    private rail: RailNetwork,
  ) {
    this.zoneLayer = Minimap.makeZoneLayer();
    const c = this.canvas;
    this.setSize();
    Object.assign(c.style, {
      position: 'fixed',
      right: '14px',
      top: '14px',
      borderRadius: '14px',
      border: '2px solid rgba(255,255,255,0.55)',
      boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
      background: '#0c1a2a',
      pointerEvents: 'none',
      zIndex: '11',
    });
    parent.appendChild(c);
    this.ctx = c.getContext('2d')!;
    window.addEventListener('resize', () => this.setSize());

    this.worker = new Worker(new URL('../workers/minimap.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<MinimapResult>) => {
      const b = document.createElement('canvas');
      b.width = b.height = e.data.size;
      b.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(e.data.rgba.buffer as ArrayBuffer), e.data.size, e.data.size), 0, 0);
      this.base = b;
      this.worker.terminate();
    };
    const half = Config.world.size / 2 + Config.world.chunkMargin * Config.world.chunkSize;
    this.worker.postMessage({ seed, size: BASE_SIZE, half } satisfies MinimapRequest);
  }

  private static makeZoneLayer(): HTMLCanvasElement {
    const z = rasterizeWorldZones(100);
    const c = document.createElement('canvas');
    c.width = c.height = z.n;
    const g = c.getContext('2d')!;
    const img = g.createImageData(z.n, z.n);
    for (let k = 0; k < z.ids.length; k++) {
      const hex = WORLD_ZONE_COLOR[z.kinds[z.ids[k]]];
      img.data[k * 4] = parseInt(hex.slice(1, 3), 16);
      img.data[k * 4 + 1] = parseInt(hex.slice(3, 5), 16);
      img.data[k * 4 + 2] = parseInt(hex.slice(5, 7), 16);
      img.data[k * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** N key: close -> medium -> whole world. */
  cycleZoom(): void {
    this.zoom = (this.zoom + 1) % ZOOM_SPANS.length;
  }

  private setSize(): void {
    this.px = Math.round(Math.max(150, Math.min(230, Math.min(window.innerWidth, window.innerHeight) * 0.3)));
    this.canvas.width = this.px * this.dpr;
    this.canvas.height = this.px * this.dpr;
    this.canvas.style.width = `${this.px}px`;
    this.canvas.style.height = `${this.px}px`;
  }

  update(dt: number, s: MapState): void {
    this.t += dt;
    const c = this.ctx;
    const S = this.canvas.width;
    const span = ZOOM_SPANS[this.zoom];
    const half = Config.world.size / 2 + Config.world.chunkMargin * Config.world.chunkSize;
    const ppm = S / span; // canvas pixels per metre
    const cx = s.me.x;
    const cz = s.me.z;
    const X = (x: number) => (x - cx) * ppm + S / 2;
    const Z = (z: number) => (z - cz) * ppm + S / 2;

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#0c1a2a';
    c.fillRect(0, 0, S, S);

    if (this.base) {
      // map picture: world [-half, half] -> base [0, BASE_SIZE]
      const k = BASE_SIZE / (2 * half);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(this.base, 0, 0, BASE_SIZE, BASE_SIZE, X(-half), Z(-half), 2 * half * ppm, 2 * half * ppm);
      void k;
      // edge of the playable area
      const e = Config.world.size / 2;
      c.strokeStyle = 'rgba(255,255,255,0.45)';
      c.lineWidth = Math.max(1, this.dpr);
      c.setLineDash([6 * this.dpr, 5 * this.dpr]);
      c.strokeRect(X(-e), Z(-e), 2 * e * ppm, 2 * e * ppm);
      c.setLineDash([]);
      // whole-map zones (Stage 11A): translucent colour per zone kind over the terrain picture
      {
        const e0 = Config.world.size / 2;
        c.save();
        c.globalAlpha = 0.42;
        c.imageSmoothingEnabled = false;
        c.drawImage(this.zoneLayer, X(-e0), Z(-e0), 2 * e0 * ppm, 2 * e0 * ppm);
        c.restore();
        // airport runway and port quay: thin white outlines so they read even at the whole-world zoom
        c.strokeStyle = '#ffffff';
        c.lineWidth = Math.max(1, this.dpr);
        for (const f of [AIRPORT, SEAPORT]) c.strokeRect(X(f.x0), Z(f.z0), (f.x1 - f.x0) * ppm, (f.z1 - f.z0) * ppm);
        const rw = AIRPORT.areas[0];
        c.fillStyle = '#222';
        c.fillRect(X(rw.x0), Z(rw.z0), (rw.x1 - rw.x0) * ppm, Math.max(2 * this.dpr, (rw.z1 - rw.z0) * ppm));
      }
      // planned city areas (Stage 10A): one translucent colour per zone kind; later areas are drawn first so the first (highest priority) is on top
      for (let i = this.plan.areas.length - 1; i >= 0; i--) {
        const a = this.plan.areas[i];
        c.fillStyle = ZONE_COLOR[a.kind] + (a.shape.t === 'ring' ? '38' : '88');
        if (a.shape.t === 'rect') {
          const s = a.shape;
          c.fillRect(X(a.cx + s.x0), Z(a.cz + s.z0), (s.x1 - s.x0) * ppm, (s.z1 - s.z0) * ppm);
        } else {
          c.beginPath();
          c.arc(X(a.cx), Z(a.cz), a.shape.r1 * ppm, 0, Math.PI * 2);
          if (a.shape.r0 > 0) c.arc(X(a.cx), Z(a.cz), a.shape.r0 * ppm, 0, Math.PI * 2, true);
          c.fill('evenodd');
        }
      }
      // city zones
      c.strokeStyle = '#ffd21f';
      c.lineWidth = 1.6 * this.dpr;
      for (const site of this.sites) {
        c.beginPath();
        c.arc(X(site.x), Z(site.z), site.coreRadius * ppm, 0, Math.PI * 2);
        c.stroke();
      }
      // railway network (Stage 11B): dark line + white dashes, station areas as rings
      {
        const line = (): void => {
          for (const ed of this.rail.edges) {
            c.beginPath();
            for (let i = 0; i < ed.xs.length; i++) (i ? c.lineTo(X(ed.xs[i]), Z(ed.zs[i])) : c.moveTo(X(ed.xs[i]), Z(ed.zs[i])));
            c.stroke();
          }
        };
        c.lineJoin = 'round';
        c.strokeStyle = '#111';
        c.lineWidth = 3.4 * this.dpr;
        line();
        c.strokeStyle = '#fff';
        c.lineWidth = 1.6 * this.dpr;
        c.setLineDash([5 * this.dpr, 5 * this.dpr]);
        line();
        c.setLineDash([]);
        c.font = `700 ${10 * this.dpr}px ${UI_FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'bottom';
        for (const st of this.rail.stations) {
          c.beginPath();
          c.arc(X(st.x), Z(st.z), Math.max(3.5 * this.dpr, st.radius * ppm), 0, Math.PI * 2);
          c.fillStyle = 'rgba(255,255,255,0.25)';
          c.fill();
          c.strokeStyle = '#fff';
          c.lineWidth = 1.8 * this.dpr;
          c.stroke();
          if (this.zoom >= 1) {
            const name = bn.rail.station[st.id] ?? st.id;
            c.strokeStyle = 'rgba(0,0,0,0.75)';
            c.lineWidth = 3 * this.dpr;
            c.strokeText(name, X(st.x), Z(st.z) - 5 * this.dpr);
            c.fillStyle = '#fff';
            c.fillText(name, X(st.x), Z(st.z) - 5 * this.dpr);
          }
        }
      }
    } else {
      // painting the map: a soft moving highlight, no text
      const g = c.createLinearGradient(((this.t * 0.6) % 1.6) * S - S * 0.3, 0, ((this.t * 0.6) % 1.6) * S, S * 0.3);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.10)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, S, S);
    }

    // other vehicles
    for (const o of s.others) this.drawMarker(c, X(o.x), Z(o.z), o, false);

    // view cone (on foot) + you
    if (s.viewHeading !== null) {
      c.save();
      c.translate(S / 2, S / 2);
      c.rotate((s.viewHeading * Math.PI) / 180);
      const r = 34 * this.dpr;
      const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, r, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
      c.closePath();
      c.fill();
      c.restore();
    }
    this.drawMarker(c, S / 2, S / 2, s.me, true);

    // north marker (the only letter on the map)
    c.fillStyle = '#fff';
    c.strokeStyle = 'rgba(0,0,0,0.7)';
    c.lineWidth = 3 * this.dpr;
    c.font = `700 ${12 * this.dpr}px ${UI_FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.strokeText(bn.map.north, S / 2, 5 * this.dpr);
    c.fillText(bn.map.north, S / 2, 5 * this.dpr);
  }

  private drawMarker(c: CanvasRenderingContext2D, x: number, y: number, m: MapMarker, me: boolean): void {
    const d = this.dpr;
    c.save();
    c.translate(x, y);
    c.rotate((m.heading * Math.PI) / 180);
    if (m.kind === 'foot' || me) {
      const a = (me ? 8 : 5) * d;
      c.fillStyle = me ? '#ff3b30' : (m.color ?? '#fff');
      c.strokeStyle = '#fff';
      c.lineWidth = 1.6 * d;
      c.beginPath();
      c.moveTo(0, -a);
      c.lineTo(a * 0.72, a * 0.85);
      c.lineTo(0, a * 0.42);
      c.lineTo(-a * 0.72, a * 0.85);
      c.closePath();
      c.fill();
      c.stroke();
    } else if (m.kind === 'car') {
      c.fillStyle = m.color ?? '#fff';
      c.strokeStyle = '#fff';
      c.lineWidth = 1.4 * d;
      c.beginPath();
      c.roundRect(-3 * d, -5 * d, 6 * d, 10 * d, 1.5 * d);
      c.fill();
      c.stroke();
    } else {
      c.fillStyle = '#fff';
      c.strokeStyle = '#1b2a3a';
      c.lineWidth = 1.4 * d;
      c.beginPath();
      c.arc(0, 0, 4.2 * d, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(-6 * d, 0);
      c.lineTo(6 * d, 0);
      c.moveTo(0, -6 * d);
      c.lineTo(0, 6 * d);
      c.stroke();
    }
    c.restore();
  }
}
