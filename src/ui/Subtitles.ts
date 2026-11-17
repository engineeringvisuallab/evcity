import { UI_FONT } from './theme';

interface Chunk {
  text: string;
  /** index of its first character in the original text (the speech 'boundary' events report such indices) */
  start: number;
  /** characters, used to share the speaking time between the chunks */
  weight: number;
}

/**
 * Subtitles: ONE line at the very bottom of the screen. A long narration (the engineering tours) is cut into phrases that each fit on the line,
 * and the phrases run one after the other while the voice speaks. The voice itself is not touched.
 *
 * Sync: when the browser's speech engine reports word boundaries (seek()), the phrase follows the voice exactly;
 * otherwise (recorded file, or an engine without boundary events) the phrases advance by an estimate of the speaking speed.
 */
export class Subtitles {
  private el = document.createElement('div');
  private timer = 0;
  private chunkTimer = 0;
  private chunks: Chunk[] = [];
  private synced = false;
  private perChar = 0.07; // seconds per character
  private readonly ctx = document.createElement('canvas').getContext('2d');
  private readonly fontSize = 17;

  constructor(parent: HTMLElement) {
    Object.assign(this.el.style, {
      position: 'fixed',
      left: '50%',
      bottom: 'env(safe-area-inset-bottom, 0px)',
      transform: 'translateX(-50%)',
      // wide screens: leaves ~260 px free on both sides (the area label and the logo sit in the corners); narrow screens: almost full width
      width: 'min(860px, max(calc(100vw - 520px), 92vw))',
      boxSizing: 'border-box',
      padding: '5px 14px',
      background: 'rgba(0,0,0,0.74)',
      color: '#fff',
      font: `500 ${this.fontSize}px/1.5 ${UI_FONT}`,
      textAlign: 'center',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      borderRadius: '8px 8px 0 0',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '20',
    });
    parent.appendChild(this.el);
  }

  /** `seconds` = how long to keep it on screen (null = until hide() is called). */
  show(text: string, seconds: number | null): void {
    window.clearTimeout(this.timer);
    window.clearTimeout(this.chunkTimer);
    this.synced = false;
    this.el.style.display = 'block'; // visible first: the width below is measured
    this.chunks = this.split(text);
    const total = seconds ?? Math.max(2, text.length * (/[\u0980-\u09FF]/.test(text) ? 0.085 : 0.068));
    this.perChar = (total * 0.92) / Math.max(1, text.length);
    this.showChunk(0, true);
    if (seconds !== null) this.timer = window.setTimeout(() => this.hide(), seconds * 1000);
  }

  /** The voice reached character `charIndex` of the text: show the phrase that contains it (exact sync). */
  seek(charIndex: number): void {
    if (this.chunks.length === 0) return;
    this.synced = true;
    window.clearTimeout(this.chunkTimer);
    let i = 0;
    while (i + 1 < this.chunks.length && this.chunks[i + 1].start <= charIndex) i++;
    this.showChunk(i, false);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    window.clearTimeout(this.chunkTimer);
    this.chunks = [];
    this.el.style.display = 'none';
  }

  private showChunk(i: number, schedule: boolean): void {
    const c = this.chunks[i];
    this.el.textContent = c ? c.text : '';
    if (!c || !schedule || this.synced || i + 1 >= this.chunks.length) return;
    this.chunkTimer = window.setTimeout(() => {
      if (!this.synced) this.showChunk(i + 1, true);
    }, Math.max(900, c.weight * this.perChar * 1000));
  }

  /** Cuts the text into phrases that fit the line: breaks after a sentence end when the line is at least 40 % full, after a comma at 75 %. */
  private split(text: string): Chunk[] {
    const max = Math.max(120, this.el.clientWidth - 28);
    const ctx = this.ctx;
    if (ctx) ctx.font = `500 ${this.fontSize}px ${UI_FONT}`;
    const measure = (s: string): number => (ctx ? ctx.measureText(s).width : s.length * this.fontSize * 0.55);
    const out: Chunk[] = [];
    let line = '';
    let start = 0;
    const flush = (): void => {
      if (line) out.push({ text: line, start, weight: line.length + 1 });
      line = '';
    };
    for (const m of text.matchAll(/\S+/g)) {
      const w = m[0];
      if (line && measure(`${line} ${w}`) > max) flush();
      if (!line) start = m.index ?? 0;
      line = line ? `${line} ${w}` : w;
      const fill = measure(line) / max;
      if ((/[.!?।]["')\]]?$/.test(w) && fill > 0.4) || (/[,;:]$/.test(w) && fill > 0.75)) flush();
    }
    flush();
    return out;
  }
}
