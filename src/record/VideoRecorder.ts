// Video recorder (browser part): records the game picture + sound into an MP4 (or WebM) file for Facebook / YouTube / TikTok / Instagram.
// A button in the top-left toolbar (🎥) or F9 opens a panel; "রেকর্ড শুরু" starts, F9 / the red bar on top stops and the file downloads.
//
// PICTURE: only the 3D canvas is recorded (no menus, no HUD, no minimap). After every renderer.render() the Engine calls onFrame(): the canvas is centre-cropped
// (coverRect, no stretching) into a private output canvas of the chosen size (16:9, 9:16 ...), and that canvas is captured with captureStream(fps).
// SOUND: one private AudioContext mixes up to three sources into one track: the game sound (AudioTap), the microphone (voice-over) and a music / sound file
// chosen by the user (outside sound). Each has its own volume.
// Pure parts (sizes, bitrate, codec choice, file name) are in VideoRecorderMeta.ts and tested headless: scripts/video-recorder-test.ts.
import { saveFile } from '../export/GisExport';
import { UI_FONT } from '../ui/theme';
import { getToolbar } from '../ui/Toolbar';
import { holdUi } from '../ui/AutoHide';
import { getRecorderContextCtor, ignoreMediaElement, startTap, stopTap } from './AudioTap';
import {
  AUDIO_BPS,
  AUTO_STOP_CHOICES,
  FPS_CHOICES,
  SHORT_SIDES,
  clockText,
  coverRect,
  estimateMbPerMinute,
  frameDue,
  outputSize,
  parseStartSeconds,
  percentToGain,
  pickMime,
  videoBitrate,
  videoFileName,
  type AspectChoice,
  type Container,
  type FormatChoice,
  type QualityChoice,
} from './VideoRecorderMeta';

export interface VideoRecorderDeps {
  /** The game canvas (renderer.domElement). */
  source: () => HTMLCanvasElement;
  toast: (text: string, ms?: number) => void;
  /** The element that takes the mouse back (pointer lock) when the panel closes. */
  lockTarget: HTMLElement;
}

