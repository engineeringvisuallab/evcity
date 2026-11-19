import { UI_FONT } from './theme';

/**
 * "0" key: a small box asks for X and Z (world metres, x = east, z = south) and `onGo(x, z)` takes the player there.
 * `onGo` returns null when it worked (the box closes) or a Bangla message when it could not (the box stays open and shows it).
 * `blocked()` = true while the player is not walking (vehicle, boat, helicopter, train, plane, inside a building ...): the key is then left alone.
 * The UI owns no game logic.
 */
export class GotoPanel {
  private overlay = document.createElement('div');
  private panel = document.createElement('div');
  private inX = document.createElement('input');
  private inZ = document.createElement('input');
  private note = document.createElement('div');

  constructor(
    parent: HTMLElement,
    private onGo: (x: number, z: number) => string | null,
    /** The canvas: pointer lock is requested again on it after a successful jump, so the game goes on without an extra click. */
    private lockTarget: HTMLElement | undefined,
    private blocked: () => boolean,
    /** Where the player stands now (shown as the hint inside the boxes). */
    private here: () => { x: number; z: number },
    /** The text shown when the key is pressed while the player is not walking. */
    private blockedText: string,
    private toast: (text: string) => void,
  ) {
    Object.assign(this.overlay.style, {
      position: 'fixed', inset: '0', zIndex: '86', display: 'none', alignItems: 'center', justifyContent: 'center',
      padding: '20px', background: 'rgba(3,10,14,.74)', backdropFilter: 'blur(6px)', pointerEvents: 'auto',
    });
    Object.assign(this.panel.style, {
      width: 'min(420px,96vw)', borderRadius: '20px', border: '1px solid rgba(255,255,255,.2)',
      background: 'linear-gradient(155deg,#172b30,#0b171b)', color: '#fff', padding: '24px',
      boxShadow: '0 24px 70px rgba(0,0,0,.5)', fontFamily: UI_FONT,
    });

    const title = document.createElement('div');
    title.textContent = '📍 কোথায় যেতে চান?';
    Object.assign(title.style, { fontSize: '22px', fontWeight: '800', marginBottom: '6px' });
    const sub = document.createElement('div');
    sub.textContent = 'X (পূর্ব) আর Z (দক্ষিণ) লিখুন, তারপর Enter বা "যান" চাপুন। বন্ধ করতে 0 বা Esc।';
    Object.assign(sub.style, { fontSize: '14px', color: 'rgba(255,255,255,.7)', lineHeight: '1.65', marginBottom: '16px' });

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;';
    for (const [el, label] of [[this.inX, 'X'], [this.inZ, 'Z']] as const) {
      const wrap = document.createElement('label');
      wrap.style.cssText = 'flex:1;display:block;font-size:13px;color:rgba(255,255,255,.75);';
      wrap.textContent = label;
      el.type = 'text';
      el.inputMode = 'decimal';
      el.autocomplete = 'off';
      el.spellcheck = false;
      Object.assign(el.style, {
        display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '4px', padding: '10px 12px', borderRadius: '10px',
        border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.08)', color: '#fff', font: `600 16px ${UI_FONT}`, outline: 'none',
      });
      // typing must never reach the game (digits are debug keys, WASD would move the player)
      el.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); this.go(); }
        else if (e.code === 'Escape') { e.preventDefault(); this.close(); }
      });
      el.addEventListener('keyup', (e) => e.stopPropagation());
      wrap.appendChild(el);
      row.appendChild(wrap);
    }

    Object.assign(this.note.style, { display: 'none', marginTop: '14px', padding: '9px 12px', borderRadius: '10px', background: 'rgba(220,60,60,.2)', border: '1px solid rgba(255,120,120,.5)', fontSize: '14px', lineHeight: '1.55' });

    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:18px;';
    const mk = (text: string, primary: boolean, fn: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      Object.assign(b.style, {
        border: primary ? '1px solid #ffd21f' : '1px solid rgba(255,255,255,.25)', borderRadius: '10px', padding: '9px 16px',
        background: primary ? 'rgba(255,210,31,.2)' : 'rgba(255,255,255,.08)', color: '#fff', font: `600 14px ${UI_FONT}`, cursor: 'pointer',
      });
      b.addEventListener('click', fn);
      return b;
    };
    btns.append(mk('বন্ধ করুন', false, () => this.close()), mk('যান', true, () => this.go()));

    this.panel.append(title, sub, row, this.note, btns);
    this.overlay.appendChild(this.panel);
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close(); });
    parent.appendChild(this.overlay);
    // capture phase: the 0 key is taken before the game sees it
    window.addEventListener('keydown', this.onKey, true);
  }

  get isOpen(): boolean {
    return this.overlay.style.display === 'flex';
  }

  open(): void {
    const h = this.here();
    this.inX.placeholder = String(Math.round(h.x));
    this.inZ.placeholder = String(Math.round(h.z));
    this.note.style.display = 'none';
    this.overlay.style.display = 'flex';
    if (document.pointerLockElement) document.exitPointerLock(); // the mouse is needed for the boxes
    this.inX.focus();
    this.inX.select();
  }

  close(relock = false): void {
    this.overlay.style.display = 'none';
    this.inX.blur();
    this.inZ.blur();
    if (relock) this.relock();
  }

  private relock(): void {
    try {
      const p = (this.lockTarget as (HTMLElement & { requestPointerLock(): Promise<void> | void }) | undefined)?.requestPointerLock();
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => undefined);
    } catch {
      /* the browser refused: the first click on the game locks it again */
    }
  }

  /** Numbers from the two boxes. "160 192" typed into the first box alone works too. */
  private parse(): [number, number] | null {
    const num = (s: string): number[] => (s.replace(/,/g, ' ').match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const a = num(this.inX.value), b = num(this.inZ.value);
    if (a.length >= 2 && b.length === 0) return [a[0]!, a[1]!];
    if (a.length === 1 && b.length === 1) return [a[0]!, b[0]!];
    return null;
  }

  private go(): void {
    const v = this.parse();
    if (!v) return this.fail('X আর Z দুটোই সংখ্যায় লিখুন (যেমন X = 160, Z = 192)।');
    const err = this.onGo(v[0], v[1]);
    if (err) return this.fail(err);
    this.close(true);
  }

  private fail(text: string): void {
    this.note.textContent = text;
    this.note.style.display = 'block';
  }

  private onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'Escape' && this.isOpen) {
      e.stopImmediatePropagation();
      this.close();
      return;
    }
    if (e.code !== 'Digit0' && e.code !== 'Numpad0') return;
    if (e.repeat) return;
    if (this.isOpen) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.close(true);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.blocked()) {
      this.toast(this.blockedText);
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    this.open();
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    this.overlay.remove();
  }
}
