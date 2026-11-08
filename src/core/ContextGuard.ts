import { UI_FONT } from '../ui/theme';

/**
 * WebGL context loss (iOS Safari does it under memory pressure, Chrome after a GPU reset or a sleeping laptop).
 * - lost: stop drawing, keep the page alive, show a message (preventDefault tells the browser we want the context back);
 * - restored: three.js re-creates its GPU objects by itself; we only hide the message and restart the loop;
 * - not restored within `reloadAfterMs`: offer a reload button (the save data lives in localStorage, a reload loses nothing).
 */
export class ContextGuard {
  private box = document.createElement('div');
  private text = document.createElement('div');
  private timer = 0;
  private lost = false;

  constructor(
    private canvas: HTMLCanvasElement,
    parent: HTMLElement,
    private onLost: () => void,
    private onRestored: () => void,
    private reloadAfterMs = 6000,
  ) {
    Object.assign(this.box.style, {
      position: 'fixed', inset: '0', display: 'none', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '14px',
      background: 'rgba(6,12,20,.86)', color: '#fff', zIndex: '60', textAlign: 'center', padding: '24px', font: `600 16px/1.5 ${UI_FONT}`,
    });
    this.box.appendChild(this.text);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '🔄 রিলোড';
    Object.assign(btn.style, { padding: '10px 22px', borderRadius: '10px', border: '1px solid rgba(255,255,255,.5)', background: '#1b6b54', color: '#fff', font: `700 15px ${UI_FONT}`, cursor: 'pointer', touchAction: 'manipulation' });
    btn.addEventListener('click', () => location.reload());
    this.box.appendChild(btn);
    parent.appendChild(this.box);
    canvas.addEventListener('webglcontextlost', this.lostHandler, false);
    canvas.addEventListener('webglcontextrestored', this.restoredHandler, false);
  }

  get isLost(): boolean {
    return this.lost;
  }

  private lostHandler = (e: Event): void => {
    e.preventDefault(); // "please give the context back"
    this.lost = true;
    this.onLost();
    this.text.textContent = '⚠️ গ্রাফিক্স সাময়িকভাবে বন্ধ হয়ে গেছে (মেমরি কম)। ফিরিয়ে আনার চেষ্টা চলছে…';
    this.box.style.display = 'flex';
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (this.lost) this.text.textContent = '⚠️ গ্রাফিক্স ফিরে আসেনি। রিলোড করুন — আপনার সেভ করা ডেটা হারাবে না।';
    }, this.reloadAfterMs);
  };

  private restoredHandler = (): void => {
    window.clearTimeout(this.timer);
    this.lost = false;
    this.box.style.display = 'none';
    this.onRestored();
  };

  dispose(): void {
    window.clearTimeout(this.timer);
    this.canvas.removeEventListener('webglcontextlost', this.lostHandler);
    this.canvas.removeEventListener('webglcontextrestored', this.restoredHandler);
    this.box.remove();
  }
}