const CSS = `
.evrec-btn { width:46px; height:46px; border-radius:12px; border:1px solid rgba(255,255,255,.48); background:linear-gradient(135deg,#2b3a55,#18222f); color:#fff; font-size:22px; line-height:1;
  cursor:pointer; pointer-events:auto; box-shadow:0 4px 16px rgba(0,0,0,.28); transition:transform .15s ease,filter .15s ease; order:4; }
.evrec-btn:hover { filter:brightness(1.15); transform:translateY(-1px); }
.evrec-btn.rec { background:linear-gradient(135deg,#c62828,#7f1111); border-color:#ff8a80; }
.evrec-overlay { position:fixed; inset:0; z-index:950; display:none; align-items:center; justify-content:center; padding:16px; background:rgba(3,10,14,.74); backdrop-filter:blur(6px); pointer-events:auto; font-family:${UI_FONT}; color:#fff; }
.evrec-panel { width:min(620px,96vw); max-height:90vh; overflow:auto; border-radius:20px; border:1px solid rgba(255,255,255,.2); background:linear-gradient(155deg,#172b30,#0b171b); padding:20px 22px; box-shadow:0 24px 70px rgba(0,0,0,.5); }
.evrec-head { display:flex; align-items:center; justify-content:space-between; }
.evrec-title { font-size:22px; font-weight:800; }
.evrec-close { border:1px solid rgba(255,255,255,.25); border-radius:10px; padding:7px 13px; background:rgba(255,255,255,.08); color:#fff; font:500 14px ${UI_FONT}; cursor:pointer; }
.evrec-sec { margin-top:14px; }
.evrec-sec > h3 { margin:0 0 6px; font-size:14px; font-weight:700; color:#ffd21f; }
.evrec-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(104px,1fr)); gap:8px; }
.evrec-opt { text-align:left; padding:9px 11px; border-radius:12px; border:1px solid rgba(255,255,255,.17); background:rgba(255,255,255,.055); color:#fff; font:600 14px/1.35 ${UI_FONT}; cursor:pointer; }
.evrec-opt:hover { background:rgba(255,210,31,.12); border-color:#ffd21f; }
.evrec-opt.on { background:rgba(255,210,31,.2); border-color:#ffd21f; box-shadow:0 0 0 1px #ffd21f inset; }
.evrec-opt small { display:block; margin-top:2px; font-weight:400; font-size:12px; color:rgba(255,255,255,.66); }
.evrec-snd { display:grid; grid-template-columns:auto 1fr auto; gap:8px 10px; align-items:center; padding:9px 11px; border-radius:12px; border:1px solid rgba(255,255,255,.17); background:rgba(255,255,255,.055); margin-bottom:8px; font:600 14px ${UI_FONT}; }
.evrec-snd input[type=range] { width:100%; }
.evrec-snd .full { grid-column:1 / -1; font-weight:400; font-size:13px; color:rgba(255,255,255,.8); display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.evrec-snd input[type=text] { width:70px; padding:5px 7px; border-radius:8px; border:1px solid rgba(255,255,255,.25); background:rgba(0,0,0,.3); color:#fff; font:500 13px ${UI_FONT}; }
.evrec-pick { padding:6px 11px; border-radius:10px; border:1px solid rgba(255,255,255,.25); background:rgba(255,255,255,.08); color:#fff; font:500 13px ${UI_FONT}; cursor:pointer; }
.evrec-go { margin-top:16px; width:100%; padding:12px; border-radius:12px; border:1px solid #ff8a80; background:#c62828; color:#fff; font:700 15px ${UI_FONT}; cursor:pointer; }
.evrec-info { margin-top:12px; padding:9px 11px; border-radius:10px; background:rgba(255,210,31,.1); border:1px solid rgba(255,210,31,.35); font-size:13px; line-height:1.5; }
.evrec-note { margin-top:8px; font-size:12px; line-height:1.55; color:rgba(255,255,255,.6); white-space:pre-line; }
.evrec-bar { position:fixed; top:12px; left:50%; transform:translateX(-50%); z-index:960; display:none; align-items:center; gap:10px; padding:7px 8px 7px 14px; border-radius:999px; background:rgba(120,10,10,.9); border:1px solid #ff8a80; color:#fff; font:700 15px ${UI_FONT}; box-shadow:0 6px 22px rgba(0,0,0,.4); pointer-events:auto; }
.evrec-dot { width:11px; height:11px; border-radius:50%; background:#ff5252; animation:evrec-blink 1s infinite; }
@keyframes evrec-blink { 50% { opacity:.25; } }
.evrec-stop { padding:6px 13px; border-radius:999px; border:1px solid rgba(255,255,255,.5); background:#fff; color:#7f1111; font:700 14px ${UI_FONT}; cursor:pointer; }
`;

const ASPECTS: [AspectChoice, string, string][] = [
  ['screen', 'স্ক্রিন যেমন', 'গেম উইন্ডো যেমন'],
  ['16:9', '16:9 আড়াআড়ি', 'YouTube, Facebook'],
  ['9:16', '9:16 লম্বা', 'TikTok, Reels, Shorts'],
  ['1:1', '1:1 চৌকো', 'Instagram, Facebook'],
  ['4:5', '4:5 পোর্ট্রেট', 'Instagram / Facebook ফিড'],
];
const QUALITIES: [QualityChoice, string, string][] = [
  ['standard', 'সাধারণ', 'ছোট ফাইল'],
  ['high', 'ভালো', 'সোশ্যাল মিডিয়ার জন্য সেরা'],
  ['max', 'সর্বোচ্চ', 'অনেক বড় ফাইল'],
];
const FORMATS: [FormatChoice, string, string][] = [
  ['auto', 'অটো', 'MP4 হলে MP4'],
  ['mp4', 'MP4', 'সব জায়গায় চলে'],
  ['webm', 'WebM', 'MP4 না চললে'],
];

type SoundKey = 'game' | 'mic' | 'music';

export class VideoRecorder {
  private btn = document.createElement('button');
  private overlay = document.createElement('div');
  private style = document.createElement('style');
  private bar = document.createElement('div');
  private barClock = document.createElement('span');
  private info = document.createElement('div');
  private go = document.createElement('button');

  // choices
  private aspect: AspectChoice = '16:9';
  private shortSide = 1080;
  private fps = 30;
  private quality: QualityChoice = 'high';
  private format: FormatChoice = 'auto';
  private autoStop = 0;
  private on: Record<SoundKey, boolean> = { game: true, mic: false, music: false };
  private vol: Record<SoundKey, number> = { game: 100, mic: 100, music: 60 };
  private musicFile: File | null = null;
  private musicStart = '0';
  private monitor = false;

