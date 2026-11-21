import { Config } from '../core/Config';

/**
 * WIND GUSTS. The wind does not blow all the time: there is calm air (no sway at all), and now and then a gust of wind comes, blows for about a minute,
 * and dies away again. On average about 1 minute of wind in every 10 (random gaps, random lengths, so it is never on a clock).
 * `value` = 0..1 wind amount, read by the tree shader (leaves flutter) and the grass shader. Shared by both, updated once per frame (WorldManager).
 */
export class WindGust {
  /** Wind amount 0 (calm) .. 1 (full gust). The tree / grass shaders read this object's `value` directly. */
  readonly uniform = { value: 0 };
  private started = false;
  private start = 0; // when the next / current gust begins (seconds)
  private end = -1; // when the current gust ends; -1 = waiting for the next one
  private peak = 1;

  private rand(a: number, b: number): number {
    return a + (b - a) * Math.random();
  }

  update(time: number): void {
    const G = Config.vegetation.gust;
    if (!this.started) {
      this.started = true;
      this.start = time + this.rand(G.firstMin, G.firstMax);
    }
    if (this.end < 0 && time >= this.start) {
      this.end = time + this.rand(G.lenMin, G.lenMax);
      this.peak = this.rand(0.7, 1);
    }
    let w = 0;
    if (this.end >= 0) {
      if (time >= this.end) {
        // the gust is over: calm until the next one
        this.end = -1;
        this.start = time + this.rand(G.calmMin, G.calmMax);
      } else {
        const up = Math.min(1, Math.max(0, (time - this.start) / G.rise));
        const down = Math.min(1, Math.max(0, (this.end - time) / G.fall));
        const e = Math.min(up, down);
        w = this.peak * e * e * (3 - 2 * e) * (0.82 + 0.18 * Math.sin(time * 0.7)); // smooth in and out, a little unsteady while it blows
      }
    }
    this.uniform.value = w;
  }
}

/** The one wind of the world. */
export const windGust = new WindGust();
