import type { InputManager } from './InputManager';

/**
 * Mobile (touch) controls, landscape first.
 *
 * - On foot / in the air / on a boat: a floating joystick on the left (it appears where the thumb lands) and big action buttons on the right.
 * - In a car: a STEERING WHEEL on the left (analog, drag to turn, springs back), a GAS and a BRAKE pedal on the right and an
 *   EASY MODE ("AUTO"): the car holds a cruise speed by itself, so one thumb steers and the other only brakes. The gas pedal still
 *   gives full power when you want to go faster than the cruise speed.
 * - A menu button (top left) opens every other feature of the game (settings, vehicle menu, tools, map zoom, sound, cameras, teleports ...).
 * - Portrait: a "turn your phone" screen with a one-tap button for full screen + landscape lock (Android Chrome); iPhone shows the hint only.
 *
 * Everything is mapped to the SAME virtual keys the keyboard uses (InputManager.setVirtualKey), so no gameplay code had to change
 * except the analog steering / easy-mode block in VehicleManager.fixedUpdate.
 */

export type TouchMode = 'foot' | 'car' | 'air' | 'boat' | 'ride' | 'fly';
export interface TouchFlags {
  /** Suprim: Space = up, X = down, Shift = boost. */
  amphibious?: boolean;
  /** Tank: left mouse = cannon. */
  tank?: boolean;
}

/** Live driving state read by VehicleManager. Fields are mutated in place (no per-frame allocation). */
export interface TouchDrive {
  /** True while the player sits in a car and the touch controls are on. */
  active: boolean;
  gas: boolean;
  brake: boolean;
  /** -1 .. +1, positive = the wheel is turned to the RIGHT. 0 = wheel in the middle (keyboard A / D still work). */
  steerAxis: number;
  /** Easy mode: the car keeps `cruiseMps` by itself. */
  easy: boolean;
  cruiseMps: number;
}

const CRUISE_STEPS_KMH = [0, 30, 50, 80]; // 0 = easy mode off
const LS_CRUISE = 'evcity.touch.cruise';
const WHEEL_MAX_DEG = 110; // wheel rotation for full lock

