import { UI_FONT } from '../ui/theme';
import { applause } from './HallApplause';
import { HALL_SOON, HALL_TOPICS, pagesOf } from './HallTopics';
import { coverage, isStartPhrase, matchWords, pageMark, stars, tokenize } from './HallScoring';
import type { HallPage, HallTopic } from './HallTypes';
import type { MissionVoice } from './MissionVoice';

/** The real 3D hall (EVLab): people come in and sit when a presentation opens, react while it runs, and leave when it closes. Optional: without it only the overlay shows. */
export type HallMood = 'idle' | 'listen' | 'clap' | 'ovation';
export interface HallStage {
  enter(): void;
  end(): void;
  mood(m: HallMood): void;
}

export interface HallDeps {
  parent: HTMLElement;
  /** The game canvas: the mouse is released while the hall is open and taken back when it closes. */
  lockTarget: HTMLElement;
  voice: MissionVoice;
  stage?: HallStage;
}

export interface HallCallbacks {
  /** The presentation was finished (the last page read aloud). `mark` is 0..100. Only finished presentations are marked. */
  onFinished: (topicId: string, mark: number) => void;
  onClose: () => void;
}

type Mode = 'topics' | 'ready' | 'live' | 'result';

const PEOPLE = ['🧑🏽', '👩🏻‍💼', '👨🏾‍💼', '🧕🏽', '👨🏻', '👩🏿‍💼', '🧔🏽', '👩🏼', '👨🏽‍💼', '🧑🏻‍💼', '👩🏽‍🦱', '👨🏿', '🧑🏼‍💼', '👩🏾'];
const CHEERS = ['👏', 'Nice!', '👏', 'Great!', '👍', 'Well done!', '👏', 'Bravo!'];
const READ_OK = 0.8; // a page read this well gets a soft clap
const FINISH_OK = 0.5; // the last page must be read at least this well to finish

/**
 * PRESENTATION HALL (placeholder stage, drawn as a page overlay until the real hall is built inside the EVLab building).
 * Choose a topic -> say "Start" -> read each page of 3 lines aloud -> mouse wheel brings the next page -> finish by reading the last page.
 * Marks come ONLY from your voice: words that were not spoken earn nothing. Enter leaves the hall.
 */
export class PresentationHall {
  private root = document.createElement('div');
  private open_ = false;
  private relock = false;
  private mode: Mode = 'topics';
  private cb: HallCallbacks | null = null;
  private best: Record<string, number> = {};
  private topic: HallTopic | null = null;
  private pages: HallPage[] = [];
  private page = 0;
  private cov: number[] = [];
  private finalText: string[] = [];
  private interim = '';
  private started = false;
  private mic: 'on' | 'error' | 'none' | 'wait' = 'wait';
  private micError = '';
  private wheelAcc = 0;
  private lastStep = 0;
  private leaveArmed = false;
  private leaveTimer = 0;
  private bannerTimer = 0;
  // live view refs
  private ui: {
    counter: HTMLElement;
    mic: HTMLElement;
    caption: HTMLElement;
    banner: HTMLElement;
    start: HTMLElement;
    audience: HTMLElement;
    next: HTMLButtonElement;
  } | null = null;

  constructor(private d: HallDeps) {
    Object.assign(this.root.style, {
      position: 'fixed', inset: '0', zIndex: '70', display: 'none', flexDirection: 'column', color: '#eaf3ff', fontFamily: UI_FONT,
      background: 'radial-gradient(ellipse at 50% 20%, #2a1a36 0%, #120d1f 55%, #07080f 100%)', userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    this.root.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onWheel(e.deltaY);
    }, { passive: false });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.injectStyle();
    d.parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return this.open_;
  }

