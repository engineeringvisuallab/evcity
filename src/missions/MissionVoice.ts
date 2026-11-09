// MISSIONS: browser voice. Questions are read with speechSynthesis (English); answers are heard with SpeechRecognition (en-US).
// Where the browser has no recognition (Firefox) the player types. Nothing here touches the game.

type Recog = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

const RecogCtor = (): (new () => Recog) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Recog; webkitSpeechRecognition?: new () => Recog };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export class MissionVoice {
  private rec: Recog | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  /** true = speak the questions aloud. */
  speakOn = true;

  get canSpeak(): boolean {
    return typeof speechSynthesis !== 'undefined';
  }
  get canListen(): boolean {
    return RecogCtor() !== null;
  }

  private pickVoice(): SpeechSynthesisVoice | null {
    if (this.voice) return this.voice;
    const list = speechSynthesis.getVoices();
    const en = list.filter((v) => v.lang.toLowerCase().startsWith('en'));
    this.voice = en.find((v) => /en-(us|gb|in)/i.test(v.lang) && /natural|google|samantha|daniel|aria/i.test(v.name)) ?? en[0] ?? null;
    return this.voice;
  }

  speak(text: string, onEnd?: () => void): void {
    if (!this.canSpeak || !this.speakOn) {
      onEnd?.();
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.95;
    const v = this.pickVoice();
    if (v) u.voice = v;
    if (onEnd) {
      u.onend = onEnd;
      u.onerror = onEnd;
    }
    speechSynthesis.speak(u);
  }

  stopSpeaking(): void {
    if (this.canSpeak) speechSynthesis.cancel();
  }

  /** One listening round. onText gets the words heard (interim = still talking). onEnd always fires once. */
  listen(onText: (text: string, final: boolean) => void, onEnd: (error?: string) => void): boolean {
    const C = RecogCtor();
    if (!C) return false;
    this.stopListening();
    this.stopSpeaking();
    const r = new C();
    r.lang = 'en-US';
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.continuous = false;
    let err: string | undefined;
    r.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      onText(last[0].transcript, last.isFinal);
    };
    r.onerror = (e) => {
      err = e.error;
    };
    r.onend = () => {
      if (this.rec === r) this.rec = null;
      onEnd(err);
    };
    this.rec = r;
    try {
      r.start();
    } catch {
      this.rec = null;
      return false;
    }
    return true;
  }

  stopListening(): void {
    try {
      this.rec?.abort();
    } catch {
      /* already stopped */
    }
    this.rec = null;
  }

  dispose(): void {
    this.stopListening();
    this.stopSpeaking();
  }
}

const ONES: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/**
 * "0.378", "sixty two point five", "two hundred sixty two", "1,250", "one point five metres per second" -> number.
 * The FIRST number in the sentence wins. Returns null when there is none.
 */
export function parseSpokenNumber(raw: string): number | null {
  const text = raw.toLowerCase().replace(/,(?=\d{3})/g, '').replace(/-/g, ' ');
  const digits = text.match(/-?\d+(?:\.\d+)?/);
  if (digits) {
    const n = Number(digits[0]);
    return Number.isFinite(n) ? (/\bminus\b|\bnegative\b/.test(text) && n > 0 ? -n : n) : null;
  }
  const words = text.split(/[^a-z]+/).filter(Boolean);
  let total = 0;
  let current = 0;
  let seen = false;
  let i = 0;
  for (; i < words.length; i++) {
    const w = words[i];
    if (w in ONES) {
      current += ONES[w];
      seen = true;
    } else if (w in TENS) {
      current += TENS[w];
      seen = true;
    } else if (w === 'hundred') {
      current = (current || 1) * 100;
      seen = true;
    } else if (w === 'thousand') {
      total += (current || 1) * 1000;
      current = 0;
      seen = true;
    } else if (w === 'and' && seen) {
      continue;
    } else if (w === 'point' && seen) {
      break;
    } else if (seen) {
      return total + current; // a unit word (metres, kilonewton ...) ends the number
    }
  }
  if (!seen) return null;
  let value = total + current;
  if (words[i] === 'point') {
    let frac = '';
    for (let j = i + 1; j < words.length; j++) {
      const d = ONES[words[j]];
      if (d === undefined || d > 9) break;
      frac += String(d);
    }
    if (frac) value += Number('0.' + frac);
  }
  return value;
}

/** Number answer: inside the range, or within the relative tolerance. */
export function checkNumber(value: number | null, q: { answer?: number; tol?: number; min?: number; max?: number }): boolean {
  if (value === null) return false;
  if (q.min !== undefined && q.max !== undefined) return value >= q.min && value <= q.max;
  if (q.answer === undefined) return false;
  const tol = q.tol ?? 0.05;
  return Math.abs(value - q.answer) <= Math.abs(q.answer) * tol + 1e-9;
}

/** Text answer: lower-case, punctuation off, then every group needs one of its phrases (`need` groups must hit). */
export function checkText(text: string, groups: string[][] | undefined, need?: number): boolean {
  if (!groups || !groups.length) return false;
  const t = ' ' + text.toLowerCase().replace(/[^a-z0-9. ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  let hit = 0;
  for (const g of groups) if (g.some((p) => t.includes(p.toLowerCase()))) hit++;
  return hit >= (need ?? groups.length);
}
