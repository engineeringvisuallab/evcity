// Export panel: a button in the top-left toolbar (next to Tour and Settings) opens it. GIS layers -> one .zip (shapefile and / or GeoJSON),
// 3D of the area around you -> .glb or .obj. It owns no game logic: the game gives it the terrain data, the scene and the camera position.
import type * as THREE from 'three';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { UI_FONT } from '../ui/theme';
import { getToolbar } from '../ui/Toolbar';
import { FILL_MODEL_BY_ID } from '../buildings/models/fillRegistry';
import { planStreetLights } from '../environment/StreetLights';
import { GIS_LAYERS, type GisContext, type GisFormat } from './GisLayers';
import { buildGisZip, saveFile } from './GisExport';
import { exportModel, MAX_RADIUS, type ModelFormat } from './ModelExport';
import { exportRealModel } from './RealExport';
import { ALL_REAL_LAYERS, type RealLayers, type RealQuality } from './RealModel';

export interface ExportPanelDeps {
  terrain: TerrainGenerator;
  scene: THREE.Object3D;
  /** Camera position in render space (the "what is loaded now" 3D export is centred here). */
  cameraPos: () => { x: number; z: number };
  /** Camera position in WORLD metres (the real 3D export is centred here). */
  cameraWorld: () => { x: number; z: number };
  /** The element that takes the mouse back (pointer lock) when the panel closes. */
  lockTarget: HTMLElement;
}

const CSS = `
.evx-btn { width:46px; height:46px; border-radius:12px; border:1px solid rgba(255,255,255,.48); background:linear-gradient(135deg,#2b3a55,#18222f); color:#fff; font-size:22px; line-height:1;
  cursor:pointer; pointer-events:auto; box-shadow:0 4px 16px rgba(0,0,0,.28); transition:transform .15s ease,filter .15s ease; order:2; }
.evx-btn:hover { filter:brightness(1.15); transform:translateY(-1px); }
.evx-btn:focus-visible, .evx-opt:focus-visible, .evx-go:focus-visible, .evx-close:focus-visible { outline:3px solid #fff; outline-offset:3px; }
.evx-overlay { position:fixed; inset:0; z-index:950; display:none; align-items:center; justify-content:center; padding:16px; background:rgba(3,10,14,.74); backdrop-filter:blur(6px); pointer-events:auto; font-family:${UI_FONT}; color:#fff; }
.evx-panel { width:min(640px,96vw); max-height:min(88vh,860px); overflow:auto; border-radius:20px; border:1px solid rgba(255,255,255,.2); background:linear-gradient(155deg,#172b30,#0b171b); padding:22px 24px 20px; box-shadow:0 24px 70px rgba(0,0,0,.5); }
.evx-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:4px; }
.evx-title { font-size:24px; font-weight:800; }
.evx-close { border:1px solid rgba(255,255,255,.25); border-radius:10px; padding:7px 13px; background:rgba(255,255,255,.08); color:#fff; font:500 14px ${UI_FONT}; cursor:pointer; }
.evx-sub { font-size:13px; color:rgba(255,255,255,.62); margin-bottom:6px; }
.evx-sec { margin-top:18px; }
.evx-sec > h3 { margin:0 0 8px; font-size:15px; font-weight:700; color:#ffd21f; }
.evx-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; }
.evx-grid3 { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.evx-opt { text-align:left; padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.17); background:rgba(255,255,255,.055); color:#fff; font:600 14px/1.35 ${UI_FONT}; cursor:pointer; }
.evx-opt:hover { background:rgba(255,210,31,.12); border-color:#ffd21f; }
.evx-opt.on { background:rgba(255,210,31,.2); border-color:#ffd21f; box-shadow:0 0 0 1px #ffd21f inset; }
.evx-opt small { display:block; margin-top:2px; font-weight:400; font-size:12px; color:rgba(255,255,255,.66); }
.evx-go { margin-top:12px; width:100%; padding:12px; border-radius:12px; border:1px solid #35c985; background:#1f9d62; color:#fff; font:700 15px ${UI_FONT}; cursor:pointer; }
.evx-go:disabled { opacity:.55; cursor:wait; }
.evx-note { margin-top:8px; font-size:12px; line-height:1.55; color:rgba(255,255,255,.6); white-space:pre-line; }
.evx-range { width:100%; margin:8px 0 2px; }
.evx-row { display:flex; justify-content:space-between; font-size:13px; }
@media (max-width:520px) { .evx-grid, .evx-grid3 { grid-template-columns:1fr; } .evx-panel { padding:16px; } }
`;

