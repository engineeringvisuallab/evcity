// 360 photo (equirectangular JPEG, 2:1) for Facebook / Google Photos / any 360 viewer. A button in the top-left toolbar (📷) or F8 opens a small panel;
// "ছবি তোলো" hides every overlay, renders the scene from the camera position into a cube map (6 faces) with a SEPARATE CubeCamera (the real camera never
// moves), turns the cube into a 2:1 picture with a small shader, strip by strip (no huge GPU read), writes a JPEG with GPano XMP and downloads it.
// Pure parts (sizes, direction maths, XMP) live in Photo360Meta.ts and are tested headless; this file needs a browser + GPU.
import * as THREE from 'three';
import type { TimeMode } from '../environment/DayNight';
import { saveFile } from '../export/GisExport';
import { UI_FONT } from './theme';
import { getToolbar } from './Toolbar';
import { holdUi } from './AutoHide';
import { PANO_SIZES, headingAngle, injectXmp, photoFileName, pickSize, type PanoQuality } from './Photo360Meta';
import { buildViewerHtml, viewerFileName } from './Photo360Viewer';

export interface Photo360Deps {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  getTimeMode: () => TimeMode;
  setTimeMode: (m: TimeMode) => void;
  toast: (text: string, ms?: number) => void;
  /** The element that takes the mouse back (pointer lock) when the panel closes. */
  lockTarget: HTMLElement;
}

type TimeChoice = 'now' | 'day' | 'night';
type OutChoice = 'both' | 'jpg' | 'html'; // jpg = Facebook / Google Photos, html = open in any browser and turn with the mouse

const HEIGHTS = [0, 50, 100, 200];
const SKY_FADE_MS = 7000; // DayNight fades the sky in Config.environment.dayNight.switchSeconds (6 s)
const STRIP = 256; // output rows per GPU read

