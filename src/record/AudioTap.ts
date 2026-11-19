// Video recorder, SOUND side: lets the recorder hear what the game plays.
//
// Every game sound is made with Web Audio: each module creates its own AudioContext and connects to `ctx.destination`. installAudioTap() (main.ts, right after
// trackAudioContexts, BEFORE any game code) wraps the AudioContext constructor: a new context gets a small pass-through gain called `master` that is returned as
// `ctx.destination` and feeds the real speakers. While nobody records, that is the only change (one extra gain node, same sound).
// startTap(sink) (called when a recording starts): every context gets a MediaStreamAudioDestinationNode fed by `master`, and `sink` receives its MediaStream, so the
// recorder can mix it with the microphone and the music file. stop = disconnect again.
//
// Recorded voice lines are HTMLAudioElement (VoiceManager: new Audio(...).play()). HTMLMediaElement.prototype.play is wrapped: while a tap is running, every element that
// starts playing is captured with captureStream() and handed to the same sink.
// NOT capturable by any web page: speechSynthesis (the browser's own Bangla / English text-to-speech voice). Those lines are not in the video.
type CtxCtor = new (...a: unknown[]) => AudioContext;

export interface TapSink {
  /** Called once per sound stream; return a function that disconnects it again. */
  onStream(stream: MediaStream): () => void;
}

interface Entry {
  ctx: AudioContext;
  master: GainNode;
  tap: MediaStreamAudioDestinationNode | null;
  dispose: (() => void) | null;
}

const entries: Entry[] = [];
let installed = false;
let rawCtor: CtxCtor | null = null; // the AudioContext constructor as it was BEFORE this wrapper: the recorder's own context is made with it (never tapped)
let sink: TapSink | null = null;
let mediaDisposers: (() => void)[] = [];
let hooked = new WeakSet<HTMLMediaElement>();
const ignored = new WeakSet<HTMLMediaElement>();

/** The recorder's own music element must not be captured a second time. */
export function ignoreMediaElement(el: HTMLMediaElement): void {
  ignored.add(el);
}

/** Constructor for the recorder's private AudioContext (not tapped, not part of the game sound). */
export function getRecorderContextCtor(): CtxCtor | null {
  if (rawCtor) return rawCtor;
  const w = window as unknown as Record<string, unknown>;
  return ((w.AudioContext ?? w.webkitAudioContext) as CtxCtor | undefined) ?? null;
}

function attachEntry(e: Entry): void {
  if (!sink || e.dispose || e.ctx.state === 'closed') return;
  try {
    e.tap ??= e.ctx.createMediaStreamDestination();
    e.master.connect(e.tap);
    const off = sink.onStream(e.tap.stream);
    const tap = e.tap;
    e.dispose = () => {
      off();
      try { e.master.disconnect(tap); } catch { /* already gone */ }
    };
  } catch { /* this context cannot be tapped: its sound is simply not in the video */ }
}

function registerContext(ctx: AudioContext): void {
  try {
    for (let i = entries.length - 1; i >= 0; i--) if (entries[i].ctx.state === 'closed') entries.splice(i, 1);
    const real = ctx.destination;
    const master = ctx.createGain();
    master.channelCountMode = 'explicit'; // like the real destination: always 2 channels, a mono sound is not doubled in loudness
    master.channelCount = 2;
    master.connect(real);
    Object.defineProperty(ctx, 'destination', { configurable: true, get: () => master });
    const e: Entry = { ctx, master, tap: null, dispose: null };
    entries.push(e);
    if (sink) attachEntry(e); // a sound system that starts in the middle of a recording
  } catch { /* leave this context untouched */ }
}

function captureMedia(el: HTMLMediaElement): MediaStream | null {
  const any = el as unknown as { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
  try {
    return any.captureStream ? any.captureStream() : any.mozCaptureStream ? any.mozCaptureStream() : null;
  } catch {
    return null;
  }
}

function hookMedia(el: HTMLMediaElement): void {
  if (!sink || hooked.has(el) || ignored.has(el)) return;
  hooked.add(el);
  el.addEventListener('playing', () => {
    if (!sink) return;
    const s = captureMedia(el);
    if (!s || s.getAudioTracks().length === 0) return;
    try { mediaDisposers.push(sink.onStream(s)); } catch { /* ignore */ }
  }, { once: true });
}

/** Call once BEFORE any game code creates an AudioContext (main.ts). */
export function installAudioTap(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const w = window as unknown as Record<string, unknown>;
  for (const name of ['AudioContext', 'webkitAudioContext']) {
    const Orig = w[name] as CtxCtor | undefined;
    if (!Orig) continue;
    if (!rawCtor) rawCtor = Orig;
    w[name] = class extends Orig {
      constructor(...a: unknown[]) {
        super(...a);
        registerContext(this);
      }
    };
  }
  if (typeof HTMLMediaElement !== 'undefined') {
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement): Promise<void> {
      if (sink) hookMedia(this);
      return origPlay.call(this);
    };
  }
}

/** Start sending the game sound to `s`. Returns the stop function. Only one tap at a time. */
export function startTap(s: TapSink): () => void {
  stopTap();
  sink = s;
  hooked = new WeakSet();
  for (const e of entries) attachEntry(e);
  return stopTap;
}

export function stopTap(): void {
  sink = null;
  for (const e of entries) {
    e.dispose?.();
    e.dispose = null;
  }
  for (const d of mediaDisposers) { try { d(); } catch { /* ignore */ } }
  mediaDisposers = [];
}

/** How many game sound systems (AudioContexts) can be heard right now: shown in the panel / used by tests. */
export function tappedContextCount(): number {
  return entries.filter((e) => e.ctx.state !== 'closed').length;
}