  // ------------------------------------------------------------------ open / close
  open(best: Record<string, number>, cb: HallCallbacks): void {
    if (this.open_) return;
    this.open_ = true;
    this.best = best;
    this.cb = cb;
    this.relock = !!document.pointerLockElement;
    if (document.pointerLockElement) document.exitPointerLock();
    window.dispatchEvent(new Event('blur')); // the game forgets every key that is held down
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    this.root.style.display = 'flex';
    this.d.stage?.enter();
    this.showTopics();
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.d.voice.stopLoop();
    window.clearTimeout(this.leaveTimer);
    window.clearTimeout(this.bannerTimer);
    window.clearTimeout(this.moodTimer);
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    this.root.style.display = 'none';
    this.root.replaceChildren();
    this.ui = null;
    window.dispatchEvent(new Event('blur'));
    if (this.relock) {
      try {
        const r = (this.d.lockTarget as HTMLElement & { requestPointerLock(): Promise<void> | void }).requestPointerLock();
        if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => undefined);
      } catch {
        /* the browser refuses right after Esc: a click on the screen takes the mouse again */
      }
    }
    this.relock = false;
    this.d.stage?.end();
    this.cb?.onClose();
    this.cb = null;
  }

  dispose(): void {
    this.close();
    this.root.remove();
  }

  // ------------------------------------------------------------------ input
  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // browser shortcuts keep working
    e.stopPropagation();
    e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape') this.onLeaveKey();
    else if (e.code === 'ArrowDown' || e.code === 'PageDown' || e.code === 'Space') this.step(1);
    else if (e.code === 'ArrowUp' || e.code === 'PageUp') this.step(-1);
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.stopPropagation();
  };

  private onWheel(dy: number): void {
    if (this.mode !== 'live' || !this.started) return;
    this.wheelAcc += dy;
    const now = performance.now();
    if (Math.abs(this.wheelAcc) < 40 || now - this.lastStep < 320) return;
    const dir = this.wheelAcc > 0 ? 1 : -1;
    this.wheelAcc = 0;
    this.lastStep = now;
    this.step(dir);
  }

  /** Enter (or Esc): leave. In the middle of a presentation it asks once. */
  private onLeaveKey(): void {
    const progress = this.cov.some((c) => c > 0);
    if (this.mode === 'live' && progress && !this.leaveArmed) {
      this.leaveArmed = true;
      this.showBanner('Leave the presentation? Your marks will be lost. Press ENTER again to leave, or any other key to continue.', 4500);
      window.clearTimeout(this.leaveTimer);
      this.leaveTimer = window.setTimeout(() => (this.leaveArmed = false), 4500);
      return;
    }
    this.close();
  }

  // ------------------------------------------------------------------ small DOM helpers
  private el<K extends keyof HTMLElementTagNameMap>(tag: K, css: Partial<CSSStyleDeclaration> = {}, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    Object.assign(e.style, css);
    if (text !== undefined) e.textContent = text;
    return e;
  }
  private button(label: string, bg: string, onClick: () => void): HTMLButtonElement {
    const b = this.el('button', {
      padding: '9px 16px', borderRadius: '11px', border: '1px solid rgba(255,255,255,0.32)', background: bg, color: '#fff', cursor: 'pointer',
      font: `700 14px/1.2 ${UI_FONT}`,
    }, label);
    b.type = 'button';
    b.tabIndex = -1;
    b.addEventListener('click', onClick);
    return b;
  }
  private injectStyle(): void {
    if (document.getElementById('evc-hall-style')) return;
    const st = document.createElement('style');
    st.id = 'evc-hall-style';
    st.textContent = `
      @keyframes hallBob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
      @keyframes hallFloat { 0% { opacity: 0; transform: translateY(8px) scale(.8) } 15% { opacity: 1 } 100% { opacity: 0; transform: translateY(-46px) scale(1.15) } }
      @keyframes hallJump { 0%,100% { transform: translateY(0) } 40% { transform: translateY(-12px) } }
      @keyframes hallPulse { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
      .hall-p { display: inline-block; animation: hallBob 2.4s ease-in-out infinite; }
      .hall-p.cheer { animation: hallJump .5s ease-in-out infinite; }
      .hall-bubble { position: absolute; bottom: 70%; font: 700 15px/1 ${UI_FONT}; color: #fff; text-shadow: 0 1px 4px #000; animation: hallFloat 1.8s ease-out forwards; pointer-events: none; white-space: nowrap; }
    `;
    document.head.appendChild(st);
  }

  private showBanner(text: string, ms: number): void {
    const b = this.ui?.banner;
    if (!b) return;
    b.textContent = text;
    b.style.opacity = '1';
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (b.style.opacity = '0'), ms);
  }

  // ------------------------------------------------------------------ 1. topics
  private showTopics(): void {
    this.mode = 'topics';
    this.setMood('idle');
    this.d.voice.stopLoop();
    this.ui = null;
    const r = this.root;
    r.replaceChildren();
    const wrap = this.el('div', { margin: 'auto', width: 'min(900px, 94vw)', maxHeight: '92vh', overflowY: 'auto', padding: '18px' });
    wrap.appendChild(this.el('div', { font: `800 26px/1.3 ${UI_FONT}` }, '🎤 Presentation Hall'));
    wrap.appendChild(this.el('div', { font: `500 15px/1.5 ${UI_FONT}`, opacity: '0.8', margin: '4px 0 16px' }, 'Choose the topic you will present. Press ENTER to leave the hall.'));
    const grid = this.el('div', { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '10px' });
    for (const t of HALL_TOPICS) {
      const b = this.best[t.id];
      const card = this.el('div', {
        padding: '14px', borderRadius: '14px', background: 'rgba(34,197,94,0.16)', border: '1px solid #22c55e', cursor: 'pointer',
      });
      card.append(
        this.el('div', { fontSize: '34px' }, t.icon),
        this.el('div', { font: `700 18px/1.3 ${UI_FONT}` }, t.title),
        this.el('div', { font: `500 13px/1.4 ${UI_FONT}`, opacity: '0.8' }, `${t.blurb} · ${pagesOf(t).length} pages`),
        this.el('div', { font: `600 13px/1.4 ${UI_FONT}`, marginTop: '6px', color: '#86efac' }, b !== undefined ? `Best mark: ${b}%` : 'Not presented yet'),
      );
      card.addEventListener('click', () => this.showReady(t));
      grid.appendChild(card);
    }
    for (const t of HALL_SOON) {
      const card = this.el('div', { padding: '14px', borderRadius: '14px', background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.25)', opacity: '0.6' });
      card.append(
        this.el('div', { fontSize: '34px', filter: 'grayscale(1)' }, t.icon),
        this.el('div', { font: `700 17px/1.3 ${UI_FONT}` }, t.title),
        this.el('div', { font: `600 13px/1.4 ${UI_FONT}`, marginTop: '6px', color: '#fbbf24' }, '🔒 Coming soon'),
      );
      grid.appendChild(card);
    }
    wrap.appendChild(grid);
    const foot = this.el('div', { marginTop: '16px' });
    foot.appendChild(this.button('Leave hall (Enter)', 'rgba(255,255,255,0.14)', () => this.close()));
    wrap.appendChild(foot);
    r.appendChild(wrap);
  }

  // ------------------------------------------------------------------ 2. stage (ready + live)
  private showReady(t: HallTopic): void {
    this.topic = t;
    this.pages = pagesOf(t);
    this.page = 0;
    this.cov = this.pages.map(() => 0);
    this.finalText = this.pages.map(() => '');
    this.interim = '';
    this.started = false;
    this.leaveArmed = false;
    this.mode = 'ready';
    this.setMood('idle');
    this.buildStage();
    this.renderPage();
    this.startMic();
  }

  private buildStage(): void {
    const r = this.root;
    r.replaceChildren();
    const top = this.el('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '8px 14px', background: 'rgba(0,0,0,0.45)', font: `600 14px/1.3 ${UI_FONT}` });
    const counter = this.el('div', {}, '');
    const mic = this.el('div', { font: `700 13px/1.3 ${UI_FONT}` }, '');
    top.append(this.el('div', { fontWeight: '800' }, `🎤 ${this.topic!.title}`), counter, mic);
    r.appendChild(top);

    // stage: curtains, the screen (NOT full screen), the podium, the audience
    const stage = this.el('div', { flex: '1', position: 'relative', overflow: 'hidden', minHeight: '0' });
    const curtain = (side: 'left' | 'right'): HTMLElement =>
      this.el('div', {
        position: 'absolute', top: '0', bottom: '0', [side]: '0', width: 'min(13vw, 160px)',
        background: `linear-gradient(${side === 'left' ? '90deg' : '270deg'}, #5b0f1c, #8f1d2f 70%, rgba(143,29,47,0.0))`,
      } as Partial<CSSStyleDeclaration>);
    stage.append(curtain('left'), curtain('right'));
    const floor = this.el('div', { position: 'absolute', left: '0', right: '0', bottom: '0', height: '38%', background: 'linear-gradient(#2b1d12, #140d08)' });
    stage.appendChild(floor);
    const screen = this.el('div', {
      position: 'absolute', left: '50%', top: '5%', transform: 'translateX(-50%)', width: 'min(700px, 66vw)', height: 'min(36vh, 380px)', boxSizing: 'border-box',
      borderRadius: '10px', border: '6px solid #0b0b0f', background: 'linear-gradient(160deg, #0f3b3a, #0b1f3a)', boxShadow: '0 0 40px rgba(120,200,255,0.25)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 18px', textAlign: 'center', overflow: 'hidden',
    });
    // step 3: the screen shows no text any more (no icon, title or bullet points): it is a plain blank screen
    stage.appendChild(screen);
    const podium = this.el('div', {
      position: 'absolute', left: '50%', bottom: '25%', transform: 'translateX(-50%)', width: '90px', height: '56px', borderRadius: '8px 8px 0 0',
      background: 'linear-gradient(#6b4a2a, #3d2815)', border: '1px solid #00000066', textAlign: 'center', font: '26px/56px sans-serif',
    }, '🎤');
    stage.appendChild(podium);
    const audience = this.el('div', { position: 'absolute', left: '0', right: '0', bottom: '0', height: '25%', overflow: 'hidden' });
    this.buildAudience(audience);
    stage.appendChild(audience);

    // the "ready" card: say start
    const start = this.el('div', {
      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(460px, 86vw)', padding: '16px 18px', textAlign: 'center',
      borderRadius: '16px', background: 'rgba(8,12,22,0.92)', border: '1px solid rgba(255,255,255,0.3)', boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
    });
    stage.appendChild(start);
    const banner = this.el('div', {
      position: 'absolute', left: '50%', top: '10px', transform: 'translateX(-50%)', maxWidth: '86vw', padding: '8px 16px', borderRadius: '12px', background: 'rgba(8,12,22,0.9)',
      border: '1px solid #facc15', font: `600 14px/1.4 ${UI_FONT}`, textAlign: 'center', opacity: '0', transition: 'opacity .25s', pointerEvents: 'none',
    });
    stage.appendChild(banner);
    r.appendChild(stage);

    // the caption: three lines at the bottom
    const bar = this.el('div', { padding: '10px 12px 12px', background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' });
    const caption = this.el('div', {
      width: 'min(860px, 96vw)', boxSizing: 'border-box', padding: '10px 16px', borderRadius: '12px', background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.22)', font: `600 clamp(17px, 2.6vh, 24px)/1.55 ${UI_FONT}`, textAlign: 'center',
    });
    const nav = this.el('div', { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', font: `500 12px/1.4 ${UI_FONT}`, opacity: '0.95' });
    const prev = this.button('▲ Back', 'rgba(255,255,255,0.14)', () => this.step(-1));
    const next = this.button('▼ Next lines', '#1d4ed8', () => this.step(1));
    nav.append(prev, this.el('span', { opacity: '0.8' }, '🖱️ Mouse wheel: next lines · Enter: leave'), next);
    bar.append(caption, nav);
    r.appendChild(bar);
    this.ui = { counter, mic, caption, banner, start, audience, next };
    this.renderStart();
  }

  private buildAudience(host: HTMLElement): void {
    host.replaceChildren();
    const perRow = Math.max(8, Math.min(22, Math.floor(window.innerWidth / 58)));
    for (let row = 0; row < 2; row++) {
      const line = this.el('div', {
        position: 'absolute', left: '0', right: '0', bottom: row === 0 ? '-10px' : '26px', display: 'flex', justifyContent: 'space-evenly', fontSize: row === 0 ? '44px' : '36px',
        opacity: row === 0 ? '1' : '0.85', filter: row === 0 ? 'none' : 'brightness(0.8)',
      });
      for (let i = 0; i < perRow; i++) {
        const p = this.el('span', { position: 'relative', animationDelay: `${((i * 7 + row * 3) % 10) / 4}s` }, PEOPLE[(i * 5 + row * 3) % PEOPLE.length]);
        p.className = 'hall-p';
        line.appendChild(p);
      }
      host.appendChild(line);
    }
  }

  private renderStart(): void {
    const s = this.ui?.start;
    if (!s) return;
    s.replaceChildren();
    if (this.started || this.mode !== 'ready') {
      s.style.display = 'none';
      return;
    }
    s.style.display = 'block';
    s.append(
      this.el('div', { fontSize: '34px' }, this.mic === 'error' || this.mic === 'none' ? '🎤✖' : '🎤'),
      this.el('div', { font: `800 18px/1.4 ${UI_FONT}`, margin: '4px 0' }, 'Start your presentation by voice'),
    );
    if (this.mic === 'none') {
      s.append(this.el('div', { font: `500 14px/1.5 ${UI_FONT}`, opacity: '0.85' }, 'Voice recognition needs Chrome or Edge. Without it you can read the pages, but no marks are given.'));
      s.appendChild(this.button('Begin without voice (no marks)', '#a16207', () => this.begin()));
    } else if (this.mic === 'error') {
      s.append(this.el('div', { font: `500 14px/1.5 ${UI_FONT}`, color: '#fca5a5' }, `The microphone is blocked (${this.micError}). Allow it in the browser, then choose the topic again.`));
      s.appendChild(this.button('Begin without voice (no marks)', '#a16207', () => this.begin()));
    } else {
      s.append(this.el('div', { font: `500 15px/1.5 ${UI_FONT}`, opacity: '0.9' }, 'Say “Start” or “Good morning everyone”. Then read the three lines at the bottom aloud.'));
      s.appendChild(this.el('div', { font: `600 13px/1.4 ${UI_FONT}`, marginTop: '6px', animation: 'hallPulse 1.2s ease-in-out infinite' }, this.mic === 'wait' ? 'Waiting for the microphone…' : '● Listening'));
    }
    const back = this.button('◀ Choose another topic', 'rgba(255,255,255,0.14)', () => this.showTopics());
    back.style.marginTop = '10px';
    s.appendChild(back);
  }

  private begin(): void {
    if (this.started) return;
    this.started = true;
    this.mode = 'live';
    this.setMood('listen');
    this.renderStart();
    this.renderPage();
  }

  private startMic(): void {
    this.mic = 'wait';
    const stop = this.d.voice.listenLoop(
      (text, final) => this.onHeard(text, final),
      (state, err) => {
        this.mic = state === 'on' ? 'on' : 'error';
        this.micError = err ?? '';
        this.renderStart();
        this.renderPage();
      },
    );
    if (!stop) {
      this.mic = 'none';
      this.renderStart();
    }
  }

  // ------------------------------------------------------------------ voice -> marks
  private onHeard(text: string, final: boolean): void {
    if (!this.open_ || (this.mode !== 'ready' && this.mode !== 'live')) return;
    if (!this.started) {
      if (!isStartPhrase(text)) return;
      this.begin(); // the greeting itself counts for page 1
    }
    if (final) {
      this.finalText[this.page] += ' ' + text;
      this.interim = '';
    } else this.interim = text;
    this.renderPage();
  }

  private heard(): string {
    return this.finalText[this.page] + ' ' + this.interim;
  }

  // ------------------------------------------------------------------ pages
  private step(dir: number): void {
    if (this.mode !== 'live' || !this.started) return;
    const last = this.pages.length - 1;
    if (dir > 0) {
      if (this.page >= last) {
        if (this.cov[last] >= FINISH_OK) this.finish();
        else this.showBanner('Read this last page aloud to finish. Without your voice there are no marks.', 3800);
        return;
      }
      if (this.cov[this.page] >= READ_OK) {
        applause(1.1, 0.35);
        this.react(1);
      }
      this.page++;
    } else if (this.page > 0) this.page--;
    this.interim = '';
    this.renderPage();
  }

  private renderPage(): void {
    const u = this.ui;
    if (!u || !this.topic) return;
    const p = this.pages[this.page];

    // words of the page, with the heard ones in green (the same matching as the marks)
    const lineTokens = p.lines.map((l) => l.split(/\s+/).map((w) => tokenize(w)));
    const flat = lineTokens.flat(2);
    const matched = this.started ? matchWords(flat, this.heard()) : flat.map(() => false);
    const cov = coverage(flat, matched);
    if (this.started) this.cov[this.page] = Math.max(this.cov[this.page], cov);
    let k = 0;
    const lines = p.lines.map((line, li) => {
      const row = this.el('div', { opacity: this.started ? '1' : '0.55' });
      line.split(/\s+/).forEach((w, wi) => {
        const toks = lineTokens[li][wi];
        const hit = toks.length > 0 && toks.every((_, ti) => matched[k + ti]);
        k += toks.length;
        const span = this.el('span', { color: hit ? '#4ade80' : '#f1f5f9', transition: 'color .15s' }, w + ' ');
        row.appendChild(span);
      });
      return row;
    });
    u.caption.replaceChildren(...lines);

    const read = this.cov.filter((c) => c >= FINISH_OK).length;
    u.counter.textContent = `Page ${this.page + 1} / ${this.pages.length} · pages read aloud: ${read}`;
    u.mic.textContent = this.mic === 'on' ? '🎤 Listening' : this.mic === 'wait' ? '🎤 …' : this.mic === 'none' ? '🎤 No voice (no marks)' : '🎤 Blocked (no marks)';
    u.mic.style.color = this.mic === 'on' ? '#4ade80' : this.mic === 'wait' ? '#e5e7eb' : '#fca5a5';
    const lastPage = this.page === this.pages.length - 1;
    u.next.textContent = lastPage ? (this.cov[this.page] >= FINISH_OK ? '✔ Finish presentation' : '▼ Finish (read this page first)') : '▼ Next lines';
    u.next.style.background = lastPage && this.cov[this.page] >= FINISH_OK ? '#15803d' : '#1d4ed8';
  }

  // ------------------------------------------------------------------ audience reactions
  /** The real hall's people (if wired): a soft clap, or a standing ovation, then back to listening (while reading) / sitting still. */
  private moodTimer = 0;
  private setMood(m: HallMood): void {
    window.clearTimeout(this.moodTimer);
    this.d.stage?.mood(m);
  }
  private reactMood(level: 1 | 2): void {
    this.setMood(level === 2 ? 'ovation' : 'clap');
    this.moodTimer = window.setTimeout(() => this.d.stage?.mood(this.mode === 'live' ? 'listen' : 'idle'), level === 2 ? 4200 : 1800);
  }

  private react(level: 1 | 2): void {
    this.reactMood(level);
    const host = this.ui?.audience;
    if (!host) return;
    const people = Array.from(host.querySelectorAll<HTMLElement>('.hall-p'));
    const n = level === 2 ? Math.min(people.length, 16) : Math.min(people.length, 4);
    for (let i = 0; i < n; i++) {
      const p = people[Math.floor(Math.random() * people.length)];
      const b = this.el('span', {}, CHEERS[Math.floor(Math.random() * CHEERS.length)]);
      b.className = 'hall-bubble';
      b.style.left = `${Math.random() * 40 - 10}px`;
      b.style.animationDelay = `${Math.random() * 0.8}s`;
      p.appendChild(b);
      window.setTimeout(() => b.remove(), 2800);
    }
    if (level === 2) {
      people.forEach((p) => p.classList.add('cheer'));
      window.setTimeout(() => people.forEach((p) => p.classList.remove('cheer')), 4200);
    }
  }

  // ------------------------------------------------------------------ 3. result
  private finish(): void {
    if (!this.topic) return;
    this.mode = 'result';
    this.d.voice.stopLoop();
    const total = this.pages.length;
    const marks = this.cov.map(pageMark);
    const mark = Math.round((marks.reduce((a, b) => a + b, 0) / total) * 100);
    const topic = this.topic;
    this.cb?.onFinished(topic.id, mark);
    this.best[topic.id] = Math.max(this.best[topic.id] ?? 0, mark);
    if (mark >= 75) {
      applause(5, 0.9);
      this.react(2);
    } else if (mark >= 60) {
      applause(3, 0.6);
      this.react(1);
    }
    const u = this.ui;
    if (u) {
      u.start.style.display = 'block';
      u.start.replaceChildren();
      const s = stars(mark);
      u.start.append(
        this.el('div', { font: `800 34px/1.2 ${UI_FONT}`, color: mark >= 60 ? '#4ade80' : '#fbbf24' }, `${mark}%`),
        this.el('div', { font: `700 24px/1.3 ${UI_FONT}`, letterSpacing: '4px' }, '★'.repeat(s) + '☆'.repeat(3 - s)),
        this.el('div', { font: `600 15px/1.5 ${UI_FONT}`, margin: '6px 0' },
          mark >= 90 ? 'Standing ovation! Excellent presentation.' : mark >= 75 ? 'Great presentation. The audience loved it.' : mark >= 60 ? 'Well done. The audience clapped.' : 'Not enough yet. Read every page aloud, clearly, and try again.'),
      );
      const bars = this.el('div', { display: 'flex', gap: '3px', alignItems: 'flex-end', justifyContent: 'center', height: '36px', margin: '6px 0 10px' });
      marks.forEach((m) => bars.appendChild(this.el('div', { width: '10px', height: `${Math.max(3, Math.round(m * 36))}px`, borderRadius: '3px', background: m >= 0.8 ? '#22c55e' : m > 0 ? '#facc15' : '#ef4444' })));
      u.start.appendChild(bars);
      const row = this.el('div', { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' });
      row.append(
        this.button('Present again', '#1d4ed8', () => this.showReady(topic)),
        this.button('Choose another topic', 'rgba(255,255,255,0.14)', () => this.showTopics()),
        this.button('Leave hall (Enter)', '#15803d', () => this.close()),
      );
      u.start.appendChild(row);
    }
  }
}