const CSS = `
.ev360-btn { width:46px; height:46px; border-radius:12px; border:1px solid rgba(255,255,255,.48); background:linear-gradient(135deg,#2b3a55,#18222f); color:#fff; font-size:22px; line-height:1;
  cursor:pointer; pointer-events:auto; box-shadow:0 4px 16px rgba(0,0,0,.28); transition:transform .15s ease,filter .15s ease; order:3; }
.ev360-btn:hover { filter:brightness(1.15); transform:translateY(-1px); }
.ev360-overlay { position:fixed; inset:0; z-index:950; display:none; align-items:center; justify-content:center; padding:16px; background:rgba(3,10,14,.74); backdrop-filter:blur(6px); pointer-events:auto; font-family:${UI_FONT}; color:#fff; }
.ev360-panel { width:min(560px,96vw); max-height:88vh; overflow:auto; border-radius:20px; border:1px solid rgba(255,255,255,.2); background:linear-gradient(155deg,#172b30,#0b171b); padding:20px 22px; box-shadow:0 24px 70px rgba(0,0,0,.5); }
.ev360-head { display:flex; align-items:center; justify-content:space-between; }
.ev360-title { font-size:22px; font-weight:800; }
.ev360-close { border:1px solid rgba(255,255,255,.25); border-radius:10px; padding:7px 13px; background:rgba(255,255,255,.08); color:#fff; font:500 14px ${UI_FONT}; cursor:pointer; }
.ev360-sec { margin-top:14px; }
.ev360-sec > h3 { margin:0 0 6px; font-size:14px; font-weight:700; color:#ffd21f; }
.ev360-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:8px; }
.ev360-opt { text-align:left; padding:9px 11px; border-radius:12px; border:1px solid rgba(255,255,255,.17); background:rgba(255,255,255,.055); color:#fff; font:600 14px/1.35 ${UI_FONT}; cursor:pointer; }
.ev360-opt:hover { background:rgba(255,210,31,.12); border-color:#ffd21f; }
.ev360-opt.on { background:rgba(255,210,31,.2); border-color:#ffd21f; box-shadow:0 0 0 1px #ffd21f inset; }
.ev360-opt small { display:block; margin-top:2px; font-weight:400; font-size:12px; color:rgba(255,255,255,.66); }
.ev360-go { margin-top:16px; width:100%; padding:12px; border-radius:12px; border:1px solid #35c985; background:#1f9d62; color:#fff; font:700 15px ${UI_FONT}; cursor:pointer; }
.ev360-note { margin-top:8px; font-size:12px; line-height:1.55; color:rgba(255,255,255,.6); white-space:pre-line; }
`;

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
// Same maths as equirectDir() in Photo360Meta.ts. The cube target is LINEAR: encode to sRGB here (the game uses no tone mapping, the screen only converts to sRGB).
const FRAG = `
uniform samplerCube tCube;
uniform sampler2D tBadge;
uniform float uBadge;
uniform float uHeading;
uniform float uRow0;
uniform vec2 uOut;      // output width, height (pixels)
uniform float uStrip;   // rows in this strip
varying vec2 vUv;
const float PI = 3.14159265358979;
vec3 enc(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  float row = uRow0 + (uStrip - 1.0 - floor(gl_FragCoord.y));   // image row, 0 = top (GL rows are bottom-up inside the strip)
  float u = gl_FragCoord.x / uOut.x;
  float v = (row + 0.5) / uOut.y;
  float lon = (u - 0.5) * 2.0 * PI;
  float lat = (0.5 - v) * PI;
  vec3 d = vec3(sin(lon) * cos(lat), sin(lat), -cos(lon) * cos(lat));
  float c = cos(uHeading), s = sin(uHeading);
  vec3 l = vec3(d.x * c + d.z * s, d.y, -d.x * s + d.z * c);
  vec3 col = textureCube(tCube, l).rgb;
  if (uBadge > 0.5 && d.y < -0.9848) {                       // nadir badge: round patch under the camera (10 degrees)
    vec2 p = d.xz / (-d.y) / (2.0 * 0.1763) + 0.5;
    vec4 b = texture2D(tBadge, p);
    col = mix(col, b.rgb, b.a);
  }
  gl_FragColor = vec4(enc(col), 1.0);
}`;

function badgeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 512, 512);
  g.fillStyle = 'rgba(10,18,26,0.92)';
  g.beginPath(); g.arc(256, 256, 250, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ffd21f'; g.lineWidth = 10;
  g.beginPath(); g.arc(256, 256, 236, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#ffffff'; g.font = 'bold 120px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('EVCity', 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class Photo360 {
  private btn = document.createElement('button');
  private overlay = document.createElement('div');
  private style = document.createElement('style');
  private note = document.createElement('div');
  private go = document.createElement('button');
  private quality: PanoQuality = 'mid';
  private height = 0;
  private time: TimeChoice = 'now';
  private badge = false;
  private out: OutChoice = 'both';
  private btns: { q: Map<PanoQuality, HTMLButtonElement>; h: Map<number, HTMLButtonElement>; t: Map<TimeChoice, HTMLButtonElement>; b: Map<boolean, HTMLButtonElement>; o: Map<OutChoice, HTMLButtonElement> } = { q: new Map(), h: new Map(), t: new Map(), b: new Map(), o: new Map() };
  private open_ = false;
  private relock = false;
  private busy = false;

  constructor(private parent: HTMLElement, private d: Photo360Deps) {
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.btn.className = 'ev360-btn';
    this.btn.type = 'button';
    this.btn.textContent = '📷';
    this.btn.title = '৩৬০° ছবি (F8)';
    this.btn.setAttribute('aria-label', '৩৬০ ডিগ্রি ছবি');
    this.btn.addEventListener('click', () => this.toggle());
    getToolbar(parent).appendChild(this.btn);
    this.overlay.className = 'ev360-overlay';
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close(); });
    this.overlay.appendChild(this.buildPanel());
    parent.appendChild(this.overlay);
    window.addEventListener('keydown', this.onKey);
    this.refresh();
  }

  get isOpen(): boolean { return this.open_; }

  toggle(): void { if (this.open_) this.close(); else this.open(); }

  open(): void {
    if (this.open_ || this.busy) return;
    this.open_ = true;
    this.relock = !!document.pointerLockElement;
    if (document.pointerLockElement) document.exitPointerLock();
    this.overlay.style.display = 'flex';
    holdUi('photo360', true);
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.overlay.style.display = 'none';
    holdUi('photo360', false);
    if (this.relock) {
      try {
        const r = (this.d.lockTarget as HTMLElement & { requestPointerLock(): Promise<void> | void }).requestPointerLock();
        if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => undefined);
      } catch { /* the browser refuses right after Esc: a click on the screen takes the mouse again */ }
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

  private opt<T>(map: Map<T, HTMLButtonElement>, key: T, label: string, hint: string, on: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ev360-opt';
    b.textContent = label;
    if (hint) { const s = document.createElement('small'); s.textContent = hint; b.appendChild(s); }
    b.addEventListener('click', () => { on(); this.refresh(); });
    map.set(key, b);
    return b;
  }

  private section(title: string, ...kids: HTMLElement[]): HTMLElement {
    const sec = document.createElement('div');
    sec.className = 'ev360-sec';
    const h = document.createElement('h3');
    h.textContent = title;
    const row = document.createElement('div');
    row.className = 'ev360-row';
    row.append(...kids);
    sec.append(h, row);
    return sec;
  }

  private buildPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'ev360-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '৩৬০ ডিগ্রি ছবি');
    const head = document.createElement('div');
    head.className = 'ev360-head';
    const title = document.createElement('div');
    title.className = 'ev360-title';
    title.textContent = '📷 ৩৬০° ছবি';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ev360-close';
    close.textContent = 'বন্ধ (Esc)';
    close.addEventListener('click', () => this.close());
    head.append(title, close);
    panel.appendChild(head);
    const q: PanoQuality[] = ['low', 'mid', 'high'];
    const qHint: Record<PanoQuality, string> = { low: 'দ্রুত, ছোট ফাইল (ফোন)', mid: 'ফেসবুকের জন্য ভালো', high: 'সবচেয়ে ভালো, ধীর' };
    panel.appendChild(this.section('মাপ', ...q.map((k) => this.opt(this.btns.q, k, `${PANO_SIZES[k].w}×${PANO_SIZES[k].h}`, qHint[k], () => { this.quality = k; }))));
    panel.appendChild(this.section('উচ্চতা (ড্রোন)', ...HEIGHTS.map((m) => this.opt(this.btns.h, m, m === 0 ? 'এখানেই' : `+${m} মি`, m === 0 ? 'এখন যেখানে আছো' : 'ওপর থেকে', () => { this.height = m; }))));
    panel.appendChild(this.section('সময়', ...([['now', 'এখন যেমন', ''], ['day', '☀️ দিন', 'আকাশ বদলাতে ~৭ সেকেন্ড'], ['night', '🌙 রাত', 'আকাশ বদলাতে ~৭ সেকেন্ড']] as [TimeChoice, string, string][]).map(([k, l, h]) => this.opt(this.btns.t, k, l, h, () => { this.time = k; }))));
    panel.appendChild(this.section('EVCity ব্যাজ', this.opt(this.btns.b, false, 'নেই', '', () => { this.badge = false; }), this.opt(this.btns.b, true, 'পায়ের নিচে', 'নিচের দিকে গোল ব্যাজ', () => { this.badge = true; })));
    panel.appendChild(this.section('ফাইল', ...([['both', 'JPG + ঘোরানো ভিউ', 'দুটোই নামবে (সেরা)'], ['jpg', 'শুধু JPG', 'ফেসবুক / গুগল ফটোজ'], ['html', 'শুধু ঘোরানো ভিউ', 'ব্রাউজারে খুলে মাউস দিয়ে ঘোরাও']] as [OutChoice, string, string][]).map(([k, l, h]) => this.opt(this.btns.o, k, l, h, () => { this.out = k; }))));
    this.go.type = 'button';
    this.go.className = 'ev360-go';
    this.go.textContent = '📸 ছবি তোলো ও নামাও';
    this.go.addEventListener('click', () => void this.shoot());
    this.note.className = 'ev360-note';
    this.note.textContent = 'ছবি তোলার সময় সব মেনু/HUD সরে যাবে, কয়েক সেকেন্ড গেম আটকাতে পারে। সাধারণ ছবি-দেখার প্রোগ্রামে JPG চ্যাপ্টা দেখায় — ঘোরাতে হলে ফেসবুকে পোস্ট করো, অথবা "ঘোরানো ভিউ" (.html) ফাইলটা ব্রাউজারে খোলো।';
    panel.append(this.go, this.note);
    return panel;
  }

  private refresh(): void {
    for (const [k, b] of this.btns.q) b.classList.toggle('on', k === this.quality);
    for (const [k, b] of this.btns.h) b.classList.toggle('on', k === this.height);
    for (const [k, b] of this.btns.t) b.classList.toggle('on', k === this.time);
    for (const [k, b] of this.btns.b) b.classList.toggle('on', k === this.badge);
    for (const [k, b] of this.btns.o) b.classList.toggle('on', k === this.out);
  }

  /** Hides everything on the page except the canvas (and the elements that contain it). Returns the undo function. */
  private hideOverlays(): () => void {
    const canvas = this.d.renderer.domElement;
    const saved: [HTMLElement, string][] = [];
    for (const el of [...Array.from(document.body.children), ...Array.from(this.parent.children)] as HTMLElement[]) {
      if (el === canvas || el.contains(canvas) || !el.style || /^(SCRIPT|STYLE|LINK)$/.test(el.tagName)) continue;
      saved.push([el, el.style.visibility]);
      el.style.visibility = 'hidden';
    }
    return () => { for (const [el, v] of saved) el.style.visibility = v; };
  }

  private async shoot(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.close();
    const { renderer, scene, camera } = this.d;
    const prevTime = this.d.getTimeMode();
    const prevTarget = renderer.getRenderTarget();
    const prevShadowAuto = renderer.shadowMap.autoUpdate;
    let restoreUi: (() => void) | null = null;
    let cubeRT: THREE.WebGLCubeRenderTarget | null = null;
    let outRT: THREE.WebGLRenderTarget | null = null;
    let mat: THREE.ShaderMaterial | null = null;
    let quadGeo: THREE.PlaneGeometry | null = null;
    let badgeTex: THREE.CanvasTexture | null = null;
    try {
      if (this.time !== 'now' && this.time !== prevTime) {
        this.d.toast('⏳ আকাশ বদলাচ্ছে…', SKY_FADE_MS);
        this.d.setTimeMode(this.time);
        await sleep(SKY_FADE_MS);
      }
      restoreUi = this.hideOverlays();
      await frame();
      await frame();
      const size = pickSize(this.quality, renderer.capabilities.maxTextureSize);
      // 1. six faces from the camera position (+ drone height), real camera untouched
      const pos = new THREE.Vector3();
      camera.getWorldPosition(pos);
      pos.y += this.height;
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      try {
        cubeRT = new THREE.WebGLCubeRenderTarget(size.face, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      } catch {
        cubeRT = new THREE.WebGLCubeRenderTarget(size.face, { type: THREE.UnsignedByteType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      }
      const cc = new THREE.CubeCamera(camera.near, camera.far, cubeRT);
      cc.position.copy(pos);
      renderer.shadowMap.autoUpdate = true; // low shadow level redraws the sun shadow only every n-th frame: do it now for the first face
      renderer.shadowMap.needsUpdate = true;
      cc.update(renderer, scene);
      renderer.setRenderTarget(prevTarget);
      // 2. cube -> 2:1 picture, strip by strip
      badgeTex = this.badge ? badgeTexture() : null;
      mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          tCube: { value: cubeRT.texture },
          tBadge: { value: badgeTex },
          uBadge: { value: badgeTex ? 1 : 0 },
          uHeading: { value: headingAngle(fwd.x, fwd.z) },
          uRow0: { value: 0 },
          uOut: { value: new THREE.Vector2(size.w, size.h) },
          uStrip: { value: STRIP },
        },
      });
      quadGeo = new THREE.PlaneGeometry(2, 2);
      const quad = new THREE.Mesh(quadGeo, mat);
      quad.frustumCulled = false;
      const qScene = new THREE.Scene();
      qScene.add(quad);
      const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      outRT = new THREE.WebGLRenderTarget(size.w, STRIP, { type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: false });
      const out = document.createElement('canvas');
      out.width = size.w;
      out.height = size.h;
      const g = out.getContext('2d');
      if (!g) throw new Error('2D canvas নেই');
      const buf = new Uint8Array(size.w * STRIP * 4);
      const img = g.createImageData(size.w, STRIP);
      for (let row0 = 0; row0 < size.h; row0 += STRIP) {
        mat.uniforms.uRow0.value = row0;
        renderer.setRenderTarget(outRT);
        renderer.render(qScene, qCam);
        renderer.readRenderTargetPixels(outRT, 0, 0, size.w, STRIP, buf);
        renderer.setRenderTarget(prevTarget);
        for (let k = 0; k < STRIP; k++) img.data.set(buf.subarray(k * size.w * 4, (k + 1) * size.w * 4), (STRIP - 1 - k) * size.w * 4); // GL rows are bottom-up
        g.putImageData(img, 0, row0);
        if ((row0 / STRIP) % 4 === 3) await sleep(0); // let the browser breathe
      }
      // 3. JPEG + GPano XMP, download
      const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/jpeg', 0.92));
      if (!blob) throw new Error('JPEG বানানো গেল না (ছবি বড় বেশি: ছোট মাপ বাছো)');
      const bytes = injectXmp(new Uint8Array(await blob.arrayBuffer()), { width: size.w, height: size.h, headingDeg: 0 });
      const tag = this.time === 'now' ? (prevTime === 'night' ? 'night' : 'view') : this.time;
      const jpgName = photoFileName(new Date(), tag);
      const sizeTxt = `${size.w}×${size.h}, ${(bytes.length / 1048576).toFixed(1)} MB`;
      if (this.out !== 'html') saveFile(jpgName, bytes as unknown as BlobPart, 'image/jpeg');
      if (this.out !== 'jpg') {
        const dataUrl = await new Promise<string>((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result));
          fr.onerror = () => rej(new Error('ভিউ ফাইল বানানো গেল না'));
          fr.readAsDataURL(new Blob([bytes as unknown as BlobPart], { type: 'image/jpeg' }));
        });
        const html = new TextEncoder().encode(buildViewerHtml(dataUrl, 'EVCity ৩৬০°'));
        saveFile(viewerFileName(jpgName), html as unknown as BlobPart, 'text/html');
      }
      this.d.toast(`📷 ৩৬০° ছবি তৈরি (${sizeTxt}) — নামছে${this.out === 'both' ? ' (দুটো ফাইল; ব্রাউজার জিজ্ঞেস করলে "Allow" দাও)' : ''}`, 5200);
    } catch (e) {
      this.d.toast(`❌ ৩৬০° ছবি হয়নি: ${e instanceof Error ? e.message : String(e)}`, 6000);
    } finally {
      renderer.setRenderTarget(prevTarget);
      renderer.shadowMap.autoUpdate = prevShadowAuto;
      cubeRT?.dispose();
      outRT?.dispose();
      mat?.dispose();
      quadGeo?.dispose();
      badgeTex?.dispose();
      restoreUi?.();
      if (this.d.getTimeMode() !== prevTime) this.d.setTimeMode(prevTime);
      this.busy = false;
    }
  }
}
