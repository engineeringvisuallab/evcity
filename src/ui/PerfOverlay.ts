import type * as THREE from 'three';
import { UI_FONT } from './theme';

/** Numbers the engine hands to the overlay (everything the overlay cannot read by itself). */
export interface PerfExtra {
  tier: string;
  choice: string;
  /** Render mode: 0 normal, 1 high, 2 = 4K. */
  renderMode: number;
  dynScale: number;
  sitesBuilt: number;
  sitesTotal: number;
  chunksLoaded: number;
  chunksPending: number;
  bodies: number;
  colliders: number;
  people: number;
  cars: number;
  aiCars: number;
}

interface GpuInfo {
  name: string;
  vendor: string;
  masked: boolean;
  webgl: string;
  maxTexture: number;
  maxAniso: number;
}

/** Reads the GPU name (WEBGL_debug_renderer_info). Safari masks it (shows just "Apple GPU"); then `masked` is true. */
function readGpu(renderer: THREE.WebGLRenderer): GpuInfo {
  const gl = renderer.getContext();
  let name = '';
  let vendor = '';
  let masked = true;
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      name = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
      vendor = String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL));
      masked = false;
    } else {
      name = String(gl.getParameter(gl.RENDERER));
      vendor = String(gl.getParameter(gl.VENDOR));
    }
  } catch {
    /* ignore */
  }
  if (/^apple gpu$/i.test(name) || /^webkit/i.test(name)) masked = true;
  return {
    name: name || '?',
    vendor: vendor || '?',
    masked,
    webgl: renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1',
    maxTexture: renderer.capabilities.maxTextureSize,
    maxAniso: renderer.capabilities.getMaxAnisotropy(),
  };
}

/**
 * Performance overlay (F2, or ?perf=1, or the switch in the settings menu): FPS, frame time (average + worst of the last second), draw calls,
 * triangles, geometries, textures, pixel ratio, resolution factor, canvas size, preset, GPU, built sites, loaded chunks, JS heap.
 * "Copy report" copies the same numbers as plain text (to paste from a phone or PC).
 * Costs nothing while hidden: frame() only adds three numbers, the text is rebuilt twice a second and only while visible.
 */
export class PerfOverlay {
  private root = document.createElement('div');
  private text = document.createElement('pre');
  private copyBtn = document.createElement('button');
  private manual = document.createElement('textarea');
  private visible = false;
  private gpu: GpuInfo;
  // one-second window
  private winTime = 0;
  private winFrames = 0;
  private winMax = 0;
  private fps = 0;
  private avgMs = 0;
  private worstMs = 0;
  private timer = 1;
  private lastReport = '';

