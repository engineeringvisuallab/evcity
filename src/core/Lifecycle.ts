/**
 * Tab hidden => pause everything that costs battery: the game loop (nothing is simulated or drawn), every Web Audio context and the speech voice.
 * Back => resume only what we paused. Safari / phones also fire this when the screen locks or the app is switched.
 */
const tracked = new Set<AudioContext>();
const pausedByUs = new Set<AudioContext>();
let installed = false;

/** Call once BEFORE any game code creates an AudioContext (main.ts): every created context is remembered so it can be suspended. */
export function trackAudioContexts(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const w = window as unknown as Record<string, unknown>;
  for (const name of ['AudioContext', 'webkitAudioContext']) {
    const Orig = w[name] as (new (...a: unknown[]) => AudioContext) | undefined;
    if (!Orig) continue;
    w[name] = class extends Orig {
      constructor(...a: unknown[]) {
        super(...a);
        tracked.add(this);
      }
    };
  }
}

export function bindVisibility(onHidden: () => void, onVisible: () => void): () => void {
  const handler = (): void => {
    if (document.hidden) {
      onHidden();
      for (const c of tracked) {
        if (c.state === 'running') {
          pausedByUs.add(c);
          void c.suspend().catch(() => undefined);
        }
      }
      try {
        if ('speechSynthesis' in window) speechSynthesis.pause();
      } catch {
        /* ignore */
      }
    } else {
      for (const c of pausedByUs) void c.resume().catch(() => undefined);
      pausedByUs.clear();
      try {
        if ('speechSynthesis' in window) speechSynthesis.resume();
      } catch {
        /* ignore */
      }
      onVisible();
    }
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