export class ExportPanel {
  private btn = document.createElement('button');
  private overlay = document.createElement('div');
  private style = document.createElement('style');
  private layerOn = new Set<string>(GIS_LAYERS.map((l) => l.id));
  private layerBtns = new Map<string, HTMLButtonElement>();
  private gisFormat: GisFormat = 'shp';
  private fmtBtns = new Map<GisFormat, HTMLButtonElement>();
  private modelFormat: ModelFormat = 'glb';
  private modelBtns = new Map<ModelFormat, HTMLButtonElement>();
  private mode: 'real' | 'scene' = 'real';
  private modeBtns = new Map<'real' | 'scene', HTMLButtonElement>();
  private realLayers: RealLayers = { ...ALL_REAL_LAYERS };
  private realLayerBtns = new Map<keyof RealLayers, HTMLButtonElement>();
  private quality: RealQuality = 'medium';
  private qualityBtns = new Map<RealQuality, HTMLButtonElement>();
  private realRadius = 600;
  private sceneRadius = 300;
  private radiusLabel = document.createElement('b');
  private radiusInput = document.createElement('input');
  private realBox = document.createElement('div');
  private sceneNote = document.createElement('div');
  private gisCtx: GisContext = {
    buildingFloors: (id) => FILL_MODEL_BY_ID[id]?.floors,
    planLamps: (roads) => planStreetLights(roads),
  };
  private gisGo = document.createElement('button');
  private modelGo = document.createElement('button');
  private gisNote = document.createElement('div');
  private modelNote = document.createElement('div');
  private open_ = false;
  private relock = false;

  constructor(parent: HTMLElement, private d: ExportPanelDeps) {
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.btn.className = 'evx-btn';
    this.btn.type = 'button';
    this.btn.textContent = '📤';
    this.btn.title = 'এক্সপোর্ট (GIS / 3D)';
    this.btn.setAttribute('aria-label', 'এক্সপোর্ট');
    this.btn.addEventListener('click', () => this.toggle());
    getToolbar(parent).appendChild(this.btn);

    this.overlay.className = 'evx-overlay';
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    this.overlay.appendChild(this.buildPanel());
    parent.appendChild(this.overlay);
    window.addEventListener('keydown', this.onKey);
    this.refresh();
  }

  get isOpen(): boolean {
    return this.open_;
  }

  toggle(): void {
    if (this.open_) this.close();
    else this.open();
  }

