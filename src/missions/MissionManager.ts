import { UI_FONT } from '../ui/theme';
import { MISSIONS, MISSION_BY_ID } from './MissionData';
import type { Mission, MissionKind, MissionPin, MissionProgress, MissionQuestion } from './MissionTypes';
import { PresentationHall, type HallStage } from './PresentationHall';
import { MissionVoice, checkNumber, checkText, parseSpokenNumber } from './MissionVoice';

const STORE_KEY = 'evc.missions.v1';
export const MISSION_KIND_ICON: Record<MissionKind, string> = { field: '⚠️', meeting: '👥', presentation: '📊', hall: '🎤' };
const KIND_NAME: Record<MissionKind, string> = { field: 'Field mission', meeting: 'Meeting', presentation: 'Presentation', hall: 'Presentation Hall' };

export interface MissionDeps {
  parent: HTMLElement;
  /** The game canvas: the mouse is released while a mission window is open and taken back when it closes. */
  lockTarget: HTMLElement;
  /** Top (px) where the tracker chip goes: just under the minimap's coordinate chip. */
  chipTop: () => number;
  toast: (text: string, ms?: number) => void;
  /** The real 3D Presentation Hall (EVLab): audience comes in when a presentation opens and leaves when it closes. */
  stage?: HallStage;
}

type Phase = 'ask' | 'feedback' | 'result';
interface Session {
  mission: Mission;
  index: number;
  correct: number;
  phase: Phase;
  lastOk: boolean;
}

const fmt = (n: number): string => (Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''));

/**
 * MISSIONS (Stage 13). A thin layer on top of the finished game: it never changes the world.
 * Flow: choose a mission -> it is tracked on the minimap (pin, dashed line, edge arrow + distance) -> arrive -> questions are read aloud,
 * the player types or speaks the short answers -> pass = "work done" message + badge. Progress is kept in localStorage.
 */
export class MissionManager {
  private progress: MissionProgress = {};
  private activeId: string | null = null;
  private arrived = false;
  private distance = Infinity;
  private session: Session | null = null;
  private voice = new MissionVoice();
  private panelOpen = false;
  private relock = false;
  private autoTimer = 0;
  private workTimer = 0;
  private listening = false;
  private hall: PresentationHall;
  /** The hall mission whose entrance you are standing at (tracked or not): ENTER opens the hall. */
  private hallHere: Mission | null = null;

  // --- chip (right side, under the minimap)
  private chip = document.createElement('div');
  private chipTrack = document.createElement('span');
  private chipBtn = document.createElement('button');
  private chipGo = document.createElement('button');
  private chipText = '';
  private chipTopPx = -1;
  // --- window
  private panel = document.createElement('div');
  private body = document.createElement('div');

  constructor(private d: MissionDeps) {
    this.load();
    this.hall = new PresentationHall({ parent: d.parent, lockTarget: d.lockTarget, voice: this.voice, stage: d.stage });
    window.addEventListener('keydown', this.onEnterKey);
    this.buildChip();
    this.buildPanel();
    this.refreshChip(true);
  }

  // ------------------------------------------------------------------ per frame
  /** `rel` = height of the player's capsule centre above the ground (only the hall marker on the stage looks at it, so the floors above the hall do not count). */
  update(_dt: number, px: number, pz: number, rel = Infinity): void {
    // step 4: the Presentation Hall mission is the green marker on the stage: standing on it (feet at stage height) = "arrived". It starts the mission once per visit; ENTER on the marker opens it again.
    const here = MISSIONS.find((h) => h.kind === 'hall' && Math.hypot(h.place.x - px, h.place.z - pz) <= h.place.radius && (h.place.lift === undefined || (rel >= h.place.lift - 0.5 && rel <= h.place.lift + 3.5))) ?? null;
    const m = this.activeId ? MISSION_BY_ID.get(this.activeId) : undefined;
    if (m) {
      this.distance = Math.hypot(m.place.x - px, m.place.z - pz);
      const now = m.kind === 'hall' ? here?.id === m.id : this.distance <= m.place.radius;
      if (now && !this.arrived) {
        this.arrived = true;
        if (m.kind !== 'hall') {
          this.d.toast(`📍 You arrived: ${m.title}. Press START.`, 4200);
          this.voice.speak(m.arrival ?? 'You have arrived. Press start.');
        }
      } else if (!now && this.arrived && !this.session) this.arrived = false;
    } else {
      this.distance = Infinity;
      this.arrived = false;
    }
    const entered = !!here && !this.hallHere;
    this.hallHere = here;
    if (entered && here && !this.hall.isOpen && !this.panelOpen) this.openHall(here);
    this.refreshChip(false);
  }

