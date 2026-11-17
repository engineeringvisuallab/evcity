/**
 * Auto-hide for the menus (PC and phone).
 *
 * - Tagged menus (`autoHide(el)`) are hidden when the game starts.
 * - Mouse move, any touch or a mouse press makes them fade in; after IDLE_MS without input they fade out again.
 * - They stay while the pointer is over one of them, or while a panel holds them open (`holdUi('mission', true)`).
 * - Hidden menus cannot be clicked or touched (visibility:hidden), so the first touch only wakes them up and never presses a button by accident.
 * - Game input is never touched: the listeners only watch (capture phase, passive), they never stop or change an event.
 *
 * Not tagged on purpose: minimap + X Y Z chip, vehicle controls (steering wheel, GAS / BRAKE, joystick), crosshair, speed gauge.
 */
const IDLE_MS = 3500;
const CLASS_TAG = 'evc-ah';
const CLASS_IDLE = 'evc-idle';

const CSS = `
.${CLASS_TAG}{transition:opacity .35s ease,visibility 0s linear 0s}
html.${CLASS_IDLE} .${CLASS_TAG}{opacity:0!important;visibility:hidden!important;pointer-events:none!important;transition:opacity .45s ease,visibility 0s linear .45s}
`;

let started = false;
let timer = 0;
let hovering = false;
const holds = new Set<string>();

function setIdle(idle: boolean): void {
  document.documentElement.classList.toggle(CLASS_IDLE, idle);
}

function schedule(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    if (hovering || holds.size > 0) {
      schedule(); // something keeps the menus open: look again later
      return;
    }
    setIdle(true);
  }, IDLE_MS);
}

/** Show the menus now and start the hide countdown. */
export function wakeUi(): void {
  setIdle(false);
  schedule();
}

function start(): void {
  if (started) return;
  started = true;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  setIdle(true); // hidden at the start

  const opts: AddEventListenerOptions = { capture: true, passive: true };
  window.addEventListener('pointermove', wakeUi, opts);
  window.addEventListener('pointerdown', wakeUi, opts);
  window.addEventListener('touchstart', wakeUi, opts);
  window.addEventListener('mousedown', wakeUi, opts);
  document.addEventListener('pointerlockchange', wakeUi); // Esc / click to play: show them for a moment

  // pointer over a visible menu keeps all menus open (so a button can be reached and pressed)
  document.addEventListener(
    'pointerover',
    (e) => {
      const t = e.target as Element | null;
      hovering = !!t?.closest?.(`.${CLASS_TAG}`) && !document.documentElement.classList.contains(CLASS_IDLE);
    },
    opts,
  );
  document.addEventListener('pointerleave', () => { hovering = false; }, opts);
}

/** Tag a menu element so it hides and shows with the others. Safe to call many times, with null, before or after it is in the page. */
export function autoHide(el: HTMLElement | null | undefined): void {
  if (!el) return;
  start();
  el.classList.add(CLASS_TAG);
}

/** A panel that is open keeps the menus visible (on = true) until it calls again with on = false. */
export function holdUi(key: string, on: boolean): void {
  start();
  if (on) {
    holds.add(key);
    setIdle(false);
  } else if (holds.delete(key)) {
    wakeUi();
  }
}
