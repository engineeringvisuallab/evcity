import type { Bus } from '../core/EventBus';
import { TouchControls, type TouchDrive, type TouchFlags, type TouchMode } from './TouchControls';

/** The arrow keys work like W A S D everywhere (walking, cars, boats, helicopters, free camera). */
const ARROW_ALIAS: Record<string, string> = { KeyW: 'ArrowUp', KeyS: 'ArrowDown', KeyA: 'ArrowLeft', KeyD: 'ArrowRight' };

const BLOCKED_WHEN_LOCKED = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F2', 'F3', 'Digit1', 'Digit2']);

/** Keyboard + mouse (pointer lock). Other modules poll it; nobody else touches DOM events. */
export class InputManager {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private wheelDelta = 0;
  private _locked = false;
  private virtualDown = new Set<string>();
  private virtualPressed = new Set<string>();
  readonly touchEnabled = (typeof window !== 'undefined') && (/[?&]touch=1\b/.test(location.search) || window.matchMedia?.('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && window.innerWidth < 1100));
  /** Live driving state of the touch controls (steering wheel, pedals, easy mode); read by VehicleManager. */
  readonly touchDrive: TouchDrive = { active: false, gas: false, brake: false, steerAxis: 0, easy: true, cruiseMps: 50 / 3.6 };
  private touchLookId: number | null = null;
  private touchLastX = 0;
  private touchLastY = 0;
  private touchControls: TouchControls | null = null;

  constructor(
    private target: HTMLElement,
    private bus: Bus,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    target.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onLockChange);
    target.addEventListener('click', this.onClick);
    target.addEventListener('wheel', this.onWheel, { passive: true });
    if (this.touchEnabled) {
      target.style.touchAction = 'none';
      target.addEventListener('pointerdown', this.onTouchLookStart);
      target.addEventListener('pointermove', this.onTouchLookMove);
      target.addEventListener('pointerup', this.onTouchLookEnd);
      target.addEventListener('pointercancel', this.onTouchLookEnd);
      this.touchControls = new TouchControls(this, this.target.parentElement ?? document.body);
    }
  }

  get locked(): boolean {
    return this._locked;
  }

  /** Desktop requires pointer lock; touch devices use visible on-screen controls instead. */
  get gameplayActive(): boolean { return this._locked || this.touchEnabled; }

  /** Virtual keys are used by mobile buttons and map to the exact same gameplay code as a keyboard. */
  setVirtualKey(code: string, active: boolean): void {
    if (active) {
      if (!this.virtualDown.has(code)) this.virtualPressed.add(code);
      this.virtualDown.add(code);
    } else this.virtualDown.delete(code);
  }

  /** One press of a virtual key (the key is 'down' for ~90 ms and `wasPressed` is true on the next frame). */
  tapKey(code: string): void {
    this.setVirtualKey(code, true);
    window.setTimeout(() => this.setVirtualKey(code, false), 90);
  }

  /** The Engine tells the touch layout what the player is doing now (on foot, in a car, in the air ...). Cheap: call every frame. */
  setTouchMode(mode: TouchMode, flags: TouchFlags = {}): void {
    this.touchControls?.setMode(mode, flags);
  }

  isDown(code: string): boolean {
    const alt = ARROW_ALIAS[code];
    return this.down.has(code) || this.virtualDown.has(code) || (alt !== undefined && this.down.has(alt));
  }

  /** Enter does the work of F (get in / out of vehicles and everything else on F) while the mouse is captured; the Engine turns it off where Enter has its own job (the race start prompt). */
  enterAsF = true;

  /** True only on the frame the key went down. */
  wasPressed(code: string): boolean {
    if (code === 'KeyF' && this.enterAsF && this.gameplayActive && (this.pressed.has('Enter') || this.pressed.has('NumpadEnter'))) return true;
    const alt = ARROW_ALIAS[code];
    return this.pressed.has(code) || this.virtualPressed.has(code) || (alt !== undefined && this.pressed.has(alt));
  }

  consumeMouseDelta(): { x: number; y: number } {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  consumeWheel(): number {
    const w = this.wheelDelta;
    this.wheelDelta = 0;
    return w;
  }

  /** Call once at the end of every frame. */
  endFrame(): void {
    this.pressed.clear();
    this.virtualPressed.clear();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    this.target.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    this.target.removeEventListener('click', this.onClick);
    this.target.removeEventListener('wheel', this.onWheel);
    this.target.removeEventListener('pointerdown', this.onTouchLookStart);
    this.target.removeEventListener('pointermove', this.onTouchLookMove);
    this.target.removeEventListener('pointerup', this.onTouchLookEnd);
    this.target.removeEventListener('pointercancel', this.onTouchLookEnd);
    this.touchControls?.dispose();
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!e.repeat) this.pressed.add(e.code);
    this.down.add(e.code);
    if (this._locked && BLOCKED_WHEN_LOCKED.has(e.code)) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };
  private onBlur = (): void => {
    this.down.clear();
    this.virtualDown.clear();
    this.virtualPressed.clear();
  };
  private onMouseMove = (e: MouseEvent): void => {
    if (!this._locked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };
  /** Mouse buttons are keys too: 'Mouse0' = left, 'Mouse2' = right (only counted while the mouse is captured). */
  private onMouseDown = (e: MouseEvent): void => {
    if (!this._locked) return;
    const c = `Mouse${e.button}`;
    this.pressed.add(c);
    this.down.add(c);
  };
  private onMouseUp = (e: MouseEvent): void => {
    this.down.delete(`Mouse${e.button}`);
  };
  private onContextMenu = (e: Event): void => {
    if (this._locked) e.preventDefault();
  };
  private onWheel = (e: WheelEvent): void => {
    if (this._locked) this.wheelDelta += e.deltaY;
  };
  private onClick = (): void => {
    if (!this._locked && !this.touchEnabled) this.target.requestPointerLock();
  };
  private onTouchLookStart = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch' || (e.target as HTMLElement)?.closest?.('button,.tc-zone,.tc-wheel')) return;
    this.touchLookId = e.pointerId;
    this.touchLastX = e.clientX;
    this.touchLastY = e.clientY;
  };

  private onTouchLookMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch' || this.touchLookId !== e.pointerId) return;
    this.mouseDX += (e.clientX - this.touchLastX) * 1.1;
    this.mouseDY += (e.clientY - this.touchLastY) * 1.1;
    this.touchLastX = e.clientX;
    this.touchLastY = e.clientY;
  };

  private onTouchLookEnd = (e: PointerEvent): void => {
    if (this.touchLookId === e.pointerId) this.touchLookId = null;
  };

  private onLockChange = (): void => {
    this._locked = document.pointerLockElement === this.target;
    if (!this._locked) this.down.clear();
    this.bus.emit('camera:locked', { locked: this._locked });
  };
}