  /** Pins for the minimap: every mission is always shown, the tracked one is marked active. */
  pins(): MissionPin[] {
    return MISSIONS.map((m) => ({
      id: m.id,
      x: m.place.x,
      z: m.place.z,
      kind: m.kind,
      active: m.id === this.activeId,
      done: !!this.progress[m.id]?.passed,
      distance: m.id === this.activeId ? this.distance : undefined,
    }));
  }

  get isOpen(): boolean {
    return this.panelOpen || this.hall.isOpen;
  }

  toggle(): void {
    if (this.hall.isOpen) return;
    if (this.panelOpen) this.close();
    else this.session ? this.open('session') : this.open('list');
  }

  dispose(): void {
    window.clearTimeout(this.autoTimer);
    window.clearTimeout(this.workTimer);
    window.removeEventListener('keydown', this.onEnterKey);
    this.hall.dispose();
    this.voice.dispose();
    this.chip.remove();
    this.panel.remove();
  }

  // ------------------------------------------------------------------ persistence
  private load(): void {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const j = JSON.parse(raw) as { progress?: MissionProgress; active?: string | null };
      this.progress = j.progress ?? {};
      this.activeId = j.active && MISSION_BY_ID.has(j.active) ? j.active : null;
    } catch {
      /* private mode or damaged: start fresh */
    }
  }
  private save(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ progress: this.progress, active: this.activeId }));
    } catch {
      /* storage full or blocked: progress lasts for this session only */
    }
  }


  // ------------------------------------------------------------------ presentation hall
  /** ENTER at the entrance of a Presentation Hall goes in (inside the hall, the hall itself handles ENTER = leave). */
  private onEnterKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
    if (e.repeat || this.hall.isOpen || this.panelOpen || !this.hallHere) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    this.openHall(this.hallHere);
  };

  private openHall(m: Mission): void {
    if (this.hall.isOpen || this.panelOpen) return;
    this.voice.stopSpeaking();
    const best: Record<string, number> = {};
    for (const key of Object.keys(this.progress)) if (key.startsWith(m.id + ':')) best[key.slice(m.id.length + 1)] = this.progress[key].score;
    this.hall.open(best, {
      onFinished: (topicId, mark) => {
        const prev = this.progress[`${m.id}:${topicId}`];
        const passed = mark >= m.pass * 100;
        this.progress[`${m.id}:${topicId}`] = { score: Math.max(prev?.score ?? 0, mark), total: 100, passed: passed || !!prev?.passed };
        const all = Object.entries(this.progress).filter(([k]) => k.startsWith(m.id + ':')).map(([, v]) => v);
        this.progress[m.id] = { score: Math.max(...all.map((v) => v.score)), total: 100, passed: all.some((v) => v.passed) };
        if (passed) {
          this.d.toast(`🏅 Badge: ${m.badge}`, 4200);
          if (this.activeId === m.id) {
            this.activeId = null;
            this.arrived = false;
          }
        }
        this.save();
      },
      onClose: () => this.refreshChip(true),
    });
  }

  // ------------------------------------------------------------------ tracker chip
  private buildChip(): void {
    const c = this.chip;
    Object.assign(c.style, {
      position: 'fixed', right: '14px', zIndex: '11', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end',
      maxWidth: '280px', font: `600 12px/1.3 ${UI_FONT}`, color: '#eaf3ff',
    } satisfies Partial<CSSStyleDeclaration>);
    const btnCss = (b: HTMLButtonElement, bg: string): void => {
      Object.assign(b.style, {
        padding: '5px 10px', borderRadius: '9px', border: '1px solid rgba(255,255,255,0.35)', background: bg, color: '#fff', cursor: 'pointer',
        font: `700 12px/1.3 ${UI_FONT}`, pointerEvents: 'auto',
      } satisfies Partial<CSSStyleDeclaration>);
      b.type = 'button';
      b.addEventListener('keydown', (e) => e.stopPropagation());
    };
    this.chipBtn.textContent = '📋 Missions';
    btnCss(this.chipBtn, 'rgba(14,22,34,0.8)');
    this.chipBtn.addEventListener('click', () => this.toggle());
    this.chipGo.textContent = '▶ START';
    btnCss(this.chipGo, '#15803d');
    this.chipGo.style.display = 'none';
    this.chipGo.addEventListener('click', () => (this.hallHere ? this.openHall(this.hallHere) : this.startActive()));
    Object.assign(this.chipTrack.style, {
      padding: '4px 9px', borderRadius: '9px', background: 'rgba(14,22,34,0.72)', border: '1px solid rgba(255,255,255,0.25)', display: 'none',
      pointerEvents: 'none', whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>);
    c.append(this.chipTrack, this.chipGo, this.chipBtn);
    this.d.parent.appendChild(c);
  }

  private refreshChip(force: boolean): void {
    const top = this.d.chipTop();
    if (force || top !== this.chipTopPx) {
      this.chip.style.top = `${top}px`;
      this.chipTopPx = top;
    }
    const m = this.activeId ? MISSION_BY_ID.get(this.activeId) : undefined;
    let text = '';
    if (m) {
      const dist = this.distance;
      const ds = !Number.isFinite(dist) ? '' : dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist / 5) * 5} m`;
      text = this.arrived ? `${MISSION_KIND_ICON[m.kind]} ${m.title} · here` : `${MISSION_KIND_ICON[m.kind]} ${m.title} · ${ds}`;
    }
    const key = text + '|' + (this.arrived ? '1' : '0') + (this.session ? 's' : '') + (this.hallHere ? 'h' : '');
    if (key === this.chipText && !force) return;
    this.chipText = key;
    this.chipTrack.textContent = text;
    this.chipTrack.style.display = m ? 'block' : 'none';
    this.chipTrack.style.borderColor = this.arrived ? '#22c55e' : 'rgba(255,255,255,0.25)';
    this.chipGo.style.display = this.hallHere || (m && this.arrived && m.kind !== 'hall') ? 'block' : 'none';
    this.chipGo.textContent = this.hallHere ? '⏎ ENTER HALL' : this.session ? '▶ RESUME' : '▶ START';
  }

  // ------------------------------------------------------------------ window
  private buildPanel(): void {
    const p = this.panel;
    Object.assign(p.style, {
      position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)', width: 'min(600px, 94vw)', maxHeight: '78vh', overflowY: 'auto',
      boxSizing: 'border-box', padding: '16px 18px', borderRadius: '16px', background: 'rgba(10,16,28,0.94)', color: '#eaf3ff',
      border: '1px solid rgba(255,255,255,0.28)', boxShadow: '0 10px 36px rgba(0,0,0,0.55)', font: `500 15px/1.5 ${UI_FONT}`, zIndex: '60',
      display: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    // typing must never reach the game (WASD, M, U ... are game keys)
    const stop = (e: Event): void => e.stopPropagation();
    p.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape') this.close();
    });
    p.addEventListener('keyup', stop);
    p.addEventListener('wheel', stop);
    p.appendChild(this.body);
    this.d.parent.appendChild(p);
  }

  private open(view: 'list' | 'session'): void {
    if (!this.panelOpen) {
      this.panelOpen = true;
      this.relock = !!document.pointerLockElement;
      if (document.pointerLockElement) document.exitPointerLock();
      this.panel.style.display = 'block';
    }
    if (view === 'list' || !this.session) this.renderList();
    else this.renderSession();
  }

  private close(): void {
    if (!this.panelOpen) return;
    this.panelOpen = false;
    this.panel.style.display = 'none';
    window.clearTimeout(this.autoTimer);
    this.voice.stopListening();
    this.voice.stopSpeaking();
    this.listening = false;
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

  // small DOM helper
  private el<K extends keyof HTMLElementTagNameMap>(tag: K, css: Partial<CSSStyleDeclaration> = {}, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    Object.assign(e.style, css);
    if (text !== undefined) e.textContent = text;
    return e;
  }
  private button(label: string, bg: string, onClick: () => void): HTMLButtonElement {
    const b = this.el('button', {
      padding: '8px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.3)', background: bg, color: '#fff', cursor: 'pointer',
      font: `700 14px/1.2 ${UI_FONT}`,
    }, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  private header(title: string, sub: string): HTMLElement {
    const h = this.el('div', { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' });
    const t = this.el('div');
    t.append(this.el('div', { font: `700 17px/1.3 ${UI_FONT}` }, title), this.el('div', { font: `500 12px/1.4 ${UI_FONT}`, opacity: '0.72' }, sub));
    const x = this.button('✕', 'rgba(255,255,255,0.12)', () => this.close());
    x.style.padding = '4px 10px';
    h.append(t, x);
    return h;
  }

  // ------------------------------------------------------------------ list
  private renderList(): void {
    const b = this.body;
    b.replaceChildren();
    const done = MISSIONS.filter((m) => this.progress[m.id]?.passed).length;
    b.appendChild(this.header('Missions', `${done} of ${MISSIONS.length} completed · the tracked mission is marked on the minimap`));
    for (const m of MISSIONS) {
      const r = this.progress[m.id];
      const active = m.id === this.activeId;
      const row = this.el('div', {
        display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', marginBottom: '7px', borderRadius: '11px',
        background: active ? 'rgba(250,204,21,0.14)' : 'rgba(255,255,255,0.06)', border: active ? '1px solid #facc15' : '1px solid rgba(255,255,255,0.12)',
      });
      row.appendChild(this.el('div', { fontSize: '22px' }, MISSION_KIND_ICON[m.kind]));
      const info = this.el('div', { flex: '1', minWidth: '0' });
      info.append(
        this.el('div', { font: `700 14px/1.3 ${UI_FONT}` }, `${m.title}${r?.passed ? '  ✅' : ''}`),
        this.el('div', { font: `500 12px/1.4 ${UI_FONT}`, opacity: '0.75' }, `${KIND_NAME[m.kind]} · ${m.place.label}${r ? ` · best ${r.score}/${r.total}` : ''}`),
      );
      row.appendChild(info);
      row.appendChild(this.button(active ? 'Tracking' : 'Track', active ? '#a16207' : '#1d4ed8', () => this.track(m.id)));
      b.appendChild(row);
    }
    const foot = this.el('div', { display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center', flexWrap: 'wrap' });
    if (this.activeId) foot.appendChild(this.button('Stop tracking', 'rgba(255,255,255,0.14)', () => this.track(null)));
    const sp = this.button(this.voice.speakOn ? '🔊 Voice questions: on' : '🔇 Voice questions: off', 'rgba(255,255,255,0.14)', () => {
      this.voice.speakOn = !this.voice.speakOn;
      this.renderList();
    });
    foot.appendChild(sp);
    if (!this.voice.canListen) foot.appendChild(this.el('div', { font: `500 12px/1.4 ${UI_FONT}`, opacity: '0.7' }, 'Voice answers need Chrome or Edge. You can always type.'));
    b.appendChild(foot);
  }

  private track(id: string | null): void {
    this.activeId = id;
    this.arrived = false;
    this.session = null;
    this.save();
    this.refreshChip(true);
    if (id) {
      const m = MISSION_BY_ID.get(id)!;
      this.close();
      this.d.toast(`${MISSION_KIND_ICON[m.kind]} ${m.title}: follow the marker on the minimap`, 4200);
      this.voice.speak(m.brief);
    } else this.renderList();
  }

  // ------------------------------------------------------------------ session
  private startActive(): void {
    const m = this.activeId ? MISSION_BY_ID.get(this.activeId) : undefined;
    if (!m || !this.arrived) return;
    if (m.kind === 'hall') {
      this.openHall(m);
      return;
    }
    if (!this.session) this.session = { mission: m, index: 0, correct: 0, phase: 'ask', lastOk: false };
    this.refreshChip(true);
    this.open('session');
  }

  private renderSession(): void {
    const s = this.session;
    if (!s) return this.renderList();
    if (s.phase === 'ask') this.renderAsk(s);
    else if (s.phase === 'feedback') this.renderFeedback(s);
    else this.renderResult(s);
  }

  private renderAsk(s: Session): void {
    const m = s.mission;
    const q = m.questions[s.index];
    const b = this.body;
    b.replaceChildren();
    b.appendChild(this.header(`${MISSION_KIND_ICON[m.kind]} ${m.title}`, `Question ${s.index + 1} of ${m.questions.length}`));
    if (m.data) {
      const box = this.el('div', { padding: '8px 10px', marginBottom: '10px', borderRadius: '10px', background: 'rgba(255,255,255,0.07)', font: `500 13px/1.5 ${UI_FONT}` });
      box.appendChild(this.el('div', { font: `700 12px/1.4 ${UI_FONT}`, opacity: '0.75', marginBottom: '2px' }, m.kind === 'field' ? 'SITE DATA' : 'YOUR SLIDES'));
      for (const row of m.data!) box.appendChild(this.el('div', {}, `${row.label}: ${row.value}`));
      b.appendChild(box);
    }
    const who = q.by ? `${q.by}: ` : '';
    b.appendChild(this.el('div', { font: `600 16px/1.45 ${UI_FONT}`, marginBottom: '10px' }, who + q.q));
    const hintBox = this.el('div', { display: 'none', marginBottom: '8px', padding: '6px 10px', borderRadius: '9px', background: 'rgba(250,204,21,0.14)', font: `500 13px/1.45 ${UI_FONT}` }, q.hint ? `💡 ${q.hint}` : '');
    b.appendChild(hintBox);

    const status = this.el('div', { minHeight: '18px', font: `500 12px/1.4 ${UI_FONT}`, opacity: '0.8', marginBottom: '6px' });
    const input = this.el('input', {
      flex: '1', minWidth: '0', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(0,0,0,0.35)', color: '#fff',
      font: `500 15px/1.2 ${UI_FONT}`, outline: 'none',
    });
    input.type = 'text';
    input.placeholder = q.kind === 'number' ? `Type or say the number${q.unit ? ` (${q.unit})` : ''}` : 'Type or say a short answer';
    input.autocomplete = 'off';
    const submit = (): void => this.submit(q, input.value, status);
    input.addEventListener('keydown', (e) => {
      window.clearTimeout(this.autoTimer);
      if (e.code === 'Enter') submit();
    });

    const row = this.el('div', { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' });
    row.appendChild(input);
    const mic = this.button('🎤', this.voice.canListen ? '#b91c1c' : 'rgba(255,255,255,0.12)', () => this.toggleMic(mic, input, status, submit));
    mic.title = this.voice.canListen ? 'Click and say your answer' : 'Voice answers need Chrome or Edge';
    if (!this.voice.canListen) mic.disabled = true;
    row.append(mic, this.button('Submit', '#15803d', submit));
    b.append(row, status);

    const foot = this.el('div', { display: 'flex', gap: '8px', flexWrap: 'wrap' });
    foot.appendChild(this.button('🔊 Repeat question', 'rgba(255,255,255,0.14)', () => this.voice.speak(who + q.q)));
    if (q.hint) foot.appendChild(this.button('💡 Hint', 'rgba(255,255,255,0.14)', () => (hintBox.style.display = 'block')));
    b.appendChild(foot);
    window.setTimeout(() => input.focus(), 30);
    this.voice.speak(`${who}${q.q}`);
  }

  private toggleMic(mic: HTMLButtonElement, input: HTMLInputElement, status: HTMLElement, submit: () => void): void {
    if (this.listening) {
      this.voice.stopListening();
      return;
    }
    this.listening = true;
    mic.textContent = '⏺';
    status.textContent = 'Listening… speak now';
    const ok = this.voice.listen(
      (text, final) => {
        input.value = text;
        if (final) {
          status.textContent = `Heard: "${text}". Sending in a moment (type to change it).`;
          window.clearTimeout(this.autoTimer);
          this.autoTimer = window.setTimeout(submit, 1600);
        }
      },
      (err) => {
        this.listening = false;
        mic.textContent = '🎤';
        if (err && err !== 'aborted' && err !== 'no-speech') status.textContent = err === 'not-allowed' ? 'The microphone is blocked. Allow it in the browser, or type.' : `Voice error: ${err}. Please type.`;
        else if (err === 'no-speech') status.textContent = 'I heard nothing. Click the microphone and try again.';
      },
    );
    if (!ok) {
      this.listening = false;
      mic.textContent = '🎤';
      status.textContent = 'Voice answers are not available here. Please type.';
    }
  }

  private submit(q: MissionQuestion, raw: string, status: HTMLElement): void {
    const s = this.session;
    if (!s || s.phase !== 'ask') return;
    window.clearTimeout(this.autoTimer);
    const text = raw.trim();
    if (!text) {
      status.textContent = 'Please type or say an answer first.';
      return;
    }
    let ok: boolean;
    if (q.kind === 'number') {
      const v = parseSpokenNumber(text);
      if (v === null) {
        status.textContent = 'I could not find a number in your answer. Please try again.';
        return;
      }
      ok = checkNumber(v, q);
    } else ok = checkText(text, q.groups, q.need);
    this.voice.stopListening();
    s.lastOk = ok;
    if (ok) s.correct++;
    s.phase = 'feedback';
    this.renderFeedback(s, text);
  }

  private renderFeedback(s: Session, given = ''): void {
    const m = s.mission;
    const q = m.questions[s.index];
    const b = this.body;
    b.replaceChildren();
    b.appendChild(this.header(`${MISSION_KIND_ICON[m.kind]} ${m.title}`, `Question ${s.index + 1} of ${m.questions.length}`));
    b.appendChild(this.el('div', { font: `700 18px/1.3 ${UI_FONT}`, color: s.lastOk ? '#4ade80' : '#f87171', marginBottom: '6px' }, s.lastOk ? '✅ Correct' : '❌ Not quite'));
    if (given) b.appendChild(this.el('div', { font: `500 13px/1.4 ${UI_FONT}`, opacity: '0.8' }, `Your answer: ${given}`));
    if (!s.lastOk && q.kind === 'number') {
      const ans = q.answer !== undefined ? fmt(q.answer) : `${q.min} to ${q.max}`;
      b.appendChild(this.el('div', { font: `600 14px/1.4 ${UI_FONT}`, marginTop: '4px' }, `Correct answer: ${ans}${q.unit ? ' ' + q.unit : ''}`));
    }
    b.appendChild(this.el('div', { marginTop: '6px' }, q.explain));
    if (q.formula) b.appendChild(this.el('div', { marginTop: '6px', padding: '6px 10px', borderRadius: '9px', background: 'rgba(255,255,255,0.08)', font: `600 14px/1.4 ${UI_FONT}` }, `Formula: ${q.formula}`));
    const last = s.index + 1 >= m.questions.length;
    const next = this.button(last ? 'See result' : 'Next question', '#1d4ed8', () => {
      this.voice.stopSpeaking();
      if (last) s.phase = 'result';
      else {
        s.index++;
        s.phase = 'ask';
      }
      this.renderSession();
    });
    next.style.marginTop = '12px';
    b.appendChild(next);
    next.focus();
    this.voice.speak(`${s.lastOk ? 'Correct.' : 'Not quite.'} ${q.explain}`);
  }

  private renderResult(s: Session): void {
    const m = s.mission;
    const total = m.questions.length;
    const passed = s.correct / total >= m.pass - 1e-9;
    const stars = !passed ? 0 : s.correct === total ? 3 : s.correct / total >= 0.8 ? 2 : 1;
    const b = this.body;
    b.replaceChildren();
    b.appendChild(this.header(`${MISSION_KIND_ICON[m.kind]} ${m.title}`, 'Result'));
    b.appendChild(this.el('div', { font: `700 24px/1.3 ${UI_FONT}`, color: passed ? '#4ade80' : '#fbbf24' }, `${s.correct} / ${total} correct`));
    if (passed) b.appendChild(this.el('div', { font: `700 22px/1.3 ${UI_FONT}`, letterSpacing: '4px' }, '★'.repeat(stars) + '☆'.repeat(3 - stars)));
    const msg = this.el('div', { marginTop: '8px', font: `600 15px/1.4 ${UI_FONT}` });
    b.appendChild(msg);
    const prev = this.progress[m.id];
    if (!prev || s.correct > prev.score || (passed && !prev.passed)) this.progress[m.id] = { score: s.correct, total, passed: passed || !!prev?.passed };
    if (!passed) {
      msg.textContent = `You need at least ${Math.ceil(m.pass * total - 1e-9)} correct answers. Read the explanations and try again.`;
      const row = this.el('div', { display: 'flex', gap: '8px', marginTop: '12px' });
      row.append(
        this.button('Try again', '#1d4ed8', () => {
          this.session = { mission: m, index: 0, correct: 0, phase: 'ask', lastOk: false };
          this.renderSession();
        }),
        this.button('Close', 'rgba(255,255,255,0.14)', () => {
          this.session = null;
          this.refreshChip(true);
          this.close();
        }),
      );
      b.appendChild(row);
      this.save();
      this.voice.speak(`You got ${s.correct} out of ${total}. Read the explanations and try again.`);
      return;
    }
    // passed: the workers do the work (only a message and a short progress bar: the world does not change)
    const bar = this.el('div', { marginTop: '10px', height: '10px', borderRadius: '6px', background: 'rgba(255,255,255,0.15)', overflow: 'hidden' });
    const fill = this.el('div', { height: '100%', width: '0%', background: '#22c55e', transition: 'width 3.2s linear' });
    bar.appendChild(fill);
    msg.textContent = '👷 Workers are on site…';
    b.appendChild(bar);
    window.setTimeout(() => (fill.style.width = '100%'), 40);
    this.voice.speak(`Well done. ${m.workDone}`);
    window.clearTimeout(this.workTimer);
    this.workTimer = window.setTimeout(() => {
      msg.textContent = `✅ Work completed: ${m.workDone}`;
      const badge = this.el('div', { display: 'inline-block', marginTop: '10px', padding: '6px 14px', borderRadius: '999px', background: '#a16207', border: '1px solid #facc15', font: `700 14px/1.3 ${UI_FONT}` }, `🏅 Badge: ${m.badge}`);
      b.appendChild(badge);
      const done = this.button('Done', '#15803d', () => {
        this.session = null;
        if (this.activeId === m.id) this.activeId = null;
        this.arrived = false;
        this.save();
        this.refreshChip(true);
        this.close();
      });
      done.style.display = 'block';
      done.style.marginTop = '12px';
      b.appendChild(done);
      this.save();
    }, 3300);
  }
}
