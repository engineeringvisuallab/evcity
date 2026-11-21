// FARM VOICE (English, from the browser: speechSynthesis). Every crop has its own short talk about why this crop and the farmer matter.
// The same words are shown as subtitles in the game (Subtitles: one line at the bottom, follows the voice).
// Step 2: ONE talk only (rice). Later crops just add their own lines to FARM_TALKS; nothing else changes.
import { Subtitles } from '../ui/Subtitles';

/** crop id (CropDefs) -> the sentences of the talk, in order. */
export const FARM_TALKS: Readonly<Record<string, readonly string[]>> = {
  dhan: [
    'Welcome to the rice field. Rice is the staple food of our country, and most families eat it every single day.',
    'A rice crop begins with ploughing and levelling the soil. Then the field is flooded with water, because paddy grows best standing in shallow water.',
    'Young seedlings are grown in a small seedbed first. After about three or four weeks, farmers plant them in the field, one small bunch at a time.',
    'While the plants grow, the farmer must keep the water level right, pull out the weeds, and protect the crop from insects and disease.',
    'After about four months the paddy turns golden. It is cut, threshed to separate the grain, and dried in the sun.',
    'From one crop we get much more than rice. The straw feeds cattle and thatches roofs, the husk is used as fuel, and the bran becomes animal feed and oil.',
    'Agriculture is a pillar of our country. Roughly one in nine taka of the national income comes from farming, and about four in ten working people depend on it for their living.',
    'Rice alone covers most of our farmland, and our farmers are among the largest rice producers in the world.',
    'When harvests are good, food stays affordable, villages earn money, and the whole country is safer from hunger.',
    'So every time you eat a plate of rice, remember the farmer who stood in this water, under the hot sun, to grow it for you.',
  ],
};

const REPEAT_AFTER_MS = 120000; // the same talk is not started again within 2 minutes

export class FarmVoice {
  private readonly subs: Subtitles;
  private token = 0;
  private voice: SpeechSynthesisVoice | null = null;
  private playing = false;
  private last = new Map<string, number>();
  private timer = 0;

  constructor(container: HTMLElement, private readonly isMuted: () => boolean = () => false) {
    this.subs = new Subtitles(container);
    if ('speechSynthesis' in window) {
      speechSynthesis.addEventListener('voiceschanged', () => { this.voice = null; });
    }
  }

  has(cropId: string): boolean {
    return cropId in FARM_TALKS;
  }

  get busy(): boolean {
    return this.playing;
  }

  private pickVoice(): SpeechSynthesisVoice | null {
    if (this.voice) return this.voice;
    const en = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
    this.voice = en.find((v) => /en-(us|gb|in)/i.test(v.lang) && /natural|google|samantha|daniel|aria/i.test(v.name)) ?? en[0] ?? null;
    return this.voice;
  }

  /** Start the talk of this crop. Returns false when there is none, one is already running, or the same talk played a moment ago. */
  play(cropId: string): boolean {
    const talk = FARM_TALKS[cropId];
    if (!talk || this.playing) return false;
    const now = performance.now();
    if (now - (this.last.get(cropId) ?? -1e9) < REPEAT_AFTER_MS) return false;
    this.last.set(cropId, now);
    this.playing = true;
    const my = ++this.token;
    this.next(talk, 0, my);
    return true;
  }

  stop(): void {
    this.token++;
    this.playing = false;
    window.clearTimeout(this.timer);
    this.subs.hide();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  private finish(my: number): void {
    if (my !== this.token) return;
    this.playing = false;
    this.subs.hide();
  }

  private next(talk: readonly string[], i: number, my: number): void {
    if (my !== this.token) return;
    if (i >= talk.length) { this.finish(my); return; }
    const text = talk[i];
    const go = (): void => this.next(talk, i + 1, my);
    this.subs.show(text, null);
    if (this.isMuted() || !('speechSynthesis' in window)) {
      // no sound: just let the sentence stay long enough to read
      this.timer = window.setTimeout(go, 1500 + text.length * 65);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.95;
    const v = this.pickVoice();
    if (v) u.voice = v;
    u.onboundary = (e) => { if (my === this.token) this.subs.seek(e.charIndex); };
    u.onend = go;
    u.onerror = go;
    speechSynthesis.speak(u);
  }

  dispose(): void {
    this.stop();
  }
}