  open(): void {
    if (this.open_) return;
    this.open_ = true;
    this.relock = !!document.pointerLockElement;
    if (document.pointerLockElement) document.exitPointerLock();
    this.overlay.style.display = 'flex';
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.overlay.style.display = 'none';
    if (this.relock) {
      try {
        const r = (this.d.lockTarget as HTMLElement & { requestPointerLock(): Promise<void> | void }).requestPointerLock();
        if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => undefined);
      } catch {
        /* the browser refuses right after Esc: a click on the screen takes the mouse again */
      }
    }
    this.relock = false;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.btn.remove();
    this.overlay.remove();
    this.style.remove();
  }

  private onKey = (e: KeyboardEvent): void => {
    if (this.open_ && e.code === 'Escape') this.close();
  };

  private option(label: string, hint: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'evx-opt';
    b.textContent = label;
    if (hint) {
      const s = document.createElement('small');
      s.textContent = hint;
      b.appendChild(s);
    }
    b.addEventListener('click', onClick);
    return b;
  }

  private section(title: string): { sec: HTMLElement } {
    const sec = document.createElement('div');
    sec.className = 'evx-sec';
    const h = document.createElement('h3');
    h.textContent = title;
    sec.appendChild(h);
    return { sec };
  }

  private buildPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'evx-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'এক্সপোর্ট');

    const head = document.createElement('div');
    head.className = 'evx-head';
    const title = document.createElement('div');
    title.className = 'evx-title';
    title.textContent = '📤 এক্সপোর্ট';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'evx-close';
    close.textContent = 'বন্ধ (Esc)';
    close.addEventListener('click', () => this.close());
    head.append(title, close);
    const sub = document.createElement('div');
    sub.className = 'evx-sub';
    sub.textContent = 'গেমের সব জিনিস (রাস্তা, ব্রিজ, বিল্ডিং, নদী, রেল, বন্দর, এলাকা...) GIS ফাইল হিসেবে, আর আসল ৩ডি মডেল হিসেবে নামাও।';
    panel.append(head, sub);

    // --- GIS ---
    const gis = this.section('🗺️ GIS লেয়ার');
    const grid = document.createElement('div');
    grid.className = 'evx-grid';
    for (const l of GIS_LAYERS) {
      const b = this.option(l.label, l.hint, () => {
        if (this.layerOn.has(l.id)) this.layerOn.delete(l.id);
        else this.layerOn.add(l.id);
        this.refresh();
      });
      this.layerBtns.set(l.id, b);
      grid.appendChild(b);
    }
    const bulk = document.createElement('div');
    bulk.className = 'evx-grid';
    bulk.style.marginBottom = '8px';
    bulk.append(
      this.option('✅ সব বাছো', '', () => {
        GIS_LAYERS.forEach((l) => this.layerOn.add(l.id));
        this.refresh();
      }),
      this.option('⬜ সব বাদ', '', () => {
        this.layerOn.clear();
        this.refresh();
      }),
    );
    gis.sec.append(bulk, grid);
    const fmtRow = document.createElement('div');
    fmtRow.className = 'evx-grid3';
    fmtRow.style.marginTop = '10px';
    const fmts: [GisFormat, string, string][] = [['shp', 'Shapefile', '.shp .shx .dbf .prj'], ['geojson', 'GeoJSON', '.geojson'], ['both', 'দুটোই', 'আলাদা ফোল্ডারে']];
    for (const [id, label, hint] of fmts) {
      const b = this.option(label, hint, () => {
        this.gisFormat = id;
        this.refresh();
      });
      this.fmtBtns.set(id, b);
      fmtRow.appendChild(b);
    }
    gis.sec.appendChild(fmtRow);
    this.gisGo.type = 'button';
    this.gisGo.className = 'evx-go';
    this.gisGo.textContent = '⬇️ GIS ফাইল (.zip) নামাও';
    this.gisGo.addEventListener('click', () => this.doGis());
    this.gisNote.className = 'evx-note';
    this.gisNote.textContent = 'ম্যাপের মাপ ১০×১০ কিমি, স্থানাঙ্ক লোকাল মিটার গ্রিড (লাট/লং নয়): Easting = x + 5000, Northing = 5000 − z। ফাইলের ভেতরে README আছে।';
    gis.sec.append(this.gisGo, this.gisNote);
    panel.appendChild(gis.sec);

    // --- 3D ---
    const m3 = this.section('🧊 ৩ডি এক্সপোর্ট');
    const modeRow = document.createElement('div');
    modeRow.className = 'evx-grid';
    const modes: ['real' | 'scene', string, string][] = [
      ['real', 'আসল ৩ডি (গেমের ডেটা থেকে)', 'যেকোনো জায়গা বা পুরো ম্যাপ, লোড না থাকলেও: টেরেন, পানি, রাস্তা, মিডিয়ান, ফুটপাথ, রেল, বন্দর, বিল্ডিং ব্লক'],
      ['scene', 'এখন যা লোড আছে', 'ক্যামেরার চারপাশে যা দেখা যাচ্ছে (গাছ, ডিটেইল বিল্ডিং, গাড়ি সহ)'],
    ];
    for (const [id, label, hint] of modes) {
      const b = this.option(label, hint, () => {
        this.mode = id;
        this.refresh();
      });
      this.modeBtns.set(id, b);
      modeRow.appendChild(b);
    }
    m3.sec.appendChild(modeRow);

    // real-3D controls
    this.realBox.style.marginTop = '10px';
    const parts: [keyof RealLayers, string][] = [['terrain', 'টেরেন'], ['water', 'পানি'], ['roads', 'রাস্তা'], ['medians', 'মিডিয়ান'], ['footpaths', 'ফুটপাথ'], ['rail', 'রেল'], ['port', 'বন্দর'], ['buildings', 'বিল্ডিং ব্লক']];
    const pgrid = document.createElement('div');
    pgrid.className = 'evx-grid';
    for (const [id, label] of parts) {
      const b = this.option(label, '', () => {
        this.realLayers[id] = !this.realLayers[id];
        this.refresh();
      });
      this.realLayerBtns.set(id, b);
      pgrid.appendChild(b);
    }
    const qrow = document.createElement('div');
    qrow.className = 'evx-grid3';
    qrow.style.marginTop = '8px';
    const quals: [RealQuality, string, string][] = [['high', 'বেশি', '৩.৯ মি গ্রিড'], ['medium', 'মাঝারি', '৭.৮ মি গ্রিড'], ['low', 'কম', '১৫.৬ মি গ্রিড (পুরো ম্যাপ)']];
    for (const [id, label, hint] of quals) {
      const b = this.option(label, hint, () => {
        this.quality = id;
        this.refresh();
      });
      this.qualityBtns.set(id, b);
      qrow.appendChild(b);
    }
    this.realBox.append(pgrid, qrow);
    this.sceneNote.className = 'evx-note';
    this.sceneNote.textContent = 'কেবল সেই জিনিসই আসবে যা এখন লোড হয়ে দেখা যাচ্ছে। টেরেন/পানির শেডার-ম্যাটেরিয়াল ধূসর সাধারণ ম্যাটেরিয়াল হিসেবে যাবে।';
    m3.sec.append(this.realBox, this.sceneNote);

    const mrow = document.createElement('div');
    mrow.className = 'evx-grid';
    mrow.style.marginTop = '10px';
    const mfs: [ModelFormat, string, string][] = [['glb', 'GLB (glTF)', 'রংসহ: Blender, Unity, Unreal, ওয়েব ভিউয়ার'], ['obj', 'OBJ', 'AutoCAD, SketchUp, MeshLab (ছোট এলাকার জন্য)']];
    for (const [id, label, hint] of mfs) {
      const b = this.option(label, hint, () => {
        this.modelFormat = id;
        this.refresh();
      });
      this.modelBtns.set(id, b);
      mrow.appendChild(b);
    }
    m3.sec.appendChild(mrow);
    this.radiusInput.type = 'range';
    this.radiusInput.className = 'evx-range';
    this.radiusInput.addEventListener('input', () => {
      if (this.mode === 'real') this.realRadius = Number(this.radiusInput.value);
      else this.sceneRadius = Number(this.radiusInput.value);
      this.refresh();
    });
    const rrow = document.createElement('div');
    rrow.className = 'evx-row';
    const rl = document.createElement('span');
    rl.textContent = 'ব্যাসার্ধ (তোমার জায়গা থেকে)';
    rrow.append(rl, this.radiusLabel);
    m3.sec.append(rrow, this.radiusInput);
    this.modelGo.type = 'button';
    this.modelGo.className = 'evx-go';
    this.modelGo.textContent = '⬇️ ৩ডি ফাইল নামাও';
    this.modelGo.addEventListener('click', () => void this.doModel());
    this.modelNote.className = 'evx-note';
    this.modelNote.textContent = 'বড় এলাকা বা "বেশি" মান বাছলে সময় লাগে ও ফাইল বড় হয় (পুরো ম্যাপ ≈ ৫০ MB GLB)। তৈরির সময় গেম কিছুক্ষণ আটকে থাকতে পারে।';
    m3.sec.append(this.modelGo, this.modelNote);
    panel.appendChild(m3.sec);
    return panel;
  }

  private refresh(): void {
    for (const [id, b] of this.layerBtns) b.classList.toggle('on', this.layerOn.has(id));
    for (const [id, b] of this.fmtBtns) b.classList.toggle('on', id === this.gisFormat);
    for (const [id, b] of this.modelBtns) b.classList.toggle('on', id === this.modelFormat);
    for (const [id, b] of this.modeBtns) b.classList.toggle('on', id === this.mode);
    for (const [id, b] of this.realLayerBtns) b.classList.toggle('on', this.realLayers[id]);
    for (const [id, b] of this.qualityBtns) b.classList.toggle('on', id === this.quality);
    const real = this.mode === 'real';
    this.realBox.style.display = real ? 'block' : 'none';
    this.sceneNote.style.display = real ? 'none' : 'block';
    this.radiusInput.min = real ? '100' : '50';
    this.radiusInput.max = real ? '5000' : String(MAX_RADIUS);
    this.radiusInput.step = real ? '100' : '50';
    const rad = real ? this.realRadius : this.sceneRadius;
    this.radiusInput.value = String(rad);
    this.radiusLabel.textContent = real && rad >= 5000 ? 'পুরো ম্যাপ (১০×১০ কিমি)' : `${rad} মিটার`;
  }

  private doGis(): void {
    this.gisGo.disabled = true;
    this.gisNote.textContent = 'তৈরি হচ্ছে, একটু অপেক্ষা করো…';
    setTimeout(() => {
      try {
        const r = buildGisZip(this.d.terrain, [...this.layerOn], this.gisFormat, this.gisCtx);
        saveFile(r.name, r.bytes as unknown as BlobPart, 'application/zip');
        this.gisNote.textContent = `✅ ${r.name} নামানো হয়েছে।\n${r.lines.join('\n')}`;
      } catch (e) {
        this.gisNote.textContent = `❌ ${e instanceof Error ? e.message : String(e)}`;
      } finally {
        this.gisGo.disabled = false;
      }
    }, 30);
  }

  private async doModel(): Promise<void> {
    this.modelGo.disabled = true;
    this.modelNote.textContent = 'তৈরি হচ্ছে, একটু অপেক্ষা করো…';
    await new Promise((r) => setTimeout(r, 30));
    try {
      let r;
      if (this.mode === 'real') {
        const w = this.d.cameraWorld();
        r = exportRealModel(
          this.d.terrain,
          { centerX: w.x, centerZ: w.z, radius: this.realRadius, quality: this.quality, layers: this.realLayers, buildingFloors: this.gisCtx.buildingFloors },
          this.modelFormat,
        );
      } else {
        const c = this.d.cameraPos();
        r = await exportModel(this.d.scene, { format: this.modelFormat, radius: this.sceneRadius, centerX: c.x, centerZ: c.z });
      }
      saveFile(r.name, r.data, r.mime);
      this.modelNote.textContent = `✅ ${r.name} নামানো হয়েছে।\n${r.info.join('\n')}`;
    } catch (e) {
      this.modelNote.textContent = `❌ ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      this.modelGo.disabled = false;
    }
  }
}