  constructor(
    parent: HTMLElement,
    private renderer: THREE.WebGLRenderer,
    private collect: () => PerfExtra,
  ) {
    this.gpu = readGpu(renderer);
    // phone: top-left under the Tour button (the touch pad and buttons own the bottom), narrow and small so the minimap stays free
    const narrow = window.matchMedia?.('(max-width: 700px)').matches ?? false;
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '8px',
      ...(narrow ? { top: '64px', maxWidth: '47vw', maxHeight: '60vh', overflow: 'hidden' } : { bottom: '8px', maxWidth: 'min(92vw, 420px)' }),
      padding: '6px 8px',
      background: 'rgba(0,0,0,0.66)',
      color: '#c9f2d0',
      borderRadius: '6px',
      zIndex: '70',
      display: 'none',
      pointerEvents: 'none',
      font: `500 11px/1.4 ${UI_FONT}`,
    });
    Object.assign(this.text.style, { margin: '0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', font: `500 ${narrow ? 9 : 11}px/1.35 ui-monospace, Menlo, Consolas, monospace` });
    this.copyBtn.type = 'button';
    this.copyBtn.textContent = '📋 Copy report';
    Object.assign(this.copyBtn.style, {
      marginTop: '6px',
      padding: '6px 10px',
      borderRadius: '6px',
      border: '1px solid rgba(255,255,255,.4)',
      background: 'rgba(40,60,90,.9)',
      color: '#fff',
      font: `600 12px ${UI_FONT}`,
      pointerEvents: 'auto',
      cursor: 'pointer',
      touchAction: 'manipulation',
    });
    this.copyBtn.addEventListener('click', () => void this.copyReport());
    Object.assign(this.manual.style, { display: 'none', width: '100%', height: '90px', marginTop: '6px', pointerEvents: 'auto', font: '11px monospace' });
    this.manual.readOnly = true;
    this.root.append(this.text, this.copyBtn, this.manual);
    parent.appendChild(this.root);
    try {
      if (new URLSearchParams(location.search).get('perf') === '1') this.setVisible(true);
    } catch {
      /* ignore */
    }
  }

  get isVisible(): boolean {
    return this.visible;
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.root.style.display = on ? 'block' : 'none';
    if (!on) this.manual.style.display = 'none';
    this.timer = 1; // refresh at once
  }

  /** Call once per rendered frame with the frame time in seconds (cheap even when hidden). */
  frame(dt: number): void {
    if (dt <= 0) return;
    const ms = dt * 1000;
    this.winTime += dt;
    this.winFrames++;
    if (ms > this.winMax) this.winMax = ms;
    if (this.winTime >= 1) {
      this.fps = this.winFrames / this.winTime;
      this.avgMs = (this.winTime * 1000) / this.winFrames;
      this.worstMs = this.winMax;
      this.winTime = 0;
      this.winFrames = 0;
      this.winMax = 0;
    }
  }

  /** Call once per rendered frame AFTER renderer.render (renderer.info holds the numbers of that frame). */
  update(dt: number): void {
    if (!this.visible) return;
    this.timer += dt;
    if (this.timer < 0.5) return;
    this.timer = 0;
    this.lastReport = this.buildReport(false);
    this.text.textContent = this.lastReport;
  }

  private heapMB(): number | null {
    const m = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory; // Chrome only
    return m ? m.usedJSHeapSize / 1048576 : null;
  }

  /** The report as plain text. */
  buildReport(full = true): string {
    const r = this.renderer;
    const info = r.info;
    const x = this.collect();
    const c = r.domElement;
    const heap = this.heapMB();
    const nav = navigator as Navigator & { deviceMemory?: number };
    const modeName = ['normal', 'high', '4K'][x.renderMode] ?? String(x.renderMode);
    const L: string[] = [];
    L.push(`FPS ${this.fps.toFixed(1)} | frame avg ${this.avgMs.toFixed(1)} ms | worst ${this.worstMs.toFixed(1)} ms`);
    L.push(`draw calls ${info.render.calls} | triangles ${info.render.triangles} | lines ${info.render.lines} | points ${info.render.points}`);
    L.push(`geometries ${info.memory.geometries} | textures ${info.memory.textures} | programs ${info.programs?.length ?? 0}`);
    L.push(`pixel ratio ${r.getPixelRatio().toFixed(2)} | dyn-res scale ${x.dynScale.toFixed(2)} | render mode ${modeName}`);
    L.push(`canvas ${c.width}x${c.height} (${((c.width * c.height) / 1e6).toFixed(2)} MP) | css ${c.clientWidth}x${c.clientHeight} | dpr ${(window.devicePixelRatio || 1).toFixed(2)}`);
    L.push(`preset ${x.tier} | choice ${x.choice}`);
    L.push(`GPU ${this.gpu.name}${this.gpu.masked ? ' (masked)' : ''} | ${this.gpu.webgl} | max tex ${this.gpu.maxTexture} | aniso ${this.gpu.maxAniso}`);
    L.push(`sites built ${x.sitesBuilt}/${x.sitesTotal} | chunks loaded ${x.chunksLoaded} (pending ${x.chunksPending})`);
    L.push(`physics bodies ${x.bodies} | colliders ${x.colliders} | people ${x.people} | cars ${x.cars} (AI ${x.aiCars})`);
    L.push(`JS heap ${heap === null ? 'n/a (not available in this browser)' : heap.toFixed(0) + ' MB'}`);
    L.push(`cores ${nav.hardwareConcurrency ?? '?'} | device memory ${nav.deviceMemory ?? 'n/a'} GB | screen ${screen.width}x${screen.height} | touch ${nav.maxTouchPoints ?? 0}`);
    if (full) L.push(`UA ${nav.userAgent}`); // only in the copied report (too long for the screen)
    return L.join('\n');
  }

  /** Copies the report. Clipboard API first, then the old execCommand path (Safari / http), then a text box to copy by hand. */
  async copyReport(): Promise<void> {
    const t = `EVCity perf report ${new Date().toISOString()}\n${this.buildReport()}`;
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(t);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        this.manual.style.display = 'block';
        this.manual.value = t;
        this.manual.focus();
        this.manual.select();
        this.manual.setSelectionRange(0, t.length);
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
    }
    if (ok) this.manual.style.display = 'none';
    else {
      this.manual.style.display = 'block';
      this.manual.value = t;
      this.manual.select();
    }
    this.copyBtn.textContent = ok ? '✅ Copied' : '⚠️ Select the text below and copy it';
    window.setTimeout(() => (this.copyBtn.textContent = '📋 Copy report'), 2500);
  }

  dispose(): void {
    this.root.remove();
  }
}