const CSS = `
.tc-root{position:fixed;inset:0;z-index:30;pointer-events:none;font-family:system-ui,'Noto Sans Bengali',sans-serif;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;--u:clamp(3.2px,1vh,6px);touch-action:none}
.tc-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.tc-grp{position:absolute;inset:0;pointer-events:none;display:none}
.tc-btn{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:auto;touch-action:none;
  color:#fff;font:800 calc(var(--u)*3.4)/1.1 system-ui,'Noto Sans Bengali',sans-serif;text-align:center;text-shadow:0 1px 3px #000;
  background:rgba(8,18,25,.50);border:1.5px solid rgba(255,255,255,.5);box-shadow:0 2px 10px rgba(0,0,0,.3);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);cursor:pointer;padding:0}
.tc-btn small{font:600 calc(var(--u)*2.4)/1.1 system-ui,'Noto Sans Bengali',sans-serif;opacity:.85;margin-top:calc(var(--u)*.4)}
.tc-btn.round{border-radius:50%}
.tc-btn.rect{border-radius:calc(var(--u)*2.6)}
.tc-btn.on{background:rgba(25,130,100,.85);border-color:#9fffd8}
.tc-btn.gas{background:rgba(20,110,60,.55);border-color:rgba(170,255,200,.8)}
.tc-btn.gas.on{background:rgba(30,190,90,.9)}
.tc-btn.brk{background:rgba(130,25,25,.55);border-color:rgba(255,170,170,.8)}
.tc-btn.brk.on{background:rgba(220,40,40,.9)}
.tc-btn.tog.active{background:rgba(25,110,170,.8);border-color:#a8dcff}
.tc-zone{position:absolute;pointer-events:auto;touch-action:none}
.tc-stick-base{position:absolute;border-radius:50%;border:2px solid rgba(255,255,255,.45);background:rgba(8,18,25,.30);pointer-events:none;transition:opacity .15s}
.tc-stick-knob{position:absolute;border-radius:50%;background:rgba(255,255,255,.55);border:2px solid rgba(255,255,255,.9);pointer-events:none}
.tc-wheel{position:absolute;pointer-events:auto;touch-action:none;border-radius:50%;background:rgba(8,18,25,.32);border:2px solid rgba(255,255,255,.35)}
.tc-wheel svg{width:100%;height:100%;display:block;pointer-events:none}
.tc-top{position:absolute;pointer-events:none;display:flex;gap:8px}
.tc-top .tc-btn{position:static;width:max(40px,calc(var(--u)*10));height:max(40px,calc(var(--u)*10));border-radius:50%;font-size:calc(var(--u)*4.6)}
.tc-menu{position:fixed;inset:0;z-index:950;background:rgba(3,10,16,.72);display:none;align-items:center;justify-content:center;pointer-events:auto;touch-action:pan-y}
.tc-sheet{width:min(94vw,760px);max-height:92vh;overflow:auto;background:rgba(14,26,38,.96);border:1px solid rgba(255,255,255,.25);border-radius:18px;padding:12px 14px 14px;color:#fff;-webkit-overflow-scrolling:touch}
.tc-sheet h3{margin:0 0 8px;font:800 16px system-ui,'Noto Sans Bengali',sans-serif;display:flex;justify-content:space-between;align-items:center}
.tc-sheet h3 button{background:#2a3b4d;color:#fff;border:0;border-radius:10px;padding:6px 14px;font:700 14px system-ui,'Noto Sans Bengali',sans-serif}
.tc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px}
.tc-item{background:#1d3043;border:1px solid rgba(255,255,255,.2);border-radius:12px;color:#fff;padding:9px 6px;min-height:58px;font:700 13px/1.25 system-ui,'Noto Sans Bengali',sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;text-align:center}
.tc-item span{font-size:22px;line-height:1}
.tc-item:active{background:#27809a}
.tc-sec{margin:10px 0 6px;font:700 12px system-ui,'Noto Sans Bengali',sans-serif;opacity:.7;letter-spacing:.3px}
.tc-rotate{position:fixed;inset:0;z-index:1000;background:#0b1520;color:#fff;display:none;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:24px;pointer-events:auto;font-family:system-ui,'Noto Sans Bengali',sans-serif}
.tc-rotate .ico{font-size:64px;animation:tcrot 2.2s ease-in-out infinite}
@keyframes tcrot{0%,20%{transform:rotate(0)}60%,100%{transform:rotate(-90deg)}}
.tc-rotate button{background:#1fa37a;color:#fff;border:0;border-radius:14px;padding:14px 22px;font:800 17px system-ui,'Noto Sans Bengali',sans-serif}
`;

