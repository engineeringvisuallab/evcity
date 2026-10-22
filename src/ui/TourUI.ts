import { UI_FONT } from './theme';
import { bn } from '../i18n';
import { getToolbar } from './Toolbar';

export interface TourDestinationChoice {
  id: string;
  label: string;
  detail: string;
}

/** Bangla Tour button, dispatch status and destination picker. */
export class TourUI {
  private button = document.createElement('button');
  private status = document.createElement('div');
  private overlay = document.createElement('div');
  private panel = document.createElement('div');
  private list = document.createElement('div');
  private title = document.createElement('div');
  private subtitle = document.createElement('div');
  private close = document.createElement('button');

  constructor(
    parent: HTMLElement,
    onRequest: () => void,
    onDestination: (id: string) => void,
  ) {
    this.onChoose = onDestination;
    const style = document.createElement('style');
    style.textContent = `
      .evc-tour-button:hover { filter:brightness(1.08); transform:translateY(-1px); }
      .evc-tour-choice:hover { background:rgba(255,210,31,.14)!important; border-color:#ffd21f!important; }
      .evc-tour-choice:focus-visible,.evc-tour-button:focus-visible { outline:3px solid #fff; outline-offset:3px; }
    `;
    document.head.appendChild(style);

    this.button.className = 'evc-tour-button';
    this.button.type = 'button';
    this.button.textContent = `🧭 ${bn.tour.button}`;
    Object.assign(this.button.style, {
      order: '0', height: '46px', border: '1px solid rgba(255,255,255,.48)',
      borderRadius: '12px', padding: '10px 16px', background: 'linear-gradient(135deg,#126b4b,#184735)', color: '#fff',
      font: `700 16px ${UI_FONT}`, boxShadow: '0 4px 16px rgba(0,0,0,.28)', cursor: 'pointer', pointerEvents: 'auto',
      transition: 'transform .15s ease,filter .15s ease',
    });
    this.button.addEventListener('click', onRequest);

    Object.assign(this.status.style, {
      position: 'fixed', left: '14px', top: '70px', zIndex: '44', display: 'none', maxWidth: 'min(420px,85vw)',
      padding: '8px 12px', borderRadius: '10px', background: 'rgba(9,22,25,.88)', border: '1px solid rgba(255,255,255,.22)',
      color: '#fff', font: `500 14px/1.55 ${UI_FONT}`, boxShadow: '0 4px 16px rgba(0,0,0,.24)', pointerEvents: 'none',
    });

    Object.assign(this.overlay.style, {
      position: 'fixed', inset: '0', zIndex: '80', display: 'none', alignItems: 'center', justifyContent: 'center',
      padding: '20px', background: 'rgba(3,10,14,.74)', backdropFilter: 'blur(6px)', pointerEvents: 'auto',
    });
    Object.assign(this.panel.style, {
      width: 'min(560px,96vw)', maxHeight: 'min(78vh,760px)', overflow: 'auto', borderRadius: '20px',
      border: '1px solid rgba(255,255,255,.2)', background: 'linear-gradient(155deg,#172b30,#0b171b)',
      color: '#fff', padding: '24px', boxShadow: '0 24px 70px rgba(0,0,0,.5)', fontFamily: UI_FONT,
    });
    Object.assign(this.title.style, { fontSize: '24px', fontWeight: '800', marginBottom: '6px' });
    Object.assign(this.subtitle.style, { fontSize: '14px', color: 'rgba(255,255,255,.7)', lineHeight: '1.65', marginBottom: '18px' });
    this.list.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;';
    this.close.type = 'button';
    this.close.textContent = bn.tour.close;
    Object.assign(this.close.style, {
      display: 'block', margin: '18px 0 0 auto', border: '1px solid rgba(255,255,255,.25)', borderRadius: '10px',
      padding: '9px 14px', background: 'rgba(255,255,255,.08)', color: '#fff', font: `500 14px ${UI_FONT}`, cursor: 'pointer',
    });
    this.close.addEventListener('click', () => this.hideDestinations());
    this.panel.append(this.title, this.subtitle, this.list, this.close);
    this.overlay.appendChild(this.panel);
    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) this.hideDestinations();
    });
    getToolbar(parent).appendChild(this.button); // top-left row, next to the settings button
    parent.append(this.status, this.overlay);
    this.showStatus(bn.tour.startHint);
  }

  showStatus(text: string, seconds = 6): void {
    this.status.textContent = text;
    this.status.style.display = 'block';
    window.clearTimeout(this.statusTimer);
    if (seconds > 0) this.statusTimer = window.setTimeout(() => { this.status.style.display = 'none'; }, seconds * 1000);
  }

  showDestinations(destinations: TourDestinationChoice[]): void {
    this.title.textContent = bn.tour.chooseDestination;
    this.subtitle.textContent = bn.tour.destinationHint;
    this.list.replaceChildren();
    for (const destination of destinations) {
      const choice = document.createElement('button');
      choice.className = 'evc-tour-choice';
      choice.type = 'button';
      choice.innerHTML = `<span style="display:block;font-size:16px;font-weight:800;margin-bottom:5px"></span><span style="display:block;font-size:12px;line-height:1.45;color:rgba(255,255,255,.67)"></span>`;
      const spans = choice.querySelectorAll('span');
      spans[0].textContent = destination.label;
      spans[1].textContent = destination.detail;
      Object.assign(choice.style, {
        textAlign: 'left', padding: '14px', minHeight: '82px', borderRadius: '12px', border: '1px solid rgba(255,255,255,.17)',
        background: 'rgba(255,255,255,.055)', color: '#fff', font: `500 14px ${UI_FONT}`, cursor: 'pointer',
      });
      choice.addEventListener('click', () => this.hideDestinations());
      choice.addEventListener('click', () => this.onChoose?.(destination.id));
      this.list.appendChild(choice);
    }
    this.overlay.style.display = 'flex';
  }

  private onChoose: ((id: string) => void) | null = null;
  private statusTimer = 0;

  /** Connect selection callback after construction; kept explicit so the UI does not own game logic. */
  setDestinationHandler(handler: (id: string) => void): void {
    this.onChoose = handler;
  }

  hideDestinations(): void {
    this.overlay.style.display = 'none';
  }

  get isDestinationOpen(): boolean {
    return this.overlay.style.display === 'flex';
  }

  setBusy(busy: boolean): void {
    this.button.disabled = busy;
    this.button.style.opacity = busy ? '0.62' : '1';
    this.button.style.cursor = busy ? 'default' : 'pointer';
  }

  dispose(): void {
    window.clearTimeout(this.statusTimer);
    this.button.remove();
    this.status.remove();
    this.overlay.remove();
  }
}