  private btns = {
    aspect: new Map<AspectChoice, HTMLButtonElement>(),
    side: new Map<number, HTMLButtonElement>(),
    fps: new Map<number, HTMLButtonElement>(),
    q: new Map<QualityChoice, HTMLButtonElement>(),
    fmt: new Map<FormatChoice, HTMLButtonElement>(),
    auto: new Map<number, HTMLButtonElement>(),
  };
  private sndChecks = new Map<SoundKey, HTMLInputElement>();
  private musicName = document.createElement('span');

  private open_ = false;
  private relock = false;

  // recording state
  private recording = false;
  private out: HTMLCanvasElement | null = null;
  private g2d: CanvasRenderingContext2D | null = null;
  private lastFrame = -1e9;
  private startedAt = 0;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private container: Container = 'mp4';
  private clockTimer = 0;
  private rctx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private musicEl: HTMLAudioElement | null = null;
  private musicUrl: string | null = null;
  private cleanups: (() => void)[] = [];

  constructor(private parent: HTMLElement, private d: VideoRecorderDeps) {
    this.style.textContent = CSS;
    document.head.appendChild(this.style);
    this.btn.className = 'evrec-btn';
    this.btn.type = 'button';
    this.btn.textContent = '🎥';
    this.btn.title = 'ভিডিও রেকর্ড (F9)';
    this.btn.setAttribute('aria-label', 'ভিডিও রেকর্ড');
    this.btn.addEventListener('click', () => this.toggle());
    getToolbar(parent).appendChild(this.btn);
    this.overlay.className = 'evrec-overlay';
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close(); });
    this.overlay.appendChild(this.buildPanel());
    parent.appendChild(this.overlay);
    this.buildBar();
    window.addEventListener('keydown', this.onKey);
    this.refresh();
  }

  get isOpen(): boolean { return this.open_; }
  get isRecording(): boolean { return this.recording; }

  /** F9 / toolbar button: panel when idle, stop when recording. */
  toggle(): void {
    if (this.recording) { this.stop(); return; }
    if (this.open_) this.close(); else this.open();
  }

  open(): void {
    if (this.open_ || this.recording) return;
    this.open_ = true;
    this.relock = !!document.pointerLockElement;
    if (document.pointerLockElement) document.exitPointerLock();
    this.overlay.style.display = 'flex';
    holdUi('videorec', true);
    this.refresh();
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.overlay.style.display = 'none';
    holdUi('videorec', false);
    if (this.relock) {
      try {
        const r = (this.d.lockTarget as HTMLElement & { requestPointerLock(): Promise<void> | void }).requestPointerLock();
        if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => undefined);
      } catch { /* the browser refuses right after Esc: a click on the screen takes the mouse again */ }
    }
    this.relock = false;
  }

  dispose(): void {
    if (this.recording) this.finish(false);
    window.removeEventListener('keydown', this.onKey);
    window.clearInterval(this.clockTimer);
    this.btn.remove();
    this.overlay.remove();
    this.bar.remove();
    this.style.remove();
  }

  /** Engine: call right AFTER renderer.render() every frame (the canvas still holds the picture only then). Cheap when not recording. */
  onFrame(nowMs: number): void {
    if (!this.recording || !this.out || !this.g2d) return;
    if (!frameDue(nowMs, this.lastFrame, this.fps)) return;
    this.lastFrame = nowMs;
    const src = this.d.source();
    if (src.width < 2 || src.height < 2) return;
    const r = coverRect(src.width, src.height, this.out.width, this.out.height);
    this.g2d.drawImage(src, r.sx, r.sy, r.sw, r.sh, 0, 0, this.out.width, this.out.height);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (this.open_ && e.code === 'Escape') this.close();
  };

  // ---------------------------------------------------------------- panel

  private opt<T>(map: Map<T, HTMLButtonElement>, key: T, label: string, hint: string, on: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'evrec-opt';
    b.textContent = label;
    if (hint) { const s = document.createElement('small'); s.textContent = hint; b.appendChild(s); }
    b.addEventListener('click', () => { on(); this.refresh(); });
    map.set(key, b);
    return b;
  }

  private section(title: string, ...kids: HTMLElement[]): HTMLElement {
    const sec = document.createElement('div');
    sec.className = 'evrec-sec';
    const h = document.createElement('h3');
    h.textContent = title;
    const row = document.createElement('div');
    row.className = 'evrec-row';
    row.append(...kids);
    sec.append(h, row);
    return sec;
  }

  private slider(key: SoundKey): HTMLInputElement {
    const s = document.createElement('input');
    s.type = 'range';
    s.min = '0';
    s.max = '100';
    s.step = '1';
    s.value = String(this.vol[key]);
    s.addEventListener('input', () => {
      this.vol[key] = Number(s.value);
      this.liveGain(key);
    });
    return s;
  }

  private soundRow(key: SoundKey, title: string, extra?: HTMLElement): HTMLElement {
    const row = document.createElement('div');
    row.className = 'evrec-snd';
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:7px;cursor:pointer';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = this.on[key];
    cb.addEventListener('change', () => { this.on[key] = cb.checked; this.refresh(); });
    this.sndChecks.set(key, cb);
    label.append(cb, document.createTextNode(title));
    row.append(label, this.slider(key));
    const pct = document.createElement('span');
    pct.textContent = '%';
    pct.style.cssText = 'font-weight:400;color:rgba(255,255,255,.6)';
    row.appendChild(pct);
    if (extra) row.appendChild(extra);
    return row;
  }

  private buildPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'evrec-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'ভিডিও রেকর্ডার');
    const head = document.createElement('div');
    head.className = 'evrec-head';
    const title = document.createElement('div');
    title.className = 'evrec-title';
    title.textContent = '🎥 ভিডিও রেকর্ডার';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'evrec-close';
    close.textContent = 'বন্ধ (Esc)';
    close.addEventListener('click', () => this.close());
    head.append(title, close);
    panel.appendChild(head);

    panel.appendChild(this.section('ভিডিওর আকার', ...ASPECTS.map(([k, l, h]) => this.opt(this.btns.aspect, k, l, h, () => { this.aspect = k; }))));
    panel.appendChild(this.section('মান', ...QUALITIES.map(([k, l, h]) => this.opt(this.btns.q, k, l, h, () => { this.quality = k; }))));
    panel.appendChild(this.section('ছবির সাইজ', ...SHORT_SIDES.map((s) => this.opt(this.btns.side, s, `${s}p`, '', () => { this.shortSide = s; }))));
    panel.appendChild(this.section('ফ্রেম / সেকেন্ড', ...FPS_CHOICES.map((f) => this.opt(this.btns.fps, f, `${f} fps`, f === 60 ? 'মসৃণ, কড়া পিসি লাগে' : 'সাধারণ', () => { this.fps = f; }))));
    panel.appendChild(this.section('ফাইল', ...FORMATS.map(([k, l, h]) => this.opt(this.btns.fmt, k, l, h, () => { this.format = k; }))));
    panel.appendChild(this.section('অটো-স্টপ', ...AUTO_STOP_CHOICES.map((s) => this.opt(this.btns.auto, s, s === 0 ? 'নিজে থামাব' : s >= 60 ? `${s / 60} মিনিট` : `${s} সেকেন্ড`, '', () => { this.autoStop = s; }))));

    // sound
    const sec = document.createElement('div');
    sec.className = 'evrec-sec';
    const h = document.createElement('h3');
    h.textContent = 'সাউন্ড';
    sec.appendChild(h);
    sec.appendChild(this.soundRow('game', '🔊 গেমের সাউন্ড'));
    sec.appendChild(this.soundRow('mic', '🎙️ মাইক (নিজের গলা)'));

    const extra = document.createElement('div');
    extra.className = 'full';
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'evrec-pick';
    pick.textContent = '📂 গান / সাউন্ড ফাইল বাছো';
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.mp4';
    file.style.display = 'none';
    pick.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const f = file.files?.[0] ?? null;
      this.musicFile = f;
      this.musicName.textContent = f ? f.name : 'কোনো ফাইল বাছা হয়নি';
      if (f) { this.on.music = true; const c = this.sndChecks.get('music'); if (c) c.checked = true; }
      this.refresh();
    });
    this.musicName.textContent = 'কোনো ফাইল বাছা হয়নি';
    this.musicName.style.cssText = 'max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    const startLbl = document.createElement('span');
    startLbl.textContent = 'শুরু (সেকেন্ড):';
    const start = document.createElement('input');
    start.type = 'text';
    start.inputMode = 'decimal';
    start.value = this.musicStart;
    start.addEventListener('input', () => { this.musicStart = start.value; });
    const mon = document.createElement('label');
    mon.style.cssText = 'display:flex;align-items:center;gap:5px;cursor:pointer';
    const monCb = document.createElement('input');
    monCb.type = 'checkbox';
    monCb.addEventListener('change', () => { this.monitor = monCb.checked; });
    mon.append(monCb, document.createTextNode('আমিও শুনব (হেডফোন লাগাও)'));
    extra.append(pick, file, this.musicName, startLbl, start, mon);
    sec.appendChild(this.soundRow('music', '🎵 বাইরের গান / সাউন্ড', extra));
    panel.appendChild(sec);

    this.info.className = 'evrec-info';
    this.go.type = 'button';
    this.go.className = 'evrec-go';
    this.go.textContent = '🔴 রেকর্ড শুরু';
    this.go.addEventListener('click', () => void this.start());
    const note = document.createElement('div');
    note.className = 'evrec-note';
    note.textContent = 'শুধু গেমের ছবি রেকর্ড হয় (মেনু, HUD, ম্যাপ আসে না)।\nথামাতে F9 চাপো বা ওপরের লাল বারের "থামাও" বাটন।\nমাইক চালাতে হলে ব্রাউজার অনুমতি চাইবে (localhost বা https লাগে)। মাইক ও স্পিকার একসাথে চললে প্রতিধ্বনি হয়: হেডফোন লাগাও।\nব্রাউজারের নিজের বাংলা/ইংরেজি কথা বলা (speechSynthesis) কোনো ওয়েব পেজ রেকর্ড করতে পারে না, তাই ওই লাইনগুলো ভিডিওতে আসবে না।';
    panel.append(this.info, this.go, note);
    return panel;
  }

  private buildBar(): void {
    this.bar.className = 'evrec-bar';
    const dot = document.createElement('span');
    dot.className = 'evrec-dot';
    const lbl = document.createElement('span');
    lbl.textContent = 'REC';
    this.barClock.textContent = '00:00';
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.className = 'evrec-stop';
    stop.textContent = '⏹ থামাও (F9)';
    stop.addEventListener('click', () => this.stop());
    this.bar.append(dot, lbl, this.barClock, stop);
    this.parent.appendChild(this.bar);
  }

  private screenSize(): { w: number; h: number } {
    const c = this.d.source();
    return { w: c.clientWidth || c.width, h: c.clientHeight || c.height };
  }

  private refresh(): void {
    for (const [k, b] of this.btns.aspect) b.classList.toggle('on', k === this.aspect);
    for (const [k, b] of this.btns.side) b.classList.toggle('on', k === this.shortSide);
    for (const [k, b] of this.btns.fps) b.classList.toggle('on', k === this.fps);
    for (const [k, b] of this.btns.q) b.classList.toggle('on', k === this.quality);
    for (const [k, b] of this.btns.fmt) b.classList.toggle('on', k === this.format);
    for (const [k, b] of this.btns.auto) b.classList.toggle('on', k === this.autoStop);
    const sc = this.screenSize();
    const size = outputSize(this.aspect, this.shortSide, sc.w, sc.h);
    for (const [s, b] of this.btns.side) {
      const o = outputSize(this.aspect, s, sc.w, sc.h);
      let small = b.querySelector('small');
      if (!small) { small = document.createElement('small'); b.appendChild(small); }
      small.textContent = `${o.w}×${o.h}`;
    }
    const hasAudio = this.on.game || this.on.mic || (this.on.music && !!this.musicFile);
    const bps = videoBitrate(size.w, size.h, this.fps, this.quality);
    const mb = estimateMbPerMinute(bps, hasAudio);
    this.info.textContent = `ভিডিও: ${size.w}×${size.h}, ${this.fps} fps — প্রতি মিনিটে প্রায় ${mb.toFixed(0)} MB। ${mb * 10 > 1500 ? 'লম্বা রেকর্ডিং-এ ফাইল খুব বড় হবে, মান কমাতে পারো।' : ''}`;
    if (this.on.music && !this.musicFile) this.info.textContent += ' (গান চালু আছে কিন্তু ফাইল বাছোনি: গান ছাড়াই রেকর্ড হবে।)';
  }

  private liveGain(key: SoundKey): void {
    const g = this.gains[key];
    if (g) g.gain.value = percentToGain(this.vol[key]);
  }

  private gains: Partial<Record<SoundKey, GainNode>> = {};

  // ---------------------------------------------------------------- recording

  private async start(): Promise<void> {
    if (this.recording) return;
    if (typeof MediaRecorder === 'undefined') {
      this.d.toast('❌ এই ব্রাউজারে ভিডিও রেকর্ড চলে না (Chrome / Edge / Firefox / Safari ১৪.১+ ব্যবহার করো)', 6000);
      return;
    }
    const sc = this.screenSize();
    const size = outputSize(this.aspect, this.shortSide, sc.w, sc.h);
    const wantMusic = this.on.music && !!this.musicFile;
    const hasAudio = this.on.game || this.on.mic || wantMusic;
    this.close();
    const fail = (msg: string): void => { this.cleanupAll(); this.d.toast(`❌ রেকর্ড শুরু হয়নি: ${msg}`, 6000); };

    try {
      const out = document.createElement('canvas');
      out.width = size.w;
      out.height = size.h;
      const g = out.getContext('2d', { alpha: false });
      if (!g) return fail('2D canvas নেই');
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.fillStyle = '#000';
      g.fillRect(0, 0, size.w, size.h);
      this.out = out;
      this.g2d = g;

      const tracks: MediaStreamTrack[] = [];
      let micFailed = false;
      if (hasAudio) {
        const Ctor = getRecorderContextCtor();
        if (!Ctor) return fail('এই ব্রাউজারে সাউন্ড রেকর্ড চলে না');
        const rctx = new Ctor();
        this.rctx = rctx;
        void rctx.resume().catch(() => undefined);
        const dest = rctx.createMediaStreamDestination();
        const addGain = (key: SoundKey): GainNode => {
          const gn = rctx.createGain();
          gn.gain.value = percentToGain(this.vol[key]);
          gn.connect(dest);
          this.gains[key] = gn;
          return gn;
        };
        if (this.on.game) {
          const gn = addGain('game');
          startTap({
            onStream: (stream) => {
              const s = rctx.createMediaStreamSource(stream);
              s.connect(gn);
              return () => { try { s.disconnect(); } catch { /* already gone */ } };
            },
          });
          this.cleanups.push(() => stopTap());
        }
        if (this.on.mic) {
          try {
            if (!navigator.mediaDevices?.getUserMedia) throw new Error('no mic api');
            const ms = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
            this.micStream = ms;
            const s = rctx.createMediaStreamSource(ms);
            s.connect(addGain('mic'));
          } catch {
            micFailed = true; // permission denied / no microphone / not https: record without the voice
          }
        }
        if (wantMusic && this.musicFile) {
          const url = URL.createObjectURL(this.musicFile);
          this.musicUrl = url;
          const el = new Audio();
          ignoreMediaElement(el); // the recorder mixes this file itself: the game tap must not capture it a second time
          el.src = url;
          el.preload = 'auto';
          this.musicEl = el;
          await new Promise<void>((res) => {
            const t = window.setTimeout(res, 4000);
            el.addEventListener('loadedmetadata', () => { window.clearTimeout(t); res(); }, { once: true });
            el.addEventListener('error', () => { window.clearTimeout(t); res(); }, { once: true });
          });
          const off = parseStartSeconds(this.musicStart);
          if (Number.isFinite(el.duration) && off < el.duration) el.currentTime = off;
          const ms = rctx.createMediaElementSource(el);
          const gn = addGain('music');
          ms.connect(gn);
          if (this.monitor) gn.connect(rctx.destination);
        }
        tracks.push(...dest.stream.getAudioTracks());
      }

      const vstream = out.captureStream(this.fps);
      const stream = new MediaStream([...vstream.getVideoTracks(), ...tracks]);
      const hasTrack = tracks.length > 0;
      const picked = pickMime(this.format, hasTrack, size.w, size.h, this.fps, (m) => MediaRecorder.isTypeSupported(m));
      const bps = videoBitrate(size.w, size.h, this.fps, this.quality);
      const opts: MediaRecorderOptions = { videoBitsPerSecond: bps };
      if (hasTrack) opts.audioBitsPerSecond = AUDIO_BPS;
      if (picked) opts.mimeType = picked.mime;
      let rec: MediaRecorder;
      try {
        rec = new MediaRecorder(stream, opts);
      } catch {
        rec = new MediaRecorder(stream); // the browser picks its own format
      }
      this.container = rec.mimeType.startsWith('video/mp4') ? 'mp4' : picked?.container ?? 'webm';
      this.chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) this.chunks.push(e.data); };
      rec.onstop = () => this.finish(true);
      rec.onerror = () => { this.d.toast('❌ রেকর্ডিং-এ সমস্যা হয়েছে', 5000); this.finish(false); };
      this.recorder = rec;

      // first frame before the encoder starts, so the video never begins black
      this.lastFrame = -1e9;
      this.recording = true;
      this.onFrame(performance.now());
      rec.start(1000);
      if (this.musicEl) void this.musicEl.play().catch(() => this.d.toast('⚠️ গানের ফাইল চালানো গেল না', 4000));
      this.startedAt = performance.now();
      this.btn.classList.add('rec');
      this.bar.style.display = 'flex';
      this.updateClock();
      this.clockTimer = window.setInterval(() => this.updateClock(), 250);
      let msg = `🔴 রেকর্ড চলছে (${size.w}×${size.h}, ${this.fps} fps, ${this.container.toUpperCase()}) — থামাতে F9`;
      if (micFailed) msg += '\n⚠️ মাইক পাওয়া যায়নি: গলা ছাড়া রেকর্ড হচ্ছে';
      if (!picked) msg += '\n(ব্রাউজারের নিজের ফরম্যাট)';
      this.d.toast(msg, 4500);
    } catch (e) {
      this.recording = false;
      fail(e instanceof Error ? e.message : String(e));
    }
  }

  private updateClock(): void {
    const sec = (performance.now() - this.startedAt) / 1000;
    this.barClock.textContent = clockText(sec);
    if (this.autoStop > 0 && sec >= this.autoStop) this.stop();
  }

  stop(): void {
    if (!this.recording) return;
    this.recording = false; // no more frames
    window.clearInterval(this.clockTimer);
    const rec = this.recorder;
    if (rec && rec.state !== 'inactive') {
      try { rec.requestData(); } catch { /* ignore */ }
      rec.stop(); // onstop -> finish(true)
    } else {
      this.finish(false);
    }
  }

  /** The recorder has stopped: build the file and clean everything up. */
  private finish(save: boolean): void {
    this.recording = false;
    window.clearInterval(this.clockTimer);
    const chunks = this.chunks;
    const container = this.container;
    const seconds = (performance.now() - this.startedAt) / 1000;
    this.cleanupAll();
    if (!save) return;
    if (chunks.length === 0) { this.d.toast('❌ ভিডিওতে কিছুই রেকর্ড হয়নি', 5000); return; }
    const blob = new Blob(chunks, { type: container === 'mp4' ? 'video/mp4' : 'video/webm' });
    saveFile(videoFileName(new Date(), container), blob, blob.type);
    this.d.toast(`✅ ভিডিও তৈরি (${clockText(seconds)}, ${(blob.size / 1048576).toFixed(1)} MB) — নামছে। ব্রাউজার জিজ্ঞেস করলে "Allow" দাও`, 6000);
  }

  private cleanupAll(): void {
    for (const c of this.cleanups) { try { c(); } catch { /* ignore */ } }
    this.cleanups = [];
    stopTap();
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
    if (this.musicEl) { try { this.musicEl.pause(); } catch { /* ignore */ } this.musicEl.removeAttribute('src'); this.musicEl = null; }
    if (this.musicUrl) { URL.revokeObjectURL(this.musicUrl); this.musicUrl = null; }
    if (this.rctx) { void this.rctx.close().catch(() => undefined); this.rctx = null; }
    this.gains = {};
    this.recorder = null;
    this.chunks = [];
    this.out = null;
    this.g2d = null;
    this.btn.classList.remove('rec');
    this.bar.style.display = 'none';
  }
}