const WHEEL_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="rgba(255,255,255,.92)" stroke-linecap="round">
<circle cx="50" cy="50" r="44" stroke-width="9"/><circle cx="50" cy="50" r="10" stroke-width="5" fill="rgba(255,255,255,.18)"/>
<line x1="8" y1="50" x2="40" y2="50" stroke-width="7"/><line x1="60" y1="50" x2="92" y2="50" stroke-width="7"/><line x1="50" y1="60" x2="50" y2="92" stroke-width="7"/></g>
<rect x="45" y="3.5" width="10" height="11" rx="2" fill="#ff4d4d"/></svg>`;

const U = (n: number): string => `calc(var(--u) * ${n})`;

type Pos = Partial<Record<'left' | 'right' | 'top' | 'bottom' | 'width' | 'height', string>>;

interface BtnOpts {
  text: string;
  sub?: string;
  /** Held virtual key (down while the finger is on the button). */
  hold?: string;
  /** One press of a virtual key. */
  tap?: string;
  fn?: () => void;
  cls?: string;
  pos: Pos;
  size?: number; // square size in u (shortcut for width = height)
}

export class TouchControls {
  private root = document.createElement('div');
  private groups = new Map<TouchMode, HTMLElement>();
  private mode: TouchMode | null = null;
  private flags: TouchFlags = {};
  private menu = document.createElement('div');
  private rotate = document.createElement('div');
  private extrasAmph: HTMLElement[] = [];
  private extrasTank: HTMLElement[] = [];
  private cruiseBtn: HTMLButtonElement | null = null;
  private wheelSvg: SVGElement | null = null;
  private wheelRaf = 0;
  private autoFsTried = false;

  constructor(private input: InputManager, parent: HTMLElement) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.styleEl = st;

    this.root.className = 'tc-root';
    this.root.setAttribute('aria-label', 'মোবাইল গেম কন্ট্রোল');
    this.loadCruise();

    this.buildFoot();
    this.buildCar();
    this.buildAir();
    this.buildBoat();
    this.buildRide();
    this.buildFly();
    this.buildTop();
    this.buildMenu();
    this.buildRotate();

    parent.appendChild(this.root);
    document.body.appendChild(this.menu);
    document.body.appendChild(this.rotate);

    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    window.addEventListener('pointerdown', this.onFirstGesture, { once: true, capture: true });
    this.onResize();
    this.setMode('foot', {});
  }
  private styleEl: HTMLStyleElement;

  // ------------------------------------------------------------------ public

  /** Called every frame by the Engine (cheap: does nothing unless the mode changed). */
  setMode(mode: TouchMode, flags: TouchFlags = {}): void {
    const amph = !!flags.amphibious;
    const tank = !!flags.tank;
    if (mode === this.mode && amph === !!this.flags.amphibious && tank === !!this.flags.tank) return;
    if (mode !== this.mode) this.releaseAll();
    this.mode = mode;
    this.flags = { amphibious: amph, tank };
    for (const [m, g] of this.groups) g.style.display = m === mode ? 'block' : 'none';
    for (const e of this.extrasAmph) e.style.display = amph ? 'flex' : 'none';
    for (const e of this.extrasTank) e.style.display = tank ? 'flex' : 'none';
    this.input.touchDrive.active = mode === 'car';
    if (mode !== 'car') {
      this.input.touchDrive.gas = false;
      this.input.touchDrive.brake = false;
      this.input.touchDrive.steerAxis = 0;
    }
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    window.removeEventListener('pointerdown', this.onFirstGesture, { capture: true });
    cancelAnimationFrame(this.wheelRaf);
    this.releaseAll();
    this.root.remove();
    this.menu.remove();
    this.rotate.remove();
    this.styleEl.remove();
  }

  // ------------------------------------------------------------------ helpers

  private held = new Set<string>();

  private hold(code: string, on: boolean): void {
    if (on) this.held.add(code);
    else this.held.delete(code);
    // the two pedals are not keys: they only drive the live driving state (read by VehicleManager)
    if (code === 'TouchGas') this.input.touchDrive.gas = on;
    else if (code === 'TouchBrake') this.input.touchDrive.brake = on;
    else this.input.setVirtualKey(code, on);
  }

  private releaseAll(): void {
    for (const c of [...this.held]) this.hold(c, false);
    const d = this.input.touchDrive;
    d.gas = false;
    d.brake = false;
    d.steerAxis = 0;
    for (const b of this.root.querySelectorAll('.tc-btn.on')) b.classList.remove('on');
  }

  private group(mode: TouchMode): HTMLElement {
    const g = document.createElement('div');
    g.className = 'tc-grp';
    this.root.appendChild(g);
    this.groups.set(mode, g);
    return g;
  }

  private place(el: HTMLElement, pos: Pos): void {
    for (const k of Object.keys(pos) as (keyof Pos)[]) el.style[k] = pos[k] as string;
  }

  private btn(parent: HTMLElement, o: BtnOpts): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `tc-btn ${o.cls ?? 'round'}`;
    b.innerHTML = o.sub ? `${o.text}<small>${o.sub}</small>` : o.text;
    const pos = { ...o.pos };
    if (o.size !== undefined) {
      pos.width = U(o.size);
      pos.height = U(o.size);
    }
    this.place(b, pos);
    let pressed = false;
    const down = (e: PointerEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (pressed) return;
      pressed = true;
      try { b.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      b.classList.add('on');
      if (o.hold) this.hold(o.hold, true);
      if (o.tap) this.input.tapKey(o.tap);
      o.fn?.();
    };
    const up = (e: Event): void => {
      e.preventDefault();
      if (!pressed) return;
      pressed = false;
      b.classList.remove('on');
      if (o.hold) this.hold(o.hold, false);
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    parent.appendChild(b);
    return b;
  }

  /** Floating joystick. onMove gets x (right +) and y (down +) in -1..1. */
  private stick(parent: HTMLElement, zone: Pos, onMove: (x: number, y: number) => void, onEnd: () => void): void {
    const z = document.createElement('div');
    z.className = 'tc-zone';
    this.place(z, zone);
    const base = document.createElement('div');
    base.className = 'tc-stick-base';
    const knob = document.createElement('div');
    knob.className = 'tc-stick-knob';
    const sizePx = (): number => Math.max(96, Math.min(170, window.innerHeight * 0.34));
    const apply = (): void => {
      const s = sizePx();
      base.style.width = base.style.height = `${s}px`;
      knob.style.width = knob.style.height = `${s * 0.42}px`;
    };
    apply();
    window.addEventListener('resize', apply);
    z.append(base, knob);
    parent.appendChild(z);

    let id = -1;
    let cx = 0;
    let cy = 0;
    // resting place is pure CSS (percent of the zone), so it is right even while the layout group is hidden (display:none has no size)
    const restPos = (): void => {
      const s = sizePx();
      base.style.left = `calc(30% - ${s / 2}px)`;
      base.style.top = `calc(100% - ${s * 1.25}px)`;
      knob.style.left = `calc(30% - ${s * 0.21}px)`;
      knob.style.top = `calc(100% - ${s * 0.96}px)`;
      base.style.opacity = '0.55';
      knob.style.opacity = '0.5';
    };
    restPos();
    window.addEventListener('resize', restPos);
    const move = (e: PointerEvent): void => {
      const s = sizePx();
      const rad = s / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > rad) {
        dx = (dx / len) * rad;
        dy = (dy / len) * rad;
      }
      knob.style.left = `${cx - z.getBoundingClientRect().left + dx - s * 0.21}px`;
      knob.style.top = `${cy - z.getBoundingClientRect().top + dy - s * 0.21}px`;
      onMove(dx / rad, dy / rad);
    };
    z.addEventListener('pointerdown', (e) => {
      if (id !== -1) return;
      e.preventDefault();
      id = e.pointerId;
      try { z.setPointerCapture(id); } catch { /* ignore */ }
      const r = z.getBoundingClientRect();
      const s = sizePx();
      cx = Math.max(r.left + s / 2, Math.min(r.right - s / 2, e.clientX));
      cy = Math.max(r.top + s / 2, Math.min(r.bottom - s / 2, e.clientY));
      base.style.left = `${cx - r.left - s / 2}px`;
      base.style.top = `${cy - r.top - s / 2}px`;
      base.style.opacity = '1';
      knob.style.opacity = '1';
      move(e);
    });
    z.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) move(e);
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== id) return;
      id = -1;
      onEnd();
      restPos();
    };
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);
    z.addEventListener('lostpointercapture', end);
  }

  /** Joystick -> W A S D (+ Shift when pushed all the way when `sprint`). */
  private wasdStick(g: HTMLElement, zone: Pos, sprint: boolean): void {
    const state = { W: false, S: false, A: false, D: false, SH: false };
    const set = (k: 'W' | 'S' | 'A' | 'D' | 'SH', v: boolean, code: string): void => {
      if (state[k] !== v) {
        state[k] = v;
        this.hold(code, v);
      }
    };
    this.stick(
      g,
      zone,
      (x, y) => {
        const on = 0.32;
        const off = 0.2;
        set('W', y < (state.W ? -off : -on), 'KeyW');
        set('S', y > (state.S ? off : on), 'KeyS');
        set('A', x < (state.A ? -off : -on), 'KeyA');
        set('D', x > (state.D ? off : on), 'KeyD');
        if (sprint) set('SH', Math.hypot(x, y) > 0.93, 'ShiftLeft');
      },
      () => {
        set('W', false, 'KeyW');
        set('S', false, 'KeyS');
        set('A', false, 'KeyA');
        set('D', false, 'KeyD');
        set('SH', false, 'ShiftLeft');
      },
    );
  }

  // ------------------------------------------------------------------ layouts

  private buildFoot(): void {
    const g = this.group('foot');
    this.wasdStick(g, { left: '0', bottom: '0', width: '46%', height: '78%' }, true);
    this.btn(g, { text: '⤒', sub: 'লাফ', hold: 'Space', size: 17, pos: { right: U(3), bottom: U(4) } });
    this.btn(g, { text: 'F', sub: 'ওঠা/ধরা', tap: 'KeyF', size: 13, pos: { right: U(22), bottom: U(3) } });
    this.btn(g, { text: '🔫', sub: 'গুলি', hold: 'Mouse0', size: 13, pos: { right: U(3), bottom: U(23) } });
    this.btn(g, { text: '🎯', sub: 'নিশানা', hold: 'Mouse2', size: 11, pos: { right: U(18), bottom: U(23) } });
    this.btn(g, { text: '🧰', sub: 'অস্ত্র', tap: 'KeyB', size: 11, pos: { right: U(30), bottom: U(19) } });
    this.btn(g, { text: '↧', sub: 'বসা', hold: 'KeyC', size: 11, pos: { right: U(38), bottom: U(3) } });
    this.btn(g, { text: 'R', sub: 'রিলোড', tap: 'KeyR', size: 10, pos: { right: U(51), bottom: U(3) } });
  }

  private buildCar(): void {
    const g = this.group('car');

    // ---- steering wheel (analog)
    const wheel = document.createElement('div');
    wheel.className = 'tc-wheel';
    this.place(wheel, { left: U(5), bottom: U(4), width: U(44), height: U(44) });
    wheel.innerHTML = WHEEL_SVG;
    this.wheelSvg = wheel.querySelector('svg');
    g.appendChild(wheel);
    this.bindWheel(wheel);

    // ---- pedals (right)
    this.btn(g, { text: 'GAS', sub: 'গ্যাস', hold: 'TouchGas', cls: 'rect gas', pos: { right: U(3), bottom: U(3), width: U(23), height: U(32) } });
    this.btn(g, { text: 'BRAKE', sub: 'ব্রেক', hold: 'TouchBrake', cls: 'rect brk', pos: { right: U(28), bottom: U(3), width: U(23), height: U(27) } });

    // ---- easy mode / cruise speed
    this.cruiseBtn = this.btn(g, {
      text: '',
      cls: 'rect tog',
      pos: { right: U(28), bottom: U(33), width: U(23), height: U(11) },
      fn: () => this.cycleCruise(),
    });
    this.refreshCruiseLabel();

    // ---- small buttons above the wheel
    const row = 12;
    const bottom = U(51);
    this.btn(g, { text: 'F', sub: 'নামুন', tap: 'KeyF', size: row, pos: { left: U(5), bottom } });
    this.btn(g, { text: '📯', sub: 'হর্ন', hold: 'KeyH', size: row, pos: { left: U(19), bottom } });
    this.btn(g, { text: 'R', sub: 'সোজা', tap: 'KeyR', size: row, pos: { left: U(33), bottom } });
    this.btn(g, { text: '👁', sub: 'ভিউ', tap: 'KeyP', size: row, pos: { left: U(47), bottom } });

    // ---- Suprim extras
    this.extrasAmph.push(
      this.btn(g, { text: '⤒', sub: 'ওপরে', hold: 'Space', size: 12, pos: { right: U(54), bottom: U(3) } }),
      this.btn(g, { text: '⤓', sub: 'নিচে', hold: 'KeyX', size: 12, pos: { right: U(54), bottom: U(17) } }),
      this.btn(g, { text: '🚀', sub: 'বুস্ট', hold: 'ShiftLeft', size: 12, pos: { right: U(54), bottom: U(31) } }),
      this.btn(g, { text: '✈', sub: 'ফ্লাইট', tap: 'KeyN', size: 11, pos: { right: U(68), bottom: U(3) } }),
      this.btn(g, { text: '🌊', sub: 'ডুব', tap: 'KeyC', size: 11, pos: { right: U(68), bottom: U(16) } }),
      this.btn(g, { text: '🛟', sub: 'ভাসা', tap: 'KeyT', size: 11, pos: { right: U(68), bottom: U(29) } }),
    );
    // ---- tank cannon
    this.extrasTank.push(this.btn(g, { text: '💥', sub: 'গোলা', hold: 'Mouse0', size: 15, pos: { right: U(54), bottom: U(3) } }));
  }

  private buildAir(): void {
    const g = this.group('air');
    this.wasdStick(g, { left: '0', bottom: '0', width: '44%', height: '78%' }, false);
    this.btn(g, { text: '⤒', sub: 'ওপরে', hold: 'Space', size: 16, pos: { right: U(3), bottom: U(4) } });
    this.btn(g, { text: '⤓', sub: 'নিচে', hold: 'KeyX', size: 14, pos: { right: U(21), bottom: U(3) } });
    this.btn(g, { text: '🚀', sub: 'বুস্ট', hold: 'ShiftLeft', size: 12, pos: { right: U(37), bottom: U(3) } });
    this.btn(g, { text: '🔫', sub: 'গুলি', hold: 'Mouse0', size: 13, pos: { right: U(3), bottom: U(23) } });
    this.btn(g, { text: '💣', sub: 'বোমা', tap: 'KeyZ', size: 12, pos: { right: U(18), bottom: U(21) } });
    this.btn(g, { text: 'F', sub: 'নামুন', tap: 'KeyF', size: 11, pos: { right: U(32), bottom: U(19) } });
    this.btn(g, { text: '◀', sub: 'ঘোরা', hold: 'KeyQ', size: 11, pos: { left: U(52), bottom: U(3) } });
    this.btn(g, { text: '▶', sub: 'ঘোরা', hold: 'KeyE', size: 11, pos: { left: U(65), bottom: U(3) } });
    this.btn(g, { text: 'H', sub: 'ইঞ্জিন', tap: 'KeyH', size: 10, pos: { left: U(52), bottom: U(16) } });
    this.btn(g, { text: 'R', sub: 'সোজা', tap: 'KeyR', size: 10, pos: { left: U(65), bottom: U(16) } });
    this.btn(g, { text: '👁', sub: 'ভিউ', tap: 'KeyP', size: 10, pos: { left: U(78), bottom: U(3) } });
    this.btn(g, { text: 'G', sub: 'চাকা', tap: 'KeyG', size: 10, pos: { left: U(78), bottom: U(16) } });
  }

  private buildBoat(): void {
    const g = this.group('boat');
    this.wasdStick(g, { left: '0', bottom: '0', width: '46%', height: '78%' }, false);
    this.btn(g, { text: 'F', sub: 'নামুন', tap: 'KeyF', size: 14, pos: { right: U(3), bottom: U(3) } });
    this.btn(g, { text: '📯', sub: 'হর্ন', hold: 'KeyH', size: 12, pos: { right: U(20), bottom: U(3) } });
    this.btn(g, { text: 'R', sub: 'সোজা', tap: 'KeyR', size: 12, pos: { right: U(35), bottom: U(3) } });
    this.btn(g, { text: '👁', sub: 'ভিউ', tap: 'KeyP', size: 12, pos: { right: U(3), bottom: U(19) } });
  }

  private buildRide(): void {
    const g = this.group('ride');
    this.btn(g, { text: 'F', sub: 'নামুন', tap: 'KeyF', size: 15, pos: { right: U(3), bottom: U(3) } });
    this.btn(g, { text: '🎥', sub: 'ক্যামেরা', tap: 'KeyC', size: 13, pos: { right: U(21), bottom: U(3) } });
    this.btn(g, { text: 'G', sub: 'চাকা/ফ্ল্যাপ', tap: 'KeyG', size: 12, pos: { right: U(37), bottom: U(3) } });
    this.btn(g, { text: '🚀', sub: 'বুস্ট', hold: 'ShiftLeft', size: 12, pos: { right: U(51), bottom: U(3) } });
    this.wasdStick(g, { left: '0', bottom: '0', width: '44%', height: '78%' }, false);
  }

  private buildFly(): void {
    const g = this.group('fly');
    this.wasdStick(g, { left: '0', bottom: '0', width: '46%', height: '78%' }, false);
    this.btn(g, { text: '⤒', sub: 'ওপরে', hold: 'Space', size: 14, pos: { right: U(3), bottom: U(19) } });
    this.btn(g, { text: '⤓', sub: 'নিচে', hold: 'KeyC', size: 14, pos: { right: U(3), bottom: U(3) } });
    this.btn(g, { text: '🚀', sub: 'দ্রুত', hold: 'ShiftLeft', size: 12, pos: { right: U(19), bottom: U(3) } });
    this.btn(g, { text: 'T', sub: 'এখানে নামা', tap: 'KeyT', size: 12, pos: { right: U(33), bottom: U(3) } });
    this.btn(g, { text: 'V', sub: 'বন্ধ', tap: 'KeyV', size: 12, pos: { right: U(19), bottom: U(19) } });
  }

  // ------------------------------------------------------------------ steering wheel

  private bindWheel(wheel: HTMLElement): void {
    const d = this.input.touchDrive;
    let id = -1;
    let last = 0;
    let angle = 0; // degrees, + = clockwise = right
    const centre = (): { x: number; y: number } => {
      const r = wheel.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const pointerAngle = (e: PointerEvent): number => {
      const c = centre();
      return (Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180) / Math.PI;
    };
    const show = (): void => {
      if (this.wheelSvg) this.wheelSvg.style.transform = `rotate(${angle.toFixed(1)}deg)`;
      d.steerAxis = Math.max(-1, Math.min(1, angle / WHEEL_MAX_DEG));
    };
    const spring = (): void => {
      if (id !== -1) return;
      angle *= 0.72;
      if (Math.abs(angle) < 0.6) angle = 0;
      show();
      if (angle !== 0) this.wheelRaf = requestAnimationFrame(spring);
    };
    wheel.addEventListener('pointerdown', (e) => {
      if (id !== -1) return;
      e.preventDefault();
      e.stopPropagation();
      id = e.pointerId;
      cancelAnimationFrame(this.wheelRaf);
      try { wheel.setPointerCapture(id); } catch { /* ignore */ }
      last = pointerAngle(e);
    });
    wheel.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      e.preventDefault();
      const a = pointerAngle(e);
      let delta = a - last;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      last = a;
      angle = Math.max(-WHEEL_MAX_DEG * 1.15, Math.min(WHEEL_MAX_DEG * 1.15, angle + delta));
      show();
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== id) return;
      id = -1;
      this.wheelRaf = requestAnimationFrame(spring);
    };
    wheel.addEventListener('pointerup', end);
    wheel.addEventListener('pointercancel', end);
    wheel.addEventListener('lostpointercapture', end);
  }

  // ------------------------------------------------------------------ easy mode

  private loadCruise(): void {
    let idx = 2; // 50 km/h by default: easy mode is ON the first time
    try {
      const s = localStorage.getItem(LS_CRUISE);
      if (s !== null && CRUISE_STEPS_KMH.includes(Number(s))) idx = CRUISE_STEPS_KMH.indexOf(Number(s));
    } catch { /* storage blocked */ }
    this.applyCruise(CRUISE_STEPS_KMH[idx]);
  }

  private applyCruise(kmh: number): void {
    const d = this.input.touchDrive;
    d.easy = kmh > 0;
    d.cruiseMps = kmh / 3.6;
    try { localStorage.setItem(LS_CRUISE, String(kmh)); } catch { /* ignore */ }
  }

  private cycleCruise(): void {
    const cur = Math.round(this.input.touchDrive.cruiseMps * 3.6);
    const i = CRUISE_STEPS_KMH.findIndex((v) => Math.abs(v - cur) < 1);
    const next = CRUISE_STEPS_KMH[(i + 1) % CRUISE_STEPS_KMH.length];
    this.applyCruise(next);
    this.refreshCruiseLabel();
  }

  private refreshCruiseLabel(): void {
    const b = this.cruiseBtn;
    if (!b) return;
    const d = this.input.touchDrive;
    const kmh = Math.round(d.cruiseMps * 3.6);
    b.innerHTML = d.easy ? `🟢 AUTO ${kmh}<small>সহজ মোড · চাপলে বদলায়</small>` : `⚪ AUTO বন্ধ<small>গ্যাস নিজে চাপুন</small>`;
    b.classList.toggle('active', d.easy);
  }

  // ------------------------------------------------------------------ top buttons + menu

  private buildTop(): void {
    const top = document.createElement('div');
    top.className = 'tc-top';
    top.style.left = '14px';
    top.style.top = '66px';
    const mk = (label: string, fn: () => void): void => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tc-btn round';
      b.textContent = label;
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
      top.appendChild(b);
    };
    mk('☰', () => this.openMenu(true));
    mk('⛶', () => void this.toggleFullscreen());
    this.root.appendChild(top);
  }

  private buildMenu(): void {
    const m = this.menu;
    m.className = 'tc-menu';
    const sheet = document.createElement('div');
    sheet.className = 'tc-sheet';
    const h = document.createElement('h3');
    h.innerHTML = '<span>☰ সব ফিচার</span>';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕ বন্ধ';
    close.addEventListener('click', () => {
      if (performance.now() - this.menuOpenedAt >= 450) this.openMenu(false);
    });
    h.appendChild(close);
    sheet.appendChild(h);

    const section = (title: string, items: [string, string, string | (() => void), boolean?][]): void => {
      const t = document.createElement('div');
      t.className = 'tc-sec';
      t.textContent = title;
      const grid = document.createElement('div');
      grid.className = 'tc-grid';
      for (const [icon, label, action, keep] of items) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tc-item';
        b.innerHTML = `<span>${icon}</span>${label}`;
        b.addEventListener('click', () => {
          if (performance.now() - this.menuOpenedAt < 450) return; // the "ghost click" of the finger that opened the menu
          if (typeof action === 'string') this.input.tapKey(action);
          else action();
          if (!keep) this.openMenu(false);
        });
        grid.appendChild(b);
      }
      sheet.append(t, grid);
    };

    section('খেলা ও মেনু', [
      ['⚙', 'সেটিংস', 'Tab'],
      ['🚗', 'গাড়ি / হেলি ডাকুন', 'KeyN'],
      ['🗺', 'ম্যাপ জুম', 'KeyU'],
      ['🔊', 'সাউন্ড চালু/বন্ধ', 'KeyM'],
      ['🌗', 'দিন-রাত বদল', 'Backslash'],
      ['🖥', 'গ্রাফিক্স কোয়ালিটি', 'Backquote'],
      ['📍', 'রোড সেন্টার লাইন (3)', 'Digit3'],
      ['⛶', 'ফুল স্ক্রিন', () => void this.toggleFullscreen()],
    ]);
    section('ক্যামেরা ও যানবাহন', [
      ['👁', 'চোখের ভিউ (P)', 'KeyP'],
      ['🕊', 'ফ্রি ক্যামেরা (V)', 'KeyV'],
      ['⚙', 'গিয়ার অটো/ম্যানুয়াল', 'KeyG'],
      ['▲', 'গিয়ার বাড়ান', 'KeyE'],
      ['▼', 'গিয়ার কমান', 'KeyQ'],
      ['📈', 'ইঞ্জিন কার্ভ', 'KeyI'],
    ]);
    section('ঘোরাঘুরি (পায়ে হেঁটে)', [
      ['✈', 'বিমানবন্দর (J)', 'KeyJ'],
      ['🌾', 'এগ্রো ইনস্টিটিউট (K)', 'KeyK'],
      ['🦁', 'সাফারি পার্ক (L)', 'KeyL'],
      ['🎖', 'সেনা ক্যাম্প (;)', 'Semicolon'],
      ['🛫', 'সমুদ্র বিমানবন্দর (\')', 'Quote'],
    ]);
    section('ইঞ্জিনিয়ারিং, মিশন ও দোকান', [
      ['🏬', 'মল / খামার (O)', 'KeyO'],
      ['🏁', 'রেস শুরু (Enter)', 'Enter'],
      ['🎓', 'ইঞ্জিনিয়ারিং ট্যুর (Y)', 'KeyY'],
      ['◀', 'আগের ধাপ ( , )', 'Comma'],
      ['▶', 'পরের ধাপ ( . )', 'Period'],
      ['💣', 'বোমা (Z)', 'KeyZ'],
    ]);
    m.appendChild(sheet);
    m.addEventListener('pointerdown', (e) => {
      if (e.target === m) this.openMenu(false);
    });
  }

  private menuOpenedAt = 0;

  private openMenu(on: boolean): void {
    this.menu.style.display = on ? 'flex' : 'none';
    if (on) this.menuOpenedAt = performance.now();
    if (on) this.releaseAll();
  }

  // ------------------------------------------------------------------ landscape + fullscreen

  private buildRotate(): void {
    const r = this.rotate;
    r.className = 'tc-rotate';
    r.innerHTML = '<div class="ico">📱</div><div style="font:800 20px system-ui,\'Noto Sans Bengali\',sans-serif">ফোনটি আড়াআড়ি (Landscape) করে ধরুন</div><div style="opacity:.75;font:500 14px system-ui,\'Noto Sans Bengali\',sans-serif;max-width:340px">গেমটি আড়াআড়ি স্ক্রিনে খেলার জন্য বানানো। ফোন ঘোরালেই শুরু হবে।</div>';
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = '⛶ ফুল স্ক্রিন + আড়াআড়ি';
    b.addEventListener('click', () => void this.toggleFullscreen(true));
    r.appendChild(b);
  }

  private onResize = (): void => {
    const portrait = window.innerHeight > window.innerWidth * 1.05;
    this.rotate.style.display = portrait ? 'flex' : 'none';
  };

  private onFirstGesture = (): void => {
    if (this.autoFsTried) return;
    this.autoFsTried = true;
    // Android Chrome: the first touch may go full screen + landscape (silently ignored where it is not allowed)
    void this.toggleFullscreen(true, true);
  };

  private async toggleFullscreen(forceOn = false, quiet = false): Promise<void> {
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    const isFull = !!(document.fullscreenElement || doc.webkitFullscreenElement);
    try {
      if (isFull && !forceOn) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else doc.webkitExitFullscreen?.();
        return;
      }
      if (!isFull) {
        if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
        else await el.webkitRequestFullscreen?.();
      }
      const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await so.lock?.('landscape');
    } catch {
      // not allowed here (iPhone Safari, no user gesture ...): the "turn your phone" screen still works
      void quiet;
    }
  }
}
